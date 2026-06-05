import path from "node:path";

import {
	assertDryRunTargetDirectoryReady,
	listRelativeProjectFiles,
} from "./cli-scaffold-files.js";
import { scaffoldProject } from "./scaffold.js";
import { createManagedTempRoot } from "../shared/temp-roots.js";
import type { PackageManagerId } from "../shared/package-managers.js";
import type { ScaffoldProgressEvent } from "./scaffold.js";

type ScaffoldProjectOptions = Parameters<typeof scaffoldProject>[0];

/**
 * Dependency installation hook accepted by scaffold emission.
 */
export type ScaffoldInstallDependencies =
	ScaffoldProjectOptions["installDependencies"];

/**
 * Dry-run metadata returned after rendering a scaffold into a preview directory.
 */
export interface ScaffoldDryRunPlan {
	/**
	 * Whether dependency installation would run or is skipped by --no-install.
	 */
	dependencyInstall: "skipped-by-flag" | "would-install";
	/**
	 * Sorted project-relative paths that would be written by the scaffold.
	 */
	files: string[];
}

/**
 * Normalized scaffold emission options shared by real and dry-run flows.
 */
export interface ScaffoldEmissionOptions {
	/**
	 * Whether an existing target directory may be reused.
	 */
	allowExistingDir: boolean;
	/**
	 * Optional alternate render target specification for supported templates.
	 */
	alternateRenderTargets?: ScaffoldProjectOptions["alternateRenderTargets"];
	/**
	 * Resolved scaffold answers used by template variable generation.
	 */
	answers: ScaffoldProjectOptions["answers"];
	/**
	 * Caller working directory used to resolve relative template inputs.
	 */
	cwd: string;
	/**
	 * Persistence storage mode for templates that support storage options.
	 */
	dataStorageMode?: ScaffoldProjectOptions["dataStorageMode"];
	/**
	 * Optional public root id selected from an external layer package.
	 */
	externalLayerId?: string;
	/**
	 * Optional external layer source package, path, or locator.
	 */
	externalLayerSource?: string;
	/**
	 * Display label for the external layer source before path resolution.
	 */
	externalLayerSourceLabel?: string;
	/**
	 * Optional dependency installer override used by tests and callers.
	 */
	installDependencies?: ScaffoldProjectOptions["installDependencies"];
	/**
	 * Whether generated projects should skip dependency installation.
	 */
	noInstall: boolean;
	/**
	 * Optional callback for scaffold progress events.
	 */
	onProgress?: ((event: ScaffoldProgressEvent) => void | Promise<void>) | undefined;
	/**
	 * Package manager used for generated metadata and follow-up commands.
	 */
	packageManager: PackageManagerId;
	/**
	 * Persistence access policy for templates that support server storage.
	 */
	persistencePolicy?: ScaffoldProjectOptions["persistencePolicy"];
	/**
	 * Optional create profile that enables preset groups such as plugin QA.
	 */
	profile?: ScaffoldProjectOptions["profile"];
	/**
	 * Absolute target directory for the generated project.
	 */
	projectDir: string;
	/**
	 * Resolved template id or external template locator to render.
	 */
	templateId: string;
	/**
	 * Optional built-in or external template variant id.
	 */
	variant?: string;
	/**
	 * Whether migration UI support should be added when supported.
	 */
	withMigrationUi: boolean;
	/**
	 * Whether scaffold test presets should be emitted.
	 */
	withTestPreset: boolean;
	/**
	 * Whether local wp-env support should be emitted.
	 */
	withWpEnv: boolean;
	/**
	 * WordPress version target used for generated plugin Tested up to headers.
	 */
	wpVersion?: ScaffoldProjectOptions["wpVersion"];
}

/**
 * Emit scaffold files into the target project directory.
 *
 * @param options Normalized scaffold emission options.
 * @returns The scaffold result produced by the runtime renderer.
 */
export async function emitScaffoldProject(
	options: ScaffoldEmissionOptions,
): Promise<Awaited<ReturnType<typeof scaffoldProject>>> {
	return scaffoldProject(options);
}

/**
 * Build a dry-run scaffold plan without mutating the requested target directory.
 *
 * @param options Normalized scaffold emission options.
 * @returns Preview metadata and the scaffold result from the temp render.
 */
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
