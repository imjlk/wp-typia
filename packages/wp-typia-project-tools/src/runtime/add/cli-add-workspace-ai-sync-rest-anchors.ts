import path from 'node:path';

import { patchFile } from './cli-add-shared.js';
import { FINAL_SYNC_SUMMARY_PATTERN } from './cli-add-workspace-rest-sync-script-shared.js';
import { detectSourceLineEnding } from '../shared/ts-source-masking.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

function assertSyncRestAnchor(
	anchorDescription: string,
	hasAnchor: boolean,
	syncRestScriptPath: string,
): void {
  if (!hasAnchor) {
    throw new Error(
			[
				`ensureAiFeatureSyncRestAnchors could not patch ${path.basename(syncRestScriptPath)}.`,
				`Missing expected ${anchorDescription} anchor in scripts/sync-rest-contracts.ts.`,
				'Restore the generated template or add the AI feature wiring manually before retrying.',
			].join(' '),
		);
  }
}

type SourceMatcher = string | RegExp;

function matchesSource(source: string, matcher: SourceMatcher): boolean {
  return typeof matcher === 'string'
    ? source.includes(matcher)
    : matcher.test(source);
}

function replaceRequiredSyncRestSource(
	nextSource: string,
	target: SourceMatcher,
	anchor: SourceMatcher,
	replacement: string,
	anchorDescription: string,
	syncRestScriptPath: string,
): string {
  if (matchesSource(nextSource, target)) {
    return nextSource;
  }

  const hasAnchor = matchesSource(nextSource, anchor);
  assertSyncRestAnchor(anchorDescription, hasAnchor, syncRestScriptPath);

  return nextSource.replace(anchor, replacement);
}

