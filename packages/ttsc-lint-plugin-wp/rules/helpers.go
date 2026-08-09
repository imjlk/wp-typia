// Package wordpress provides WordPress-specific rules for @ttsc/lint.
//
// Rule behavior is ported from @wordpress/eslint-plugin 25.8.0 under the
// GPL-2.0-or-later license. The TypeScript-Go AST is used directly so the
// contributor remains independent from wp-typia and typia at runtime.
package wordpress

import (
	"strings"
	"unicode"
	"unicode/utf8"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimscanner "github.com/microsoft/typescript-go/shim/scanner"
	"github.com/samchon/ttsc/packages/lint/rule"
)

func identifierText(node *shimast.Node) string {
	if node == nil || node.Kind != shimast.KindIdentifier {
		return ""
	}
	id := node.AsIdentifier()
	if id == nil {
		return ""
	}
	return id.Text
}

func stringLiteralText(node *shimast.Node) (string, bool) {
	if node == nil {
		return "", false
	}
	switch node.Kind {
	case shimast.KindStringLiteral:
		if literal := node.AsStringLiteral(); literal != nil {
			return literal.Text, true
		}
	case shimast.KindNoSubstitutionTemplateLiteral:
		if literal := node.AsNoSubstitutionTemplateLiteral(); literal != nil {
			return literal.Text, true
		}
	}
	return "", false
}

func calleeName(node *shimast.Node) string {
	if node == nil {
		return ""
	}
	if name := identifierText(node); name != "" {
		return name
	}
	if node.Kind != shimast.KindPropertyAccessExpression {
		return ""
	}
	access := node.AsPropertyAccessExpression()
	if access == nil {
		return ""
	}
	return identifierText(access.Name())
}

func translationArgumentIndexes(name string) []int {
	// WordPress 25.8.0 recognizes only these four translation functions. In
	// particular, its TRANSLATION_FUNCTIONS and getTranslateFunctionArgs helpers
	// intentionally omit _n_noop and _nx_noop.
	switch name {
	case "__", "_x":
		return []int{0}
	case "_n", "_nx":
		return []int{0, 1}
	default:
		return nil
	}
}

func translationCandidateArgumentIndexes(
	name string,
	includeContext bool,
) []int {
	switch name {
	case "__":
		return []int{0}
	case "_x":
		if includeContext {
			return []int{0, 1}
		}
		return []int{0}
	case "_n":
		return []int{0, 1}
	case "_nx":
		if includeContext {
			return []int{0, 1, 3}
		}
		return []int{0, 1}
	default:
		return nil
	}
}

func translationCandidateArguments(
	call *shimast.CallExpression,
	includeContext bool,
) []*shimast.Node {
	if call == nil || call.Arguments == nil {
		return nil
	}
	indexes := translationCandidateArgumentIndexes(
		calleeName(call.Expression),
		includeContext,
	)
	arguments := make([]*shimast.Node, 0, len(indexes))
	for _, index := range indexes {
		if index < len(call.Arguments.Nodes) {
			arguments = append(arguments, call.Arguments.Nodes[index])
		}
	}
	return arguments
}

func textDomainArgumentIndex(name string) int {
	// Keep this list aligned with upstream TRANSLATION_FUNCTIONS rather than the
	// wider set of functions exported by @wordpress/i18n.
	switch name {
	case "__":
		return 1
	case "_x":
		return 2
	case "_n":
		return 3
	case "_nx":
		return 4
	default:
		return -1
	}
}

func sourceNodeText(file *shimast.SourceFile, node *shimast.Node) string {
	if file == nil || node == nil {
		return ""
	}
	source := file.Text()
	start := shimscanner.SkipTrivia(source, node.Pos())
	end := node.End()
	if start < 0 || end > len(source) || start >= end {
		return ""
	}
	return strings.TrimSpace(source[start:end])
}

func sourceNodeRange(
	file *shimast.SourceFile,
	node *shimast.Node,
) (int, int, bool) {
	if file == nil || node == nil {
		return 0, 0, false
	}
	source := file.Text()
	start := shimscanner.SkipTrivia(source, node.Pos())
	end := node.End()
	if start < 0 || end > len(source) || start >= end {
		return 0, 0, false
	}
	return start, end, true
}

func stringLiteralContentRange(
	file *shimast.SourceFile,
	node *shimast.Node,
) (int, int, bool) {
	if file == nil || node == nil || node.Kind != shimast.KindStringLiteral {
		return 0, 0, false
	}
	source := file.Text()
	start := shimscanner.SkipTrivia(source, node.Pos())
	end := node.End()
	if start < 0 || end > len(source) || end-start < 2 {
		return 0, 0, false
	}
	quote := source[start]
	if (quote != '\'' && quote != '"') || source[end-1] != quote {
		return 0, 0, false
	}
	return start + 1, end - 1, true
}

