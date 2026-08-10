import path from 'node:path';

import { getWorkspaceBootstrapPath, patchFile } from './cli-add-shared.js';
import {
  appendPhpSnippetBeforeClosingTag,
  insertPhpSnippetBeforeWorkspaceAnchors,
} from './cli-add-workspace-mutation.js';
import {
  findPhpFunctionRange,
  hasPhpFunctionDefinition,
  hasPhpFunctionCall,
  replacePhpFunctionDefinition,
} from '../shared/php-utils.js';
import {
  syncWorkspacePhpEntrypoints,
  WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS,
} from '../workspace/workspace-php-entrypoint-manifests.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

const REST_SCHEMA_HELPER_PATH = '/inc/rest-schema.php';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * Check that an expected generated path appears inside the named PHP function.
 *
 * @param source Complete PHP bootstrap source.
 * @param functionName PHP function name to inspect.
 * @param needle Source fragment that must be present inside the function block.
 * @returns True when the named function block contains the expected fragment.
 */
function phpFunctionBlockIncludes(
	source: string,
	functionName: string,
	needle: string,
): boolean {
  const functionMatch = new RegExp(
		`function\\s+${escapeRegex(functionName)}\\s*\\(`,
		'u',
	).exec(source);
  if (functionMatch === null) {
    return false;
  }

  const start = functionMatch.index;
  const remainder = source.slice(start + 1);
  const nextFunctionMatch = /\nfunction\s+/u.exec(remainder);
  const nextFunction =
		nextFunctionMatch === null ? -1 : start + 1 + nextFunctionMatch.index;
  const closingTag = source.indexOf('\n?>', start + 1);
  const endCandidates = [nextFunction, closingTag].filter(
    (index) => index !== -1,
  );
  const end = endCandidates.length > 0
    ? Math.min(...endCandidates)
    : source.length;

  return source.slice(start, end).includes(needle);
}

/**
 * Ensure the workspace bootstrap loads the shared REST schema helper file.
 *
 * @param workspace Resolved workspace project metadata and PHP prefix.
 * @returns A promise that resolves after the bootstrap is patched.
 * @throws When an existing loader does not reference `inc/rest-schema.php`.
 */
export async function ensureRestSchemaHelperBootstrapAnchors(
	workspace: WorkspaceProject,
): Promise<void> {
  const bootstrapPath = getWorkspaceBootstrapPath(workspace);

  await patchFile(bootstrapPath, (source) => {
		let nextSource = source;
		const loadFunctionName = `${workspace.workspace.phpPrefix}_load_rest_schema_helpers`;
		const loadCall = `${loadFunctionName}();`;
		const helperFunction = `

function ${loadFunctionName}() {
\tif ( is_readable( __DIR__ . '${REST_SCHEMA_HELPER_PATH}' ) ) {
\t\trequire_once __DIR__ . '${REST_SCHEMA_HELPER_PATH}';
\t}
}

${loadCall}
`;

		if (!hasPhpFunctionDefinition(nextSource, loadFunctionName)) {
			nextSource = insertPhpSnippetBeforeWorkspaceAnchors(nextSource, helperFunction);
		} else if (
			!phpFunctionBlockIncludes(
				nextSource,
				loadFunctionName,
				REST_SCHEMA_HELPER_PATH,
			)
		) {
			throw new Error(
				[
					`Unable to patch ${path.basename(bootstrapPath)} in ensureRestSchemaHelperBootstrapAnchors.`,
					`The existing ${loadFunctionName}() definition does not include ${REST_SCHEMA_HELPER_PATH}.`,
					'Restore the generated bootstrap shape or load inc/rest-schema.php manually before retrying.',
				].join(' '),
			);
		} else if (!nextSource.includes(loadCall)) {
			nextSource = appendPhpSnippetBeforeClosingTag(nextSource, loadCall);
		}

		return nextSource;
	});
}

/**
 * Ensure the workspace bootstrap loads generated REST resource PHP modules.
 *
 * @param workspace Resolved workspace project metadata and PHP prefix.
 * @returns A promise that resolves after the bootstrap is patched.
 * @throws When an existing loader does not reference generated REST modules.
 */
export async function ensureRestResourceBootstrapAnchors(
	workspace: WorkspaceProject,
): Promise<void> {
  const bootstrapPath = getWorkspaceBootstrapPath(workspace);
  const restResourceManifestPath =
    `/${WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.restResources}`;

  await patchFile(bootstrapPath, (source) => {
		let nextSource = source;
		const registerFunctionName = `${workspace.workspace.phpPrefix}_register_rest_resources`;
		const registerHook = `add_action( 'init', '${registerFunctionName}', 20 );`;
		const registerFunction = `

function ${registerFunctionName}() {
\trequire_once __DIR__ . '${restResourceManifestPath}';
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
			if (!functionSource.includes(restResourceManifestPath)) {
				if (!hasPhpFunctionCall(functionSource, 'glob')) {
					throw new Error(
						`Unable to migrate customized ${registerFunctionName}() in ${path.basename(bootstrapPath)}. Restore the generated glob loader or wire ${restResourceManifestPath} manually.`,
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
    manifestIds: ['restResources'],
  });
}
