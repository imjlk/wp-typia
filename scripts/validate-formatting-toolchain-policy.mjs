#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from '@typescript/typescript6';

export const FORMATTING_TOOLCHAIN_POLICY = Object.freeze({
  eslintJsVersion: '9.39.4',
  eslintVersion: '9.39.4',
  eslintConfigPrettierVersion: '10.1.8',
  exampleWpScriptsEslintVersion: '8.57.1',
  exampleWpScriptsLintJsScript:
    'node ../../scripts/run-wp-scripts-lint-js-compat.mjs',
  prettierVersion: '3.8.2',
  rootFormatWriteScript:
    'ttsc format --singleThreaded && node scripts/check-repo-format.mjs --write',
  rootLintFixScript:
    'eslint . --fix --max-warnings=0 && ttsc fix --singleThreaded',
  rootLintScript: 'eslint . --max-warnings=0',
  rootTypecheckScript: 'ttsc --noEmit',
  rootFormatCheckScript: 'node scripts/check-repo-format.mjs',
  rootPolicyValidateScript:
    'node scripts/validate-formatting-toolchain-policy.mjs',
  ttscLintVersion: '0.21.0',
  ttscVersion: '0.21.0',
  generatedPackageManifestPaths: Object.freeze([
    'packages/create-workspace-template/package.json.mustache',
    'packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache',
    'packages/wp-typia-project-tools/templates/_shared/persistence/core/package.json.mustache',
    'packages/wp-typia-project-tools/templates/interactivity/package.json.mustache',
    'packages/wp-typia-project-tools/templates/_shared/compound/core/package.json.mustache',
    'packages/wp-typia-project-tools/templates/_shared/compound/persistence/package.json.mustache',
    'packages/wp-typia-project-tools/templates/query-loop/package.json.mustache',
  ]),
  workspaceExamplePackagePaths: Object.freeze([
    'examples/api-contract-adapter-poc/package.json',
    'examples/my-typia-block/package.json',
    'examples/persistence-examples/package.json',
    'examples/compound-patterns/package.json',
  ]),
  wpScriptsExamplePackagePaths: Object.freeze([
    'examples/my-typia-block/package.json',
    'examples/persistence-examples/package.json',
    'examples/compound-patterns/package.json',
  ]),
  // Root dependencies are exact for a reproducible workspace; generated
  // projects use compatible caret ranges so patch releases remain available.
  ttscLintConfig: Object.freeze({
    ignores: Object.freeze([
      '**/*.d.ts',
      '**/build/**',
      '**/coverage/**',
      '**/dist/**',
      '**/dist-bunli/**',
      '**/node_modules/**',
      '**/vendor/**',
    ]),
    format: Object.freeze({
      severity: 'error',
      printWidth: 80,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      trailingComma: 'all',
      endOfLine: 'lf',
      sortImports: false,
      jsDoc: false,
    }),
    rules: Object.freeze({
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
    }),
  }),
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readTextFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readRelativeJson(repoRoot, relativePath) {
  return readJsonFile(path.join(repoRoot, relativePath));
}

function readRelativeText(repoRoot, relativePath) {
  return readTextFile(path.join(repoRoot, relativePath));
}

function unwrapTsExpression(expression) {
  let current = expression;

  while (
    ts.isAsExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function readTsPropertyName(name, sourceFile) {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }

  throw new Error(
    `unsupported computed property ${JSON.stringify(name.getText(sourceFile))}`,
  );
}

function readTsLiteral(expression, sourceFile) {
  const current = unwrapTsExpression(expression);

  if (
    ts.isStringLiteral(current) ||
    ts.isNoSubstitutionTemplateLiteral(current)
  ) {
    return current.text;
  }
  if (ts.isNumericLiteral(current)) {
    return Number(current.text);
  }
  if (
    ts.isPrefixUnaryExpression(current) &&
    (current.operator === ts.SyntaxKind.MinusToken ||
      current.operator === ts.SyntaxKind.PlusToken)
  ) {
    const operand = readTsLiteral(current.operand, sourceFile);
    if (typeof operand !== 'number') {
      throw new Error(
        `unary numeric operator requires a number, found ${JSON.stringify(current.getText(sourceFile))}`,
      );
    }
    return current.operator === ts.SyntaxKind.MinusToken ? -operand : operand;
  }
  if (current.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (current.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  if (current.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }
  if (ts.isArrayLiteralExpression(current)) {
    return current.elements.map((element) => {
      if (ts.isSpreadElement(element)) {
        throw new Error(
          `array spread elements are not supported, found ${JSON.stringify(element.getText(sourceFile))}`,
        );
      }
      return readTsLiteral(element, sourceFile);
    });
  }
  if (ts.isObjectLiteralExpression(current)) {
    const result = Object.create(null);

    for (const property of current.properties) {
      if (!ts.isPropertyAssignment(property)) {
        throw new Error(
          `unsupported object member ${JSON.stringify(property.getText(sourceFile))}`,
        );
      }
      result[readTsPropertyName(property.name, sourceFile)] = readTsLiteral(
        property.initializer,
        sourceFile,
      );
    }

    return result;
  }

  throw new Error(
    `unsupported expression ${JSON.stringify(current.getText(sourceFile))}`,
  );
}

function readTsDefaultObjectConfig(sourceText, relativePath) {
  const sourceFile = ts.createSourceFile(
    relativePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const diagnostics = sourceFile.parseDiagnostics ?? [];

  if (diagnostics.length > 0) {
    throw new Error(
      diagnostics
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        )
        .join('; '),
    );
  }

  const exportAssignment = sourceFile.statements.find((statement) =>
    ts.isExportAssignment(statement),
  );

  if (!exportAssignment || exportAssignment.isExportEquals) {
    throw new Error('missing an `export default` object');
  }

  const value = readTsLiteral(exportAssignment.expression, sourceFile);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('default export must be an object');
  }

  return value;
}

function deepEqualJson(left, right) {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => deepEqualJson(item, right[index]))
    );
  }
  if (
    typeof left === 'object' &&
    left !== null &&
    typeof right === 'object' &&
    right !== null
  ) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) =>
          key === rightKeys[index] && deepEqualJson(left[key], right[key]),
      )
    );
  }

  return false;
}

