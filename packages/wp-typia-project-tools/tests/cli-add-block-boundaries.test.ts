import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const runtimeRoot = path.join(import.meta.dir, '..', 'src', 'runtime', 'add');

test('cli-add-block delegates config generation and legacy validator repair to focused modules', () => {
	const addBlockSource = fs.readFileSync(
		path.join(runtimeRoot, 'cli-add-block.ts'),
		'utf8',
	);
	const configSource = fs.readFileSync(
		path.join(runtimeRoot, 'cli-add-block-config.ts'),
		'utf8',
	);
	const legacyValidatorSource = fs.readFileSync(
		path.join(runtimeRoot, 'cli-add-block-legacy-validator.ts'),
		'utf8',
	);

	expect(addBlockSource).toContain('from "./cli-add-block-config.js"');
	expect(addBlockSource).toContain(
		'from "./cli-add-block-legacy-validator.js"',
	);
	expect(addBlockSource).not.toContain('function buildConfigEntries(');
	expect(addBlockSource).not.toContain('function buildMigrationBlocks(');
	expect(addBlockSource).not.toContain(
		'function ensureBlockConfigCanAddRestManifests(',
	);
	expect(addBlockSource).not.toContain(
		'function upgradeLegacyCompoundValidatorSource(',
	);
	expect(configSource).toContain('export function buildConfigEntries(');
	expect(configSource).toContain('export function buildMigrationBlocks(');
	expect(legacyValidatorSource).toContain(
		'export function ensureBlockConfigCanAddRestManifests(',
	);
	expect(legacyValidatorSource).toContain(
		'export async function ensureCompoundWorkspaceSupportFiles(',
	);

	const temporaryScaffoldStart = addBlockSource.indexOf(
		'const scaffoldResult = await scaffoldProject({',
	);
	const temporaryScaffoldEnd = addBlockSource.indexOf(
		'await assertAddBlockSupportsExternalLayerOutputs({',
		temporaryScaffoldStart,
	);
	expect(temporaryScaffoldStart).toBeGreaterThanOrEqual(0);
	expect(temporaryScaffoldEnd).toBeGreaterThan(temporaryScaffoldStart);
	expect(
		addBlockSource.slice(temporaryScaffoldStart, temporaryScaffoldEnd),
	).toContain('seedCompilerArtifacts: false');
	expect(addBlockSource).toContain(
		'fileSources: await snapshotWorkspaceFiles([\n\t\t\t\tpackageJsonPath,',
	);
	expect(addBlockSource).toContain(
		'from "./cli-add-block-package-json.js"',
	);
});
