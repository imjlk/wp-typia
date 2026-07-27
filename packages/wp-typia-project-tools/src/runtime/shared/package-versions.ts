import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { getOptionalNodeErrorCode } from './fs-async.js';
import { safeJsonParse } from './json-utils.js';
import { PROJECT_TOOLS_PACKAGE_ROOT } from '../templates/template-registry.js';

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  version?: string;
}

export interface PackageVersions {
  apiClientPackageVersion: string;
  blockRuntimePackageVersion: string;
  blockTypesPackageVersion: string;
  projectToolsPackageVersion: string;
  restPackageVersion: string;
  ttscLintPackageVersion: string;
  ttscPackageVersion: string;
  ttscUnpluginPackageVersion: string;
  /**
   * @deprecated Compatibility alias for {@link ttscPackageVersion}.
   */
  tsxPackageVersion: string;
  typiaPackageVersion: string;
  /**
   * @deprecated Compatibility alias for {@link ttscUnpluginPackageVersion}.
   */
  typiaUnpluginPackageVersion: string;
  typescriptPackageVersion: string;
  wpTypiaPackageExactVersion: string;
  wpTypiaPackageVersion: string;
}

interface PackageManifestLocation {
  cacheKey: string;
  packageJsonPath: string | null;
  source: string | null;
}

const require = createRequire(import.meta.url);
const DEFAULT_VERSION_RANGE = '^0.0.0';
const DEFAULT_EXACT_VERSION = '0.0.0';
const DEFAULT_TTSC_PACKAGE_VERSION = '^0.23.0';
const DEFAULT_TTSC_LINT_PACKAGE_VERSION = '0.23.0';
const DEFAULT_TTSC_UNPLUGIN_PACKAGE_VERSION = '^0.23.0';
/**
 * Explicit fallback ranges for managed WordPress-facing workspace dependencies.
 *
 * These remain centralized here even when individual scaffold flows resolve a
 * fresher local or installed manifest version first, so add-command defaults do
 * not drift across runtime modules.
 */
export const DEFAULT_WORDPRESS_ABILITIES_VERSION = '^0.10.0';
export const DEFAULT_WORDPRESS_BLOCKS_TYPES_VERSION = '^12.5.18';
export const DEFAULT_WORDPRESS_BLOCKS_VERSION = '~15.19.0';
export const DEFAULT_WORDPRESS_CORE_ABILITIES_VERSION = '^0.9.0';
export const DEFAULT_WORDPRESS_CORE_DATA_VERSION = '~7.46.0';
export const DEFAULT_WORDPRESS_DATA_VERSION = '~10.46.0';
export const DEFAULT_WORDPRESS_DATAVIEWS_VERSION = '~14.3.0';
export const DEFAULT_WORDPRESS_ENV_VERSION = '^11.2.0';
export const DEFAULT_WP_TYPIA_DATAVIEWS_VERSION = '^0.1.2';

let cachedPackageVersions: {
  cacheKey: string;
  versions: PackageVersions;
} | null = null;

function normalizeVersionRange(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DEFAULT_VERSION_RANGE;
  }
  if (trimmed.startsWith('workspace:')) {
    return DEFAULT_VERSION_RANGE;
  }

  return /^[~^<>=]/.test(trimmed) ? trimmed : `^${trimmed}`;
}

function normalizeExactVersion(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DEFAULT_EXACT_VERSION;
  }
  if (trimmed.startsWith('workspace:')) {
    return DEFAULT_EXACT_VERSION;
  }
  return trimmed.replace(/^[~^<>=]+/, '');
}

function normalizeExactVersionWithFallback(
  value: string | undefined,
  fallback: string,
): string {
  const normalized = normalizeExactVersion(value);
  return normalized === DEFAULT_EXACT_VERSION ? fallback : normalized;
}

function normalizeVersionRangeWithFallback(
  value: string | undefined,
  fallback: string,
): string {
  const normalized = normalizeVersionRange(value);
  return normalized === DEFAULT_VERSION_RANGE ? fallback : normalized;
}

