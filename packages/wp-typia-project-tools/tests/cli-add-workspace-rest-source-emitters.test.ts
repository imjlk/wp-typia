import { expect, test } from 'bun:test';

import {
  buildManualRestContractApiSource,
  buildRestResourceApiSource,
} from '../src/runtime/cli-add-workspace-rest-source-emitters.js';

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

const CANONICAL_NONCE_SIGNATURE =
  'function resolveRestNonce(\n  fallback?: string,\n): string | undefined {';

test('manual REST contract API source emits the ttsc-clean nonce helper', () => {
  const source = buildManualRestContractApiSource({
    queryTypeName: 'DemoQuery',
    restResourceSlug: 'demo-resource',
  });

  expect(source).toContain(CANONICAL_NONCE_SIGNATURE);
  expect(source).toContain(
    "  if (typeof fallback === 'string' && fallback.length > 0) {",
  );
  expect(countOccurrences(source, 'function resolveRestNonce')).toBe(1);
});

test('REST resource API source emits the ttsc-clean nonce helper', () => {
  const source = buildRestResourceApiSource('demo-resource', ['list', 'create']);

  expect(source).toContain(CANONICAL_NONCE_SIGNATURE);
  expect(source).toContain(
    "  if (typeof fallback === 'string' && fallback.length > 0) {",
  );
  expect(countOccurrences(source, 'function resolveRestNonce')).toBe(1);
});

test('REST resource API source omits the nonce helper for read-only methods', () => {
  const source = buildRestResourceApiSource('demo-resource', ['list', 'read']);

  expect(source).not.toContain('function resolveRestNonce');
});
