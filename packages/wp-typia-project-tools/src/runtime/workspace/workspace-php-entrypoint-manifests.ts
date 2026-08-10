import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

import {
  findPhpFunctionRange,
  hasPhpFunctionDefinition,
  hasPhpLiteralDirectoryInclude,
} from '../shared/php-utils.js';
import {
  buildLegacyGeneratedGlobArrayLoader,
  buildLegacyGeneratedGlobLoader,
  buildRestSchemaHelperCompatibilityFunctions,
  isEquivalentGeneratedPhp,
  migrateGeneratedPhpLoaderFunction,
  replaceLegacyGeneratedPhpFunction,
} from '../add/cli-add-workspace-php-loader-migration.js';

export const ENTRYPOINT_MANIFEST_STEM = 'wp-typia-modules';
const ENTRYPOINT_MANIFEST_BASENAME = `${ENTRYPOINT_MANIFEST_STEM}.php`;
const SAFE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/u;
const GENERATED_MANIFEST_HEADER_LINES = [
  '<?php',
  '/**',
  ' * Generated WordPress PHP module entrypoints.',
] as const;
const GENERATED_MANIFEST_HEADER = GENERATED_MANIFEST_HEADER_LINES.join('\n');
const LEGACY_BLOCK_SERVER_LOADER_PATTERN =
  /foreach\s*\(\s*glob\s*\(\s*__DIR__\s*\.\s*['"]\/src\/blocks\/\*\/server\.php['"]\s*\)\s*\?:\s*array\s*\(\s*\)\s*as\s*\$server_module\s*\)\s*\{\s*require_once\s+\$server_module\s*;\s*\}/u;
const REST_SCHEMA_HELPER_PATH = '/inc/rest-schema.php';

/** Managed PHP manifest paths for each generated workspace module family. */
export const WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS = {
  abilities: 'inc/abilities/wp-typia-modules.php',
  adminViews: 'inc/admin-views/wp-typia-modules.php',
  aiFeatures: 'inc/ai-features/wp-typia-modules.php',
  bindingSources: 'src/bindings/wp-typia-modules.php',
  blockServers: 'src/blocks/wp-typia-modules.php',
  patterns: 'src/patterns/wp-typia-modules.php',
  postMeta: 'inc/post-meta/wp-typia-modules.php',
  restResources: 'inc/rest/wp-typia-modules.php',
} as const;

/** Identifier for one managed workspace PHP entrypoint manifest family. */
export type WorkspacePhpEntrypointManifestId =
  keyof typeof WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS;

interface WorkspacePhpEntrypointManifestDescriptor {
  id: WorkspacePhpEntrypointManifestId;
  includeKind: 'require' | 'require_once';
  sourceDirectory: string;
  sourceKind: 'direct-php' | 'nested-php' | 'server-php';
}

const WORKSPACE_PHP_ENTRYPOINT_MANIFESTS: readonly WorkspacePhpEntrypointManifestDescriptor[] =
  [
    {
      id: 'abilities',
      includeKind: 'require_once',
      sourceDirectory: 'inc/abilities',
      sourceKind: 'direct-php',
    },
    {
      id: 'adminViews',
      includeKind: 'require_once',
      sourceDirectory: 'inc/admin-views',
      sourceKind: 'direct-php',
    },
    {
      id: 'aiFeatures',
      includeKind: 'require_once',
      sourceDirectory: 'inc/ai-features',
      sourceKind: 'direct-php',
    },
    {
      id: 'bindingSources',
      includeKind: 'require_once',
      sourceDirectory: 'src/bindings',
      sourceKind: 'server-php',
    },
    {
      id: 'blockServers',
      includeKind: 'require_once',
      sourceDirectory: 'src/blocks',
      sourceKind: 'server-php',
    },
    {
      id: 'patterns',
      includeKind: 'require',
      sourceDirectory: 'src/patterns',
      sourceKind: 'nested-php',
    },
    {
      id: 'postMeta',
      includeKind: 'require_once',
      sourceDirectory: 'inc/post-meta',
      sourceKind: 'direct-php',
    },
    {
      id: 'restResources',
      includeKind: 'require_once',
      sourceDirectory: 'inc/rest',
      sourceKind: 'direct-php',
    },
  ];

function assertSafePathSegment(segment: string, context: string): void {
  if (!SAFE_PATH_SEGMENT_PATTERN.test(
    segment,
  ) || segment === '.' || segment === '..') {
    throw new Error(
      `Cannot generate the PHP entrypoint manifest for unsafe ${context} path segment: ${JSON.stringify(segment)}`,
    );
  }
}

async function readDirectoryEntries(directoryPath: string) {
  try {
    return await fsp.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function discoverDirectPhpFiles(directoryPath: string): Promise<string[]> {
  const entries = await readDirectoryEntries(directoryPath);
  if (entries === null) {
    return [];
  }

  const modulePaths: string[] = [];
  for (const entry of entries) {
    if (
      entry.name === ENTRYPOINT_MANIFEST_BASENAME ||
      !entry.name.endsWith('.php')
    ) {
      continue;
    }
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Cannot generate a PHP entrypoint for symbolic link: ${entry.name}`,
      );
    }
    if (!entry.isFile()) {
      continue;
    }
    assertSafePathSegment(entry.name, 'PHP module');
    modulePaths.push(entry.name);
  }
  return modulePaths.sort();
}

async function discoverServerPhpFiles(directoryPath: string): Promise<string[]> {
  const entries = await readDirectoryEntries(directoryPath);
  if (entries === null) {
    return [];
  }

  const modulePaths: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Cannot generate a PHP entrypoint for symbolic link: ${entry.name}`,
      );
    }
    if (!entry.isDirectory()) {
      continue;
    }
    assertSafePathSegment(entry.name, 'module directory');
    let serverStat: Awaited<ReturnType<typeof fsp.lstat>>;
    try {
      serverStat = await fsp.lstat(
        path.join(directoryPath, entry.name, 'server.php'),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw error;
    }
    if (serverStat.isSymbolicLink()) {
      throw new Error(
        `Cannot generate a PHP entrypoint for symbolic link: ${entry.name}/server.php`,
      );
    }
    if (serverStat.isFile()) {
      modulePaths.push(`${entry.name}/server.php`);
    }
  }
  return modulePaths.sort();
}

async function discoverNestedPhpFiles(directoryPath: string): Promise<string[]> {
  const entries = await readDirectoryEntries(directoryPath);
  if (entries === null) {
    return [];
  }

  const modulePaths: string[] = [];
  const nestedDirectoryNames: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Cannot generate a PHP entrypoint for symbolic link: ${entry.name}`,
      );
    }
    if (
      entry.isFile() &&
      entry.name.endsWith('.php') &&
      entry.name !== ENTRYPOINT_MANIFEST_BASENAME
    ) {
      assertSafePathSegment(entry.name, 'pattern');
      modulePaths.push(entry.name);
      continue;
    }
    if (!entry.isDirectory()) {
      continue;
    }
    assertSafePathSegment(entry.name, 'pattern');
    nestedDirectoryNames.push(entry.name);
  }
  const nestedDirectories = await Promise.all(
    nestedDirectoryNames.map(async (directoryName) => ({
      directoryName,
      entries:
        (await readDirectoryEntries(
          path.join(directoryPath, directoryName),
        )) ?? [],
    })),
  );
  for (const {
    directoryName,
    entries: nestedEntries,
  } of nestedDirectories) {
    for (const nestedEntry of nestedEntries) {
      if (nestedEntry.isSymbolicLink()) {
        throw new Error(
          `Cannot generate a PHP entrypoint for symbolic link: ${directoryName}/${nestedEntry.name}`,
        );
      }
      if (!nestedEntry.isFile() || !nestedEntry.name.endsWith('.php')) {
        continue;
      }
      assertSafePathSegment(nestedEntry.name, 'nested pattern');
      modulePaths.push(`${directoryName}/${nestedEntry.name}`);
    }
  }
  return modulePaths.sort();
}

async function discoverManifestModules(
  descriptor: WorkspacePhpEntrypointManifestDescriptor,
  directoryPath: string,
): Promise<string[]> {
  if (descriptor.sourceKind === 'direct-php') {
    return discoverDirectPhpFiles(directoryPath);
  }
  if (descriptor.sourceKind === 'server-php') {
    return discoverServerPhpFiles(directoryPath);
  }
  return discoverNestedPhpFiles(directoryPath);
}

function renderManifest(
  descriptor: WorkspacePhpEntrypointManifestDescriptor,
  modulePaths: readonly string[],
): string {
  const includeLines = modulePaths.map(
    (modulePath) =>
      `${descriptor.includeKind} __DIR__ . '/${modulePath}';`,
  );
  return [
    ...GENERATED_MANIFEST_HEADER_LINES,
    ' *',
    ' * This file is managed by wp-typia. Run the project sync command',
    ' * after adding or removing a generated server module.',
    ' */',
    '',
    "if ( ! defined( 'ABSPATH' ) ) {",
    '\texit;',
    '}',
    '',
    ...(includeLines.length > 0
      ? includeLines
      : ['// No generated PHP modules are currently registered.']),
    '',
  ].join('\n');
}

async function writeFileAtomically(
  targetPath: string,
  source: string,
): Promise<void> {
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fsp.writeFile(temporaryPath, source, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await fsp.rename(temporaryPath, targetPath);
  } finally {
    try {
      await fsp.rm(temporaryPath, { force: true });
    } catch {
      // Cleanup is best effort and must not mask the original write failure.
    }
  }
}

export interface SyncWorkspacePhpEntrypointsOptions {
  /** Report stale manifests without modifying the workspace. */
  check?: boolean;
  /** Restrict synchronization to selected manifest families. */
  manifestIds?: readonly WorkspacePhpEntrypointManifestId[];
}

export interface SyncWorkspacePhpEntrypointsResult {
  /** Manifest paths that were stale before this operation. */
  changed: string[];
}

type LegacyWorkspaceLoaderSpec = {
  functionSuffix: string;
  id: Exclude<WorkspacePhpEntrypointManifestId, 'blockServers'>;
  includeKind: 'require' | 'require_once';
  moduleVariable: string;
};

const LEGACY_WORKSPACE_LOADER_SPECS: readonly LegacyWorkspaceLoaderSpec[] = [
  {
    functionSuffix: 'load_workflow_abilities',
    id: 'abilities',
    includeKind: 'require_once',
    moduleVariable: 'ability_module',
  },
  {
    functionSuffix: 'load_admin_views',
    id: 'adminViews',
    includeKind: 'require_once',
    moduleVariable: 'admin_view_module',
  },
  {
    functionSuffix: 'register_ai_features',
    id: 'aiFeatures',
    includeKind: 'require_once',
    moduleVariable: 'ai_feature_module',
  },
  {
    functionSuffix: 'register_binding_sources',
    id: 'bindingSources',
    includeKind: 'require_once',
    moduleVariable: 'binding_source_module',
  },
  {
    functionSuffix: 'register_patterns',
    id: 'patterns',
    includeKind: 'require',
    moduleVariable: 'pattern_module',
  },
  {
    functionSuffix: 'register_post_meta_contracts',
    id: 'postMeta',
    includeKind: 'require_once',
    moduleVariable: 'post_meta_module',
  },
  {
    functionSuffix: 'register_rest_resources',
    id: 'restResources',
    includeKind: 'require_once',
    moduleVariable: 'rest_resource_module',
  },
] as const;

function buildLegacyWorkspaceLoaderFunctions(
  spec: LegacyWorkspaceLoaderSpec,
  functionName: string,
): string[] {
  if (spec.id === 'patterns') {
    return [
      buildLegacyGeneratedGlobLoader({
        functionName,
        globPath: '/src/patterns/*.php',
        includeKind: 'require',
        moduleVariable: spec.moduleVariable,
      }),
      buildLegacyGeneratedGlobArrayLoader({
        functionName,
        globPaths: ['/src/patterns/*.php'],
        includeKind: 'require',
        moduleVariable: spec.moduleVariable,
        modulesVariable: 'pattern_modules',
      }),
      buildLegacyGeneratedGlobArrayLoader({
        functionName,
        globPaths: ['/src/patterns/*.php', '/src/patterns/*/*.php'],
        includeKind: 'require',
        moduleVariable: spec.moduleVariable,
        modulesVariable: 'pattern_modules',
      }),
    ];
  }
  const sourceDirectory = WORKSPACE_PHP_ENTRYPOINT_MANIFESTS.find(
    (descriptor) => descriptor.id === spec.id,
  )?.sourceDirectory;
  if (!sourceDirectory) {
    throw new Error(`Missing PHP entrypoint descriptor for ${spec.id}.`);
  }
  const globSuffix = spec.id === 'bindingSources' ? '*/server.php' : '*.php';
  return [
    buildLegacyGeneratedGlobLoader({
      functionName,
      globPath: `/${sourceDirectory}/${globSuffix}`,
      includeKind: spec.includeKind,
      moduleVariable: spec.moduleVariable,
    }),
  ];
}

function buildWorkspaceManifestLoaderFunction(
  spec: LegacyWorkspaceLoaderSpec,
  functionName: string,
): string {
  const manifestPath = `/${WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS[spec.id]}`;
  return `

function ${functionName}() {
\t${spec.includeKind} __DIR__ . '${manifestPath}';
}
`;
}

function migrateRestSchemaHelper(
  source: string,
  bootstrapPath: string,
  phpPrefix: string,
): string {
  const functionName = `${phpPrefix}_load_rest_schema_helpers`;
  if (!hasPhpFunctionDefinition(source, functionName)) {
    return source;
  }
  const functionRange = findPhpFunctionRange(source, functionName);
  const compatibilityFunctions = buildRestSchemaHelperCompatibilityFunctions({
    functionName,
    helperPath: REST_SCHEMA_HELPER_PATH,
  });
  if (functionRange && compatibilityFunctions.currentFunctions.some(
    (currentFunction) =>
      isEquivalentGeneratedPhp(functionRange.source, currentFunction),
  )) {
    return source;
  }
  return replaceLegacyGeneratedPhpFunction({
    bootstrapPath,
    functionName,
    legacyFunctions: compatibilityFunctions.legacyFunctions,
    replacement: compatibilityFunctions.replacement,
    source,
  });
}

async function migrateLegacyWorkspaceBootstrap(
  projectDir: string,
  selectedManifestIds: ReadonlySet<WorkspacePhpEntrypointManifestId> | null,
): Promise<{
  bootstrapPath: string;
  currentSource: string;
  nextSource: string;
  relativePath: string;
} | null> {
  let packageJson: {
    name?: string;
    wpTypia?: { phpPrefix?: string };
  };
  try {
    packageJson = JSON.parse(
      await fsp.readFile(path.join(projectDir, 'package.json'), 'utf8'),
    ) as {
      name?: string;
      wpTypia?: { phpPrefix?: string };
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
  const packageBaseName = (packageJson.name ?? path.basename(projectDir))
    .split('/')
    .pop();
  if (!packageBaseName) {
    return null;
  }
  assertSafePathSegment(packageBaseName, 'package basename');
  const bootstrapRelativePath = `${packageBaseName}.php`;
  const bootstrapPath = path.join(projectDir, bootstrapRelativePath);
  let source: string;
  try {
    source = await fsp.readFile(bootstrapPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
  let nextSource = source;
  if (
    selectedManifestIds === null ||
    selectedManifestIds.has('blockServers')
  ) {
    const manifestPath = `/${WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.blockServers}`;
    if (!hasPhpLiteralDirectoryInclude(nextSource, manifestPath, {
      requirePhpOpenTag: true,
    })) {
      if (!LEGACY_BLOCK_SERVER_LOADER_PATTERN.test(nextSource)) {
        if (nextSource.includes('/src/blocks/*/server.php')) {
          throw new Error(
            `Unable to migrate customized block server loader in ${bootstrapRelativePath}. Wire ${manifestPath} manually.`,
          );
        }
      } else {
        nextSource = nextSource.replace(
          LEGACY_BLOCK_SERVER_LOADER_PATTERN,
          `require_once __DIR__ . '${manifestPath}';`,
        );
      }
    }
  }

  const phpPrefix = packageJson.wpTypia?.phpPrefix;
  if (phpPrefix) {
    for (const spec of LEGACY_WORKSPACE_LOADER_SPECS) {
      if (selectedManifestIds !== null && !selectedManifestIds.has(spec.id)) {
        continue;
      }
      const functionName = `${phpPrefix}_${spec.functionSuffix}`;
      if (!hasPhpFunctionDefinition(nextSource, functionName)) {
        continue;
      }
      nextSource = migrateGeneratedPhpLoaderFunction({
        bootstrapPath,
        functionName,
        legacyFunctions: buildLegacyWorkspaceLoaderFunctions(
          spec,
          functionName,
        ),
        manifestPath: `/${WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS[spec.id]}`,
        replacement: buildWorkspaceManifestLoaderFunction(spec, functionName),
        source: nextSource,
      });
    }
    if (
      selectedManifestIds === null ||
      selectedManifestIds.has('restResources')
    ) {
      nextSource = migrateRestSchemaHelper(
        nextSource,
        bootstrapPath,
        phpPrefix,
      );
    }
  }

  return {
    bootstrapPath,
    currentSource: source,
    nextSource,
    relativePath: bootstrapRelativePath,
  };
}

async function assertMissingSourceDirectoryIsSafe(
  projectDir: string,
  projectRealPath: string,
  sourceDirectory: string,
): Promise<void> {
  let ancestorPath = path.join(projectDir, sourceDirectory);
  while (true) {
    const ancestorRelativePath = path.relative(projectDir, ancestorPath);
    if (
      ancestorRelativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(ancestorRelativePath)
    ) {
      break;
    }
    try {
      const ancestorStat = await fsp.lstat(ancestorPath);
      if (ancestorStat.isSymbolicLink()) {
        throw new Error(
          `Cannot generate a PHP entrypoint manifest through a symbolic path: ${sourceDirectory}`,
        );
      }
      const ancestorRealPath = await fsp.realpath(ancestorPath);
      const expectedRealPath = path.resolve(
        projectRealPath,
        ancestorRelativePath,
      );
      if (ancestorRealPath !== expectedRealPath) {
        throw new Error(
          `Cannot generate a PHP entrypoint manifest through a symbolic path: ${sourceDirectory}`,
        );
      }
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    const parentPath = path.dirname(ancestorPath);
    if (parentPath === ancestorPath) {
      break;
    }
    ancestorPath = parentPath;
  }
  throw new Error(
    `Cannot validate the PHP entrypoint manifest path: ${sourceDirectory}`,
  );
}

/**
 * Synchronize literal PHP module manifests for a generated WordPress workspace.
 *
 * Each manifest is emitted inside the directory it inventories, so every PHP
 * include is a literal `__DIR__` expression without path traversal or a
 * variable include target.
 */
export async function syncWorkspacePhpEntrypoints(
  projectDir: string,
  options: SyncWorkspacePhpEntrypointsOptions = {},
): Promise<SyncWorkspacePhpEntrypointsResult> {
  const changed: string[] = [];
  const projectRealPath = await fsp.realpath(projectDir);
  const selectedManifestIds = options.manifestIds
    ? new Set(options.manifestIds)
    : null;
  const bootstrapMigration = await migrateLegacyWorkspaceBootstrap(
    projectDir,
    selectedManifestIds,
  );
  const bootstrapChanged = Boolean(
    bootstrapMigration &&
      bootstrapMigration.currentSource !== bootstrapMigration.nextSource,
  );
  if (bootstrapChanged && bootstrapMigration) {
    changed.push(bootstrapMigration.relativePath);
  }
  const manifestWrites: Array<{
    manifestPath: string;
    sourceDirectoryPath: string;
    source: string;
  }> = [];

  for (const descriptor of WORKSPACE_PHP_ENTRYPOINT_MANIFESTS) {
    if (selectedManifestIds !== null && !selectedManifestIds.has(
      descriptor.id,
    )) {
      continue;
    }
    const sourceDirectoryPath = path.join(
      projectDir,
      descriptor.sourceDirectory,
    );
    let sourceDirectoryExists = true;
    let sourceDirectoryRealPath: string | null = null;
    try {
      sourceDirectoryRealPath = await fsp.realpath(sourceDirectoryPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        sourceDirectoryExists = false;
      } else {
        throw error;
      }
    }
    if (
      sourceDirectoryExists &&
      sourceDirectoryRealPath !==
      path.resolve(projectRealPath, descriptor.sourceDirectory)
    ) {
      throw new Error(
        `Cannot generate a PHP entrypoint manifest through a symbolic path: ${descriptor.sourceDirectory}`,
      );
    }
    const manifestIncludePath =
      `/${WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS[descriptor.id]}`;
    const bootstrapReferencesManifest = Boolean(
      bootstrapMigration &&
        hasPhpLiteralDirectoryInclude(
          bootstrapMigration.nextSource,
          manifestIncludePath,
          { requirePhpOpenTag: true },
        ),
    );
    if (!sourceDirectoryExists && !bootstrapReferencesManifest) {
      continue;
    }
    if (!sourceDirectoryExists) {
      await assertMissingSourceDirectoryIsSafe(
        projectDir,
        projectRealPath,
        descriptor.sourceDirectory,
      );
    }
    const modulePaths = sourceDirectoryExists
      ? await discoverManifestModules(descriptor, sourceDirectoryPath)
      : [];
    const expectedSource = renderManifest(descriptor, modulePaths);
    const manifestRelativePath =
      WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS[descriptor.id];
    const manifestPath = path.join(projectDir, manifestRelativePath);
    let currentSource: string | null = null;
    try {
      const manifestStat = await fsp.lstat(manifestPath);
      if (manifestStat.isSymbolicLink()) {
        throw new Error(
          `Cannot write a PHP entrypoint manifest through a symbolic link: ${manifestRelativePath}`,
        );
      }
      currentSource = (await fsp.readFile(manifestPath, 'utf8')).replace(
        /\r\n?/gu,
        '\n',
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    if (currentSource === expectedSource) {
      continue;
    }

    if (
      currentSource !== null &&
      !currentSource.startsWith(GENERATED_MANIFEST_HEADER)
    ) {
      throw new Error(
        `Refusing to overwrite unmanaged PHP entrypoint manifest: ${manifestRelativePath}`,
      );
    }

    manifestWrites.push({
      manifestPath,
      source: expectedSource,
      sourceDirectoryPath,
    });
    changed.push(manifestRelativePath);
  }

  if (options.check && changed.length > 0) {
    throw new Error(
      `Generated PHP entrypoints are stale: ${changed.join(', ')}. Run the project sync command.`,
    );
  }
  if (!options.check) {
    for (const manifestWrite of manifestWrites) {
      await fsp.mkdir(manifestWrite.sourceDirectoryPath, { recursive: true });
      await writeFileAtomically(
        manifestWrite.manifestPath,
        manifestWrite.source,
      );
    }
    if (bootstrapChanged && bootstrapMigration) {
      await writeFileAtomically(
        bootstrapMigration.bootstrapPath,
        bootstrapMigration.nextSource,
      );
    }
  }
  return { changed };
}
