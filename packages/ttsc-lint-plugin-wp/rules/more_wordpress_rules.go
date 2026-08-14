// Four more WordPress rules ported from @wordpress/eslint-plugin 25.8.0:
// no-ds-tokens, no-i18n-in-save, react-no-unsafe-timeout, and wp-global-usage
// (including its fixes). None of the rules belongs to an upstream preset.
package wordpress

import (
	"fmt"
	"regexp"
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

// ── wordpress/no-ds-tokens ──────────────────────────────────────────────

// The upstream wpdsTokensRegex compiles with the case-insensitive flag,
// unlike the case-sensitive boundary regex the no-*-ds-tokens rules use.
var noDsTokensBoundaryRegex = regexp.MustCompile(
	`(?i)(^|[^A-Za-z0-9_])--wpds-`,
)

type noDsTokens struct{}

func (noDsTokens) Name() string { return "wordpress/no-ds-tokens" }
func (noDsTokens) Visits() []shimast.Kind {
	return []shimast.Kind{
		shimast.KindStringLiteral,
		shimast.KindNoSubstitutionTemplateLiteral,
		shimast.KindTemplateHead,
		shimast.KindTemplateMiddle,
		shimast.KindTemplateTail,
	}
}
func (noDsTokens) NeedsTypeChecker() bool       { return false }
func (noDsTokens) VisitsDeclarationFiles() bool { return false }
func (noDsTokens) AcceptsTtscLintOptions() bool { return false }

func (noDsTokens) Check(ctx *rule.Context, node *shimast.Node) {
	text := wpdsLiteralPartText(node)
	if text != "" && noDsTokensBoundaryRegex.MatchString(text) {
		ctx.Report(
			node,
			"Design System tokens (--wpds-*) should not be used in this context.",
		)
	}
}

// wpdsLiteralPartText returns the matched text of the literal kinds the
// upstream selector inspects: string literals and template elements.
func wpdsLiteralPartText(node *shimast.Node) string {
	if node == nil {
		return ""
	}
	switch node.Kind {
	case shimast.KindStringLiteral:
		if literal := node.AsStringLiteral(); literal != nil {
			return literal.Text
		}
	case shimast.KindNoSubstitutionTemplateLiteral:
		if literal := node.AsNoSubstitutionTemplateLiteral(); literal != nil {
			return literal.Text
		}
	case shimast.KindTemplateHead:
		if literal := node.AsTemplateHead(); literal != nil {
			return literal.Text
		}
	case shimast.KindTemplateMiddle:
		if literal := node.AsTemplateMiddle(); literal != nil {
			return literal.Text
		}
	case shimast.KindTemplateTail:
		if literal := node.AsTemplateTail(); literal != nil {
			return literal.Text
		}
	}
	return ""
}

// ── wordpress/wp-global-usage ───────────────────────────────────────────

var wpGlobalUsageNames = map[string]bool{
	"IS_GUTENBERG_PLUGIN": true,
	"IS_WORDPRESS_CORE":   true,
	"SCRIPT_DEBUG":        true,
}

type wpGlobalUsage struct{}

func (wpGlobalUsage) Name() string { return "wordpress/wp-global-usage" }
func (wpGlobalUsage) Visits() []shimast.Kind {
	return []shimast.Kind{
		shimast.KindIdentifier,
		shimast.KindStringLiteral,
	}
}
func (wpGlobalUsage) NeedsTypeChecker() bool       { return false }
func (wpGlobalUsage) VisitsDeclarationFiles() bool { return false }
func (wpGlobalUsage) AcceptsTtscLintOptions() bool { return false }

func (wpGlobalUsage) Check(ctx *rule.Context, node *shimast.Node) {
	if ctx == nil || node == nil || node.Parent == nil {
		return
	}
	var name string
	switch node.Kind {
	case shimast.KindIdentifier:
		name = identifierText(node)
	case shimast.KindStringLiteral:
		if literal := node.AsStringLiteral(); literal != nil {
			name = literal.Text
		}
	}
	if !wpGlobalUsageNames[name] {
		return
	}

	switch node.Kind {
	case shimast.KindIdentifier:
		// Upstream skips every estree Property parent, which covers object
		// literal keys, shorthand values, methods, accessors, and binding
		// patterns.
		if wpGlobalUsageIsPropertyPosition(node) {
			return
		}
		if member, ok := wpGlobalUsageMemberFor(node); ok {
			wpGlobalUsageReportMember(ctx, node, member, name)
			return
		}
		start, end, valid := sourceNodeRange(ctx.File, node)
		if valid {
			ctx.ReportFix(
				node,
				wpGlobalUsageWithoutGlobalThisMessage(name),
				rule.TextEdit{Pos: start, End: end, Text: "globalThis." + name},
			)
		} else {
			ctx.Report(node, wpGlobalUsageWithoutGlobalThisMessage(name))
		}
		if !wpGlobalUsageUsedInConditional(node) {
			ctx.Report(node, wpGlobalUsageOutsideConditionalMessage(name))
		}
	case shimast.KindStringLiteral:
		member, ok := wpGlobalUsageMemberFor(node)
		if !ok {
			return
		}
		wpGlobalUsageReportMember(ctx, node, member, name)
	}
}

// wpGlobalUsageIsPropertyPosition mirrors the upstream `Property` skip.
func wpGlobalUsageIsPropertyPosition(node *shimast.Node) bool {
	parent := node.Parent
	switch parent.Kind {
	case shimast.KindPropertyAssignment,
		shimast.KindShorthandPropertyAssignment,
		shimast.KindBindingElement:
		return true
	case shimast.KindMethodDeclaration,
		shimast.KindGetAccessor,
		shimast.KindSetAccessor:
		// Object-literal members map to estree Property; class members do not.
		return parent.Parent != nil &&
			parent.Parent.Kind == shimast.KindObjectLiteralExpression
	}
	return false
}

// wpGlobalUsageMemberFor returns the member access the node participates in:
// the property name of a dot access, the computed argument of an index
// access, or the object side of a dot access whose identifier is the node.
func wpGlobalUsageMemberFor(node *shimast.Node) (*shimast.Node, bool) {
	parent := node.Parent
	switch parent.Kind {
	case shimast.KindPropertyAccessExpression:
		access := parent.AsPropertyAccessExpression()
		if access == nil {
			return nil, false
		}
		if access.Name() == node || access.Expression == node {
			return parent, true
		}
	case shimast.KindElementAccessExpression:
		access := parent.AsElementAccessExpression()
		if access == nil {
			return nil, false
		}
		if access.ArgumentExpression == node {
			return parent, true
		}
	}
	return nil, false
}

// wpGlobalUsageReportMember ports the upstream MemberExpression branch. A
// member whose object is a simple identifier other than `globalThis` reports
// usedWithoutGlobalThis — fixable only when the object is `window` and the
// flagged node is the property side. Every other member must be the test of
// an if statement or ternary.
func wpGlobalUsageReportMember(
	ctx *rule.Context,
	node *shimast.Node,
	member *shimast.Node,
	name string,
) {
	var object *shimast.Node
	switch member.Kind {
	case shimast.KindPropertyAccessExpression:
		object = member.AsPropertyAccessExpression().Expression
	case shimast.KindElementAccessExpression:
		object = member.AsElementAccessExpression().Expression
	}
	if member.Kind == shimast.KindPropertyAccessExpression &&
		object == node {
		// The flagged identifier is the object side; upstream still reports
		// it, but its fixer never applies.
		ctx.Report(node, wpGlobalUsageWithoutGlobalThisMessage(name))
		return
	}
	if object != nil && object.Kind == shimast.KindIdentifier {
		objectName := identifierText(object)
		if objectName != "globalThis" {
			if objectName == "window" {
				start, end, valid := sourceNodeRange(ctx.File, member)
				if valid {
					ctx.ReportFix(
						node,
						wpGlobalUsageWithoutGlobalThisMessage(name),
						rule.TextEdit{
							Pos: start, End: end, Text: "globalThis." + name,
						},
					)
					return
				}
			}
			ctx.Report(node, wpGlobalUsageWithoutGlobalThisMessage(name))
			return
		}
	}
	if !wpGlobalUsageUsedInConditional(member) {
		ctx.Report(node, wpGlobalUsageOutsideConditionalMessage(name))
	}
}

// wpGlobalUsageUsedInConditional ports the upstream isUsedInConditional
// helper: one optional negation may wrap the member before it must be the
// test of an if statement or ternary.
func wpGlobalUsageUsedInConditional(node *shimast.Node) bool {
	current := wpUnwrapParenthesized(node)
	if parent := current.Parent; parent != nil &&
		parent.Kind == shimast.KindPrefixUnaryExpression {
		if unary := parent.AsPrefixUnaryExpression(); unary != nil &&
			unary.Operator == shimast.KindExclamationToken {
			current = wpUnwrapParenthesized(parent)
		}
	}
	parent := current.Parent
	if parent == nil {
		return false
	}
	switch parent.Kind {
	case shimast.KindIfStatement:
		return parent.AsIfStatement().Expression == current
	case shimast.KindConditionalExpression:
		return parent.AsConditionalExpression().Condition == current
	}
	return false
}

// wpUnwrapParenthesized climbs redundant parentheses, which the espree AST
// the upstream rules run on never retains.
func wpUnwrapParenthesized(node *shimast.Node) *shimast.Node {
	current := node
	for current.Parent != nil &&
		current.Parent.Kind == shimast.KindParenthesizedExpression {
		current = current.Parent
	}
	return current
}

func wpGlobalUsageWithoutGlobalThisMessage(name string) string {
	return fmt.Sprintf(
		"`%s` should not be used directly. Use `globalThis.%s`.",
		name,
		name,
	)
}

func wpGlobalUsageOutsideConditionalMessage(name string) string {
	return fmt.Sprintf(
		"`globalThis.%s` should only be used as the condition in an if statement or ternary expression.",
		name,
	)
}

// ── wordpress/no-i18n-in-save ───────────────────────────────────────────

type noI18nInSave struct{}

func (noI18nInSave) Name() string { return "wordpress/no-i18n-in-save" }
func (noI18nInSave) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindCallExpression}
}
func (noI18nInSave) NeedsTypeChecker() bool       { return false }
func (noI18nInSave) VisitsDeclarationFiles() bool { return false }
func (noI18nInSave) AcceptsTtscLintOptions() bool { return false }

