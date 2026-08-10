import fs from 'node:fs';
import path from 'node:path';

import {
	getWorkspaceBlockAddonDoctorChecks,
} from './cli-doctor-workspace-block-addons.js';
import {
	getWorkspaceBlockIframeCompatibilityChecks,
} from './cli-doctor-workspace-block-iframe.js';
import {
	getWorkspaceBlockCoreDoctorChecks,
} from './cli-doctor-workspace-block-metadata.js';
import {
  createDoctorCheck,
  isWorkspacePhpEntrypointManifestValid,
  resolveWorkspaceBootstrapPath,
  WORKSPACE_BLOCK_SERVER_MANIFEST,
} from './cli-doctor-workspace-shared.js';

import type { DoctorCheck } from './cli-doctor.js';
import type { WorkspaceInventory } from '../workspace/workspace-inventory.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

function checkWorkspaceBlockServerBootstrap(
  workspace: WorkspaceProject,
  inventory: WorkspaceInventory,
): DoctorCheck {
  const bootstrapPath = resolveWorkspaceBootstrapPath(
    workspace.projectDir,
    workspace.packageName,
  );
  if (!fs.existsSync(bootstrapPath)) {
    return createDoctorCheck(
      'Block server bootstrap',
      'fail',
      `Missing ${path.basename(bootstrapPath)}`,
    );
  }
  const bootstrapSource = fs.readFileSync(bootstrapPath, 'utf8');
  const serverBlockSlugs = inventory.blocks
    .map((block) => block.slug)
    .filter((blockSlug) =>
      fs.existsSync(
        path.join(
          workspace.projectDir,
          'src',
          'blocks',
          blockSlug,
          'server.php',
        ),
      ),
    );
  const hasBlockServerManifest = bootstrapSource.includes(
    WORKSPACE_BLOCK_SERVER_MANIFEST,
  );
  const hasValidBlockServerManifest = isWorkspacePhpEntrypointManifestValid(
    workspace.projectDir,
    WORKSPACE_BLOCK_SERVER_MANIFEST,
    serverBlockSlugs.map((blockSlug) => `${blockSlug}/server.php`),
  );
  const isBlockServerSynchronized =
    hasBlockServerManifest && hasValidBlockServerManifest;
  return createDoctorCheck(
    'Block server bootstrap',
    isBlockServerSynchronized ? 'pass' : 'fail',
    isBlockServerSynchronized
      ? 'Block server PHP manifest is synchronized'
      : 'Missing or stale block server PHP manifest',
  );
}

/**
 * Collect block-, variation-, transform-, and pattern-related workspace doctor checks.
 *
 * @param workspace Resolved workspace metadata and filesystem paths.
 * @param inventory Parsed workspace inventory from `scripts/block-config.ts`.
 * @returns Ordered `DoctorCheck[]` rows for extracted block diagnostics.
 */
export function getWorkspaceBlockDoctorChecks(
	workspace: WorkspaceProject,
	inventory: WorkspaceInventory,
): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  checks.push(checkWorkspaceBlockServerBootstrap(workspace, inventory));

  for (const block of inventory.blocks) {
    checks.push(...getWorkspaceBlockCoreDoctorChecks(workspace, block));
    checks.push(
			...getWorkspaceBlockIframeCompatibilityChecks(
				workspace.projectDir,
				block.slug,
			),
		);
  }

  const registeredBlockSlugs = new Set(
    inventory.blocks.map((block) => block.slug),
  );
  checks.push(
		...getWorkspaceBlockAddonDoctorChecks(
			workspace,
			inventory,
			registeredBlockSlugs,
		),
	);

  return checks;
}