func singleQuoted(value string) string {
	replacer := strings.NewReplacer(
		"\\", "\\\\",
		"'", "\\'",
		"\r", "\\r",
		"\n", "\\n",
	)
	return "'" + replacer.Replace(value) + "'"
}

func translationStaticNodes(node *shimast.Node) []*shimast.Node {
	if node == nil {
		return nil
	}
	switch node.Kind {
	case shimast.KindParenthesizedExpression:
		parenthesized := node.AsParenthesizedExpression()
		if parenthesized == nil {
			return nil
		}
		return translationStaticNodes(parenthesized.Expression)
	case shimast.KindStringLiteral,
		shimast.KindNoSubstitutionTemplateLiteral:
		return []*shimast.Node{node}
	case shimast.KindBinaryExpression:
		binary := node.AsBinaryExpression()
		if binary == nil || binary.OperatorToken == nil ||
			binary.OperatorToken.Kind != shimast.KindPlusToken {
			return nil
		}
		return append(
			translationStaticNodes(binary.Left),
			translationStaticNodes(binary.Right)...,
		)
	case shimast.KindTemplateExpression:
		template := node.AsTemplateExpression()
		if template == nil || template.Head == nil ||
			template.TemplateSpans == nil {
			return nil
		}
		parts := []*shimast.Node{template.Head}
		for _, spanNode := range template.TemplateSpans.Nodes {
			span := spanNode.AsTemplateSpan()
			if span != nil && span.Literal != nil {
				parts = append(parts, span.Literal)
			}
		}
		return parts
	default:
		return nil
	}
}

func translationStaticReplacementEdits(
	file *shimast.SourceFile,
	node *shimast.Node,
	rewrite func(string) string,
) []rule.TextEdit {
	if file == nil {
		return nil
	}
	source := file.Text()
	edits := make([]rule.TextEdit, 0)
	for _, part := range translationStaticNodes(node) {
		start, end, ok := sourceNodeRange(file, part)
		if !ok {
			continue
		}
		original := source[start:end]
		replacement := rewrite(original)
		if replacement != original {
			edits = append(edits, rule.TextEdit{
				Pos: start, End: end, Text: replacement,
			})
		}
	}
	return edits
}

func isAcceptableTranslationLiteral(node *shimast.Node) bool {
	if node == nil {
		return false
	}
	switch node.Kind {
	case shimast.KindParenthesizedExpression:
		parenthesized := node.AsParenthesizedExpression()
		return parenthesized != nil &&
			isAcceptableTranslationLiteral(parenthesized.Expression)
	case shimast.KindStringLiteral,
		shimast.KindNumericLiteral,
		shimast.KindBigIntLiteral,
		shimast.KindRegularExpressionLiteral,
		shimast.KindTrueKeyword,
		shimast.KindFalseKeyword,
		shimast.KindNullKeyword,
		shimast.KindNoSubstitutionTemplateLiteral:
		return true
	case shimast.KindBinaryExpression:
		binary := node.AsBinaryExpression()
		return binary != nil && binary.OperatorToken != nil &&
			binary.OperatorToken.Kind == shimast.KindPlusToken &&
			isAcceptableTranslationLiteral(binary.Left) &&
			isAcceptableTranslationLiteral(binary.Right)
	default:
		return false
	}
}

func firstFlankingWhitespace(value string) (rune, bool) {
	if value == "" {
		return 0, false
	}
	first, _ := utf8.DecodeRuneInString(value)
	if unicode.IsSpace(first) {
		return first, true
	}
	last, _ := utf8.DecodeLastRuneInString(value)
	return last, unicode.IsSpace(last)
}

func collapsibleWhitespaceProblem(value string) (string, bool) {
	for index := 0; index < len(value); index++ {
		switch value[index] {
		case '\t':
			return "\\t", true
		case '\n':
			return "\\n", true
		case '\r':
			return "\\r", true
		case ' ':
			if index+1 < len(value) && value[index+1] == ' ' {
				return "consecutive spaces", true
			}
		}
	}
	return "", false
}

func removeSprintfPlaceholders(value string) string {
	const escapedPercentage = "VALID_ESCAPED_PERCENTAGE_SIGN"
	value = strings.ReplaceAll(value, "%%", escapedPercentage)
	return sprintfPlaceholderPattern.ReplaceAllString(value, "")
}
