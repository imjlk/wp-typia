import {
	getWorkspaceAbilityDoctorChecks,
} from './cli-doctor-workspace-features-abilities.js';
import {
	getWorkspaceAdminViewDoctorChecks,
} from './cli-doctor-workspace-features-admin-views.js';
import {
	getWorkspaceAiFeatureDoctorChecks,
} from './cli-doctor-workspace-features-ai.js';
import {
	getWorkspaceEditorPluginDoctorChecks,
} from './cli-doctor-workspace-features-editor-plugins.js';
import {
	getWorkspacePostMetaDoctorChecks,
} from './cli-doctor-workspace-features-post-meta.js';
import {
	getWorkspaceRestResourceDoctorChecks,
} from './cli-doctor-workspace-features-rest.js';

import type { DoctorCheck } from './cli-doctor.js';
import type { WorkspaceInventory } from '../workspace/workspace-inventory.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

/**
 * Collect workspace doctor checks for REST resources, abilities, AI features, editor plugins, and admin views.
 *
 * @param workspace Resolved workspace metadata and filesystem paths.
 * @param inventory Parsed workspace inventory from `scripts/block-config.ts`.
 * @returns Ordered `DoctorCheck[]` rows for extracted workspace feature diagnostics.
 */
export function getWorkspaceFeatureDoctorChecks(
	workspace: WorkspaceProject,
	inventory: WorkspaceInventory,
): DoctorCheck[] {
  return [
    ...getWorkspaceRestResourceDoctorChecks(workspace, inventory.restResources),
    ...getWorkspacePostMetaDoctorChecks(workspace, inventory.postMeta),
    ...getWorkspaceAbilityDoctorChecks(workspace, inventory.abilities),
    ...getWorkspaceAiFeatureDoctorChecks(workspace, inventory.aiFeatures),
    ...getWorkspaceEditorPluginDoctorChecks(workspace, inventory.editorPlugins),
    ...getWorkspaceAdminViewDoctorChecks(workspace, inventory),
  ];
}
