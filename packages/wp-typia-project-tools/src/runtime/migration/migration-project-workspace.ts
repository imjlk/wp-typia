import fs from "node:fs";
import path from "node:path";

import {
	FIXTURES_DIR,
	ROOT_BLOCK_JSON,
	ROOT_MANIFEST,
	RULES_DIR,
	SNAPSHOT_DIR,
} from "./migration-constants.js";
import {
	isLegacySemverMigrationVersion,
	readJson,
	runProjectScriptIfPresent,
} from "./migration-utils.js";
import {
	createLegacyMigrationWorkspaceResetError,
	hasLegacyConfigKeys,
	normalizeRelativePath,
	parseMigrationConfig,
} from "./migration-project-config-source.js";
import {
	createImplicitLegacyBlock,
	ensureAdvancedMigrationProject,
	getProjectPaths,
	readProjectBlockName,
	resolveMigrationBlocks,
} from "./migration-project-layout.js";
import type {
	ManifestDocument,
	MigrationBlockConfig,
	MigrationConfig,
	MigrationProjectState,
} from "./migration-types.js";

const LEGACY_VERSIONED_EDGE_FILE_PATTERN = /^(\d+\.\d+\.\d+)-to-(\d+\.\d+\.\d+)\.(?:ts|json)$/;

function createEmptyMigrationProjectBlockJson(): Record<string, unknown> {
	return {};
}

function createEmptyMigrationProjectManifest(): ManifestDocument {
	return {
		attributes: {},
		manifestVersion: 2,
		sourceType: null,
	};
}

/**
 * Writes the initial migration README scaffolds for a project workspace.
 *
 * @param projectDir Project directory containing the migration workspace.
 * @param currentMigrationVersion Current migration version label used in README text.
 * @param blocks Optional block targets whose scoped READMEs should be scaffolded.
 * @returns Nothing.
 */
export function writeInitialMigrationScaffold(
	projectDir: string,
	currentMigrationVersion: string,
	blocks?: MigrationBlockConfig[],
): void {
	const paths = getProjectPaths(projectDir);
	const readmeFiles = [
		[path.join(paths.snapshotDir, "README.md"), `# Migration Version Snapshots\n\nSnapshots for ${currentMigrationVersion} and future migration versions live here.\n`],
		[path.join(paths.rulesDir, "README.md"), "# Migration Rules\n\nScaffold direct legacy-to-current migration rules in this directory.\n"],
		[path.join(paths.fixturesDir, "README.md"), "# Migration Fixtures\n\nGenerated fixtures are used by verify to assert migrations.\n"],
	];

	for (const [targetPath, content] of readmeFiles) {
		if (!fs.existsSync(targetPath)) {
			fs.writeFileSync(targetPath, content, "utf8");
		}
	}

	if (!Array.isArray(blocks) || blocks.length === 0) {
		return;
	}

	for (const block of blocks) {
		const scopedReadmes = [
			[path.join(paths.rulesDir, block.key, "README.md"), `# ${block.blockName} Migration Rules\n\nScaffold direct legacy-to-current migration rules for ${block.blockName} in this directory.\n`],
			[path.join(paths.fixturesDir, block.key, "README.md"), `# ${block.blockName} Migration Fixtures\n\nGenerated fixtures for ${block.blockName} are stored in this directory.\n`],
		];
		for (const [targetPath, content] of scopedReadmes) {
			if (!fs.existsSync(targetPath)) {
				fs.mkdirSync(path.dirname(targetPath), { recursive: true });
				fs.writeFileSync(targetPath, content, "utf8");
			}
		}
	}
}

function findLegacySemverMigrationArtifacts(projectDir: string): string[] {
	const paths = getProjectPaths(projectDir);
	const matches: string[] = [];

	if (fs.existsSync(paths.snapshotDir)) {
		for (const entry of fs.readdirSync(paths.snapshotDir, { withFileTypes: true })) {
			if (entry.isDirectory() && isLegacySemverMigrationVersion(entry.name)) {
				matches.push(normalizeRelativePath(path.join(SNAPSHOT_DIR, entry.name)));
			}
		}
	}

	const scanEdgeDir = (directory: string, relativeRoot: string) => {
		if (!fs.existsSync(directory)) {
			return;
		}

		const walk = (currentDir: string, currentRelativeDir: string) => {
			for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
				if (entry.isDirectory()) {
					walk(path.join(currentDir, entry.name), path.join(currentRelativeDir, entry.name));
					continue;
				}
				if (LEGACY_VERSIONED_EDGE_FILE_PATTERN.test(entry.name)) {
					matches.push(normalizeRelativePath(path.join(currentRelativeDir, entry.name)));
				}
			}
		};

		walk(directory, relativeRoot);
	};

	scanEdgeDir(paths.rulesDir, RULES_DIR);
	scanEdgeDir(paths.fixturesDir, FIXTURES_DIR);

	return matches;
}

/**
 * Guards a project directory against legacy semver-based migration workspaces.
 *
 * @param projectDir Absolute or relative project directory containing the migration workspace.
 * @returns Nothing.
 * @throws Error When legacy config keys or semver-named migration artifacts are detected.
 */
export function assertNoLegacySemverMigrationWorkspace(projectDir: string): void {
	const paths = getProjectPaths(projectDir);
	if (fs.existsSync(paths.configFile)) {
		const source = fs.readFileSync(paths.configFile, "utf8");
		if (hasLegacyConfigKeys(source)) {
			throw createLegacyMigrationWorkspaceResetError(
				"Detected legacy config keys `currentVersion` / `supportedVersions` in `src/migrations/config.ts`.",
			);
		}
	}

	const artifactMatches = findLegacySemverMigrationArtifacts(projectDir);
	if (artifactMatches.length > 0) {
		throw createLegacyMigrationWorkspaceResetError(
			`Detected legacy semver-named migration artifacts: ${artifactMatches.join(", ")}.`,
		);
	}
}

