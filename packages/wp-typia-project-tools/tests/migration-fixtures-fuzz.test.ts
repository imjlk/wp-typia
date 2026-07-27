import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  cleanupMigrationTempRoot,
  createFuzzFailureProject,
  createMigrationTempRoot,
  createVersionedMigrationProject,
  entryPath,
  runCli,
  writeJson,
} from './helpers/migration-test-harness.js';
import {
  fixturesProjectMigrations,
  runMigrationCommand,
  snapshotProjectVersion,
} from '../src/runtime/migrations.js';
import { parseMigrationArgs } from '../src/runtime/index.js';

describe('wp-typia migrate fixtures and fuzz', () => {
  const tempRoot = createMigrationTempRoot('wp-typia-migration-fixtures-');

  afterAll(() => {
    cleanupMigrationTempRoot(tempRoot);
  });

test('fixtures command skips existing files without force and refreshes with force', () => {
	const projectDir = path.join(tempRoot, 'fixtures-project');
	createVersionedMigrationProject(projectDir);

	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const fixturePath = path.join(projectDir, 'src', 'migrations', 'fixtures', 'v1-to-v3.json');
	fs.writeFileSync(
		fixturePath,
		`${JSON.stringify({ cases: [{ input: { content: 'custom' }, name: 'custom' }], fromVersion: 'v1', toVersion: 'v3' }, null, '\t')}\n`,
		'utf8',
	);

	const skipOutput = runCli('node', [entryPath, 'migrate', 'fixtures', '--all'], {
		cwd: projectDir,
	});
	expect(skipOutput).toContain('Preserved existing fixture');
	expect(skipOutput).toContain('use --force to refresh');
	expect(fs.readFileSync(fixturePath, 'utf8')).toContain('"custom"');

	const forceOutput = runCli('node', [entryPath, 'migrate', 'fixtures', '--all', '--force'], {
		cwd: projectDir,
	});
	expect(forceOutput).toContain('Refreshed fixture');
	expect(fs.readFileSync(fixturePath, 'utf8')).toContain('"default"');
	expect(fs.readFileSync(fixturePath, 'utf8')).not.toContain('"custom"');
});

test('fixtures --force prompts before overwriting existing fixtures in interactive mode', () => {
	const projectDir = path.join(tempRoot, 'fixtures-force-confirm-project');
	createVersionedMigrationProject(projectDir);

	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const fixturePath = path.join(projectDir, 'src', 'migrations', 'fixtures', 'v1-to-v3.json');
	fs.writeFileSync(
		fixturePath,
		`${JSON.stringify({ cases: [{ input: { content: 'custom' }, name: 'custom' }], fromVersion: 'v1', toVersion: 'v3' }, null, '\t')}\n`,
		'utf8',
	);

	const prompts: string[] = [];
	const lines: string[] = [];
	const result = fixturesProjectMigrations(projectDir, {
		all: true,
		confirmOverwrite: (message) => {
			prompts.push(message);
			return false;
		},
		force: true,
		isInteractive: true,
		renderLine: (line) => lines.push(line),
	});

	expect(prompts[0]).toContain('overwrite 1 existing migration fixture file');
	expect(lines.join('\n')).toContain('Cancelled fixture refresh');
	expect(result.generatedVersions).toEqual([]);
	expect(result.skippedVersions.length).toBe(1);
	expect(fs.readFileSync(fixturePath, 'utf8')).toContain('"custom"');
});

test('snapshot surfaces sync-types recovery guidance when the preflight script fails', () => {
	const projectDir = path.join(tempRoot, 'snapshot-sync-types-failure-project');
	createVersionedMigrationProject(projectDir);

	writeJson(
		path.join(projectDir, 'package.json'),
		{
			name: 'migration-smoke',
			packageManager: 'bun@1.3.11',
			private: true,
			scripts: {
				'sync-types': `node -e "process.stderr.write('sync-types failed'); process.exit(1)"`,
			},
			type: 'module',
			version: '0.1.0',
		},
	);

	expect(() => snapshotProjectVersion(projectDir, 'v4')).toThrow(
		/Could not capture migration snapshot v4 because `bun run sync-types` failed first[\s\S]*Install project dependencies[\s\S]*rerun `bun run sync-types`[\s\S]*retry `wp-typia migrate snapshot --migration-version v4`[\s\S]*Original error:/,
	);
});

test('fuzz command succeeds on a healthy migration edge', () => {
	const projectDir = path.join(tempRoot, 'fuzz-success-project');
	createVersionedMigrationProject(projectDir);

	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const output = runCli(
		'node',
		[entryPath, 'migrate', 'fuzz', '--all', '--iterations', '5', '--seed', '1'],
		{ cwd: projectDir },
	);
	expect(output).toContain('Fuzzed v1 -> v3');
	expect(output).toContain('Migration fuzzing passed for create-block/migration-smoke');
});

test('fuzz command reports reproducible failures with the provided seed', () => {
	const projectDir = path.join(tempRoot, 'fuzz-failure-project');
	createFuzzFailureProject(projectDir);

	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v1'], {
		cwd: projectDir,
	});

	expect(() =>
		runCli(
			'node',
			[entryPath, 'migrate', 'fuzz', '--all', '--iterations', '5', '--seed', '7'],
			{ cwd: projectDir },
		),
	).toThrow(/seed 7/);
});

