import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  resolveSyncBlockMetadataPaths,
  type SyncBlockMetadataOptions,
  type SyncBlockMetadataReport,
} from '@wp-typia/block-runtime/metadata-core';
import ts from 'typescript';

import {
  formatInstallCommand,
  formatRunScript,
  inferPackageManagerId,
} from '../shared/package-managers.js';
import {
  findPhpFunctionCallEnd,
  findPhpFunctionRange,
  getPhpCodeBraceDepth,
  hasPhpFunctionCall,
  hasPhpFunctionCallWithStringArguments,
  type PhpFunctionRange,
} from '../shared/php-utils.js';
import { readJsonFileSync } from '../shared/json-utils.js';
import {
  createDoctorCheck,
  createDoctorScopeCheck,
} from './cli-doctor-workspace-shared.js';
import {
  containsCompletion,
  countOuterParserContinues,
  getSafeErrorConstruction,
  hasCanonicalRuntimeImports,
  hasCanonicalUnknownFlagThrow,
  hasEarlierAbruptCompletion,
  hasOnlyCanonicalParserEffects,
  isAllowedSyncHelperTopLevelStatement,
  isCanonicalSyncMainCatchHandler,
  unwrapStaticExpression,
} from './cli-doctor-standalone-control-flow.js';
import {
  checkStandaloneRestArtifacts,
  parseStandaloneRestConfig,
  STANDALONE_PERSISTENCE_BLOCK_SCHEMA_ARTIFACTS,
  standaloneProjectRequiresRest,
} from './cli-doctor-standalone-rest.js';

import type { DoctorCheck } from './cli-doctor.js';
import type { ParsedStandaloneRestConfig } from './cli-doctor-standalone-rest.js';
import type { GeneratedPackageJson } from '../shared/package-json-types.js';

const STANDALONE_SYNC_SCRIPT = path.join(
  'scripts',
  'sync-types-to-block-json.ts',
);
const STANDALONE_SYNC_PROJECT_SCRIPT = path.join('scripts', 'sync-project.ts');
const STANDALONE_SYNC_REST_SCRIPT = path.join(
  'scripts',
  'sync-rest-contracts.ts',
);
const STANDALONE_INDEX_FILE = path.join('src', 'index.tsx');
const STANDALONE_EDIT_FILE = path.join('src', 'edit.tsx');
const STANDALONE_SAVE_FILE = path.join('src', 'save.tsx');
const STANDALONE_TYPES_FILE = path.join('src', 'types.ts');
const STANDALONE_VALIDATORS_FILE = path.join('src', 'validators.ts');
const STANDALONE_BLOCK_JSON_FILE = 'src/block.json';
const STANDALONE_MANIFEST_FILE = 'src/typia.manifest.json';
const STANDALONE_COMMON_SOURCE_FILES = [
  STANDALONE_SYNC_SCRIPT,
  STANDALONE_SYNC_PROJECT_SCRIPT,
  STANDALONE_INDEX_FILE,
  STANDALONE_EDIT_FILE,
  STANDALONE_TYPES_FILE,
  STANDALONE_SAVE_FILE,
  STANDALONE_VALIDATORS_FILE,
  path.join('src', 'hooks.ts'),
  path.join('src', 'block-metadata.ts'),
  path.join('src', 'manifest-document.ts'),
  path.join('src', 'manifest-defaults-document.ts'),
  path.join('src', 'validator-toolkit.ts'),
  path.join('src', 'style.scss'),
] as const;
const STANDALONE_BASIC_SOURCE_FILES = [
  path.join('src', 'editor.scss'),
  path.join('src', 'render.php'),
] as const;
const STANDALONE_INTERACTIVITY_SOURCE_FILES = [
  path.join('src', 'editor.scss'),
  path.join('src', 'interactivity.ts'),
  path.join('src', 'interactivity-store.ts'),
] as const;
const STANDALONE_PERSISTENCE_SOURCE_FILES = [
  STANDALONE_SYNC_REST_SCRIPT,
  path.join('src', 'api-types.ts'),
  path.join('src', 'api-validators.ts'),
  path.join('src', 'api.ts'),
  path.join('src', 'data.ts'),
  path.join('src', 'transport.ts'),
  path.join('src', 'interactivity.ts'),
  path.join('src', 'render.php'),
] as const;
// WordPress core's get_file_data() reads the first 8 KiB for plugin headers.
const WORDPRESS_PLUGIN_HEADER_SCAN_BYTES = 8 * 1024;
// Mirrors get_file_data()'s `[ \t\/*#@]*` header prefix. Its zero-length
// match is intentional: WordPress recognizes a bare `Plugin Name:` line too.
const WORDPRESS_PLUGIN_NAME_HEADER_PATTERN =
  /^[\t \/*#@]*Plugin Name[\t ]*:[\t ]*\S[^\r\n]*$/imu;
const REQUIRED_RUNTIME_PACKAGES = [
  '@wp-typia/block-runtime',
  '@wp-typia/block-types',
  'typia',
] as const;
const REQUIRED_WORDPRESS_RUNTIME_PACKAGES = [
  '@wordpress/block-editor',
  '@wordpress/blocks',
  '@wordpress/components',
  '@wordpress/element',
  '@wordpress/i18n',
] as const;
const REQUIRED_INTERACTIVITY_RUNTIME_PACKAGES = [
  '@wordpress/interactivity',
] as const;
const REQUIRED_REST_RUNTIME_PACKAGES = [
  '@wp-typia/rest',
  '@wp-typia/api-client',
] as const;
const REQUIRED_REST_WORDPRESS_RUNTIME_PACKAGES = [
  '@wordpress/api-fetch',
  '@wordpress/data',
] as const;
const REQUIRED_INSTALLED_PACKAGES = [
  {
    diagnosticName: '@wp-typia/block-runtime/metadata-core',
    packageName: '@wp-typia/block-runtime',
    resolutionSpecifier: '@wp-typia/block-runtime/metadata-core',
  },
  {
    diagnosticName: '@wp-typia/block-types',
    packageName: '@wp-typia/block-types',
    resolutionSpecifier: '@wp-typia/block-types',
  },
  {
    diagnosticName: 'typia',
    packageName: 'typia',
    resolutionSpecifier: 'typia',
  },
  {
    diagnosticName: 'typescript',
    packageName: 'typescript',
    resolutionSpecifier: 'typescript',
  },
  {
    diagnosticName: 'tsx',
    packageName: 'tsx',
    resolutionSpecifier: 'tsx/cli',
  },
  {
    diagnosticName: '@wordpress/scripts',
    packageName: '@wordpress/scripts',
    resolutionSpecifier: '@wordpress/scripts/bin/wp-scripts.js',
  },
  {
    diagnosticName: '@typia/unplugin/webpack',
    packageName: '@typia/unplugin',
    resolutionSpecifier: '@typia/unplugin/webpack',
  },
  // Resolve manifests so import-only packages such as
  // @wordpress/interactivity remain verifiable through createRequire().
  ...REQUIRED_WORDPRESS_RUNTIME_PACKAGES.map((packageName) => ({
    diagnosticName: packageName,
    packageName,
    resolutionSpecifier: `${packageName}/package.json`,
  })),
] as const;
const REQUIRED_INTERACTIVITY_INSTALLED_PACKAGES =
  REQUIRED_INTERACTIVITY_RUNTIME_PACKAGES.map((packageName) => ({
    diagnosticName: packageName,
    packageName,
    resolutionSpecifier: `${packageName}/package.json`,
  }));
const REQUIRED_REST_INSTALLED_PACKAGES = [
  {
    diagnosticName: '@wp-typia/rest',
    packageName: '@wp-typia/rest',
    resolutionSpecifier: '@wp-typia/rest',
  },
  {
    diagnosticName: '@wp-typia/api-client',
    packageName: '@wp-typia/api-client',
    resolutionSpecifier: '@wp-typia/api-client',
  },
  {
    diagnosticName: '@wp-typia/rest/react',
    packageName: '@wp-typia/rest',
    resolutionSpecifier: '@wp-typia/rest/react',
  },
  ...REQUIRED_REST_WORDPRESS_RUNTIME_PACKAGES.map((packageName) => ({
    diagnosticName: packageName,
    packageName,
    resolutionSpecifier: `${packageName}/package.json`,
  })),
] as const;

/** Stable codes emitted by standalone-scaffold doctor rows. */
export const STANDALONE_DOCTOR_CODES = {
  ARTIFACTS: 'wp-typia.standalone.generated-artifacts',
  BOOTSTRAP: 'wp-typia.standalone.bootstrap',
  DEPENDENCIES: 'wp-typia.standalone.dependencies',
  PACKAGE: 'wp-typia.standalone.package',
  SOURCE_LAYOUT: 'wp-typia.standalone.source-layout',
} as const;

type StandalonePackageJson = GeneratedPackageJson;

interface ParsedStandaloneSyncConfig {
  options: SyncBlockMetadataOptions | null;
  problem: string | null;
}

type ExpectedRestRegistration = Pick<
  NonNullable<ParsedStandaloneRestConfig['manifest']>['endpoints'][number],
  'method' | 'path'
>;

const WORDPRESS_REST_METHOD_CONSTANTS = {
  DELETE: 'DELETABLE',
  GET: 'READABLE',
  PATCH: 'EDITABLE',
  POST: 'CREATABLE',
  PUT: 'EDITABLE',
} as const satisfies Record<ExpectedRestRegistration['method'], string>;

type StandaloneMetadataCoreModule = Pick<
  typeof import('@wp-typia/block-runtime/metadata-core'),
  | 'defineEndpointManifest'
  | 'resolveSyncBlockMetadataPaths'
  | 'runSyncBlockMetadata'
  | 'syncEndpointClient'
  | 'syncRestOpenApi'
  | 'syncTypeSchemas'
>;

/** A safely detected type-derived standalone wp-typia block project. */
export interface StandaloneScaffoldProject {
  packageJson: StandalonePackageJson;
  packageName: string;
  projectDir: string;
}

function getDeclaredDependency(
  packageJson: StandalonePackageJson,
  packageName: string,
): string | undefined {
  return (
    packageJson.dependencies?.[packageName] ??
    packageJson.devDependencies?.[packageName]
  );
}

function getSafePackageBaseName(packageName: string): string | null {
  const match =
    /^(?:@[a-z0-9][a-z0-9._-]*\/)?([a-z0-9][a-z0-9._-]*)$/iu.exec(
      packageName,
    );
  return match?.[1] ?? null;
}

function isStandaloneScaffoldCandidate(
  projectDir: string,
  packageJson: StandalonePackageJson,
): boolean {
  if (packageJson.wpTypia?.projectType === 'workspace') {
    return false;
  }
  if (fs.existsSync(path.join(projectDir, 'src', 'blocks'))) {
    // Compound and workspace scaffolds share sync scripts and dependencies
    // with the single-block template, but their canonical source boundary is
    // src/blocks/* rather than root src/types.ts + src/save.tsx.
    return false;
  }

  const syncTypesScript = packageJson.scripts?.['sync-types'];
  const syncSurfaceSignals = [
    typeof syncTypesScript === 'string' &&
      syncTypesScript.includes('sync-types-to-block-json'),
    fs.existsSync(path.join(projectDir, STANDALONE_SYNC_SCRIPT)),
    fs.existsSync(path.join(projectDir, STANDALONE_TYPES_FILE)),
    fs.existsSync(path.join(projectDir, STANDALONE_SAVE_FILE)),
  ].filter(Boolean).length;
  const dependencySignals = [
    '@wp-typia/block-runtime',
    '@wp-typia/block-types',
  ].filter(
    (packageName) =>
      typeof getDeclaredDependency(packageJson, packageName) === 'string',
  ).length;
  return (
    syncSurfaceSignals >= 3 ||
    (syncSurfaceSignals >= 2 && dependencySignals >= 1)
  );
}

function standaloneProjectRequiresInteractivity(
  project: StandaloneScaffoldProject,
  requiresRest: boolean,
): boolean {
  if (
    requiresRest ||
    typeof getDeclaredDependency(
      project.packageJson,
      '@wordpress/interactivity',
    ) === 'string' ||
    fs.existsSync(path.join(project.projectDir, 'src', 'interactivity.ts')) ||
    fs.existsSync(
      path.join(project.projectDir, 'src', 'interactivity-store.ts'),
    )
  ) {
    return true;
  }

  try {
    const blockJson = readJsonFileSync<{ viewScriptModule?: unknown }>(
      path.join(project.projectDir, STANDALONE_BLOCK_JSON_FILE),
      { context: 'standalone block metadata' },
    );
    const viewScriptModules = Array.isArray(blockJson.viewScriptModule)
      ? blockJson.viewScriptModule
      : [blockJson.viewScriptModule];
    return viewScriptModules.includes('file:./interactivity.js');
  } catch {
    return false;
  }
}

/**
 * Resolve the nearest supported type-derived standalone scaffold.
 *
 * Detection deliberately combines generated sync/layout signals with wp-typia
 * dependency signals. Requiring every signal would make a damaged scaffold
 * fall back to the misleading environment-only scope, while the weighted
 * threshold avoids treating an arbitrary WordPress package as generated merely
 * because it contains one similarly named file or dependency.
 *
 * @throws {Error} When the nearest package manifest cannot be parsed.
 */
export function tryResolveStandaloneScaffoldProject(
  startDir: string,
): StandaloneScaffoldProject | null {
  let currentDir = path.resolve(startDir);

  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = readJsonFileSync<StandalonePackageJson>(
        packageJsonPath,
        { context: 'standalone scaffold package manifest' },
      );
      if (isStandaloneScaffoldCandidate(currentDir, packageJson)) {
        return {
          packageJson,
          packageName:
            typeof packageJson.name === 'string' &&
            packageJson.name.trim().length > 0
              ? packageJson.name.trim()
              : path.basename(currentDir),
          projectDir: currentDir,
        };
      }

      // A package manifest establishes the nearest project boundary. Do not
      // let an unrelated standalone scaffold in an ancestor directory claim
      // a nested repository or package that has its own manifest.
      return null;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

function getObjectPropertyString(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): string | undefined {
  const property = getObjectPropertyAssignment(objectLiteral, propertyName);
  return property && ts.isStringLiteralLike(property.initializer)
    ? property.initializer.text
    : undefined;
}

function getObjectPropertyAssignment(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.PropertyAssignment | undefined {
  // Iterate in reverse so the last-defined property wins, matching JavaScript
  // object-literal duplicate-key semantics.
  for (const property of [...objectLiteral.properties].reverse()) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const name = property.name;
    const resolvedName =
      ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
    if (resolvedName !== propertyName) {
      continue;
    }
    return property;
  }
  return undefined;
}

function hasUnsupportedSyncOptionSyntax(
  objectLiteral: ts.ObjectLiteralExpression,
): boolean {
  return objectLiteral.properties.some(
    (property) =>
      !ts.isPropertyAssignment(property) ||
      ts.isComputedPropertyName(property.name),
  );
}

function getCanonicalSyncImportBindings(sourceFile: ts.SourceFile): Set<string> {
  const bindings = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !==
        '@wp-typia/block-runtime/metadata-core' ||
      statement.importClause?.isTypeOnly ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    for (const element of statement.importClause.namedBindings.elements) {
      if (element.isTypeOnly) {
        continue;
      }
      const importedName = (element.propertyName ?? element.name).text;
      if (importedName === 'runSyncBlockMetadata') {
        bindings.add(element.name.text);
      }
    }
  }
  return bindings;
}

function bindingNameContains(
  name: ts.BindingName | undefined,
  bindings: ReadonlySet<string>,
): boolean {
  if (!name) {
    return false;
  }
  if (ts.isIdentifier(name)) {
    return bindings.has(name.text);
  }
  return name.elements.some(
    (element) =>
      !ts.isOmittedExpression(element) &&
      bindingNameContains(element.name, bindings),
  );
}

function hasShadowedBinding(
  root: ts.Node,
  bindings: ReadonlySet<string>,
): boolean {
  let shadowed = false;

  function visit(node: ts.Node): void {
    if (shadowed || ts.isImportDeclaration(node)) {
      return;
    }

    let declaredName: ts.BindingName | undefined;
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
      declaredName = node.name;
    } else if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isClassDeclaration(node) ||
      ts.isClassExpression(node) ||
      ts.isEnumDeclaration(node) ||
      (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly)
    ) {
      declaredName = node.name;
    }

    if (bindingNameContains(declaredName, bindings)) {
      shadowed = true;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(root);
  return shadowed;
}

function hasImportedBinding(
  sourceFile: ts.SourceFile,
  bindingName: string,
): boolean {
  return sourceFile.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !statement.importClause ||
      statement.importClause.isTypeOnly
    ) {
      return false;
    }
    const { name, namedBindings } = statement.importClause;
    if (name?.text === bindingName) {
      return true;
    }
    if (namedBindings && ts.isNamespaceImport(namedBindings)) {
      return namedBindings.name.text === bindingName;
    }
    return (
      namedBindings !== undefined &&
      ts.isNamedImports(namedBindings) &&
      namedBindings.elements.some(
        (element) =>
          !element.isTypeOnly && element.name.text === bindingName,
      )
    );
  });
}

