package wordpress

import (
	"fmt"
	"strings"
	"unicode"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

type i18nNoFlankingWhitespace struct{}

func (i18nNoFlankingWhitespace) Name() string {
	return "wordpress/i18n-no-flanking-whitespace"
}
func (i18nNoFlankingWhitespace) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindCallExpression}
}
func (i18nNoFlankingWhitespace) NeedsTypeChecker() bool       { return false }
func (i18nNoFlankingWhitespace) VisitsDeclarationFiles() bool { return false }
func (i18nNoFlankingWhitespace) AcceptsTtscLintOptions() bool { return false }

func (i18nNoFlankingWhitespace) Check(
	ctx *rule.Context,
	node *shimast.Node,
) {
	call := node.AsCallExpression()
	for _, argument := range translationCandidateArguments(call, true) {
		value, ok := translationTextContent(ctx.File, argument)
		if !ok || value == "" {
			continue
		}
		whitespace, found := firstFlankingWhitespace(value)
		if !found {
			continue
		}
		message := "Translations should not contain flanking whitespace"
		if problem := flankingWhitespaceProblem(whitespace); problem != "" {
			message += fmt.Sprintf(" (%s)", problem)
		}
		edits := flankingWhitespaceEdits(ctx.File, argument, true, true)
		if len(edits) == 0 {
			ctx.Report(node, message)
		} else {
			ctx.ReportFix(node, message, edits...)
		}
	}
}

func flankingWhitespaceProblem(value rune) string {
	switch value {
	case '\t':
		return "\\t"
	case '\n':
		return "\\n"
	case '\r':
		return "\\r"
	case ' ':
		return "whitespace"
	default:
		return ""
	}
}

func flankingWhitespaceEdits(
	file *shimast.SourceFile,
	node *shimast.Node,
	trimLeft bool,
	trimRight bool,
) []rule.TextEdit {
	if node == nil {
		return nil
	}
	if node.Kind == shimast.KindBinaryExpression {
		binary := node.AsBinaryExpression()
		if binary == nil || binary.OperatorToken == nil ||
			binary.OperatorToken.Kind != shimast.KindPlusToken {
			return nil
		}
		return append(
			// Only the outer edges are flanking whitespace. Trimming every
			// literal, as upstream does, removes meaningful join separators.
			flankingWhitespaceEdits(file, binary.Left, trimLeft, false),
			flankingWhitespaceEdits(file, binary.Right, false, trimRight)...,
		)
	}
	value, ok := stringLiteralText(node)
	if !ok || node.Kind != shimast.KindStringLiteral {
		return nil
	}
	start, end, ok := sourceNodeRange(file, node)
	if !ok {
		return nil
	}
	trimmed := value
	if trimLeft {
		trimmed = strings.TrimLeftFunc(trimmed, unicode.IsSpace)
	}
	if trimRight {
		trimmed = strings.TrimRightFunc(trimmed, unicode.IsSpace)
	}
	if trimmed == value {
		return nil
	}
	return []rule.TextEdit{{
		Pos: start,
		End: end,
		// Upstream standardizes on single quotes but does not escape the
		// decoded value. Reuse the package helper so apostrophes stay valid.
		Text: singleQuoted(trimmed),
	}}
}

func init() {
	rule.Register(i18nNoFlankingWhitespace{})
}
