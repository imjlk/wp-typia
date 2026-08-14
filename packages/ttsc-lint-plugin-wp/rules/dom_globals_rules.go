// The four no-dom-globals rules are ported from the shared upstream
// createDOMGlobalRule factory in @wordpress/eslint-plugin 25.8.0. Each rule
// reports unresolved references to browser-only DOM globals (browser `globals`
// keys that the node environment lacks) whose immediately enclosing
// eslint-scope matches a predicate. Bare blocks, catch clauses, loops, switch
// statements, and class scopes terminate the scope walk even when a matching
// scope exists further out, because upstream predicates receive the innermost
// scope that contains the reference.
package wordpress

import (
	"fmt"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

type domGlobalScopeKind int

const (
	domGlobalScopeOther domGlobalScopeKind = iota
	domGlobalScopeModule
	domGlobalScopeConstructor
	domGlobalScopeFunction
)

type noDomGlobalsInModuleScope struct{}

func (noDomGlobalsInModuleScope) Name() string {
	return "wordpress/no-dom-globals-in-module-scope"
}
func (noDomGlobalsInModuleScope) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindIdentifier}
}
func (noDomGlobalsInModuleScope) NeedsTypeChecker() bool       { return false }
func (noDomGlobalsInModuleScope) VisitsDeclarationFiles() bool { return false }
func (noDomGlobalsInModuleScope) AcceptsTtscLintOptions() bool {
	return false
}
func (noDomGlobalsInModuleScope) Check(ctx *rule.Context, node *shimast.Node) {
	checkDomGlobalsReference(
		ctx,
		node,
		func(_ *shimast.Node, kind domGlobalScopeKind) bool {
			return kind == domGlobalScopeModule
		},
		func(name string) string {
			return fmt.Sprintf(
				"Use of DOM global '%s' is forbidden in module scope",
				name,
			)
		},
	)
}

type noDomGlobalsInConstructor struct{}

func (noDomGlobalsInConstructor) Name() string {
	return "wordpress/no-dom-globals-in-constructor"
}
func (noDomGlobalsInConstructor) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindIdentifier}
}
func (noDomGlobalsInConstructor) NeedsTypeChecker() bool       { return false }
func (noDomGlobalsInConstructor) VisitsDeclarationFiles() bool { return false }
func (noDomGlobalsInConstructor) AcceptsTtscLintOptions() bool {
	return false
}
func (noDomGlobalsInConstructor) Check(ctx *rule.Context, node *shimast.Node) {
	checkDomGlobalsReference(
		ctx,
		node,
		func(_ *shimast.Node, kind domGlobalScopeKind) bool {
			return kind == domGlobalScopeConstructor
		},
		func(name string) string {
			return fmt.Sprintf(
				"Use of DOM global '%s' is forbidden in class constructors, "+
					"consider moving this to componentDidMount() or equivalent "+
					"for non React components",
				name,
			)
		},
	)
}

type noDomGlobalsInReactCcRender struct{}

func (noDomGlobalsInReactCcRender) Name() string {
	return "wordpress/no-dom-globals-in-react-cc-render"
}
func (noDomGlobalsInReactCcRender) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindIdentifier}
}
func (noDomGlobalsInReactCcRender) NeedsTypeChecker() bool { return false }
func (noDomGlobalsInReactCcRender) VisitsDeclarationFiles() bool {
	return false
}
func (noDomGlobalsInReactCcRender) AcceptsTtscLintOptions() bool {
	return false
}
func (noDomGlobalsInReactCcRender) Check(ctx *rule.Context, node *shimast.Node) {
	checkDomGlobalsReference(
		ctx,
		node,
		func(scope *shimast.Node, kind domGlobalScopeKind) bool {
			return kind == domGlobalScopeFunction &&
				scope != nil &&
				scope.Kind == shimast.KindMethodDeclaration &&
				domGlobalsIsClassMember(scope) &&
				domGlobalsMethodIsRender(scope) &&
				domGlobalsReturnsJsx(scope)
		},
		func(name string) string {
			return fmt.Sprintf(
				"Use of DOM global '%s' is forbidden in render(), "+
					"consider moving this to componentDidMount()",
				name,
			)
		},
	)
}

type noDomGlobalsInReactFc struct{}

