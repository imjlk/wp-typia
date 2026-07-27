import { describe, expect, test } from 'bun:test';

import { resolveOptionalInteractiveExternalLayerId } from '../src/runtime/external-layer-selection.js';
import type { ExternalLayerSelectionOption } from '../src/runtime/external-layer-selection.js';

const selectableLayers: ExternalLayerSelectionOption[] = [
  {
    description: 'Alpha external layer',
    extends: [],
    id: 'acme/alpha',
  },
  {
    description: 'Beta external layer',
    extends: [],
    id: 'acme/beta',
  },
];

function createSeed(cleanup: () => Promise<void>) {
  return {
    blockDir: '/virtual/layers',
    cleanup,
    rootDir: '/virtual/layers',
  };
}

describe('@wp-typia/project-tools external layer selection', () => {
	test('cleans up exactly once when interactive selection returns an unknown external layer id', async () => {
		let cleanupCalls = 0;
		const cleanup = async () => {
			cleanupCalls += 1;
		};

		await expect(
			resolveOptionalInteractiveExternalLayerId({
				callerCwd: '/virtual/project',
				externalLayerSource: 'virtual-layer-source',
				listExternalTemplateLayers: async (rootDir) => {
					expect(rootDir).toBe('/virtual/layers');
					return selectableLayers;
				},
				resolveExternalTemplateSeed: async () => createSeed(cleanup),
				selectExternalLayerId: async (options) => {
					expect(options).toEqual(selectableLayers);
					return 'acme/missing';
				},
			}),
		).rejects.toThrow(
			'Unknown external layer "acme/missing". Expected one of: acme/alpha, acme/beta',
		);
		expect(cleanupCalls).toBe(1);
	});

	test('cleans up once when external layer listing throws', async () => {
		let cleanupCalls = 0;
		const cleanup = async () => {
			cleanupCalls += 1;
		};

		await expect(
			resolveOptionalInteractiveExternalLayerId({
				callerCwd: '/virtual/project',
				externalLayerSource: 'virtual-layer-source',
				listExternalTemplateLayers: async () => {
					throw new Error('layer listing failed');
				},
				resolveExternalTemplateSeed: async () => createSeed(cleanup),
				selectExternalLayerId: async () => 'acme/beta',
			}),
		).rejects.toThrow('layer listing failed');
		expect(cleanupCalls).toBe(1);
	});

	test('cleans up once when interactive external layer selection throws', async () => {
		let cleanupCalls = 0;
		const cleanup = async () => {
			cleanupCalls += 1;
		};

		await expect(
			resolveOptionalInteractiveExternalLayerId({
				callerCwd: '/virtual/project',
				externalLayerSource: 'virtual-layer-source',
				listExternalTemplateLayers: async () => selectableLayers,
				resolveExternalTemplateSeed: async () => createSeed(cleanup),
				selectExternalLayerId: async () => {
					throw new Error('selection failed');
				},
			}),
		).rejects.toThrow('selection failed');
		expect(cleanupCalls).toBe(1);
	});

	test('returns cleanup to the caller after a successful interactive selection', async () => {
		let cleanupCalls = 0;
		const cleanup = async () => {
			cleanupCalls += 1;
		};

		const selection = await resolveOptionalInteractiveExternalLayerId({
			callerCwd: '/virtual/project',
			externalLayerSource: 'virtual-layer-source',
			listExternalTemplateLayers: async () => selectableLayers,
			resolveExternalTemplateSeed: async () => createSeed(cleanup),
			selectExternalLayerId: async () => 'acme/beta',
		});

		expect(selection).toEqual({
			cleanup,
			externalLayerId: 'acme/beta',
			externalLayerSource: '/virtual/layers',
		});
		expect(cleanupCalls).toBe(0);

		await selection.cleanup?.();
		expect(cleanupCalls).toBe(1);
	});
});
