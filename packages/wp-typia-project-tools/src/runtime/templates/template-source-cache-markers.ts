import { safeJsonParse } from '../shared/json-utils.js';

/**
 * Marker file written after a cache entry is fully populated.
 */
export const CACHE_MARKER_FILE = 'wp-typia-template-cache.json';

/**
 * Marker file written after a full TTL prune scan completes.
 */
export const CACHE_PRUNE_MARKER_FILE =
  'wp-typia-template-cache-prune.json';

/**
 * Marker value used when URL-like metadata cannot be safely normalized.
 */
const REDACTED_CACHE_METADATA_VALUE = '[redacted]';

/**
 * Metadata fields that may contain credentialed or signed URLs.
 */
const URL_LIKE_METADATA_KEY = /(url|uri|registry|tarball)/iu;

/**
 * Serializable metadata recorded in cache markers for diagnostics.
 */
export type ExternalTemplateCacheMetadata = Record<string, string | null>;

export interface ExternalTemplateCacheEntryMarker {
  createdAtMs: number
  metadata: ExternalTemplateCacheMetadata
}

export interface ExternalTemplateCachePruneMarker {
  prunedAtMs: number
  pruneIntervalMs: number | null
  ttlMs: number
}

function sanitizeExternalTemplateCacheMetadataValue(
  key: string,
  value: string,
): string {
  if (!URL_LIKE_METADATA_KEY.test(key)) {
    return value;
  }

  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return REDACTED_CACHE_METADATA_VALUE;
  }
}

export function sanitizeExternalTemplateCacheMetadata(
  metadata: ExternalTemplateCacheMetadata,
): ExternalTemplateCacheMetadata {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      value === null
        ? null
        : sanitizeExternalTemplateCacheMetadataValue(key, value),
    ]),
  );
}

export function parseExternalTemplateCacheEntryMarker(
  markerText: string,
): ExternalTemplateCacheEntryMarker | null {
  let marker: unknown;
  try {
    marker = safeJsonParse(markerText, {
      context: 'external template cache entry marker',
    });
  } catch {
    return null;
  }
  if (typeof marker !== 'object' || marker === null || Array.isArray(marker)) {
    return null;
  }

  const rawMetadata = (marker as { metadata?: unknown }).metadata;
  if (
    typeof rawMetadata !== 'object' ||
    rawMetadata === null ||
    Array.isArray(rawMetadata)
  ) {
    return null;
  }

  const metadata: ExternalTemplateCacheMetadata = {};
  for (const [key, value] of Object.entries(rawMetadata)) {
    if (typeof value !== 'string' && value !== null) {
      return null;
    }
    metadata[key] = value;
  }

  const rawCreatedAt = (marker as { createdAt?: unknown }).createdAt;
  const createdAtMs =
    typeof rawCreatedAt === 'string' ? Date.parse(rawCreatedAt) : 0;

  return {
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
    metadata,
  };
}

export function externalTemplateCacheMetadataMatches(
  actual: ExternalTemplateCacheMetadata,
  expected: ExternalTemplateCacheMetadata,
): boolean {
  return Object.entries(expected).every(
    ([key, value]) => actual[key] === value,
  );
}

export function isExternalTemplateCacheEntryFreshForTtl(
  createdAtMs: number,
  nowMs: number,
  ttlMs: number | null,
): boolean {
  return ttlMs === null || createdAtMs >= nowMs - ttlMs;
}

export function parseExternalTemplateCachePruneMarker(
  markerText: string,
): ExternalTemplateCachePruneMarker | null {
  let marker: unknown;
  try {
    marker = safeJsonParse(markerText, {
      context: 'external template cache prune marker',
    });
  } catch {
    return null;
  }
  if (typeof marker !== 'object' || marker === null || Array.isArray(marker)) {
    return null;
  }

  const rawPrunedAt = (marker as { prunedAt?: unknown }).prunedAt;
  const prunedAtMs =
    typeof rawPrunedAt === 'string' ? Date.parse(rawPrunedAt) : Number.NaN;
  const rawPruneIntervalMs = (marker as { pruneIntervalMs?: unknown })
    .pruneIntervalMs;
  const rawTtlMs = (marker as { ttlMs?: unknown }).ttlMs;
  if (typeof rawTtlMs !== 'number' || !Number.isFinite(rawTtlMs)) {
    return null;
  }
  if (!Number.isFinite(prunedAtMs)) {
    return null;
  }
  if (
    rawPruneIntervalMs !== null &&
    (typeof rawPruneIntervalMs !== 'number' ||
      !Number.isFinite(rawPruneIntervalMs))
  ) {
    return null;
  }

  return {
    prunedAtMs,
    pruneIntervalMs: rawPruneIntervalMs ?? null,
    ttlMs: rawTtlMs,
  };
}

export function formatExternalTemplateCacheEntryMarker({
  cacheKey,
  createdAt,
  metadata,
  namespace,
}: {
  cacheKey: string
  createdAt: Date
  metadata: ExternalTemplateCacheMetadata
  namespace: string
}): string {
  return `${JSON.stringify(
    {
      createdAt: createdAt.toISOString(),
      key: cacheKey,
      metadata: sanitizeExternalTemplateCacheMetadata(metadata),
      namespace,
    },
    null,
    2,
  )}\n`;
}

export function formatExternalTemplateCachePruneMarker({
  nowMs,
  pruneIntervalMs,
  ttlMs,
}: {
  nowMs: number
  pruneIntervalMs: number | null
  ttlMs: number
}): string {
  return `${JSON.stringify(
    {
      prunedAt: new Date(nowMs).toISOString(),
      pruneIntervalMs,
      ttlMs,
    },
    null,
    2,
  )}\n`;
}