const TRUSTED_SYNC_HELPER_GLOBALS = new Set([
  'Error',
  'Object',
  'console',
  'process',
]);
const SYNC_TYPES_RUNTIME_IMPORTS = new Map([
  [
    '@wp-typia/block-runtime/metadata-core',
    { namedBindings: new Set(['runSyncBlockMetadata']) },
  ],
]);
const SYNC_PROJECT_RUNTIME_IMPORTS = new Map([
  ['node:child_process', { namedBindings: new Set(['spawnSync']) }],
  ['node:fs', { defaultBinding: 'fs' }],
  ['node:path', { defaultBinding: 'path' }],
]);

function hasOverriddenTrustedSyncHelperGlobal(
  sourceFile: ts.SourceFile,
): boolean {
  return (
    [...TRUSTED_SYNC_HELPER_GLOBALS].some((binding) =>
      hasImportedBinding(sourceFile, binding),
    ) || hasShadowedBinding(sourceFile, TRUSTED_SYNC_HELPER_GLOBALS)
  );
}

function getAwaitedCallFromVariableStatement(
  statement: ts.Statement,
): { binding: string; call: ts.CallExpression } | null {
  if (
    !ts.isVariableStatement(statement) ||
    !(statement.declarationList.flags & ts.NodeFlags.Const) ||
    statement.declarationList.declarations.length !== 1
  ) {
    return null;
  }
  const declaration = statement.declarationList.declarations[0];
  const initializer = declaration.initializer;
  return initializer &&
    ts.isIdentifier(declaration.name) &&
    ts.isAwaitExpression(initializer) &&
    ts.isCallExpression(initializer.expression)
    ? { binding: declaration.name.text, call: initializer.expression }
    : null;
}

function hasCanonicalSyncExecutionOptions(
  expression: ts.Expression,
  optionsBinding: string,
): boolean {
  if (!ts.isObjectLiteralExpression(expression)) {
    return false;
  }
  const expectedProperties = ['check', 'failOnLossy', 'strict'];
  return (
    expression.properties.length === expectedProperties.length &&
    expectedProperties.every((propertyName) =>
      expression.properties.some(
        (property) =>
          ts.isPropertyAssignment(property) &&
          !ts.isComputedPropertyName(property.name) &&
          (ts.isIdentifier(property.name) ||
            ts.isStringLiteral(property.name)) &&
          property.name.text === propertyName &&
          ts.isPropertyAccessExpression(property.initializer) &&
          ts.isIdentifier(property.initializer.expression) &&
          property.initializer.expression.text === optionsBinding &&
          property.initializer.name.text === propertyName,
      ),
    )
  );
}

function isCanonicalSyncReportErrorGuard(
  statement: ts.Statement,
  reportBinding: string,
): boolean {
  if (
    !ts.isIfStatement(statement) ||
    statement.elseStatement ||
    !ts.isBinaryExpression(statement.expression) ||
    statement.expression.operatorToken.kind !==
      ts.SyntaxKind.EqualsEqualsEqualsToken ||
    !isResultPropertyAccess(
      statement.expression.left,
      reportBinding,
      'status',
    ) ||
    !ts.isStringLiteralLike(statement.expression.right) ||
    statement.expression.right.text !== 'error' ||
    !ts.isBlock(statement.thenStatement) ||
    statement.thenStatement.statements.length !== 1
  ) {
    return false;
  }
  const assignment = statement.thenStatement.statements[0];
  return (
    ts.isExpressionStatement(assignment) &&
    ts.isBinaryExpression(assignment.expression) &&
    assignment.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(assignment.expression.left) &&
    ts.isIdentifier(assignment.expression.left.expression) &&
    assignment.expression.left.expression.text === 'process' &&
    assignment.expression.left.name.text === 'exitCode' &&
    ts.isNumericLiteral(assignment.expression.right) &&
    assignment.expression.right.text === '1'
  );
}

function findSyncOptionsObject(
  sourceFile: ts.SourceFile,
  syncImportBindings: ReadonlySet<string>,
): ts.ObjectLiteralExpression | null {
  const main = getSingleTopLevelFunction(sourceFile, 'main');
  if (
    !main?.body ||
    !main.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
    ) ||
    hasShadowedBinding(main, new Set(['parseCliOptions'])) ||
    !hasCanonicalRuntimeImports(sourceFile, SYNC_TYPES_RUNTIME_IMPORTS) ||
    !hasCanonicalCheckParser(sourceFile, [
      { flagName: '--strict', propertyName: 'strict' },
      { flagName: '--fail-on-lossy', propertyName: 'failOnLossy' },
    ], true) ||
    !hasTopLevelMainInvocation(
      sourceFile,
      new Set(['@wp-typia/block-runtime/metadata-core']),
    )
  ) {
    return null;
  }
  const statements = [...main.body.statements];
  const optionsDeclaration = getDirectVariableBinding(
    statements,
    isParseCliOptionsCall,
  );
  if (!optionsDeclaration) {
    return null;
  }

  const calls = statements.flatMap((statement, index) => {
    const awaitedCall = getAwaitedCallFromVariableStatement(statement);
    const call = awaitedCall?.call;
    if (
      !call ||
      !ts.isIdentifier(call.expression) ||
      !syncImportBindings.has(call.expression.text) ||
      call.arguments.length !== 2 ||
      !ts.isObjectLiteralExpression(call.arguments[0]) ||
      !hasCanonicalSyncExecutionOptions(
        call.arguments[1],
        optionsDeclaration.binding,
      )
    ) {
      return [];
    }
    return [
      {
        index,
        options: call.arguments[0],
        reportBinding: awaitedCall.binding,
      },
    ];
  });
  if (calls.length !== 1) {
    return null;
  }
  const [call] = calls;
  if (
    call.index !== optionsDeclaration.index + 1 ||
    hasEarlierAbruptCompletion(statements, call.index)
  ) {
    return null;
  }
  const errorGuardIndexes = statements.flatMap((statement, index) =>
    index > call.index &&
    isCanonicalSyncReportErrorGuard(statement, call.reportBinding)
      ? [index]
      : [],
  );
  const errorGuardIndex = errorGuardIndexes[0];
  return errorGuardIndexes.length === 1 &&
    errorGuardIndex === statements.length - 1 &&
    hasCanonicalSyncReportRendering(
      sourceFile,
      statements.slice(call.index + 1, errorGuardIndex),
      optionsDeclaration.binding,
      call.reportBinding,
    ) &&
    !hasEarlierAbruptCompletion(
      statements.slice(call.index + 1),
      errorGuardIndex - call.index - 1,
    )
    ? call.options
    : null;
}

function hasTypeScriptSyntaxErrors(source: string, fileName: string): boolean {
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.Latest },
    fileName,
    reportDiagnostics: true,
  });
  return (result.diagnostics ?? []).some(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
}

function isProjectLocalRelativePath(relativePath: string): boolean {
  return (
    relativePath.length > 0 &&
    !relativePath.startsWith(`..${path.sep}`) &&
    relativePath !== '..' &&
    !path.isAbsolute(relativePath)
  );
}

function isSafeProjectRelativePath(
  projectDir: string,
  filePath: string,
): boolean {
  if (path.isAbsolute(filePath)) {
    return false;
  }
  return isProjectLocalRelativePath(
    path.relative(projectDir, path.resolve(projectDir, filePath)),
  );
}

function parseStandaloneSyncConfig(
  project: StandaloneScaffoldProject,
): ParsedStandaloneSyncConfig {
  const syncScriptPath = path.join(project.projectDir, STANDALONE_SYNC_SCRIPT);
  let source: string;
  try {
    source = fs.readFileSync(syncScriptPath, 'utf8');
  } catch {
    return {
      options: null,
      problem: `Unable to read generated helper ${STANDALONE_SYNC_SCRIPT}`,
    };
  }

  const sourceFile = ts.createSourceFile(
    syncScriptPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  if (hasTypeScriptSyntaxErrors(source, syncScriptPath)) {
    return {
      options: null,
      problem: `${STANDALONE_SYNC_SCRIPT} contains TypeScript syntax errors.`,
    };
  }

  const syncImportBindings = getCanonicalSyncImportBindings(sourceFile);
  if (hasShadowedBinding(sourceFile, syncImportBindings)) {
    return {
      options: null,
      problem:
        `${STANDALONE_SYNC_SCRIPT} must not shadow its canonical ` +
        'runSyncBlockMetadata() import binding.',
    };
  }
  const optionsObject = findSyncOptionsObject(sourceFile, syncImportBindings);
  if (!optionsObject) {
    return {
      options: null,
      problem:
        `${STANDALONE_SYNC_SCRIPT} must import and call ` +
        'runSyncBlockMetadata() from @wp-typia/block-runtime/metadata-core with a static options object.',
    };
  }

  if (hasUnsupportedSyncOptionSyntax(optionsObject)) {
    return {
      options: null,
      problem:
        `${STANDALONE_SYNC_SCRIPT} must use direct static property ` +
        'assignments; spread, shorthand, and computed properties are not supported.',
    };
  }

  if (
    optionsObject.properties.some(
      (property) =>
        ts.isPropertyAssignment(property) &&
        !ts.isComputedPropertyName(property.name) &&
        (ts.isIdentifier(property.name) ||
          ts.isStringLiteral(property.name)) &&
        property.name.text === 'projectRoot',
    )
  ) {
    return {
      options: null,
      problem:
        `${STANDALONE_SYNC_SCRIPT} must not override projectRoot; ` +
        'standalone sync helpers must run from their package root.',
    };
  }

  const blockJsonFile = getObjectPropertyString(optionsObject, 'blockJsonFile');
  const sourceTypeName = getObjectPropertyString(
    optionsObject,
    'sourceTypeName',
  );
  const typesFile = getObjectPropertyString(optionsObject, 'typesFile');
  if (!blockJsonFile || !sourceTypeName || !typesFile) {
    return {
      options: null,
      problem:
        `${STANDALONE_SYNC_SCRIPT} must define static blockJsonFile, ` +
        'sourceTypeName, and typesFile values.',
    };
  }

  const optionalArtifactPathNames = [
    'jsonSchemaFile',
    'manifestFile',
    'openApiFile',
    'phpValidatorFile',
  ] as const;
  const nonLiteralOptionalPath = optionalArtifactPathNames.find(
    (propertyName) => {
      const property = getObjectPropertyAssignment(
        optionsObject,
        propertyName,
      );
      return property && !ts.isStringLiteralLike(property.initializer);
    },
  );
  if (nonLiteralOptionalPath) {
    return {
      options: null,
      problem:
        `${STANDALONE_SYNC_SCRIPT} must define optional artifact path ` +
        `${nonLiteralOptionalPath} as a static string value.`,
    };
  }

  const optionalPaths = {
    jsonSchemaFile: getObjectPropertyString(optionsObject, 'jsonSchemaFile'),
    manifestFile: getObjectPropertyString(optionsObject, 'manifestFile'),
    openApiFile: getObjectPropertyString(optionsObject, 'openApiFile'),
    phpValidatorFile: getObjectPropertyString(
      optionsObject,
      'phpValidatorFile',
    ),
  };
  const configuredPaths = [
    blockJsonFile,
    typesFile,
    ...Object.values(optionalPaths).filter(
      (filePath): filePath is string => typeof filePath === 'string',
    ),
  ];
  const unsafePath = configuredPaths.find(
    (filePath) => !isSafeProjectRelativePath(project.projectDir, filePath),
  );
  if (unsafePath) {
    return {
      options: null,
      problem: `${STANDALONE_SYNC_SCRIPT} references a path outside the project root: ${unsafePath}`,
    };
  }
  if (
    blockJsonFile !== STANDALONE_BLOCK_JSON_FILE ||
    optionalPaths.manifestFile !== STANDALONE_MANIFEST_FILE
  ) {
    return {
      options: null,
      problem:
        `${STANDALONE_SYNC_SCRIPT} must use canonical ` +
        `${STANDALONE_BLOCK_JSON_FILE} and ${STANDALONE_MANIFEST_FILE} artifact paths.`,
    };
  }

  return {
    options: {
      blockJsonFile,
      ...(optionalPaths.jsonSchemaFile
        ? { jsonSchemaFile: optionalPaths.jsonSchemaFile }
        : {}),
      ...(optionalPaths.manifestFile
        ? { manifestFile: optionalPaths.manifestFile }
        : {}),
      ...(optionalPaths.openApiFile
        ? { openApiFile: optionalPaths.openApiFile }
        : {}),
      ...(optionalPaths.phpValidatorFile
        ? { phpValidatorFile: optionalPaths.phpValidatorFile }
        : {}),
      projectRoot: project.projectDir,
      sourceTypeName,
      typesFile,
    },
    problem: null,
  };
}

function isSyncScriptPathExpression(
  expression: ts.Expression,
  expectedScriptPath: string,
): boolean {
  const pathParts = expectedScriptPath.split(path.sep);
  if (ts.isStringLiteralLike(expression)) {
    return expression.text === pathParts.join('/');
  }
  return (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    ts.isIdentifier(expression.expression.expression) &&
    expression.expression.expression.text === 'path' &&
    expression.expression.name.text === 'join' &&
    expression.arguments.length === pathParts.length &&
    expression.arguments.every(
      (argument, index) =>
        ts.isStringLiteralLike(argument) &&
        argument.text === pathParts[index],
    )
  );
}

function getNamedImportBindingsFromModule(
  sourceFile: ts.SourceFile,
  moduleName: string,
  importedName: string,
): Set<string> {
  const bindings = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== moduleName ||
      statement.importClause?.isTypeOnly ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    for (const element of statement.importClause.namedBindings.elements) {
      if (
        !element.isTypeOnly &&
        (element.propertyName ?? element.name).text === importedName
      ) {
        bindings.add(element.name.text);
      }
    }
  }
  return bindings;
}

function hasCanonicalDefaultImport(
  sourceFile: ts.SourceFile,
  moduleName: string,
  localName: string,
): boolean {
  return sourceFile.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === moduleName &&
      !statement.importClause?.isTypeOnly &&
      statement.importClause?.name?.text === localName,
  );
}

function getSingleTopLevelFunction(
  sourceFile: ts.SourceFile,
  functionName: string,
): ts.FunctionDeclaration | null {
  const declarations = sourceFile.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === functionName &&
      statement.body !== undefined,
  );
  return declarations.length === 1 ? declarations[0] : null;
}

function getDirectCall(statement: ts.Statement): ts.CallExpression | null {
  return ts.isExpressionStatement(statement) &&
    ts.isCallExpression(statement.expression)
    ? statement.expression
    : null;
}