function replaceBlockConfigImportForAiFeatures(
	nextSource: string,
  syncRestScriptPath: string,
): string {
  const importPatterns = [
    /^import\s*\{\r?\n(?:[ \t]+[^\r\n]*\r?\n)+\}\s+from ["']\.\/block-config["'];?$/mu,
    /^import\s*\{[^\n]*\}\s*from\s*["']\.\/block-config["'];?$/mu,
  ];
  const importMatch =
		importPatterns.map((pattern) => pattern.exec(nextSource)).find(Boolean) ??
		null;

  if (!importMatch) {
    throw new Error(
			[
				`ensureAiFeatureSyncRestAnchors could not patch ${path.basename(syncRestScriptPath)}.`,
				'Missing expected workspace inventory import anchor in scripts/sync-rest-contracts.ts.',
				'Restore the generated template or add the AI feature wiring manually before retrying.',
			].join(' '),
		);
  }

  const importSource = importMatch[0];
  if (
		importSource.includes('AI_FEATURES') &&
		importSource.includes('WorkspaceAiFeatureConfig')
	) {
    return nextSource;
  }

  const hasContracts = importSource.includes('CONTRACTS');
  const hasContractConfig = importSource.includes('WorkspaceContractConfig');
  const hasPostMeta = importSource.includes('POST_META');
  const hasPostMetaConfig = importSource.includes('WorkspacePostMetaConfig');
  const replacement = [
    'import {',
    '  AI_FEATURES,',
    '  BLOCKS,',
    ...(hasContracts ? ['  CONTRACTS,'] : []),
    ...(hasPostMeta ? ['  POST_META,'] : []),
    '  REST_RESOURCES,',
    '  type WorkspaceAiFeatureConfig,',
    '  type WorkspaceBlockConfig,',
    ...(hasContractConfig ? ['  type WorkspaceContractConfig,'] : []),
    ...(hasPostMetaConfig ? ['  type WorkspacePostMetaConfig,'] : []),
    '  type WorkspaceRestResourceConfig,',
    "} from './block-config';",
  ].join(detectSourceLineEnding(nextSource));

  return nextSource.replace(importSource, replacement);
}

function replaceAiFeatureSyncSummaryCopy(
	nextSource: string,
	syncRestScriptPath: string,
): string {
  const standaloneSummary =
		'workspace blocks, standalone contracts, and plugin-level resources';
  const standaloneAiSummary =
		'workspace blocks, standalone contracts, plugin-level resources, and AI features';
  const standalonePostMetaSummary =
		'workspace blocks, standalone contracts, post meta contracts, and plugin-level resources';
  const standalonePostMetaAiSummary =
		'workspace blocks, standalone contracts, post meta contracts, plugin-level resources, and AI features';
  const postMetaSummary =
		'workspace blocks, post meta contracts, and plugin-level resources';
  const postMetaAiSummary =
		'workspace blocks, post meta contracts, plugin-level resources, and AI features';
  const restResourceSummary = 'workspace blocks and plugin-level resources';
  const restResourceAiSummary =
		'workspace blocks, plugin-level resources, and AI features';

  if (nextSource.includes(standalonePostMetaSummary)) {
    return nextSource
			.split(standalonePostMetaSummary)
			.join(standalonePostMetaAiSummary);
  }
  if (nextSource.includes(standaloneSummary)) {
    return nextSource.split(standaloneSummary).join(standaloneAiSummary);
  }
  if (nextSource.includes(postMetaSummary)) {
    return nextSource.split(postMetaSummary).join(postMetaAiSummary);
  }
  if (nextSource.includes(restResourceSummary)) {
    return nextSource.split(restResourceSummary).join(restResourceAiSummary);
  }
  if (
		nextSource.includes(standaloneAiSummary) ||
		nextSource.includes(standalonePostMetaAiSummary) ||
		nextSource.includes(postMetaAiSummary) ||
		nextSource.includes(restResourceAiSummary)
	) {
    return nextSource;
  }

  throw new Error(
		[
			`ensureAiFeatureSyncRestAnchors could not patch ${path.basename(syncRestScriptPath)}.`,
			'Missing expected sync summary copy anchor in scripts/sync-rest-contracts.ts.',
			'Restore the generated template or add the AI feature wiring manually before retrying.',
		].join(' '),
	);
}

function formatNoResourcesSubject(subjects: readonly string[]): string {
  if (subjects.length <= 2) {
    return subjects.join(' or ');
  }

  const lastSubject = subjects[subjects.length - 1];
  return `${subjects.slice(0, -1).join(', ')}, or ${lastSubject}`;
}

function buildAiFeatureNoResourcesGuard({
	hasPostMeta,
	hasStandaloneContracts,
  lineEnding,
}: {
  hasPostMeta: boolean;
  hasStandaloneContracts: boolean;
  lineEnding: '\n' | '\r\n';
}): string {
  const condition = ['restBlocks.length === 0'];
  if (hasStandaloneContracts) {
    condition[condition.length - 1] = `${condition[condition.length - 1]} &&`;
    condition.push('standaloneContracts.length === 0');
  }
  if (hasPostMeta) {
    condition[condition.length - 1] = `${condition[condition.length - 1]} &&`;
    condition.push('postMetaContracts.length === 0');
  }
  condition[condition.length - 1] = `${condition[condition.length - 1]} &&`;
  condition.push('restResources.length === 0 &&');
  condition.push('aiFeatures.length === 0');

  const noResourcesSubject = formatNoResourcesSubject([
    'REST-enabled workspace blocks',
    ...(hasStandaloneContracts ? ['standalone contracts'] : []),
    ...(hasPostMeta ? ['post meta contracts'] : []),
    'plugin-level REST resources',
    'AI features',
  ]);

  return [
    'if (',
    ...condition.map((line) => `    ${line}`),
    '  ) {',
    '    console.log(',
    '      options.check',
    `        ? 'ℹ️ No ${noResourcesSubject} are registered yet. \`sync-rest --check\` is already clean.'`,
    `        : 'ℹ️ No ${noResourcesSubject} are registered yet.',`,
    '    );',
    '    return;',
    '  }',
  ].join(lineEnding);
}

const NO_RESOURCES_GUARD_PATTERN =
  /if\s*\(\s*restBlocks\.length === 0(?:\s*&&\s*standaloneContracts\.length === 0)?(?:\s*&&\s*postMetaContracts\.length === 0)?\s*&&\s*restResources\.length === 0(?:\s*&&\s*aiFeatures\.length === 0)?\s*\)\s*\{[\s\S]*?\r?\n[ \t]+return;\r?\n[ \t]*\}/u;

/**
 * Patch `scripts/sync-rest-contracts.ts` after sync-project wiring so AI feature REST artifacts join the split sync flow.
 */
export async function ensureAiFeatureSyncRestAnchors(
	workspace: WorkspaceProject,
): Promise<void> {
  const syncRestScriptPath = path.join(
    workspace.projectDir,
    'scripts',
    'sync-rest-contracts.ts',
  );

  await patchFile(syncRestScriptPath, (source) => {
    const lineEnding = detectSourceLineEnding(source);
    let nextSource = replaceBlockConfigImportForAiFeatures(
      source,
      syncRestScriptPath,
    );
    const helperInsertionAnchor = 'async function assertTypeArtifactsCurrent';
    const restResourcesAnchor =
      /^([ \t]*)const\s+restResources\s*=\s*REST_RESOURCES\.filter\(\s*isWorkspaceRestResource\s*\);/mu;

		nextSource = replaceRequiredSyncRestSource(
			nextSource,
			/function\s+isWorkspaceAiFeature\s*\(/u,
			helperInsertionAnchor,
			[
        'function isWorkspaceAiFeature(',
        '  feature: WorkspaceAiFeatureConfig,',
        '): feature is WorkspaceAiFeatureConfig & {',
        '  aiSchemaFile: string;',
        '  clientFile: string;',
        '  openApiFile: string;',
        "  restManifest: NonNullable<WorkspaceAiFeatureConfig['restManifest']>;",
        '  typesFile: string;',
        '  validatorsFile: string;',
        '} {',
        '  return (',
        "    typeof feature.aiSchemaFile === 'string' &&",
        "    typeof feature.clientFile === 'string' &&",
        "    typeof feature.openApiFile === 'string' &&",
        "    typeof feature.typesFile === 'string' &&",
        "    typeof feature.validatorsFile === 'string' &&",
        "    typeof feature.restManifest === 'object' &&",
        '    feature.restManifest !== null &&',
        "    typeof feature.restManifest.contracts === 'object' &&",
        '    feature.restManifest.contracts !== null',
        '  );',
        '}',
        '',
        'async function assertTypeArtifactsCurrent',
      ].join(lineEnding),
			'type artifact assertion helper',
			syncRestScriptPath,
		);

		nextSource = replaceRequiredSyncRestSource(
			nextSource,
			/const\s+aiFeatures\s*=\s*AI_FEATURES\.filter\(\s*isWorkspaceAiFeature\s*\);/u,
      restResourcesAnchor,
      [
        '$1const restResources = REST_RESOURCES.filter(isWorkspaceRestResource);',
        '$1const aiFeatures = AI_FEATURES.filter(isWorkspaceAiFeature);',
      ].join(lineEnding),
			'rest resource filter',
			syncRestScriptPath,
		);

		nextSource = replaceRequiredSyncRestSource(
			nextSource,
			/aiFeatures\.length\s*===\s*0/u,
			NO_RESOURCES_GUARD_PATTERN,
			buildAiFeatureNoResourcesGuard({
        hasPostMeta: matchesSource(
          nextSource,
          /const\s+postMetaContracts\s*=\s*POST_META\.filter\(\s*isWorkspacePostMetaContract\s*\);/u,
        ),
        hasStandaloneContracts: matchesSource(
          nextSource,
          /const\s+standaloneContracts\s*=\s*CONTRACTS\.filter\(\s*isWorkspaceStandaloneContract\s*,?\s*\);/u,
        ),
        lineEnding,
			}),
			'no-resources guard',
			syncRestScriptPath,
		);

		nextSource = replaceRequiredSyncRestSource(
			nextSource,
			/for\s*\(\s*const\s+feature\s+of\s+aiFeatures\s*\)\s*\{/u,
			FINAL_SYNC_SUMMARY_PATTERN,
			[
        '',
        '  for (const feature of aiFeatures) {',
        '    const contracts = feature.restManifest.contracts;',
        '',
        '    for (const [baseName, contract] of Object.entries(contracts)) {',
        '      await syncTypeSchemas(',
        '        {',
        '          jsonSchemaFile: path.join(',
        '            path.dirname(feature.typesFile),',
        "            'api-schemas',",
        '            `${baseName}.schema.json`,',
        '          ),',
        '          openApiFile: path.join(',
        '            path.dirname(feature.typesFile),',
        "            'api-schemas',",
        '            `${baseName}.openapi.json`,',
        '          ),',
        '          sourceTypeName: contract.sourceTypeName,',
        '          typesFile: feature.typesFile,',
        '        },',
        '        {',
        '          check: options.check,',
        '        },',
        '      );',
        '    }',
        '',
        '    await syncRestOpenApi(',
        '      {',
        '        manifest: feature.restManifest,',
        '        openApiFile: feature.openApiFile,',
        '        typesFile: feature.typesFile,',
        '      },',
        '      {',
        '        check: options.check,',
        '      },',
        '    );',
        '',
        '    await syncEndpointClient(',
        '      {',
        '        clientFile: feature.clientFile,',
        '        manifest: feature.restManifest,',
        '        typesFile: feature.typesFile,',
        '        validatorsFile: feature.validatorsFile,',
        '      },',
        '      {',
        '        check: options.check,',
        '      },',
        '    );',
        '  }',
        '',
        '  console.log(',
        '    options.check',
      ].join(lineEnding),
			'final sync summary',
			syncRestScriptPath,
		);

		nextSource = replaceAiFeatureSyncSummaryCopy(
			nextSource,
			syncRestScriptPath,
		);

		return nextSource;
	});
}
