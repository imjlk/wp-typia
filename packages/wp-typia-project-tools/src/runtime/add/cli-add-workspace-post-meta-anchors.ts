import path from 'node:path';

import { getWorkspaceBootstrapPath, patchFile } from './cli-add-shared.js';
import {
  appendPhpSnippetBeforeClosingTag,
  insertPhpSnippetBeforeWorkspaceAnchors,
} from './cli-add-workspace-mutation.js';
import {
  buildNoResourcesGuard,
  FINAL_SYNC_SUMMARY_PATTERN,
  replaceBlockConfigImport,
  replaceNoResourcesGuard,
} from './cli-add-workspace-rest-sync-script-shared.js';
import {
  findPhpFunctionRange,
  hasPhpFunctionDefinition,
  hasPhpFunctionCall,
  replacePhpFunctionDefinition,
} from '../shared/php-utils.js';
import { detectSourceLineEnding } from '../shared/ts-source-masking.js';
import {
  syncWorkspacePhpEntrypoints,
  WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS,
} from '../workspace/workspace-php-entrypoint-manifests.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

type SourceMatcher = string | RegExp;

function matchesSource(source: string, matcher: SourceMatcher): boolean {
  return typeof matcher === 'string'
    ? source.includes(matcher)
    : matcher.test(source);
}

/**
 * Ensure the workspace bootstrap loads generated post-meta PHP modules.
 *
 * Inserts the generated loader function, appends its `init` hook, repairs stale
 * loader functions, and synchronizes the deterministic post-meta manifest.
 *
 * @param workspace Resolved official workspace metadata and paths.
 * @returns A promise that resolves after the bootstrap has been patched.
 * @throws {Error} When the bootstrap cannot be read, written, or safely patched.
 */
export async function ensurePostMetaBootstrapAnchors(
	workspace: WorkspaceProject,
): Promise<void> {
  const bootstrapPath = getWorkspaceBootstrapPath(workspace);

  await patchFile(bootstrapPath, (source) => {
		let nextSource = source;
		const registerFunctionName = `${workspace.workspace.phpPrefix}_register_post_meta_contracts`;
		const registerHook = `add_action( 'init', '${registerFunctionName}', 20 );`;
		const postMetaManifestPath =
			`/${WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.postMeta}`;
		const registerFunction = `

function ${registerFunctionName}() {
\trequire_once __DIR__ . '${postMetaManifestPath}';
}
`;
		if (!hasPhpFunctionDefinition(nextSource, registerFunctionName)) {
			nextSource = insertPhpSnippetBeforeWorkspaceAnchors(nextSource, registerFunction);
		} else {
			const functionRange = findPhpFunctionRange(nextSource, registerFunctionName);
			if (!functionRange) {
				throw new Error(
					`Unable to parse ${registerFunctionName}() in ${path.basename(bootstrapPath)} for deterministic manifest migration.`,
				);
			}
			const functionSource = functionRange.source;
			if (!functionSource.includes(postMetaManifestPath)) {
				if (!hasPhpFunctionCall(functionSource, 'glob')) {
					throw new Error(
						`Unable to migrate customized ${registerFunctionName}() in ${path.basename(bootstrapPath)}. Restore the generated glob loader or wire ${postMetaManifestPath} manually.`,
					);
				}
				const replacedSource = replacePhpFunctionDefinition(
					nextSource,
					registerFunctionName,
					registerFunction,
					{ trimReplacementStart: true },
				);
				if (!replacedSource) {
					throw new Error(
						`Unable to repair ${path.basename(bootstrapPath)} for ${registerFunctionName}.`,
					);
				}
				nextSource = replacedSource;
			}
		}

		if (!nextSource.includes(registerHook)) {
			nextSource = appendPhpSnippetBeforeClosingTag(nextSource, registerHook);
		}

		return nextSource;
	});
  await syncWorkspacePhpEntrypoints(workspace.projectDir, {
    manifestIds: ['postMeta'],
  });
}

function getSyncRestPatchErrorMessage(
	syncRestScriptPath: string,
	anchorDescription: string,
): string {
  return [
		`ensurePostMetaSyncScriptAnchors could not patch ${path.basename(syncRestScriptPath)}.`,
		`Missing expected ${anchorDescription} anchor in scripts/sync-rest-contracts.ts.`,
		'Restore the generated template or add the POST_META wiring manually before retrying.',
	].join(' ');
}

function replaceBlockConfigImportForPostMeta(
	nextSource: string,
	syncRestScriptPath: string,
): string {
  return replaceBlockConfigImport({
    functionName: 'ensurePostMetaSyncScriptAnchors',
    nextSource,
    subject: {
      configTypeName: 'WorkspacePostMetaConfig',
      constName: 'POST_META',
    },
    syncRestScriptPath,
  });
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
  if (!hasAnchor) {
    throw new Error(
      getSyncRestPatchErrorMessage(syncRestScriptPath, anchorDescription),
    );
  }

  return nextSource.replace(anchor, replacement);
}

function replaceAllOccurrences(
	source: string,
	searchValue: string,
	replacement: string,
): string {
  return source.split(searchValue).join(replacement);
}

