// Package wordpress provides WordPress-specific rules for @ttsc/lint.
//
// Rule behavior is ported from @wordpress/eslint-plugin 25.8.0 under the
// GPL-2.0-or-later license. The TypeScript-Go AST is used directly so the
// contributor remains independent from wp-typia and typia at runtime.
package wordpress

import (
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimscanner "github.com/microsoft/typescript-go/shim/scanner"
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
