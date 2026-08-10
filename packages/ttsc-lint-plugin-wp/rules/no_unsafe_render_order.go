package wordpress

import (
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

type noUnsafeRenderOrder struct{}

type noUnsafeRenderOrderOptions struct {
	CheckLocalImports bool `json:"checkLocalImports"`
}

func (noUnsafeRenderOrder) Name() string {
	return "wordpress/no-unsafe-render-order"
}
func (noUnsafeRenderOrder) Visits() []shimast.Kind {
	return []shimast.Kind{
		shimast.KindJsxOpeningElement,
		shimast.KindJsxSelfClosingElement,
	}
}
func (noUnsafeRenderOrder) NeedsTypeChecker() bool       { return false }
func (noUnsafeRenderOrder) VisitsDeclarationFiles() bool { return false }

func (noUnsafeRenderOrder) Check(ctx *rule.Context, node *shimast.Node) {
	if ctx == nil || ctx.File == nil {
		return
	}
	var options noUnsafeRenderOrderOptions
	if err := ctx.DecodeOptions(&options); err != nil {
		ctx.Report(node, "Invalid wordpress/no-unsafe-render-order options")
		return
	}
	tagName, attributes := jsxOpeningParts(node)
	renderedIdentifier := renderedJsxAttributeIdentifier(attributes)
	if renderedIdentifier == "" {
		return
	}
	trackedImports := collectTrackedRenderImports(
		ctx.File,
		options.CheckLocalImports,
	)
	renderedName := trackedImports[renderedIdentifier]
	if renderedName == "VisuallyHidden" {
		ctx.Report(
			node,
			"Do not pass `VisuallyHidden` via `render`. Make `VisuallyHidden` the outer component instead.",
		)
		return
	}
	if trackedImports[identifierText(tagName)] == "Link" &&
		renderedName == "Text" {
		ctx.Report(
			node,
			"Use `Text` as the outer component and pass `Link` via `render` so the resulting element stays an `<a>`.",
		)
	}
}

func collectTrackedRenderImports(
	file *shimast.SourceFile,
	checkLocalImports bool,
) map[string]string {
	tracked := map[string]string{}
	if file == nil || file.Statements == nil {
		return tracked
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
		if !ok || (source != "@wordpress/ui" &&
			(!checkLocalImports ||
				(!strings.HasPrefix(source, ".") &&
					!strings.HasPrefix(source, "/")))) {
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
			localName := identifierText(specifier.Name())
			importedName := localName
			if specifier.PropertyName != nil {
				importedName = identifierText(specifier.PropertyName)
			}
			switch importedName {
			case "Link", "Text", "VisuallyHidden":
				tracked[localName] = importedName
			}
		}
	}
	return tracked
}

func renderedJsxAttributeIdentifier(attributes *shimast.Node) string {
	if attributes == nil {
		return ""
	}
	jsxAttributes := attributes.AsJsxAttributes()
	if jsxAttributes == nil || jsxAttributes.Properties == nil {
		return ""
	}
	for _, property := range jsxAttributes.Properties.Nodes {
		if property == nil || property.Kind != shimast.KindJsxAttribute {
			continue
		}
		attribute := property.AsJsxAttribute()
		if attribute == nil || identifierText(attribute.Name()) != "render" ||
			attribute.Initializer == nil ||
			attribute.Initializer.Kind != shimast.KindJsxExpression {
			continue
		}
		container := attribute.Initializer.AsJsxExpression()
		if container == nil {
			return ""
		}
		return renderedJsxIdentifier(container.Expression)
	}
	return ""
}

func renderedJsxIdentifier(node *shimast.Node) string {
	if node == nil {
		return ""
	}
	switch node.Kind {
	case shimast.KindJsxElement:
		element := node.AsJsxElement()
		if element == nil || element.OpeningElement == nil {
			return ""
		}
		opening := element.OpeningElement.AsJsxOpeningElement()
		if opening != nil {
			return identifierText(opening.TagName)
		}
	case shimast.KindJsxSelfClosingElement:
		element := node.AsJsxSelfClosingElement()
		if element != nil {
			return identifierText(element.TagName)
		}
	}
	return ""
}

func init() {
	rule.Register(noUnsafeRenderOrder{})
}
