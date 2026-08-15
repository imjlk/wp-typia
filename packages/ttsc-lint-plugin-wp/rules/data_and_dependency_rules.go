// The two final WordPress rules ported from @wordpress/eslint-plugin 25.8.0:
// dependency-group (docblock grouping of imports, with fixes) and
// data-no-store-string-literals (store access through string literals).
// Neither belongs to an upstream preset.
package wordpress

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimscanner "github.com/microsoft/typescript-go/shim/scanner"
	"github.com/samchon/ttsc/packages/lint/rule"
)

// wpComment is one block or line comment span in the file text.
type wpComment struct {
	End  int
	Kind shimast.Kind
	Pos  int
}

// wpCommentValue returns the body of a block comment, tolerating the short
// spans an unterminated `/*` produces at end of file.
func wpCommentValue(text string, comment wpComment) (string, bool) {
	if comment.Kind != shimast.KindMultiLineCommentTrivia ||
		comment.End-comment.Pos < 4 ||
		text[comment.Pos:comment.Pos+2] != "/*" ||
		text[comment.End-2:comment.End] != "*/" {
		return "", false
	}
	return text[comment.Pos+2 : comment.End-2], true
}

// wpScanComments walks the file text with the scanner to collect real
// comment trivia in source order.
func wpScanComments(file *shimast.SourceFile) []wpComment {
	if file == nil {
		return nil
	}
	text := file.Text()
	scanner := shimscanner.NewScanner()
	scanner.SetText(text)
	scanner.SetSkipTrivia(false)
	comments := []wpComment{}
	for {
		kind := scanner.Scan()
		if kind == shimast.KindEndOfFile {
			break
		}
		if kind == shimast.KindSingleLineCommentTrivia ||
			kind == shimast.KindMultiLineCommentTrivia {
			comments = append(
				comments,
				wpComment{Kind: kind, Pos: scanner.TokenStart(), End: scanner.TokenEnd()},
			)
		}
	}
	sort.Slice(comments, func(left, right int) bool {
		return comments[left].Pos < comments[right].Pos
	})
	return comments
}

// ── wordpress/dependency-group ───────────────────────────────────────────

var wpDependencyBlockPattern = regexp.MustCompile(
	`^\*?\n \* (External|Node|WordPress|Internal) dependencies\n $`,
)

var wpLocalityBlockPatterns = map[string]*regexp.Regexp{
	"Internal": regexp.MustCompile(`(?i)^\*?\n \* Internal dependencies\.?\n $`),
	"WordPress": regexp.MustCompile(
		`(?i)^\*?\n \* WordPress dependencies\.?\n $`,
	),
	// "Node" is tolerated as an alias for External.
	"External": regexp.MustCompile(`(?i)^\*?\n \* (External|Node) dependencies\.?\n $`),
}

type dependencyGroup struct{}

func (dependencyGroup) Name() string { return "wordpress/dependency-group" }
func (dependencyGroup) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindSourceFile}
}
func (dependencyGroup) NeedsTypeChecker() bool       { return false }
func (dependencyGroup) VisitsDeclarationFiles() bool { return false }
func (dependencyGroup) AcceptsTtscLintOptions() bool { return true }

