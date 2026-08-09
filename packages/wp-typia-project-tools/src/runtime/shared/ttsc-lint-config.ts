import fs from 'node:fs';
import path from 'node:path';

import ts from '@typescript/typescript6';

/**
 * Supported ttsc lint configuration filenames in discovery precedence order.
 */
export const TTSC_LINT_CONFIG_FILENAMES = [
  'lint.config.ts',
  'lint.config.mts',
  'lint.config.cts',
  'lint.config.mjs',
  'lint.config.cjs',
  'lint.config.js',
  'ttsc-lint.config.ts',
  'ttsc-lint.config.mts',
  'ttsc-lint.config.cts',
  'ttsc-lint.config.mjs',
  'ttsc-lint.config.cjs',
  'ttsc-lint.config.js',
] as const;

interface WordPressLintConfigBindings {
  declarationEnds: Map<string, number>;
  defaults: Set<string>;
  named: Set<string>;
  namespaces: Set<string>;
}

type TtscLintConfigModuleFormat =
  | 'commonjs'
  | 'flexible'
  | 'module'
  | 'transpiled-commonjs';

function statementHasTopLevelBinding(
  statement: ts.Statement,
  identifier: string,
): boolean {
  const bindings = new Set<string>();
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      collectBindingIdentifiers(declaration.name, bindings);
    }
  } else if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
    statement.name
  ) {
    bindings.add(statement.name.text);
  } else if (ts.isImportDeclaration(statement)) {
    const importClause = statement.importClause;
    if (importClause?.name) {
      bindings.add(importClause.name.text);
    }
    if (importClause?.namedBindings) {
      if (ts.isNamespaceImport(importClause.namedBindings)) {
        bindings.add(importClause.namedBindings.name.text);
      } else {
        for (const element of importClause.namedBindings.elements) {
          bindings.add(element.name.text);
        }
      }
    }
  } else if (ts.isImportEqualsDeclaration(statement)) {
    bindings.add(statement.name.text);
  }
  return bindings.has(identifier);
}

function sourceFileHasTopLevelBinding(
  sourceFile: ts.SourceFile,
  identifier: string,
): boolean {
  return sourceFile.statements.some((statement) =>
    statementHasTopLevelBinding(statement, identifier),
  );
}

function nodeReassignsIdentifier(node: ts.Node, identifier: string): boolean {
  let reassigned = false;
  const visit = (current: ts.Node): void => {
    if (reassigned || isDeferredScope(current)) {
      return;
    }
    if (ts.isBinaryExpression(current)) {
      const leftOperand = unwrapExpression(current.left);
      if (
        current.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        current.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
        assignmentTargetContainsIdentifier(leftOperand, identifier)
      ) {
        reassigned = true;
        return;
      }
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return reassigned;
}

function statementDetachesCommonJsBinding(
  statement: ts.Statement,
  identifier: string,
): boolean {
  if (nodeReassignsIdentifier(statement, identifier)) {
    return true;
  }
  if (!ts.isVariableStatement(statement)) {
    return statementHasTopLevelBinding(statement, identifier);
  }
  const blockScoped =
    (statement.declarationList.flags & ts.NodeFlags.BlockScoped) !== 0;
  return statement.declarationList.declarations.some((declaration) => {
    const bindings = new Set<string>();
    collectBindingIdentifiers(declaration.name, bindings);
    return (
      bindings.has(identifier) &&
      (blockScoped || declaration.initializer !== undefined)
    );
  });
}

function isWrapperExpression(
  node: ts.Node,
): node is
  | ts.AsExpression
  | ts.NonNullExpression
  | ts.ParenthesizedExpression
  | ts.SatisfiesExpression
  | ts.TypeAssertion {
  return (
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node)
  );
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (isWrapperExpression(current)) {
    current = current.expression;
  }
  return current;
}

function getStaticStringValue(expression: ts.Expression): string | null {
  const current = unwrapExpression(expression);
  return ts.isStringLiteral(current) ||
    ts.isNoSubstitutionTemplateLiteral(current)
    ? current.text
    : null;
}

function getPropertyName(name: ts.PropertyName): string | null {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) {
    return getStaticStringValue(name.expression);
  }
  return null;
}

function getPropertyAccessPath(expression: ts.Expression): string[] | null {
  const current = unwrapExpression(expression);
  if (ts.isIdentifier(current)) {
    return [current.text];
  }
  if (ts.isPropertyAccessExpression(current)) {
    const parent = getPropertyAccessPath(current.expression);
    return parent ? [...parent, current.name.text] : null;
  }
  if (
    ts.isElementAccessExpression(current) &&
    current.argumentExpression &&
    ts.isStringLiteral(unwrapExpression(current.argumentExpression))
  ) {
    const parent = getPropertyAccessPath(current.expression);
    return parent
      ? [
          ...parent,
          (unwrapExpression(current.argumentExpression) as ts.StringLiteral)
            .text,
        ]
      : null;
  }
  return null;
}

function expressionHasAccessPathRoot(
  expression: ts.Expression,
  rootPath: readonly string[],
): boolean {
  let current = unwrapExpression(expression);
  while (true) {
    const currentPath = getPropertyAccessPath(current);
    if (
      currentPath &&
      currentPath.length >= rootPath.length &&
      rootPath.every((segment, index) => currentPath[index] === segment)
    ) {
      return true;
    }
    if (
      !ts.isPropertyAccessExpression(current) &&
      !ts.isElementAccessExpression(current)
    ) {
      return false;
    }
    current = unwrapExpression(current.expression);
  }
}

function getAssignmentTargetLeaves(target: ts.Expression): ts.Expression[] {
  const current = unwrapExpression(target);
  if (ts.isArrayLiteralExpression(current)) {
    return current.elements.flatMap((element) => {
      if (ts.isOmittedExpression(element)) {
        return [];
      }
      return getAssignmentTargetLeaves(
        ts.isSpreadElement(element) ? element.expression : element,
      );
    });
  }
  if (ts.isObjectLiteralExpression(current)) {
    return current.properties.flatMap((property) => {
      if (ts.isShorthandPropertyAssignment(property)) {
        return [property.name];
      }
      if (ts.isPropertyAssignment(property)) {
        return getAssignmentTargetLeaves(property.initializer);
      }
      return ts.isSpreadAssignment(property)
        ? getAssignmentTargetLeaves(property.expression)
        : [];
    });
  }
  if (
    ts.isBinaryExpression(current) &&
    current.operatorToken.kind === ts.SyntaxKind.EqualsToken
  ) {
    return getAssignmentTargetLeaves(current.left);
  }
  return [current];
}

function assignmentTargetHasAccessPathRoot(
  target: ts.Expression,
  rootPath: readonly string[],
): boolean {
  return getAssignmentTargetLeaves(target).some((leaf) =>
    expressionHasAccessPathRoot(leaf, rootPath),
  );
}

function assignmentTargetContainsIdentifier(
  target: ts.Expression,
  identifier: string,
): boolean {
  return getAssignmentTargetLeaves(target).some(
    (leaf) => ts.isIdentifier(leaf) && leaf.text === identifier,
  );
}

function isWordPressLintPluginRequire(expression: ts.Expression): boolean {
  const current = unwrapExpression(expression);
  if (
    !ts.isCallExpression(current) ||
    !ts.isIdentifier(current.expression) ||
    current.expression.text !== 'require' ||
    current.arguments.length !== 1
  ) {
    return false;
  }
  const moduleSpecifier = unwrapExpression(current.arguments[0]);
  return (
    ts.isStringLiteral(moduleSpecifier) &&
    moduleSpecifier.text === '@wp-typia/ttsc-lint-plugin-wp'
  );
}

function getWordPressLintConfigBindings(
  sourceFile: ts.SourceFile,
  moduleFormat: TtscLintConfigModuleFormat,
): WordPressLintConfigBindings {
  const commonJsRequireAvailable =
    moduleFormat !== 'module' &&
    !sourceFileHasTopLevelBinding(sourceFile, 'require') &&
    !sourceFile.statements.some((statement) =>
      nodeReassignsIdentifier(statement, 'require'),
    );
  const bindings: WordPressLintConfigBindings = {
    declarationEnds: new Map<string, number>(),
    defaults: new Set<string>(),
    named: new Set<string>(),
    namespaces: new Set<string>(),
  };
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          !declaration.initializer ||
          !commonJsRequireAvailable ||
          !isWordPressLintPluginRequire(declaration.initializer)
        ) {
          continue;
        }
        if (ts.isIdentifier(declaration.name)) {
          bindings.namespaces.add(declaration.name.text);
          bindings.declarationEnds.set(declaration.name.text, declaration.end);
          continue;
        }
        if (!ts.isObjectBindingPattern(declaration.name)) {
          continue;
        }
        for (const element of declaration.name.elements) {
          if (!ts.isIdentifier(element.name) || element.dotDotDotToken) {
            continue;
          }
          const importedName = element.propertyName
            ? getPropertyName(element.propertyName)
            : element.name.text;
          if (importedName === 'configs') {
            bindings.named.add(element.name.text);
            bindings.declarationEnds.set(element.name.text, declaration.end);
          }
        }
      }
      continue;
    }
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== '@wp-typia/ttsc-lint-plugin-wp'
    ) {
      continue;
    }
    const importClause = statement.importClause;
    if (!importClause || importClause.isTypeOnly) {
      continue;
    }
    if (importClause.name) {
      bindings.defaults.add(importClause.name.text);
      bindings.declarationEnds.set(
        importClause.name.text,
        Number.NEGATIVE_INFINITY,
      );
    }
    if (!importClause.namedBindings) {
      continue;
    }
    if (ts.isNamespaceImport(importClause.namedBindings)) {
      bindings.namespaces.add(importClause.namedBindings.name.text);
      bindings.declarationEnds.set(
        importClause.namedBindings.name.text,
        Number.NEGATIVE_INFINITY,
      );
      continue;
    }
    for (const element of importClause.namedBindings.elements) {
      if (!element.isTypeOnly) {
        const importedName = (element.propertyName ?? element.name).text;
        if (importedName === 'configs') {
          bindings.named.add(element.name.text);
          bindings.declarationEnds.set(
            element.name.text,
            Number.NEGATIVE_INFINITY,
          );
        } else if (importedName === 'default') {
          bindings.defaults.add(element.name.text);
          bindings.declarationEnds.set(
            element.name.text,
            Number.NEGATIVE_INFINITY,
          );
        }
      }
    }
  }
  for (const binding of bindings.defaults) {
    if (sourceMutatesTrackedIdentifier(sourceFile, binding)) {
      bindings.defaults.delete(binding);
    }
  }
  for (const binding of bindings.named) {
    if (sourceMutatesTrackedIdentifier(sourceFile, binding)) {
      bindings.named.delete(binding);
    }
  }
  for (const binding of bindings.namespaces) {
    if (sourceMutatesTrackedIdentifier(sourceFile, binding)) {
      bindings.namespaces.delete(binding);
    }
  }
  return bindings;
}

