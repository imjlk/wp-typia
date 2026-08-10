import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { pathExists } from '../shared/fs-async.js';
import {
  assertVariationDoesNotExist,
  assertValidGeneratedSlug,
  normalizeBlockSlug,
  quoteTsString,
  resolveWorkspaceBlock,
  rollbackWorkspaceMutation,
  type RunAddVariationCommandOptions,
  type WorkspaceMutationSnapshot,
  snapshotWorkspaceFiles,
} from './cli-add-shared.js';
import { ensureWorkspaceEntrypointCall } from './cli-add-workspace-registration-hooks.js';
import {
  collectGeneratedTypeScriptModulePaths,
  isGeneratedTypeScriptModuleFilename,
  resolveAndMigrateGeneratedExportedConstName,
} from './cli-add-workspace-generated-exports.js';
import {
  appendWorkspaceInventoryEntries,
  readWorkspaceInventoryAsync,
} from '../workspace/workspace-inventory.js';
import { resolveWorkspaceProject } from '../workspace/workspace-project.js';
import {
  toCollisionSafePascalCase,
  toSnakeCase,
  toTitleCase,
} from '../shared/string-case.js';
import { TYPESCRIPT_PRINT_WIDTH } from '../shared/ts-string-literals.js';

const VARIATIONS_IMPORT_LINE =
	"import { registerWorkspaceVariations } from './variations';";