function isDirectMethodCall(
  statement: ts.Statement,
  objectBinding: string,
  methodName: string,
  argument: string,
): boolean {
  const call = getDirectCall(statement);
  return (
    call !== null &&
    ts.isPropertyAccessExpression(call.expression) &&
    ts.isIdentifier(call.expression.expression) &&
    call.expression.expression.text === objectBinding &&
    call.expression.name.text === methodName &&
    call.arguments.length === 1 &&
    ts.isStringLiteralLike(call.arguments[0]) &&
    call.arguments[0].text === argument
  );
}

function isDirectRunSyncCall(
  statement: ts.Statement,
  scriptPathBinding: string,
  optionsBinding: string,
): boolean {
  const call = getDirectCall(statement);
  return (
    call !== null &&
    ts.isIdentifier(call.expression) &&
    call.expression.text === 'runSyncScript' &&
    call.arguments.length === 2 &&
    ts.isIdentifier(call.arguments[0]) &&
    call.arguments[0].text === scriptPathBinding &&
    ts.isIdentifier(call.arguments[1]) &&
    call.arguments[1].text === optionsBinding
  );
}

function isNonTargetArgumentGuard(
  node: ts.Node,
  argumentBinding: string,
  targetArgument: string,
): node is ts.IfStatement {
  if (
    !ts.isIfStatement(node) ||
    node.elseStatement ||
    !ts.isBinaryExpression(node.expression) ||
    node.expression.operatorToken.kind !==
      ts.SyntaxKind.EqualsEqualsEqualsToken
  ) {
    return false;
  }
  const { left, right } = node.expression;
  return (
    ((ts.isIdentifier(left) &&
      left.text === argumentBinding &&
      ts.isStringLiteralLike(right) &&
      right.text !== targetArgument) ||
      (ts.isStringLiteralLike(left) &&
        left.text !== targetArgument &&
        ts.isIdentifier(right) &&
        right.text === argumentBinding))
  );
}

type ParserControlFlowCheck = 'outer-break-or-return' | 'unsafe-continue';

function isLoopStatement(node: ts.Node): boolean {
  return (
    ts.isDoStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isWhileStatement(node)
  );
}

function labelsLoop(statement: ts.Statement): boolean {
  let target = statement;
  while (ts.isLabeledStatement(target)) {
    target = target.statement;
  }
  return isLoopStatement(target);
}

function containsParserControlFlow(
  node: ts.Node,
  argumentBinding: string,
  check: ParserControlFlowCheck,
  breakableDepth = 0,
  loopDepth = 0,
  outerContinueIsSafe = false,
  activeLabels: ReadonlyMap<string, boolean> = new Map(),
  targetArgument = '--check',
): boolean {
  if (ts.isFunctionLike(node)) {
    return false;
  }
  if (check === 'outer-break-or-return') {
    if (ts.isReturnStatement(node)) {
      return true;
    }
    if (ts.isBreakStatement(node)) {
      return node.label
        ? !activeLabels.has(node.label.text)
        : breakableDepth === 0;
    }
  } else if (ts.isContinueStatement(node)) {
    return node.label
      ? activeLabels.get(node.label.text) !== true
      : loopDepth === 0 && !outerContinueIsSafe;
  }

  if (
    check === 'unsafe-continue' &&
    isNonTargetArgumentGuard(node, argumentBinding, targetArgument)
  ) {
    return containsParserControlFlow(
      node.thenStatement,
      argumentBinding,
      check,
      breakableDepth,
      loopDepth,
      true,
      activeLabels,
      targetArgument,
    );
  }

  if (ts.isLabeledStatement(node)) {
    const nestedLabels = new Map(activeLabels);
    nestedLabels.set(node.label.text, labelsLoop(node.statement));
    return containsParserControlFlow(
      node.statement,
      argumentBinding,
      check,
      breakableDepth,
      loopDepth,
      outerContinueIsSafe,
      nestedLabels,
      targetArgument,
    );
  }

  const nextBreakableDepth =
    breakableDepth +
    (isLoopStatement(node) || ts.isSwitchStatement(node) ? 1 : 0);
  const nextLoopDepth = loopDepth + (isLoopStatement(node) ? 1 : 0);
  let found = false;
  ts.forEachChild(node, (child) => {
    if (
      !found &&
      containsParserControlFlow(
        child,
        argumentBinding,
        check,
        nextBreakableDepth,
        nextLoopDepth,
        outerContinueIsSafe,
        activeLabels,
        targetArgument,
      )
    ) {
      found = true;
    }
  });
  return found;
}

function isResultPropertyAccess(
  expression: ts.Expression | undefined,
  resultBinding: string,
  propertyName: string,
): boolean {
  return (
    expression !== undefined &&
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === resultBinding &&
    expression.name.text === propertyName
  );
}

function isCanonicalStaticErrorThrow(statement: ts.Statement): boolean {
  if (!ts.isThrowStatement(statement) || !statement.expression) {
    return false;
  }
  const errorConstruction = getSafeErrorConstruction(statement.expression);
  return (
    errorConstruction !== null &&
    ts.isStringLiteralLike(errorConstruction.arguments![0])
  );
}

function isDirectFileNotFoundCondition(
  expression: ts.Expression,
  resultBinding: string,
): boolean {
  if (
    !ts.isBinaryExpression(expression) ||
    expression.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken ||
    !ts.isStringLiteralLike(expression.right) ||
    expression.right.text !== 'ENOENT' ||
    !ts.isPropertyAccessExpression(expression.left) ||
    expression.left.name.text !== 'code'
  ) {
    return false;
  }
  return isResultPropertyAccess(
    unwrapStaticExpression(expression.left.expression),
    resultBinding,
    'error',
  );
}

function isFileNotFoundHelperCondition(
  expression: ts.Expression,
  resultBinding: string,
): boolean {
  return (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'isFileNotFoundError' &&
    expression.arguments.length === 1 &&
    isResultPropertyAccess(expression.arguments[0], resultBinding, 'error')
  );
}

function hasCanonicalRunnerErrorGuard(
  sourceFile: ts.SourceFile,
  statement: ts.Statement | undefined,
  resultBinding: string,
): boolean {
  if (
    !statement ||
    !ts.isIfStatement(statement) ||
    statement.elseStatement ||
    !isResultPropertyAccess(statement.expression, resultBinding, 'error') ||
    !ts.isBlock(statement.thenStatement) ||
    statement.thenStatement.statements.length !== 2
  ) {
    return false;
  }
  const [fileNotFoundGuard, finalStatement] =
    statement.thenStatement.statements;
  if (
    !ts.isIfStatement(fileNotFoundGuard) ||
    fileNotFoundGuard.elseStatement ||
    !ts.isBlock(fileNotFoundGuard.thenStatement) ||
    fileNotFoundGuard.thenStatement.statements.length !== 1 ||
    !isCanonicalStaticErrorThrow(fileNotFoundGuard.thenStatement.statements[0])
  ) {
    return false;
  }
  const hasDirectCondition = isDirectFileNotFoundCondition(
    fileNotFoundGuard.expression,
    resultBinding,
  );
  const hasHelperCondition = isFileNotFoundHelperCondition(
    fileNotFoundGuard.expression,
    resultBinding,
  );
  return (
    (hasDirectCondition ||
      (hasHelperCondition &&
        hasCanonicalFileNotFoundErrorHelpers(sourceFile))) &&
    ts.isThrowStatement(finalStatement) &&
    isResultPropertyAccess(
      finalStatement.expression,
      resultBinding,
      'error',
    )
  );
}

function hasCanonicalRunnerStatusGuard(
  statement: ts.Statement | undefined,
  resultBinding: string,
  scriptPathBinding: string,
): boolean {
  if (
    !statement ||
    !ts.isIfStatement(statement) ||
    statement.elseStatement ||
    !ts.isBinaryExpression(statement.expression) ||
    statement.expression.operatorToken.kind !==
      ts.SyntaxKind.ExclamationEqualsEqualsToken ||
    !isResultPropertyAccess(
      statement.expression.left,
      resultBinding,
      'status',
    ) ||
    !ts.isNumericLiteral(statement.expression.right) ||
    statement.expression.right.text !== '0' ||
    !ts.isBlock(statement.thenStatement) ||
    statement.thenStatement.statements.length !== 1
  ) {
    return false;
  }
  const [finalStatement] = statement.thenStatement.statements;
  if (!ts.isThrowStatement(finalStatement) || !finalStatement.expression) {
    return false;
  }
  const errorConstruction = getSafeErrorConstruction(
    finalStatement.expression,
  );
  if (errorConstruction === null) return false;
  const message = errorConstruction.arguments![0];
  return (
    ts.isStringLiteralLike(message) ||
    (ts.isTemplateExpression(message) &&
      message.templateSpans.length === 1 &&
      ts.isIdentifier(message.templateSpans[0].expression) &&
      message.templateSpans[0].expression.text === scriptPathBinding)
  );
}

function getTypeScriptNodeFingerprint(node: ts.Node): string {
  const parts: string[] = [];
  function visit(candidate: ts.Node): void {
    parts.push(`node:${candidate.kind}`);
    if (
      ts.isIdentifier(candidate) ||
      ts.isStringLiteralLike(candidate) ||
      ts.isNumericLiteral(candidate) ||
      ts.isTemplateLiteralToken(candidate)
    ) {
      parts.push(`text:${candidate.text}`);
    }
    ts.forEachChild(candidate, visit);
    parts.push('end');
  }
  visit(node);
  return JSON.stringify(parts);
}

const CANONICAL_FILE_NOT_FOUND_HELPERS_SOURCE = `
function getOptionalNodeErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function isFileNotFoundError(error: unknown): boolean {
  return getOptionalNodeErrorCode(error) === 'ENOENT';
}
`;

const CANONICAL_FILE_NOT_FOUND_HELPER_FINGERPRINTS = ts
  .createSourceFile(
    'canonical-file-not-found-helpers.ts',
    CANONICAL_FILE_NOT_FOUND_HELPERS_SOURCE,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  .statements.map(getTypeScriptNodeFingerprint);

function hasCanonicalFileNotFoundErrorHelpers(
  sourceFile: ts.SourceFile,
): boolean {
  const getErrorCode = getSingleTopLevelFunction(
    sourceFile,
    'getOptionalNodeErrorCode',
  );
  const isFileNotFound = getSingleTopLevelFunction(
    sourceFile,
    'isFileNotFoundError',
  );
  return (
    getErrorCode !== null &&
    isFileNotFound !== null &&
    !hasImportedBinding(sourceFile, 'getOptionalNodeErrorCode') &&
    !hasImportedBinding(sourceFile, 'isFileNotFoundError') &&
    !hasImportedBinding(sourceFile, 'String') &&
    !hasShadowedBinding(sourceFile, new Set(['String'])) &&
    getTypeScriptNodeFingerprint(getErrorCode) ===
      CANONICAL_FILE_NOT_FOUND_HELPER_FINGERPRINTS[0] &&
    getTypeScriptNodeFingerprint(isFileNotFound) ===
      CANONICAL_FILE_NOT_FOUND_HELPER_FINGERPRINTS[1]
  );
}

const CANONICAL_SYNC_REPORT_HELPER_SOURCE = `
function printHumanReport(
  options: SyncTypesCliOptions,
  report: Awaited<ReturnType<typeof runSyncBlockMetadata>>,
) {
  if (report.failure) {
    console.error("❌ Type sync failed:", report.failure.message);
    return;
  }
  console.log(
    options.check
      ? "✅ block.json, typia.manifest.json, and typia-validator.php are already up to date with the TypeScript types!"
      : "✅ block.json, typia.manifest.json, and typia-validator.php were generated from TypeScript types!",
  );
  console.log("📝 Generated attributes:", report.attributeNames);
  if (report.lossyProjectionWarnings.length > 0) {
    console.warn("⚠️ Some Typia constraints were preserved only in typia.manifest.json:");
    for (const warning of report.lossyProjectionWarnings) {
      console.warn(\`   - \${warning}\`);
    }
  }
  if (report.phpGenerationWarnings.length > 0) {
    console.warn("⚠️ Some Typia constraints are not yet enforced by typia-validator.php:");
    for (const warning of report.phpGenerationWarnings) {
      console.warn(\`   - \${warning}\`);
    }
  }
  if (report.status === 'error') {
    console.error(
      "❌ Type sync completed with warnings treated as errors because of the selected flags.",
    );
  }
}
`;

const CANONICAL_PERSISTENCE_SYNC_REPORT_HELPER_SOURCE =
  CANONICAL_SYNC_REPORT_HELPER_SOURCE.replace(
    '✅ block.json, typia.manifest.json, and typia-validator.php are already up to date with the TypeScript types!',
    '✅ block.json, typia.manifest.json, typia-validator.php, typia.schema.json, and typia.openapi.json are already up to date with the TypeScript types!',
  ).replace(
    '✅ block.json, typia.manifest.json, and typia-validator.php were generated from TypeScript types!',
    '✅ block.json, typia.manifest.json, typia-validator.php, typia.schema.json, and typia.openapi.json were generated from TypeScript types!',
  );

const CANONICAL_SYNC_REPORT_HELPER_FINGERPRINTS = new Set(
  [
    CANONICAL_SYNC_REPORT_HELPER_SOURCE,
    CANONICAL_PERSISTENCE_SYNC_REPORT_HELPER_SOURCE,
  ].map((source) =>
    getTypeScriptNodeFingerprint(
      ts.createSourceFile(
        'canonical-sync-report-helper.ts',
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      ).statements[0],
    ),
  ),
);

function hasCanonicalSyncReportRendering(
  sourceFile: ts.SourceFile,
  statements: readonly ts.Statement[],
  optionsBinding: string,
  reportBinding: string,
): boolean {
  if (statements.length === 0) {
    return false;
  }
  const helper = getSingleTopLevelFunction(sourceFile, 'printHumanReport');
  const reportGlobals = new Set(['console', 'JSON']);
  if (
    statements.length !== 1 ||
    helper === null ||
    hasImportedBinding(sourceFile, 'printHumanReport') ||
    [...reportGlobals].some((binding) =>
      hasImportedBinding(sourceFile, binding),
    ) ||
    hasShadowedBinding(sourceFile, reportGlobals) ||
    hasShadowedBinding(
      getSingleTopLevelFunction(sourceFile, 'main') ?? sourceFile,
      new Set(['printHumanReport']),
    ) ||
    !CANONICAL_SYNC_REPORT_HELPER_FINGERPRINTS.has(
      getTypeScriptNodeFingerprint(helper),
    )
  ) {
    return false;
  }
  const expectedSource = `
if (${optionsBinding}.report === 'json') {
  process.stdout.write(\`\${JSON.stringify(${reportBinding}, null, 2)}\\n\`);
} else {
  printHumanReport(${optionsBinding}, ${reportBinding});
}
`;
  const expectedStatement = ts.createSourceFile(
    'canonical-sync-report-rendering.ts',
    expectedSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  ).statements[0];
  return (
    expectedStatement !== undefined &&
    getTypeScriptNodeFingerprint(statements[0]) ===
      getTypeScriptNodeFingerprint(expectedStatement)
  );
}

// Compare syntax trees instead of source text so formatting, comments, quote
// style, and optional semicolons do not affect the generated-helper contract.
const CANONICAL_SYNC_SCRIPT_ENV_HELPER_SOURCE = `
function getSyncScriptEnv() {
  const binaryDirectory = path.join(process.cwd(), 'node_modules', '.bin');
  const inheritedPath = process.env.PATH ?? process.env.Path ?? Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  const nextPath = fs.existsSync(binaryDirectory) ? \`\${binaryDirectory}\${path.delimiter}\${inheritedPath}\` : inheritedPath;
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'path') {
      delete env[key];
    }
  }
  env.PATH = nextPath;
  return env;
}
`;

const CANONICAL_SYNC_SCRIPT_ENV_HELPER_FINGERPRINT =
  getTypeScriptNodeFingerprint(
    ts.createSourceFile(
      'canonical-sync-project-env.ts',
      CANONICAL_SYNC_SCRIPT_ENV_HELPER_SOURCE,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ).statements[0],
  );

function hasCanonicalSyncScriptEnv(sourceFile: ts.SourceFile): boolean {
  const helper = getSingleTopLevelFunction(sourceFile, 'getSyncScriptEnv');
  return (
    helper !== null &&
    !hasImportedBinding(sourceFile, 'getSyncScriptEnv') &&
    hasCanonicalDefaultImport(sourceFile, 'node:fs', 'fs') &&
    hasCanonicalDefaultImport(sourceFile, 'node:path', 'path') &&
    getTypeScriptNodeFingerprint(helper) ===
      CANONICAL_SYNC_SCRIPT_ENV_HELPER_FINGERPRINT
  );
}

function hasCanonicalSpawnOptions(
  expression: ts.ObjectLiteralExpression,
): boolean {
  const properties = new Map<string, ts.Expression>();
  for (const property of expression.properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      ts.isComputedPropertyName(property.name) ||
      (!ts.isIdentifier(property.name) &&
        !ts.isStringLiteral(property.name)) ||
      properties.has(property.name.text)
    ) {
      return false;
    }
    properties.set(property.name.text, property.initializer);
  }
  if (
    properties.size !== 4 ||
    !['cwd', 'env', 'shell', 'stdio'].every((propertyName) =>
      properties.has(propertyName),
    )
  ) {
    return false;
  }

  const cwd = properties.get('cwd');
  const env = properties.get('env');
  const shell = properties.get('shell');
  const stdio = properties.get('stdio');
  return (
    cwd !== undefined &&
    ts.isCallExpression(cwd) &&
    ts.isPropertyAccessExpression(cwd.expression) &&
    ts.isIdentifier(cwd.expression.expression) &&
    cwd.expression.expression.text === 'process' &&
    cwd.expression.name.text === 'cwd' &&
    cwd.arguments.length === 0 &&
    env !== undefined &&
    ts.isCallExpression(env) &&
    ts.isIdentifier(env.expression) &&
    env.expression.text === 'getSyncScriptEnv' &&
    env.arguments.length === 0 &&
    shell !== undefined &&
    ts.isBinaryExpression(shell) &&
    shell.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
    ts.isPropertyAccessExpression(shell.left) &&
    ts.isIdentifier(shell.left.expression) &&
    shell.left.expression.text === 'process' &&
    shell.left.name.text === 'platform' &&
    ts.isStringLiteralLike(shell.right) &&
    shell.right.text === 'win32' &&
    stdio !== undefined &&
    ts.isStringLiteralLike(stdio) &&
    stdio.text === 'inherit'
  );
}

