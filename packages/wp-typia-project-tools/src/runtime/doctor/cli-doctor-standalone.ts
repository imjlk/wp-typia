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
  findPhpFunctionRange,
  hasPhpFunctionCall,
  hasPhpFunctionCallWithStringArguments,
} from '../shared/php-utils.js';
import { readJsonFileSync } from '../shared/json-utils.js';
import {
  createDoctorCheck,
  createDoctorScopeCheck,
} from './cli-doctor-workspace-shared.js';
import {
  checkStandaloneRestArtifacts,
  parseStandaloneRestConfig,
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
const STANDALONE_SAVE_FILE = path.join('src', 'save.tsx');
const STANDALONE_TYPES_FILE = path.join('src', 'types.ts');
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
const REQUIRED_REST_RUNTIME_PACKAGES = [
  '@wp-typia/rest',
  '@wp-typia/api-client',
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
] as const;
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

type StandaloneMetadataCoreModule = Pick<
  typeof import('@wp-typia/block-runtime/metadata-core'),
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
    return ts.isStringLiteralLike(property.initializer)
      ? property.initializer.text
      : undefined;
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
      if (
        importedName === 'runSyncBlockMetadata' ||
        importedName === 'syncBlockMetadata'
      ) {
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

function getAwaitedCallFromVariableStatement(
  statement: ts.Statement,
): ts.CallExpression | null {
  if (
    !ts.isVariableStatement(statement) ||
    statement.declarationList.declarations.length !== 1
  ) {
    return null;
  }
  const initializer = statement.declarationList.declarations[0].initializer;
  return initializer &&
    ts.isAwaitExpression(initializer) &&
    ts.isCallExpression(initializer.expression)
    ? initializer.expression
    : null;
}

function hasCanonicalSyncCheckOptions(
  expression: ts.Expression,
  optionsBinding: string,
): boolean {
  if (!ts.isObjectLiteralExpression(expression)) {
    return false;
  }
  const propertyNames = new Set<string>();
  let hasCheckBinding = false;
  for (const property of expression.properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      ts.isComputedPropertyName(property.name)
    ) {
      return false;
    }
    const propertyName =
      ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
        ? property.name.text
        : null;
    if (propertyName === null || propertyNames.has(propertyName)) {
      return false;
    }
    propertyNames.add(propertyName);
    if (propertyName === 'check') {
      hasCheckBinding =
        ts.isPropertyAccessExpression(property.initializer) &&
        ts.isIdentifier(property.initializer.expression) &&
        property.initializer.expression.text === optionsBinding &&
        property.initializer.name.text === 'check';
    }
  }
  return hasCheckBinding;
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
    !hasCanonicalCheckParser(sourceFile) ||
    !hasTopLevelMainInvocation(sourceFile)
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
    const call = getAwaitedCallFromVariableStatement(statement);
    if (
      !call ||
      !ts.isIdentifier(call.expression) ||
      !syncImportBindings.has(call.expression.text) ||
      call.arguments.length !== 2 ||
      !ts.isObjectLiteralExpression(call.arguments[0]) ||
      !hasCanonicalSyncCheckOptions(
        call.arguments[1],
        optionsDeclaration.binding,
      )
    ) {
      return [];
    }
    return [{ index, options: call.arguments[0] }];
  });
  if (calls.length !== 1) {
    return null;
  }
  const [call] = calls;
  return call.index === optionsDeclaration.index + 1 &&
    !hasEarlierAbruptCompletion(statements, call.index)
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

