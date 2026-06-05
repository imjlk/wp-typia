import path from "node:path";

import {
	collectScaffoldAnswers,
	DATA_STORAGE_MODES,
	PERSISTENCE_POLICIES,
	isDataStorageMode,
	resolveCreateProfileId,
	isPersistencePolicy,
	resolvePackageManagerId,
	resolveTemplateId,
} from "./scaffold.js";
import { parseCompoundInnerBlocksPreset } from "../add/compound-inner-blocks.js";
import { isCompoundPersistenceEnabled } from "./scaffold-template-variable-groups.js";
import {
	buildScaffoldDryRunPlan,
	emitScaffoldProject,
	type ScaffoldEmissionOptions,
	type ScaffoldInstallDependencies,
} from "./cli-scaffold-emission.js";
import { readGeneratedPackageScripts } from "./cli-scaffold-files.js";
import {
	getNextSteps,
	getOptionalOnboarding,
} from "./cli-scaffold-output.js";
import {
	collectProjectDirectoryWarnings,
	collectTemplateCapabilityWarnings,
	resolveOptionalBooleanFlag,
	resolveOptionalSelection,
	templateUsesPersistenceSettings,
	validateCreateFlagContract,
	validateCreateProjectInput,
} from "./cli-scaffold-validation.js";
import type { DataStorageMode, PersistencePolicy } from "./scaffold.js";
import type { PackageManagerId } from "../shared/package-managers.js";
import {
	OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE,
	isBuiltInTemplateId,
} from "./template-registry.js";
import {
	resolveOptionalInteractiveExternalLayerId,
	type ExternalLayerSelectionOption,
} from "./external-layer-selection.js";
import type { TemplateDefinition } from "./template-registry.js";
import {
	resolveLocalCliPathOption,
	normalizeOptionalCliString,
} from "../cli/cli-validation.js";
import {
	resolveScaffoldWordPressTargetVersion,
} from "./scaffold-compatibility.js";

export { getNextSteps, getOptionalOnboarding } from "./cli-scaffold-output.js";
export type {
	OptionalOnboardingGuidance,
	ScaffoldNextStepsOptions,
	ScaffoldOptionalOnboardingOptions,
} from "./cli-scaffold-output.js";
export type { ScaffoldDryRunPlan } from "./cli-scaffold-emission.js";

interface RunScaffoldFlowOptions {
	allowExistingDir?: boolean;
	alternateRenderTargets?: string;
	cwd?: string;
	dataStorageMode?: string;
	dryRun?: boolean;
	externalLayerId?: string;
	externalLayerSource?: string;
	installDependencies?: ScaffoldInstallDependencies;
	innerBlocksPreset?: string;
	isInteractive?: boolean;
	namespace?: string;
	noInstall?: boolean;
	onProgress?: ScaffoldEmissionOptions["onProgress"];
	packageManager?: string;
	phpPrefix?: string;
	profile?: string;
	projectInput: string;
	promptText?: Parameters<typeof collectScaffoldAnswers>[0]["promptText"];
	queryPostType?: string;
	selectDataStorage?: () => Promise<DataStorageMode>;
	selectExternalLayerId?: (
		options: ExternalLayerSelectionOption[],
	) => Promise<string>;
	selectPackageManager?: () => Promise<PackageManagerId>;
	selectPersistencePolicy?: () => Promise<PersistencePolicy>;
	selectTemplate?: () => Promise<TemplateDefinition["id"]>;
	selectWithMigrationUi?: () => Promise<boolean>;
	selectWithTestPreset?: () => Promise<boolean>;
	selectWithWpEnv?: () => Promise<boolean>;
	templateId?: string;
	textDomain?: string;
	variant?: string;
	persistencePolicy?: string;
	withMigrationUi?: boolean;
	withTestPreset?: boolean;
	withWpEnv?: boolean;
	wpVersion?: string;
	yes?: boolean;
}

/**
 * Resolve scaffold options, prompts, and follow-up steps for one CLI run.
 *
 * @param options CLI/runtime inputs used to collect answers and scaffold a
 * project.
 * @returns The scaffold result together with next-step guidance.
 */