func (noI18nInSave) Check(ctx *rule.Context, node *shimast.Node) {
	if ctx == nil || ctx.File == nil || node == nil {
		return
	}
	call := node.AsCallExpression()
	if call == nil || !isWordPressTranslationCallee(call.Expression) {
		return
	}
	fileName := strings.ReplaceAll(ctx.File.FileName(), "\\", "/")
	if wpIsScriptVariant(fileName, "/deprecated.") {
		return
	}
	if wpIsScriptVariant(fileName, "/save.") || i18nWithinSaveFunction(node) {
		ctx.Report(
			node,
			"Translation functions should not be used in block save functions. "+
				"Translated content is saved to the database and will not update "+
				"if the language changes.",
		)
	}
}

func wpIsScriptVariant(fileName string, stem string) bool {
	for _, extension := range []string{"js", "ts", "jsx", "tsx"} {
		if strings.HasSuffix(fileName, stem+extension) {
			return true
		}
	}
	return false
}

func isWordPressTranslationCallee(callee *shimast.Node) bool {
	switch calleeName(callee) {
	case "__", "_x", "_n", "_nx":
		return true
	}
	return false
}

// i18nWithinSaveFunction reports whether any function-like ancestor is a
// save function: a `function save` declaration, a `save` initializer, or a
// `save` property/method of an object literal.
func i18nWithinSaveFunction(node *shimast.Node) bool {
	for current := node.Parent; current != nil; current = current.Parent {
		if !isWordPressFunctionLike(current.Kind) {
			continue
		}
		switch current.Kind {
		case shimast.KindFunctionDeclaration:
			if identifierText(current.Name()) == "save" {
				return true
			}
		case shimast.KindArrowFunction, shimast.KindFunctionExpression:
			parent := current.Parent
			if parent == nil {
				continue
			}
			switch wpUnwrapParenthesized(current).Parent.Kind {
			case shimast.KindVariableDeclaration:
				declaration := wpUnwrapParenthesized(current).Parent.AsVariableDeclaration()
				if declaration != nil && declaration.Initializer == current &&
					identifierText(declaration.Name()) == "save" {
					return true
				}
			case shimast.KindPropertyAssignment:
				property := wpUnwrapParenthesized(current).Parent.AsPropertyAssignment()
				if property != nil && property.Initializer == current &&
					identifierText(property.Name()) == "save" {
					return true
				}
			}
		case shimast.KindMethodDeclaration:
			if current.Parent != nil &&
				current.Parent.Kind == shimast.KindObjectLiteralExpression &&
				identifierText(current.Name()) == "save" {
				return true
			}
		}
	}
	return false
}

