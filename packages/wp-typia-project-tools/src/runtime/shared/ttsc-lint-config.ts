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
): WordPressLintConfigBindings {
  const bindings: WordPressLintConfigBindings = {
    named: new Set<string>(),
    namespaces: new Set<string>(),
  };
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          !declaration.initializer ||
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
  let result: ts.PropertyAssignment | null = null;
  for (const property of objectLiteral.properties) {
    if (ts.isSpreadAssignment(property)) {
      // A dynamic spread can overwrite any earlier property. Fail closed until
      // a later explicit assignment makes the effective value knowable again.
      result = null;
    } else if (getObjectLiteralElementName(property) === propertyName) {
      result = ts.isPropertyAssignment(property) ? property : null;
    }
  }
  return result;
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
          // the recommended preset unless a later known spread restores it.
          return getObjectLiteralElementName(pluginProperty) === 'wordpress'
            ? false
            : current;
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
): ts.Expression | null {
  let result: ts.Expression | null = null;
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      if (result) {
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
      continue;
    }
    const exportPath = getPropertyAccessPath(statement.expression.left);
    const joinedExportPath = exportPath?.join('.') ?? null;
    if (
      joinedExportPath === 'module.exports' ||
      joinedExportPath === 'exports.default'
    ) {
      if (result) {
        return null;
      }
      result = statement.expression.right;
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
 * @returns Whether the exported config satisfies the managed contract.
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
  const exportExpression = findConfigExportExpression(sourceFile);
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
    if (tokens[commandIndex] !== 'run' && tokens[commandIndex] !== 'x') {
      return null;
    }
    commandIndex = skipShellRunnerOptions(tokens, commandIndex + 1);
  } else if (command === 'pnpm' || command === 'yarn') {
    commandIndex = skipShellRunnerOptions(tokens, commandIndex + 1);
    if (
      tokens[commandIndex] === 'exec' ||
      tokens[commandIndex] === 'dlx' ||
      tokens[commandIndex] === 'run'
    ) {
      commandIndex = skipShellRunnerOptions(tokens, commandIndex + 1);
    }
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

function getSimpleShellSegments(command: string): string[][] {
  return command.split(/\s*(?:&&|\|\||[;|\n])\s*/u).map((segment) => {
    const tokens = segment.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/gu) ?? [];
    return tokens.map((token) => normalizeShellToken(token));
  });
}

function getShellCommandStartIndex(tokens: readonly string[]): number {
  let commandIndex = tokens[0] === 'env' ? 1 : 0;
  while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(tokens[commandIndex] ?? '')) {
    commandIndex += 1;
  }
  return commandIndex;
}

/** Check whether a project-owned lint command invokes the managed ttsc lane. */
export function hasTtscNoEmitLintCommand(command: unknown): boolean {
  if (typeof command !== 'string') {
    return false;
  }
  // This intentionally recognizes only simple shell segments and quoted
  // tokens. Subshells and escaped quote sequences fail closed.
  return getSimpleShellSegments(command).some((tokens) => {
    const commandIndex = getTtscCommandIndex(tokens);
    if (commandIndex === null) {
      return false;
    }
    const args = tokens.slice(commandIndex + 1);
    return args.includes('--noEmit');
  });
}

/** Check whether an aggregate command actually runs a package script. */
export function hasPackageRunScriptCommand(
  command: unknown,
  scriptName: string,
): boolean {
  if (typeof command !== 'string') {
    return false;
  }
  return getSimpleShellSegments(command).some((tokens) => {
    let commandIndex = getShellCommandStartIndex(tokens);
    const packageManager = getShellExecutableName(tokens[commandIndex]);
    if (!['bun', 'npm', 'pnpm', 'yarn'].includes(packageManager)) {
      return false;
    }
    commandIndex = skipShellRunnerOptions(tokens, commandIndex + 1);
    if (tokens[commandIndex] === 'run') {
      commandIndex = skipShellRunnerOptions(tokens, commandIndex + 1);
    } else if (packageManager === 'bun' || packageManager === 'npm') {
      return false;
    }
    return tokens[commandIndex] === scriptName;
  });
}

/** Check whether postinstall invokes the managed ttsc lint compatibility file. */
export function hasTtscLintCompatPostinstallCommand(
  command: unknown,
): boolean {
  if (typeof command !== 'string') {
    return false;
  }
  return getSimpleShellSegments(command).some((tokens) => {
    const commandIndex = getShellCommandStartIndex(tokens);
    if (getShellExecutableName(tokens[commandIndex]) !== 'node') {
      return false;
    }
    const scriptIndex = skipShellRunnerOptions(tokens, commandIndex + 1);
    const scriptPath = (tokens[scriptIndex] ?? '')
      .replace(/\\/gu, '/')
      .replace(/^\.\//u, '');
    return scriptPath === 'scripts/apply-ttsc-lint-compat.mjs';
  });
}
