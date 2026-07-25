import path from 'node:path';

import { getWorkspaceBootstrapPath, patchFile } from './cli-add-shared.js';
import {
  appendPhpSnippetBeforeClosingTag,
  insertPhpSnippetBeforeWorkspaceAnchors,
} from './cli-add-workspace-mutation.js';
import { hasPhpFunctionDefinition } from '../shared/php-utils.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

const POST_META_SERVER_GLOB = '/inc/post-meta/*.php';
const NO_RESOURCES_GUARD_PATTERN =
	/if \(\s*restBlocks\.length === 0(?:\s*&&\s*standaloneContracts\.length === 0)?(?:\s*&&\s*postMetaContracts\.length === 0)?(?:\s*&&\s*restResources\.length === 0)?(?:\s*&&\s*aiFeatures\.length === 0)?\s*\) \{[\s\S]*?\n\t\treturn;\n\t\}/u;

/**
 * Ensure the workspace bootstrap loads generated post-meta PHP modules.
 *
 * Inserts the generated loader function, appends its `init` hook, and rejects
 * incompatible existing loader functions that omit the generated post-meta glob.
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
		const registerFunction = `

function ${registerFunctionName}() {
\tforeach ( glob( __DIR__ . '${POST_META_SERVER_GLOB}' ) ?: array() as $post_meta_module ) {
\t\trequire_once $post_meta_module;
\t}
}
`;
		if (!hasPhpFunctionDefinition(nextSource, registerFunctionName)) {
			nextSource = insertPhpSnippetBeforeWorkspaceAnchors(nextSource, registerFunction);
		} else if (!nextSource.includes(POST_META_SERVER_GLOB)) {
			throw new Error(
				[
					`Unable to patch ${path.basename(bootstrapPath)} in ensurePostMetaBootstrapAnchors.`,
					`The existing ${registerFunctionName}() definition does not include ${POST_META_SERVER_GLOB}.`,
					'Restore the generated bootstrap shape or wire the post-meta loader manually before retrying.',
				].join(' '),
			);
		}

		if (!nextSource.includes(registerHook)) {
			nextSource = appendPhpSnippetBeforeClosingTag(nextSource, registerHook);
		}

		return nextSource;
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
  const importPatterns = [
    /^import\s*\{\n(?:\t[^\n]*\n)+\} from ["']\.\/block-config["'];?$/mu,
    /^import\s*\{[^\n]*\}\s*from\s*["']\.\/block-config["'];?$/mu,
  ];
  const importMatch =
		importPatterns.map((pattern) => pattern.exec(nextSource)).find(Boolean) ??
		null;

  if (!importMatch) {
    throw new Error(
      getSyncRestPatchErrorMessage(syncRestScriptPath, 'block-config import'),
    );
  }

  const importSource = importMatch[0];
  if (
		importSource.includes('POST_META') &&
		importSource.includes('WorkspacePostMetaConfig')
	) {
    return nextSource;
  }
  if (
		!importSource.includes('BLOCKS') ||
		!importSource.includes('WorkspaceBlockConfig')
	) {
    throw new Error(
      getSyncRestPatchErrorMessage(syncRestScriptPath, 'BLOCKS import'),
    );
  }

  const hasAiFeatures = importSource.includes('AI_FEATURES');
  const hasAiFeatureConfig = importSource.includes('WorkspaceAiFeatureConfig');
  const hasContracts = importSource.includes('CONTRACTS');
  const hasContractConfig = importSource.includes('WorkspaceContractConfig');
  const hasRestResources = importSource.includes('REST_RESOURCES');
  const hasRestResourceConfig = importSource.includes(
    'WorkspaceRestResourceConfig',
  );
  const replacement = [
		'import {',
		...(hasAiFeatures ? ['\tAI_FEATURES,'] : []),
		'\tBLOCKS,',
		...(hasContracts ? ['\tCONTRACTS,'] : []),
		'\tPOST_META,',
		...(hasRestResources ? ['\tREST_RESOURCES,'] : []),
		...(hasAiFeatureConfig ? ['\ttype WorkspaceAiFeatureConfig,'] : []),
		'\ttype WorkspaceBlockConfig,',
		...(hasContractConfig ? ['\ttype WorkspaceContractConfig,'] : []),
		'\ttype WorkspacePostMetaConfig,',
		...(hasRestResourceConfig ? ['\ttype WorkspaceRestResourceConfig,'] : []),
		"} from './block-config';",
	].join('\n');

  return nextSource.replace(importSource, replacement);
}

function replaceRequiredSyncRestSource(
	nextSource: string,
	target: string,
	anchor: string | RegExp,
	replacement: string,
	anchorDescription: string,
	syncRestScriptPath: string,
): string {
  if (nextSource.includes(target)) {
    return nextSource;
  }

  const hasAnchor =
		typeof anchor === 'string'
      ? nextSource.includes(anchor)
      : anchor.test(nextSource);
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

function buildPostMetaNoResourcesGuard({
	hasAiFeatures,
	hasRestResources,
}: {
  hasAiFeatures: boolean;
  hasRestResources: boolean;
}): string {
  const condition = [
    'restBlocks.length === 0 &&',
    'standaloneContracts.length === 0 &&',
    'postMetaContracts.length === 0',
  ];
  if (hasRestResources) {
    condition[condition.length - 1] = `${condition[condition.length - 1]} &&`;
    condition.push('restResources.length === 0');
  }
  if (hasAiFeatures) {
    condition[condition.length - 1] = `${condition[condition.length - 1]} &&`;
    condition.push('aiFeatures.length === 0');
  }

  const noResourcesSubject = [
		'REST-enabled workspace blocks',
		'standalone contracts',
		'post meta contracts',
		...(hasRestResources ? ['plugin-level REST resources'] : []),
		...(hasAiFeatures ? ['AI features'] : []),
	].join(', ');

  return [
		'if (',
		...condition.map((line) => `\t\t${line}`),
		'\t) {',
		'\t\tconsole.log(',
		'\t\t\toptions.check',
		`\t\t\t\t? 'ℹ️ No ${noResourcesSubject} are registered yet. \`sync-rest --check\` is already clean.'`,
		`\t\t\t\t: 'ℹ️ No ${noResourcesSubject} are registered yet.'`,
		'\t\t);',
		'\t\treturn;',
		'\t}',
	].join('\n');
}

function replaceNoResourcesGuard(
	nextSource: string,
	replacement: string,
	syncRestScriptPath: string,
): string {
  if (!NO_RESOURCES_GUARD_PATTERN.test(nextSource)) {
    throw new Error(
      getSyncRestPatchErrorMessage(syncRestScriptPath, 'no-resources guard'),
    );
  }

  return nextSource.replace(NO_RESOURCES_GUARD_PATTERN, replacement);
}

function insertPostMetaFilter(
	nextSource: string,
	syncRestScriptPath: string,
): string {
  if (nextSource.includes('const postMetaContracts = POST_META.filter')) {
    return nextSource;
  }

  const restResourcesFilter =
		'const restResources = REST_RESOURCES.filter( isWorkspaceRestResource );';
  if (nextSource.includes(restResourcesFilter)) {
    return nextSource.replace(
			restResourcesFilter,
			[
				'const postMetaContracts = POST_META.filter( isWorkspacePostMetaContract );',
				restResourcesFilter,
			].join('\n\t'),
		);
  }

  const standaloneContractsFilter =
		'const standaloneContracts = CONTRACTS.filter( isWorkspaceStandaloneContract );';
  return replaceRequiredSyncRestSource(
		nextSource,
		'const postMetaContracts = POST_META.filter',
		standaloneContractsFilter,
		[
			standaloneContractsFilter,
			'const postMetaContracts = POST_META.filter( isWorkspacePostMetaContract );',
		].join('\n\t'),
		'standaloneContracts filter',
		syncRestScriptPath,
	);
}

function insertPostMetaNoResourcesGuard(
	nextSource: string,
	syncRestScriptPath: string,
): string {
  const hasRestResources = nextSource.includes(
    'const restResources = REST_RESOURCES.filter( isWorkspaceRestResource );',
  );
  const hasAiFeatures = nextSource.includes(
    'const aiFeatures = AI_FEATURES.filter( isWorkspaceAiFeature );',
  );

  return replaceNoResourcesGuard(
    nextSource,
    buildPostMetaNoResourcesGuard({
      hasAiFeatures,
      hasRestResources,
    }),
    syncRestScriptPath,
  );
}

function insertPostMetaSyncLoop(
	nextSource: string,
	syncRestScriptPath: string,
): string {
  if (nextSource.includes('for ( const postMeta of postMetaContracts )')) {
    return nextSource;
  }

  const loopSource = [
		'\tfor ( const postMeta of postMetaContracts ) {',
		'\t\tawait syncTypeSchemas(',
		'\t\t\t{',
		'\t\t\t\tjsonSchemaFile: postMeta.schemaFile,',
		'\t\t\t\tsourceTypeName: postMeta.sourceTypeName,',
		'\t\t\t\ttypesFile: postMeta.typesFile,',
		'\t\t\t},',
		'\t\t\t{',
		'\t\t\t\tcheck: options.check,',
		'\t\t\t}',
		'\t\t);',
		'\t}',
	].join('\n');
  const resourceLoopAnchor = '\n\tfor ( const resource of restResources ) {';
  if (nextSource.includes(resourceLoopAnchor)) {
    return nextSource.replace(
      resourceLoopAnchor,
      `\n${loopSource}\n${resourceLoopAnchor}`,
    );
  }

  const consoleLogPattern = /\n\tconsole\.log\(\n\t\toptions\.check/u;
  return replaceRequiredSyncRestSource(
		nextSource,
		'for ( const postMeta of postMetaContracts )',
		consoleLogPattern,
		[
			'',
			loopSource,
			'',
			'\tconsole.log(',
			'\t\toptions.check',
		].join('\n'),
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
				'\tpostMeta: WorkspacePostMetaConfig',
				'): postMeta is WorkspacePostMetaConfig & {',
				'\tschemaFile: string;',
				'\tsourceTypeName: string;',
				'\ttypesFile: string;',
				'} {',
				'\treturn (',
				"\t\ttypeof postMeta.schemaFile === 'string' &&",
				"\t\ttypeof postMeta.sourceTypeName === 'string' &&",
				"\t\ttypeof postMeta.typesFile === 'string'",
				'\t);',
				'}',
				'',
				'async function assertTypeArtifactsCurrent',
			].join('\n'),
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
