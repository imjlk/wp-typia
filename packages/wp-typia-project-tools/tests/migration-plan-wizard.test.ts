import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  PromptSelectionCall,
  addLegacyVersion,
  cleanupMigrationTempRoot,
  createMigrationTempRoot,
  createMultiBlockMigrationProject,
  createStubPrompt,
  createVersionedMigrationProject,
  entryPath,
  runCli,
} from './helpers/migration-test-harness.js';
import {
  planProjectMigrations,
  wizardProjectMigrations,
} from '../src/runtime/migrations.js';
import { loadMigrationProject } from '../src/runtime/migration-project.js';

describe('wp-typia migrate planning', () => {
  const tempRoot = createMigrationTempRoot('wp-typia-migration-plan-');

  afterAll(() => {
    cleanupMigrationTempRoot(tempRoot);
  });

test('plan requires --from-migration-version', () => {
	const projectDir = path.join(tempRoot, 'plan-requires-from-project');
	createVersionedMigrationProject(projectDir);

	expect(() =>
		runCli('node', [entryPath, 'migrate', 'plan'], {
			cwd: projectDir,
		}),
	).toThrow(/`migrate plan` requires --from-migration-version <label>\./);
});

test('plan previews one selected migration edge without generating artifacts', () => {
	const projectDir = path.join(tempRoot, 'plan-preview-project');
	createVersionedMigrationProject(projectDir);
	addLegacyVersion(projectDir, 'v2');

	const rulePath = path.join(projectDir, 'src', 'migrations', 'rules', 'v1-to-v3.ts');
	const fixturePath = path.join(projectDir, 'src', 'migrations', 'fixtures', 'v1-to-v3.json');
	const generatedPath = path.join(projectDir, 'src', 'migrations', 'generated', 'deprecated.ts');
	const lines: string[] = [];
	const summary = planProjectMigrations(projectDir, {
		fromMigrationVersion: 'v1',
		renderLine: (line) => lines.push(line),
		toMigrationVersion: 'current',
	});

	const output = lines.join('\n');
	expect(summary.availableLegacyVersions).toEqual(['v2', 'v1']);
	expect(summary.currentMigrationVersion).toBe('v3');
	expect(summary.fromMigrationVersion).toBe('v1');
	expect(summary.targetMigrationVersion).toBe('v3');
	expect(summary.includedBlocks).toEqual(['create-block/migration-smoke']);
	expect(summary.skippedBlocks).toEqual([]);
	expect(output).toContain('Current migration version: v3');
	expect(output).toContain('Available legacy migration versions: v2, v1');
	expect(output).toContain('Selected migration edge: v1 -> v3');
	expect(output).toContain('Included block targets: create-block/migration-smoke');
	expect(output).toContain('Skipped block targets: None');
	expect(output).toContain('Migration diff: v1 -> v3');
	expect(output).toContain('Risk summary:');
	expect(output).toContain('Next steps:');
	expect(output).toContain('wp-typia migrate scaffold --from-migration-version v1');
	expect(output).toContain('wp-typia migrate doctor --from-migration-version v1');
	expect(output).toContain('wp-typia migrate verify --from-migration-version v1');
	expect(output).toContain('wp-typia migrate fuzz --from-migration-version v1');
	expect(output).toContain('Optional after editing rules: wp-typia migrate fixtures --from-migration-version v1 --force');
	expect(output.indexOf('Current migration version:')).toBeLessThan(output.indexOf('Available legacy migration versions:'));
	expect(output.indexOf('Available legacy migration versions:')).toBeLessThan(output.indexOf('Selected migration edge:'));
	expect(output.indexOf('Selected migration edge:')).toBeLessThan(output.indexOf('Included block targets:'));
	expect(output.indexOf('Included block targets:')).toBeLessThan(output.indexOf('Block: create-block/migration-smoke'));
	expect(output.indexOf('Block: create-block/migration-smoke')).toBeLessThan(output.indexOf('Next steps:'));
	expect(fs.existsSync(rulePath)).toBe(false);
	expect(fs.existsSync(fixturePath)).toBe(false);
	expect(fs.existsSync(generatedPath)).toBe(false);
});

test('plan previews multi-block edges and lists skipped targets that lack snapshots', () => {
	const projectDir = path.join(tempRoot, 'plan-multi-block-project');
	createMultiBlockMigrationProject(projectDir, { includeLegacyChild: false });

	const lines: string[] = [];
	const summary = planProjectMigrations(projectDir, {
		fromMigrationVersion: 'v1',
		renderLine: (line) => lines.push(line),
	});

	const output = lines.join('\n');
	expect(summary.includedBlocks).toEqual(['create-block/multi-parent']);
	expect(summary.skippedBlocks).toEqual(['create-block/multi-parent-item']);
	expect(output).toContain('Included block targets: create-block/multi-parent');
	expect(output).toContain('Skipped block targets: create-block/multi-parent-item');
	expect(output).toContain('Block: create-block/multi-parent');
	expect(output).not.toContain('Block: create-block/multi-parent-item');
	expect(
		fs.existsSync(
			path.join(projectDir, 'src', 'migrations', 'rules', 'multi-parent', 'v1-to-v3.ts'),
		),
	).toBe(false);
});

test('plan stays read-only when current manifests are missing', () => {
	const projectDir = path.join(tempRoot, 'plan-read-only-manifest-project');
	createVersionedMigrationProject(projectDir);
	const manifestPath = path.join(projectDir, 'typia.manifest.json');
	fs.rmSync(manifestPath);

	expect(() =>
		planProjectMigrations(projectDir, {
			fromMigrationVersion: 'v1',
		}),
	).toThrow(/Migration planning is read-only[\s\S]*Run your project's `sync-types` script/);
	expect(fs.existsSync(manifestPath)).toBe(false);
});

test('loadMigrationProject rechecks manifests after attempting sync-types', () => {
	const projectDir = path.join(tempRoot, 'plan-missing-manifest-after-sync-project');
	createVersionedMigrationProject(projectDir);
	const manifestPath = path.join(projectDir, 'typia.manifest.json');
	fs.rmSync(manifestPath);

	expect(() => loadMigrationProject(projectDir)).toThrow(
		/Missing current manifest file\(s\): typia\.manifest\.json[\s\S]*Run your project's `sync-types` script/,
	);
	expect(fs.existsSync(manifestPath)).toBe(false);
});

test('plan only advertises legacy versions with snapshot coverage', () => {
	const projectDir = path.join(tempRoot, 'plan-previewable-versions-project');
	createVersionedMigrationProject(projectDir);

	const configPath = path.join(projectDir, 'src', 'migrations', 'config.ts');
	fs.writeFileSync(
		configPath,
		fs
			.readFileSync(configPath, 'utf8')
			.replace('supportedMigrationVersions: ["v1", "v3"]', 'supportedMigrationVersions: ["v1", "v2", "v3"]'),
		'utf8',
	);

	const lines: string[] = [];
	const summary = planProjectMigrations(projectDir, {
		fromMigrationVersion: 'v1',
		renderLine: (line) => lines.push(line),
	});

	expect(summary.availableLegacyVersions).toEqual(['v1']);
	expect(lines.join('\n')).toContain('Available legacy migration versions: v1');
	expect(lines.join('\n')).not.toContain('v2');
});

test('plan unsupported-version guidance only lists previewable legacy versions', () => {
	const projectDir = path.join(tempRoot, 'plan-previewable-error-project');
	createVersionedMigrationProject(projectDir);

	const configPath = path.join(projectDir, 'src', 'migrations', 'config.ts');
	fs.writeFileSync(
		configPath,
		fs
			.readFileSync(configPath, 'utf8')
			.replace('supportedMigrationVersions: ["v1", "v3"]', 'supportedMigrationVersions: ["v1", "v2", "v3"]'),
		'utf8',
	);

	let thrown: unknown;
	try {
		planProjectMigrations(projectDir, {
			fromMigrationVersion: '9.9.9',
		});
	} catch (error) {
		thrown = error;
	}

	expect(thrown).toBeInstanceOf(Error);
	expect((thrown as Error).message).toContain('Available legacy migration versions: v1');
	expect((thrown as Error).message).not.toContain('v2');
});

test('plan omits current-migration-version follow-up commands for non-current targets', () => {
	const projectDir = path.join(tempRoot, 'plan-non-current-target-project');
	createVersionedMigrationProject(projectDir);
	addLegacyVersion(projectDir, 'v2');

	const lines: string[] = [];
	const summary = planProjectMigrations(projectDir, {
		fromMigrationVersion: 'v1',
		renderLine: (line) => lines.push(line),
		toMigrationVersion: 'v2',
	});

	const output = lines.join('\n');
	expect(summary.targetMigrationVersion).toBe('v2');
	expect(summary.nextSteps).toEqual(['wp-typia migrate scaffold --from-migration-version v1 --to-migration-version v2']);
	expect(output).toContain('Selected migration edge: v1 -> v2');
	expect(output).toContain('wp-typia migrate scaffold --from-migration-version v1 --to-migration-version v2');
	expect(output).not.toContain('wp-typia migrate doctor --from-migration-version v1');
	expect(output).not.toContain('wp-typia migrate verify --from-migration-version v1');
	expect(output).not.toContain('wp-typia migrate fuzz --from-migration-version v1');
	expect(output).toContain('Optional after editing rules: wp-typia migrate fixtures --from-migration-version v1 --to-migration-version v2 --force');
});

test('wizard fails outside a TTY with actionable guidance', async () => {
	const projectDir = path.join(tempRoot, 'wizard-non-tty-project');
	createVersionedMigrationProject(projectDir);

	await expect(
		wizardProjectMigrations(projectDir, {
			isInteractive: false,
		}),
	).rejects.toThrow(
		/`migrate wizard` requires an interactive terminal[\s\S]*wp-typia migrate plan --from-migration-version <label>/,
	);
});

test('wizard previews the most recent legacy version by default order and stays read-only', async () => {
	const projectDir = path.join(tempRoot, 'wizard-preview-project');
	createVersionedMigrationProject(projectDir);
	addLegacyVersion(projectDir, 'v2');

	const calls: PromptSelectionCall[] = [];
	const lines: string[] = [];
	const summary = await wizardProjectMigrations(projectDir, {
		isInteractive: true,
		prompt: createStubPrompt(undefined, calls),
		renderLine: (line) => lines.push(line),
	});

	expect('cancelled' in summary).toBe(false);
	expect(calls[0]?.message).toContain('Choose a legacy version to preview');
	expect(calls[0]?.defaultValue).toBe(1);
	expect(calls[0]?.options.map((option) => option.value)).toEqual(['v2', 'v1', 'cancel']);
	if ('cancelled' in summary) {
		throw new Error('Expected wizard to return a plan summary.');
	}
	expect(summary.fromMigrationVersion).toBe('v2');
	expect(summary.targetMigrationVersion).toBe('v3');
	expect(lines.join('\n')).toContain('Selected migration edge: v2 -> v3');
	expect(
		fs.existsSync(path.join(projectDir, 'src', 'migrations', 'rules', 'v2-to-v3.ts')),
	).toBe(false);
});

test('wizard orders migration labels numerically and defaults to the newest label', async () => {
	const projectDir = path.join(tempRoot, 'wizard-numeric-order-project');
	createVersionedMigrationProject(projectDir);

	const configPath = path.join(projectDir, 'src', 'migrations', 'config.ts');
	fs.cpSync(
		path.join(projectDir, 'src', 'migrations', 'versions', 'v1'),
		path.join(projectDir, 'src', 'migrations', 'versions', 'v9'),
		{ recursive: true },
	);
	fs.cpSync(
		path.join(projectDir, 'src', 'migrations', 'versions', 'v1'),
		path.join(projectDir, 'src', 'migrations', 'versions', 'v10'),
		{ recursive: true },
	);
	fs.writeFileSync(
		configPath,
		fs
			.readFileSync(configPath, 'utf8')
			.replace('currentMigrationVersion: "v3"', 'currentMigrationVersion: "v11"')
			.replace('supportedMigrationVersions: ["v1", "v3"]', 'supportedMigrationVersions: ["v1", "v9", "v10", "v11"]'),
		'utf8',
	);

	const calls: PromptSelectionCall[] = [];
	await wizardProjectMigrations(projectDir, {
		isInteractive: true,
		prompt: createStubPrompt(undefined, calls),
		renderLine: () => undefined,
	});

	expect(calls[0]?.options.map((option) => option.value)).toEqual(['v10', 'v9', 'v1', 'cancel']);
});

test('wizard cancellation exits cleanly without writing migration artifacts', async () => {
	const projectDir = path.join(tempRoot, 'wizard-cancel-project');
	createVersionedMigrationProject(projectDir);

	const lines: string[] = [];
	const result = await wizardProjectMigrations(projectDir, {
		isInteractive: true,
		prompt: createStubPrompt('cancel', []),
		renderLine: (line) => lines.push(line),
	});

	expect(result).toEqual({ cancelled: true });
	expect(lines.join('\n')).toContain('Cancelled migration planning.');
	expect(
		fs.existsSync(path.join(projectDir, 'src', 'migrations', 'rules', 'v1-to-v3.ts')),
	).toBe(false);
	expect(
		fs.existsSync(path.join(projectDir, 'src', 'migrations', 'fixtures', 'v1-to-v3.json')),
	).toBe(false);
});
});
