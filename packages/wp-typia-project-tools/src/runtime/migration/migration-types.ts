/**
 * Shared migration contract facade for project-tools runtime.
 *
 * Re-exports canonical manifest and migration contracts from
 * `@wp-typia/block-runtime/migration-types` and layers project-tools-specific
 * migration workspace types on top.
 */
import type {
	JsonValue,
	ManifestAttribute,
	ManifestDocument,
} from "@wp-typia/block-runtime/migration-types";

export type {
	JsonPrimitive,
	JsonValue,
	ManifestAttribute,
	ManifestConstraints,
	ManifestDocument,
	ManifestTsKind,
	ManifestTsMetadata,
	ManifestTypiaMetadata,
	ManifestUnionMetadata,
	ManifestWpMetadata,
} from "@wp-typia/block-runtime/migration-types";

export interface ManifestSummaryAttribute {
	constraints: ManifestAttribute["typia"]["constraints"];
	defaultValue: ManifestAttribute["typia"]["defaultValue"] | null;
	enum: ManifestAttribute["wp"]["enum"] | null;
	hasDefault: boolean;
	kind: ManifestAttribute["ts"]["kind"] | null;
	required: boolean;
	union: ManifestAttribute["ts"]["union"] | null;
}

export interface ManifestSummary {
	attributes: Record<string, ManifestSummaryAttribute>;
	manifestVersion: number | null;
	sourceType: string | null;
}

export interface UnionBranchSummary {
	branches: string[];
	discriminator: string | null;
	field: string;
}

/**
 * Declares the migration-lineage labels and block targets used by a project migration workspace.
 *
 * These labels describe schema lineage such as `v1`, `v2`, and `v3`; they do
 * not represent package, plugin, or release versions.
 */
export interface MigrationConfig {
	/** Optional single-block name used by legacy-root retrofit layouts. */
	blockName?: string;
	/** Optional explicit block target list for multi-block migration workspaces. */
	blocks?: MigrationBlockConfig[];
	/** Current migration-lineage label for newly generated snapshots and rules. */
	currentMigrationVersion: string;
	/** Relative directory that stores versioned migration snapshots. */
	snapshotDir: string;
	/** Ordered migration-lineage labels configured for this workspace, including the current label. */
	supportedMigrationVersions: string[];
}

/**
 * Declares one migration-capable block target inside a project workspace.
 */
export interface MigrationBlockConfig {
	/** Relative path to the target block.json metadata file. */
	blockJsonFile: string;
	/** Registered block name for this migration target. */
	blockName: string;
	/** Stable block key used for generated file naming and registry entries. */
	key: string;
	/** Relative path to the generated manifest snapshot input for the block. */
	manifestFile: string;
	/** Relative path to the saved-markup source file used for snapshot capture. */
	saveFile: string;
	/** Relative path to the canonical types source for the block. */
	typesFile: string;
}

export interface ResolvedMigrationBlockTarget extends MigrationBlockConfig {
	currentBlockJson: Record<string, unknown>;
	currentManifest: ManifestDocument;
	layout: "legacy" | "multi";
}

export interface MigrationProjectPaths {
	configFile: string;
	fixturesDir: string;
	generatedDir: string;
	rulesDir: string;
	snapshotDir: string;
}

export interface MigrationProjectState {
	blocks: ResolvedMigrationBlockTarget[];
	config: MigrationConfig;
	currentBlockJson: Record<string, unknown>;
	currentManifest: ManifestDocument;
	paths: MigrationProjectPaths;
	projectDir: string;
}

export interface MigrationEntry {
	block: MigrationBlockConfig;
	blockJsonImport: string;
	fixtureImport: string;
	fromVersion: string;
	generatedDir: string;
	manifestImport: string;
	ruleImport: string;
	rulePath: string;
	saveImport: string;
	toVersion: string;
	validatorImport: string;
}

export interface RuleMetadata {
	renameMap: Array<{ currentPath: string; legacyPath: string }>;
	transforms: string[];
	unresolved: string[];
}

export interface FlattenedAttributeDescriptor {
	attribute: ManifestAttribute;
	currentPath: string;
	rootPath: string;
	sourcePath: string;
	unionBranch: string | null;
	unionDiscriminator: string | null;
	unionRoot: string | null;
}

export interface DiffOutcome {
	detail?: string;
	kind: string;
	path: string;
	status: "auto" | "manual";
}

export interface RenameCandidate {
	autoApply: boolean;
	currentPath: string;
	legacyPath: string;
	reason: string;
	score: number;
}

export interface TransformSuggestion {
	attribute: ManifestAttribute | null;
	bodyLines: string[];
	currentPath: string;
	legacyPath: string | null;
	reason: string;
}

export interface MigrationDiffSummary {
	auto: number;
	autoItems: DiffOutcome[];
	manual: number;
	manualItems: DiffOutcome[];
	renameCandidates: RenameCandidate[];
	transformSuggestions: TransformSuggestion[];
}

export interface MigrationDiff {
	currentTypeName: string | null | undefined;
	fromVersion: string;
	summary: MigrationDiffSummary;
	toVersion: string;
}

export interface MigrationRiskBucket {
	count: number;
	items: string[];
}

export interface MigrationRiskSummary {
	additive: MigrationRiskBucket;
	rename: MigrationRiskBucket;
	semanticTransform: MigrationRiskBucket;
	unionBreaking: MigrationRiskBucket;
}

export interface MigrationFuzzMapping {
	currentPath: string;
	legacyPath: string;
}

export interface MigrationFuzzPlan {
	blockedPaths: string[];
	compatibleMappings: MigrationFuzzMapping[];
}

export interface GeneratedMigrationEntry {
	diff: MigrationDiff;
	entry: MigrationEntry;
	fuzzPlan: MigrationFuzzPlan;
	riskSummary: MigrationRiskSummary;
}

export interface MigrationRuleFileInput {
	block: MigrationBlockConfig;
	currentAttributes: Record<string, ManifestAttribute>;
	currentTypeName: string | null | undefined;
	diff: MigrationDiff;
	fromVersion: string;
	projectDir: string;
	rulePath: string;
	targetVersion: string;
}

export interface MigrationFixtureCase {
	input: JsonObject;
	name: string;
}

export interface MigrationFixtureDocument {
	cases: MigrationFixtureCase[];
	fromVersion: string;
	toVersion: string;
}

export interface ParsedMigrationArgs {
	command?: string;
	flags: {
		all: boolean;
		currentMigrationVersion?: string;
		force: boolean;
		fromMigrationVersion?: string;
		iterations?: string;
		migrationVersion?: string;
		seed?: string;
		toMigrationVersion?: string;
	};
}

export type RenderLine = (line: string) => void;
export type JsonObject = Record<string, JsonValue>;
