import fs from "node:fs";
import path from "node:path";

import type { DoctorCheck } from "./cli-doctor.js";

/** Glob pattern for generated binding-source PHP entrypoints. */
export const WORKSPACE_BINDING_SERVER_GLOB = "/src/bindings/*/server.php";
/** Relative path to the generated binding editor bundle. */
export const WORKSPACE_BINDING_EDITOR_SCRIPT = "build/bindings/index.js";
/** Relative path to the generated binding asset manifest. */
export const WORKSPACE_BINDING_EDITOR_ASSET = "build/bindings/index.asset.php";
/** Glob pattern for generated REST resource PHP entrypoints. */
export const WORKSPACE_REST_RESOURCE_GLOB = "/inc/rest/*.php";
/** Glob pattern for generated post-meta PHP entrypoints. */
export const WORKSPACE_POST_META_GLOB = "/inc/post-meta/*.php";
/** Glob pattern for generated ability PHP entrypoints. */
export const WORKSPACE_ABILITY_GLOB = "/inc/abilities/*.php";
/** Relative path to the generated ability editor bundle. */
export const WORKSPACE_ABILITY_EDITOR_SCRIPT = "build/abilities/index.js";
/** Relative path to the generated ability asset manifest. */
export const WORKSPACE_ABILITY_EDITOR_ASSET = "build/abilities/index.asset.php";
/** Glob pattern for generated AI feature PHP entrypoints. */
export const WORKSPACE_AI_FEATURE_GLOB = "/inc/ai-features/*.php";
/** Glob pattern for generated admin view PHP entrypoints. */
export const WORKSPACE_ADMIN_VIEW_GLOB = "/inc/admin-views/*.php";
/** Relative path to the generated admin view editor bundle. */
export const WORKSPACE_ADMIN_VIEW_SCRIPT = "build/admin-views/index.js";
/** Relative path to the generated admin view asset manifest. */
export const WORKSPACE_ADMIN_VIEW_ASSET = "build/admin-views/index.asset.php";
/** Relative path to the generated admin view stylesheet. */
export const WORKSPACE_ADMIN_VIEW_STYLE = "build/admin-views/style-index.css";
/** Relative path to the generated editor plugin bundle. */
export const WORKSPACE_EDITOR_PLUGIN_EDITOR_SCRIPT = "build/editor-plugins/index.js";
/** Relative path to the generated editor plugin asset manifest. */
export const WORKSPACE_EDITOR_PLUGIN_EDITOR_ASSET = "build/editor-plugins/index.asset.php";
/** Relative path to the generated editor plugin stylesheet. */
export const WORKSPACE_EDITOR_PLUGIN_EDITOR_STYLE = "build/editor-plugins/style-index.css";
/** Canonical generated artifact filenames expected in each workspace block directory. */
export const WORKSPACE_GENERATED_BLOCK_ARTIFACTS = [
	"block.json",
	"typia.manifest.json",
	"typia.schema.json",
	"typia-validator.php",
	"typia.openapi.json",
] as const;
/** Pattern for full block names in `namespace/slug` format. */
export const WORKSPACE_FULL_BLOCK_NAME_PATTERN = /^[a-z0-9-]+\/[a-z0-9-]+$/u;

/**
 * Create a doctor result row with an optional stable diagnostic code.
 *
 * @param label Human-readable doctor row label.
 * @param status Pass, warn, or fail status for the row.
 * @param detail Detailed remediation or success text for CLI output.
 * @param code Optional stable machine-readable diagnostic code.
 * @returns A normalized `DoctorCheck` object for CLI rendering.
 */
export function createDoctorCheck(
	label: string,
	status: DoctorCheck["status"],
	detail: string,
	code?: string,
): DoctorCheck {
	return code ? { code, detail, label, status } : { detail, label, status };
}

/**
 * Create the standard workspace-doctor scope row.
 *
 * @param status Pass or fail scope status for the doctor run.
 * @param detail Scope summary describing what diagnostics ran.
 * @returns A `DoctorCheck` row labelled `Doctor scope`.
 */
export function createDoctorScopeCheck(
	status: DoctorCheck["status"],
	detail: string,
): DoctorCheck {
	return createDoctorCheck("Doctor scope", status, detail);
}

/**
 * Resolve the expected workspace bootstrap file from a package name.
 *
 * @param packageName Package name used to derive the plugin bootstrap basename.
 * @returns Relative PHP bootstrap filename for the workspace root.
 */
export function getWorkspaceBootstrapRelativePath(packageName: string): string {
	return `${packageName.split("/").pop() ?? packageName}.php`;
}

/**
 * Resolve the expected workspace bootstrap file inside a project root.
 *
 * @param projectDir Absolute workspace root directory.
 * @param packageName Package name used to derive the plugin bootstrap basename.
 * @returns Absolute PHP bootstrap file path for the workspace root.
 */
export function resolveWorkspaceBootstrapPath(
	projectDir: string,
	packageName: string,
): string {
	return path.join(projectDir, getWorkspaceBootstrapRelativePath(packageName));
}

/**
 * Verify that every referenced relative file exists inside a workspace.
 *
 * @param projectDir Absolute workspace root directory.
 * @param label Doctor row label for the file set being checked.
 * @param filePaths Relative file paths to validate.
 * @returns A passing or failing `DoctorCheck` describing any missing files.
 */
export function checkExistingFiles(
	projectDir: string,
	label: string,
	filePaths: Array<string | undefined>,
): DoctorCheck {
	// Workspace category collectors remain synchronous pure mappers after the
	// async inventory snapshot is loaded, so these small existence probes stay
	// sync to preserve their current non-Promise APIs and output ordering.
	const missing = filePaths
		.filter((filePath): filePath is string => typeof filePath === "string")
		.filter((filePath) => !fs.existsSync(path.join(projectDir, filePath)));
	return createDoctorCheck(
		label,
		missing.length === 0 ? "pass" : "fail",
		missing.length === 0 ? "All referenced files exist" : `Missing: ${missing.join(", ")}`,
	);
}
