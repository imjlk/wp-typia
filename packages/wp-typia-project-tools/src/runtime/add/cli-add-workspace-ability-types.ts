import type { ScaffoldCompatibilityPolicy } from '../templates/scaffold-compatibility.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

/** Glob used to load generated ability PHP modules from the workspace bootstrap. */
export const ABILITY_SERVER_GLOB = '/inc/abilities/*.php';
/** Relative path to the generated ability editor script bundle. */
export const ABILITY_EDITOR_SCRIPT = 'build/abilities/index.js';
/** Relative path to the generated asset metadata for the ability bundle. */
export const ABILITY_EDITOR_ASSET = 'build/abilities/index.asset.php';
/** End marker for the generated ability client registry section. */
export const ABILITY_REGISTRY_END_MARKER = '// wp-typia add ability entries end';
/** Start marker for the generated ability client registry section. */
export const ABILITY_REGISTRY_START_MARKER = '// wp-typia add ability entries start';
/** Script module id for the public WordPress abilities package. */
export const WP_ABILITIES_SCRIPT_MODULE_ID = '@wordpress/abilities';
/** Script module id for the WordPress core abilities bootstrap package. */
export const WP_CORE_ABILITIES_SCRIPT_MODULE_ID = '@wordpress/core-abilities';

/**
 * Inputs required to scaffold a typed workflow ability into a generated workspace.
 */
export interface ScaffoldAbilityWorkspaceOptions {
	/** Kebab-case ability slug used for directory names and registry ids. */
  abilitySlug: string;
	/** Compatibility metadata applied to the generated workspace bootstrap. */
  compatibilityPolicy: ScaffoldCompatibilityPolicy;
	/** Resolved workspace metadata and filesystem paths for the target project. */
  workspace: WorkspaceProject;
}