function createContentFingerprint(source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

function readPackageManifestFile(packageJsonPath: string): {
  source: string;
  stats: fs.Stats;
} {
  const fileDescriptor = fs.openSync(packageJsonPath, 'r');
  try {
    // Keep cache metadata and manifest contents tied to one opened file, so a
    // concurrent path replacement cannot mix stats from one manifest with
    // contents from another. The content fingerprint remains the final guard.
    const stats = fs.fstatSync(fileDescriptor);
    const source = fs.readFileSync(fileDescriptor, 'utf8');
    return { source, stats };
  } finally {
    fs.closeSync(fileDescriptor);
  }
}

function resolvePackageManifestLocation(
  packageJsonPath: string,
): PackageManifestLocation {
  try {
    const { source, stats } = readPackageManifestFile(packageJsonPath);
    return {
      cacheKey: `file:${packageJsonPath}:${stats.ino}:${stats.mtimeMs}:${stats.ctimeMs}:${stats.size}:${createContentFingerprint(source)}`,
      packageJsonPath,
      source,
    };
  } catch (error) {
    if (getOptionalNodeErrorCode(error) === 'ENOENT') {
      return {
        cacheKey: `missing-file:${packageJsonPath}`,
        packageJsonPath: null,
        source: null,
      };
    }
    throw error;
  }
}

function readPackageManifest(
  location: PackageManifestLocation,
): PackageManifest | null {
  if (!location.packageJsonPath || location.source === null) {
    return null;
  }

  return safeJsonParse<PackageManifest>(location.source, {
    context: 'package version manifest',
    filePath: location.packageJsonPath,
  });
}

function tryReadPackageManifest(
  location: PackageManifestLocation | null,
): PackageManifest | null {
  if (!location) {
    return null;
  }

  try {
    return readPackageManifest(location);
  } catch {
    return null;
  }
}

function resolveInstalledPackageManifestLocation(
  packageName: string,
): PackageManifestLocation {
  try {
    return resolvePackageManifestLocation(
      require.resolve(`${packageName}/package.json`),
    );
  } catch (error) {
    if (getOptionalNodeErrorCode(error) === 'MODULE_NOT_FOUND') {
      return {
        cacheKey: `missing-module:${packageName}`,
        packageJsonPath: null,
        source: null,
      };
    }
    throw error;
  }
}

function composePackageVersionsCacheKey(
  locations: readonly PackageManifestLocation[],
): string {
  return locations.map((location) => location.cacheKey).join('|');
}

/**
 * Resolve a managed package version range from linked workspace packages first,
 * then installed package manifests, while preserving the shared normalization
 * and manifest fingerprinting rules used by `getPackageVersions()`.
 *
 * @param packageName npm package whose manifest version should be consulted.
 * @param fallback Canonical range to use when no usable manifest version exists.
 * @param workspacePackageDirName Optional sibling monorepo package directory name.
 * @returns A normalized semver range suitable for generated dependency entries.
 */
export function resolveManagedPackageVersionRange(options: {
  fallback: string;
  packageName: string;
  workspacePackageDirName?: string;
}): string {
  const workspaceManifestLocation = options.workspacePackageDirName
    ? resolvePackageManifestLocation(
        path.join(
          PROJECT_TOOLS_PACKAGE_ROOT,
          '..',
          options.workspacePackageDirName,
          'package.json',
        ),
      )
    : null;
  const installedManifestLocation = resolveInstalledPackageManifestLocation(
    options.packageName,
  );
  const workspaceManifest = tryReadPackageManifest(workspaceManifestLocation);
  const installedManifest = tryReadPackageManifest(installedManifestLocation);

  return normalizeVersionRangeWithFallback(
    workspaceManifest?.version ?? installedManifest?.version,
    options.fallback,
  );
}

/**
 * Clears the in-memory cache used by `getPackageVersions()`.
 *
 * Long-lived processes can call this after regenerating or updating package
 * manifests when they want the next lookup to recompute version metadata
 * synchronously from disk.
 */
export function clearPackageVersionsCache(): void {
  cachedPackageVersions = null;
}

/**
 * Backwards-compatible alias for integrations that adopted the original
 * internal invalidation name before the public cache policy was documented.
 */
export function invalidatePackageVersionsCache(): void {
  clearPackageVersionsCache();
}

/**
 * Resolve package versions used in generated manifests and onboarding text.
 *
 * The lookup keeps a process-local cached result while recomputing manifest
 * fingerprints on each call. When the relevant package metadata changes on
 * disk, the cache key changes and the returned version object is refreshed.
 */
export function getPackageVersions(): PackageVersions {
  const createManifestLocation = resolvePackageManifestLocation(
    path.join(PROJECT_TOOLS_PACKAGE_ROOT, 'package.json'),
  );
  const monorepoManifestLocation = resolvePackageManifestLocation(
    path.join(PROJECT_TOOLS_PACKAGE_ROOT, '..', '..', 'package.json'),
  );
  const blockRuntimeManifestLocation = resolvePackageManifestLocation(
    path.join(
      PROJECT_TOOLS_PACKAGE_ROOT,
      '..',
      'wp-typia-block-runtime',
      'package.json',
    ),
  );
  const blockTypesManifestLocation = resolvePackageManifestLocation(
    path.join(
      PROJECT_TOOLS_PACKAGE_ROOT,
      '..',
      'wp-typia-block-types',
      'package.json',
    ),
  );
  const wpTypiaManifestLocation = resolvePackageManifestLocation(
    path.join(PROJECT_TOOLS_PACKAGE_ROOT, '..', 'wp-typia', 'package.json'),
  );
  const installedProjectToolsManifestLocation =
    resolveInstalledPackageManifestLocation('@wp-typia/project-tools');
  const installedApiClientManifestLocation =
    resolveInstalledPackageManifestLocation('@wp-typia/api-client');
  const installedBlockRuntimeManifestLocation =
    resolveInstalledPackageManifestLocation('@wp-typia/block-runtime');
  const installedBlockTypesManifestLocation =
    resolveInstalledPackageManifestLocation('@wp-typia/block-types');
  const installedRestManifestLocation =
    resolveInstalledPackageManifestLocation('@wp-typia/rest');
  const installedTtscManifestLocation =
    resolveInstalledPackageManifestLocation('ttsc');
  const installedTtscLintManifestLocation =
    resolveInstalledPackageManifestLocation('@ttsc/lint');
  const installedTtscUnpluginManifestLocation =
    resolveInstalledPackageManifestLocation('@ttsc/unplugin');
  const installedTypiaManifestLocation =
    resolveInstalledPackageManifestLocation('typia');
  const installedTypescriptManifestLocation =
    resolveInstalledPackageManifestLocation('typescript');
  const installedWpTypiaManifestLocation =
    resolveInstalledPackageManifestLocation('wp-typia');
  const cacheKey = composePackageVersionsCacheKey([
    createManifestLocation,
    monorepoManifestLocation,
    blockRuntimeManifestLocation,
    blockTypesManifestLocation,
    wpTypiaManifestLocation,
    installedProjectToolsManifestLocation,
    installedApiClientManifestLocation,
    installedBlockRuntimeManifestLocation,
    installedBlockTypesManifestLocation,
    installedRestManifestLocation,
    installedTtscManifestLocation,
    installedTtscLintManifestLocation,
    installedTtscUnpluginManifestLocation,
    installedTypiaManifestLocation,
    installedTypescriptManifestLocation,
    installedWpTypiaManifestLocation,
  ]);

  if (cachedPackageVersions?.cacheKey === cacheKey) {
    return cachedPackageVersions.versions;
  }

  const createManifest =
    readPackageManifest(createManifestLocation) ??
    readPackageManifest(installedProjectToolsManifestLocation) ??
    {};
  const monorepoManifest = readPackageManifest(monorepoManifestLocation) ?? {};
  const blockRuntimeManifest =
    readPackageManifest(blockRuntimeManifestLocation) ??
    readPackageManifest(installedBlockRuntimeManifestLocation) ??
    {};
  const blockTypesManifest =
    readPackageManifest(blockTypesManifestLocation) ??
    readPackageManifest(installedBlockTypesManifestLocation) ??
    {};
  const wpTypiaManifest =
    readPackageManifest(wpTypiaManifestLocation) ??
    readPackageManifest(installedWpTypiaManifestLocation) ??
    {};
  const blockRuntimeDependencyVersion = normalizeVersionRange(
    createManifest.dependencies?.['@wp-typia/block-runtime'],
  );
  const blockTypesDependencyVersion = normalizeVersionRange(
    createManifest.dependencies?.['@wp-typia/block-types'],
  );
  const ttscPackageVersion = normalizeVersionRangeWithFallback(
    monorepoManifest.dependencies?.ttsc ??
      monorepoManifest.devDependencies?.ttsc ??
      readPackageManifest(installedTtscManifestLocation)?.version,
    DEFAULT_TTSC_PACKAGE_VERSION,
  );
  const ttscUnpluginPackageVersion = normalizeVersionRangeWithFallback(
    monorepoManifest.dependencies?.['@ttsc/unplugin'] ??
      monorepoManifest.devDependencies?.['@ttsc/unplugin'] ??
      readPackageManifest(installedTtscUnpluginManifestLocation)?.version,
    DEFAULT_TTSC_UNPLUGIN_PACKAGE_VERSION,
  );
  const versions = {
    apiClientPackageVersion: normalizeVersionRange(
      createManifest.dependencies?.['@wp-typia/api-client'] ??
        readPackageManifest(installedApiClientManifestLocation)?.version,
    ),
    blockRuntimePackageVersion:
      blockRuntimeDependencyVersion !== DEFAULT_VERSION_RANGE
        ? blockRuntimeDependencyVersion
        : normalizeVersionRange(blockRuntimeManifest.version),
    blockTypesPackageVersion:
      blockTypesDependencyVersion !== DEFAULT_VERSION_RANGE
        ? blockTypesDependencyVersion
        : normalizeVersionRange(blockTypesManifest.version),
    projectToolsPackageVersion: normalizeVersionRange(createManifest.version),
    restPackageVersion: normalizeVersionRange(
      createManifest.dependencies?.['@wp-typia/rest'] ??
        readPackageManifest(installedRestManifestLocation)?.version,
    ),
    ttscLintPackageVersion: normalizeExactVersionWithFallback(
      monorepoManifest.dependencies?.['@ttsc/lint'] ??
        monorepoManifest.devDependencies?.['@ttsc/lint'] ??
        readPackageManifest(installedTtscLintManifestLocation)?.version,
      DEFAULT_TTSC_LINT_PACKAGE_VERSION,
    ),
    ttscPackageVersion,
    ttscUnpluginPackageVersion,
    tsxPackageVersion: ttscPackageVersion,
    typiaPackageVersion: normalizeVersionRangeWithFallback(
      monorepoManifest.dependencies?.typia ??
        monorepoManifest.devDependencies?.typia ??
        createManifest.dependencies?.typia ??
        readPackageManifest(installedTypiaManifestLocation)?.version,
      DEFAULT_VERSION_RANGE,
    ),
    typiaUnpluginPackageVersion: ttscUnpluginPackageVersion,
    typescriptPackageVersion: normalizeVersionRangeWithFallback(
      monorepoManifest.dependencies?.typescript ??
        monorepoManifest.devDependencies?.typescript ??
        createManifest.dependencies?.typescript ??
        readPackageManifest(installedTypescriptManifestLocation)?.version,
      DEFAULT_VERSION_RANGE,
    ),
    wpTypiaPackageExactVersion: normalizeExactVersion(wpTypiaManifest.version),
    wpTypiaPackageVersion: normalizeVersionRange(wpTypiaManifest.version),
  };

  cachedPackageVersions = {
    cacheKey,
    versions,
  };

  return versions;
}
