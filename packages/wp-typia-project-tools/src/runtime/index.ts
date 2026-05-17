/**
 * Public runtime surface for wp-typia project tools.
 *
 * This barrel exposes the stable orchestration APIs that power the `wp-typia`
 * CLI while keeping reusable project logic out of the CLI package itself.
 * Consumers should prefer these exports for scaffold, add, migrate, doctor,
 * and workspace-aware helpers such as `getWorkspaceBlockSelectOptions`,
 * `getWorkspaceBlockSelectOptionsAsync`,
 * `runAddBlockCommand`, `runAddBlockStyleCommand`,
 * `runAddBlockTransformCommand`, `runAddCoreVariationCommand`,
 * `runAddVariationCommand`,
 * `runAddPatternCommand`, `runAddBindingSourceCommand`,
 * `runAddEditorPluginCommand`,
 * `runAddAdminViewCommand`,
 * `runAddHookedBlockCommand`,
 * `HOOKED_BLOCK_POSITION_IDS`, and `runDoctor`.
 */
export {
	COMPOUND_INNER_BLOCKS_PRESET_IDS,
	DEFAULT_COMPOUND_INNER_BLOCKS_PRESET_ID,
	getCompoundInnerBlocksPresetDefinition,
	isCompoundInnerBlocksPresetId,
	parseCompoundInnerBlocksPreset,
	resolveCompoundInnerBlocksPreset,
} from "./compound-inner-blocks.js";
export type {
	CompoundInnerBlocksPresetDefinition,
	CompoundInnerBlocksPresetId,
	CompoundInnerBlocksTemplateLock,
} from "./compound-inner-blocks.js";
export {
	scaffoldProject,
	collectScaffoldAnswers,
	getScaffoldTemplateVariableGroups,
	getDefaultAnswers,
	getTemplateVariables,
	resolvePackageManagerId,
	resolveTemplateId,
} from "./scaffold.js";
export {
	DEFAULT_SCAFFOLD_COMPATIBILITY,
	OPTIONAL_WORDPRESS_AI_CLIENT_COMPATIBILITY,
	REQUIRED_WORKSPACE_ABILITY_COMPATIBILITY,
	createScaffoldCompatibilityConfig,
	renderScaffoldCompatibilityConfig,
	resolveScaffoldCompatibilityPolicy,
	updatePluginHeaderCompatibility,
} from "./scaffold-compatibility.js";
export type {
	ScaffoldCompatibilityConfig,
	ScaffoldCompatibilityPolicy,
	ScaffoldPluginHeaderCompatibility,
} from "./scaffold-compatibility.js";
export { BlockGeneratorService } from "./block-generator-service.js";
export type {
	BasicScaffoldTemplateVariableGroups,
	CompoundScaffoldTemplateVariableGroups,
	ExternalScaffoldTemplateVariableGroups,
	FlatScaffoldTemplateVariables,
	InteractivityScaffoldTemplateVariableGroups,
	PersistenceScaffoldTemplateVariableGroups,
	QueryLoopScaffoldTemplateVariableGroups,
	ScaffoldTemplateFamily,
	ScaffoldTemplateVariableGroups,
} from "./scaffold.js";
export type {
	ApplyBlockInput,
	BlockGenerationTarget,
	BlockSpec,
	PlanBlockInput,
	PlanBlockResult,
	RenderBlockInput,
	RenderBlockResult,
	ValidateBlockInput,
	ValidateBlockResult,
} from "./block-generator-service.js";
export {
	BLOCK_GENERATION_TOOL_CONTRACT_VERSION,
	inspectBlockGeneration,
} from "./block-generator-tool-contract.js";
export type {
	BlockGenerationEmittedFilePreview,
	BlockGenerationRenderPreview,
	BlockGenerationStarterManifestPreview,
	BlockGenerationTemplateCopyPreview,
	BlockGenerationToolStage,
	InspectBlockGenerationInput,
	InspectBlockGenerationPlanResult,
	InspectBlockGenerationRenderResult,
	InspectBlockGenerationResult,
	InspectBlockGenerationValidateResult,
} from "./block-generator-tool-contract.js";
export {
	formatMigrationHelpText,
	parseMigrationArgs,
	runMigrationCommand,
} from "./migrations.js";
export {
	parseWorkspacePackageManagerId,
	resolveWorkspaceProject,
	tryResolveWorkspaceProject,
} from "./workspace-project.js";
export {
	manifestAttributeToJsonSchema,
	projectJsonSchemaDocument,
	manifestToJsonSchema,
	manifestToOpenApi,
	normalizeEndpointAuthDefinition,
} from "./schema-core.js";
export {
	buildCompoundChildStarterManifestDocument,
	getStarterManifestFiles,
	stringifyStarterManifest,
} from "./starter-manifests.js";
export type {
	EndpointAuthIntent,
	EndpointOpenApiAuthMode,
	EndpointOpenApiContractDocument,
	EndpointOpenApiDocumentOptions,
	EndpointOpenApiEndpointDefinition,
	EndpointOpenApiMethod,
	EndpointWordPressAuthDefinition,
	EndpointWordPressAuthMechanism,
	JsonSchemaDocument,
	JsonSchemaProjectionProfile,
	JsonSchemaObject,
	NormalizedEndpointAuthDefinition,
	OpenApiDocument,
	OpenApiInfo,
	OpenApiOperation,
	OpenApiParameter,
	OpenApiPathItem,
	OpenApiSecurityScheme,
} from "./schema-core.js";
export {
	PACKAGE_MANAGER_IDS,
	PACKAGE_MANAGERS,
	formatPackageExecCommand,
	formatInstallCommand,
	formatRunScript,
	getPackageManager,
	getPackageManagerSelectOptions,
	transformPackageManagerText,
} from "./package-managers.js";
export { suggestCloseId } from "./id-suggestions.js";
export type { SuggestCloseIdOptions } from "./id-suggestions.js";
export {
	clearPackageVersionsCache,
	getPackageVersions,
	invalidatePackageVersionsCache,
} from "./package-versions.js";
export type { PackageVersions } from "./package-versions.js";
export {
	TEMPLATE_IDS,
	TEMPLATE_REGISTRY,
	getTemplateById,
	getTemplateSelectOptions,
	listTemplates,
} from "./template-registry.js";
export {
	EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV,
	pruneExternalTemplateCache,
} from "./template-source-cache.js";
export type {
	ExternalTemplateCachePruneOptions,
	ExternalTemplateCachePruneResult,
} from "./template-source-cache.js";
export {
	STALE_TEMP_ROOT_MAX_AGE_MS,
	WP_TYPIA_TEMP_ROOT_PREFIX,
	cleanupManagedTempRoot,
	cleanupStaleTempRoots,
	createManagedTempRoot,
	getTrackedTempRoots,
} from "./temp-roots.js";
export {
	createReadlinePrompt,
	createDoctorRunSummary,
	createCliCommandError,
	createCliDiagnosticCodeError,
	CliDiagnosticError,
	CLI_DIAGNOSTIC_CODES,
	formatCliDiagnosticError,
	formatAddHelpText,
	formatDoctorCheckLine,
	formatDoctorSummaryLine,
	formatHelpText,
	formatTemplateDetails,
	formatTemplateFeatures,
	formatTemplateSummary,
	getDoctorChecks,
	getDoctorExitFailureChecks,
	getDoctorExitFailureDetailLines,
	getDoctorFailureDetailLines,
	getFailingDoctorChecks,
	getNextSteps,
	getOptionalOnboarding,
	getWorkspaceBlockSelectOptions,
	getWorkspaceBlockSelectOptionsAsync,
	HOOKED_BLOCK_POSITION_IDS,
	EDITOR_PLUGIN_SLOT_IDS,
	isCliDiagnosticError,
	runAddAdminViewCommand,
	runAddAbilityCommand,
	runAddAiFeatureCommand,
	runAddBindingSourceCommand,
	runAddBlockCommand,
	runAddBlockStyleCommand,
	runAddBlockTransformCommand,
	runAddCoreVariationCommand,
	runAddEditorPluginCommand,
	runAddHookedBlockCommand,
	runAddPatternCommand,
	runAddPostMetaCommand,
	runDoctor,
	runAddVariationCommand,
	runScaffoldFlow,
} from "./cli-core.js";
export {
	extractPatternSectionRoleMatches,
	extractPatternSectionRolesFromAttributes,
	formatPatternCatalogDiagnostics,
	PATTERN_CATALOG_SCOPE_IDS,
	PATTERN_SECTION_ROLE_PATTERN,
	PATTERN_TAG_PATTERN,
	resolvePatternCatalogContentFile,
	validatePatternCatalog,
} from "./pattern-catalog.js";
export type {
	CliDiagnosticCode,
	CliDiagnosticCodeError,
	CliDiagnosticMessage,
	DoctorCheck,
	DoctorCheckScope,
	DoctorExitPolicy,
	DoctorFailureSummary,
	DoctorRunSummary,
	EditorPluginSlotId,
	HookedBlockPositionId,
	ReadlinePrompt,
	WorkspaceBlockSelectOption,
} from "./cli-core.js";
export type {
	PatternCatalogDiagnostic,
	PatternCatalogDiagnosticCode,
	PatternCatalogDiagnosticSeverity,
	PatternCatalogEntry,
	PatternCatalogScope,
	PatternCatalogSectionRoleConvention,
	PatternCatalogSectionRoleMatch,
	PatternCatalogValidationOptions,
	PatternCatalogValidationResult,
} from "./pattern-catalog.js";
