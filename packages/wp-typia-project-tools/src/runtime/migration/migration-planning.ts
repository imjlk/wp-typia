import fs from "node:fs";

import {
	discoverMigrationEntries,
	getAvailableSnapshotVersionsForBlock,
	getFixtureFilePath,
	getSnapshotManifestPath,
} from "./migration-project.js";
import { compareMigrationVersionLabels } from "./migration-utils.js";
import type { MigrationProjectState } from "./migration-types.js";

export function hasSnapshotForVersion(
	state: MigrationProjectState,
	block: MigrationProjectState["blocks"][number],
	version: string,
): boolean {
	return fs.existsSync(getSnapshotManifestPath(state.projectDir, block, version));
}

export function listConfiguredLegacyVersions(
	state: MigrationProjectState,
): string[] {
	return state.config.supportedMigrationVersions
		.filter((version) => version !== state.config.currentMigrationVersion)
		.sort(compareMigrationVersionLabels);
}

export function listPreviewableLegacyVersions(
	state: MigrationProjectState,
): string[] {
	return [
		...new Set(
			state.blocks.flatMap((block) =>
				getAvailableSnapshotVersionsForBlock(
					state.projectDir,
					state.config.supportedMigrationVersions,
					block,
				),
			),
		),
	]
		.filter((version) => version !== state.config.currentMigrationVersion)
		.sort(compareMigrationVersionLabels);
}

export function resolveLegacyVersions(
	state: MigrationProjectState,
	{
		all = false,
		availableVersions,
		fromMigrationVersion,
	}: { all?: boolean; availableVersions?: string[]; fromMigrationVersion?: string },
): string[] {
	const configuredLegacyVersions = listConfiguredLegacyVersions(state);
	const legacyVersions = availableVersions ?? configuredLegacyVersions;

	if (fromMigrationVersion) {
		if (!legacyVersions.includes(fromMigrationVersion)) {
			throw new Error(
				legacyVersions.length === 0
					? availableVersions && configuredLegacyVersions.length > 0
						? `Unsupported migration version: ${fromMigrationVersion}. No previewable legacy migration versions are available yet because none currently have snapshot coverage. ` +
							`Restore or recapture the missing snapshots first.`
						: `Unsupported migration version: ${fromMigrationVersion}. No legacy migration versions are configured yet. ` +
							`Capture an older schema release with \`wp-typia migrate snapshot --migration-version <label>\` first.`
					: `Unsupported migration version: ${fromMigrationVersion}. Available legacy migration versions: ${legacyVersions.join(", ")}.`,
			);
		}
		return [fromMigrationVersion];
	}

	if (all) {
		return legacyVersions;
	}

	return legacyVersions.slice(0, 1);
}

export function isSnapshotOptionalForBlockVersion(
	state: MigrationProjectState,
	block: MigrationProjectState["blocks"][number],
	version: string,
): boolean {
	if (block.layout !== "multi") {
		return false;
	}

	const introducedVersions = [...new Set(state.config.supportedMigrationVersions)]
		.filter((candidateVersion) => hasSnapshotForVersion(state, block, candidateVersion))
		.sort(compareMigrationVersionLabels);
	const firstIntroducedVersion = introducedVersions[0];

	if (!firstIntroducedVersion) {
		return false;
	}

	return compareMigrationVersionLabels(version, firstIntroducedVersion) < 0;
}

export function isLegacySingleBlockProject(
	state: MigrationProjectState,
): boolean {
	return state.blocks.length === 1 && state.blocks[0]?.layout === "legacy";
}

export function getSelectedEntriesByBlock(
	state: MigrationProjectState,
	targetVersions: string[],
	command: "fuzz" | "verify",
) {
	const discoveredEntries = discoverMigrationEntries(state);
	const discoveredEntryKeys = new Set(
		discoveredEntries.map((entry) => `${entry.block.key}:${entry.fromVersion}`),
	);
	const missingEntries = targetVersions.flatMap((version) =>
		state.blocks
			.filter((block) => hasSnapshotForVersion(state, block, version))
			.filter((block) => !discoveredEntryKeys.has(`${block.key}:${version}`))
			.map((block) => ({ block, version })),
	);

	if (missingEntries.length > 0) {
		const missingLabels = missingEntries
			.map(({ block, version }) => `${block.blockName} @ ${version}`)
			.join(", ");
		const missingVersions = [...new Set(missingEntries.map(({ version }) => version))].sort(compareMigrationVersionLabels);
		throw new Error(
			`Missing migration ${command} inputs for ${missingLabels}. ` +
				`Run \`${formatScaffoldCommand(missingVersions)}\` first, then \`wp-typia migrate doctor --all\` if the workspace should already be scaffolded.`,
		);
	}

	return groupEntriesByBlock(
		discoveredEntries.filter((entry) => targetVersions.includes(entry.fromVersion)),
	);
}

