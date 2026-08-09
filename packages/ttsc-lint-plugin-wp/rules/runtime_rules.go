package wordpress

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

type noBaseControlWithLabelWithoutID struct{}

func (noBaseControlWithLabelWithoutID) Name() string {
	return "wordpress/no-base-control-with-label-without-id"
}
func (noBaseControlWithLabelWithoutID) Visits() []shimast.Kind {
	return []shimast.Kind{
		shimast.KindJsxOpeningElement,
		shimast.KindJsxSelfClosingElement,
	}
}
func (noBaseControlWithLabelWithoutID) NeedsTypeChecker() bool { return false }
func (noBaseControlWithLabelWithoutID) VisitsDeclarationFiles() bool {
	return false
}
func (noBaseControlWithLabelWithoutID) AcceptsTtscLintOptions() bool {
	return false
}

func (noBaseControlWithLabelWithoutID) Check(
	ctx *rule.Context,
	node *shimast.Node,
) {
	tagName, attributes := jsxOpeningParts(node)
	if identifierText(tagName) != "BaseControl" || attributes == nil {
		return
	}
	jsxAttributes := attributes.AsJsxAttributes()
	if jsxAttributes == nil || jsxAttributes.Properties == nil {
		return
	}
	hasID := false
	hasLabel := false
	for _, property := range jsxAttributes.Properties.Nodes {
		if property == nil || property.Kind != shimast.KindJsxAttribute {
			continue
		}
		attribute := property.AsJsxAttribute()
		if attribute == nil {
			continue
		}
		switch identifierText(attribute.Name()) {
		case "id":
			hasID = true
		case "label":
			hasLabel = true
		}
	}
	if hasLabel && !hasID {
		ctx.Report(
			node,
			"When using BaseControl component if a label property is passed an id property should also be passed.",
		)
	}
}

func jsxOpeningParts(node *shimast.Node) (*shimast.Node, *shimast.Node) {
	if node == nil {
		return nil, nil
	}
	switch node.Kind {
	case shimast.KindJsxOpeningElement:
		opening := node.AsJsxOpeningElement()
		if opening != nil {
			return opening.TagName, opening.Attributes
		}
	case shimast.KindJsxSelfClosingElement:
		opening := node.AsJsxSelfClosingElement()
		if opening != nil {
			return opening.TagName, opening.Attributes
		}
	}
	return nil, nil
}

type noGlobalActiveElement struct{}

func (noGlobalActiveElement) Name() string {
	return "wordpress/no-global-active-element"
}
func (noGlobalActiveElement) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindPropertyAccessExpression}
}
func (noGlobalActiveElement) NeedsTypeChecker() bool       { return false }
func (noGlobalActiveElement) VisitsDeclarationFiles() bool { return false }
func (noGlobalActiveElement) AcceptsTtscLintOptions() bool { return false }

func (noGlobalActiveElement) Check(ctx *rule.Context, node *shimast.Node) {
	access := node.AsPropertyAccessExpression()
	if access == nil || identifierText(access.Expression) != "document" ||
		identifierText(access.Name()) != "activeElement" {
		return
	}
	ctx.Report(
		node,
		"Avoid accessing the active element with a global. Use the ownerDocument property on a node ref instead.",
	)
}

type noGlobalGetSelection struct{}

func (noGlobalGetSelection) Name() string {
	return "wordpress/no-global-get-selection"
}
func (noGlobalGetSelection) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindCallExpression}
}
func (noGlobalGetSelection) NeedsTypeChecker() bool       { return false }
func (noGlobalGetSelection) VisitsDeclarationFiles() bool { return false }
func (noGlobalGetSelection) AcceptsTtscLintOptions() bool { return false }

func (noGlobalGetSelection) Check(ctx *rule.Context, node *shimast.Node) {
	call := node.AsCallExpression()
	if call == nil || call.Expression == nil ||
		call.Expression.Kind != shimast.KindPropertyAccessExpression {
		return
	}
	access := call.Expression.AsPropertyAccessExpression()
	if access == nil || identifierText(access.Expression) != "window" ||
		identifierText(access.Name()) != "getSelection" {
		return
	}
	ctx.Report(
		node,
		"Avoid accessing the selection with a global. Use the ownerDocument.defaultView property on a node ref instead.",
	)
}

type noUnguardedGetRangeAt struct{}

func (noUnguardedGetRangeAt) Name() string {
	return "wordpress/no-unguarded-get-range-at"
}
func (noUnguardedGetRangeAt) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindCallExpression}
}
func (noUnguardedGetRangeAt) NeedsTypeChecker() bool       { return false }
func (noUnguardedGetRangeAt) VisitsDeclarationFiles() bool { return false }
func (noUnguardedGetRangeAt) AcceptsTtscLintOptions() bool { return false }

func (noUnguardedGetRangeAt) Check(ctx *rule.Context, node *shimast.Node) {
	call := node.AsCallExpression()
	if call == nil || call.Expression == nil ||
		call.Expression.Kind != shimast.KindPropertyAccessExpression {
		return
	}
	rangeAccess := call.Expression.AsPropertyAccessExpression()
	if rangeAccess == nil || identifierText(rangeAccess.Name()) != "getRangeAt" ||
		rangeAccess.Expression == nil ||
		rangeAccess.Expression.Kind != shimast.KindCallExpression {
		return
	}
	selectionCall := rangeAccess.Expression.AsCallExpression()
	if selectionCall == nil || selectionCall.Expression == nil ||
		selectionCall.Expression.Kind != shimast.KindPropertyAccessExpression {
		return
	}
	selectionAccess := selectionCall.Expression.AsPropertyAccessExpression()
	if selectionAccess == nil ||
		identifierText(selectionAccess.Name()) != "getSelection" {
		return
	}
	ctx.Report(node, "Avoid unguarded getRangeAt")
}

func init() {
	rule.Register(noBaseControlWithLabelWithoutID{})
	rule.Register(noGlobalActiveElement{})
	rule.Register(noGlobalGetSelection{})
	rule.Register(noUnguardedGetRangeAt{})
}
