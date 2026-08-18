// Two React correctness rules ported from eslint-plugin-react 7.37.5 as
// exposed through the @wordpress/eslint-plugin 25.8.0 presets:
// jsx-no-comment-textnodes and no-render-return-value. Neither rule has an
// upstream autofix, and both are enabled by the compiled recommended preset.
package wordpress

import (
	"fmt"
	"regexp"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

// ── wordpress/jsx-no-comment-textnodes ───────────────────────────────────

// Go/RE2 \s is ASCII-only; ECMAScript \s includes Unicode spaces, so
// reuse the repo-wide whitespace class like other ported rules.
var wpCommentLikeTextPattern = regexp.MustCompile(
	`(?m)^` + ecmaScriptWhitespaceClass + `*/(/|\*)`,
)

type jsxNoCommentTextnodes struct{}

func (jsxNoCommentTextnodes) Name() string {
	return "wordpress/jsx-no-comment-textnodes"
}
func (jsxNoCommentTextnodes) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindJsxText}
}
func (jsxNoCommentTextnodes) NeedsTypeChecker() bool       { return false }
func (jsxNoCommentTextnodes) VisitsDeclarationFiles() bool { return false }
func (jsxNoCommentTextnodes) AcceptsTtscLintOptions() bool { return false }

func (jsxNoCommentTextnodes) Check(ctx *rule.Context, node *shimast.Node) {
	if node == nil || node.Parent == nil {
		return
	}
	// JSXText content is itself whitespace and comment-shaped text, so the
	// raw node range must be read verbatim — SkipTrivia would eat it.
	source := ctx.File.Text()
	start, end := node.Pos(), node.End()
	if start < 0 || end > len(source) || start >= end {
		return
	}
	rawValue := source[start:end]
	if !wpCommentLikeTextPattern.MatchString(rawValue) {
		return
	}
	// Upstream reports only when the parent is a JSX node; JSX text can
	// only appear as an element or fragment child in the TypeScript AST.
	switch node.Parent.Kind {
	case shimast.KindJsxElement, shimast.KindJsxFragment:
	default:
		return
	}
	// Node reports skip leading trivia, but ESLint anchors JSXText at its
	// raw start (immediately after the previous sibling), so report the
	// explicit range instead.
	ctx.ReportRange(
		node.Pos(),
		node.End(),
		"Comments inside children section of tag should be placed inside braces",
	)
}

// ── wordpress/no-render-return-value ─────────────────────────────────────

type noRenderReturnValue struct{}

func (noRenderReturnValue) Name() string {
	return "wordpress/no-render-return-value"
}
func (noRenderReturnValue) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindCallExpression}
}
func (noRenderReturnValue) NeedsTypeChecker() bool       { return false }
func (noRenderReturnValue) VisitsDeclarationFiles() bool { return false }
func (noRenderReturnValue) AcceptsTtscLintOptions() bool { return false }

func (noRenderReturnValue) Check(ctx *rule.Context, node *shimast.Node) {
	call := node.AsCallExpression()
	if call == nil || call.Expression == nil ||
		call.Expression.Kind != shimast.KindPropertyAccessExpression {
		return
	}
	access := call.Expression.AsPropertyAccessExpression()
	if access == nil || access.Expression == nil ||
		access.Expression.Kind != shimast.KindIdentifier ||
		identifierText(access.Expression) != "ReactDOM" ||
		identifierText(access.Name()) != "render" {
		return
	}
	parent := wpUnwrapParenthesized(node).Parent
	switch parent.Kind {
	case shimast.KindVariableDeclaration,
		shimast.KindPropertyAssignment,
		shimast.KindReturnStatement,
		shimast.KindArrowFunction:
		ctx.Report(
			call.Expression,
			fmt.Sprintf(
				"Do not depend on the return value from %s.render",
				identifierText(access.Expression),
			),
		)
	case shimast.KindBinaryExpression:
		// Only assignment consumption counts; arithmetic, comparison, and
		// logical uses flow the value onward without binding it.
		binary := parent.AsBinaryExpression()
		if binary != nil && binary.OperatorToken != nil &&
			wpIsAssignmentOperator(binary.OperatorToken.Kind) {
			ctx.Report(
				call.Expression,
				fmt.Sprintf(
					"Do not depend on the return value from %s.render",
					identifierText(access.Expression),
				),
			)
		}
	}
}

func init() {
	rule.Register(jsxNoCommentTextnodes{})
	rule.Register(noRenderReturnValue{})
}
