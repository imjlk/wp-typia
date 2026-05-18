import fs from "node:fs";
import path from "node:path";

import {
	CONFIG_FILE,
	FIXTURES_DIR,
	GENERATED_DIR,
	MIGRATION_TODO_PREFIX,
	ROOT_BLOCK_JSON,
	ROOT_MANIFEST,
	RULES_DIR,
	SNAPSHOT_DIR,
} from "./migration-constants.js";
import {
	compareMigrationVersionLabels,
} from "./migration-utils.js";
import {
	ensureRelativePath,
	normalizeRelativePath,
} from "./migration-project-config-source.js";
import type {
	MigrationBlockConfig,
	MigrationEntry,
	MigrationProjectPaths,
	MigrationProjectState,
	ResolvedMigrationBlockTarget,
	RuleMetadata,
} from "./migration-types.js";

function toImportPath(fromDir: string, targetPath: string, stripExtension = false): string {
	let relativePath = normalizeRelativePath(path.relative(fromDir, targetPath));
	if (!relativePath.startsWith(".")) {
		relativePath = `./${relativePath}`;
	}
	if (stripExtension) {
		relativePath = relativePath.replace(/\.[^.]+$/u, "");
	}
	return relativePath;
}
/**
 * Resolves the canonical migration workspace paths for a project directory.
 *
 * @param projectDir Project directory containing the migration workspace.
 * @returns Absolute filesystem paths for config, generated, fixture, rule, and snapshot roots.
 */
export function getProjectPaths(projectDir: string): MigrationProjectPaths {
	return {
		configFile: path.join(projectDir, CONFIG_FILE),
		fixturesDir: path.join(projectDir, FIXTURES_DIR),
		generatedDir: path.join(projectDir, GENERATED_DIR),
		rulesDir: path.join(projectDir, RULES_DIR),
		snapshotDir: path.join(projectDir, SNAPSHOT_DIR),
	};
}
/**
 * Resolves the snapshot root for a block target and migration version.
 *
 * @param projectDir Project directory containing the migration workspace.
 * @param block Block target or resolved block target.
 * @param version Migration version label.
 * @returns The absolute snapshot root directory for the requested block/version pair.
 */
export function getSnapshotRoot(
	projectDir: string,
	block: MigrationBlockConfig | ResolvedMigrationBlockTarget,
	version: string,
): string {
	if ("layout" in block && block.layout === "legacy") {
		return path.join(projectDir, SNAPSHOT_DIR, version);
	}
	return path.join(projectDir, SNAPSHOT_DIR, version, block.key);
}

/**
 * Resolves the snapshot `block.json` path for a block target and migration version.
 *
 * @param projectDir Project directory containing the migration workspace.
 * @param block Block target or resolved block target.
 * @param version Migration version label.
 * @returns The absolute snapshot `block.json` path.
 */
export function getSnapshotBlockJsonPath(
	projectDir: string,
	block: MigrationBlockConfig | ResolvedMigrationBlockTarget,
	version: string,
): string {
	return path.join(getSnapshotRoot(projectDir, block, version), ROOT_BLOCK_JSON);
}

/**
 * Resolves the snapshot manifest path for a block target and migration version.
 *
 * @param projectDir Project directory containing the migration workspace.
 * @param block Block target or resolved block target.
 * @param version Migration version label.
 * @returns The absolute snapshot manifest path.
 */
export function getSnapshotManifestPath(
	projectDir: string,
	block: MigrationBlockConfig | ResolvedMigrationBlockTarget,
	version: string,
): string {
	return path.join(getSnapshotRoot(projectDir, block, version), ROOT_MANIFEST);
}

/**
 * Lists the snapshot versions currently present for a specific block target.
 *
 * Returns the sorted subset of supported migration versions that have a manifest on disk
 * for the provided block, or an empty array when none exist.
 */
export function getAvailableSnapshotVersionsForBlock(
	projectDir: string,
	supportedMigrationVersions: string[],
	block: MigrationBlockConfig | ResolvedMigrationBlockTarget,
): string[] {
	return supportedMigrationVersions
		.filter((version) => fs.existsSync(getSnapshotManifestPath(projectDir, block, version)))
		.sort(compareMigrationVersionLabels);
}

/**
 * Formats the standard missing-snapshot guidance for a block target.
 *
 * Returns a user-facing message that either lists the available snapshot
 * versions or explains that no snapshots exist yet for the block.
 */
export function createMissingBlockSnapshotMessage(
	blockName: string,
	fromVersion: string,
	availableSnapshotVersions: string[],
): string {
	return availableSnapshotVersions.length === 0
		? `Snapshot manifest for ${blockName} @ ${fromVersion} does not exist. ` +
				`No snapshots exist yet for ${blockName}. Run \`wp-typia migrate snapshot --migration-version ${fromVersion}\` first.`
		: `Snapshot manifest for ${blockName} @ ${fromVersion} does not exist. ` +
				`Available snapshot versions for ${blockName}: ${availableSnapshotVersions.join(", ")}. ` +
				`Run \`wp-typia migrate snapshot --migration-version ${fromVersion}\` first if you want to preserve that release.`;
}

