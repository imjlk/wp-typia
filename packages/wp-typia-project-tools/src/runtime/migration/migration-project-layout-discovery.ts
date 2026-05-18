import fs from "node:fs";
import path from "node:path";

import {
	CONFIG_FILE,
	ROOT_BLOCK_JSON,
	ROOT_MANIFEST,
	ROOT_SAVE_FILE,
	ROOT_TYPES_FILE,
	SRC_BLOCK_JSON,
	SRC_MANIFEST,
	SUPPORTED_PROJECT_FILES,
} from "./migration-constants.js";
import {
	readJson,
} from "./migration-utils.js";
import {
	normalizeRelativePath,
	parseMigrationConfig,
} from "./migration-project-config-source.js";
import type {
	MigrationBlockConfig,
	MigrationConfig,
	ResolvedMigrationBlockTarget,
} from "./migration-types.js";

const DEFAULT_BLOCK_KEY = "default";
const SINGLE_BLOCK_LAYOUT_NOT_FOUND = "No supported single-block migration layout was found.";
const SINGLE_BLOCK_LAYOUT_CANDIDATES = [
	{
		blockJsonFile: SRC_BLOCK_JSON,
		manifestFile: SRC_MANIFEST,
	},
	{
		blockJsonFile: ROOT_BLOCK_JSON,
		manifestFile: ROOT_MANIFEST,
	},
] as const;
const LEGACY_ROOT_SINGLE_BLOCK_LAYOUT = SINGLE_BLOCK_LAYOUT_CANDIDATES[1];

/**
 * Describes the migration retrofit layout discovered in a project directory.
 *
 * Multi-block discovery wins when block targets are discovered under
 * `src/blocks/<slug>/block.json`.
 * Otherwise the runtime falls back to a supported single-block layout.
 */
export type DiscoveredMigrationLayout =
	| {
			block: MigrationBlockConfig;
			mode: "single";
	  }
	| {
			blocks: MigrationBlockConfig[];
			mode: "multi";
	  };

function readSingleBlockTarget(
	projectDir: string,
	{
		blockJsonFile,
		manifestFile,
	}: {
		blockJsonFile: string;
		manifestFile: string;
	},
): MigrationBlockConfig | null {
	const requiredFiles = [blockJsonFile, ROOT_SAVE_FILE, ROOT_TYPES_FILE];
	if (requiredFiles.some((relativePath) => !fs.existsSync(path.join(projectDir, relativePath)))) {
		return null;
	}

	const blockName = readJson<{ name?: string }>(path.join(projectDir, blockJsonFile))?.name;
	if (typeof blockName !== "string" || blockName.length === 0) {
		throw new Error(`Unable to resolve block name from ${normalizeRelativePath(blockJsonFile)}`);
	}

	return {
		blockJsonFile: normalizeRelativePath(blockJsonFile),
		blockName,
		key: DEFAULT_BLOCK_KEY,
		manifestFile: normalizeRelativePath(manifestFile),
		saveFile: ROOT_SAVE_FILE,
		typesFile: ROOT_TYPES_FILE,
	};
}

function collectSingleBlockCandidates(
	projectDir: string,
): Array<{
	blockJsonFile: string;
	manifestFile: string;
}> {
	return SINGLE_BLOCK_LAYOUT_CANDIDATES.filter(({ blockJsonFile }) =>
		hasSingleBlockLayoutFiles(projectDir, blockJsonFile),
	);
}

function hasSingleBlockLayoutFiles(projectDir: string, blockJsonFile: string): boolean {
	return [blockJsonFile, ROOT_SAVE_FILE, ROOT_TYPES_FILE].every((relativePath) =>
		fs.existsSync(path.join(projectDir, relativePath)),
	);
}

function orderSingleBlockCandidates(
	projectDir: string,
	candidates: Array<{
		blockJsonFile: string;
		manifestFile: string;
	}>,
) {
	const candidatesWithManifest = candidates.filter(({ manifestFile }) =>
		fs.existsSync(path.join(projectDir, manifestFile)),
	);
	return [
		...candidatesWithManifest,
		...candidates.filter((candidate) => !candidatesWithManifest.includes(candidate)),
	];
}

