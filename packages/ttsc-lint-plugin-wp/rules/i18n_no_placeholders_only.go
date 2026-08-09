package wordpress

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

type i18nNoPlaceholdersOnly struct{}

func (i18nNoPlaceholdersOnly) Name() string {
	return "wordpress/i18n-no-placeholders-only"
}
func (i18nNoPlaceholdersOnly) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindCallExpression}
}
func (i18nNoPlaceholdersOnly) NeedsTypeChecker() bool       { return false }
func (i18nNoPlaceholdersOnly) VisitsDeclarationFiles() bool { return false }
func (i18nNoPlaceholdersOnly) AcceptsTtscLintOptions() bool { return false }

func (i18nNoPlaceholdersOnly) Check(
	ctx *rule.Context,
	node *shimast.Node,
) {
	call := node.AsCallExpression()
	for _, argument := range translationCandidateArguments(call, true) {
		value, ok := translationTextContent(ctx.File, argument)
		if !ok || value == "" || removeSprintfPlaceholders(value) != "" {
			continue
		}
		ctx.Report(
			node,
			// Preserve the upstream 25.8.0 diagnostic verbatim, including its
			// double-negative wording, because it is part of the parity contract.
			"Translatable strings should not contain nothing but placeholders",
		)
	}
}

func init() {
	rule.Register(i18nNoPlaceholdersOnly{})
}
