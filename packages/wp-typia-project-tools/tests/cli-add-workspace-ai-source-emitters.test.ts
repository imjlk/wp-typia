import { expect, test } from 'bun:test';

import { buildAiFeatureApiSource } from '../src/runtime/cli-add-workspace-ai-source-emitters.js';
import { formatResolveRestNonceSource } from '../src/runtime/cli-add-workspace-rest-source-utils.js';

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

test('AI feature API source reuses the shared spaced REST nonce helper', () => {
  const source = buildAiFeatureApiSource('demo-ai-feature');

  expect(source).toContain(formatResolveRestNonceSource('spaced'));
  expect(source).toContain('\t\tconst nonce = resolveRestNonce();');
  expect(source).not.toContain(
    'function resolveRestNonce(fallback?: string): string | undefined {',
  );
  expect(countOccurrences(source, 'function resolveRestNonce')).toBe(1);
});
