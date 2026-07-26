import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  cleanupMigrationTempRoot,
  createBrokenOnlyMultiBlockProject,
  createCurrentProjectFiles,
  createCurrentSingleBlockScaffoldProject,
  createLegacyConfiguredCurrentPreferredSameNameMixedSingleBlockProject,
  createLegacyConfiguredMixedSingleBlockProject,
  createLegacyConfiguredSameNameMixedSingleBlockProject,
  createMalformedFallbackSingleBlockProject,
  createMalformedPreferredSingleBlockProject,
  createMigrationTempRoot,
  createMixedSingleBlockProject,
  createRetrofitMultiBlockProject,
  createRetrofitMultiBlockProjectWithBrokenCandidate,
  createSameNameMixedSingleBlockProject,
  createSingleBlockProjectWithBrokenMultiBlockCandidate,
  entryPath,
  runCli,
  typecheckMigrationProject,
  writeJson,
} from './helpers/migration-test-harness.js';
import { formatMigrationHelpText } from '../src/runtime/migration-command-surface.js';
import { loadMigrationProject } from '../src/runtime/migration-project.js';

const GENERATED_PROJECT_TYPECHECK_TIMEOUT_MS = 300_000;

describe('wp-typia migrate init', () => {
  const tempRoot = createMigrationTempRoot('wp-typia-migration-init-');

  afterAll(() => {
    cleanupMigrationTempRoot(tempRoot);
  });

test('bun entry bootstraps migrations and sanitizes snapshot metadata', () => {
	const projectDir = path.join(tempRoot, 'init-project');
	createCurrentProjectFiles(projectDir);

	runCli('bun', [entryPath, 'migrate', 'init', '--current-migration-version', 'v1'], {
		cwd: projectDir,
	});

	expect(fs.existsSync(path.join(projectDir, 'src', 'migrations', 'config.ts'))).toBe(true);
	expect(fs.existsSync(path.join(projectDir, 'src', 'migrations', 'generated', 'registry.ts'))).toBe(true);
	expect(fs.existsSync(path.join(projectDir, 'typia-migration-registry.php'))).toBe(true);

	const snapshotBlock = JSON.parse(
		fs.readFileSync(
			path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'block.json'),
			'utf8',
		),
	);
	expect(snapshotBlock.editorScript).toBeUndefined();
});

test('migrate init keeps deprecated generation compatible when current manifest sourceType is missing', () => {
	const projectDir = path.join(tempRoot, 'init-project-missing-source-type');
	createCurrentProjectFiles(projectDir);

	const manifestPath = path.join(projectDir, 'typia.manifest.json');
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	delete manifest.sourceType;
	fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`, 'utf8');

	runCli('bun', [entryPath, 'migrate', 'init', '--current-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const deprecatedSource = fs.readFileSync(
		path.join(projectDir, 'src', 'migrations', 'generated', 'deprecated.ts'),
		'utf8',
	);
	expect(deprecatedSource).toContain(
		'export const deprecated: BlockDeprecationList<Record<string, unknown>> = [];',
	);
	expect(deprecatedSource).not.toContain('import type { MigrationAttributes }');
	typecheckMigrationProject(projectDir, {
		checkInputs: ['src/migrations/generated/deprecated.ts'],
		formatInputs: [
			'src/save.tsx',
			'src/types.ts',
			'src/validators.ts',
			'src/migrations/versions/**/save.tsx',
		],
	});
}, { timeout: GENERATED_PROJECT_TYPECHECK_TIMEOUT_MS });

test('migrate init auto-detects current single-block scaffold layouts', () => {
	const projectDir = path.join(tempRoot, 'init-current-single-block-project');
	createCurrentSingleBlockScaffoldProject(projectDir);

	const output = runCli('bun', [entryPath, 'migrate', 'init', '--current-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const configSource = fs.readFileSync(path.join(projectDir, 'src', 'migrations', 'config.ts'), 'utf8');
	expect(configSource).toContain("blockName: 'create-block/current-scaffold'");
	expect(configSource).not.toContain('blocks: [');
	expect(fs.existsSync(path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'block.json'))).toBe(true);
	expect(fs.existsSync(path.join(projectDir, 'src', 'migrations', 'generated', 'registry.ts'))).toBe(true);
	expect(output).toContain('Detected single-block migration retrofit: create-block/current-scaffold');
	expect(output).toContain('Wrote src/migrations/config.ts');
});

test('migrate init auto-detects multi-block retrofit layouts including hidden compound children', () => {
	const projectDir = path.join(tempRoot, 'init-multi-block-project');
	createRetrofitMultiBlockProject(projectDir);

	const output = runCli('bun', [entryPath, 'migrate', 'init', '--current-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const configSource = fs.readFileSync(path.join(projectDir, 'src', 'migrations', 'config.ts'), 'utf8');
	expect(configSource).toContain('blocks: [');
	expect(configSource).toContain("key: 'multi-parent'");
	expect(configSource).toContain("key: 'multi-parent-item'");
	expect(configSource).toContain("blockJsonFile: 'src/blocks/multi-parent/block.json'");
	expect(configSource).toContain("blockJsonFile: 'src/blocks/multi-parent-item/block.json'");
	expect(
		fs.existsSync(path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'multi-parent', 'block.json')),
	).toBe(true);
	expect(
		fs.existsSync(
			path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'multi-parent-item', 'block.json'),
		),
	).toBe(true);
	expect(output).toContain('Detected multi-block migration retrofit (2 targets):');
	expect(output).toContain('create-block/multi-parent');
	expect(output).toContain('create-block/multi-parent-item');
});

test('migrate init ignores malformed multi-block candidates when valid block targets remain', () => {
	const projectDir = path.join(tempRoot, 'init-multi-block-project-with-broken-candidate');
	createRetrofitMultiBlockProjectWithBrokenCandidate(projectDir);

	const output = runCli('bun', [entryPath, 'migrate', 'init', '--current-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const configSource = fs.readFileSync(path.join(projectDir, 'src', 'migrations', 'config.ts'), 'utf8');
	expect(configSource).toContain("key: 'multi-parent'");
	expect(configSource).toContain("key: 'multi-parent-item'");
	expect(configSource).not.toContain("key: 'broken-item'");
	expect(output).toContain('Detected multi-block migration retrofit (2 targets):');
});

test('migrate init prefers the legacy single-block fallback when only the root manifest exists', () => {
	const projectDir = path.join(tempRoot, 'init-mixed-single-block-project');
	createMixedSingleBlockProject(projectDir);

	runCli('bun', [entryPath, 'migrate', 'init', '--current-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const configSource = fs.readFileSync(path.join(projectDir, 'src', 'migrations', 'config.ts'), 'utf8');
	expect(configSource).toContain("blockName: 'create-block/legacy-root-layout'");
	const snapshotManifest = JSON.parse(
		fs.readFileSync(path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'typia.manifest.json'), 'utf8'),
	);
	expect(snapshotManifest.attributes.content.typia.defaultValue).toBe('Legacy');
});

test('migrate init keeps generated registry imports compatible with legacy-root retrofit layouts', () => {
	const projectDir = path.join(tempRoot, 'init-mixed-single-block-project-registry-import');
	createMixedSingleBlockProject(projectDir);

	runCli('bun', [entryPath, 'migrate', 'init', '--current-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const registrySource = fs.readFileSync(
		path.join(projectDir, 'src', 'migrations', 'generated', 'registry.ts'),
		'utf8',
  );
  expect(registrySource).toContain(
    "import rawCurrentManifest from '../../../typia.manifest.json' with { type: 'json' };",
  );
	expect(registrySource).toContain(
		'currentManifest: parseManifestDocument<ManifestDocument>(rawCurrentManifest),',
	);
});

test('migrate init prefers src manifest wrappers for legacy-root retrofit layouts when present', () => {
	const projectDir = path.join(tempRoot, 'init-mixed-single-block-project-wrapper-import');
	createMixedSingleBlockProject(projectDir);
	fs.writeFileSync(
		path.join(projectDir, 'src', 'manifest-document.ts'),
		[
			"import rawCurrentManifest from '../typia.manifest.json';",
			'',
			'export default rawCurrentManifest;',
			'',
		].join('\n'),
		'utf8',
	);

	runCli('bun', [entryPath, 'migrate', 'init', '--current-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const registrySource = fs.readFileSync(
		path.join(projectDir, 'src', 'migrations', 'generated', 'registry.ts'),
		'utf8',
	);
	expect(registrySource).toContain(
		"import rawCurrentManifest from '../../manifest-document';",
	);
	expect(registrySource).toContain(
		'currentManifest: parseManifestDocument<ManifestDocument>(rawCurrentManifest),',
	);
});

test('migrate init falls back to single-block detection when all multi-block candidates are malformed', () => {
	const projectDir = path.join(tempRoot, 'init-single-block-with-broken-multi-block-candidate');
	createSingleBlockProjectWithBrokenMultiBlockCandidate(projectDir);

	const output = runCli('bun', [entryPath, 'migrate', 'init', '--current-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const configSource = fs.readFileSync(path.join(projectDir, 'src', 'migrations', 'config.ts'), 'utf8');
	expect(configSource).toContain("blockName: 'create-block/current-scaffold'");
	expect(configSource).not.toContain('blocks: [');
	expect(output).toContain('Detected single-block migration retrofit: create-block/current-scaffold');
});

test('migrate init reports actionable guidance when only malformed multi-block candidates exist', () => {
	const projectDir = path.join(tempRoot, 'init-broken-only-multi-block-project');
	createBrokenOnlyMultiBlockProject(projectDir);

	expect(() =>
		runCli('bun', [entryPath, 'migrate', 'init', '--current-migration-version', 'v1'], {
			cwd: projectDir,
		}),
	).toThrow(
		/Unable to auto-detect a supported migration retrofit layout\.[\s\S]*src\/blocks\/broken-item\/block\.json[\s\S]*could not be parsed[\s\S]*src\/migrations\/config\.ts/,
	);
});

test('migrate init ignores malformed non-selected single-block layouts', () => {
	const projectDir = path.join(tempRoot, 'init-malformed-fallback-single-block-project');
	createMalformedFallbackSingleBlockProject(projectDir);

	runCli('bun', [entryPath, 'migrate', 'init', '--current-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const configSource = fs.readFileSync(path.join(projectDir, 'src', 'migrations', 'config.ts'), 'utf8');
	expect(configSource).toContain("blockName: 'create-block/current-scaffold'");
});

test('migrate init falls back from malformed preferred single-block layouts', () => {
	const projectDir = path.join(tempRoot, 'init-malformed-preferred-single-block-project');
	createMalformedPreferredSingleBlockProject(projectDir);

	runCli('bun', [entryPath, 'migrate', 'init', '--current-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const configSource = fs.readFileSync(path.join(projectDir, 'src', 'migrations', 'config.ts'), 'utf8');
	expect(configSource).toContain("blockName: 'create-block/legacy-root-layout'");
	const snapshotManifest = JSON.parse(
		fs.readFileSync(path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'typia.manifest.json'), 'utf8'),
	);
	expect(snapshotManifest.attributes.content.typia.defaultValue).toBe('Legacy');
});

test('legacy migration configs stay bound to the configured single-block layout', () => {
	const projectDir = path.join(tempRoot, 'legacy-config-mixed-single-block-project');
	createLegacyConfiguredMixedSingleBlockProject(projectDir);

	const state = loadMigrationProject(projectDir);
	expect(state.blocks[0]?.blockJsonFile).toBe('block.json');
	expect(state.blocks[0]?.blockName).toBe('create-block/legacy-root-layout');
	expect(state.currentManifest.attributes?.content?.typia.defaultValue).toBe('Legacy');
});

test('legacy migration configs keep the root layout when mixed single-block paths share a block name', () => {
	const projectDir = path.join(tempRoot, 'legacy-config-same-name-mixed-single-block-project');
	createLegacyConfiguredSameNameMixedSingleBlockProject(projectDir);

	const state = loadMigrationProject(projectDir);
	expect(state.blocks[0]?.blockJsonFile).toBe('block.json');
	expect(state.blocks[0]?.manifestFile).toBe('typia.manifest.json');
	expect(state.currentManifest.attributes?.content?.typia.defaultValue).toBe('Legacy');
});

test('legacy migration configs keep the current scaffold layout when same-name mixed layouts both expose manifests', () => {
	const projectDir = path.join(tempRoot, 'legacy-config-current-preferred-same-name-mixed-single-block-project');
	createLegacyConfiguredCurrentPreferredSameNameMixedSingleBlockProject(projectDir);

	const state = loadMigrationProject(projectDir);
	expect(state.blocks[0]?.blockJsonFile).toBe('src/block.json');
	expect(state.blocks[0]?.manifestFile).toBe('src/typia.manifest.json');
	expect(state.currentManifest.attributes?.content?.typia.defaultValue).toBe('Hello');
});

test('migrate init keeps manifest-priority when mixed single-block layouts share a block name', () => {
	const projectDir = path.join(tempRoot, 'init-same-name-mixed-single-block-project');
	createSameNameMixedSingleBlockProject(projectDir);

	runCli('bun', [entryPath, 'migrate', 'init', '--current-migration-version', 'v1'], {
		cwd: projectDir,
	});

	const configSource = fs.readFileSync(path.join(projectDir, 'src', 'migrations', 'config.ts'), 'utf8');
	expect(configSource).toContain("blockName: 'create-block/current-scaffold'");
	const snapshotManifest = JSON.parse(
		fs.readFileSync(path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'typia.manifest.json'), 'utf8'),
	);
	expect(snapshotManifest.attributes.content.typia.defaultValue).toBe('Legacy');
});

test('migrate init fails with actionable guidance when no supported retrofit layout is found', () => {
	const projectDir = path.join(tempRoot, 'init-unsupported-layout-project');
	writeJson(path.join(projectDir, 'package.json'), {
		name: 'unsupported-migration-layout',
		packageManager: 'bun@1.3.11',
		private: true,
		scripts: {},
		type: 'module',
		version: '0.1.0',
	});

	expect(() =>
		runCli('bun', [entryPath, 'migrate', 'init', '--current-migration-version', 'v1'], {
			cwd: projectDir,
		}),
	).toThrow(/Unable to auto-detect a supported migration retrofit layout[\s\S]*src\/migrations\/config\.ts/);
});

test('migrate help text explains retrofit auto-detection, read-only planning, and --all workspace scope', () => {
	expect(formatMigrationHelpText()).toMatch(
		/`migrate init` auto-detects supported single-block and `src\/blocks\/\*` multi-block layouts[\s\S]*`migrate init` only retrofits migration support into projects that already match those layouts\.[\s\S]*A broader project-level `wp-typia init` path remains future work\.[\s\S]*Migration versions use strict schema labels like `v1`, `v2`, and `v3`[\s\S]*`migrate wizard` is TTY-only[\s\S]*`migrate plan` and `migrate wizard` are read-only previews[\s\S]*--all runs across every configured legacy migration version and every configured block target\.[\s\S]*Existing fixture files are preserved and reported as skipped unless you pass `--force`\.[\s\S]*Use `migrate fixtures --force` as the explicit refresh path/,
	);
});
});
