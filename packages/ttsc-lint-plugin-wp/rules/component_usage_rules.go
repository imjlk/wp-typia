// Four component-usage rules ported from @wordpress/eslint-plugin 25.8.0:
// components-no-missing-40px-size-prop, components-no-unsafe-button-disabled,
// no-non-module-stylesheet-imports, and no-unmerged-classname. None of the
// rules belongs to an upstream preset; the two components rules accept the
// upstream checkLocalImports option.
package wordpress

import (
	"fmt"
	"regexp"
	"strings"
	"sync"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

type wpComponentsRuleOptions struct {
	CheckLocalImports bool `json:"checkLocalImports"`
}

// wpShouldTrackImportSource ports the shared upstream source filter.
func wpShouldTrackImportSource(source string, checkLocalImports bool) bool {
	if source == "@wordpress/components" {
		return true
	}
	return checkLocalImports &&
		(strings.HasPrefix(source, ".") || strings.HasPrefix(source, "/"))
}

// wpImportSpecifier is one named or default import binding.
type wpImportSpecifier struct {
	ImportedName string
	LocalName    string
}

// wpCollectImportSpecifiers returns every specifier of import declarations
// whose source passes the tracking filter.
func wpCollectImportSpecifiers(
	file *shimast.SourceFile,
	checkLocalImports bool,
) map[string][]wpImportSpecifier {
	imports := map[string][]wpImportSpecifier{}
	if file == nil || file.Statements == nil {
		return imports
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
		if !ok || !wpShouldTrackImportSource(source, checkLocalImports) {
			continue
		}
		clause := declaration.ImportClause.AsImportClause()
		if clause == nil {
			continue
		}
		if clause.Name() != nil {
			localName := identifierText(clause.Name())
			imports[source] = append(
				imports[source],
				wpImportSpecifier{ImportedName: "", LocalName: localName},
			)
		}
		if clause.NamedBindings == nil ||
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
			localName := identifierText(specifier.Name())
			importedName := localName
			if specifier.PropertyName != nil {
				importedName = identifierText(specifier.PropertyName)
			}
			imports[source] = append(
				imports[source],
				wpImportSpecifier{ImportedName: importedName, LocalName: localName},
			)
		}
	}
	return imports
}

// wpImportSpecifierCache memoizes the per-file import collection so JSX-heavy
// files do not rescan the statement list for every element, keyed by the
// parsed source file and the checkLocalImports option.
type wpImportSpecifierCache struct {
	cacheMutex      sync.Mutex
	cacheCheckLocal bool
	cacheFile       *shimast.SourceFile
	cacheImports    map[string][]wpImportSpecifier
}

func (cache *wpImportSpecifierCache) load(
	file *shimast.SourceFile,
	checkLocalImports bool,
) map[string][]wpImportSpecifier {
	cache.cacheMutex.Lock()
	defer cache.cacheMutex.Unlock()
	if cache.cacheFile != file || cache.cacheCheckLocal != checkLocalImports {
		cache.cacheFile = file
		cache.cacheCheckLocal = checkLocalImports
		cache.cacheImports = wpCollectImportSpecifiers(file, checkLocalImports)
	}
	return cache.cacheImports
}

// wpJsxAttribute returns the named JSX attribute, or nil.
func wpJsxAttribute(attributes *shimast.Node, name string) *shimast.Node {
	for _, property := range wpJsxAttributeList(attributes) {
		if property == nil || property.Kind != shimast.KindJsxAttribute {
			continue
		}
		attribute := property.AsJsxAttribute()
		if attribute != nil && identifierText(attribute.Name()) == name {
			return property
		}
	}
	return nil
}

func wpJsxAttributeList(attributes *shimast.Node) []*shimast.Node {
	if attributes == nil {
		return nil
	}
	jsxAttributes := attributes.AsJsxAttributes()
	if jsxAttributes == nil || jsxAttributes.Properties == nil {
		return nil
	}
	return jsxAttributes.Properties.Nodes
}

