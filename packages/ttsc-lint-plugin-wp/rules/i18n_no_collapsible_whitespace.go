package wordpress

import (
	"fmt"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

type i18nNoCollapsibleWhitespace struct{}

func (i18nNoCollapsibleWhitespace) Name() string {
	return "wordpress/i18n-no-collapsible-whitespace"
}
func (i18nNoCollapsibleWhitespace) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindCallExpression}
}
func (i18nNoCollapsibleWhitespace) NeedsTypeChecker() bool       { return false }
func (i18nNoCollapsibleWhitespace) VisitsDeclarationFiles() bool { return false }
func (i18nNoCollapsibleWhitespace) AcceptsTtscLintOptions() bool { return false }

func (i18nNoCollapsibleWhitespace) Check(
	ctx *rule.Context,
	node *shimast.Node,
) {
	call := node.AsCallExpression()
	for _, argument := range translationCandidateArguments(call, true) {
		value, ok := translationTextContent(ctx.File, argument)
		if !ok || value == "" {
			continue
		}
		problem, found := collapsibleWhitespaceProblem(value)
		if !found {
			continue
		}
		ctx.Report(node, fmt.Sprintf(
			"Translations should not contain collapsible whitespace (%s)",
			problem,
		))
	}
}

func init() {
	rule.Register(i18nNoCollapsibleWhitespace{})
}
