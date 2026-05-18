import { expect, test } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'
import {
  formatExternalTemplateCacheEntryMarker,
  formatExternalTemplateCachePruneMarker,
  parseExternalTemplateCacheEntryMarker,
  parseExternalTemplateCachePruneMarker,
} from '../src/runtime/template-source-cache-markers.js'

const templateRuntimeRoot = path.join(
  import.meta.dir,
  '..',
  'src',
  'runtime',
  'templates',
)

test('template source cache delegates environment policy to a focused module', () => {
  const cacheSource = fs.readFileSync(
    path.join(templateRuntimeRoot, 'template-source-cache.ts'),
    'utf8',
  )
  const policySource = fs.readFileSync(
    path.join(templateRuntimeRoot, 'template-source-cache-policy.ts'),
    'utf8',
  )

  expect(cacheSource).toContain("from './template-source-cache-policy.js'")
  expect(cacheSource).toContain(
    'EXTERNAL_TEMPLATE_CACHE_PRUNE_INTERVAL_MS_ENV',
  )
  expect(cacheSource).not.toContain(
    "const DISABLED_CACHE_VALUES = new Set(['0', 'false', 'no', 'off'])",
  )
  expect(cacheSource).not.toMatch(
    /export\s+function\s+isExternalTemplateCacheEnabled\s*\(/,
  )
  expect(policySource).toContain(
    "export const EXTERNAL_TEMPLATE_CACHE_ENV = 'WP_TYPIA_EXTERNAL_TEMPLATE_CACHE'",
  )
  expect(policySource).toMatch(
    /export\s+function\s+isExternalTemplateCacheEnabled\s*\(/,
  )
  expect(policySource).toMatch(
    /export\s+function\s+resolveExternalTemplateCacheTtlMs\s*\(/,
  )
})

test('template source cache uses crypto randomness for temporary cache entries', () => {
  const cacheSource = fs.readFileSync(
    path.join(templateRuntimeRoot, 'template-source-cache.ts'),
    'utf8',
  )

  expect(cacheSource).toContain("import { createHash, randomUUID } from 'node:crypto'")
  expect(cacheSource).toContain('createTemporaryCacheEntryDirName')
  expect(cacheSource).toContain('randomUUID()')
  expect(cacheSource).not.toContain('Math.random()')
})

test('template source cache delegates marker parsing and serialization to a focused module', () => {
  const cacheSource = fs.readFileSync(
    path.join(templateRuntimeRoot, 'template-source-cache.ts'),
    'utf8',
  )
  const markerSource = fs.readFileSync(
    path.join(templateRuntimeRoot, 'template-source-cache-markers.ts'),
    'utf8',
  )

  expect(cacheSource).toContain("from './template-source-cache-markers.js'")
  expect(cacheSource).not.toContain("const REDACTED_CACHE_METADATA_VALUE = '[redacted]'")
  expect(cacheSource).not.toMatch(/function\s+parseCacheMarkerMetadata\s*\(/)
  expect(markerSource).toContain('parseExternalTemplateCacheEntryMarker')
  expect(markerSource).toContain('formatExternalTemplateCacheEntryMarker')
  expect(markerSource).toContain('parseExternalTemplateCachePruneMarker')
})

test('template source cache marker helpers sanitize metadata and parse TTL markers', () => {
  const entryMarkerText = formatExternalTemplateCacheEntryMarker({
    cacheKey: 'cache-key',
    createdAt: new Date('2026-05-11T00:00:00.000Z'),
    metadata: {
      label: 'demo',
      registryUrl: 'https://user:pass@example.com/pkg.tgz?token=secret#hash',
      sourceUrl: 'not a url',
      tarballUrl: null,
    },
    namespace: 'npm',
  })
  const entryMarker = parseExternalTemplateCacheEntryMarker(entryMarkerText)

  expect(entryMarker?.createdAtMs).toBe(
    Date.parse('2026-05-11T00:00:00.000Z'),
  )
  expect(entryMarker?.metadata).toEqual({
    label: 'demo',
    registryUrl: 'https://example.com/pkg.tgz',
    sourceUrl: '[redacted]',
    tarballUrl: null,
  })
  expect(parseExternalTemplateCacheEntryMarker('[]')).toBeNull()
  expect(
    parseExternalTemplateCacheEntryMarker(
      JSON.stringify({
        createdAt: '2026-05-11T00:00:00.000Z',
        metadata: { label: 123 },
      }),
    ),
  ).toBeNull()
  expect(parseExternalTemplateCacheEntryMarker('{')).toBeNull()

  const pruneMarker = parseExternalTemplateCachePruneMarker(
    formatExternalTemplateCachePruneMarker({
      nowMs: Date.parse('2026-05-11T01:00:00.000Z'),
      pruneIntervalMs: 60_000,
      ttlMs: 86_400_000,
    }),
  )

  expect(pruneMarker).toEqual({
    prunedAtMs: Date.parse('2026-05-11T01:00:00.000Z'),
    pruneIntervalMs: 60_000,
    ttlMs: 86_400_000,
  })
  expect(parseExternalTemplateCachePruneMarker('{}')).toBeNull()
  expect(parseExternalTemplateCachePruneMarker('{')).toBeNull()
})
