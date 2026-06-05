import {
	MANUAL_REST_CONTRACT_AUTH_IDS,
	MANUAL_REST_CONTRACT_HTTP_METHOD_IDS,
	REST_RESOURCE_METHOD_IDS,
} from "../add/cli-add-shared.js";
import {
	ABILITY_CONFIG_ENTRY_MARKER,
	ABILITIES_CONST_SECTION,
	ABILITIES_INTERFACE_SECTION,
	ADMIN_VIEW_CONFIG_ENTRY_MARKER,
	ADMIN_VIEWS_CONST_SECTION,
	ADMIN_VIEWS_INTERFACE_SECTION,
	AI_FEATURES_CONST_SECTION,
	AI_FEATURES_INTERFACE_SECTION,
	AI_FEATURE_CONFIG_ENTRY_MARKER,
	BINDING_SOURCES_CONST_SECTION,
	BINDING_SOURCES_INTERFACE_SECTION,
	BINDING_SOURCE_CONFIG_ENTRY_MARKER,
	BLOCK_CONFIG_ENTRY_MARKER,
	BLOCK_STYLES_CONST_SECTION,
	BLOCK_STYLES_INTERFACE_SECTION,
	BLOCK_STYLE_CONFIG_ENTRY_MARKER,
	BLOCK_TRANSFORMS_CONST_SECTION,
	BLOCK_TRANSFORMS_INTERFACE_SECTION,
	BLOCK_TRANSFORM_CONFIG_ENTRY_MARKER,
	CONTRACTS_CONST_SECTION,
	CONTRACTS_INTERFACE_SECTION,
	CONTRACT_CONFIG_ENTRY_MARKER,
	EDITOR_PLUGINS_CONST_SECTION,
	EDITOR_PLUGINS_INTERFACE_SECTION,
	EDITOR_PLUGIN_CONFIG_ENTRY_MARKER,
	PATTERNS_CONST_SECTION,
	PATTERNS_INTERFACE_SECTION,
	PATTERN_CONFIG_ENTRY_MARKER,
	POST_META_CONFIG_ENTRY_MARKER,
	POST_META_CONST_SECTION,
	POST_META_INTERFACE_SECTION,
	REST_RESOURCES_CONST_SECTION,
	REST_RESOURCES_INTERFACE_SECTION,
	REST_RESOURCE_CONFIG_ENTRY_MARKER,
	VARIATIONS_CONST_SECTION,
	VARIATIONS_INTERFACE_SECTION,
	VARIATION_CONFIG_ENTRY_MARKER,
} from "./workspace-inventory-templates.js";
import {
	defineInventoryEntryParser,
	type InventorySectionDescriptor,
} from "./workspace-inventory-parser-validation.js";
import type {
	WorkspaceAbilityInventoryEntry,
	WorkspaceAdminViewInventoryEntry,
	WorkspaceAiFeatureInventoryEntry,
	WorkspaceBindingSourceInventoryEntry,
	WorkspaceBlockInventoryEntry,
	WorkspaceBlockStyleInventoryEntry,
	WorkspaceBlockTransformInventoryEntry,
	WorkspaceContractInventoryEntry,
	WorkspaceEditorPluginInventoryEntry,
	WorkspacePatternInventoryEntry,
	WorkspacePostMetaInventoryEntry,
	WorkspaceRestResourceInventoryEntry,
	WorkspaceVariationInventoryEntry,
} from "./workspace-inventory-types.js";

/**
 * Descriptor for the required `BLOCKS` inventory section.
 *
 * Runtime readers use its `parse` contract to require the exported `BLOCKS`
 * array and validate required block entry fields; mutation helpers use its
 * `append` marker to insert generated block entries without duplicating section
 * knowledge.
 */
export const BLOCK_INVENTORY_SECTION: InventorySectionDescriptor = {
	append: {
		marker: BLOCK_CONFIG_ENTRY_MARKER,
		optionKey: "blockEntries",
	},
	parse: {
		entriesKey: "blocks",
		entry: defineInventoryEntryParser<WorkspaceBlockInventoryEntry>()({
			entryName: "BLOCKS",
			fields: [
				{ key: "apiTypesFile" },
				{ key: "attributeTypeName" },
				{ key: "openApiFile" },
				{ key: "slug", required: true },
				{ key: "typesFile", required: true },
			],
		}),
		exportName: "BLOCKS",
		required: true,
	},
};

