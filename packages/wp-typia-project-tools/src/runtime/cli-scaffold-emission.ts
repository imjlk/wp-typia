import path from "node:path";

import {
	assertDryRunTargetDirectoryReady,
	listRelativeProjectFiles,
} from "./cli-scaffold-files.js";
import { scaffoldProject } from "./scaffold.js";
import { createManagedTempRoot } from "./temp-roots.js";
import type { PackageManagerId } from "./package-managers.js";
import type { ScaffoldProgressEvent } from "./scaffold.js";

type ScaffoldProjectOptions = Parameters<typeof scaffoldProject>[0];

export type ScaffoldInstallDependencies =
	ScaffoldProjectOptions["installDependencies"];

export interface ScaffoldDryRunPlan {
	dependencyInstall: "skipped-by-flag" | "would-install";
	files: string[];
}

export interface ScaffoldEmissionOptions {
	allowExistingDir: boolean;
	alternateRenderTargets?: ScaffoldProjectOptions["alternateRenderTargets"];
	answers: ScaffoldProjectOptions["answers"];
	cwd: string;
	dataStorageMode?: ScaffoldProjectOptions["dataStorageMode"];
	externalLayerId?: string;
	externalLayerSource?: string;
	externalLayerSourceLabel?: string;
	installDependencies?: ScaffoldProjectOptions["installDependencies"];
	noInstall: boolean;
	onProgress?: ((event: ScaffoldProgressEvent) => void | Promise<void>) | undefined;
	packageManager: PackageManagerId;
	persistencePolicy?: ScaffoldProjectOptions["persistencePolicy"];
	profile?: ScaffoldProjectOptions["profile"];
	projectDir: string;
	templateId: string;
	variant?: string;
	withMigrationUi: boolean;
	withTestPreset: boolean;
	withWpEnv: boolean;
}

export async function emitScaffoldProject(
	options: ScaffoldEmissionOptions,
): Promise<Awaited<ReturnType<typeof scaffoldProject>>> {
	return scaffoldProject(options);
}

export async function buildScaffoldDryRunPlan(
	options: ScaffoldEmissionOptions,
): Promise<{
	plan: ScaffoldDryRunPlan;
	result: Awaited<ReturnType<typeof scaffoldProject>>;
}> {
	await assertDryRunTargetDirectoryReady(
		options.projectDir,
		options.allowExistingDir,
	);
	const { path: tempRoot, cleanup } = await createManagedTempRoot(
		"wp-typia-scaffold-plan-",
	);
	const previewProjectDir = path.join(tempRoot, "preview-project");

	try {
		const result = await emitScaffoldProject({
			...options,
			allowExistingDir: false,
			noInstall: true,
			projectDir: previewProjectDir,
		});
		const files = await listRelativeProjectFiles(previewProjectDir);

		return {
			plan: {
				dependencyInstall: options.noInstall
					? "skipped-by-flag"
					: "would-install",
				files,
			},
			result,
		};
	} finally {
		await cleanup();
	}
}