const VARIATIONS_IMPORT_PATTERN =
	/^[ \t]*import\s*\{\s*registerWorkspaceVariations\s*\}\s*from\s*["']\.\/variations["'][ \t]*;?[ \t]*$/mu;
const VARIATIONS_CALL_LINE = 'registerWorkspaceVariations();';
const VARIATIONS_CALL_PATTERN = /registerWorkspaceVariations\s*\(\s*\)\s*;?/u;

function buildVariationConfigEntry(blockSlug: string, variationSlug: string): string {
  return [
		'\t{',
		`\t\tblock: ${quoteTsString(blockSlug)},`,
		`\t\tfile: ${quoteTsString(`src/blocks/${blockSlug}/variations/${variationSlug}.ts`)},`,
		`\t\tslug: ${quoteTsString(variationSlug)},`,
		'\t},',
	].join('\n');
}

function buildVariationConstName(variationSlug: string): string {
  return `workspaceVariation${toCollisionSafePascalCase(variationSlug)}`;
}

function buildVariationTranslationProperty(
  propertyName: string,
  message: string,
  textDomain: string,
): string {
  const messageLiteral = quoteTsString(message);
  const textDomainLiteral = quoteTsString(textDomain);
  const compact =
    `  ${propertyName}: __(${messageLiteral}, ${textDomainLiteral}),`;
  if (compact.length <= TYPESCRIPT_PRINT_WIDTH) {
    return compact;
  }

  return [
    `  ${propertyName}: __(`,
    `    ${messageLiteral},`,
    `    ${textDomainLiteral},`,
    '  ),',
  ].join('\n');
}

async function getVariationConstBindings(
	variationsDir: string,
	variationSlugs: string[],
): Promise<Array<{ constName: string; variationSlug: string }>> {
  const seenConstNames = new Map<string, string>();

  const bindings = await Promise.all(
    variationSlugs.map(async (variationSlug) => ({
      constName: await resolveAndMigrateGeneratedExportedConstName(
        path.join(variationsDir, `${variationSlug}.ts`),
        [
          buildVariationConstName(variationSlug),
          `workspaceVariation_${toSnakeCase(variationSlug)}`,
        ],
      ),
      variationSlug,
    })),
  );
  for (const { constName, variationSlug } of bindings) {
    const previousSlug = seenConstNames.get(constName);

    if (previousSlug && previousSlug !== variationSlug) {
      throw new Error(
        `Variation slugs "${previousSlug}" and "${variationSlug}" generate the same registry identifier "${constName}". Rename one of the variations.`,
      );
    }

    seenConstNames.set(constName, variationSlug);
  }
  return bindings;
}

function buildVariationSource(variationSlug: string, textDomain: string): string {
  const variationTitle = toTitleCase(variationSlug);
  const variationConstName = buildVariationConstName(variationSlug);
  const titleProperty = buildVariationTranslationProperty(
    'title',
    variationTitle,
    textDomain,
  );
  const descriptionProperty = buildVariationTranslationProperty(
    'description',
    `A starter variation for ${variationTitle}.`,
    textDomain,
  );

  return `import type { BlockVariation } from '@wp-typia/block-types/blocks/registration';
import { __ } from '@wordpress/i18n';

export const ${variationConstName} = {
  name: ${quoteTsString(variationSlug)},
${titleProperty}
${descriptionProperty}
  attributes: {},
  scope: ['inserter'],
} satisfies BlockVariation;
`;
}

function buildVariationIndexSource(
	variationBindings: Array<{ constName: string; variationSlug: string }>,
): string {
  const importLines = variationBindings
		.map(({ constName, variationSlug }) => {
			return `import { ${constName} } from './${variationSlug}';`;
		})
		.join('\n');
  const variationConstNames = variationBindings
		.map(({ constName }) => `  ${constName},`)
		.join('\n');

  return `import { registerBlockVariation } from '@wordpress/blocks';
import metadata from '../block.json';
${importLines ? `\n${importLines}` : ''}

const WORKSPACE_VARIATIONS = [
${variationConstNames}
  // wp-typia add variation entries
];

export function registerWorkspaceVariations() {
  for (const variation of WORKSPACE_VARIATIONS) {
    registerBlockVariation(metadata.name, variation);
  }
}
`;
}

async function ensureVariationRegistrationHook(blockIndexPath: string): Promise<void> {
  await ensureWorkspaceEntrypointCall({
    blockIndexPath,
    callLine: VARIATIONS_CALL_LINE,
    callPattern: VARIATIONS_CALL_PATTERN,
    importLine: VARIATIONS_IMPORT_LINE,
    importPattern: VARIATIONS_IMPORT_PATTERN,
  });
}

async function writeVariationRegistry(
	projectDir: string,
	blockSlug: string,
	variationSlug: string,
): Promise<void> {
  const variationsDir = path.join(
    projectDir,
    'src',
    'blocks',
    blockSlug,
    'variations',
  );
  const variationsIndexPath = path.join(variationsDir, 'index.ts');
  await fsp.mkdir(variationsDir, { recursive: true });

  const existingVariationSlugs = (await fsp.readdir(variationsDir))
		.filter(isGeneratedTypeScriptModuleFilename)
		.map((entry) => entry.replace(/\.ts$/u, ''));
  const nextVariationSlugs = Array.from(new Set([...existingVariationSlugs, variationSlug])).sort();
  const variationBindings = await getVariationConstBindings(
    variationsDir,
    nextVariationSlugs,
  );
  await fsp.writeFile(
    variationsIndexPath,
    buildVariationIndexSource(variationBindings),
    'utf8',
  );
}

/**
 * Add one variation entry to an existing workspace block.
 *
 * @param options Command options for the variation scaffold workflow.
 * @param options.blockName Target workspace block slug that will own the variation.
 * @param options.cwd Working directory used to resolve the nearest official workspace.
 * Defaults to `process.cwd()`.
 * @param options.variationName Human-entered variation name that will be normalized
 * and validated before files are written.
 * @returns A promise that resolves with the normalized `blockSlug`,
 * `variationSlug`, and owning `projectDir` after the variation files and
 * inventory entry have been written successfully.
 * @throws {Error} When the command is run outside an official workspace, when
 * the target block is unknown, when the variation slug is invalid, or when a
 * conflicting file or inventory entry already exists.
 */
export async function runAddVariationCommand({
	blockName,
	cwd = process.cwd(),
	variationName,
}: RunAddVariationCommandOptions): Promise<{
  blockSlug: string;
  projectDir: string;
  variationSlug: string;
}> {
  const workspace = resolveWorkspaceProject(cwd);
  const blockSlug = normalizeBlockSlug(blockName);
  const variationSlug = assertValidGeneratedSlug(
    'Variation name',
    normalizeBlockSlug(variationName),
    'wp-typia add variation <name> --block <block-slug>',
  );

  const inventory = await readWorkspaceInventoryAsync(workspace.projectDir);
  resolveWorkspaceBlock(inventory, blockSlug);
  assertVariationDoesNotExist(
    workspace.projectDir,
    blockSlug,
    variationSlug,
    inventory,
  );

  const blockConfigPath = path.join(
    workspace.projectDir,
    'scripts',
    'block-config.ts',
  );
  const blockIndexPath = path.join(
    workspace.projectDir,
    'src',
    'blocks',
    blockSlug,
    'index.tsx',
  );
  const variationsDir = path.join(
    workspace.projectDir,
    'src',
    'blocks',
    blockSlug,
    'variations',
  );
  const variationFilePath = path.join(variationsDir, `${variationSlug}.ts`);
  const variationsIndexPath = path.join(variationsDir, 'index.ts');
  const shouldRemoveVariationsDirOnRollback = !(await pathExists(
    variationsDir,
  ));
  const existingVariationModulePaths =
    await collectGeneratedTypeScriptModulePaths(variationsDir);
  const mutationSnapshot: WorkspaceMutationSnapshot = {
		fileSources: await snapshotWorkspaceFiles([
			blockConfigPath,
			blockIndexPath,
			variationsIndexPath,
			...existingVariationModulePaths,
		]),
		snapshotDirs: [],
		targetPaths: [
			variationFilePath,
			...(shouldRemoveVariationsDirOnRollback ? [variationsDir] : []),
		],
	};

  try {
    await fsp.mkdir(variationsDir, { recursive: true });
    await fsp.writeFile(
      variationFilePath,
      buildVariationSource(variationSlug, workspace.workspace.textDomain),
      'utf8',
    );
    await writeVariationRegistry(
      workspace.projectDir,
      blockSlug,
      variationSlug,
    );
    await ensureVariationRegistrationHook(blockIndexPath);
    await appendWorkspaceInventoryEntries(workspace.projectDir, {
      variationEntries: [buildVariationConfigEntry(blockSlug, variationSlug)],
    });

    return {
      blockSlug,
      projectDir: workspace.projectDir,
      variationSlug,
    };
  } catch (error) {
    await rollbackWorkspaceMutation(mutationSnapshot);
    throw error;
  }
}