export function assertDistinctMigrationEdge(
	command: "diff" | "plan" | "scaffold",
	fromVersion: string,
	toVersion: string,
): void {
	if (fromVersion === toVersion) {
		throw new Error(
			`\`migrate ${command}\` requires different source and target migration versions, but both resolved to ${fromVersion}. ` +
				`Choose an older snapshot with \`--from-migration-version <label>\` or capture a newer schema release with \`wp-typia migrate snapshot --migration-version <label>\` first.`,
		);
	}
}

export function createMigrationPlanNextSteps(
	fromVersion: string,
	targetVersion: string,
	currentVersion: string,
): string[] {
	if (targetVersion !== currentVersion) {
		return [
			formatEdgeCommand("scaffold", fromVersion, targetVersion, currentVersion),
		];
	}

	return [
		formatEdgeCommand("scaffold", fromVersion, targetVersion, currentVersion),
		`wp-typia migrate doctor --from-migration-version ${fromVersion}`,
		`wp-typia migrate verify --from-migration-version ${fromVersion}`,
		`wp-typia migrate fuzz --from-migration-version ${fromVersion}`,
	];
}

export function formatEdgeCommand(
	command: "fixtures" | "scaffold",
	fromVersion: string,
	targetVersion: string,
	currentVersion: string,
): string {
	return targetVersion === currentVersion
		? `wp-typia migrate ${command} --from-migration-version ${fromVersion}`
		: `wp-typia migrate ${command} --from-migration-version ${fromVersion} --to-migration-version ${targetVersion}`;
}

export function createMissingProjectSnapshotMessage(
	state: MigrationProjectState,
	fromVersion: string,
): string {
	const snapshotVersions = [
		...new Set(
			state.blocks.flatMap((block) =>
				getAvailableSnapshotVersionsForBlock(
					state.projectDir,
					state.config.supportedMigrationVersions,
					block,
				),
			),
		),
	].sort(compareMigrationVersionLabels);

	return snapshotVersions.length === 0
		? `No migration block targets have a snapshot for ${fromVersion}. No snapshots exist yet in this project. ` +
				`Run \`wp-typia migrate snapshot --migration-version ${fromVersion}\` first if you want to preserve that schema state.`
		: `No migration block targets have a snapshot for ${fromVersion}. ` +
				`Available snapshot versions in this project: ${snapshotVersions.join(", ")}. ` +
				`Run \`wp-typia migrate snapshot --migration-version ${fromVersion}\` first if you want to preserve that schema state.`;
}

export function formatScaffoldCommand(versions: string[]): string {
	const uniqueVersions = [...new Set(versions)].sort(compareMigrationVersionLabels);
	return uniqueVersions.length === 1
		? `wp-typia migrate scaffold --from-migration-version ${uniqueVersions[0]}`
		: "wp-typia migrate scaffold --from-migration-version <label>";
}

export function collectFixtureTargets(
	state: MigrationProjectState,
	targetVersions: string[],
	targetVersion: string,
) {
	return targetVersions.flatMap((version) =>
		state.blocks
			.filter((block) => hasSnapshotForVersion(state, block, version))
			.map((block) => ({
				block,
				fixturePath: getFixtureFilePath(state.paths, block, version, targetVersion),
				scopedLabel: `${block.key}@${version}`,
				version,
			})),
	);
}

function groupEntriesByBlock(entries: ReturnType<typeof discoverMigrationEntries>): Record<string, typeof entries> {
	return entries.reduce<Record<string, typeof entries>>((accumulator, entry) => {
		if (!accumulator[entry.block.key]) {
			accumulator[entry.block.key] = [];
		}
		accumulator[entry.block.key].push(entry);
		return accumulator;
	}, {});
}