func (noDomGlobalsInReactFc) Name() string {
	return "wordpress/no-dom-globals-in-react-fc"
}
func (noDomGlobalsInReactFc) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindIdentifier}
}
func (noDomGlobalsInReactFc) NeedsTypeChecker() bool       { return false }
func (noDomGlobalsInReactFc) VisitsDeclarationFiles() bool { return false }
func (noDomGlobalsInReactFc) AcceptsTtscLintOptions() bool { return false }
func (noDomGlobalsInReactFc) Check(ctx *rule.Context, node *shimast.Node) {
	checkDomGlobalsReference(
		ctx,
		node,
		func(scope *shimast.Node, kind domGlobalScopeKind) bool {
			return kind == domGlobalScopeFunction && domGlobalsReturnsJsx(scope)
		},
		func(name string) string {
			return fmt.Sprintf(
				"Use of DOM global '%s' is forbidden in the render-cycle of a "+
					"React FC, consider moving this inside useEffect()",
				name,
			)
		},
	)
}

func checkDomGlobalsReference(
	ctx *rule.Context,
	node *shimast.Node,
	matches func(scope *shimast.Node, kind domGlobalScopeKind) bool,
	message func(name string) string,
) {
	if ctx == nil || node == nil {
		return
	}
	name := identifierText(node)
	if name == "" || !domGlobalNames[name] {
		return
	}
	if !isDomGlobalsReference(node) || domGlobalsNameIsDeclared(node, name) {
		return
	}
	scopeNode, scopeKind := domGlobalsImmediateScope(node)
	if matches(scopeNode, scopeKind) {
		ctx.Report(node, message(name))
	}
}

// domGlobalsImmediateScope classifies the innermost scope-defining ancestor
// of a reference. A block that is the direct body of a function belongs to
// that function's scope; every other block terminates the walk.
func domGlobalsImmediateScope(
	node *shimast.Node,
) (*shimast.Node, domGlobalScopeKind) {
	for current := node.Parent; current != nil; current = current.Parent {
		switch current.Kind {
		case shimast.KindSourceFile:
			return current, domGlobalScopeModule
		case shimast.KindBlock:
			parent := current.Parent
			if parent == nil || parent.Body() != current {
				return current, domGlobalScopeOther
			}
		case shimast.KindFunctionDeclaration,
			shimast.KindFunctionExpression,
			shimast.KindArrowFunction,
			shimast.KindMethodDeclaration,
			shimast.KindGetAccessor,
			shimast.KindSetAccessor:
			return current, domGlobalScopeFunction
		case shimast.KindConstructor:
			return current, domGlobalScopeConstructor
		case shimast.KindCatchClause,
			shimast.KindForStatement,
			shimast.KindForOfStatement,
			shimast.KindForInStatement,
			shimast.KindSwitchStatement,
			shimast.KindClassDeclaration,
			shimast.KindClassExpression,
			shimast.KindModuleDeclaration:
			return current, domGlobalScopeOther
		}
	}
	return nil, domGlobalScopeOther
}

// domGlobalsMethodIsRender reports whether the method is declared with the
// identifier name `render`. Upstream compares the estree MethodDefinition
// key's `name`, so string-literal and computed keys never match.
func domGlobalsMethodIsRender(method *shimast.Node) bool {
	name := method.Name()
	return name != nil && name.Kind == shimast.KindIdentifier &&
		identifierText(name) == "render"
}

// domGlobalsIsClassMember reports whether a MethodDeclaration belongs to a
// class body. Object-literal methods share the AST kind, but the upstream
// predicate requires an estree MethodDefinition, which only classes produce.
func domGlobalsIsClassMember(method *shimast.Node) bool {
	return method.Parent != nil &&
		(method.Parent.Kind == shimast.KindClassDeclaration ||
			method.Parent.Kind == shimast.KindClassExpression)
}

// domGlobalsReturnsJsx ports the upstream isReturnValueJSX heuristic: a
// concise arrow whose body is JSX, or a function whose body block contains a
// top-level return of JSX. ESLint drops parenthesized expressions, so the
// TypeScript-Go walk unwraps them.
func domGlobalsReturnsJsx(functionNode *shimast.Node) bool {
	if functionNode == nil {
		return false
	}
	body := functionNode.Body()
	if body == nil {
		return false
	}
	if domGlobalsIsJsxValue(body) {
		return true
	}
	if body.Kind != shimast.KindBlock {
		return false
	}
	for _, statement := range body.Statements() {
		if statement == nil || statement.Kind != shimast.KindReturnStatement {
			continue
		}
		if domGlobalsIsJsxValue(statement.Expression()) {
			return true
		}
	}
	return false
}

