import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  cleanupMigrationTempRoot,
  createCurrentProjectFiles,
  createMigrationTempRoot,
  createVersionedMigrationProject,
  writeFile,
  writeJson,
} from './helpers/migration-test-harness.js';
import { parseMigrationArgs } from '../src/runtime/index.js';
import { initProjectMigrations } from '../src/runtime/migrations.js';
import {
  loadMigrationProject,
  parseMigrationConfig,
} from '../src/runtime/migration-project.js';

describe('wp-typia migrate config parsing', () => {
  const tempRoot = createMigrationTempRoot('wp-typia-migration-config-');

  afterAll(() => {
    cleanupMigrationTempRoot(tempRoot);
  });

test('migration arg parser ignores standalone script separators', () => {
	const parsed = parseMigrationArgs(['snapshot', '--', '--migration-version', 'v1']);
	expect(parsed.command).toBe('snapshot');
	expect(parsed.flags.migrationVersion).toBe('v1');
});

test('migration arg parser accepts plan and wizard commands', () => {
	const plan = parseMigrationArgs(['plan', '--from-migration-version', 'v1', '--to-migration-version', 'v2']);
	expect(plan.command).toBe('plan');
	expect(plan.flags.fromMigrationVersion).toBe('v1');
	expect(plan.flags.toMigrationVersion).toBe('v2');

	const wizard = parseMigrationArgs(['wizard']);
	expect(wizard.command).toBe('wizard');
	expect(wizard.flags.toMigrationVersion).toBe('current');
});

test('migrations runtime keeps command parsing and maintenance helpers in dedicated modules', () => {
	const runtimeDir = path.join(import.meta.dir, '../src/runtime/migration');
	const migrationsSource = fs.readFileSync(
		path.join(runtimeDir, 'migrations.ts'),
		'utf8',
	);
	const migrationMaintenanceSource = fs.readFileSync(
		path.join(runtimeDir, 'migration-maintenance.ts'),
		'utf8',
	);

	expect(migrationsSource).toContain('./migration-command-surface.js');
	expect(migrationsSource).toContain('./migration-maintenance.js');
	expect(migrationMaintenanceSource).toContain('./migration-maintenance-verify.js');
	expect(migrationMaintenanceSource).toContain('./migration-maintenance-fixtures.js');
});

test('migration arg parser rejects legacy semver-era flag names with reset guidance', () => {
	for (const argv of [
		['init', '--current-version', '1.0.0'],
		['snapshot', '--version', '1.0.0'],
		['plan', '--from', '1.0.0'],
		['plan', '--from-migration-version', 'v1', '--to', '1.0.0'],
	]) {
		expect(() => parseMigrationArgs(argv)).toThrow(
			/Legacy migration flag[\s\S]*@wp-typia migrate init --current-migration-version v1|rerun `wp-typia migrate init --current-migration-version v1`/,
		);
	}
});

test('loadMigrationProject rejects legacy semver config keys with reset guidance', () => {
	const projectDir = path.join(tempRoot, 'legacy-semver-config-project');
	createCurrentProjectFiles(projectDir);
	writeFile(
		path.join(projectDir, 'src', 'migrations', 'config.ts'),
		`export const migrationConfig = {\n\tblockName: "create-block/migration-smoke",\n\tcurrentVersion: "1.0.0",\n\tsupportedVersions: ["1.0.0"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
	);

	expect(() => loadMigrationProject(projectDir)).toThrow(
		/Detected legacy config keys `currentVersion` \/ `supportedVersions`[\s\S]*rerun `wp-typia migrate init --current-migration-version v1`/,
	);
});

test('loadMigrationProject ignores commented legacy semver config key names', () => {
	const projectDir = path.join(tempRoot, 'commented-legacy-semver-config-project');
	createCurrentProjectFiles(projectDir);
	writeFile(
		path.join(projectDir, 'src', 'migrations', 'config.ts'),
		`// renamed from currentVersion / supportedVersions during the vN reset\nexport const migrationConfig = {\n\tblockName: "create-block/migration-smoke",\n\tcurrentMigrationVersion: "v1",\n\tsupportedMigrationVersions: ["v1"],\n\tsnapshotDir: "src/migrations/versions",\n\tcomment: "legacy currentVersion should not trip reset guidance",\n} as const;\n\nexport default migrationConfig;\n`,
	);

	expect(() => loadMigrationProject(projectDir)).not.toThrow();
});

test('loadMigrationProject ignores commented migration version label properties', () => {
	const projectDir = path.join(tempRoot, 'commented-migration-version-project');
	createCurrentProjectFiles(projectDir);
	writeFile(
		path.join(projectDir, 'src', 'migrations', 'config.ts'),
		`// currentMigrationVersion: "v99"\n// supportedMigrationVersions: ["v99"]\nexport const migrationConfig = {\n\tblockName: "create-block/migration-smoke",\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n\tnote: "currentMigrationVersion: 'v99' should not be parsed",\n} as const;\n\nexport default migrationConfig;\n`,
	);

	const state = loadMigrationProject(projectDir);
	expect(state.config.currentMigrationVersion).toBe('v3');
	expect(state.config.supportedMigrationVersions).toEqual(['v1', 'v3']);
});

test('loadMigrationProject ignores legacy-looking nested config helper objects', () => {
	const projectDir = path.join(tempRoot, 'nested-legacy-helper-config-project');
	createCurrentProjectFiles(projectDir);
	writeFile(
		path.join(projectDir, 'src', 'migrations', 'config.ts'),
		`export const migrationConfig = {\n\thelperMetadata: {\n\t\tcurrentVersion: "legacy-note",\n\t\tsupportedVersions: ["legacy-note"],\n\t},\n\tblockName: "create-block/migration-smoke",\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
	);

	const state = loadMigrationProject(projectDir);
	expect(state.config.currentMigrationVersion).toBe('v3');
	expect(state.config.supportedMigrationVersions).toEqual(['v1', 'v3']);
});

test('loadMigrationProject treats explicit empty block arrays as a valid zero-target workspace', () => {
	const projectDir = path.join(tempRoot, 'empty-workspace-migrations');
	fs.mkdirSync(path.join(projectDir, 'src', 'migrations'), { recursive: true });
	writeJson(path.join(projectDir, 'package.json'), {
		name: 'empty-workspace-migrations',
		version: '0.0.0',
	});
	writeFile(
		path.join(projectDir, 'src', 'migrations', 'config.ts'),
		`export const migrationConfig = {
\tcurrentMigrationVersion: 'v1',
\tsupportedMigrationVersions: [ 'v1' ],
\tsnapshotDir: 'src/migrations/versions',
\tblocks: [],
} as const;

export default migrationConfig;
`,
	);

	const state = loadMigrationProject(projectDir, { allowSyncTypes: false });

	expect(state.blocks).toEqual([]);
	expect(state.currentManifest.attributes).toEqual({});
	expect(state.currentBlockJson).toEqual({});
});

test('parseMigrationConfig rejects malformed explicit block arrays', () => {
	expect(() =>
		parseMigrationConfig(`export const migrationConfig = {
\tcurrentMigrationVersion: 'v1',
\tsupportedMigrationVersions: [ 'v1' ],
\tsnapshotDir: 'src/migrations/versions',
\tblocks: [
\t\t{ key: 'broken' },
\t],
} as const;

export default migrationConfig;
`),
	).toThrow(/Migration config defines `blocks`, but the array entries could not be parsed/);
});

test('loadMigrationProject rejects legacy semver-named migration artifacts with reset guidance', () => {
	const projectDir = path.join(tempRoot, 'legacy-semver-artifacts-project');
	createVersionedMigrationProject(projectDir);
	writeJson(path.join(projectDir, 'src', 'migrations', 'versions', '1.0.0', 'block.json'), {
		apiVersion: 3,
		attributes: {
			content: { default: 'Legacy', type: 'string' },
		},
		name: 'create-block/migration-smoke',
		title: 'Migration Smoke',
	});

	expect(() => loadMigrationProject(projectDir)).toThrow(
		/Detected a legacy semver-based migration workspace[\s\S]*1\.0\.0[\s\S]*rerun `wp-typia migrate init --current-migration-version v1`/,
	);
});

test('migrate init rejects legacy semver workspaces before rewriting the config', () => {
	const projectDir = path.join(tempRoot, 'legacy-semver-init-project');
	createCurrentProjectFiles(projectDir);
	const legacyConfigPath = path.join(projectDir, 'src', 'migrations', 'config.ts');
	const legacyConfigSource = `export const migrationConfig = {\n\tblockName: "create-block/migration-smoke",\n\tcurrentVersion: "1.0.0",\n\tsupportedVersions: ["1.0.0"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`;
	writeFile(legacyConfigPath, legacyConfigSource);

	expect(() => initProjectMigrations(projectDir, 'v1')).toThrow(
		/Detected a legacy semver-based migration workspace[\s\S]*rerun `wp-typia migrate init --current-migration-version v1`/,
	);
	expect(fs.readFileSync(legacyConfigPath, 'utf8')).toBe(legacyConfigSource);
});
});
