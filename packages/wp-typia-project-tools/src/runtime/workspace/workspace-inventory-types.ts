export interface WorkspaceBlockInventoryEntry {
	apiTypesFile?: string;
	attributeTypeName?: string;
	openApiFile?: string;
	slug: string;
	typesFile: string;
}

export interface WorkspaceVariationInventoryEntry {
	block: string;
	file: string;
	slug: string;
}

export interface WorkspaceBlockStyleInventoryEntry {
	block: string;
	file: string;
	slug: string;
}

export interface WorkspaceBlockTransformInventoryEntry {
	block: string;
	file: string;
	from: string;
	slug: string;
	to: string;
}

export interface WorkspacePatternInventoryEntry {
	contentFile?: string;
	file?: string;
	scope?: string;
	sectionRole?: string;
	slug: string;
	tags?: string[];
	thumbnailUrl?: string;
	title?: string;
}

export interface WorkspaceBindingSourceInventoryEntry {
	attribute?: string;
	block?: string;
	editorFile: string;
	metaPath?: string;
	postMeta?: string;
	serverFile: string;
	slug: string;
}

/**
 * Standalone TypeScript contract entry parsed from `scripts/block-config.ts`.
 *
 * These contracts generate JSON Schema artifacts without owning a WordPress REST
 * route, so smoke tests and external integrations can reference stable schema
 * names from the workspace inventory.
 */
export interface WorkspaceContractInventoryEntry {
	schemaFile: string;
	slug: string;
	sourceTypeName: string;
	typesFile: string;
}

/**
 * REST-resource entry parsed from `scripts/block-config.ts`.
 *
 * Each file path is stored relative to the workspace root so doctor checks and
 * workspace mutation helpers can resolve the generated TypeScript, OpenAPI, and
 * PHP route artifacts without guessing their locations.
 */
export interface WorkspaceRestResourceInventoryEntry {
	apiFile: string;
	auth?: string;
	bodyTypeName?: string;
	clientFile: string;
	controllerClass?: string;
	controllerExtends?: string;
	dataFile?: string;
	method?: string;
	methods: string[];
	mode?: "generated" | "manual";
	namespace: string;
	openApiFile: string;
	pathPattern?: string;
	permissionCallback?: string;
	phpFile?: string;
	queryTypeName?: string;
	responseTypeName?: string;
	routePattern?: string;
	secretFieldName?: string;
	secretPreserveOnEmpty?: boolean;
	secretStateFieldName?: string;
	slug: string;
	typesFile: string;
	validatorsFile: string;
}

/**
 * Post-meta contract entry parsed from `scripts/block-config.ts`.
 *
 * The TypeScript source and schema artifact define the persisted meta value
 * shape, while the PHP file registers the matching WordPress post-meta key for
 * the declared post type scope.
 */
export interface WorkspacePostMetaInventoryEntry {
	metaKey: string;
	phpFile: string;
	postType: string;
	schemaFile: string;
	showInRest: boolean;
	slug: string;
	sourceTypeName: string;
	typesFile: string;
}

/**
 * Ability entry parsed from `scripts/block-config.ts`.
 *
 * Each file path stays relative to the workspace root so doctor checks, schema
 * sync scripts, and generated admin/editor helpers can resolve typed workflow
 * artifacts without guessing their locations.
 */
export interface WorkspaceAbilityInventoryEntry {
	clientFile: string;
	configFile: string;
	dataFile: string;
	inputSchemaFile: string;
	inputTypeName: string;
	outputSchemaFile: string;
	outputTypeName: string;
	phpFile: string;
	slug: string;
	typesFile: string;
}

/**
 * AI-feature entry parsed from `scripts/block-config.ts`.
 *
 * Each file path stays relative to the workspace root so doctor checks, add
 * workflows, and split sync scripts can reason about the REST and AI-safe
 * artifacts without guessing their locations.
 */
