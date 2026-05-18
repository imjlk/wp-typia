export {
	ABILITY_CONFIG_ENTRY_MARKER,
	ADMIN_VIEW_CONFIG_ENTRY_MARKER,
	AI_FEATURE_CONFIG_ENTRY_MARKER,
	BINDING_SOURCE_CONFIG_ENTRY_MARKER,
	BLOCK_CONFIG_ENTRY_MARKER,
	BLOCK_STYLE_CONFIG_ENTRY_MARKER,
	BLOCK_TRANSFORM_CONFIG_ENTRY_MARKER,
	CONTRACT_CONFIG_ENTRY_MARKER,
	EDITOR_PLUGIN_CONFIG_ENTRY_MARKER,
	PATTERN_CONFIG_ENTRY_MARKER,
	POST_META_CONFIG_ENTRY_MARKER,
	REST_RESOURCE_CONFIG_ENTRY_MARKER,
	VARIATION_CONFIG_ENTRY_MARKER,
} from "./workspace-inventory-templates.js";
export { parseWorkspaceInventorySource } from "./workspace-inventory-parser.js";
export {
	getWorkspaceBlockSelectOptions,
	getWorkspaceBlockSelectOptionsAsync,
	readWorkspaceInventory,
	readWorkspaceInventoryAsync,
} from "./workspace-inventory-read.js";
export {
	appendWorkspaceInventoryEntries,
	updateWorkspaceInventorySource,
} from "./workspace-inventory-mutations.js";
export type {
	WorkspaceAbilityInventoryEntry,
	WorkspaceAdminViewInventoryEntry,
	WorkspaceAiFeatureInventoryEntry,
	WorkspaceBindingSourceInventoryEntry,
	WorkspaceBlockInventoryEntry,
	WorkspaceBlockSelectOption,
	WorkspaceBlockStyleInventoryEntry,
	WorkspaceBlockTransformInventoryEntry,
	WorkspaceContractInventoryEntry,
	WorkspaceEditorPluginInventoryEntry,
	WorkspaceInventory,
	WorkspacePatternInventoryEntry,
	WorkspacePostMetaInventoryEntry,
	WorkspaceRestResourceInventoryEntry,
	WorkspaceVariationInventoryEntry,
} from "./workspace-inventory-types.js";
