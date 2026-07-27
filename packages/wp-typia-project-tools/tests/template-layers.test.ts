import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, test } from 'bun:test';

import {
  templateLayerAmbiguousFixturePath,
  templateLayerConflictFixturePath,
  templateLayerCycleFixturePath,
  templateLayerFixturePath,
} from './helpers/scaffold-test-harness.js';
import {
  listSelectableExternalTemplateLayers,
  loadExternalTemplateLayerManifest,
  resolveExternalTemplateLayers,
} from '../src/runtime/template-layers.js';

describe('external template layer manifests', () => {
	test('loads a data-only layer manifest and resolves ancestors deterministically', async () => {
		const manifest = await loadExternalTemplateLayerManifest(
			templateLayerFixturePath,
		);

		expect(manifest?.version).toBe(1);
		expect(Object.keys(manifest?.layers ?? {})).toEqual([
			'acme/internal-observability-base',
			'acme/basic-observability',
		]);

		const resolved = await resolveExternalTemplateLayers({
			sourceRoot: templateLayerFixturePath,
		});

		expect(resolved.selectedLayerId).toBe('acme/basic-observability');
		expect(resolved.entries.map((entry) => entry.id)).toEqual([
			'builtin:shared/base',
			'acme/internal-observability-base',
			'builtin:shared/rest-helpers/shared',
			'acme/basic-observability',
		]);
	});

	test('requires an explicit externalLayerId when a package exposes multiple public layers', async () => {
		await expect(
			listSelectableExternalTemplateLayers(templateLayerAmbiguousFixturePath),
		).resolves.toEqual([
			{
				description: 'Alpha external layer',
				extends: ['acme/internal-base'],
				id: 'acme/alpha',
			},
			{
				description: 'Beta external layer',
				extends: ['acme/internal-base'],
				id: 'acme/beta',
			},
		]);

		await expect(
			resolveExternalTemplateLayers({
				sourceRoot: templateLayerAmbiguousFixturePath,
			}),
		).rejects.toThrow(
			'Pass an explicit externalLayerId or rerun through the interactive CLI selector.',
		);

		await expect(
			resolveExternalTemplateLayers({
				externalLayerId: 'acme/beta',
				sourceRoot: templateLayerAmbiguousFixturePath,
			}),
		).resolves.toMatchObject({
			selectedLayerId: 'acme/beta',
		});
	});

	test('rejects layer cycles and protected output conflicts', async () => {
		await expect(
			resolveExternalTemplateLayers({
				externalLayerId: 'acme/a',
				sourceRoot: templateLayerCycleFixturePath,
			}),
		).rejects.toThrow('Detected a cycle while resolving external layer');

		const resolvedConflict = await resolveExternalTemplateLayers({
			sourceRoot: templateLayerConflictFixturePath,
		});
		expect(resolvedConflict.selectedLayerId).toBe('acme/conflict');
	});

	test('rejects manifest layers that try to shadow reserved built-in ids', async () => {
		const tempRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), 'wp-typia-layer-shadow-'),
		);
		const cleanup = () => fs.rmSync(tempRoot, { force: true, recursive: true });

		try {
			fs.mkdirSync(path.join(tempRoot, 'layers', 'shadow'), { recursive: true });
			fs.writeFileSync(
				path.join(tempRoot, 'wp-typia.layers.json'),
				JSON.stringify(
					{
						version: 1,
						layers: {
							'builtin:shared/base': {
								path: 'layers/shadow',
							},
						},
					},
					null,
					2,
				),
				'utf8',
			);

			await expect(
				loadExternalTemplateLayerManifest(tempRoot),
			).rejects.toThrow(
				'uses a reserved built-in shared layer id',
			);
		} finally {
			cleanup();
		}
	});
});
