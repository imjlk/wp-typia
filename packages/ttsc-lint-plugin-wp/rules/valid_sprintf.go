package wordpress

import (
	"regexp"
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

type validSprintf struct{}

// Keep both expressions byte-for-byte compatible with the WordPress 25.8.0
// rule. Its accepted specifier sets intentionally differ; changing them to a
// normalized PHP set would break the upstream parity contract.
var sprintfPlaceholderPattern = regexp.MustCompile(
	`%((([0-9]+)\$)|(\(([$_a-zA-Z][$_a-zA-Z0-9]*)\)))?[ +0#-]*[0-9]*(\.([0-9]+|\*))?(ll|[lhqL])?[cduxXefgsp]`,
)

var sprintfUnorderedPlaceholderPattern = regexp.MustCompile(
	`%[+-]?((0|'.)?-?[0-9]*(\.([ 0]|'.)?[0-9]+)?|[ ]?-?[0-9]+(\.([ 0]|'.)?[0-9]+)?)[bcdeEfFgGosuxX]`,
)

func (validSprintf) Name() string { return "wordpress/valid-sprintf" }
func (validSprintf) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindCallExpression}
}
func (validSprintf) NeedsTypeChecker() bool       { return false }
func (validSprintf) VisitsDeclarationFiles() bool { return false }
func (validSprintf) AcceptsTtscLintOptions() bool { return false }

func (validSprintf) Check(ctx *rule.Context, node *shimast.Node) {
	call := node.AsCallExpression()
	if call == nil || calleeName(call.Expression) != "sprintf" {
		return
	}
	if call.Arguments == nil || len(call.Arguments.Nodes) == 0 {
		ctx.Report(node, "sprintf must be called with a format string")
		return
	}
	arguments := call.Arguments.Nodes
	if len(arguments) < 2 {
		if arguments[0].Kind == shimast.KindSpreadElement {
			return
		}
		ctx.Report(node, "sprintf must be called with placeholder value argument(s)")
		return
	}

	candidates, known := sprintfCandidates(ctx.File, arguments[0])
	if !known {
		return
	}
	if len(candidates) == 0 {
		ctx.Report(node, "sprintf must be called with a valid format string")
		return
	}

	placeholderCount := -1
	for _, candidate := range candidates {
		matches := sprintfPlaceholders(candidate)
		if placeholderCount >= 0 && placeholderCount != len(matches) {
			ctx.Report(node, "sprintf format string options must have the same number of placeholders")
			return
		}
		if len(matches) > 1 && hasUnorderedSprintfPlaceholder(candidate) {
			ctx.Report(node, "Multiple sprintf placeholders should be ordered. Mix of ordered and non-ordered placeholders found.")
			return
		}
		if len(matches) == 0 {
			ctx.Report(node, "sprintf format string must contain at least one placeholder")
			return
		}
		if placeholderCount < 0 {
			placeholderCount = len(matches)
		}
	}
}

func sprintfCandidates(file *shimast.SourceFile, node *shimast.Node) ([]string, bool) {
	if node == nil {
		return []string{}, true
	}
	if node.Kind == shimast.KindIdentifier {
		return nil, false
	}
	// Upstream accepts only ESTree Literal here. A direct TemplateLiteral is
	// intentionally invalid even when it has no substitutions.
	if value, ok := stringLiteralText(node); ok && node.Kind == shimast.KindStringLiteral {
		return []string{value}, true
	}
	if node.Kind != shimast.KindCallExpression {
		return []string{}, true
	}
	call := node.AsCallExpression()
	if call == nil || call.Arguments == nil {
		return nil, false
	}
	indexes := translationArgumentIndexes(calleeName(call.Expression))
	if len(indexes) == 0 {
		return nil, false
	}
	candidates := make([]string, 0, len(indexes))
	for _, index := range indexes {
		if index >= len(call.Arguments.Nodes) {
			continue
		}
		if value, ok := translationTextContent(file, call.Arguments.Nodes[index]); ok {
			candidates = append(candidates, value)
		}
	}
	if len(candidates) == 0 {
		return nil, false
	}
	return candidates, true
}

func translationTextContent(file *shimast.SourceFile, node *shimast.Node) (string, bool) {
	if node == nil {
		return "", false
	}
	if node.Kind == shimast.KindParenthesizedExpression {
		parenthesized := node.AsParenthesizedExpression()
		if parenthesized == nil {
			return "", false
		}
		return translationTextContent(file, parenthesized.Expression)
	}
	if node.Kind == shimast.KindNoSubstitutionTemplateLiteral {
		raw := sourceNodeText(file, node)
		if len(raw) >= 2 && raw[0] == '`' && raw[len(raw)-1] == '`' {
			return raw[1 : len(raw)-1], true
		}
		return "", false
	}
	if value, ok := stringLiteralText(node); ok {
		return value, true
	}
	if node.Kind == shimast.KindBinaryExpression {
		binary := node.AsBinaryExpression()
		if binary == nil || binary.OperatorToken == nil ||
			binary.OperatorToken.Kind != shimast.KindPlusToken {
			return "", false
		}
		left, leftOK := translationTextContent(file, binary.Left)
		right, rightOK := translationTextContent(file, binary.Right)
		if !leftOK || !rightOK {
			return "", false
		}
		return left + right, true
	}
	if node.Kind != shimast.KindTemplateExpression {
		return "", false
	}
	template := node.AsTemplateExpression()
	if template == nil || template.Head == nil || template.TemplateSpans == nil {
		return "", false
	}
	var builder strings.Builder
	head := template.Head.AsTemplateHead()
	if head == nil {
		return "", false
	}
	builder.WriteString(templateLiteralRawText(head.RawText, head.Text))
	for _, spanNode := range template.TemplateSpans.Nodes {
		span := spanNode.AsTemplateSpan()
		if span == nil || span.Literal == nil {
			return "", false
		}
		builder.WriteString(
			templateLiteralRawText(span.Literal.RawText(), span.Literal.Text()),
		)
	}
	return builder.String(), true
}

func templateLiteralRawText(raw, cooked string) string {
	if raw != "" || cooked == "" {
		return raw
	}
	return cooked
}

func sprintfPlaceholders(value string) []string {
	indexes := sprintfPlaceholderPattern.FindAllStringIndex(value, -1)
	matches := make([]string, 0, len(indexes))
	for _, index := range indexes {
		if index[0] > 0 && value[index[0]-1] == '%' {
			continue
		}
		matches = append(matches, value[index[0]:index[1]])
	}
	return matches
}

func hasUnorderedSprintfPlaceholder(value string) bool {
	for _, index := range sprintfUnorderedPlaceholderPattern.FindAllStringIndex(value, -1) {
		if index[0] == 0 || value[index[0]-1] != '%' {
			return true
		}
	}
	return false
}

func init() {
	rule.Register(validSprintf{})
}
