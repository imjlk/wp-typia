package wordpress

import (
	"fmt"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

type noWpProcessEnv struct{}

var wordpressProcessEnvNames = map[string]bool{
	"GUTENBERG_PHASE":     true,
	"IS_GUTENBERG_PLUGIN": true,
	"IS_WORDPRESS_CORE":   true,
	"SCRIPT_DEBUG":        true,
}

func (noWpProcessEnv) Name() string { return "wordpress/no-wp-process-env" }
func (noWpProcessEnv) Visits() []shimast.Kind {
	return []shimast.Kind{
		shimast.KindPropertyAccessExpression,
		shimast.KindElementAccessExpression,
	}
}
func (noWpProcessEnv) NeedsTypeChecker() bool       { return false }
func (noWpProcessEnv) VisitsDeclarationFiles() bool { return false }
func (noWpProcessEnv) AcceptsTtscLintOptions() bool { return false }

func (noWpProcessEnv) Check(ctx *rule.Context, node *shimast.Node) {
	environmentAccess, name, ok := staticMemberParts(node)
	if !ok || !wordpressProcessEnvNames[name] {
		return
	}
	processNode, environmentName, ok := staticMemberParts(environmentAccess)
	if !ok || environmentName != "env" ||
		identifierText(processNode) != "process" {
		return
	}
	if name == "GUTENBERG_PHASE" {
		ctx.Report(
			node,
			"The GUTENBERG_PHASE environment variable is no longer available. Use IS_GUTENBERG_PLUGIN (boolean).",
		)
		return
	}
	message := fmt.Sprintf(
		"`%s` should not be accessed from process.env. Use `globalThis.%s`.",
		name,
		name,
	)
	start, end, valid := sourceNodeRange(ctx.File, node)
	if !valid {
		ctx.Report(node, message)
		return
	}
	ctx.ReportFix(node, message, rule.TextEdit{
		Pos: start, End: end, Text: "globalThis." + name,
	})
}

func staticMemberParts(node *shimast.Node) (*shimast.Node, string, bool) {
	if node == nil {
		return nil, "", false
	}
	switch node.Kind {
	case shimast.KindPropertyAccessExpression:
		access := node.AsPropertyAccessExpression()
		if access == nil {
			return nil, "", false
		}
		name := identifierText(access.Name())
		return access.Expression, name, name != ""
	case shimast.KindElementAccessExpression:
		access := node.AsElementAccessExpression()
		if access == nil {
			return nil, "", false
		}
		name, ok := stringLiteralText(access.ArgumentExpression)
		return access.Expression, name, ok
	default:
		return nil, "", false
	}
}

func init() {
	rule.Register(noWpProcessEnv{})
}
