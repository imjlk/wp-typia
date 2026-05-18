import type {
	DiffOutcome,
	MigrationDiff,
	MigrationRiskBucket,
	MigrationRiskSummary,
	RenameCandidate,
	TransformSuggestion,
} from "./migration-types.js";

function createRiskBucket(items: string[]): MigrationRiskBucket {
	return {
		count: items.length,
		items,
	};
}

function formatDiffOutcome(item: DiffOutcome): string {
	return `${item.path}: ${item.kind}${item.detail ? ` (${item.detail})` : ""}`;
}

function formatRenameCandidate(candidate: RenameCandidate): string {
	return `${candidate.currentPath} <- ${candidate.legacyPath} (${candidate.autoApply ? "auto" : "review"}, ${candidate.reason})`;
}

function formatTransformSuggestion(suggestion: TransformSuggestion): string {
	return `${suggestion.currentPath}${suggestion.legacyPath ? ` <- ${suggestion.legacyPath}` : ""} (${suggestion.reason})`;
}

function unique(items: string[]): string[] {
	return [...new Set(items)];
}

export function createEmptyMigrationRiskSummary(): MigrationRiskSummary {
	return {
		additive: createRiskBucket([]),
		rename: createRiskBucket([]),
		semanticTransform: createRiskBucket([]),
		unionBreaking: createRiskBucket([]),
	};
}

export function formatMigrationRiskSummary(summary: MigrationRiskSummary): string {
	return `additive=${summary.additive.count}, rename=${summary.rename.count}, semanticTransform=${summary.semanticTransform.count}, unionBreaking=${summary.unionBreaking.count}`;
}

export function createMigrationRiskSummary(diff: MigrationDiff): MigrationRiskSummary {
	const additiveKinds = new Set([
		"add-default",
		"add-optional",
		"drop",
		"hydrate",
		"union-branch-addition",
	]);

	const additiveItems = unique(
		diff.summary.autoItems
			.filter((item) => additiveKinds.has(item.kind))
			.map(formatDiffOutcome),
	);
	const renameItems = unique(diff.summary.renameCandidates.map(formatRenameCandidate));
	const semanticTransformItems = unique(
		diff.summary.transformSuggestions.map(formatTransformSuggestion),
	);
	const unionBreakingItems = unique(
		diff.summary.manualItems
			.filter((item) => item.kind.startsWith("union-"))
			.map(formatDiffOutcome),
	);

	return {
		additive: createRiskBucket(additiveItems),
		rename: createRiskBucket(renameItems),
		semanticTransform: createRiskBucket(semanticTransformItems),
		unionBreaking: createRiskBucket(unionBreakingItems),
	};
}
