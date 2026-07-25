import { promises as fsp } from 'node:fs';
import path from 'node:path';

import semver from 'semver';

import { getWorkspaceBootstrapPath, patchFile } from './cli-add-shared.js';
import {
  ABILITY_EDITOR_ASSET,
  ABILITY_EDITOR_SCRIPT,
  ABILITY_SERVER_GLOB,
  WP_ABILITIES_SCRIPT_MODULE_ID,
  WP_CORE_ABILITIES_SCRIPT_MODULE_ID,
} from './cli-add-workspace-ability-types.js';
import {
  appendPhpSnippetBeforeClosingTag,
  insertPhpSnippetBeforeWorkspaceAnchors,
} from './cli-add-workspace-mutation.js';
import { readJsonFile } from '../shared/json-utils.js';
import {
  DEFAULT_WORDPRESS_ABILITIES_VERSION,
  DEFAULT_WORDPRESS_CORE_ABILITIES_VERSION,
} from '../shared/package-versions.js';
import {
  findPhpFunctionRange,
  hasPhpFunctionCall,
  hasPhpFunctionDefinition,
  replacePhpFunctionDefinition,
} from '../shared/php-utils.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

function resolveManagedDependencyVersion(
	existingVersion: string | undefined,
	requiredVersion: string,
): string {
  if (!existingVersion) {
    return requiredVersion;
  }

  const existingMinimum = semver.minVersion(existingVersion);
  const requiredMinimum = semver.minVersion(requiredVersion);
  if (!existingMinimum || !requiredMinimum) {
    return requiredVersion;
  }

  return semver.gte(existingMinimum, requiredMinimum)
    ? existingVersion
    : requiredVersion;
}

/**
 * Ensure the workspace bootstrap loads generated ability PHP modules and
 * enqueues the generated ability editor script module.
 */