// hasTruthyWpJsxAttribute ports utils/has-truthy-jsx-attribute exactly: a
// boolean shorthand is truthy, an expression literal is falsy only for the
// literal false, a bare string literal must be non-empty, and any other
// expression is assumed truthy.
func hasTruthyWpJsxAttribute(attributes *shimast.Node, name string) bool {
	attribute := wpJsxAttribute(attributes, name)
	if attribute == nil {
		return false
	}
	jsxAttribute := attribute.AsJsxAttribute()
	if jsxAttribute == nil {
		return false
	}
	initializer := jsxAttribute.Initializer
	if initializer == nil {
		return true
	}
	switch initializer.Kind {
	case shimast.KindJsxExpression:
		container := initializer.AsJsxExpression()
		if container == nil || container.Expression == nil {
			return true
		}
		// The upstream comparison is `value !== false`, so only the literal
		// false (and not null, empty strings, or zero) is falsy here.
		return container.Expression.Kind != shimast.KindFalseKeyword
	case shimast.KindStringLiteral:
		if literal := initializer.AsStringLiteral(); literal != nil {
			return literal.Text != ""
		}
	}
	return true
}

// ── wordpress/components-no-unsafe-button-disabled ───────────────────────

type noUnsafeButtonDisabled struct {
	importCache wpImportSpecifierCache
}

func (noUnsafeButtonDisabled) Name() string {
	return "wordpress/components-no-unsafe-button-disabled"
}
func (noUnsafeButtonDisabled) Visits() []shimast.Kind {
	return []shimast.Kind{
		shimast.KindJsxOpeningElement,
		shimast.KindJsxSelfClosingElement,
	}
}
func (noUnsafeButtonDisabled) NeedsTypeChecker() bool       { return false }
func (noUnsafeButtonDisabled) VisitsDeclarationFiles() bool { return false }
func (noUnsafeButtonDisabled) AcceptsTtscLintOptions() bool { return true }

func (current *noUnsafeButtonDisabled) Check(ctx *rule.Context, node *shimast.Node) {
	if ctx == nil || ctx.File == nil {
		return
	}
	var options wpComponentsRuleOptions
	if err := ctx.DecodeOptions(&options); err != nil {
		ctx.Report(
			node,
			"Invalid wordpress/components-no-unsafe-button-disabled options",
		)
		return
	}
	tagName, attributes := jsxOpeningParts(node)
	if tagName == nil || tagName.Kind != shimast.KindIdentifier {
		return
	}
	if !current.wpIsTrackedButton(
		ctx.File,
		options.CheckLocalImports,
		identifierText(tagName),
	) {
		return
	}
	if !hasTruthyWpJsxAttribute(attributes, "disabled") {
		return
	}
	if wpJsxAttribute(attributes, "accessibleWhenDisabled") != nil {
		return
	}
	ctx.Report(
		node,
		"`disabled` used without the `accessibleWhenDisabled` prop. Disabling a "+
			"control without maintaining focusability can cause accessibility "+
			"issues, by hiding their presence from screen reader users, or "+
			"preventing focus from returning to a trigger element. (Ignore this "+
			"error if you truly mean to disable.)",
	)
}

func (current *noUnsafeButtonDisabled) wpIsTrackedButton(
	file *shimast.SourceFile,
	checkLocalImports bool,
	localName string,
) bool {
	for source, specifiers := range current.importCache.load(
		file,
		checkLocalImports,
	) {
		for _, specifier := range specifiers {
			if specifier.LocalName != localName {
				continue
			}
			if specifier.ImportedName == "Button" {
				return true
			}
			// Default imports only count when checking local sources whose
			// path ends in /button.
			if specifier.ImportedName == "" && checkLocalImports &&
				(strings.HasSuffix(source, "/button") ||
					strings.HasSuffix(source, "/Button")) {
				return true
			}
		}
	}
	return false
}

// ── wordpress/components-no-missing-40px-size-prop ───────────────────────

var componentsRequiring40px = map[string]bool{
	"Button":          true,
	"ClipboardButton": true,
	"IconButton":      true,
}

type noMissing40pxSizeProp struct {
	importCache wpImportSpecifierCache
}

func (noMissing40pxSizeProp) Name() string {
	return "wordpress/components-no-missing-40px-size-prop"
}
func (noMissing40pxSizeProp) Visits() []shimast.Kind {
	return []shimast.Kind{
		shimast.KindJsxOpeningElement,
		shimast.KindJsxSelfClosingElement,
	}
}
func (noMissing40pxSizeProp) NeedsTypeChecker() bool       { return false }
func (noMissing40pxSizeProp) VisitsDeclarationFiles() bool { return false }
func (noMissing40pxSizeProp) AcceptsTtscLintOptions() bool { return true }

