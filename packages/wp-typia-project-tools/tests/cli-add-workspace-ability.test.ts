import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  cleanupScaffoldTempRoot,
  createScaffoldTempRoot,
  entryPath,
  getCommandErrorMessage,
  linkWorkspaceNodeModules,
  parseJsonObjectFromOutput,
  runCli,
  runGeneratedScript,
  scaffoldOfficialWorkspace,
  typecheckGeneratedProject,
} from './helpers/scaffold-test-harness.js';
import { readWorkspaceInventory } from '../src/runtime/workspace-inventory.js';

async function scaffoldAbilityWorkspace(
	targetDir: string,
	workspaceSlug: string,
	workspaceTitle: string,
	workspaceDescription: string,
) {
  await scaffoldOfficialWorkspace(targetDir, {
    description: workspaceDescription,
    slug: workspaceSlug,
    title: workspaceTitle,
  });

  linkWorkspaceNodeModules(targetDir);
}

function seedLegacyAbilityWorkspace(targetDir: string, workspaceSlug: string) {
  const packageJsonPath = path.join(targetDir, 'package.json');
  const seededPackageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
  };
  seededPackageJson.dependencies = {
    ...(seededPackageJson.dependencies ?? {}),
    '@wordpress/abilities': '^0.9.0',
    '@wordpress/core-abilities': '^0.8.0',
  };
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(seededPackageJson, null, '\t')}\n`,
  );

  const bootstrapPath = path.join(targetDir, `${workspaceSlug}.php`);
  fs.writeFileSync(
		bootstrapPath,
		`${fs.readFileSync(bootstrapPath, 'utf8').trimEnd()}

function demo_space_enqueue_workflow_abilities() {
\t// Legacy ability enqueue marker.
\t// wp_enqueue_script_module( is only mentioned here, not called.
\t$legacy_note = 'wp_enqueue_script_module(';
\twp_enqueue_script(
\t\t'demo-space-legacy-abilities',
\t\tplugins_url( 'build/abilities/index.js', __FILE__ ),
\t\tarray(),
\t\t'1.0.0',
\t\ttrue
\t);
}
`,
	);
}

describe('@wp-typia/project-tools cli-add-workspace ability', () => {
	const tempRoot = createScaffoldTempRoot('wp-typia-add-ability-');

	afterAll(() => {
		cleanupScaffoldTempRoot(tempRoot);
	});

	test('ability add validates names before mutating the workspace', async () => {
		const targetDir = path.join(tempRoot, 'demo-workspace-add-ability-invalid');

		await scaffoldAbilityWorkspace(
			targetDir,
			'demo-workspace-add-ability-invalid',
			'Demo Workspace Add Ability Invalid',
			'Demo workspace add ability invalid',
		);

		const errorMessage = getCommandErrorMessage(() =>
			runCli('node', [entryPath, 'add', 'ability', '1review-workflow'], {
				cwd: targetDir,
			}),
		);
		expect(errorMessage).toContain(
			'Ability name must start with a letter and contain only lowercase letters, numbers, and hyphens.',
		);
		expect(
			fs.existsSync(path.join(targetDir, 'src', 'abilities', 'review-workflow')),
		).toBe(false);
		expect(
			fs.existsSync(
				path.join(targetDir, 'inc', 'abilities', 'review-workflow.php'),
			),
		).toBe(false);
		expect(readWorkspaceInventory(targetDir).abilities).toHaveLength(0);
	}, 20_000);

	test('ability add rolls back when legacy bootstrap function range is unsafe', async () => {
		const targetDir = path.join(tempRoot, 'demo-workspace-add-ability-unsafe-bootstrap');
		const workspaceSlug = 'demo-workspace-add-ability-unsafe-bootstrap';

		await scaffoldAbilityWorkspace(
			targetDir,
			workspaceSlug,
			'Demo Workspace Add Ability Unsafe Bootstrap',
			'Demo workspace add ability unsafe bootstrap',
		);

		const bootstrapPath = path.join(targetDir, `${workspaceSlug}.php`);
		fs.writeFileSync(
			bootstrapPath,
			`${fs.readFileSync(bootstrapPath, 'utf8').trimEnd()}

