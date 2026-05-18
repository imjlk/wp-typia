import {
	formatAddDevDependenciesCommand,
	formatPackageExecCommand,
	formatRunScript,
	type PackageManagerId,
} from "../shared/package-managers.js";
import {
	buildRequiredDevDependencyMapEntries,
	getWpTypiaCliSpecifier,
} from "./cli-init-package-json.js";
import type {
	InitCommandMode,
	InitPlanLayoutKind,
	InitPlanStatus,
	RetrofitInitPlan,
} from "./cli-init-types.js";

export function buildInitPlanChangeSummary(
	changes: Pick<
		RetrofitInitPlan,
		"generatedArtifacts" | "packageChanges" | "plannedFiles"
	>,
	options: {
		includeGeneratedArtifacts: boolean;
	},
): string[] {
	const lines: string[] = [];

	for (const dependencyChange of changes.packageChanges.addDevDependencies) {
		lines.push(
			`devDependency ${dependencyChange.action} ${dependencyChange.name} -> ${dependencyChange.requiredValue}`,
		);
	}

	if (changes.packageChanges.packageManagerField) {
		lines.push(
			`packageManager ${changes.packageChanges.packageManagerField.action} -> ${changes.packageChanges.packageManagerField.requiredValue}`,
		);
	}

	for (const scriptChange of changes.packageChanges.scripts) {
		lines.push(
			`script ${scriptChange.action} ${scriptChange.name} -> ${scriptChange.requiredValue}`,
		);
	}

	for (const filePlan of changes.plannedFiles) {
		lines.push(`file ${filePlan.action} ${filePlan.path} (${filePlan.purpose})`);
	}

	if (options.includeGeneratedArtifacts) {
		for (const artifactPath of changes.generatedArtifacts) {
			lines.push(`generated artifact ${artifactPath}`);
		}
	}

	return lines;
}

export function buildInitPlanNextSteps(options: {
	commandMode: InitCommandMode;
	dependencyChangeCount: number;
	hasPlannedChanges: boolean;
	layoutKind: InitPlanLayoutKind;
	packageManager: PackageManagerId;
}): string[] {
	const cliSpecifier = getWpTypiaCliSpecifier();
	const syncTypesRun = formatRunScript(options.packageManager, "sync-types");
	const syncRun = formatRunScript(options.packageManager, "sync");
	const doctorRun = formatPackageExecCommand(
		options.packageManager,
		cliSpecifier,
		"doctor",
	);
	const migrationInitRun = formatPackageExecCommand(
		options.packageManager,
		cliSpecifier,
		"migrate init --current-migration-version v1",
	);
	const dependencyInstallCommand = formatAddDevDependenciesCommand(
		options.packageManager,
		buildRequiredDevDependencyMapEntries(),
	);

	if (options.layoutKind === "unsupported") {
		return [
			"Align the project to one of the supported retrofit layouts listed below, then rerun `wp-typia init`.",
			dependencyInstallCommand,
			syncTypesRun,
			doctorRun,
		];
	}

	if (options.commandMode === "apply") {
		return [
			...(options.dependencyChangeCount > 0
				? [
						"Install or reinstall project dependencies so the retrofit sync scripts and metadata generators are available locally.",
						dependencyInstallCommand,
				  ]
				: []),
			syncRun,
			doctorRun,
			`Optional migration bootstrap: ${migrationInitRun}`,
		];
	}

	return [
		...(options.hasPlannedChanges
			? [
					"Re-run `wp-typia init --apply` to write the planned package.json changes and helper files automatically.",
					...(options.dependencyChangeCount > 0 ? [dependencyInstallCommand] : []),
			  ]
			: []),
		syncRun,
		doctorRun,
		`Optional migration bootstrap: ${migrationInitRun}`,
	];
}

export function buildRetrofitPlanSummary(options: {
	commandMode: InitCommandMode;
	status: InitPlanStatus;
}): string {
	if (options.status === "already-initialized") {
		return options.commandMode === "apply"
			? "This project already exposes the minimum wp-typia retrofit surface. No files were changed."
			: "This project already exposes the minimum wp-typia retrofit surface.";
	}

	if (options.commandMode === "apply") {
		return "Applied the minimum wp-typia retrofit surface so package.json and helper scripts are ready for the next install and sync run.";
	}

	return "This command previews the minimum wp-typia adoption layer for the current project without rewriting it into a full scaffold.";
}