function containsCompletion(
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

function hasEarlierAbruptCompletion(
  statements: readonly ts.Statement[],
  statementIndex: number,
): boolean {
  return statements
    .slice(0, statementIndex)
    .some((statement) =>
      containsCompletion(
        statement,
        (node) => ts.isReturnStatement(node) || ts.isThrowStatement(node),
      ),
    );
}

function containsReturnCompletion(node: ts.Node): boolean {
  return containsCompletion(node, ts.isReturnStatement);
}

function isNonCheckArgumentGuard(
  node: ts.Node,
  argumentBinding: string,
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
      right.text !== '--check') ||
      (ts.isStringLiteralLike(left) &&
        left.text !== '--check' &&
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
    isNonCheckArgumentGuard(node, argumentBinding)
  ) {
    return (
      containsParserControlFlow(
        node.thenStatement,
        argumentBinding,
        check,
        breakableDepth,
        loopDepth,
        true,
        activeLabels,
      ) ||
      (node.elseStatement !== undefined &&
        containsParserControlFlow(
          node.elseStatement,
          argumentBinding,
          check,
          breakableDepth,
          loopDepth,
          outerContinueIsSafe,
          activeLabels,
        ))
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

function hasCanonicalRunnerErrorGuard(
  statement: ts.Statement | undefined,
  resultBinding: string,
): boolean {
  if (
    !statement ||
    !ts.isIfStatement(statement) ||
    statement.elseStatement ||
    !isResultPropertyAccess(statement.expression, resultBinding, 'error') ||
    !ts.isBlock(statement.thenStatement)
  ) {
    return false;
  }
  const finalStatement =
    statement.thenStatement.statements[
      statement.thenStatement.statements.length - 1
    ];
  return (
    finalStatement !== undefined &&
    ts.isThrowStatement(finalStatement) &&
    isResultPropertyAccess(finalStatement.expression, resultBinding, 'error') &&
    !statement.thenStatement.statements.some(containsReturnCompletion)
  );
}

function hasCanonicalRunnerStatusGuard(
  statement: ts.Statement | undefined,
  resultBinding: string,
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
    !ts.isBlock(statement.thenStatement)
  ) {
    return false;
  }
  const finalStatement =
    statement.thenStatement.statements[
      statement.thenStatement.statements.length - 1
    ];
  return (
    finalStatement !== undefined &&
    ts.isThrowStatement(finalStatement) &&
    !statement.thenStatement.statements.some(containsReturnCompletion)
  );
}

function hasCanonicalSyncRunner(sourceFile: ts.SourceFile): boolean {
  const runner = getSingleTopLevelFunction(sourceFile, 'runSyncScript');
  if (!runner?.body || runner.parameters.length !== 2) {
    return false;
  }
  const [scriptPathParameter, optionsParameter] = runner.parameters;
  if (
    !ts.isIdentifier(scriptPathParameter.name) ||
    !ts.isIdentifier(optionsParameter.name)
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
    hasShadowedBinding(sourceFile, spawnBindings)
  ) {
    return false;
  }

  const statements = [...runner.body.statements];
  const argsDeclarations: Array<{ binding: string; index: number }> = [];
  statements.forEach((statement, index) => {
    if (
      !ts.isVariableStatement(statement) ||
      !(statement.declarationList.flags & ts.NodeFlags.Const)
    ) {
      return;
    }
    for (const declaration of statement.declarationList.declarations) {
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
    if (!ts.isVariableStatement(statement)) {
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
        ts.isObjectLiteralExpression(call.arguments[2])
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
    !hasEarlierAbruptCompletion(statements, spawnIndex) &&
    hasCanonicalRunnerErrorGuard(
      statements[errorGuardIndex],
      resultBinding,
    ) &&
    hasCanonicalRunnerStatusGuard(
      statements[statusGuardIndex],
      resultBinding,
    )
  );
}

function hasTopLevelMainInvocation(sourceFile: ts.SourceFile): boolean {
  if (
    hasImportedBinding(sourceFile, 'process') ||
    hasShadowedBinding(sourceFile, new Set(['process']))
  ) {
    return false;
  }
  return (
    sourceFile.statements.filter((statement) => {
      if (!ts.isExpressionStatement(statement)) {
        return false;
      }
      const outerCall = statement.expression;
      if (
        !ts.isCallExpression(outerCall) ||
        !ts.isPropertyAccessExpression(outerCall.expression) ||
        outerCall.expression.name.text !== 'catch'
      ) {
        return false;
      }
      const mainCall = outerCall.expression.expression;
      if (
        !ts.isCallExpression(mainCall) ||
        !ts.isIdentifier(mainCall.expression) ||
        mainCall.expression.text !== 'main' ||
        mainCall.arguments.length !== 0 ||
        outerCall.arguments.length !== 1
      ) {
        return false;
      }
      const catchHandler = outerCall.arguments[0];
      if (
        (!ts.isArrowFunction(catchHandler) &&
          !ts.isFunctionExpression(catchHandler)) ||
        !ts.isBlock(catchHandler.body)
      ) {
        return false;
      }
      const finalStatement =
        catchHandler.body.statements[catchHandler.body.statements.length - 1];
      if (
        !finalStatement ||
        !ts.isExpressionStatement(finalStatement) ||
        hasEarlierAbruptCompletion(
          catchHandler.body.statements,
          catchHandler.body.statements.length - 1,
        )
      ) {
        return false;
      }
      const exitCall = finalStatement.expression;
      return (
        ts.isCallExpression(exitCall) &&
        ts.isPropertyAccessExpression(exitCall.expression) &&
        ts.isIdentifier(exitCall.expression.expression) &&
        exitCall.expression.expression.text === 'process' &&
        exitCall.expression.name.text === 'exit' &&
        exitCall.arguments.length === 1 &&
        ts.isNumericLiteral(exitCall.arguments[0]) &&
        exitCall.arguments[0].text === '1'
      );
    }).length === 1
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
      !(statement.declarationList.flags & ts.NodeFlags.Const)
    ) {
      return;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        predicate(declaration.initializer)
      ) {
        bindings.push({ binding: declaration.name.text, index });
      }
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

function isCanonicalCheckAssignment(
  statement: ts.Statement,
  optionsBinding: string,
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
    isResultPropertyAccess(left, optionsBinding, 'check') &&
    right.kind === ts.SyntaxKind.TrueKeyword
  );
}

function hasCanonicalCheckGuard(
  body: ts.Block,
  argumentBinding: string,
  optionsBinding: string,
): boolean {
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
      statement.expression.right.text !== '--check' ||
      !ts.isBlock(statement.thenStatement) ||
      statement.thenStatement.statements.length !== 2
    ) {
      return [];
    }
    return (
      isCanonicalCheckAssignment(
        statement.thenStatement.statements[0],
        optionsBinding,
      ) && ts.isContinueStatement(statement.thenStatement.statements[1])
    )
      ? [index]
      : [];
  });
  if (guardIndexes.length !== 1) {
    return false;
  }
  return (
    !containsParserControlFlow(
      body,
      argumentBinding,
      'outer-break-or-return',
    ) &&
    !body.statements
      .slice(0, guardIndexes[0])
      .some((statement) =>
        containsParserControlFlow(
          statement,
          argumentBinding,
          'unsafe-continue',
        ),
      )
  );
}

function getCanonicalForOfArgument(
  statement: ts.ForOfStatement,
  argvBinding: string,
): { argumentBinding: string; body: ts.Block } | null {
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
  };
}

function getCanonicalIndexedArgument(
  statement: ts.ForStatement,
  argvBinding: string,
): { argumentBinding: string; body: ts.Block } | null {
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
      }
    : null;
}

