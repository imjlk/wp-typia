import path from 'node:path';

import { getWorkspaceBootstrapPath, patchFile } from './cli-add-shared.js';
import {
  appendPhpSnippetBeforeClosingTag,
  insertPhpSnippetBeforeWorkspaceAnchors,
} from './cli-add-workspace-mutation.js';
import { hasPhpFunctionDefinition } from '../shared/php-utils.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

const REST_RESOURCE_SERVER_GLOB = '/inc/rest/*.php';
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
\t$helper_path = __DIR__ . '${REST_SCHEMA_HELPER_PATH}';
\tif ( is_readable( $helper_path ) ) {
\t\trequire_once $helper_path;
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

  await patchFile(bootstrapPath, (source) => {
		let nextSource = source;
		const registerFunctionName = `${workspace.workspace.phpPrefix}_register_rest_resources`;
		const registerHook = `add_action( 'init', '${registerFunctionName}', 20 );`;
		const registerFunction = `

function ${registerFunctionName}() {
\tforeach ( glob( __DIR__ . '${REST_RESOURCE_SERVER_GLOB}' ) ?: array() as $rest_resource_module ) {
\t\trequire_once $rest_resource_module;
\t}
}
`;
		if (!hasPhpFunctionDefinition(nextSource, registerFunctionName)) {
			nextSource = insertPhpSnippetBeforeWorkspaceAnchors(nextSource, registerFunction);
		} else if (
			!phpFunctionBlockIncludes(
				nextSource,
				registerFunctionName,
				REST_RESOURCE_SERVER_GLOB,
			)
		) {
			throw new Error(
				[
					`Unable to patch ${path.basename(bootstrapPath)} in ensureRestResourceBootstrapAnchors.`,
					`The existing ${registerFunctionName}() definition does not include ${REST_RESOURCE_SERVER_GLOB}.`,
					'Restore the generated bootstrap shape or wire the REST resource loader manually before retrying.',
				].join(' '),
			);
		}

		if (!nextSource.includes(registerHook)) {
			nextSource = appendPhpSnippetBeforeClosingTag(nextSource, registerHook);
		}

		return nextSource;
	});
}