/**
 * Synthesizes the implicit legacy migration block target for single-block projects.
 *
 * @param projectDir Project directory that may contain a legacy root migration layout.
 * @param blockName Optional configured block name used to prefer a matching legacy root target.
 * @returns The discovered single-block migration target keyed as `default`.
 */
export function createImplicitLegacyBlock(
	projectDir: string,
	blockName?: string,
): MigrationBlockConfig {
	if (blockName) {
		try {
			const rootTarget = readSingleBlockTarget(projectDir, LEGACY_ROOT_SINGLE_BLOCK_LAYOUT);
			const srcTarget = readSingleBlockTarget(projectDir, SINGLE_BLOCK_LAYOUT_CANDIDATES[0]);
			const hasSrcManifest = fs.existsSync(path.join(projectDir, SRC_MANIFEST));
			if (
				rootTarget?.blockName === blockName &&
				(!srcTarget || srcTarget.blockName !== blockName || !hasSrcManifest)
			) {
				return {
					...rootTarget,
					key: DEFAULT_BLOCK_KEY,
				};
			}
		} catch {
			// Fall back to the shared discovery flow so malformed legacy roots do not block valid layouts.
		}
	}
	const discovered = discoverSingleBlockTarget(projectDir, blockName);
	return {
		...discovered,
		key: DEFAULT_BLOCK_KEY,
	};
}

function createMalformedMultiBlockTargetError(directory: string, reason: string): Error {
	return new Error(
		"Unable to auto-detect a supported migration retrofit layout. " +
			`Detected ${path.join("src", "blocks", directory, "block.json")} but ${reason}. ` +
			"Create `src/migrations/config.ts` manually if your project uses a custom layout.",
	);
}

function getRequiredProjectFiles(projectDir: string, blocks?: MigrationBlockConfig[]): string[] {
	if (Array.isArray(blocks) && blocks.length > 0) {
		return [
			"package.json",
			...blocks.flatMap((block) => [block.blockJsonFile, block.saveFile, block.typesFile]),
		];
	}

	const configPath = path.join(projectDir, CONFIG_FILE);
	if (fs.existsSync(configPath)) {
		const config = parseMigrationConfig(fs.readFileSync(configPath, "utf8"));
		const configuredBlocks = config.blocks ?? [createImplicitLegacyBlock(projectDir, config.blockName)];
		return [
			"package.json",
			...configuredBlocks.flatMap((block) => [block.blockJsonFile, block.saveFile, block.typesFile]),
		];
	}

	const discoveredLayout = discoverMigrationLayout(projectDir);
	if (discoveredLayout?.mode === "multi") {
		return [
			"package.json",
			...discoveredLayout.blocks.flatMap((block) => [block.blockJsonFile, block.saveFile, block.typesFile]),
		];
	}
	if (discoveredLayout?.mode === "single") {
		return [
			"package.json",
			discoveredLayout.block.blockJsonFile,
			discoveredLayout.block.saveFile,
			discoveredLayout.block.typesFile,
		];
	}

	return SUPPORTED_PROJECT_FILES;
}

/**
 * Verifies that a project directory contains the files required for migration tooling.
 *
 * @param projectDir Project directory to validate.
 * @param blocks Optional block targets to validate directly instead of auto-discovering them.
 * @returns Nothing.
 * @throws Error When any required project file is missing.
 */
