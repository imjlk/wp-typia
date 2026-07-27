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
import {
  detectSourceLineEnding,
  findExecutablePatternMatch,
  findUncommentedPatternMatch,
  hasExecutablePattern,
  hasUncommentedPattern,
} from '../shared/ts-source-masking.js';
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
    const lineEnding = detectSourceLineEnding(source);
    const syncRestConstPattern =
      /^([ \t]*)const\s+syncRestScriptPath\s*=\s*path\.join\(\s*(['"])scripts\2\s*,\s*(['"])sync-rest-contracts\.ts\3\s*\);/mu;
    const syncAiConstPattern =
      /const\s+syncAiScriptPath\s*=\s*path\.join\(\s*(['"])scripts\1\s*,\s*(['"])sync-ai-features\.ts\2\s*\);/u;
    const syncRestBlockPattern =
      /^([ \t]*)if\s*\(\s*fs\.existsSync\(\s*path\.resolve\(\s*process\.cwd\(\)\s*,\s*syncRestScriptPath\s*\)\s*\)\s*\)\s*\{\r?\n([ \t]*)runSyncScript\(\s*syncRestScriptPath\s*,\s*options\s*\);\r?\n[ \t]*\}/mu;
    const syncAiCallPattern =
      /runSyncScript\(\s*syncAiScriptPath\s*,\s*options\s*\);/u;
    const buildSyncAiBlock = (
      indentation: string,
      bodyIndentation: string,
    ): string =>
      [
        `${indentation}if (fs.existsSync(path.resolve(process.cwd(), syncAiScriptPath))) {`,
        `${bodyIndentation}runSyncScript(syncAiScriptPath, options);`,
        `${indentation}}`,
      ].join(lineEnding);

    if (!hasUncommentedPattern(nextSource, syncAiConstPattern)) {
      const syncRestConstRange = findUncommentedPatternMatch(nextSource, [
        syncRestConstPattern,
      ]);
      if (!syncRestConstRange) {
				throw new Error(
					[
						`ensureAiFeatureSyncProjectAnchors could not patch ${path.basename(syncProjectScriptPath)}.`,
						'Missing the expected sync-rest script constant in scripts/sync-project.ts.',
						'Restore the generated template or wire sync-ai manually before retrying.',
					].join(' '),
				);
			}
      const syncRestConstSource = nextSource.slice(
        syncRestConstRange.start,
        syncRestConstRange.end,
      );
      const syncRestConstMatch = syncRestConstPattern.exec(syncRestConstSource);
      const indentation = syncRestConstMatch?.[1] ?? '';
      const directoryQuote = syncRestConstMatch?.[2] ?? "'";
      const fileQuote = syncRestConstMatch?.[3] ?? directoryQuote;
      const syncAiConst =
        `const syncAiScriptPath = path.join(` +
        `${directoryQuote}scripts${directoryQuote}, ` +
        `${fileQuote}sync-ai-features.ts${fileQuote});`;
      nextSource =
        `${nextSource.slice(0, syncRestConstRange.end)}${lineEnding}` +
        `${indentation}${syncAiConst}` +
        nextSource.slice(syncRestConstRange.end);
    }

    if (!hasExecutablePattern(nextSource, syncAiCallPattern)) {
      const syncRestBlockRange = findExecutablePatternMatch(nextSource, [
        syncRestBlockPattern,
      ]);
      if (!syncRestBlockRange) {
				throw new Error(
					[
						`ensureAiFeatureSyncProjectAnchors could not patch ${path.basename(syncProjectScriptPath)}.`,
						'Missing the expected sync-rest invocation block in scripts/sync-project.ts.',
						'Restore the generated template or wire sync-ai manually before retrying.',
					].join(' '),
				);
			}
      const syncRestBlockSource = nextSource.slice(
        syncRestBlockRange.start,
        syncRestBlockRange.end,
      );
      const syncRestBlockMatch = syncRestBlockPattern.exec(syncRestBlockSource);
      const indentation = syncRestBlockMatch?.[1] ?? '';
      const bodyIndentation =
        syncRestBlockMatch?.[2] ?? `${indentation}  `;
      nextSource =
        nextSource.slice(0, syncRestBlockRange.end) +
        lineEnding +
        lineEnding +
        buildSyncAiBlock(indentation, bodyIndentation) +
        nextSource.slice(syncRestBlockRange.end);
    }

    return nextSource;
  });
}
