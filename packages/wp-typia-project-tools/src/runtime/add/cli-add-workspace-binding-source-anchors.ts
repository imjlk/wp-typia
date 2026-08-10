import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { getWorkspaceBootstrapPath, patchFile } from './cli-add-shared.js';
import {
  appendPhpSnippetBeforeClosingTag,
  insertPhpSnippetBeforeWorkspaceAnchors,
} from './cli-add-workspace-mutation.js';
import { pathExists } from '../shared/fs-async.js';
import {
  findPhpFunctionRange,
  hasPhpLiteralDirectoryInclude,
  hasPhpFunctionDefinition,
} from '../shared/php-utils.js';
import {
  buildLegacyGeneratedGlobLoader,
  buildLegacyGeneratedVariableAssetEnqueue,
  migrateGeneratedPhpLoaderFunction,
  replaceLegacyGeneratedPhpFunction,
} from './cli-add-workspace-php-loader-migration.js';
import {
  syncWorkspacePhpEntrypoints,
  WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS,
} from '../workspace/workspace-php-entrypoint-manifests.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

const BINDING_SOURCE_EDITOR_SCRIPT = 'build/bindings/index.js';
const BINDING_SOURCE_EDITOR_ASSET = 'build/bindings/index.asset.php';

function buildBindingSourceIndexSource(bindingSourceSlugs: string[]): string {
  const importLines = bindingSourceSlugs
		.map((bindingSourceSlug) => `import './${bindingSourceSlug}/editor';`)
		.join('\n');

  return `${importLines}${importLines ? '\n\n' : ''}// wp-typia add binding-source entries\n`;
}

/**
 * Ensure the workspace bootstrap loads binding-source PHP and editor bundles.
 *
 * @param workspace Official workspace metadata used to locate and patch the bootstrap file.
 * @returns A promise that resolves after the bootstrap anchors are present.
 */
