import path from 'node:path';

import { getWorkspaceBootstrapPath, patchFile } from './cli-add-shared.js';
import {
  appendPhpSnippetBeforeClosingTag,
  insertPhpSnippetBeforeWorkspaceAnchors,
} from './cli-add-workspace-mutation.js';
import {
  hasPhpFunctionDefinition,
} from '../shared/php-utils.js';
import {
  buildLegacyGeneratedGlobArrayLoader,
  buildLegacyGeneratedGlobLoader,
  migrateGeneratedPhpLoaderFunction,
} from './cli-add-workspace-php-loader-migration.js';
import { toTitleCase } from '../shared/string-case.js';
import {
  syncWorkspacePhpEntrypoints,
  WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS,
} from '../workspace/workspace-php-entrypoint-manifests.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

/**
 * Ensure workspace bootstrap PHP registers pattern categories and loads the
 * deterministic generated pattern module manifest.
 *
 * @param workspace Resolved official workspace project metadata.
 * @returns A promise that resolves after the workspace bootstrap is patched.
 * @throws {Error} When existing bootstrap source cannot be safely patched.
 */
export async function ensurePatternBootstrapAnchors(
	workspace: WorkspaceProject,
): Promise<void> {
  const workspaceBaseName =
		workspace.packageName.split('/').pop() ?? workspace.packageName;
  const bootstrapPath = getWorkspaceBootstrapPath(workspace);
  await patchFile(bootstrapPath, (source) => {
		let nextSource = source;
		const patternCategoryFunctionName = `${workspace.workspace.phpPrefix}_register_pattern_category`;
		const patternRegistrationFunctionName = `${workspace.workspace.phpPrefix}_register_patterns`;
		const patternCategoryHook = `add_action( 'init', '${patternCategoryFunctionName}' );`;
		const patternRegistrationHook = `add_action( 'init', '${patternRegistrationFunctionName}', 20 );`;
		const patternManifestPath =
			`/${WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.patterns}`;
		const patternRegistrationFunction = `

function ${patternRegistrationFunctionName}() {
	require __DIR__ . '${patternManifestPath}';
}
`;
		const patternCategoryFunction = `

function ${patternCategoryFunctionName}() {
	if ( function_exists( 'register_block_pattern_category' ) ) {
		register_block_pattern_category(
			'${workspace.workspace.namespace}',
			array(
				'label' => __( ${JSON.stringify(`${toTitleCase(workspaceBaseName)} Patterns`)}, '${workspace.workspace.textDomain}' ),
			)
		);
	}
}
`;
		const patternFunctions = `${patternCategoryFunction}
${patternRegistrationFunction.trimStart()}`;

		if (
			!hasPhpFunctionDefinition(nextSource, patternCategoryFunctionName) &&
			!hasPhpFunctionDefinition(nextSource, patternRegistrationFunctionName)
		) {
			nextSource = insertPhpSnippetBeforeWorkspaceAnchors(
				nextSource,
				patternFunctions,
			);
		}

		if (
			!hasPhpFunctionDefinition(nextSource, patternCategoryFunctionName) ||
			!hasPhpFunctionDefinition(nextSource, patternRegistrationFunctionName)
		) {
			throw new Error(
				`Unable to inject pattern bootstrap functions into ${path.basename(bootstrapPath)}.`,
			);
		}

		nextSource = migrateGeneratedPhpLoaderFunction({
			bootstrapPath,
			functionName: patternRegistrationFunctionName,
			legacyFunctions: [
				buildLegacyGeneratedGlobLoader({
					functionName: patternRegistrationFunctionName,
					globPath: '/src/patterns/*.php',
					includeKind: 'require',
					moduleVariable: 'pattern_module',
				}),
				buildLegacyGeneratedGlobArrayLoader({
					functionName: patternRegistrationFunctionName,
					globPaths: ['/src/patterns/*.php'],
					includeKind: 'require',
					moduleVariable: 'pattern_module',
					modulesVariable: 'pattern_modules',
				}),
				buildLegacyGeneratedGlobArrayLoader({
					functionName: patternRegistrationFunctionName,
					globPaths: [
						'/src/patterns/*.php',
						'/src/patterns/*/*.php',
					],
					includeKind: 'require',
					moduleVariable: 'pattern_module',
					modulesVariable: 'pattern_modules',
				}),
			],
			manifestPath: patternManifestPath,
			replacement: patternRegistrationFunction,
			source: nextSource,
		});

		if (!nextSource.includes(patternCategoryHook)) {
			nextSource = appendPhpSnippetBeforeClosingTag(
				nextSource,
				patternCategoryHook,
			);
		}
		if (!nextSource.includes(patternRegistrationHook)) {
			nextSource = appendPhpSnippetBeforeClosingTag(
				nextSource,
				patternRegistrationHook,
			);
		}

		return nextSource;
	});
  await syncWorkspacePhpEntrypoints(workspace.projectDir, {
    manifestIds: ['patterns'],
  });
}
