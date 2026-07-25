import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  cleanupScaffoldTempRoot,
  createScaffoldTempRoot,
} from './helpers/scaffold-test-harness.js';
import {
  BLOCK_GENERATION_TOOL_CONTRACT_VERSION,
  inspectBlockGeneration,
} from '../src/runtime/index.js';
import { getDefaultAnswers } from '../src/runtime/scaffold.js';
import type { BuiltInTemplateId } from '../src/runtime/template-registry.js';

function buildAnswers(templateId: BuiltInTemplateId) {
  return {
    ...getDefaultAnswers('demo-generator-tool-contract', templateId),
    author: 'Tool Contract Tester',
    description: `Demo ${templateId} tool contract block`,
    namespace: 'demo-space',
    phpPrefix: 'demo_space',
    slug: 'demo-generator-tool-contract',
    textDomain: 'demo-space',
    title: 'Demo Generator Tool Contract',
  };
}

describe('inspectBlockGeneration', () => {
	const tempRoot = createScaffoldTempRoot('wp-typia-block-generator-tool-');

	afterAll(() => {
		cleanupScaffoldTempRoot(tempRoot);
	});

	test('can stop after the plan stage with a serializable non-mutating snapshot', async () => {
		const result = await inspectBlockGeneration({
			answers: buildAnswers('basic'),
			noInstall: true,
			packageManager: 'npm',
			projectDir: path.join(tempRoot, 'plan-basic'),
			stopAfter: 'plan',
			templateId: 'basic',
		});

		expect(result.contractVersion).toBe(BLOCK_GENERATION_TOOL_CONTRACT_VERSION);
		expect(result.mutatesWorkspace).toBe(false);
		expect(result.stage).toBe('plan');
		expect(result.plan.spec.template.family).toBe('basic');
		expect(result.plan.target.noInstall).toBe(true);
		expect(JSON.parse(JSON.stringify(result))).toMatchObject({
			stage: 'plan',
		});
	});

	test('can stop after validation without rendering or mutating the workspace', async () => {
		const result = await inspectBlockGeneration({
			answers: buildAnswers('interactivity'),
			noInstall: true,
			packageManager: 'npm',
			projectDir: path.join(tempRoot, 'validate-interactivity'),
			stopAfter: 'validate',
			templateId: 'interactivity',
		});

		expect(result.stage).toBe('validate');
		expect(result.contractVersion).toBe(BLOCK_GENERATION_TOOL_CONTRACT_VERSION);
		expect(result.mutatesWorkspace).toBe(false);
		expect(result.validated.spec.template.family).toBe('interactivity');
		expect(result.validated.spec.block.slug).toBe('demo-generator-tool-contract');
		expect(fs.existsSync(result.validated.target.projectDir)).toBe(false);
	});

	test('returns a render-stage contract with copied files, emitted files, and starter manifests', async () => {
		const projectDir = path.join(tempRoot, 'render-compound');
		const result = await inspectBlockGeneration({
			answers: {
				...buildAnswers('compound'),
				dataStorageMode: 'post-meta',
				persistencePolicy: 'public',
			},
			noInstall: true,
			packageManager: 'npm',
			projectDir,
			templateId: 'compound',
		});

		expect(result.stage).toBe('render');
		expect(result.contractVersion).toBe(BLOCK_GENERATION_TOOL_CONTRACT_VERSION);
		expect(result.mutatesWorkspace).toBe(false);
		expect(result.rendered.template.family).toBe('compound');
		expect(result.rendered.template.format).toBe('wp-typia');
		expect(result.rendered.postRender.installsDependencies).toBe(false);
		expect(result.rendered.postRender.seedPersistenceArtifacts).toBe(true);
		expect(result.rendered.copiedTemplateFiles).toContainEqual({
			owner: 'template-copy',
			relativePath: 'package.json',
		});
		expect(result.rendered.emittedFiles).toContainEqual(
			expect.objectContaining({
				kind: 'structural',
				owner: 'emitter',
				relativePath: 'src/blocks/demo-generator-tool-contract/block.json',
			}),
		);
		expect(result.rendered.emittedFiles).toContainEqual(
			expect.objectContaining({
				kind: 'generated-source',
				owner: 'emitter',
				relativePath: 'src/blocks/demo-generator-tool-contract/edit.tsx',
			}),
		);
		expect(result.rendered.starterManifestFiles).toContainEqual(
			expect.objectContaining({
				owner: 'emitter',
				relativePath: 'src/blocks/demo-generator-tool-contract/typia.manifest.json',
			}),
		);
		expect(result.rendered.starterManifestFiles).toContainEqual(
			expect.objectContaining({
				owner: 'emitter',
				relativePath: 'src/blocks/demo-generator-tool-contract-item/typia.manifest.json',
			}),
		);
		expect(fs.existsSync(projectDir)).toBe(false);
		expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
	});
});
