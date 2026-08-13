#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from '@typescript/typescript6';

const TTSC_LINT_VERSION = '0.26.2';
const TYPIA_VERSION = '13.2.0';
const TTSC_LINT_FORMAT = Object.freeze({
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
});
const GENERATED_TTSC_LINT_FORMAT = Object.freeze({
  ...TTSC_LINT_FORMAT,
  severity: 'off',
});
const TTSC_LINT_RULES = Object.freeze({
  'no-var': 'error',
  'prefer-const': 'error',
  eqeqeq: 'error',
});
const QUERY_LOOP_PACKAGE_MANIFEST_PATH =
  'packages/wp-typia-project-tools/templates/query-loop/package.json.mustache';
const GENERATED_PACKAGE_MANIFEST_PATHS = Object.freeze([
  'packages/create-workspace-template/package.json.mustache',
  'packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache',
  'packages/wp-typia-project-tools/templates/_shared/persistence/core/package.json.mustache',
  'packages/wp-typia-project-tools/templates/interactivity/package.json.mustache',
  'packages/wp-typia-project-tools/templates/_shared/compound/core/package.json.mustache',
  'packages/wp-typia-project-tools/templates/_shared/compound/persistence/package.json.mustache',
  QUERY_LOOP_PACKAGE_MANIFEST_PATH,
  'packages/wp-typia-project-tools/tests/fixtures/create-block-external/plugin-templates/package.json.mustache',
]);
// Query-loop has no styles, but --allow-empty-input keeps the shared style
// gate valid without a special-case manifest exclusion.
const GENERATED_WP_SCRIPTS_STYLE_LINT_MANIFEST_PATHS = Object.freeze(
  GENERATED_PACKAGE_MANIFEST_PATHS,
);
const REMOVED_LEGACY_SCRIPTS = Object.freeze([
  'lint',
  'lint:ts',
  'lint:js',
  'lint:css',
  'typecheck',
  'format:check',
]);
const REMOVED_LEGACY_LINT_DEPENDENCIES = Object.freeze([
  '@typescript/typescript6',
  'eslint-import-resolver-typescript',
  'eslint-plugin-jsx-a11y',
]);
const GENERATED_LINT_COMPAT_TEMPLATE_ROOTS = Object.freeze([
  'packages/create-workspace-template',
  'packages/wp-typia-project-tools/templates/_shared/base',
  'packages/wp-typia-project-tools/tests/fixtures/create-block-external/plugin-templates',
]);
const GENERATED_WORDPRESS_TTSC_LINT_CONFIG_PATHS = Object.freeze([
  'packages/create-workspace-template/lint.config.mts.mustache',
  'packages/wp-typia-project-tools/templates/_shared/base/lint.config.mts.mustache',
  'packages/wp-typia-project-tools/tests/fixtures/create-block-external/plugin-templates/lint.config.mts.mustache',
]);