function hasCanonicalSyncRunner(sourceFile: ts.SourceFile): boolean {
  const runner = getSingleTopLevelFunction(sourceFile, 'runSyncScript');
  if (
    !runner?.body ||
    runner.parameters.length !== 2 ||
    runner.asteriskToken !== undefined ||
    runner.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
    ) ||
    !hasCanonicalSyncScriptEnv(sourceFile) ||
    !hasCanonicalRuntimeImports(sourceFile, SYNC_PROJECT_RUNTIME_IMPORTS)
  ) {
    return false;
  }
  const [scriptPathParameter, optionsParameter] = runner.parameters;
  if (
    !ts.isIdentifier(scriptPathParameter.name) ||
    !ts.isIdentifier(optionsParameter.name) ||
    scriptPathParameter.dotDotDotToken !== undefined ||
    scriptPathParameter.initializer !== undefined ||
    scriptPathParameter.questionToken !== undefined ||
    optionsParameter.dotDotDotToken !== undefined ||
    optionsParameter.initializer !== undefined ||
    optionsParameter.questionToken !== undefined
  ) {
    return false;
  }
  const scriptPathParameterName = scriptPathParameter.name.text;
  const optionsParameterName = optionsParameter.name.text;
  const spawnBindings = getNamedImportBindingsFromModule(
    sourceFile,
    'node:child_process',
    'spawnSync',
  );
  if (
    spawnBindings.size === 0 ||
    hasShadowedBinding(sourceFile, spawnBindings) ||
    hasShadowedBinding(
      runner,
      new Set([
        'getOptionalNodeErrorCode',
        'getSyncScriptEnv',
        'isFileNotFoundError',
      ]),
    )
  ) {
    return false;
  }

  const statements = [...runner.body.statements];
  if (statements.length !== 5) {
    return false;
  }
  const argsDeclarations: Array<{ binding: string; index: number }> = [];
  statements.forEach((statement, index) => {
    if (
      !ts.isVariableStatement(statement) ||
      !(statement.declarationList.flags & ts.NodeFlags.Const) ||
      statement.declarationList.declarations.length !== 1
    ) {
      return;
    }
    const declaration = statement.declarationList.declarations[0];
    if (
      ts.isIdentifier(declaration.name) &&
      declaration.initializer &&
      ts.isArrayLiteralExpression(declaration.initializer) &&
      declaration.initializer.elements.length === 1 &&
      ts.isIdentifier(declaration.initializer.elements[0]) &&
      declaration.initializer.elements[0].text === scriptPathParameterName
    ) {
      argsDeclarations.push({ binding: declaration.name.text, index });
    }
  });
  if (argsDeclarations.length !== 1) {
    return false;
  }
  const [{ binding: argsBinding, index: argsIndex }] = argsDeclarations;

  const checkGuardIndexes = statements.flatMap((statement, index) => {
    if (
      !ts.isIfStatement(statement) ||
      !ts.isPropertyAccessExpression(statement.expression) ||
      !ts.isIdentifier(statement.expression.expression) ||
      statement.expression.expression.text !== optionsParameterName ||
      statement.expression.name.text !== 'check' ||
      statement.elseStatement ||
      !ts.isBlock(statement.thenStatement) ||
      statement.thenStatement.statements.length !== 1 ||
      !isDirectMethodCall(
        statement.thenStatement.statements[0],
        argsBinding,
        'push',
        '--check',
      )
    ) {
      return [];
    }
    return [index];
  });
  if (checkGuardIndexes.length !== 1) {
    return false;
  }
  const [checkGuardIndex] = checkGuardIndexes;

  const spawnDeclarations = statements.flatMap((statement, index) => {
    if (
      !ts.isVariableStatement(statement) ||
      !(statement.declarationList.flags & ts.NodeFlags.Const) ||
      statement.declarationList.declarations.length !== 1
    ) {
      return [];
    }
    return statement.declarationList.declarations.flatMap((declaration) => {
      const call = declaration.initializer;
      return ts.isIdentifier(declaration.name) &&
        call !== undefined &&
        ts.isCallExpression(call) &&
        ts.isIdentifier(call.expression) &&
        spawnBindings.has(call.expression.text) &&
        call.arguments.length === 3 &&
        ts.isStringLiteralLike(call.arguments[0]) &&
        call.arguments[0].text === 'tsx' &&
        ts.isIdentifier(call.arguments[1]) &&
        call.arguments[1].text === argsBinding &&
        ts.isObjectLiteralExpression(call.arguments[2]) &&
        hasCanonicalSpawnOptions(call.arguments[2])
        ? [{ binding: declaration.name.text, index }]
        : [];
    });
  });
  if (spawnDeclarations.length !== 1) {
    return false;
  }
  const [{ binding: resultBinding, index: spawnIndex }] = spawnDeclarations;
  const errorGuardIndex = spawnIndex + 1;
  const statusGuardIndex = errorGuardIndex + 1;
  return (
    argsIndex === 0 &&
    checkGuardIndex === argsIndex + 1 &&
    spawnIndex === checkGuardIndex + 1 &&
    statusGuardIndex === statements.length - 1 &&
    !hasEarlierAbruptCompletion(statements, spawnIndex) &&
    hasCanonicalRunnerErrorGuard(
      sourceFile,
      statements[errorGuardIndex],
      resultBinding,
    ) &&
    hasCanonicalRunnerStatusGuard(
      statements[statusGuardIndex],
      resultBinding,
      scriptPathParameterName,
    )
  );
}

function hasTopLevelMainInvocation(
  sourceFile: ts.SourceFile,
  allowedRuntimeImportModules: ReadonlySet<string>,
): boolean {
  const main = getSingleTopLevelFunction(sourceFile, 'main');
  if (
    !main ||
    main.parameters.length !== 0 ||
    main.asteriskToken !== undefined ||
    !main.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
    ) ||
    hasOverriddenTrustedSyncHelperGlobal(sourceFile)
  ) {
    return false;
  }
  const invocationIndexes = sourceFile.statements.flatMap(
    (statement, statementIndex) => {
      if (!ts.isExpressionStatement(statement)) {
        return [];
      }
      const outerCall = statement.expression;
      if (
        !ts.isCallExpression(outerCall) ||
        !ts.isPropertyAccessExpression(outerCall.expression) ||
        outerCall.expression.name.text !== 'catch'
      ) {
        return [];
      }
      const mainCall = outerCall.expression.expression;
      if (
        !ts.isCallExpression(mainCall) ||
        !ts.isIdentifier(mainCall.expression) ||
        mainCall.expression.text !== 'main' ||
        mainCall.arguments.length !== 0 ||
        outerCall.arguments.length !== 1
      ) {
        return [];
      }
      return isCanonicalSyncMainCatchHandler(outerCall.arguments[0])
        ? [statementIndex]
        : [];
    },
  );
  if (invocationIndexes.length !== 1) {
    return false;
  }
  const [invocationIndex] = invocationIndexes;
  const hasEarlierMainCall = sourceFile.statements
    .slice(0, invocationIndex)
    .some((statement) =>
      containsCompletion(statement, (candidate) => {
        if (!ts.isCallExpression(candidate)) {
          return false;
        }
        const target = unwrapStaticExpression(candidate.expression);
        return ts.isIdentifier(target) && target.text === 'main';
      }),
    );
  return (
    invocationIndex === sourceFile.statements.length - 1 &&
    sourceFile.statements
      .slice(0, invocationIndex)
      .every((statement) =>
        isAllowedSyncHelperTopLevelStatement(
          statement,
          allowedRuntimeImportModules,
        ),
      ) &&
    !hasEarlierAbruptCompletion(sourceFile.statements, invocationIndex) &&
    !hasEarlierMainCall
  );
}

function getDirectVariableBinding(
  statements: readonly ts.Statement[],
  predicate: (initializer: ts.Expression) => boolean,
): { binding: string; index: number } | null {
  const bindings: Array<{ binding: string; index: number }> = [];
  statements.forEach((statement, index) => {
    if (
      !ts.isVariableStatement(statement) ||
      !(statement.declarationList.flags & ts.NodeFlags.Const) ||
      statement.declarationList.declarations.length !== 1
    ) {
      return;
    }
    const declaration = statement.declarationList.declarations[0];
    if (
      ts.isIdentifier(declaration.name) &&
      declaration.initializer &&
      predicate(declaration.initializer)
    ) {
      bindings.push({ binding: declaration.name.text, index });
    }
  });
  return bindings.length === 1 ? bindings[0] : null;
}

function isParseCliOptionsCall(expression: ts.Expression): boolean {
  if (
    !ts.isCallExpression(expression) ||
    !ts.isIdentifier(expression.expression) ||
    expression.expression.text !== 'parseCliOptions' ||
    expression.arguments.length !== 1
  ) {
    return false;
  }
  const argvSlice = expression.arguments[0];
  return (
    ts.isCallExpression(argvSlice) &&
    ts.isPropertyAccessExpression(argvSlice.expression) &&
    argvSlice.expression.name.text === 'slice' &&
    ts.isPropertyAccessExpression(argvSlice.expression.expression) &&
    ts.isIdentifier(argvSlice.expression.expression.expression) &&
    argvSlice.expression.expression.expression.text === 'process' &&
    argvSlice.expression.expression.name.text === 'argv' &&
    argvSlice.arguments.length === 1 &&
    ts.isNumericLiteral(argvSlice.arguments[0]) &&
    argvSlice.arguments[0].text === '2'
  );
}

function isCanonicalBooleanOptionAssignment(
  statement: ts.Statement,
  optionsBinding: string,
  propertyName: string,
): boolean {
  if (
    !ts.isExpressionStatement(statement) ||
    !ts.isBinaryExpression(statement.expression) ||
    statement.expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken
  ) {
    return false;
  }
  const { left, right } = statement.expression;
  return (
    isResultPropertyAccess(left, optionsBinding, propertyName) &&
    right.kind === ts.SyntaxKind.TrueKeyword
  );
}

function getCanonicalBooleanFlagGuardIndex(
  body: ts.Block,
  argumentBinding: string,
  optionsBinding: string,
  flagName: string,
  propertyName: string,
): number | null {
  const guardIndexes = body.statements.flatMap((statement, index) => {
    if (
      !ts.isIfStatement(statement) ||
      statement.elseStatement ||
      !ts.isBinaryExpression(statement.expression) ||
      statement.expression.operatorToken.kind !==
        ts.SyntaxKind.EqualsEqualsEqualsToken ||
      !ts.isIdentifier(statement.expression.left) ||
      statement.expression.left.text !== argumentBinding ||
      !ts.isStringLiteralLike(statement.expression.right) ||
      statement.expression.right.text !== flagName ||
      !ts.isBlock(statement.thenStatement) ||
      statement.thenStatement.statements.length !== 2
    ) {
      return [];
    }
    return (
      isCanonicalBooleanOptionAssignment(
        statement.thenStatement.statements[0],
        optionsBinding,
        propertyName,
      ) && ts.isContinueStatement(statement.thenStatement.statements[1])
    )
      ? [index]
      : [];
  });
  return guardIndexes.length === 1 ? guardIndexes[0] : null;
}

function hasCanonicalCheckGuard(
  body: ts.Block,
  argumentBinding: string,
  optionsBinding: string,
): boolean {
  const guardIndex = getCanonicalBooleanFlagGuardIndex(
    body,
    argumentBinding,
    optionsBinding,
    '--check',
    'check',
  );
  if (guardIndex === null) {
    return false;
  }
  return (
    !containsParserControlFlow(
      body,
      argumentBinding,
      'outer-break-or-return',
    ) &&
    !hasEarlierAbruptCompletion(body.statements, guardIndex) &&
    !body.statements
      .slice(0, guardIndex)
      .some((statement) =>
        containsParserControlFlow(
          statement,
          argumentBinding,
          'unsafe-continue',
        ),
      )
  );
}

function hasCanonicalAdditionalBooleanFlags(
  body: ts.Block,
  argumentBinding: string,
  optionsBinding: string,
  optionProperties: ReadonlyMap<string, ts.Expression>,
  flags: readonly { flagName: string; propertyName: string }[],
): boolean {
  const checkGuardIndex = getCanonicalBooleanFlagGuardIndex(
    body,
    argumentBinding,
    optionsBinding,
    '--check',
    'check',
  );
  let previousGuardIndex = -1;
  return flags.every(({ flagName, propertyName }) => {
    if (
      optionProperties.get(propertyName)?.kind !==
      ts.SyntaxKind.FalseKeyword
    ) {
      return false;
    }
    const guardIndex = getCanonicalBooleanFlagGuardIndex(
      body,
      argumentBinding,
      optionsBinding,
      flagName,
      propertyName,
    );
    let assignmentCount = 0;
    function countAssignments(node: ts.Node): void {
      if (ts.isFunctionLike(node)) {
        return;
      }
      if (
        ts.isStatement(node) &&
        isCanonicalBooleanOptionAssignment(
          node,
          optionsBinding,
          propertyName,
        )
      ) {
        assignmentCount += 1;
      }
      ts.forEachChild(node, countAssignments);
    }
    countAssignments(body);
    if (
      guardIndex === null ||
      checkGuardIndex === null ||
      guardIndex <= previousGuardIndex ||
      guardIndex >= checkGuardIndex ||
      assignmentCount !== 1 ||
      hasEarlierAbruptCompletion(body.statements, guardIndex) ||
      body.statements
        .slice(0, guardIndex)
        .some((statement) =>
          containsParserControlFlow(
            statement,
            argumentBinding,
            'unsafe-continue',
            0,
            0,
            false,
            new Map(),
            flagName,
          ),
        )
    ) {
      return false;
    }
    previousGuardIndex = guardIndex;
    return true;
  });
}