function getStaticBindings(sourceFile) {
  const bindings = new Map();

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        bindings.set(declaration.name.text, declaration.initializer);
      }
    }
  }

  return bindings;
}

function readStaticStrings(expression, bindings, seen = new Set()) {
  const current = unwrapTsExpression(expression);

  if (
    ts.isStringLiteral(current) ||
    ts.isNoSubstitutionTemplateLiteral(current)
  ) {
    return [current.text];
  }
  if (ts.isArrayLiteralExpression(current)) {
    return current.elements.flatMap((element) =>
      ts.isSpreadElement(element)
        ? readStaticStrings(element.expression, bindings, seen)
        : readStaticStrings(element, bindings, seen),
    );
  }
  if (ts.isIdentifier(current) && !seen.has(current.text)) {
    const initializer = bindings.get(current.text);
    if (!initializer) {
      return [];
    }
    const nextSeen = new Set(seen);
    nextSeen.add(current.text);
    return readStaticStrings(initializer, bindings, nextSeen);
  }

  return [];
}

function isTypeScriptFileGlob(value) {
  return (
    /\.(?:ts|tsx|mts|cts)(?:$|[,}])/u.test(value) ||
    /\.\{[^}]*\b(?:ts|tsx|mts|cts)\b[^}]*\}/u.test(value)
  );
}

function isTypeScriptEslintPackage(value) {
  return (
    value === 'typescript-eslint' ||
    value === '@typescript-eslint' ||
    value.startsWith('@typescript-eslint/')
  );
}