export const FORMATTING_TOOLCHAIN_POLICY = Object.freeze({
  eslintJsVersion: '9.39.4',
  eslintVersion: '9.39.4',
  eslintConfigPrettierVersion: '10.1.8',
  exampleCodeCheckScript: 'bun run sync --check && ttsc check --noEmit',
  exampleCheckScript:
    'bun run check:code && bun run check:style && bun run check:format',
  exampleStyleCheckScript: 'wp-scripts lint-style',
  exampleFormatCheckScript:
    'prettier --check --no-error-on-unmatched-pattern "**/*.{css,json,md,scss,yaml,yml}" "*.{cjs,js,jsx,mjs}" "scripts/**/*.{cjs,js,jsx,mjs}" "src/**/*.{cjs,js,jsx,mjs}"',
  exampleWpScriptsFormatScript:
    'ttsc format --singleThreaded && prettier --write --no-error-on-unmatched-pattern "**/*.{css,json,md,scss,yaml,yml}" "*.{cjs,js,jsx,mjs}" "scripts/**/*.{cjs,js,jsx,mjs}" "src/**/*.{cjs,js,jsx,mjs}"',
  generatedCodeCheckScript: 'bun run sync --check && ttsc check --noEmit',
  generatedQueryLoopCodeCheckScript: 'ttsc check --noEmit',
  generatedCheckScript:
    'bun run check:code && bun run check:style && bun run check:format',
  generatedStyleCheckScript: 'wp-scripts lint-style --allow-empty-input',
  generatedFormatCheckScript:
    'prettier --check --no-error-on-unmatched-pattern "**/*.{css,json,md,scss,yaml,yml}" "*.{cjs,js,jsx,mjs}" "scripts/**/*.{cjs,js,jsx,mjs}" "src/**/*.{cjs,js,jsx,mjs}"',
  generatedWpScriptsFormatScript:
    'ttsc format --singleThreaded && prettier --write --no-error-on-unmatched-pattern "**/*.{css,json,md,scss,yaml,yml}" "*.{cjs,js,jsx,mjs}" "scripts/**/*.{cjs,js,jsx,mjs}" "src/**/*.{cjs,js,jsx,mjs}"',
  generatedTtscLintCompatScript: 'node scripts/apply-ttsc-lint-compat.mjs',
  generatedTtscLintCompatCanonicalTemplateRoot:
    'packages/wp-typia-project-tools/templates/_shared/base',
  generatedTtscLintCompatTemplatePath:
    'scripts/apply-ttsc-lint-compat.mjs.mustache',
  generatedReactDomTypesVersion: '^18.3.7',
  generatedReactDomVersion: '^18.3.1',
  generatedReactTypesVersion: '^18.3.28',
  generatedReactVersion: '^18.3.1',
  typescript6Version: '6.0.2',
  prettierVersion: '3.8.2',
  generatedPrettierConfigPath: 'prettier.config.mjs',
  generatedPrettierIgnorePath: '.prettierignore',
  generatedPrettierIgnorePatterns: Object.freeze([
    '**/.ttsc-cache/**',
    '**/build/**',
    '**/coverage/**',
    '**/dist/**',
    '**/.pnpm-store/**',
    '**/.yarn/**',
    '**/node_modules/**',
    '**/vendor/**',
    '**/bun.lock',
    '**/bun.lockb',
    '**/npm-shrinkwrap.json',
    '**/package-lock.json',
    '**/pnpm-lock.yaml',
    '**/yarn.lock',
    '**/api-schemas/**/*.json',
    '**/api.openapi.json',
    '**/*.abilities.json',
    '**/*.ai.schema.json',
    '**/block.json',
    '**/migrations/**/fixture*.json',
    '**/typia.manifest.json',
    '**/typia.openapi.json',
    '**/typia.schema.json',
  ]),
  generatedPrettierConfig: Object.freeze({
    useTabs: true,
    tabWidth: 4,
    printWidth: 80,
    singleQuote: true,
    trailingComma: 'es5',
    bracketSameLine: false,
    bracketSpacing: true,
    semi: true,
    arrowParens: 'always',
    overrides: Object.freeze([
      Object.freeze({
        files: '*.{css,sass,scss}',
        options: Object.freeze({
          singleQuote: false,
        }),
      }),
    ]),
  }),
  generatedTtscLintFormat: GENERATED_TTSC_LINT_FORMAT,
  rootFormatWriteScript:
    'ttsc format --singleThreaded && node scripts/check-repo-format.mjs --write',
  rootLintFixScript:
    'eslint . --fix --max-warnings=0 && ttsc fix --singleThreaded',
  rootLintScript: 'eslint . --max-warnings=0',
  rootTypecheckScript: 'ttsc --noEmit',
  rootFormatCheckScript: 'node scripts/check-repo-format.mjs',
  rootPolicyValidateScript:
    'node scripts/validate-formatting-toolchain-policy.mjs',
  rootTtscLintCompatCheckScript:
    'node scripts/sync-generated-ttsc-lint-compat.mjs',
  rootTtscLintCompatSyncScript:
    'node scripts/sync-generated-ttsc-lint-compat.mjs --write',
  ttscLintVersion: TTSC_LINT_VERSION,
  ttscVersion: '0.26.2',
  typiaVersion: TYPIA_VERSION,
  compatibilityPatches: Object.freeze({
    [`@ttsc/lint@${TTSC_LINT_VERSION}`]: `patches/@ttsc%2Flint@${TTSC_LINT_VERSION}.patch`,
    [`typia@${TYPIA_VERSION}`]: `patches/typia@${TYPIA_VERSION}.patch`,
  }),
  compatibilityPatchSha256: Object.freeze({
    [`@ttsc/lint@${TTSC_LINT_VERSION}`]:
      'e759369db3fa00a826f59f4bc7ea1b4861b3ee2d0135a490576e25ec07cbf2cb',
    [`typia@${TYPIA_VERSION}`]:
      '545b153b7dfc5d0c2964c831899b4930f216674ca8af810951028b2bbc2db2b6',
  }),
  generatedPackageManifestPaths: GENERATED_PACKAGE_MANIFEST_PATHS,
  generatedWpScriptsStyleLintManifestPaths:
    GENERATED_WP_SCRIPTS_STYLE_LINT_MANIFEST_PATHS,
  generatedTtscLintCompatTemplateRoots: Object.freeze([
    ...GENERATED_LINT_COMPAT_TEMPLATE_ROOTS,
  ]),
  generatedWordPressTtscLintConfigPaths:
    GENERATED_WORDPRESS_TTSC_LINT_CONFIG_PATHS,
  generatedWordPressTtscLintPluginVersion: '{{ttscLintPluginWpPackageVersion}}',
  workspaceExamplePackagePaths: Object.freeze([
    'examples/api-contract-adapter-poc/package.json',
    'examples/my-typia-block/package.json',
    'examples/persistence-examples/package.json',
    'examples/compound-patterns/package.json',
  ]),
  workspaceExampleStaticLintConfigPaths: Object.freeze([
    'examples/api-contract-adapter-poc/lint.config.ts',
  ]),
  workspaceWordPressLintConfigPaths: Object.freeze([
    'examples/my-typia-block/lint.config.mts',
    'examples/persistence-examples/lint.config.mts',
    'examples/compound-patterns/lint.config.mts',
  ]),
  workspaceWordPressPrettierConfigPaths: Object.freeze([
    'examples/my-typia-block/prettier.config.mjs',
    'examples/persistence-examples/prettier.config.mjs',
    'examples/compound-patterns/prettier.config.mjs',
  ]),
  workspaceWordPressPrettierIgnorePaths: Object.freeze([
    'examples/my-typia-block/.prettierignore',
    'examples/persistence-examples/.prettierignore',
    'examples/compound-patterns/.prettierignore',
  ]),
  wpScriptsExamplePackagePaths: Object.freeze([
    'examples/my-typia-block/package.json',
    'examples/persistence-examples/package.json',
    'examples/compound-patterns/package.json',
  ]),
  // Root dependencies are exact for a reproducible workspace. Generated
  // projects keep @ttsc/lint exact while the compatibility hook targets that
  // exact source version.
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
    format: TTSC_LINT_FORMAT,
    rules: TTSC_LINT_RULES,
  }),
  workspaceExampleTtscLintConfig: Object.freeze({
    ignores: Object.freeze(['build/**', 'node_modules/**']),
    format: TTSC_LINT_FORMAT,
    rules: TTSC_LINT_RULES,
  }),
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');
const TYPESCRIPT_ESLINT_DEPENDENCY_NAMES = Object.freeze([
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/parser',
  'typescript-eslint',
]);

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

