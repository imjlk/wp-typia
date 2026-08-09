package wordpress

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimscanner "github.com/microsoft/typescript-go/shim/scanner"
	"github.com/samchon/ttsc/packages/lint/rule"
)

type i18nTranslatorComments struct{}

type translatorComment struct {
	end  int
	pos  int
	text string
}

type translatorKey struct {
	described bool
	raw       string
}

var translatorLinePattern = regexp.MustCompile(`(?i)translators:\s*(.*)`)
var translatorMarkerPattern = regexp.MustCompile(`(?i)translators:\s*\S+`)
var translatorCommentPlaceholderPattern = regexp.MustCompile(
	`(?:^|[\s,])\s*(%?(?:\([a-zA-Z_][a-zA-Z0-9_]*\)(?:\.\d+|\.\*)?[sdf]|[1-9][0-9]*\$?(?:\.\d+|\.\*)?[sdf]|(?:\.\d+|\.\*)?[sdf]|[1-9][0-9]*|[sdf]|[a-zA-Z_][a-zA-Z0-9_]*))(:[ \t]+)?`,
)

func (i18nTranslatorComments) Name() string {
	return "wordpress/i18n-translator-comments"
}
func (i18nTranslatorComments) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindCallExpression}
}
func (i18nTranslatorComments) NeedsTypeChecker() bool       { return false }
func (i18nTranslatorComments) VisitsDeclarationFiles() bool { return false }
func (i18nTranslatorComments) AcceptsTtscLintOptions() bool { return false }

func (i18nTranslatorComments) Check(
	ctx *rule.Context,
	node *shimast.Node,
) {
	call := node.AsCallExpression()
	arguments := translationCandidateArguments(call, true)
	if len(arguments) == 0 {
		return
	}
	candidates := make([]string, 0, len(arguments))
	for _, argument := range arguments {
		if value, ok := translationTextContent(ctx.File, argument); ok &&
			value != "" {
			candidates = append(candidates, value)
		}
	}
	if len(candidates) == 0 {
		return
	}
	placeholders := make([]string, 0)
	for _, candidate := range candidates {
		placeholders = append(
			placeholders,
			extractTranslationPlaceholders(candidate)...,
		)
	}
	if len(placeholders) == 0 {
		return
	}

	callStart, _, ok := sourceNodeRange(ctx.File, node)
	if !ok {
		return
	}
	currentLine := shimscanner.GetECMALineOfPosition(ctx.File, callStart)
	for _, comment := range precedingTranslationComments(ctx.File, node) {
		commentEnd := comment.end
		if commentEnd > comment.pos {
			commentEnd--
		}
		commentLine := shimscanner.GetECMALineOfPosition(ctx.File, commentEnd)
		if absoluteDifference(commentLine, currentLine) > 1 {
			break
		}
		if !translatorMarkerPattern.MatchString(comment.text) {
			continue
		}
		keys := extractTranslatorKeys(comment.text)
		missing := missingTranslatorKeys(placeholders, keys)
		if len(missing) > 0 {
			ctx.Report(node, fmt.Sprintf(
				"Translator comment missing description(s) for placeholder(s): %s.",
				strings.Join(missing, ", "),
			))
			return
		}
		extra := extraTranslatorKeys(placeholders, keys)
		if len(extra) > 0 {
			ctx.Report(node, fmt.Sprintf(
				"Translator comment has extra placeholder(s): %s.",
				// Upstream joins this diagnostic without spaces.
				strings.Join(extra, ","),
			))
			return
		}
		return
	}

	ctx.Report(
		node,
		"Translation function with placeholders is missing preceding translator comment",
	)
}

func extractTranslationPlaceholders(value string) []string {
	matches := sprintfPlaceholderPattern.FindAllStringSubmatchIndex(value, -1)
	placeholders := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) < 12 || match[0] < 0 || match[1] < 0 {
			continue
		}
		if match[0] > 0 && value[match[0]-1] == '%' {
			continue
		}
		if match[6] >= 0 && match[7] >= 0 {
			placeholders = append(placeholders, value[match[6]:match[7]])
			continue
		}
		if match[10] >= 0 && match[11] >= 0 {
			placeholders = append(placeholders, value[match[10]:match[11]])
			continue
		}
		placeholders = append(placeholders, value[match[0]:match[1]])
	}
	return placeholders
}

func extractTranslatorKeys(comment string) []translatorKey {
	line := translatorLinePattern.FindStringSubmatch(comment)
	if len(line) < 2 {
		return nil
	}
	matches := translatorCommentPlaceholderPattern.FindAllStringSubmatch(
		line[1],
		-1,
	)
	keys := make([]translatorKey, 0, len(matches))
	indexByKey := map[string]int{}
	for _, match := range matches {
		if len(match) < 3 || match[1] == "" {
			continue
		}
		described := strings.TrimSpace(match[2]) == ":"
		if index, exists := indexByKey[match[1]]; exists {
			keys[index].described = keys[index].described || described
			continue
		}
		indexByKey[match[1]] = len(keys)
		keys = append(keys, translatorKey{
			described: described,
			raw:       match[1],
		})
	}
	return keys
}