function getCanonicalForOfArgument(
  statement: ts.ForOfStatement,
  argvBinding: string,
): {
  argumentBinding: string;
  body: ts.Block;
  indexBinding: null;
} | null {
  if (
    !ts.isIdentifier(statement.expression) ||
    statement.expression.text !== argvBinding ||
    !ts.isVariableDeclarationList(statement.initializer) ||
    !(statement.initializer.flags & ts.NodeFlags.Const) ||
    statement.initializer.declarations.length !== 1 ||
    !ts.isIdentifier(statement.initializer.declarations[0].name) ||
    !ts.isBlock(statement.statement)
  ) {
    return null;
  }
  return {
    argumentBinding: statement.initializer.declarations[0].name.text,
    body: statement.statement,
    indexBinding: null,
  };
}

function getCanonicalIndexedArgument(
  statement: ts.ForStatement,
  argvBinding: string,
): {
  argumentBinding: string;
  body: ts.Block;
  indexBinding: string;
} | null {
  const initializer = statement.initializer;
  if (
    !initializer ||
    !ts.isVariableDeclarationList(initializer) ||
    initializer.declarations.length !== 1 ||
    !ts.isIdentifier(initializer.declarations[0].name) ||
    !initializer.declarations[0].initializer ||
    !ts.isNumericLiteral(initializer.declarations[0].initializer) ||
    initializer.declarations[0].initializer.text !== '0' ||
    !statement.condition ||
    !ts.isBinaryExpression(statement.condition) ||
    statement.condition.operatorToken.kind !== ts.SyntaxKind.LessThanToken ||
    !ts.isIdentifier(statement.condition.left) ||
    !ts.isPropertyAccessExpression(statement.condition.right) ||
    !ts.isIdentifier(statement.condition.right.expression) ||
    statement.condition.right.expression.text !== argvBinding ||
    statement.condition.right.name.text !== 'length' ||
    !statement.incrementor ||
    !ts.isBinaryExpression(statement.incrementor) ||
    statement.incrementor.operatorToken.kind !== ts.SyntaxKind.PlusEqualsToken ||
    !ts.isIdentifier(statement.incrementor.left) ||
    !ts.isNumericLiteral(statement.incrementor.right) ||
    statement.incrementor.right.text !== '1' ||
    !ts.isBlock(statement.statement)
  ) {
    return null;
  }
  const indexBinding = initializer.declarations[0].name.text;
  if (
    statement.condition.left.text !== indexBinding ||
    statement.incrementor.left.text !== indexBinding
  ) {
    return null;
  }
  const argumentDeclaration = getDirectVariableBinding(
    statement.statement.statements,
    (value) =>
      ts.isElementAccessExpression(value) &&
      ts.isIdentifier(value.expression) &&
      value.expression.text === argvBinding &&
      value.argumentExpression !== undefined &&
      ts.isIdentifier(value.argumentExpression) &&
      value.argumentExpression.text === indexBinding,
  );
  return argumentDeclaration
    ? {
        argumentBinding: argumentDeclaration.binding,
        body: statement.statement,
        indexBinding,
      }
    : null;
}

function hasCanonicalReportFlagGuard(
  body: ts.Block,
  argvBinding: string,
  argumentBinding: string,
  optionsBinding: string,
  indexBinding: string | null,
): boolean {
  if (indexBinding === null) {
    return false;
  }
  const expectedGuard = ts.createSourceFile(
    'canonical-sync-report-parser.ts',
    `
if (${argumentBinding} === '--report') {
  const reportMode = ${argvBinding}[${indexBinding} + 1];
  if (reportMode !== 'json') {
    throw new Error('The \`--report\` flag currently supports only \`json\`.');
  }
  ${optionsBinding}.report = reportMode;
  ${indexBinding} += 1;
  continue;
}
`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  ).statements[0];
  if (!expectedGuard) {
    return false;
  }
  const expectedFingerprint = getTypeScriptNodeFingerprint(expectedGuard);
  const guardIndexes = body.statements.flatMap((statement, index) =>
    getTypeScriptNodeFingerprint(statement) === expectedFingerprint
      ? [index]
      : [],
  );
  if (guardIndexes.length !== 1) {
    return false;
  }
  let reportAssignmentCount = 0;
  function countReportAssignments(node: ts.Node): void {
    if (ts.isFunctionLike(node)) {
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      isResultPropertyAccess(node.left, optionsBinding, 'report')
    ) {
      reportAssignmentCount += 1;
    }
    ts.forEachChild(node, countReportAssignments);
  }
  countReportAssignments(body);
  const [guardIndex] = guardIndexes;
  return (
    reportAssignmentCount === 1 &&
    !hasEarlierAbruptCompletion(body.statements, guardIndex) &&
    !body.statements
      .slice(0, guardIndex)
      .some((statement) =>
        containsParserControlFlow(
          statement,
          argumentBinding,
          'unsafe-continue',
          0,
          0,
          false,
          new Map(),
          '--report',
        ),
      )
  );
}

function countIdentifierOccurrences(node: ts.Node, binding: string): number {
  let count = 0;
  function visit(candidate: ts.Node): void {
    if (ts.isIdentifier(candidate) && candidate.text === binding) {
      count += 1;
    }
    ts.forEachChild(candidate, visit);
  }
  visit(node);
  return count;
}

function hasCanonicalCheckParser(
  sourceFile: ts.SourceFile,
  additionalBooleanFlags: readonly {
    flagName: string;
    propertyName: string;
  }[] = [],
  requiresReportMode = false,
): boolean {
  const parser = getSingleTopLevelFunction(sourceFile, 'parseCliOptions');
  if (
    !parser?.body ||
    parser.parameters.length !== 1 ||
    !ts.isIdentifier(parser.parameters[0].name) ||
    parser.parameters[0].dotDotDotToken !== undefined ||
    parser.parameters[0].initializer !== undefined ||
    parser.body.statements.length !== 3 ||
    parser.asteriskToken !== undefined ||
    parser.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
    )
  ) {
    return false;
  }
  const argvBinding = parser.parameters[0].name.text;
  const optionsStatement = parser.body.statements[0];
  if (
    !ts.isVariableStatement(optionsStatement) ||
    !(optionsStatement.declarationList.flags & ts.NodeFlags.Const) ||
    optionsStatement.declarationList.declarations.length !== 1
  ) {
    return false;
  }
  const optionsDeclaration = optionsStatement.declarationList.declarations[0];
  if (
    !ts.isIdentifier(optionsDeclaration.name) ||
    !optionsDeclaration.initializer ||
    !ts.isObjectLiteralExpression(optionsDeclaration.initializer)
  ) {
    return false;
  }
  const optionProperties = new Map<string, ts.Expression>();
  for (const property of optionsDeclaration.initializer.properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      ts.isComputedPropertyName(property.name) ||
      (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) ||
      optionProperties.has(property.name.text)
    ) {
      return false;
    }
    optionProperties.set(property.name.text, property.initializer);
  }
  const expectedPropertyCount =
    1 + additionalBooleanFlags.length + (requiresReportMode ? 1 : 0);
  if (
    optionProperties.size !== expectedPropertyCount ||
    optionProperties.get('check')?.kind !== ts.SyntaxKind.FalseKeyword
  ) {
    return false;
  }

  const loopStatement = parser.body.statements[1];
  const loop = ts.isForOfStatement(loopStatement)
    ? getCanonicalForOfArgument(loopStatement, argvBinding)
    : ts.isForStatement(loopStatement)
      ? getCanonicalIndexedArgument(loopStatement, argvBinding)
      : null;
  const returnStatement = parser.body.statements[2];
  const reportProperty = optionProperties.get('report');
  return (
    loop !== null &&
    hasOnlyCanonicalParserEffects(
      loop.body,
      optionsDeclaration.name.text,
      loop.indexBinding,
    ) &&
    hasCanonicalUnknownFlagThrow(loop.body, loop.argumentBinding) &&
    countOuterParserContinues(loop.body) === expectedPropertyCount &&
    countIdentifierOccurrences(
      loop.body,
      optionsDeclaration.name.text,
    ) === expectedPropertyCount &&
    (!requiresReportMode ||
      (reportProperty !== undefined &&
        ts.isStringLiteralLike(reportProperty) &&
        reportProperty.text === 'human' &&
        hasCanonicalReportFlagGuard(
          loop.body,
          argvBinding,
          loop.argumentBinding,
          optionsDeclaration.name.text,
          loop.indexBinding,
        ))) &&
    hasCanonicalCheckGuard(
      loop.body,
      loop.argumentBinding,
      optionsDeclaration.name.text,
    ) &&
    hasCanonicalAdditionalBooleanFlags(
      loop.body,
      loop.argumentBinding,
      optionsDeclaration.name.text,
      optionProperties,
      additionalBooleanFlags,
    ) &&
    ts.isReturnStatement(returnStatement) &&
    returnStatement.expression !== undefined &&
    ts.isIdentifier(returnStatement.expression) &&
    returnStatement.expression.text === optionsDeclaration.name.text
  );
}

function isCanonicalRestExistsCondition(
  expression: ts.Expression,
  scriptPathBinding: string,
): boolean {
  if (
    !ts.isCallExpression(expression) ||
    !ts.isPropertyAccessExpression(expression.expression) ||
    !ts.isIdentifier(expression.expression.expression) ||
    expression.expression.expression.text !== 'fs' ||
    expression.expression.name.text !== 'existsSync' ||
    expression.arguments.length !== 1
  ) {
    return false;
  }
  const resolvedPath = expression.arguments[0];
  return (
    ts.isCallExpression(resolvedPath) &&
    ts.isPropertyAccessExpression(resolvedPath.expression) &&
    ts.isIdentifier(resolvedPath.expression.expression) &&
    resolvedPath.expression.expression.text === 'path' &&
    resolvedPath.expression.name.text === 'resolve' &&
    resolvedPath.arguments.length === 2 &&
    ts.isCallExpression(resolvedPath.arguments[0]) &&
    ts.isPropertyAccessExpression(resolvedPath.arguments[0].expression) &&
    ts.isIdentifier(resolvedPath.arguments[0].expression.expression) &&
    resolvedPath.arguments[0].expression.expression.text === 'process' &&
    resolvedPath.arguments[0].expression.name.text === 'cwd' &&
    resolvedPath.arguments[0].arguments.length === 0 &&
    ts.isIdentifier(resolvedPath.arguments[1]) &&
    resolvedPath.arguments[1].text === scriptPathBinding
  );
}

function getCanonicalSyncProjectDelegationIndex(
  sourceFile: ts.SourceFile,
  expectedScriptPath: string,
  requiresExistsGuard: boolean,
): number | null {
  const main = getSingleTopLevelFunction(sourceFile, 'main');
  if (
    !main?.body ||
    !hasTopLevelMainInvocation(
      sourceFile,
      new Set(['node:child_process', 'node:fs', 'node:path']),
    ) ||
    hasImportedBinding(sourceFile, 'console') ||
    hasShadowedBinding(sourceFile, new Set(['console'])) ||
    hasShadowedBinding(
      main,
      new Set(['fs', 'parseCliOptions', 'path', 'runSyncScript']),
    ) ||
    !hasCanonicalDefaultImport(sourceFile, 'node:fs', 'fs') ||
    !hasCanonicalDefaultImport(sourceFile, 'node:path', 'path')
  ) {
    return null;
  }
  const statements = [...main.body.statements];
  const optionsDeclaration = getDirectVariableBinding(
    statements,
    isParseCliOptionsCall,
  );
  const scriptPathDeclaration = getDirectVariableBinding(
    statements,
    (initializer) =>
      isSyncScriptPathExpression(initializer, expectedScriptPath),
  );
  if (!optionsDeclaration || !scriptPathDeclaration) {
    return null;
  }
  const optionsBinding = optionsDeclaration.binding;
  const scriptPathBinding = scriptPathDeclaration.binding;

  if (!requiresExistsGuard) {
    const delegationIndexes = statements.flatMap((statement, index) =>
      isDirectRunSyncCall(statement, scriptPathBinding, optionsBinding)
        ? [index]
        : [],
    );
    return delegationIndexes.length === 1 &&
      optionsDeclaration.index < delegationIndexes[0] &&
      scriptPathDeclaration.index < delegationIndexes[0] &&
      !hasEarlierAbruptCompletion(statements, delegationIndexes[0])
      ? delegationIndexes[0]
      : null;
  }

  const guardedDelegationIndexes = statements.flatMap((statement, index) => {
    if (
      !ts.isIfStatement(statement) ||
      statement.elseStatement ||
      !isCanonicalRestExistsCondition(
        statement.expression,
        scriptPathBinding,
      ) ||
      !ts.isBlock(statement.thenStatement) ||
      statement.thenStatement.statements.length !== 1 ||
      !isDirectRunSyncCall(
        statement.thenStatement.statements[0],
        scriptPathBinding,
        optionsBinding,
      )
    ) {
      return [];
    }
    return [index];
  });
  return guardedDelegationIndexes.length === 1 &&
    optionsDeclaration.index < guardedDelegationIndexes[0] &&
    scriptPathDeclaration.index < guardedDelegationIndexes[0] &&
    !hasEarlierAbruptCompletion(statements, guardedDelegationIndexes[0])
    ? guardedDelegationIndexes[0]
    : null;
}

function isCanonicalSyncProjectCompletionLog(
  statement: ts.Statement | undefined,
  optionsBinding: string,
): boolean {
  const call = statement ? getDirectCall(statement) : null;
  if (
    !call ||
    !ts.isPropertyAccessExpression(call.expression) ||
    !ts.isIdentifier(call.expression.expression) ||
    call.expression.expression.text !== 'console' ||
    call.expression.name.text !== 'log' ||
    call.arguments.length !== 1
  ) {
    return false;
  }
  const message = unwrapStaticExpression(call.arguments[0]);
  if (
    !ts.isConditionalExpression(message) ||
    !isResultPropertyAccess(message.condition, optionsBinding, 'check')
  ) {
    return false;
  }
  const whenTrue = unwrapStaticExpression(message.whenTrue);
  const whenFalse = unwrapStaticExpression(message.whenFalse);
  return ts.isStringLiteralLike(whenTrue) && ts.isStringLiteralLike(whenFalse);
}