function isWordPressConfigPath(
  expression: ts.Expression,
  bindings: WordPressLintConfigBindings,
  suffix: readonly string[],
): boolean {
  const path = getPropertyAccessPath(expression);
  if (!path) {
    return false;
  }
  const binding = path[0];
  if (
    binding === undefined ||
    (bindings.declarationEnds.get(binding) ?? Number.POSITIVE_INFINITY) >=
      expression.getStart()
  ) {
    return false;
  }
  return (
    (path.length === suffix.length + 1 &&
      bindings.named.has(path[0] ?? '') &&
      suffix.every((segment, index) => path[index + 1] === segment)) ||
    (path.length === suffix.length + 2 &&
      bindings.namespaces.has(path[0] ?? '') &&
      path[1] === 'configs' &&
      suffix.every((segment, index) => path[index + 2] === segment))
  );
}

function isDeferredScope(node: ts.Node): boolean {
  if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    let parent = node.parent;
    while (parent && isWrapperExpression(parent)) {
      parent = parent.parent;
    }
    const isDirectCallArgument =
      parent &&
      (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
      parent.arguments?.some((argument) => {
        const expression = ts.isSpreadElement(argument)
          ? argument.expression
          : argument;
        return unwrapExpression(expression) === node;
      });
    return !(
      parent &&
      (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
      (unwrapExpression(parent.expression) === node || isDirectCallArgument)
    );
  }
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node) ||
    ts.isModuleDeclaration(node)
  );
}

