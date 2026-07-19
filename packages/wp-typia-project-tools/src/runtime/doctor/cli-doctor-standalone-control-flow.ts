import ts from 'typescript';

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
