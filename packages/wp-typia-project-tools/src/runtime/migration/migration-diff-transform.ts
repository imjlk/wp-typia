import { getAttributeByCurrentPath } from "./migration-manifest.js";
import { passesNameSimilarityRule } from "./migration-diff-rename.js";
import type {
	DiffOutcome,
	FlattenedAttributeDescriptor,
	ManifestAttribute,
	RenameCandidate,
	TransformSuggestion,
} from "./migration-types.js";

interface CreateTransformSuggestionsOptions {
	addedKeys: string[];
	manualItems: DiffOutcome[];
	newAttributes: Record<string, ManifestAttribute>;
	newLeafAttributes: FlattenedAttributeDescriptor[];
	oldAttributes: Record<string, ManifestAttribute>;
	oldLeafAttributes: FlattenedAttributeDescriptor[];
	removedKeys: string[];
	renameCandidates: RenameCandidate[];
}

export function createTransformSuggestions({
	oldAttributes,
	newAttributes,
	addedKeys,
	removedKeys,
	manualItems,
	renameCandidates,
	oldLeafAttributes,
	newLeafAttributes,
}: CreateTransformSuggestionsOptions): TransformSuggestion[] {
	const suggestions: TransformSuggestion[] = [];
	const activeRenameTargets = new Set(
		renameCandidates.filter((candidate) => candidate.autoApply).map((candidate) => candidate.currentPath),
	);
	const oldLeafMap = new Map(oldLeafAttributes.map((descriptor) => [descriptor.currentPath, descriptor] as const));
	const newLeafMap = new Map(newLeafAttributes.map((descriptor) => [descriptor.currentPath, descriptor] as const));

	for (const currentPath of [
		...new Set([
			...Object.keys(newAttributes),
			...manualItems.map((item) => item.path),
			...newLeafAttributes.map((item) => item.currentPath),
		]),
	]) {
		if (activeRenameTargets.has(currentPath)) {
			continue;
		}

		const manualItem = manualItems.find(
			(item) => item.path === currentPath || item.path.startsWith(`${currentPath}.`),
		);
		const currentAttribute =
			newLeafMap.get(currentPath)?.attribute ??
			getAttributeByCurrentPath(newAttributes, currentPath) ??
			null;
		if (!manualItem || !currentAttribute) {
			continue;
		}

		const exactLegacy =
			oldLeafMap.get(currentPath)?.attribute ??
			getAttributeByCurrentPath(oldAttributes, currentPath) ??
			null;
		if (exactLegacy && exactLegacy.ts.kind !== currentAttribute.ts.kind) {
			suggestions.push({
				bodyLines: buildTransformBodyLines(currentAttribute, currentPath),
				attribute: currentAttribute,
				currentPath,
				legacyPath: currentPath,
				reason: `semantic coercion suggested for ${manualItem.kind}`,
			});
			continue;
		}

		const bestRenameCandidate = renameCandidates.find((candidate) => candidate.currentPath === currentPath);
		if (bestRenameCandidate && !bestRenameCandidate.autoApply) {
			suggestions.push({
				bodyLines: buildTransformBodyLines(currentAttribute, bestRenameCandidate.legacyPath),
				attribute: currentAttribute,
				currentPath,
				legacyPath: bestRenameCandidate.legacyPath,
				reason: `review coercion from ${bestRenameCandidate.legacyPath}`,
			});
			continue;
		}

		const addedCurrent =
			addedKeys.includes(currentPath) ||
			(newLeafMap.has(currentPath) && !oldLeafMap.has(currentPath));
		if (!addedCurrent) {
			continue;
		}

		const compatibleLegacyPath = [
			...removedKeys,
			...oldLeafAttributes
				.filter((descriptor) => !newLeafMap.has(descriptor.currentPath))
				.map((descriptor) => descriptor.currentPath),
		].find((legacyPath) => passesNameSimilarityRule(legacyPath, currentPath));
		if (compatibleLegacyPath) {
			suggestions.push({
				bodyLines: buildTransformBodyLines(currentAttribute, compatibleLegacyPath),
				attribute: currentAttribute,
				currentPath,
				legacyPath: compatibleLegacyPath,
				reason: `review coercion from ${compatibleLegacyPath}`,
			});
		}
	}

	return suggestions;
}

export function describeConstraintChange(
	oldAttribute: ManifestAttribute,
	newAttribute: ManifestAttribute,
): string {
	const details: string[] = [];
	const oldConstraints = oldAttribute.typia.constraints;
	const nextConstraints = newAttribute.typia.constraints;

	if (newAttribute.wp.enum && JSON.stringify(newAttribute.wp.enum) !== JSON.stringify(oldAttribute.wp.enum)) {
		details.push("enum changed");
	}
	for (const key of ["minLength", "maxLength", "minimum", "maximum", "pattern", "format", "typeTag"] as const) {
		if (oldConstraints[key] !== nextConstraints[key]) {
			details.push(`${key}: ${oldConstraints[key]} -> ${nextConstraints[key]}`);
		}
	}

	return details.join(", ");
}

function buildTransformBodyLines(
	attribute: ManifestAttribute,
	legacyPath: string,
): string[] {
	switch (attribute.ts.kind) {
		case "string":
			return [`// return typeof legacyValue === "string" ? legacyValue : String(legacyValue ?? "");`];
		case "number":
			return [
				`// const numericValue = typeof legacyValue === "number" ? legacyValue : Number(legacyValue ?? 0);`,
				`// return Number.isNaN(numericValue) ? undefined : numericValue;`,
			];
		case "boolean":
			return [`// return typeof legacyValue === "boolean" ? legacyValue : Boolean(legacyValue);`];
		case "union":
			return [
				`// const legacyObject = typeof legacyValue === "object" && legacyValue !== null ? legacyValue : {};`,
				`// return legacyObject; // adjust discriminator / branch fields before verify`,
			];
		default:
			return [`// return legacyValue; // customize migration from ${legacyPath}`];
	}
}