function statementMutatesAccessPath(
  statement: ts.Node,
  rootPath: readonly string[],
  ignoredAssignments?: ReadonlySet<ts.BinaryExpression>,
): boolean {
  let mutated = false;
  const visit = (node: ts.Node): void => {
    if (mutated || isDeferredScope(node)) {
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      !ignoredAssignments?.has(node) &&
      assignmentTargetHasAccessPathRoot(node.left, rootPath)
    ) {
      mutated = true;
      return;
    }
    let mutatingUnary: ts.Expression | null = null;
    if (ts.isDeleteExpression(node)) {
      mutatingUnary = node.expression;
    } else if (
      (ts.isPostfixUnaryExpression(node) ||
        ts.isPrefixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      mutatingUnary = node.operand;
    }
    if (
      mutatingUnary &&
      expressionHasAccessPathRoot(mutatingUnary, rootPath)
    ) {
      mutated = true;
      return;
    }
    if (ts.isCallExpression(node)) {
      const assignsToIdentifier =
        getPropertyAccessPath(node.expression)?.join('.') ===
          'Object.assign' &&
        node.arguments.length > 0 &&
        expressionHasAccessPathRoot(node.arguments[0], rootPath);
      // Static validation cannot prove arbitrary project-owned methods pure,
      // so any call rooted at the exported config fails closed.
      const callsIdentifierMethod =
        (ts.isPropertyAccessExpression(node.expression) ||
          ts.isElementAccessExpression(node.expression)) &&
        expressionHasAccessPathRoot(node.expression.expression, rootPath);
      const passesAccessToCall = node.arguments.some((argument) =>
        expressionHasAccessPathRoot(
          ts.isSpreadElement(argument) ? argument.expression : argument,
          rootPath,
        ),
      );
      if (assignsToIdentifier || callsIdentifierMethod || passesAccessToCall) {
        mutated = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(statement);
  return mutated;
}

function statementMutatesIdentifier(
  statement: ts.Node,
  identifier: string,
  ignoredAssignments?: ReadonlySet<ts.BinaryExpression>,
): boolean {
  return statementMutatesAccessPath(
    statement,
    [identifier],
    ignoredAssignments,
  );
}

function collectBindingIdentifiers(
  name: ts.BindingName,
  identifiers: Set<string>,
): void {
  if (ts.isIdentifier(name)) {
    identifiers.add(name.text);
    return;
  }
  if (ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (!ts.isOmittedExpression(element)) {
        collectBindingIdentifiers(element.name, identifiers);
      }
    }
    return;
  }
  if (ts.isObjectBindingPattern(name)) {
    for (const element of name.elements) {
      collectBindingIdentifiers(element.name, identifiers);
    }
  }
}

function expressionUsesTrackedAccess(
  expression: ts.Expression,
  identifiers: ReadonlySet<string>,
): boolean {
  const current = unwrapExpression(expression);
  for (const identifier of identifiers) {
    if (expressionHasAccessPathRoot(current, [identifier])) {
      return true;
    }
  }
  if (ts.isObjectLiteralExpression(current)) {
    return current.properties.some((property) => {
      if (ts.isPropertyAssignment(property)) {
        return expressionUsesTrackedAccess(property.initializer, identifiers);
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        return identifiers.has(property.name.text);
      }
      return (
        ts.isSpreadAssignment(property) &&
        expressionUsesTrackedAccess(property.expression, identifiers)
      );
    });
  }
  if (ts.isArrayLiteralExpression(current)) {
    return current.elements.some(
      (element) =>
        !ts.isOmittedExpression(element) &&
        expressionUsesTrackedAccess(
          ts.isSpreadElement(element) ? element.expression : element,
          identifiers,
        ),
    );
  }
  if (ts.isConditionalExpression(current)) {
    return (
      expressionUsesTrackedAccess(current.whenTrue, identifiers) ||
      expressionUsesTrackedAccess(current.whenFalse, identifiers)
    );
  }
  if (ts.isBinaryExpression(current)) {
    const operator = current.operatorToken.kind;
    if (
      operator === ts.SyntaxKind.CommaToken ||
      operator === ts.SyntaxKind.EqualsToken
    ) {
      return expressionUsesTrackedAccess(current.right, identifiers);
    }
    if (
      operator !== ts.SyntaxKind.BarBarToken &&
      operator !== ts.SyntaxKind.AmpersandAmpersandToken &&
      operator !== ts.SyntaxKind.QuestionQuestionToken &&
      operator !== ts.SyntaxKind.BarBarEqualsToken &&
      operator !== ts.SyntaxKind.AmpersandAmpersandEqualsToken &&
      operator !== ts.SyntaxKind.QuestionQuestionEqualsToken
    ) {
      return false;
    }
    return (
      expressionUsesTrackedAccess(current.left, identifiers) ||
      expressionUsesTrackedAccess(current.right, identifiers)
    );
  }
  if (ts.isCallExpression(current) || ts.isNewExpression(current)) {
    return current.arguments?.some((argument) =>
      expressionUsesTrackedAccess(
        ts.isSpreadElement(argument) ? argument.expression : argument,
        identifiers,
      ),
    ) ?? false;
  }
  if (ts.isAwaitExpression(current) || ts.isYieldExpression(current)) {
    return Boolean(
      current.expression &&
        expressionUsesTrackedAccess(current.expression, identifiers),
    );
  }
  return false;
}

function nodePassesTrackedAccessToCall(
  node: ts.Node,
  identifiers: ReadonlySet<string>,
): boolean {
  let passesTrackedAccess = false;
  const visit = (current: ts.Node): void => {
    if (passesTrackedAccess || isDeferredScope(current)) {
      return;
    }
    if (
      (ts.isCallExpression(current) || ts.isNewExpression(current)) &&
      current.arguments?.some((argument) =>
        expressionUsesTrackedAccess(
          ts.isSpreadElement(argument) ? argument.expression : argument,
          identifiers,
        ),
      )
    ) {
      passesTrackedAccess = true;
      return;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return passesTrackedAccess;
}

function collectVariableAliases(
  statement: ts.Node,
  identifiers: Set<string>,
): void {
  const visit = (node: ts.Node): void => {
    if (isDeferredScope(node)) {
      return;
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      expressionUsesTrackedAccess(node.initializer, identifiers)
    ) {
      collectBindingIdentifiers(node.name, identifiers);
    }
    ts.forEachChild(node, visit);
  };
  visit(statement);
}

function collectAssignedAliases(
  statement: ts.Node,
  identifiers: Set<string>,
): ReadonlySet<ts.BinaryExpression> {
  const aliasAssignments = new Set<ts.BinaryExpression>();
  const visit = (node: ts.Node): void => {
    if (isDeferredScope(node)) {
      return;
    }
    if (ts.isBinaryExpression(node)) {
      const assignedTarget = unwrapExpression(node.left);
      if (
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        expressionUsesTrackedAccess(node.right, identifiers)
      ) {
        collectAssignmentTargetIdentifiers(assignedTarget, identifiers);
        aliasAssignments.add(node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(statement);
  return aliasAssignments;
}

function collectAssignmentTargetIdentifiers(
  target: ts.Expression,
  identifiers: Set<string>,
): void {
  for (const leaf of getAssignmentTargetLeaves(target)) {
    if (ts.isIdentifier(leaf)) {
      identifiers.add(leaf.text);
    }
  }
}

function sourceMutatesTrackedIdentifier(
  sourceFile: ts.SourceFile,
  identifier: string,
): boolean {
  const trackedIdentifiers = new Set([identifier]);
  for (const statement of sourceFile.statements) {
    collectVariableAliases(statement, trackedIdentifiers);
    const aliasAssignments = collectAssignedAliases(
      statement,
      trackedIdentifiers,
    );
    if (nodePassesTrackedAccessToCall(statement, trackedIdentifiers)) {
      return true;
    }
    for (const trackedIdentifier of trackedIdentifiers) {
      if (
        statementMutatesIdentifier(
          statement,
          trackedIdentifier,
          aliasAssignments,
        )
      ) {
        return true;
      }
    }
  }
  const mutatingHelpers = collectMutatingTopLevelHelpers(
    sourceFile,
    trackedIdentifiers,
  );
  return (
    mutatingHelpers.size > 0 &&
    sourceFile.statements.some((statement) =>
      nodeInvokesTrackedHelper(statement, mutatingHelpers),
    )
  );
}

function nodeMutatesTrackedIdentifiers(
  node: ts.Node,
  identifiers: ReadonlySet<string>,
): boolean {
  const trackedIdentifiers = new Set(identifiers);
  collectVariableAliases(node, trackedIdentifiers);
  const aliasAssignments = collectAssignedAliases(node, trackedIdentifiers);
  return (
    nodePassesTrackedAccessToCall(node, trackedIdentifiers) ||
    [...trackedIdentifiers].some((identifier) =>
      statementMutatesIdentifier(node, identifier, aliasAssignments),
    )
  );
}

interface TopLevelHelperDefinition {
  body: ts.Node;
  parameterNames: ReadonlySet<string>;
}

function getParameterNames(
  parameters: readonly ts.ParameterDeclaration[],
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const parameter of parameters) {
    collectBindingIdentifiers(parameter.name, names);
  }
  return names;
}

function collectTopLevelHelperDefinitions(
  sourceFile: ts.SourceFile,
): ReadonlyMap<string, TopLevelHelperDefinition> {
  const helpers = new Map<string, TopLevelHelperDefinition>();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      if (statement.name && statement.body) {
        helpers.set(statement.name.text, {
          body: statement.body,
          parameterNames: getParameterNames(statement.parameters),
        });
      }
      continue;
    }
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue;
      }
      const initializer = unwrapExpression(declaration.initializer);
      if (ts.isFunctionExpression(initializer)) {
        helpers.set(declaration.name.text, {
          body: initializer.body,
          parameterNames: getParameterNames(initializer.parameters),
        });
      } else if (ts.isArrowFunction(initializer)) {
        helpers.set(declaration.name.text, {
          body: initializer.body,
          parameterNames: getParameterNames(initializer.parameters),
        });
      }
    }
  }
  return helpers;
}

interface TopLevelHelperAnalysis {
  definitions: ReadonlyMap<string, TopLevelHelperDefinition>;
  dependents: ReadonlyMap<string, ReadonlySet<string>>;
}

const topLevelHelperAnalysisCache = new WeakMap<
  ts.SourceFile,
  TopLevelHelperAnalysis
>();

function collectInvokedHelperNames(node: ts.Node): ReadonlySet<string> {
  const helperNames = new Set<string>();
  const visit = (current: ts.Node): void => {
    if (isDeferredScope(current)) {
      return;
    }
    if (ts.isCallExpression(current) || ts.isNewExpression(current)) {
      const callee = unwrapExpression(current.expression);
      if (ts.isIdentifier(callee)) {
        helperNames.add(callee.text);
      }
      if (ts.isPropertyAccessExpression(callee)) {
        const calleePath = getPropertyAccessPath(callee);
        if (callee.name.text !== 'apply' && callee.name.text !== 'call') {
          if (calleePath) {
            helperNames.add(calleePath.join('.'));
          }
        } else {
          // These names are later intersected with declarations proven to be
          // top-level function helpers. A helper that replaces its intrinsic
          // call/apply method is deliberately handled conservatively.
          const target = unwrapExpression(callee.expression);
          if (ts.isIdentifier(target)) {
            helperNames.add(target.text);
          } else {
            const targetPath = getPropertyAccessPath(target);
            if (targetPath) {
              helperNames.add(targetPath.join('.'));
            }
          }
        }
      }
      // A callback handed to project-owned code may execute immediately or
      // retain a reference that mutates the managed contributor later. Treat
      // known top-level helper arguments as invoked so validation fails closed.
      for (const argument of current.arguments ?? []) {
        const callback = unwrapExpression(
          ts.isSpreadElement(argument) ? argument.expression : argument,
        );
        if (ts.isIdentifier(callback)) {
          helperNames.add(callback.text);
        } else {
          const callbackPath = getPropertyAccessPath(callback);
          if (callbackPath) {
            helperNames.add(callbackPath.join('.'));
          }
        }
      }
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return helperNames;
}

function nodeInvokesTrackedHelper(
  node: ts.Node,
  helperNames: ReadonlySet<string>,
): boolean {
  return [...collectInvokedHelperNames(node)].some((name) =>
    helperNames.has(name),
  );
}

function addHelperDependency(
  dependencies: Map<string, Set<string>>,
  sourceName: string,
  dependentName: string,
): void {
  const dependents = dependencies.get(sourceName) ?? new Set<string>();
  dependents.add(dependentName);
  dependencies.set(sourceName, dependents);
}

function findEffectiveObjectLiteralElement(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.ObjectLiteralElementLike | null {
  let result: ts.ObjectLiteralElementLike | null = null;
  for (const property of objectLiteral.properties) {
    if (ts.isSpreadAssignment(property)) {
      // A dynamic spread can overwrite any earlier property. Fail closed until
      // a later explicit assignment makes the effective value knowable again.
      result = null;
    } else if (getObjectLiteralElementName(property) === propertyName) {
      result = property;
    }
  }
  return result;
}

function getObjectLiteralAliasSource(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.Expression | null {
  const property = findEffectiveObjectLiteralElement(
    objectLiteral,
    propertyName,
  );
  if (property && ts.isPropertyAssignment(property)) {
    return property.initializer;
  }
  return property && ts.isShorthandPropertyAssignment(property)
    ? property.name
    : null;
}

function addHelperAliasDependency(
  dependencies: Map<string, Set<string>>,
  target: string | ts.Node,
  source: ts.Expression,
): void {
  const initializer = unwrapExpression(source);
  const targetName =
    typeof target === 'string'
      ? target
      : ts.isIdentifier(target)
        ? target.text
        : null;
  if (targetName && ts.isIdentifier(initializer)) {
    addHelperDependency(dependencies, initializer.text, targetName);
    return;
  }
  if (targetName && ts.isObjectLiteralExpression(initializer)) {
    for (const property of initializer.properties) {
      const propertyName = getObjectLiteralElementName(property);
      const propertySource = propertyName
        ? getObjectLiteralAliasSource(initializer, propertyName)
        : null;
      if (propertyName && propertySource) {
        addHelperAliasDependency(
          dependencies,
          `${targetName}.${propertyName}`,
          propertySource,
        );
      }
    }
    return;
  }
  if (
    typeof target !== 'string' &&
    ts.isArrayBindingPattern(target) &&
    ts.isArrayLiteralExpression(initializer)
  ) {
    for (let index = 0; index < target.elements.length; index += 1) {
      const targetElement = target.elements[index];
      const sourceElement = initializer.elements[index];
      if (!targetElement || ts.isOmittedExpression(targetElement)) {
        continue;
      }
      if (
        targetElement.dotDotDotToken ||
        (sourceElement && ts.isSpreadElement(sourceElement))
      ) {
        break;
      }
      if (sourceElement && !ts.isOmittedExpression(sourceElement)) {
        addHelperAliasDependency(
          dependencies,
          targetElement.name,
          sourceElement,
        );
      }
      if (targetElement.initializer) {
        addHelperAliasDependency(
          dependencies,
          targetElement.name,
          targetElement.initializer,
        );
      }
    }
    return;
  }
  if (
    typeof target !== 'string' &&
    ts.isObjectBindingPattern(target) &&
    ts.isObjectLiteralExpression(initializer)
  ) {
    for (const targetElement of target.elements) {
      if (targetElement.dotDotDotToken) {
        continue;
      }
      let propertyName: string | null = null;
      if (targetElement.propertyName) {
        propertyName = getPropertyName(targetElement.propertyName);
      } else if (ts.isIdentifier(targetElement.name)) {
        propertyName = targetElement.name.text;
      }
      const sourceElement = propertyName
        ? getObjectLiteralAliasSource(initializer, propertyName)
        : null;
      if (sourceElement) {
        addHelperAliasDependency(
          dependencies,
          targetElement.name,
          sourceElement,
        );
      }
      if (targetElement.initializer) {
        addHelperAliasDependency(
          dependencies,
          targetElement.name,
          targetElement.initializer,
        );
      }
    }
  }
}

function getTopLevelHelperAnalysis(
  sourceFile: ts.SourceFile,
): TopLevelHelperAnalysis {
  const cached = topLevelHelperAnalysisCache.get(sourceFile);
  if (cached) {
    return cached;
  }
  const definitions = collectTopLevelHelperDefinitions(sourceFile);
  const dependents = new Map<string, Set<string>>();
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (declaration.initializer) {
          addHelperAliasDependency(
            dependents,
            declaration.name,
            declaration.initializer,
          );
        }
      }
    } else if (
      ts.isExpressionStatement(statement) &&
      ts.isBinaryExpression(statement.expression) &&
      statement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      addHelperAliasDependency(
        dependents,
        statement.expression.left,
        statement.expression.right,
      );
    }
  }
  for (const [name, definition] of definitions) {
    for (const invokedName of collectInvokedHelperNames(definition.body)) {
      addHelperDependency(dependents, invokedName, name);
    }
  }
  const analysis = {
    definitions,
    dependents,
  } satisfies TopLevelHelperAnalysis;
  topLevelHelperAnalysisCache.set(sourceFile, analysis);
  return analysis;
}

function collectMutatingTopLevelHelpers(
  sourceFile: ts.SourceFile,
  trackedIdentifiers: ReadonlySet<string>,
): ReadonlySet<string> {
  const { definitions, dependents } = getTopLevelHelperAnalysis(sourceFile);
  const mutatingHelpers = new Set<string>();
  for (const [name, definition] of definitions) {
    const visibleTrackedIdentifiers = new Set(trackedIdentifiers);
    for (const parameterName of definition.parameterNames) {
      visibleTrackedIdentifiers.delete(parameterName);
    }
    if (
      nodeMutatesTrackedIdentifiers(definition.body, visibleTrackedIdentifiers)
    ) {
      mutatingHelpers.add(name);
    }
  }

  expandHelperDependents(mutatingHelpers, dependents);
  return mutatingHelpers;
}

function expandHelperDependents(
  helperNames: Set<string>,
  dependents: ReadonlyMap<string, ReadonlySet<string>>,
): void {
  const worklist = [...helperNames];
  for (let index = 0; index < worklist.length; index += 1) {
    const current = worklist[index];
    if (current === undefined) {
      continue;
    }
    for (const dependent of dependents.get(current) ?? []) {
      if (!helperNames.has(dependent)) {
        helperNames.add(dependent);
        worklist.push(dependent);
      }
    }
  }
}

function resolveObjectLiteral(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
): ts.ObjectLiteralExpression | null {
  const current = unwrapExpression(expression);
  if (ts.isObjectLiteralExpression(current)) {
    return current;
  }
  if (!ts.isIdentifier(current)) {
    return null;
  }
  const referencePosition = current.getStart(sourceFile);
  let declarationIndex = -1;
  let resolvedInitializer: ts.Expression | null = null;
  for (
    let statementIndex = 0;
    statementIndex < sourceFile.statements.length;
    statementIndex += 1
  ) {
    const statement = sourceFile.statements[statementIndex];
    if (statement.getStart(sourceFile) >= referencePosition) {
      break;
    }
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === current.text &&
        declaration.initializer
      ) {
        // Top-level `var` redeclarations are valid JavaScript. Retain the last
        // initializer before the export because that is the runtime value;
        // stopping at the first declaration would trust a stale config.
        declarationIndex = statementIndex;
        resolvedInitializer = unwrapExpression(declaration.initializer);
      }
    }
  }
  if (
    declarationIndex === -1 ||
    !resolvedInitializer ||
    !ts.isObjectLiteralExpression(resolvedInitializer)
  ) {
    return null;
  }
  const trackedIdentifiers = new Set([current.text]);
  const laterStatements = sourceFile.statements.slice(declarationIndex + 1);
  for (const laterStatement of laterStatements) {
    collectVariableAliases(laterStatement, trackedIdentifiers);
    const aliasAssignments = collectAssignedAliases(
      laterStatement,
      trackedIdentifiers,
    );
    if (nodePassesTrackedAccessToCall(laterStatement, trackedIdentifiers)) {
      return null;
    }
    for (const identifier of trackedIdentifiers) {
      if (
        statementMutatesIdentifier(laterStatement, identifier, aliasAssignments)
      ) {
        return null;
      }
    }
  }
  const mutatingHelpers = collectMutatingTopLevelHelpers(
    sourceFile,
    trackedIdentifiers,
  );
  if (
    mutatingHelpers.size > 0 &&
    laterStatements.some((statement) =>
      nodeInvokesTrackedHelper(statement, mutatingHelpers),
    )
  ) {
    return null;
  }
  return resolvedInitializer;
}

function getObjectLiteralElementName(
  property: ts.ObjectLiteralElementLike,
): string | null {
  if (
    ts.isPropertyAssignment(property) ||
    ts.isShorthandPropertyAssignment(property) ||
    ts.isMethodDeclaration(property) ||
    ts.isGetAccessorDeclaration(property) ||
    ts.isSetAccessorDeclaration(property)
  ) {
    return getPropertyName(property.name);
  }
  return null;
}

function findEffectiveProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.PropertyAssignment | null {
  const property = findEffectiveObjectLiteralElement(
    objectLiteral,
    propertyName,
  );
  return property && ts.isPropertyAssignment(property) ? property : null;
}

function hasWordPressConfigSpread(
  objectLiteral: ts.ObjectLiteralExpression,
  bindings: WordPressLintConfigBindings,
  suffix: readonly string[],
): boolean {
  return objectLiteral.properties.some(
    (property) =>
      ts.isSpreadAssignment(property) &&
      isWordPressConfigPath(property.expression, bindings, suffix),
  );
}

function isWordPressDefaultPlugin(
  expression: ts.Expression,
  bindings: WordPressLintConfigBindings,
): boolean {
  const path = getPropertyAccessPath(expression);
  const binding = path?.length === 1 ? path[0] : undefined;
  return (
    binding !== undefined &&
    bindings.defaults.has(binding) &&
    (bindings.declarationEnds.get(binding) ?? Number.POSITIVE_INFINITY) <
      expression.getStart()
  );
}

function hasEffectiveWordPressPlugin(
  config: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  bindings: WordPressLintConfigBindings,
): boolean {
  let enabled = false;
  for (const property of config.properties) {
    if (ts.isSpreadAssignment(property)) {
      enabled = isWordPressConfigPath(property.expression, bindings, [
        'recommended',
      ]);
      continue;
    }
    if (getObjectLiteralElementName(property) !== 'plugins') {
      continue;
    }
    if (!ts.isPropertyAssignment(property)) {
      enabled = false;
      continue;
    }
    if (
      isWordPressConfigPath(property.initializer, bindings, [
        'recommended',
        'plugins',
      ])
    ) {
      enabled = true;
      continue;
    }
    const plugins = resolveObjectLiteral(property.initializer, sourceFile);
    enabled = Boolean(
      plugins &&
        plugins.properties.reduce((current, pluginProperty) => {
          if (ts.isSpreadAssignment(pluginProperty)) {
            // A later dynamic spread may overwrite the wordpress key. Keep
            // validation fail-closed instead of preserving an earlier match.
            return isWordPressConfigPath(
              pluginProperty.expression,
              bindings,
              ['recommended', 'plugins'],
            );
          }
          // An explicit wordpress key replaces the contributor supplied by
          // the recommended preset unless it retains the known contributor.
          if (getObjectLiteralElementName(pluginProperty) !== 'wordpress') {
            return current;
          }
          if (ts.isShorthandPropertyAssignment(pluginProperty)) {
            return bindings.defaults.has(pluginProperty.name.text);
          }
          return (
            ts.isPropertyAssignment(pluginProperty) &&
            (isWordPressDefaultPlugin(
              pluginProperty.initializer,
              bindings,
            ) ||
              isWordPressConfigPath(pluginProperty.initializer, bindings, [
                'recommended',
                'plugins',
                'wordpress',
              ]))
          );
        }, false),
    );
  }
  return enabled;
}

function hasExpectedTextDomainRule(
  rule: ts.PropertyAssignment,
  expectedTextDomain: string,
): boolean {
  const ruleValue = unwrapExpression(rule.initializer);
  if (
    !ts.isArrayLiteralExpression(ruleValue) ||
    ruleValue.elements.length < 2
  ) {
    return false;
  }
  if (!hasEnabledRuleSeverity(ruleValue)) {
    return false;
  }
  const options = unwrapExpression(ruleValue.elements[1]);
  if (!ts.isObjectLiteralExpression(options)) {
    return false;
  }
  const allowedTextDomain = findEffectiveProperty(options, 'allowedTextDomain');
  if (!allowedTextDomain) {
    return false;
  }
  const value = unwrapExpression(allowedTextDomain.initializer);
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
    return value.text === expectedTextDomain;
  }
  if (!ts.isArrayLiteralExpression(value) || value.elements.length === 0) {
    return false;
  }
  const domains = value.elements.map((element) => {
    const domain = unwrapExpression(element);
    return ts.isStringLiteral(domain) ||
      ts.isNoSubstitutionTemplateLiteral(domain)
      ? domain.text
      : null;
  });
  return (
    domains.every((domain): domain is string => domain !== null) &&
    domains.includes(expectedTextDomain)
  );
}

function hasEnabledRuleSeverity(expression: ts.Expression): boolean {
  const ruleValue = unwrapExpression(expression);
  const severity = ts.isArrayLiteralExpression(ruleValue)
    ? ruleValue.elements[0]
    : ruleValue;
  if (!severity || ts.isSpreadElement(severity)) {
    return false;
  }
  const current = unwrapExpression(severity);
  return (
    ((ts.isStringLiteral(current) ||
      ts.isNoSubstitutionTemplateLiteral(current)) &&
      // @ttsc/lint accepts both its canonical "warning" and ESLint's "warn".
      ['error', 'warn', 'warning'].includes(current.text)) ||
    (ts.isNumericLiteral(current) &&
      (current.text === '1' || current.text === '2'))
  );
}

function hasEffectiveRecommendedRule(
  rules: ts.ObjectLiteralExpression,
  bindings: WordPressLintConfigBindings,
  ruleName: string,
): boolean {
  let enabled = false;
  for (const property of rules.properties) {
    if (ts.isSpreadAssignment(property)) {
      enabled = isWordPressConfigPath(property.expression, bindings, [
        'recommended',
        'rules',
      ]);
      continue;
    }
    if (getObjectLiteralElementName(property) !== ruleName) {
      continue;
    }
    enabled =
      ts.isPropertyAssignment(property) &&
      hasEnabledRuleSeverity(property.initializer);
  }
  return enabled;
}

const MANAGED_WORDPRESS_SOURCE_PATHS = [
  'src/index.tsx',
  'src/edit.tsx',
  'src/save.tsx',
  'src/blocks/example/edit.tsx',
] as const;

const MANAGED_SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
]);

