import os from 'node:os'
import path from 'node:path'

/**
 * Environment variable that disables external template cache reads and writes.
 *
 * Set to `0`, `false`, `no`, or `off` to bypass the cache.
 */
export const EXTERNAL_TEMPLATE_CACHE_ENV = 'WP_TYPIA_EXTERNAL_TEMPLATE_CACHE'

/**
 * Environment variable that overrides the external template cache root.
 */
export const EXTERNAL_TEMPLATE_CACHE_DIR_ENV =
  'WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR'

/**
 * Environment variable that enables TTL-based external template cache pruning.
 *
 * Unset, empty, zero, negative, and non-numeric values keep pruning disabled.
 */
export const EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV =
  'WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_TTL_DAYS'

/**
 * Environment variable that overrides how often TTL pruning may scan the cache.
 *
 * Unset values use the default interval. Zero, negative, and non-numeric values
 * disable scan throttling.
 */
export const EXTERNAL_TEMPLATE_CACHE_PRUNE_INTERVAL_MS_ENV =
  'WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_PRUNE_INTERVAL_MS'

/**
 * Milliseconds in one TTL day.
 */
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Default minimum interval between full external template cache prune scans.
 */
const DEFAULT_CACHE_PRUNE_INTERVAL_MS = 60 * 60 * 1000

/**
 * Normalized environment values that disable the cache.
 */
const DISABLED_CACHE_VALUES = new Set(['0', 'false', 'no', 'off'])

/**
 * Checks whether remote external template source caching is enabled.
 *
 * Caching is enabled by default. Set `WP_TYPIA_EXTERNAL_TEMPLATE_CACHE` to
 * `0`, `false`, `no`, or `off` to force uncached resolution.
 *
 * @param env Environment object to inspect, defaulting to `process.env`.
 * @returns Whether external template source cache reads and writes are enabled.
 */
export function isExternalTemplateCacheEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const rawValue = env[EXTERNAL_TEMPLATE_CACHE_ENV]
  if (rawValue === undefined) {
    return true
  }

  return !DISABLED_CACHE_VALUES.has(rawValue.trim().toLowerCase())
}

/**
 * Resolves the external template source cache root directory.
 *
 * `WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR` overrides the location. Without an
 * override, wp-typia uses a per-user `wp-typia-template-source-cache-*`
 * directory inside the operating system temp directory.
 *
 * @param env Environment object to inspect, defaulting to `process.env`.
 * @returns Absolute cache root directory path.
 */
export function getExternalTemplateCacheRoot(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configuredCacheDir = env[EXTERNAL_TEMPLATE_CACHE_DIR_ENV]?.trim()
  if (configuredCacheDir) {
    return path.resolve(configuredCacheDir)
  }

  return path.join(
    os.tmpdir(),
    `wp-typia-template-source-cache-${getCurrentUserCacheSegment()}`,
  )
}

function parseExternalTemplateCacheTtlDays(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null
  }

  const ttlDays = typeof value === 'number' ? value : Number(value.trim())
  if (!Number.isFinite(ttlDays) || ttlDays <= 0) {
    return null
  }

  return ttlDays
}

export function resolveExternalTemplateCacheTtlMs(
  options: {
    env?: NodeJS.ProcessEnv
    ttlDays?: number
  } = {},
): number | null {
  const env = options.env ?? process.env
  const ttlDays =
    options.ttlDays === undefined
      ? parseExternalTemplateCacheTtlDays(
          env[EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV],
        )
      : parseExternalTemplateCacheTtlDays(options.ttlDays)
  if (ttlDays === null) {
    return null
  }

  const ttlMs = ttlDays * MILLISECONDS_PER_DAY
  return Number.isFinite(ttlMs) ? ttlMs : null
}

function parseExternalTemplateCachePruneIntervalMs(
  value: unknown,
): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null
  }

  const intervalMs =
    typeof value === 'number' ? value : Number(value.trim())
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return null
  }

  return intervalMs
}

export function resolveExternalTemplateCachePruneIntervalMs(
  options: {
    env?: NodeJS.ProcessEnv
    pruneIntervalMs?: number
  } = {},
): number | null {
  if (options.pruneIntervalMs !== undefined) {
    return parseExternalTemplateCachePruneIntervalMs(options.pruneIntervalMs)
  }

  const env = options.env ?? process.env
  const envValue = env[EXTERNAL_TEMPLATE_CACHE_PRUNE_INTERVAL_MS_ENV]
  if (envValue === undefined) {
    return DEFAULT_CACHE_PRUNE_INTERVAL_MS
  }

  return parseExternalTemplateCachePruneIntervalMs(envValue)
}

export function getExternalTemplateCacheNowMs(
  now: Date | number | undefined,
): number {
  const nowMs =
    now instanceof Date
      ? now.getTime()
      : typeof now === 'number'
        ? now
        : Date.now()

  return Number.isFinite(nowMs) ? nowMs : Date.now()
}

function getCurrentUserCacheSegment(): string {
  if (typeof process.getuid === 'function') {
    return String(process.getuid())
  }

  try {
    const safeUsername = os
      .userInfo()
      .username.trim()
      .replace(/[^A-Za-z0-9._-]+/gu, '-')
    return safeUsername.length > 0 ? safeUsername : 'user'
  } catch {
    return 'user'
  }
}