// ── wordpress/react-no-unsafe-timeout ───────────────────────────────────

var unsafeTimeoutComponentNameRegexp = regexp.MustCompile(`^[A-Z]`)

type reactNoUnsafeTimeout struct{}

func (reactNoUnsafeTimeout) Name() string {
	return "wordpress/react-no-unsafe-timeout"
}
func (reactNoUnsafeTimeout) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindCallExpression}
}
func (reactNoUnsafeTimeout) NeedsTypeChecker() bool       { return false }
func (reactNoUnsafeTimeout) VisitsDeclarationFiles() bool { return false }
func (reactNoUnsafeTimeout) AcceptsTtscLintOptions() bool {
	return false
}

func (reactNoUnsafeTimeout) Check(ctx *rule.Context, node *shimast.Node) {
	if node == nil || node.Parent == nil {
		return
	}
	call := node.AsCallExpression()
	if call == nil || identifierText(call.Expression) != "setTimeout" {
		return
	}
	if unsafeTimeoutResultCaptured(node) {
		return
	}
	if !unsafeTimeoutWithinReactComponent(node) {
		return
	}
	// A locally declared setTimeout binding means the call is not the global
	// timer the rule polices.
	if domGlobalsNameIsDeclared(call.Expression, "setTimeout") {
		return
	}
	ctx.Report(node, "setTimeout in a component must be cancelled on unmount")
}