function inspectEslintConfig(sourceText) {
  const sourceFile = ts.createSourceFile(
    'eslint.config.mjs',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const bindings = getStaticBindings(sourceFile);
  let hasTypeScriptEslint = false;
  let hasTypeScriptFileScope = false;

  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      isTypeScriptEslintPackage(node.moduleSpecifier.text)
    ) {
      hasTypeScriptEslint = true;
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      isTypeScriptEslintPackage(node.moduleSpecifier.text)
    ) {
      hasTypeScriptEslint = true;
    }

    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require')) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      isTypeScriptEslintPackage(node.arguments[0].text)
    ) {
      hasTypeScriptEslint = true;
    }

    if (ts.isPropertyAssignment(node)) {
      const propertyName = readTsPropertyName(node.name, sourceFile);
      if (propertyName === '@typescript-eslint') {
        hasTypeScriptEslint = true;
      }
      if (
        propertyName === 'files' &&
        readStaticStrings(node.initializer, bindings).some(isTypeScriptFileGlob)
      ) {
        hasTypeScriptFileScope = true;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { hasTypeScriptEslint, hasTypeScriptFileScope };
}

function validateGeneratedTemplateManifest(
  relativePath,
  sourceText,
  policy,
  errors,
) {
  const manifest = JSON.parse(sourceText);
  const devDependencyPrettier = manifest.devDependencies?.prettier;
  const expectedTtscRange = `^${policy.ttscVersion}`;
  const expectedTtscLintRange = `^${policy.ttscLintVersion}`;

  if (devDependencyPrettier === undefined) {
    errors.push(
      `${relativePath} must declare devDependencies.prettier="${policy.prettierVersion}".`,
    );
  } else if (devDependencyPrettier !== policy.prettierVersion) {
    errors.push(
      `${relativePath} must declare devDependencies.prettier="${policy.prettierVersion}", found ${JSON.stringify(devDependencyPrettier)}.`,
    );
  }

  if (manifest.devDependencies?.ttsc !== expectedTtscRange) {
    errors.push(
      `${relativePath} must declare devDependencies.ttsc="${expectedTtscRange}", found ${JSON.stringify(manifest.devDependencies?.ttsc ?? null)}.`,
    );
  }

  if (manifest.devDependencies?.['@ttsc/lint'] !== expectedTtscLintRange) {
    errors.push(
      `${relativePath} must declare devDependencies["@ttsc/lint"]="${expectedTtscLintRange}", found ${JSON.stringify(manifest.devDependencies?.['@ttsc/lint'] ?? null)}.`,
    );
  }
}

function getLintJobBlock(workflowSource) {
  const lines = workflowSource.split('\n');
  const startIndex = lines.findIndex((line) => line === '  lint:');

  if (startIndex < 0) {
    return '';
  }

  const lintBlockLines = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > startIndex && /^ {2}[A-Za-z0-9_-]+:/.test(line)) {
      break;
    }
    lintBlockLines.push(line);
  }

  return lintBlockLines.join('\n');
}

