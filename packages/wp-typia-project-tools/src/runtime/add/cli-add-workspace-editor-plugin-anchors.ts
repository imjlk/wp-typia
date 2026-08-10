import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { getWorkspaceBootstrapPath, patchFile } from './cli-add-shared.js';
import {
  appendPhpSnippetBeforeClosingTag,
  insertPhpSnippetBeforeWorkspaceAnchors,
} from './cli-add-workspace-mutation.js';
import { pathExists, readOptionalUtf8File } from '../shared/fs-async.js';
import {
  findPhpFunctionRange,
  hasPhpLiteralDirectoryInclude,
  hasPhpFunctionDefinition,
} from '../shared/php-utils.js';
import {
  buildLegacyGeneratedVariableAssetEnqueue,
  replaceLegacyGeneratedPhpFunction,
} from './cli-add-workspace-php-loader-migration.js';
import { readWorkspaceInventoryAsync } from '../workspace/workspace-inventory.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

const EDITOR_PLUGIN_EDITOR_SCRIPT = 'build/editor-plugins/index.js';
const EDITOR_PLUGIN_EDITOR_ASSET = 'build/editor-plugins/index.asset.php';
const EDITOR_PLUGIN_EDITOR_STYLE = 'build/editor-plugins/style-index.css';
const EDITOR_PLUGIN_EDITOR_STYLE_RTL = 'build/editor-plugins/style-index-rtl.css';

function buildEditorPluginRegistrySource(editorPluginSlugs: string[]): string {
  const importLines = editorPluginSlugs
		.map((editorPluginSlug) => `import './${editorPluginSlug}';`)
		.join('\n');

  return `${importLines}${importLines ? '\n\n' : ''}// wp-typia add editor-plugin entries\n`;
}

/**
 * Ensures the workspace bootstrap enqueues the shared editor plugin bundle.
 *
 * @param workspace Official workspace metadata used to locate and patch the bootstrap file.
 * @returns A promise that resolves after the bootstrap anchors are present.
 */
export async function ensureEditorPluginBootstrapAnchors(
	workspace: WorkspaceProject,
): Promise<void> {
  const bootstrapPath = getWorkspaceBootstrapPath(workspace);

  await patchFile(bootstrapPath, (source) => {
		let nextSource = source;
		const workspaceBaseName = workspace.packageName.split('/').pop() ?? workspace.packageName;
		const enqueueFunctionName = `${workspace.workspace.phpPrefix}_enqueue_editor_plugins_editor`;
		const enqueueHook = `add_action( 'enqueue_block_editor_assets', '${enqueueFunctionName}' );`;
		const enqueueFunction = `

function ${enqueueFunctionName}() {
\t$script_path = __DIR__ . '/${EDITOR_PLUGIN_EDITOR_SCRIPT}';
\t$style_path  = __DIR__ . '/${EDITOR_PLUGIN_EDITOR_STYLE}';
\t$style_rtl_path = __DIR__ . '/${EDITOR_PLUGIN_EDITOR_STYLE_RTL}';

\tif ( ! file_exists( $script_path ) || ! file_exists( __DIR__ . '/${EDITOR_PLUGIN_EDITOR_ASSET}' ) ) {
\t\treturn;
\t}

\t$asset = require __DIR__ . '/${EDITOR_PLUGIN_EDITOR_ASSET}';
\tif ( ! is_array( $asset ) ) {
\t\t$asset = array();
\t}

\twp_enqueue_script(
\t\t'${workspaceBaseName}-editor-plugins',
\t\tplugins_url( '${EDITOR_PLUGIN_EDITOR_SCRIPT}', __FILE__ ),
\t\tisset( $asset['dependencies'] ) && is_array( $asset['dependencies'] ) ? $asset['dependencies'] : array(),
\t\tisset( $asset['version'] ) ? $asset['version'] : filemtime( $script_path ),
\t\ttrue
\t);

\tif ( file_exists( $style_path ) ) {
\t\twp_enqueue_style(
\t\t\t'${workspaceBaseName}-editor-plugins',
\t\t\tplugins_url( '${EDITOR_PLUGIN_EDITOR_STYLE}', __FILE__ ),
\t\t\tarray(),
\t\t\tisset( $asset['version'] ) ? $asset['version'] : filemtime( $style_path )
\t\t);
\t\tif ( file_exists( $style_rtl_path ) ) {
\t\t\twp_style_add_data( '${workspaceBaseName}-editor-plugins', 'rtl', 'replace' );
\t\t}
\t}
}
`;

		if (!hasPhpFunctionDefinition(nextSource, enqueueFunctionName)) {
			nextSource = insertPhpSnippetBeforeWorkspaceAnchors(nextSource, enqueueFunction);
		} else {
			const functionRange = findPhpFunctionRange(nextSource, enqueueFunctionName);
			if (!functionRange) {
				throw new Error(
					`Unable to parse ${enqueueFunctionName}() in ${path.basename(bootstrapPath)}.`,
				);
			}
			if (!hasPhpLiteralDirectoryInclude(
				functionRange.source,
				`/${EDITOR_PLUGIN_EDITOR_ASSET}`,
			)) {
				const legacyEnqueueFunction =
					buildLegacyGeneratedVariableAssetEnqueue({
						assetPath: EDITOR_PLUGIN_EDITOR_ASSET,
						currentFunction: enqueueFunction,
						scriptPath: EDITOR_PLUGIN_EDITOR_SCRIPT,
					});
				nextSource = replaceLegacyGeneratedPhpFunction({
					bootstrapPath,
					functionName: enqueueFunctionName,
					legacyFunctions: [legacyEnqueueFunction],
					replacement: enqueueFunction,
					source: nextSource,
				});
			}
		}

		if (!nextSource.includes(enqueueHook)) {
			nextSource = appendPhpSnippetBeforeClosingTag(nextSource, enqueueHook);
		}

		return nextSource;
	});
}