function assertNoParseDiagnostics(sourceFile) {
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
}

function readTsDefaultObjectConfig(sourceText, relativePath) {
  const sourceFile = ts.createSourceFile(
    relativePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  assertNoParseDiagnostics(sourceFile);

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

function readTsDefaultObjectProperty(sourceText, relativePath, propertyName) {
  const sourceFile = ts.createSourceFile(
    relativePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  assertNoParseDiagnostics(sourceFile);

  const exportAssignment = sourceFile.statements.find((statement) =>
    ts.isExportAssignment(statement),
  );
  if (!exportAssignment || exportAssignment.isExportEquals) {
    throw new Error('missing an `export default` object');
  }

  const value = unwrapTsExpression(exportAssignment.expression);
  if (!ts.isObjectLiteralExpression(value)) {
    throw new Error('default export must be an object');
  }

  const properties = value.properties.filter(
    (candidate) =>
      ts.isPropertyAssignment(candidate) &&
      readTsPropertyName(candidate.name, sourceFile) === propertyName,
  );
  if (properties.length > 1) {
    throw new Error(`default export defines ${propertyName} more than once`);
  }
  const property = properties[0];
  if (!property || !ts.isPropertyAssignment(property)) {
    return undefined;
  }

  return readTsLiteral(property.initializer, sourceFile);
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
  assertNoParseDiagnostics(sourceFile);
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

function validateNoTypeScriptEslintDevDependencies(
  relativePath,
  manifest,
  errors,
) {
  const devDependencies = manifest.devDependencies ?? {};
  for (const dependencyName of TYPESCRIPT_ESLINT_DEPENDENCY_NAMES) {
    if (dependencyName in devDependencies) {
      errors.push(
        `${relativePath} must not declare devDependencies[${JSON.stringify(dependencyName)}]; TypeScript linting is owned by @ttsc/lint.`,
      );
    }
  }
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

  validateNoTypeScriptEslintDevDependencies(relativePath, manifest, errors);

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

  if (manifest.devDependencies?.['@ttsc/lint'] !== policy.ttscLintVersion) {
    errors.push(
      `${relativePath} must declare devDependencies["@ttsc/lint"]="${policy.ttscLintVersion}" while the generated compatibility hook targets that exact source, found ${JSON.stringify(manifest.devDependencies?.['@ttsc/lint'] ?? null)}.`,
    );
  }

  if (
    manifest.devDependencies?.['@wp-typia/ttsc-lint-plugin-wp'] !==
    policy.generatedWordPressTtscLintPluginVersion
  ) {
    errors.push(
      `${relativePath} must declare devDependencies["@wp-typia/ttsc-lint-plugin-wp"]="${policy.generatedWordPressTtscLintPluginVersion}", found ${JSON.stringify(manifest.devDependencies?.['@wp-typia/ttsc-lint-plugin-wp'] ?? null)}.`,
    );
  }

  if (manifest.scripts?.postinstall !== policy.generatedTtscLintCompatScript) {
    errors.push(
      `${relativePath} must keep scripts.postinstall="${policy.generatedTtscLintCompatScript}", found ${JSON.stringify(manifest.scripts?.postinstall ?? null)}.`,
    );
  }

  for (const removedDependency of REMOVED_LEGACY_LINT_DEPENDENCIES) {
    if (removedDependency in (manifest.devDependencies ?? {})) {
      errors.push(
        `${relativePath} must not declare devDependencies[${JSON.stringify(removedDependency)}]; ttsc check owns generated JavaScript and TypeScript diagnostics without the legacy ESLint compatibility island.`,
      );
    }
  }

  for (const [dependencyName, expectedVersion] of [
    ['@types/react', policy.generatedReactTypesVersion],
    ['@types/react-dom', policy.generatedReactDomTypesVersion],
    ['react', policy.generatedReactVersion],
    ['react-dom', policy.generatedReactDomVersion],
  ]) {
    if (manifest.devDependencies?.[dependencyName] !== expectedVersion) {
      errors.push(
        `${relativePath} must declare devDependencies[${JSON.stringify(dependencyName)}]=${JSON.stringify(expectedVersion)}, found ${JSON.stringify(manifest.devDependencies?.[dependencyName] ?? null)}.`,
      );
    }
  }

  const expectedCodeCheck =
    relativePath === QUERY_LOOP_PACKAGE_MANIFEST_PATH
      ? policy.generatedQueryLoopCodeCheckScript
      : policy.generatedCodeCheckScript;
  if (manifest.scripts?.['check:code'] !== expectedCodeCheck) {
    errors.push(
      `${relativePath} must keep scripts["check:code"]="${expectedCodeCheck}", found ${JSON.stringify(manifest.scripts?.['check:code'] ?? null)}.`,
    );
  }
  if (manifest.scripts?.check !== policy.generatedCheckScript) {
    errors.push(
      `${relativePath} must keep scripts.check="${policy.generatedCheckScript}", found ${JSON.stringify(manifest.scripts?.check ?? null)}.`,
    );
  }
  if (
    manifest.scripts?.['check:format'] !== policy.generatedFormatCheckScript
  ) {
    errors.push(
      `${relativePath} must keep scripts["check:format"]="${policy.generatedFormatCheckScript}", found ${JSON.stringify(manifest.scripts?.['check:format'] ?? null)}.`,
    );
  }
  if (manifest.scripts?.format !== policy.generatedWpScriptsFormatScript) {
    errors.push(
      `${relativePath} must keep scripts.format="${policy.generatedWpScriptsFormatScript}" so Prettier remains the single generated-project formatter, found ${JSON.stringify(manifest.scripts?.format ?? null)}.`,
    );
  }
  for (const removedScript of REMOVED_LEGACY_SCRIPTS) {
    if (removedScript in (manifest.scripts ?? {})) {
      errors.push(
        `${relativePath} must not define the legacy scripts.${removedScript}; generated projects expose check:code and check instead.`,
      );
    }
  }

  return manifest;
}

function validateGeneratedStyleLintManifest(
  relativePath,
  manifest,
  policy,
  errors,
) {
  if (manifest.scripts?.['check:style'] !== policy.generatedStyleCheckScript) {
    errors.push(
      `${relativePath} must keep scripts["check:style"]="${policy.generatedStyleCheckScript}" so empty workspaces remain checkable, found ${JSON.stringify(manifest.scripts?.['check:style'] ?? null)}.`,
    );
  }
}

function validateGeneratedTtscLintCompatSource(
  repoRoot,
  relativePath,
  policy,
  expectedSource,
  errors,
) {
  const filePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    errors.push(
      `${relativePath} must exist so generated projects patch the exact @ttsc/lint source before ttsc runs.`,
    );
    return null;
  }

  const source = fs.readFileSync(filePath, 'utf8');
  const escapedVersion = policy.ttscLintVersion.replace(
    /[.*+?^${}()|[\]\\]/gu,
    '\\$&',
  );
  for (const { description, pattern } of [
    {
      description: `an executable REQUIRED_VERSION declaration for ${policy.ttscLintVersion}`,
      pattern: new RegExp(
        `^const REQUIRED_VERSION = '${escapedVersion}';$`,
        'mu',
      ),
    },
    {
      description: 'the @ttsc/lint trailing-comma source path',
      pattern:
        /const lintRulePath = path\.join\([\s\S]*?['"]linthost['"],[\s\S]*?['"]rules_format_trailing_comma\.go['"][\s\S]*?\);/u,
    },
    {
      description: 'the @ttsc/lint TypeScript loader source path',
      pattern:
        /const lintIndexPath = path\.join\(packageRoot, ['"]src['"], ['"]index\.ts['"]\);/u,
    },
    {
      description: 'the distributed @ttsc/lint loader runtime path',
      pattern:
        /const lintRuntimePath = path\.join\(packageRoot, ['"]lib['"], ['"]index\.js['"]\);/u,
    },
    {
      description: 'the native @ttsc/lint sidecar config path',
      pattern:
        /const lintHostConfigPath = path\.join\(packageRoot, ['"]linthost['"], ['"]config\.go['"]\);/u,
    },
    {
      description: 'the mapped/infer FunctionLikeData guard',
      pattern: /^\s*if node\.Parent\.FunctionLikeData\(\) == nil \{$/mu,
    },
    {
      description: 'the Node Buffer generic annotation repair',
      pattern: /'let target: Buffer = Buffer\.alloc\(0\);'/u,
    },
    {
      description: 'the TypeScript source digest scopes',
      pattern:
        /prepareBufferTargetRepair\(\s*lintIndexPath,\s*\[\s*['"]directoryDigest['"],\s*['"]configDirectoryDigest['"],?\s*\],\s*\{[\s\S]*?legacyTargets: \[cachedGenericBufferTarget\][\s\S]*?\}\s*\)/u,
    },
    {
      description: 'the distributed loader digest scope',
      pattern:
        /prepareBufferTargetRepair\(lintRuntimePath, \[['"]directoryDigest['"]\], \{[\s\S]*?scopeMarker: ['"]exports\.TTSX_EXTRACTOR_SCRIPT = `['"][\s\S]*?\}\)/u,
    },
    {
      description: 'the native sidecar embedded TypeScript loader digest scope',
      pattern:
        /prepareBufferTargetRepair\(lintHostConfigPath, \[['"]directoryDigest['"]\], \{[\s\S]*?scopeMarker: ['"]func typeScriptConfigLoaderSource\(['"][\s\S]*?\}\)/u,
    },
    {
      description: 'the two Node Buffer targets per digest function',
      pattern:
        /if \(activeStates\.length !== 1 \|\| activeStates\[0\]\.count !== 2\)/u,
    },
    {
      description: 'the guarded unpatched-to-patched state transition',
      pattern:
        /functionSource = functionSource\.replaceAll\([\s\S]*?activeStates\[0\]\.target,[\s\S]*?patchedTarget[\s\S]*?\);/u,
    },
    {
      description: 'the production-only install escape hatch',
      pattern:
        /if \(error\?\.code === ['"]MODULE_NOT_FOUND['"]\) \{[\s\S]*?process\.exit\(0\);/u,
    },
    {
      description: 'the stale temporary-file cleanup',
      pattern:
        /function removeStaleTemporaryFiles\(sourcePath\) \{[\s\S]*?STALE_TEMPORARY_FILE_AGE_MS[\s\S]*?fs\.rmSync\(temporaryPath, \{ force: true \}\);/u,
    },
    {
      description: 'the source permission preservation',
      pattern: /mode: fs\.statSync\(sourcePath\)\.mode % 0o1000/u,
    },
    {
      description: 'package-manager-neutral recovery guidance',
      pattern:
        /Re-run the project's package-manager install command to recover from a partial write\./u,
    },
    {
      description: 'the atomic temporary-file write',
      pattern: /^\s*fs\.writeFileSync\(\s*temporaryPath,\s*nextSource,\s*\{/mu,
    },
    {
      description: 'the atomic rename into the installed package',
      pattern: /^\s*fs\.renameSync\(\s*temporaryPath,\s*sourcePath\s*\);$/mu,
    },
  ]) {
    if (!pattern.test(source)) {
      errors.push(
        `${relativePath} must include ${description} for the guarded @ttsc/lint compatibility repairs.`,
      );
    }
  }

  if (expectedSource !== null && source !== expectedSource) {
    errors.push(
      `${relativePath} must match the canonical generated @ttsc/lint compatibility hook byte-for-byte.`,
    );
  }

  return source;
}

function validateGeneratedPrettierConfig(
  repoRoot,
  relativePath,
  policy,
  errors,
) {
  const configPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(configPath)) {
    errors.push(
      `${relativePath} must exist so generated JavaScript formatting agrees with WordPress ESLint.`,
    );
    return;
  }

  try {
    const actualConfig = readTsDefaultObjectConfig(
      fs.readFileSync(configPath, 'utf8'),
      relativePath,
    );
    if (!deepEqualJson(actualConfig, policy.generatedPrettierConfig)) {
      errors.push(
        `${relativePath} must match the generated WordPress JavaScript Prettier policy; found ${JSON.stringify(actualConfig)}, expected ${JSON.stringify(policy.generatedPrettierConfig)}.`,
      );
    }
  } catch (error) {
    errors.push(
      `${relativePath} must export a static generated WordPress JavaScript Prettier config: ${error instanceof Error ? error.message : String(error)}.`,
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

function validateCompatibilityPatches(repoRoot, packageJson, policy, errors) {
  const actualPatches = packageJson.patchedDependencies ?? {};
  const expectedPatches = policy.compatibilityPatches;
  const expectedPatchSha256 = policy.compatibilityPatchSha256;

  for (const [packageId, patchPath] of Object.entries(expectedPatches)) {
    if (actualPatches[packageId] !== patchPath) {
      errors.push(
        `package.json must declare patchedDependencies[${JSON.stringify(packageId)}]=${JSON.stringify(patchPath)}, found ${JSON.stringify(actualPatches[packageId] ?? null)}.`,
      );
    }

    const absolutePatchPath = path.join(repoRoot, patchPath);
    if (
      !fs.existsSync(absolutePatchPath) ||
      !fs.statSync(absolutePatchPath).isFile()
    ) {
      errors.push(
        `${patchPath} must exist as the compatibility patch for ${JSON.stringify(packageId)}.`,
      );
      continue;
    }

    const expectedHash = expectedPatchSha256[packageId];
    if (typeof expectedHash !== 'string') {
      errors.push(
        `${JSON.stringify(packageId)} is missing an expected SHA-256 digest in compatibilityPatchSha256.`,
      );
      continue;
    }
    const actualHash = crypto
      .createHash('sha256')
      .update(fs.readFileSync(absolutePatchPath))
      .digest('hex');
    if (actualHash !== expectedHash) {
      errors.push(
        `${patchPath} must match the expected SHA-256 compatibility patch digest for ${JSON.stringify(packageId)}, found ${JSON.stringify(actualHash)}.`,
      );
    }
  }

  for (const packageId of Object.keys(actualPatches)) {
    if (!(packageId in expectedPatches)) {
      errors.push(
        `package.json must not declare undocumented compatibility patch ${JSON.stringify(packageId)}.`,
      );
    }
  }
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

  validateNoTypeScriptEslintDevDependencies(
    'package.json',
    packageJson,
    errors,
  );

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

  if (packageJson.dependencies?.typia !== policy.typiaVersion) {
    errors.push(
      `package.json must declare dependencies.typia="${policy.typiaVersion}", found ${JSON.stringify(packageJson.dependencies?.typia ?? null)}.`,
    );
  }

  validateCompatibilityPatches(repoRoot, packageJson, policy, errors);

  if (
    devDependencies['@typescript/typescript6'] !== policy.typescript6Version
  ) {
    errors.push(
      `package.json must declare devDependencies["@typescript/typescript6"]="${policy.typescript6Version}", found ${JSON.stringify(devDependencies['@typescript/typescript6'] ?? null)}.`,
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

  if (
    scripts['ttsc-lint-compat:check'] !== policy.rootTtscLintCompatCheckScript
  ) {
    errors.push(
      `package.json must keep scripts["ttsc-lint-compat:check"]="${policy.rootTtscLintCompatCheckScript}", found ${JSON.stringify(scripts['ttsc-lint-compat:check'] ?? null)}.`,
    );
  }

  if (
    scripts['ttsc-lint-compat:sync'] !== policy.rootTtscLintCompatSyncScript
  ) {
    errors.push(
      `package.json must keep scripts["ttsc-lint-compat:sync"]="${policy.rootTtscLintCompatSyncScript}", found ${JSON.stringify(scripts['ttsc-lint-compat:sync'] ?? null)}.`,
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

  const expectedTtscRange = `^${policy.ttscVersion}`;
  const expectedTtscLintRange = `^${policy.ttscLintVersion}`;
  for (const relativePath of policy.workspaceExamplePackagePaths) {
    const examplePackageJson = readRelativeJson(repoRoot, relativePath);
    const examplePrettier = examplePackageJson.devDependencies?.prettier;

    validateNoTypeScriptEslintDevDependencies(
      relativePath,
      examplePackageJson,
      errors,
    );
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

  for (const relativePath of policy.workspaceExampleStaticLintConfigPaths) {
    const configPath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(configPath)) {
      errors.push(
        `${relativePath} must exist so the example remains independently runnable with @ttsc/lint.`,
      );
      continue;
    }

    try {
      const lintConfig = readTsDefaultObjectConfig(
        fs.readFileSync(configPath, 'utf8'),
        relativePath,
      );
      if (!deepEqualJson(lintConfig, policy.workspaceExampleTtscLintConfig)) {
        errors.push(
          `${relativePath} must export the documented example @ttsc/lint configuration; found ${JSON.stringify(lintConfig)}.`,
        );
      }
    } catch (error) {
      errors.push(
        `${relativePath} must export a statically readable example @ttsc/lint configuration: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }

  for (const relativePath of policy.workspaceWordPressLintConfigPaths) {
    const configPath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(configPath)) {
      errors.push(
        `${relativePath} must exist so the example remains independently runnable with @ttsc/lint.`,
      );
      continue;
    }
    const source = readRelativeText(repoRoot, relativePath);
    for (const requiredSource of [
      "from '@wp-typia/ttsc-lint-plugin-wp'",
      '...configs.wpScriptsRecommended',
      "'wordpress/i18n-text-domain'",
      'allowedTextDomain:',
    ]) {
      if (!source.includes(requiredSource)) {
        errors.push(
          `${relativePath} must include ${JSON.stringify(requiredSource)} for the WordPress ttsc check contract.`,
        );
      }
    }
  }

  for (const relativePath of policy.workspaceWordPressPrettierConfigPaths) {
    validateGeneratedPrettierConfig(repoRoot, relativePath, policy, errors);
  }

  for (const relativePath of policy.workspaceWordPressPrettierIgnorePaths) {
    try {
      const actualPatterns = readRelativeText(repoRoot, relativePath)
        .replace(/\r\n?/gu, '\n')
        .trimEnd()
        .split('\n');
      if (
        !deepEqualJson(actualPatterns, policy.generatedPrettierIgnorePatterns)
      ) {
        errors.push(
          `${relativePath} must ignore generated metadata and build outputs; found ${JSON.stringify(actualPatterns)}, expected ${JSON.stringify(policy.generatedPrettierIgnorePatterns)}.`,
        );
      }
    } catch (error) {
      errors.push(
        `${relativePath} must be readable: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }

  for (const relativePath of policy.wpScriptsExamplePackagePaths) {
    const examplePackageJson = readRelativeJson(repoRoot, relativePath);
    const exampleScripts = examplePackageJson.scripts ?? {};
    if (exampleScripts['check:code'] !== policy.exampleCodeCheckScript) {
      errors.push(
        `${relativePath} must keep scripts["check:code"]="${policy.exampleCodeCheckScript}", found ${JSON.stringify(exampleScripts['check:code'] ?? null)}.`,
      );
    }
    if (exampleScripts.check !== policy.exampleCheckScript) {
      errors.push(
        `${relativePath} must keep scripts.check="${policy.exampleCheckScript}", found ${JSON.stringify(exampleScripts.check ?? null)}.`,
      );
    }
    if (exampleScripts['check:style'] !== policy.exampleStyleCheckScript) {
      errors.push(
        `${relativePath} must keep scripts["check:style"]="${policy.exampleStyleCheckScript}", found ${JSON.stringify(exampleScripts['check:style'] ?? null)}.`,
      );
    }
    if (exampleScripts['check:format'] !== policy.exampleFormatCheckScript) {
      errors.push(
        `${relativePath} must keep scripts["check:format"]="${policy.exampleFormatCheckScript}", found ${JSON.stringify(exampleScripts['check:format'] ?? null)}.`,
      );
    }
    if (exampleScripts.format !== policy.exampleWpScriptsFormatScript) {
      errors.push(
        `${relativePath} must keep scripts.format="${policy.exampleWpScriptsFormatScript}" so Prettier owns JS/CJS/MJS and other non-TypeScript formatting, found ${JSON.stringify(exampleScripts.format ?? null)}.`,
      );
    }
    for (const removedScript of REMOVED_LEGACY_SCRIPTS) {
      if (removedScript in exampleScripts) {
        errors.push(
          `${relativePath} must not define the legacy scripts.${removedScript}; examples expose check:code and check instead.`,
        );
      }
    }
  }

  const generatedManifests = new Map();
  for (const relativePath of policy.generatedPackageManifestPaths) {
    try {
      const sourceText = readRelativeText(repoRoot, relativePath);
      const manifest = validateGeneratedTemplateManifest(
        relativePath,
        sourceText,
        policy,
        errors,
      );
      generatedManifests.set(relativePath, manifest);
    } catch (error) {
      errors.push(
        `${relativePath} must be a readable valid JSON generated package manifest: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }

  for (const relativePath of policy.generatedWpScriptsStyleLintManifestPaths) {
    const manifest = generatedManifests.get(relativePath);
    if (!manifest) {
      continue;
    }
    validateGeneratedStyleLintManifest(relativePath, manifest, policy, errors);
  }

  for (const relativePath of policy.generatedWordPressTtscLintConfigPaths) {
    try {
      const source = readRelativeText(repoRoot, relativePath);
      for (const requiredSource of [
        "from '@wp-typia/ttsc-lint-plugin-wp'",
        '...configs.wpScriptsRecommended',
        "'wordpress/i18n-text-domain'",
        "allowedTextDomain: '{{textDomain}}'",
      ]) {
        if (!source.includes(requiredSource)) {
          errors.push(
            `${relativePath} must include ${JSON.stringify(requiredSource)} for the generated WordPress ttsc lint contract.`,
          );
        }
      }
      const format = readTsDefaultObjectProperty(
        source,
        relativePath,
        'format',
      );
      if (!deepEqualJson(format, policy.generatedTtscLintFormat)) {
        errors.push(
          `${relativePath} must keep generated ttsc formatting write-only during check:code; found ${JSON.stringify(format)}, expected ${JSON.stringify(policy.generatedTtscLintFormat)}.`,
        );
      }
    } catch (error) {
      errors.push(
        `${relativePath} must be a readable generated WordPress ttsc lint config: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }

  for (const templateRoot of policy.generatedTtscLintCompatTemplateRoots) {
    validateGeneratedPrettierConfig(
      repoRoot,
      path.join(templateRoot, `${policy.generatedPrettierConfigPath}.mustache`),
      policy,
      errors,
    );
    const prettierIgnorePath = path.join(
      templateRoot,
      `${policy.generatedPrettierIgnorePath}.mustache`,
    );
    try {
      const actualPatterns = readRelativeText(repoRoot, prettierIgnorePath)
        .replace(/\r\n?/gu, '\n')
        .trimEnd()
        .split('\n');
      if (
        !deepEqualJson(actualPatterns, policy.generatedPrettierIgnorePatterns)
      ) {
        errors.push(
          `${prettierIgnorePath} must ignore generated metadata and build outputs; found ${JSON.stringify(actualPatterns)}, expected ${JSON.stringify(policy.generatedPrettierIgnorePatterns)}.`,
        );
      }
    } catch (error) {
      errors.push(
        `${prettierIgnorePath} must be readable: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }

  const canonicalTtscLintCompatRelativePath = path.join(
    policy.generatedTtscLintCompatCanonicalTemplateRoot,
    policy.generatedTtscLintCompatTemplatePath,
  );
  const canonicalTtscLintCompatPath = path.join(
    repoRoot,
    canonicalTtscLintCompatRelativePath,
  );
  const generatedTtscLintCompatSource = fs.existsSync(
    canonicalTtscLintCompatPath,
  )
    ? fs.readFileSync(canonicalTtscLintCompatPath, 'utf8')
    : null;
  for (const templateRoot of policy.generatedTtscLintCompatTemplateRoots) {
    validateGeneratedTtscLintCompatSource(
      repoRoot,
      path.join(templateRoot, policy.generatedTtscLintCompatTemplatePath),
      policy,
      generatedTtscLintCompatSource,
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
