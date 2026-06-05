import fs from "node:fs";
import path from "node:path";

import { parseScaffoldBlockMetadata } from "@wp-typia/block-runtime/blocks";
import ts from "typescript";

import {
	createDoctorCheck,
	resolveWorkspaceBootstrapPath,
} from "./cli-doctor-workspace-shared.js";
import { readJsonFileSync } from "../shared/json-utils.js";
import { getPropertyNameText } from "../shared/ts-property-names.js";
import {
	compareVersionFloors,
	pickHigherVersionFloor,
} from "../shared/version-floor.js";
import { DEFAULT_SCAFFOLD_WORDPRESS_TARGET_VERSION } from "../templates/scaffold-compatibility.js";

import type { DoctorCheck } from "./cli-doctor.js";
import type { WorkspaceInventory } from "../workspace/workspace-inventory.js";
import type { WorkspaceProject } from "../workspace/workspace-project.js";

/** Options for opt-in WordPress version compatibility doctor checks. */
export interface WorkspaceWordPressVersionDoctorCheckOptions {
	/** WordPress target used for `Tested up to` warnings. Defaults to the scaffold target. */
	targetVersion?: string;
}

interface WordPressVersionRequirement {
	label: string;
	version: string;
}

interface WordPressVersionRequirementCollection {
	issues: string[];
	requirements: WordPressVersionRequirement[];
}

interface BootstrapHeaderVersionSnapshot {
	requiresAtLeast?: string;
	testedUpTo?: string;
}

const WORDPRESS_VERSION_CHECK_CODES = {
	featureMinimum: "wp-typia.workspace.wordpress.feature-minimum",
	testedTarget: "wp-typia.workspace.wordpress.tested-target",
} as const;

const BLOCK_METADATA_WORDPRESS_FLOORS = {
	blockHooks: "6.4",
	supportsInteractivity: "6.5",
	supportsSplitting: "6.5",
} as const;

function isEnabledMetadataValue(value: unknown): boolean {
	return value !== undefined && value !== false && value !== null;
}

function getBootstrapHeaderValue(
	source: string,
	headerName: "Requires at least" | "Tested up to",
): string | undefined {
	const escapedHeaderName = headerName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
	const pattern = new RegExp(
		`^\\s*\\*\\s*${escapedHeaderName}:\\s*([^\\r\\n]*)`,
		"mu",
	);
	const match = pattern.exec(source);
	return match?.[1]?.trim();
}

function readBootstrapHeaderVersions(
	workspace: WorkspaceProject,
): BootstrapHeaderVersionSnapshot {
	const bootstrapPath = resolveWorkspaceBootstrapPath(
		workspace.projectDir,
		workspace.packageName,
	);
	if (!fs.existsSync(bootstrapPath)) {
		return {};
	}

	const source = fs.readFileSync(bootstrapPath, "utf8");
	return {
		requiresAtLeast: getBootstrapHeaderValue(source, "Requires at least"),
		testedUpTo: getBootstrapHeaderValue(source, "Tested up to"),
	};
}

function pushRequirement(
	requirements: WordPressVersionRequirement[],
	label: string,
	version: string,
): void {
	requirements.push({
		label,
		version,
	});
}

