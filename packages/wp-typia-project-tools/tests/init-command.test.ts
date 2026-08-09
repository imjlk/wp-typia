import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { applyInitPlan } from '../src/runtime/cli-init-apply.js';
import { runInitCommand } from '../src/runtime/cli-init.js';
import { getInitPlan } from '../src/runtime/cli-init-plan.js';
import { buildOfficialWorkspaceLintScriptChanges } from '../src/runtime/cli/cli-init-package-json.js';
import {
  buildWordPressTtscLintConfigSource,
  getTtscLintCompatSource,
  hasWordPressTtscLintConfig,
  resolveRetrofitTextDomain,
} from '../src/runtime/cli/cli-init-templates.js';
import { hasWordPressTtscLintConfigSource } from '../src/runtime/shared/ttsc-lint-config.js';
import {
  buildInitPlanChangeSummary,
  buildInitPlanNextSteps,
  buildRetrofitPlanSummary,
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
			{ action: 'add', path: 'lint.config.ts' },
			{ action: 'add', path: 'scripts/block-config.ts' },
			{ action: 'add', path: 'scripts/sync-types-to-block-json.ts' },
			{ action: 'add', path: 'scripts/sync-project.ts' },
		]);
		expect(plan.packageChanges.scripts.map((script) => script.name)).toEqual([
			'postinstall',
			'sync',
			'sync-types',
			'typecheck',
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
			plan.packageChanges.scripts.find((script) => script.name === 'typecheck')
				?.requiredValue,
		).toBe('pnpm run sync --check && ttsc --noEmit');
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
		expect(packageJson.scripts?.typecheck).toBe(
			'pnpm run sync --check && ttsc --noEmit',
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
			fs.readFileSync(path.join(projectDir, 'lint.config.ts'), 'utf8'),
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
					requiredValue: '0.23.0',
				},
				{
					action: 'update',
					currentValue: '^0.22.0',
					name: '@ttsc/unplugin',
					requiredValue: '^0.23.0',
				},
				{
					action: 'update',
					currentValue: '^0.22.0',
					name: 'ttsc',
					requiredValue: '^0.23.0',
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
			'@ttsc/lint': '0.23.0',
			'@ttsc/unplugin': '^0.23.0',
			ttsc: '^0.23.0',
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

	test('does not mistake a lint:ts sub-lane for the managed lane', () => {
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'pnpm run lint:ts:ci && pnpm run lint:css',
					'lint:ts': 'ttsc --noEmit',
				},
			},
			'pnpm',
		);

		expect(changes).toContainEqual(
			expect.objectContaining({
				name: 'lint',
				requiredValue:
					'pnpm run lint:ts && pnpm run lint:ts:ci && pnpm run lint:css',
			}),
		);
		expect(changes.some((change) => change.name === 'lint:ts')).toBe(false);
	});

	test('preserves project-owned flags on the managed lint:ts lane', () => {
		const changes = buildOfficialWorkspaceLintScriptChanges(
			{
				scripts: {
					lint: 'npm run lint:css',
					'lint:ts': 'ttsc --pretty false --noEmit',
				},
			},
			'npm',
		);

		expect(changes.some((change) => change.name === 'lint:ts')).toBe(false);
		expect(changes).toContainEqual(
			expect.objectContaining({
				name: 'lint',
				requiredValue: 'npm run lint:ts && npm run lint:css',
			}),
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
		).toBe(false);
	});

	test('recognizes package runners without matching ttsc arguments', () => {
		const plansLintTsReplacement = (command: string): boolean =>
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
			'echo label#value && ttsc --noEmit',
			'echo escaped\\ #value && ttsc --noEmit',
			'ttsc --noEmit;',
			'ttsc --noEmit\n',
			'ttsc --noEmit 2>&1',
			'ttsc --noEmit &>lint.log',
			'echo setup &&\nttsc --noEmit',
			'ttsc --noEmit # managed lint\n',
			'ttsc --noEmit false --noEmit',
			'ttsc --noEmit=false --noEmit=true',
		]) {
			expect(plansLintTsReplacement(command)).toBe(false);
		}
		for (const command of [
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
			'ttsc --noEmit false',
			'ttsc --noEmit=true --noEmit=false',
		]) {
			expect(plansLintTsReplacement(command)).toBe(true);
		}

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
		).toBe(false);

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
		expect(terminalAggregate).toContainEqual(
			expect.objectContaining({
				name: 'lint',
				requiredValue:
					'npm run lint:ts && npm --version run lint:ts',
			}),
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
		expect(forwardedAggregate).toContainEqual(
			expect.objectContaining({
				name: 'lint',
				requiredValue: 'npm run lint:ts',
			}),
		);
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
		expect(mixedForwardedAggregate).toContainEqual(
			expect.objectContaining({
				name: 'lint',
				requiredValue: 'npm run lint:ts && npm run lint:css',
			}),
		);
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
		expect(complexForwardedAggregate).toContainEqual(
			expect.objectContaining({
				name: 'lint',
				requiredValue:
					'npm run lint:ts && npm run lint:ts -- --noEmit false || npm run lint:css',
			}),
		);

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
				'lint.config.ts.mustache',
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
  ...${typeOnlyConfigReference}.recommended,
  rules: {
    ...${typeOnlyConfigReference}.recommended.rules,
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
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
  ...wp.configs.recommended,
  plugins: {
    ...wp.configs.recommended.plugins,
    [\`wordpress\`]: undefined,
  },
  rules: {
    ...wp.configs.recommended.rules,
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
wp.configs.recommended.plugins = {};
module.exports = {
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
  wp.configs.recommended.plugins = {};
}
disable();
module.exports = {
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
  wp.configs.recommended.plugins = {};
})();
module.exports = {
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
  wp.configs.recommended.plugins = {};
}
const helpers = { disable };
helpers.disable();
module.exports = {
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
  wp.configs.recommended.plugins = {};
}
const [run] = [disable];
run();
module.exports = {
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
  wp.configs.recommended.plugins = {};
}
const [{ run }] = [{ run: disable }];
run();
module.exports = {
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
  wp.configs.recommended.plugins = {};
}
function noop() {}
const rest = [noop, noop];
const [first, second, run] = [noop, ...rest, disable];
run();
module.exports = {
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
holder.wp.configs.recommended.plugins = {};
module.exports = {
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
					'  plugins: { ...configs.recommended.plugins },\n  rules: {',
				),
				'fixture-domain',
			),
		).toBe(true);
		expect(
			hasWordPressTtscLintConfigSource(
				replaceOnce(
					canonicalSource,
					'  rules: {',
					'  plugins: { wordpress: configs.recommended.plugins.wordpress },\n  rules: {',
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
			'  plugins: { ...configs.recommended.plugins, ...localPlugins },\n  rules: {',
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
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
  ...configs.recommended,
  rules: {
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
    ...configs.recommended.rules,
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
    ...configs.recommended.rules,
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'fixture-domain' },
    ],
  },
  ...configs.recommended,
};
`,
				'fixture-domain',
			),
		).toBe(false);
		expect(
			hasWordPressTtscLintConfigSource(
				`const { configs: wpConfigs } = require('@wp-typia/ttsc-lint-plugin-wp');
module.exports = {
  ...wpConfigs.recommended,
  rules: {
    ...wpConfigs.recommended.rules,
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
  ...wpConfigs.recommended,
  rules: {
    ...wpConfigs.recommended.rules,
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
  ...wpConfigs.recommended,
  rules: {
    ...wpConfigs.recommended.rules,
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
  ...wpConfigs.recommended,
  rules: {
    ...wpConfigs.recommended.rules,
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
  ...wpConfigs.recommended,
  rules: {
    ...wpConfigs.recommended.rules,
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
  ...configs.recommended,
  rules: {
    ...configs.recommended.rules,
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
  ...configs.recommended,
  rules: {
    ...configs.recommended.rules,
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
  ...configs.recommended,
  rules: {
    ...configs.recommended.rules,
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
holder.configs.recommended.plugins = {};
module.exports = {
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
  ...wp.configs.recommended,
  rules: {
    ...wp.configs.recommended.rules,
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
		fs.rmSync(path.join(projectDir, 'lint.config.ts'));

		const preview = getInitPlan(path.join(projectDir, 'src'));
		const applied = await applyInitPlan(path.join(projectDir, 'src'));
		const nextPackageJson = JSON.parse(
			fs.readFileSync(packageJsonPath, 'utf8'),
		) as {
			devDependencies: Record<string, string>;
			scripts: Record<string, string>;
		};
		const lintConfigSource = fs.readFileSync(
			path.join(projectDir, 'lint.config.ts'),
			'utf8',
		);

		expect(preview.status).toBe('preview');
		expect(preview.detectedLayout.kind).toBe('official-workspace');
		const dependencyInstallStep = preview.nextSteps.find((step) =>
			step.startsWith('pnpm add -D'),
		);
		expect(dependencyInstallStep).toContain('@ttsc/lint@');
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
				path: 'lint.config.ts',
			}),
		);
		expect(applied.status).toBe('applied');
		expect(
			nextPackageJson.devDependencies['@wp-typia/ttsc-lint-plugin-wp'],
		).toBe(getPackageVersions().ttscLintPluginWpPackageVersion);
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
		expect(nextPackageJson.scripts['lint:ts']).toBe('ttsc --noEmit');
		expect(nextPackageJson.scripts.lint).toBe(
			'pnpm run lint:ts && pnpm run lint:css',
		);
		expect(lintConfigSource).toContain(
			"from '@wp-typia/ttsc-lint-plugin-wp'",
		);
		expect(lintConfigSource).toContain(
			"allowedTextDomain: 'workspace-lint-domain'",
		);

		const currentPlan = getInitPlan(projectDir);
		expect(currentPlan.status).toBe('already-initialized');

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
		await applyInitPlan(projectDir);
		expect(fs.existsSync(compatPath)).toBe(true);
	});

	test('preserves project-owned lint configs during official workspace upgrades', async () => {
		const projectDir = path.join(tempRoot, 'workspace-custom-lint-config');
		await scaffoldOfficialWorkspace(projectDir);
		const lintConfigPath = path.join(projectDir, 'lint.config.ts');
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

	test('does not discover unsupported JSON lint configs', async () => {
		const projectDir = path.join(tempRoot, 'workspace-json-lint-config');
		await scaffoldOfficialWorkspace(projectDir);
		fs.rmSync(path.join(projectDir, 'lint.config.ts'));
		const jsonConfigPath = path.join(projectDir, 'lint.config.json');
		const jsonConfigSource = '{"rules":{"eqeqeq":"error"}}\n';
		fs.writeFileSync(jsonConfigPath, jsonConfigSource, 'utf8');

		const preview = getInitPlan(projectDir);

		expect(preview.plannedFiles).toContainEqual(
			expect.objectContaining({ action: 'add', path: 'lint.config.ts' }),
		);
		await applyInitPlan(projectDir);
		expect(fs.readFileSync(jsonConfigPath, 'utf8')).toBe(jsonConfigSource);
		expect(fs.existsSync(path.join(projectDir, 'lint.config.ts'))).toBe(true);
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
		expect(fs.existsSync(path.join(projectDir, 'lint.config.ts'))).toBe(true);
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
						typecheck: 'npm run sync -- --check && ttsc --noEmit',
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
			path.join(projectDir, 'lint.config.ts'),
			`import { configs } from '@wp-typia/ttsc-lint-plugin-wp';
export default {
  ...configs.recommended,
  rules: {
    ...configs.recommended.rules,
		'wordpress/i18n-text-domain': [
			'error',
			{ allowedTextDomain: 'retrofit-already-initialized' },
		],
  },
};
`,
			'utf8',
		);

		const plan = getInitPlan(projectDir);

		expect(plan.status).toBe('already-initialized');
		expect(plan.commandMode).toBe('preview-only');
		expect(plan.detectedLayout.kind).toBe('generated-project');
		expect(plan.packageChanges.addDevDependencies).toEqual([]);
		expect(plan.packageChanges.scripts).toEqual([]);
		expect(plan.plannedFiles).toEqual([]);
	});
});
