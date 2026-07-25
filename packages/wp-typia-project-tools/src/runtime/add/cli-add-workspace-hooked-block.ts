import { promises as fsp } from 'node:fs';
import path from 'node:path';

import type { HookedBlockPositionId } from './hooked-blocks.js';
import { executeWorkspaceMutationPlan } from './cli-add-workspace-mutation.js';
import {
  assertValidHookAnchor,
  assertValidHookedBlockPosition,
  getMutableBlockHooks,
  normalizeBlockSlug,
  readWorkspaceBlockJson,
  resolveWorkspaceBlock,
  type RunAddHookedBlockCommandOptions,
} from './cli-add-shared.js';
import { readWorkspaceInventoryAsync } from '../workspace/workspace-inventory.js';
import { resolveWorkspaceProject } from '../workspace/workspace-project.js';

/**
 * Add one `blockHooks` entry to an existing official workspace block.
 *
 * @param options Command options for the hooked-block workflow.
 * @param options.anchorBlockName Full block name that will anchor the insertion.
 * @param options.blockName Existing workspace block slug to patch.
 * @param options.cwd Working directory used to resolve the nearest official workspace.
 * Defaults to `process.cwd()`.
 * @param options.position Hook position to store in `block.json`.
 * @returns A promise that resolves with the normalized target block slug, anchor
 * block name, position, and owning project directory after `block.json` is written.
 * @throws {Error} When the command is run outside an official workspace, when
 * the target block is unknown, when required flags are missing, or when the
 * block already defines a hook for the requested anchor.
 */
export async function runAddHookedBlockCommand({
	anchorBlockName,
	blockName,
	cwd = process.cwd(),
	position,
}: RunAddHookedBlockCommandOptions): Promise<{
  anchorBlockName: string;
  blockSlug: string;
  position: HookedBlockPositionId;
  projectDir: string;
}> {
  const workspace = resolveWorkspaceProject(cwd);
  const blockSlug = normalizeBlockSlug(blockName);
  const inventory = await readWorkspaceInventoryAsync(workspace.projectDir);
  resolveWorkspaceBlock(inventory, blockSlug);

  const resolvedAnchorBlockName = assertValidHookAnchor(anchorBlockName);
  const resolvedPosition = assertValidHookedBlockPosition(position);
  const selfHookAnchor = `${workspace.workspace.namespace}/${blockSlug}`;
  if (resolvedAnchorBlockName === selfHookAnchor) {
    throw new Error(
      '`wp-typia add hooked-block` cannot hook a block relative to its own block name.',
    );
  }
  const { blockJson, blockJsonPath } = await readWorkspaceBlockJson(
    workspace.projectDir,
    blockSlug,
  );
  const blockJsonRelativePath = path.relative(
    workspace.projectDir,
    blockJsonPath,
  );
  const blockHooks = getMutableBlockHooks(blockJson, blockJsonRelativePath);

  if (Object.prototype.hasOwnProperty.call(
    blockHooks,
    resolvedAnchorBlockName,
  )) {
    throw new Error(
      `${blockJsonRelativePath} already defines a blockHooks entry for "${resolvedAnchorBlockName}".`,
    );
  }

  return executeWorkspaceMutationPlan({
		filePaths: [blockJsonPath],
		run: async () => {
			blockHooks[resolvedAnchorBlockName] = resolvedPosition;
			await fsp.writeFile(
				blockJsonPath,
				JSON.stringify(blockJson, null, '\t'),
				'utf8',
			);

			return {
				anchorBlockName: resolvedAnchorBlockName,
				blockSlug,
				position: resolvedPosition,
				projectDir: workspace.projectDir,
			};
		},
	});
}