/**
 * Descriptors for optional workspace inventory sections beyond `BLOCKS`.
 *
 * Each descriptor centralizes append markers, exported interface/value repair
 * sections, parser entry metadata such as `entriesKey` and `entryName`, and
 * optional section flags so add, doctor, read, and mutation flows share one
 * runtime contract when adding new inventory domains.
 */
export const INVENTORY_SECTIONS: readonly InventorySectionDescriptor[] = [
	{
		append: {
			marker: VARIATION_CONFIG_ENTRY_MARKER,
			optionKey: "variationEntries",
		},
		interface: {
			name: "WorkspaceVariationConfig",
			section: VARIATIONS_INTERFACE_SECTION,
		},
		parse: {
			entriesKey: "variations",
			entry: defineInventoryEntryParser<WorkspaceVariationInventoryEntry>()({
				entryName: "VARIATIONS",
				fields: [
					{ key: "block", required: true },
					{ key: "file", required: true },
					{ key: "slug", required: true },
				],
			}),
			hasSectionKey: "hasVariationsSection",
		},
		value: {
			name: "VARIATIONS",
			section: VARIATIONS_CONST_SECTION,
		},
	},
	{
		append: {
			marker: BLOCK_STYLE_CONFIG_ENTRY_MARKER,
			optionKey: "blockStyleEntries",
		},
		interface: {
			name: "WorkspaceBlockStyleConfig",
			section: BLOCK_STYLES_INTERFACE_SECTION,
		},
		parse: {
			entriesKey: "blockStyles",
			entry: defineInventoryEntryParser<WorkspaceBlockStyleInventoryEntry>()({
				entryName: "BLOCK_STYLES",
				fields: [
					{ key: "block", required: true },
					{ key: "file", required: true },
					{ key: "slug", required: true },
				],
			}),
			hasSectionKey: "hasBlockStylesSection",
		},
		value: {
			name: "BLOCK_STYLES",
			section: BLOCK_STYLES_CONST_SECTION,
		},
	},
	{
		append: {
			marker: BLOCK_TRANSFORM_CONFIG_ENTRY_MARKER,
			optionKey: "blockTransformEntries",
		},
		interface: {
			name: "WorkspaceBlockTransformConfig",
			section: BLOCK_TRANSFORMS_INTERFACE_SECTION,
		},
		parse: {
			entriesKey: "blockTransforms",
			entry:
				defineInventoryEntryParser<WorkspaceBlockTransformInventoryEntry>()({
					entryName: "BLOCK_TRANSFORMS",
					fields: [
						{ key: "block", required: true },
						{ key: "file", required: true },
						{ key: "from", required: true },
						{ key: "slug", required: true },
						{ key: "to", required: true },
					],
				}),
			hasSectionKey: "hasBlockTransformsSection",
		},
		value: {
			name: "BLOCK_TRANSFORMS",
			section: BLOCK_TRANSFORMS_CONST_SECTION,
		},
	},
	{
		append: {
			marker: PATTERN_CONFIG_ENTRY_MARKER,
			optionKey: "patternEntries",
		},
		interface: {
			name: "WorkspacePatternConfig",
			section: PATTERNS_INTERFACE_SECTION,
		},
		parse: {
			entriesKey: "patterns",
			entry: defineInventoryEntryParser<WorkspacePatternInventoryEntry>()({
				entryName: "PATTERNS",
				fields: [
					{ key: "contentFile" },
					{ key: "file" },
					{ key: "scope" },
					{ key: "sectionRole" },
					{ key: "slug", required: true },
					{ key: "tags", kind: "stringArray" },
					{ key: "thumbnailUrl" },
					{ key: "title" },
				],
			}),
			hasSectionKey: "hasPatternsSection",
		},
		value: {
			name: "PATTERNS",
			section: PATTERNS_CONST_SECTION,
		},
	},
	{
		append: {
			marker: BINDING_SOURCE_CONFIG_ENTRY_MARKER,
			optionKey: "bindingSourceEntries",
		},
		interface: {
			name: "WorkspaceBindingSourceConfig",
			section: BINDING_SOURCES_INTERFACE_SECTION,
		},
		parse: {
			entriesKey: "bindingSources",
			entry: defineInventoryEntryParser<WorkspaceBindingSourceInventoryEntry>()(
				{
					entryName: "BINDING_SOURCES",
					fields: [
						{ key: "attribute" },
						{ key: "block" },
						{ key: "editorFile", required: true },
						{ key: "metaPath" },
						{ key: "postMeta" },
						{ key: "serverFile", required: true },
						{ key: "slug", required: true },
					],
				},
			),
			hasSectionKey: "hasBindingSourcesSection",
		},
		value: {
			name: "BINDING_SOURCES",
			section: BINDING_SOURCES_CONST_SECTION,
		},
	},
	{
		append: {
			marker: CONTRACT_CONFIG_ENTRY_MARKER,
			optionKey: "contractEntries",
		},
		interface: {
			name: "WorkspaceContractConfig",
			section: CONTRACTS_INTERFACE_SECTION,
		},
		parse: {
			entriesKey: "contracts",
			entry: defineInventoryEntryParser<WorkspaceContractInventoryEntry>()({
				entryName: "CONTRACTS",
				fields: [
					{ key: "schemaFile", required: true },
					{ key: "slug", required: true },
					{ key: "sourceTypeName", required: true },
					{ key: "typesFile", required: true },
				],
			}),
			hasSectionKey: "hasContractsSection",
		},
		value: {
			name: "CONTRACTS",
			section: CONTRACTS_CONST_SECTION,
		},
	},
	{
		append: {
			marker: REST_RESOURCE_CONFIG_ENTRY_MARKER,
			optionKey: "restResourceEntries",
		},
		interface: {
			name: "WorkspaceRestResourceConfig",
			section: REST_RESOURCES_INTERFACE_SECTION,
		},
		parse: {
			entriesKey: "restResources",
			entry: defineInventoryEntryParser<WorkspaceRestResourceInventoryEntry>()({
				entryName: "REST_RESOURCES",
				fields: [
					{ key: "apiFile", required: true },
					{
						key: "auth",
						validate: (value, context) => {
							if (
								typeof value === "string" &&
								!(MANUAL_REST_CONTRACT_AUTH_IDS as readonly string[]).includes(
									value,
								)
							) {
								throw new Error(
									`${context.entryName}[${context.elementIndex}].${context.key} must be one of: ${MANUAL_REST_CONTRACT_AUTH_IDS.join(", ")}.`,
								);
							}
						},
					},
					{ key: "bodyTypeName" },
					{ key: "clientFile", required: true },
					{ key: "controllerClass" },
					{ key: "controllerExtends" },
					{ key: "dataFile" },
					{
						key: "method",
						validate: (value, context) => {
							if (
								typeof value === "string" &&
								!(
									MANUAL_REST_CONTRACT_HTTP_METHOD_IDS as readonly string[]
								).includes(value)
							) {
								throw new Error(
									`${context.entryName}[${context.elementIndex}].${context.key} must be one of: ${MANUAL_REST_CONTRACT_HTTP_METHOD_IDS.join(", ")}.`,
								);
							}
						},
					},
					{
						key: "methods",
						kind: "stringArray",
						required: true,
						validate: (value, context) => {
							const methods = Array.isArray(value) ? value : [];
							const invalidMethods = methods.filter(
								(method) =>
									!(REST_RESOURCE_METHOD_IDS as readonly string[]).includes(
										method,
									),
							);
							if (invalidMethods.length > 0) {
								throw new Error(
									`${context.entryName}[${context.elementIndex}].${context.key} includes unsupported values: ${invalidMethods.join(", ")}.`,
								);
							}
						},
					},
					{
						key: "mode",
						validate: (value, context) => {
							if (
								typeof value === "string" &&
								value !== "generated" &&
								value !== "manual"
							) {
								throw new Error(
									`${context.entryName}[${context.elementIndex}].${context.key} must be generated or manual.`,
								);
							}
						},
					},
					{ key: "namespace", required: true },
					{ key: "openApiFile", required: true },
					{ key: "pathPattern" },
					{ key: "permissionCallback" },
					{ key: "phpFile" },
					{ key: "queryTypeName" },
					{ key: "responseTypeName" },
					{ key: "routePattern" },
					{ key: "secretFieldName" },
					{ key: "secretPreserveOnEmpty", kind: "boolean" },
					{ key: "secretStateFieldName" },
					{ key: "slug", required: true },
					{ key: "typesFile", required: true },
					{ key: "validatorsFile", required: true },
				],
			}),
			hasSectionKey: "hasRestResourcesSection",
		},
		value: {
			name: "REST_RESOURCES",
			section: REST_RESOURCES_CONST_SECTION,
		},
	},
	{
		append: {
			marker: POST_META_CONFIG_ENTRY_MARKER,
			optionKey: "postMetaEntries",
		},
		interface: {
			name: "WorkspacePostMetaConfig",
			section: POST_META_INTERFACE_SECTION,
		},
		parse: {
			entriesKey: "postMeta",
			entry: defineInventoryEntryParser<WorkspacePostMetaInventoryEntry>()({
				entryName: "POST_META",
				fields: [
					{ key: "metaKey", required: true },
					{ key: "phpFile", required: true },
					{ key: "postType", required: true },
					{ key: "schemaFile", required: true },
					{ key: "showInRest", kind: "boolean", required: true },
					{ key: "slug", required: true },
					{ key: "sourceTypeName", required: true },
					{ key: "typesFile", required: true },
				],
			}),
			hasSectionKey: "hasPostMetaSection",
		},
		value: {
			name: "POST_META",
			section: POST_META_CONST_SECTION,
		},
	},
	{
		append: {
			marker: ABILITY_CONFIG_ENTRY_MARKER,
			optionKey: "abilityEntries",
		},
		interface: {
			name: "WorkspaceAbilityConfig",
			section: ABILITIES_INTERFACE_SECTION,
		},
		parse: {
			entriesKey: "abilities",
			entry: defineInventoryEntryParser<WorkspaceAbilityInventoryEntry>()({
				entryName: "ABILITIES",
				fields: [
					{ key: "clientFile", required: true },
					{ key: "compatibility", kind: "compatibilityConfig" },
					{ key: "configFile", required: true },
					{ key: "dataFile", required: true },
					{ key: "inputSchemaFile", required: true },
					{ key: "inputTypeName", required: true },
					{ key: "outputSchemaFile", required: true },
					{ key: "outputTypeName", required: true },
					{ key: "phpFile", required: true },
					{ key: "slug", required: true },
					{ key: "typesFile", required: true },
				],
			}),
			hasSectionKey: "hasAbilitiesSection",
		},
		value: {
			name: "ABILITIES",
			section: ABILITIES_CONST_SECTION,
		},
	},
	{
		append: {
			marker: AI_FEATURE_CONFIG_ENTRY_MARKER,
			optionKey: "aiFeatureEntries",
		},
		interface: {
			name: "WorkspaceAiFeatureConfig",
			section: AI_FEATURES_INTERFACE_SECTION,
		},
		parse: {
			entriesKey: "aiFeatures",
			entry: defineInventoryEntryParser<WorkspaceAiFeatureInventoryEntry>()({
				entryName: "AI_FEATURES",
				fields: [
					{ key: "aiSchemaFile", required: true },
					{ key: "apiFile", required: true },
					{ key: "clientFile", required: true },
					{ key: "compatibility", kind: "compatibilityConfig" },
					{ key: "dataFile", required: true },
					{ key: "namespace", required: true },
					{ key: "openApiFile", required: true },
					{ key: "phpFile", required: true },
					{ key: "slug", required: true },
					{ key: "typesFile", required: true },
					{ key: "validatorsFile", required: true },
				],
			}),
			hasSectionKey: "hasAiFeaturesSection",
		},
		value: {
			name: "AI_FEATURES",
			section: AI_FEATURES_CONST_SECTION,
		},
	},
	{
		append: {
			marker: ADMIN_VIEW_CONFIG_ENTRY_MARKER,
			optionKey: "adminViewEntries",
		},
		interface: {
			name: "WorkspaceAdminViewConfig",
			section: ADMIN_VIEWS_INTERFACE_SECTION,
		},
		parse: {
			entriesKey: "adminViews",
			entry: defineInventoryEntryParser<WorkspaceAdminViewInventoryEntry>()({
				entryName: "ADMIN_VIEWS",
				fields: [
					{ key: "file", required: true },
					{ key: "phpFile", required: true },
					{ key: "slug", required: true },
					{ key: "source" },
				],
			}),
			hasSectionKey: "hasAdminViewsSection",
		},
		value: {
			name: "ADMIN_VIEWS",
			section: ADMIN_VIEWS_CONST_SECTION,
		},
	},
	{
		append: {
			marker: EDITOR_PLUGIN_CONFIG_ENTRY_MARKER,
			optionKey: "editorPluginEntries",
		},
		interface: {
			name: "WorkspaceEditorPluginConfig",
			section: EDITOR_PLUGINS_INTERFACE_SECTION,
		},
		parse: {
			entriesKey: "editorPlugins",
			entry: defineInventoryEntryParser<WorkspaceEditorPluginInventoryEntry>()({
				entryName: "EDITOR_PLUGINS",
				fields: [
					{ key: "file", required: true },
					{ key: "slug", required: true },
					{ key: "slot", required: true },
				],
			}),
			hasSectionKey: "hasEditorPluginsSection",
		},
		value: {
			name: "EDITOR_PLUGINS",
			section: EDITOR_PLUGINS_CONST_SECTION,
		},
	},
];