function insertPostMetaFilter(
	nextSource: string,
	syncRestScriptPath: string,
): string {
  if (
    /const\s+postMetaContracts\s*=\s*POST_META\.filter\(\s*isWorkspacePostMetaContract\s*,?\s*\);/u.test(
      nextSource,
    )
  ) {
    return nextSource;
  }

  const lineEnding = detectSourceLineEnding(nextSource);
  const restResourcesFilter =
    /^([ \t]*)const\s+restResources\s*=\s*REST_RESOURCES\.filter\(\s*isWorkspaceRestResource\s*\);/mu;
  if (restResourcesFilter.test(nextSource)) {
    return nextSource.replace(
      restResourcesFilter,
      (match, indentation: string) =>
        [
          `${indentation}const postMetaContracts = POST_META.filter(isWorkspacePostMetaContract);`,
          match,
        ].join(lineEnding),
    );
  }

  const standaloneContractsFilter =
    /^([ \t]*)const\s+standaloneContracts\s*=\s*CONTRACTS\.filter\(\s*isWorkspaceStandaloneContract\s*,?\s*\);/mu;
  return replaceRequiredSyncRestSource(
    nextSource,
    /const\s+postMetaContracts\s*=\s*POST_META\.filter/u,
    standaloneContractsFilter,
    [
      '$1const standaloneContracts = CONTRACTS.filter(isWorkspaceStandaloneContract);',
      '$1const postMetaContracts = POST_META.filter(isWorkspacePostMetaContract);',
    ].join(lineEnding),
    'standaloneContracts filter',
    syncRestScriptPath,
  );
}

function insertPostMetaNoResourcesGuard(
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
          include: true,
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
    'ensurePostMetaSyncScriptAnchors',
    syncRestScriptPath,
    'POST_META',
  );
}

function insertPostMetaSyncLoop(
	nextSource: string,
	syncRestScriptPath: string,
): string {
  if (
    /for\s*\(\s*const\s+postMeta\s+of\s+postMetaContracts\s*\)\s*\{/u.test(
      nextSource,
    )
  ) {
    return nextSource;
  }

  const lineEnding = detectSourceLineEnding(nextSource);
  const loopSource = [
    '  for (const postMeta of postMetaContracts) {',
    '    await syncTypeSchemas(',
    '      {',
    '        jsonSchemaFile: postMeta.schemaFile,',
    '        sourceTypeName: postMeta.sourceTypeName,',
    '        typesFile: postMeta.typesFile,',
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

  return replaceRequiredSyncRestSource(
    nextSource,
    /for\s*\(\s*const\s+postMeta\s+of\s+postMetaContracts\s*\)/u,
    FINAL_SYNC_SUMMARY_PATTERN,
    ['', loopSource, '', '  console.log(', '    options.check'].join(
      lineEnding,
    ),
    'success log insertion point',
    syncRestScriptPath,
  );
}

/**
 * Ensure `scripts/sync-rest-contracts.ts` handles post-meta schema contracts.
 *
 * Patches inventory imports, type guards, no-resource checks, sync loops, and
 * success copy so generated post-meta schemas participate in REST contract sync.
 *
 * @param workspace Resolved official workspace metadata and paths.
 * @returns A promise that resolves after the sync script has been patched.
 * @throws {Error} When expected anchors are missing or file IO fails.
 */
export async function ensurePostMetaSyncScriptAnchors(
	workspace: WorkspaceProject,
): Promise<void> {
  const syncRestScriptPath = path.join(
    workspace.projectDir,
    'scripts',
    'sync-rest-contracts.ts',
  );

  await patchFile(syncRestScriptPath, (source) => {
    const lineEnding = detectSourceLineEnding(source);
		let nextSource = replaceBlockConfigImportForPostMeta(
			source,
			syncRestScriptPath,
		);
		const helperInsertionAnchor = 'async function assertTypeArtifactsCurrent';

		nextSource = replaceRequiredSyncRestSource(
			nextSource,
			'function isWorkspacePostMetaContract(',
			helperInsertionAnchor,
			[
				'function isWorkspacePostMetaContract(',
				'  postMeta: WorkspacePostMetaConfig,',
				'): postMeta is WorkspacePostMetaConfig & {',
				'  schemaFile: string;',
				'  sourceTypeName: string;',
				'  typesFile: string;',
				'} {',
				'  return (',
				"    typeof postMeta.schemaFile === 'string' &&",
				"    typeof postMeta.sourceTypeName === 'string' &&",
				"    typeof postMeta.typesFile === 'string'",
				'  );',
				'}',
				'',
				'async function assertTypeArtifactsCurrent',
			].join(lineEnding),
			'type artifact assertion helper',
			syncRestScriptPath,
		);
		nextSource = insertPostMetaFilter(nextSource, syncRestScriptPath);
		nextSource = insertPostMetaNoResourcesGuard(nextSource, syncRestScriptPath);
		nextSource = insertPostMetaSyncLoop(nextSource, syncRestScriptPath);
		nextSource = replaceAllOccurrences(
			nextSource,
			'REST contract schemas, standalone schemas, portable API clients, and endpoint-aware OpenAPI documents',
			'REST contract schemas, standalone schemas, post meta schemas, portable API clients, and endpoint-aware OpenAPI documents',
		);
		nextSource = replaceAllOccurrences(
			nextSource,
			'workspace blocks, standalone contracts, and plugin-level resources',
			'workspace blocks, standalone contracts, post meta contracts, and plugin-level resources',
		);
		nextSource = replaceAllOccurrences(
			nextSource,
			'workspace blocks, standalone contracts, or plugin-level REST resources',
			'workspace blocks, standalone contracts, post meta contracts, or plugin-level REST resources',
		);

		return nextSource;
	});
}
