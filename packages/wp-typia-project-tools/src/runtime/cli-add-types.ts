import { suggestCloseId } from "./id-suggestions.js";
import {
	PATTERN_CATALOG_SCOPE_IDS,
	PATTERN_SECTION_ROLE_PATTERN,
	PATTERN_TAG_PATTERN,
	type PatternCatalogScope,
} from "./pattern-catalog.js";

export { ADD_KIND_IDS } from "./cli-add-kind-ids.js";
export type { AddKindId } from "./cli-add-kind-ids.js";
export {
	PATTERN_CATALOG_SCOPE_IDS,
	PATTERN_SECTION_ROLE_PATTERN,
	PATTERN_TAG_PATTERN,
};
export type { PatternCatalogScope };

/**
 * Supported plugin-level REST resource methods accepted by
 * `wp-typia add rest-resource --methods`.
 */
export const REST_RESOURCE_METHOD_IDS = [
	"list",
	"read",
	"create",
	"update",
	"delete",
] as const;
/**
 * Union of supported plugin-level REST resource method ids.
 */
export type RestResourceMethodId = (typeof REST_RESOURCE_METHOD_IDS)[number];

/**
 * Supported HTTP methods accepted by manual REST contract mode.
 */
export const MANUAL_REST_CONTRACT_HTTP_METHOD_IDS = [
	"DELETE",
	"GET",
	"PATCH",
	"POST",
	"PUT",
] as const;
/**
 * Union of supported manual REST contract HTTP methods.
 */
export type ManualRestContractHttpMethodId =
	(typeof MANUAL_REST_CONTRACT_HTTP_METHOD_IDS)[number];

/**
 * Supported auth intent values accepted by manual REST contract mode.
 */
export const MANUAL_REST_CONTRACT_AUTH_IDS = [
	"authenticated",
	"public",
	"public-write-protected",
] as const;
/**
 * Union of supported manual REST contract auth intents.
 */
export type ManualRestContractAuthId =
	(typeof MANUAL_REST_CONTRACT_AUTH_IDS)[number];

/**
 * Canonical editor-plugin shell surface ids accepted by
 * `wp-typia add editor-plugin --slot`.
 */
export const EDITOR_PLUGIN_SLOT_IDS = ["sidebar", "document-setting-panel"] as const;
/**
 * Union of canonical editor-plugin shell surface ids.
 */
export type EditorPluginSlotId = (typeof EDITOR_PLUGIN_SLOT_IDS)[number];
/**
 * Legacy and canonical editor-plugin slot aliases keyed by user-facing input.
 */
export const EDITOR_PLUGIN_SLOT_ALIASES = {
	PluginDocumentSettingPanel: "document-setting-panel",
	PluginSidebar: "sidebar",
	"document-setting-panel": "document-setting-panel",
	sidebar: "sidebar",
} as const satisfies Record<string, EditorPluginSlotId>;

/**
 * Resolve a user-provided editor-plugin slot alias to its canonical id.
 *
 * @param slot Raw slot value from CLI input.
 * @returns The canonical slot id, or `undefined` when unsupported.
 */
export function resolveEditorPluginSlotAlias(
	slot: string,
): EditorPluginSlotId | undefined {
	const trimmed = slot.trim();
	if (
		!Object.prototype.hasOwnProperty.call(EDITOR_PLUGIN_SLOT_ALIASES, trimmed)
	) {
		return undefined;
	}

	return EDITOR_PLUGIN_SLOT_ALIASES[
		trimmed as keyof typeof EDITOR_PLUGIN_SLOT_ALIASES
	];
}

/**
 * Optional local service starter ids accepted by
 * `wp-typia add integration-env --service`.
 */
export const INTEGRATION_ENV_SERVICE_IDS = [
	"none",
	"docker-compose",
] as const;
/**
 * Union of supported local service starter ids.
 */
export type IntegrationEnvServiceId =
	(typeof INTEGRATION_ENV_SERVICE_IDS)[number];

/**
 * Supported built-in block families accepted by `wp-typia add block --template`.
 */
export const ADD_BLOCK_TEMPLATE_IDS = [
	"basic",
	"interactivity",
	"persistence",
	"compound",
] as const;
/**
 * Union of supported built-in block template ids.
 */