const MANAGED_SOURCE_EXCLUDED_DIRECTORIES = new Set([
  'build',
  'dist',
  'node_modules',
]);

function isManagedSourceDirectory(entry: fs.Dirent): boolean {
  return (
    entry.isDirectory() &&
    !entry.isSymbolicLink() &&
    !MANAGED_SOURCE_EXCLUDED_DIRECTORIES.has(entry.name)
  );
}

function getManagedSourcePath(
  projectDir: string,
  entryPath: string,
  entry: fs.Dirent,
): string | null {
  return entry.isFile() &&
    !entry.isSymbolicLink() &&
    !/\.d\.[cm]?ts$/u.test(entry.name) &&
    MANAGED_SOURCE_EXTENSIONS.has(path.extname(entry.name))
    ? path.relative(projectDir, entryPath).split(path.sep).join('/')
    : null;
}

function selectManagedSourcePaths(
  blockSourcePaths: string[],
  sourcePaths: string[],
): string[] {
  if (blockSourcePaths.length > 0) {
    return blockSourcePaths;
  }
  return sourcePaths.length > 0
    ? sourcePaths
    : [...MANAGED_WORDPRESS_SOURCE_PATHS];
}

function collectManagedSourcePaths(
  projectDir: string,
  currentDir: string,
): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const sourcePaths: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);
    if (isManagedSourceDirectory(entry)) {
      sourcePaths.push(...collectManagedSourcePaths(projectDir, entryPath));
      continue;
    }
    const sourcePath = getManagedSourcePath(projectDir, entryPath, entry);
    if (sourcePath !== null) {
      sourcePaths.push(sourcePath);
    }
  }
  return sourcePaths;
}

