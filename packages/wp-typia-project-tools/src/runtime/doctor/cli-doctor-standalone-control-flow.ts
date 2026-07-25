import ts from '@typescript/typescript6';

export interface CanonicalRuntimeImportShape {
  defaultBinding?: string;
  namedBindings?: ReadonlySet<string>;
}

/**
 * Check whether a generated sync helper statement is inert until main() runs.
 * Runtime imports are limited to the modules used by that helper; all other
 * imports must be erased by TypeScript.
 */
export function isAllowedSyncHelperTopLevelStatement(
  statement: ts.Statement,
  allowedRuntimeImportModules: ReadonlySet<string>,
  isAllowedVariableStatement: (
    statement: ts.VariableStatement,
  ) => boolean = () => false,
): boolean {
  if (ts.isImportDeclaration(statement)) {
    if (
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.importClause
    ) {
      return false;
    }
    if (statement.importClause.isTypeOnly) {
      return true;
    }
    return allowedRuntimeImportModules.has(statement.moduleSpecifier.text);
  }
  if (
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isFunctionDeclaration(statement)
  ) {
    return true;
  }
  return (
    ts.isVariableStatement(statement) &&
    isAllowedVariableStatement(statement)
  );
}

/** Require runtime imports to match the generated helper's load-time API. */
export function hasCanonicalRuntimeImports(
  sourceFile: ts.SourceFile,
  expectedImports: ReadonlyMap<string, CanonicalRuntimeImportShape>,
): boolean {
  const foundDefaults = new Set<string>();
  const foundNamed = new Map<string, Set<string>>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const importClause = statement.importClause;
    if (importClause?.isTypeOnly) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier) || !importClause) {
      return false;
    }
    const moduleName = statement.moduleSpecifier.text;
    const expected = expectedImports.get(moduleName);
    if (!expected) return false;

    if (importClause.name) {
      if (
        expected.defaultBinding !== importClause.name.text ||
        foundDefaults.has(moduleName)
      ) {
        return false;
      }
      foundDefaults.add(moduleName);
    }
    const namedBindings = importClause.namedBindings;
    if (!namedBindings) continue;
    if (ts.isNamespaceImport(namedBindings)) return false;

    const foundForModule = foundNamed.get(moduleName) ?? new Set<string>();
    for (const element of namedBindings.elements) {
      if (element.isTypeOnly) continue;
      const importedName = (element.propertyName ?? element.name).text;
      if (
        !expected.namedBindings?.has(importedName) ||
        foundForModule.has(importedName)
      ) {
        return false;
      }
      foundForModule.add(importedName);
    }
    foundNamed.set(moduleName, foundForModule);
  }

  for (const [moduleName, expected] of expectedImports) {
    if (
      (expected.defaultBinding !== undefined &&
        !foundDefaults.has(moduleName)) ||
      [...(expected.namedBindings ?? [])].some(
        (binding) => !foundNamed.get(moduleName)?.has(binding),
      )
    ) {
      return false;
    }
  }
  return true;
}

/** Find a control-flow completion without crossing a nested function boundary. */
export function containsCompletion(
  node: ts.Node,
  isTerminal: (candidate: ts.Node) => boolean,
): boolean {
  if (ts.isFunctionLike(node)) {
    return false;
  }
  if (isTerminal(node)) {
    return true;
  }
  return (
    ts.forEachChild(node, (child) =>
      containsCompletion(child, isTerminal) ? true : undefined,
    ) ?? false
  );
}

/** Unwrap supported static TypeScript wrappers to reach the underlying expression. */
export function unwrapStaticExpression(
  expression: ts.Expression,
): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

/** Validate the generated main().catch() failure boundary. */
export function isCanonicalSyncMainCatchHandler(
  rawHandler: ts.Expression,
): boolean {
  const handler = unwrapStaticExpression(rawHandler);
  if (
    (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler)) ||
    (ts.isFunctionExpression(handler) &&
      handler.asteriskToken !== undefined) ||
    handler.parameters.length !== 1 ||
    !ts.isIdentifier(handler.parameters[0].name) ||
    handler.parameters[0].dotDotDotToken !== undefined ||
    handler.parameters[0].initializer !== undefined ||
    !ts.isBlock(handler.body) ||
    handler.body.statements.length !== 2
  ) {
    return false;
  }
  const errorBinding = handler.parameters[0].name.text;
  const logStatement = handler.body.statements[0];
  if (!ts.isExpressionStatement(logStatement)) {
    return false;
  }
  const logCall = unwrapStaticExpression(logStatement.expression);
  if (
    !ts.isCallExpression(logCall) ||
    !ts.isPropertyAccessExpression(logCall.expression) ||
    !ts.isIdentifier(logCall.expression.expression) ||
    logCall.expression.expression.text !== 'console' ||
    logCall.expression.name.text !== 'error' ||
    logCall.arguments.length !== 2
  ) {
    return false;
  }
  const message = unwrapStaticExpression(logCall.arguments[0]);
  const errorArgument = unwrapStaticExpression(logCall.arguments[1]);
  if (
    !ts.isStringLiteralLike(message) ||
    !ts.isIdentifier(errorArgument) ||
    errorArgument.text !== errorBinding
  ) {
    return false;
  }
  const exitStatement = handler.body.statements[1];
  if (!ts.isExpressionStatement(exitStatement)) {
    return false;
  }
  const exitCall = unwrapStaticExpression(exitStatement.expression);
  return (
    ts.isCallExpression(exitCall) &&
    ts.isPropertyAccessExpression(exitCall.expression) &&
    ts.isIdentifier(exitCall.expression.expression) &&
    exitCall.expression.expression.text === 'process' &&
    exitCall.expression.name.text === 'exit' &&
    exitCall.arguments.length === 1 &&
    ts.isNumericLiteral(exitCall.arguments[0]) &&
    exitCall.arguments[0].text === '1'
  );
}