export async function runScaffoldFlow({
	projectInput,
	cwd = process.cwd(),
	templateId,
	alternateRenderTargets,
	dataStorageMode,
	dryRun = false,
	externalLayerId,
	externalLayerSource,
	innerBlocksPreset,
	persistencePolicy,
	packageManager,
	namespace,
	profile,
	textDomain,
	phpPrefix,
	queryPostType,
	yes = false,
	noInstall = false,
	onProgress,
	isInteractive = false,
	allowExistingDir = false,
	selectTemplate,
	selectDataStorage,
	selectExternalLayerId,
	selectPersistencePolicy,
	selectPackageManager,
	promptText,
	installDependencies = undefined,
	variant,
	selectWithTestPreset,
	selectWithWpEnv,
	selectWithMigrationUi,
	withMigrationUi,
	withTestPreset,
	withWpEnv,
	wpVersion,
}: RunScaffoldFlowOptions) {
	const normalizedExternalLayerId =
		normalizeOptionalCliString(externalLayerId);
	const normalizedExternalLayerSource = resolveLocalCliPathOption({
		cwd,
		label: "--external-layer-source",
		value: externalLayerSource,
	});

	validateCreateProjectInput(projectInput);

	const resolvedTemplateId = await resolveTemplateId({
		templateId,
		yes,
		isInteractive,
		selectTemplate,
	});
	const resolvedProfile = resolveCreateProfileId(profile);
	validateCreateFlagContract({
		alternateRenderTargets,
		dataStorageMode,
		innerBlocksPreset,
		persistencePolicy,
		templateId: resolvedTemplateId,
		variant,
	});
	const resolvedInnerBlocksPreset =
		parseCompoundInnerBlocksPreset(innerBlocksPreset);
	const resolvedExternalLayerSelection =
		isBuiltInTemplateId(resolvedTemplateId) && isInteractive
			? await resolveOptionalInteractiveExternalLayerId({
					callerCwd: cwd,
					externalLayerId: normalizedExternalLayerId,
					externalLayerSource: normalizedExternalLayerSource,
					selectExternalLayerId,
				})
			: {
					externalLayerId: normalizedExternalLayerId,
					externalLayerSource: normalizedExternalLayerSource,
				};
	try {
		const shouldResolvePersistence = templateUsesPersistenceSettings(resolvedTemplateId, {
			dataStorageMode,
			persistencePolicy,
		});
		const resolvedDataStorage = await resolveOptionalSelection({
			allowedValues: DATA_STORAGE_MODES,
			defaultValue: "custom-table",
			explicitValue: dataStorageMode,
			isInteractive,
			isValue: isDataStorageMode,
			label: "data storage mode",
			select: selectDataStorage,
			shouldResolve: shouldResolvePersistence,
			yes,
		});
		const resolvedPersistencePolicy = await resolveOptionalSelection({
			allowedValues: PERSISTENCE_POLICIES,
			defaultValue: "authenticated",
			explicitValue: persistencePolicy,
			isInteractive,
			isValue: isPersistencePolicy,
			label: "persistence policy",
			select: selectPersistencePolicy,
			shouldResolve: shouldResolvePersistence,
			yes,
		});
		const resolvedPackageManager = await resolvePackageManagerId({
			packageManager,
			yes,
			isInteractive,
			selectPackageManager,
		});
		const resolvedWpVersion = resolveScaffoldWordPressTargetVersion(wpVersion);
		const resolvedWithWpEnv =
			resolvedProfile === "plugin-qa"
				? true
				: await resolveOptionalBooleanFlag({
						explicitValue: withWpEnv,
						isInteractive,
						select: selectWithWpEnv,
						yes,
					});
		const resolvedWithTestPreset = await resolveOptionalBooleanFlag({
			explicitValue: withTestPreset,
			isInteractive,
			select: selectWithTestPreset,
			yes,
		});
		const resolvedWithMigrationUi = await resolveOptionalBooleanFlag({
			disabled:
				!isBuiltInTemplateId(resolvedTemplateId) &&
				resolvedTemplateId !== OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE,
			explicitValue: withMigrationUi,
			isInteractive,
			select: selectWithMigrationUi,
			yes,
		});
		const projectDir = path.resolve(cwd, projectInput);
		const projectName = path.basename(projectDir);
		const answers = await collectScaffoldAnswers({
			dataStorageMode: resolvedDataStorage,
			namespace,
			persistencePolicy: resolvedPersistencePolicy,
			phpPrefix,
			projectName,
			queryPostType,
			templateId: resolvedTemplateId,
			textDomain,
			yes,
			promptText,
		});
		if (resolvedTemplateId === "compound" && resolvedInnerBlocksPreset) {
			answers.compoundInnerBlocksPreset = resolvedInnerBlocksPreset;
		}

		const emissionOptions = {
			allowExistingDir,
			alternateRenderTargets,
			answers,
			cwd,
			dataStorageMode: resolvedDataStorage,
			externalLayerId: resolvedExternalLayerSelection.externalLayerId,
			externalLayerSource:
				resolvedExternalLayerSelection.externalLayerSource,
			externalLayerSourceLabel: normalizedExternalLayerSource,
			installDependencies,
			noInstall,
			onProgress,
			packageManager: resolvedPackageManager,
			persistencePolicy: resolvedPersistencePolicy,
			profile: resolvedProfile,
			projectDir,
			templateId: resolvedTemplateId,
			variant,
			withMigrationUi: resolvedWithMigrationUi,
			withTestPreset: resolvedWithTestPreset,
			withWpEnv: resolvedWithWpEnv,
			wpVersion: resolvedWpVersion,
		} satisfies ScaffoldEmissionOptions;
		const resolvedResult = dryRun
			? await buildScaffoldDryRunPlan(emissionOptions)
			: {
					plan: undefined,
					result: await emitScaffoldProject(emissionOptions),
				};
		const availableScripts = dryRun
			? undefined
			: await readGeneratedPackageScripts(projectDir);

		return {
			dryRun,
			optionalOnboarding: getOptionalOnboarding({
				availableScripts,
				packageManager: resolvedPackageManager,
				templateId: resolvedTemplateId,
				compoundPersistenceEnabled: isCompoundPersistenceEnabled(
					resolvedResult.result.variables,
				),
			}),
			plan: resolvedResult.plan,
			projectDir,
			projectInput,
			packageManager: resolvedPackageManager,
			nextSteps: getNextSteps({
				projectInput,
				projectDir,
				packageManager: resolvedPackageManager,
				noInstall,
				templateId: resolvedTemplateId,
			}),
			result: {
				...resolvedResult.result,
				warnings: [
					...resolvedResult.result.warnings,
					...collectTemplateCapabilityWarnings({
						queryPostType,
						templateId: resolvedTemplateId,
						withMigrationUi,
					}),
					...collectProjectDirectoryWarnings(projectDir),
				],
			},
		};
	} finally {
		await resolvedExternalLayerSelection.cleanup?.();
	}
}