test('fuzz command accepts seed zero and rejects unsupported requested versions', () => {
	const projectDir = path.join(tempRoot, 'fuzz-seed-zero-project');
	createVersionedMigrationProject(projectDir);

	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const zeroSeedOutput = runCli(
		'node',
		[entryPath, 'migrate', 'fuzz', '--all', '--iterations', '1', '--seed', '0'],
		{ cwd: projectDir },
	);
	expect(zeroSeedOutput).toContain('Fuzzed v1 -> v3');

	expect(() =>
		runCli(
			'node',
			[entryPath, 'migrate', 'fuzz', '--from-migration-version', '9.9.9', '--iterations', '1', '--seed', '0'],
			{ cwd: projectDir },
		),
	).toThrow(/Unsupported migration version: 9.9.9[\s\S]*Available legacy migration versions: v1/);
});

test('runMigrationCommand preserves synchronous throws for direct callers', () => {
	const projectDir = path.join(tempRoot, 'run-command-sync-contract-project');
	createVersionedMigrationProject(projectDir);
	const command = parseMigrationArgs(['plan', '--from-migration-version', 'v3']);

	expect(() => runMigrationCommand(command, projectDir)).toThrow(
		/migrate plan` requires different source and target migration versions[\s\S]*v3/,
	);
});

test('verify defaults to the first legacy version and rejects malformed numeric flags', () => {
	const projectDir = path.join(tempRoot, 'verify-default-project');
	createVersionedMigrationProject(projectDir);
	const configPath = path.join(projectDir, 'src', 'migrations', 'config.ts');
	const version100Root = path.join(projectDir, 'src', 'migrations', 'versions', 'v1');
	const version150Root = path.join(projectDir, 'src', 'migrations', 'versions', 'v2');

	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v1'], {
		cwd: projectDir,
	});
	fs.cpSync(version100Root, version150Root, { recursive: true });
	fs.writeFileSync(
		configPath,
		fs
			.readFileSync(configPath, 'utf8')
			.replace('supportedMigrationVersions: ["v1", "v3"]', 'supportedMigrationVersions: ["v1", "v2", "v3"]'),
		'utf8',
	);
	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v2'], {
		cwd: projectDir,
	});

	const verifyOutput = runCli('node', [entryPath, 'migrate', 'verify'], {
		cwd: projectDir,
	});
	expect(verifyOutput).toContain('Verified migrations for v1');
	expect(verifyOutput).not.toContain('v2');

	expect(() =>
		runCli(
			'node',
			[entryPath, 'migrate', 'fuzz', '--all', '--iterations', '2.5'],
			{ cwd: projectDir },
		),
	).toThrow(/Invalid iterations: 2.5/);

	expect(() =>
		runCli(
			'node',
			[entryPath, 'migrate', 'fuzz', '--all', '--seed', '10foo'],
			{ cwd: projectDir },
		),
	).toThrow(/Invalid seed: 10foo/);
});

test('verify and fuzz fail when selected legacy versions are missing scaffolded edges', () => {
	const projectDir = path.join(tempRoot, 'missing-edge-verification-project');
	createVersionedMigrationProject(projectDir);
	const configPath = path.join(projectDir, 'src', 'migrations', 'config.ts');
	const version100Root = path.join(projectDir, 'src', 'migrations', 'versions', 'v1');
	const version150Root = path.join(projectDir, 'src', 'migrations', 'versions', 'v2');

	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v1'], {
		cwd: projectDir,
	});
	fs.cpSync(version100Root, version150Root, { recursive: true });
	fs.writeFileSync(
		configPath,
		fs
			.readFileSync(configPath, 'utf8')
			.replace('supportedMigrationVersions: ["v1", "v3"]', 'supportedMigrationVersions: ["v1", "v2", "v3"]'),
		'utf8',
	);

	expect(() =>
		runCli('node', [entryPath, 'migrate', 'verify', '--all'], {
			cwd: projectDir,
		}),
	).toThrow(/Missing migration verify inputs.*v2[\s\S]*migrate scaffold --from-migration-version v2[\s\S]*migrate doctor --all/);
	expect(() =>
		runCli(
			'node',
			[entryPath, 'migrate', 'fuzz', '--all', '--iterations', '1', '--seed', '0'],
			{ cwd: projectDir },
		),
	).toThrow(/Missing migration fuzz inputs.*v2[\s\S]*migrate scaffold --from-migration-version v2[\s\S]*migrate doctor --all/);
});

test('verify and fuzz fail with recovery guidance when generated scripts are missing', () => {
	const projectDir = path.join(tempRoot, 'missing-generated-script-project');
	createVersionedMigrationProject(projectDir);

	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v1'], {
		cwd: projectDir,
	});

	fs.rmSync(path.join(projectDir, 'src', 'migrations', 'generated', 'verify.ts'));
	expect(() =>
		runCli('node', [entryPath, 'migrate', 'verify', '--all'], {
			cwd: projectDir,
		}),
	).toThrow(/Generated verify script is missing[\s\S]*v1[\s\S]*migrate scaffold --from-migration-version v1[\s\S]*migrate doctor --all/);

	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v1'], {
		cwd: projectDir,
	});
	fs.rmSync(path.join(projectDir, 'src', 'migrations', 'generated', 'fuzz.ts'));
	expect(() =>
		runCli(
			'node',
			[entryPath, 'migrate', 'fuzz', '--all', '--iterations', '1', '--seed', '0'],
			{ cwd: projectDir },
		),
	).toThrow(/Generated fuzz script is missing[\s\S]*v1[\s\S]*migrate scaffold --from-migration-version v1[\s\S]*migrate doctor --all/);
});
});