function getSyncProjectDelegationProblem(
  project: StandaloneScaffoldProject,
  requiresRest: boolean,
): string | null {
  const syncProjectPath = path.join(
    project.projectDir,
    STANDALONE_SYNC_PROJECT_SCRIPT,
  );
  if (!fs.existsSync(syncProjectPath)) {
    return null;
  }

  let source: string;
  try {
    source = fs.readFileSync(syncProjectPath, 'utf8');
  } catch {
    return `Unable to read generated helper ${STANDALONE_SYNC_PROJECT_SCRIPT}`;
  }
  if (hasTypeScriptSyntaxErrors(source, syncProjectPath)) {
    return `${STANDALONE_SYNC_PROJECT_SCRIPT} contains TypeScript syntax errors.`;
  }
  const sourceFile = ts.createSourceFile(
    syncProjectPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  if (!hasCanonicalCheckParser(sourceFile)) {
    return `${STANDALONE_SYNC_PROJECT_SCRIPT} must parse and forward --check through the canonical tsx runner.`;
  }
  if (!hasCanonicalSyncRunner(sourceFile)) {
    return `${STANDALONE_SYNC_PROJECT_SCRIPT} must forward --check through the canonical tsx runner.`;
  }
  const typeDelegationIndex = getCanonicalSyncProjectDelegationIndex(
    sourceFile,
    STANDALONE_SYNC_SCRIPT,
    false,
  );
  if (typeDelegationIndex === null) {
    return `${STANDALONE_SYNC_PROJECT_SCRIPT} must delegate to ${STANDALONE_SYNC_SCRIPT} through the canonical tsx runner.`;
  }
  const main = getSingleTopLevelFunction(sourceFile, 'main');
  const mainStatements = main?.body?.statements;
  const optionsDeclaration = mainStatements
    ? getDirectVariableBinding(mainStatements, isParseCliOptionsCall)
    : null;
  const typeScriptPathDeclaration = mainStatements
    ? getDirectVariableBinding(mainStatements, (initializer) =>
        isSyncScriptPathExpression(initializer, STANDALONE_SYNC_SCRIPT),
      )
    : null;
  const restScriptPathDeclaration = mainStatements
    ? getDirectVariableBinding(mainStatements, (initializer) =>
        isSyncScriptPathExpression(initializer, STANDALONE_SYNC_REST_SCRIPT),
      )
    : null;
  if (!mainStatements || !optionsDeclaration || !typeScriptPathDeclaration) {
    return `${STANDALONE_SYNC_PROJECT_SCRIPT} must keep its canonical sync completion flow.`;
  }
  const restDelegationIndex = getCanonicalSyncProjectDelegationIndex(
    sourceFile,
    STANDALONE_SYNC_REST_SCRIPT,
    true,
  );
  if (
    requiresRest &&
    (restDelegationIndex === null ||
      restDelegationIndex <= typeDelegationIndex)
  ) {
    return `${STANDALONE_SYNC_PROJECT_SCRIPT} must delegate to ${STANDALONE_SYNC_REST_SCRIPT} through the canonical tsx runner after the type sync.`;
  }
  const completionIndex = mainStatements.length - 1;
  const hasTypeOnlyTail =
    !requiresRest &&
    restDelegationIndex === null &&
    restScriptPathDeclaration === null &&
    optionsDeclaration.index === 0 &&
    typeScriptPathDeclaration.index === 1 &&
    typeDelegationIndex === 2 &&
    completionIndex === 3 &&
    isCanonicalSyncProjectCompletionLog(
      mainStatements[completionIndex],
      optionsDeclaration.binding,
    );
  // Basic scaffolds intentionally retain the guarded REST delegation so they
  // can gain persistence later without replacing the project sync runner.
  const hasRestTail =
    restScriptPathDeclaration !== null &&
    optionsDeclaration.index === 0 &&
    typeScriptPathDeclaration.index === 1 &&
    restScriptPathDeclaration.index === 2 &&
    typeDelegationIndex === 3 &&
    restDelegationIndex === 4 &&
    completionIndex === 5 &&
    isCanonicalSyncProjectCompletionLog(
      mainStatements[completionIndex],
      optionsDeclaration.binding,
    );
  return hasTypeOnlyTail || hasRestTail
    ? null
    : `${STANDALONE_SYNC_PROJECT_SCRIPT} must keep only the canonical optional REST delegation and completion report after type sync.`;
}

type ShellCommandSegment = {
  command: string;
  operatorAfter: '&&' | '&' | '||' | '|' | '|&' | ';' | null;
};

const SHELL_DIRECTORY_CHANGE_COMMANDS = new Set([
  '.',
  'cd',
  'chdir',
  'popd',
  'pushd',
  'source',
]);
const SHELL_COMMAND_PREFIXES = new Set([
  '!',
  '{',
  'do',
  'elif',
  'else',
  'if',
  'then',
  'time',
  'until',
  'while',
]);

function splitShellCommandSegments(script: string): ShellCommandSegment[] {
  const segments: ShellCommandSegment[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;
  let startsShellWord = true;

  function pushCurrent(
    operatorAfter: ShellCommandSegment['operatorAfter'],
  ): void {
    const normalized = current.replace(/\s+/gu, ' ').trim();
    if (normalized.length > 0) {
      segments.push({ command: normalized, operatorAfter });
    }
    current = '';
    startsShellWord = true;
  }

  for (let index = 0; index < script.length; index += 1) {
    const character = script[index];
    if (character === '\\' && quote !== "'") {
      current += character;
      if (script[index + 1] !== undefined) {
        current += script[index + 1];
        index += 1;
      }
      startsShellWord = false;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      current += character;
      startsShellWord = false;
      continue;
    }
    if (character === '#' && startsShellWord) {
      while (
        index + 1 < script.length &&
        script[index + 1] !== '\n' &&
        script[index + 1] !== '\r'
      ) {
        index += 1;
      }
      continue;
    }
    const isTwoCharacterOperator =
      (character === '&' && script[index + 1] === '&') ||
      (character === '|' &&
        (script[index + 1] === '|' || script[index + 1] === '&'));
    const isBackgroundOperator =
      character === '&' &&
      script[index - 1] !== '>' &&
      script[index - 1] !== '<' &&
      script[index + 1] !== '>';
    const isPipelineOperator = character === '|' && script[index - 1] !== '>';
    if (
      character === ';' ||
      character === '\n' ||
      character === '\r' ||
      isTwoCharacterOperator ||
      isBackgroundOperator ||
      isPipelineOperator
    ) {
      let operatorAfter: ShellCommandSegment['operatorAfter'];
      if (character === '\n' || character === '\r') {
        operatorAfter = ';';
      } else if (isTwoCharacterOperator) {
        operatorAfter = `${character}${script[index + 1]}` as
          | '&&'
          | '||'
          | '|&';
      } else {
        operatorAfter = character as '&' | '|' | ';';
      }
      pushCurrent(operatorAfter);
      if (isTwoCharacterOperator) {
        index += 1;
      }
      continue;
    }
    current += character;
    startsShellWord = character === ' ' || character === '\t';
  }
  pushCurrent(null);
  return segments;
}

function shellCommandMatches(
  segment: ShellCommandSegment,
  command: string,
  allowTrailingArguments = true,
): boolean {
  return (
    segment.command === command ||
    (allowTrailingArguments && segment.command.startsWith(`${command} `))
  );
}

function getShellCommandWords(command: string): string[] {
  const words: string[] = [];
  let current = '';
  let hasWord = false;
  let quote: "'" | '"' | null = null;
  function pushCurrent(): void {
    if (hasWord) {
      words.push(current);
    }
    current = '';
    hasWord = false;
  }
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (quote) {
      if (character === quote) {
        quote = null;
        hasWord = true;
      } else if (
        character === '\\' &&
        quote === '"' &&
        command[index + 1] !== undefined
      ) {
        current += command[index + 1];
        hasWord = true;
        index += 1;
      } else {
        current += character;
        hasWord = true;
      }
      continue;
    }
    if (character === '\\' && command[index + 1] !== undefined) {
      current += command[index + 1];
      hasWord = true;
      index += 1;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      hasWord = true;
      continue;
    }
    if (character === ' ' || character === '\t') {
      pushCurrent();
      continue;
    }
    if (character === '{' || character === '}') {
      pushCurrent();
      words.push(character);
      continue;
    }
    current += character;
    hasWord = true;
  }
  pushCurrent();
  return words;
}

function shellCommandChangesDirectory(segment: ShellCommandSegment): boolean {
  const words = getShellCommandWords(segment.command);
  let commandIndex = 0;
  while (
    SHELL_COMMAND_PREFIXES.has(words[commandIndex] ?? '') ||
    /^[A-Za-z_][A-Za-z0-9_]*=/u.test(words[commandIndex] ?? '')
  ) {
    commandIndex += 1;
  }
  if (
    words[commandIndex] === 'builtin' ||
    words[commandIndex] === 'command'
  ) {
    commandIndex += 1;
    while (
      words[commandIndex]?.startsWith('-') &&
      words[commandIndex] !== '-'
    ) {
      if (words[commandIndex] === '--') {
        commandIndex += 1;
        break;
      }
      commandIndex += 1;
    }
  }
  const commandWord = words[commandIndex] ?? '';
  if (
    commandWord === 'function' ||
    /^[A-Za-z_][A-Za-z0-9_]*\(\)$/u.test(commandWord) ||
    (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(commandWord) &&
      words[commandIndex + 1] === '()' &&
      words[commandIndex + 2] === '{')
  ) {
    return true;
  }
  if (/[$`]/u.test(commandWord)) {
    return true;
  }
  if (commandWord === 'eval') {
    const evaluatedWords = getShellCommandWords(
      words.slice(commandIndex + 1).join(' '),
    );
    // Static environment assignments cannot change cwd. Any executable or
    // dynamic eval body is intentionally treated as an unknown shell context.
    return (
      evaluatedWords.length > 0 &&
      !evaluatedWords.every((word) =>
        /^[A-Za-z_][A-Za-z0-9_]*=.*$/u.test(word),
      )
    );
  }
  return SHELL_DIRECTORY_CHANGE_COMMANDS.has(commandWord);
}

function getShellSegmentStaticReachability(
  segments: readonly ShellCommandSegment[],
): readonly boolean[] {
  const reachability: boolean[] = [];
  let terminated = false;
  let blockedByFalse = false;
  for (const [index, segment] of segments.entries()) {
    if (index === 0 || segments[index - 1].operatorAfter !== '&&') {
      blockedByFalse = false;
    } else {
      blockedByFalse =
        blockedByFalse || segments[index - 1].command === 'false';
    }
    const reachable = !terminated && !blockedByFalse;
    reachability.push(reachable);
    if (
      reachable &&
      (segment.command === 'exit' || segment.command.startsWith('exit ')) &&
      segment.operatorAfter !== '&' &&
      segment.operatorAfter !== '|' &&
      segment.operatorAfter !== '|&'
    ) {
      terminated = true;
    }
  }
  return reachability;
}

function shellScriptInvokesCommand(
  script: string,
  command: string,
  allowTrailingArguments = true,
): boolean {
  const segments = splitShellCommandSegments(script);
  const reachability = getShellSegmentStaticReachability(segments);
  let hasReachableDirectoryChange = false;
  for (const [index, segment] of segments.entries()) {
    if (
      shellCommandMatches(segment, command, allowTrailingArguments) &&
      reachability[index] === true &&
      !hasReachableDirectoryChange
    ) {
      return true;
    }
    if (
      reachability[index] === true &&
      shellCommandChangesDirectory(segment)
    ) {
      hasReachableDirectoryChange = true;
    }
  }
  return false;
}

function shellScriptPropagatesCommandFailure(
  script: string,
  command: string,
  allowTrailingArguments = true,
): boolean {
  const segments = splitShellCommandSegments(script);
  const reachability = getShellSegmentStaticReachability(segments);
  return segments.some((segment, index) => {
    if (!shellCommandMatches(segment, command, allowTrailingArguments)) {
      return false;
    }
    if (!reachability[index]) {
      return false;
    }
    if (index > 0 && segments[index - 1].operatorAfter === '||') {
      return false;
    }
    for (let chainIndex = index; chainIndex < segments.length; chainIndex += 1) {
      const operatorAfter = segments[chainIndex].operatorAfter;
      if (operatorAfter === null) {
        return true;
      }
      if (operatorAfter === '||') {
        const fallback = segments[chainIndex + 1];
        if (!fallback) {
          return false;
        }
        const exitMatch = /^exit(?:\s+([0-9]+))?$/u.exec(
          fallback.command,
        );
        const exitCode = exitMatch?.[1]
          ? Number.parseInt(exitMatch[1], 10)
          : null;
        return (
          exitMatch !== null &&
          fallback.operatorAfter !== '&' &&
          fallback.operatorAfter !== '|' &&
          fallback.operatorAfter !== '|&' &&
          (exitCode === null || (exitCode >= 1 && exitCode <= 255))
        );
      }
      if (operatorAfter !== '&&') {
        return false;
      }
    }
    return false;
  });
}

function shellScriptRunsCommandAfterPrerequisite(
  script: string,
  prerequisiteCommand: string,
  targetCommand: string,
): boolean {
  const segments = splitShellCommandSegments(script);
  let prerequisiteInAndList = false;
  let foundTarget = false;
  for (const segment of segments) {
    if (shellCommandMatches(segment, prerequisiteCommand, false)) {
      prerequisiteInAndList = true;
    }
    if (shellCommandMatches(segment, targetCommand)) {
      if (!prerequisiteInAndList) {
        return false;
      }
      foundTarget = true;
    }
    if (segment.operatorAfter !== '&&') {
      prerequisiteInAndList = false;
    }
  }
  return foundTarget;
}

function getPackageManagerSelector(
  project: StandaloneScaffoldProject,
): string | undefined {
  return typeof project.packageJson.packageManager === 'string'
    ? project.packageJson.packageManager
    : undefined;
}

function getPackageMetadataCheck(
  project: StandaloneScaffoldProject,
  requiresRest: boolean,
  requiresInteractivity: boolean,
): DoctorCheck {
  const issues: string[] = [];
  if (
    typeof project.packageJson.name !== 'string' ||
    project.packageJson.name.trim().length === 0
  ) {
    issues.push('package.json must define a non-empty string name');
  } else if (!getSafePackageBaseName(project.packageJson.name.trim())) {
    issues.push('package.json name must use a safe npm package name');
  }
  if (
    project.packageJson.packageManager !== undefined &&
    typeof project.packageJson.packageManager !== 'string'
  ) {
    issues.push('package.json packageManager must be a string when defined');
  }
  const packageManager = inferPackageManagerId(
    project.projectDir,
    getPackageManagerSelector(project),
  );
  const syncCheckCommand = formatRunScript(packageManager, 'sync', '--check');
  const syncCommand = formatRunScript(packageManager, 'sync');
  const scriptRequirements = [
    {
      allowTrailingArguments: false,
      commands: ['tsx scripts/sync-project.ts'],
      name: 'sync',
    },
    {
      allowTrailingArguments: false,
      commands: ['tsx scripts/sync-types-to-block-json.ts'],
      name: 'sync-types',
    },
    ...(requiresRest
      ? [
          {
            allowTrailingArguments: false,
            commands: ['tsx scripts/sync-rest-contracts.ts'],
            name: 'sync-rest',
          } as const,
        ]
      : []),
    {
      allowTrailingArguments: true,
      commands: [syncCommand, 'wp-scripts start'],
      name: 'start',
      orderedPrerequisite: syncCommand,
      orderedTarget: 'wp-scripts start',
    },
    {
      allowTrailingArguments: true,
      commands: [syncCheckCommand, 'wp-scripts build'],
      name: 'build',
      orderedPrerequisite: syncCheckCommand,
      orderedTarget: 'wp-scripts build',
    },
    {
      allowTrailingArguments: true,
      commands: [syncCheckCommand, 'tsc --noEmit'],
      name: 'typecheck',
      orderedPrerequisite: syncCheckCommand,
      orderedTarget: 'tsc --noEmit',
    },
  ] as const;
  for (const requirement of scriptRequirements) {
    const script = project.packageJson.scripts?.[requirement.name];
    if (typeof script !== 'string') {
      const scriptName = requirement.name;
      issues.push(`package.json must define the ${scriptName} script`);
      continue;
    }
    for (const command of requirement.commands) {
      const invokesCommand = shellScriptInvokesCommand(
        script,
        command,
        requirement.allowTrailingArguments,
      );
      if (!invokesCommand) {
        issues.push(
          `package.json ${requirement.name} script must invoke \`${command}\``,
        );
      } else if (
        !shellScriptPropagatesCommandFailure(
          script,
          command,
          requirement.allowTrailingArguments,
        )
      ) {
        issues.push(
          `package.json ${requirement.name} script must propagate failures from \`${command}\``,
        );
      }
    }
    if (
      'orderedTarget' in requirement &&
      requirement.commands.every((command) =>
        shellScriptInvokesCommand(
          script,
          command,
          requirement.allowTrailingArguments,
        ),
      ) &&
      !shellScriptRunsCommandAfterPrerequisite(
        script,
        requirement.orderedPrerequisite,
        requirement.orderedTarget,
      )
    ) {
      issues.push(
        `package.json ${requirement.name} script must run \`${requirement.orderedPrerequisite}\` before \`${requirement.orderedTarget}\` in the same && command list`,
      );
    }
  }
  for (const packageName of [
    ...REQUIRED_RUNTIME_PACKAGES,
    ...REQUIRED_WORDPRESS_RUNTIME_PACKAGES,
    ...(requiresInteractivity
      ? REQUIRED_INTERACTIVITY_RUNTIME_PACKAGES
      : []),
    ...(requiresRest ? REQUIRED_REST_RUNTIME_PACKAGES : []),
    ...(requiresRest ? REQUIRED_REST_WORDPRESS_RUNTIME_PACKAGES : []),
    '@typia/unplugin',
    '@wordpress/scripts',
    'tsx',
    'typescript',
  ]) {
    if (
      typeof getDeclaredDependency(project.packageJson, packageName) !==
      'string'
    ) {
      issues.push(`package.json must declare ${packageName}`);
    }
  }

  return createDoctorCheck(
    'Standalone package metadata',
    issues.length === 0 ? 'pass' : 'fail',
    issues.length === 0
      ? `package.json exposes the supported single-block sync surface for ${project.packageName}`
      : issues.join('; '),
    STANDALONE_DOCTOR_CODES.PACKAGE,
  );
}