function demo_space_enqueue_workflow_abilities() {
\t$payload = <<<JSON
{
\t"brace": "{"
}
`,
			'utf8',
		);

		const errorMessage = getCommandErrorMessage(() =>
			runCli('node', [entryPath, 'add', 'ability', 'review-workflow'], {
				cwd: targetDir,
			}),
		);

		expect(errorMessage).toContain(
			`Unable to repair ${workspaceSlug}.php for demo_space_enqueue_workflow_abilities.`,
		);
		expect(
			fs.existsSync(path.join(targetDir, 'src', 'abilities', 'review-workflow')),
		).toBe(false);
		expect(
			fs.existsSync(
				path.join(targetDir, 'inc', 'abilities', 'review-workflow.php'),
			),
		).toBe(false);
		expect(readWorkspaceInventory(targetDir).abilities).toHaveLength(0);
	}, 20_000);

	test('canonical CLI can add a typed workflow ability to an official workspace template', async () => {
		const targetDir = path.join(tempRoot, 'demo-workspace-add-ability');
		const workspaceSlug = 'demo-workspace-add-ability';

		await scaffoldAbilityWorkspace(
			targetDir,
			workspaceSlug,
			'Demo Workspace Add Ability',
			'Demo workspace add ability',
		);
		seedLegacyAbilityWorkspace(targetDir, workspaceSlug);

		runCli('node', [entryPath, 'add', 'ability', 'review-workflow'], {
			cwd: targetDir,
		});

		const blockConfigSource = fs.readFileSync(
			path.join(targetDir, 'scripts', 'block-config.ts'),
			'utf8',
		);
		const bootstrapSource = fs.readFileSync(
			path.join(targetDir, `${workspaceSlug}.php`),
			'utf8',
		);
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'),
		) as {
			dependencies?: Record<string, string>;
			scripts?: Record<string, string>;
		};
		const syncProjectSource = fs.readFileSync(
			path.join(targetDir, 'scripts', 'sync-project.ts'),
			'utf8',
		);
		const syncAbilitiesSource = fs.readFileSync(
			path.join(targetDir, 'scripts', 'sync-abilities.ts'),
			'utf8',
		);
		const buildWorkspaceSource = fs.readFileSync(
			path.join(targetDir, 'scripts', 'build-workspace.mjs'),
			'utf8',
		);
		const webpackSource = fs.readFileSync(
			path.join(targetDir, 'webpack.config.js'),
			'utf8',
		);
		const abilitiesIndexSource = fs.readFileSync(
			path.join(targetDir, 'src', 'abilities', 'index.ts'),
			'utf8',
		);
		const typesSource = fs.readFileSync(
			path.join(targetDir, 'src', 'abilities', 'review-workflow', 'types.ts'),
			'utf8',
		);
		const dataSource = fs.readFileSync(
			path.join(targetDir, 'src', 'abilities', 'review-workflow', 'data.ts'),
			'utf8',
		);
		const abilityConfig = JSON.parse(
			fs.readFileSync(
				path.join(
					targetDir,
					'src',
					'abilities',
					'review-workflow',
					'ability.config.json',
				),
				'utf8',
			),
		) as {
			abilityId?: string;
			category?: { slug?: string };
		};
		const phpSource = fs.readFileSync(
			path.join(targetDir, 'inc', 'abilities', 'review-workflow.php'),
			'utf8',
		);
		const inventory = readWorkspaceInventory(targetDir);
		const abilityEntry = inventory.abilities.find(
			(entry) => entry.slug === 'review-workflow',
		);

		expect(blockConfigSource).toContain('slug: "review-workflow"');
		expect(blockConfigSource).toContain(
			'configFile: "src/abilities/review-workflow/ability.config.json"',
		);
		expect(blockConfigSource).toContain(
			'inputTypeName: "ReviewWorkflowAbilityInput"',
		);
		expect(blockConfigSource).toContain(
			'outputTypeName: "ReviewWorkflowAbilityOutput"',
		);
		expect(blockConfigSource).toContain('"mode": "required"');
		expect(blockConfigSource).toContain('"hardMinimums": {');
		expect(blockConfigSource).toContain('"wordpress": "7.0"');
		expect(blockConfigSource).toContain('WordPress Abilities API');
		expect(blockConfigSource).toContain('@wordpress/core-abilities');
		expect(bootstrapSource).toContain('Requires at least: 7.0');
		expect(bootstrapSource).toContain('Tested up to:      7.0');
		expect(bootstrapSource).toContain('inc/abilities/*.php');
		expect(bootstrapSource).toContain('build/abilities/index.js');
		expect(bootstrapSource).toContain('wp_enqueue_script_module');
		expect(bootstrapSource).toContain('@wordpress/core-abilities');
		expect(bootstrapSource).toContain('@wordpress/abilities');
		expect(bootstrapSource).not.toContain('Legacy ability enqueue marker');
		expect(
			bootstrapSource.match(/function demo_space_enqueue_workflow_abilities/g)
				?.length,
		).toBe(1);
		expect(bootstrapSource).toContain('plugins_loaded');
		expect(bootstrapSource).toContain('admin_enqueue_scripts');
		expect(packageJson.dependencies?.['@wordpress/abilities']).toBe('^0.10.0');
		expect(packageJson.dependencies?.['@wordpress/core-abilities']).toBe('^0.9.0');
		expect(packageJson.scripts?.['sync-abilities']).toBe(
			'ttsx scripts/sync-abilities.ts',
		);
		expect(syncProjectSource).toContain('const syncAbilitiesScriptPath');
		expect(syncProjectSource).toContain(
			'runSyncScript( syncAbilitiesScriptPath, options );',
		);
		expect(syncAbilitiesSource).toContain('ABILITIES');
		expect(syncAbilitiesSource).toContain('syncTypeSchemas');
		expect(buildWorkspaceSource).toContain("'src/abilities/index.ts'");
		expect(webpackSource).toContain("'abilities/index'");
		expect(abilitiesIndexSource).toContain('./review-workflow/client');
		expect(typesSource).toContain('export interface ReviewWorkflowAbilityInput');
		expect(typesSource).toContain(
			'export interface ReviewWorkflowAbilityOutput',
		);
		expect(dataSource).toContain("from '@wordpress/abilities'");
		expect(dataSource).toContain('@wordpress/core-abilities');
		expect(dataSource).toContain('waitForReviewWorkflowAbilityRegistration');
		expect(dataSource).toContain('getRegisteredAbility');
		expect(dataSource).not.toContain('globalThis');
		expect(abilityConfig.abilityId).toBe('demo-space/review-workflow');
		expect(abilityConfig.category?.slug).toBe('demo-space-workflows');
		expect(phpSource).toContain('wp_register_ability_category');
		expect(phpSource).toContain('wp_register_ability(');
		expect(phpSource).toContain('input.schema.json');
		expect(phpSource).toContain('output.schema.json');
		expect(abilityEntry).toEqual({
			clientFile: 'src/abilities/review-workflow/client.ts',
			compatibility: {
				hardMinimums: {
					wordpress: '7.0',
				},
				mode: 'required',
				optionalFeatureIds: [],
				optionalFeatures: [],
				requiredFeatureIds: [
					'wordpress-server-abilities',
					'wordpress-core-abilities',
				],
				requiredFeatures: [
					'WordPress Abilities API',
					'@wordpress/core-abilities',
				],
				runtimeGates: [
					'WordPress Abilities API: php-function wp_register_ability',
					'WordPress Abilities API: php-function wp_register_ability_category',
					'@wordpress/core-abilities: script-package @wordpress/core-abilities',
				],
			},
			configFile: 'src/abilities/review-workflow/ability.config.json',
			dataFile: 'src/abilities/review-workflow/data.ts',
			inputSchemaFile: 'src/abilities/review-workflow/input.schema.json',
			inputTypeName: 'ReviewWorkflowAbilityInput',
			outputSchemaFile: 'src/abilities/review-workflow/output.schema.json',
			outputTypeName: 'ReviewWorkflowAbilityOutput',
			phpFile: 'inc/abilities/review-workflow.php',
			slug: 'review-workflow',
			typesFile: 'src/abilities/review-workflow/types.ts',
		});

		expect(
			fs.existsSync(
				path.join(
					targetDir,
					'src',
					'abilities',
					'review-workflow',
					'input.schema.json',
				),
			),
		).toBe(true);
		expect(
			fs.existsSync(
				path.join(
					targetDir,
					'src',
					'abilities',
					'review-workflow',
					'output.schema.json',
				),
			),
		).toBe(true);

		const doctorOutput = runCli(
			'node',
			[entryPath, 'doctor', '--format', 'json'],
			{
				cwd: targetDir,
			},
		);
		const doctorChecks = parseJsonObjectFromOutput<{
			checks: Array<{ detail: string; label: string; status: string }>;
		}>(doctorOutput);
		expect(
			doctorChecks.checks.find((check) => check.label === 'Ability bootstrap')
				?.status,
		).toBe('pass');
		expect(
			doctorChecks.checks.find((check) => check.label === 'Abilities index')
				?.status,
		).toBe('pass');
		expect(
			doctorChecks.checks.find(
				(check) => check.label === 'Ability config review-workflow',
			)?.status,
		).toBe('pass');
		expect(
			doctorChecks.checks.find(
				(check) => check.label === 'Ability review-workflow',
			)?.status,
		).toBe('pass');

		const wordpressVersionDoctorOutput = runCli(
			'node',
			[entryPath, 'doctor', '--wp-version-check', '--format', 'json'],
			{
				cwd: targetDir,
			},
		);
		const wordpressVersionDoctorChecks = parseJsonObjectFromOutput<{
			checks: Array<{ code?: string; detail: string; status: string }>;
			summary: { exitCode: 0 | 1; exitFailureCount: number };
		}>(wordpressVersionDoctorOutput);
		const featureMinimumCheck = wordpressVersionDoctorChecks.checks.find(
			(check) => check.code === 'wp-typia.workspace.wordpress.feature-minimum',
		);
		const testedTargetCheck = wordpressVersionDoctorChecks.checks.find(
			(check) => check.code === 'wp-typia.workspace.wordpress.tested-target',
		);
		expect(wordpressVersionDoctorChecks.summary.exitCode).toBe(0);
		expect(wordpressVersionDoctorChecks.summary.exitFailureCount).toBe(0);
		expect(featureMinimumCheck?.status).toBe('pass');
		expect(featureMinimumCheck?.detail).toContain('Requires at least 7.0');
		expect(featureMinimumCheck?.detail).toContain('feature floor 7.0');
		expect(featureMinimumCheck?.detail).toContain(
			'Ability review-workflow compatibility metadata',
		);
		expect(testedTargetCheck?.status).toBe('pass');
		expect(testedTargetCheck?.detail).toContain('Tested up to 7.0');

		runGeneratedScript(targetDir, 'scripts/sync-abilities.ts', ['--check']);
		typecheckGeneratedProject(targetDir);
	}, 30_000);

	test('ability add preserves custom shared build and webpack entries', async () => {
		const targetDir = path.join(tempRoot, 'demo-workspace-add-ability-custom-entries');
		const workspaceSlug = 'demo-workspace-add-ability-custom-entries';

		await scaffoldAbilityWorkspace(
			targetDir,
			workspaceSlug,
			'Demo Workspace Add Ability Custom Entries',
			'Demo workspace add ability custom entries',
		);
		seedLegacyAbilityWorkspace(targetDir, workspaceSlug);

		const buildWorkspacePath = path.join(targetDir, 'scripts', 'build-workspace.mjs');
		const webpackConfigPath = path.join(targetDir, 'webpack.config.js');
		const initialBuildWorkspaceSource = fs.readFileSync(buildWorkspacePath, 'utf8');
		const initialWebpackSource = fs.readFileSync(webpackConfigPath, 'utf8');
		const customBuildEntry = "\t\t'src/custom-tools/index.ts',\n";
		const customWebpackTuple = [
			'\t\t[',
			"\t\t\t'custom-tools/index',",
			"\t\t\t[ 'src/custom-tools/index.ts', 'src/custom-tools/index.js' ],",
			'\t\t],',
			'',
		].join('\n');
		const seededBuildWorkspaceSource = initialBuildWorkspaceSource.replace(
			/('src\/editor-plugins\/index\.js',\n)/u,
			`$1${customBuildEntry}`,
		);
		const seededWebpackSource = initialWebpackSource.replace(
			/(\t\t\[\n\t\t\t'editor-plugins\/index',\n\t\t\t\[ 'src\/editor-plugins\/index\.ts', 'src\/editor-plugins\/index\.js' \],\n\t\t\],\n)/u,
			`$1${customWebpackTuple}`,
		);

		expect(seededBuildWorkspaceSource).not.toBe(initialBuildWorkspaceSource);
		expect(seededWebpackSource).not.toBe(initialWebpackSource);

		fs.writeFileSync(buildWorkspacePath, seededBuildWorkspaceSource, 'utf8');
		fs.writeFileSync(webpackConfigPath, seededWebpackSource, 'utf8');

		runCli('node', [entryPath, 'add', 'ability', 'review-workflow'], {
			cwd: targetDir,
		});

		const buildWorkspaceSource = fs.readFileSync(buildWorkspacePath, 'utf8');
		const webpackSource = fs.readFileSync(webpackConfigPath, 'utf8');

		expect(buildWorkspaceSource).toContain("'src/custom-tools/index.ts'");
		expect(buildWorkspaceSource).toContain("'src/abilities/index.ts'");
		expect(webpackSource).toContain("'custom-tools/index'");
		expect(webpackSource).toContain("'abilities/index'");
		expect(
			buildWorkspaceSource.match(/'src\/abilities\/index\.(?:ts|js)'/g)?.length,
		).toBe(2);
		expect(webpackSource.match(/'abilities\/index'/g)?.length).toBe(1);
	}, 20_000);

	test('ability add keeps extension-suffixed registry entries when rewriting the generated section', async () => {
		const targetDir = path.join(
			tempRoot,
			'demo-workspace-add-ability-extension-registry',
		);
		const workspaceSlug = 'demo-workspace-add-ability-extension-registry';

		await scaffoldAbilityWorkspace(
			targetDir,
			workspaceSlug,
			'Demo Workspace Add Ability Extension Registry',
			'Demo workspace add ability extension registry',
		);
		seedLegacyAbilityWorkspace(targetDir, workspaceSlug);

		const abilitiesDir = path.join(targetDir, 'src', 'abilities');
		fs.mkdirSync(abilitiesDir, { recursive: true });
		const abilitiesIndexPath = path.join(abilitiesDir, 'index.js');
		fs.writeFileSync(
			abilitiesIndexPath,
			`// wp-typia add ability entries start
export * from './legacy-workflow/client.js';
// wp-typia add ability entries end
`,
			'utf8',
		);

		runCli('node', [entryPath, 'add', 'ability', 'review-workflow'], {
			cwd: targetDir,
		});

		const abilitiesIndexSource = fs.readFileSync(abilitiesIndexPath, 'utf8');

		expect(abilitiesIndexSource).toContain(
			"export * from './legacy-workflow/client';",
		);
		expect(abilitiesIndexSource).toContain(
			"export * from './review-workflow/client';",
		);
	}, 20_000);

	test('ability duplicate failures preserve generated workspace files', async () => {
		const targetDir = path.join(tempRoot, 'demo-workspace-add-ability-rollback');
		const workspaceSlug = 'demo-workspace-add-ability-rollback';

		await scaffoldAbilityWorkspace(
			targetDir,
			workspaceSlug,
			'Demo Workspace Add Ability Rollback',
			'Demo workspace add ability rollback',
		);
		seedLegacyAbilityWorkspace(targetDir, workspaceSlug);

		runCli('node', [entryPath, 'add', 'ability', 'review-workflow'], {
			cwd: targetDir,
		});

		const originalConfigSource = fs.readFileSync(
			path.join(targetDir, 'scripts', 'block-config.ts'),
			'utf8',
		);
		const originalPhpSource = fs.readFileSync(
			path.join(targetDir, 'inc', 'abilities', 'review-workflow.php'),
			'utf8',
		);

		expect(
			getCommandErrorMessage(() =>
				runCli('node', [entryPath, 'add', 'ability', 'review-workflow'], {
					cwd: targetDir,
				}),
			),
		).toContain('An ability scaffold already exists');

		expect(
			fs.readFileSync(path.join(targetDir, 'scripts', 'block-config.ts'), 'utf8'),
		).toBe(originalConfigSource);
		expect(
			fs.readFileSync(
				path.join(targetDir, 'inc', 'abilities', 'review-workflow.php'),
				'utf8',
			),
		).toBe(originalPhpSource);
		expect(
			readWorkspaceInventory(targetDir).abilities.filter(
				(entry) => entry.slug === 'review-workflow',
			),
		).toHaveLength(1);
	}, 20_000);
});
