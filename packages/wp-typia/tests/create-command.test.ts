import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { executeCreateCommand } from '../src/runtime-bridge';

const ambiguousLayerFixturePath = path.resolve(
  import.meta.dir,
  '..',
  '..',
  'wp-typia-project-tools',
  'tests',
  'fixtures',
  'wp-typia-layer-ambiguous',
);

describe('wp-typia create command bridge', () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-typia-create-bridge-'));

	afterAll(() => {
		fs.rmSync(tempRoot, { force: true, recursive: true });
	});

	test('rejects mistyped template ids before scaffold progress starts', async () => {
		const progress: string[] = [];
		const targetDir = path.join(tempRoot, 'demo-early-template-validation');

		const error = await executeCreateCommand({
			cwd: tempRoot,
			emitOutput: false,
			flags: {
				'no-install': true,
				'package-manager': 'npm',
				template: 'basicc',
				yes: true,
			},
			interactive: false,
			onProgress: ({ detail, title }) => {
				progress.push(`${title}: ${detail}`);
			},
			projectDir: 'demo-early-template-validation',
		}).catch((error) => error);

		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toContain(
			'Unknown template "basicc". Did you mean "basic"?',
		);
		expect(progress).toEqual([]);
		expect(fs.existsSync(targetDir)).toBe(false);
	});

	test('keeps ambiguous external layers fail-fast when a synthetic prompt is supplied', async () => {
		const defaultPrompt = {
			close() {},
			select<T extends string>(
				_message: string,
				options: Array<{ value: T }>,
				defaultValue = 1,
			) {
				const fallback = options[Math.max(0, defaultValue - 1)] ?? options[0];
				return Promise.resolve(fallback.value);
			},
			text(_message: string, defaultValue: string) {
				return Promise.resolve(defaultValue);
			},
		};

		const error = await executeCreateCommand({
			cwd: tempRoot,
			emitOutput: false,
			flags: {
				'external-layer-source': ambiguousLayerFixturePath,
				'no-install': true,
				'package-manager': 'npm',
				template: 'basic',
			},
			interactive: true,
			projectDir: 'demo-tui-ambiguous-layer',
			prompt: defaultPrompt,
		}).catch((error) => error);

		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe(
			'External layer package defines multiple selectable layers (acme/internal-base, acme/alpha, acme/beta). Pass an explicit externalLayerId or rerun through the interactive CLI selector.',
		);
	});

	test('reports scaffold progress during create flows', async () => {
		const progress: string[] = [];

		await executeCreateCommand({
			cwd: tempRoot,
			emitOutput: false,
			flags: {
				'no-install': true,
				'package-manager': 'npm',
				template: 'basic',
				yes: true,
			},
			interactive: false,
			onProgress: ({ detail, title }) => {
				progress.push(`${title}: ${detail}`);
			},
			projectDir: 'demo-progress-reporting',
		});

		expect(progress[0]).toContain('Resolving scaffold template');
		expect(progress).toContain(
			'Generating project files: Copying built-in template files and writing generated source modules.',
		);
		expect(progress).toContain(
			'Seeding scaffold artifacts: Writing starter manifests, local presets, and seeded template artifacts.',
		);
		expect(progress).toContain(
			'Finalizing scaffold output: Writing README, normalizing package metadata, and aligning package-manager files.',
		);
		expect(progress.some((line) => line.startsWith('Installing dependencies:'))).toBe(false);
	});

	test('dry-run create previews scaffold output without writing the target directory', async () => {
		const targetDir = path.join(tempRoot, 'demo-dry-run-preview');

		const payload = await executeCreateCommand({
			cwd: tempRoot,
			emitOutput: false,
			flags: {
				'dry-run': true,
				'package-manager': 'npm',
				template: 'basic',
				yes: true,
			},
			interactive: false,
			projectDir: 'demo-dry-run-preview',
		});

		expect(payload.title).toContain('Dry run');
		expect(payload.summaryLines).toContain(`Project directory: ${targetDir}`);
		expect(payload.optionalLines?.some((line) => line === 'write package.json')).toBe(true);
		expect(fs.existsSync(targetDir)).toBe(false);
	});

	test('dry-run create defaults non-interactive answers without requiring --yes', async () => {
		const targetDir = path.join(tempRoot, 'demo-dry-run-preview-no-yes');

		const payload = await executeCreateCommand({
			cwd: tempRoot,
			emitOutput: false,
			flags: {
				'dry-run': true,
				'package-manager': 'npm',
				template: 'basic',
			},
			interactive: false,
			projectDir: 'demo-dry-run-preview-no-yes',
		});

		expect(payload.title).toContain('Dry run');
		expect(payload.summaryLines).toContain(`Project directory: ${targetDir}`);
		expect(payload.optionalLines?.some((line) => line === 'write package.json')).toBe(true);
		expect(fs.existsSync(targetDir)).toBe(false);
	});
});
