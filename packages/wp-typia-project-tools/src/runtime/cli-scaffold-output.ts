import path from "node:path";

import {
	formatInstallCommand,
	formatRunScript,
} from "./package-managers.js";
import {
	getOptionalOnboardingNote,
	getOptionalOnboardingShortNote,
	getOptionalOnboardingSteps,
} from "./scaffold-onboarding.js";
import { getPrimaryDevelopmentScript } from "./local-dev-presets.js";
import type { PackageManagerId } from "./package-managers.js";

/**
 * Inputs used to build CLI next-step commands after scaffolding succeeds.
 */
export interface ScaffoldNextStepsOptions {
	/**
	 * Whether install instructions should be printed because install was skipped.
	 */
	noInstall: boolean;
	/**
	 * Package manager used to format install and run commands.
	 */
	packageManager: PackageManagerId;
	/**
	 * Absolute scaffold target directory.
	 */
	projectDir: string;
	/**
	 * Project path exactly as provided to the CLI.
	 */
	projectInput: string;
	/**
	 * Resolved template id used to choose the primary development script.
	 */
	templateId: string;
}

/**
 * Inputs used to compute optional onboarding guidance after scaffolding.
 */
export interface ScaffoldOptionalOnboardingOptions {
	/**
	 * Script names discovered from the generated package manifest.
	 */
	availableScripts?: string[];
	/**
	 * Package manager used to format optional commands.
	 */
	packageManager: PackageManagerId;
	/**
	 * Resolved template id used to select template-specific guidance.
	 */
	templateId: string;
	/**
	 * Whether compound persistence support is present in generated variables.
	 */
	compoundPersistenceEnabled?: boolean;
}

/**
 * User-facing optional onboarding copy and command list.
 */
export interface OptionalOnboardingGuidance {
	/**
	 * Full note shown in the detailed completion output.
	 */
	note: string;
	/**
	 * Short note shown in compact completion output.
	 */
	shortNote: string;
	/**
	 * Optional follow-up commands to show after next steps.
	 */
	steps: string[];
}

function quoteShellValue(value: string): string {
	if (
		!value.startsWith("-") &&
		/^[A-Za-z0-9._/@:-]+(?:\/[A-Za-z0-9._@:-]+)*$/.test(value)
	) {
		return value;
	}

	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * Build the printed next-step commands for a scaffolded project.
 *
 * @param options Project location and package-manager details used to format
 * next-step commands.
 * @returns Ordered shell commands shown after scaffolding succeeds.
 */
export function getNextSteps({
	projectInput,
	projectDir,
	packageManager,
	noInstall,
	templateId,
}: ScaffoldNextStepsOptions): string[] {
	const cdTarget = path.isAbsolute(projectInput) ? projectDir : projectInput;
	const steps = [`cd ${quoteShellValue(cdTarget)}`];

	if (noInstall) {
		steps.push(formatInstallCommand(packageManager));
	}

	steps.push(formatRunScript(packageManager, getPrimaryDevelopmentScript(templateId)));
	return steps;
}

/**
 * Compute optional onboarding guidance shown after scaffolding completes.
 *
 * @param options Package-manager and template context for optional guidance.
 * @returns Optional onboarding note and step list.
 */
export function getOptionalOnboarding({
	availableScripts,
	packageManager,
	templateId,
	compoundPersistenceEnabled = false,
}: ScaffoldOptionalOnboardingOptions): OptionalOnboardingGuidance {
	return {
		note: getOptionalOnboardingNote(packageManager, templateId, {
			availableScripts,
			compoundPersistenceEnabled,
		}),
		shortNote: getOptionalOnboardingShortNote(packageManager, templateId, {
			availableScripts,
			compoundPersistenceEnabled,
		}),
		steps: getOptionalOnboardingSteps(packageManager, templateId, {
			availableScripts,
			compoundPersistenceEnabled,
		}),
	};
}