func domGlobalsIsJsxValue(node *shimast.Node) bool {
	for node != nil {
		switch node.Kind {
		case shimast.KindJsxElement,
			shimast.KindJsxSelfClosingElement,
			shimast.KindJsxFragment:
			return true
		case shimast.KindParenthesizedExpression:
			node = node.Expression()
		default:
			return false
		}
	}
	return false
}

// isDomGlobalsReference reports whether the identifier is a value reference.
// Declaration names, property keys, JSX tag and attribute names, typeof
// operands, and type positions are not references, mirroring the upstream
// shouldSkipReference helper plus eslint-scope's reference extraction.
func isDomGlobalsReference(node *shimast.Node) bool {
	if node.Parent == nil {
		return false
	}
	// Object-literal shorthand keeps its identifier in declaration-name
	// position, but eslint-scope still counts it as a reference.
	if node.Parent.Kind == shimast.KindShorthandPropertyAssignment {
		return true
	}
	if shimast.IsDeclarationNameOrImportPropertyName(node) {
		return false
	}
	parent := node.Parent
	switch parent.Kind {
	case shimast.KindPropertyAccessExpression:
		access := parent.AsPropertyAccessExpression()
		if access == nil || access.Name() == node {
			return false
		}
		// `<Foo.Bar />` member tags are JSXIdentifiers upstream, so the
		// object side of a tag-name member access is not a reference either.
		return !domGlobalsIsJsxTagName(parent)
	case shimast.KindTypeReference,
		shimast.KindTypeQuery,
		shimast.KindTypeOfExpression,
		shimast.KindQualifiedName:
		return false
	case shimast.KindParenthesizedExpression:
		// Espree drops parentheses, so a parenthesized typeof operand is
		// still a skipped reference upstream.
		return !domGlobalsIsTypeofOperand(node)
	case shimast.KindExpressionWithTypeArguments:
		heritage := parent.AsExpressionWithTypeArguments()
		return heritage == nil || heritage.Expression != node
	case shimast.KindPrefixUnaryExpression:
		unary := parent.AsPrefixUnaryExpression()
		return unary == nil || unary.Operator != shimast.KindTypeOfKeyword
	case shimast.KindJsxAttribute:
		return parent.Name() != node
	case shimast.KindPropertyAssignment:
		return parent.Name() != node
	case shimast.KindLabeledStatement,
		shimast.KindBreakStatement,
		shimast.KindContinueStatement:
		return parent.Label() != node
	}
	return !domGlobalsIsJsxTagName(node)
}

// domGlobalsIsTypeofOperand reports whether the identifier is the operand of
// a typeof expression, unwrapping parenthesized operands the way espree's
// parenthesis-free AST would present them to the upstream rule.
func domGlobalsIsTypeofOperand(node *shimast.Node) bool {
	current := node
	for current.Parent != nil &&
		current.Parent.Kind == shimast.KindParenthesizedExpression {
		current = current.Parent
	}
	parent := current.Parent
	switch parent.Kind {
	case shimast.KindTypeOfExpression:
		typeOf := parent.AsTypeOfExpression()
		return typeOf == nil || typeOf.Expression == current
	case shimast.KindPrefixUnaryExpression:
		unary := parent.AsPrefixUnaryExpression()
		return unary != nil && unary.Operator == shimast.KindTypeOfKeyword &&
			unary.Operand == current
	}
	return false
}

// domGlobalsIsJsxTagName reports whether node is the tag name of a JSX
// element, mirroring the internal ast.IsJsxTagName helper.
func domGlobalsIsJsxTagName(node *shimast.Node) bool {
	parent := node.Parent
	switch parent.Kind {
	case shimast.KindJsxOpeningElement,
		shimast.KindJsxClosingElement,
		shimast.KindJsxSelfClosingElement:
		return parent.TagName() == node
	}
	return false
}