export function validateFormattingToolchainPolicy(
  repoRoot = DEFAULT_REPO_ROOT,
) {
  const errors = [];
  const packageJson = readRelativeJson(repoRoot, 'package.json');
  const scripts = packageJson.scripts ?? {};
  const devDependencies = packageJson.devDependencies ?? {};
  const policy = FORMATTING_TOOLCHAIN_POLICY;

  if (devDependencies['@eslint/js'] !== policy.eslintJsVersion) {
    errors.push(
      `package.json must declare devDependencies["@eslint/js"]="${policy.eslintJsVersion}", found ${JSON.stringify(devDependencies['@eslint/js'] ?? null)}.`,
    );
  }

  if (devDependencies.eslint !== policy.eslintVersion) {
    errors.push(
      `package.json must declare devDependencies.eslint="${policy.eslintVersion}", found ${JSON.stringify(devDependencies.eslint ?? null)}.`,
    );
  }

  for (const dependencyName of [
    '@typescript-eslint/eslint-plugin',
    '@typescript-eslint/parser',
    'typescript-eslint',
  ]) {
    if (dependencyName in devDependencies) {
      errors.push(
        `package.json must not declare devDependencies[${JSON.stringify(dependencyName)}]; TypeScript linting is owned by @ttsc/lint.`,
      );
    }
  }

  if (devDependencies.ttsc !== policy.ttscVersion) {
    errors.push(
      `package.json must declare devDependencies.ttsc="${policy.ttscVersion}", found ${JSON.stringify(devDependencies.ttsc ?? null)}.`,
    );
  }

  if (devDependencies['@ttsc/lint'] !== policy.ttscLintVersion) {
    errors.push(
      `package.json must declare devDependencies["@ttsc/lint"]="${policy.ttscLintVersion}", found ${JSON.stringify(devDependencies['@ttsc/lint'] ?? null)}.`,
    );
  }

  if (devDependencies.prettier !== policy.prettierVersion) {
    errors.push(
      `package.json must declare devDependencies.prettier="${policy.prettierVersion}", found ${JSON.stringify(devDependencies.prettier ?? null)}.`,
    );
  }

  if (
    devDependencies['eslint-config-prettier'] !==
    policy.eslintConfigPrettierVersion
  ) {
    errors.push(
      `package.json must declare devDependencies.eslint-config-prettier="${policy.eslintConfigPrettierVersion}", found ${JSON.stringify(devDependencies['eslint-config-prettier'] ?? null)}.`,
    );
  }

  if (scripts['format:check'] !== policy.rootFormatCheckScript) {
    errors.push(
      `package.json must keep scripts["format:check"]="${policy.rootFormatCheckScript}", found ${JSON.stringify(scripts['format:check'] ?? null)}.`,
    );
  }

  if (scripts['format:write'] !== policy.rootFormatWriteScript) {
    errors.push(
      `package.json must keep scripts["format:write"]="${policy.rootFormatWriteScript}", found ${JSON.stringify(scripts['format:write'] ?? null)}.`,
    );
  }

  if (scripts['lint:repo'] !== policy.rootLintScript) {
    errors.push(
      `package.json must keep scripts["lint:repo"]="${policy.rootLintScript}", found ${JSON.stringify(scripts['lint:repo'] ?? null)}.`,
    );
  }

  if (scripts['lint:fix'] !== policy.rootLintFixScript) {
    errors.push(
      `package.json must keep scripts["lint:fix"]="${policy.rootLintFixScript}", found ${JSON.stringify(scripts['lint:fix'] ?? null)}.`,
    );
  }

  if (scripts.typecheck !== policy.rootTypecheckScript) {
    errors.push(
      `package.json must keep scripts.typecheck="${policy.rootTypecheckScript}", found ${JSON.stringify(scripts.typecheck ?? null)}.`,
    );
  }

  if (
    scripts['formatting-policy:validate'] !== policy.rootPolicyValidateScript
  ) {
    errors.push(
      `package.json must keep scripts["formatting-policy:validate"]="${policy.rootPolicyValidateScript}", found ${JSON.stringify(scripts['formatting-policy:validate'] ?? null)}.`,
    );
  }

  const lintConfigSource = readRelativeText(repoRoot, 'lint.config.ts');
  try {
    const lintConfig = readTsDefaultObjectConfig(
      lintConfigSource,
      'lint.config.ts',
    );
    if (!deepEqualJson(lintConfig, policy.ttscLintConfig)) {
      errors.push(
        `lint.config.ts must export the documented @ttsc/lint configuration; found ${JSON.stringify(lintConfig)}.`,
      );
    }
  } catch (error) {
    errors.push(
      `lint.config.ts must export a statically readable @ttsc/lint configuration: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }

  const eslintConfigSource = readRelativeText(repoRoot, 'eslint.config.mjs');
  try {
    const eslintConfig = inspectEslintConfig(eslintConfigSource);
    if (
      eslintConfig.hasTypeScriptEslint ||
      eslintConfig.hasTypeScriptFileScope
    ) {
      errors.push(
        'eslint.config.mjs must keep TypeScript outside the ESLint scope; @ttsc/lint owns TS/TSX.',
      );
    }
  } catch (error) {
    errors.push(
      `eslint.config.mjs must be statically inspectable: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }

  const ciLocal =
    typeof scripts['ci:local'] === 'string' ? scripts['ci:local'] : '';
  for (const requiredCommand of [
    'bun run formatting-policy:validate',
    'bun run format:check',
    'bun run typecheck',
  ]) {
    if (!ciLocal.includes(requiredCommand)) {
      errors.push(
        `package.json must include "${requiredCommand}" in scripts["ci:local"].`,
      );
    }
  }

  for (const relativePath of policy.workspaceExamplePackagePaths) {
    const examplePackageJson = readRelativeJson(repoRoot, relativePath);
    const examplePrettier = examplePackageJson.devDependencies?.prettier;
    const expectedTtscRange = `^${policy.ttscVersion}`;
    const expectedTtscLintRange = `^${policy.ttscLintVersion}`;

    if (examplePrettier !== policy.prettierVersion) {
      errors.push(
        `${relativePath} must declare devDependencies.prettier="${policy.prettierVersion}", found ${JSON.stringify(examplePrettier ?? null)}.`,
      );
    }
    if (examplePackageJson.devDependencies?.ttsc !== expectedTtscRange) {
      errors.push(
        `${relativePath} must declare devDependencies.ttsc="${expectedTtscRange}", found ${JSON.stringify(examplePackageJson.devDependencies?.ttsc ?? null)}.`,
      );
    }
    if (
      examplePackageJson.devDependencies?.['@ttsc/lint'] !==
      expectedTtscLintRange
    ) {
      errors.push(
        `${relativePath} must declare devDependencies["@ttsc/lint"]="${expectedTtscLintRange}", found ${JSON.stringify(examplePackageJson.devDependencies?.['@ttsc/lint'] ?? null)}.`,
      );
    }
  }

  for (const relativePath of policy.wpScriptsExamplePackagePaths) {
    const examplePackageJson = readRelativeJson(repoRoot, relativePath);
    const exampleScripts = examplePackageJson.scripts ?? {};
    const exampleEslint = examplePackageJson.devDependencies?.eslint;
    const wrapperPath = path.resolve(
      path.join(repoRoot, path.dirname(relativePath)),
      policy.exampleWpScriptsLintJsScript.replace(/^node\s+/, ''),
    );

    if (exampleEslint !== policy.exampleWpScriptsEslintVersion) {
      errors.push(
        `${relativePath} must declare devDependencies.eslint="${policy.exampleWpScriptsEslintVersion}", found ${JSON.stringify(exampleEslint ?? null)}.`,
      );
    }

    if (exampleScripts['lint:js'] !== policy.exampleWpScriptsLintJsScript) {
      errors.push(
        `${relativePath} must keep scripts["lint:js"]="${policy.exampleWpScriptsLintJsScript}", found ${JSON.stringify(exampleScripts['lint:js'] ?? null)}.`,
      );
    }

    if (!fs.existsSync(wrapperPath)) {
      errors.push(
        `${relativePath} must resolve scripts["lint:js"]="${policy.exampleWpScriptsLintJsScript}" to an existing wrapper file, missing ${JSON.stringify(path.relative(repoRoot, wrapperPath))}.`,
      );
    }
  }

  for (const relativePath of policy.generatedPackageManifestPaths) {
    validateGeneratedTemplateManifest(
      relativePath,
      readRelativeText(repoRoot, relativePath),
      policy,
      errors,
    );
  }

  const lintJobBlock = getLintJobBlock(
    readRelativeText(repoRoot, '.github/workflows/ci.yml'),
  );
  for (const requiredRunLine of [
    'run: bun run formatting-policy:validate',
    'run: bun run format:check',
    'run: bun run typecheck',
  ]) {
    if (!lintJobBlock.includes(requiredRunLine)) {
      errors.push(
        `.github/workflows/ci.yml lint job must include "${requiredRunLine}".`,
      );
    }
  }

  return {
    errors,
    valid: errors.length === 0,
  };
}

export function runCli({
  cwd = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const result = validateFormattingToolchainPolicy(cwd);

  if (!result.valid) {
    stderr.write('Invalid formatting/toolchain policy detected:\n');
    for (const error of result.errors) {
      stderr.write(`- ${error}\n`);
    }
    return 1;
  }

  stdout.write('Validated formatting/toolchain policy.\n');
  return 0;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (invokedPath === __filename) {
  process.exitCode = runCli();
}