/**
 * Loads the migration workspace state for a project directory.
 *
 * By default this loader may run the project's `sync-types` script when the
 * current manifest files are missing, because later migration commands depend
 * on those generated artifacts. Pass `allowSyncTypes: false` to keep the call
 * read-only and fail instead of mutating the workspace.
 *
 * When `allowMissingConfig` is enabled and the migration config file does not
 * exist yet, the loader synthesizes a minimal legacy-root config so bootstrap
 * flows can continue before the first config write.
 *
 * @param projectDir Absolute or relative project directory containing the migration workspace.
 * @param options Loader flags controlling config fallback and `sync-types` side effects.
 * @returns The resolved migration project state, including config, block targets, and helper paths.
 * @throws Error When the project is not migration-capable, required manifests remain missing, or generated files cannot be read.
 */
export function loadMigrationProject(
	projectDir: string,
	{
		allowMissingConfig = false,
		allowSyncTypes = true,
	}: { allowMissingConfig?: boolean; allowSyncTypes?: boolean } = {},
): MigrationProjectState {
	assertNoLegacySemverMigrationWorkspace(projectDir);
	ensureAdvancedMigrationProject(projectDir);

	const paths = getProjectPaths(projectDir);
	const config: MigrationConfig = allowMissingConfig && !fs.existsSync(paths.configFile)
		? {
			blocks: [createImplicitLegacyBlock(projectDir)],
			currentMigrationVersion: "v1",
			snapshotDir: SNAPSHOT_DIR.replace(/\\/g, "/"),
			supportedMigrationVersions: [],
		}
		: parseMigrationConfig(fs.readFileSync(paths.configFile, "utf8"));
	const configuredBlocks =
		config.blocks === undefined ? [createImplicitLegacyBlock(projectDir, config.blockName)] : config.blocks;
	const missingManifestFiles = configuredBlocks
		.filter((block) => !fs.existsSync(path.join(projectDir, block.manifestFile)))
		.map((block) => block.manifestFile);
	if (missingManifestFiles.length > 0) {
		if (!allowSyncTypes) {
			throw new Error(
				"Migration planning is read-only and cannot run `sync-types` automatically. " +
					`Missing current manifest file(s): ${missingManifestFiles.join(", ")}. ` +
					"Run your project's `sync-types` script in the project root first, then rerun the planning command.",
			);
		}
		runProjectScriptIfPresent(projectDir, "sync-types");
		const remainingManifestFiles = configuredBlocks
			.filter((block) => !fs.existsSync(path.join(projectDir, block.manifestFile)))
			.map((block) => block.manifestFile);
		if (remainingManifestFiles.length > 0) {
			throw new Error(
				`Missing current manifest file(s): ${remainingManifestFiles.join(", ")}. ` +
					"Run your project's `sync-types` script in the project root first, then retry.",
			);
		}
	}
	const blocks = resolveMigrationBlocks(projectDir, config);

	return {
		blocks,
		config,
		currentBlockJson:
			blocks[0]?.currentBlockJson ??
			(config.blocks !== undefined
				? createEmptyMigrationProjectBlockJson()
				: readJson(path.join(projectDir, ROOT_BLOCK_JSON))),
		currentManifest:
			blocks[0]?.currentManifest ??
			(config.blocks !== undefined
				? createEmptyMigrationProjectManifest()
				: readJson(path.join(projectDir, ROOT_MANIFEST))),
		paths,
		projectDir,
	};
}

/**
 * Writes the migration config source file for a project workspace.
 *
 * @param projectDir Project directory containing the migration workspace.
 * @param config Parsed or synthesized migration config to serialize.
 * @returns Nothing.
 */
export function writeMigrationConfig(projectDir: string, config: MigrationConfig): void {
	const paths = getProjectPaths(projectDir);
	fs.mkdirSync(path.dirname(paths.configFile), { recursive: true });
	if (!Array.isArray(config.blocks)) {
		fs.writeFileSync(
			paths.configFile,
			`export const migrationConfig = {
\tblockName: '${config.blockName ?? readProjectBlockName(projectDir)}',
\tcurrentMigrationVersion: '${config.currentMigrationVersion}',
\tsupportedMigrationVersions: [ ${config.supportedMigrationVersions.map((version) => `'${version}'`).join(", ")} ],
\tsnapshotDir: '${config.snapshotDir}',
} as const;

export default migrationConfig;
`,
			"utf8",
		);
		return;
	}

	const blocksSource = config.blocks
		.map(
			(block) =>
				`\t\t{
\t\t\tkey: '${block.key}',
\t\t\tblockName: '${block.blockName}',
\t\t\tblockJsonFile: '${normalizeRelativePath(block.blockJsonFile)}',
\t\t\tmanifestFile: '${normalizeRelativePath(block.manifestFile)}',
\t\t\tsaveFile: '${normalizeRelativePath(block.saveFile)}',
\t\t\ttypesFile: '${normalizeRelativePath(block.typesFile)}',
\t\t},`,
		)
		.join("\n");
	fs.writeFileSync(
		paths.configFile,
		`export const migrationConfig = {
\tcurrentMigrationVersion: '${config.currentMigrationVersion}',
\tsupportedMigrationVersions: [ ${config.supportedMigrationVersions.map((version) => `'${version}'`).join(", ")} ],
\tsnapshotDir: '${config.snapshotDir}',
\tblocks: [
${blocksSource}
\t],
} as const;

export default migrationConfig;
`,
		"utf8",
	);
}
