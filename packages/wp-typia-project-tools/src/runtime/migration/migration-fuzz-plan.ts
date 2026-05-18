import { flattenManifestLeafAttributes } from "./migration-manifest.js";
import type {
	ManifestDocument,
	MigrationDiff,
	MigrationFuzzMapping,
	MigrationFuzzPlan,
} from "./migration-types.js";

function isBlockedPath(pathLabel: string, blockedPaths: readonly string[]): boolean {
	return blockedPaths.some((blockedPath) => pathLabel === blockedPath || pathLabel.startsWith(`${blockedPath}.`));
}

function unique(items: string[]): string[] {
	return [...new Set(items)];
}

export function createMigrationFuzzPlan(
	legacyManifest: ManifestDocument,
	currentManifest: ManifestDocument,
	diff: MigrationDiff,
): MigrationFuzzPlan {
	const legacyLeafMap = new Map(
		flattenManifestLeafAttributes(legacyManifest.attributes ?? {}).map((descriptor) => [
			descriptor.currentPath,
			descriptor,
		] as const),
	);
	const currentLeafDescriptors = flattenManifestLeafAttributes(currentManifest.attributes ?? {});
	const autoRenameMap = new Map(
		diff.summary.renameCandidates
			.filter((candidate) => candidate.autoApply)
			.map((candidate) => [candidate.currentPath, candidate.legacyPath] as const),
	);
	const blockedPaths = unique([
		...diff.summary.manualItems.map((item) => item.path),
		...diff.summary.transformSuggestions.map((item) => item.currentPath),
		...diff.summary.renameCandidates
			.filter((candidate) => !candidate.autoApply)
			.map((candidate) => candidate.currentPath),
	]);
	const compatibleMappings: MigrationFuzzMapping[] = [];

	for (const descriptor of currentLeafDescriptors) {
		const currentPath = descriptor.currentPath;
		if (isBlockedPath(currentPath, blockedPaths)) {
			continue;
		}

		const legacyPath = autoRenameMap.get(currentPath) ?? currentPath;
		const legacyDescriptor = legacyLeafMap.get(legacyPath);
		if (!legacyDescriptor) {
			continue;
		}

		if (legacyDescriptor.attribute.ts.kind !== descriptor.attribute.ts.kind) {
			continue;
		}

		if (!["string", "number", "boolean"].includes(descriptor.attribute.ts.kind)) {
			continue;
		}

		compatibleMappings.push({
			currentPath,
			legacyPath,
		});
	}

	return {
		blockedPaths,
		compatibleMappings,
	};
}
