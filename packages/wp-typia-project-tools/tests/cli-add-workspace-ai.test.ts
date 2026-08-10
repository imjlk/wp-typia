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
import { ensureBlockConfigCanAddRestManifests } from '../src/runtime/add/cli-add-block-legacy-validator.js';
import { readWorkspaceInventory } from '../src/runtime/workspace-inventory.js';

test('REST manifest support reuses the managed metadata-core import', () => {
  const source = [
    'import {',
    '  defineBlockNesting,',
    '  defineInnerBlocksTemplates,',
    "} from '@wp-typia/block-runtime/metadata-core';",
    '',
  ].join('\n');

  const updated = ensureBlockConfigCanAddRestManifests(source);

  expect(updated.match(/@wp-typia\/block-runtime\/metadata-core/gu)).toHaveLength(
    1,
  );
  expect(updated).toContain('  defineEndpointManifest,');
  expect(ensureBlockConfigCanAddRestManifests(updated)).toBe(updated);
});

test('REST manifest support repairs unusual metadata-core named imports', () => {
  const inlineTypeOnlySource =
    "import { type defineEndpointManifest, defineBlockNesting } from '@wp-typia/block-runtime/metadata-core';\n";
  const repairedTypeOnlySource =
    ensureBlockConfigCanAddRestManifests(inlineTypeOnlySource);

  expect(repairedTypeOnlySource).toBe(
    "import { defineEndpointManifest, defineBlockNesting } from '@wp-typia/block-runtime/metadata-core';\n",
  );

  const clauseTypeOnlySource =
    "import type { defineEndpointManifest } from '@wp-typia/block-runtime/metadata-core';\n";
  expect(ensureBlockConfigCanAddRestManifests(clauseTypeOnlySource)).toBe(
    "import { defineEndpointManifest } from '@wp-typia/block-runtime/metadata-core';\n",
  );

  const compactClauseTypeOnlySource =
    "import /* keep type context */ type{ defineEndpointManifest } from '@wp-typia/block-runtime/metadata-core';\n";
  expect(ensureBlockConfigCanAddRestManifests(compactClauseTypeOnlySource)).toBe(
    "import /* keep type context */ { defineEndpointManifest } from '@wp-typia/block-runtime/metadata-core';\n",
  );

  const defaultClauseTypeOnlySource =
    "import type MetadataCore, { defineEndpointManifest } from '@wp-typia/block-runtime/metadata-core';\n";
  expect(ensureBlockConfigCanAddRestManifests(defaultClauseTypeOnlySource)).toBe(
    [
      "import { defineEndpointManifest } from '@wp-typia/block-runtime/metadata-core';",
      "import type MetadataCore from '@wp-typia/block-runtime/metadata-core';",
      '',
    ].join('\n'),
  );

  const mixedClauseTypeOnlySource =
    "import type { MetadataCoreOptions, defineEndpointManifest } from '@wp-typia/block-runtime/metadata-core';\n";
  expect(ensureBlockConfigCanAddRestManifests(mixedClauseTypeOnlySource)).toBe(
    [
      "import { defineEndpointManifest } from '@wp-typia/block-runtime/metadata-core';",
      "import type { MetadataCoreOptions } from '@wp-typia/block-runtime/metadata-core';",
      '',
    ].join('\n'),
  );

  const middleClauseTypeOnlySource =
    "import type { MetadataCoreOptions, defineEndpointManifest, RuntimeOptions } from '@wp-typia/block-runtime/metadata-core';\n";
  expect(ensureBlockConfigCanAddRestManifests(middleClauseTypeOnlySource)).toBe(
    [
      "import { defineEndpointManifest } from '@wp-typia/block-runtime/metadata-core';",
      "import type { MetadataCoreOptions, RuntimeOptions } from '@wp-typia/block-runtime/metadata-core';",
      '',
    ].join('\n'),
  );

  const commentedEmptySource = [
    'import {',
    '  /* generated imports */',
    "} from '@wp-typia/block-runtime/metadata-core';",
    '',
  ].join('\n');
  const repairedEmptySource =
    ensureBlockConfigCanAddRestManifests(commentedEmptySource);

  expect(repairedEmptySource).toContain('  defineEndpointManifest,\n');
  expect(repairedEmptySource).toContain('  /* generated imports */');
  expect(ensureBlockConfigCanAddRestManifests(repairedEmptySource)).toBe(
    repairedEmptySource,
  );

  const inlineEmptySource =
    "import { } from '@wp-typia/block-runtime/metadata-core';\n";
  expect(ensureBlockConfigCanAddRestManifests(inlineEmptySource)).toBe(
    "import { defineEndpointManifest } from '@wp-typia/block-runtime/metadata-core';\n",
  );

  const trailingCommaSource =
    "import { defineBlockNesting, } from '@wp-typia/block-runtime/metadata-core';\n";
  expect(ensureBlockConfigCanAddRestManifests(trailingCommaSource)).toBe(
    "import { defineBlockNesting, defineEndpointManifest } from '@wp-typia/block-runtime/metadata-core';\n",
  );

  const commaInCommentSource = [
    'import {',
    '  defineBlockNesting // keep this, generated',
    "} from '@wp-typia/block-runtime/metadata-core';",
    '',
  ].join('\n');
  expect(ensureBlockConfigCanAddRestManifests(commaInCommentSource)).toContain(
    'defineBlockNesting, // keep this, generated\n  defineEndpointManifest,',
  );

  const mixedBindingLayoutSource = [
    'import { defineBlockNesting,',
    "  defineInnerBlocksTemplates } from '@wp-typia/block-runtime/metadata-core';",
    '',
  ].join('\n');
  expect(ensureBlockConfigCanAddRestManifests(mixedBindingLayoutSource)).toBe(
    [
      'import { defineBlockNesting,',
      '  defineInnerBlocksTemplates,',
      '  defineEndpointManifest,',
      "} from '@wp-typia/block-runtime/metadata-core';",
      '',
    ].join('\n'),
  );

  const mixedIndentationSource = [
    'function example() {',
    '\treturn true;',
    '}',
    'import {',
    "} from '@wp-typia/block-runtime/metadata-core';",
    '',
  ].join('\n');
  expect(ensureBlockConfigCanAddRestManifests(mixedIndentationSource)).toContain(
    '{\n  defineEndpointManifest,\n}',
  );

  const aliasedExportSource =
    "import { type defineEndpointManifest as EndpointManifest, defineBlockNesting } from '@wp-typia/block-runtime/metadata-core';\n";
  const repairedAliasedExport =
    ensureBlockConfigCanAddRestManifests(aliasedExportSource);
  expect(repairedAliasedExport).toContain(
    'type defineEndpointManifest as EndpointManifest, defineBlockNesting, defineEndpointManifest',
  );

  const aliasedLocalBindingSource =
    "import { type endpointManifest as defineEndpointManifest, defineBlockNesting } from '@wp-typia/block-runtime/metadata-core';\n";
  expect(ensureBlockConfigCanAddRestManifests(aliasedLocalBindingSource)).toBe(
    "import { endpointManifest as defineEndpointManifest, defineBlockNesting } from '@wp-typia/block-runtime/metadata-core';\n",
  );
});

