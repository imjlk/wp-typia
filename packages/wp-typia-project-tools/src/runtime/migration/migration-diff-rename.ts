import type {
	FlattenedAttributeDescriptor,
	ManifestAttribute,
	RenameCandidate,
} from "./migration-types.js";

interface CreateRenameCandidatesOptions {
	addedKeys: string[];
	isUnionRenameCompatible: (
		oldAttribute: ManifestAttribute,
		newAttribute: ManifestAttribute,
	) => boolean;
	newAttributes: Record<string, ManifestAttribute>;
	newLeafAttributes: FlattenedAttributeDescriptor[];
	oldAttributes: Record<string, ManifestAttribute>;
	oldLeafAttributes: FlattenedAttributeDescriptor[];
	removedKeys: string[];
}

export function createRenameCandidates({
	addedKeys,
	isUnionRenameCompatible,
	newAttributes,
	newLeafAttributes,
	oldAttributes,
	oldLeafAttributes,
	removedKeys,
}: CreateRenameCandidatesOptions): RenameCandidate[] {
	const assessments: RenameCandidate[] = [];

	for (const currentPath of addedKeys) {
		const nextAttribute = newAttributes[currentPath];
		if (!nextAttribute) continue;
		for (const legacyPath of removedKeys) {
			const previous = oldAttributes[legacyPath];
			if (!previous) continue;
			const candidate = assessRenameCandidate(
				previous,
				nextAttribute,
				legacyPath,
				currentPath,
				isUnionRenameCompatible,
			);
			if (candidate) {
				assessments.push(candidate);
			}
		}
	}

	const oldLeafMap = new Map(oldLeafAttributes.map((descriptor) => [descriptor.currentPath, descriptor] as const));
	const newLeafMap = new Map(newLeafAttributes.map((descriptor) => [descriptor.currentPath, descriptor] as const));
	const removedLeafDescriptors = oldLeafAttributes.filter((descriptor) => !newLeafMap.has(descriptor.currentPath));
	const addedLeafDescriptors = newLeafAttributes.filter((descriptor) => !oldLeafMap.has(descriptor.currentPath));

	for (const nextDescriptor of addedLeafDescriptors) {
		if (!nextDescriptor.currentPath.includes(".")) {
			continue;
		}
		for (const previousDescriptor of removedLeafDescriptors) {
			if (!previousDescriptor.currentPath.includes(".")) {
				continue;
			}
			const candidate = assessRenameCandidate(
				previousDescriptor.attribute,
				nextDescriptor.attribute,
				previousDescriptor.currentPath,
				nextDescriptor.currentPath,
				isUnionRenameCompatible,
			);
			if (candidate) {
				assessments.push(candidate);
			}
		}
	}

	return assessments
		.map((candidate) => {
			const currentMatches = assessments
				.filter((item) => item.currentPath === candidate.currentPath)
				.sort((left, right) => right.score - left.score);
			const legacyMatches = assessments
				.filter((item) => item.legacyPath === candidate.legacyPath)
				.sort((left, right) => right.score - left.score);
			const currentLeader = currentMatches[0]!;
			const legacyLeader = legacyMatches[0]!;
			const currentHasTie =
				currentMatches.length > 1 && Math.abs((currentMatches[1]?.score ?? 0) - currentLeader.score) < 0.05;
			const legacyHasTie =
				legacyMatches.length > 1 && Math.abs((legacyMatches[1]?.score ?? 0) - legacyLeader.score) < 0.05;

			return {
				...candidate,
				autoApply:
					currentLeader.legacyPath === candidate.legacyPath &&
					legacyLeader.currentPath === candidate.currentPath &&
					!currentHasTie &&
					!legacyHasTie &&
					candidate.score >= 0.6,
			};
		})
		.filter((candidate, index, list) => {
			const firstMatch = list.findIndex(
				(item) => item.currentPath === candidate.currentPath && item.legacyPath === candidate.legacyPath,
			);
			return firstMatch === index;
		})
		.sort((left, right) => right.score - left.score);
}

export function passesNameSimilarityRule(legacyPath: string, currentPath: string): boolean {
	return scoreRenameSimilarity(legacyPath, currentPath) >= 0.6;
}

function isRenameCandidateShapeCompatible(
	oldAttribute: ManifestAttribute | undefined,
	newAttribute: ManifestAttribute | undefined,
	isUnionRenameCompatible: (
		oldAttribute: ManifestAttribute,
		newAttribute: ManifestAttribute,
	) => boolean,
): boolean {
	if (!oldAttribute || !newAttribute || oldAttribute.ts.kind !== newAttribute.ts.kind) {
		return false;
	}

	if (["string", "number", "boolean"].includes(oldAttribute.ts.kind)) {
		return hasRenameCompatibleConstraints(oldAttribute, newAttribute);
	}

	if (oldAttribute.ts.kind === "union") {
		return isUnionRenameCompatible(oldAttribute, newAttribute);
	}

	return false;
}

