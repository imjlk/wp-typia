package wordpress

import (
	"regexp"
	"sort"
	"sync"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/lint/rule"
)

const unusedBeforeReturnMessage = "Variables should not be assigned until just prior its first reference. An early return statement may leave this variable unused."
const invalidUnusedBeforeReturnOptionsMessage = "Invalid wordpress/no-unused-vars-before-return options"

type noUnusedVarsBeforeReturn struct {
	cacheMutex sync.Mutex
	cacheFile  *shimast.SourceFile
	cache      map[*shimast.Node]*unusedBeforeReturnFunctionAnalysis
}

type noUnusedVarsBeforeReturnOptions struct {
	ExcludePattern string `json:"excludePattern"`
}

type unusedBeforeReturnRegexpResult struct {
	err   error
	regex *regexp.Regexp
}

type unusedBeforeReturnDeclaration struct {
	bindings    []*shimast.Node
	callee      string
	declaration *shimast.VariableDeclaration
	node        *shimast.Node
}

type unusedBeforeReturnFunctionAnalysis struct {
	declarations    []unusedBeforeReturnDeclaration
	symbolPositions map[*shimast.Symbol][]int
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

func (current *noUnusedVarsBeforeReturn) Check(
	ctx *rule.Context,
	returnNode *shimast.Node,
) {
	if ctx == nil || ctx.Checker == nil || ctx.File == nil {
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
	analysis := current.analysisFor(ctx, functionNode)
	for _, candidate := range analysis.declarations {
		if candidate.node.End() >= returnNode.End() {
			continue
		}
		callee := candidate.callee
		if callee == "" {
			// RegExp#test coerces a missing MemberExpression name to
			// "undefined" in the upstream JavaScript implementation.
			callee = "undefined"
		}
		if exclude != nil && exclude.MatchString(callee) {
			continue
		}
		for _, binding := range candidate.bindings {
			if !bindingUsedBeforeReturn(
				ctx,
				candidate.declaration,
				analysis.symbolPositions,
				binding,
				returnNode.End(),
			) {
				ctx.Report(candidate.node, unusedBeforeReturnMessage)
			}
		}
	}
}

func (current *noUnusedVarsBeforeReturn) analysisFor(
	ctx *rule.Context,
	functionNode *shimast.Node,
) *unusedBeforeReturnFunctionAnalysis {
	current.cacheMutex.Lock()
	defer current.cacheMutex.Unlock()
	if current.cacheFile != ctx.File {
		current.cacheFile = ctx.File
		current.cache = map[*shimast.Node]*unusedBeforeReturnFunctionAnalysis{}
	}
	if analysis := current.cache[functionNode]; analysis != nil {
		return analysis
	}
	analysis := collectUnusedBeforeReturnFunctionAnalysis(ctx, functionNode)
	current.cache[functionNode] = analysis
	return analysis
}

func collectUnusedBeforeReturnFunctionAnalysis(
	ctx *rule.Context,
	functionNode *shimast.Node,
) *unusedBeforeReturnFunctionAnalysis {
	analysis := &unusedBeforeReturnFunctionAnalysis{
		declarations:    []unusedBeforeReturnDeclaration{},
		symbolPositions: map[*shimast.Symbol][]int{},
	}
	walkWithinFunction(functionNode, functionNode, func(node *shimast.Node) {
		if node.Kind != shimast.KindVariableDeclaration {
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
		bindings := collectBindingIdentifiers(declaration.Name())
		if len(bindings) == 0 {
			return
		}
		analysis.declarations = append(
			analysis.declarations,
			unusedBeforeReturnDeclaration{
				bindings:    bindings,
				callee:      identifierText(call.Expression),
				declaration: declaration,
				node:        node,
			},
		)
	})
	walkAllNodes(functionNode, func(node *shimast.Node) {
		if node.Kind != shimast.KindIdentifier {
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
		analysis.symbolPositions[symbol] = append(
			analysis.symbolPositions[symbol],
			node.Pos(),
		)
	})
	for _, positions := range analysis.symbolPositions {
		sort.Ints(positions)
	}
	return analysis
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
		if declaration := node.AsFunctionDeclaration(); declaration != nil {
			return declaration.Body
		}
	case shimast.KindFunctionExpression:
		if expression := node.AsFunctionExpression(); expression != nil {
			return expression.Body
		}
	case shimast.KindArrowFunction:
		if function := node.AsArrowFunction(); function != nil {
			return function.Body
		}
	case shimast.KindMethodDeclaration:
		if declaration := node.AsMethodDeclaration(); declaration != nil {
			return declaration.Body
		}
	case shimast.KindGetAccessor:
		if declaration := node.AsGetAccessorDeclaration(); declaration != nil {
			return declaration.Body
		}
	case shimast.KindSetAccessor:
		if declaration := node.AsSetAccessorDeclaration(); declaration != nil {
			return declaration.Body
		}
	case shimast.KindConstructor:
		if declaration := node.AsConstructorDeclaration(); declaration != nil {
			return declaration.Body
		}
	}
	return nil
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
	usedSymbolPositions map[*shimast.Symbol][]int,
	binding *shimast.Node,
	returnEnd int,
) bool {
	bindingSymbol := ctx.Checker.GetSymbolAtLocation(binding)
	if bindingSymbol == nil {
		return true
	}
	bindingSymbol = ctx.Checker.GetMergedSymbol(bindingSymbol)
	positions := usedSymbolPositions[bindingSymbol]
	index := sort.SearchInts(positions, returnEnd)
	return index > 0 && positions[index-1] >= declaration.End()
}

func init() {
	rule.Register(&noUnusedVarsBeforeReturn{})
}