export async function ensureAbilityBootstrapAnchors(
	workspace: WorkspaceProject,
): Promise<void> {
  const bootstrapPath = getWorkspaceBootstrapPath(workspace);

  await patchFile(bootstrapPath, (source) => {
		let nextSource = source;
		const workspaceBaseName =
			workspace.packageName.split('/').pop() ?? workspace.packageName;
		const loadFunctionName = `${workspace.workspace.phpPrefix}_load_workflow_abilities`;
		const enqueueFunctionName =
			`${workspace.workspace.phpPrefix}_enqueue_workflow_abilities`;
		const loadHook = `add_action( 'plugins_loaded', '${loadFunctionName}' );`;
		const adminEnqueueHook = `add_action( 'admin_enqueue_scripts', '${enqueueFunctionName}' );`;
		const editorEnqueueHook = `add_action( 'enqueue_block_editor_assets', '${enqueueFunctionName}' );`;
		const loadFunction = `

function ${loadFunctionName}() {
\tforeach ( glob( __DIR__ . '${ABILITY_SERVER_GLOB}' ) ?: array() as $ability_module ) {
\t\trequire_once $ability_module;
\t}
}
`;
		const enqueueFunction = `

function ${enqueueFunctionName}() {
\tif ( ! class_exists( 'WP_Ability' ) ) {
\t\treturn;
\t}

\t$script_path = __DIR__ . '/${ABILITY_EDITOR_SCRIPT}';
\t$asset_path  = __DIR__ . '/${ABILITY_EDITOR_ASSET}';

\tif ( ! file_exists( $script_path ) || ! file_exists( $asset_path ) ) {
\t\treturn;
\t}

\t$asset = require $asset_path;
\tif ( ! is_array( $asset ) ) {
\t\t$asset = array();
\t}

\t$dependencies = isset( $asset['dependencies'] ) && is_array( $asset['dependencies'] )
\t\t? $asset['dependencies']
\t\t: array();

\tforeach ( array( '${WP_CORE_ABILITIES_SCRIPT_MODULE_ID}', '${WP_ABILITIES_SCRIPT_MODULE_ID}' ) as $ability_dependency ) {
\t\t$has_dependency = false;
\t\tforeach ( $dependencies as $dependency ) {
\t\t\t$dependency_id = is_array( $dependency ) && isset( $dependency['id'] )
\t\t\t\t? $dependency['id']
\t\t\t\t: $dependency;
\t\t\tif ( $dependency_id === $ability_dependency ) {
\t\t\t\t$has_dependency = true;
\t\t\t\tbreak;
\t\t\t}
\t\t}
\t\tif ( ! $has_dependency ) {
\t\t\t$dependencies[] = $ability_dependency;
\t\t}
\t}

\tif ( ! function_exists( 'wp_enqueue_script_module' ) ) {
\t\treturn;
\t}

\twp_enqueue_script_module(
\t\t'${workspaceBaseName}-abilities',
\t\tplugins_url( '${ABILITY_EDITOR_SCRIPT}', __FILE__ ),
\t\t$dependencies,
\t\tisset( $asset['version'] ) ? $asset['version'] : filemtime( $script_path )
\t);
}
`;
		if (!hasPhpFunctionDefinition(nextSource, loadFunctionName)) {
			nextSource = insertPhpSnippetBeforeWorkspaceAnchors(nextSource, loadFunction);
		}
		if (!hasPhpFunctionDefinition(nextSource, enqueueFunctionName)) {
			nextSource = insertPhpSnippetBeforeWorkspaceAnchors(
				nextSource,
				enqueueFunction,
			);
		} else {
			const functionRange = findPhpFunctionRange(nextSource, enqueueFunctionName);
			const functionSource = functionRange
				? nextSource.slice(functionRange.start, functionRange.end)
				: '';
			if (!hasPhpFunctionCall(functionSource, 'wp_enqueue_script_module')) {
				const replacedSource = replacePhpFunctionDefinition(
					nextSource,
					enqueueFunctionName,
					enqueueFunction,
					{ trimReplacementStart: true },
				);
				if (!replacedSource) {
					throw new Error(
						`Unable to repair ${path.basename(bootstrapPath)} for ${enqueueFunctionName}.`,
					);
				}
				nextSource = replacedSource;
			}
		}

		if (!nextSource.includes(loadHook)) {
			nextSource = appendPhpSnippetBeforeClosingTag(nextSource, loadHook);
		}
		if (!nextSource.includes(adminEnqueueHook)) {
			nextSource = appendPhpSnippetBeforeClosingTag(nextSource, adminEnqueueHook);
		}
		if (!nextSource.includes(editorEnqueueHook)) {
			nextSource = appendPhpSnippetBeforeClosingTag(nextSource, editorEnqueueHook);
		}

		return nextSource;
	});
}

/**
 * Ensure ability package scripts and WordPress ability runtime dependencies
 * are present without downgrading existing compatible ranges.
 */