/**
 * Resolves the snapshot save source path for a block target and migration version.
 *
 * @param projectDir Project directory containing the migration workspace.
 * @param block Block target or resolved block target.
 * @param version Migration version label.
 * @returns The absolute snapshot `save.tsx` path.
 */
export function getSnapshotSavePath(
	projectDir: string,
	block: MigrationBlockConfig | ResolvedMigrationBlockTarget,
	version: string,
): string {
	return path.join(getSnapshotRoot(projectDir, block, version), "save.tsx");
}

/**
 * Resolves the generated directory used for a block's migration output.
 *
 * @param paths Resolved migration project paths.
 * @param block Block target or resolved block target.
 * @returns The absolute generated directory for the block.
 */
export function getGeneratedDirForBlock(
	paths: MigrationProjectPaths,
	block: MigrationBlockConfig | ResolvedMigrationBlockTarget,
): string {
	if ("layout" in block && block.layout === "legacy") {
		return paths.generatedDir;
	}
	return path.join(paths.generatedDir, block.key);
}

/**
 * Resolves the migration rule file path for a block version edge.
 *
 * @param paths Resolved migration project paths.
 * @param block Block target or resolved block target.
 * @param fromVersion Source migration version.
 * @param toVersion Destination migration version.
 * @returns The absolute migration rule file path.
 */
export function getRuleFilePath(
	paths: MigrationProjectPaths,
	block: MigrationBlockConfig | ResolvedMigrationBlockTarget,
	fromVersion: string,
	toVersion: string,
): string {
	if ("layout" in block && block.layout === "legacy") {
		return path.join(paths.rulesDir, `${fromVersion}-to-${toVersion}.ts`);
	}
	return path.join(paths.rulesDir, block.key, `${fromVersion}-to-${toVersion}.ts`);
}

/**
 * Resolves the migration fixture path for a block version edge.
 *
 * @param paths Resolved migration project paths.
 * @param block Block target or resolved block target.
 * @param fromVersion Source migration version.
 * @param toVersion Destination migration version.
 * @returns The absolute migration fixture file path.
 */
export function getFixtureFilePath(
	paths: MigrationProjectPaths,
	block: MigrationBlockConfig | ResolvedMigrationBlockTarget,
	fromVersion: string,
	toVersion: string,
): string {
	if ("layout" in block && block.layout === "legacy") {
		return path.join(paths.fixturesDir, `${fromVersion}-to-${toVersion}.json`);
	}
	return path.join(paths.fixturesDir, block.key, `${fromVersion}-to-${toVersion}.json`);
}

/**
 * Resolves the validators import path for generated migration artifacts.
 *
 * @param projectDir Project directory containing the migration workspace.
 * @param block Block target or resolved block target.
 * @param fromDir Directory that will import the validators module.
 * @returns A relative module import path without a file extension.
 */
export function getValidatorsImportPath(
	projectDir: string,
	block: MigrationBlockConfig | ResolvedMigrationBlockTarget,
	fromDir: string,
): string {
	const validatorPath = path.join(
		projectDir,
		block.typesFile.replace(/types\.ts$/u, "validators.ts"),
	);
	return toImportPath(fromDir, validatorPath, true);
}

/**
 * Ensures the migration fixture, generated, rule, and snapshot directories exist.
 *
 * @param projectDir Project directory containing the migration workspace.
 * @param blocks Optional block targets whose scoped rule/fixture directories should be created.
 * @returns Nothing.
 */
export function ensureMigrationDirectories(projectDir: string, blocks?: MigrationBlockConfig[]): void {
	const paths = getProjectPaths(projectDir);
	fs.mkdirSync(paths.fixturesDir, { recursive: true });
	fs.mkdirSync(paths.generatedDir, { recursive: true });
	fs.mkdirSync(paths.rulesDir, { recursive: true });
	fs.mkdirSync(paths.snapshotDir, { recursive: true });

	if (!Array.isArray(blocks) || blocks.length === 0) {
		return;
	}

	for (const block of blocks) {
		fs.mkdirSync(path.join(paths.fixturesDir, block.key), { recursive: true });
		fs.mkdirSync(path.join(paths.generatedDir, block.key), { recursive: true });
		fs.mkdirSync(path.join(paths.rulesDir, block.key), { recursive: true });
	}
}

/**
 * Discovers the generated migration registry entries for a loaded project state.
 *
 * @param state Loaded migration project state.
 * @returns Sorted migration registry entries for every available block/version edge.
 */