function hasUnsafeStaticExpression(node: ts.Node): boolean {
  if (
    ts.isCallExpression(node) ||
    ts.isNewExpression(node) ||
    ts.isTaggedTemplateExpression(node) ||
    ts.isAwaitExpression(node) ||
    ts.isYieldExpression(node) ||
    ts.isDeleteExpression(node) ||
    ts.isSpreadElement(node) ||
    ts.isSpreadAssignment(node) ||
    ts.isFunctionLike(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node)
  ) {
    return true;
  }
  if (
    (ts.isPrefixUnaryExpression(node) ||
      ts.isPostfixUnaryExpression(node)) &&
    (node.operator === ts.SyntaxKind.PlusPlusToken ||
      node.operator === ts.SyntaxKind.MinusMinusToken)
  ) {
    return true;
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
  ) {
    return true;
  }
  return (
    ts.forEachChild(node, (child) =>
      hasUnsafeStaticExpression(child) ? true : undefined,
    ) ?? false
  );
}

/** Return a side-effect-free `new Error(message)` expression when present. */
export function getSafeErrorConstruction(
  rawExpression: ts.Expression,
): ts.NewExpression | null {
  const expression = unwrapStaticExpression(rawExpression);
  return ts.isNewExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'Error' &&
    expression.arguments?.length === 1 &&
    !hasUnsafeStaticExpression(expression.arguments[0])
      ? expression
      : null;
}

/** Validate a side-effect-free `new Error(message)` expression. */
export function isSafeErrorConstruction(
  rawExpression: ts.Expression,
): boolean {
  return getSafeErrorConstruction(rawExpression) !== null;
}

/** Require the generated parser's terminal unknown-flag failure. */
export function hasCanonicalUnknownFlagThrow(
  body: ts.Statement,
  argumentBinding: string,
): boolean {
  if (!ts.isBlock(body) || body.statements.length === 0) {
    return false;
  }
  const finalStatement = body.statements[body.statements.length - 1];
  if (!ts.isThrowStatement(finalStatement) || !finalStatement.expression) {
    return false;
  }
  const errorConstruction = getSafeErrorConstruction(
    finalStatement.expression,
  );
  if (errorConstruction === null) return false;
  let referencesArgument = false;
  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && node.text === argumentBinding) {
      referencesArgument = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(errorConstruction.arguments![0]);
  return referencesArgument;
}

/**
 * Reject executable parser work beyond the generated option assignments.
 * Parser bodies are inspected rather than executed by doctor, so accepting an
 * unrelated call or mutation here would let the real sync command diverge from
 * the replayed options.
 */
