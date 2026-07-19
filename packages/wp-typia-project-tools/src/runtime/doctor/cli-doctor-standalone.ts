import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  resolveSyncBlockMetadataPaths,
  runSyncBlockMetadata,
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
  hasPhpFunctionCall,
  hasPhpFunctionCallWithStringArguments,
} from '../shared/php-utils.js';
import { readJsonFileSync } from '../shared/json-utils.js';
import {
  createDoctorCheck,
  createDoctorScopeCheck,
} from './cli-doctor-workspace-shared.js';

import type { DoctorCheck } from './cli-doctor.js';
import type { GeneratedPackageJson } from '../shared/package-json-types.js';

const STANDALONE_SYNC_SCRIPT = path.join(
  'scripts',
  'sync-types-to-block-json.ts',
);
const STANDALONE_SYNC_PROJECT_SCRIPT = path.join('scripts', 'sync-project.ts');
const STANDALONE_INDEX_FILE = path.join('src', 'index.tsx');
const STANDALONE_SAVE_FILE = path.join('src', 'save.tsx');
const STANDALONE_TYPES_FILE = path.join('src', 'types.ts');
// WordPress core's get_file_data() reads the first 8 KiB for plugin headers.
const WORDPRESS_PLUGIN_HEADER_SCAN_BYTES = 8 * 1024;
// Mirrors get_file_data()'s `[ \t\/*#@]*` header prefix. Its zero-length
// match is intentional: WordPress recognizes a bare `Plugin Name:` line too.
const WORDPRESS_PLUGIN_NAME_HEADER_PATTERN =
  /^[\t \/*#@]*Plugin Name\s*:\s*\S.*$/imu;
const REQUIRED_RUNTIME_PACKAGES = [
  '@wp-typia/block-runtime',
  '@wp-typia/block-types',
  'typia',
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
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    for (const element of statement.importClause.namedBindings.elements) {
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

function hasShadowedCanonicalSyncBinding(
  sourceFile: ts.SourceFile,
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
      ts.isImportEqualsDeclaration(node)
    ) {
      declaredName = node.name;
    }

    if (bindingNameContains(declaredName, bindings)) {
      shadowed = true;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return shadowed;
}

function findSyncOptionsObject(
  sourceFile: ts.SourceFile,
  syncImportBindings: ReadonlySet<string>,
): ts.ObjectLiteralExpression | null {
  let result: ts.ObjectLiteralExpression | null = null;

  function visit(node: ts.Node): void {
    if (result) {
      return;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      syncImportBindings.has(node.expression.text) &&
      node.arguments.length > 0 &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      result = node.arguments[0];
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return result;
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
  if (hasShadowedCanonicalSyncBinding(sourceFile, syncImportBindings)) {
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

function splitShellCommandSegments(script: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;

  function pushCurrent(): void {
    const normalized = current.replace(/\s+/gu, ' ').trim();
    if (normalized.length > 0) {
      segments.push(normalized);
    }
    current = '';
  }

  for (let index = 0; index < script.length; index += 1) {
    const character = script[index];
    if (character === '\\' && quote !== "'") {
      current += character;
      if (script[index + 1] !== undefined) {
        current += script[index + 1];
        index += 1;
      }
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
      pushCurrent();
      if (isTwoCharacterOperator) {
        index += 1;
      }
      continue;
    }
    current += character;
  }
  pushCurrent();
  return segments;
}

function shellScriptInvokesCommand(script: string, command: string): boolean {
  return splitShellCommandSegments(script).some(
    (segment) => segment === command || segment.startsWith(`${command} `),
  );
}

function getPackageMetadataCheck(
  project: StandaloneScaffoldProject,
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
  const packageManager = inferPackageManagerId(
    project.projectDir,
    project.packageJson.packageManager,
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
    },
    {
      commands: [syncCheckCommand, 'tsc --noEmit'],
      name: 'typecheck',
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
  }
  for (const packageName of [
    ...REQUIRED_RUNTIME_PACKAGES,
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
  try {
    source = fs.readFileSync(bootstrapPath, 'utf8');
  } catch {
    return createDoctorCheck(
      'Standalone plugin bootstrap',
      'fail',
      `Unable to read package-aligned plugin bootstrap ${bootstrapRelativePath}`,
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );
  }
  const headerRegion = source
    .slice(0, WORDPRESS_PLUGIN_HEADER_SCAN_BYTES)
    .replace(/^\uFEFF/u, '');
  const hasPluginHeader = WORDPRESS_PLUGIN_NAME_HEADER_PATTERN.test(headerRegion);
  const hasRegistrationCall = hasPhpFunctionCall(source, 'register_block_type');
  const hasRegistrationHook = hasPhpFunctionCallWithStringArguments(
    source,
    'add_action',
    [
      'init',
      (callbackName) =>
        /^[A-Za-z_][A-Za-z0-9_]*_register_block$/u.test(callbackName),
    ],
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
  const issues = [
    ...(missingFiles.length > 0 ? [`Missing: ${missingFiles.join(', ')}`] : []),
    ...(parsedConfig.problem ? [parsedConfig.problem] : []),
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

function canResolveFromProject(
  projectDir: string,
  packageName: string,
  resolutionSpecifier: string,
): boolean {
  const projectRequire = createRequire(path.join(projectDir, 'package.json'));
  try {
    const localPackageEntry = path.join(
      projectDir,
      'node_modules',
      ...packageName.split('/'),
    );
    if (!fs.existsSync(localPackageEntry)) {
      return false;
    }
    const localPackageRoot = fs.realpathSync(localPackageEntry);
    const resolvedPath = fs.realpathSync(
      projectRequire.resolve(resolutionSpecifier),
    );
    return isProjectLocalRelativePath(
      path.relative(localPackageRoot, resolvedPath),
    );
  } catch {
    return false;
  }
}

function getDependenciesCheck(project: StandaloneScaffoldProject): DoctorCheck {
  const missingPackages = REQUIRED_INSTALLED_PACKAGES.filter(
    ({ packageName, resolutionSpecifier }) =>
      !canResolveFromProject(
        project.projectDir,
        packageName,
        resolutionSpecifier,
      ),
  ).map(({ diagnosticName }) => diagnosticName);
  const packageManager = inferPackageManagerId(
    project.projectDir,
    project.packageJson.packageManager,
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
): string[] {
  const resolvedPaths = resolveSyncBlockMetadataPaths(options);
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
  dependenciesReady: boolean,
): Promise<DoctorCheck> {
  const packageManager = inferPackageManagerId(
    project.projectDir,
    project.packageJson.packageManager,
  );
  const syncCommand = formatRunScript(packageManager, 'sync');
  if (!parsedConfig.options) {
    return createDoctorCheck(
      'Standalone generated artifacts',
      'fail',
      `Canonical freshness check is blocked by the source layout. Fix that row, run \`${syncCommand}\`, and rerun doctor.`,
      STANDALONE_DOCTOR_CODES.ARTIFACTS,
    );
  }

  const artifactPaths = getConfiguredArtifactPaths(parsedConfig.options);
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

  let report: SyncBlockMetadataReport;
  try {
    report = await runSyncBlockMetadata(parsedConfig.options, {
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
  const dependenciesCheck = getDependenciesCheck(project);
  return [
    createDoctorScopeCheck(
      'pass',
      `Scope: standalone scaffold diagnostics for ${project.packageName}. Environment readiness checks ran and package metadata, plugin bootstrap, source layout, dependencies, and canonical generated artifacts are checked below.`,
    ),
    getPackageMetadataCheck(project),
    getBootstrapCheck(project),
    getSourceLayoutCheck(project, parsedConfig),
    dependenciesCheck,
    await getGeneratedArtifactsCheck(
      project,
      parsedConfig,
      dependenciesCheck.status === 'pass',
    ),
  ];
}
