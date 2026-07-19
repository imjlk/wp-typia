import ts from 'typescript';

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
    const namedBindings = statement.importClause.namedBindings;
    const hasOnlyNamedTypeImports =
      !statement.importClause.name &&
      namedBindings !== undefined &&
      ts.isNamedImports(namedBindings) &&
      namedBindings.elements.length > 0 &&
      namedBindings.elements.every((element) => element.isTypeOnly);
    return (
      hasOnlyNamedTypeImports ||
      allowedRuntimeImportModules.has(statement.moduleSpecifier.text)
    );
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