func (current *noMissing40pxSizeProp) Check(ctx *rule.Context, node *shimast.Node) {
	if ctx == nil || ctx.File == nil {
		return
	}
	var options wpComponentsRuleOptions
	if err := ctx.DecodeOptions(&options); err != nil {
		ctx.Report(
			node,
			"Invalid wordpress/components-no-missing-40px-size-prop options",
		)
		return
	}
	tagName, attributes := jsxOpeningParts(node)
	if tagName == nil || tagName.Kind != shimast.KindIdentifier {
		return
	}
	importedName := current.wpTracked40pxComponent(
		ctx.File,
		options.CheckLocalImports,
		identifierText(tagName),
	)
	if importedName == "" {
		return
	}
	if hasTruthyWpJsxAttribute(attributes, "__next40pxDefaultSize") {
		return
	}
	if wpHasNonDefaultSize(attributes) {
		return
	}
	if importedName == "Button" && wpHasLinkVariant(attributes) {
		return
	}
	ctx.Report(
		node,
		fmt.Sprintf(
			"%s should have the `__next40pxDefaultSize` prop when using the default size.",
			importedName,
		),
	)
}

func (current *noMissing40pxSizeProp) wpTracked40pxComponent(
	file *shimast.SourceFile,
	checkLocalImports bool,
	localName string,
) string {
	for source, specifiers := range current.importCache.load(
		file,
		checkLocalImports,
	) {
		for _, specifier := range specifiers {
			if specifier.LocalName != localName {
				continue
			}
			if componentsRequiring40px[specifier.ImportedName] {
				return specifier.ImportedName
			}
			if specifier.ImportedName == "" && checkLocalImports {
				if inferred := wpInferComponentNameFromPath(source); inferred != "" {
					return inferred
				}
				if componentsRequiring40px[localName] {
					return localName
				}
			}
		}
	}
	return ""
}

// wpInferComponentNameFromPath ports the upstream kebab-to-Pascal inference
// for default imports from tracked local sources.
func wpInferComponentNameFromPath(source string) string {
	segments := strings.Split(source, "/")
	lastSegment := segments[len(segments)-1]
	if lastSegment == "" {
		return ""
	}
	parts := strings.Split(lastSegment, "-")
	var name strings.Builder
	for _, part := range parts {
		if part == "" {
			continue
		}
		name.WriteString(strings.ToUpper(part[:1]))
		name.WriteString(part[1:])
	}
	inferred := name.String()
	if componentsRequiring40px[inferred] {
		return inferred
	}
	return ""
}

func wpHasNonDefaultSize(attributes *shimast.Node) bool {
	sizeAttribute := wpJsxAttribute(attributes, "size")
	if sizeAttribute == nil {
		return false
	}
	attribute := sizeAttribute.AsJsxAttribute()
	if attribute == nil || attribute.Initializer == nil {
		return false
	}
	switch attribute.Initializer.Kind {
	case shimast.KindStringLiteral:
		if literal := attribute.Initializer.AsStringLiteral(); literal != nil {
			return literal.Text != "default"
		}
	case shimast.KindJsxExpression:
		return true
	}
	return false
}

func wpHasLinkVariant(attributes *shimast.Node) bool {
	variantAttribute := wpJsxAttribute(attributes, "variant")
	if variantAttribute == nil {
		return false
	}
	attribute := variantAttribute.AsJsxAttribute()
	if attribute == nil || attribute.Initializer == nil ||
		attribute.Initializer.Kind != shimast.KindStringLiteral {
		return false
	}
	literal := attribute.Initializer.AsStringLiteral()
	return literal != nil && literal.Text == "link"
}

// ── wordpress/no-non-module-stylesheet-imports ───────────────────────────

var (
	wpStylesheetExtensionPattern = regexp.MustCompile(
		`(?i)\.(?:css|scss|sass)$`,
	)
	wpModuleStylesheetPattern = regexp.MustCompile(
		`(?i)\.module\.(?:css|scss|sass)$`,
	)
	wpQueryOrHashPattern = regexp.MustCompile(`[?#].*$`)
)

type noNonModuleStylesheetImports struct{}

func (noNonModuleStylesheetImports) Name() string {
	return "wordpress/no-non-module-stylesheet-imports"
}
func (noNonModuleStylesheetImports) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindImportDeclaration}
}
func (noNonModuleStylesheetImports) NeedsTypeChecker() bool {
	return false
}
func (noNonModuleStylesheetImports) VisitsDeclarationFiles() bool { return false }
func (noNonModuleStylesheetImports) AcceptsTtscLintOptions() bool {
	return false
}