async function collectManagedSourcePathsAsync(
  projectDir: string,
  currentDir: string,
): Promise<string[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const sourcePathGroups = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const entryPath = path.join(currentDir, entry.name);
      if (isManagedSourceDirectory(entry)) {
        return collectManagedSourcePathsAsync(projectDir, entryPath);
      }
      const sourcePath = getManagedSourcePath(projectDir, entryPath, entry);
      return sourcePath === null ? [] : [sourcePath];
    }),
  );
  return sourcePathGroups.flat();
}

/** Discover actual WordPress source files used to validate lint exclusions. */
export function findManagedWordPressSourcePaths(projectDir: string): string[] {
  const sourceRoot = path.join(projectDir, 'src');
  const blocksRoot = path.join(sourceRoot, 'blocks');
  let blockDirectories: string[] = [];
  try {
    blockDirectories = fs
      .readdirSync(blocksRoot, { withFileTypes: true })
      .filter(isManagedSourceDirectory)
      .map((entry) => path.join(blocksRoot, entry.name));
  } catch {
    // Standalone blocks and variation scaffolds do not have src/blocks.
  }
  const blockSourcePaths = blockDirectories.flatMap((blockDir) =>
    collectManagedSourcePaths(projectDir, blockDir),
  );
  return selectManagedSourcePaths(
    blockSourcePaths,
    blockSourcePaths.length === 0
      ? collectManagedSourcePaths(projectDir, sourceRoot)
      : [],
  );
}

/** Asynchronously discover source files for workspace doctor validation. */
export async function findManagedWordPressSourcePathsAsync(
  projectDir: string,
): Promise<string[]> {
  const sourceRoot = path.join(projectDir, 'src');
  const blocksRoot = path.join(sourceRoot, 'blocks');
  let blockDirectories: string[] = [];
  try {
    blockDirectories = (await fs.promises.readdir(blocksRoot, {
      withFileTypes: true,
    }))
      .filter(isManagedSourceDirectory)
      .map((entry) => path.join(blocksRoot, entry.name));
  } catch {
    // Standalone blocks and variation scaffolds do not have src/blocks.
  }
  const blockSourcePaths = (
    await Promise.all(
      blockDirectories.map((blockDir) =>
        collectManagedSourcePathsAsync(projectDir, blockDir),
      ),
    )
  ).flat();
  return selectManagedSourcePaths(
    blockSourcePaths,
    blockSourcePaths.length === 0
      ? await collectManagedSourcePathsAsync(projectDir, sourceRoot)
      : [],
  );
}

function getStaticStringArray(expression: ts.Expression): string[] | null {
  const current = unwrapExpression(expression);
  if (!ts.isArrayLiteralExpression(current)) {
    return null;
  }
  const values: string[] = [];
  for (const element of current.elements) {
    if (ts.isSpreadElement(element)) {
      return null;
    }
    const value = getStaticStringValue(element);
    if (value === null) {
      return null;
    }
    values.push(value);
  }
  return values;
}