export interface WorkspaceAiFeatureInventoryEntry {
	aiSchemaFile: string;
	apiFile: string;
	clientFile: string;
	dataFile: string;
	namespace: string;
	openApiFile: string;
	phpFile: string;
	slug: string;
	typesFile: string;
	validatorsFile: string;
}

/**
 * DataViews admin-screen entry parsed from `scripts/block-config.ts`.
 *
 * @property file Relative path to the generated admin view shared entry file.
 * @property phpFile Relative path to the generated WordPress admin page glue.
 * @property slug Normalized admin view slug.
 * @property source Optional source locator such as `rest-resource:products` or
 * `core-data:postType/post`.
 */
export interface WorkspaceAdminViewInventoryEntry {
	file: string;
	phpFile: string;
	slug: string;
	source?: string;
}

/**
 * Editor-plugin entry parsed from `scripts/block-config.ts`.
 *
 * @property file Relative path to the generated editor plugin entry file.
 * @property slug Normalized editor plugin slug.
 * @property slot Canonical editor shell slot for the plugin scaffold.
 */
export interface WorkspaceEditorPluginInventoryEntry {
	file: string;
	slug: string;
	slot: string;
}

export interface WorkspaceInventory {
	adminViews: WorkspaceAdminViewInventoryEntry[];
	bindingSources: WorkspaceBindingSourceInventoryEntry[];
	blockConfigPath: string;
	blocks: WorkspaceBlockInventoryEntry[];
	blockStyles: WorkspaceBlockStyleInventoryEntry[];
	blockTransforms: WorkspaceBlockTransformInventoryEntry[];
	contracts: WorkspaceContractInventoryEntry[];
	abilities: WorkspaceAbilityInventoryEntry[];
	aiFeatures: WorkspaceAiFeatureInventoryEntry[];
	hasAbilitiesSection: boolean;
	hasAdminViewsSection: boolean;
	hasBindingSourcesSection: boolean;
	hasAiFeaturesSection: boolean;
	hasBlockStylesSection: boolean;
	hasBlockTransformsSection: boolean;
	hasContractsSection: boolean;
	hasEditorPluginsSection: boolean;
	hasPatternsSection: boolean;
	hasPostMetaSection: boolean;
	hasRestResourcesSection: boolean;
	hasVariationsSection: boolean;
	editorPlugins: WorkspaceEditorPluginInventoryEntry[];
	patterns: WorkspacePatternInventoryEntry[];
	postMeta: WorkspacePostMetaInventoryEntry[];
	restResources: WorkspaceRestResourceInventoryEntry[];
	source: string;
	variations: WorkspaceVariationInventoryEntry[];
}

export type WorkspaceBlockSelectOption = {
	description: string;
	name: string;
	value: string;
};

export type WorkspaceInventoryParseResult = Omit<
	WorkspaceInventory,
	"blockConfigPath"
>;

export type WorkspaceInventoryEntriesKey = {
	[Key in keyof WorkspaceInventoryParseResult]: WorkspaceInventoryParseResult[Key] extends unknown[]
		? Key
		: never;
}[keyof WorkspaceInventoryParseResult];

export type WorkspaceInventorySectionFlagKey = {
	[Key in keyof WorkspaceInventoryParseResult]: WorkspaceInventoryParseResult[Key] extends boolean
		? Key
		: never;
}[keyof WorkspaceInventoryParseResult];

export type WorkspaceInventoryUpdateOptions = {
	abilityEntries?: string[];
	adminViewEntries?: string[];
	aiFeatureEntries?: string[];
	blockEntries?: string[];
	blockStyleEntries?: string[];
	blockTransformEntries?: string[];
	bindingSourceEntries?: string[];
	contractEntries?: string[];
	editorPluginEntries?: string[];
	patternEntries?: string[];
	postMetaEntries?: string[];
	restResourceEntries?: string[];
	transformSource?: (source: string) => string;
	variationEntries?: string[];
};

export type WorkspaceInventoryAppendOptionKey = Exclude<
	keyof WorkspaceInventoryUpdateOptions,
	"transformSource"
>;
