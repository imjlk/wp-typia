package wordpress

import (
	"fmt"
	"regexp"
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

const disallowedWpdsTokenSetMessage = "Do not set CSS custom properties using the Design System tokens namespace (i.e. beginning with --wpds-*). Use `ThemeProvider` from `@wordpress/theme` instead."

var (
	wpdsTokenBoundaryRegex = regexp.MustCompile(
		`(?i)(^|[^A-Za-z0-9_])--wpds-`,
	)
	wpdsDeclarationRegex = regexp.MustCompile(
		`(?i)(^|[^A-Za-z0-9_])--wpds-[A-Za-z0-9_-]+` +
			ecmaScriptWhitespaceClass + `*:`,
	)
	wpdsDynamicEndRegex     = regexp.MustCompile(`--wpds-[A-Za-z0-9_-]*$`)
	wpdsDeclarationEndRegex = regexp.MustCompile(
		`^[A-Za-z0-9_-]*` + ecmaScriptWhitespaceClass + `*:`,
	)
	wpdsTokenOccurrenceRegex = regexp.MustCompile(
		`(^|[^A-Za-z0-9_])(var\(` + ecmaScriptWhitespaceClass +
			`*)?(--wpds-[A-Za-z0-9_-]+)`,
	)
)

type noSettingDsTokens struct{}

func (noSettingDsTokens) Name() string {
	return "wordpress/no-setting-ds-tokens"
}
func (noSettingDsTokens) Visits() []shimast.Kind {
	return []shimast.Kind{
		shimast.KindPropertyAssignment,
		shimast.KindMethodDeclaration,
		shimast.KindGetAccessor,
		shimast.KindSetAccessor,
		shimast.KindStringLiteral,
		shimast.KindNoSubstitutionTemplateLiteral,
		shimast.KindTemplateExpression,
	}
}
func (noSettingDsTokens) NeedsTypeChecker() bool       { return false }
func (noSettingDsTokens) VisitsDeclarationFiles() bool { return false }
func (noSettingDsTokens) AcceptsTtscLintOptions() bool { return false }

func (noSettingDsTokens) Check(ctx *rule.Context, node *shimast.Node) {
	switch node.Kind {
	case shimast.KindPropertyAssignment,
		shimast.KindMethodDeclaration,
		shimast.KindGetAccessor,
		shimast.KindSetAccessor:
		nameNode, name, ok := staticObjectMemberName(node)
		if ok &&
			strings.HasPrefix(name, "--wpds-") {
			ctx.Report(nameNode, disallowedWpdsTokenSetMessage)
		}
	case shimast.KindStringLiteral,
		shimast.KindNoSubstitutionTemplateLiteral:
		value, ok := stringLiteralText(node)
		if ok && wpdsDeclarationRegex.MatchString(value) {
			ctx.Report(node, disallowedWpdsTokenSetMessage)
		}
	case shimast.KindTemplateExpression:
		quasis, ok := templateQuasiTexts(node)
		if !ok || !containsWpdsBoundary(quasis) {
			return
		}
		for index, value := range quasis {
			if wpdsDeclarationRegex.MatchString(value) ||
				(index+1 < len(quasis) &&
					wpdsDynamicEndRegex.MatchString(value) &&
					wpdsDeclarationEndRegex.MatchString(quasis[index+1])) {
				ctx.Report(node, disallowedWpdsTokenSetMessage)
				return
			}
		}
	}
}

type wpdsTokenOccurrence struct {
	bare        bool
	declaration bool
	token       string
}

type noUnknownDsTokens struct{}

func (noUnknownDsTokens) Name() string {
	return "wordpress/no-unknown-ds-tokens"
}
func (noUnknownDsTokens) Visits() []shimast.Kind {
	return []shimast.Kind{
		shimast.KindStringLiteral,
		shimast.KindNoSubstitutionTemplateLiteral,
		shimast.KindTemplateExpression,
	}
}
func (noUnknownDsTokens) NeedsTypeChecker() bool       { return false }
func (noUnknownDsTokens) VisitsDeclarationFiles() bool { return false }
func (noUnknownDsTokens) AcceptsTtscLintOptions() bool { return false }

func (noUnknownDsTokens) Check(ctx *rule.Context, node *shimast.Node) {
	if node.Kind == shimast.KindTemplateExpression {
		checkDynamicWpdsTokens(ctx, node)
		return
	}
	value, ok := stringLiteralText(node)
	if !ok || !wpdsTokenBoundaryRegex.MatchString(value) {
		return
	}
	reportInvalidWpdsTokens(
		ctx,
		node,
		collectWpdsTokenOccurrences(value),
		!isObjectPropertyKey(node),
	)
}

func checkDynamicWpdsTokens(ctx *rule.Context, node *shimast.Node) {
	quasis, ok := templateQuasiTexts(node)
	if !ok || !containsWpdsBoundary(quasis) {
		return
	}
	hasDynamic := false
	occurrences := make([]wpdsTokenOccurrence, 0)
	for index, value := range quasis {
		isFollowedByExpression := index+1 < len(quasis)
		if isFollowedByExpression && wpdsDynamicEndRegex.MatchString(value) {
			hasDynamic = true
		}
		quasiOccurrences := collectWpdsTokenOccurrences(value)
		if isFollowedByExpression {
			if len(quasiOccurrences) > 0 {
				last := quasiOccurrences[len(quasiOccurrences)-1]
				if strings.HasSuffix(value, last.token) {
					quasiOccurrences = quasiOccurrences[:len(quasiOccurrences)-1]
				}
			}
		}
		occurrences = append(occurrences, quasiOccurrences...)
	}
	if hasDynamic {
		ctx.Report(
			node,
			"Design System tokens must not be dynamically constructed, as they cannot be statically verified for correctness or processed automatically to inject fallbacks.",
		)
	}
	reportInvalidWpdsTokens(ctx, node, occurrences, true)
}

func reportInvalidWpdsTokens(
	ctx *rule.Context,
	node *shimast.Node,
	occurrences []wpdsTokenOccurrence,
	includeBareTokens bool,
) {
	unknown := orderedWpdsTokens(occurrences, func(occurrence wpdsTokenOccurrence) bool {
		return !knownWpdsTokens[occurrence.token]
	})
	bare := orderedWpdsTokens(occurrences, func(occurrence wpdsTokenOccurrence) bool {
		return includeBareTokens && knownWpdsTokens[occurrence.token] &&
			occurrence.bare && !occurrence.declaration
	})
	if len(unknown) > 0 {
		ctx.Report(
			node,
			"The following CSS variables are not valid Design System tokens: "+
				formatWpdsTokenNames(unknown),
		)
	}
	if len(bare) > 0 {
		ctx.Report(
			node,
			"Design System tokens must be wrapped in `var()` for build-time fallback injection to work: "+
				formatWpdsTokenNames(bare),
		)
	}
}

func collectWpdsTokenOccurrences(value string) []wpdsTokenOccurrence {
	matches := wpdsTokenOccurrenceRegex.FindAllStringSubmatchIndex(value, -1)
	occurrences := make([]wpdsTokenOccurrence, 0, len(matches))
	for _, match := range matches {
		if len(match) < 8 || match[6] < 0 || match[7] < 0 {
			continue
		}
		token := value[match[6]:match[7]]
		rest := value[match[7]:]
		occurrences = append(occurrences, wpdsTokenOccurrence{
			bare:        match[4] < 0,
			declaration: wpdsDeclarationEndRegex.MatchString(rest),
			token:       token,
		})
	}
	return occurrences
}

func orderedWpdsTokens(
	occurrences []wpdsTokenOccurrence,
	accept func(wpdsTokenOccurrence) bool,
) []string {
	seen := map[string]bool{}
	result := make([]string, 0)
	for _, occurrence := range occurrences {
		if !accept(occurrence) || seen[occurrence.token] {
			continue
		}
		seen[occurrence.token] = true
		result = append(result, occurrence.token)
	}
	return result
}

func formatWpdsTokenNames(tokens []string) string {
	quoted := make([]string, 0, len(tokens))
	for _, token := range tokens {
		quoted = append(quoted, fmt.Sprintf("'%s'", token))
	}
	return strings.Join(quoted, ", ")
}

func containsWpdsBoundary(values []string) bool {
	for _, value := range values {
		if wpdsTokenBoundaryRegex.MatchString(value) {
			return true
		}
	}
	return false
}

func templateQuasiTexts(node *shimast.Node) ([]string, bool) {
	expression := node.AsTemplateExpression()
	if expression == nil || expression.Head == nil ||
		expression.TemplateSpans == nil {
		return nil, false
	}
	head := expression.Head.AsTemplateHead()
	if head == nil {
		return nil, false
	}
	values := []string{head.Text}
	for _, spanNode := range expression.TemplateSpans.Nodes {
		span := spanNode.AsTemplateSpan()
		if span == nil || span.Literal == nil {
			return nil, false
		}
		switch span.Literal.Kind {
		case shimast.KindTemplateMiddle:
			values = append(values, span.Literal.AsTemplateMiddle().Text)
		case shimast.KindTemplateTail:
			values = append(values, span.Literal.AsTemplateTail().Text)
		default:
			return nil, false
		}
	}
	return values, true
}

func isObjectPropertyKey(node *shimast.Node) bool {
	if node == nil || node.Parent == nil {
		return false
	}
	nameNode := node
	member := node.Parent
	if member.Kind == shimast.KindComputedPropertyName {
		computed := member.AsComputedPropertyName()
		if computed == nil || computed.Expression != node || member.Parent == nil {
			return false
		}
		nameNode = member
		member = member.Parent
	}
	if member.Parent == nil ||
		member.Parent.Kind != shimast.KindObjectLiteralExpression {
		return false
	}
	switch member.Kind {
	case shimast.KindPropertyAssignment,
		shimast.KindMethodDeclaration,
		shimast.KindGetAccessor,
		shimast.KindSetAccessor:
		return member.Name() == nameNode
	default:
		return false
	}
}

func staticObjectMemberName(
	member *shimast.Node,
) (*shimast.Node, string, bool) {
	if member == nil || member.Parent == nil ||
		member.Parent.Kind != shimast.KindObjectLiteralExpression {
		return nil, "", false
	}
	nameNode := member.Name()
	valueNode := nameNode
	if nameNode != nil && nameNode.Kind == shimast.KindComputedPropertyName {
		computed := nameNode.AsComputedPropertyName()
		if computed == nil {
			return nil, "", false
		}
		valueNode = computed.Expression
	}
	value, ok := stringLiteralText(valueNode)
	return valueNode, value, ok
}

func init() {
	rule.Register(noSettingDsTokens{})
	rule.Register(noUnknownDsTokens{})
}

// Copied from @wordpress/theme's generated design-tokens.js shipped with the
// pinned @wordpress/eslint-plugin 25.8.0 oracle. Keeping the list package-local
// preserves the contributor's zero-runtime-dependency boundary.
const knownWpdsTokenList = `
--wpds-border-radius-xs
--wpds-border-radius-sm
--wpds-border-radius-md
--wpds-border-radius-lg
--wpds-border-radius-xl
--wpds-border-width-xs
--wpds-border-width-sm
--wpds-border-width-md
--wpds-border-width-lg
--wpds-border-width-focus
--wpds-color-background-surface-neutral
--wpds-color-background-surface-neutral-strong
--wpds-color-background-surface-neutral-weak
--wpds-color-background-surface-brand
--wpds-color-background-surface-success
--wpds-color-background-surface-success-weak
--wpds-color-background-surface-info
--wpds-color-background-surface-info-weak
--wpds-color-background-surface-warning
--wpds-color-background-surface-warning-weak
--wpds-color-background-surface-caution
--wpds-color-background-surface-caution-weak
--wpds-color-background-surface-error
--wpds-color-background-surface-error-weak
--wpds-color-background-interactive-neutral-strong
--wpds-color-background-interactive-neutral-strong-active
--wpds-color-background-interactive-neutral-strong-disabled
--wpds-color-background-interactive-neutral-weak
--wpds-color-background-interactive-neutral-weak-active
--wpds-color-background-interactive-neutral-weak-disabled
--wpds-color-background-interactive-brand-strong
--wpds-color-background-interactive-brand-strong-active
--wpds-color-background-interactive-brand-strong-disabled
--wpds-color-background-interactive-brand-weak
--wpds-color-background-interactive-brand-weak-active
--wpds-color-background-interactive-brand-weak-disabled
--wpds-color-background-interactive-error
--wpds-color-background-interactive-error-active
--wpds-color-background-interactive-error-disabled
--wpds-color-background-interactive-error-strong
--wpds-color-background-interactive-error-strong-active
--wpds-color-background-interactive-error-strong-disabled
--wpds-color-background-interactive-error-weak
--wpds-color-background-interactive-error-weak-active
--wpds-color-background-interactive-error-weak-disabled
--wpds-color-background-track-neutral-weak
--wpds-color-background-track-neutral
--wpds-color-background-thumb-neutral-weak
--wpds-color-background-thumb-neutral-weak-active
--wpds-color-background-thumb-brand
--wpds-color-background-thumb-brand-active
--wpds-color-background-thumb-brand-disabled
--wpds-color-background-thumb-neutral-weak-disabled
--wpds-color-foreground-content-neutral
--wpds-color-foreground-content-neutral-weak
--wpds-color-foreground-content-success
--wpds-color-foreground-content-success-weak
--wpds-color-foreground-content-info
--wpds-color-foreground-content-info-weak
--wpds-color-foreground-content-warning
--wpds-color-foreground-content-warning-weak
--wpds-color-foreground-content-caution
--wpds-color-foreground-content-caution-weak
--wpds-color-foreground-content-error
--wpds-color-foreground-content-error-weak
--wpds-color-foreground-interactive-neutral
--wpds-color-foreground-interactive-neutral-active
--wpds-color-foreground-interactive-neutral-disabled
--wpds-color-foreground-interactive-neutral-strong
--wpds-color-foreground-interactive-neutral-strong-active
--wpds-color-foreground-interactive-neutral-strong-disabled
--wpds-color-foreground-interactive-neutral-weak
--wpds-color-foreground-interactive-neutral-weak-active
--wpds-color-foreground-interactive-neutral-weak-disabled
--wpds-color-foreground-interactive-brand
--wpds-color-foreground-interactive-brand-active
--wpds-color-foreground-interactive-brand-disabled
--wpds-color-foreground-interactive-brand-strong
--wpds-color-foreground-interactive-brand-strong-active
--wpds-color-foreground-interactive-brand-strong-disabled
--wpds-color-foreground-interactive-error
--wpds-color-foreground-interactive-error-active
--wpds-color-foreground-interactive-error-disabled
--wpds-color-foreground-interactive-error-strong
--wpds-color-foreground-interactive-error-strong-active
--wpds-color-foreground-interactive-error-strong-disabled
--wpds-color-stroke-surface-neutral
--wpds-color-stroke-surface-neutral-weak
--wpds-color-stroke-surface-neutral-strong
--wpds-color-stroke-surface-brand
--wpds-color-stroke-surface-brand-strong
--wpds-color-stroke-surface-success
--wpds-color-stroke-surface-success-strong
--wpds-color-stroke-surface-info
--wpds-color-stroke-surface-info-strong
--wpds-color-stroke-surface-warning
--wpds-color-stroke-surface-warning-strong
--wpds-color-stroke-surface-caution
--wpds-color-stroke-surface-caution-strong
--wpds-color-stroke-surface-error
--wpds-color-stroke-surface-error-strong
--wpds-color-stroke-interactive-neutral
--wpds-color-stroke-interactive-neutral-active
--wpds-color-stroke-interactive-neutral-disabled
--wpds-color-stroke-interactive-neutral-strong
--wpds-color-stroke-interactive-brand
--wpds-color-stroke-interactive-brand-active
--wpds-color-stroke-interactive-brand-disabled
--wpds-color-stroke-interactive-error
--wpds-color-stroke-interactive-error-active
--wpds-color-stroke-interactive-error-disabled
--wpds-color-stroke-interactive-error-strong
--wpds-color-stroke-focus
--wpds-cursor-control
--wpds-dimension-padding-xs
--wpds-dimension-padding-sm
--wpds-dimension-padding-md
--wpds-dimension-padding-lg
--wpds-dimension-padding-xl
--wpds-dimension-padding-2xl
--wpds-dimension-padding-3xl
--wpds-dimension-gap-xs
--wpds-dimension-gap-sm
--wpds-dimension-gap-md
--wpds-dimension-gap-lg
--wpds-dimension-gap-xl
--wpds-dimension-gap-2xl
--wpds-dimension-gap-3xl
--wpds-dimension-size-5xs
--wpds-dimension-size-4xs
--wpds-dimension-size-3xs
--wpds-dimension-size-2xs
--wpds-dimension-size-xs
--wpds-dimension-size-sm
--wpds-dimension-size-md
--wpds-dimension-size-lg
--wpds-dimension-surface-width-xs
--wpds-dimension-surface-width-sm
--wpds-dimension-surface-width-md
--wpds-dimension-surface-width-lg
--wpds-dimension-surface-width-xl
--wpds-dimension-surface-width-2xl
--wpds-motion-duration-xs
--wpds-motion-duration-sm
--wpds-motion-duration-md
--wpds-motion-duration-lg
--wpds-motion-duration-xl
--wpds-motion-easing-subtle
--wpds-motion-easing-balanced
--wpds-motion-easing-expressive
--wpds-typography-font-family-heading
--wpds-typography-font-family-body
--wpds-typography-font-family-mono
--wpds-typography-font-size-xs
--wpds-typography-font-size-sm
--wpds-typography-font-size-md
--wpds-typography-font-size-lg
--wpds-typography-font-size-xl
--wpds-typography-font-size-2xl
--wpds-typography-line-height-xs
--wpds-typography-line-height-sm
--wpds-typography-line-height-md
--wpds-typography-line-height-lg
--wpds-typography-line-height-xl
--wpds-typography-line-height-2xl
--wpds-typography-font-weight-default
--wpds-typography-font-weight-emphasis
`

var knownWpdsTokens = func() map[string]bool {
	tokens := map[string]bool{}
	for _, token := range strings.Fields(knownWpdsTokenList) {
		tokens[token] = true
	}
	return tokens
}()
