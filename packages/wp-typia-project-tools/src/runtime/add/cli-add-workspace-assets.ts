/**
 * Compatibility facade for workspace asset add commands.
 *
 * Keep the public runtime import path stable while each workflow lives in a
 * focused implementation module.
 */
export {
	runAddBindingSourceCommand,
} from "./cli-add-workspace-binding-source.js";
export { runAddEditorPluginCommand } from "./cli-add-workspace-editor-plugin.js";
export { runAddPatternCommand } from "./cli-add-workspace-pattern.js";
