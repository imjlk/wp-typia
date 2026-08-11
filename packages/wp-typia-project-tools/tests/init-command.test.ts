import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { applyInitPlan } from '../src/runtime/cli-init-apply.js';
import { runInitCommand } from '../src/runtime/cli-init.js';
import { getInitPlan } from '../src/runtime/cli-init-plan.js';
import {
  buildOfficialWorkspaceLintScriptChanges,
  buildProjectPackageJsonSource,
  buildScriptChanges,
} from '../src/runtime/cli/cli-init-package-json.js';
import {
  buildPreviousManagedWordPressTtscLintConfigSource,
  buildWordPressTtscLintConfigSource,
  getPreviousTtscLintCompatSource,
  getTtscLintCompatSource,
  hasWordPressTtscLintConfig,
  resolveRetrofitTextDomain,
} from '../src/runtime/cli/cli-init-templates.js';
import {
  findManagedWordPressSourcePaths,
  findManagedWordPressSourcePathsAsync,
  getTtscJavaScriptCoverageIssue,
  hasWordPressTtscLintConfigSource,
} from '../src/runtime/shared/ttsc-lint-config.js';
import {
  buildInitPlanChangeSummary,
  buildInitPlanNextSteps,
  buildRetrofitPlanSummary,
  hasTtscLintCompatPlanChanges,
} from '../src/runtime/cli-init-plan-presentation.js';
import {
  DEFAULT_WORDPRESS_BLOCKS_TYPES_VERSION,
  DEFAULT_WORDPRESS_BLOCKS_VERSION,
  getPackageVersions,
} from '../src/runtime/package-versions.js';
import {
  cleanupScaffoldTempRoot,
  createScaffoldTempRoot,
  scaffoldOfficialWorkspace,
  wpTypiaPackageManifest,
} from './helpers/scaffold-test-harness.js';

