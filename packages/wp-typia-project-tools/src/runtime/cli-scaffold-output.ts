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

export interface ScaffoldNextStepsOptions {
	noInstall: boolean;
	packageManager: PackageManagerId;
	projectDir: string;
	projectInput: string;
	templateId: string;
}

export interface ScaffoldOptionalOnboardingOptions {
	availableScripts?: string[];
	packageManager: PackageManagerId;
	templateId: string;
	compoundPersistenceEnabled?: boolean;
}

export interface OptionalOnboardingGuidance {
	note: string;
	shortNote: string;
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
