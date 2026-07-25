import path from 'node:path';

import { getWorkspaceBootstrapPath, patchFile } from './cli-add-shared.js';
import {
  appendPhpSnippetBeforeClosingTag,
  insertPhpSnippetBeforeWorkspaceAnchors,
} from './cli-add-workspace-mutation.js';
import { hasPhpFunctionDefinition } from '../shared/php-utils.js';
import { toTitleCase } from '../shared/string-case.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

const FLAT_PATTERN_GLOB = "glob( __DIR__ . '/src/patterns/*.php' ) ?: array()";
const NESTED_PATTERN_GLOB =
	"glob( __DIR__ . '/src/patterns/*/*.php' ) ?: array()";
const LEGACY_FLAT_PATTERN_MODULES_ASSIGNMENT_PATTERN =
	/^[ \t]*\$pattern_modules\s*=\s*glob\( __DIR__ \. '\/src\/patterns\/\*\.php' \) \?: array\(\);\s*$/mu;
const LEGACY_FLAT_PATTERN_FOREACH_PATTERN =
	/^[ \t]*foreach\s*\(\s*glob\( __DIR__ \. '\/src\/patterns\/\*\.php' \) \?: array\(\)\s+as\s+\$pattern_module\s*\)\s*\{\r?\n[ \t]*require\s+\$pattern_module;\r?\n[ \t]*\}/mu;

function buildNestedPatternModulesAssignment(): string {
  return [
		'\t$pattern_modules = array_merge(',
		`\t\t${FLAT_PATTERN_GLOB},`,
		`\t\t${NESTED_PATTERN_GLOB}`,
		'\t);',
	].join('\n');
}

function ensureNestedPatternLoaderSource(
	source: string,
	bootstrapPath: string,
): string {
  if (source.includes(NESTED_PATTERN_GLOB)) {
    return source;
  }
  if (LEGACY_FLAT_PATTERN_FOREACH_PATTERN.test(source)) {
    return source.replace(
			LEGACY_FLAT_PATTERN_FOREACH_PATTERN,
			[
				buildNestedPatternModulesAssignment(),
				'\tforeach ( $pattern_modules as $pattern_module ) {',
				'\t\trequire $pattern_module;',
				'\t}',
			].join('\n'),
		);
  }
  if (LEGACY_FLAT_PATTERN_MODULES_ASSIGNMENT_PATTERN.test(source)) {
    return source.replace(
      LEGACY_FLAT_PATTERN_MODULES_ASSIGNMENT_PATTERN,
      buildNestedPatternModulesAssignment(),
    );
  }
  if (source.includes('array_merge(') && source.includes(FLAT_PATTERN_GLOB)) {
    return source.replace(
      FLAT_PATTERN_GLOB,
      `${FLAT_PATTERN_GLOB},\n\t\t${NESTED_PATTERN_GLOB}`,
    );
  }
  throw new Error(
    `Unable to repair ${path.basename(bootstrapPath)} pattern loader for nested src/patterns directories.`,
  );
}

/**
 * Ensure workspace bootstrap PHP registers pattern categories and loads
 * generated pattern modules from both flat and nested pattern directories.
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
		const patternFunctions = `

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

function ${patternRegistrationFunctionName}() {
	$pattern_modules = array_merge(
		${FLAT_PATTERN_GLOB},
		${NESTED_PATTERN_GLOB}
	);
	foreach ( $pattern_modules as $pattern_module ) {
		require $pattern_module;
	}
}
`;

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

		nextSource = ensureNestedPatternLoaderSource(nextSource, bootstrapPath);

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
}
