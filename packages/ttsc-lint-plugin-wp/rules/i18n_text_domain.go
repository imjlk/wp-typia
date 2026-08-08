package wordpress

import (
	"encoding/json"
	"fmt"
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

type i18nTextDomain struct{}

type i18nTextDomainOptions struct {
	AllowedTextDomain json.RawMessage `json:"allowedTextDomain"`
}

func (i18nTextDomain) Name() string { return "wordpress/i18n-text-domain" }
func (i18nTextDomain) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindCallExpression}
}
func (i18nTextDomain) NeedsTypeChecker() bool       { return false }
func (i18nTextDomain) VisitsDeclarationFiles() bool { return false }

func (i18nTextDomain) Check(ctx *rule.Context, node *shimast.Node) {
	call := node.AsCallExpression()
	if call == nil || call.Arguments == nil {
		return
	}
	name := calleeName(call.Expression)
	index := textDomainArgumentIndex(name)
	if index < 0 {
		return
	}

	allowed, optionsError := decodeAllowedTextDomains(ctx)
	if optionsError != nil {
		ctx.Report(node, "Invalid wordpress/i18n-text-domain options")
		return
	}
	allowDefault := len(allowed) == 0 || containsString(allowed, "default")
	arguments := call.Arguments.Nodes
	if index >= len(arguments) {
		if allowDefault {
			return
		}
		if len(allowed) == 1 && len(arguments) > 0 {
			last := arguments[len(arguments)-1]
			ctx.ReportFix(node, "Missing text domain", rule.TextEdit{
				Pos:  last.End(),
				End:  last.End(),
				Text: ", " + singleQuoted(allowed[0]),
			})
			return
		}
		ctx.Report(node, "Missing text domain")
		return
	}

	domain := arguments[index]
	value, isStringLiteral := stringLiteralText(domain)
	// Mirror ESTree Literal semantics from the upstream rule: direct template
	// literals are rejected by type, while primitive Literal nodes proceed to
	// the allowed-value check even when their value is not a string.
	if domain.Kind != shimast.KindStringLiteral &&
		domain.Kind != shimast.KindNumericLiteral &&
		domain.Kind != shimast.KindBigIntLiteral &&
		domain.Kind != shimast.KindTrueKeyword &&
		domain.Kind != shimast.KindFalseKeyword &&
		domain.Kind != shimast.KindNullKeyword {
		ctx.Report(node, "Text domain is not a string literal")
		return
	}

	if isStringLiteral && value == "default" && allowDefault {
		if index > 0 {
			previous := arguments[index-1]
			ctx.ReportFix(node, "Unnecessary default text domain", rule.TextEdit{
				Pos:  previous.End(),
				End:  domain.End(),
				Text: "",
			})
			return
		}
		ctx.Report(node, "Unnecessary default text domain")
		return
	}

	if len(allowed) == 0 {
		return
	}
	displayValue := value
	if !isStringLiteral {
		displayValue = sourceNodeText(ctx.File, domain)
	}
	if containsString(allowed, displayValue) {
		return
	}
	message := fmt.Sprintf("Invalid text domain '%s'", displayValue)
	if len(allowed) == 1 {
		start, end, ok := stringLiteralContentRange(ctx.File, domain)
		if ok {
			// Upstream replaces the literal's inner range verbatim. Preserve that
			// output exactly; escaping it would diverge from the parity oracle.
			ctx.ReportFix(node, message, rule.TextEdit{
				Pos: start, End: end, Text: allowed[0],
			})
			return
		}
	}
	ctx.Report(node, message)
}

func decodeAllowedTextDomains(ctx *rule.Context) ([]string, error) {
	if ctx == nil || len(ctx.Options) == 0 {
		return nil, nil
	}
	var options i18nTextDomainOptions
	if err := ctx.DecodeOptions(&options); err != nil {
		return nil, err
	}
	if len(options.AllowedTextDomain) == 0 {
		return nil, nil
	}
	var single string
	if json.Unmarshal(options.AllowedTextDomain, &single) == nil {
		single = strings.TrimSpace(single)
		if single == "" {
			return nil, nil
		}
		return []string{single}, nil
	}
	var multiple []string
	if err := json.Unmarshal(options.AllowedTextDomain, &multiple); err != nil {
		return nil, fmt.Errorf(
			"allowedTextDomain must be a string or array of strings: %w",
			err,
		)
	}
	out := make([]string, 0, len(multiple))
	seen := map[string]bool{}
	for _, value := range multiple {
		value = strings.TrimSpace(value)
		if value != "" && !seen[value] {
			seen[value] = true
			out = append(out, value)
		}
	}
	return out, nil
}

func containsString(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

func init() {
	rule.Register(i18nTextDomain{})
}