const PHP_BUILD_DIRECTORY_EXPRESSION =
  String.raw`__DIR__\s*\.\s*(?:'\/build'|"\/build")`;

function getPhpFileBraceDepth(source: string, offset: number): number | null {
  return getPhpCodeBraceDepth(source, offset, { requirePhpOpenTag: true });
}

function getPhpRangeMatchDepth(
  source: string,
  range: PhpFunctionRange,
  match: RegExpMatchArray,
): number | null {
  return getPhpFileBraceDepth(source, range.start + (match.index ?? 0));
}

function hasEarlierDirectPhpCompletion(
  source: string,
  start: number,
  end: number,
): boolean {
  return [
    ...source.slice(start, end).matchAll(/\b(?:return|throw|exit|die)\b/gu),
  ].some(
    (match) =>
      getPhpFileBraceDepth(source, start + (match.index ?? 0)) === 1,
  );
}

function hasPhpVariableReassignment(
  source: string,
  variableName: string,
  start: number,
  end: number,
): boolean {
  const escapedVariableName = escapeRegExp(variableName);
  const assignmentPattern = new RegExp(
    String.raw`\$${escapedVariableName}\s*(?:\?\?=|<<=|>>=|\*\*=|[-.+*/%&|^]=|=(?!=|>))`,
    'gu',
  );
  return [...source.slice(start, end).matchAll(assignmentPattern)].some(
    (match) =>
      getPhpFileBraceDepth(source, start + (match.index ?? 0)) !== null,
  );
}

function hasReachableBuildDirectoryReturn(
  bootstrapSource: string,
  getterRange: PhpFunctionRange,
): boolean {
  // Support the direct form plus the generated fallback-candidate loop without
  // attempting to model arbitrary PHP data flow.
  // Each entry pairs a supported flow with its minimum PHP brace depth:
  // depth 1 is the function body; depth 2 is inside the generated foreach.
  const supportedReturns = [
    [
      new RegExp(
        String.raw`\breturn\s+${PHP_BUILD_DIRECTORY_EXPRESSION}\s*;`,
        'gu',
      ),
      1,
    ],
    [
      new RegExp(
        String.raw`\$candidates\s*=\s*array\s*\(\s*${PHP_BUILD_DIRECTORY_EXPRESSION}(?:\s*,[\s\S]*?)?\)\s*;\s*foreach\s*\(\s*\$candidates\s+as\s+\$candidate\s*\)\s*\{[\s\S]*?\breturn\s+\$candidate\s*;`,
        'gu',
      ),
      2,
    ],
  ] as const;
  return supportedReturns.some(([pattern, minimumReturnDepth]) =>
    [...getterRange.source.matchAll(pattern)].some((match) => {
      const matchOffset = getterRange.start + (match.index ?? 0);
      const returnOffset = matchOffset + match[0].lastIndexOf('return');
      const foreachOffset = matchOffset + match[0].lastIndexOf('foreach');
      const candidateFlowWasReassigned =
        minimumReturnDepth > 1 &&
        (hasPhpVariableReassignment(
          bootstrapSource,
          'candidates',
          matchOffset + match[0].indexOf('=') + 1,
          foreachOffset,
        ) ||
          hasPhpVariableReassignment(
            bootstrapSource,
            'candidate',
            foreachOffset,
            returnOffset,
          ));
      return (
        getPhpFileBraceDepth(bootstrapSource, matchOffset) === 1 &&
        (getPhpFileBraceDepth(bootstrapSource, returnOffset) ?? 0) >=
          minimumReturnDepth &&
        !candidateFlowWasReassigned &&
        !hasEarlierDirectPhpCompletion(
          bootstrapSource,
          getterRange.start,
          returnOffset,
        )
      );
    }),
  );
}

