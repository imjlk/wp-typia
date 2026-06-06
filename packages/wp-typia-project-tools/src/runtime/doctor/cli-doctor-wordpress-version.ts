import fs from "node:fs";
import path from "node:path";

import { parseScaffoldBlockMetadata } from "@wp-typia/block-runtime/blocks";
import { WORDPRESS_BLOCK_API_COMPATIBILITY } from "@wp-typia/block-types/blocks/compatibility";

import {
	createDoctorCheck,
	resolveWorkspaceBootstrapPath,
} from "./cli-doctor-workspace-shared.js";
import { readJsonFileSync } from "../shared/json-utils.js";
import { hasPhpFunctionCallWithStringArgumentPrefix } from "../shared/php-utils.js";
import {
	hasExecutablePattern,
	hasUncommentedPattern,
} from "../shared/ts-source-masking.js";
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

type BlockVariationCompatibilityMatrix =
	typeof WORDPRESS_BLOCK_API_COMPATIBILITY.blockVariations;

type BlockVariationBlockJsonFeature = {
	[Feature in keyof BlockVariationCompatibilityMatrix]: "block-json" extends BlockVariationCompatibilityMatrix[Feature]["runtime"][number]
		? Feature
		: never;
}[keyof BlockVariationCompatibilityMatrix];

// Both entries read the same `variations` field and are distinguished by value type.
const BLOCK_VARIATION_BLOCK_JSON_KEYS = {
	registrationBlockJsonMetadata: "variations",
	registrationMetadataFile: "variations",
} as const satisfies Record<BlockVariationBlockJsonFeature, string>;

