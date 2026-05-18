/**
 * Compatibility facade for workspace add commands.
 *
 * Keep the public runtime import path stable while each workflow lives in a
 * focused implementation module.
 */

/**
 * Re-export the typed workflow ability scaffold workflow from the focused
 * ability runtime helper module.
 */
export { runAddAbilityCommand } from "./cli-add-workspace-ability.js";
/**
 * Re-export the DataViews admin screen scaffold workflow from the focused
 * admin-view runtime helper module.
 */
export { runAddAdminViewCommand } from "./cli-add-workspace-admin-view.js";
/**
 * Re-export the server-only AI feature scaffold workflow from the focused
 * AI-feature runtime helper module.
 */
export { runAddAiFeatureCommand } from "./cli-add-workspace-ai.js";
/**
 * Re-export focused workspace asset scaffold commands from the companion
 * `cli-add-workspace-assets` module.
 */
export {
	runAddBindingSourceCommand,
	runAddEditorPluginCommand,
	runAddPatternCommand,
} from "./cli-add-workspace-assets.js";
/**
 * Re-export the block style scaffold workflow from the focused block-style
 * runtime helper module.
 */
export { runAddBlockStyleCommand } from "./cli-add-workspace-block-style.js";
/**
 * Re-export the block transform scaffold workflow from the focused
 * block-transform runtime helper module.
 */
export {
	runAddBlockTransformCommand,
} from "./cli-add-workspace-block-transform.js";
/**
 * Re-export the standalone contract scaffold workflow from the focused
 * contract runtime helper module.
 */
export { runAddContractCommand } from "./cli-add-workspace-contract.js";
/**
 * Re-export the generic core/external block variation scaffold workflow from
 * the focused core-variation runtime helper module.
 */
export { runAddCoreVariationCommand } from "./cli-add-workspace-core-variation.js";
/**
 * Re-export the hooked-block scaffold workflow from the focused hooked-block
 * runtime helper module.
 */
export { runAddHookedBlockCommand } from "./cli-add-workspace-hooked-block.js";
/**
 * Re-export the local integration environment scaffold workflow from the
 * focused integration-env runtime helper module.
 */
export { runAddIntegrationEnvCommand } from "./cli-add-workspace-integration-env.js";
/**
 * Re-export the typed post-meta contract scaffold workflow from the focused
 * post-meta runtime helper module.
 */
export { runAddPostMetaCommand } from "./cli-add-workspace-post-meta.js";
/**
 * Re-export the plugin-level REST resource scaffold workflow from the focused
 * rest-resource runtime helper module.
 */
export { runAddRestResourceCommand } from "./cli-add-workspace-rest.js";
/**
 * Re-export the block variation scaffold workflow from the focused variation
 * runtime helper module.
 */
export { runAddVariationCommand } from "./cli-add-workspace-variation.js";