function collectBlockMetadataRequirements(
	workspace: WorkspaceProject,
	inventory: WorkspaceInventory,
): WordPressVersionRequirementCollection {
	const issues: string[] = [];
	const requirements: WordPressVersionRequirement[] = [];

	for (const block of inventory.blocks) {
		const blockJsonRelativePath = path.join(
			"src",
			"blocks",
			block.slug,
			"block.json",
		);
		const blockJsonPath = path.join(workspace.projectDir, blockJsonRelativePath);
		if (!fs.existsSync(blockJsonPath)) {
			continue;
		}

		let blockJson: Record<string, unknown> & {
			blockHooks?: unknown;
			supports?: Record<string, unknown>;
		};
		try {
			blockJson = parseScaffoldBlockMetadata<
				Record<string, unknown> & {
					blockHooks?: unknown;
					supports?: Record<string, unknown>;
				}
			>(
				readJsonFileSync(blockJsonPath, {
					context: "workspace block metadata",
				}),
			);
		} catch (error) {
			issues.push(
				`${blockJsonRelativePath}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			continue;
		}

		if (isEnabledMetadataValue(blockJson.supports?.interactivity)) {
			pushRequirement(
				requirements,
				`Block ${block.slug} supports.interactivity`,
				BLOCK_METADATA_WORDPRESS_FLOORS.supportsInteractivity,
			);
		}
		if (isEnabledMetadataValue(blockJson.supports?.splitting)) {
			pushRequirement(
				requirements,
				`Block ${block.slug} supports.splitting`,
				BLOCK_METADATA_WORDPRESS_FLOORS.supportsSplitting,
			);
		}
		if (blockJson.blockHooks !== undefined) {
			pushRequirement(
				requirements,
				`Block ${block.slug} blockHooks`,
				BLOCK_METADATA_WORDPRESS_FLOORS.blockHooks,
			);
		}
	}

	return {
		issues,
		requirements,
	};
}

function findExportedArrayLiteral(
	sourceFile: ts.SourceFile,
	exportName: string,
): ts.ArrayLiteralExpression | null {
	for (const statement of sourceFile.statements) {
		if (
			!ts.isVariableStatement(statement) ||
			!statement.modifiers?.some(
				(modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
			)
		) {
			continue;
		}

		for (const declaration of statement.declarationList.declarations) {
			if (
				ts.isIdentifier(declaration.name) &&
				declaration.name.text === exportName &&
				declaration.initializer &&
				ts.isArrayLiteralExpression(declaration.initializer)
			) {
				return declaration.initializer;
			}
		}
	}

	return null;
}

function getObjectProperty(
	objectLiteral: ts.ObjectLiteralExpression,
	key: string,
): ts.Expression | undefined {
	for (const property of objectLiteral.properties) {
		if (!ts.isPropertyAssignment(property)) {
			continue;
		}
		if (getPropertyNameText(property.name) === key) {
			return property.initializer;
		}
	}

	return undefined;
}

function getObjectLiteralProperty(
	objectLiteral: ts.ObjectLiteralExpression | undefined,
	key: string,
): ts.ObjectLiteralExpression | undefined {
	const property = objectLiteral ? getObjectProperty(objectLiteral, key) : undefined;
	return property && ts.isObjectLiteralExpression(property) ? property : undefined;
}

function getStringLiteralProperty(
	objectLiteral: ts.ObjectLiteralExpression,
	key: string,
): string | undefined {
	const property = getObjectProperty(objectLiteral, key);
	return property && ts.isStringLiteralLike(property) ? property.text : undefined;
}

function collectInventoryCompatibilityRequirements(
	inventory: WorkspaceInventory,
): WordPressVersionRequirementCollection {
	const issues: string[] = [];
	const requirements: WordPressVersionRequirement[] = [];
	const sourceFile = ts.createSourceFile(
		"scripts/block-config.ts",
		inventory.source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);

	for (const section of [
		{ exportName: "ABILITIES", label: "Ability" },
		{ exportName: "AI_FEATURES", label: "AI feature" },
	] as const) {
		const arrayLiteral = findExportedArrayLiteral(sourceFile, section.exportName);
		if (!arrayLiteral) {
			continue;
		}

		arrayLiteral.elements.forEach((element, elementIndex) => {
			if (!ts.isObjectLiteralExpression(element)) {
				return;
			}
			const slug =
				getStringLiteralProperty(element, "slug") ?? `entry ${elementIndex + 1}`;
			const compatibility = getObjectLiteralProperty(element, "compatibility");
			const hardMinimums = getObjectLiteralProperty(
				compatibility,
				"hardMinimums",
			);
			const wordpressMinimum = hardMinimums
				? getObjectProperty(hardMinimums, "wordpress")
				: undefined;
			if (wordpressMinimum === undefined) {
				return;
			}
			if (!ts.isStringLiteralLike(wordpressMinimum)) {
				issues.push(
					`${section.exportName}[${elementIndex}].compatibility.hardMinimums.wordpress must be a string literal.`,
				);
				return;
			}

			requirements.push({
				label: `${section.label} ${slug} compatibility metadata`,
				version: wordpressMinimum.text,
			});
		});
	}

	return {
		issues,
		requirements,
	};
}

function collectWordPressVersionRequirements(
	workspace: WorkspaceProject,
	inventory: WorkspaceInventory,
): WordPressVersionRequirementCollection {
	const blockRequirements = collectBlockMetadataRequirements(workspace, inventory);
	const inventoryRequirements =
		collectInventoryCompatibilityRequirements(inventory);

	return {
		issues: [...blockRequirements.issues, ...inventoryRequirements.issues],
		requirements: [
			...blockRequirements.requirements,
			...inventoryRequirements.requirements,
		],
	};
}

function pickHighestRequirementFloor(
	requirements: readonly WordPressVersionRequirement[],
	issues: string[],
): string | undefined {
	let highest: string | undefined;
	for (const requirement of requirements) {
		try {
			highest = pickHigherVersionFloor(highest, requirement.version);
		} catch {
			issues.push(
				`${requirement.label} declares invalid WordPress version floor "${requirement.version}".`,
			);
		}
	}

	return highest;
}

function formatRequirementSummary(
	requirements: readonly WordPressVersionRequirement[],
	floor: string,
): string {
	const labels = requirements
		.filter((requirement) => requirement.version === floor)
		.map((requirement) => requirement.label);

	return labels.length > 0 ? labels.join(", ") : "generated workspace features";
}

function createFeatureMinimumCheck(
	workspace: WorkspaceProject,
	inventory: WorkspaceInventory,
	headers: BootstrapHeaderVersionSnapshot,
): DoctorCheck {
	const { issues, requirements } = collectWordPressVersionRequirements(
		workspace,
		inventory,
	);
	const highestFloor = pickHighestRequirementFloor(requirements, issues);

	if (issues.length > 0) {
		return createDoctorCheck(
			"WordPress feature minimum",
			"fail",
			issues.join("; "),
			WORDPRESS_VERSION_CHECK_CODES.featureMinimum,
		);
	}

	if (!highestFloor) {
		return createDoctorCheck(
			"WordPress feature minimum",
			"pass",
			"No generated workspace features declare an additional WordPress hard floor.",
			WORDPRESS_VERSION_CHECK_CODES.featureMinimum,
		);
	}

	if (!headers.requiresAtLeast) {
		return createDoctorCheck(
			"WordPress feature minimum",
			"fail",
			`Plugin bootstrap is missing a Requires at least header but generated features require WordPress ${highestFloor}.`,
			WORDPRESS_VERSION_CHECK_CODES.featureMinimum,
		);
	}

	try {
		if (compareVersionFloors(headers.requiresAtLeast, highestFloor) < 0) {
			return createDoctorCheck(
				"WordPress feature minimum",
				"fail",
				`Requires at least ${headers.requiresAtLeast} is below generated feature floor ${highestFloor} (${formatRequirementSummary(
					requirements,
					highestFloor,
				)}).`,
				WORDPRESS_VERSION_CHECK_CODES.featureMinimum,
			);
		}
	} catch {
		return createDoctorCheck(
			"WordPress feature minimum",
			"fail",
			`Plugin bootstrap Requires at least header "${headers.requiresAtLeast}" is not a dotted numeric version.`,
			WORDPRESS_VERSION_CHECK_CODES.featureMinimum,
		);
	}

	return createDoctorCheck(
		"WordPress feature minimum",
		"pass",
		`Requires at least ${headers.requiresAtLeast} covers generated feature floor ${highestFloor} (${formatRequirementSummary(
			requirements,
			highestFloor,
		)}).`,
		WORDPRESS_VERSION_CHECK_CODES.featureMinimum,
	);
}

function createTestedTargetCheck(
	headers: BootstrapHeaderVersionSnapshot,
	targetVersion: string,
): DoctorCheck {
	if (!headers.testedUpTo) {
		return createDoctorCheck(
			"WordPress tested target",
			"fail",
			`Plugin bootstrap is missing a Tested up to header; expected ${targetVersion} or newer.`,
			WORDPRESS_VERSION_CHECK_CODES.testedTarget,
		);
	}

	try {
		if (compareVersionFloors(headers.testedUpTo, targetVersion) < 0) {
			return createDoctorCheck(
				"WordPress tested target",
				"warn",
				`Tested up to ${headers.testedUpTo} is below the selected WordPress target ${targetVersion}.`,
				WORDPRESS_VERSION_CHECK_CODES.testedTarget,
			);
		}
	} catch {
		return createDoctorCheck(
			"WordPress tested target",
			"fail",
			`Plugin bootstrap Tested up to header "${headers.testedUpTo}" is not a dotted numeric version.`,
			WORDPRESS_VERSION_CHECK_CODES.testedTarget,
		);
	}

	return createDoctorCheck(
		"WordPress tested target",
		"pass",
		`Tested up to ${headers.testedUpTo} covers the selected WordPress target ${targetVersion}.`,
		WORDPRESS_VERSION_CHECK_CODES.testedTarget,
	);
}

/**
 * Collect opt-in WordPress feature floor checks for an official workspace.
 *
 * These checks compare generated feature metadata against plugin bootstrap
 * headers without changing the default doctor output shape.
 */
export function getWorkspaceWordPressVersionDoctorChecks(
	workspace: WorkspaceProject,
	inventory: WorkspaceInventory,
	options: WorkspaceWordPressVersionDoctorCheckOptions = {},
): DoctorCheck[] {
	const targetVersion =
		options.targetVersion ?? DEFAULT_SCAFFOLD_WORDPRESS_TARGET_VERSION;
	const headers = readBootstrapHeaderVersions(workspace);

	return [
		createFeatureMinimumCheck(workspace, inventory, headers),
		createTestedTargetCheck(headers, targetVersion),
	];
}