export type AddBlockTemplateId = (typeof ADD_BLOCK_TEMPLATE_IDS)[number];

/**
 * Suggest the closest supported add-block template id for typo diagnostics.
 *
 * @param templateId Raw `wp-typia add block --template` value.
 * @returns The closest supported template id when it is within the shared
 * close-id threshold, otherwise `null`.
 */
export function suggestAddBlockTemplateId(
	templateId: string,
): AddBlockTemplateId | null {
	return suggestCloseId(templateId, ADD_BLOCK_TEMPLATE_IDS, {
		maxDistance: 3,
	});
}

/**
 * Options for `wp-typia add variation`.
 *
 * @property blockName Existing workspace block slug that owns the variation.
 * @property cwd Working directory used to resolve the nearest official workspace.
 * @property variationName Human-entered variation name normalized into a slug.
 */
export interface RunAddVariationCommandOptions {
	blockName: string;
	cwd?: string;
	variationName: string;
}

/**
 * Options for `wp-typia add core-variation`.
 *
 * @property cwd Working directory used to resolve the nearest official workspace.
 * @property targetBlockName Full `namespace/block` name that receives the variation.
 * @property variationName Human-entered variation name normalized into a slug.
 */
export interface RunAddCoreVariationCommandOptions {
	cwd?: string;
	targetBlockName: string;
	variationName: string;
}

/**
 * Options for `wp-typia add style`.
 *
 * @property blockName Existing workspace block slug that owns the style.
 * @property cwd Working directory used to resolve the nearest official workspace.
 * Defaults to `process.cwd()`.
 * @property styleName Human-entered style name that will be normalized into the
 * generated style slug.
 */
export interface RunAddBlockStyleCommandOptions {
	blockName: string;
	cwd?: string;
	styleName: string;
}

/**
 * Options for `wp-typia add transform`.
 *
 * @property cwd Working directory used to resolve the nearest official workspace.
 * Defaults to `process.cwd()`.
 * @property fromBlockName Full `namespace/block` source block name accepted by
 * WordPress block transform definitions.
 * @property toBlockName Existing workspace block slug or full block name that
 * owns the generated transform.
 * @property transformName Human-entered transform name that will be normalized
 * into the generated transform slug.
 */
export interface RunAddBlockTransformCommandOptions {
	cwd?: string;
	fromBlockName: string;
	toBlockName: string;
	transformName: string;
}

/**
 * Options for `wp-typia add pattern`.
 *
 * @property cwd Working directory used to resolve the nearest official workspace.
 * @property patternName Human-entered pattern name normalized into a slug.
 */
export interface RunAddPatternCommandOptions {
	catalogTitle?: string;
	contentFile?: string;
	cwd?: string;
	patternName: string;
	patternScope?: PatternCatalogScope | string;
	sectionRole?: string;
	tags?: readonly string[] | string;
	thumbnailUrl?: string;
}

/**
 * Options for `wp-typia add binding-source`.
 *
 * @property attributeName Optional block attribute to bind when `blockName` is provided.
 * @property blockName Optional existing workspace block slug or full block name.
 * @property bindingSourceName Human-entered binding source name normalized into a slug.
 * @property cwd Working directory used to resolve the nearest official workspace.
 * @property metaPath Optional top-level post-meta field used as the default
 * source argument when `postMetaName` is provided.
 * @property postMetaName Optional generated post-meta contract slug used to
 * back the binding source with `get_post_meta()`.
 */
export interface RunAddBindingSourceCommandOptions {
	attributeName?: string;
	blockName?: string;
	bindingSourceName: string;
	cwd?: string;
	metaPath?: string;
	postMetaName?: string;
}

/**
 * Options for `wp-typia add contract`.
 *
 * @property contractName Human-entered contract name normalized into a stable slug.
 * @property cwd Working directory used to resolve the nearest official workspace.
 * @property typeName Optional exported TypeScript type or interface name. Defaults
 * to the PascalCase version of `contractName`.
 */
export interface RunAddContractCommandOptions {
	contractName: string;
	cwd?: string;
	typeName?: string;
}

