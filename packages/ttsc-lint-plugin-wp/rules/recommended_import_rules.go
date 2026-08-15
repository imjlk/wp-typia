// Two import-policy rules ported from @wordpress/eslint-plugin 25.8.0:
// use-recommended-components and use-import-as. Both share the upstream
// private-apis helpers that track `unlock( privateApis )` destructuring, and
// neither belongs to an upstream preset.
package wordpress

import (
	"fmt"
	"regexp"
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

// wpPrivateApisSources maps the local name of an imported `privateApis`
// binding to its package source, mirroring the upstream state helper.
func wpPrivateApisSources(
	file *shimast.SourceFile,
	trackSource func(source string) bool,
) map[string]string {
	sources := map[string]string{}
	if file == nil || file.Statements == nil {
		return sources
	}
	for _, statement := range file.Statements.Nodes {
		if statement == nil || statement.Kind != shimast.KindImportDeclaration {
			continue
		}
		declaration := statement.AsImportDeclaration()
		if declaration == nil || declaration.ModuleSpecifier == nil ||
			declaration.ImportClause == nil {
			continue
		}
		source, ok := stringLiteralText(declaration.ModuleSpecifier)
		if !ok || !trackSource(source) {
			continue
		}
		clause := declaration.ImportClause.AsImportClause()
		if clause == nil || clause.NamedBindings == nil ||
			clause.NamedBindings.Kind != shimast.KindNamedImports {
			continue
		}
		named := clause.NamedBindings.AsNamedImports()
		if named == nil || named.Elements == nil {
			continue
		}
		for _, specifierNode := range named.Elements.Nodes {
			specifier := specifierNode.AsImportSpecifier()
			if specifier == nil {
				continue
			}
			importedName := identifierText(specifier.Name())
			if specifier.PropertyName != nil {
				importedName = identifierText(specifier.PropertyName)
			}
			if importedName == "privateApis" {
				sources[identifierText(specifier.Name())] = source
			}
		}
	}
	return sources
}

// wpIsImportBound reports whether the file imports the identifier, mirroring
// the upstream ImportBinding definition check for `unlock`.
func wpIsImportBound(file *shimast.SourceFile, name string) bool {
	if file == nil || file.Statements == nil || name == "" {
		return false
	}
	for _, statement := range file.Statements.Nodes {
		if statement == nil || statement.Kind != shimast.KindImportDeclaration {
			continue
		}
		declaration := statement.AsImportDeclaration()
		if declaration == nil || declaration.ImportClause == nil {
			continue
		}
		clause := declaration.ImportClause.AsImportClause()
		if clause == nil {
			continue
		}
		if clause.Name() != nil && identifierText(clause.Name()) == name {
			return true
		}
		if clause.NamedBindings == nil {
			continue
		}
		switch clause.NamedBindings.Kind {
		case shimast.KindNamespaceImport:
			if identifierText(clause.NamedBindings.Name()) == name {
				return true
			}
		case shimast.KindNamedImports:
			named := clause.NamedBindings.AsNamedImports()
			if named == nil || named.Elements == nil {
				continue
			}
			for _, specifierNode := range named.Elements.Nodes {
				specifier := specifierNode.AsImportSpecifier()
				if specifier != nil &&
					identifierText(specifier.Name()) == name {
					return true
				}
			}
		}
	}
	return false
}

// wpUnlockBinding is one static property of an unlock destructuring.
type wpUnlockBinding struct {
	KeyNode *shimast.Node
	Name    string
	Value   *shimast.Node
}

// wpUnlockDestructuring parses `const { ... } = unlock( privateApis )` and
// returns the tracked source with the static destructuring properties.
func wpUnlockDestructuring(
	node *shimast.Node,
	file *shimast.SourceFile,
	privateApis map[string]string,
) (string, []wpUnlockBinding, bool) {
	declaration := node.AsVariableDeclaration()
	if declaration == nil || declaration.Initializer == nil ||
		declaration.Name() == nil ||
		declaration.Name().Kind != shimast.KindObjectBindingPattern {
		return "", nil, false
	}
	if declaration.Initializer.Kind != shimast.KindCallExpression {
		return "", nil, false
	}
	call := declaration.Initializer.AsCallExpression()
	if call == nil || call.Expression == nil ||
		call.Expression.Kind != shimast.KindIdentifier ||
		identifierText(call.Expression) != "unlock" ||
		call.Arguments == nil || len(call.Arguments.Nodes) != 1 {
		return "", nil, false
	}
	// Upstream requires the callee to resolve to an import binding; a
	// shadowing local binder (for example a parameter named unlock) wins.
	if wpNearestBinding(call.Expression) != nil ||
		!wpIsImportBound(file, "unlock") {
		return "", nil, false
	}
	argument := call.Arguments.Nodes[0]
	if argument == nil || argument.Kind != shimast.KindIdentifier {
		return "", nil, false
	}
	source, tracked := privateApis[identifierText(argument)]
	if !tracked {
		return "", nil, false
	}
	bindings := []wpUnlockBinding{}
	for _, element := range declaration.Name().Elements() {
		if element == nil || element.Kind != shimast.KindBindingElement {
			continue
		}
		binding := element.AsBindingElement()
		if binding == nil || binding.DotDotDotToken != nil {
			continue
		}
		var keyNode *shimast.Node
		var name string
		if binding.PropertyName != nil {
			keyNode = binding.PropertyName
		} else {
			keyNode = binding.Name()
		}
		if keyNode == nil {
			continue
		}
		switch keyNode.Kind {
		case shimast.KindIdentifier:
			name = identifierText(keyNode)
		case shimast.KindStringLiteral:
			if literal := keyNode.AsStringLiteral(); literal != nil {
				name = literal.Text
			}
		default:
			// Computed keys are skipped upstream.
			continue
		}
		bindings = append(
			bindings,
			wpUnlockBinding{KeyNode: keyNode, Name: name, Value: binding.Name()},
		)
	}
	return source, bindings, true
}

// wpLooksLikeUnlockDestructuring is the cheap structural pre-check for
// `const { ... } = unlock( x )` so ordinary variable declarations never pay
// for the full-file privateApis import scan.
func wpLooksLikeUnlockDestructuring(node *shimast.Node) bool {
	declaration := node.AsVariableDeclaration()
	if declaration == nil || declaration.Initializer == nil ||
		declaration.Initializer.Kind != shimast.KindCallExpression ||
		declaration.Name() == nil ||
		declaration.Name().Kind != shimast.KindObjectBindingPattern {
		return false
	}
	call := declaration.Initializer.AsCallExpression()
	return call != nil && call.Expression != nil &&
		call.Expression.Kind == shimast.KindIdentifier &&
		identifierText(call.Expression) == "unlock" &&
		len(call.Arguments.Nodes) == 1
}

var wpMessagePlaceholderPattern = regexp.MustCompile(`\{\{\s*(name|source)\s*\}\}`)

// wpResolveMessage ports the upstream `{{ name }}` / `{{ source }}`
// placeholder substitution with its default fallback.
func wpResolveMessage(template string, name string, source string) string {
	if template == "" {
		return fmt.Sprintf("`%s` from `%s` is not recommended.", name, source)
	}
	return wpMessagePlaceholderPattern.ReplaceAllStringFunc(
		template,
		func(match string) string {
			if strings.Contains(match, "name") {
				return name
			}
			return source
		},
	)
}

// ── wordpress/use-recommended-components ─────────────────────────────────

var wpRecommendedUiAllowlist = map[string]bool{
	"Badge": true, "Card": true, "Collapsible": true,
	"CollapsibleCard": true, "EmptyState": true, "Icon": true,
	"Link": true, "Skeleton": true, "Stack": true, "Tabs": true,
	"Text": true, "Tooltip": true, "VisuallyHidden": true,
}

var wpRecommendedComponentsDenylist = map[string]string{
	"ExternalLink":             "Use `Link` from `@wordpress/ui` with the `openInNewTab` prop instead.",
	"__experimentalDivider":    "{{ name }} is planned for deprecation.",
	"__experimentalElevation":  "Use elevation tokens from `@wordpress/base-styles` instead.",
	"__experimentalGrid":       "{{ name }} is planned for deprecation. Write your own CSS instead.",
	"__experimentalHeading":    "Use `Text` from `@wordpress/ui` instead.",
	"__experimentalHStack":     "Use `Stack` from `@wordpress/ui` instead.",
	"__experimentalScrollable": "{{ name }} is planned for deprecation.",
	"__experimentalSpacer":     "{{ name }} is planned for deprecation.",
	"__experimentalSurface":    "{{ name }} is planned for deprecation.",
	"__experimentalText":       "Use `Text` from `@wordpress/ui` instead.",
	"__experimentalView":       "{{ name }} is planned for deprecation.",
	"__experimentalVStack":     "Use `Stack` from `@wordpress/ui` instead.",
	"__experimentalZStack":     "{{ name }} is planned for deprecation. Write your own CSS instead.",
	"Animate":                  "{{ name }} is planned for deprecation.",
	"Card":                     "Use `Card.Root` from `@wordpress/ui` instead.",
	"CardBody":                 "Use `Card.Content` from `@wordpress/ui` instead.",
	"CardDivider":              "A divider is no longer a standard pattern for cards.",
	"CardFooter":               "A footer is no longer a standard pattern for cards.",
	"CardHeader":               "Use `Card.Header` (and optionally `Card.Title`) from `@wordpress/ui` instead.",
	"CardMedia":                "Use `Card.FullBleed` from `@wordpress/ui` instead.",
	"Flex":                     "For use cases not covered by `Stack` from `@wordpress/ui`, write your own CSS instead.",
	"FlexBlock":                "For use cases not covered by `Stack` from `@wordpress/ui`, write your own CSS instead.",
	"FlexItem":                 "For use cases not covered by `Stack` from `@wordpress/ui`, write your own CSS instead.",
	"ResponsiveWrapper":        "{{ name }} is planned for deprecation.",
	"TabPanel":                 "Use `Tabs` from `@wordpress/ui` instead.",
	"TabbableContainer":        "{{ name }} is planned for deprecation.",
	"Tabs":                     "Use `Tabs` from `@wordpress/ui` instead.",
	"Tooltip":                  "Use `Tooltip` from `@wordpress/ui` instead.",
	"VisuallyHidden":           "Use `{{ name }}` from `@wordpress/ui` instead.",
}

type useRecommendedComponents struct{}

func (useRecommendedComponents) Name() string {
	return "wordpress/use-recommended-components"
}
func (useRecommendedComponents) Visits() []shimast.Kind {
	return []shimast.Kind{
		shimast.KindImportDeclaration,
		shimast.KindVariableDeclaration,
	}
}
func (useRecommendedComponents) NeedsTypeChecker() bool { return false }
func (useRecommendedComponents) VisitsDeclarationFiles() bool {
	return false
}
func (useRecommendedComponents) AcceptsTtscLintOptions() bool { return false }

func (useRecommendedComponents) Check(ctx *rule.Context, node *shimast.Node) {
	if ctx == nil || ctx.File == nil {
		return
	}
	switch node.Kind {
	case shimast.KindImportDeclaration:
		declaration := node.AsImportDeclaration()
		if declaration == nil || declaration.ModuleSpecifier == nil ||
			declaration.ImportClause == nil {
			return
		}
		source, ok := stringLiteralText(declaration.ModuleSpecifier)
		if !ok {
			return
		}
		// The upstream denylist covers exactly this source; `privateApis`
		// imports from it are tracked for the unlock-destructuring branch.
		hasDenylist := source == "@wordpress/components"
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
			importedName := identifierText(specifier.Name())
			if specifier.PropertyName != nil {
				importedName = identifierText(specifier.PropertyName)
			}
			if source == "@wordpress/ui" &&
				!wpRecommendedUiAllowlist[importedName] {
				ctx.Report(
					specifierNode,
					wpResolveMessage(
						"`{{ name }}` from `{{ source }}` is not yet recommended for use in a WordPress environment.",
						importedName,
						source,
					),
				)
			}
			if hasDenylist {
				if message, denied := wpRecommendedComponentsDenylist[importedName]; denied {
					ctx.Report(
						specifierNode,
						wpResolveMessage(message, importedName, source),
					)
				}
			}
		}
	case shimast.KindVariableDeclaration:
		if !wpLooksLikeUnlockDestructuring(node) {
			return
		}
		privateApis := wpPrivateApisSources(ctx.File, func(tracked string) bool {
			return tracked == "@wordpress/components"
		})
		source, bindings, ok := wpUnlockDestructuring(
			node,
			ctx.File,
			privateApis,
		)
		if !ok || source != "@wordpress/components" {
			return
		}
		for _, binding := range bindings {
			if message, denied := wpRecommendedComponentsDenylist[binding.Name]; denied {
				ctx.Report(
					binding.KeyNode,
					wpResolveMessage(message, binding.Name, source),
				)
			}
		}
	}
}

