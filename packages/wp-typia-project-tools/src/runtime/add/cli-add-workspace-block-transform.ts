import { promises as fsp } from 'node:fs';
import path from 'node:path';

import {
  assertFullBlockName,
  resolveWorkspaceTargetBlockName,
} from './block-targets.js';
import { pathExists } from '../shared/fs-async.js';
import {
  assertBlockTransformDoesNotExist,
  assertValidGeneratedSlug,
  normalizeBlockSlug,
  quoteTsString,
  resolveWorkspaceBlock,
  rollbackWorkspaceMutation,
  type RunAddBlockTransformCommandOptions,
  type WorkspaceMutationSnapshot,
  snapshotWorkspaceFiles,
} from './cli-add-shared.js';
import { ensureWorkspaceRegistrationSettingsCall } from './cli-add-workspace-registration-hooks.js';
import {
  appendWorkspaceInventoryEntries,
  readWorkspaceInventoryAsync,
} from '../workspace/workspace-inventory.js';
import { resolveWorkspaceProject } from '../workspace/workspace-project.js';
import { toSnakeCase, toTitleCase } from '../shared/string-case.js';

const BLOCK_TRANSFORMS_IMPORT_LINE =
	"import { applyWorkspaceBlockTransforms } from './transforms';";
const BLOCK_TRANSFORMS_IMPORT_PATTERN =
	/^\s*import\s*\{\s*applyWorkspaceBlockTransforms\s*\}\s*from\s*["']\.\/transforms["']\s*;?\s*$/mu;
const BLOCK_TRANSFORMS_CALL_LINE =
	'applyWorkspaceBlockTransforms(registration.settings);';
const BLOCK_TRANSFORMS_CALL_PATTERN =
	/applyWorkspaceBlockTransforms\s*\(\s*registration\s*\.\s*settings\s*\)\s*;?/u;

function buildWorkspaceConstName(prefix: string, slug: string): string {
  return `workspace${prefix}_${toSnakeCase(slug)}`;
}

function buildBlockTransformConfigEntry(options: {
  blockSlug: string;
  fromBlockName: string;
  toBlockName: string;
  transformSlug: string;
}): string {
  return [
		'\t{',
		`\t\tblock: ${quoteTsString(options.blockSlug)},`,
		`\t\tfile: ${quoteTsString(`src/blocks/${options.blockSlug}/transforms/${options.transformSlug}.ts`)},`,
		`\t\tfrom: ${quoteTsString(options.fromBlockName)},`,
		`\t\tslug: ${quoteTsString(options.transformSlug)},`,
		`\t\tto: ${quoteTsString(options.toBlockName)},`,
		'\t},',
	].join('\n');
}

function getBlockTransformConstBindings(
	transformSlugs: string[],
): Array<{ constName: string; transformSlug: string }> {
  const seenConstNames = new Map<string, string>();

  return transformSlugs.map((transformSlug) => {
    const constName = buildWorkspaceConstName('BlockTransform', transformSlug);
    const previousSlug = seenConstNames.get(constName);

    if (previousSlug && previousSlug !== transformSlug) {
      throw new Error(
        `Transform slugs "${previousSlug}" and "${transformSlug}" generate the same registry identifier "${constName}". Rename one of the transforms.`,
      );
    }

    seenConstNames.set(constName, transformSlug);
    return { constName, transformSlug };
  });
}

function buildBlockTransformSource(options: {
  fromBlockName: string;
  textDomain: string;
  transformSlug: string;
}): string {
  const transformTitle = toTitleCase(options.transformSlug);
  const transformConstName = buildWorkspaceConstName(
    'BlockTransform',
    options.transformSlug,
  );

  return `import { createBlock } from '@wordpress/blocks';
import { __ } from '@wordpress/i18n';
import metadata from '../block.json';

type TransformAttributes = Record<string, unknown>;
type TransformInnerBlock = ReturnType<typeof createBlock>;

function mapTransformAttributes(attributes: TransformAttributes): TransformAttributes {
\tconst content = attributes.content;

\treturn typeof content === 'string' ? { content } : {};
}

export const ${transformConstName} = {
\ttype: 'block',
\tblocks: [${quoteTsString(options.fromBlockName)}],
\ttitle: __( ${quoteTsString(transformTitle)}, ${quoteTsString(options.textDomain)} ),
\ttransform: (
\t\tattributes: TransformAttributes,
\t\tinnerBlocks: TransformInnerBlock[] = [],
\t) => createBlock(metadata.name, mapTransformAttributes(attributes), innerBlocks),
} as const;
`;
}

function buildBlockTransformIndexSource(transformSlugs: string[]): string {
  const transformBindings = getBlockTransformConstBindings(transformSlugs);
  const importLines = transformBindings
		.map(
			({ constName, transformSlug }) =>
				`import { ${constName} } from './${transformSlug}';`,
		)
		.join('\n');
  const transformConstNames = transformBindings
		.map(({ constName }) => constName)
		.join(',\n\t');

  return `${importLines ? `${importLines}\n\n` : ''}type BlockSettingsWithTransforms = {
\ttransforms?: {
\t\tfrom?: unknown[];
\t\tto?: unknown[];
\t};
};

const WORKSPACE_BLOCK_TRANSFORMS = [
\t${transformConstNames}
\t// wp-typia add transform entries
] as const;

export function applyWorkspaceBlockTransforms(settings: BlockSettingsWithTransforms) {
\tconst transforms = settings.transforms ?? {};

\tsettings.transforms = {
\t\t...transforms,
\t\tfrom: [...(transforms.from ?? []), ...WORKSPACE_BLOCK_TRANSFORMS],
\t};
}
`;
}

async function ensureBlockTransformRegistrationHook(blockIndexPath: string): Promise<void> {
  await ensureWorkspaceRegistrationSettingsCall({
    blockIndexPath,
    callLine: BLOCK_TRANSFORMS_CALL_LINE,
    callPattern: BLOCK_TRANSFORMS_CALL_PATTERN,
    importLine: BLOCK_TRANSFORMS_IMPORT_LINE,
    importPattern: BLOCK_TRANSFORMS_IMPORT_PATTERN,
  });
}

async function writeBlockTransformRegistry(
	projectDir: string,
	blockSlug: string,
	transformSlug: string,
): Promise<void> {
  const transformsDir = path.join(
    projectDir,
    'src',
    'blocks',
    blockSlug,
    'transforms',
  );
  const transformsIndexPath = path.join(transformsDir, 'index.ts');
  await fsp.mkdir(transformsDir, { recursive: true });

  const existingTransformSlugs = (await fsp.readdir(transformsDir))
		.filter((entry) => entry.endsWith('.ts') && entry !== 'index.ts')
		.map((entry) => entry.replace(/\.ts$/u, ''));
  const nextTransformSlugs = Array.from(
		new Set([...existingTransformSlugs, transformSlug]),
	).sort();
  await fsp.writeFile(
    transformsIndexPath,
    buildBlockTransformIndexSource(nextTransformSlugs),
    'utf8',
  );
}

/**
 * Add one block-to-block transform registration to an existing workspace block.
 *
 * @param options Command options for the block transform scaffold workflow.
 * @param options.cwd Working directory used to resolve the nearest official workspace.
 * Defaults to `process.cwd()`.
 * @param options.fromBlockName Source block name for `--from`. This must be the
 * full `namespace/block` form because transforms may originate from WordPress
 * core or third-party blocks outside the workspace.
 * @param options.toBlockName Target block for `--to`. A workspace block slug is
 * resolved against the workspace namespace, while a full `namespace/block` name
 * must still point at an existing workspace block.
 * @param options.transformName Human-entered transform name that will be
 * normalized and validated before files are written.
 * @returns A promise that resolves with the normalized target `blockSlug`,
 * resolved `fromBlockName`, resolved `toBlockName`, `transformSlug`, and owning
 * `projectDir` after the transform module, transform registry, entrypoint hook,
 * and inventory entry have been written successfully.
 * @throws {Error} When the command is run outside an official workspace, when
 * the target block is unknown, when `--from` is not a full block name, when
 * `--to` uses a non-workspace namespace, when the target block entrypoint does
 * not expose `registration.settings`, when the transform slug is invalid, or
 * when a conflicting file or inventory entry already exists.
 */
export async function runAddBlockTransformCommand({
	cwd = process.cwd(),
	fromBlockName,
	toBlockName,
	transformName,
}: RunAddBlockTransformCommandOptions): Promise<{
  blockSlug: string;
  fromBlockName: string;
  projectDir: string;
  toBlockName: string;
  transformSlug: string;
}> {
  const workspace = resolveWorkspaceProject(cwd);
  const transformSlug = assertValidGeneratedSlug(
    'Transform name',
    normalizeBlockSlug(transformName),
    'wp-typia add transform <name> --from <namespace/block> --to <block-slug|namespace/block-slug>',
  );
  const resolvedFromBlockName = assertFullBlockName(fromBlockName, '--from');
  const target = resolveWorkspaceTargetBlockName(
    toBlockName,
    workspace.workspace.namespace,
    '--to',
  );

  const inventory = await readWorkspaceInventoryAsync(workspace.projectDir);
  resolveWorkspaceBlock(inventory, target.blockSlug);
  assertBlockTransformDoesNotExist(
    workspace.projectDir,
    target.blockSlug,
    transformSlug,
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
    target.blockSlug,
    'index.tsx',
  );
  const transformsDir = path.join(
    workspace.projectDir,
    'src',
    'blocks',
    target.blockSlug,
    'transforms',
  );
  const transformFilePath = path.join(transformsDir, `${transformSlug}.ts`);
  const transformsIndexPath = path.join(transformsDir, 'index.ts');
  const shouldRemoveTransformsDirOnRollback = !(await pathExists(
    transformsDir,
  ));
  const mutationSnapshot: WorkspaceMutationSnapshot = {
		fileSources: await snapshotWorkspaceFiles([
			blockConfigPath,
			blockIndexPath,
			transformsIndexPath,
		]),
		snapshotDirs: [],
		targetPaths: [
			transformFilePath,
			...(shouldRemoveTransformsDirOnRollback ? [transformsDir] : []),
		],
	};

  try {
    await fsp.mkdir(transformsDir, { recursive: true });
    await fsp.writeFile(
      transformFilePath,
      buildBlockTransformSource({
        fromBlockName: resolvedFromBlockName,
        textDomain: workspace.workspace.textDomain,
        transformSlug,
      }),
      'utf8',
    );
    await writeBlockTransformRegistry(
      workspace.projectDir,
      target.blockSlug,
      transformSlug,
    );
    await ensureBlockTransformRegistrationHook(blockIndexPath);
    await appendWorkspaceInventoryEntries(workspace.projectDir, {
      blockTransformEntries: [
        buildBlockTransformConfigEntry({
          blockSlug: target.blockSlug,
          fromBlockName: resolvedFromBlockName,
          toBlockName: target.blockName,
          transformSlug,
        }),
      ],
    });

    return {
      blockSlug: target.blockSlug,
      fromBlockName: resolvedFromBlockName,
      projectDir: workspace.projectDir,
      toBlockName: target.blockName,
      transformSlug,
    };
  } catch (error) {
    await rollbackWorkspaceMutation(mutationSnapshot);
    throw error;
  }
}