// domGlobalsNameIsDeclared reports whether any declaration in the reference's
// scope chain binds the name, mirroring eslint-scope's variable resolution:
// only references that resolve to no local declaration are reported.
func domGlobalsNameIsDeclared(node *shimast.Node, name string) bool {
	for current := node; current != nil; current = current.Parent {
		switch current.Kind {
		case shimast.KindVariableDeclaration:
			declaration := current.AsVariableDeclaration()
			if declaration != nil &&
				domGlobalsBindingDeclares(declaration.Name(), name) {
				return true
			}
		case shimast.KindParameter:
			if domGlobalsBindingDeclares(current.Name(), name) {
				return true
			}
		case shimast.KindCatchClause:
			clause := current.AsCatchClause()
			if clause != nil && clause.VariableDeclaration != nil {
				binding := clause.VariableDeclaration.AsVariableDeclaration()
				if binding != nil &&
					domGlobalsBindingDeclares(binding.Name(), name) {
					return true
				}
			}
		case shimast.KindFunctionDeclaration,
			shimast.KindFunctionExpression,
			shimast.KindArrowFunction,
			shimast.KindMethodDeclaration,
			shimast.KindConstructor,
			shimast.KindGetAccessor,
			shimast.KindSetAccessor:
			if domGlobalsFunctionDeclares(current, name, node) {
				return true
			}
		case shimast.KindBlock:
			if domGlobalsBlockDeclares(current, name) {
				return true
			}
		case shimast.KindSwitchStatement:
			if domGlobalsSwitchDeclares(current, name) {
				return true
			}
		case shimast.KindForStatement,
			shimast.KindForOfStatement,
			shimast.KindForInStatement:
			if domGlobalsLoopDeclares(current, name) {
				return true
			}
		case shimast.KindClassDeclaration,
			shimast.KindClassExpression,
			shimast.KindEnumDeclaration,
			shimast.KindModuleDeclaration:
			if identifierText(current.Name()) == name {
				return true
			}
		case shimast.KindSourceFile:
			return domGlobalsModuleDeclares(current, name)
		}
	}
	return false
}

func domGlobalsBindingDeclares(nameNode *shimast.Node, name string) bool {
	if nameNode == nil {
		return false
	}
	switch nameNode.Kind {
	case shimast.KindIdentifier:
		return identifierText(nameNode) == name
	case shimast.KindObjectBindingPattern,
		shimast.KindArrayBindingPattern:
		for _, element := range nameNode.Elements() {
			if element == nil || element.Kind != shimast.KindBindingElement {
				continue
			}
			binding := element.AsBindingElement()
			if binding == nil {
				continue
			}
			// The PropertyName side of `{ document: doc }` renames the
			// binding; only the target side declares a local name.
			if domGlobalsBindingDeclares(binding.Name(), name) {
				return true
			}
		}
	}
	return false
}

// domGlobalsFunctionDeclares collects the bindings a function-like node
// introduces: its parameters, its own name, `var` declarations hoisted from
// anywhere inside it (excluding nested functions), and lexical declarations
// that sit directly in its body block.
func domGlobalsFunctionDeclares(
	functionNode *shimast.Node,
	name string,
	reference *shimast.Node,
) bool {
	// Function declarations and named function expressions make their own
	// name visible inside the function body.
	if (functionNode.Kind == shimast.KindFunctionDeclaration ||
		functionNode.Kind == shimast.KindFunctionExpression) &&
		identifierText(functionNode.Name()) == name {
		return true
	}
	for _, parameter := range functionNode.Parameters() {
		if domGlobalsBindingDeclares(parameter.Name(), name) {
			return true
		}
	}
	// A reference inside a parameter initializer resolves against the outer
	// scope plus the sibling parameters only; body declarations are invisible
	// there in eslint-scope.
	if domGlobalsReferenceWithinParameters(reference, functionNode) {
		return false
	}
	body := functionNode.Body()
	declared := false
	walkDomGlobalsVarScope(functionNode, func(node *shimast.Node) {
		if declared {
			return
		}
		switch node.Kind {
		case shimast.KindVariableDeclaration:
			declaration := node.AsVariableDeclaration()
			list := domGlobalsDeclarationList(node)
			isVar := list != nil &&
				list.Flags&(shimast.NodeFlagsLet|shimast.NodeFlagsConst) == 0
			inFunctionBody := body != nil && list != nil &&
				list.Parent != nil &&
				list.Parent.Kind == shimast.KindVariableStatement &&
				list.Parent.Parent == body
			if (isVar || inFunctionBody) &&
				declaration != nil &&
				domGlobalsBindingDeclares(declaration.Name(), name) {
				declared = true
			}
		case shimast.KindFunctionDeclaration:
			if body != nil && node.Parent == body &&
				identifierText(node.Name()) == name {
				declared = true
			}
		}
	})
	return declared
}

