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
        ts.isIdentifier(leftOperand) &&
        leftOperand.text === identifier
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

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
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
    if (importClause?.isTypeOnly || !importClause?.namedBindings) {
      continue;
    }
    if (ts.isNamespaceImport(importClause.namedBindings)) {
      bindings.namespaces.add(importClause.namedBindings.name.text);
      continue;
    }
    for (const element of importClause.namedBindings.elements) {
      if (
        !element.isTypeOnly &&
        (element.propertyName ?? element.name).text === 'configs'
      ) {
        bindings.named.add(element.name.text);
      }
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
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
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
      expressionHasAccessPathRoot(node.left, rootPath)
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
      if (assignsToIdentifier || callsIdentifierMethod) {
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
        ts.isIdentifier(assignedTarget) &&
        expressionUsesTrackedAccess(node.right, identifiers)
      ) {
        identifiers.add(assignedTarget.text);
        aliasAssignments.add(node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(statement);
  return aliasAssignments;
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
      if (
        ts.isPropertyAccessExpression(callee) &&
        (callee.name.text === 'apply' || callee.name.text === 'call')
      ) {
        // These names are later intersected with declarations proven to be
        // top-level function helpers. A helper that replaces its intrinsic
        // call/apply method is deliberately handled conservatively.
        const target = unwrapExpression(callee.expression);
        if (ts.isIdentifier(target)) {
          helperNames.add(target.text);
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
  target: ts.Node,
  source: ts.Expression,
): void {
  const initializer = unwrapExpression(source);
  if (ts.isIdentifier(target) && ts.isIdentifier(initializer)) {
    addHelperDependency(dependencies, initializer.text, target.text);
    return;
  }
  if (
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

  const worklist = [...mutatingHelpers];
  for (let index = 0; index < worklist.length; index += 1) {
    for (const dependent of dependents.get(worklist[index] ?? '') ?? []) {
      if (!mutatingHelpers.has(dependent)) {
        mutatingHelpers.add(dependent);
        worklist.push(dependent);
      }
    }
  }
  return mutatingHelpers;
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
          return (
            ts.isPropertyAssignment(pluginProperty) &&
            isWordPressConfigPath(pluginProperty.initializer, bindings, [
              'recommended',
              'plugins',
              'wordpress',
            ])
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
  const severity = unwrapExpression(ruleValue.elements[0]);
  const enabledSeverity =
    ((ts.isStringLiteral(severity) ||
      ts.isNoSubstitutionTemplateLiteral(severity)) &&
      // @ttsc/lint accepts both its canonical "warning" and ESLint's "warn".
      ['error', 'warn', 'warning'].includes(severity.text)) ||
    (ts.isNumericLiteral(severity) &&
      (severity.text === '1' || severity.text === '2'));
  if (!enabledSeverity) {
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
  let result: ts.Expression | null = null;
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      if (result || moduleFormat === 'commonjs') {
        return null;
      }
      result = statement.expression;
      continue;
    }
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isBinaryExpression(statement.expression) ||
      statement.expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken
    ) {
      if (
        commonJsExportPath &&
        statementMutatesAccessPath(statement, commonJsExportPath)
      ) {
        return null;
      }
      continue;
    }
    const exportPath = getPropertyAccessPath(statement.expression.left);
    const joinedExportPath = exportPath?.join('.') ?? null;
    if (
      joinedExportPath === 'module.exports' ||
      joinedExportPath === 'exports.default'
    ) {
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
      result = statement.expression.right;
      commonJsExportPath = exportPath;
      continue;
    }
    if (
      commonJsExportPath &&
      statementMutatesAccessPath(statement, commonJsExportPath)
    ) {
      return null;
    }
  }
  return result;
}

/**
 * Check whether a lint config enables the WordPress preset and binds its i18n
 * rule to the expected project text domain.
 *
 * @param source TypeScript or JavaScript lint configuration source.
 * @param expectedTextDomain Project text domain required by the i18n rule.
 * @param configFilename Discovered filename used to enforce its module format.
 * @returns Whether the exported config satisfies the managed contract.
 */
export function hasWordPressTtscLintConfigSource(
  source: string,
  expectedTextDomain: string,
  configFilename = 'lint.config.ts',
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
  }
  const sourceFile = ts.createSourceFile(
    configFilename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const parseDiagnostics = (
    sourceFile as ts.SourceFile & {
      parseDiagnostics?: readonly ts.Diagnostic[];
    }
  ).parseDiagnostics;
  if (parseDiagnostics && parseDiagnostics.length > 0) {
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
  const bindings = getWordPressLintConfigBindings(sourceFile, moduleFormat);
  if (bindings.named.size === 0 && bindings.namespaces.size === 0) {
    return false;
  }
  const exportExpression = findConfigExportExpression(sourceFile, moduleFormat);
  const config = exportExpression
    ? resolveObjectLiteral(exportExpression, sourceFile)
    : null;
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

function getTtscCommandIndex(tokens: readonly string[]): number | null {
  let commandIndex = 0;
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
    commandIndex = skipShellRunnerOptions(tokens, commandIndex + 1);
  } else if (command === 'bun') {
    commandIndex = skipShellRunnerOptions(tokens, commandIndex + 1);
    if (tokens[commandIndex] !== 'x') {
      return null;
    }
    commandIndex = skipShellRunnerOptions(tokens, commandIndex + 1);
  } else if (command === 'pnpm' || command === 'yarn') {
    commandIndex = skipShellRunnerOptions(tokens, commandIndex + 1);
    if (tokens[commandIndex] !== 'exec' && tokens[commandIndex] !== 'dlx') {
      return null;
    }
    commandIndex = skipShellRunnerOptions(tokens, commandIndex + 1);
  } else if (command === 'npm') {
    commandIndex = skipShellRunnerOptions(tokens, commandIndex + 1);
    if (tokens[commandIndex] !== 'exec' && tokens[commandIndex] !== 'x') {
      return null;
    }
    commandIndex = skipShellRunnerOptions(tokens, commandIndex + 1);
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
    const rawTokens =
      buffer.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/gu) ?? [];
    const tokens = rawTokens.map((token) => normalizeShellToken(token));
    if (tokens.length > 0) {
      segments.push({ operatorAfter: null, operatorBefore, tokens });
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
      doesShellSegmentPropagateFailure(
        parsed.segments,
        segmentIndex,
      ) &&
      predicate(segment.tokens),
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
  '-h',
  '-v',
]);

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
    const args = tokens.slice(commandIndex + 1);
    return (
      hasEnabledNoEmitOption(args) &&
      !args.some((argument) =>
        TTSC_TERMINAL_OPTIONS.has(
          argument.split('=', 1)[0]?.toLowerCase() ?? '',
        ),
      )
    );
  });
}

const PACKAGE_MANAGER_TERMINAL_OPTIONS = new Set([
  '--help',
  '--version',
  '-h',
  '-v',
  '-V',
]);

/** Check whether an aggregate command actually runs a package script. */
export function hasPackageRunScriptCommand(
  command: unknown,
  scriptName: string,
): boolean {
  if (typeof command !== 'string') {
    return false;
  }
  return hasPropagatingShellSegment(command, (tokens) => {
    let commandIndex = getShellCommandStartIndex(tokens);
    const packageManager = getShellExecutableName(tokens[commandIndex]);
    if (!['bun', 'npm', 'pnpm', 'yarn'].includes(packageManager)) {
      return false;
    }
    const optionsStartIndex = commandIndex + 1;
    commandIndex = skipShellRunnerOptions(tokens, optionsStartIndex);
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
      commandIndex = skipShellRunnerOptions(tokens, commandIndex + 1);
    } else if (packageManager === 'bun' || packageManager === 'npm') {
      return false;
    }
    return tokens[commandIndex] === scriptName;
  });
}

const NODE_NON_SCRIPT_EXECUTION_OPTIONS = new Set([
  '--check',
  '--completion-bash',
  '--eval',
  '--help',
  '--input-type',
  '--interactive',
  '--print',
  '--run',
  '--test',
  '--test-only',
  '--v8-options',
  '--version',
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

/** Check whether postinstall invokes the managed ttsc lint compatibility file. */
export function hasTtscLintCompatPostinstallCommand(
  command: unknown,
): boolean {
  if (typeof command !== 'string') {
    return false;
  }
  return hasPropagatingShellSegment(command, (tokens) => {
    const commandIndex = getShellCommandStartIndex(tokens);
    if (getShellExecutableName(tokens[commandIndex]) !== 'node') {
      return false;
    }
    const scriptIndex = skipShellRunnerOptions(tokens, commandIndex + 1);
    if (
      tokens
        .slice(commandIndex + 1, scriptIndex)
        .some(isNonScriptNodeExecutionOption)
    ) {
      return false;
    }
    const scriptPath = (tokens[scriptIndex] ?? '')
      .replace(/\\/gu, '/')
      .replace(/^\.\//u, '');
    return scriptPath === 'scripts/apply-ttsc-lint-compat.mjs';
  });
}
