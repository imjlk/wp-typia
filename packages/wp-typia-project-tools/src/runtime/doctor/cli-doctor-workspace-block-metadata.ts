import fs from 'node:fs';
import path from 'node:path';

import { parseScaffoldBlockMetadata } from '@wp-typia/block-runtime/blocks';

import {
  checkExistingFiles,
  createDoctorCheck,
  WORKSPACE_GENERATED_BLOCK_ARTIFACTS,
} from './cli-doctor-workspace-shared.js';
import {
  HOOKED_BLOCK_ANCHOR_PATTERN,
  HOOKED_BLOCK_POSITION_SET,
} from '../add/hooked-blocks.js';
import { readJsonFileSync } from '../shared/json-utils.js';

import type { DoctorCheck } from './cli-doctor.js';
import type { WorkspaceInventory } from '../workspace/workspace-inventory.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

const WORKSPACE_COLLECTION_IMPORT_LINE = "import '../../collection';";
const WORKSPACE_COLLECTION_IMPORT_PATTERN =
	/^\s*import\s+["']\.\.\/\.\.\/collection["']\s*;?\s*$/m;

function getWorkspaceBlockRequiredFiles(
	block: WorkspaceInventory['blocks'][number],
): string[] {
  const blockDir = path.join('src', 'blocks', block.slug);

  return Array.from(
		new Set(
			[
				block.typesFile,
				block.apiTypesFile,
				block.openApiFile,
				path.join(blockDir, 'index.tsx'),
				...WORKSPACE_GENERATED_BLOCK_ARTIFACTS.map((fileName) =>
					path.join(blockDir, fileName),
				),
			].filter((filePath): filePath is string => typeof filePath === 'string'),
		),
	);
}

function checkWorkspaceBlockMetadata(
	projectDir: string,
	workspace: WorkspaceProject,
	block: WorkspaceInventory['blocks'][number],
): DoctorCheck {
  const blockJsonRelativePath = path.join(
    'src',
    'blocks',
    block.slug,
    'block.json',
  );
  const blockJsonPath = path.join(projectDir, blockJsonRelativePath);

  if (!fs.existsSync(blockJsonPath)) {
    return createDoctorCheck(
      `Block metadata ${block.slug}`,
      'fail',
      `Missing ${blockJsonRelativePath}`,
    );
  }

  let blockJson: { name: string; textdomain?: string };
  try {
    blockJson = parseScaffoldBlockMetadata<{ textdomain?: string }>(
      readJsonFileSync(blockJsonPath, {
        context: 'workspace block metadata',
      }),
    );
  } catch (error) {
    return createDoctorCheck(
      `Block metadata ${block.slug}`,
      'fail',
      error instanceof Error ? error.message : String(error),
    );
  }

  const expectedName = `${workspace.workspace.namespace}/${block.slug}`;
  const issues: string[] = [];
  if (blockJson.name !== expectedName) {
    issues.push(`block.json name must equal "${expectedName}"`);
  }
  if (blockJson.textdomain !== workspace.workspace.textDomain) {
    issues.push(
      `block.json textdomain must equal "${workspace.workspace.textDomain}"`,
    );
  }

  return createDoctorCheck(
    `Block metadata ${block.slug}`,
    issues.length === 0 ? 'pass' : 'fail',
    issues.length === 0
      ? `block.json matches ${expectedName} and ${workspace.workspace.textDomain}`
      : issues.join('; '),
  );
}

function checkWorkspaceBlockHooks(
	projectDir: string,
	blockSlug: string,
): DoctorCheck {
  const blockJsonRelativePath = path.join(
    'src',
    'blocks',
    blockSlug,
    'block.json',
  );
  const blockJsonPath = path.join(projectDir, blockJsonRelativePath);

  if (!fs.existsSync(blockJsonPath)) {
    return createDoctorCheck(
      `Block hooks ${blockSlug}`,
      'fail',
      `Missing ${blockJsonRelativePath}`,
    );
  }

  let blockJson: Record<string, unknown> & { blockHooks?: unknown };
  try {
    blockJson = parseScaffoldBlockMetadata<Record<string, unknown> & { blockHooks?: unknown }>(
      readJsonFileSync(blockJsonPath, {
        context: 'workspace block metadata',
      }),
    );
  } catch (error) {
    return createDoctorCheck(
      `Block hooks ${blockSlug}`,
      'fail',
      error instanceof Error ? error.message : String(error),
    );
  }

  const blockHooks = blockJson.blockHooks;
  if (blockHooks === undefined) {
    return createDoctorCheck(
      `Block hooks ${blockSlug}`,
      'pass',
      'No blockHooks metadata configured',
    );
  }
  if (!blockHooks || typeof blockHooks !== 'object' || Array.isArray(
    blockHooks,
  )) {
    return createDoctorCheck(
      `Block hooks ${blockSlug}`,
      'fail',
      `${blockJsonRelativePath} must define blockHooks as an object when present.`,
    );
  }

  const blockName =
		typeof blockJson.name === 'string' && blockJson.name.trim().length > 0
      ? blockJson.name.trim()
      : null;
  const invalidEntries = Object.entries(blockHooks).filter(
		([anchor, position]) =>
			(blockName !== null && anchor.trim() === blockName) ||
			anchor.trim().length === 0 ||
			anchor !== anchor.trim() ||
			!HOOKED_BLOCK_ANCHOR_PATTERN.test(anchor) ||
			typeof position !== 'string' ||
			!HOOKED_BLOCK_POSITION_SET.has(position),
	);

  return createDoctorCheck(
		`Block hooks ${blockSlug}`,
		invalidEntries.length === 0 ? 'pass' : 'fail',
		invalidEntries.length === 0
			? `blockHooks metadata is valid${
					Object.keys(blockHooks).length > 0
						? ` (${Object.keys(blockHooks).join(', ')})`
						: ''
				}`
			: `Invalid blockHooks entries: ${invalidEntries
					.map(([anchor, position]) => `${anchor || '<empty>'} => ${String(position)}`)
					.join(', ')}`,
	);
}

function checkWorkspaceBlockCollectionImport(
	projectDir: string,
	blockSlug: string,
): DoctorCheck {
  const entryRelativePath = path.join('src', 'blocks', blockSlug, 'index.tsx');
  const entryPath = path.join(projectDir, entryRelativePath);

  if (!fs.existsSync(entryPath)) {
    return createDoctorCheck(
      `Block collection ${blockSlug}`,
      'fail',
      `Missing ${entryRelativePath}`,
    );
  }

  const source = fs.readFileSync(entryPath, 'utf8');
  const hasCollectionImport = WORKSPACE_COLLECTION_IMPORT_PATTERN.test(source);
  return createDoctorCheck(
    `Block collection ${blockSlug}`,
    hasCollectionImport ? 'pass' : 'fail',
    hasCollectionImport
      ? 'Shared block collection import is present'
      : `Missing a shared collection import like ${WORKSPACE_COLLECTION_IMPORT_LINE}`,
  );
}

/**
 * Collect base file, metadata, hook, and collection-import checks for one block.
 *
 * @param workspace Resolved workspace metadata and filesystem paths.
 * @param block Inventory row describing the generated block.
 * @returns Ordered block core doctor checks.
 */
export function getWorkspaceBlockCoreDoctorChecks(
	workspace: WorkspaceProject,
	block: WorkspaceInventory['blocks'][number],
): DoctorCheck[] {
  return [
    checkExistingFiles(
      workspace.projectDir,
      `Block ${block.slug}`,
      getWorkspaceBlockRequiredFiles(block),
    ),
    checkWorkspaceBlockMetadata(workspace.projectDir, workspace, block),
    checkWorkspaceBlockHooks(workspace.projectDir, block.slug),
    checkWorkspaceBlockCollectionImport(workspace.projectDir, block.slug),
  ];
}