// domGlobalsBlockDeclares collects the lexical bindings a block introduces:
// let/const/class declarations and function declarations among its direct
// statements.
func domGlobalsBlockDeclares(block *shimast.Node, name string) bool {
	for _, statement := range block.Statements() {
		if statement == nil {
			continue
		}
		switch statement.Kind {
		case shimast.KindVariableStatement:
			for _, declaration := range domGlobalsStatementDeclarations(
				statement,
			) {
				if domGlobalsBindingDeclares(declaration.Name(), name) {
					return true
				}
			}
		case shimast.KindFunctionDeclaration,
			shimast.KindClassDeclaration,
			shimast.KindEnumDeclaration:
			if identifierText(statement.Name()) == name {
				return true
			}
		}
	}
	return false
}

func domGlobalsLoopDeclares(loop *shimast.Node, name string) bool {
	var initializer *shimast.Node
	switch loop.Kind {
	case shimast.KindForStatement:
		if forStatement := loop.AsForStatement(); forStatement != nil {
			initializer = forStatement.Initializer
		}
	case shimast.KindForOfStatement, shimast.KindForInStatement:
		if forInOf := loop.AsForInOrOfStatement(); forInOf != nil {
			initializer = forInOf.Initializer
		}
	}
	if initializer == nil ||
		initializer.Kind != shimast.KindVariableDeclarationList {
		return false
	}
	list := initializer.AsVariableDeclarationList()
	if list == nil || list.Declarations == nil {
		return false
	}
	for _, declaration := range list.Declarations.Nodes {
		if declaration == nil ||
			declaration.Kind != shimast.KindVariableDeclaration {
			continue
		}
		if domGlobalsBindingDeclares(declaration.Name(), name) {
			return true
		}
	}
	return false
}

// domGlobalsModuleDeclares collects the bindings a module introduces: its
// top-level declarations and imports, plus `var` declarations hoisted from
// anywhere in the file outside nested functions.
func domGlobalsModuleDeclares(file *shimast.Node, name string) bool {
	for _, statement := range file.Statements() {
		if statement == nil {
			continue
		}
		switch statement.Kind {
		case shimast.KindVariableStatement:
			for _, declaration := range domGlobalsStatementDeclarations(
				statement,
			) {
				if domGlobalsBindingDeclares(declaration.Name(), name) {
					return true
				}
			}
		case shimast.KindFunctionDeclaration,
			shimast.KindClassDeclaration,
			shimast.KindEnumDeclaration,
			shimast.KindModuleDeclaration,
			shimast.KindImportEqualsDeclaration:
			if identifierText(statement.Name()) == name {
				return true
			}
		case shimast.KindImportDeclaration:
			if domGlobalsImportDeclares(statement, name) {
				return true
			}
		}
	}
	declared := false
	walkDomGlobalsVarScope(file, func(node *shimast.Node) {
		if declared || node.Kind != shimast.KindVariableDeclaration {
			return
		}
		declaration := node.AsVariableDeclaration()
		list := domGlobalsDeclarationList(node)
		isVar := list != nil &&
			list.Flags&(shimast.NodeFlagsLet|shimast.NodeFlagsConst) == 0
		if isVar && declaration != nil &&
			domGlobalsBindingDeclares(declaration.Name(), name) {
			declared = true
		}
	})
	return declared
}

// domGlobalsReferenceWithinParameters reports whether the reference sits
// inside one of the function's parameter subtrees, where body declarations
// are not yet visible.
func domGlobalsReferenceWithinParameters(
	reference *shimast.Node,
	functionNode *shimast.Node,
) bool {
	for current := reference.Parent; current != nil && current != functionNode; current = current.Parent {
		if current.Kind == shimast.KindParameter {
			return true
		}
	}
	return false
}