function hasDirectBuildDirectoryRegistration(
  bootstrapSource: string,
  callbackRange: PhpFunctionRange,
): boolean {
  const buildDirectorySentinel = '__wp_typia_build_directory__';
  const callbackSource = callbackRange.source;
  if (
    [
      /\bfunction\s*(?:&\s*)?\(/gu,
      /\bfn\s*(?:&\s*)?\(/gu,
    ].some((pattern) =>
      [...callbackSource.matchAll(pattern)].some((match) =>
        getPhpRangeMatchDepth(bootstrapSource, callbackRange, match) !== null,
      ),
    )
  ) {
    return false;
  }
  const assignmentPattern =
    /\$build_dir\s*=\s*([A-Za-z_][A-Za-z0-9_]*_get_build_dir)\s*\(\s*\)\s*;/gu;
  const assignment = [...callbackSource.matchAll(assignmentPattern)].find(
    (match) =>
      getPhpRangeMatchDepth(bootstrapSource, callbackRange, match) === 1,
  );
  if (!assignment) {
    return false;
  }
  const getterRange = findPhpFunctionRange(bootstrapSource, assignment[1], {
    requirePhpOpenTag: true,
  });
  if (
    !getterRange ||
    !hasReachableBuildDirectoryReturn(bootstrapSource, getterRange)
  ) {
    return false;
  }
  const assignmentEndInRange =
    (assignment.index ?? 0) + assignment[0].length;
  const assignmentEnd = callbackRange.start + assignmentEndInRange;
  const sourceAfterAssignment = callbackSource.slice(assignmentEndInRange);
  if (
    hasPhpVariableReassignment(
      bootstrapSource,
      'build_dir',
      assignmentEnd,
      callbackRange.end,
    )
  ) {
    return false;
  }
  const registrationSource =
    bootstrapSource.slice(0, assignmentEnd) +
    bootstrapSource
      .slice(assignmentEnd, callbackRange.end)
      .replace(/\$build_dir\b/gu, `'${buildDirectorySentinel}'`) +
    bootstrapSource.slice(callbackRange.end);
  const hasDirectRegistration = [
    ...sourceAfterAssignment.matchAll(
      /\bregister_block_type\s*\(\s*\$build_dir\b/gu,
    ),
  ].some((match) => {
    // Relative to sourceAfterAssignment for the call-prefix check below.
    const matchIndex = match.index ?? 0;
    let previousIndex = matchIndex - 1;
    while (/\s/u.test(sourceAfterAssignment[previousIndex] ?? '')) {
      previousIndex -= 1;
    }
    // Absolute in bootstrapSource for PHP depth and reachability checks.
    const registrationOffset = assignmentEnd + matchIndex;
    return (
      getPhpFileBraceDepth(bootstrapSource, registrationOffset) === 1 &&
      !hasEarlierDirectPhpCompletion(
        bootstrapSource,
        assignmentEnd,
        registrationOffset,
      ) &&
      !(
        (sourceAfterAssignment[previousIndex] === '>' &&
          sourceAfterAssignment[previousIndex - 1] === '-') ||
        (sourceAfterAssignment[previousIndex] === ':' &&
          sourceAfterAssignment[previousIndex - 1] === ':')
      )
    );
  });
  return (
    hasDirectRegistration &&
    hasPhpFunctionCallWithStringArguments(
      registrationSource,
      'register_block_type',
      [buildDirectorySentinel],
      { requirePhpOpenTag: true },
    )
  );
}

function hasDirectRestRouteRegistration(
  bootstrapSource: string,
  callbackRange: PhpFunctionRange,
  expectedRegistrations: readonly ExpectedRestRegistration[],
): boolean {
  if (expectedRegistrations.length === 0) {
    return false;
  }
  const matches = [
    ...callbackRange.source.matchAll(/\bregister_rest_route\s*\(/gu),
  ];
  const isInsideArrowFunction = (relativeOffset: number): boolean => {
    let arrowStarted = false;
    let arrowBodyStarted = false;
    for (const token of callbackRange.source
      .slice(0, relativeOffset)
      .matchAll(/\bfn\b|=>|;/gu)) {
      if (
        getPhpRangeMatchDepth(bootstrapSource, callbackRange, token) !== 1
      ) {
        continue;
      }
      if (token[0] === ';') {
        arrowStarted = false;
        arrowBodyStarted = false;
      } else if (token[0] === 'fn') {
        arrowStarted = true;
        arrowBodyStarted = false;
      } else if (arrowStarted) {
        arrowBodyStarted = true;
      }
    }
    return arrowBodyStarted;
  };
  const directCalls = matches.flatMap((match) => {
    const relativeOffset = match.index ?? 0;
    const registrationOffset = callbackRange.start + relativeOffset;
    const sourceBeforeCall = callbackRange.source.slice(0, relativeOffset);
    let previousIndex = relativeOffset - 1;
    while (/\s/u.test(callbackRange.source[previousIndex] ?? '')) {
      previousIndex -= 1;
    }
    if (
      getPhpRangeMatchDepth(bootstrapSource, callbackRange, match) === 1 &&
      !hasEarlierDirectPhpCompletion(
        bootstrapSource,
        callbackRange.start,
        registrationOffset,
      ) &&
      !isInsideArrowFunction(relativeOffset) &&
      !/\b(?:function|new)\s*&?\s*$/u.test(sourceBeforeCall) &&
      callbackRange.source[previousIndex] !== '$' &&
      !(
        (callbackRange.source[previousIndex] === '>' &&
          callbackRange.source[previousIndex - 1] === '-') ||
        (callbackRange.source[previousIndex] === ':' &&
          callbackRange.source[previousIndex - 1] === ':')
      )
    ) {
      const callEnd = findPhpFunctionCallEnd(
        callbackRange.source,
        relativeOffset,
        'register_rest_route',
      );
      if (callEnd === null) {
        return [];
      }
      return [
        {
          relativeStart: relativeOffset,
          source: callbackRange.source.slice(relativeOffset, callEnd),
        },
      ];
    }
    return [];
  });
  return expectedRegistrations.every(({ method, path: endpointPath }) => {
    const pathSegments = endpointPath.split('/').filter(Boolean);
    if (pathSegments.length < 2) {
      return false;
    }
    const argumentPairs = pathSegments.slice(1).map((_, splitIndex) => [
      pathSegments.slice(0, splitIndex + 1).join('/'),
      `/${pathSegments.slice(splitIndex + 1).join('/')}`,
    ] as const);
    const expectedMethodConstant = WORDPRESS_REST_METHOD_CONSTANTS[method];
    return directCalls.some((call) => {
      const hasEndpointPath = argumentPairs.some((argumentPair) =>
        // The exact call begins inside an already-open PHP callback, so snippet
        // scanning must start in PHP mode instead of requiring another tag.
        hasPhpFunctionCallWithStringArguments(
          call.source,
          'register_rest_route',
          argumentPair,
        ),
      );
      if (!hasEndpointPath) {
        return false;
      }
      return [
        ...call.source.matchAll(
          /(?:'methods'|"methods")\s*=>\s*\\?WP_REST_Server::(READABLE|CREATABLE|EDITABLE|DELETABLE)\b/gu,
        ),
      ].some((methodMatch) => {
        if (methodMatch[1] !== expectedMethodConstant) {
          return false;
        }
        const classOffset = methodMatch[0].lastIndexOf('WP_REST_Server');
        const relativeClassOffset =
          call.relativeStart + (methodMatch.index ?? 0) + classOffset;
        return (
          classOffset >= 0 &&
          !isInsideArrowFunction(relativeClassOffset) &&
          getPhpFileBraceDepth(
            bootstrapSource,
            callbackRange.start + relativeClassOffset,
          ) === 1
        );
      });
    });
  });
}

function getBootstrapCheck(
  project: StandaloneScaffoldProject,
  parsedRestConfig: ParsedStandaloneRestConfig,
): DoctorCheck {
  const { requiresRest } = parsedRestConfig;
  const expectedRestRegistrations =
    parsedRestConfig.manifest?.endpoints.map(({ method, path: endpointPath }) => ({
      method,
      path: endpointPath,
    })) ?? [];
  const packageBaseName = getSafePackageBaseName(project.packageName);
  if (!packageBaseName) {
    return createDoctorCheck(
      'Standalone plugin bootstrap',
      'fail',
      'Package name cannot derive a safe project-local plugin bootstrap path',
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );
  }
  const bootstrapRelativePath = `${packageBaseName}.php`;
  const bootstrapPath = path.join(project.projectDir, bootstrapRelativePath);
  if (!fs.existsSync(bootstrapPath)) {
    return createDoctorCheck(
      'Standalone plugin bootstrap',
      'fail',
      `Missing package-aligned plugin bootstrap ${bootstrapRelativePath}`,
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );
  }

  let source: string;
  let headerRegion: string;
  try {
    const sourceBuffer = fs.readFileSync(bootstrapPath);
    source = sourceBuffer.toString('utf8');
    headerRegion = sourceBuffer
      .subarray(0, WORDPRESS_PLUGIN_HEADER_SCAN_BYTES)
      .toString('utf8')
      .replace(/^\uFEFF/u, '');
  } catch {
    return createDoctorCheck(
      'Standalone plugin bootstrap',
      'fail',
      `Unable to read package-aligned plugin bootstrap ${bootstrapRelativePath}`,
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );
  }
  const hasPluginHeader =
    WORDPRESS_PLUGIN_NAME_HEADER_PATTERN.test(headerRegion);
  const hasRegistrationCall = hasPhpFunctionCall(
    source,
    'register_block_type',
    { requirePhpOpenTag: true },
  );
  const hasRegistrationHook = hasPhpFunctionCallWithStringArguments(
    source,
    'add_action',
    [
      'init',
      (callbackName) => {
        if (!/^[A-Za-z_][A-Za-z0-9_]*_register_block$/u.test(callbackName)) {
          return false;
        }
        const callbackRange = findPhpFunctionRange(source, callbackName, {
          requirePhpOpenTag: true,
        });
        return (
          callbackRange !== null &&
          hasDirectBuildDirectoryRegistration(
            source,
            callbackRange,
          )
        );
      },
    ],
    { requirePhpOpenTag: true },
  );
  const hasRestRegistrationCall =
    !requiresRest ||
    hasPhpFunctionCall(source, 'register_rest_route', {
      requirePhpOpenTag: true,
    });
  const hasRestRegistrationHook =
    !requiresRest ||
    hasPhpFunctionCallWithStringArguments(
      source,
      'add_action',
      [
        'rest_api_init',
        (callbackName) => {
          if (!/^[A-Za-z_][A-Za-z0-9_]*_register_routes$/u.test(callbackName)) {
            return false;
          }
          const callbackRange = findPhpFunctionRange(source, callbackName, {
            requirePhpOpenTag: true,
          });
          return (
            callbackRange !== null &&
            hasDirectRestRouteRegistration(
              source,
              callbackRange,
              expectedRestRegistrations,
            )
          );
        },
      ],
      { requirePhpOpenTag: true },
    );
  const issues = [
    ...(!hasPluginHeader ? ['is missing a Plugin Name header'] : []),
    ...(!hasRegistrationCall ? ['does not call register_block_type()'] : []),
    ...(!hasRegistrationHook
      ? ['does not hook block registration to init']
      : []),
    ...(!hasRestRegistrationCall
      ? ['does not call register_rest_route()']
      : []),
    ...(!hasRestRegistrationHook
      ? ['does not hook REST route registration to rest_api_init']
      : []),
  ];
  return createDoctorCheck(
    'Standalone plugin bootstrap',
    issues.length === 0 ? 'pass' : 'fail',
    issues.length === 0
      ? `${bootstrapRelativePath} contains a WordPress plugin header and ${
          requiresRest
            ? 'init block registration plus REST route wiring'
            : 'init registration wiring'
        }`
      : `${bootstrapRelativePath} ${issues.join('; ')}`,
    STANDALONE_DOCTOR_CODES.BOOTSTRAP,
  );
}

function getSourceLayoutCheck(
  project: StandaloneScaffoldProject,
  parsedConfig: ParsedStandaloneSyncConfig,
  parsedRestConfig: ParsedStandaloneRestConfig,
  requiresInteractivity: boolean,
): DoctorCheck {
  const packageBaseName = getSafePackageBaseName(project.packageName);
  const bootstrapPath = packageBaseName
    ? path.join(project.projectDir, `${packageBaseName}.php`)
    : null;
  const bootstrapLocalIncludes: string[] = [];
  if (bootstrapPath && fs.existsSync(bootstrapPath)) {
    try {
      const bootstrapSource = fs.readFileSync(bootstrapPath, 'utf8');
      for (const match of bootstrapSource.matchAll(
        /\brequire_once\s+__DIR__\s*\.\s*(['"])\/([^'"]+)\1\s*;/gu,
      )) {
        const relativePath = match[2];
        if (
          relativePath &&
          getPhpFileBraceDepth(bootstrapSource, match.index ?? 0) !== null &&
          isSafeProjectRelativePath(project.projectDir, relativePath)
        ) {
          bootstrapLocalIncludes.push(path.normalize(relativePath));
        }
      }
    } catch {
      // The bootstrap row reports unreadable plugin files directly.
    }
  }
  let featureSourceFiles: readonly string[] = STANDALONE_BASIC_SOURCE_FILES;
  if (parsedRestConfig.requiresRest) {
    featureSourceFiles = STANDALONE_PERSISTENCE_SOURCE_FILES;
  } else if (requiresInteractivity) {
    featureSourceFiles = STANDALONE_INTERACTIVITY_SOURCE_FILES;
  }
  const requiredFiles = new Set([
    ...STANDALONE_COMMON_SOURCE_FILES,
    ...featureSourceFiles,
    ...bootstrapLocalIncludes,
  ]);
  const missingFiles = [...requiredFiles].filter(
    (relativePath) =>
      !fs.existsSync(path.join(project.projectDir, relativePath)),
  );
  const syncProjectProblem = getSyncProjectDelegationProblem(
    project,
    parsedRestConfig.requiresRest,
  );
  const issues = [
    ...(missingFiles.length > 0 ? [`Missing: ${missingFiles.join(', ')}`] : []),
    ...(parsedConfig.problem ? [parsedConfig.problem] : []),
    ...(parsedRestConfig.problem ? [parsedRestConfig.problem] : []),
    ...(syncProjectProblem ? [syncProjectProblem] : []),
  ];

  return createDoctorCheck(
    'Standalone source layout',
    issues.length === 0 ? 'pass' : 'fail',
    issues.length === 0
      ? 'Supported standalone source surface and static canonical sync configuration detected'
      : issues.join('; '),
    STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
  );
}

function resolveFromProject(
  projectDir: string,
  packageName: string,
  resolutionSpecifier: string,
): string | null {
  const projectRequire = createRequire(path.join(projectDir, 'package.json'));
  try {
    const resolvedPath = projectRequire.resolve(resolutionSpecifier);
    const pnpVersion: unknown = process.versions.pnp;
    if (
      typeof pnpVersion === 'number' ||
      (typeof pnpVersion === 'string' && pnpVersion.length > 0)
    ) {
      const pnpApi = projectRequire('pnpapi') as {
        findPackageLocator(location: string): {
          name: string | null;
          reference: string | null;
        } | null;
        getLocator(
          name: string,
          referencish: string | [string, string],
        ): { name: string; reference: string };
        getPackageInformation(locator: {
          name: string | null;
          reference: string | null;
        }): {
          packageDependencies: Map<
            string,
            string | [string, string] | null
          >;
        } | null;
      };
      const issuerLocator = pnpApi.findPackageLocator(
        path.join(projectDir, 'package.json'),
      );
      const resolvedLocator = pnpApi.findPackageLocator(resolvedPath);
      if (!issuerLocator || !resolvedLocator) {
        return null;
      }
      const issuerInformation = pnpApi.getPackageInformation(issuerLocator);
      if (!issuerInformation) {
        return null;
      }
      const dependencyReference =
        issuerInformation.packageDependencies.get(packageName);
      if (dependencyReference === undefined || dependencyReference === null) {
        return null;
      }
      const expectedLocator = pnpApi.getLocator(
        packageName,
        dependencyReference,
      );
      // Keep the virtual path so Yarn can retain its peer-dependency locator.
      return resolvedLocator.name === expectedLocator.name &&
        resolvedLocator.reference === expectedLocator.reference
        ? resolvedPath
        : null;
    }

    const localPackageEntry = path.join(
      projectDir,
      'node_modules',
      ...packageName.split('/'),
    );
    if (!fs.existsSync(localPackageEntry)) {
      return null;
    }
    const localPackageRoot = fs.realpathSync(localPackageEntry);
    const realResolvedPath = fs.realpathSync(resolvedPath);
    return isProjectLocalRelativePath(
      path.relative(localPackageRoot, realResolvedPath),
    )
      ? realResolvedPath
      : null;
  } catch {
    return null;
  }
}

function canResolveFromProject(
  projectDir: string,
  packageName: string,
  resolutionSpecifier: string,
): boolean {
  return (
    resolveFromProject(projectDir, packageName, resolutionSpecifier) !== null
  );
}

async function loadProjectMetadataCore(
  project: StandaloneScaffoldProject,
  requiresRest: boolean,
): Promise<StandaloneMetadataCoreModule> {
  const modulePath = resolveFromProject(
    project.projectDir,
    '@wp-typia/block-runtime',
    '@wp-typia/block-runtime/metadata-core',
  );
  if (!modulePath) {
    throw new Error(
      'Unable to resolve project-local @wp-typia/block-runtime/metadata-core.',
    );
  }
  const loaded = (await import(
    pathToFileURL(modulePath).href
  )) as Partial<StandaloneMetadataCoreModule>;
  const requiredExports = [
    'resolveSyncBlockMetadataPaths',
    'runSyncBlockMetadata',
    ...(requiresRest
      ? ([
          'defineEndpointManifest',
          'syncEndpointClient',
          'syncRestOpenApi',
          'syncTypeSchemas',
        ] as const)
      : []),
  ] as const;
  const missingExport = requiredExports.find(
    (exportName) => typeof loaded[exportName] !== 'function',
  );
  if (missingExport) {
    throw new Error(
      `Project-local metadata-core does not export ${missingExport}().`,
    );
  }
  return loaded as StandaloneMetadataCoreModule;
}

function getDependenciesCheck(
  project: StandaloneScaffoldProject,
  requiresRest: boolean,
  requiresInteractivity: boolean,
): DoctorCheck {
  const requiredInstalledPackages = [
    ...REQUIRED_INSTALLED_PACKAGES,
    ...(requiresInteractivity
      ? REQUIRED_INTERACTIVITY_INSTALLED_PACKAGES
      : []),
    ...(requiresRest ? REQUIRED_REST_INSTALLED_PACKAGES : []),
  ];
  const missingPackages = requiredInstalledPackages
    .filter(
      ({ packageName, resolutionSpecifier }) =>
        !canResolveFromProject(
          project.projectDir,
          packageName,
          resolutionSpecifier,
        ),
    )
    .map(({ diagnosticName }) => diagnosticName);
  const packageManager = inferPackageManagerId(
    project.projectDir,
    getPackageManagerSelector(project),
  );

  return createDoctorCheck(
    'Standalone dependencies',
    missingPackages.length === 0 ? 'pass' : 'fail',
    missingPackages.length === 0
      ? 'Project-local wp-typia runtime, TypeScript, and script-runner dependencies are installed'
      : `Missing installed package(s): ${missingPackages.join(', ')}. Run \`${formatInstallCommand(packageManager)}\` from the standalone project root.`,
    STANDALONE_DOCTOR_CODES.DEPENDENCIES,
  );
}

function toProjectRelativePath(projectDir: string, filePath: string): string {
  const relativePath = path.relative(projectDir, filePath);
  return isProjectLocalRelativePath(relativePath)
    ? relativePath.split(path.sep).join('/')
    : path.basename(filePath);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function sanitizeProjectPaths(message: string, projectDir: string): string {
  const resolvedProjectDir = path.resolve(projectDir);
  const pathVariants = new Set([
    resolvedProjectDir,
    resolvedProjectDir.split(path.sep).join('/'),
    resolvedProjectDir.split(path.sep).join('\\'),
  ]);
  let sanitizedMessage = message;
  for (const pathVariant of pathVariants) {
    sanitizedMessage = sanitizedMessage.replace(
      new RegExp(`${escapeRegExp(pathVariant)}(?=[/\\\\]|$)`, 'giu'),
      '.',
    );
  }
  return sanitizedMessage;
}

function getConfiguredArtifactPaths(
  options: SyncBlockMetadataOptions,
  metadataCore?: Pick<
    StandaloneMetadataCoreModule,
    'resolveSyncBlockMetadataPaths'
  >,
): string[] {
  const resolvedPaths = (
    metadataCore?.resolveSyncBlockMetadataPaths ?? resolveSyncBlockMetadataPaths
  )(options);
  return [
    resolvedPaths.blockJsonPath,
    resolvedPaths.manifestPath,
    resolvedPaths.phpValidatorPath,
    ...(resolvedPaths.jsonSchemaPath ? [resolvedPaths.jsonSchemaPath] : []),
    ...(resolvedPaths.openApiPath ? [resolvedPaths.openApiPath] : []),
  ];
}

function formatSyncFailure(
  project: StandaloneScaffoldProject,
  report: SyncBlockMetadataReport,
): string {
  const failure = report.failure;
  if (!failure) {
    return 'Canonical sync check failed without a structured failure.';
  }
  const normalizedMessage = sanitizeProjectPaths(
    failure.message,
    project.projectDir,
  );
  return `Canonical sync check failed (${failure.code}): ${normalizedMessage}`;
}

async function getGeneratedArtifactsCheck(
  project: StandaloneScaffoldProject,
  parsedConfig: ParsedStandaloneSyncConfig,
  parsedRestConfig: ParsedStandaloneRestConfig,
  dependenciesReady: boolean,
): Promise<DoctorCheck> {
  const packageManager = inferPackageManagerId(
    project.projectDir,
    getPackageManagerSelector(project),
  );
  const syncCommand = formatRunScript(packageManager, 'sync');
  if (!parsedConfig.options || parsedRestConfig.problem) {
    return createDoctorCheck(
      'Standalone generated artifacts',
      'fail',
      `Canonical freshness check is blocked by the source layout. Fix that row, run \`${syncCommand}\`, and rerun doctor.`,
      STANDALONE_DOCTOR_CODES.ARTIFACTS,
    );
  }
  const freshnessOptions = parsedRestConfig.manifest
    ? {
        ...parsedConfig.options,
        ...STANDALONE_PERSISTENCE_BLOCK_SCHEMA_ARTIFACTS,
      }
    : parsedConfig.options;

  let artifactPaths = [
    ...getConfiguredArtifactPaths(freshnessOptions),
    ...parsedRestConfig.artifactPaths,
  ];
  const missingArtifacts = artifactPaths.filter(
    (artifactPath) => !fs.existsSync(artifactPath),
  );
  if (!dependenciesReady) {
    return createDoctorCheck(
      'Standalone generated artifacts',
      missingArtifacts.length > 0 ? 'fail' : 'warn',
      missingArtifacts.length > 0
        ? `Missing: ${missingArtifacts
            .map((filePath) =>
              toProjectRelativePath(project.projectDir, filePath),
            )
            .join(
              ', ',
            )}. Install dependencies, run \`${syncCommand}\`, and rerun doctor.`
        : 'Expected generated files exist, but canonical freshness could not be checked until project dependencies are installed.',
      STANDALONE_DOCTOR_CODES.ARTIFACTS,
    );
  }

  let metadataCore: StandaloneMetadataCoreModule;
  let report: SyncBlockMetadataReport;
  try {
    metadataCore = await loadProjectMetadataCore(
      project,
      parsedRestConfig.requiresRest,
    );
    artifactPaths = [
      ...getConfiguredArtifactPaths(freshnessOptions, metadataCore),
      ...parsedRestConfig.artifactPaths,
    ];
    report = await metadataCore.runSyncBlockMetadata(freshnessOptions, {
      check: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const normalizedMessage = sanitizeProjectPaths(
      message,
      project.projectDir,
    );
    return createDoctorCheck(
      'Standalone generated artifacts',
      'fail',
      `Canonical sync check encountered an unexpected error: ${normalizedMessage}. Run \`${syncCommand}\` and rerun doctor.`,
      STANDALONE_DOCTOR_CODES.ARTIFACTS,
    );
  }
  if (report.failure || report.status === 'error') {
    return createDoctorCheck(
      'Standalone generated artifacts',
      'fail',
      `${formatSyncFailure(project, report)} Run \`${syncCommand}\` and rerun doctor.`,
      STANDALONE_DOCTOR_CODES.ARTIFACTS,
    );
  }

  if (parsedRestConfig.manifest) {
    try {
      await checkStandaloneRestArtifacts(
        project.projectDir,
        parsedRestConfig,
        metadataCore,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const normalizedMessage = sanitizeProjectPaths(
        message,
        project.projectDir,
      );
      return createDoctorCheck(
        'Standalone generated artifacts',
        'fail',
        `Canonical REST sync check failed: ${normalizedMessage}. Run \`${syncCommand}\` and rerun doctor.`,
        STANDALONE_DOCTOR_CODES.ARTIFACTS,
      );
    }
  }

  const warningCount =
    report.lossyProjectionWarnings.length + report.phpGenerationWarnings.length;
  const artifactSummary = artifactPaths
    .map((filePath) => toProjectRelativePath(project.projectDir, filePath))
    .join(', ');
  return createDoctorCheck(
    'Standalone generated artifacts',
    'pass',
    warningCount > 0
      ? `Canonical artifacts are current: ${artifactSummary}. The sync report also contains ${warningCount} projection notice(s); use the sync-types strict flags when those notices should enforce policy.`
      : `Canonical artifacts are current: ${artifactSummary}`,
    STANDALONE_DOCTOR_CODES.ARTIFACTS,
  );
}

/** Collect project-scoped checks for one supported standalone scaffold. */
export async function getStandaloneScaffoldDoctorChecks(
  project: StandaloneScaffoldProject,
): Promise<DoctorCheck[]> {
  const parsedConfig = parseStandaloneSyncConfig(project);
  const requiresRest = standaloneProjectRequiresRest(
    project.projectDir,
    project.packageJson,
  );
  const requiresInteractivity = standaloneProjectRequiresInteractivity(
    project,
    requiresRest,
  );
  const parsedRestConfig = parseStandaloneRestConfig(
    project.projectDir,
    requiresRest,
    parsedConfig.options?.sourceTypeName ?? null,
  );
  const dependenciesCheck = getDependenciesCheck(
    project,
    requiresRest,
    requiresInteractivity,
  );
  return [
    createDoctorScopeCheck(
      'pass',
      `Scope: standalone scaffold diagnostics for ${project.packageName}. Environment readiness checks ran and package metadata, plugin bootstrap, source layout, dependencies, and canonical generated artifacts are checked below.`,
    ),
    getPackageMetadataCheck(project, requiresRest, requiresInteractivity),
    getBootstrapCheck(project, parsedRestConfig),
    getSourceLayoutCheck(
      project,
      parsedConfig,
      parsedRestConfig,
      requiresInteractivity,
    ),
    dependenciesCheck,
    await getGeneratedArtifactsCheck(
      project,
      parsedConfig,
      parsedRestConfig,
      dependenciesCheck.status === 'pass',
    ),
  ];
}
