package wordpress

import (
	"regexp"
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

type i18nHyphenatedRange struct{}

var hyphenatedNumericRangePattern = regexp.MustCompile(
	`(\d\s+-\s+\d)|(\d-\d)`,
)

func (i18nHyphenatedRange) Name() string {
	return "wordpress/i18n-hyphenated-range"
}
func (i18nHyphenatedRange) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindCallExpression}
}
func (i18nHyphenatedRange) NeedsTypeChecker() bool       { return false }
func (i18nHyphenatedRange) VisitsDeclarationFiles() bool { return false }
func (i18nHyphenatedRange) AcceptsTtscLintOptions() bool { return false }

func (i18nHyphenatedRange) Check(ctx *rule.Context, node *shimast.Node) {
	call := node.AsCallExpression()
	for _, argument := range translationCandidateArguments(call, true) {
		value, ok := translationTextContent(ctx.File, argument)
		if !ok || value == "" || !hyphenatedNumericRangePattern.MatchString(value) {
			continue
		}
		edits := translationStaticReplacementEdits(
			ctx.File,
			argument,
			func(source string) string {
				// Upstream replaces the first hyphen in the whole static chunk.
				// Restrict the edit to matched ranges so ordinary hyphenated words
				// before the range cannot be corrupted.
				return hyphenatedNumericRangePattern.ReplaceAllStringFunc(
					source,
					func(match string) string {
						return strings.Replace(match, "-", "–", 1)
					},
				)
			},
		)
		const message = "Use dashes (en or em) in place of hyphens for numeric ranges."
		if len(edits) == 0 {
			ctx.Report(node, message)
		} else {
			ctx.ReportFix(node, message, edits...)
		}
	}
}

func init() {
	rule.Register(i18nHyphenatedRange{})
}