/**
 * Options for `wp-typia add post-meta`.
 *
 * @property cwd Working directory used to resolve the nearest official workspace.
 * @property hideFromRest Whether to keep the generated meta key out of REST and
 * editor responses. Defaults to REST/editor exposure being enabled.
 * @property metaKey Optional WordPress meta key. Defaults to
 * `_<phpPrefix>_<postMetaName>`.
 * @property postMetaName Human-entered post-meta contract name normalized into
 * a stable slug.
 * @property postType WordPress post type key, 20 characters or fewer, that owns
 * the generated meta key.
 * @property typeName Optional exported TypeScript type or interface name.
 * Defaults to `<PascalName>Meta`.
 */
export interface RunAddPostMetaCommandOptions {
	cwd?: string;
	hideFromRest?: boolean;
	metaKey?: string;
	postMetaName: string;
	postType: string;
	typeName?: string;
}

/**
 * Options for `wp-typia add rest-resource`.
 *
 * Passing `manual: true` records a type-only external REST route contract. In
 * manual mode wp-typia still owns TypeScript contracts, validators, OpenAPI,
 * generated clients, and drift checks, but it does not create PHP route glue.
 *
 * @property auth Optional auth intent for manual mode. Defaults to public.
 * @property bodyTypeName Optional exported TypeScript body type for manual
 * mode. Defaults to `<PascalName>Request` for write methods.
 * @property controllerClass Optional REST controller class reference. Generated
 * routes delegate through it; manual/provider routes record it as owner metadata.
 * @property controllerExtends Optional base class for the generated controller
 * wrapper or declared manual/provider controller owner.
 * @property cwd Working directory used to resolve the nearest official workspace.
 * @property manual Whether to scaffold a type-only external REST contract.
 * @property method HTTP method for manual REST contract mode. Defaults to GET.
 * @property methods Optional comma-separated REST method list.
 * @property namespace Optional REST namespace, defaulting to the workspace namespace.
 * @property permissionCallback Optional PHP callback used for generated REST
 * route permission checks or declared manual/provider route ownership.
 * @property pathPattern Route path pattern for manual mode, relative to the
 * namespace. Defaults to `/<name>`.
 * @property queryTypeName Optional exported TypeScript query type for manual
 * mode. Defaults to `<PascalName>Query`.
 * @property restResourceName Human-entered resource name normalized into a slug.
 * @property responseTypeName Optional exported TypeScript response type for
 * manual mode. Defaults to `<PascalName>Response`.
 * @property routePattern Optional generated item route pattern, or manual
 * provider-route alias for `pathPattern`, relative to the namespace.
 * Generated mode defaults to `/<name>/item`; manual mode defaults to `/<name>`.
 * @property secretFieldName Optional write-only secret field name for manual
 * settings contracts. Requires a request body.
 * @property secretHasValueFieldName Optional alias for `secretStateFieldName`
 * when the response field is a safe presence indicator.
 * @property secretMaskedResponseFieldName Optional alias for
 * `secretStateFieldName` when the response field represents masked state.
 * @property secretPreserveOnEmpty Whether blank secret submissions should
 * preserve the existing value. Defaults to true when `secretFieldName` is set.
 * @property secretStateFieldName Optional masked response boolean field for
 * `secretFieldName`. Defaults to `has<PascalSecretField>`.
 */
export interface RunAddRestResourceCommandOptions {
	auth?: string;
	bodyTypeName?: string;
	controllerClass?: string;
	controllerExtends?: string;
	cwd?: string;
	manual?: boolean;
	method?: string;
	methods?: string;
	namespace?: string;
	permissionCallback?: string;
	pathPattern?: string;
	queryTypeName?: string;
	restResourceName: string;
	responseTypeName?: string;
	routePattern?: string;
	secretFieldName?: string;
	secretHasValueFieldName?: string;
	secretMaskedResponseFieldName?: string;
	secretPreserveOnEmpty?: boolean;
	secretStateFieldName?: string;
}

/**
 * Options for `wp-typia add admin-view`.
 *
 * @property adminViewName Human-entered admin screen name that will be
 * normalized into the generated slug.
 * @property cwd Working directory used to resolve the nearest official workspace.
 * Defaults to `process.cwd()`.
 * @property source Optional data source locator. `rest-resource:<slug>` wires
 * the generated screen to an existing list-capable REST resource.
 * `core-data:<kind>/<name>` binds the screen to a supported WordPress-owned
 * entity collection such as `core-data:postType/post`.
 */
