import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { applyInitPlan } from '../src/runtime/cli-init-apply.js';
import { runInitCommand } from '../src/runtime/cli-init.js';
import { getInitPlan } from '../src/runtime/cli-init-plan.js';
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
			'Apply mode writes package.json and generated helper files with rollback-on-failure protection.',
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
			dependencyChangeCount: 0,
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
				/restored the previous package\.json\/helper-file snapshot/i,
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
			'export {};\n',
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

		const plan = getInitPlan(projectDir);

		expect(plan.status).toBe('already-initialized');
		expect(plan.commandMode).toBe('preview-only');
		expect(plan.detectedLayout.kind).toBe('generated-project');
		expect(plan.packageChanges.addDevDependencies).toEqual([]);
		expect(plan.packageChanges.scripts).toEqual([]);
		expect(plan.plannedFiles).toEqual([]);
	});
});
