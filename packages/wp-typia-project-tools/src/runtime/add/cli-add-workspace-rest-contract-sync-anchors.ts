import path from 'node:path';

import { patchFile } from './cli-add-shared.js';
import {
  buildNoResourcesGuard,
  FINAL_SYNC_SUMMARY_PATTERN,
  getSyncRestPatchErrorMessage,
  replaceBlockConfigImport,
  replaceNoResourcesGuard,
} from './cli-add-workspace-rest-sync-script-shared.js';
import { detectSourceLineEnding } from '../shared/ts-source-masking.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

type SourceMatcher = string | RegExp;

function matchesSource(source: string, matcher: SourceMatcher): boolean {
  return typeof matcher === 'string'
    ? source.includes(matcher)
    : matcher.test(source);
}

function replaceRequiredContractSyncRestSource(
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
  if (!hasAnchor) {
    throw new Error(
      getSyncRestPatchErrorMessage(
        'ensureContractSyncScriptAnchors',
        syncRestScriptPath,
        anchorDescription,
        'CONTRACTS',
      ),
    );
  }

  return nextSource.replace(anchor, replacement);
}

function insertStandaloneContractFilter(nextSource: string, syncRestScriptPath: string): string {
  const lineEnding = detectSourceLineEnding(nextSource);
  if (
    /const\s+standaloneContracts\s*=\s*CONTRACTS\.filter\(\s*isWorkspaceStandaloneContract\s*,?\s*\);/u.test(
      nextSource,
    )
  ) {
    return nextSource;
  }

  const restResourcesFilter =
    /^([ \t]*)const\s+restResources\s*=\s*REST_RESOURCES\.filter\(\s*isWorkspaceRestResource\s*\);/mu;
  if (restResourcesFilter.test(nextSource)) {
    return nextSource.replace(
      restResourcesFilter,
      (match, indentation: string) =>
        [
          `${indentation}const standaloneContracts = CONTRACTS.filter(`,
          `${indentation}  isWorkspaceStandaloneContract,`,
          `${indentation});`,
          match,
        ].join(lineEnding),
    );
  }

  const restBlocksFilter =
    /^([ \t]*)const\s+restBlocks\s*=\s*BLOCKS\.filter\(\s*isRestEnabledBlock\s*\);/mu;
  return replaceRequiredContractSyncRestSource(
    nextSource,
    /const\s+standaloneContracts\s*=\s*CONTRACTS\.filter/u,
    restBlocksFilter,
    [
      '$1const restBlocks = BLOCKS.filter(isRestEnabledBlock);',
      '$1const standaloneContracts = CONTRACTS.filter(',
      '$1  isWorkspaceStandaloneContract,',
      '$1);',
    ].join(lineEnding),
    'restBlocks filter',
    syncRestScriptPath,
  );
}

function insertStandaloneContractNoResourcesGuard(
	nextSource: string,
	syncRestScriptPath: string,
): string {
  const hasRestResources =
    /const\s+restResources\s*=\s*REST_RESOURCES\.filter\(\s*isWorkspaceRestResource\s*\);/u.test(
      nextSource,
    );
  const hasAiFeatures =
    /const\s+aiFeatures\s*=\s*AI_FEATURES\.filter\(\s*isWorkspaceAiFeature\s*\);/u.test(
      nextSource,
    );
  const hasPostMeta =
    /const\s+postMetaContracts\s*=\s*POST_META\.filter\(\s*isWorkspacePostMetaContract\s*\);/u.test(
      nextSource,
    );

  return replaceNoResourcesGuard(
    nextSource,
    buildNoResourcesGuard({
      lineEnding: detectSourceLineEnding(nextSource),
      subjects: [
        {
          condition: 'restBlocks.length === 0',
          include: true,
          subject: 'REST-enabled workspace blocks',
        },
        {
          condition: 'standaloneContracts.length === 0',
          include: true,
          subject: 'standalone contracts',
        },
        {
          condition: 'postMetaContracts.length === 0',
          include: hasPostMeta,
          subject: 'post meta contracts',
        },
        {
          condition: 'restResources.length === 0',
          include: hasRestResources,
          subject: 'plugin-level REST resources',
        },
        {
          condition: 'aiFeatures.length === 0',
          include: hasAiFeatures,
          subject: 'AI features',
        },
      ],
    }),
    'ensureContractSyncScriptAnchors',
    syncRestScriptPath,
    'CONTRACTS',
  );
}