export interface RunAddAdminViewCommandOptions {
	adminViewName: string;
	cwd?: string;
	source?: string;
}

/**
 * Options for `wp-typia add ability`.
 *
 * @property cwd Working directory used to resolve the nearest official workspace.
 * Defaults to `process.cwd()`.
 * @property abilityName Human-entered workflow ability name that will be
 * normalized into the generated slug.
 */
export interface RunAddAbilityCommandOptions {
	abilityName: string;
	cwd?: string;
}

/**
 * Options for `wp-typia add ai-feature`.
 *
 * @property aiFeatureName Human-entered AI feature name normalized into a slug.
 * @property cwd Working directory used to resolve the nearest official workspace.
 * @property namespace Optional REST namespace, defaulting to the workspace namespace.
 */
export interface RunAddAiFeatureCommandOptions {
	aiFeatureName: string;
	cwd?: string;
	namespace?: string;
}

/**
 * Options for `wp-typia add hooked-block`.
 *
 * @property anchorBlockName Full `namespace/block` anchor block name.
 * @property blockName Existing workspace block slug that receives metadata.
 * @property cwd Working directory used to resolve the nearest official workspace.
 * @property position Hook position accepted by WordPress block hooks.
 */
export interface RunAddHookedBlockCommandOptions {
	anchorBlockName: string;
	blockName: string;
	cwd?: string;
	position: string;
}

/**
 * Options for `wp-typia add editor-plugin`.
 *
 * @property cwd Working directory used to resolve the nearest official workspace.
 * Defaults to `process.cwd()`.
 * @property editorPluginName Human-entered editor plugin name that will be
 * normalized into the generated slug.
 * @property slot Optional editor shell slot. Defaults to `sidebar`.
 */
export interface RunAddEditorPluginCommandOptions {
	cwd?: string;
	editorPluginName: string;
	slot?: string;
}

/**
 * Options for `wp-typia add integration-env`.
 *
 * @property cwd Working directory used to resolve the nearest official workspace.
 * Defaults to `process.cwd()`.
 * @property integrationEnvName Human-entered environment name that will be
 * normalized into script and documentation paths.
 * @property service Optional local service starter. Defaults to `none`.
 * @property withReleaseZip Whether to add release zip packaging scripts.
 * @property withWpEnv Whether to add a local `@wordpress/env` preset and scripts.
 */
export interface RunAddIntegrationEnvCommandOptions {
	cwd?: string;
	integrationEnvName: string;
	service?: string;
	withReleaseZip?: boolean;
	withWpEnv?: boolean;
}

/**
 * Options for `wp-typia add block`.
 *
 * @property alternateRenderTargets Optional comma-separated alternate render targets.
 * @property blockName Human-entered block name normalized into a slug.
 * @property cwd Working directory used to resolve the nearest official workspace.
 * @property dataStorageMode Optional persistence storage mode.
 * @property externalLayerId Optional external layer id to apply.
 * @property externalLayerSource Optional local, GitHub, or npm external layer source.
 * @property innerBlocksPreset Optional compound block inner blocks preset.
 * @property persistencePolicy Optional persistence access policy.
 * @property selectExternalLayerId Optional selector for interactive external layer choice.
 * @property templateId Optional built-in block template id.
 */
export interface RunAddBlockCommandOptions {
	alternateRenderTargets?: string;
	blockName: string;
	cwd?: string;
	dataStorageMode?: string;
	externalLayerId?: string;
	externalLayerSource?: string;
	innerBlocksPreset?: string;
	persistencePolicy?: string;
	selectExternalLayerId?: (
		options: Array<{
			description?: string;
			extends: string[];
			id: string;
		}>,
	) => Promise<string>;
	templateId?: string;
}

/**
 * Captured workspace mutation state used to roll back partial add operations.
 */
export interface WorkspaceMutationSnapshot {
	/** Snapshots of file contents taken before the mutation starts. */
	fileSources: Array<{
		/** Absolute file path recorded for rollback. */
		filePath: string;
		/** Previous file contents, or `null` when the file did not exist. */
		source: string | null;
	}>;
	/** Snapshot directories created while seeding migration history. */
	snapshotDirs: string[];
	/** Files or directories created by the mutation that should be removed on rollback. */
	targetPaths: string[];
}