func (dependencyGroup) Check(ctx *rule.Context, node *shimast.Node) {
	if ctx == nil || ctx.File == nil {
		return
	}
	// Upstream accepts a bare 'always' | 'never' enum option.
	mode := "always"
	if ctx.Options != nil {
		var decoded string
		if err := ctx.DecodeOptions(&decoded); err != nil ||
			(decoded != "always" && decoded != "never") {
			ctx.Report(node, "Invalid wordpress/dependency-group options")
			return
		}
		mode = decoded
	}
	comments := wpScanComments(ctx.File)
	text := ctx.File.Text()
	if mode == "never" {
		for _, comment := range comments {
			value, ok := wpCommentValue(text, comment)
			if !ok {
				continue
			}
			if !wpDependencyBlockPattern.MatchString(value) {
				continue
			}
			// Mirror the upstream fixer exactly: consume preceding blank
			// lines and every trailing newline.
			start, end := comment.Pos, comment.End
			for start > 1 && text[start-1] == '\n' && text[start-2] == '\n' {
				start--
			}
			for end < len(text) && text[end] == '\n' {
				end++
			}
			ctx.ReportRangeFix(
				comment.Pos,
				comment.End,
				"Unexpected dependency group comment block",
				rule.TextEdit{Pos: start, End: end, Text: ""},
			)
		}
		return
	}

	verified := map[string]bool{}
	type candidate struct {
		locality  string
		statement *shimast.Node
	}
	candidates := []candidate{}
	for _, statement := range node.Statements() {
		switch statement.Kind {
		case shimast.KindImportDeclaration:
			declaration := statement.AsImportDeclaration()
			if declaration == nil || declaration.ModuleSpecifier == nil {
				continue
			}
			source, ok := stringLiteralText(declaration.ModuleSpecifier)
			if !ok {
				continue
			}
			candidates = append(
				candidates,
				candidate{
					locality:  wpPackageLocality(source),
					statement: statement,
				},
			)
		case shimast.KindVariableStatement:
			for _, declaration := range domGlobalsStatementDeclarations(statement) {
				initializer := declaration.Initializer
				if initializer == nil ||
					initializer.Kind != shimast.KindCallExpression {
					continue
				}
				call := initializer.AsCallExpression()
				if call == nil || call.Expression == nil ||
					call.Expression.Kind != shimast.KindIdentifier ||
					identifierText(call.Expression) != "require" ||
					len(call.Arguments.Nodes) != 1 {
					continue
				}
				source, ok := stringLiteralText(call.Arguments.Nodes[0])
				if !ok {
					continue
				}
				candidates = append(
					candidates,
					candidate{
						locality:  wpPackageLocality(source),
						statement: statement,
					},
				)
			}
		}
	}

	for _, entry := range candidates {
		if verified[entry.locality] {
			continue
		}
		verified[entry.locality] = true
		expectedValue := fmt.Sprintf(
			"*\n * %s dependencies\n ",
			entry.locality,
		)
		var correction *wpComment
		needsCorrection := true
		// ESLint node ranges start at the first token, so comments inside the
		// statement's leading trivia still count as preceding it.
		statementStart, _, _ := sourceNodeRange(ctx.File, entry.statement)
		for _, comment := range comments {
			if comment.Pos >= statementStart {
				break
			}
			if comment.Kind != shimast.KindMultiLineCommentTrivia {
				continue
			}
			value, ok := wpCommentValue(text, comment)
			if !ok ||
				!wpLocalityBlockPatterns[entry.locality].MatchString(value) {
				continue
			}
			if value == expectedValue {
				needsCorrection = false
			} else {
				correction = &comment
			}
			break
		}
		if !needsCorrection {
			continue
		}
		replacement := "/*" + expectedValue + "*/"
		message := fmt.Sprintf(
			"Expected preceding \"%s dependencies\" comment block",
			entry.locality,
		)
		if correction != nil {
			ctx.ReportFix(
				entry.statement,
				message,
				rule.TextEdit{
					Pos: correction.Pos, End: correction.End, Text: replacement,
				},
			)
			continue
		}
		start, _, _ := sourceNodeRange(ctx.File, entry.statement)
		ctx.ReportFix(
			entry.statement,
			message,
			rule.TextEdit{
				Pos: start, End: start, Text: replacement + "\n",
			},
		)
	}
}

func wpPackageLocality(source string) string {
	if strings.HasPrefix(source, ".") {
		return "Internal"
	}
	if strings.HasPrefix(source, "@wordpress/") {
		return "WordPress"
	}
	return "External"
}

// ── wordpress/data-no-store-string-literals ──────────────────────────────

var wpDataCallbackFunctionImports = map[string]bool{
	"createRegistrySelector": true,
	"useSelect":              true,
	"withSelect":             true,
	"withDispatch":           true,
}

var wpDataDirectFunctionImports = map[string]bool{
	"useDispatch":   true,
	"dispatch":      true,
	"useSelect":     true,
	"select":        true,
	"resolveSelect": true,
}

var wpDataControlsMethodNames = map[string]bool{
	"select":        true,
	"resolveSelect": true,
	"dispatch":      true,
}

type dataNoStoreStringLiterals struct{}