export function hasOnlyCanonicalParserEffects(
  node: ts.Node,
  optionsBinding: string,
  indexBinding: string | null = null,
): boolean {
  let valid = true;

  function visit(candidate: ts.Node): void {
    if (!valid) {
      return;
    }
    if (
      ts.isCallExpression(candidate) ||
      ts.isTaggedTemplateExpression(candidate) ||
      ts.isAwaitExpression(candidate) ||
      ts.isYieldExpression(candidate) ||
      ts.isDeleteExpression(candidate) ||
      ts.isSpreadElement(candidate) ||
      ts.isSpreadAssignment(candidate) ||
      ts.isFunctionLike(candidate) ||
      ts.isClassDeclaration(candidate) ||
      ts.isClassExpression(candidate)
    ) {
      valid = false;
      return;
    }
    if (
      ts.isWhileStatement(candidate) ||
      ts.isDoStatement(candidate) ||
      ts.isForStatement(candidate) ||
      ts.isForInStatement(candidate)
    ) {
      valid = false;
      return;
    }
    if (ts.isForOfStatement(candidate)) {
      const expression = unwrapStaticExpression(candidate.expression);
      if (
        candidate.awaitModifier !== undefined ||
        !ts.isVariableDeclarationList(candidate.initializer) ||
        !(candidate.initializer.flags & ts.NodeFlags.Const) ||
        candidate.initializer.declarations.length !== 1 ||
        !ts.isIdentifier(candidate.initializer.declarations[0].name) ||
        !ts.isArrayLiteralExpression(expression) ||
        expression.elements.length !== 0
      ) {
        valid = false;
        return;
      }
    }
    if (ts.isNewExpression(candidate)) {
      if (!isSafeErrorConstruction(candidate)) {
        valid = false;
        return;
      }
    }
    if (
      ts.isPrefixUnaryExpression(candidate) ||
      ts.isPostfixUnaryExpression(candidate)
    ) {
      if (
        candidate.operator === ts.SyntaxKind.PlusPlusToken ||
        candidate.operator === ts.SyntaxKind.MinusMinusToken
      ) {
        valid = false;
        return;
      }
    }
    if (ts.isBinaryExpression(candidate)) {
      const operator = candidate.operatorToken.kind;
      const isAssignment =
        operator >= ts.SyntaxKind.FirstAssignment &&
        operator <= ts.SyntaxKind.LastAssignment;
      if (isAssignment) {
        const left = unwrapStaticExpression(candidate.left);
        const isOptionsAssignment =
          operator === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(left) &&
          ts.isIdentifier(left.expression) &&
          left.expression.text === optionsBinding;
        const isIndexAdvance =
          indexBinding !== null &&
          operator === ts.SyntaxKind.PlusEqualsToken &&
          ts.isIdentifier(left) &&
          left.text === indexBinding &&
          ts.isNumericLiteral(candidate.right) &&
          candidate.right.text === '1';
        if (!isOptionsAssignment && !isIndexAdvance) {
          valid = false;
          return;
        }
      }
    }
    ts.forEachChild(candidate, visit);
  }

  visit(node);
  return valid;
}

/** Count continues that target the generated parser's outer argument loop. */
export function countOuterParserContinues(node: ts.Node): number {
  let count = 0;

  function visit(
    candidate: ts.Node,
    loopDepth: number,
    nestedLoopLabels: ReadonlySet<string>,
  ): void {
    if (ts.isFunctionLike(candidate)) return;
    if (ts.isContinueStatement(candidate)) {
      if (
        candidate.label
          ? !nestedLoopLabels.has(candidate.label.text)
          : loopDepth === 0
      ) {
        count += 1;
      }
      return;
    }
    if (ts.isLabeledStatement(candidate)) {
      const labels = new Set(nestedLoopLabels);
      if (
        ts.isDoStatement(candidate.statement) ||
        ts.isForInStatement(candidate.statement) ||
        ts.isForOfStatement(candidate.statement) ||
        ts.isForStatement(candidate.statement) ||
        ts.isWhileStatement(candidate.statement)
      ) {
        labels.add(candidate.label.text);
      }
      visit(candidate.statement, loopDepth, labels);
      return;
    }
    const nestedLoop =
      ts.isDoStatement(candidate) ||
      ts.isForInStatement(candidate) ||
      ts.isForOfStatement(candidate) ||
      ts.isForStatement(candidate) ||
      ts.isWhileStatement(candidate);
    ts.forEachChild(candidate, (child) =>
      visit(child, loopDepth + (nestedLoop ? 1 : 0), nestedLoopLabels),
    );
  }

  visit(node, 0, new Set());
  return count;
}

/** Detect a static process.exit() call, regardless of its exit code. */
export function isProcessExitCompletion(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) {
    return false;
  }
  const target = unwrapStaticExpression(node.expression);
  let receiver: ts.Expression | null = null;
  if (ts.isPropertyAccessExpression(target) && target.name.text === 'exit') {
    receiver = target.expression;
  } else if (
    ts.isElementAccessExpression(target) &&
    target.argumentExpression !== undefined
  ) {
    const property = unwrapStaticExpression(target.argumentExpression);
    if (ts.isStringLiteralLike(property) && property.text === 'exit') {
      receiver = target.expression;
    }
  }
  if (receiver === null) {
    return false;
  }
  const unwrappedReceiver = unwrapStaticExpression(receiver);
  return (
    ts.isIdentifier(unwrappedReceiver) && unwrappedReceiver.text === 'process'
  );
}

/** Check whether a prior statement can terminate the current function. */
export function hasEarlierAbruptCompletion(
  statements: readonly ts.Statement[],
  statementIndex: number,
): boolean {
  return statements
    .slice(0, statementIndex)
    .some((statement) =>
      containsCompletion(
        statement,
        (node) =>
          ts.isReturnStatement(node) ||
          ts.isThrowStatement(node) ||
          isProcessExitCompletion(node),
      ),
    );
}