function assessRenameCandidate(
	oldAttribute: ManifestAttribute | undefined,
	newAttribute: ManifestAttribute | undefined,
	legacyPath: string,
	currentPath: string,
	isUnionRenameCompatible: (
		oldAttribute: ManifestAttribute,
		newAttribute: ManifestAttribute,
	) => boolean,
): RenameCandidate | null {
	if (!isRenameCandidateShapeCompatible(oldAttribute, newAttribute, isUnionRenameCompatible)) {
		return null;
	}

	const baseScore = scoreRenameSimilarity(legacyPath, currentPath);
	const score =
		getParentPath(legacyPath) === getParentPath(currentPath) ? Math.max(baseScore, 0.75) : baseScore;
	return {
		autoApply: false,
		currentPath,
		legacyPath,
		reason: describeRenameReason(oldAttribute!, legacyPath, currentPath, score),
		score,
	};
}

function hasRenameCompatibleConstraints(
	oldAttribute: ManifestAttribute,
	newAttribute: ManifestAttribute,
): boolean {
	const oldEnum = oldAttribute.wp.enum ?? null;
	const nextEnum = newAttribute.wp.enum ?? null;

	if (oldEnum && nextEnum) {
		const oldIsSubset = oldEnum.every((value) => nextEnum.includes(value));
		if (!oldIsSubset) {
			return false;
		}
	} else if (oldEnum && !nextEnum) {
		return false;
	}

	const oldConstraints = oldAttribute.typia.constraints ?? {};
	const nextConstraints = newAttribute.typia.constraints ?? {};

	return [
		compareMinimumBound(oldConstraints.minLength, nextConstraints.minLength),
		compareMaximumBound(oldConstraints.maxLength, nextConstraints.maxLength),
		compareMinimumBound(oldConstraints.minimum, nextConstraints.minimum),
		compareMaximumBound(oldConstraints.maximum, nextConstraints.maximum),
		comparePatternBound(oldConstraints.pattern, nextConstraints.pattern),
		comparePatternBound(oldConstraints.format, nextConstraints.format),
		comparePatternBound(oldConstraints.typeTag, nextConstraints.typeTag),
	].every(Boolean);
}

function compareMinimumBound(oldValue: unknown, nextValue: unknown): boolean {
	if (nextValue === null || nextValue === undefined) return true;
	if (oldValue === null || oldValue === undefined) return true;
	return Number(oldValue) <= Number(nextValue);
}

function compareMaximumBound(oldValue: unknown, nextValue: unknown): boolean {
	if (nextValue === null || nextValue === undefined) return true;
	if (oldValue === null || oldValue === undefined) return true;
	return Number(oldValue) >= Number(nextValue);
}

function comparePatternBound(oldValue: unknown, nextValue: unknown): boolean {
	return oldValue === nextValue || oldValue === null || oldValue === undefined;
}

function scoreRenameSimilarity(legacyPath: string, currentPath: string): number {
	const legacy = normalizeFieldName(legacyPath);
	const current = normalizeFieldName(currentPath);

	if (legacy === current) return 1;
	if (shareAliasGroup(legacy, current)) return 0.9;

	const legacyTokens = tokenizeFieldName(legacy);
	const currentTokens = tokenizeFieldName(current);
	const overlap = legacyTokens.filter((token) => currentTokens.includes(token));
	const jaccard = overlap.length / new Set([...legacyTokens, ...currentTokens]).size;

	if (legacy.includes(current) || current.includes(legacy)) {
		return Math.max(jaccard, 0.7);
	}
	if (
		legacyTokens.length > 0 &&
		currentTokens.length > 0 &&
		legacyTokens[legacyTokens.length - 1] === currentTokens[currentTokens.length - 1]
	) {
		return Math.max(jaccard, 0.6);
	}

	return jaccard;
}

function normalizeFieldName(name: string): string {
	return String(name)
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[^a-zA-Z0-9]+/g, " ")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, "");
}

function tokenizeFieldName(name: string): string[] {
	return String(name)
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
}

function getParentPath(pathLabel: string): string {
	const segments = String(pathLabel).split(".");
	return segments.length <= 1 ? "" : segments.slice(0, -1).join(".");
}

function shareAliasGroup(left: string, right: string): boolean {
	const aliasGroups = [
		["content", "headline", "body", "text", "copy", "message"],
		["id", "uniqueid", "uuid"],
		["visible", "isvisible", "show", "shown", "enabled"],
		["align", "alignment", "textalign"],
		["count", "clickcount", "counter"],
		["url", "href", "link"],
	];

	return aliasGroups.some((group) => group.includes(left) && group.includes(right));
}

function describeRenameReason(
	attribute: ManifestAttribute,
	legacyPath: string,
	currentPath: string,
	score: number,
): string {
	if (attribute.ts.kind === "union") {
		return `compatible discriminated union (${legacyPath} → ${currentPath})`;
	}
	if (score >= 0.9) return "high-confidence compatible field";
	if (score >= 0.6) return "name-similar compatible field";
	return "compatible field requiring review";
}
