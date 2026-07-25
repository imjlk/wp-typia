import path from 'node:path';

import { patchFile } from './cli-add-shared.js';
import {
  buildNoResourcesGuard,
  FINAL_SYNC_SUMMARY_PATTERN,
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

function assertSyncRestAnchor(
	anchorDescription: string,
	hasAnchor: boolean,
	syncRestScriptPath: string,
): void {
  if (!hasAnchor) {
    throw new Error(
			[
				`ensureRestResourceSyncScriptAnchors could not patch ${path.basename(syncRestScriptPath)}.`,
				`Missing expected ${anchorDescription} anchor in scripts/sync-rest-contracts.ts.`,
				'Restore the generated template or add the REST_RESOURCES wiring manually before retrying.',
			].join(' '),
		);
  }
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

function insertRestResourceNoResourcesGuard(
	nextSource: string,
	syncRestScriptPath: string,
): string {
  const hasStandaloneContracts =
    /const\s+standaloneContracts\s*=\s*CONTRACTS\.filter\(\s*isWorkspaceStandaloneContract\s*,?\s*\);/u.test(
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
          include: hasStandaloneContracts,
          subject: 'standalone contracts',
        },
        {
          condition: 'postMetaContracts.length === 0',
          include: hasPostMeta,
          subject: 'post meta contracts',
        },
        {
          condition: 'restResources.length === 0',
          include: true,
          subject: 'plugin-level REST resources',
        },
        {
          condition: 'aiFeatures.length === 0',
          include: hasAiFeatures,
          subject: 'AI features',
        },
      ],
    }),
    'ensureRestResourceSyncScriptAnchors',
    syncRestScriptPath,
    'REST_RESOURCES',
  );
}

/**
 * Ensure sync-rest can repair and validate plugin-level REST resources.
 *
 * @param workspace Workspace project whose sync-rest script should be patched.
 * @returns A promise that resolves after the sync-rest script is updated.
 * @throws When the generated sync-rest anchors cannot be found.
 */
