package wordpress

import (
	"fmt"
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

type noUnsafeWpApis struct{}

func (noUnsafeWpApis) Name() string { return "wordpress/no-unsafe-wp-apis" }
func (noUnsafeWpApis) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindImportDeclaration}
}
func (noUnsafeWpApis) NeedsTypeChecker() bool       { return false }
func (noUnsafeWpApis) VisitsDeclarationFiles() bool { return false }

func (noUnsafeWpApis) Check(ctx *rule.Context, node *shimast.Node) {
	declaration := node.AsImportDeclaration()
	if declaration == nil || declaration.ModuleSpecifier == nil ||
		declaration.ImportClause == nil {
		return
	}
	moduleName, ok := stringLiteralText(declaration.ModuleSpecifier)
	moduleName = strings.TrimSpace(moduleName)
	if !ok || !strings.HasPrefix(moduleName, "@wordpress/") {
		return
	}

	var allowedByModule map[string][]string
	if ctx == nil {
		return
	}
	if err := ctx.DecodeOptions(&allowedByModule); err != nil {
		return
	}
	allowed := map[string]bool{}
	for _, name := range allowedByModule[moduleName] {
		allowed[name] = true
	}

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
		if (!strings.HasPrefix(importedName, "__unstable") &&
			!strings.HasPrefix(importedName, "__experimental")) || allowed[importedName] {
			continue
		}
		ctx.Report(specifierNode, fmt.Sprintf(
			"Usage of `%s` from `%s` is not allowed.\nSee https://developer.wordpress.org/block-editor/contributors/develop/coding-guidelines/#experimental-and-unstable-apis for details.",
			importedName,
			moduleName,
		))
	}
}

func init() {
	rule.Register(noUnsafeWpApis{})
}
