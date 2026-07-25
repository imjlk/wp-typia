import {
	getWorkspaceBlockAddonDoctorChecks,
} from './cli-doctor-workspace-block-addons.js';
import {
	getWorkspaceBlockIframeCompatibilityChecks,
} from './cli-doctor-workspace-block-iframe.js';
import {
	getWorkspaceBlockCoreDoctorChecks,
} from './cli-doctor-workspace-block-metadata.js';

import type { DoctorCheck } from './cli-doctor.js';
import type { WorkspaceInventory } from '../workspace/workspace-inventory.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

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