export async function ensureRestResourceSyncScriptAnchors(
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
			functionName: 'ensureRestResourceSyncScriptAnchors',
			nextSource: source,
			subject: {
				configTypeName: 'WorkspaceRestResourceConfig',
				constName: 'REST_RESOURCES',
			},
			syncRestScriptPath,
		});
		const helperInsertionAnchor = 'async function assertTypeArtifactsCurrent';
		const restBlocksAnchor =
      /^([ \t]*)const\s+restBlocks\s*=\s*BLOCKS\.filter\(\s*isRestEnabledBlock\s*\);/mu;

		nextSource = replaceRequiredSyncRestSource(
			nextSource,
			/function\s+isWorkspaceRestResource\s*\(/u,
			helperInsertionAnchor,
			[
				'function isWorkspaceRestResource(',
				'\tresource: WorkspaceRestResourceConfig',
				'): resource is WorkspaceRestResourceConfig & {',
				'\tclientFile: string;',
				'\topenApiFile: string;',
				"\trestManifest: NonNullable< WorkspaceRestResourceConfig[ 'restManifest' ] >;",
				'\ttypesFile: string;',
				'\tvalidatorsFile: string;',
				'} {',
				'\treturn (',
				"\t\ttypeof resource.clientFile === 'string' &&",
				"\t\ttypeof resource.openApiFile === 'string' &&",
				"\t\ttypeof resource.typesFile === 'string' &&",
				"\t\ttypeof resource.validatorsFile === 'string' &&",
				"\t\ttypeof resource.restManifest === 'object' &&",
				'\t\tresource.restManifest !== null',
				'\t);',
				'}',
				'',
				'async function assertTypeArtifactsCurrent',
			].join(lineEnding),
			'type artifact assertion helper',
			syncRestScriptPath,
		);

		nextSource = replaceRequiredSyncRestSource(
			nextSource,
			/const\s+restResources\s*=\s*REST_RESOURCES\.filter\(\s*isWorkspaceRestResource\s*\);/u,
			restBlocksAnchor,
			[
				'$1const restBlocks = BLOCKS.filter(isRestEnabledBlock);',
				'$1const restResources = REST_RESOURCES.filter(isWorkspaceRestResource);',
			].join(lineEnding),
			'restBlocks filter',
			syncRestScriptPath,
		);

		nextSource = insertRestResourceNoResourcesGuard(
			nextSource,
			syncRestScriptPath,
		);

		nextSource = replaceRequiredSyncRestSource(
			nextSource,
			/for\s*\(\s*const\s+resource\s+of\s+restResources\s*\)\s*\{/u,
			FINAL_SYNC_SUMMARY_PATTERN,
			[
				'',
				'\tfor ( const resource of restResources ) {',
				'\t\tconst contracts = resource.restManifest.contracts;',
				'',
				'\t\tfor ( const [ baseName, contract ] of Object.entries( contracts ) ) {',
				'\t\t\tawait syncTypeSchemas(',
				'\t\t\t\t{',
				'\t\t\t\t\tjsonSchemaFile: path.join(',
				'\t\t\t\t\t\tpath.dirname( resource.typesFile ),',
				"\t\t\t\t\t\t'api-schemas',",
				'\t\t\t\t\t\t`${ baseName }.schema.json`',
				'\t\t\t\t\t),',
				'\t\t\t\t\topenApiFile: path.join(',
				'\t\t\t\t\t\tpath.dirname( resource.typesFile ),',
				"\t\t\t\t\t\t'api-schemas',",
				'\t\t\t\t\t\t`${ baseName }.openapi.json`',
				'\t\t\t\t\t),',
				'\t\t\t\t\tsourceTypeName: contract.sourceTypeName,',
				'\t\t\t\t\ttypesFile: resource.typesFile,',
				'\t\t\t\t},',
				'\t\t\t\t{',
				'\t\t\t\t\tcheck: options.check,',
				'\t\t\t\t}',
				'\t\t\t);',
				'\t\t}',
				'',
				'\t\tawait syncRestOpenApi(',
				'\t\t\t{',
				'\t\t\t\tmanifest: resource.restManifest,',
				'\t\t\t\topenApiFile: resource.openApiFile,',
				'\t\t\t\ttypesFile: resource.typesFile,',
				'\t\t\t},',
				'\t\t\t{',
				'\t\t\t\tcheck: options.check,',
				'\t\t\t}',
				'\t\t);',
				'',
				'\t\tawait syncEndpointClient(',
				'\t\t\t{',
				'\t\t\t\tclientFile: resource.clientFile,',
				'\t\t\t\tmanifest: resource.restManifest,',
				'\t\t\t\ttypesFile: resource.typesFile,',
				'\t\t\t\tvalidatorsFile: resource.validatorsFile,',
				'\t\t\t},',
				'\t\t\t{',
				'\t\t\t\tcheck: options.check,',
				'\t\t\t}',
				'\t\t);',
				'\t}',
				'',
				'\tconsole.log(',
				'\t\toptions.check',
			].join(lineEnding),
			'success log insertion point',
			syncRestScriptPath,
		);

		nextSource = nextSource.replace(
			'✅ REST contract schemas, portable API clients, and endpoint-aware OpenAPI documents are already up to date with the TypeScript types!',
			'✅ REST contract schemas, portable API clients, and endpoint-aware OpenAPI documents are already up to date for workspace blocks and plugin-level resources!',
		);
		nextSource = nextSource.replace(
			'✅ REST contract schemas, portable API clients, and endpoint-aware OpenAPI documents generated from TypeScript types!',
			'✅ REST contract schemas, portable API clients, and endpoint-aware OpenAPI documents generated for workspace blocks and plugin-level resources!',
		);

		return nextSource;
	});
}
