import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  addOfficialWorkspaceInventory,
  cleanupMigrationTempRoot,
  createAmbiguousRenameProject,
  createMigrationTempRoot,
  createMultiBlockMigrationProject,
  createVersionedMigrationProject,
  entryPath,
  runCli,
} from './helpers/migration-test-harness.js';
import { doctorProjectMigrations } from '../src/runtime/migrations.js';

describe('wp-typia migrate doctor', () => {
  const tempRoot = createMigrationTempRoot('wp-typia-migration-doctor-');

  afterAll(() => {
    cleanupMigrationTempRoot(tempRoot);
  });

test('doctor tolerates block targets that appear only in later versions', () => {
	const projectDir = path.join(tempRoot, 'multi-block-late-child-project');
	createMultiBlockMigrationProject(projectDir, { includeLegacyChild: false });

	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const output = runCli('node', [entryPath, 'migrate', 'doctor', '--all'], {
		cwd: projectDir,
	});
	expect(output).toContain('PASS Snapshot create-block/multi-parent-item @ v1: Not present for this version');
	expect(output).toContain('PASS Migration doctor summary:');
});

test('doctor fails when a current multi-block snapshot root is missing after introduction', () => {
	const projectDir = path.join(tempRoot, 'multi-block-missing-current-snapshot-project');
	createMultiBlockMigrationProject(projectDir, { includeLegacyChild: true });

	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v1'], {
		cwd: projectDir,
	});
	fs.rmSync(
		path.join(projectDir, 'src', 'migrations', 'versions', 'v3', 'multi-parent-item'),
		{ force: true, recursive: true },
	);

	expect(() =>
		runCli('node', [entryPath, 'migrate', 'doctor', '--all'], {
			cwd: projectDir,
		}),
	).toThrow(/Migration doctor failed/);
});

test('doctor passes on a healthy migration workspace', () => {
	const projectDir = path.join(tempRoot, 'doctor-success-project');
	createVersionedMigrationProject(projectDir);

	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const output = runCli('node', [entryPath, 'migrate', 'doctor', '--all'], {
		cwd: projectDir,
	});
	expect(output).toContain('PASS Migration config:');
	expect(output).toContain('PASS Fixture coverage v1:');
	expect(output).toContain('PASS Risk summary v1:');
	expect(output).toContain('PASS Migration doctor summary:');
});

test('doctor passes when official workspace inventory and migration targets align', () => {
	const projectDir = path.join(tempRoot, 'doctor-workspace-target-pass-project');
	createMultiBlockMigrationProject(projectDir, { includeLegacyChild: true });
	addOfficialWorkspaceInventory(projectDir, ['multi-parent', 'multi-parent-item']);

	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const result = doctorProjectMigrations(projectDir, {
		all: true,
		renderLine() {},
	});

	expect(
		result.checks.find((check) => check.label === 'Workspace migration targets')?.status,
	).toBe('pass');
});

test('doctor fails when workspace inventory blocks are missing from migration config', () => {
	const projectDir = path.join(tempRoot, 'doctor-workspace-target-missing-project');
	createMultiBlockMigrationProject(projectDir, { includeLegacyChild: true });
	addOfficialWorkspaceInventory(projectDir, ['multi-parent', 'multi-parent-item']);

	const migrationConfigPath = path.join(projectDir, 'src', 'migrations', 'config.ts');
	const migrationConfigSource = fs.readFileSync(migrationConfigPath, 'utf8');
	fs.writeFileSync(
		migrationConfigPath,
		migrationConfigSource.replace(
			'blockName: "create-block/multi-parent-item"',
			'blockName: "create-block/multi-parent-item-renamed"',
		),
		'utf8',
	);

	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const lines: string[] = [];
	expect(() =>
		doctorProjectMigrations(projectDir, {
			all: true,
			renderLine: (line) => lines.push(line),
		}),
	).toThrow(/Migration doctor failed/);
	expect(lines.join('\n')).toContain('Workspace migration targets');
	expect(lines.join('\n')).toContain('Missing from migration config: create-block/multi-parent-item');
	expect(lines.join('\n')).toContain(
		'Not present in scripts/block-config.ts: create-block/multi-parent-item-renamed',
	);
});

test('doctor fails when migration config keeps workspace-removed block targets', () => {
	const projectDir = path.join(tempRoot, 'doctor-workspace-target-stale-project');
	createMultiBlockMigrationProject(projectDir, { includeLegacyChild: true });
	addOfficialWorkspaceInventory(projectDir, ['multi-parent']);

	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const lines: string[] = [];
	expect(() =>
		doctorProjectMigrations(projectDir, {
			all: true,
			renderLine: (line) => lines.push(line),
		}),
	).toThrow(/Migration doctor failed/);
	expect(lines.join('\n')).toContain('Workspace migration targets');
	expect(lines.join('\n')).toContain(
		'Not present in scripts/block-config.ts: create-block/multi-parent-item',
	);
});

test('doctor fails when a snapshot file is missing', () => {
	const projectDir = path.join(tempRoot, 'doctor-missing-snapshot-project');
	createVersionedMigrationProject(projectDir);

	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v1'], {
		cwd: projectDir,
	});
	fs.rmSync(path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'save.tsx'));

	expect(() =>
		runCli('node', [entryPath, 'migrate', 'doctor', '--all'], {
			cwd: projectDir,
		}),
	).toThrow(/Migration doctor failed/);
});

test('doctor fails when a fixture file is missing', () => {
	const projectDir = path.join(tempRoot, 'doctor-missing-fixture-project');
	createVersionedMigrationProject(projectDir);

	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v1'], {
		cwd: projectDir,
	});
	fs.rmSync(path.join(projectDir, 'src', 'migrations', 'fixtures', 'v1-to-v3.json'));

	expect(() =>
		runCli('node', [entryPath, 'migrate', 'doctor', '--all'], {
			cwd: projectDir,
		}),
	).toThrow(/Migration doctor failed/);
});

test('doctor fails when unresolved migration markers remain', () => {
	const projectDir = path.join(tempRoot, 'doctor-unresolved-project');
	createAmbiguousRenameProject(projectDir);

	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v1'], {
		cwd: projectDir,
	});

	expect(() =>
		runCli('node', [entryPath, 'migrate', 'doctor', '--all'], {
			cwd: projectDir,
		}),
	).toThrow(/Migration doctor failed/);
});

test('doctor fails when generated deprecated files drift from discovered edges', () => {
	const projectDir = path.join(tempRoot, 'doctor-drift-project');
	createVersionedMigrationProject(projectDir);

	runCli('node', [entryPath, 'migrate', 'scaffold', '--from-migration-version', 'v1'], {
		cwd: projectDir,
	});
	fs.appendFileSync(
		path.join(projectDir, 'src', 'migrations', 'generated', 'deprecated.ts'),
		'\n// drift\n',
		'utf8',
	);

	expect(() =>
		runCli('node', [entryPath, 'migrate', 'doctor', '--all'], {
			cwd: projectDir,
		}),
	).toThrow(/Migration doctor failed/);
});
});
