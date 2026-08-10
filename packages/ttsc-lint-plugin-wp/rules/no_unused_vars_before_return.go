package wordpress

import (
	"regexp"
	"sync"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

const unusedBeforeReturnMessage = "Variables should not be assigned until just prior its first reference. An early return statement may leave this variable unused."
const invalidUnusedBeforeReturnOptionsMessage = "Invalid wordpress/no-unused-vars-before-return options"

type noUnusedVarsBeforeReturn struct{}

type noUnusedVarsBeforeReturnOptions struct {
	ExcludePattern string `json:"excludePattern"`
}

type unusedBeforeReturnRegexpResult struct {
	err   error
	regex *regexp.Regexp
}

var unusedBeforeReturnRegexpCache sync.Map

func (noUnusedVarsBeforeReturn) Name() string {
	return "wordpress/no-unused-vars-before-return"
}
func (noUnusedVarsBeforeReturn) Visits() []shimast.Kind {
	return []shimast.Kind{shimast.KindReturnStatement}
}
func (noUnusedVarsBeforeReturn) NeedsTypeChecker() bool       { return true }
func (noUnusedVarsBeforeReturn) VisitsDeclarationFiles() bool { return false }

func (noUnusedVarsBeforeReturn) Check(
	ctx *rule.Context,
	returnNode *shimast.Node,
) {
	if ctx == nil || ctx.Checker == nil {
		return
	}
	functionNode := closestFunctionNode(returnNode)
	if functionNode == nil {
		return
	}
	var options noUnusedVarsBeforeReturnOptions
	if err := ctx.DecodeOptions(&options); err != nil {
		ctx.Report(returnNode, invalidUnusedBeforeReturnOptionsMessage)
		return
	}
	var exclude *regexp.Regexp
	if options.ExcludePattern != "" {
		var err error
		exclude, err = compileUnusedBeforeReturnRegexp(options.ExcludePattern)
		if err != nil {
			ctx.Report(returnNode, invalidUnusedBeforeReturnOptionsMessage)
			return
		}
	}
	usedSymbolPositions := collectUsedSymbolPositions(
		ctx,
		functionNode,
		returnNode,
	)
	walkWithinFunction(functionNode, functionNode, func(node *shimast.Node) {
		if node.Kind != shimast.KindVariableDeclaration ||
			node.End() >= returnNode.End() {
			return
		}
		declaration := node.AsVariableDeclaration()
		if declaration == nil || declaration.Initializer == nil ||
			declaration.Initializer.Kind != shimast.KindCallExpression ||
			isExemptMultiPropertyBinding(declaration.Name()) ||
			!belongsToFunctionScope(node, functionNode) {
			return
		}
		call := declaration.Initializer.AsCallExpression()
		if call == nil {
			return
		}
		callee := identifierText(call.Expression)
		if callee == "" {
			// RegExp#test coerces a missing MemberExpression name to
			// "undefined" in the upstream JavaScript implementation.
			callee = "undefined"
		}
		if exclude != nil && exclude.MatchString(callee) {
			return
		}
		bindings := collectBindingIdentifiers(declaration.Name())
		if len(bindings) == 0 {
			return
		}
		for _, binding := range bindings {
			if !bindingUsedBeforeReturn(
				ctx,
				declaration,
				usedSymbolPositions,
				binding,
			) {
				ctx.Report(node, unusedBeforeReturnMessage)
			}
		}
	})
}

func compileUnusedBeforeReturnRegexp(
	pattern string,
) (*regexp.Regexp, error) {
	if cached, ok := unusedBeforeReturnRegexpCache.Load(pattern); ok {
		result := cached.(unusedBeforeReturnRegexpResult)
		return result.regex, result.err
	}
	compiled, err := regexp.Compile(pattern)
	result := unusedBeforeReturnRegexpResult{err: err, regex: compiled}
	actual, _ := unusedBeforeReturnRegexpCache.LoadOrStore(pattern, result)
	stored := actual.(unusedBeforeReturnRegexpResult)
	return stored.regex, stored.err
}

func closestFunctionNode(node *shimast.Node) *shimast.Node {
	for current := node.Parent; current != nil; current = current.Parent {
		if isWordPressFunctionLike(current.Kind) {
			return current
		}
	}
	return nil
}

func isWordPressFunctionLike(kind shimast.Kind) bool {
	switch kind {
	case shimast.KindFunctionDeclaration,
		shimast.KindFunctionExpression,
		shimast.KindArrowFunction,
		shimast.KindMethodDeclaration,
		shimast.KindGetAccessor,
		shimast.KindSetAccessor,
		shimast.KindConstructor:
		return true
	default:
		return false
	}
}

func walkWithinFunction(
	root *shimast.Node,
	node *shimast.Node,
	visit func(*shimast.Node),
) {
	if node == nil || (node != root && isWordPressFunctionLike(node.Kind)) {
		return
	}
	visit(node)
	node.ForEachChild(func(child *shimast.Node) bool {
		walkWithinFunction(root, child, visit)
		return false
	})
}

func walkAllNodes(node *shimast.Node, visit func(*shimast.Node)) {
	if node == nil {
		return
	}
	visit(node)
	node.ForEachChild(func(child *shimast.Node) bool {
		walkAllNodes(child, visit)
		return false
	})
}

func belongsToFunctionScope(
	declaration *shimast.Node,
	functionNode *shimast.Node,
) bool {
	if declaration == nil || declaration.Parent == nil ||
		declaration.Parent.Kind != shimast.KindVariableDeclarationList {
		return false
	}
	listNode := declaration.Parent
	list := listNode.AsVariableDeclarationList()
	if list == nil {
		return false
	}
	if list.Flags&(shimast.NodeFlagsLet|shimast.NodeFlagsConst) == 0 {
		// `var` is function-scoped even when declared in a nested block.
		return true
	}
	body := functionBodyNode(functionNode)
	return body != nil && listNode.Parent != nil &&
		listNode.Parent.Kind == shimast.KindVariableStatement &&
		listNode.Parent.Parent == body
}

func functionBodyNode(node *shimast.Node) *shimast.Node {
	if node == nil {
		return nil
	}
	switch node.Kind {
	case shimast.KindFunctionDeclaration:
		return node.AsFunctionDeclaration().Body
	case shimast.KindFunctionExpression:
		return node.AsFunctionExpression().Body
	case shimast.KindArrowFunction:
		return node.AsArrowFunction().Body
	case shimast.KindMethodDeclaration:
		return node.AsMethodDeclaration().Body
	case shimast.KindGetAccessor:
		return node.AsGetAccessorDeclaration().Body
	case shimast.KindSetAccessor:
		return node.AsSetAccessorDeclaration().Body
	case shimast.KindConstructor:
		return node.AsConstructorDeclaration().Body
	default:
		return nil
	}
}

func isExemptMultiPropertyBinding(name *shimast.Node) bool {
	if name == nil || name.Kind != shimast.KindObjectBindingPattern {
		return false
	}
	pattern := name.AsBindingPattern()
	return pattern != nil && pattern.Elements != nil &&
		len(pattern.Elements.Nodes) > 1
}

func collectBindingIdentifiers(node *shimast.Node) []*shimast.Node {
	if node == nil {
		return nil
	}
	if node.Kind == shimast.KindIdentifier {
		return []*shimast.Node{node}
	}
	if node.Kind != shimast.KindObjectBindingPattern &&
		node.Kind != shimast.KindArrayBindingPattern {
		return nil
	}
	pattern := node.AsBindingPattern()
	if pattern == nil || pattern.Elements == nil {
		return nil
	}
	identifiers := make([]*shimast.Node, 0)
	for _, elementNode := range pattern.Elements.Nodes {
		if elementNode == nil || elementNode.Kind != shimast.KindBindingElement {
			continue
		}
		element := elementNode.AsBindingElement()
		if element != nil {
			identifiers = append(
				identifiers,
				collectBindingIdentifiers(element.Name())...,
			)
		}
	}
	return identifiers
}

func bindingUsedBeforeReturn(
	ctx *rule.Context,
	declaration *shimast.VariableDeclaration,
	usedSymbolPositions map[*shimast.Symbol]int,
	binding *shimast.Node,
) bool {
	bindingSymbol := ctx.Checker.GetSymbolAtLocation(binding)
	if bindingSymbol == nil {
		return true
	}
	bindingSymbol = ctx.Checker.GetMergedSymbol(bindingSymbol)
	position, ok := usedSymbolPositions[bindingSymbol]
	return ok && position >= declaration.End()
}

func collectUsedSymbolPositions(
	ctx *rule.Context,
	functionNode *shimast.Node,
	returnNode *shimast.Node,
) map[*shimast.Symbol]int {
	positions := map[*shimast.Symbol]int{}
	walkAllNodes(functionNode, func(node *shimast.Node) {
		if node.Kind != shimast.KindIdentifier ||
			node.End() >= returnNode.End() {
			return
		}
		var symbol *shimast.Symbol
		if node.Parent != nil &&
			node.Parent.Kind == shimast.KindShorthandPropertyAssignment {
			symbol = ctx.Checker.GetShorthandAssignmentValueSymbol(node.Parent)
		} else {
			symbol = ctx.Checker.GetSymbolAtLocation(node)
		}
		if symbol == nil {
			return
		}
		symbol = ctx.Checker.GetMergedSymbol(symbol)
		if previous, ok := positions[symbol]; !ok || node.Pos() > previous {
			positions[symbol] = node.Pos()
		}
	})
	return positions
}

func init() {
	rule.Register(noUnusedVarsBeforeReturn{})
}
