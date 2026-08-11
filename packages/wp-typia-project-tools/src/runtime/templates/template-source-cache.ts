import { createHash, randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { getNodeErrorCode, pathExists } from '../shared/fs-async.js';
import {
  CACHE_MARKER_FILE,
  CACHE_PRUNE_MARKER_FILE,
  externalTemplateCacheMetadataMatches,
  formatExternalTemplateCacheEntryMarker,
  formatExternalTemplateCachePruneMarker,
  isExternalTemplateCacheEntryFreshForTtl,
  parseExternalTemplateCacheEntryMarker,
  parseExternalTemplateCachePruneMarker,
  type ExternalTemplateCacheMetadata,
} from './template-source-cache-markers.js';
import {
  getExternalTemplateCacheNowMs,
  getExternalTemplateCacheRoot,
  isExternalTemplateCacheEnabled,
  resolveExternalTemplateCachePruneIntervalMs,
  resolveExternalTemplateCacheTtlMs,
} from './template-source-cache-policy.js';
export {
  EXTERNAL_TEMPLATE_CACHE_DIR_ENV,
  EXTERNAL_TEMPLATE_CACHE_ENV,
  EXTERNAL_TEMPLATE_CACHE_PRUNE_INTERVAL_MS_ENV,
  EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV,
  getExternalTemplateCacheRoot,
  isExternalTemplateCacheEnabled,
} from './template-source-cache-policy.js';

/**
 * Private directory mode used for cache roots and entries on POSIX platforms.
 */
const PRIVATE_CACHE_DIRECTORY_MODE = 0o700;

/**
 * Filesystem errors that mean another writer published the same cache entry.
 */
const CACHE_PUBLISH_RACE_ERROR_CODES = new Set(['EEXIST', 'ENOTEMPTY']);

/**
 * Filesystem errors that make the optional cache unavailable.
 */
const CACHE_UNAVAILABLE_ERROR_CODES = new Set([
  'EACCES',
  'ENOSPC',
  'ENOTDIR',
  'EPERM',
  'EROFS',
]);

/**
 * Cache namespaces must stay within one path segment under the cache root.
 */
const SAFE_CACHE_NAMESPACE_SEGMENT = /^[A-Za-z0-9_.-]+$/u;

/**
 * Cache entries are deterministic SHA-256 digest directory names.
 */
const SAFE_CACHE_ENTRY_SEGMENT = /^[a-f0-9]{64}$/u;

function createTemporaryCacheEntryDirName(cacheKey: string): string {
  // Crypto randomness keeps concurrent cache populators from colliding on the
  // staging directory before the final atomic rename publishes the cache entry.
  return `.tmp-${cacheKey}-${process.pid}-${Date.now()}-${randomUUID()}`;
}

/**
 * Describes a deterministic external template cache entry.
 *
 * `namespace` scopes independent cache families, `keyParts` identify the exact
 * source/integrity tuple, and `metadata` is persisted to the marker file.
 */
export interface ExternalTemplateCacheDescriptor {
  /**
   * Ordered values that deterministically identify one cached template source.
   */
  keyParts: readonly string[];

  /**
   * Diagnostic values persisted to the cache marker after sanitization.
   */
  metadata: ExternalTemplateCacheMetadata;

  /**
   * Cache family scope, stored as a single safe directory segment.
   */
  namespace: string;
}

/**
 * Result returned when a cache entry is reused or populated.
 */
export interface ExternalTemplateCacheResolution {
  /**
   * Whether the returned source directory came from an existing cache entry.
   */
  cacheHit: boolean;

  /**
   * Populated or reused template source directory.
   */
  sourceDir: string;
}

/**
 * Metadata-only lookup descriptor for finding an existing reusable cache entry.
 */
export interface ExternalTemplateCacheLookupDescriptor {
  /**
   * Metadata fields that must match the sanitized marker metadata.
   */
  metadata: ExternalTemplateCacheMetadata;

  /**
   * Cache family scope, stored as a single safe directory segment.
   */
  namespace: string;
}

/**
 * Options for best-effort external template cache pruning.
 */
export interface ExternalTemplateCachePruneOptions {
  /**
   * Environment object to inspect, defaulting to `process.env`.
   */
  env?: NodeJS.ProcessEnv;

  /**
   * Force a full prune scan even when the last-pruned marker is still fresh.
   */
  force?: boolean;

  /**
   * Clock override for deterministic tests.
   */
  now?: Date | number;

  /**
   * Minimum interval between full prune scans. Omit for the environment/default.
   */
  pruneIntervalMs?: number;

  /**
   * TTL override in days. When omitted, the TTL environment variable is used.
   */
  ttlDays?: number;
}

/**
 * Summary returned after external template cache pruning.
 */
export interface ExternalTemplateCachePruneResult {
  /**
   * Absolute cache root inspected by the pruning helper.
   */
  cacheRoot: string;

  /**
   * Entries removed because their marker timestamp exceeded the TTL.
   */
  prunedEntries: number;

  /**
   * Candidate cache entry directories inspected.
   */
  scannedEntries: number;

  /**
   * Candidate directories skipped because they were malformed or unsafe.
   */
  skippedEntries: number;

  /**
   * Whether a recent last-pruned marker skipped the full cache directory scan.
   */
  skippedByThrottle: boolean;

  /**
   * Resolved TTL in milliseconds, or `null` when pruning was disabled.
   */
  ttlMs: number | null;
}

/**
 * Creates a deterministic cache key from source identity and integrity parts.
 *
 * @param keyParts Ordered values that identify one cached template source.
 * @returns SHA-256 hex digest of the JSON-serialized key parts.
 */
export function createExternalTemplateCacheKey(
  keyParts: readonly string[],
): string {
  return createHash('sha256')
    .update(JSON.stringify(keyParts))
    .digest('hex');
}

async function isDirectoryPath(directory: string): Promise<boolean> {
  try {
    const stats = await fsp.lstat(directory);
    return stats.isDirectory() && !stats.isSymbolicLink();
  } catch {
    return false;
  }
}

async function removeTemporaryCacheEntry(entryDir: string): Promise<void> {
  try {
    await fsp.rm(entryDir, { force: true, recursive: true });
  } catch {
    // Cache cleanup is best-effort; the caller can still continue uncached.
  }
}

function getCurrentUid(): number | null {
  return typeof process.getuid === 'function' ? process.getuid() : null;
}

async function isPrivateCacheDirectory(directory: string): Promise<boolean> {
  try {
    const stats = await fsp.lstat(directory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      return false;
    }

    const currentUid = getCurrentUid();
    if (currentUid !== null && stats.uid !== currentUid) {
      return false;
    }

    if (process.platform !== 'win32' && (stats.mode & 0o077) !== 0) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function ensurePrivateCacheDirectory(directory: string): Promise<boolean> {
  try {
    await fsp.mkdir(directory, {
      mode: PRIVATE_CACHE_DIRECTORY_MODE,
      recursive: true,
    });
    const stats = await fsp.lstat(directory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      return false;
    }

    const currentUid = getCurrentUid();
    if (currentUid !== null && stats.uid !== currentUid) {
      return false;
    }

    if (process.platform !== 'win32') {
      if ((stats.mode & 0o077) !== 0) {
        await fsp.chmod(directory, PRIVATE_CACHE_DIRECTORY_MODE);
      }
    }
    return isPrivateCacheDirectory(directory);
  } catch {
    return false;
  }
}

function resolveCacheNamespaceDir(
  cacheRoot: string,
  namespace: string,
): string | null {
  if (
    namespace === '.' ||
    namespace === '..' ||
    !SAFE_CACHE_NAMESPACE_SEGMENT.test(namespace)
  ) {
    return null;
  }

  const namespaceDir = path.join(cacheRoot, namespace);
  const relativeNamespaceDir = path.relative(cacheRoot, namespaceDir);
  if (
    relativeNamespaceDir.length === 0 ||
    relativeNamespaceDir.startsWith('..') ||
    path.isAbsolute(relativeNamespaceDir)
  ) {
    return null;
  }

  return namespaceDir;
}

function getCacheEntryPaths(
  descriptor: ExternalTemplateCacheDescriptor,
): {
  cacheKey: string;
  cacheRoot: string;
  entryDir: string;
  markerPath: string;
  namespaceDir: string;
  sourceDir: string;
} | null {
  const cacheKey = createExternalTemplateCacheKey(descriptor.keyParts);
  const cacheRoot = getExternalTemplateCacheRoot();
  const namespaceDir = resolveCacheNamespaceDir(
    cacheRoot,
    descriptor.namespace,
  );
  if (!namespaceDir) {
    return null;
  }

  const entryDir = path.join(namespaceDir, cacheKey);

  return {
    cacheKey,
    cacheRoot,
    entryDir,
    markerPath: path.join(entryDir, CACHE_MARKER_FILE),
    namespaceDir,
    sourceDir: path.join(entryDir, 'source'),
  };
}

async function isReusableCacheEntry(
  entryDir: string,
  markerPath: string,
  sourceDir: string,
): Promise<boolean> {
  return (
    (await isPrivateCacheDirectory(entryDir)) &&
    (await pathExists(markerPath)) &&
    (await isDirectoryPath(sourceDir))
  );
}

async function readCacheEntryMarker(
  markerPath: string,
): Promise<{
  createdAtMs: number;
  metadata: ExternalTemplateCacheMetadata;
} | null> {
  try {
    return parseExternalTemplateCacheEntryMarker(
      await fsp.readFile(markerPath, 'utf8'),
    );
  } catch {
    return null;
  }
}

async function getReusableCacheEntryMarker(
  entryDir: string,
  markerPath: string,
  sourceDir: string,
): Promise<{
  createdAtMs: number;
  metadata: ExternalTemplateCacheMetadata;
} | null> {
  if (!(await isReusableCacheEntry(entryDir, markerPath, sourceDir))) {
    return null;
  }

  return readCacheEntryMarker(markerPath);
}

async function isReusableFreshCacheEntry(
  entryDir: string,
  markerPath: string,
  sourceDir: string,
  nowMs: number,
  ttlMs: number | null,
): Promise<boolean> {
  const marker = await getReusableCacheEntryMarker(
    entryDir,
    markerPath,
    sourceDir,
  );
  return (
    marker !== null &&
    isExternalTemplateCacheEntryFreshForTtl(marker.createdAtMs, nowMs, ttlMs)
  );
}

function isPathInsideDirectory(
  directory: string,
  candidatePath: string,
): boolean {
  const relativePath = path.relative(directory, candidatePath);
  return (
    relativePath.length > 0 &&
    !relativePath.startsWith('..') &&
    !path.isAbsolute(relativePath)
  );
}

async function removeCacheEntryWithinRoot(
  cacheRoot: string,
  entryDir: string,
): Promise<boolean> {
  if (!isPathInsideDirectory(cacheRoot, entryDir)) {
    return false;
  }

  try {
    await fsp.rm(entryDir, { force: true, recursive: true });
    return true;
  } catch {
    return false;
  }
}

function getCachePruneMarkerPath(cacheRoot: string): string {
  return path.join(cacheRoot, CACHE_PRUNE_MARKER_FILE);
}

async function shouldSkipExternalTemplateCachePrune({
  cacheRoot,
  force,
  nowMs,
  pruneIntervalMs,
  ttlMs,
}: {
  cacheRoot: string;
  force: boolean | undefined;
  nowMs: number;
  pruneIntervalMs: number | null;
  ttlMs: number;
}): Promise<boolean> {
  if (force || pruneIntervalMs === null) {
    return false;
  }

  let markerText: string;
  try {
    markerText = await fsp.readFile(getCachePruneMarkerPath(cacheRoot), 'utf8');
  } catch {
    return false;
  }

  const marker = parseExternalTemplateCachePruneMarker(markerText);
  if (
    !marker ||
    marker.ttlMs !== ttlMs ||
    marker.pruneIntervalMs !== pruneIntervalMs
  ) {
    return false;
  }

  const elapsedMs = nowMs - marker.prunedAtMs;
  return elapsedMs >= 0 && elapsedMs < pruneIntervalMs;
}

async function writeExternalTemplateCachePruneMarker({
  cacheRoot,
  nowMs,
  pruneIntervalMs,
  ttlMs,
}: {
  cacheRoot: string;
  nowMs: number;
  pruneIntervalMs: number | null;
  ttlMs: number;
}): Promise<void> {
  try {
    await fsp.writeFile(
      getCachePruneMarkerPath(cacheRoot),
      formatExternalTemplateCachePruneMarker({
        nowMs,
        pruneIntervalMs,
        ttlMs,
      }),
      'utf8',
    );
  } catch {
    // Prune markers are an optimization; failing to write one keeps TTL safe.
  }
}

/**
 * Removes stale external template cache entries when a positive TTL is configured.
 *
 * The helper is best-effort: malformed cache directories are skipped, cache
 * roots must remain private and non-symlinked, and deletes are constrained to
 * deterministic entry directories under the configured cache root.
 *
 * @param options Optional TTL, clock, and environment overrides.
 * @returns Pruning summary with counts for inspected, skipped, and removed entries.
 */
export async function pruneExternalTemplateCache(
  options: ExternalTemplateCachePruneOptions = {},
): Promise<ExternalTemplateCachePruneResult> {
  const env = options.env ?? process.env;
  const cacheRoot = getExternalTemplateCacheRoot(env);
  const ttlMs = resolveExternalTemplateCacheTtlMs({
    env,
    ttlDays: options.ttlDays,
  });
  const pruneIntervalMs = resolveExternalTemplateCachePruneIntervalMs({
    env,
    pruneIntervalMs: options.pruneIntervalMs,
  });
  const result: ExternalTemplateCachePruneResult = {
    cacheRoot,
    prunedEntries: 0,
    scannedEntries: 0,
    skippedEntries: 0,
    skippedByThrottle: false,
    ttlMs,
  };

  if (ttlMs === null || !(await isPrivateCacheDirectory(cacheRoot))) {
    return result;
  }

  const nowMs = getExternalTemplateCacheNowMs(options.now);
  if (
    await shouldSkipExternalTemplateCachePrune({
      cacheRoot,
      force: options.force,
      nowMs,
      pruneIntervalMs,
      ttlMs,
    })
  ) {
    result.skippedByThrottle = true;
    return result;
  }

  let namespaceEntries: Dirent[];
  try {
    namespaceEntries = await fsp.readdir(cacheRoot, { withFileTypes: true });
  } catch {
    return result;
  }

  const expiresBeforeMs = nowMs - ttlMs;
  for (const namespaceEntry of namespaceEntries) {
    if (!namespaceEntry.isDirectory()) {
      continue;
    }

    const namespaceDir = resolveCacheNamespaceDir(
      cacheRoot,
      namespaceEntry.name,
    );
    if (!namespaceDir || !(await isPrivateCacheDirectory(namespaceDir))) {
      result.skippedEntries += 1;
      continue;
    }

    let cacheEntries: Dirent[];
    try {
      cacheEntries = await fsp.readdir(namespaceDir, { withFileTypes: true });
    } catch {
      result.skippedEntries += 1;
      continue;
    }

    for (const cacheEntry of cacheEntries) {
      if (!cacheEntry.isDirectory()) {
        continue;
      }
      if (!SAFE_CACHE_ENTRY_SEGMENT.test(cacheEntry.name)) {
        result.skippedEntries += 1;
        continue;
      }

      const entryDir = path.join(namespaceDir, cacheEntry.name);
      result.scannedEntries += 1;
      if (!isPathInsideDirectory(cacheRoot, entryDir)) {
        result.skippedEntries += 1;
        continue;
      }

      const markerPath = path.join(entryDir, CACHE_MARKER_FILE);
      const sourceDir = path.join(entryDir, 'source');
      const marker = await getReusableCacheEntryMarker(
        entryDir,
        markerPath,
        sourceDir,
      );
      if (!marker) {
        result.skippedEntries += 1;
        continue;
      }

      if (marker.createdAtMs < expiresBeforeMs) {
        if (await removeCacheEntryWithinRoot(cacheRoot, entryDir)) {
          result.prunedEntries += 1;
        } else {
          result.skippedEntries += 1;
        }
      }
    }
  }

  await writeExternalTemplateCachePruneMarker({
    cacheRoot,
    nowMs,
    pruneIntervalMs,
    ttlMs,
  });

  return result;
}

/**
 * Finds a reusable cache entry whose marker metadata includes the expected fields.
 *
 * This lookup is intended for resilient fallbacks where a caller cannot compute
 * the exact deterministic key but can safely reuse a previously validated local
 * cache entry for the same source identity.
 *
 * @param descriptor Cache namespace and marker metadata fields to match.
 * @returns Existing cache resolution details, or `null` when no safe entry exists.
 */
export async function findReusableExternalTemplateSourceCache(
  descriptor: ExternalTemplateCacheLookupDescriptor,
): Promise<ExternalTemplateCacheResolution | null> {
  if (!isExternalTemplateCacheEnabled()) {
    return null;
  }

  const cacheRoot = getExternalTemplateCacheRoot();
  const namespaceDir = resolveCacheNamespaceDir(
    cacheRoot,
    descriptor.namespace,
  );
  if (!namespaceDir) {
    return null;
  }
  if (
    !(await isPrivateCacheDirectory(cacheRoot)) ||
    !(await isPrivateCacheDirectory(namespaceDir))
  ) {
    return null;
  }
  const ttlMs = resolveExternalTemplateCacheTtlMs();
  const nowMs = getExternalTemplateCacheNowMs(undefined);
  await pruneExternalTemplateCache();

  let entries: Dirent[];
  try {
    entries = await fsp.readdir(namespaceDir, { withFileTypes: true });
  } catch {
    return null;
  }

  let bestEntry: { createdAtMs: number; sourceDir: string } | null = null;
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryDir = path.join(namespaceDir, entry.name);
    const markerPath = path.join(entryDir, CACHE_MARKER_FILE);
    const sourceDir = path.join(entryDir, 'source');
    const marker = await getReusableCacheEntryMarker(
      entryDir,
      markerPath,
      sourceDir,
    );
    if (
      !marker ||
      !isExternalTemplateCacheEntryFreshForTtl(
        marker.createdAtMs,
        nowMs,
        ttlMs,
      ) ||
      !externalTemplateCacheMetadataMatches(
        marker.metadata,
        descriptor.metadata,
      )
    ) {
      continue;
    }
    if (!bestEntry || marker.createdAtMs > bestEntry.createdAtMs) {
      bestEntry = {
        createdAtMs: marker.createdAtMs,
        sourceDir,
      };
    }
  }

  return bestEntry
    ? {
        cacheHit: true,
        sourceDir: bestEntry.sourceDir,
      }
    : null;
}

/**
 * Resolves or populates a cached external template source directory.
 *
 * Returns `null` when caching is disabled. Cache misses populate a temporary
 * directory first and then atomically move it into place; concurrent writers
 * that lose the race reuse the completed marker/source pair.
 *
 * @param descriptor Namespace, key parts, and metadata for the cache entry.
 * @param populateSourceDir Callback that writes the guarded source on a miss.
 * @returns Cache resolution details, or `null` when caching is disabled.
 */
export async function resolveExternalTemplateSourceCache(
  descriptor: ExternalTemplateCacheDescriptor,
  populateSourceDir: (sourceDir: string) => Promise<void>,
): Promise<ExternalTemplateCacheResolution | null> {
  if (!isExternalTemplateCacheEnabled()) {
    return null;
  }

  const cacheEntryPaths = getCacheEntryPaths(descriptor);
  if (!cacheEntryPaths) {
    return null;
  }

  const { cacheKey, cacheRoot, entryDir, markerPath, namespaceDir, sourceDir } =
    cacheEntryPaths;
  if (
    !(await ensurePrivateCacheDirectory(cacheRoot)) ||
    !(await ensurePrivateCacheDirectory(namespaceDir))
  ) {
    return null;
  }
  const ttlMs = resolveExternalTemplateCacheTtlMs();
  const nowMs = getExternalTemplateCacheNowMs(undefined);
  await pruneExternalTemplateCache();

  const existingMarker = await getReusableCacheEntryMarker(
    entryDir,
    markerPath,
    sourceDir,
  );
  if (
    existingMarker &&
    isExternalTemplateCacheEntryFreshForTtl(
      existingMarker.createdAtMs,
      nowMs,
      ttlMs,
    )
  ) {
    return {
      cacheHit: true,
      sourceDir,
    };
  }
  if (existingMarker) {
    await removeCacheEntryWithinRoot(cacheRoot, entryDir);
  }

  const temporaryEntryDir = path.join(
    namespaceDir,
    createTemporaryCacheEntryDirName(cacheKey),
  );
  const temporarySourceDir = path.join(temporaryEntryDir, 'source');
  let populateFailed = false;

  try {
    await fsp.mkdir(temporarySourceDir, {
      mode: PRIVATE_CACHE_DIRECTORY_MODE,
      recursive: true,
    });
    if (process.platform !== 'win32') {
      await fsp.chmod(temporaryEntryDir, PRIVATE_CACHE_DIRECTORY_MODE);
    }
    try {
      await populateSourceDir(temporarySourceDir);
    } catch (error) {
      populateFailed = true;
      throw error;
    }
    await fsp.writeFile(
      path.join(temporaryEntryDir, CACHE_MARKER_FILE),
      formatExternalTemplateCacheEntryMarker({
        cacheKey,
        createdAt: new Date(),
        metadata: descriptor.metadata,
        namespace: descriptor.namespace,
      }),
      'utf8',
    );
    await fsp.rename(temporaryEntryDir, entryDir);

    return {
      cacheHit: false,
      sourceDir,
    };
  } catch (error) {
    await removeTemporaryCacheEntry(temporaryEntryDir);
    if (populateFailed) {
      if (CACHE_UNAVAILABLE_ERROR_CODES.has(getNodeErrorCode(error))) {
        return null;
      }
      throw error;
    }

    const errorCode = getNodeErrorCode(error);
    if (
      CACHE_PUBLISH_RACE_ERROR_CODES.has(errorCode) &&
      (await isReusableFreshCacheEntry(
        entryDir,
        markerPath,
        sourceDir,
        nowMs,
        ttlMs,
      ))
    ) {
      return {
        cacheHit: true,
        sourceDir,
      };
    }
    if (
      CACHE_PUBLISH_RACE_ERROR_CODES.has(errorCode) ||
      CACHE_UNAVAILABLE_ERROR_CODES.has(errorCode)
    ) {
      return null;
    }
    throw error;
  }
}