func (dataNoStoreStringLiterals) Name() string {
	return "wordpress/data-no-store-string-literals"
}
func (dataNoStoreStringLiterals) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindImportDeclaration}
}
func (dataNoStoreStringLiterals) NeedsTypeChecker() bool       { return false }
func (dataNoStoreStringLiterals) VisitsDeclarationFiles() bool { return false }
func (dataNoStoreStringLiterals) AcceptsTtscLintOptions() bool {
	return false
}

func (dataNoStoreStringLiterals) Check(ctx *rule.Context, node *shimast.Node) {
	if ctx == nil || ctx.File == nil {
		return
	}
	declaration := node.AsImportDeclaration()
	if declaration == nil || declaration.ModuleSpecifier == nil ||
		declaration.ImportClause == nil {
		return
	}
	source, ok := stringLiteralText(declaration.ModuleSpecifier)
	if !ok || source != "@wordpress/data" {
		return
	}
	// localName -> importedName, so aliased imports classify by the same
	// canonical names the upstream rule matches.
	importedNames := map[string]string{}
	clause := declaration.ImportClause.AsImportClause()
	if clause == nil || clause.NamedBindings == nil ||
		clause.NamedBindings.Kind != shimast.KindNamedImports {
		return
	}
	named := clause.NamedBindings.AsNamedImports()
	if named == nil || named.Elements == nil {
		return
	}
	for _, specifierNode := range named.Elements.Nodes {
		specifier := specifierNode.AsImportSpecifier()
		if specifier == nil {
			continue
		}
		localName := identifierText(specifier.Name())
		importedNames[localName] = localName
		if specifier.PropertyName != nil {
			importedNames[localName] = identifierText(specifier.PropertyName)
		}
	}

	// Reference parents, mirroring the three upstream collectors.
	possibleCalls := map[*shimast.Node]bool{}
	wpEachIdentifierReference(ctx.File, func(identifier *shimast.Node) {
		localName := identifierText(identifier)
		importedName, tracked := importedNames[localName]
		if !tracked || identifier.Parent == nil {
			return
		}
		// A nil nearest binder means the name resolves to the module scope,
		// which is this import's specifier.
		if wpNearestBinding(identifier) != nil {
			return
		}
		name := importedName
		parent := identifier.Parent
		if wpDataCallbackFunctionImports[name] {
			call := wpAsCallExpression(parent)
			if call != nil && call.Arguments != nil &&
				len(call.Arguments.Nodes) > 0 {
				argument := call.Arguments.Nodes[0]
				if functionNode := wpAsFunctionLike(argument); functionNode != nil {
					for _, parameter := range functionNode.Parameters() {
						wpEachParameterReference(
							ctx.File,
							parameter,
							func(parameterReference *shimast.Node) {
								if parameterReference.Parent != nil {
									possibleCalls[parameterReference.Parent] = true
								}
							},
						)
					}
				}
			}
		}
		if wpDataDirectFunctionImports[name] {
			possibleCalls[parent] = true
		}
		if name == "controls" && parent.Kind == shimast.KindPropertyAccessExpression {
			access := parent.AsPropertyAccessExpression()
			if access != nil && wpDataControlsMethodNames[identifierText(access.Name())] &&
				parent.Parent != nil {
				possibleCalls[parent.Parent] = true
			}
		}
	})

	calls := make([]*shimast.Node, 0, len(possibleCalls))
	for call := range possibleCalls {
		calls = append(calls, call)
	}
	sort.Slice(calls, func(left, right int) bool {
		return calls[left].Pos() < calls[right].Pos()
	})
	for _, call := range calls {
		callExpression := wpAsCallExpression(call)
		if callExpression == nil || callExpression.Arguments == nil ||
			len(callExpression.Arguments.Nodes) == 0 {
			continue
		}
		argument := callExpression.Arguments.Nodes[0]
		value, ok := stringLiteralText(argument)
		if !ok {
			continue
		}
		// Upstream reports on the call's parent node.
		reportNode := call
		if call.Parent != nil {
			reportNode = call.Parent
		}
		ctx.Report(
			reportNode,
			fmt.Sprintf(
				"Do not use string literals ( '%s' ) for accessing @wordpress/data stores. Pass the store definition instead",
				value,
			),
		)
	}
}

func wpAsCallExpression(node *shimast.Node) *shimast.CallExpression {
	if node == nil || node.Kind != shimast.KindCallExpression {
		return nil
	}
	return node.AsCallExpression()
}

