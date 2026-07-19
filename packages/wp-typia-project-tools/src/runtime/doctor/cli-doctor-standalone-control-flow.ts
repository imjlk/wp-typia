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
  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && containsCompletion(child, isTerminal)) {
      found = true;
    }
  });
  return found;
}

/** Detect a direct process.exit() call, regardless of its exit code. */
export function isProcessExitCompletion(node: ts.Node): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'process' &&
    node.expression.name.text === 'exit'
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
