import { expect, test } from 'bun:test';

import {
  buildAiFeatureApiSource,
  buildAiFeatureConfigEntry,
} from '../src/runtime/cli-add-workspace-ai-source-emitters.js';
import { formatResolveRestNonceSource } from '../src/runtime/cli-add-workspace-rest-source-utils.js';

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

test('AI feature API source reuses the shared ttsc-clean REST nonce helper', () => {
  const source = buildAiFeatureApiSource('demo-ai-feature');

  expect(source).toContain(formatResolveRestNonceSource());
  expect(source).toContain('    const nonce = resolveRestNonce();');
  expect(source).toContain(
    'function resolveRestNonce(\n  fallback?: string,\n): string | undefined {',
  );
  expect(countOccurrences(source, 'function resolveRestNonce')).toBe(1);
});

test('AI feature config entries render compatibility and manifests as TypeScript', () => {
  const source = buildAiFeatureConfigEntry('brief-suggestions', 'demo-space/v1');

  expect(source).toContain('    compatibility: {\n      hardMinimums: {');
  expect(source).toContain('    restManifest: defineEndpointManifest(\n      {');
  expect(source).toContain("        method: 'POST',");
  expect(source).not.toContain('"method":');
  expect(source).not.toContain(',,');
});

test('AI feature API compatibility metadata uses stable TypeScript indentation', () => {
  const source = buildAiFeatureApiSource('brief-suggestions');

  expect(source).toContain('  compatibility: {\n    hardMinimums: {');
  expect(source).toContain("    mode: 'optional',");
  expect(source).not.toContain('"mode":');
});