function hasCanonicalCheckParser(sourceFile: ts.SourceFile): boolean {
  const parser = getSingleTopLevelFunction(sourceFile, 'parseCliOptions');
  if (
    !parser?.body ||
    parser.parameters.length !== 1 ||
    !ts.isIdentifier(parser.parameters[0].name) ||
    parser.body.statements.length !== 3
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
  if (
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
  return (
    loop !== null &&
    hasCanonicalCheckGuard(
      loop.body,
      loop.argumentBinding,
      optionsDeclaration.name.text,
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
    !hasTopLevelMainInvocation(sourceFile) ||
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
  if (!requiresRest) {
    return null;
  }
  const restDelegationIndex = getCanonicalSyncProjectDelegationIndex(
    sourceFile,
    STANDALONE_SYNC_REST_SCRIPT,
    true,
  );
  return restDelegationIndex === null ||
    restDelegationIndex <= typeDelegationIndex
    ? `${STANDALONE_SYNC_PROJECT_SCRIPT} must delegate to ${STANDALONE_SYNC_REST_SCRIPT} through the canonical tsx runner after the type sync.`
    : null;
}

type ShellCommandSegment = {
  command: string;
  operatorAfter: '&&' | '&' | '||' | '|' | '|&' | ';' | null;
};

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
): boolean {
  return (
    segment.command === command || segment.command.startsWith(`${command} `)
  );
}

function shellScriptInvokesCommand(script: string, command: string): boolean {
  return splitShellCommandSegments(script).some((segment) =>
    shellCommandMatches(segment, command),
  );
}

function shellScriptRunsCommandAfterSyncCheck(
  script: string,
  syncCheckCommand: string,
  targetCommand: string,
): boolean {
  const segments = splitShellCommandSegments(script);
  let syncCheckInAndList = false;
  let foundTarget = false;
  for (const segment of segments) {
    if (shellCommandMatches(segment, syncCheckCommand)) {
      syncCheckInAndList = true;
    }
    if (shellCommandMatches(segment, targetCommand)) {
      if (!syncCheckInAndList) {
        return false;
      }
      foundTarget = true;
    }
    if (segment.operatorAfter !== '&&') {
      syncCheckInAndList = false;
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
  const scriptRequirements = [
    { commands: ['tsx scripts/sync-project.ts'], name: 'sync' },
    {
      commands: ['tsx scripts/sync-types-to-block-json.ts'],
      name: 'sync-types',
    },
    {
      commands: [syncCheckCommand, 'wp-scripts build'],
      name: 'build',
      orderedTarget: 'wp-scripts build',
    },
    {
      commands: [syncCheckCommand, 'tsc --noEmit'],
      name: 'typecheck',
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
      if (!shellScriptInvokesCommand(script, command)) {
        issues.push(
          `package.json ${requirement.name} script must invoke \`${command}\``,
        );
      }
    }
    if (
      'orderedTarget' in requirement &&
      requirement.commands.every((command) =>
        shellScriptInvokesCommand(script, command),
      ) &&
      !shellScriptRunsCommandAfterSyncCheck(
        script,
        syncCheckCommand,
        requirement.orderedTarget,
      )
    ) {
      issues.push(
        `package.json ${requirement.name} script must run \`${syncCheckCommand}\` before \`${requirement.orderedTarget}\` in the same && command list`,
      );
    }
  }
  for (const packageName of [
    ...REQUIRED_RUNTIME_PACKAGES,
    ...(requiresRest ? REQUIRED_REST_RUNTIME_PACKAGES : []),
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

function getBootstrapCheck(project: StandaloneScaffoldProject): DoctorCheck {
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
          hasPhpFunctionCall(callbackRange.source, 'register_block_type')
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
  ];
  return createDoctorCheck(
    'Standalone plugin bootstrap',
    issues.length === 0 ? 'pass' : 'fail',
    issues.length === 0
      ? `${bootstrapRelativePath} contains a WordPress plugin header and init registration wiring`
      : `${bootstrapRelativePath} ${issues.join('; ')}`,
    STANDALONE_DOCTOR_CODES.BOOTSTRAP,
  );
}

function getSourceLayoutCheck(
  project: StandaloneScaffoldProject,
  parsedConfig: ParsedStandaloneSyncConfig,
  parsedRestConfig: ParsedStandaloneRestConfig,
): DoctorCheck {
  const missingFiles = [
    STANDALONE_SYNC_SCRIPT,
    STANDALONE_SYNC_PROJECT_SCRIPT,
    STANDALONE_INDEX_FILE,
    STANDALONE_TYPES_FILE,
    STANDALONE_SAVE_FILE,
  ].filter(
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
      ? 'Supported src/types.ts single-block layout and static canonical sync configuration detected'
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
      ? (['syncEndpointClient', 'syncRestOpenApi', 'syncTypeSchemas'] as const)
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
): DoctorCheck {
  const requiredInstalledPackages = [
    ...REQUIRED_INSTALLED_PACKAGES,
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

  let artifactPaths = [
    ...getConfiguredArtifactPaths(parsedConfig.options),
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
      ...getConfiguredArtifactPaths(parsedConfig.options, metadataCore),
      ...parsedRestConfig.artifactPaths,
    ];
    report = await metadataCore.runSyncBlockMetadata(parsedConfig.options, {
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
  const parsedRestConfig = parseStandaloneRestConfig(
    project.projectDir,
    requiresRest,
  );
  const dependenciesCheck = getDependenciesCheck(project, requiresRest);
  return [
    createDoctorScopeCheck(
      'pass',
      `Scope: standalone scaffold diagnostics for ${project.packageName}. Environment readiness checks ran and package metadata, plugin bootstrap, source layout, dependencies, and canonical generated artifacts are checked below.`,
    ),
    getPackageMetadataCheck(project, requiresRest),
    getBootstrapCheck(project),
    getSourceLayoutCheck(project, parsedConfig, parsedRestConfig),
    dependenciesCheck,
    await getGeneratedArtifactsCheck(
      project,
      parsedConfig,
      parsedRestConfig,
      dependenciesCheck.status === 'pass',
    ),
  ];
}