export function ensureAdvancedMigrationProject(
	projectDir: string,
	blocks?: MigrationBlockConfig[],
): void {
	const missing = getRequiredProjectFiles(projectDir, blocks).filter(
		(relativePath) => !fs.existsSync(path.join(projectDir, relativePath)),
	);
	if (missing.length > 0) {
		throw new Error(
			`This directory is not a supported migration-capable project. Missing: ${missing.join(", ")}`,
		);
	}
}
function createBlockTarget(
	projectDir: string,
	{
		blockJsonFile,
		key,
		manifestFile,
		saveFile,
		typesFile,
	}: {
		blockJsonFile: string;
		key: string;
		manifestFile: string;
		saveFile: string;
		typesFile: string;
	},
): MigrationBlockConfig | null {
	const requiredFiles = [blockJsonFile, saveFile, typesFile];
	if (requiredFiles.some((relativePath) => !fs.existsSync(path.join(projectDir, relativePath)))) {
		return null;
	}

	const blockName = readJson<{ name?: string }>(path.join(projectDir, blockJsonFile))?.name;
	if (typeof blockName !== "string" || blockName.length === 0) {
		return null;
	}

	return {
		blockJsonFile: normalizeRelativePath(blockJsonFile),
		blockName,
		key,
		manifestFile: normalizeRelativePath(manifestFile),
		saveFile: normalizeRelativePath(saveFile),
		typesFile: normalizeRelativePath(typesFile),
	};
}

function discoverSingleBlockTarget(projectDir: string, preferredBlockName?: string): MigrationBlockConfig {
	const candidates = collectSingleBlockCandidates(projectDir);
	if (candidates.length === 0) {
		throw new Error(SINGLE_BLOCK_LAYOUT_NOT_FOUND);
	}

	const readCandidate = (candidate: (typeof candidates)[number]) =>
		readSingleBlockTarget(projectDir, candidate);
	const orderedCandidates = orderSingleBlockCandidates(projectDir, candidates);

	if (preferredBlockName) {
		const validTargets: MigrationBlockConfig[] = [];
		let firstReadError: Error | null = null;

		for (const candidate of orderedCandidates) {
			try {
				const target = readCandidate(candidate);
				if (!target) {
					continue;
				}
				if (target.blockName === preferredBlockName) {
					return target;
				}
				validTargets.push(target);
			} catch (error) {
				if (!firstReadError && error instanceof Error) {
					firstReadError = error;
				}
			}
		}

		if (validTargets.length > 0) {
			throw new Error(
				`Configured migration blockName ${preferredBlockName} does not match the detected single-block layout(s): ${validTargets
					.map((target) => target.blockName)
					.join(", ")}.`,
			);
		}
		if (firstReadError) {
			throw firstReadError;
		}
	}

	let firstReadError: unknown;
	let sawReadError = false;
	for (const candidate of orderedCandidates) {
		try {
			const target = readCandidate(candidate);
			if (target) {
				return target;
			}
		} catch (error) {
			if (!sawReadError) {
				firstReadError = error;
				sawReadError = true;
			}
		}
	}

	if (sawReadError) {
		throw firstReadError;
	}

	throw new Error(SINGLE_BLOCK_LAYOUT_NOT_FOUND);
}

