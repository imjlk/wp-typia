/**
 * Public runtime helper barrel consumed by the canonical `wp-typia` package.
 *
 * These exports do not make `@wp-typia/project-tools` the CLI owner again. Command
 * taxonomy, help text ownership, and published bin responsibility stay in
 * `packages/wp-typia`.
 *
 * Import `formatAddHelpText`, `runAddBlockCommand`,
 * `runAddVariationCommand`, `runAddPatternCommand`,
 * `runAddBindingSourceCommand`, `runAddHookedBlockCommand`,
 * `runAddAdminViewCommand` for DataViews-backed admin screen scaffolds,
 * `runAddAbilityCommand` for typed workflow ability scaffolds,
 * and `HOOKED_BLOCK_POSITION_IDS`,
 * `getWorkspaceBlockSelectOptions`, `getWorkspaceBlockSelectOptionsAsync`, and
 * `seedWorkspaceMigrationProject` for
 * explicit `wp-typia add` flows,
 * `runAddAiFeatureCommand` for server-owned WordPress AI feature scaffolds,
 * `runAddContractCommand` for standalone TypeScript schema artifacts,
 * `runAddRestResourceCommand` for plugin-level REST resource scaffolds,
 * `getDoctorChecks`, `runDoctor`, and `DoctorCheck` for diagnostics,
 * `createCliCommandError`, `createCliDiagnosticCodeError`,
 * `CLI_DIAGNOSTIC_CODES`, `CLI_DIAGNOSTIC_CODE_METADATA`,
 * `getCliDiagnosticCodeMetadata`, and `formatCliDiagnosticError` for shared
 * non-interactive failure rendering and explicit diagnostic-code ownership,
 * `formatHelpText` for top-level CLI usage output, scaffold helpers such as
 * `createReadlinePrompt`, `getNextSteps`, `getOptionalOnboarding`,
 * `runScaffoldFlow`, and `ReadlinePrompt` for interactive project creation,
 * and template helpers such as `formatTemplateDetails`,
 * `formatTemplateFeatures`, `formatTemplateSummary`, `getTemplateById`,
 * `getTemplateSelectOptions`, `listTemplates`, and `isBuiltInTemplateId` for
 * template inspection flows.
 */
export {
	createDoctorRunSummary,
	getDoctorChecks,
	getDoctorExitFailureChecks,
	getDoctorExitFailureDetailLines,
	runDoctor,
	type DoctorCheck,
	type DoctorCheckScope,
	type DoctorExitPolicy,
	type DoctorFailureSummary,
	type DoctorRunSummary,
	type GetDoctorChecksOptions,
} from "../doctor/cli-doctor.js";
export {
	createCliCommandError,
	createCliDiagnosticCodeError,
	CliDiagnosticError,
	CLI_DIAGNOSTIC_CODE_METADATA,
	CLI_DIAGNOSTIC_CODES,
	formatCliDiagnosticError,
	formatDoctorCheckLine,
	formatDoctorSummaryLine,
	getCliDiagnosticCodeMetadata,
	getDoctorFailureDetailLines,
	getFailingDoctorChecks,
	isCliDiagnosticError,
} from "./cli-diagnostics.js";
export type {
	CliDiagnosticCode,
	CliDiagnosticCodeError,
	CliDiagnosticMessage,
} from "./cli-diagnostics.js";
export {
	EDITOR_PLUGIN_SLOT_IDS,
	formatAddHelpText,
	getWorkspaceBlockSelectOptions,
	getWorkspaceBlockSelectOptionsAsync,
	PATTERN_CATALOG_SCOPE_IDS,
	runAddAdminViewCommand,
	runAddAbilityCommand,
	runAddBindingSourceCommand,
	runAddAiFeatureCommand,
	runAddBlockCommand,
	runAddBlockStyleCommand,
	runAddBlockTransformCommand,
	runAddContractCommand,
	runAddCoreVariationCommand,
	runAddEditorPluginCommand,
	runAddHookedBlockCommand,
	runAddPatternCommand,
	runAddPostMetaCommand,
	runAddRestResourceCommand,
	runAddVariationCommand,
	seedWorkspaceMigrationProject,
} from "../add/cli-add.js";
export type { PatternCatalogScope } from "../add/cli-add.js";
export {
	COMPOUND_INNER_BLOCKS_PRESET_IDS,
	getCompoundInnerBlocksPresetDefinition,
} from "../add/compound-inner-blocks.js";
export type { CompoundInnerBlocksPresetId } from "../add/compound-inner-blocks.js";
export { HOOKED_BLOCK_POSITION_IDS } from "../add/hooked-blocks.js";
export type { EditorPluginSlotId } from "../add/cli-add.js";
export type { WorkspaceBlockSelectOption } from "../workspace/workspace-inventory.js";
export type { HookedBlockPositionId } from "../add/hooked-blocks.js";
export { formatHelpText } from "./cli-help.js";
export {
	getNextSteps,
	getOptionalOnboarding,
	runScaffoldFlow,
} from "../templates/cli-scaffold.js";
export { createReadlinePrompt, type ReadlinePrompt } from "./cli-prompt.js";
export {
	formatTemplateDetails,
	formatTemplateFeatures,
	formatTemplateSummary,
	getTemplateById,
	getTemplateSelectOptions,
	isBuiltInTemplateId,
	listTemplates,
} from "../templates/cli-templates.js";
