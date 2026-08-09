package wordpress

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

type i18nNoVariables struct{}

func (i18nNoVariables) Name() string { return "wordpress/i18n-no-variables" }
func (i18nNoVariables) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindCallExpression}
}
func (i18nNoVariables) NeedsTypeChecker() bool       { return false }
func (i18nNoVariables) VisitsDeclarationFiles() bool { return false }
func (i18nNoVariables) AcceptsTtscLintOptions() bool { return false }

func (i18nNoVariables) Check(ctx *rule.Context, node *shimast.Node) {
	call := node.AsCallExpression()
	for _, argument := range translationCandidateArguments(call, true) {
		if isAcceptableTranslationLiteral(argument) {
			continue
		}
		ctx.Report(
			node,
			"Translate function arguments must be string literals.",
		)
	}
}

func init() {
	rule.Register(i18nNoVariables{})
}
