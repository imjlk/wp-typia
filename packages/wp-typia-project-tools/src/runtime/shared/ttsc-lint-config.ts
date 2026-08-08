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
  'lint.config.json',
  'ttsc-lint.config.ts',
  'ttsc-lint.config.mts',
  'ttsc-lint.config.cts',
  'ttsc-lint.config.mjs',
  'ttsc-lint.config.cjs',
  'ttsc-lint.config.js',
  'ttsc-lint.config.json',
] as const;

interface WordPressLintConfigBindings {
  named: Set<string>;
  namespaces: Set<string>;
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

function getPropertyName(name: ts.PropertyName): string | null {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  if (
    ts.isComputedPropertyName(name) &&
    ts.isStringLiteral(unwrapExpression(name.expression))
  ) {
    return (unwrapExpression(name.expression) as ts.StringLiteral).text;
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

function getWordPressLintConfigBindings(
  sourceFile: ts.SourceFile,
): WordPressLintConfigBindings {
  const bindings: WordPressLintConfigBindings = {
    named: new Set<string>(),
    namespaces: new Set<string>(),
  };
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== '@wp-typia/ttsc-lint-plugin-wp'
    ) {
      continue;
    }
    const importClause = statement.importClause;
    if (!importClause?.namedBindings) {
      continue;
    }
    if (ts.isNamespaceImport(importClause.namedBindings)) {
      bindings.namespaces.add(importClause.namedBindings.name.text);
      continue;
    }
    for (const element of importClause.namedBindings.elements) {
      if ((element.propertyName ?? element.name).text === 'configs') {
        bindings.named.add(element.name.text);
      }
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
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === current.text &&
        declaration.initializer
      ) {
        const initializer = unwrapExpression(declaration.initializer);
        return ts.isObjectLiteralExpression(initializer) ? initializer : null;
      }
    }
  }
  return null;
}

function findProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.PropertyAssignment | null {
  for (const property of objectLiteral.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      getPropertyName(property.name) === propertyName
    ) {
      return property;
    }
  }
  return null;
}

function hasSpread(
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

function hasExpectedTextDomainRule(
  rules: ts.ObjectLiteralExpression,
  expectedTextDomain: string,
): boolean {
  const rule = findProperty(rules, 'wordpress/i18n-text-domain');
  if (!rule) {
    return false;
  }
  const ruleValue = unwrapExpression(rule.initializer);
  if (
    !ts.isArrayLiteralExpression(ruleValue) ||
    ruleValue.elements.length < 2
  ) {
    return false;
  }
  const severity = unwrapExpression(ruleValue.elements[0]);
  if (
    (ts.isStringLiteral(severity) && severity.text === 'off') ||
    (ts.isNumericLiteral(severity) && severity.text === '0') ||
    severity.kind === ts.SyntaxKind.FalseKeyword
  ) {
    return false;
  }
  const options = unwrapExpression(ruleValue.elements[1]);
  if (!ts.isObjectLiteralExpression(options)) {
    return false;
  }
  const allowedTextDomain = findProperty(options, 'allowedTextDomain');
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

/**
 * Check whether a lint config enables the WordPress preset and binds its i18n
 * rule to the expected project text domain.
 *
 * @param source TypeScript or JavaScript lint configuration source.
 * @param expectedTextDomain Project text domain required by the i18n rule.
 * @returns Whether the default-exported config satisfies the managed contract.
 */
export function hasWordPressTtscLintConfigSource(
  source: string,
  expectedTextDomain: string,
): boolean {
  const sourceFile = ts.createSourceFile(
    'lint.config.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const bindings = getWordPressLintConfigBindings(sourceFile);
  if (bindings.named.size === 0 && bindings.namespaces.size === 0) {
    return false;
  }
  const exportAssignment = sourceFile.statements.find(
    (statement): statement is ts.ExportAssignment =>
      ts.isExportAssignment(statement) && !statement.isExportEquals,
  );
  const config = exportAssignment
    ? resolveObjectLiteral(exportAssignment.expression, sourceFile)
    : null;
  if (!config || !hasSpread(config, bindings, ['recommended'])) {
    return false;
  }
  const rulesProperty = findProperty(config, 'rules');
  const rules = rulesProperty
    ? resolveObjectLiteral(rulesProperty.initializer, sourceFile)
    : null;
  return Boolean(
    rules &&
      hasSpread(rules, bindings, ['recommended', 'rules']) &&
      hasExpectedTextDomainRule(rules, expectedTextDomain),
  );
}

/** Check whether a project-owned lint command invokes the managed ttsc lane. */
export function hasTtscNoEmitLintCommand(command: unknown): boolean {
  return typeof command === 'string' && command.includes('ttsc --noEmit');
}