function ignorePatternMatchesSource(
  sourcePath: string,
  pattern: string,
): boolean | null {
  const negationPrefix = pattern.startsWith('!') ? '!' : '';
  const normalized = pattern
    .slice(negationPrefix.length)
    .replace(/^\.\//u, '')
    .replace(/\/$/u, '');
  if (normalized.length === 0) {
    return null;
  }
  if (normalized === 'src') {
    return sourcePath.startsWith('src/');
  }
  try {
    return path.posix.matchesGlob(sourcePath, normalized);
  } catch {
    return null;
  }
}

function hasUsableManagedSourceTree(
  config: ts.ObjectLiteralExpression,
  bindings: WordPressLintConfigBindings,
  managedSourcePaths: readonly string[],
): boolean {
  let ignorePatterns: string[] = [];
  let ignorePatternsKnown = true;
  for (const property of config.properties) {
    if (ts.isSpreadAssignment(property)) {
      if (
        !isWordPressConfigPath(property.expression, bindings, ['recommended'])
      ) {
        ignorePatternsKnown = false;
      }
      continue;
    }
    if (getObjectLiteralElementName(property) !== 'ignores') {
      continue;
    }
    const staticPatterns = ts.isPropertyAssignment(property)
      ? getStaticStringArray(property.initializer)
      : null;
    // Object-literal assignment order is authoritative: an explicit `ignores`
    // safely replaces an unknown value from any earlier spread.
    ignorePatternsKnown = staticPatterns !== null;
    ignorePatterns = staticPatterns ?? [];
  }
  if (!ignorePatternsKnown) {
    return false;
  }
  const ignored = new Map(
    managedSourcePaths.map((sourcePath) => [sourcePath, false]),
  );
  for (const pattern of ignorePatterns) {
    const negated = pattern.startsWith('!');
    for (const sourcePath of managedSourcePaths) {
      const matches = ignorePatternMatchesSource(sourcePath, pattern);
      if (matches === null) {
        return false;
      }
      if (matches) {
        ignored.set(sourcePath, !negated);
      }
    }
  }
  return ![...ignored.values()].every(Boolean);
}

interface CommonJsExportAssignment {
  exportPath: string[];
  value: ts.Expression;
}

function getAssignmentChainValue(expression: ts.Expression): ts.Expression {
  let current = unwrapExpression(expression);
  while (
    ts.isBinaryExpression(current) &&
    current.operatorToken.kind === ts.SyntaxKind.EqualsToken
  ) {
    current = unwrapExpression(current.right);
  }
  return current;
}

function findCommonJsExportAssignment(
  expression: ts.Expression,
): CommonJsExportAssignment | null {
  const current = unwrapExpression(expression);
  if (
    !ts.isBinaryExpression(current) ||
    current.operatorToken.kind !== ts.SyntaxKind.EqualsToken
  ) {
    return null;
  }
  const exportPath = getPropertyAccessPath(current.left);
  const joinedExportPath = exportPath?.join('.') ?? null;
  if (
    exportPath &&
    (joinedExportPath === 'module.exports' ||
      joinedExportPath === 'exports.default')
  ) {
    return {
      exportPath,
      value: getAssignmentChainValue(current.right),
    };
  }
  return findCommonJsExportAssignment(current.right);
}

function expressionUsesCommonJsExport(
  expression: ts.Expression,
  exportPath: readonly string[],
  aliases: ReadonlySet<string>,
): boolean {
  return (
    expressionHasAccessPathRoot(expression, exportPath) ||
    expressionUsesTrackedAccess(expression, aliases)
  );
}

function collectCommonJsExportAliases(
  statement: ts.Node,
  exportPath: readonly string[],
  aliases: Set<string>,
): ReadonlySet<ts.BinaryExpression> {
  const aliasAssignments = new Set<ts.BinaryExpression>();
  const visit = (node: ts.Node): void => {
    if (isDeferredScope(node)) {
      return;
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      expressionUsesCommonJsExport(node.initializer, exportPath, aliases)
    ) {
      collectBindingIdentifiers(node.name, aliases);
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const assignedTarget = unwrapExpression(node.left);
      if (
        ts.isIdentifier(assignedTarget) &&
        expressionUsesCommonJsExport(node.right, exportPath, aliases)
      ) {
        aliases.add(assignedTarget.text);
        aliasAssignments.add(node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(statement);
  return aliasAssignments;
}

function findConfigExportExpression(
  sourceFile: ts.SourceFile,
  moduleFormat: TtscLintConfigModuleFormat,
): ts.Expression | null {
  let commonJsExportPath: string[] | null = null;
  const exportsAliasDetached = sourceFile.statements.some((statement) =>
    statementDetachesCommonJsBinding(statement, 'exports'),
  );
  const moduleBindingDetached = sourceFile.statements.some((statement) =>
    statementDetachesCommonJsBinding(statement, 'module'),
  );
  const commonJsExportAliases = new Set<string>();
  let commonJsExportStatementIndex = -1;
  let result: ts.Expression | null = null;
  for (
    let statementIndex = 0;
    statementIndex < sourceFile.statements.length;
    statementIndex += 1
  ) {
    const statement = sourceFile.statements[statementIndex];
    if (ts.isExportAssignment(statement)) {
      if (
        result ||
        moduleFormat === 'commonjs' ||
        (moduleFormat === 'module' && statement.isExportEquals)
      ) {
        return null;
      }
      result = statement.expression;
      continue;
    }
    if (commonJsExportPath) {
      const aliasAssignments = collectCommonJsExportAliases(
        statement,
        commonJsExportPath,
        commonJsExportAliases,
      );
      if (
        statementMutatesAccessPath(statement, commonJsExportPath) ||
        [...commonJsExportAliases].some((alias) =>
          statementMutatesIdentifier(statement, alias, aliasAssignments),
        )
      ) {
        return null;
      }
    }
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isBinaryExpression(statement.expression) ||
      statement.expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken
    ) {
      continue;
    }
    const commonJsExport = findCommonJsExportAssignment(statement.expression);
    if (commonJsExport) {
      const joinedExportPath = commonJsExport.exportPath.join('.');
      if (
        moduleFormat === 'module' ||
        (joinedExportPath === 'module.exports' && moduleBindingDetached) ||
        (joinedExportPath === 'exports.default' && exportsAliasDetached)
      ) {
        return null;
      }
      if (result) {
        return null;
      }
      result = commonJsExport.value;
      commonJsExportPath = commonJsExport.exportPath;
      commonJsExportStatementIndex = statementIndex;
      continue;
    }
  }
  if (commonJsExportAliases.size > 0) {
    const mutatingHelpers = collectMutatingTopLevelHelpers(
      sourceFile,
      commonJsExportAliases,
    );
    if (
      sourceFile.statements
        .slice(commonJsExportStatementIndex + 1)
        .some((statement) =>
          nodeInvokesTrackedHelper(statement, mutatingHelpers),
        )
    ) {
      return null;
    }
  }
  return result;
}

function nodeTerminatesModuleEvaluation(node: ts.Node): boolean {
  let terminates = false;
  const visit = (current: ts.Node): void => {
    if (terminates || isDeferredScope(current)) {
      return;
    }
    if (ts.isThrowStatement(current)) {
      terminates = true;
      return;
    }
    if (ts.isCallExpression(current)) {
      const calleePath = getPropertyAccessPath(current.expression);
      if (calleePath?.join('.') === 'process.exit') {
        terminates = true;
        return;
      }
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return terminates;
}

function nodeReturnsFromModuleScope(node: ts.Node): boolean {
  let returns = false;
  const visit = (current: ts.Node): void => {
    if (
      returns ||
      ts.isFunctionLike(current) ||
      ts.isClassDeclaration(current) ||
      ts.isClassExpression(current) ||
      ts.isModuleDeclaration(current)
    ) {
      return;
    }
    if (ts.isReturnStatement(current)) {
      returns = true;
      return;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return returns;
}

function sourceTerminatesModuleEvaluation(sourceFile: ts.SourceFile): boolean {
  if (
    sourceFile.statements.some(nodeReturnsFromModuleScope) ||
    sourceFile.statements.some(nodeTerminatesModuleEvaluation)
  ) {
    return true;
  }
  const { definitions, dependents } = getTopLevelHelperAnalysis(sourceFile);
  const terminatingHelpers = new Set<string>();
  for (const [name, definition] of definitions) {
    if (nodeTerminatesModuleEvaluation(definition.body)) {
      terminatingHelpers.add(name);
    }
  }
  expandHelperDependents(terminatingHelpers, dependents);
  return sourceFile.statements.some((statement) =>
    nodeInvokesTrackedHelper(statement, terminatingHelpers),
  );
}

/**
 * Check whether a lint config enables the WordPress preset and binds its i18n
 * rule to the expected project text domain.
 *
 * @param source TypeScript or JavaScript lint configuration source.
 * @param expectedTextDomain Project text domain required by the i18n rule.
 * @param configFilename Discovered filename used to enforce its module format.
 * @param packageModuleType Nearest package type used for ambiguous .js files.
 * @param managedSourcePaths Actual source files that must remain lint-visible.
 * @returns Whether the exported config satisfies the managed contract.
 */
export function hasWordPressTtscLintConfigSource(
  source: string,
  expectedTextDomain: string,
  configFilename = 'lint.config.ts',
  packageModuleType: 'commonjs' | 'module' = 'commonjs',
  managedSourcePaths: readonly string[] = MANAGED_WORDPRESS_SOURCE_PATHS,
): boolean {
  let moduleFormat: TtscLintConfigModuleFormat = 'flexible';
  if (configFilename.endsWith('.cjs')) {
    moduleFormat = 'commonjs';
  } else if (
    configFilename.endsWith('.mjs') ||
    configFilename.endsWith('.mts')
  ) {
    moduleFormat = 'module';
  } else if (configFilename.endsWith('.cts')) {
    // TypeScript transforms import/export syntax in .cts files to CommonJS,
    // so both forms remain executable even though raw .cjs cannot parse ESM.
    moduleFormat = 'transpiled-commonjs';
  } else if (configFilename.endsWith('.js')) {
    moduleFormat = packageModuleType;
  }
  const sourceFile = ts.createSourceFile(
    configFilename,
    source,
    ts.ScriptTarget.Latest,
    true,
    /\.(?:cjs|js|mjs)$/u.test(configFilename)
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS,
  );
  const parseDiagnostics = (
    sourceFile as ts.SourceFile & {
      parseDiagnostics?: readonly ts.Diagnostic[];
    }
  ).parseDiagnostics;
  if (parseDiagnostics && parseDiagnostics.length > 0) {
    return false;
  }
  if (sourceTerminatesModuleEvaluation(sourceFile)) {
    return false;
  }
  if (
    moduleFormat === 'commonjs' &&
    sourceFile.statements.some(
      (statement) =>
        ts.isImportDeclaration(statement) ||
        ts.isImportEqualsDeclaration(statement) ||
        ts.isExportAssignment(statement) ||
        ts.isExportDeclaration(statement) ||
        (ts.canHaveModifiers(statement) &&
          ts
            .getModifiers(statement)
            ?.some(
              (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
            )),
    )
  ) {
    return false;
  }
  const exportExpression = findConfigExportExpression(sourceFile, moduleFormat);
  if (!exportExpression) {
    return false;
  }
  const bindings = getWordPressLintConfigBindings(sourceFile, moduleFormat);
  if (
    bindings.defaults.size === 0 &&
    bindings.named.size === 0 &&
    bindings.namespaces.size === 0
  ) {
    return false;
  }
  const config = resolveObjectLiteral(exportExpression, sourceFile);
  if (!config || !hasWordPressConfigSpread(config, bindings, ['recommended'])) {
    return false;
  }
  const rulesProperty = findEffectiveProperty(config, 'rules');
  const rules = rulesProperty
    ? resolveObjectLiteral(rulesProperty.initializer, sourceFile)
    : null;
  const textDomainRule = rules
    ? findEffectiveProperty(rules, 'wordpress/i18n-text-domain')
    : null;
  return Boolean(
    rules &&
      hasEffectiveWordPressPlugin(config, sourceFile, bindings) &&
      hasWordPressConfigSpread(
        rules,
        bindings,
        ['recommended', 'rules'],
      ) &&
      hasEffectiveRecommendedRule(
        rules,
        bindings,
        'wordpress/no-unsafe-wp-apis',
      ) &&
      hasEffectiveRecommendedRule(
        rules,
        bindings,
        'wordpress/valid-sprintf',
      ) &&
      hasUsableManagedSourceTree(config, bindings, managedSourcePaths) &&
      textDomainRule &&
      hasExpectedTextDomainRule(textDomainRule, expectedTextDomain),
  );
}

function normalizeShellToken(token: string): string {
  return token.replace(/^['"]|['"]$/gu, '');
}

function getShellExecutableName(token: string | undefined): string {
  return normalizeShellToken(token ?? '')
    .split(/[\\/]/u)
    .pop()
    ?.replace(/\.(?:cmd|exe)$/u, '') ?? '';
}

function skipShellRunnerOptions(
  tokens: readonly string[],
  startIndex: number,
): number {
  let index = startIndex;
  while (tokens[index]?.startsWith('-')) {
    const option = tokens[index];
    if (option === '--') {
      return index + 1;
    }
    if (
      [
        '--call',
        '--env-file',
        '--import',
        '--loader',
        '--package',
        '--require',
        '-c',
        '-p',
        '-r',
      ].includes(option ?? '')
    ) {
      index += 2;
    } else {
      index += 1;
    }
  }
  return index;
}

const SHELL_RUNNER_TERMINAL_OPTIONS = new Set([
  '--help',
  '--version',
  '-h',
  '-v',
  '-V',
]);

function skipExecutableRunnerOptions(
  tokens: readonly string[],
  startIndex: number,
): number | null {
  const commandIndex = skipShellRunnerOptions(tokens, startIndex);
  return tokens
    .slice(startIndex, commandIndex)
    .some((token) =>
      SHELL_RUNNER_TERMINAL_OPTIONS.has(token.split('=', 1)[0] ?? ''),
    )
    ? null
    : commandIndex;
}

function getTtscCommandIndex(tokens: readonly string[]): number | null {
  let commandIndex = 0;
  const skipRunnerOptions = (): boolean => {
    const nextCommandIndex = skipExecutableRunnerOptions(
      tokens,
      commandIndex + 1,
    );
    if (nextCommandIndex === null) {
      return false;
    }
    commandIndex = nextCommandIndex;
    return true;
  };
  if (tokens[commandIndex] === 'env') {
    commandIndex += 1;
  }
  while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(tokens[commandIndex] ?? '')) {
    commandIndex += 1;
  }

  const command = getShellExecutableName(tokens[commandIndex]);
  if (command === 'ttsc') {
    return commandIndex;
  }
  if (command === 'npx' || command === 'bunx') {
    if (!skipRunnerOptions()) {
      return null;
    }
  } else if (command === 'bun') {
    if (!skipRunnerOptions()) {
      return null;
    }
    if (tokens[commandIndex] !== 'x') {
      return null;
    }
    if (!skipRunnerOptions()) {
      return null;
    }
  } else if (command === 'pnpm' || command === 'yarn') {
    if (!skipRunnerOptions()) {
      return null;
    }
    if (tokens[commandIndex] !== 'exec' && tokens[commandIndex] !== 'dlx') {
      return null;
    }
    if (!skipRunnerOptions()) {
      return null;
    }
  } else if (command === 'npm') {
    if (!skipRunnerOptions()) {
      return null;
    }
    if (tokens[commandIndex] !== 'exec' && tokens[commandIndex] !== 'x') {
      return null;
    }
    if (!skipRunnerOptions()) {
      return null;
    }
  } else {
    return null;
  }
  return getShellExecutableName(tokens[commandIndex]) === 'ttsc'
    ? commandIndex
    : null;
}

interface SimpleShellSegment {
  operatorAfter: '&&' | '||' | '&' | ';' | '|' | null;
  operatorBefore: '&&' | '||' | '&' | ';' | '|' | null;
  source: string;
  tokens: string[];
}

interface SimpleShellParseResult {
  segments: SimpleShellSegment[];
  valid: boolean;
}

function getSimpleShellSegments(command: string): SimpleShellParseResult {
  const segments: SimpleShellSegment[] = [];
  let atTokenBoundary = true;
  let buffer = '';
  let escaped = false;
  let operatorBefore: SimpleShellSegment['operatorBefore'] = null;
  let quote: "'" | '"' | null = null;
  let valid = true;
  const pushSegment = () => {
    const source = buffer.trim();
    const rawTokens =
      buffer.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/gu) ?? [];
    const tokens = rawTokens.map((token) => normalizeShellToken(token));
    if (tokens.length > 0) {
      segments.push({ operatorAfter: null, operatorBefore, source, tokens });
    }
    atTokenBoundary = true;
    buffer = '';
  };

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index] ?? '';
    if (escaped) {
      buffer += character;
      atTokenBoundary = false;
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      const nextCharacter = command[index + 1];
      if (nextCharacter === '\n') {
        index += 1;
        continue;
      }
      if (
        nextCharacter === '\r' &&
        command[index + 2] === '\n'
      ) {
        index += 2;
        continue;
      }
      if (nextCharacter === undefined) {
        buffer += character;
        atTokenBoundary = false;
        valid = false;
        continue;
      }
      buffer += character;
      atTokenBoundary = false;
      escaped = true;
      continue;
    }
    if (quote) {
      buffer += character;
      atTokenBoundary = false;
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      buffer += character;
      atTokenBoundary = false;
      quote = character;
      continue;
    }
    if (character === '#' && atTokenBoundary) {
      const nextLineIndex = command.indexOf('\n', index + 1);
      if (nextLineIndex === -1) {
        break;
      }
      index = nextLineIndex - 1;
      continue;
    }

    const pair = command.slice(index, index + 2);
    if (pair === '&&' || pair === '||') {
      const lengthBefore = segments.length;
      pushSegment();
      if (segments.length === lengthBefore) {
        valid = false;
      }
      const previous = segments[segments.length - 1];
      if (previous && segments.length !== lengthBefore) {
        previous.operatorAfter = pair;
      }
      operatorBefore = pair;
      index += 1;
      continue;
    }
    const isRedirectionAmpersand =
      character === '&' &&
      // Shell fd duplication uses an adjacent >& or <&, while &> redirects
      // both streams. Whitespace before & starts a background operator.
      (command[index - 1] === '>' ||
        command[index - 1] === '<' ||
        command[index + 1] === '>');
    if (isRedirectionAmpersand) {
      buffer += character;
      atTokenBoundary = false;
      continue;
    }
    if (
      character === '&' ||
      character === ';' ||
      character === '|' ||
      character === '\n'
    ) {
      const lengthBefore = segments.length;
      pushSegment();
      const operator = character === '\n' ? ';' : character;
      if (segments.length === lengthBefore) {
        if (character === '\n') {
          if (
            operatorBefore === null ||
            operatorBefore === '&' ||
            operatorBefore === ';'
          ) {
            operatorBefore = ';';
          }
          continue;
        }
        valid = false;
      }
      const previous = segments[segments.length - 1];
      if (previous && segments.length !== lengthBefore) {
        previous.operatorAfter = operator;
      }
      operatorBefore = operator;
      continue;
    }
    buffer += character;
    atTokenBoundary = /\s/u.test(character);
  }
  pushSegment();
  if (quote !== null || escaped) {
    valid = false;
  }
  const trailingOperator = segments[segments.length - 1]?.operatorAfter;
  if (
    trailingOperator === '&&' ||
    trailingOperator === '||' ||
    trailingOperator === '|'
  ) {
    valid = false;
  }
  return { segments, valid };
}

function doesShellSegmentPropagateFailure(
  segments: readonly SimpleShellSegment[],
  segmentIndex: number,
): boolean {
  const segment = segments[segmentIndex];
  if (segment?.operatorBefore === '||' || segment?.operatorBefore === '|') {
    return false;
  }
  if (
    segment?.operatorAfter !== null &&
    segment?.operatorAfter !== '&&' &&
    !(
      segment?.operatorAfter === ';' &&
      segmentIndex === segments.length - 1
    )
  ) {
    return false;
  }
  if (
    segment?.operatorAfter === '&&' &&
    segmentIndex === segments.length - 1
  ) {
    return false;
  }
  const laterSegments = segments.slice(segmentIndex + 1);
  return (
    laterSegments.every(
      (laterSegment) => laterSegment.operatorBefore === '&&',
    ) && segments[segments.length - 1]?.operatorAfter !== '&'
  );
}

function hasPropagatingShellSegment(
  command: string,
  predicate: (tokens: readonly string[]) => boolean,
): boolean {
  const parsed = getSimpleShellSegments(command);
  return parsed.valid && parsed.segments.some(
    (segment, segmentIndex) =>
      !parsed.segments
        .slice(0, segmentIndex)
        .some(isTerminatingShellSegment) &&
      doesShellSegmentPropagateFailure(
        parsed.segments,
        segmentIndex,
      ) &&
      predicate(segment.tokens),
  );
}

function isTerminatingShellSegment(segment: SimpleShellSegment): boolean {
  if (
    segment.operatorBefore === '|' ||
    segment.operatorAfter === '|' ||
    segment.operatorAfter === '&'
  ) {
    return false;
  }
  let commandIndex = 0;
  while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(segment.tokens[commandIndex] ?? '')) {
    commandIndex += 1;
  }
  const command = getShellExecutableName(segment.tokens[commandIndex]);
  return (
    command === 'exit' ||
    (command === 'builtin' &&
      getShellExecutableName(segment.tokens[commandIndex + 1]) === 'exit')
  );
}

function getShellCommandStartIndex(tokens: readonly string[]): number {
  let commandIndex = tokens[0] === 'env' ? 1 : 0;
  while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(tokens[commandIndex] ?? '')) {
    commandIndex += 1;
  }
  return commandIndex;
}

const TTSC_TERMINAL_OPTIONS = new Set([
  '--help',
  '--init',
  '--listfilesonly',
  '--showconfig',
  '--version',
  '--watch',
  '-h',
  '-v',
  '-w',
]);

// Package scripts run from the inspected package root. Requiring implicit
// tsconfig discovery prevents an explicit path from checking another project.
const TTSC_EXPLICIT_PROJECT_OPTIONS = new Set(['--project', '-p']);

interface TypeScriptCommandLineOptionMetadata {
  name: string;
  shortName?: string;
  type: unknown;
}

const TYPESCRIPT_COMMAND_LINE_OPTIONS = (
  ts as typeof ts & {
    optionDeclarations: readonly TypeScriptCommandLineOptionMetadata[];
  }
).optionDeclarations;

const TTSC_OPTIONS_WITH_VALUES = new Set(
  TYPESCRIPT_COMMAND_LINE_OPTIONS.flatMap((option) =>
    option.type === 'boolean'
      ? []
      : [
          `--${option.name.toLowerCase()}`,
          ...(option.shortName ? [`-${option.shortName.toLowerCase()}`] : []),
        ],
  ),
);

function hasPositionalTtscInput(args: readonly string[]): boolean {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? '';
    if (argument === '--') {
      return index < args.length - 1;
    }
    // Redirections belong to the shell rather than the ttsc argument list.
    if (/^(?:\d*(?:>>?|<<?|<>|>&|<&)|&>)\S+$/u.test(argument)) {
      continue;
    }
    if (!argument.startsWith('-')) {
      return true;
    }
    if (argument.includes('=')) {
      continue;
    }
    const optionName = argument.toLowerCase();
    const nextValue = args[index + 1];
    const normalizedNextValue = nextValue?.toLowerCase();
    if (normalizedNextValue === 'true' || normalizedNextValue === 'false') {
      index += 1;
      continue;
    }
    if (TTSC_OPTIONS_WITH_VALUES.has(optionName)) {
      if (!nextValue || nextValue.startsWith('-')) {
        return true;
      }
      index += 1;
    }
  }
  return false;
}

function hasEnabledNoEmitOption(args: readonly string[]): boolean {
  let enabled: boolean | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? '';
    const equalsIndex = argument.indexOf('=');
    const optionName = (
      equalsIndex === -1 ? argument : argument.slice(0, equalsIndex)
    ).toLowerCase();
    if (optionName !== '--noemit') {
      continue;
    }
    if (equalsIndex !== -1) {
      const inlineValue = argument.slice(equalsIndex + 1).toLowerCase();
      if (inlineValue === 'true') {
        enabled = true;
      } else if (inlineValue === 'false') {
        enabled = false;
      } else {
        enabled = null;
      }
      continue;
    }
    const nextValue = args[index + 1]?.toLowerCase();
    if (nextValue === 'true' || nextValue === 'false') {
      enabled = nextValue === 'true';
      index += 1;
    } else {
      enabled = true;
    }
  }
  return enabled === true;
}

/** Check whether a project-owned lint command invokes the managed ttsc lane. */
export function hasTtscNoEmitLintCommand(command: unknown): boolean {
  if (typeof command !== 'string') {
    return false;
  }
  // This intentionally recognizes only simple shell segments and quoted
  // tokens. Subshells and escaped quote sequences fail closed.
  return hasPropagatingShellSegment(command, (tokens) => {
    const commandIndex = getTtscCommandIndex(tokens);
    if (commandIndex === null) {
      return false;
    }
    const commandArgs = tokens.slice(commandIndex + 1);
    const packageManager = getShellExecutableName(
      tokens[getShellCommandStartIndex(tokens)],
    );
    const args =
      packageManager === 'npm' && commandArgs[0] === '--'
        ? commandArgs.slice(1)
        : commandArgs;
    return (
      hasEnabledNoEmitOption(args) &&
      !args.some((argument) =>
        TTSC_EXPLICIT_PROJECT_OPTIONS.has(
          argument.split('=', 1)[0]?.toLowerCase() ?? '',
        ),
      ) &&
      !args.some((argument) =>
        TTSC_TERMINAL_OPTIONS.has(
          argument.split('=', 1)[0]?.toLowerCase() ?? '',
        ),
      ) &&
      !hasPositionalTtscInput(args)
    );
  });
}

const PACKAGE_MANAGER_TERMINAL_OPTIONS = SHELL_RUNNER_TERMINAL_OPTIONS;

const PACKAGE_MANAGER_PROJECT_SCOPE_OPTIONS = new Set([
  '--cwd',
  '--dir',
  '--filter',
  '--include-workspace-root',
  '--prefix',
  '--workspace',
  '--workspaces',
  '-w',
]);

const PACKAGE_MANAGER_ALTERNATE_EXECUTION_OPTIONS = new Set(['--call', '-c']);

function hasNonlocalPackageScriptOption(
  tokens: readonly string[],
  startIndex: number,
  endIndex: number,
): boolean {
  return tokens.slice(startIndex, endIndex).some((token) => {
    const optionName = token.split('=', 1)[0]?.toLowerCase() ?? '';
    return (
      PACKAGE_MANAGER_PROJECT_SCOPE_OPTIONS.has(optionName) ||
      PACKAGE_MANAGER_ALTERNATE_EXECUTION_OPTIONS.has(optionName)
    );
  });
}

function isPackageRunScriptInvocation(
  tokens: readonly string[],
  scriptName: string,
  allowTrailingArguments: boolean,
): boolean {
  let commandIndex = getShellCommandStartIndex(tokens);
  const packageManager = getShellExecutableName(tokens[commandIndex]);
  if (!['bun', 'npm', 'pnpm', 'yarn'].includes(packageManager)) {
    return false;
  }
  const optionsStartIndex = commandIndex + 1;
  commandIndex = skipShellRunnerOptions(tokens, optionsStartIndex);
  if (hasNonlocalPackageScriptOption(tokens, optionsStartIndex, commandIndex)) {
    return false;
  }
  if (
    tokens
      .slice(optionsStartIndex, commandIndex)
      .some((token) =>
        PACKAGE_MANAGER_TERMINAL_OPTIONS.has(token.split('=', 1)[0] ?? ''),
      )
  ) {
    return false;
  }
  if (tokens[commandIndex] === 'run') {
    const runOptionsStartIndex = commandIndex + 1;
    commandIndex = skipShellRunnerOptions(tokens, runOptionsStartIndex);
    if (
      hasNonlocalPackageScriptOption(tokens, runOptionsStartIndex, commandIndex)
    ) {
      return false;
    }
  } else if (packageManager === 'bun' || packageManager === 'npm') {
    return false;
  }
  return (
    tokens[commandIndex] === scriptName &&
    (allowTrailingArguments || commandIndex === tokens.length - 1)
  );
}

/** Check whether any simple shell segment invokes a package script. */
export function hasPackageRunScriptInvocation(
  command: unknown,
  scriptName: string,
): boolean {
  if (typeof command !== 'string') {
    return false;
  }
  const parsed = getSimpleShellSegments(command);
  return (
    parsed.valid &&
    parsed.segments.some((segment) =>
      isPackageRunScriptInvocation(segment.tokens, scriptName, true),
    )
  );
}

/** Remove package-script invocations from a simple failure-propagating chain. */
export function removePackageRunScriptInvocations(
  command: string,
  scriptName: string,
): string | null {
  const parsed = getSimpleShellSegments(command);
  if (
    !parsed.valid ||
    parsed.segments.some(
      (segment) =>
        segment.operatorBefore !== null && segment.operatorBefore !== '&&',
    ) ||
    parsed.segments.some(
      (segment) =>
        segment.operatorAfter !== null && segment.operatorAfter !== '&&',
    )
  ) {
    return null;
  }
  return parsed.segments
    .filter(
      (segment) =>
        !isPackageRunScriptInvocation(segment.tokens, scriptName, true),
    )
    .map((segment) => segment.source)
    .join(' && ');
}

/** Check whether an aggregate command actually runs a package script. */
export function hasPackageRunScriptCommand(
  command: unknown,
  scriptName: string,
): boolean {
  if (typeof command !== 'string') {
    return false;
  }
  return hasPropagatingShellSegment(command, (tokens) =>
    isPackageRunScriptInvocation(tokens, scriptName, false),
  );
}

const NODE_NON_SCRIPT_EXECUTION_OPTIONS = new Set([
  '--check',
  '--completion-bash',
  '--eval',
  '--help',
  '--input-type',
  '--inspect-brk',
  '--inspect-wait',
  '--interactive',
  '--print',
  '--run',
  '--test',
  '--test-only',
  '--v8-options',
  '--version',
  '--watch',
  '--watch-path',
  '--watch-preserve-output',
  '-c',
  '-e',
  '-h',
  '-i',
  '-p',
  '-v',
]);

function isNonScriptNodeExecutionOption(token: string): boolean {
  const equalsIndex = token.indexOf('=');
  const optionName = equalsIndex === -1 ? token : token.slice(0, equalsIndex);
  return NODE_NON_SCRIPT_EXECUTION_OPTIONS.has(optionName);
}

const NODE_STARTUP_BYPASS_OPTIONS = new Set([
  '--experimental-loader',
  '--import',
  '--loader',
  '--require',
  '-r',
]);

function isNodeStartupBypassOption(token: string): boolean {
  return NODE_STARTUP_BYPASS_OPTIONS.has(token.split('=', 1)[0] ?? '');
}

function hasUnsafeNodeOptionsAssignment(
  tokens: readonly string[],
  commandIndex: number,
): boolean {
  return tokens.slice(0, commandIndex).some((token) => {
    const assignment = normalizeShellToken(token);
    if (!assignment.startsWith('NODE_OPTIONS=')) {
      return false;
    }
    const options = normalizeShellToken(
      assignment.slice('NODE_OPTIONS='.length),
    );
    return options.split(/\s+/u).some(
      (option) =>
        isNodeStartupBypassOption(option) ||
        /^--inspect-(?:brk|wait)(?:=\S*)?$/u.test(option),
    );
  });
}

/** Check whether postinstall invokes the managed ttsc lint compatibility file. */
export function hasTtscLintCompatPostinstallCommand(
  command: unknown,
): boolean {
  if (typeof command !== 'string') {
    return false;
  }
  return hasPropagatingShellSegment(command, (tokens) => {
    const commandIndex = getShellCommandStartIndex(tokens);
    if (
      getShellExecutableName(tokens[commandIndex]) !== 'node' ||
      hasUnsafeNodeOptionsAssignment(tokens, commandIndex)
    ) {
      return false;
    }
    const scriptIndex = skipShellRunnerOptions(tokens, commandIndex + 1);
    if (
      tokens
        .slice(commandIndex + 1, scriptIndex)
        .some(
          (token) =>
            isNonScriptNodeExecutionOption(token) ||
            isNodeStartupBypassOption(token),
        )
    ) {
      return false;
    }
    const scriptPath = (tokens[scriptIndex] ?? '')
      .replace(/\\/gu, '/')
      .replace(/^\.\//u, '');
    return scriptPath === 'scripts/apply-ttsc-lint-compat.mjs';
  });
}