function discoverMigrationLayout(projectDir: string): DiscoveredMigrationLayout | null {
	const blocksRoot = path.join(projectDir, "src", "blocks");
	let firstMultiBlockError: Error | null = null;
	if (fs.existsSync(blocksRoot) && fs.statSync(blocksRoot).isDirectory()) {
		const blockDirectories = fs
			.readdirSync(blocksRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
		const candidateDirectories = blockDirectories.filter((directory) =>
			fs.existsSync(path.join(blocksRoot, directory, "block.json")),
		);

		if (candidateDirectories.length > 0) {
			const blocks = candidateDirectories.flatMap((directory) => {
				const saveFile = path.join("src", "blocks", directory, "save.tsx");
				const typesFile = path.join("src", "blocks", directory, "types.ts");
				const missingFiles = [saveFile, typesFile].filter(
					(relativePath) => !fs.existsSync(path.join(projectDir, relativePath)),
				);
				if (missingFiles.length > 0) {
					firstMultiBlockError ??= createMalformedMultiBlockTargetError(
						directory,
						`the block target is missing ${missingFiles.join(", ")}`,
					);
					return [];
				}

				let block: MigrationBlockConfig | null = null;
				try {
					block = createBlockTarget(projectDir, {
						blockJsonFile: path.join("src", "blocks", directory, "block.json"),
						key: directory,
						manifestFile: path.join("src", "blocks", directory, "typia.manifest.json"),
						saveFile,
						typesFile,
					});
				} catch (error) {
					firstMultiBlockError ??=
						error instanceof Error
							? createMalformedMultiBlockTargetError(directory, `could not be parsed (${error.message})`)
							: createMalformedMultiBlockTargetError(directory, "could not be parsed");
					return [];
				}
				if (!block) {
					firstMultiBlockError ??= createMalformedMultiBlockTargetError(
						directory,
						"it does not expose a valid block name",
					);
					return [];
				}
				return [block];
			});

			if (blocks.length > 0) {
				return {
					blocks: blocks.sort((left, right) => left.key.localeCompare(right.key)),
					mode: "multi",
				};
			}
		}
	}

	try {
		return {
			block: discoverSingleBlockTarget(projectDir),
			mode: "single",
		};
	} catch (error) {
		if (error instanceof Error && error.message === SINGLE_BLOCK_LAYOUT_NOT_FOUND) {
			if (firstMultiBlockError) {
				throw firstMultiBlockError;
			}
			return null;
		}
		throw error;
	}
}

/**
 * Detects the supported migration retrofit layout for `migrate init`.
 *
 * Multi-block targets under `src/blocks/<slug>` take precedence over
 * single-block layouts.
 * Returns the detected layout on success and throws an actionable error when no
 * supported first-party layout can be inferred.
 *
 * @param projectDir Project directory to inspect.
 * @returns The discovered migration layout.
 * @throws Error When no supported layout can be inferred.
 */
export function discoverMigrationInitLayout(projectDir: string): DiscoveredMigrationLayout {
	const discoveredLayout = discoverMigrationLayout(projectDir);
	if (discoveredLayout) {
		return discoveredLayout;
	}

	throw new Error(
		"Unable to auto-detect a supported migration retrofit layout. " +
			"Expected either `src/blocks/*/block.json` with matching `types.ts` and `save.tsx`, " +
			"or a single-block layout using `src/block.json` (or legacy root `block.json`) with `src/types.ts` and `src/save.tsx`. " +
			"Create `src/migrations/config.ts` manually if your project uses a custom layout.",
	);
}

/**
 * Resolves the configured migration block targets and their current artifacts.
 *
 * @param projectDir Project directory containing the migration workspace.
 * @param config Parsed migration configuration.
 * @returns The resolved block targets, including current block.json and manifest documents.
 */
export function resolveMigrationBlocks(
	projectDir: string,
	config: MigrationConfig,
): ResolvedMigrationBlockTarget[] {
	if (Array.isArray(config.blocks)) {
		if (config.blocks.length === 0) {
			return [];
		}

		return config.blocks.map((block) => {
			const blockJsonPath = path.join(projectDir, block.blockJsonFile);
			const manifestPath = path.join(projectDir, block.manifestFile);
			return {
				...block,
				currentBlockJson: readJson(blockJsonPath),
				currentManifest: readJson(manifestPath),
				layout: "multi",
			} satisfies ResolvedMigrationBlockTarget;
		});
	}

	return [createImplicitLegacyBlock(projectDir, config.blockName)].map((block) => {
		const blockJsonPath = path.join(projectDir, block.blockJsonFile);
		const manifestPath = path.join(projectDir, block.manifestFile);
		return {
			...block,
			currentBlockJson: readJson(blockJsonPath),
			currentManifest: readJson(manifestPath),
			layout: "legacy",
		} satisfies ResolvedMigrationBlockTarget;
	});
}
/**
 * Returns the discovered block name for a supported single-block project.
 *
 * Uses `discoverSingleBlockTarget(projectDir)` internally and throws when the
 * project directory does not resolve to a supported single-block migration
 * layout.
 */
export function readProjectBlockName(projectDir: string): string {
	return discoverSingleBlockTarget(projectDir).blockName;
}
