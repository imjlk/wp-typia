import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { getPackageVersions } from '../shared/package-versions.js';
import { getWorkspaceBootstrapPath, patchFile } from './cli-add-shared.js';
import {
  appendPhpSnippetBeforeClosingTag,
  insertPhpSnippetBeforeWorkspaceAnchors,
} from './cli-add-workspace-mutation.js';
import { readJsonFile } from '../shared/json-utils.js';
import { hasPhpFunctionDefinition } from '../shared/php-utils.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

const AI_FEATURE_SERVER_GLOB = '/inc/ai-features/*.php';

/**
 * Patch generated sync-rest scripts so AI feature REST artifacts join workspace REST synchronization.
 */
export {
	ensureAiFeatureSyncRestAnchors,
} from './cli-add-workspace-ai-sync-rest-anchors.js';

/**
 * Patch the workspace bootstrap file so it loads generated AI feature PHP modules.
 */
export async function ensureAiFeatureBootstrapAnchors(
	workspace: WorkspaceProject,
): Promise<void> {
  const bootstrapPath = getWorkspaceBootstrapPath(workspace);

  await patchFile(bootstrapPath, (source) => {
		let nextSource = source;
		const registerFunctionName = `${workspace.workspace.phpPrefix}_register_ai_features`;
		const registerHook = `add_action( 'init', '${registerFunctionName}', 20 );`;
		const registerFunction = `

function ${registerFunctionName}() {
\tforeach ( glob( __DIR__ . '${AI_FEATURE_SERVER_GLOB}' ) ?: array() as $ai_feature_module ) {
\t\trequire_once $ai_feature_module;
\t}
}
`;
		if (!hasPhpFunctionDefinition(nextSource, registerFunctionName)) {
			nextSource = insertPhpSnippetBeforeWorkspaceAnchors(nextSource, registerFunction);
		} else if (!nextSource.includes(AI_FEATURE_SERVER_GLOB)) {
			throw new Error(
				[
					`Unable to patch ${path.basename(bootstrapPath)} in ensureAiFeatureBootstrapAnchors.`,
					`The existing ${registerFunctionName}() definition does not include ${AI_FEATURE_SERVER_GLOB}.`,
					'Restore the generated bootstrap shape or wire the AI feature loader manually before retrying.',
				].join(' '),
			);
		}

		if (!nextSource.includes(registerHook)) {
			nextSource = appendPhpSnippetBeforeClosingTag(nextSource, registerHook);
		}

		return nextSource;
	});
}

/**
 * Patch `package.json` with `sync-ai` plus the project-tools dependency used by generated AI sync scripts.
 */
export async function ensureAiFeaturePackageScripts(
	workspace: WorkspaceProject,
): Promise<{
	/** True when `@wp-typia/project-tools` was newly added to `devDependencies`. */
  addedProjectToolsDependency: boolean;
	/** True when the workspace did not already define a `sync-ai` script. */
  addedSyncAiScript: boolean;
}> {
  const packageJsonPath = path.join(workspace.projectDir, 'package.json');
  const packageJson = await readJsonFile<{
		devDependencies?: Record<string, string>;
		scripts?: Record<string, string>;
	}>(packageJsonPath, {
    context: 'workspace package manifest',
  });

  const nextScripts = {
		...(packageJson.scripts ?? {}),
		'sync-ai':
			packageJson.scripts?.['sync-ai'] ?? 'ttsx scripts/sync-ai-features.ts',
	};
  const nextDevDependencies = {
		...(packageJson.devDependencies ?? {}),
		'@wp-typia/project-tools':
			packageJson.devDependencies?.['@wp-typia/project-tools'] ??
			getPackageVersions().projectToolsPackageVersion,
	};
  const addedSyncAiScript = packageJson.scripts?.['sync-ai'] === undefined;
  const addedProjectToolsDependency =
		packageJson.devDependencies?.['@wp-typia/project-tools'] === undefined;

  if (
		JSON.stringify(nextScripts) === JSON.stringify(packageJson.scripts ?? {}) &&
		JSON.stringify(nextDevDependencies) ===
			JSON.stringify(packageJson.devDependencies ?? {})
	) {
    return {
      addedProjectToolsDependency: false,
      addedSyncAiScript: false,
    };
  }

  packageJson.scripts = nextScripts;
  packageJson.devDependencies = nextDevDependencies;
  await fsp.writeFile(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, '\t')}\n`,
    'utf8',
  );

  return {
    addedProjectToolsDependency,
    addedSyncAiScript,
  };
}

/**
 * Patch `scripts/sync-project.ts` after package scripts so generated workspaces invoke `sync-ai` when present.
 */
export async function ensureAiFeatureSyncProjectAnchors(
	workspace: WorkspaceProject,
): Promise<void> {
  const syncProjectScriptPath = path.join(
    workspace.projectDir,
    'scripts',
    'sync-project.ts',
  );

  await patchFile(syncProjectScriptPath, (source) => {
		let nextSource = source;
		const syncRestConst = "const syncRestScriptPath = path.join( 'scripts', 'sync-rest-contracts.ts' );";
		const syncAiConst = "const syncAiScriptPath = path.join( 'scripts', 'sync-ai-features.ts' );";
		const syncRestBlockPattern =
			/if \( fs\.existsSync\( path\.resolve\( process\.cwd\(\), syncRestScriptPath \) \) \) \{\n\s*runSyncScript\( syncRestScriptPath, options \);\n\s*\}/u;
		const syncAiBlock = [
			'if ( fs.existsSync( path.resolve( process.cwd(), syncAiScriptPath ) ) ) {',
			'\trunSyncScript( syncAiScriptPath, options );',
			'}',
		].join('\n');

		if (!nextSource.includes(syncAiConst)) {
			if (!nextSource.includes(syncRestConst)) {
				throw new Error(
					[
						`ensureAiFeatureSyncProjectAnchors could not patch ${path.basename(syncProjectScriptPath)}.`,
						'Missing the expected sync-rest script constant in scripts/sync-project.ts.',
						'Restore the generated template or wire sync-ai manually before retrying.',
					].join(' '),
				);
			}
			nextSource = nextSource.replace(
				syncRestConst,
				`${syncRestConst}\n${syncAiConst}`,
			);
		}

		if (!nextSource.includes('runSyncScript( syncAiScriptPath, options );')) {
			if (!syncRestBlockPattern.test(nextSource)) {
				throw new Error(
					[
						`ensureAiFeatureSyncProjectAnchors could not patch ${path.basename(syncProjectScriptPath)}.`,
						'Missing the expected sync-rest invocation block in scripts/sync-project.ts.',
						'Restore the generated template or wire sync-ai manually before retrying.',
					].join(' '),
				);
			}

			nextSource = nextSource.replace(
				syncRestBlockPattern,
				(match) => `${match}\n\n${syncAiBlock}`,
			);
		}

		return nextSource;
	});
}
