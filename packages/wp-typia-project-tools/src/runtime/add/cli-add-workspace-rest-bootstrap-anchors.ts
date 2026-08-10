import { getWorkspaceBootstrapPath, patchFile } from './cli-add-shared.js';
import {
  appendPhpSnippetBeforeClosingTag,
  insertPhpSnippetBeforeWorkspaceAnchors,
} from './cli-add-workspace-mutation.js';
import {
  findPhpFunctionRange,
  hasPhpFunctionDefinition,
} from '../shared/php-utils.js';
import {
  buildLegacyGeneratedGlobLoader,
  buildRestSchemaHelperCompatibilityFunctions,
  isEquivalentGeneratedPhp,
  migrateGeneratedPhpLoaderFunction,
  replaceLegacyGeneratedPhpFunction,
} from './cli-add-workspace-php-loader-migration.js';
import {
  syncWorkspacePhpEntrypoints,
  WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS,
} from '../workspace/workspace-php-entrypoint-manifests.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

const REST_SCHEMA_HELPER_PATH = '/inc/rest-schema.php';

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
		const compatibilityFunctions =
			buildRestSchemaHelperCompatibilityFunctions({
				functionName: loadFunctionName,
				helperPath: REST_SCHEMA_HELPER_PATH,
			});

		if (!hasPhpFunctionDefinition(nextSource, loadFunctionName)) {
			nextSource = insertPhpSnippetBeforeWorkspaceAnchors(
				nextSource,
				compatibilityFunctions.replacement,
			);
		} else {
			const functionRange = findPhpFunctionRange(
				nextSource,
				loadFunctionName,
			);
			if (!functionRange || !compatibilityFunctions.currentFunctions.some(
				(currentFunction) => isEquivalentGeneratedPhp(
					functionRange.source,
					currentFunction,
				),
			)) {
				nextSource = replaceLegacyGeneratedPhpFunction({
					bootstrapPath,
					functionName: loadFunctionName,
					legacyFunctions: compatibilityFunctions.legacyFunctions,
					replacement: compatibilityFunctions.replacement,
					source: nextSource,
				});
			}
		}
		if (!nextSource.includes(loadCall)) {
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
			nextSource = migrateGeneratedPhpLoaderFunction({
				bootstrapPath,
				functionName: registerFunctionName,
				legacyFunctions: [buildLegacyGeneratedGlobLoader({
					functionName: registerFunctionName,
					globPath: '/inc/rest/*.php',
					includeKind: 'require_once',
					moduleVariable: 'rest_resource_module',
				})],
				manifestPath: restResourceManifestPath,
				replacement: registerFunction,
				source: nextSource,
			});
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
