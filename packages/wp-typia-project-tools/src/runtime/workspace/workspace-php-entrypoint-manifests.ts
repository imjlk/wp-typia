import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

const ENTRYPOINT_MANIFEST_BASENAME = 'wp-typia-modules.php';
const SAFE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/u;

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
      if (nestedEntry.name === ENTRYPOINT_MANIFEST_BASENAME) {
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
    '<?php',
    '/**',
    ' * Generated WordPress PHP module entrypoints.',
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

async function writeManifestAtomically(
  manifestPath: string,
  source: string,
): Promise<void> {
  const temporaryPath = `${manifestPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fsp.writeFile(temporaryPath, source, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await fsp.rename(temporaryPath, manifestPath);
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
    let sourceDirectoryRealPath: string;
    try {
      sourceDirectoryRealPath = await fsp.realpath(sourceDirectoryPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw error;
    }
    if (
      sourceDirectoryRealPath !==
      path.resolve(projectRealPath, descriptor.sourceDirectory)
    ) {
      throw new Error(
        `Cannot generate a PHP entrypoint manifest through a symbolic path: ${descriptor.sourceDirectory}`,
      );
    }
    const modulePaths = await discoverManifestModules(
      descriptor,
      sourceDirectoryPath,
    );
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

    if (!options.check) {
      await writeManifestAtomically(manifestPath, expectedSource);
    }
    changed.push(manifestRelativePath);
  }

  if (options.check && changed.length > 0) {
    throw new Error(
      `Generated PHP entrypoint manifests are stale: ${changed.join(', ')}. Run the project sync command.`,
    );
  }
  return { changed };
}