const CORE_VARIATION_REGISTRY_IMPORT_PATTERN =
	/^\s*import\s*(?!type[\s{])\{[^}]+\}\s*from\s*["']\.\/[^"']+\/[^"']+\/[^"']+["']\s*;?\s*$/mu;
const REGISTER_BLOCK_VARIATION_CALL_PATTERN = /\bregisterBlockVariation\s*\(/u;
const REGISTER_WORKSPACE_CORE_VARIATIONS_CALL_PATTERN =
	/^\s*registerWorkspaceCoreVariations\s*\(\s*\)\s*;?\s*$/mu;
const GET_FIELDS_LIST_REGISTRATION_PATTERN =
	/\bgetFieldsList\s*(?:\(|:\s*(?:async\s*)?\()/u;
const SUPPORTED_ATTRIBUTES_FILTER_PREFIX =
	"block_bindings_supported_attributes_";

function isEnabledMetadataValue(value: unknown): boolean {
	return value !== undefined && value !== false && value !== null;
}

function assertNeverBlockVariationFeature(feature: never): never {
	throw new Error(`Unhandled block variation metadata feature "${String(feature)}".`);
}

function isEnabledBlockVariationMetadataFeature(
	feature: BlockVariationBlockJsonFeature,
	value: unknown,
): boolean {
	if (feature === "registrationBlockJsonMetadata") {
		return Array.isArray(value) && value.length > 0;
	}
	if (feature === "registrationMetadataFile") {
		return typeof value === "string" && value.trim().length > 0;
	}

	return assertNeverBlockVariationFeature(feature);
}

function getNestedMetadataValue(
	object: Record<string, unknown> | undefined,
	key: string,
): unknown {
	if (!object) {
		return undefined;
	}
	if (Object.prototype.hasOwnProperty.call(object, key)) {
		return object[key];
	}

	return key
		.split(".")
		.reduce<unknown>((current, segment) => {
			if (
				current === null ||
				typeof current !== "object" ||
				Array.isArray(current)
			) {
				return undefined;
			}

			const record = current as Record<string, unknown>;
			return Object.prototype.hasOwnProperty.call(record, segment)
				? record[segment]
				: undefined;
		}, object);
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

function pushBlockApiRequirement(
	requirements: WordPressVersionRequirement[],
	labelPrefix: string,
	entry: { label: string; since: string },
): void {
	pushRequirement(requirements, `${labelPrefix} ${entry.label}`, entry.since);
}

function readExistingTextFile(filePath: string): string | undefined {
	if (!fs.existsSync(filePath)) {
		return undefined;
	}

	return fs.readFileSync(filePath, "utf8");
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

		for (const [feature, entry] of Object.entries(
			WORDPRESS_BLOCK_API_COMPATIBILITY.blockSupports,
		)) {
			if (isEnabledMetadataValue(getNestedMetadataValue(blockJson.supports, feature))) {
				pushBlockApiRequirement(requirements, `Block ${block.slug}`, entry);
			}
		}

		for (const [feature, entry] of Object.entries(
			WORDPRESS_BLOCK_API_COMPATIBILITY.blockMetadata,
		)) {
			if (isEnabledMetadataValue(getNestedMetadataValue(blockJson, feature))) {
				pushBlockApiRequirement(requirements, `Block ${block.slug}`, entry);
			}
		}

		for (const [feature, entry] of Object.entries(
			WORDPRESS_BLOCK_API_COMPATIBILITY.blockBindings,
		)) {
			if (
				(entry.runtime as readonly string[]).includes("block-json") &&
				isEnabledMetadataValue(getNestedMetadataValue(blockJson, feature))
			) {
				pushBlockApiRequirement(requirements, `Block ${block.slug}`, entry);
			}
		}

		for (const [feature, entry] of Object.entries(
			WORDPRESS_BLOCK_API_COMPATIBILITY.blockVariations,
		)) {
			if (!(entry.runtime as readonly string[]).includes("block-json")) {
				continue;
			}

			const blockJsonFeature = feature as BlockVariationBlockJsonFeature;
			const blockJsonKey = BLOCK_VARIATION_BLOCK_JSON_KEYS[blockJsonFeature];
			if (
				isEnabledBlockVariationMetadataFeature(
					blockJsonFeature,
					getNestedMetadataValue(blockJson, blockJsonKey),
				)
			) {
				pushBlockApiRequirement(requirements, `Block ${block.slug}`, entry);
			}
		}
	}

	return {
		issues,
		requirements,
	};
}

function hasGeneratedCoreVariationRegistry(projectDir: string): boolean {
	// Convention: generated core variation registries are rooted at this entrypoint.
	const registryPath = path.join(
		projectDir,
		"src",
		"editor-plugins",
		"core-variations",
		"index.ts",
	);
	const source = readExistingTextFile(registryPath);
	if (!source) {
		return false;
	}

	return (
		hasUncommentedPattern(source, CORE_VARIATION_REGISTRY_IMPORT_PATTERN) &&
		hasExecutablePattern(source, REGISTER_BLOCK_VARIATION_CALL_PATTERN) &&
		hasExecutablePattern(source, REGISTER_WORKSPACE_CORE_VARIATIONS_CALL_PATTERN)
	);
}

function collectVariationRequirements(
	workspace: WorkspaceProject,
	inventory: WorkspaceInventory,
): WordPressVersionRequirementCollection {
	const requirements: WordPressVersionRequirement[] = [];
	const variationEntries = WORDPRESS_BLOCK_API_COMPATIBILITY.blockVariations;

	for (const variation of inventory.variations) {
		pushBlockApiRequirement(
			requirements,
			`Variation ${variation.block}/${variation.slug}`,
			variationEntries.editorRegistration,
		);
	}

	if (hasGeneratedCoreVariationRegistry(workspace.projectDir)) {
		pushBlockApiRequirement(
			requirements,
			"Core variations editor plugin",
			variationEntries.editorRegistration,
		);
	}

	return {
		issues: [],
		requirements,
	};
}

function collectInventoryCompatibilityRequirements(
	inventory: WorkspaceInventory,
): WordPressVersionRequirementCollection {
	const requirements: WordPressVersionRequirement[] = [];

	for (const ability of inventory.abilities) {
		const wordpressMinimum = ability.compatibility?.hardMinimums.wordpress;
		if (wordpressMinimum) {
			requirements.push({
				label: `Ability ${ability.slug} compatibility metadata`,
				version: wordpressMinimum,
			});
		}
	}

	for (const aiFeature of inventory.aiFeatures) {
		const wordpressMinimum = aiFeature.compatibility?.hardMinimums.wordpress;
		if (wordpressMinimum) {
			requirements.push({
				label: `AI feature ${aiFeature.slug} compatibility metadata`,
				version: wordpressMinimum,
			});
		}
	}

	return {
		issues: [],
		requirements,
	};
}

function collectBindingSourceRequirements(
	workspace: WorkspaceProject,
	inventory: WorkspaceInventory,
): WordPressVersionRequirementCollection {
	const requirements: WordPressVersionRequirement[] = [];
	const bindingEntries = WORDPRESS_BLOCK_API_COMPATIBILITY.blockBindings;

	for (const bindingSource of inventory.bindingSources) {
		pushBlockApiRequirement(
			requirements,
			`Binding source ${bindingSource.slug}`,
			bindingEntries.serverRegistration,
		);
		pushBlockApiRequirement(
			requirements,
			`Binding source ${bindingSource.slug}`,
			bindingEntries.editorRegistration,
		);

		const editorFilePath = path.join(
			workspace.projectDir,
			bindingSource.editorFile,
		);
		const editorSource = readExistingTextFile(editorFilePath);
		if (
			editorSource &&
			hasExecutablePattern(editorSource, GET_FIELDS_LIST_REGISTRATION_PATTERN)
		) {
			pushBlockApiRequirement(
				requirements,
				`Binding source ${bindingSource.slug}`,
				bindingEntries.editorFieldsList,
			);
		}

		const serverFilePath = path.join(
			workspace.projectDir,
			bindingSource.serverFile,
		);
		const serverSource = readExistingTextFile(serverFilePath);
		if (
			serverSource &&
			hasPhpFunctionCallWithStringArgumentPrefix(
				serverSource,
				"add_filter",
				SUPPORTED_ATTRIBUTES_FILTER_PREFIX,
			)
		) {
			pushBlockApiRequirement(
				requirements,
				`Binding source ${bindingSource.slug}`,
				bindingEntries.supportedAttributesFilter,
			);
		}
	}

	return {
		issues: [],
		requirements,
	};
}

function collectWordPressVersionRequirements(
	workspace: WorkspaceProject,
	inventory: WorkspaceInventory,
): WordPressVersionRequirementCollection {
	const blockRequirements = collectBlockMetadataRequirements(workspace, inventory);
	const variationRequirements = collectVariationRequirements(workspace, inventory);
	const bindingRequirements = collectBindingSourceRequirements(
		workspace,
		inventory,
	);
	const inventoryRequirements =
		collectInventoryCompatibilityRequirements(inventory);

	return {
		issues: [
			...blockRequirements.issues,
			...variationRequirements.issues,
			...bindingRequirements.issues,
			...inventoryRequirements.issues,
		],
		requirements: [
			...blockRequirements.requirements,
			...variationRequirements.requirements,
			...bindingRequirements.requirements,
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