// unsafeTimeoutResultCaptured ports the upstream parent checks: an
// assignment or variable declaration consumes the timer id.
func unsafeTimeoutResultCaptured(node *shimast.Node) bool {
	parent := wpUnwrapParenthesized(node).Parent
	switch parent.Kind {
	case shimast.KindVariableDeclaration:
		return true
	case shimast.KindBinaryExpression:
		binary := parent.AsBinaryExpression()
		return binary != nil && binary.OperatorToken != nil &&
			wpIsAssignmentOperator(binary.OperatorToken.Kind)
	}
	return false
}

func wpIsAssignmentOperator(kind shimast.Kind) bool {
	switch kind {
	case shimast.KindEqualsToken,
		shimast.KindPlusEqualsToken,
		shimast.KindMinusEqualsToken,
		shimast.KindAsteriskEqualsToken,
		shimast.KindAsteriskAsteriskEqualsToken,
		shimast.KindSlashEqualsToken,
		shimast.KindPercentEqualsToken,
		shimast.KindLessThanLessThanEqualsToken,
		shimast.KindGreaterThanGreaterThanEqualsToken,
		shimast.KindGreaterThanGreaterThanGreaterThanEqualsToken,
		shimast.KindAmpersandEqualsToken,
		shimast.KindBarEqualsToken,
		shimast.KindCaretEqualsToken,
		shimast.KindAmpersandAmpersandEqualsToken,
		shimast.KindBarBarEqualsToken,
		shimast.KindQuestionQuestionEqualsToken:
		return true
	}
	return false
}

// unsafeTimeoutWithinReactComponent ports the upstream isComponent walk: an
// UpperCamelCase function declaration or a class extending `Component`.
func unsafeTimeoutWithinReactComponent(node *shimast.Node) bool {
	for current := node.Parent; current != nil; current = current.Parent {
		switch current.Kind {
		case shimast.KindFunctionDeclaration:
			if name := current.Name(); name != nil &&
				unsafeTimeoutComponentNameRegexp.MatchString(identifierText(name)) {
				return true
			}
		case shimast.KindClassDeclaration:
			declaration := current.AsClassDeclaration()
			if declaration == nil || declaration.HeritageClauses == nil {
				continue
			}
			for _, clause := range declaration.HeritageClauses.Nodes {
				heritage := clause.AsHeritageClause()
				// estree only maps `extends` clauses to superClass, so an
				// `implements` heritage clause never makes a component.
				if heritage == nil || heritage.Types == nil ||
					heritage.Token != shimast.KindExtendsKeyword {
					continue
				}
				for _, typeNode := range heritage.Types.Nodes {
					if wpHeritageExtendsComponent(typeNode) {
						return true
					}
				}
			}
		}
	}
	return false
}

func wpHeritageExtendsComponent(typeNode *shimast.Node) bool {
	expression := typeNode
	if withArgs := typeNode.AsExpressionWithTypeArguments(); withArgs != nil {
		expression = withArgs.Expression
	}
	if expression == nil {
		return false
	}
	if identifierText(expression) == "Component" {
		return true
	}
	if expression.Kind == shimast.KindPropertyAccessExpression {
		access := expression.AsPropertyAccessExpression()
		return access != nil &&
			identifierText(access.Name()) == "Component"
	}
	return false
}

func init() {
	rule.Register(noDsTokens{})
	rule.Register(wpGlobalUsage{})
	rule.Register(noI18nInSave{})
	rule.Register(reactNoUnsafeTimeout{})
}