func wpAsFunctionLike(node *shimast.Node) *shimast.Node {
	if node != nil && isWordPressFunctionLike(node.Kind) {
		return node
	}
	return nil
}

// wpEachIdentifierReference visits every value-reference identifier in the
// file. A reference resolves to the file's imports unless shadowed.
func wpEachIdentifierReference(
	file *shimast.SourceFile,
	visit func(identifier *shimast.Node),
) {
	if file == nil {
		return
	}
	for _, statement := range file.Statements.Nodes {
		walkAllNodes(statement, func(node *shimast.Node) {
			if node.Kind != shimast.KindIdentifier || !isDomGlobalsReference(node) {
				return
			}
			visit(node)
		})
	}
}

// wpEachParameterReference visits the references of one callback parameter
// binding: identifiers with the binding name whose nearest enclosing binder
// is that parameter.
func wpEachParameterReference(
	file *shimast.SourceFile,
	parameter *shimast.Node,
	visit func(identifier *shimast.Node),
) {
	if file == nil || parameter == nil {
		return
	}
	parameterName := identifierText(parameter.Name())
	if parameterName == "" {
		return
	}
	wpEachIdentifierReference(file, func(identifier *shimast.Node) {
		if identifierText(identifier) != parameterName {
			return
		}
		if wpNearestBinding(identifier) == parameter {
			visit(identifier)
		}
	})
}

// wpNearestBinding returns the innermost enclosing declaration node that
// binds the identifier: a parameter, variable declaration, catch binding, or
// a function or class name. A nil result means the identifier resolves to the
// module scope.
func wpNearestBinding(identifier *shimast.Node) *shimast.Node {
	name := identifierText(identifier)
	if name == "" {
		return nil
	}
	for current := identifier.Parent; current != nil; current = current.Parent {
		// Parameters and the function's own name bind through the function,
		// not through the ancestor chain of the reference.
		if isWordPressFunctionLike(current.Kind) {
			for _, parameter := range current.Parameters() {
				if domGlobalsBindingDeclares(parameter.Name(), name) {
					return parameter
				}
			}
			if current.Kind == shimast.KindFunctionDeclaration ||
				current.Kind == shimast.KindFunctionExpression {
				if identifierText(current.Name()) == name {
					return current
				}
			}
			continue
		}
		switch current.Kind {
		case shimast.KindClassDeclaration,
			shimast.KindClassExpression,
			shimast.KindEnumDeclaration:
			if identifierText(current.Name()) == name {
				return current
			}
		}
		switch current.Kind {
		case shimast.KindVariableDeclaration:
			declaration := current.AsVariableDeclaration()
			if declaration != nil &&
				domGlobalsBindingDeclares(declaration.Name(), name) {
				return current
			}
		case shimast.KindCatchClause:
			clause := current.AsCatchClause()
			if clause != nil && clause.VariableDeclaration != nil {
				binding := clause.VariableDeclaration.AsVariableDeclaration()
				if binding != nil &&
					domGlobalsBindingDeclares(binding.Name(), name) {
					return current
				}
			}
		case shimast.KindBlock:
			if binder := wpBlockBinder(current, name); binder != nil {
				return binder
			}
		case shimast.KindForStatement,
			shimast.KindForOfStatement,
			shimast.KindForInStatement:
			if domGlobalsLoopDeclares(current, name) {
				return current
			}
		}
	}
	return nil
}

// wpBlockBinder returns the sibling declaration inside a block that binds the
// name, so sibling shadowing is not invisible to the reference walk.
func wpBlockBinder(block *shimast.Node, name string) *shimast.Node {
	for _, statement := range block.Statements() {
		if statement == nil {
			continue
		}
		switch statement.Kind {
		case shimast.KindVariableStatement:
			for _, declaration := range domGlobalsStatementDeclarations(statement) {
				if domGlobalsBindingDeclares(declaration.Name(), name) {
					return statement
				}
			}
		case shimast.KindFunctionDeclaration,
			shimast.KindClassDeclaration,
			shimast.KindEnumDeclaration:
			if identifierText(statement.Name()) == name {
				return statement
			}
		}
	}
	return nil
}

func init() {
	rule.Register(dependencyGroup{})
	rule.Register(dataNoStoreStringLiterals{})
}
