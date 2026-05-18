import fs from "node:fs";
import path from "node:path";

import {
	EDITOR_PLUGIN_SLOT_IDS,
	resolveEditorPluginSlotAlias,
} from "../add/cli-add-shared.js";
import {
	checkExistingFiles,
	createDoctorCheck,
	resolveWorkspaceBootstrapPath,
	WORKSPACE_EDITOR_PLUGIN_EDITOR_ASSET,
	WORKSPACE_EDITOR_PLUGIN_EDITOR_SCRIPT,
	WORKSPACE_EDITOR_PLUGIN_EDITOR_STYLE,
} from "./cli-doctor-workspace-shared.js";
import { escapeRegex } from "../shared/php-utils.js";

import type { DoctorCheck } from "./cli-doctor.js";
import type { WorkspaceInventory } from "../workspace/workspace-inventory.js";
import type { WorkspaceProject } from "../workspace/workspace-project.js";

function getWorkspaceEditorPluginRequiredFiles(
	editorPlugin: WorkspaceInventory["editorPlugins"][number],
): string[] {
	const editorPluginDir = path.join("src", "editor-plugins", editorPlugin.slug);
	const surfaceFile =
		editorPlugin.slot === "PluginSidebar"
			? path.join(editorPluginDir, "Sidebar.tsx")
			: path.join(editorPluginDir, "Surface.tsx");

	return Array.from(
		new Set([
			editorPlugin.file,
			surfaceFile,
			path.join(editorPluginDir, "data.ts"),
			path.join(editorPluginDir, "types.ts"),
			path.join(editorPluginDir, "style.scss"),
		]),
	);
}

function checkWorkspaceEditorPluginConfig(
	editorPlugin: WorkspaceInventory["editorPlugins"][number],
): DoctorCheck {
	const normalizedSlot = resolveEditorPluginSlotAlias(editorPlugin.slot);
	const isValidSlot = Boolean(normalizedSlot);

	return createDoctorCheck(
		`Editor plugin config ${editorPlugin.slug}`,
		isValidSlot ? "pass" : "fail",
		isValidSlot
			? `Editor plugin slot ${editorPlugin.slot} is supported as ${normalizedSlot}`
			: `Unsupported editor plugin slot "${editorPlugin.slot}". Expected one of: ${EDITOR_PLUGIN_SLOT_IDS.join(", ")} or legacy aliases PluginSidebar, PluginDocumentSettingPanel.`,
	);
}

function checkWorkspaceEditorPluginBootstrap(
	projectDir: string,
	packageName: string,
	phpPrefix: string,
): DoctorCheck {
	const bootstrapPath = resolveWorkspaceBootstrapPath(projectDir, packageName);
	if (!fs.existsSync(bootstrapPath)) {
		return createDoctorCheck(
			"Editor plugin bootstrap",
			"fail",
			`Missing ${path.basename(bootstrapPath)}`,
		);
	}

	const source = fs.readFileSync(bootstrapPath, "utf8");
	const enqueueFunctionName = `${phpPrefix}_enqueue_editor_plugins_editor`;
	const enqueueHook = `add_action( 'enqueue_block_editor_assets', '${enqueueFunctionName}' );`;
	const hasEditorEnqueueHook = source.includes(enqueueHook);
	const hasEditorScript = source.includes(WORKSPACE_EDITOR_PLUGIN_EDITOR_SCRIPT);
	const hasEditorAsset = source.includes(WORKSPACE_EDITOR_PLUGIN_EDITOR_ASSET);
	const hasEditorStyle = source.includes(WORKSPACE_EDITOR_PLUGIN_EDITOR_STYLE);

	return createDoctorCheck(
		"Editor plugin bootstrap",
		hasEditorEnqueueHook && hasEditorScript && hasEditorAsset && hasEditorStyle ? "pass" : "fail",
		hasEditorEnqueueHook && hasEditorScript && hasEditorAsset && hasEditorStyle
			? "Editor plugin enqueue hook is present"
			: "Missing editor plugin enqueue hook or build/editor-plugins script/style asset references",
	);
}

function checkWorkspaceEditorPluginIndex(
	projectDir: string,
	editorPlugins: WorkspaceInventory["editorPlugins"],
): DoctorCheck {
	const indexRelativePath = [
		path.join("src", "editor-plugins", "index.ts"),
		path.join("src", "editor-plugins", "index.js"),
	].find((relativePath) => fs.existsSync(path.join(projectDir, relativePath)));

	if (!indexRelativePath) {
		return createDoctorCheck(
			"Editor plugins index",
			"fail",
			"Missing src/editor-plugins/index.ts or src/editor-plugins/index.js",
		);
	}

	const indexPath = path.join(projectDir, indexRelativePath);
	const source = fs.readFileSync(indexPath, "utf8");
	const missingImports = editorPlugins.filter((editorPlugin) => {
		const importPattern = new RegExp(
			`['"\`]\\./${escapeRegex(editorPlugin.slug)}(?:/[^'"\`]*)?['"\`]`,
			"u",
		);
		return !importPattern.test(source);
	});

	return createDoctorCheck(
		"Editor plugins index",
		missingImports.length === 0 ? "pass" : "fail",
		missingImports.length === 0
			? "Editor plugin registrations are aggregated"
			: `Missing editor plugin imports for: ${missingImports
					.map((entry) => entry.slug)
					.join(", ")}`,
	);
}

/**
 * Collect editor plugin workspace doctor checks while preserving existing row order.
 *
 * @param workspace Resolved workspace metadata and filesystem paths.
 * @param editorPlugins Editor plugin entries parsed from the workspace inventory.
 * @returns Ordered editor plugin doctor checks.
 */
export function getWorkspaceEditorPluginDoctorChecks(
	workspace: WorkspaceProject,
	editorPlugins: WorkspaceInventory["editorPlugins"],
): DoctorCheck[] {
	const checks: DoctorCheck[] = [];

	if (editorPlugins.length > 0) {
		checks.push(
			checkWorkspaceEditorPluginBootstrap(
				workspace.projectDir,
				workspace.packageName,
				workspace.workspace.phpPrefix,
			),
		);
		checks.push(checkWorkspaceEditorPluginIndex(workspace.projectDir, editorPlugins));
	}
	for (const editorPlugin of editorPlugins) {
		checks.push(
			checkExistingFiles(
				workspace.projectDir,
				`Editor plugin ${editorPlugin.slug}`,
				getWorkspaceEditorPluginRequiredFiles(editorPlugin),
			),
		);
		checks.push(checkWorkspaceEditorPluginConfig(editorPlugin));
	}

	return checks;
}