// ── wordpress/use-import-as ──────────────────────────────────────────────

type useImportAsOptions map[string]map[string]string

type useImportAs struct{}

func (useImportAs) Name() string { return "wordpress/use-import-as" }
func (useImportAs) Visits() []shimast.Kind {
	return []shimast.Kind{
		shimast.KindImportDeclaration,
		shimast.KindVariableDeclaration,
	}
}
func (useImportAs) NeedsTypeChecker() bool       { return false }
func (useImportAs) VisitsDeclarationFiles() bool { return false }
func (useImportAs) AcceptsTtscLintOptions() bool { return true }

func (useImportAs) Check(ctx *rule.Context, node *shimast.Node) {
	if ctx == nil || ctx.File == nil {
		return
	}
	var options useImportAsOptions
	if err := ctx.DecodeOptions(&options); err != nil {
		ctx.Report(node, "Invalid wordpress/use-import-as options")
		return
	}
	if options == nil {
		options = useImportAsOptions{}
	}
	// JSON null source maps decode as nil and would silently disable every
	// rename constraint, so malformed payloads fail closed.
	for _, sourceMap := range options {
		if sourceMap == nil {
			ctx.Report(node, "Invalid wordpress/use-import-as options")
			return
		}
		for importedName, localName := range sourceMap {
			if importedName == "" || localName == "" {
				ctx.Report(node, "Invalid wordpress/use-import-as options")
				return
			}
		}
	}
	switch node.Kind {
	case shimast.KindImportDeclaration:
		declaration := node.AsImportDeclaration()
		if declaration == nil || declaration.ModuleSpecifier == nil ||
			declaration.ImportClause == nil {
			return
		}
		source, ok := stringLiteralText(declaration.ModuleSpecifier)
		if !ok {
			return
		}
		sourceMap := options[source]
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
			importedName := identifierText(specifier.Name())
			if specifier.PropertyName != nil {
				importedName = identifierText(specifier.PropertyName)
			}
			localName, mapped := sourceMap[importedName]
			if !mapped || identifierText(specifier.Name()) == localName {
				continue
			}
			ctx.Report(
				specifier.Name(),
				fmt.Sprintf(
					"`%s` from `%s` must be imported as `%s`.",
					importedName,
					source,
					localName,
				),
			)
		}
	case shimast.KindVariableDeclaration:
		if !wpLooksLikeUnlockDestructuring(node) {
			return
		}
		privateApis := wpPrivateApisSources(ctx.File, func(tracked string) bool {
			_, trackedOk := options[tracked]
			return trackedOk
		})
		source, bindings, ok := wpUnlockDestructuring(
			node,
			ctx.File,
			privateApis,
		)
		if !ok {
			return
		}
		sourceMap := options[source]
		for _, binding := range bindings {
			localName, mapped := sourceMap[binding.Name]
			if !mapped {
				continue
			}
			valueName := wpPatternLocalName(binding.Value)
			if valueName == "" || valueName == localName {
				continue
			}
			ctx.Report(
				binding.Value,
				fmt.Sprintf(
					"`%s` from `%s` must be imported as `%s`.",
					binding.Name,
					source,
					localName,
				),
			)
		}
	}
}

// wpPatternLocalName ports getPropertyLocalName: only a plain identifier
// target counts; nested patterns and defaults without one are skipped.
func wpPatternLocalName(value *shimast.Node) string {
	if value != nil && value.Kind == shimast.KindIdentifier {
		return identifierText(value)
	}
	return ""
}

func init() {
	rule.Register(useRecommendedComponents{})
	rule.Register(useImportAs{})
}