export function discoverMigrationEntries(state: MigrationProjectState): MigrationEntry[] {
	const entries: MigrationEntry[] = [];
	const currentVersion = state.config.currentMigrationVersion;

	for (const block of state.blocks) {
		const generatedDir = getGeneratedDirForBlock(state.paths, block);

		for (const version of state.config.supportedMigrationVersions) {
			if (version === currentVersion) {
				continue;
			}

			const manifestPath = getSnapshotManifestPath(state.projectDir, block, version);
			const blockJsonPath = getSnapshotBlockJsonPath(state.projectDir, block, version);
			const savePath = getSnapshotSavePath(state.projectDir, block, version);
			const rulePath = getRuleFilePath(state.paths, block, version, currentVersion);
			if (
				!fs.existsSync(manifestPath) ||
				!fs.existsSync(blockJsonPath) ||
				!fs.existsSync(savePath) ||
				!fs.existsSync(rulePath)
			) {
				continue;
			}

			entries.push({
				block,
				blockJsonImport: toImportPath(generatedDir, blockJsonPath),
				fixtureImport: toImportPath(
					generatedDir,
					getFixtureFilePath(state.paths, block, version, currentVersion),
				),
				fromVersion: version,
				generatedDir,
				manifestImport: toImportPath(generatedDir, manifestPath),
				ruleImport: toImportPath(generatedDir, rulePath, true),
				rulePath,
				saveImport: toImportPath(generatedDir, savePath, true),
				toVersion: currentVersion,
				validatorImport: getValidatorsImportPath(state.projectDir, block, generatedDir),
			});
		}
	}

	return entries.sort((left, right) => {
		const versionDelta = compareMigrationVersionLabels(right.fromVersion, left.fromVersion);
		if (versionDelta !== 0) {
			return versionDelta;
		}
		return left.block.key.localeCompare(right.block.key);
	});
}
/**
 * Verifies that a migration rule file exists and no TODO markers remain in it.
 *
 * @param projectDir Project directory containing the migration workspace.
 * @param block Block target or resolved block target.
 * @param fromMigrationVersion Source migration version.
 * @param toMigrationVersion Destination migration version.
 * @returns Nothing.
 * @throws Error When the rule file is missing or still contains TODO markers.
 */
export function assertRuleHasNoTodos(
	projectDir: string,
	block: MigrationBlockConfig | ResolvedMigrationBlockTarget,
	fromMigrationVersion: string,
	toMigrationVersion: string,
): void {
	const rulePath = getRuleFilePath(getProjectPaths(projectDir), block, fromMigrationVersion, toMigrationVersion);
	if (!fs.existsSync(rulePath)) {
		throw new Error(`Missing migration rule: ${path.relative(projectDir, rulePath)}`);
	}
	const source = fs.readFileSync(rulePath, "utf8");
	if (source.includes(MIGRATION_TODO_PREFIX)) {
		throw new Error(`Migration rule still contains ${MIGRATION_TODO_PREFIX} markers: ${path.relative(projectDir, rulePath)}`);
	}
}

/**
 * Reads lightweight metadata from a migration rule source file.
 *
 * @param rulePath Absolute path to the migration rule source file.
 * @returns Parsed unresolved paths, rename mappings, and transform keys.
 */
export function readRuleMetadata(rulePath: string): RuleMetadata {
	const source = fs.readFileSync(rulePath, "utf8");
	const unresolvedBlock = source.match(/export const unresolved = \[([\s\S]*?)\] as const;/);
	const renameMapBlock = source.match(/export const renameMap: RenameMap = \{([\s\S]*?)\};/);
	const transformsBlock = source.match(/export const transforms: TransformMap = \{([\s\S]*?)\};/);

	const unresolved: string[] = unresolvedBlock
		? [...unresolvedBlock[1].matchAll(/"([^"]+)"/g)].map((match) => match[1])
		: [];
	const renameMap: RuleMetadata["renameMap"] = renameMapBlock
		? [...renameMapBlock[1].matchAll(/^\s*"([^"]+)":\s*"([^"]+)"/gm)].map((match) => ({
			currentPath: match[1],
			legacyPath: match[2],
		}))
		: [];
	const transforms: string[] = transformsBlock
		? [...transformsBlock[1].matchAll(/^\s*"([^"]+)":\s*\(/gm)].map((match) => match[1])
		: [];

	return { renameMap, transforms, unresolved };
}

/**
 * Normalizes a migration block config against the current working directory.
 *
 * @param block Migration block config with project-relative file paths.
 * @returns A normalized migration block config with ensured relative paths.
 */
export function createMigrationBlockConfig(block: MigrationBlockConfig): MigrationBlockConfig {
	return {
		blockJsonFile: ensureRelativePath(process.cwd(), block.blockJsonFile),
		blockName: block.blockName,
		key: block.key,
		manifestFile: ensureRelativePath(process.cwd(), block.manifestFile),
		saveFile: ensureRelativePath(process.cwd(), block.saveFile),
		typesFile: ensureRelativePath(process.cwd(), block.typesFile),
	};
}