export async function ensureBindingSourceBootstrapAnchors(
	workspace: WorkspaceProject,
): Promise<void> {
  const bootstrapPath = getWorkspaceBootstrapPath(workspace);

  await patchFile(bootstrapPath, (source) => {
		let nextSource = source;
		const workspaceBaseName = workspace.packageName.split('/').pop() ?? workspace.packageName;
		const bindingRegistrationFunctionName = `${workspace.workspace.phpPrefix}_register_binding_sources`;
		const bindingEditorEnqueueFunctionName = `${workspace.workspace.phpPrefix}_enqueue_binding_sources_editor`;
		const bindingRegistrationHook = `add_action( 'init', '${bindingRegistrationFunctionName}', 20 );`;
		const bindingEditorEnqueueHook = `add_action( 'enqueue_block_editor_assets', '${bindingEditorEnqueueFunctionName}' );`;
		const bindingSourceManifestPath =
			`/${WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.bindingSources}`;
		const bindingRegistrationFunction = `

function ${bindingRegistrationFunctionName}() {
\trequire_once __DIR__ . '${bindingSourceManifestPath}';
}
`;

		const bindingEditorEnqueueFunction = `

function ${bindingEditorEnqueueFunctionName}() {
\t$script_path = __DIR__ . '/${BINDING_SOURCE_EDITOR_SCRIPT}';

\tif ( ! file_exists( $script_path ) || ! file_exists( __DIR__ . '/${BINDING_SOURCE_EDITOR_ASSET}' ) ) {
\t\treturn;
\t}

\t$asset = require __DIR__ . '/${BINDING_SOURCE_EDITOR_ASSET}';
\tif ( ! is_array( $asset ) ) {
\t\t$asset = array();
\t}

\twp_enqueue_script(
\t\t'${workspaceBaseName}-binding-sources',
\t\tplugins_url( '${BINDING_SOURCE_EDITOR_SCRIPT}', __FILE__ ),
\t\tisset( $asset['dependencies'] ) && is_array( $asset['dependencies'] ) ? $asset['dependencies'] : array(),
\t\tisset( $asset['version'] ) ? $asset['version'] : filemtime( $script_path ),
\t\ttrue
\t);
}
`;

		if (!hasPhpFunctionDefinition(nextSource, bindingRegistrationFunctionName)) {
			nextSource = insertPhpSnippetBeforeWorkspaceAnchors(
				nextSource,
				bindingRegistrationFunction,
			);
		} else {
			nextSource = migrateGeneratedPhpLoaderFunction({
				bootstrapPath,
				functionName: bindingRegistrationFunctionName,
				legacyFunctions: [buildLegacyGeneratedGlobLoader({
					functionName: bindingRegistrationFunctionName,
					globPath: '/src/bindings/*/server.php',
					includeKind: 'require_once',
					moduleVariable: 'binding_source_module',
				})],
				manifestPath: bindingSourceManifestPath,
				replacement: bindingRegistrationFunction,
				source: nextSource,
			});
		}
		if (!hasPhpFunctionDefinition(nextSource, bindingEditorEnqueueFunctionName)) {
			nextSource = insertPhpSnippetBeforeWorkspaceAnchors(
				nextSource,
				bindingEditorEnqueueFunction,
			);
		} else {
			const functionRange = findPhpFunctionRange(
				nextSource,
				bindingEditorEnqueueFunctionName,
			);
			if (!functionRange) {
				throw new Error(
					`Unable to parse ${bindingEditorEnqueueFunctionName}() in ${path.basename(bootstrapPath)}.`,
				);
			}
			if (!hasPhpLiteralDirectoryInclude(
				functionRange.source,
				`/${BINDING_SOURCE_EDITOR_ASSET}`,
			)) {
				const legacyEnqueueFunction =
					buildLegacyGeneratedVariableAssetEnqueue({
						assetPath: BINDING_SOURCE_EDITOR_ASSET,
						currentFunction: bindingEditorEnqueueFunction,
						scriptPath: BINDING_SOURCE_EDITOR_SCRIPT,
					});
				nextSource = replaceLegacyGeneratedPhpFunction({
					bootstrapPath,
					functionName: bindingEditorEnqueueFunctionName,
					legacyFunctions: [legacyEnqueueFunction],
					replacement: bindingEditorEnqueueFunction,
					source: nextSource,
				});
			}
		}

		if (!nextSource.includes(bindingRegistrationHook)) {
			nextSource = appendPhpSnippetBeforeClosingTag(
				nextSource,
				bindingRegistrationHook,
			);
		}
		if (!nextSource.includes(bindingEditorEnqueueHook)) {
			nextSource = appendPhpSnippetBeforeClosingTag(
				nextSource,
				bindingEditorEnqueueHook,
			);
		}

		return nextSource;
	});
  await syncWorkspacePhpEntrypoints(workspace.projectDir, {
    manifestIds: ['bindingSources'],
  });
}

/**
 * Resolve the binding-source editor registry path, preferring existing TypeScript or JavaScript registries.
 *
 * @param projectDir Workspace root directory to inspect.
 * @returns A promise for the registry path to read or write.
 */
export async function resolveBindingSourceRegistryPath(
	projectDir: string,
): Promise<string> {
  const bindingsDir = path.join(projectDir, 'src', 'bindings');
  for (const candidatePath of [
    path.join(bindingsDir, 'index.ts'),
    path.join(bindingsDir, 'index.js'),
  ]) {
    if (await pathExists(candidatePath)) {
      return candidatePath;
    }
  }
  return path.join(bindingsDir, 'index.ts');
}

/**
 * Rewrite the binding-source editor registry with the requested source slug included.
 *
 * @param projectDir Workspace root directory that owns `src/bindings`.
 * @param bindingSourceSlug Binding source slug that must be imported by the registry.
 * @returns A promise that resolves after the registry has been written.
 */
export async function writeBindingSourceRegistry(
	projectDir: string,
	bindingSourceSlug: string,
): Promise<void> {
  const bindingsDir = path.join(projectDir, 'src', 'bindings');
  const bindingsIndexPath = await resolveBindingSourceRegistryPath(projectDir);
  await fsp.mkdir(bindingsDir, { recursive: true });

  const existingBindingSourceSlugs = (await fsp.readdir(bindingsDir, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
  const nextBindingSourceSlugs = Array.from(
		new Set([...existingBindingSourceSlugs, bindingSourceSlug]),
	).sort();
  await fsp.writeFile(
    bindingsIndexPath,
    buildBindingSourceIndexSource(nextBindingSourceSlugs),
    'utf8',
  );
}