function insertStandaloneContractSyncLoop(
	nextSource: string,
	syncRestScriptPath: string,
): string {
  if (
    /for\s*\(\s*const\s+contract\s+of\s+standaloneContracts\s*\)\s*\{/u.test(
      nextSource,
    )
  ) {
    return nextSource;
  }

  const lineEnding = detectSourceLineEnding(nextSource);
  const loopSource = [
    '  for (const contract of standaloneContracts) {',
    '    await syncTypeSchemas(',
    '      {',
    '        jsonSchemaFile: contract.schemaFile,',
    '        sourceTypeName: contract.sourceTypeName,',
    '        typesFile: contract.typesFile,',
    '      },',
    '      {',
    '        check: options.check,',
    '      },',
    '    );',
    '  }',
  ].join(lineEnding);
  const resourceLoopAnchor =
    /\r?\n[ \t]+for\s*\(\s*const\s+resource\s+of\s+restResources\s*\)\s*\{/u;
  if (resourceLoopAnchor.test(nextSource)) {
    return nextSource.replace(
      resourceLoopAnchor,
      (match) => `${lineEnding}${loopSource}${lineEnding}${match}`,
    );
  }

  return replaceRequiredContractSyncRestSource(
    nextSource,
    /for\s*\(\s*const\s+contract\s+of\s+standaloneContracts\s*\)/u,
    FINAL_SYNC_SUMMARY_PATTERN,
    ['', loopSource, '', '  console.log(', '    options.check'].join(
      lineEnding,
    ),
    'success log insertion point',
    syncRestScriptPath,
  );
}

/**
 * Ensure sync-rest can repair and validate standalone workspace contracts.
 *
 * @param workspace Workspace project whose sync-rest script should be patched.
 * @returns A promise that resolves after the sync-rest script is updated.
 * @throws When the generated sync-rest anchors cannot be found.
 */
export async function ensureContractSyncScriptAnchors(
	workspace: WorkspaceProject,
): Promise<void> {
  const syncRestScriptPath = path.join(
    workspace.projectDir,
    'scripts',
    'sync-rest-contracts.ts',
  );

  await patchFile(syncRestScriptPath, (source) => {
    const lineEnding = detectSourceLineEnding(source);
		let nextSource = replaceBlockConfigImport({
			functionName: 'ensureContractSyncScriptAnchors',
			nextSource: source,
			subject: {
				configTypeName: 'WorkspaceContractConfig',
				constName: 'CONTRACTS',
			},
			syncRestScriptPath,
		});
		const helperInsertionAnchor = 'async function assertTypeArtifactsCurrent';

		nextSource = replaceRequiredContractSyncRestSource(
			nextSource,
			/function\s+isWorkspaceStandaloneContract\s*\(/u,
			helperInsertionAnchor,
			[
        'function isWorkspaceStandaloneContract(',
        '  contract: WorkspaceContractConfig,',
        '): contract is WorkspaceContractConfig & {',
        '  schemaFile: string;',
        '  sourceTypeName: string;',
        '  typesFile: string;',
        '} {',
        '  return (',
        "    typeof contract.schemaFile === 'string' &&",
        "    typeof contract.sourceTypeName === 'string' &&",
        "    typeof contract.typesFile === 'string'",
        '  );',
        '}',
        '',
        'async function assertTypeArtifactsCurrent',
      ].join(lineEnding),
			'type artifact assertion helper',
			syncRestScriptPath,
		);
		nextSource = insertStandaloneContractFilter(nextSource, syncRestScriptPath);
		nextSource = insertStandaloneContractNoResourcesGuard(
			nextSource,
			syncRestScriptPath,
		);
		nextSource = insertStandaloneContractSyncLoop(nextSource, syncRestScriptPath);
		nextSource = nextSource.replace(
			'✅ REST contract schemas, portable API clients, and endpoint-aware OpenAPI documents are already up to date for workspace blocks and plugin-level resources!',
			'✅ REST contract schemas, standalone schemas, portable API clients, and endpoint-aware OpenAPI documents are already up to date for workspace blocks, standalone contracts, and plugin-level resources!',
		);
		nextSource = nextSource.replace(
			'✅ REST contract schemas, portable API clients, and endpoint-aware OpenAPI documents generated for workspace blocks and plugin-level resources!',
			'✅ REST contract schemas, standalone schemas, portable API clients, and endpoint-aware OpenAPI documents generated for workspace blocks, standalone contracts, and plugin-level resources!',
		);
		nextSource = nextSource.replace(
			'✅ REST contract schemas, portable API clients, and endpoint-aware OpenAPI documents are already up to date with the TypeScript types!',
			'✅ REST contract schemas, standalone schemas, portable API clients, and endpoint-aware OpenAPI documents are already up to date with the TypeScript types!',
		);
		nextSource = nextSource.replace(
			'✅ REST contract schemas, portable API clients, and endpoint-aware OpenAPI documents generated from TypeScript types!',
			'✅ REST contract schemas, standalone schemas, portable API clients, and endpoint-aware OpenAPI documents generated from TypeScript types!',
		);

		return nextSource;
	});
}
