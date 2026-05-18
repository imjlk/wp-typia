import {
	getWorkspaceBindingDoctorChecks,
} from "./cli-doctor-workspace-bindings.js";
import {
	getWorkspaceBlockDoctorChecks,
} from "./cli-doctor-workspace-blocks.js";
import {
	getWorkspaceFeatureDoctorChecks,
} from "./cli-doctor-workspace-features.js";
import {
	getMigrationWorkspaceHintCheck,
	getWorkspacePackageMetadataCheck,
	prepareWorkspacePackageDoctorSnapshot,
} from "./cli-doctor-workspace-package.js";
import {
	createDoctorCheck,
	createDoctorScopeCheck,
} from "./cli-doctor-workspace-shared.js";
import {
	readWorkspaceInventoryAsync,
	type WorkspaceInventory,
} from "../workspace/workspace-inventory.js";
import {
	getInvalidWorkspaceProjectReason,
	parseWorkspacePackageJson,
	tryResolveWorkspaceProject,
	type WorkspacePackageJson,
	type WorkspaceProject,
} from "../workspace/workspace-project.js";

import type { DoctorCheck } from "./cli-doctor.js";

function formatWorkspaceInventorySummary(inventory: WorkspaceInventory): string {
	return [
		`${inventory.blocks.length} block(s)`,
		`${inventory.variations.length} variation(s)`,
		`${inventory.blockStyles.length} block style(s)`,
		`${inventory.blockTransforms.length} block transform(s)`,
		`${inventory.patterns.length} pattern(s)`,
		`${inventory.bindingSources.length} binding source(s)`,
		`${inventory.restResources.length} REST resource(s)`,
		`${inventory.postMeta.length} post meta contract(s)`,
		`${inventory.abilities.length} ability scaffold(s)`,
		`${inventory.aiFeatures.length} AI feature(s)`,
		`${inventory.editorPlugins.length} editor plugin(s)`,
		`${inventory.adminViews.length} admin view(s)`,
	].join(", ");
}

/**
 * Collect workspace-scoped doctor checks for the given working directory.
 *
 * When the directory is not an official workspace, the function returns a
 * "Doctor scope" row explaining that only environment checks ran, plus a
 * failing workspace metadata row when a nearby candidate workspace is invalid.
 * When workspace resolution or metadata parsing throws, the corresponding
 * failing rows are returned early and the remaining checks are skipped.
 * When an official workspace is detected, a passing "Doctor scope" row is
 * emitted first so the remaining package metadata, inventory, source-tree
 * drift, and optional migration hint rows are clearly framed as workspace
 * diagnostics for that run.
 *
 * @param cwd Working directory expected to host an official workspace.
 * @returns Ordered workspace check rows ready for CLI rendering.
 */
export async function getWorkspaceDoctorChecks(cwd: string): Promise<DoctorCheck[]> {
	const checks: DoctorCheck[] = [];

	let workspace: WorkspaceProject | null = null;
	let invalidWorkspaceReason: string | null = null;
	try {
		// Workspace discovery and package parsing intentionally stay synchronous
		// because they share compatibility helpers with sync add/migration callers.
		invalidWorkspaceReason = getInvalidWorkspaceProjectReason(cwd);
		workspace = tryResolveWorkspaceProject(cwd);
	} catch (error) {
		checks.push(
			createDoctorScopeCheck(
				"fail",
				"Scope: blocked before workspace checks. Environment checks ran, but workspace discovery could not continue. Fix the nearby workspace package metadata and rerun `wp-typia doctor`.",
			),
		);
		checks.push(
			createDoctorCheck(
				"Workspace package metadata",
				"fail",
				error instanceof Error ? error.message : String(error),
			),
		);
		return checks;
	}
	if (!workspace) {
		if (invalidWorkspaceReason) {
			checks.push(
				createDoctorScopeCheck(
					"fail",
					"Scope: blocked before workspace checks. Environment checks ran, but workspace diagnostics could not continue because a nearby wp-typia workspace candidate is invalid. Fix the workspace package metadata and rerun `wp-typia doctor`.",
				),
			);
			checks.push(
				createDoctorCheck(
					"Workspace package metadata",
					"fail",
					invalidWorkspaceReason,
				),
			);
		} else {
			checks.push(
				createDoctorScopeCheck(
					"pass",
					"Scope: environment-only. No official wp-typia workspace root was detected, so this run only covered environment readiness. Re-run `wp-typia doctor` from a workspace root if you expected package metadata, inventory, or generated artifact checks.",
				),
			);
		}
		return checks;
	}

	checks.push(
		createDoctorScopeCheck(
			"pass",
			`Scope: full workspace diagnostics for ${workspace.workspace.namespace}. Environment readiness checks ran and workspace-scoped diagnostics are enabled for the package metadata, inventory, source-tree drift, and any configured migration hint rows below.`,
		),
	);

	let workspacePackageJson: WorkspacePackageJson;
	try {
		// Keep package metadata parsing sync until workspace-project exposes an
		// async companion; the surrounding doctor orchestration already awaits
		// async inventory reads below.
		workspacePackageJson = parseWorkspacePackageJson(workspace.projectDir);
	} catch (error) {
		checks.push(
			createDoctorCheck(
				"Workspace package metadata",
				"fail",
				error instanceof Error ? error.message : String(error),
			),
		);
		return checks;
	}

	const packageDoctorSnapshot = await prepareWorkspacePackageDoctorSnapshot(
		workspace,
		workspacePackageJson,
	);

	checks.push(
		getWorkspacePackageMetadataCheck(
			workspace,
			workspacePackageJson,
			packageDoctorSnapshot,
		),
	);

	try {
		const inventory = await readWorkspaceInventoryAsync(workspace.projectDir);
		checks.push(
			createDoctorCheck(
				"Workspace inventory",
				"pass",
				formatWorkspaceInventorySummary(inventory),
			),
		);
		// The highest-impact remaining probes live in block, binding, and feature
		// categories; keep them synchronous until broader path/content snapshots
		// can preserve their current row ordering and diagnostics.
		checks.push(...getWorkspaceBlockDoctorChecks(workspace, inventory));
		checks.push(...getWorkspaceBindingDoctorChecks(workspace, inventory));
		checks.push(...getWorkspaceFeatureDoctorChecks(workspace, inventory));

		const migrationWorkspaceCheck = getMigrationWorkspaceHintCheck(
			workspacePackageJson,
			packageDoctorSnapshot,
		);
		if (migrationWorkspaceCheck) {
			checks.push(migrationWorkspaceCheck);
		}
	} catch (error) {
		checks.push(
			createDoctorCheck(
				"Workspace inventory",
				"fail",
				error instanceof Error ? error.message : String(error),
			),
		);
	}

	return checks;
}