func (noNonModuleStylesheetImports) Check(ctx *rule.Context, node *shimast.Node) {
	declaration := node.AsImportDeclaration()
	if declaration == nil || declaration.ModuleSpecifier == nil {
		return
	}
	source, ok := stringLiteralText(declaration.ModuleSpecifier)
	if !ok {
		return
	}
	importPath := wpQueryOrHashPattern.ReplaceAllString(source, "")
	if !wpStylesheetExtensionPattern.MatchString(importPath) {
		return
	}
	if wpModuleStylesheetPattern.MatchString(importPath) {
		return
	}
	ctx.Report(
		node,
		"Import non-module stylesheets through the package stylesheet entry "+
			"point instead of JavaScript. If you want to import from JavaScript, "+
			"use a CSS module.",
	)
}

// ── wordpress/no-unmerged-classname ──────────────────────────────────────

type noUnmergedClassname struct{}

func (noUnmergedClassname) Name() string {
	return "wordpress/no-unmerged-classname"
}
func (noUnmergedClassname) Visits() []shimast.Kind {
	return []shimast.Kind{
		shimast.KindJsxOpeningElement,
		shimast.KindJsxSelfClosingElement,
	}
}
func (noUnmergedClassname) NeedsTypeChecker() bool       { return false }
func (noUnmergedClassname) VisitsDeclarationFiles() bool { return false }
func (noUnmergedClassname) AcceptsTtscLintOptions() bool { return false }

func (noUnmergedClassname) Check(ctx *rule.Context, node *shimast.Node) {
	_, attributes := jsxOpeningParts(node)
	classNameAttribute := wpJsxAttribute(attributes, "className")
	if classNameAttribute == nil {
		return
	}
	hasSpread := false
	for _, property := range wpJsxAttributeList(attributes) {
		if property != nil && property.Kind == shimast.KindJsxSpreadAttribute {
			hasSpread = true
			break
		}
	}
	if !hasSpread {
		return
	}
	functionNode := wpEnclosingFunction(node)
	if functionNode == nil {
		return
	}
	parameters := functionNode.Parameters()
	if len(parameters) == 0 {
		return
	}
	propsParameter := parameters[0]
	switch propsParameter.Name().Kind {
	case shimast.KindIdentifier:
		parameterName := identifierText(propsParameter.Name())
		for _, property := range wpJsxAttributeList(attributes) {
			if property == nil ||
				property.Kind != shimast.KindJsxSpreadAttribute {
				continue
			}
			spread := property.AsJsxSpreadAttribute()
			if spread != nil && spread.Expression != nil &&
				spread.Expression.Kind == shimast.KindIdentifier &&
				identifierText(spread.Expression) == parameterName {
				ctx.Report(
					classNameAttribute,
					"The `className` prop should be destructured from props and "+
						"merged into the `className` attribute to ensure it is "+
						"forwarded to the underlying element.",
				)
				return
			}
		}
	case shimast.KindObjectBindingPattern:
		pattern := propsParameter.Name()
		hasRestElement := false
		classNameDestructured := false
		for _, element := range pattern.Elements() {
			if element == nil || element.Kind != shimast.KindBindingElement {
				continue
			}
			binding := element.AsBindingElement()
			if binding == nil {
				continue
			}
			if binding.DotDotDotToken != nil {
				hasRestElement = true
			}
			if binding.PropertyName != nil {
				if identifierText(binding.PropertyName) == "className" {
					classNameDestructured = true
				}
			} else if identifierText(binding.Name()) == "className" {
				classNameDestructured = true
			}
		}
		if hasRestElement && !classNameDestructured {
			ctx.Report(
				classNameAttribute,
				"The `className` prop should be destructured from props and "+
					"merged into the `className` attribute to ensure it is "+
					"forwarded to the underlying element.",
			)
		}
	}
}

// wpEnclosingFunction ports the upstream walk, which considers only function
// declarations, function expressions, and arrows — never methods.
func wpEnclosingFunction(node *shimast.Node) *shimast.Node {
	for current := node.Parent; current != nil; current = current.Parent {
		switch current.Kind {
		case shimast.KindFunctionDeclaration,
			shimast.KindFunctionExpression,
			shimast.KindArrowFunction:
			return current
		}
	}
	return nil
}

func init() {
	rule.Register(&noUnsafeButtonDisabled{})
	rule.Register(&noMissing40pxSizeProp{})
	rule.Register(noNonModuleStylesheetImports{})
	rule.Register(noUnmergedClassname{})
}