export async function ensureAbilityPackageScripts(
	workspace: WorkspaceProject,
): Promise<void> {
  const packageJsonPath = path.join(workspace.projectDir, 'package.json');
  const packageJson = await readJsonFile<{
		dependencies?: Record<string, string>;
		scripts?: Record<string, string>;
	}>(packageJsonPath, {
    context: 'workspace package manifest',
  });

  const nextScripts = {
		...(packageJson.scripts ?? {}),
		'sync-abilities':
			packageJson.scripts?.['sync-abilities'] ?? 'ttsx scripts/sync-abilities.ts',
	};
  const nextDependencies = {
    ...(packageJson.dependencies ?? {}),
    [WP_ABILITIES_SCRIPT_MODULE_ID]: resolveManagedDependencyVersion(
      packageJson.dependencies?.[WP_ABILITIES_SCRIPT_MODULE_ID],
      DEFAULT_WORDPRESS_ABILITIES_VERSION,
    ),
    [WP_CORE_ABILITIES_SCRIPT_MODULE_ID]: resolveManagedDependencyVersion(
      packageJson.dependencies?.[WP_CORE_ABILITIES_SCRIPT_MODULE_ID],
      DEFAULT_WORDPRESS_CORE_ABILITIES_VERSION,
    ),
  };

  if (
		JSON.stringify(nextScripts) === JSON.stringify(packageJson.scripts ?? {}) &&
		JSON.stringify(nextDependencies) ===
			JSON.stringify(packageJson.dependencies ?? {})
	) {
    return;
  }

  packageJson.scripts = nextScripts;
  packageJson.dependencies = nextDependencies;
  await fsp.writeFile(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, '\t')}\n`,
    'utf8',
  );
}

/**
 * Ensure `scripts/sync-project.ts` delegates to the generated ability sync
 * script when present.
 */
export async function ensureAbilitySyncProjectAnchors(
	workspace: WorkspaceProject,
): Promise<void> {
  const syncProjectScriptPath = path.join(
    workspace.projectDir,
    'scripts',
    'sync-project.ts',
  );

  await patchFile(syncProjectScriptPath, (source) => {
		let nextSource = source;
		const syncRestConst =
			"const syncRestScriptPath = path.join( 'scripts', 'sync-rest-contracts.ts' );";
		const syncAbilitiesConst =
			"const syncAbilitiesScriptPath = path.join( 'scripts', 'sync-abilities.ts' );";
		const syncRestBlockPattern =
			/if \( fs\.existsSync\( path\.resolve\( process\.cwd\(\), syncRestScriptPath \) \) \) \{\n\s*runSyncScript\( syncRestScriptPath, options \);\n\s*\}/u;
		const syncAbilitiesBlock = [
			'if ( fs.existsSync( path.resolve( process.cwd(), syncAbilitiesScriptPath ) ) ) {',
			'\trunSyncScript( syncAbilitiesScriptPath, options );',
			'}',
		].join('\n');

		if (!nextSource.includes(syncAbilitiesConst)) {
			if (!nextSource.includes(syncRestConst)) {
				throw new Error(
					[
						`ensureAbilitySyncProjectAnchors could not patch ${path.basename(syncProjectScriptPath)}.`,
						'Missing the expected sync-rest script constant in scripts/sync-project.ts.',
						'Restore the generated template or wire sync-abilities manually before retrying.',
					].join(' '),
				);
			}
			nextSource = nextSource.replace(
				syncRestConst,
				`${syncRestConst}\n${syncAbilitiesConst}`,
			);
		}

		if (!nextSource.includes('runSyncScript( syncAbilitiesScriptPath, options );')) {
			if (!syncRestBlockPattern.test(nextSource)) {
				throw new Error(
					[
						`ensureAbilitySyncProjectAnchors could not patch ${path.basename(syncProjectScriptPath)}.`,
						'Missing the expected sync-rest invocation block in scripts/sync-project.ts.',
						'Restore the generated template or wire sync-abilities manually before retrying.',
					].join(' '),
				);
			}

			nextSource = nextSource.replace(
				syncRestBlockPattern,
				(match) => `${match}\n\n${syncAbilitiesBlock}`,
			);
		}

		return nextSource;
	});
}

/**
 * Ensure the workspace build script includes optional ability client entries.
 */
export async function ensureAbilityBuildScriptAnchors(
	workspace: WorkspaceProject,
): Promise<void> {
  const buildScriptPath = path.join(
    workspace.projectDir,
    'scripts',
    'build-workspace.mjs',
  );

  await patchFile(buildScriptPath, (source) => {
		let nextSource = source;
		if (/['"]src\/abilities\/index\.(?:ts|js)['"]/u.test(nextSource)) {
			return nextSource;
		}

		const sharedEntriesPattern =
			/(for\s*\(\s*const\s+relativePath\s+of\s+\[)([\s\S]*?)(\]\s*\)\s*\{)/u;
		const match = nextSource.match(sharedEntriesPattern);
		if (
			!match ||
			!/['"]src\/bindings\/index\.(?:ts|js)['"]/u.test(match[2]) ||
			!/['"]src\/editor-plugins\/index\.(?:tsx|ts|js)['"]/u.test(match[2])
		) {
			throw new Error(
				[
					`ensureAbilityBuildScriptAnchors could not patch ${path.basename(buildScriptPath)}.`,
					'Missing the expected shared editor entries array in scripts/build-workspace.mjs.',
					'Restore the generated template or wire abilities/index manually before retrying.',
				].join(' '),
			);
		}

		nextSource = nextSource.replace(sharedEntriesPattern, (fullMatch, sharedEntries) => {
			const missingAbilityEntries = [
				"'src/abilities/index.ts'",
				"'src/abilities/index.js'",
			].filter((entry) => !sharedEntries.includes(entry));
			if (missingAbilityEntries.length === 0) {
				return fullMatch;
			}

			const itemIndent = sharedEntries.match(/\n([ \t]*)['"]/u)?.[1] ?? '\t\t';
			const trimmedEntries = sharedEntries.replace(/\s*$/u, '');
			const trailingWhitespace = sharedEntries.slice(trimmedEntries.length);
			const separator = trimmedEntries.trimEnd().endsWith(',') ? '' : ',';
			const nextEntries =
				`${trimmedEntries}${separator}` +
				missingAbilityEntries.map((entry) => `\n${itemIndent}${entry},`).join('') +
				trailingWhitespace;

			return fullMatch.replace(sharedEntries, nextEntries);
		});

		return nextSource;
	});
}

/**
 * Ensure webpack discovers the optional ability client registry bundle.
 */
export async function ensureAbilityWebpackAnchors(
	workspace: WorkspaceProject,
): Promise<void> {
  const webpackConfigPath = path.join(
    workspace.projectDir,
    'webpack.config.js',
  );

  await patchFile(webpackConfigPath, (source) => {
		if (/['"]abilities\/index['"]/u.test(source)) {
			return source;
		}

		const optionalModuleReturnPattern =
			/(function\s+getOptionalModuleEntries\s*\(\)\s*\{[\s\S]*?)(\n\treturn Object\.fromEntries\(\s*entries\s*\);\n\})/u;
		if (optionalModuleReturnPattern.test(source)) {
			return source.replace(
				optionalModuleReturnPattern,
				`$1

