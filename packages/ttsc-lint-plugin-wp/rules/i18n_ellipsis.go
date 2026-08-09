package wordpress

import (
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

type i18nEllipsis struct{}

func (i18nEllipsis) Name() string { return "wordpress/i18n-ellipsis" }
func (i18nEllipsis) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindCallExpression}
}
func (i18nEllipsis) NeedsTypeChecker() bool       { return false }
func (i18nEllipsis) VisitsDeclarationFiles() bool { return false }
func (i18nEllipsis) AcceptsTtscLintOptions() bool { return false }

func (i18nEllipsis) Check(ctx *rule.Context, node *shimast.Node) {
	call := node.AsCallExpression()
	for _, argument := range translationCandidateArguments(call, true) {
		value, ok := translationTextContent(ctx.File, argument)
		if !ok || value == "" || !strings.Contains(value, "...") {
			continue
		}
		edits := translationStaticReplacementEdits(
			ctx.File,
			argument,
			func(source string) string {
				return strings.ReplaceAll(source, "...", "…")
			},
		)
		ctx.ReportFix(
			node,
			"Use ellipsis character (…) in place of three dots",
			edits...,
		)
	}
}

func init() {
	rule.Register(i18nEllipsis{})
}
