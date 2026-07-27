import path from 'node:path';
import { parseScaffoldBlockMetadata } from '@wp-typia/block-runtime/blocks';

import type {
	WorkspaceInventory,
} from '../workspace/workspace-inventory.js';
import { readOptionalUtf8File } from '../shared/fs-async.js';
import { safeJsonParse } from '../shared/json-utils.js';

/**
 * Resolve an existing workspace block inventory entry by slug.
 *
 * @param inventory Parsed workspace inventory that owns available blocks.
 * @param blockSlug Workspace block slug to locate.
 * @returns The matching workspace block inventory entry.
 * @throws {Error} When the block slug is not present in the inventory.
 */
export function resolveWorkspaceBlock(
	inventory: WorkspaceInventory,
	blockSlug: string,
): WorkspaceInventory['blocks'][number] {
  const block = inventory.blocks.find((entry) => entry.slug === blockSlug);
  if (!block) {
    throw new Error(
      `Unknown workspace block "${blockSlug}". Choose one of: ${inventory.blocks.map((entry) => entry.slug).join(', ')}`,
    );
  }
  return block;
}

/**
 * Read and validate a workspace block's `block.json` metadata from disk.
 *
 * @param projectDir Absolute workspace root directory.
 * @param blockSlug Workspace block slug whose metadata should be read.
 * @returns Parsed block metadata and the absolute `block.json` path.
 * @throws {Error} When the file is missing or cannot be parsed as scaffold metadata.
 */
export async function readWorkspaceBlockJson(
	projectDir: string,
	blockSlug: string,
): Promise<{
  blockJson: Record<string, unknown>;
  blockJsonPath: string;
}> {
  const blockJsonPath = path.join(
    projectDir,
    'src',
    'blocks',
    blockSlug,
    'block.json',
  );
  const source = await readOptionalUtf8File(blockJsonPath);
  if (source === null) {
    throw new Error(
      `Missing ${path.relative(projectDir, blockJsonPath)} for workspace block "${blockSlug}".`,
    );
  }

  let blockJson: Record<string, unknown>;
  try {
    blockJson = parseScaffoldBlockMetadata<Record<string, unknown>>(
      safeJsonParse(source, {
        context: 'workspace block metadata',
        filePath: blockJsonPath,
      }),
    );
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Failed to parse ${path.relative(projectDir, blockJsonPath)}: ${error.message}`
        : `Failed to parse ${path.relative(projectDir, blockJsonPath)}.`,
    );
  }

  return {
    blockJson,
    blockJsonPath,
  };
}

/**
 * Return a mutable `blockHooks` object for a parsed block metadata document.
 *
 * @param blockJson Parsed block metadata object that may be mutated.
 * @param blockJsonRelativePath Relative path used in validation error messages.
 * @returns The existing or newly created mutable `blockHooks` map.
 * @throws {Error} When `blockHooks` exists but is not an object.
 */
export function getMutableBlockHooks(
	blockJson: Record<string, unknown>,
	blockJsonRelativePath: string,
): Record<string, string> {
  const blockHooks = blockJson.blockHooks;
  if (blockHooks === undefined) {
    const nextHooks: Record<string, string> = {};
    blockJson.blockHooks = nextHooks;
    return nextHooks;
  }
  if (!blockHooks || typeof blockHooks !== 'object' || Array.isArray(
    blockHooks,
  )) {
    throw new Error(
      `${blockJsonRelativePath} must define blockHooks as an object when present.`,
    );
  }

  return blockHooks as Record<string, string>;
}