// walkDomGlobalsVarScope walks the var-hoisting unit of a function-like node
// or a module: nested function-likes and class static blocks own their own
// scopes, so their declarations never hoist outward.
func walkDomGlobalsVarScope(
	root *shimast.Node,
	visit func(*shimast.Node),
) {
	if root == nil {
		return
	}
	visit(root)
	root.ForEachChild(func(child *shimast.Node) bool {
		if isWordPressFunctionLike(child.Kind) ||
			child.Kind == shimast.KindClassStaticBlockDeclaration {
			return false
		}
		walkDomGlobalsVarScope(child, visit)
		return false
	})
}

// domGlobalsSwitchDeclares collects the lexical bindings a switch statement
// introduces across its case clauses.
func domGlobalsSwitchDeclares(switchNode *shimast.Node, name string) bool {
	statement := switchNode.AsSwitchStatement()
	if statement == nil || statement.CaseBlock == nil {
		return false
	}
	caseBlock := statement.CaseBlock.AsCaseBlock()
	if caseBlock == nil || caseBlock.Clauses == nil {
		return false
	}
	for _, clause := range caseBlock.Clauses.Nodes {
		for _, clauseStatement := range clause.Statements() {
			if clauseStatement == nil {
				continue
			}
			switch clauseStatement.Kind {
			case shimast.KindVariableStatement:
				for _, declaration := range domGlobalsStatementDeclarations(
					clauseStatement,
				) {
					if domGlobalsBindingDeclares(declaration.Name(), name) {
						return true
					}
				}
			case shimast.KindFunctionDeclaration,
				shimast.KindClassDeclaration,
				shimast.KindEnumDeclaration:
				if identifierText(clauseStatement.Name()) == name {
					return true
				}
			}
		}
	}
	return false
}

// domGlobalsImportDeclares collects the local names an import declaration
// binds: the default import, a namespace import, and the target name of each
// named specifier (`import { document as doc }` binds `doc` only).
func domGlobalsImportDeclares(importNode *shimast.Node, name string) bool {
	declaration := importNode.AsImportDeclaration()
	if declaration == nil || declaration.ImportClause == nil {
		return false
	}
	clause := declaration.ImportClause.AsImportClause()
	if clause == nil {
		return false
	}
	if clause.Name() != nil && identifierText(clause.Name()) == name {
		return true
	}
	namedBindings := clause.NamedBindings
	if namedBindings == nil {
		return false
	}
	switch namedBindings.Kind {
	case shimast.KindNamespaceImport:
		return identifierText(namedBindings.Name()) == name
	case shimast.KindNamedImports:
		for _, element := range namedBindings.Elements() {
			if element == nil ||
				element.Kind != shimast.KindImportSpecifier {
				continue
			}
			if identifierText(element.Name()) == name {
				return true
			}
		}
	}
	return false
}

func domGlobalsStatementDeclarations(
	statement *shimast.Node,
) []*shimast.VariableDeclaration {
	if statement == nil {
		return nil
	}
	variableStatement := statement.AsVariableStatement()
	if variableStatement == nil || variableStatement.DeclarationList == nil {
		return nil
	}
	list := variableStatement.DeclarationList.AsVariableDeclarationList()
	if list == nil || list.Declarations == nil {
		return nil
	}
	declarations := []*shimast.VariableDeclaration{}
	for _, declaration := range list.Declarations.Nodes {
		if declaration != nil &&
			declaration.Kind == shimast.KindVariableDeclaration {
			declarations = append(
				declarations,
				declaration.AsVariableDeclaration(),
			)
		}
	}
	return declarations
}

func domGlobalsDeclarationList(node *shimast.Node) *shimast.VariableDeclarationList {
	if node == nil || node.Parent == nil ||
		node.Parent.Kind != shimast.KindVariableDeclarationList {
		return nil
	}
	return node.Parent.AsVariableDeclarationList()
}

func init() {
	rule.Register(noDomGlobalsInModuleScope{})
	rule.Register(noDomGlobalsInConstructor{})
	rule.Register(noDomGlobalsInReactCcRender{})
	rule.Register(noDomGlobalsInReactFc{})
}