function scaffoldRetrofitProject(
	projectDir: string,
	options: {
		blockName?: string;
		interfaceName: string;
		layout?: 'root' | 'src';
		packageJson?: Record<string, unknown>;
	} = {
    interfaceName: 'RetrofitInitAttributes',
  },
): void {
  const blockName =
		options.blockName ?? `create-block/${path.basename(projectDir)}`;
  const layout = options.layout ?? 'src';
  const blockJsonPath =
		layout === 'src'
      ? path.join(projectDir, 'src', 'block.json')
      : path.join(projectDir, 'block.json');

  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
  fs.writeFileSync(
		path.join(projectDir, 'package.json'),
		`${JSON.stringify(
			{
				name: path.basename(projectDir),
				private: true,
				scripts: {},
				...(options.packageJson ?? {}),
			},
			null,
			2,
		)}\n`,
		'utf8',
	);
  fs.writeFileSync(
		blockJsonPath,
		`${JSON.stringify(
			{
				name: blockName,
			},
			null,
			2,
		)}\n`,
		'utf8',
	);
  fs.writeFileSync(
    path.join(projectDir, 'src', 'types.ts'),
    `export interface ${options.interfaceName} {}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(projectDir, 'src', 'save.tsx'),
    'export default function Save() { return null; }\n',
    'utf8',
  );
}

describe('wp-typia init', () => {
	const tempRoot = createScaffoldTempRoot('wp-typia-init-plan-');

	afterAll(() => {
		cleanupScaffoldTempRoot(tempRoot);
	});

	test('preserves package manifest indentation and line endings', () => {
		const packageJson = {
			name: 'format-preserving-project',
			scripts: { check: 'npm run check:code' },
		};
		const currentSource =
			'{\r\n\t"name": "format-preserving-project",\r\n\t"scripts": {}\r\n}\r\n';

		expect(
			buildProjectPackageJsonSource(packageJson, currentSource),
		).toBe(
			'{\r\n\t"name": "format-preserving-project",\r\n\t"scripts": {\r\n\t\t"check": "npm run check:code"\r\n\t}\r\n}\r\n',
		);
	});

	test('detects single-block retrofit candidates and plans the minimum sync surface', () => {
		const projectDir = path.join(tempRoot, 'retrofit-single-block');
		scaffoldRetrofitProject(projectDir, {
			interfaceName: 'RetrofitSingleBlockAttributes',
		});

		const plan = getInitPlan(projectDir);

		expect(plan.status).toBe('preview');
		expect(plan.commandMode).toBe('preview-only');
		expect(plan.detectedLayout.kind).toBe('single-block');
		expect(plan.detectedLayout.blockNames).toEqual([
			'create-block/retrofit-single-block',
		]);
		expect(plan.blockTargets).toEqual([
			expect.objectContaining({
				attributeTypeName: 'RetrofitSingleBlockAttributes',
				blockJsonFile: 'src/block.json',
				manifestFile: 'src/typia.manifest.json',
				slug: 'retrofit-single-block',
				typesFile: 'src/types.ts',
			}),
		]);
		expect(
			plan.plannedFiles.map(({ action, path: filePath }) => ({
				action,
				path: filePath,
			})),
		).toEqual([
			{ action: 'add', path: 'scripts/apply-ttsc-lint-compat.mjs' },
				{ action: 'add', path: 'lint.config.mts' },
			{ action: 'add', path: 'scripts/block-config.ts' },
			{ action: 'add', path: 'scripts/sync-types-to-block-json.ts' },
			{ action: 'add', path: 'scripts/sync-project.ts' },
		]);
		expect(plan.packageChanges.scripts.map((script) => script.name)).toEqual([
			'postinstall',
			'sync',
			'sync-types',
				'check:code',
				'check',
		]);
		expect(
			plan.packageChanges.addDevDependencies.some(
				(dependency) => dependency.name === '@wp-typia/block-runtime',
			),
		).toBe(true);
		expect(
			plan.packageChanges.addDevDependencies.find(
				(dependency) => dependency.name === '@types/wordpress__blocks',
			),
		).toEqual({
			action: 'add',
			name: '@types/wordpress__blocks',
			requiredValue: DEFAULT_WORDPRESS_BLOCKS_TYPES_VERSION,
		});
		expect(
			plan.packageChanges.addDevDependencies.find(
				(dependency) => dependency.name === '@wordpress/blocks',
			),
		).toEqual({
			action: 'add',
			name: '@wordpress/blocks',
			requiredValue: DEFAULT_WORDPRESS_BLOCKS_VERSION,
		});
		expect(plan.generatedArtifacts).toContain('src/typia.manifest.json');
		expect(plan.nextSteps[0]).toContain('wp-typia init --apply');
		expect(plan.nextSteps).toContain(
			`npx --yes wp-typia@${wpTypiaPackageManifest.version} doctor`,
		);
		expect(plan.notes).toContain(
			'Preview only: `wp-typia init` does not write files yet.',
		);
		expect(
			plan.notes.some((note) =>
				note.includes('snapshotted and rolled back automatically'),
			),
		).toBe(true);
	});

	test('facade routes preview and apply through the split init modules', async () => {
		const projectDir = path.join(tempRoot, 'retrofit-facade-routing');
		scaffoldRetrofitProject(projectDir, {
			interfaceName: 'RetrofitFacadeRoutingAttributes',
		});

		const previewPlan = await runInitCommand({ projectDir });
		const appliedPlan = await runInitCommand({
			apply: true,
			projectDir,
		});

		expect(previewPlan.status).toBe('preview');
		expect(previewPlan.commandMode).toBe('preview-only');
		expect(appliedPlan.status).toBe('applied');
		expect(appliedPlan.commandMode).toBe('apply');
		expect(appliedPlan.nextSteps[0]).toContain(
			'Install or reinstall project dependencies',
		);
		expect(appliedPlan.nextSteps).not.toContain(
			'Re-run `wp-typia init --apply` to write the planned package.json changes and helper files automatically.',
		);
		expect(
			fs.existsSync(path.join(projectDir, 'scripts', 'sync-project.ts')),
		).toBe(true);
	});

	test('honors package-manager overrides and reports helper-file updates in the preview plan', () => {
		const projectDir = path.join(tempRoot, 'retrofit-package-manager-override');
		scaffoldRetrofitProject(projectDir, {
			interfaceName: 'RetrofitPackageManagerAttributes',
		});
		fs.mkdirSync(path.join(projectDir, 'scripts'), { recursive: true });
		fs.writeFileSync(
			path.join(projectDir, 'scripts', 'block-config.ts'),
			'export const BLOCKS = [];\n',
			'utf8',
		);

		const plan = getInitPlan(projectDir, {
			packageManager: 'pnpm',
		});

		expect(plan.packageManager).toBe('pnpm');
		expect(
			plan.plannedFiles.find((filePlan) => filePlan.path === 'scripts/block-config.ts'),
		).toEqual(
			expect.objectContaining({
				action: 'update',
			}),
		);
		expect(
				plan.packageChanges.scripts.find((script) => script.name === 'check:code')
					?.requiredValue,
			).toBe('pnpm run sync --check && ttsc check --noEmit');
		expect(plan.nextSteps).toContain(
			`pnpm dlx wp-typia@${wpTypiaPackageManifest.version} doctor`,
		);
	});

	test('persists explicit npm overrides over conflicting packageManager metadata', async () => {
		const projectDir = path.join(tempRoot, 'retrofit-explicit-npm');
		scaffoldRetrofitProject(projectDir, {
			interfaceName: 'RetrofitExplicitNpmAttributes',
			packageJson: {
				packageManager: 'bun@1.3.11',
			},
		});

		const previewPlan = getInitPlan(projectDir, {
			packageManager: 'npm',
		});
		const appliedPlan = await applyInitPlan(projectDir, {
			packageManager: 'npm',
		});
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'),
		) as {
			packageManager?: string;
		};

		expect(previewPlan.packageChanges.packageManagerField).toEqual(
			expect.objectContaining({
				action: 'update',
				currentValue: 'bun@1.3.11',
				requiredValue: 'npm@11.6.1',
			}),
		);
		expect(appliedPlan.packageManager).toBe('npm');
		expect(packageJson.packageManager).toBe('npm@11.6.1');
	});

	test('applies retrofit helper files and preserves legacy root block paths', async () => {
		const projectDir = path.join(tempRoot, 'retrofit-legacy-root');
		scaffoldRetrofitProject(projectDir, {
			interfaceName: 'RetrofitLegacyRootAttributes',
			layout: 'root',
		});

		const plan = await applyInitPlan(projectDir, {
			packageManager: 'pnpm',
		});
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'),
		) as {
			devDependencies?: Record<string, string>;
			packageManager?: string;
			scripts?: Record<string, string>;
		};
		const blockConfigSource = fs.readFileSync(
			path.join(projectDir, 'scripts', 'block-config.ts'),
			'utf8',
		);

		expect(plan.status).toBe('applied');
		expect(plan.commandMode).toBe('apply');
		expect(plan.packageManager).toBe('pnpm');
		expect(plan.notes).toContain(
			'Apply mode writes package.json, generated helper files, and any package-manager configuration updates with rollback-on-failure protection.',
		);
		expect(packageJson.packageManager).toBe('pnpm@8.3.1');
		expect(packageJson.devDependencies?.['@types/wordpress__blocks']).toBe(
			DEFAULT_WORDPRESS_BLOCKS_TYPES_VERSION,
		);
		expect(packageJson.devDependencies?.['@wordpress/blocks']).toBe(
			DEFAULT_WORDPRESS_BLOCKS_VERSION,
		);
		expect(packageJson.scripts?.sync).toBe('ttsx scripts/sync-project.ts');
		expect(packageJson.scripts?.postinstall).toBe(
			'node scripts/apply-ttsc-lint-compat.mjs',
		);
			expect(packageJson.scripts?.['check:code']).toBe(
				'pnpm run sync --check && ttsc check --noEmit',
		);
		expect(blockConfigSource).toContain("blockJsonFile: 'block.json'");
		expect(blockConfigSource).toContain(
			"manifestFile: 'typia.manifest.json'",
		);
		expect(
			fs.existsSync(
				path.join(projectDir, 'scripts', 'apply-ttsc-lint-compat.mjs'),
			),
		).toBe(true);
		expect(
			fs.existsSync(path.join(projectDir, 'scripts', 'sync-project.ts')),
		).toBe(true);
		expect(
			fs.existsSync(
				path.join(projectDir, 'scripts', 'sync-types-to-block-json.ts'),
			),
		).toBe(true);
		expect(
				fs.readFileSync(path.join(projectDir, 'lint.config.mts'), 'utf8'),
		).toContain("allowedTextDomain: 'retrofit-legacy-root'");
	});

	test('replaces an empty retrofit postinstall script without a shell prefix', async () => {
		const projectDir = path.join(tempRoot, 'retrofit-empty-postinstall');
		scaffoldRetrofitProject(projectDir, {
			interfaceName: 'RetrofitEmptyPostinstallAttributes',
			packageJson: {
				scripts: {
					postinstall: '',
				},
			},
		});

		const preview = getInitPlan(projectDir);
		const postinstallChange = preview.packageChanges.scripts.find(
			(script) => script.name === 'postinstall',
		);
		const applied = await applyInitPlan(projectDir);
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'),
		) as {
			scripts?: Record<string, string>;
		};

		expect(postinstallChange).toEqual({
			action: 'update',
			currentValue: '',
			name: 'postinstall',
			requiredValue: 'node scripts/apply-ttsc-lint-compat.mjs',
		});
		expect(applied.status).toBe('applied');
		expect(packageJson.scripts?.postinstall).toBe(
			'node scripts/apply-ttsc-lint-compat.mjs',
		);
	});

	test("switches detected Yarn Plug'n'Play retrofits to mutable node_modules without replacing other Yarn settings", async () => {
		const projectDir = path.join(tempRoot, 'retrofit-yarn-pnp');
		scaffoldRetrofitProject(projectDir, {
			interfaceName: 'RetrofitYarnPnpAttributes',
		});
		fs.writeFileSync(path.join(projectDir, '.pnp.cjs'), 'module.exports = {};\n');
		fs.writeFileSync(
			path.join(projectDir, '.yarnrc.yml'),
			[
				'yarnPath: .yarn/releases/yarn-3.2.4.cjs',
				'nodeLinker: pnp # keep the rest of this configuration',
				'checksumBehavior: update',
				'',
			].join('\n'),
			'utf8',
		);

		const preview = getInitPlan(projectDir);
		const applied = await applyInitPlan(projectDir);
		const yarnRcSource = fs.readFileSync(
			path.join(projectDir, '.yarnrc.yml'),
			'utf8',
		);

		expect(preview.packageManager).toBe('yarn');
		expect(preview.plannedFiles).toContainEqual({
			action: 'update',
			path: '.yarnrc.yml',
			purpose:
				"Switch Yarn Plug'n'Play to node-modules so the generated @ttsc/lint compatibility hook only writes mutable dependency files.",
		});
		expect(applied.status).toBe('applied');
		expect(yarnRcSource).toBe(
			[
				'yarnPath: .yarn/releases/yarn-3.2.4.cjs',
				'nodeLinker: node-modules # keep the rest of this configuration',
				'checksumBehavior: update',
				'',
			].join('\n'),
		);
		expect(fs.existsSync(path.join(projectDir, '.pnp.cjs'))).toBe(true);
	});

	test('switches an implicit Yarn Berry PnP retrofit to node-modules before its first install', async () => {
		const projectDir = path.join(tempRoot, 'retrofit-yarn-berry-default-pnp');
		scaffoldRetrofitProject(projectDir, {
			interfaceName: 'RetrofitYarnBerryDefaultPnpAttributes',
			packageJson: {
				packageManager: 'yarn@3.2.4',
			},
		});
		fs.writeFileSync(
			path.join(projectDir, '.yarnrc.yml'),
			'yarnPath: .yarn/releases/yarn-3.2.4.cjs\nchecksumBehavior: update\n',
			'utf8',
		);

		const preview = getInitPlan(projectDir);
		const applied = await applyInitPlan(projectDir);

		expect(preview.packageManager).toBe('yarn');
		expect(preview.plannedFiles).toContainEqual({
			action: 'update',
			path: '.yarnrc.yml',
			purpose:
				"Switch Yarn Plug'n'Play to node-modules so the generated @ttsc/lint compatibility hook only writes mutable dependency files.",
		});
		expect(applied.status).toBe('applied');
		expect(
			fs.readFileSync(path.join(projectDir, '.yarnrc.yml'), 'utf8'),
		).toBe(
			'yarnPath: .yarn/releases/yarn-3.2.4.cjs\nchecksumBehavior: update\nnodeLinker: node-modules\n',
		);
	});

	test('switches a retrofit that init upgrades to Yarn Berry before its first install', async () => {
		const projectDir = path.join(tempRoot, 'retrofit-yarn-lock-upgrade');
		scaffoldRetrofitProject(projectDir, {
			interfaceName: 'RetrofitYarnLockUpgradeAttributes',
		});
		fs.writeFileSync(path.join(projectDir, 'yarn.lock'), '# yarn lockfile v1\n', 'utf8');

		const preview = getInitPlan(projectDir);
		const applied = await applyInitPlan(projectDir);
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'),
		) as { packageManager?: string };

		expect(preview.packageManager).toBe('yarn');
		expect(preview.packageChanges.packageManagerField).toEqual({
			action: 'add',
			requiredValue: 'yarn@3.2.4',
		});
		expect(preview.plannedFiles).toContainEqual({
			action: 'add',
			path: '.yarnrc.yml',
			purpose:
				"Switch Yarn Plug'n'Play to node-modules so the generated @ttsc/lint compatibility hook only writes mutable dependency files.",
		});
		expect(applied.status).toBe('applied');
		expect(packageJson.packageManager).toBe('yarn@3.2.4');
		expect(
			fs.readFileSync(path.join(projectDir, '.yarnrc.yml'), 'utf8'),
		).toBe('nodeLinker: node-modules\n');
	});

	test('removes the Typia 12 plugin and migrates its Webpack import during retrofit', async () => {
		const projectDir = path.join(tempRoot, 'retrofit-typia-12-plugin');
		scaffoldRetrofitProject(projectDir, {
			interfaceName: 'RetrofitTypia12Attributes',
			packageJson: {
				devDependencies: {
					'@typia/unplugin': '^12.0.1',
				},
				scripts: {
					postinstall: 'node scripts/existing-postinstall.mjs',
				},
			},
		});
		fs.writeFileSync(
			path.join(projectDir, 'webpack.config.js'),
			"module.exports = () => import('@typia/unplugin/webpack');\n",
			'utf8',
		);

		const preview = getInitPlan(projectDir);
		const applied = await applyInitPlan(projectDir);
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'),
		) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
			scripts?: Record<string, string>;
		};
		const webpackSource = fs.readFileSync(
			path.join(projectDir, 'webpack.config.js'),
			'utf8',
		);

		expect(preview.notes).toContain(
			'The obsolete `@typia/unplugin` dependency will be removed while `@ttsc/unplugin` is installed.',
		);
		expect(preview.plannedFiles).toContainEqual(
			expect.objectContaining({
				action: 'update',
				path: 'webpack.config.js',
			}),
		);
		expect(applied.status).toBe('applied');
		expect(packageJson.dependencies?.['@typia/unplugin']).toBeUndefined();
		expect(packageJson.devDependencies?.['@typia/unplugin']).toBeUndefined();
		expect(packageJson.devDependencies?.['@ttsc/unplugin']).toBeDefined();
		expect(packageJson.scripts?.postinstall).toBe(
			'node scripts/existing-postinstall.mjs && node scripts/apply-ttsc-lint-compat.mjs',
		);
		expect(webpackSource).toContain('@ttsc/unplugin/webpack');
		expect(webpackSource).not.toContain('@typia/unplugin/webpack');
	});

	test('upgrades an existing project to the canonical TS7 toolchain', async () => {
		const projectDir = path.join(tempRoot, 'retrofit-ts7-toolchain');
		scaffoldRetrofitProject(projectDir, {
			interfaceName: 'RetrofitTs7ToolchainAttributes',
			packageJson: {
				devDependencies: {
					'@ttsc/lint': '0.22.0',
					'@ttsc/unplugin': '^0.22.0',
					ttsc: '^0.22.0',
					typescript: '^6.0.2',
					typia: '^12.2.0',
				},
			},
		});

		const preview = getInitPlan(projectDir);
		const applied = await applyInitPlan(projectDir);
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'),
		) as { devDependencies?: Record<string, string> };

		expect(preview.packageChanges.addDevDependencies).toEqual(
			expect.arrayContaining([
				{
					action: 'update',
					currentValue: '0.22.0',
					name: '@ttsc/lint',
					requiredValue: '0.26.2',
				},
				{
					action: 'update',
					currentValue: '^0.22.0',
					name: '@ttsc/unplugin',
					requiredValue: '^0.26.2',
				},
				{
					action: 'update',
					currentValue: '^0.22.0',
					name: 'ttsc',
					requiredValue: '^0.26.2',
				},
				{
					action: 'update',
					currentValue: '^6.0.2',
					name: 'typescript',
					requiredValue: '^7.0.2',
				},
				{
					action: 'update',
					currentValue: '^12.2.0',
					name: 'typia',
					requiredValue: '^13.2.0',
				},
			]),
		);
		expect(applied.status).toBe('applied');
		expect(packageJson.devDependencies).toMatchObject({
			'@ttsc/lint': '0.26.2',
			'@ttsc/unplugin': '^0.26.2',
			ttsc: '^0.26.2',
			typescript: '^7.0.2',
			typia: '^13.2.0',
		});
	});

	test('plan presentation helpers keep summary, changes, and next steps stable', () => {
		const changes = buildInitPlanChangeSummary(
			{
				generatedArtifacts: ['src/typia.manifest.json'],
				packageChanges: {
					addDevDependencies: [
						{
							action: 'add',
							name: '@wp-typia/block-runtime',
							requiredValue: '1.2.3',
						},
					],
					packageManagerField: {
						action: 'update',
						currentValue: 'bun@1.3.11',
						requiredValue: 'npm@11.6.1',
					},
					scripts: [
						{
							action: 'add',
							name: 'sync',
							requiredValue: 'ttsx scripts/sync-project.ts',
						},
					],
				},
				plannedFiles: [
					{
						action: 'add',
						path: 'scripts/sync-project.ts',
						purpose: 'Provide one shared sync entrypoint.',
					},
				],
			},
			{
				includeGeneratedArtifacts: true,
			},
		);
		const nextSteps = buildInitPlanNextSteps({
			commandMode: 'preview-only',
			compatibilitySurfaceChanged: false,
			dependencyChanges: [],
			hasPlannedChanges: false,
			layoutKind: 'single-block',
			packageManager: 'npm',
		});

		expect(changes).toEqual([
			'devDependency add @wp-typia/block-runtime -> 1.2.3',
			'packageManager update -> npm@11.6.1',
			'script add sync -> ttsx scripts/sync-project.ts',
			'file add scripts/sync-project.ts (Provide one shared sync entrypoint.)',
			'generated artifact src/typia.manifest.json',
		]);
		expect(nextSteps).toEqual([
			'npm run sync',
			`npx --yes wp-typia@${wpTypiaPackageManifest.version} doctor`,
			`Optional migration bootstrap: npx --yes wp-typia@${wpTypiaPackageManifest.version} migrate init --current-migration-version v1`,
		]);
		const compatibilityNextSteps = buildInitPlanNextSteps({
			commandMode: 'apply',
			compatibilitySurfaceChanged: true,
			dependencyChanges: [],
			hasPlannedChanges: true,
			layoutKind: 'single-block',
			packageManager: 'npm',
		});
		expect(compatibilityNextSteps).toContain(
			'node scripts/apply-ttsc-lint-compat.mjs',
		);
		expect(
			hasTtscLintCompatPlanChanges({
				packageChanges: {
					addDevDependencies: [],
					scripts: [
						{
							action: 'add',
							name: 'postinstall',
							requiredValue:
								'node scripts/apply-ttsc-lint-compat.mjs',
						},
					],
				},
				plannedFiles: [],
			}),
		).toBe(true);
		expect(
			hasTtscLintCompatPlanChanges({
				packageChanges: {
					addDevDependencies: [],
					scripts: [
						{
							action: 'add',
							name: 'postinstall',
							requiredValue: 'node scripts/unrelated.mjs',
						},
					],
				},
				plannedFiles: [],
			}),
		).toBe(false);
		expect(
			buildRetrofitPlanSummary({
				commandMode: 'preview-only',
				status: 'preview',
			}),
		).toBe(
			'This command previews the minimum wp-typia adoption layer for the current project without rewriting it into a full scaffold.',
		);
		expect(
			buildRetrofitPlanSummary({
				commandMode: 'apply',
				status: 'already-initialized',
			}),
		).toBe(
			'This project already exposes the minimum wp-typia retrofit surface. No files were changed.',
		);
	});

	test('rolls back package.json changes when apply mode cannot finish writing helper files', async () => {
		const projectDir = path.join(tempRoot, 'retrofit-rollback');
		scaffoldRetrofitProject(projectDir, {
			interfaceName: 'RetrofitRollbackAttributes',
		});
		const scriptsDir = path.join(projectDir, 'scripts');
		const packageJsonPath = path.join(projectDir, 'package.json');
		const originalPackageJsonSource = fs.readFileSync(packageJsonPath, 'utf8');

		fs.mkdirSync(scriptsDir, { recursive: true });
		fs.chmodSync(scriptsDir, 0o555);

		try {
			await expect(applyInitPlan(projectDir)).rejects.toThrow(
				/restored the previous package\.json\/helper-file\/package-manager snapshot/i,
			);
			expect(fs.readFileSync(packageJsonPath, 'utf8')).toBe(
				originalPackageJsonSource,
			);
			expect(
				fs.existsSync(path.join(projectDir, 'scripts', 'block-config.ts')),
			).toBe(false);
		} finally {
			fs.chmodSync(scriptsDir, 0o755);
		}
	});

	test('applies a retrofit plan when package.json does not exist yet', async () => {
		const projectDir = path.join(tempRoot, 'retrofit-without-package-json');
		scaffoldRetrofitProject(projectDir, {
			interfaceName: 'RetrofitWithoutPackageJsonAttributes',
		});
		fs.rmSync(path.join(projectDir, 'package.json'));

		const preview = getInitPlan(projectDir);
		expect(preview.status).toBe('preview');

		const applied = await applyInitPlan(projectDir);
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'),
		) as { name?: string };

		expect(applied.status).toBe('applied');
		expect(packageJson.name).toBe('retrofit-without-package-json');
	});

	test('resolves official workspace package-manager guidance from the workspace root', async () => {
		const projectDir = path.join(tempRoot, 'workspace-init-package-manager');
		await scaffoldOfficialWorkspace(projectDir);
		const packageJsonPath = path.join(projectDir, 'package.json');
		const packageJson = JSON.parse(
			fs.readFileSync(packageJsonPath, 'utf8'),
		) as Record<string, unknown>;
		fs.writeFileSync(
			packageJsonPath,
			`${JSON.stringify(
				{
					...packageJson,
					packageManager: 'bun@1.3.11',
				},
				null,
				2,
			)}\n`,
			'utf8',
		);

		const plan = getInitPlan(path.join(projectDir, 'src'));

		expect(plan.projectDir).toBe(projectDir);
		expect(plan.packageManager).toBe('bun');
		expect(plan.nextSteps).toContain('bun run sync');
		expect(plan.nextSteps).toContain(
			`bunx wp-typia@${wpTypiaPackageManifest.version} doctor`,
		);

		await applyInitPlan(path.join(projectDir, 'src'));
		const currentPlan = getInitPlan(path.join(projectDir, 'src'));
		expect(currentPlan.status).toBe('already-initialized');
		expect(currentPlan.nextSteps[0]).toContain(
			'wp-typia add <kind> <name>',
		);
	});

	test('removes the managed lint:ts lane without mistaking a sub-lane for it', () => {
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'pnpm run lint:ts:ci && pnpm run lint:css',
					'lint:ts': 'ttsc --noEmit',
				},
			},
			'pnpm',
		);

		expect(changes).toContainEqual({
			action: 'remove',
			currentValue: 'ttsc --noEmit',
			name: 'lint:ts',
		});
		expect(changes).toContainEqual({
			action: 'update',
			currentValue: 'pnpm run lint:ts:ci && pnpm run lint:css',
			name: 'lint',
			requiredValue: 'pnpm run lint:ts:ci',
		});
	});

	test('preserves project-owned checks while adding the combined code gate once', () => {
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					check: 'npm run check:php && npm run check:custom',
				},
			},
			'npm',
		);

		expect(changes).toContainEqual({
			action: 'update',
			currentValue: 'npm run check:php && npm run check:custom',
			name: 'check',
			requiredValue:
				'npm run check:code && npm run check:php && npm run check:custom',
		});

		const alreadyManaged = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					check: 'npm run check:code && npm run check:php',
				},
			},
			'npm',
		);
		expect(alreadyManaged.some((change) => change.name === 'check')).toBe(
			false,
		);
	});

	test('places the compatibility helper before terminating postinstall commands', () => {
		for (const [currentValue, requiredValue] of [
			[
				'exit 0',
				'node scripts/apply-ttsc-lint-compat.mjs && exit 0',
			],
			[
				'setup; exit 0',
				'node scripts/apply-ttsc-lint-compat.mjs && (setup; exit 0)',
			],
			[
				'env MODE=upgrade builtin exit 0',
				'node scripts/apply-ttsc-lint-compat.mjs && env MODE=upgrade builtin exit 0',
			],
			[
				'exec node setup.js',
				'node scripts/apply-ttsc-lint-compat.mjs && exec node setup.js',
			],
			[
				'setup; command exec node finalize.js',
				'node scripts/apply-ttsc-lint-compat.mjs && (setup; command exec node finalize.js)',
			],
		] as const) {
			const changes = buildOfficialWorkspaceLintScriptChanges(
				{ scripts: { postinstall: currentValue } },
				'npm',
			);
			expect(changes).toContainEqual({
				action: 'update',
				currentValue,
				name: 'postinstall',
				requiredValue,
			});
			expect(
				buildOfficialWorkspaceLintScriptChanges(
					{ scripts: { postinstall: requiredValue } },
					'npm',
				).some((change) => change.name === 'postinstall'),
			).toBe(false);
		}

		for (const redirectionOnlyExec of [
			'exec 2>/dev/null && node setup.js',
			'exec &> setup.log && node setup.js',
			'exec &>> setup.log && node setup.js',
			'exec <<< "input" && node setup.js',
		]) {
			expect(
				buildOfficialWorkspaceLintScriptChanges(
					{ scripts: { postinstall: redirectionOnlyExec } },
					'npm',
				),
			).toContainEqual({
				action: 'update',
				currentValue: redirectionOnlyExec,
				name: 'postinstall',
				requiredValue: `${redirectionOnlyExec} && node scripts/apply-ttsc-lint-compat.mjs`,
			});
		}
	});

	test('normalizes supported managed runner forms without dropping project commands', () => {
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					check:
						'env CI=1 pnpm --silent run check:code && pnpm --silent check:style && echo report',
					'check:style': 'stylelint "src/**/*.scss"',
				},
			},
			'npm',
		);

		expect(changes).toContainEqual({
			action: 'update',
			currentValue:
				'env CI=1 pnpm --silent run check:code && pnpm --silent check:style && echo report',
			name: 'check',
			requiredValue:
				'env CI=1 npm run check:code && npm run check:style && echo report',
		});
	});

	test('runs managed checks before terminal project-owned aggregates', () => {
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					check: 'setup; exit 0',
					'check:code': 'eslint src',
				},
			},
			'npm',
		);

		expect(changes).toContainEqual({
			action: 'update',
			currentValue: 'eslint src',
			name: 'check:code',
			requiredValue:
				'npm run sync -- --check && ttsc check --noEmit && eslint src',
		});
		expect(changes).toContainEqual({
			action: 'update',
			currentValue: 'setup; exit 0',
			name: 'check',
			requiredValue: 'npm run check:code && (setup; exit 0)',
		});
	});

	test('migrates legacy managed style and format lanes into the new aggregate', () => {
		const legacyFormatCheck =
			'prettier --check --no-error-on-unmatched-pattern "*.{cjs,js,mjs}" "scripts/**/*.{cjs,js,mjs}"';
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint:
						'npm run lint:ts && npm run lint:js && npm run lint:css',
					'lint:ts': 'ttsc --noEmit',
					'lint:js': 'node scripts/run-wp-scripts-lint-js-compat.mjs',
					'lint:css': 'wp-scripts lint-style --allow-empty-input',
					'format:check': legacyFormatCheck,
				},
			},
			'npm',
		);

		expect(changes).toContainEqual({
			action: 'add',
			name: 'check:style',
			requiredValue: 'wp-scripts lint-style --allow-empty-input',
		});
		expect(changes).toContainEqual({
			action: 'add',
			name: 'check:format',
			requiredValue: legacyFormatCheck,
		});
		expect(changes).toContainEqual({
			action: 'add',
			name: 'check',
			requiredValue:
				'npm run check:code && npm run check:style && npm run check:format',
		});
		for (const name of [
			'lint',
			'lint:ts',
			'lint:js',
			'lint:css',
			'format:check',
		]) {
			expect(changes).toContainEqual(
				expect.objectContaining({ action: 'remove', name }),
			);
		}
	});

	test('merges legacy checks into occupied destination lanes', () => {
		const legacyFormatCheck =
			'prettier --check --no-error-on-unmatched-pattern "*.{cjs,js,mjs}" "scripts/**/*.{cjs,js,mjs}"';
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					check: 'npm run check:style && npm run check:format',
					'check:format': 'eslint scripts',
					'check:style': 'eslint styles',
					'format:check': legacyFormatCheck,
					'lint:css': 'wp-scripts lint-style --allow-empty-input',
				},
			},
			'npm',
		);

		expect(changes).toContainEqual({
			action: 'update',
			currentValue: 'eslint styles',
			name: 'check:style',
			requiredValue:
				'wp-scripts lint-style --allow-empty-input && eslint styles',
		});
		expect(changes).toContainEqual({
			action: 'update',
			currentValue: 'eslint scripts',
			name: 'check:format',
			requiredValue: `${legacyFormatCheck} && eslint scripts`,
		});
		expect(changes).toContainEqual(
			expect.objectContaining({ action: 'remove', name: 'lint:css' }),
		);
		expect(changes).toContainEqual(
			expect.objectContaining({ action: 'remove', name: 'format:check' }),
		);
	});

	test('does not copy forwarding aliases into their destination lanes', () => {
		const missingDestinations = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					'format:check': 'npm run check:format',
					'lint:css': 'npm run check:style',
				},
			},
			'npm',
		);
		expect(
			missingDestinations.some(
				(change) =>
					change.name === 'check:style' ||
					change.name === 'check:format',
			),
		).toBe(false);
		expect(missingDestinations).toContainEqual({
			action: 'add',
			name: 'check',
			requiredValue: 'npm run check:code',
		});
		expect(
			missingDestinations.some(
				(change) =>
					change.name === 'lint:css' ||
					change.name === 'format:check',
			),
		).toBe(false);

		const occupiedDestinations = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					'check:format': 'prettier --check .',
					'check:style': 'wp-scripts lint-style',
					'format:check': 'npm run check:format',
					'lint:css': 'npm run check:style',
				},
			},
			'npm',
		);
		expect(
			occupiedDestinations.some(
				(change) =>
					change.name === 'check:style' ||
					change.name === 'check:format',
			),
		).toBe(false);
	});

	test('does not copy transitive forwarding aliases into destination lanes', () => {
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					'check:format': 'prettier --check .',
					'check:style': 'stylelint src',
					'format:check': 'npm run formatting',
					formatting: 'npm run check:format',
					'lint:css': 'npm run style',
					style: 'npm run check:style',
				},
			},
			'npm',
		);

		expect(
			changes.some(
				(change) =>
					change.name === 'check:style' ||
					change.name === 'check:format',
			),
		).toBe(false);
	});

	test('preserves managed lint aliases referenced by retained scripts', () => {
		const legacyFormatCheck =
			'prettier --check --no-error-on-unmatched-pattern "*.{cjs,js,mjs}" "scripts/**/*.{cjs,js,mjs}"';
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint:
						'npm run lint:ts && npm run lint:js && npm run lint:css',
					'lint:ts': 'ttsc --noEmit',
					'lint:js':
						'node scripts/run-wp-scripts-lint-js-compat.mjs',
					'lint:css': 'wp-scripts lint-style --allow-empty-input',
					'format:check': legacyFormatCheck,
					'ci:style': 'npm run lint:css',
					'release:check': 'npm run format:check',
				},
			},
			'npm',
		);

		expect(changes).toContainEqual(
			expect.objectContaining({ action: 'remove', name: 'lint' }),
		);
		expect(
			changes.some((change) => change.name === 'lint:css'),
		).toBe(false);
		expect(
			changes.some((change) => change.name === 'format:check'),
		).toBe(false);

		const transitivelyReferenced = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'npm run lint:ts && npm run lint:css',
					'lint:ts': 'ttsc --noEmit',
					'lint:css': 'wp-scripts lint-style --allow-empty-input',
					'ci:all': 'npm run lint',
				},
			},
			'npm',
		);
		for (const name of ['lint', 'lint:ts', 'lint:css']) {
			expect(
				transitivelyReferenced.some((change) => change.name === name),
			).toBe(false);
		}
	});

	test('removes only the legacy managed retrofit typecheck alias', () => {
		const changes = buildScriptChanges(
			{
				scripts: {
					typecheck: 'npm run sync -- --check && ttsc --noEmit',
				},
			},
			'npm',
		);
		expect(changes).toContainEqual({
			action: 'remove',
			currentValue: 'npm run sync -- --check && ttsc --noEmit',
			name: 'typecheck',
		});

		const projectOwned = buildScriptChanges(
			{
				scripts: {
					typecheck: 'npm run sync -- --check && ttsc --noEmit && npm test',
				},
			},
			'npm',
		);
		expect(projectOwned.some((change) => change.name === 'typecheck')).toBe(
			false,
		);

		const referenced = buildScriptChanges(
			{
				scripts: {
					ci: 'npm run typecheck',
					typecheck: 'npm run sync -- --check && ttsc --noEmit',
				},
			},
			'npm',
		);
		expect(referenced).toContainEqual({
			action: 'update',
			currentValue: 'npm run sync -- --check && ttsc --noEmit',
			name: 'typecheck',
			requiredValue: 'npm run check:code',
		});

		const crossRunnerReferenced = buildScriptChanges(
			{
				scripts: {
					ci: 'npm run typecheck',
					typecheck: 'bun run sync --check && ttsc --noEmit',
				},
			},
			'npm',
		);
		expect(crossRunnerReferenced).toContainEqual({
			action: 'update',
			currentValue: 'bun run sync --check && ttsc --noEmit',
			name: 'typecheck',
			requiredValue: 'npm run check:code',
		});
		expect(
			buildScriptChanges(
				{
					scripts: {
						typecheck: 'bun run sync --check && ttsc --noEmit',
					},
				},
				'npm',
			),
		).toContainEqual({
			action: 'remove',
			currentValue: 'bun run sync --check && ttsc --noEmit',
			name: 'typecheck',
		});
	});

	test('preserves retrofit check lanes while adding the managed code gate', () => {
		const changes = buildScriptChanges(
			{
				scripts: {
					check: 'vitest run',
					'check:code': 'eslint src',
				},
			},
			'npm',
		);

		expect(changes).toContainEqual({
			action: 'update',
			currentValue: 'eslint src',
			name: 'check:code',
			requiredValue:
				'npm run sync -- --check && ttsc check --noEmit && eslint src',
		});
		expect(changes).toContainEqual({
			action: 'update',
			currentValue: 'vitest run',
			name: 'check',
			requiredValue: 'npm run check:code && vitest run',
		});
	});

	test('normalizes the retrofit check runner for the selected package manager', () => {
		const changes = buildScriptChanges(
			{
				scripts: {
					check: 'bun run check:code && vitest run',
					'check:code':
						'bun run sync --check && ttsc check --noEmit',
				},
			},
			'npm',
		);

		expect(changes).toContainEqual({
			action: 'update',
			currentValue: 'bun run check:code && vitest run',
			name: 'check',
			requiredValue: 'npm run check:code && vitest run',
		});
	});

	test('carries managed legacy style and format lanes into retrofit check', () => {
		const changes = buildScriptChanges(
			{
				scripts: {
					check: 'bun run check:code',
					'check:code':
						'bun run sync --check && ttsc check --noEmit',
					'format:check':
						'prettier --check --no-error-on-unmatched-pattern "*.{cjs,js,mjs}" "scripts/**/*.{cjs,js,mjs}"',
					'lint:css': 'wp-scripts lint-style --allow-empty-input',
				},
			},
			'npm',
		);

		expect(changes).toContainEqual({
			action: 'add',
			name: 'check:style',
			requiredValue: 'wp-scripts lint-style --allow-empty-input',
		});
		expect(changes).toContainEqual({
			action: 'add',
			name: 'check:format',
			requiredValue:
				'prettier --check --no-error-on-unmatched-pattern "*.{cjs,js,mjs}" "scripts/**/*.{cjs,js,mjs}"',
		});
		expect(changes).toContainEqual({
			action: 'update',
			currentValue: 'bun run check:code',
			name: 'check',
			requiredValue:
				'npm run check:code && npm run check:style && npm run check:format',
		});
		expect(changes).toContainEqual(
			expect.objectContaining({ action: 'remove', name: 'lint:css' }),
		);
		expect(changes).toContainEqual(
			expect.objectContaining({ action: 'remove', name: 'format:check' }),
		);
	});

	test('repairs swallowed retrofit check invocations', () => {
		const changes = buildScriptChanges(
			{
				scripts: {
					check: 'npm run check:code || true',
					'check:code': 'ttsc check --noEmit',
				},
			},
			'npm',
		);

		expect(changes).toContainEqual({
			action: 'update',
			currentValue: 'ttsc check --noEmit',
			name: 'check:code',
			requiredValue:
				'npm run sync -- --check && ttsc check --noEmit',
		});
		expect(changes).toContainEqual({
			action: 'update',
			currentValue: 'npm run check:code || true',
			name: 'check',
			requiredValue:
				'npm run check:code && (npm run check:code || true)',
		});
	});

	test('removes legacy managed lint aliases with supported flags', () => {
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'npm run lint:css',
					'lint:ts': 'ttsc --pretty false --noEmit',
				},
			},
			'npm',
		);

		expect(changes).toContainEqual(
			expect.objectContaining({ action: 'remove', name: 'lint:ts' }),
		);
		expect(changes).toContainEqual(
			expect.objectContaining({ action: 'remove', name: 'lint' }),
		);

		const quotedFlagChanges = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'npm run lint:ts',
					'lint:ts': `ttsc '--noEmit'`,
				},
			},
			'npm',
		);
		expect(
			quotedFlagChanges.some((change) => change.name === 'lint:ts'),
		).toBe(true);
	});

	test('preserves project-owned lint work when removing managed aliases', () => {
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'npm run lint:custom && npm run lint:ts && npm run lint:css',
					'lint:ts': 'ttsc --noEmit',
				},
			},
			'npm',
		);

		expect(changes).toContainEqual({
			action: 'update',
			currentValue:
				'npm run lint:custom && npm run lint:ts && npm run lint:css',
			name: 'lint',
			requiredValue: 'npm run lint:custom',
		});
	});

	test('preserves custom work appended to a legacy lint:ts lane', () => {
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'npm run lint:ts',
					'lint:ts': 'ttsc --noEmit && eslint src',
				},
			},
			'npm',
		);

		expect(changes.some((change) => change.name === 'lint')).toBe(false);
		expect(changes.some((change) => change.name === 'lint:ts')).toBe(false);
	});

	test('preserves managed aliases used by retained legacy lanes', () => {
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'npm run lint:ts',
					'lint:ts': 'ttsc --noEmit && npm run lint:css',
					'lint:css': 'wp-scripts lint-style --allow-empty-input',
				},
			},
			'npm',
		);

		expect(changes.some((change) => change.name === 'lint')).toBe(false);
		expect(changes.some((change) => change.name === 'lint:ts')).toBe(false);
		expect(changes.some((change) => change.name === 'lint:css')).toBe(false);

		const transitiveAliasChanges =
			buildOfficialWorkspaceLintScriptChanges(
				{
					scripts: {
						lint: 'npm run lint:ts',
						'lint:ts': 'ttsc --noEmit && npm run style',
						style: 'npm run lint:css',
						'lint:css':
							'wp-scripts lint-style --allow-empty-input',
					},
				},
				'npm',
			);
		expect(
			transitiveAliasChanges.some(
				(change) => change.name === 'lint:css',
			),
		).toBe(false);
	});

	test('preserves arguments on customized legacy aggregate invocations', () => {
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint:
						'npm run lint:ts && npm run lint:css -- --custom-formatter',
					'lint:ts': 'ttsc --noEmit',
					'lint:css': 'wp-scripts lint-style --allow-empty-input',
				},
			},
			'npm',
		);

		expect(changes).toContainEqual({
			action: 'update',
			currentValue:
				'npm run lint:ts && npm run lint:css -- --custom-formatter',
			name: 'lint',
			requiredValue: 'npm run lint:css -- --custom-formatter',
		});
		expect(changes.some((change) => change.name === 'lint:css')).toBe(false);
	});

	test('isolates project-owned fallback chains from managed checks', () => {
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					check: 'echo optional || true',
					'check:code': 'eslint src || true',
				},
			},
			'npm',
		);

		expect(changes).toContainEqual(
				expect.objectContaining({
					name: 'check:code',
					requiredValue:
						'npm run sync -- --check && ttsc check --noEmit && (eslint src || true)',
			}),
		);
		expect(changes).toContainEqual(
			expect.objectContaining({
				name: 'check',
				requiredValue: 'npm run check:code && (echo optional || true)',
			}),
		);
	});

	test('isolates project-owned sequences that can override managed failures', () => {
		for (const currentValue of [
			'eslint src; echo done',
			'eslint src\necho done',
			'eslint src &',
			'eslint src | cat',
		]) {
			const changes = buildOfficialWorkspaceLintScriptChanges(
				{
					scripts: {
						check: currentValue,
						'check:code': currentValue,
					},
				},
				'npm',
			);

			expect(changes).toContainEqual(
				expect.objectContaining({
					name: 'check:code',
					requiredValue:
						`npm run sync -- --check && ttsc check --noEmit && (${currentValue})`,
				}),
			);
			expect(changes).toContainEqual(
				expect.objectContaining({
					name: 'check',
					requiredValue: `npm run check:code && (${currentValue})`,
				}),
			);
		}
	});

	test('repairs a partially adopted official check:code lane', () => {
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					check: 'npm run check:code',
					'check:code': 'ttsc check --noEmit',
				},
			},
			'npm',
		);

		expect(changes).toContainEqual({
			action: 'update',
			currentValue: 'ttsc check --noEmit',
			name: 'check:code',
			requiredValue:
				'npm run sync -- --check && ttsc check --noEmit',
		});

		const wrongOrder = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					check: 'npm run check:code',
					'check:code':
						'ttsc check --noEmit && npm run sync -- --check',
				},
			},
			'npm',
		);
		expect(wrongOrder).toContainEqual({
			action: 'update',
			currentValue:
				'ttsc check --noEmit && npm run sync -- --check',
			name: 'check:code',
			requiredValue:
				'npm run sync -- --check && ttsc check --noEmit && npm run sync -- --check',
		});
	});

	test('keeps an existing ttsc gate outside project fallback grouping', () => {
		const currentValue =
			'eslint src || true && ttsc check --noEmit';
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					check: 'npm run check:code',
					'check:code': currentValue,
				},
			},
			'npm',
		);

		expect(changes).toContainEqual({
			action: 'update',
			currentValue,
			name: 'check:code',
			requiredValue:
				'npm run sync -- --check && (eslint src || true) && ttsc check --noEmit',
		});
		const repairedValue =
			'npm run sync -- --check && (eslint src || true) && ttsc check --noEmit';
		expect(
			buildOfficialWorkspaceLintScriptChanges(
				{
					scripts: {
						check: 'npm run check:code',
						'check:code': repairedValue,
					},
				},
				'npm',
			).some((change) => change.name === 'check:code'),
		).toBe(false);
	});

	test('keeps grouped project-owned fallback chains idempotent', () => {
		const scripts = {
			check: 'npm run check:code && (echo optional || true)',
			'check:code':
				'npm run sync -- --check && ttsc check --noEmit && (eslint src || true)',
			postinstall: 'node scripts/apply-ttsc-lint-compat.mjs',
		};

		expect(
			buildOfficialWorkspaceLintScriptChanges({ scripts }, 'npm'),
		).toEqual([]);
	});

	test('does not treat fallback operators inside substitutions as top level', () => {
		for (const currentValue of [
			'echo "$(false || echo recovered)"',
			'echo $(false || echo recovered)',
			'echo `false || echo recovered`',
		]) {
			const changes = buildOfficialWorkspaceLintScriptChanges(
				{ scripts: { 'check:code': currentValue } },
				'npm',
			);
			expect(changes).toContainEqual(
				expect.objectContaining({
					name: 'check:code',
					requiredValue:
						`npm run sync -- --check && ttsc check --noEmit && ${currentValue}`,
				}),
			);
		}
	});

	test('normalizes managed check subsets before adding discovered lanes', () => {
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					check: 'bun run check:code',
					'check:code':
						'bun run sync --check && ttsc check --noEmit',
					'lint:css': 'stylelint custom/**/*.scss',
				},
			},
			'npm',
		);

		expect(changes).toContainEqual(
			expect.objectContaining({
				name: 'check',
				requiredValue: 'npm run check:code && npm run check:style',
			}),
		);
		expect(changes).toContainEqual({
			action: 'update',
			currentValue: 'bun run sync --check && ttsc check --noEmit',
			name: 'check:code',
			requiredValue: 'npm run sync -- --check && ttsc check --noEmit',
		});
	});

	test('normalizes managed runners in customized complete check aggregates', () => {
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					check:
						'bun run check:code && bun run check:style && echo report',
					'check:code':
						'bun run sync --check && ttsc check --noEmit',
					'check:style': 'stylelint "src/**/*.scss"',
				},
			},
			'npm',
		);

		expect(changes).toContainEqual({
			action: 'update',
			currentValue:
				'bun run check:code && bun run check:style && echo report',
			name: 'check',
			requiredValue:
				'npm run check:code && npm run check:style && echo report',
		});
	});

	test('removes dangling managed lanes from an existing check aggregate', () => {
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					check:
						'npm run check:code && npm run check:style && npm run check:format',
					'check:code':
						'npm run sync -- --check && ttsc check --noEmit',
				},
			},
			'npm',
		);

		expect(changes).toContainEqual({
			action: 'update',
			currentValue:
				'npm run check:code && npm run check:style && npm run check:format',
			name: 'check',
			requiredValue: 'npm run check:code',
		});
	});

	test('normalizes a managed sync runner without dropping code-check suffixes', () => {
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					'check:code':
						'bun run sync --check && ttsc check --noEmit && eslint src',
				},
			},
			'npm',
		);

		expect(changes).toContainEqual({
			action: 'update',
			currentValue:
				'bun run sync --check && ttsc check --noEmit && eslint src',
			name: 'check:code',
			requiredValue:
				'npm run sync -- --check && ttsc check --noEmit && eslint src',
		});
	});

	test('migrates customized legacy style and format lanes without orphaning them', () => {
		const customStyle = 'stylelint custom/**/*.scss';
		const customFormat = 'prettier --check custom-config.yml';
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint:
						'npm run lint:ts && npm run lint:css && npm run format:check',
					'lint:ts': 'ttsc --noEmit',
					'lint:css': customStyle,
					'format:check': customFormat,
				},
			},
			'npm',
		);

		expect(changes).toContainEqual({
			action: 'add',
			name: 'check:style',
			requiredValue: customStyle,
		});
		expect(changes).toContainEqual({
			action: 'add',
			name: 'check:format',
			requiredValue: customFormat,
		});
		expect(changes).toContainEqual({
			action: 'add',
			name: 'check',
			requiredValue:
				'npm run check:code && npm run check:style && npm run check:format',
		});
		expect(changes).toContainEqual({
			action: 'update',
			currentValue:
				'npm run lint:ts && npm run lint:css && npm run format:check',
			name: 'lint',
			requiredValue: 'npm run lint:css && npm run format:check',
		});
		for (const name of ['lint:css', 'format:check']) {
			expect(changes.some((change) => change.name === name)).toBe(false);
		}
	});

	test('recognizes package runners without matching ttsc arguments', () => {
		const plansLintTsRemoval = (command: string): boolean =>
			buildOfficialWorkspaceLintScriptChanges(
				{
					scripts: {
						lint: 'npm run lint:ts',
						'lint:ts': command,
					},
				},
				'npm',
			).some((change) => change.name === 'lint:ts');

		for (const command of [
			'npx ttsc --noEmit',
			'npx --yes ttsc --noEmit',
			'npx -p ttsc ttsc --noEmit',
			'bun x ttsc --noEmit',
			'bunx ttsc --noEmit',
			'pnpm exec ttsc --noEmit',
			'pnpm --silent exec --offline ttsc --noEmit',
			'yarn exec ttsc --noEmit',
			'npm exec -- ttsc --noEmit',
			'npm exec --silent ttsc -- --noEmit',
			['ttsc \\', '--noEmit'].join('\n'),
			['ttsc \\', '--noEmit'].join('\r\n'),
			'ttsc --noEmit;',
			'ttsc --noEmit\n',
			'ttsc --noEmit 2>&1',
			'ttsc --noEmit &>lint.log',
			'ttsc --noEmit # managed lint\n',
			'ttsc --noEmit false --noEmit',
			'ttsc --noEmit=false --noEmit=true',
			'ttsc --baseUrl src --generateTrace traces --noEmit',
		]) {
			expect(plansLintTsRemoval(command)).toBe(true);
		}
		const rejectedCommands = [
			'echo ttsc --noEmit',
			`echo 'next: && ttsc --noEmit'`,
			'npx echo ttsc --noEmit',
			'npx --yes echo ttsc --noEmit',
			'npx --version ttsc --noEmit',
			'ttsc --pretty && echo --noEmit',
			'ttsc --noEmit || true',
			'ttsc --noEmit &',
			'ttsc --noEmit & true',
			'ttsc --noEmit & && true',
			'ttsc --noEmit ; && true',
			'ttsc --noEmit && true &',
			'ttsc --noEmit 2> &1',
			'echo setup & && ttsc --noEmit',
			'ttsc --noEmit && true &&',
			'ttsc --noEmit "',
			"ttsc --noEmit '",
			'ttsc --noEmit # managed lint\ntrue',
			'ttsc --noEmit &&',
			'ttsc --noEmit\\',
			'echo disabled # && ttsc --noEmit',
			'bun run ttsc --noEmit',
			'pnpm ttsc --noEmit',
			'pnpm run ttsc --noEmit',
			'yarn run ttsc --noEmit',
			'ttsc --noEmit --listFilesOnly',
			'ttsc --noEmit --showConfig',
			'ttsc --noEmit --watch',
			'ttsc --noEmit -w',
			'ttsc --noEmit --project ../unrelated/tsconfig.json',
			'ttsc --noEmit --project=../unrelated/tsconfig.json',
			'ttsc --noEmit -p ../unrelated/tsconfig.json',
			'ttsc --noEmit ../unrelated.ts',
			'ttsc ../unrelated.ts --noEmit',
			'ttsc --noEmit -- --project custom.tsconfig',
			'ttsc --noEmit false',
			'ttsc --noEmit=true --noEmit=false',
			'echo label#value && ttsc --noEmit',
			'echo escaped\\ #value && ttsc --noEmit',
			'echo setup &&\nttsc --noEmit',
			'exit 0 | cat && ttsc --noEmit',
			'exit 0 & ttsc --noEmit',
			'env WP_TYPIA_SKIP=1 exit; ttsc --noEmit',
			'exit 0 && ttsc --noEmit',
			'exit 0; ttsc --noEmit',
			'WP_TYPIA_SKIP=1 exit 0 && ttsc --noEmit',
		];
		expect(
			rejectedCommands.filter((command) => plansLintTsRemoval(command)),
		).toEqual([]);

		const noncanonicalAggregate = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'pnpm --silent run lint:ts && pnpm run lint:css',
					'lint:ts': 'ttsc --noEmit',
					postinstall:
						'node scripts/apply-ttsc-lint-compat.mjs',
				},
			},
			'pnpm',
		);
		expect(
			noncanonicalAggregate.some((change) => change.name === 'lint'),
		).toBe(true);

		const terminalAggregate = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'npm --version run lint:ts',
					'lint:ts': 'ttsc --noEmit',
					postinstall:
						'node scripts/apply-ttsc-lint-compat.mjs',
				},
			},
			'npm',
		);
		const unreachableAggregate = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'exit 0 && npm run lint:ts',
					'lint:ts': 'ttsc --noEmit',
					postinstall:
						'node scripts/apply-ttsc-lint-compat.mjs',
				},
			},
			'npm',
		);
		expect(unreachableAggregate.some((change) => change.name === 'lint')).toBe(
			false,
		);
		expect(terminalAggregate.some((change) => change.name === 'lint')).toBe(
			false,
		);
		const forwardedAggregate = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'npm run lint:ts -- --noEmit false',
					'lint:ts': 'ttsc --noEmit',
					postinstall:
						'node scripts/apply-ttsc-lint-compat.mjs',
				},
			},
			'npm',
		);
		expect(forwardedAggregate.some((change) => change.name === 'lint')).toBe(
			false,
		);
		for (const lintCommand of [
			'npm --prefix=../other run lint:ts',
			'pnpm --filter=other run lint:ts',
			'yarn --cwd ../other run lint:ts',
		]) {
			const scopedAggregate = buildOfficialWorkspaceLintScriptChanges(
				{
					scripts: {
						lint: lintCommand,
						'lint:ts': 'ttsc --noEmit',
						postinstall:
							'node scripts/apply-ttsc-lint-compat.mjs',
					},
				},
				'npm',
			);
			expect(scopedAggregate.some((change) => change.name === 'lint')).toBe(
				false,
			);
		}
		const mixedForwardedAggregate = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint:
						'npm run lint:css && npm run lint:ts -- --noEmit false',
					'lint:ts': 'ttsc --noEmit',
					postinstall:
						'node scripts/apply-ttsc-lint-compat.mjs',
				},
			},
			'npm',
		);
		expect(mixedForwardedAggregate).toContainEqual({
			action: 'update',
			currentValue:
				'npm run lint:css && npm run lint:ts -- --noEmit false',
			name: 'lint',
			requiredValue: 'npm run lint:ts -- --noEmit false',
		});
		const scopedForwardedAggregate = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint:
						'npm run lint:ts -- --workspace other && npm run lint:css',
					'lint:ts': 'ttsc --noEmit',
					postinstall:
						'node scripts/apply-ttsc-lint-compat.mjs',
				},
			},
			'npm',
		);
		expect(scopedForwardedAggregate).toContainEqual({
			action: 'update',
			currentValue:
				'npm run lint:ts -- --workspace other && npm run lint:css',
			name: 'lint',
			requiredValue: 'npm run lint:ts -- --workspace other',
		});
		const complexForwardedAggregate = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint:
						'npm run lint:ts -- --noEmit false || npm run lint:css',
					'lint:ts': 'ttsc --noEmit',
					postinstall:
						'node scripts/apply-ttsc-lint-compat.mjs',
				},
			},
			'npm',
		);
		expect(
			complexForwardedAggregate.some((change) => change.name === 'lint'),
		).toBe(false);
		expect(
			complexForwardedAggregate.some(
				(change) => change.name === 'lint:ts',
			),
		).toBe(false);

		const echoedPostinstall = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'npm run lint:ts',
					'lint:ts': 'ttsc --noEmit',
					postinstall:
						'echo node scripts/apply-ttsc-lint-compat.mjs',
				},
			},
			'npm',
		);
		expect(echoedPostinstall).toContainEqual(
			expect.objectContaining({
				name: 'postinstall',
				requiredValue:
					'echo node scripts/apply-ttsc-lint-compat.mjs && node scripts/apply-ttsc-lint-compat.mjs',
			}),
		);

		const checkOnlyPostinstall = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'npm run lint:ts',
					'lint:ts': 'ttsc --noEmit',
					postinstall:
						'node --check scripts/apply-ttsc-lint-compat.mjs',
				},
			},
			'npm',
		);
		expect(checkOnlyPostinstall).toContainEqual(
			expect.objectContaining({
				name: 'postinstall',
				requiredValue:
					'node --check scripts/apply-ttsc-lint-compat.mjs && node scripts/apply-ttsc-lint-compat.mjs',
			}),
		);

		for (const unsafePostinstall of [
			'node --inspect-brk scripts/apply-ttsc-lint-compat.mjs',
			'node --inspect-brk=127.0.0.1:9229 scripts/apply-ttsc-lint-compat.mjs',
			'node --inspect-wait scripts/apply-ttsc-lint-compat.mjs',
			'NODE_OPTIONS=--inspect-brk node scripts/apply-ttsc-lint-compat.mjs',
			'NODE_OPTIONS="--inspect-brk" node scripts/apply-ttsc-lint-compat.mjs',
			"NODE_OPTIONS='--inspect-wait' node scripts/apply-ttsc-lint-compat.mjs",
			'env NODE_OPTIONS=--inspect-wait node scripts/apply-ttsc-lint-compat.mjs',
			'node --require ./skip.cjs scripts/apply-ttsc-lint-compat.mjs',
			'node -r ./skip.cjs scripts/apply-ttsc-lint-compat.mjs',
			'node --import=./skip.mjs scripts/apply-ttsc-lint-compat.mjs',
			'node --loader ./skip.mjs scripts/apply-ttsc-lint-compat.mjs',
			'NODE_OPTIONS=--require=./skip.cjs node scripts/apply-ttsc-lint-compat.mjs',
			'NODE_OPTIONS="--require ./skip.cjs" node scripts/apply-ttsc-lint-compat.mjs',
			"NODE_OPTIONS='--import ./skip.mjs' node scripts/apply-ttsc-lint-compat.mjs",
			'env NODE_OPTIONS=--loader=./skip.mjs node scripts/apply-ttsc-lint-compat.mjs',
		]) {
			const repairedPostinstall = buildOfficialWorkspaceLintScriptChanges(
				{
					scripts: {
						lint: 'npm run lint:ts',
						'lint:ts': 'ttsc --noEmit',
						postinstall: unsafePostinstall,
					},
				},
				'npm',
			);
			expect(repairedPostinstall).toContainEqual(
				expect.objectContaining({
					name: 'postinstall',
					requiredValue: `${unsafePostinstall} && node scripts/apply-ttsc-lint-compat.mjs`,
				}),
			);
		}

		const testRunnerPostinstall = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'npm run lint:ts',
					'lint:ts': 'ttsc --noEmit',
					postinstall:
						'node --test scripts/apply-ttsc-lint-compat.mjs',
				},
			},
			'npm',
		);
		expect(testRunnerPostinstall).toContainEqual(
			expect.objectContaining({
				name: 'postinstall',
				requiredValue:
					'node --test scripts/apply-ttsc-lint-compat.mjs && node scripts/apply-ttsc-lint-compat.mjs',
			}),
		);

		const moduleInputPostinstall = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'npm run lint:ts',
					'lint:ts': 'ttsc --noEmit',
					postinstall:
						'node --input-type=module scripts/apply-ttsc-lint-compat.mjs',
				},
			},
			'npm',
		);
		expect(
			moduleInputPostinstall,
		).toContainEqual(
			expect.objectContaining({
				name: 'postinstall',
				requiredValue:
					'node --input-type=module scripts/apply-ttsc-lint-compat.mjs && node scripts/apply-ttsc-lint-compat.mjs',
			}),
		);
		const watchPostinstall = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'npm run lint:ts',
					'lint:ts': 'ttsc --noEmit',
					postinstall:
						'node --watch scripts/apply-ttsc-lint-compat.mjs',
				},
			},
			'npm',
		);
		expect(watchPostinstall).toContainEqual(
			expect.objectContaining({
				name: 'postinstall',
				requiredValue:
					'node --watch scripts/apply-ttsc-lint-compat.mjs && node scripts/apply-ttsc-lint-compat.mjs',
			}),
		);

		const commentedPostinstall = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'npm run lint:ts',
					'lint:ts': 'ttsc --noEmit',
					postinstall: 'echo setup # keep this',
				},
			},
			'npm',
		);
		expect(commentedPostinstall).toContainEqual(
			expect.objectContaining({
				name: 'postinstall',
				requiredValue:
					'echo setup && node scripts/apply-ttsc-lint-compat.mjs # keep this',
			}),
		);
		const fallbackPostinstall = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'npm run lint:ts',
					'lint:ts': 'ttsc --noEmit',
					postinstall: 'cleanup || true # optional',
				},
			},
			'npm',
		);
		expect(fallbackPostinstall).toContainEqual(
			expect.objectContaining({
				name: 'postinstall',
				requiredValue:
					'cleanup || true && node scripts/apply-ttsc-lint-compat.mjs # optional',
			}),
		);

		for (const [currentValue, requiredValue] of [
			[
				'echo setup;# keep this',
				'echo setup && node scripts/apply-ttsc-lint-compat.mjs # keep this',
			],
			[
				'echo setup && # keep this',
				'echo setup && node scripts/apply-ttsc-lint-compat.mjs # keep this',
			],
			[
				'node scripts/server.js & # start server',
				'node scripts/server.js & node scripts/apply-ttsc-lint-compat.mjs # start server',
			],
			[
				'echo test \\& # literal ampersand',
				'echo test \\& && node scripts/apply-ttsc-lint-compat.mjs # literal ampersand',
			],
			[
				'echo test \\| # literal pipe',
				'echo test \\| && node scripts/apply-ttsc-lint-compat.mjs # literal pipe',
			],
			[
				'echo test \\; # literal separator',
				'echo test \\; && node scripts/apply-ttsc-lint-compat.mjs # literal separator',
			],
			[
				'echo test \\|| # literal pipe and dangling pipe',
				'echo test \\| && node scripts/apply-ttsc-lint-compat.mjs # literal pipe and dangling pipe',
			],
			[
				'echo hi \\ # trailing escape',
				'echo hi && node scripts/apply-ttsc-lint-compat.mjs # trailing escape',
			],
			[
				'echo hi || \\ # escaped fallback',
				'echo hi && node scripts/apply-ttsc-lint-compat.mjs # escaped fallback',
			],
			[
				'echo hi | \\ # escaped pipe',
				'echo hi && node scripts/apply-ttsc-lint-compat.mjs # escaped pipe',
			],
			[
				'echo hi ; \\ # escaped separator',
				'echo hi && node scripts/apply-ttsc-lint-compat.mjs # escaped separator',
			],
			[
				'# keep this',
				'node scripts/apply-ttsc-lint-compat.mjs # keep this',
			],
			[
				'echo "# keep this"',
				'echo "# keep this" && node scripts/apply-ttsc-lint-compat.mjs',
			],
			[
				"echo \"$(printf '%s' '# keep this')\"",
				"echo \"$(printf '%s' '# keep this')\" && node scripts/apply-ttsc-lint-compat.mjs",
			],
		] as const) {
			const changes = buildOfficialWorkspaceLintScriptChanges(
				{
					scripts: {
						lint: 'npm run lint:ts',
						'lint:ts': 'ttsc --noEmit',
						postinstall: currentValue,
					},
				},
				'npm',
			);
			expect(changes).toContainEqual(
				expect.objectContaining({
					name: 'postinstall',
					requiredValue,
				}),
			);
		}
	});

	test('keeps retrofit lint config output aligned with the scaffold template', () => {
		const templateSource = fs.readFileSync(
			path.join(
				import.meta.dir,
				'..',
				'templates',
				'_shared',
				'base',
					'lint.config.mts.mustache',
			),
			'utf8',
		);

		expect(buildWordPressTtscLintConfigSource('fixture-domain')).toBe(
			templateSource.split('{{textDomain}}').join('fixture-domain'),
		);
		expect(buildWordPressTtscLintConfigSource("owner's-domain")).toContain(
			"allowedTextDomain: 'owner\\'s-domain'",
		);
		expect(buildWordPressTtscLintConfigSource('domain-$&')).toContain(
			"allowedTextDomain: 'domain-$&'",
		);
	});

	test('validates ignores against actual compound block sources', async () => {
		const projectDir = path.join(tempRoot, 'compound-lint-ignore');
		const configPath = path.join(projectDir, 'lint.config.mts');
		const canonicalSource = buildWordPressTtscLintConfigSource('fixture-domain');
		fs.mkdirSync(path.join(projectDir, 'src', 'blocks', 'container'), {
			recursive: true,
		});
		fs.writeFileSync(
			path.join(projectDir, 'src', 'blocks', 'container', 'edit.tsx'),
			'export const Edit = () => null;\n',
		);
		fs.mkdirSync(path.join(projectDir, 'src', 'admin-views', 'reports'), {
			recursive: true,
		});
		fs.writeFileSync(
			path.join(projectDir, 'src', 'admin-views', 'reports', 'index.tsx'),
			'export const Reports = () => null;\n',
		);
		fs.mkdirSync(path.join(projectDir, 'scripts'));
		fs.writeFileSync(
			path.join(projectDir, 'webpack.config.js'),
			'module.exports = {};\n',
		);
		fs.writeFileSync(
			path.join(projectDir, 'scripts', 'configure.mjs'),
			'export {};\n',
		);
		fs.writeFileSync(
			configPath,
			canonicalSource.replace(
				"  ignores: ['build/**', 'node_modules/**'],",
				"  ignores: ['src/blocks/**'],",
			),
		);

		expect(hasWordPressTtscLintConfig(configPath, 'fixture-domain')).toBe(false);
		expect(await findManagedWordPressSourcePathsAsync(projectDir)).toEqual(
			findManagedWordPressSourcePaths(projectDir),
		);
		fs.writeFileSync(
			configPath,
			canonicalSource.replace(
				"  ignores: ['build/**', 'node_modules/**'],",
				"  ignores: ['src/admin-views/**'],",
			),
		);
		expect(hasWordPressTtscLintConfig(configPath, 'fixture-domain')).toBe(false);
		expect(findManagedWordPressSourcePaths(projectDir)).toEqual(
			expect.arrayContaining([
				'scripts/configure.mjs',
				'webpack.config.js',
			]),
		);
		for (const ignoredToolingPath of [
			'scripts/**',
			'webpack.config.js',
		]) {
			fs.writeFileSync(
				configPath,
				canonicalSource.replace(
					"  ignores: ['build/**', 'node_modules/**'],",
					`  ignores: ['${ignoredToolingPath}'],`,
				),
			);
			expect(
				hasWordPressTtscLintConfig(configPath, 'fixture-domain'),
			).toBe(false);
		}

		fs.unlinkSync(
			path.join(projectDir, 'src', 'blocks', 'container', 'edit.tsx'),
		);
		fs.unlinkSync(
			path.join(projectDir, 'src', 'admin-views', 'reports', 'index.tsx'),
		);
		fs.unlinkSync(path.join(projectDir, 'webpack.config.js'));
		fs.rmSync(path.join(projectDir, 'scripts'), { recursive: true });
		fs.mkdirSync(
			path.join(
				projectDir,
				'src',
				'blocks',
				'container',
				'node_modules',
				'fixture',
			),
			{ recursive: true },
		);
		fs.writeFileSync(
			path.join(projectDir, 'src', 'blocks', 'container', 'types.d.cts'),
			'export interface Fixture {}\n',
		);
		fs.writeFileSync(
			path.join(projectDir, 'src', 'blocks', 'container', 'types.d.mts'),
			'export interface Fixture {}\n',
		);
		fs.writeFileSync(
			path.join(projectDir, 'src', 'index.ts'),
			'export const register = true;\n',
		);
		fs.writeFileSync(
			path.join(
				projectDir,
				'src',
				'blocks',
				'container',
				'node_modules',
				'fixture',
				'index.ts',
			),
			'export const generated = true;\n',
		);
		expect(hasWordPressTtscLintConfig(configPath, 'fixture-domain')).toBe(true);
		expect(await findManagedWordPressSourcePathsAsync(projectDir)).toEqual([
			'src/index.ts',
		]);
	});

	test('requires effective JavaScript coverage for the combined code gate', () => {
		const projectDir = path.join(tempRoot, 'javascript-code-coverage');
		fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
		fs.writeFileSync(
			path.join(projectDir, 'src', 'legacy.js'),
			'export const legacy = true;\n',
		);
		const writeConfig = (config: Record<string, unknown>): void => {
			fs.writeFileSync(
				path.join(projectDir, 'tsconfig.json'),
				`${JSON.stringify(config, null, 2)}\n`,
			);
		};

		writeConfig({ compilerOptions: {}, include: ['src/**/*'] });
		expect(getTtscJavaScriptCoverageIssue(projectDir)).toContain(
			'compilerOptions.allowJs',
		);

		writeConfig({
			compilerOptions: { allowJs: true },
			include: ['src/**/*.ts'],
		});
		expect(getTtscJavaScriptCoverageIssue(projectDir)).toContain(
			'src/legacy.js',
		);

		writeConfig({
			compilerOptions: { allowJs: true },
			include: ['src/**/*'],
		});
		expect(getTtscJavaScriptCoverageIssue(projectDir)).toBeNull();

		fs.mkdirSync(path.join(projectDir, 'scripts'));
		fs.writeFileSync(
			path.join(projectDir, 'webpack.config.js'),
			'module.exports = {};\n',
		);
		fs.writeFileSync(
			path.join(projectDir, 'scripts', 'configure.mjs'),
			'export {};\n',
		);
		const rootCoverageIssue = getTtscJavaScriptCoverageIssue(projectDir);
		expect(rootCoverageIssue).toContain('webpack.config.js');
		expect(rootCoverageIssue).toContain('scripts/configure.mjs');

		writeConfig({
			compilerOptions: { allowJs: true },
			include: ['src/**/*', 'scripts/**/*', '*.js'],
		});
		expect(getTtscJavaScriptCoverageIssue(projectDir)).toBeNull();
	});

	test('requires the contributor preset and expected text domain', () => {
		const canonicalSource = buildWordPressTtscLintConfigSource('fixture-domain');
		const esmJavaScriptSource = canonicalSource
			.replace("import type { ITtscLintConfig } from '@ttsc/lint';\n", '')
			.replace('} satisfies ITtscLintConfig;', '};');
		const replaceOnce = (
			source: string,
			anchor: string,
			replacement: string,
		): string => {
			expect(source).toContain(anchor);
			return source.replace(anchor, replacement);
		};
		expect(
			hasWordPressTtscLintConfigSource(canonicalSource, 'fixture-domain'),
		).toBe(true);
		expect(
			hasWordPressTtscLintConfigSource(
				replaceOnce(
					canonicalSource,
					"  ignores: ['build/**', 'node_modules/**'],",
					"  extends: './project-config.mjs',\n  ignores: ['build/**', 'node_modules/**'],",
				),
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				replaceOnce(
					canonicalSource,
					'  ...configs.wpScriptsRecommended,',
					"  extends: './project-config.mjs',\n  ...configs.wpScriptsRecommended,",
				),
				'fixture-domain',
			),
		).toBe(true);
		expect(
			hasWordPressTtscLintConfigSource(
				replaceOnce(
					canonicalSource,
					"  ignores: ['build/**', 'node_modules/**'],",
					"  ...projectConfig,\n  ignores: ['build/**', 'node_modules/**'],",
				),
				'fixture-domain',
			),
		).toBe(false);
		const documentedDefaultPluginSource = replaceOnce(
			replaceOnce(
				canonicalSource,
				"import { configs } from '@wp-typia/ttsc-lint-plugin-wp';",
				"import wordpress, { configs } from '@wp-typia/ttsc-lint-plugin-wp';",
			),
			'  rules: {',
			'  plugins: { wordpress },\n  rules: {',
		);
		expect(
			hasWordPressTtscLintConfigSource(
				documentedDefaultPluginSource,
				'fixture-domain',
			),
		).toBe(true);
		for (const typeOnlyImport of [
			"import { type configs } from '@wp-typia/ttsc-lint-plugin-wp';",
			"import type * as wp from '@wp-typia/ttsc-lint-plugin-wp';",
		]) {
			const typeOnlyConfigReference = typeOnlyImport.includes('* as wp')
				? 'wp.configs'
				: 'configs';
			expect(
				hasWordPressTtscLintConfigSource(
					`${typeOnlyImport}
export default {
  ...${typeOnlyConfigReference}.wpScriptsRecommended,
  rules: {
    ...${typeOnlyConfigReference}.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
					'fixture-domain',
				),
			).toBe(false);
		}
		expect(
			hasWordPressTtscLintConfigSource(canonicalSource, 'other-domain'),
		).toBe(false);
		for (const ignorePatterns of [
			"['src/**']",
			"['**/*']",
			"['src/**', '!src/index.ts']",
		]) {
			expect(
				hasWordPressTtscLintConfigSource(
					replaceOnce(
						canonicalSource,
						"  ignores: ['build/**', 'node_modules/**'],",
						`  ignores: ${ignorePatterns},`,
					),
					'fixture-domain',
				),
			).toBe(false);
		}
		expect(
			hasWordPressTtscLintConfigSource(
				replaceOnce(
					canonicalSource,
					"  ignores: ['build/**', 'node_modules/**'],",
					"  ignores: ['src/blocks/**'],",
				),
				'fixture-domain',
				'lint.config.ts',
				'commonjs',
				[
					'src/blocks/container/edit.tsx',
					'src/blocks/container/save.tsx',
				],
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				replaceOnce(
					canonicalSource,
					"  ignores: ['build/**', 'node_modules/**'],",
					"  ignores: ['dist/**', 'src/**', '!src/**'],",
				),
				'fixture-domain',
			),
		).toBe(true);
		expect(
			hasWordPressTtscLintConfigSource(
				replaceOnce(
					replaceOnce(
						canonicalSource,
						"import { configs } from '@wp-typia/ttsc-lint-plugin-wp';",
						"import { configs } from '@wp-typia/ttsc-lint-plugin-wp';\nconst projectConfig = { ignores: ['src/**'] };",
					),
					'export default {',
					'export default {\n  ...projectConfig,',
				),
				'fixture-domain',
			),
		).toBe(true);
		expect(
			hasWordPressTtscLintConfigSource(
				`${canonicalSource}\nprocess.exit(0);`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`${canonicalSource}\nthrow new Error('stop');`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`${canonicalSource}\nfunction dormant() { throw new Error('unused'); }`,
				'fixture-domain',
			),
		).toBe(true);
		expect(
			hasWordPressTtscLintConfigSource(
				`${canonicalSource}\nfunction terminate() { process.exit(0); }\nterminate();`,
				'fixture-domain',
			),
		).toBe(false);
		const enabledTextDomainRule =
			"    'wordpress/i18n-text-domain': [\n      'error',";
		for (const severity of ["'off'", '0', 'false', '{}']) {
			expect(
				hasWordPressTtscLintConfigSource(
					replaceOnce(
						canonicalSource,
						enabledTextDomainRule,
						replaceOnce(enabledTextDomainRule, "'error'", severity),
					),
					'fixture-domain',
				),
			).toBe(false);
		}
		for (const severity of ["'warning'", "'warn'", '1', '2']) {
			expect(
				hasWordPressTtscLintConfigSource(
					replaceOnce(
						canonicalSource,
						enabledTextDomainRule,
						replaceOnce(enabledTextDomainRule, "'error'", severity),
					),
					'fixture-domain',
				),
			).toBe(true);
		}
		for (const ruleName of [
			'wordpress/no-unsafe-wp-apis',
			'wordpress/valid-sprintf',
		]) {
			const disabledRuleSource = replaceOnce(
				canonicalSource,
				'  rules: {',
				`  rules: {\n    '${ruleName}': 'off',`,
			);
			expect(
				hasWordPressTtscLintConfigSource(
					disabledRuleSource,
					'fixture-domain',
				),
			).toBe(false);

			const restoredByPresetSource = replaceOnce(
				canonicalSource,
				'  rules: {',
				`  rules: {\n    '${ruleName}': 'off',\n    '${ruleName}': 'error',`,
			);
			expect(
				hasWordPressTtscLintConfigSource(
					restoredByPresetSource,
					'fixture-domain',
				),
			).toBe(true);
		}
		expect(
			hasWordPressTtscLintConfigSource(
				`${canonicalSource}\nconst broken =`,
				'fixture-domain',
			),
		).toBe(false);
		const multipleDomainsSource = replaceOnce(
			canonicalSource,
			"allowedTextDomain: 'fixture-domain'",
			"allowedTextDomain: ['shared-domain', 'fixture-domain']",
		);
		expect(
			hasWordPressTtscLintConfigSource(
				multipleDomainsSource,
				'fixture-domain',
			),
		).toBe(true);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
			),
		).toBe(true);
		expect(
			hasWordPressTtscLintConfigSource(
				`return;
const wp = require('@wp-typia/ttsc-lint-plugin-wp');
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
				'lint.config.cjs',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
const wp = require('@wp-typia/ttsc-lint-plugin-wp');
`,
				'fixture-domain',
				'lint.config.cjs',
			),
		).toBe(false);
		const exportEqualsSource = `import { configs } from '@wp-typia/ttsc-lint-plugin-wp';
const config = {
  ...configs.wpScriptsRecommended,
  rules: {
    ...configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
export = config;
`;
		expect(
			hasWordPressTtscLintConfigSource(
				exportEqualsSource,
				'fixture-domain',
				'lint.config.mts',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				exportEqualsSource,
				'fixture-domain',
				'lint.config.cts',
			),
		).toBe(true);
		expect(
			hasWordPressTtscLintConfigSource(
				`let wp = require('@wp-typia/ttsc-lint-plugin-wp');
[wp] = [{ configs: { recommended: { plugins: {}, rules: {} } } }];
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`let wp = require('@wp-typia/ttsc-lint-plugin-wp');
({ wp } = { wp: { configs: { recommended: { plugins: {}, rules: {} } } } });
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				canonicalSource,
				'fixture-domain',
				'lint.config.cjs',
			),
		).toBe(false);
		for (const configFilename of ['lint.config.mts', 'lint.config.cts']) {
			expect(
				hasWordPressTtscLintConfigSource(
					canonicalSource,
					'fixture-domain',
					configFilename,
				),
			).toBe(true);
		}
		expect(
			hasWordPressTtscLintConfigSource(
				canonicalSource,
				'fixture-domain',
				'lint.config.ts',
				'commonjs',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				canonicalSource,
				'fixture-domain',
				'lint.config.ts',
				'module',
			),
		).toBe(true);
		expect(
			hasWordPressTtscLintConfigSource(
				esmJavaScriptSource,
				'fixture-domain',
				'lint.config.js',
				'module',
			),
		).toBe(true);
		expect(
			hasWordPressTtscLintConfigSource(
				esmJavaScriptSource,
				'fixture-domain',
				'lint.config.js',
				'commonjs',
			),
		).toBe(false);
		const jsConfigDirectory = path.join(tempRoot, 'js-lint-config-module-type');
		const jsConfigPath = path.join(jsConfigDirectory, 'lint.config.js');
		fs.mkdirSync(jsConfigDirectory, { recursive: true });
		fs.writeFileSync(
			path.join(jsConfigDirectory, 'package.json'),
			'{"type":"module"}\n',
			'utf8',
		);
		fs.writeFileSync(jsConfigPath, esmJavaScriptSource, 'utf8');
		expect(
			hasWordPressTtscLintConfig(jsConfigPath, 'fixture-domain'),
		).toBe(true);
		fs.writeFileSync(
			path.join(jsConfigDirectory, 'package.json'),
			'{"type":"commonjs"}\n',
			'utf8',
		);
		expect(
			hasWordPressTtscLintConfig(jsConfigPath, 'fixture-domain'),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
export default {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
				'lint.config.mjs',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`var module;
const wp = require('@wp-typia/ttsc-lint-plugin-wp');
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
				'lint.config.cjs',
			),
		).toBe(true);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
				'lint.config.mjs',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
				'lint.config.mts',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
				'lint.config.js',
				'module',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
module = { exports: {} };
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
				'lint.config.cjs',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  plugins: {
    ...wp.configs.wpScriptsRecommended.plugins,
    [\`wordpress\`]: undefined,
  },
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
				'lint.config.cjs',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
wp.configs.wpScriptsRecommended.plugins = {};
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
			'fixture-domain',
		),
			).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
[0].forEach(() => {
  wp.configs.wpScriptsRecommended.plugins = {};
});
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
function disable() {
  wp.configs.wpScriptsRecommended.plugins = {};
}
[0].forEach(disable);
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
function disable() {
  wp.configs.wpScriptsRecommended.plugins = {};
}
disable();
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
(function () {
  wp.configs.wpScriptsRecommended.plugins = {};
})();
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
function disable() {
  wp.configs.wpScriptsRecommended.plugins = {};
}
const helpers = { disable };
helpers.disable();
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
function disable() {
  wp.configs.wpScriptsRecommended.plugins = {};
}
const [run] = [disable];
run();
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
function disable() {
  wp.configs.wpScriptsRecommended.plugins = {};
}
const [{ run }] = [{ run: disable }];
run();
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
function disable() {
  wp.configs.wpScriptsRecommended.plugins = {};
}
function noop() {}
const rest = [noop, noop];
const [first, second, run] = [noop, ...rest, disable];
run();
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
			),
		).toBe(true);
		expect(
			hasWordPressTtscLintConfigSource(
				`function require() {
  return {
    configs: {
      recommended: { plugins: { wordpress: {} }, rules: {} },
    },
  };
}
const wp = require('@wp-typia/ttsc-lint-plugin-wp');
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
const holder = { wp };
holder.wp.configs.wpScriptsRecommended.plugins = {};
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				replaceOnce(
					canonicalSource,
					'  rules: {',
					'  plugins: {},\n  rules: {',
				),
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				replaceOnce(
					canonicalSource,
					'  rules: {',
					'  plugins: { ...configs.wpScriptsRecommended.plugins },\n  rules: {',
				),
				'fixture-domain',
			),
		).toBe(true);
		expect(
			hasWordPressTtscLintConfigSource(
				replaceOnce(
					canonicalSource,
					'  rules: {',
					'  plugins: { wordpress: configs.wpScriptsRecommended.plugins.wordpress },\n  rules: {',
				),
				'fixture-domain',
			),
		).toBe(true);
		const overwrittenPluginSource = replaceOnce(
			replaceOnce(
				canonicalSource,
				"import { configs } from '@wp-typia/ttsc-lint-plugin-wp';",
				"import { configs } from '@wp-typia/ttsc-lint-plugin-wp';\nconst localPlugins = { wordpress: undefined };",
			),
			'  rules: {',
			'  plugins: { ...configs.wpScriptsRecommended.plugins, ...localPlugins },\n  rules: {',
		);
		expect(
			hasWordPressTtscLintConfigSource(
				overwrittenPluginSource,
				'fixture-domain',
			),
		).toBe(false);
		const mutatedConfigSource = replaceOnce(
			replaceOnce(canonicalSource, 'export default {', 'const config = {'),
				'} satisfies ITtscLintConfig;',
				'} satisfies ITtscLintConfig;\nconfig.plugins = {};\nexport default config;',
		);
		expect(
			hasWordPressTtscLintConfigSource(
				mutatedConfigSource,
				'fixture-domain',
			),
		).toBe(false);
		const helperMutatedConfigSource = replaceOnce(
			replaceOnce(canonicalSource, 'export default {', 'const config = {'),
			'} satisfies ITtscLintConfig;',
			'} satisfies ITtscLintConfig;\nfunction disable() {\n  config.plugins = {};\n}\ndisable();\nexport default config;',
		);
		expect(
			hasWordPressTtscLintConfigSource(
				helperMutatedConfigSource,
				'fixture-domain',
			),
		).toBe(false);
		const parameterMutatedConfigSource = replaceOnce(
			replaceOnce(canonicalSource, 'export default {', 'const config = {'),
			'} satisfies ITtscLintConfig;',
			'} satisfies ITtscLintConfig;\nfunction disable(target) {\n  target.plugins = {};\n}\ndisable(config);\nexport default config;',
		);
		expect(
			hasWordPressTtscLintConfigSource(
				parameterMutatedConfigSource,
				'fixture-domain',
			),
		).toBe(false);
		const shadowedParameterConfigSource = replaceOnce(
			replaceOnce(canonicalSource, 'export default {', 'const config = {'),
			'} satisfies ITtscLintConfig;',
			'} satisfies ITtscLintConfig;\nfunction normalize(config) {\n  config.plugins = {};\n}\nnormalize({});\nexport default config;',
		);
		expect(
			hasWordPressTtscLintConfigSource(
				shadowedParameterConfigSource,
				'fixture-domain',
			),
		).toBe(true);
		const constructorHelperMutatedConfigSource = replaceOnce(
			replaceOnce(canonicalSource, 'export default {', 'const config = {'),
			'} satisfies ITtscLintConfig;',
			'} satisfies ITtscLintConfig;\nfunction disable() {\n  config.plugins = {};\n}\nnew disable();\nexport default config;',
		);
		expect(
			hasWordPressTtscLintConfigSource(
				constructorHelperMutatedConfigSource,
				'fixture-domain',
			),
		).toBe(false);
		const chainedHelperMutatedConfigSource = replaceOnce(
			replaceOnce(canonicalSource, 'export default {', 'const config = {'),
			'} satisfies ITtscLintConfig;',
			'} satisfies ITtscLintConfig;\nfunction disable() {\n  config.plugins = {};\n}\nconst alias = disable;\nfunction run() {\n  alias();\n}\nrun();\nexport default config;',
		);
		expect(
			hasWordPressTtscLintConfigSource(
				chainedHelperMutatedConfigSource,
				'fixture-domain',
			),
		).toBe(false);
		const dynamicMutatedConfigSource = replaceOnce(
			replaceOnce(canonicalSource, 'export default {', 'const config = {'),
				'} satisfies ITtscLintConfig;',
				"} satisfies ITtscLintConfig;\nconst key = 'plugins';\nconfig[key] = {};\nexport default config;",
		);
		expect(
			hasWordPressTtscLintConfigSource(
				dynamicMutatedConfigSource,
				'fixture-domain',
			),
		).toBe(false);
		const aliasMutatedConfigSource = replaceOnce(
			replaceOnce(canonicalSource, 'export default {', 'const config = {'),
				'} satisfies ITtscLintConfig;',
				'} satisfies ITtscLintConfig;\nconst alias = config;\nalias.plugins = {};\nexport default config;',
		);
		expect(
			hasWordPressTtscLintConfigSource(
				aliasMutatedConfigSource,
				'fixture-domain',
			),
		).toBe(false);
		const destructuredAliasMutatedConfigSource = replaceOnce(
			replaceOnce(canonicalSource, 'export default {', 'const config = {'),
				'} satisfies ITtscLintConfig;',
				"} satisfies ITtscLintConfig;\nconst { rules } = config;\nrules['wordpress/i18n-text-domain'] = [];\nexport default config;",
		);
		expect(
			hasWordPressTtscLintConfigSource(
				destructuredAliasMutatedConfigSource,
				'fixture-domain',
			),
		).toBe(false);
		const assignedAliasMutatedInBlockSource = replaceOnce(
			replaceOnce(canonicalSource, 'export default {', 'const config = {'),
				'} satisfies ITtscLintConfig;',
				'} satisfies ITtscLintConfig;\nlet alias;\n{\n  alias = config;\n  alias.plugins = {};\n}\nexport default config;',
		);
		expect(
			hasWordPressTtscLintConfigSource(
				assignedAliasMutatedInBlockSource,
				'fixture-domain',
			),
		).toBe(false);
		const assignedAliasWithoutMutationSource = replaceOnce(
			replaceOnce(canonicalSource, 'export default {', 'const config = {'),
				'} satisfies ITtscLintConfig;',
				'} satisfies ITtscLintConfig;\nlet alias;\nalias = config;\nexport default config;',
		);
		expect(
			hasWordPressTtscLintConfigSource(
				assignedAliasWithoutMutationSource,
				'fixture-domain',
			),
		).toBe(true);
		const comparisonWithoutAliasSource = replaceOnce(
			replaceOnce(canonicalSource, 'export default {', 'const config = {'),
			'} satisfies ITtscLintConfig;',
			'} satisfies ITtscLintConfig;\nlet isValid = config === {};\nisValid = false;\nexport default config;',
		);
		expect(
			hasWordPressTtscLintConfigSource(
				comparisonWithoutAliasSource,
				'fixture-domain',
			),
		).toBe(true);
		const methodMutatedConfigSource = replaceOnce(
			replaceOnce(canonicalSource, 'export default {', 'const config = {'),
				'} satisfies ITtscLintConfig;',
				"} satisfies ITtscLintConfig;\nconfig.rules['wordpress/i18n-text-domain'].push('warn');\nexport default config;",
		);
		expect(
			hasWordPressTtscLintConfigSource(
				methodMutatedConfigSource,
				'fixture-domain',
			),
		).toBe(false);
		const shadowedHelperConfigSource = replaceOnce(
			replaceOnce(canonicalSource, 'export default {', 'const config = {'),
				'} satisfies ITtscLintConfig;',
				[
					'} satisfies ITtscLintConfig;',
					'function buildLocalConfig() {',
					'  const config = { rules: {} };',
					"  config.rules = { local: 'error' };",
					'  return config;',
					'}',
					'export default config;',
				].join('\n'),
		);
		expect(
			hasWordPressTtscLintConfigSource(
				shadowedHelperConfigSource,
				'fixture-domain',
			),
		).toBe(true);
		expect(
			hasWordPressTtscLintConfigSource(
				`import * as wp from '@wp-typia/ttsc-lint-plugin-wp';
export default {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
			),
		).toBe(true);
		expect(
			hasWordPressTtscLintConfigSource(
				`import { configs } from '@wp-typia/ttsc-lint-plugin-wp';
export default {
  rules: { 'wordpress/i18n-text-domain': 'error' },
};
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`import { configs } from '@wp-typia/ttsc-lint-plugin-wp';
export default {
  ...configs.wpScriptsRecommended,
  rules: {
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
    ...configs.wpScriptsRecommended.rules,
  },
};
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`import { configs } from '@wp-typia/ttsc-lint-plugin-wp';
export default {
  rules: {
    ...configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
  ...configs.wpScriptsRecommended,
};
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const { configs: wpConfigs } = require('@wp-typia/ttsc-lint-plugin-wp');
module.exports = {
  ...wpConfigs.wpScriptsRecommended,
  rules: {
    ...wpConfigs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
			),
		).toBe(true);
		expect(
			hasWordPressTtscLintConfigSource(
				`const { configs: wpConfigs } = require('@wp-typia/ttsc-lint-plugin-wp');
const config = {
  ...wpConfigs.wpScriptsRecommended,
  rules: {
    ...wpConfigs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
exports = module.exports = config;
`,
				'fixture-domain',
				'lint.config.cjs',
			),
		).toBe(true);
		expect(
			hasWordPressTtscLintConfigSource(
				`const { configs: wpConfigs } = require('@wp-typia/ttsc-lint-plugin-wp');
module.exports = {
  ...wpConfigs.wpScriptsRecommended,
  rules: {
    ...wpConfigs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
const exported = module.exports;
exported.plugins = {};
`,
				'fixture-domain',
				'lint.config.cjs',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const { configs: wpConfigs } = require('@wp-typia/ttsc-lint-plugin-wp');
module.exports = {
  ...wpConfigs.wpScriptsRecommended,
  rules: {
    ...wpConfigs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
Object.defineProperty(module.exports, 'plugins', { value: {} });
`,
				'fixture-domain',
				'lint.config.cjs',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const { configs: wpConfigs } = require('@wp-typia/ttsc-lint-plugin-wp');
module.exports = {
  ...wpConfigs.wpScriptsRecommended,
  rules: {
    ...wpConfigs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
module.exports.plugins = {};
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const { ...configs } = require('@wp-typia/ttsc-lint-plugin-wp');
module.exports = {
  ...configs.wpScriptsRecommended,
  rules: {
    ...configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const { configs } = require('@wp-typia/ttsc-lint-plugin-wp');
module.exports = {
  ...configs.wpScriptsRecommended,
  rules: {
    ...configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
export default {};
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`import { configs } from '@wp-typia/ttsc-lint-plugin-wp';
export default config;
const config = {
  ...configs.wpScriptsRecommended,
  rules: {
    ...configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
			'fixture-domain',
		),
	).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
function retain(...values) {
  return values[0];
}
const holder = retain(...[wp]);
holder.configs.wpScriptsRecommended.plugins = {};
module.exports = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
var config = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
var config = {};
module.exports = config;
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
const config = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
exports = {};
exports.default = config;
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const wp = require('@wp-typia/ttsc-lint-plugin-wp');
const config = {
  ...wp.configs.wpScriptsRecommended,
  rules: {
    ...wp.configs.wpScriptsRecommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
};
exports.default = config;
let exports;
`,
				'fixture-domain',
			),
		).toBe(false);
	});

	test('normalizes scoped package names for retrofit text domains', () => {
		expect(
			resolveRetrofitTextDomain({
				blockTargets: [],
				packageJson: { name: '@acme/site-blocks' },
				projectDir: '/tmp/ignored-project-dir',
			}),
		).toBe('site-blocks');
		expect(
			resolveRetrofitTextDomain({
				blockTargets: [],
				packageJson: {
					name: '@acme/site-blocks',
					wpTypia: { textDomain: 42 as unknown as string },
				},
				projectDir: '/tmp/ignored-project-dir',
			}),
		).toBe('site-blocks');
		expect(
			resolveRetrofitTextDomain({
				blockTargets: [],
				packageJson: { name: 42 as unknown as string },
				projectDir: '/tmp/fallback-project',
			}),
		).toBe('fallback-project');
	});

	test('rejects conflicting retrofit block text domains', () => {
		const projectDir = path.join(tempRoot, 'conflicting-block-text-domains');
		const blockTargets = ['first-block', 'second-block'].map(
			(slug, index) => {
				const blockDirectory = path.join('src', 'blocks', slug);
				const blockJsonFile = path.join(blockDirectory, 'block.json');
				fs.mkdirSync(path.join(projectDir, blockDirectory), {
					recursive: true,
				});
				fs.writeFileSync(
					path.join(projectDir, blockJsonFile),
					`${JSON.stringify({ textdomain: `domain-${index + 1}` })}\n`,
					'utf8',
				);
				return {
					attributeTypeName: `Block${index + 1}Attributes`,
					blockJsonFile,
					blockName: `create-block/${slug}`,
					manifestFile: path.join(blockDirectory, 'attributes.manifest.php'),
					saveFile: path.join(blockDirectory, 'save.tsx'),
					slug,
					typesFile: path.join(blockDirectory, 'types.ts'),
				};
			},
		);

		let conflictError: unknown;
		try {
			resolveRetrofitTextDomain({
				blockTargets,
				packageJson: null,
				projectDir,
			});
		} catch (error) {
			conflictError = error;
		}
		expect(conflictError).toBeInstanceOf(Error);
		expect((conflictError as Error).message).toContain(
			'Conflicting WordPress text domains in block metadata',
		);
		expect((conflictError as Error & { code?: string }).code).toBe(
			'invalid-argument',
		);
	});

	test('upgrades an existing official workspace to the WordPress ttsc lint lane', async () => {
		const projectDir = path.join(tempRoot, 'workspace-lint-upgrade');
		await scaffoldOfficialWorkspace(projectDir, {
			textDomain: 'workspace-lint-domain',
		});
		const packageJsonPath = path.join(projectDir, 'package.json');
		const packageJson = JSON.parse(
			fs.readFileSync(packageJsonPath, 'utf8'),
		) as {
			devDependencies: Record<string, string>;
			packageManager?: string;
			scripts: Record<string, string>;
		};
		delete packageJson.devDependencies['@ttsc/lint'];
		delete packageJson.devDependencies['@wp-typia/ttsc-lint-plugin-wp'];
		packageJson.devDependencies['@ttsc/unplugin'] = '^0.23.0';
		packageJson.devDependencies['@wordpress/blocks'] = '^999.0.0';
		packageJson.devDependencies['@wp-typia/block-runtime'] = '^9.0.0';
		packageJson.devDependencies['@wp-typia/block-types'] = '^9.0.0';
		packageJson.devDependencies['@typia/unplugin'] = '^12.0.1';
		delete packageJson.scripts.postinstall;
		delete packageJson.scripts['lint:ts'];
		packageJson.packageManager = 'pnpm@8.3.1';
		packageJson.scripts.sync = 'tsx scripts/sync-project.ts --custom';
		packageJson.scripts['sync-types'] =
			'tsx scripts/sync-types-to-block-json.ts --custom';
		packageJson.scripts.typecheck =
			'pnpm run sync --check && ttsc --noEmit && bun test';
		packageJson.scripts.lint = 'pnpm run lint:css';
		const webpackPath = path.join(projectDir, 'webpack.config.js');
		const legacyWebpackSource =
			"module.exports = () => import('@typia/unplugin/webpack');\n";
		fs.writeFileSync(webpackPath, legacyWebpackSource, 'utf8');
		fs.writeFileSync(
			packageJsonPath,
			`${JSON.stringify(packageJson, null, 2)}\n`,
			'utf8',
		);
		fs.rmSync(path.join(projectDir, 'lint.config.mts'));
		const historicalVariationPath = path.join(
			projectDir,
			'src',
			'blocks',
			'counter-card',
			'variations',
			'hero-card.ts',
		);
		fs.mkdirSync(path.dirname(historicalVariationPath), {
			recursive: true,
		});
		fs.writeFileSync(
			historicalVariationPath,
			"export const workspaceVariation_hero_card = { name: 'hero-card' };\n",
			'utf8',
		);
		const historicalConsumerPath = path.join(
			projectDir,
			'src',
			'historical-variation-consumer.ts',
		);
		fs.writeFileSync(
			historicalConsumerPath,
			"import { workspaceVariation_hero_card } from './blocks/counter-card/variations/hero-card';\nexport const historicalVariation = workspaceVariation_hero_card;\n",
			'utf8',
		);

		const preview = getInitPlan(path.join(projectDir, 'src'));
		const applied = await applyInitPlan(path.join(projectDir, 'src'));
		const nextPackageJson = JSON.parse(
			fs.readFileSync(packageJsonPath, 'utf8'),
		) as {
			devDependencies: Record<string, string>;
			scripts: Record<string, string>;
		};
		const lintConfigSource = fs.readFileSync(
			path.join(projectDir, 'lint.config.mts'),
			'utf8',
		);

		expect(preview.status).toBe('preview');
		expect(preview.notes.join('\n')).toContain(
			'Historical generated export identifiers will be migrated transactionally',
		);
		expect(preview.detectedLayout.kind).toBe('official-workspace');
		const dependencyInstallStep = preview.nextSteps.find((step) =>
			step.startsWith('pnpm add -D'),
		);
		expect(dependencyInstallStep).toContain('@ttsc/lint@');
		expect(dependencyInstallStep).toContain('@ttsc/unplugin@');
		expect(dependencyInstallStep).toContain(
			'@wp-typia/ttsc-lint-plugin-wp@',
		);
		expect(dependencyInstallStep).not.toContain('@wp-typia/block-runtime@');
		expect(dependencyInstallStep).not.toContain('@wordpress/blocks@');
		expect(
			preview.plannedFiles.some((file) => file.path === 'webpack.config.js'),
		).toBe(false);
		expect(preview.plannedFiles).toContainEqual(
			expect.objectContaining({
				action: 'add',
				path: 'lint.config.mts',
			}),
		);
		expect(applied.status).toBe('applied');
		expect(
			nextPackageJson.devDependencies['@wp-typia/ttsc-lint-plugin-wp'],
		).toBe(getPackageVersions().ttscLintPluginWpPackageVersion);
		expect(nextPackageJson.devDependencies['@ttsc/unplugin']).toBe(
			getPackageVersions().ttscUnpluginPackageVersion,
		);
		expect(nextPackageJson.devDependencies['@wordpress/blocks']).toBe(
			'^999.0.0',
		);
		expect(nextPackageJson.devDependencies['@wp-typia/block-runtime']).toBe(
			'^9.0.0',
		);
		expect(nextPackageJson.devDependencies['@wp-typia/block-types']).toBe(
			'^9.0.0',
		);
		expect(nextPackageJson.devDependencies['@typia/unplugin']).toBe(
			'^12.0.1',
		);
		expect(fs.readFileSync(webpackPath, 'utf8')).toBe(legacyWebpackSource);
		expect(nextPackageJson.scripts.postinstall).toBe(
			'node scripts/apply-ttsc-lint-compat.mjs',
		);
		expect(nextPackageJson.scripts.sync).toBe(
			'tsx scripts/sync-project.ts --custom',
		);
		expect(nextPackageJson.scripts['sync-types']).toBe(
			'tsx scripts/sync-types-to-block-json.ts --custom',
		);
		expect(nextPackageJson.scripts.typecheck).toBe(
			'pnpm run sync --check && ttsc --noEmit && bun test',
		);
		expect(nextPackageJson.scripts['check:code']).toBe(
			'pnpm run sync --check && ttsc check --noEmit',
		);
		expect(nextPackageJson.scripts.check).toBe(
			'pnpm run check:code && pnpm run check:style && pnpm run check:format',
		);
		expect(nextPackageJson.scripts['lint:ts']).toBeUndefined();
		expect(nextPackageJson.scripts.lint).toBeUndefined();
		expect(lintConfigSource).toContain(
			"from '@wp-typia/ttsc-lint-plugin-wp'",
		);
		expect(lintConfigSource).toContain(
			"allowedTextDomain: 'workspace-lint-domain'",
		);
		for (const migratedPath of [
			historicalVariationPath,
			historicalConsumerPath,
		]) {
			const migratedSource = fs.readFileSync(migratedPath, 'utf8');
			expect(migratedSource).toContain('workspaceVariationHeroCardL4L4');
			expect(migratedSource).not.toContain(
				'workspaceVariation_hero_card',
			);
		}

		const currentPlan = getInitPlan(projectDir);
		expect(currentPlan.status).toBe('already-initialized');
		fs.appendFileSync(
			historicalVariationPath,
			'\nexport const workspaceVariation_hero_card = workspaceVariationHeroCardL4L4;\n',
			'utf8',
		);
		expect(getInitPlan(projectDir).status).toBe('already-initialized');

		const compatPath = path.join(
			projectDir,
			'scripts',
			'apply-ttsc-lint-compat.mjs',
		);
		fs.rmSync(compatPath);
		const repairPlan = getInitPlan(projectDir);
		expect(repairPlan.status).toBe('preview');
		expect(repairPlan.plannedFiles).toContainEqual(
			expect.objectContaining({
				action: 'add',
				path: 'scripts/apply-ttsc-lint-compat.mjs',
			}),
		);
		expect(repairPlan.nextSteps).toContain(
			'node scripts/apply-ttsc-lint-compat.mjs',
		);
		const repairedPlan = await applyInitPlan(projectDir);
		expect(repairedPlan.nextSteps).toContain(
			'node scripts/apply-ttsc-lint-compat.mjs',
		);
		expect(fs.existsSync(compatPath)).toBe(true);
	});

	test('reports export-only workspace migrations as planned changes', async () => {
		const projectDir = path.join(
			tempRoot,
			'workspace-historical-export-only',
		);
		await scaffoldOfficialWorkspace(projectDir);
		await applyInitPlan(projectDir);
		expect(getInitPlan(projectDir).status).toBe('already-initialized');

		const variationPath = path.join(
			projectDir,
			'src',
			'blocks',
			'counter-card',
			'variations',
			'hero-card.ts',
		);
		fs.mkdirSync(path.dirname(variationPath), { recursive: true });
		fs.writeFileSync(
			variationPath,
			"export const workspaceVariation_hero_card = { name: 'hero-card' };\n",
			'utf8',
		);

		const preview = getInitPlan(projectDir);

		expect(preview.status).toBe('preview');
		expect(preview.packageChanges.addDevDependencies).toEqual([]);
		expect(preview.packageChanges.scripts).toEqual([]);
		expect(preview.plannedFiles).toContainEqual({
			action: 'update',
			path: 'src/blocks/counter-card/variations/hero-card.ts',
			purpose: 'Migrate the historical generated export identifier.',
		});
		expect(preview.nextSteps[0]).toContain('wp-typia init --apply');

		await applyInitPlan(projectDir);
		expect(fs.readFileSync(variationPath, 'utf8')).toContain(
			'workspaceVariationHeroCardL4L4',
		);
	});

	test('rolls back historical export migrations when workspace init cannot finish', async () => {
		const projectDir = path.join(
			tempRoot,
			'workspace-historical-export-init-rollback',
		);
		await scaffoldOfficialWorkspace(projectDir);
		const packageJsonPath = path.join(projectDir, 'package.json');
		const originalPackageJsonSource = fs.readFileSync(
			packageJsonPath,
			'utf8',
		);
		const variationPath = path.join(
			projectDir,
			'src',
			'blocks',
			'counter-card',
			'variations',
			'alpha-card.ts',
		);
		fs.mkdirSync(path.dirname(variationPath), { recursive: true });
		const historicalVariationSource =
			"export const workspaceVariation_alpha_card = { name: 'alpha-card' };\n";
		fs.writeFileSync(
			variationPath,
			historicalVariationSource,
			'utf8',
		);
		const coreVariationDir = path.join(
			projectDir,
			'src',
			'editor-plugins',
			'core-variations',
			'core',
			'group',
		);
		fs.mkdirSync(coreVariationDir, { recursive: true });
		const coreVariationPath = path.join(
			coreVariationDir,
			'zeta-card.ts',
		);
		const historicalCoreVariationSource =
			"export const coreVariation_core_group_zeta_card = { name: 'zeta-card' };\n";
		fs.writeFileSync(
			coreVariationPath,
			historicalCoreVariationSource,
			'utf8',
		);
		const executableScriptPath = path.join(
			projectDir,
			'scripts',
			'project-tool.mjs',
		);
		fs.writeFileSync(executableScriptPath, '#!/usr/bin/env node\n', 'utf8');
		fs.chmodSync(executableScriptPath, 0o755);
		fs.chmodSync(coreVariationDir, 0o555);

		try {
			await expect(applyInitPlan(projectDir)).rejects.toThrow(
				/restored the previous package\.json\/helper-file\/package-manager snapshot/i,
			);
		} finally {
			fs.chmodSync(coreVariationDir, 0o755);
		}
		expect(fs.readFileSync(packageJsonPath, 'utf8')).toBe(
			originalPackageJsonSource,
		);
		expect(fs.readFileSync(variationPath, 'utf8')).toBe(
			historicalVariationSource,
		);
		expect(fs.readFileSync(coreVariationPath, 'utf8')).toBe(
			historicalCoreVariationSource,
		);
		expect(fs.statSync(executableScriptPath).mode & 0o777).toBe(0o755);
		expect(getInitPlan(projectDir).status).toBe('preview');
	});

	test('preserves project-owned lint configs during official workspace upgrades', async () => {
		const projectDir = path.join(tempRoot, 'workspace-custom-lint-config');
		await scaffoldOfficialWorkspace(projectDir);
		const lintConfigPath = path.join(projectDir, 'lint.config.mts');
		const customSource = `export default { rules: { eqeqeq: 'warning' } };\n`;
		fs.writeFileSync(lintConfigPath, customSource, 'utf8');

		const preview = getInitPlan(projectDir);

		expect(preview.status).toBe('preview');
		expect(preview.notes.join('\n')).toContain(
			'project-owned and will not be overwritten',
		);
		await expect(applyInitPlan(projectDir)).rejects.toThrow(
			/preserves an existing ttsc lint config/u,
		);
		expect(fs.readFileSync(lintConfigPath, 'utf8')).toBe(customSource);
	});

	test('refuses to overwrite a project-owned ttsc compatibility helper', async () => {
		const projectDir = path.join(tempRoot, 'workspace-custom-ttsc-helper');
		await scaffoldOfficialWorkspace(projectDir);
		const compatPath = path.join(
			projectDir,
			'scripts',
			'apply-ttsc-lint-compat.mjs',
		);
		const customSource = 'export const projectOwned = true;\n';
		fs.mkdirSync(path.dirname(compatPath), { recursive: true });
		fs.writeFileSync(compatPath, customSource, 'utf8');

		const preview = getInitPlan(projectDir);

		expect(preview.status).toBe('preview');
		expect(preview.notes.join('\n')).toContain(
			'apply-ttsc-lint-compat.mjs is project-owned and will not be overwritten',
		);
		expect(preview.plannedFiles).not.toContainEqual(
			expect.objectContaining({
				path: 'scripts/apply-ttsc-lint-compat.mjs',
			}),
		);
		await expect(applyInitPlan(projectDir)).rejects.toThrow(
			/preserves the existing scripts\/apply-ttsc-lint-compat\.mjs because it is project-owned/u,
		);
		expect(fs.readFileSync(compatPath, 'utf8')).toBe(customSource);
	});

	test('refuses to upgrade a symlinked ttsc compatibility helper', async () => {
		const projectDir = path.join(tempRoot, 'workspace-symlinked-ttsc-helper');
		await scaffoldOfficialWorkspace(projectDir);
		const compatPath = path.join(
			projectDir,
			'scripts',
			'apply-ttsc-lint-compat.mjs',
		);
		const sharedTargetPath = path.join(
			tempRoot,
			'shared-previous-ttsc-helper.mjs',
		);
		const sharedTargetSource = getPreviousTtscLintCompatSource();
		fs.mkdirSync(path.dirname(compatPath), { recursive: true });
		fs.writeFileSync(sharedTargetPath, sharedTargetSource, 'utf8');
		fs.rmSync(compatPath, { force: true });
		fs.symlinkSync(sharedTargetPath, compatPath);

		const preview = getInitPlan(projectDir);

		expect(preview.notes.join('\n')).toContain(
			'apply-ttsc-lint-compat.mjs is project-owned and will not be overwritten',
		);
		expect(preview.plannedFiles).not.toContainEqual(
			expect.objectContaining({
				path: 'scripts/apply-ttsc-lint-compat.mjs',
			}),
		);
		await expect(applyInitPlan(projectDir)).rejects.toThrow(
			/preserves the existing scripts\/apply-ttsc-lint-compat\.mjs because it is project-owned/u,
		);
		expect(fs.lstatSync(compatPath).isSymbolicLink()).toBe(true);
		expect(fs.readFileSync(sharedTargetPath, 'utf8')).toBe(sharedTargetSource);
	});

	test('upgrades the exact preceding managed ttsc compatibility helper', async () => {
		const projectDir = path.join(tempRoot, 'workspace-previous-ttsc-helper');
		await scaffoldOfficialWorkspace(projectDir);
		const compatPath = path.join(
			projectDir,
			'scripts',
			'apply-ttsc-lint-compat.mjs',
		);
		fs.mkdirSync(path.dirname(compatPath), { recursive: true });
		fs.writeFileSync(
			compatPath,
			getPreviousTtscLintCompatSource(),
			'utf8',
		);

		const preview = getInitPlan(projectDir);

		expect(preview.notes.join('\n')).not.toContain(
			'apply-ttsc-lint-compat.mjs is project-owned',
		);
		expect(preview.plannedFiles).toContainEqual(
			expect.objectContaining({
				action: 'update',
				path: 'scripts/apply-ttsc-lint-compat.mjs',
			}),
		);
		await applyInitPlan(projectDir);
		expect(fs.readFileSync(compatPath, 'utf8')).toBe(
			getTtscLintCompatSource(),
		);
	});

	test('rejects ESM-style TypeScript lint configs in CommonJS workspaces', async () => {
		const projectDir = path.join(tempRoot, 'workspace-commonjs-ts-lint-config');
		await scaffoldOfficialWorkspace(projectDir, {
			textDomain: 'commonjs-config-domain',
		});
		const packageJsonPath = path.join(projectDir, 'package.json');
		const packageJson = JSON.parse(
			fs.readFileSync(packageJsonPath, 'utf8'),
		) as Record<string, unknown>;
		packageJson.type = 'commonjs';
		fs.writeFileSync(
			packageJsonPath,
			`${JSON.stringify(packageJson, null, 2)}\n`,
			'utf8',
		);
		fs.rmSync(path.join(projectDir, 'lint.config.mts'));
		const lintConfigPath = path.join(projectDir, 'lint.config.ts');
		const lintConfigSource = buildWordPressTtscLintConfigSource(
			'commonjs-config-domain',
		);
		fs.writeFileSync(lintConfigPath, lintConfigSource, 'utf8');

		expect(
			hasWordPressTtscLintConfig(
				lintConfigPath,
				'commonjs-config-domain',
			),
		).toBe(false);
		const preview = getInitPlan(projectDir);
		expect(preview.status).toBe('preview');
		expect(preview.notes.join('\n')).toContain(
			'project-owned and will not be overwritten',
		);
	});

	test('migrates the preceding managed lint and tsconfig templates', async () => {
		const projectDir = path.join(tempRoot, 'workspace-managed-config-upgrade');
		await scaffoldOfficialWorkspace(projectDir, {
			textDomain: 'managed-upgrade-domain',
		});
		fs.rmSync(path.join(projectDir, 'lint.config.mts'));
		fs.writeFileSync(
			path.join(projectDir, 'lint.config.ts'),
			buildPreviousManagedWordPressTtscLintConfigSource(
				'managed-upgrade-domain',
			),
			'utf8',
		);

		const previousTsconfig = JSON.parse(
			fs.readFileSync(
				path.join(
					import.meta.dir,
					'fixtures',
					'previous-managed-tsconfig.json',
				),
				'utf8',
			),
		) as {
			compilerOptions: Record<string, unknown>;
			include: string[];
		};
		fs.writeFileSync(
			path.join(projectDir, 'tsconfig.json'),
			`${JSON.stringify(previousTsconfig, null, 2)}\n`,
			'utf8',
		);

		const preview = getInitPlan(projectDir);
		expect(preview.notes.join('\n')).not.toContain(
			'project-owned and will not be overwritten',
		);
		expect(preview.plannedFiles).toContainEqual(
			expect.objectContaining({ action: 'remove', path: 'lint.config.ts' }),
		);
		expect(preview.plannedFiles).toContainEqual(
			expect.objectContaining({ action: 'add', path: 'lint.config.mts' }),
		);
		expect(preview.plannedFiles).toContainEqual(
			expect.objectContaining({ action: 'update', path: 'tsconfig.json' }),
		);

		await applyInitPlan(projectDir);
		expect(fs.existsSync(path.join(projectDir, 'lint.config.ts'))).toBe(false);
		const nextLintConfig = fs.readFileSync(
			path.join(projectDir, 'lint.config.mts'),
			'utf8',
		);
		expect(nextLintConfig).toBe(
			buildWordPressTtscLintConfigSource('managed-upgrade-domain'),
		);
		const nextTsconfig = JSON.parse(
			fs.readFileSync(path.join(projectDir, 'tsconfig.json'), 'utf8'),
		) as {
			compilerOptions: { allowJs?: boolean };
			include: string[];
		};
		expect(nextTsconfig.compilerOptions.allowJs).toBe(true);
		expect(nextTsconfig.include).toEqual(
			expect.arrayContaining(['*.js', '*.jsx', '*.cjs', '*.mjs']),
		);
		expect(getInitPlan(projectDir).status).toBe('already-initialized');
	});

	test('does not upgrade a symlinked preceding managed tsconfig', async () => {
		const projectDir = path.join(tempRoot, 'workspace-symlinked-tsconfig');
		await scaffoldOfficialWorkspace(projectDir, {
			textDomain: 'symlinked-tsconfig-domain',
		});
		fs.rmSync(path.join(projectDir, 'lint.config.mts'));
		fs.writeFileSync(
			path.join(projectDir, 'lint.config.ts'),
			buildPreviousManagedWordPressTtscLintConfigSource(
				'symlinked-tsconfig-domain',
			),
			'utf8',
		);
		const externalTsconfigPath = path.join(
			tempRoot,
			'workspace-symlinked-tsconfig-target.json',
		);
		const previousTsconfigSource = fs.readFileSync(
			path.join(
				import.meta.dir,
				'fixtures',
				'previous-managed-tsconfig.json',
			),
			'utf8',
		);
		fs.writeFileSync(externalTsconfigPath, previousTsconfigSource, 'utf8');
		const tsconfigPath = path.join(projectDir, 'tsconfig.json');
		fs.rmSync(tsconfigPath);
		fs.symlinkSync(externalTsconfigPath, tsconfigPath, 'file');

		const preview = getInitPlan(projectDir);
		expect(preview.plannedFiles).not.toContainEqual(
			expect.objectContaining({ path: 'tsconfig.json' }),
		);

		await applyInitPlan(projectDir);
		expect(fs.lstatSync(tsconfigPath).isSymbolicLink()).toBe(true);
		expect(fs.readFileSync(externalTsconfigPath, 'utf8')).toBe(
			previousTsconfigSource,
		);
	});

	test('refuses a managed lint rename that conflicts with a project-owned destination', async () => {
		const projectDir = path.join(tempRoot, 'workspace-managed-config-conflict');
		await scaffoldOfficialWorkspace(projectDir, {
			textDomain: 'managed-conflict-domain',
		});
		const destinationPath = path.join(projectDir, 'lint.config.mts');
		const projectOwnedSource =
			`export default { rules: { eqeqeq: 'warning' } };\n`;
		fs.writeFileSync(destinationPath, projectOwnedSource, 'utf8');
		const previousPath = path.join(projectDir, 'lint.config.ts');
		const previousSource = buildPreviousManagedWordPressTtscLintConfigSource(
			'managed-conflict-domain',
		);
		fs.writeFileSync(previousPath, previousSource, 'utf8');

		const preview = getInitPlan(projectDir);
		expect(preview.notes.join('\n')).toContain(
			'lint.config.mts is project-owned and will not be overwritten',
		);
		expect(preview.plannedFiles).not.toContainEqual(
			expect.objectContaining({ path: 'lint.config.mts' }),
		);
		await expect(applyInitPlan(projectDir)).rejects.toThrow(
			/conflicts with the destination required to migrate lint\.config\.ts/u,
		);
		expect(fs.readFileSync(destinationPath, 'utf8')).toBe(projectOwnedSource);
		expect(fs.readFileSync(previousPath, 'utf8')).toBe(previousSource);
	});

	test('does not discover unsupported JSON lint configs', async () => {
		const projectDir = path.join(tempRoot, 'workspace-json-lint-config');
		await scaffoldOfficialWorkspace(projectDir);
		fs.rmSync(path.join(projectDir, 'lint.config.mts'));
		const jsonConfigPath = path.join(projectDir, 'lint.config.json');
		const jsonConfigSource = '{"rules":{"eqeqeq":"error"}}\n';
		fs.writeFileSync(jsonConfigPath, jsonConfigSource, 'utf8');

		const preview = getInitPlan(projectDir);

		expect(preview.plannedFiles).toContainEqual(
				expect.objectContaining({ action: 'add', path: 'lint.config.mts' }),
		);
		await applyInitPlan(projectDir);
		expect(fs.readFileSync(jsonConfigPath, 'utf8')).toBe(jsonConfigSource);
		expect(fs.existsSync(path.join(projectDir, 'lint.config.mts'))).toBe(true);
	});

	test('preserves generated persistence helpers during lint-only upgrades', async () => {
		const projectDir = path.join(tempRoot, 'generated-persistence-lint-upgrade');
		const versions = getPackageVersions();
		scaffoldRetrofitProject(projectDir, {
			interfaceName: 'GeneratedPersistenceAttributes',
			packageJson: {
				devDependencies: {
					'@wp-typia/block-runtime': versions.blockRuntimePackageVersion,
					'@wp-typia/block-types': versions.blockTypesPackageVersion,
				},
				scripts: {
					sync: 'ttsx scripts/sync-project.ts',
					'sync-types': 'ttsx scripts/sync-types-to-block-json.ts',
				},
			},
		});
		const helperSources = {
			'block-config.ts':
				"export const BLOCKS = [{ rest: { endpoint: '/counter' } }];\n",
			'sync-project.ts':
				"import './sync-rest-contracts.js';\nexport const persistence = true;\n",
			'sync-types-to-block-json.ts':
				'export const preserveGeneratedMetadata = true;\n',
		};
		fs.mkdirSync(path.join(projectDir, 'scripts'), { recursive: true });
		for (const [filename, source] of Object.entries(helperSources)) {
			fs.writeFileSync(path.join(projectDir, 'scripts', filename), source, 'utf8');
		}

		const preview = getInitPlan(projectDir);

		expect(preview.status).toBe('preview');
		expect(preview.detectedLayout.kind).toBe('generated-project');
		expect(preview.generatedArtifacts).toEqual([]);
		expect(preview.plannedFiles.map((file) => file.path)).not.toContain(
			'scripts/sync-project.ts',
		);
		expect(preview.plannedFiles.map((file) => file.path)).not.toContain(
			'scripts/block-config.ts',
		);

		await applyInitPlan(projectDir);

		for (const [filename, source] of Object.entries(helperSources)) {
			expect(
				fs.readFileSync(path.join(projectDir, 'scripts', filename), 'utf8'),
			).toBe(source);
		}
		expect(fs.existsSync(path.join(projectDir, 'lint.config.mts'))).toBe(true);
		expect(
			fs.readFileSync(
				path.join(projectDir, 'scripts', 'apply-ttsc-lint-compat.mjs'),
				'utf8',
			),
		).toBe(getTtscLintCompatSource());
	});

	test('reports already-initialized projects without planning redundant changes', () => {
		const projectDir = path.join(tempRoot, 'retrofit-already-initialized');
		const versions = getPackageVersions();
		fs.mkdirSync(path.join(projectDir, 'scripts'), { recursive: true });
		fs.writeFileSync(
			path.join(projectDir, 'package.json'),
			`${JSON.stringify(
				{
					name: 'retrofit-already-initialized',
					private: true,
					scripts: {
						postinstall: 'node scripts/apply-ttsc-lint-compat.mjs',
						sync: 'ttsx scripts/sync-project.ts',
						'sync-types': 'ttsx scripts/sync-types-to-block-json.ts',
						'check:code': 'npm run sync -- --check && ttsc check --noEmit',
						check: 'npm run check:code',
					},
					devDependencies: {
						'@ttsc/lint': versions.ttscLintPackageVersion,
						'@ttsc/unplugin': versions.ttscUnpluginPackageVersion,
						'@types/wordpress__blocks':
							DEFAULT_WORDPRESS_BLOCKS_TYPES_VERSION,
						'@wordpress/blocks': DEFAULT_WORDPRESS_BLOCKS_VERSION,
						'@wp-typia/block-runtime': versions.blockRuntimePackageVersion,
						'@wp-typia/block-types': versions.blockTypesPackageVersion,
						'@wp-typia/ttsc-lint-plugin-wp':
							versions.ttscLintPluginWpPackageVersion,
						ttsc: versions.ttscPackageVersion,
						typescript: versions.typescriptPackageVersion,
						typia: versions.typiaPackageVersion,
					},
				},
				null,
				2,
			)}\n`,
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'scripts', 'apply-ttsc-lint-compat.mjs'),
			getTtscLintCompatSource(),
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'scripts', 'block-config.ts'),
			'export const BLOCKS = [];\n',
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'scripts', 'sync-project.ts'),
			'export {};\n',
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'scripts', 'sync-types-to-block-json.ts'),
			'export {};\n',
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'lint.config.mts'),
			`import { configs } from '@wp-typia/ttsc-lint-plugin-wp';
export default {
  ...configs.wpScriptsRecommended,
  rules: {
    ...configs.wpScriptsRecommended.rules,
		'wordpress/i18n-text-domain': [
			'error',
			{ allowedTextDomain: 'retrofit-already-initialized' },
		],
  },
};
`,
			'utf8',
		);
		fs.writeFileSync(
			path.join(projectDir, 'tsconfig.json'),
			`${JSON.stringify(
				{
					compilerOptions: { allowJs: true },
					include: ['scripts/**/*', 'src/**/*'],
				},
				null,
				2,
			)}\n`,
			'utf8',
		);

		const plan = getInitPlan(projectDir);

		expect(plan.status).toBe('already-initialized');
		expect(plan.commandMode).toBe('preview-only');
		expect(plan.detectedLayout.kind).toBe('generated-project');
		expect(plan.packageChanges.addDevDependencies).toEqual([]);
		expect(plan.packageChanges.scripts).toEqual([]);
		expect(plan.plannedFiles).toEqual([]);

		const tsconfigPath = path.join(projectDir, 'tsconfig.json');
		const tsconfig = JSON.parse(
			fs.readFileSync(tsconfigPath, 'utf8'),
		) as Record<string, unknown>;
		fs.writeFileSync(
			tsconfigPath,
			`${JSON.stringify(
				{
					...tsconfig,
					compilerOptions: {
						...(tsconfig.compilerOptions as Record<string, unknown>),
						allowJs: false,
					},
				},
				null,
				2,
			)}\n`,
			'utf8',
		);

		const uncoveredPlan = getInitPlan(projectDir);

		expect(uncoveredPlan.status).toBe('preview');
		expect(uncoveredPlan.notes.join('\n')).toContain(
			'compilerOptions.allowJs',
		);
		expect(
			uncoveredPlan.plannedFiles.some(
				(file) => file.path === 'tsconfig.json',
			),
		).toBe(false);
	});
});