/**
 * Ensures the workspace build script includes the shared editor plugin entry.
 *
 * @param workspace Official workspace metadata used to locate the build script.
 * @returns A promise that resolves after the build script anchors are present.
 */
export async function ensureEditorPluginBuildScriptAnchors(
	workspace: WorkspaceProject,
): Promise<void> {
  const buildScriptPath = path.join(
    workspace.projectDir,
    'scripts',
    'build-workspace.mjs',
  );

  await patchFile(buildScriptPath, (source) => {
		if (/['"]src\/editor-plugins\/index\.(?:ts|js)['"]/u.test(source)) {
			return source;
		}

		const legacySharedEntriesPattern =
			/\[\s*['"]src\/bindings\/index\.ts['"]\s*,\s*['"]src\/bindings\/index\.js['"]\s*(?:,\s*)?\]/u;
		const nextSource = source.replace(
			legacySharedEntriesPattern,
			`[
\t\t'src/bindings/index.ts',
\t\t'src/bindings/index.js',
\t\t'src/editor-plugins/index.ts',
\t\t'src/editor-plugins/index.js',
\t]`,
		);

		if (nextSource === source) {
			throw new Error(
				`Unable to update ${path.relative(workspace.projectDir, buildScriptPath)} for editor plugin shared entries.`,
			);
		}

		return nextSource;
	});
}

/**
 * Ensures the workspace webpack config builds the shared editor plugin entry.
 *
 * @param workspace Official workspace metadata used to locate the webpack config.
 * @returns A promise that resolves after the webpack anchors are present.
 */
export async function ensureEditorPluginWebpackAnchors(
	workspace: WorkspaceProject,
): Promise<void> {
  const webpackConfigPath = path.join(
    workspace.projectDir,
    'webpack.config.js',
  );

  await patchFile(webpackConfigPath, (source) => {
		if (/['"]editor-plugins\/index['"]/u.test(source)) {
			return source;
		}

		const legacySharedEntriesBlockPattern =
			/for\s*\(\s*const\s+relativePath\s+of\s+\[\s*['"]src\/bindings\/index\.ts['"]\s*,\s*['"]src\/bindings\/index\.js['"]\s*(?:,\s*)?\]\s*\)\s*\{[\s\S]*?entries\.push\(\s*\[\s*['"]bindings\/index['"]\s*,\s*entryPath\s*\]\s*\);\s*break;\s*\}/u;
		const nextSharedEntriesBlock = [
			'\tfor ( const [ entryName, candidates ] of [',
			'\t\t[',
			"\t\t\t'bindings/index',",
			"\t\t\t[ 'src/bindings/index.ts', 'src/bindings/index.js' ],",
			'\t\t],',
			'\t\t[',
			"\t\t\t'editor-plugins/index',",
			"\t\t\t[ 'src/editor-plugins/index.ts', 'src/editor-plugins/index.js' ],",
			'\t\t],',
			'\t] ) {',
			'\t\tfor ( const relativePath of candidates ) {',
			'\t\t\tconst entryPath = path.resolve( process.cwd(), relativePath );',
			'\t\t\tif ( ! fs.existsSync( entryPath ) ) {',
			'\t\t\t\tcontinue;',
			'\t\t\t}',
			'',
			'\t\t\tentries.push( [ entryName, entryPath ] );',
			'\t\t\tbreak;',
			'\t\t}',
			'\t}',
		].join('\n');
		const nextSource = source.replace(
			legacySharedEntriesBlockPattern,
			nextSharedEntriesBlock,
		);

		if (nextSource === source) {
			throw new Error(
				`Unable to update ${path.relative(workspace.projectDir, webpackConfigPath)} for editor plugin shared entries.`,
			);
		}

		return nextSource;
	});
}

/**
 * Resolves the editor plugin registry path, preferring existing TypeScript or JavaScript registries.
 *
 * @param projectDir Workspace root directory to inspect.
 * @returns A promise for the registry path to read or write.
 */
export async function resolveEditorPluginRegistryPath(projectDir: string): Promise<string> {
  const editorPluginsDir = path.join(projectDir, 'src', 'editor-plugins');
  for (const candidatePath of [
    path.join(editorPluginsDir, 'index.ts'),
    path.join(editorPluginsDir, 'index.js'),
  ]) {
    if (await pathExists(candidatePath)) {
      return candidatePath;
    }
  }
  return path.join(editorPluginsDir, 'index.ts');
}

async function readEditorPluginRegistrySlugs(
	registryPath: string,
): Promise<string[]> {
  const source = await readOptionalUtf8File(registryPath);
  if (source === null) {
    return [];
  }

  return Array.from(
		source.matchAll(
			/^\s*import\s+['"]\.\/([^/'"]+)(?:\/index(?:\.[cm]?[jt]sx?)?)?['"];?\s*$/gmu,
		),
	).map((match) => match[1]);
}

/**
 * Rewrites the shared editor plugin registry with the requested plugin slug included.
 *
 * @param projectDir Workspace root directory that owns `src/editor-plugins`.
 * @param editorPluginSlug Editor plugin slug that must be imported by the registry.
 * @returns A promise that resolves after the registry has been written.
 */
export async function writeEditorPluginRegistry(
	projectDir: string,
	editorPluginSlug: string,
): Promise<void> {
  const editorPluginsDir = path.join(projectDir, 'src', 'editor-plugins');
  const registryPath = await resolveEditorPluginRegistryPath(projectDir);
  await fsp.mkdir(editorPluginsDir, { recursive: true });

  const existingEditorPluginSlugs = (
		await readWorkspaceInventoryAsync(projectDir)
	).editorPlugins.map((entry) => entry.slug);
  const existingRegistrySlugs = await readEditorPluginRegistrySlugs(
    registryPath,
  );
  const nextEditorPluginSlugs = Array.from(
		new Set([...existingEditorPluginSlugs, ...existingRegistrySlugs, editorPluginSlug]),
	).sort();
  await fsp.writeFile(
    registryPath,
    buildEditorPluginRegistrySource(nextEditorPluginSlugs),
    'utf8',
  );
}
