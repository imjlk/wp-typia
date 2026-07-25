import { expect, test } from 'bun:test';

import {
  buildManualRestContractApiSource,
  buildRestResourceApiSource,
} from '../src/runtime/cli-add-workspace-rest-source-emitters.js';

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

test('manual REST contract API source keeps the compact nonce helper output stable', () => {
  const source = buildManualRestContractApiSource({
    queryTypeName: 'DemoQuery',
    restResourceSlug: 'demo-resource',
  });

  expect(source).toContain(
    'function resolveRestNonce(fallback?: string): string | undefined {',
  );
  expect(source).toContain(
    "\tif (typeof fallback === 'string' && fallback.length > 0) {",
  );
  expect(source).not.toContain(
    'function resolveRestNonce( fallback?: string ): string | undefined {',
  );
  expect(countOccurrences(source, 'function resolveRestNonce')).toBe(1);
});

test('REST resource API source keeps the spaced nonce helper output stable', () => {
  const source = buildRestResourceApiSource('demo-resource', ['list', 'create']);

  expect(source).toContain(
    'function resolveRestNonce( fallback?: string ): string | undefined {',
  );
  expect(source).toContain(
    "\tif ( typeof fallback === 'string' && fallback.length > 0 ) {",
  );
  expect(source).not.toContain(
    'function resolveRestNonce(fallback?: string): string | undefined {',
  );
  expect(countOccurrences(source, 'function resolveRestNonce')).toBe(1);
});

test('REST resource API source omits the nonce helper for read-only methods', () => {
  const source = buildRestResourceApiSource('demo-resource', ['list', 'read']);

  expect(source).not.toContain('function resolveRestNonce');
});