test('REST manifest support scans every metadata-core import before mutating', () => {
  const source = [
    "import type { MetadataCoreOptions } from '@wp-typia/block-runtime/metadata-core';",
    'import {',
    '  defineBlockNesting,',
    "} from '@wp-typia/block-runtime/metadata-core';",
    '',
  ].join('\n');

  const updated = ensureBlockConfigCanAddRestManifests(source);

  expect(updated).toContain('  defineEndpointManifest,');
  expect(updated).not.toContain(
    "import { defineEndpointManifest } from '@wp-typia/block-runtime/metadata-core';",
  );
});

describe('@wp-typia/project-tools cli-add-workspace ai-feature', () => {
	const tempRoot = createScaffoldTempRoot('wp-typia-add-ai-feature-');

	afterAll(() => {
		cleanupScaffoldTempRoot(tempRoot);
	});

	test('ai-feature add validates names and namespaces before mutating the workspace', async () => {
		const targetDir = path.join(tempRoot, 'demo-workspace-add-ai-feature-invalid');

		await scaffoldOfficialWorkspace(targetDir, {
			description: 'Demo workspace add ai feature invalid',
			slug: 'demo-workspace-add-ai-feature-invalid',
			title: 'Demo Workspace Add AI Feature Invalid',
		});

		linkWorkspaceNodeModules(targetDir);

		const invalidNameError = getCommandErrorMessage(() =>
			runCli('node', [entryPath, 'add', 'ai-feature', '1brief-suggestions'], {
				cwd: targetDir,
			}),
		);
		expect(invalidNameError).toContain(
			'AI feature name must start with a letter and contain only lowercase letters, numbers, and hyphens.',
		);

		const invalidNamespaceError = getCommandErrorMessage(() =>
			runCli(
				'node',
				[
					entryPath,
					'add',
					'ai-feature',
					'brief-suggestions',
					'--namespace',
					'DemoSpace',
				],
				{
					cwd: targetDir,
				},
			),
		);
		expect(invalidNamespaceError).toContain(
			'REST resource namespace must use lowercase slash-separated segments like `demo-space/v1`.',
		);

		expect(
			fs.existsSync(
				path.join(targetDir, 'src', 'ai-features', 'brief-suggestions'),
			),
		).toBe(false);
		expect(
			fs.existsSync(
				path.join(targetDir, 'inc', 'ai-features', 'brief-suggestions.php'),
			),
		).toBe(false);
		expect(readWorkspaceInventory(targetDir).aiFeatures).toHaveLength(0);
	}, 20_000);

	test('canonical CLI can add a server-only AI feature to an official workspace template', async () => {
		const targetDir = path.join(tempRoot, 'demo-workspace-add-ai-feature');

		await scaffoldOfficialWorkspace(targetDir, {
			description: 'Demo workspace add ai feature',
			slug: 'demo-workspace-add-ai-feature',
			title: 'Demo Workspace Add AI Feature',
		});

		linkWorkspaceNodeModules(targetDir);

		runCli(
			'node',
			[
				entryPath,
				'add',
				'ai-feature',
				'brief-suggestions',
				'--namespace',
				'demo-space/v1',
			],
			{
				cwd: targetDir,
			},
		);

		const blockConfigSource = fs.readFileSync(
			path.join(targetDir, 'scripts', 'block-config.ts'),
			'utf8',
		);
		const bootstrapSource = fs.readFileSync(
			path.join(targetDir, 'demo-workspace-add-ai-feature.php'),
			'utf8',
		);
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'),
		) as {
			devDependencies?: Record<string, string>;
			scripts?: Record<string, string>;
		};
		const syncProjectSource = fs.readFileSync(
			path.join(targetDir, 'scripts', 'sync-project.ts'),
			'utf8',
		);
		const syncRestSource = fs.readFileSync(
			path.join(targetDir, 'scripts', 'sync-rest-contracts.ts'),
			'utf8',
		);
		const syncAiSource = fs.readFileSync(
			path.join(targetDir, 'scripts', 'sync-ai-features.ts'),
			'utf8',
		);
		const typesSource = fs.readFileSync(
			path.join(
				targetDir,
				'src',
				'ai-features',
				'brief-suggestions',
				'api-types.ts',
			),
			'utf8',
		);
		const validatorsSource = fs.readFileSync(
			path.join(
				targetDir,
				'src',
				'ai-features',
				'brief-suggestions',
				'api-validators.ts',
			),
			'utf8',
		);
		const apiSource = fs.readFileSync(
			path.join(targetDir, 'src', 'ai-features', 'brief-suggestions', 'api.ts'),
			'utf8',
		);
		const dataSource = fs.readFileSync(
			path.join(
				targetDir,
				'src',
				'ai-features',
				'brief-suggestions',
				'data.ts',
			),
			'utf8',
		);
		const phpSource = fs.readFileSync(
			path.join(targetDir, 'inc', 'ai-features', 'brief-suggestions.php'),
			'utf8',
		);
		const inventory = readWorkspaceInventory(targetDir);
		const aiFeatureEntry = inventory.aiFeatures.find(
			(entry) => entry.slug === 'brief-suggestions',
		);

		expect(blockConfigSource).toContain("slug: 'brief-suggestions'");
		expect(blockConfigSource).toContain("namespace: 'demo-space/v1'");
		expect(blockConfigSource).toContain(
			"aiSchemaFile: 'src/ai-features/brief-suggestions/ai-schemas/feature-result.ai.schema.json'",
		);
		expect(blockConfigSource).toContain(
			"apiFile: 'src/ai-features/brief-suggestions/api.ts'",
		);
		expect(blockConfigSource).toContain(
			"phpFile: 'inc/ai-features/brief-suggestions.php'",
		);
		expect(blockConfigSource).toContain("mode: 'optional'");
		expect(blockConfigSource).toContain('optionalFeatureIds: [');
		expect(blockConfigSource).toContain("'wordpress-ai-client'");
		expect(blockConfigSource).toContain('WordPress AI Client');
		expect(blockConfigSource).toContain(
			'WordPress AI Client: wordpress-core-feature WordPress AI Client',
		);
		expect(blockConfigSource).toContain('defineEndpointManifest');
		expect(bootstrapSource).toContain('Requires at least: 6.7');
		expect(bootstrapSource).toContain('Tested up to:      7.0');
		expect(bootstrapSource).toContain(
			'function demo_space_register_ai_features()',
		);
		expect(bootstrapSource).toContain(
			"require_once __DIR__ . '/inc/ai-features/wp-typia-modules.php';",
		);
		const aiManifestSource = fs.readFileSync(
			path.join(targetDir, 'inc', 'ai-features', 'wp-typia-modules.php'),
			'utf8',
		);
		expect(aiManifestSource).toContain(
			"require_once __DIR__ . '/brief-suggestions.php';",
		);
		expect(packageJson.scripts?.['sync-ai']).toBe('ttsx scripts/sync-ai-features.ts');
		expect(packageJson.devDependencies?.['@wp-typia/project-tools']).toBeDefined();
		expect(syncProjectSource).toContain('const syncAiScriptPath');
		expect(syncProjectSource).toContain(
			'runSyncScript(syncAiScriptPath, options);',
		);
		expect(syncRestSource).toContain('AI_FEATURES');
		expect(syncRestSource).toContain('isWorkspaceAiFeature');
		expect(syncRestSource).toContain('const aiFeatures = AI_FEATURES.filter');
		expect(syncAiSource).toContain('@wp-typia/project-tools/ai-artifacts');
		expect(syncAiSource).toContain('projectWordPressAiSchema');
		expect(typesSource).toContain(
			'export interface BriefSuggestionsAiFeatureRequest',
		);
		expect(typesSource).toContain(
			'export interface BriefSuggestionsAiFeatureResponse',
		);
		expect(typesSource).toContain("providerType: 'client' | 'cloud' | 'server'");
		expect(validatorsSource).toContain('featureRequest');
		expect(validatorsSource).toContain('featureResponse');
		expect(apiSource).toContain('aiFeatureRunEndpoint');
		expect(apiSource).toContain('aiFeatureSupportMetadata');
		expect(apiSource).toContain('getAiFeatureSupportHintLines');
		expect(apiSource).toContain('isAiFeatureSupportUnavailableError');
		expect(apiSource).toContain('resolveAiFeatureUnavailableMessage');
		expect(apiSource).toContain('missing-wordpress-ai-client');
		expect(apiSource).toContain('request-time-support-probe');
		expect(apiSource).toContain("endpointMethod: 'POST'");
		expect(apiSource).toContain('resolveRestNonce');
		expect(dataSource).toContain('useRunBriefSuggestionsAiFeatureMutation');
		expect(dataSource).toContain('aiFeatureSupportMetadata');
		expect(dataSource).toContain('getAiFeatureSupportHintLines');
		expect(dataSource).toContain('isAiFeatureSupportUnavailableError');
		expect(dataSource).toContain('resolveAiFeatureUnavailableMessage');
		expect(phpSource).toContain('wp_ai_client_prompt');
		expect(phpSource).toContain('static $is_supported = null;');
		expect(phpSource).toContain('is_supported_for_text_generation');
		expect(phpSource).toContain('generate_text_result');
		expect(phpSource).toContain('using_model_preference');
		expect(phpSource).toContain('is_wp_error( $permission )');
		expect(phpSource).toContain(
			'this server-only endpoint avoids WordPress script-module enqueue APIs',
		);
		expect(phpSource).not.toContain('wp_enqueue_script_module(');
		expect(phpSource).toContain('admin_notices');
		expect(phpSource).toContain('sprintf(');
		expect(phpSource).toContain('The %s AI feature is optional');
		expect(phpSource).toContain('optional and remains disabled');
		expect(phpSource).toContain(
			'Customization hooks for the Brief Suggestions AI feature:',
		);
		expect(phpSource).toContain(
			"'demo_space_brief_suggestions_ai_feature_permission'",
		);
		expect(phpSource).toContain(
			"'demo_space_brief_suggestions_ai_feature_prompt_payload'",
		);
		expect(phpSource).toContain(
			"'demo_space_brief_suggestions_ai_feature_prompt'",
		);
		expect(phpSource).toContain(
			"'demo_space_brief_suggestions_ai_feature_prompt_options'",
		);
		expect(phpSource).toContain(
			"'demo_space_brief_suggestions_ai_feature_admin_notice_message'",
		);
		expect(phpSource).toContain(
			"'demo_space_brief_suggestions_ai_feature_unavailable_message'",
		);
		expect(phpSource).toContain(
			"'demo_space_brief_suggestions_ai_feature_telemetry'",
		);
		expect(phpSource).toContain('`temperature` and `modelPreference` keys');
		const adminNoticeSource = phpSource.slice(
			phpSource.indexOf(
				'function demo_space_brief_suggestions_ai_feature_admin_notice',
			),
		);
		expect(
			adminNoticeSource.indexOf("! current_user_can( 'manage_options' )"),
		).toBeLessThan(
			adminNoticeSource.indexOf(
				'demo_space_brief_suggestions_is_ai_feature_supported()',
			),
		);
		expect(phpSource).toContain('register_rest_route');
		expect(phpSource).toContain("'demo-space/v1'");
		expect(aiFeatureEntry).toEqual({
			aiSchemaFile:
				'src/ai-features/brief-suggestions/ai-schemas/feature-result.ai.schema.json',
			apiFile: 'src/ai-features/brief-suggestions/api.ts',
			clientFile: 'src/ai-features/brief-suggestions/api-client.ts',
			compatibility: {
				hardMinimums: {},
				mode: 'optional',
				optionalFeatureIds: ['wordpress-ai-client'],
				optionalFeatures: ['WordPress AI Client'],
				requiredFeatureIds: [],
				requiredFeatures: [],
				runtimeGates: [
					'WordPress AI Client: wordpress-core-feature WordPress AI Client',
				],
			},
			dataFile: 'src/ai-features/brief-suggestions/data.ts',
			namespace: 'demo-space/v1',
			openApiFile: 'src/ai-features/brief-suggestions/api.openapi.json',
			phpFile: 'inc/ai-features/brief-suggestions.php',
			slug: 'brief-suggestions',
			typesFile: 'src/ai-features/brief-suggestions/api-types.ts',
			validatorsFile: 'src/ai-features/brief-suggestions/api-validators.ts',
		});

		expect(
			fs.existsSync(
				path.join(
					targetDir,
					'src',
					'ai-features',
					'brief-suggestions',
					'api-client.ts',
				),
			),
		).toBe(true);
		expect(
			fs.existsSync(
				path.join(
					targetDir,
					'src',
					'ai-features',
					'brief-suggestions',
					'api.openapi.json',
				),
			),
		).toBe(true);
		expect(
			fs.existsSync(
				path.join(
					targetDir,
					'src',
					'ai-features',
					'brief-suggestions',
					'api-schemas',
					'feature-request.schema.json',
				),
			),
		).toBe(true);
		expect(
			fs.existsSync(
				path.join(
					targetDir,
					'src',
					'ai-features',
					'brief-suggestions',
					'ai-schemas',
					'feature-result.ai.schema.json',
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
			doctorChecks.checks.find((check) => check.label === 'AI feature bootstrap')
				?.status,
		).toBe('pass');
		expect(
			doctorChecks.checks.find(
				(check) => check.label === 'AI feature config brief-suggestions',
			)?.status,
		).toBe('pass');
		expect(
			doctorChecks.checks.find(
				(check) => check.label === 'AI feature brief-suggestions',
			)?.status,
		).toBe('pass');

		runGeneratedScript(targetDir, 'scripts/sync-rest-contracts.ts', ['--check']);
		runGeneratedScript(targetDir, 'scripts/sync-ai-features.ts', ['--check']);
		typecheckGeneratedProject(targetDir);
	}, 120_000);

	test('later contract and REST resource adds preserve AI sync-rest wiring', async () => {
		const targetDir = path.join(
			tempRoot,
			'demo-workspace-add-ai-feature-contract-rest',
		);

		await scaffoldOfficialWorkspace(targetDir, {
			description: 'Demo workspace add ai feature contract rest',
			slug: 'demo-workspace-add-ai-feature-contract-rest',
			title: 'Demo Workspace Add AI Feature Contract Rest',
		});

		linkWorkspaceNodeModules(targetDir);

		runCli(
			'node',
			[
				entryPath,
				'add',
				'ai-feature',
				'brief-suggestions',
				'--namespace',
				'demo-space/v1',
			],
			{
				cwd: targetDir,
			},
		);
		runCli(
			'node',
			[
				entryPath,
				'add',
				'contract',
				'secondary-response',
				'--type',
				'SecondaryResponse',
			],
			{
				cwd: targetDir,
			},
		);
		runCli(
			'node',
			[
				entryPath,
				'add',
				'contract',
				'external-response',
				'--type',
				'ExternalResponse',
			],
			{
				cwd: targetDir,
			},
		);
		runCli(
			'node',
			[
				entryPath,
				'add',
				'rest-resource',
				'snapshots',
				'--namespace',
				'demo-space/v1',
				'--methods',
				'list,read,create,update,delete',
			],
			{
				cwd: targetDir,
			},
		);

		const syncRestSource = fs.readFileSync(
			path.join(targetDir, 'scripts', 'sync-rest-contracts.ts'),
			'utf8',
		);

		expect(syncRestSource).toContain('AI_FEATURES');
		expect(syncRestSource).toContain('CONTRACTS');
		expect(syncRestSource).toContain('REST_RESOURCES');
		expect(syncRestSource).toContain('standaloneContracts.length === 0');
		expect(syncRestSource).toContain('restResources.length === 0');
		expect(syncRestSource).toContain('aiFeatures.length === 0');
		expect(
			syncRestSource.match(
				/^[ \t]*const standaloneContracts = CONTRACTS\.filter\(/gmu,
			)?.length,
		).toBe(1);

		runGeneratedScript(targetDir, 'scripts/sync-rest-contracts.ts', ['--check']);
	}, 120_000);

	test('ai-feature duplicate failures preserve generated workspace files', async () => {
		const targetDir = path.join(tempRoot, 'demo-workspace-add-ai-feature-rollback');

		await scaffoldOfficialWorkspace(targetDir, {
			description: 'Demo workspace add ai feature rollback',
			slug: 'demo-workspace-add-ai-feature-rollback',
			title: 'Demo Workspace Add AI Feature Rollback',
		});

		linkWorkspaceNodeModules(targetDir);

		runCli(
			'node',
			[
				entryPath,
				'add',
				'ai-feature',
				'brief-suggestions',
				'--namespace',
				'demo-space/v1',
			],
			{
				cwd: targetDir,
			},
		);

		const originalConfigSource = fs.readFileSync(
			path.join(targetDir, 'scripts', 'block-config.ts'),
			'utf8',
		);
		const originalPhpSource = fs.readFileSync(
			path.join(targetDir, 'inc', 'ai-features', 'brief-suggestions.php'),
			'utf8',
		);

		expect(
			getCommandErrorMessage(() =>
				runCli(
					'node',
					[
						entryPath,
						'add',
						'ai-feature',
						'brief-suggestions',
						'--namespace',
						'demo-space/v1',
					],
					{
						cwd: targetDir,
					},
				),
			),
		).toContain('An AI feature already exists');

		expect(
			fs.readFileSync(path.join(targetDir, 'scripts', 'block-config.ts'), 'utf8'),
		).toBe(originalConfigSource);
		expect(
			fs.readFileSync(
				path.join(targetDir, 'inc', 'ai-features', 'brief-suggestions.php'),
				'utf8',
			),
		).toBe(originalPhpSource);
		expect(
			readWorkspaceInventory(targetDir).aiFeatures.filter(
				(entry) => entry.slug === 'brief-suggestions',
			),
		).toHaveLength(1);
	}, 20_000);
});