func missingTranslatorKeys(
	placeholders []string,
	keys []translatorKey,
) []string {
	missing := make([]string, 0)
	for _, placeholder := range placeholders {
		found := false
		for _, key := range keys {
			if translatorKeyMatchesPlaceholder(key.raw, placeholder) {
				found = true
				break
			}
		}
		if !found {
			missing = append(missing, placeholder)
		}
	}
	return missing
}

func translatorKeyMatchesPlaceholder(key, placeholder string) bool {
	if strings.HasPrefix(placeholder, "%") {
		return key == placeholder || strings.HasSuffix(key, placeholder)
	}
	normalized := strings.TrimPrefix(key, "%")
	if normalized == placeholder {
		return true
	}
	namedPrefix := "(" + placeholder + ")"
	if strings.HasPrefix(normalized, namedPrefix) &&
		validTranslatorFormatSuffix(normalized[len(namedPrefix):]) {
		return true
	}
	return len(normalized) == len(placeholder)+2 &&
		strings.HasPrefix(normalized, placeholder+"$") &&
		strings.Contains("sdf", normalized[len(normalized)-1:])
}

func validTranslatorFormatSuffix(value string) bool {
	if value == "" || !strings.Contains("sdf", value[len(value)-1:]) {
		return false
	}
	precision := value[:len(value)-1]
	if precision == "" {
		return true
	}
	if precision == ".*" {
		return true
	}
	return strings.HasPrefix(precision, ".") &&
		onlyAsciiDigits(precision[1:])
}

func extraTranslatorKeys(
	placeholders []string,
	keys []translatorKey,
) []string {
	describedByRaw := make(map[string]bool, len(keys))
	for _, key := range keys {
		describedByRaw[key.raw] = key.described
	}
	extra := make([]string, 0)
	for _, key := range keys {
		normalized := strings.TrimPrefix(key.raw, "%")
		isNumbered := onlyAsciiDigits(normalized)
		isPrintf := key.raw == "%s" || key.raw == "%d" || key.raw == "%f"
		// Keep the upstream raw-key map/normalized-key lookup. In particular,
		// `%1:` and `1:` are not interchangeable when checking extra keys.
		isValidType := (isNumbered && describedByRaw[normalized]) || isPrintf
		if !isValidType || containsString(placeholders, key.raw) ||
			containsString(placeholders, normalized) {
			continue
		}
		extra = append(extra, key.raw)
	}
	return extra
}

func onlyAsciiDigits(value string) bool {
	if value == "" {
		return false
	}
	for index := range len(value) {
		if value[index] < '0' || value[index] > '9' {
			return false
		}
	}
	return true
}

func precedingTranslationComments(
	file *shimast.SourceFile,
	node *shimast.Node,
) []translatorComment {
	if file == nil || node == nil {
		return nil
	}
	factory := shimast.NewNodeFactory(shimast.NodeFactoryHooks{})
	source := file.Text()
	comments := make([]translatorComment, 0)
	seen := map[[2]int]bool{}
	collect := func(candidate *shimast.Node) {
		if candidate == nil {
			return
		}
		triviaStart := candidate.Pos()
		tokenStart := shimscanner.SkipTrivia(source, triviaStart)
		consider := func(comment shimast.CommentRange) {
			if comment.Pos() < triviaStart || comment.End() > tokenStart ||
				comment.Pos() < 0 || comment.End() > len(source) {
				return
			}
			key := [2]int{comment.Pos(), comment.End()}
			if seen[key] {
				return
			}
			seen[key] = true
			comments = append(comments, translatorComment{
				end:  comment.End(),
				pos:  comment.Pos(),
				text: commentText(source, comment),
			})
		}
		for comment := range shimscanner.GetTrailingCommentRanges(
			factory,
			source,
			triviaStart,
		) {
			consider(comment)
		}
		for comment := range shimscanner.GetLeadingCommentRanges(
			factory,
			source,
			triviaStart,
		) {
			consider(comment)
		}
	}

	collect(node)
	callStart, _, ok := sourceNodeRange(file, node)
	if !ok {
		return nil
	}
	currentLine := shimscanner.GetECMALineOfPosition(file, callStart)
	for parent := node.Parent; parent != nil &&
		parent.Kind != shimast.KindSourceFile; parent = parent.Parent {
		parentStart, _, valid := sourceNodeRange(file, parent)
		if !valid || absoluteDifference(
			shimscanner.GetECMALineOfPosition(file, parentStart),
			currentLine,
		) > 1 {
			break
		}
		collect(parent)
	}
	sort.SliceStable(comments, func(left, right int) bool {
		return comments[left].end > comments[right].end
	})
	return comments
}

func commentText(source string, comment shimast.CommentRange) string {
	value := source[comment.Pos():comment.End()]
	if strings.HasPrefix(value, "//") {
		return value[2:]
	}
	if strings.HasPrefix(value, "/*") && strings.HasSuffix(value, "*/") {
		return value[2 : len(value)-2]
	}
	return value
}

func absoluteDifference(left, right int) int {
	if left > right {
		return left - right
	}
	return right - left
}

func init() {
	rule.Register(i18nTranslatorComments{})
}