\tfor ( const [ entryName, candidates ] of [
\t\t[
\t\t\t'abilities/index',
\t\t\t[ 'src/abilities/index.ts', 'src/abilities/index.js' ],
\t\t],
\t] ) {
\t\tfor ( const relativePath of candidates ) {
\t\t\tconst entryPath = path.resolve( process.cwd(), relativePath );
\t\t\tif ( ! fs.existsSync( entryPath ) ) {
\t\t\t\tcontinue;
\t\t\t}

\t\t\tentries.push( [ entryName, entryPath ] );
\t\t\tbreak;
\t\t}
\t}$2`,
			);
		}

		const sharedEntriesPattern =
			/for\s*\(\s*const\s+\[\s*entryName\s*,\s*candidates\s*\]\s+of\s+\[([\s\S]*?)\]\s*\)\s*\{/u;
		const match = source.match(sharedEntriesPattern);
		if (
			!match ||
			!match[1].includes('bindings/index') ||
			!match[1].includes('editor-plugins/index')
		) {
			throw new Error(
				[
					`ensureAbilityWebpackAnchors could not patch ${path.basename(webpackConfigPath)}.`,
					'Missing the expected shared editor entries block in webpack.config.js.',
					'Restore the generated template or wire abilities/index manually before retrying.',
				].join(' '),
			);
		}

		return source.replace(sharedEntriesPattern, (fullMatch, sharedEntries) => {
			if (/['"]abilities\/index['"]/u.test(sharedEntries)) {
				return fullMatch;
			}

			const tupleIndent = sharedEntries.match(/\n([ \t]*)\[/u)?.[1] ?? '\t\t';
			const nestedIndent = `${tupleIndent}\t`;
			const trimmedEntries = sharedEntries.replace(/\s*$/u, '');
			const trailingWhitespace = sharedEntries.slice(trimmedEntries.length);
			const separator = trimmedEntries.trimEnd().endsWith(',') ? '' : ',';
			const abilityTuple = [
				`${tupleIndent}[`,
				`${nestedIndent}'abilities/index',`,
				`${nestedIndent}[ 'src/abilities/index.ts', 'src/abilities/index.js' ],`,
				`${tupleIndent}],`,
			].join('\n');
			const nextEntries =
				`${trimmedEntries}${separator}\n${abilityTuple}` + trailingWhitespace;

			return fullMatch.replace(sharedEntries, nextEntries);
		});
	});
}
