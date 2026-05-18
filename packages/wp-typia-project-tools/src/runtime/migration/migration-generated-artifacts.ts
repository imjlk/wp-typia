import fs from "node:fs";
import path from "node:path";

import { ROOT_PHP_MIGRATION_REGISTRY } from "./migration-constants.js";
import { createMigrationDiff } from "./migration-diff.js";
import { createMigrationFuzzPlan } from "./migration-fuzz-plan.js";
import {
	discoverMigrationEntries,
	getGeneratedDirForBlock,
	getSnapshotManifestPath,
	loadMigrationProject,
} from "./migration-project.js";
import {
	renderFuzzFile,
	renderGeneratedDeprecatedFile,
	renderGeneratedMigrationIndexFile,
	renderMigrationRegistryFile,
	renderPhpMigrationRegistryFile,
	renderVerifyFile,
} from "./migration-render.js";
import { createMigrationRiskSummary } from "./migration-risk.js";
import { readJson } from "./migration-utils.js";
import type {
	GeneratedMigrationEntry,
	ManifestDocument,
	MigrationProjectState,
} from "./migration-types.js";

export function collectGeneratedMigrationEntries(
	state: MigrationProjectState,
): GeneratedMigrationEntry[] {
	return discoverMigrationEntries(state).map((entry) => {
		const block = state.blocks.find((target) => target.key === entry.block.key);
		if (!block) {
			throw new Error(`Unknown migration block target: ${entry.block.key}`);
		}
		const diff = createMigrationDiff(state, entry.block, entry.fromVersion, entry.toVersion);
		const legacyManifest = readJson<ManifestDocument>(
			getSnapshotManifestPath(state.projectDir, entry.block, entry.fromVersion),
		);

		return {
			diff,
			entry,
			fuzzPlan: createMigrationFuzzPlan(legacyManifest, block.currentManifest, diff),
			riskSummary: createMigrationRiskSummary(diff),
		};
	});
}

export function regenerateGeneratedArtifacts(projectDir: string): void {
	const state = loadMigrationProject(projectDir);
	const generatedEntries = collectGeneratedMigrationEntries(state);
	for (const block of state.blocks) {
		const blockGeneratedEntries = generatedEntries.filter(({ entry }) => entry.block.key === block.key);
		const entries = blockGeneratedEntries.map(({ entry }) => entry);
		const generatedDir = getGeneratedDirForBlock(state.paths, block);
		fs.mkdirSync(generatedDir, { recursive: true });
		fs.writeFileSync(
			path.join(generatedDir, "registry.ts"),
			renderMigrationRegistryFile(state, block.key, blockGeneratedEntries),
			"utf8",
		);
		fs.writeFileSync(
			path.join(generatedDir, "deprecated.ts"),
			renderGeneratedDeprecatedFile(state, block.key, entries),
			"utf8",
		);
		fs.writeFileSync(
			path.join(generatedDir, "verify.ts"),
			renderVerifyFile(state, block.key, entries),
			"utf8",
		);
		fs.writeFileSync(
			path.join(generatedDir, "fuzz.ts"),
			renderFuzzFile(state, block.key, blockGeneratedEntries),
			"utf8",
		);
	}
	fs.writeFileSync(
		path.join(state.paths.generatedDir, "index.ts"),
		renderGeneratedMigrationIndexFile(state, generatedEntries.map(({ entry }) => entry)),
		"utf8",
	);
	fs.writeFileSync(
		path.join(projectDir, ROOT_PHP_MIGRATION_REGISTRY),
		renderPhpMigrationRegistryFile(state, generatedEntries.map(({ entry }) => entry)),
		"utf8",
	);
}
