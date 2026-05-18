import fs from "node:fs";
import {
	flattenManifestLeafAttributes,
	getManifestDefaultValue,
	hasManifestDefault,
} from "./migration-manifest.js";
import { createRenameCandidates } from "./migration-diff-rename.js";
import {
	createTransformSuggestions,
	describeConstraintChange,
} from "./migration-diff-transform.js";
import {
	createMissingBlockSnapshotMessage,
	getAvailableSnapshotVersionsForBlock,
	getSnapshotManifestPath,
} from "./migration-project.js";
import { isNumber, readJson } from "./migration-utils.js";
import type {
	DiffOutcome,
	ManifestAttribute,
	ManifestDocument,
	MigrationBlockConfig,
	MigrationDiff,
	MigrationProjectState,
	ResolvedMigrationBlockTarget,
} from "./migration-types.js";

export function createMigrationDiff(
	state: MigrationProjectState,
	blockOrFromVersion: MigrationBlockConfig | ResolvedMigrationBlockTarget | string,
	fromVersionOrToVersion: string,
	maybeToVersion?: string,
): MigrationDiff {
	if (typeof blockOrFromVersion === "string" && state.blocks.length > 1) {
		throw new Error("A block key is required when diffing a multi-block migration project.");
	}

	const block =
		typeof blockOrFromVersion === "string"
			? state.blocks[0]
			: state.blocks.find((entry) => entry.key === blockOrFromVersion.key) ?? null;
	const fromVersion =
		typeof blockOrFromVersion === "string"
			? blockOrFromVersion
			: fromVersionOrToVersion;
	const toVersion =
		typeof blockOrFromVersion === "string"
			? fromVersionOrToVersion
			: maybeToVersion ?? state.config.currentMigrationVersion;
	if (!block) {
		throw new Error(
			typeof blockOrFromVersion === "string"
				? "No migration block targets are configured for this project."
				: `Unknown migration block key: ${blockOrFromVersion.key}`,
		);
	}

	const snapshotManifestPath = getSnapshotManifestPath(state.projectDir, block, fromVersion);
	if (!fs.existsSync(snapshotManifestPath)) {
		throw new Error(
			createMissingBlockSnapshotMessage(
				block.blockName,
				fromVersion,
				getAvailableSnapshotVersionsForBlock(
					state.projectDir,
					state.config.supportedMigrationVersions,
					block,
				),
			),
		);
	}

	const targetManifest: ManifestDocument =
		toVersion === state.config.currentMigrationVersion
			? block.currentManifest
			: readJson<ManifestDocument>(getSnapshotManifestPath(state.projectDir, block, toVersion));

	const oldManifest = readJson<ManifestDocument>(snapshotManifestPath);
	const oldAttributes = oldManifest.attributes ?? {};
	const newAttributes = targetManifest.attributes ?? {};
	const oldLeafAttributes = flattenManifestLeafAttributes(oldAttributes);
	const newLeafAttributes = flattenManifestLeafAttributes(newAttributes);
	const autoItems: DiffOutcome[] = [];
	const manualItems: DiffOutcome[] = [];
	const addedKeys: string[] = [];
	const removedKeys: string[] = [];

	for (const [key, newAttribute] of Object.entries(newAttributes)) {
		const oldAttribute = oldAttributes[key];

		if (!oldAttribute) {
			addedKeys.push(key);
			if (newAttribute.ts.required && !hasManifestDefault(newAttribute)) {
				manualItems.push({
					detail: "required field has no default in current schema",
					kind: "required-addition",
					path: key,
					status: "manual",
				});
			} else {
				autoItems.push({
					detail: hasManifestDefault(newAttribute)
						? `default ${JSON.stringify(getManifestDefaultValue(newAttribute))}`
						: "optional addition",
					kind: hasManifestDefault(newAttribute) ? "add-default" : "add-optional",
					path: key,
					status: "auto",
				});
			}
			continue;
		}

		const outcome = compareManifestAttribute(oldAttribute, newAttribute, key);
		if (outcome.status === "manual") {
			manualItems.push(outcome);
		} else {
			autoItems.push(outcome);
		}
	}

	for (const key of Object.keys(oldAttributes)) {
		if (!(key in newAttributes)) {
			removedKeys.push(key);
			autoItems.push({
				detail: "field removed from current schema",
				kind: "drop",
				path: key,
				status: "auto",
			});
		}
	}

	const renameCandidates = createRenameCandidates({
		addedKeys,
		isUnionRenameCompatible: (oldAttribute, newAttribute) =>
			compareUnionAttribute(oldAttribute, newAttribute, "$rename").status === "auto",
		newAttributes,
		newLeafAttributes,
		oldAttributes,
		oldLeafAttributes,
		removedKeys,
	});
	const activeRenameCandidates = renameCandidates.filter((candidate) => candidate.autoApply);

	for (const candidate of activeRenameCandidates) {
		removeOutcomeByPath(autoItems, candidate.legacyPath, "drop");
		removeOutcomeByPath(autoItems, candidate.currentPath, "add-default");
		removeOutcomeByPath(autoItems, candidate.currentPath, "add-optional");
		removeOutcomeByPath(manualItems, candidate.currentPath, "required-addition");
		removeOutcomesByPath(manualItems, candidate.currentPath);
		autoItems.push({
			detail: `legacy field ${candidate.legacyPath}`,
			kind: "rename",
			path: candidate.currentPath,
			status: "auto",
		});
	}

	const transformSuggestions = createTransformSuggestions({
		addedKeys,
		manualItems,
		newAttributes,
		newLeafAttributes,
		oldAttributes,
		oldLeafAttributes,
		renameCandidates,
		removedKeys,
	});

	return {
		currentTypeName: targetManifest.sourceType ?? block.currentManifest.sourceType,
		fromVersion,
		summary: {
			auto: autoItems.length,
			autoItems,
			manual: manualItems.length,
			manualItems,
			renameCandidates,
			transformSuggestions,
		},
		toVersion,
	};
}

function removeOutcomeByPath(items: DiffOutcome[], pathLabel: string, kind: string): void {
	const index = items.findIndex((item) => item.path === pathLabel && item.kind === kind);
	if (index >= 0) {
		items.splice(index, 1);
	}
}

function removeOutcomesByPath(items: DiffOutcome[], pathLabel: string): void {
	for (let index = items.length - 1; index >= 0; index -= 1) {
		if (items[index]?.path === pathLabel) {
			items.splice(index, 1);
		}
	}
}

function compareManifestAttribute(
	oldAttribute: ManifestAttribute,
	newAttribute: ManifestAttribute,
	attributePath: string,
): DiffOutcome {
	if (oldAttribute.ts.kind !== newAttribute.ts.kind) {
		return manualOutcome(attributePath, "type-change", `${oldAttribute.ts.kind} -> ${newAttribute.ts.kind}`);
	}

	if (oldAttribute.ts.kind === "union") {
		return compareUnionAttribute(oldAttribute, newAttribute, attributePath);
	}

	if (oldAttribute.ts.kind === "object") {
		return compareObjectAttribute(oldAttribute, newAttribute, attributePath);
	}

	if (oldAttribute.ts.kind === "array") {
		if (!oldAttribute.ts.items || !newAttribute.ts.items) {
			return autoOutcome(attributePath, "copy", "array shape unchanged");
		}
		const nested = compareManifestAttribute(oldAttribute.ts.items, newAttribute.ts.items, `${attributePath}[]`);
		return nested.status === "manual"
			? nested
			: autoOutcome(attributePath, "hydrate", "array items can be normalized");
	}

	if (hasStricterConstraints(oldAttribute, newAttribute)) {
		return manualOutcome(
			attributePath,
			"stricter-constraints",
			describeConstraintChange(oldAttribute, newAttribute),
		);
	}

	return autoOutcome(attributePath, "copy", "compatible primitive field");
}

function compareObjectAttribute(
	oldAttribute: ManifestAttribute,
	newAttribute: ManifestAttribute,
	attributePath: string,
): DiffOutcome {
	const oldProperties = oldAttribute.ts.properties ?? {};
	const newProperties = newAttribute.ts.properties ?? {};

	for (const [key, nextProperty] of Object.entries(newProperties)) {
		const previousProperty = oldProperties[key];
		if (!previousProperty) {
			if (nextProperty.ts.required && !hasManifestDefault(nextProperty)) {
				return manualOutcome(
					`${attributePath}.${key}`,
					"object-change",
					"required field has no default in current schema",
				);
			}
			continue;
		}

		const nested = compareManifestAttribute(previousProperty, nextProperty, `${attributePath}.${key}`);
		if (nested.status === "manual") {
			return nested;
		}
	}

	return autoOutcome(attributePath, "hydrate", "object can be normalized with current manifest defaults");
}

function compareUnionAttribute(
	oldAttribute: ManifestAttribute,
	newAttribute: ManifestAttribute,
	attributePath: string,
): DiffOutcome {
	const oldUnion = oldAttribute.ts.union;
	const newUnion = newAttribute.ts.union;

	if (!oldUnion || !newUnion) {
		return manualOutcome(attributePath, "union-change", "missing union metadata");
	}
	if (oldUnion.discriminator !== newUnion.discriminator) {
		return manualOutcome(
			attributePath,
			"union-discriminator-change",
			`${oldUnion.discriminator} -> ${newUnion.discriminator}`,
		);
	}

	const oldBranchKeys = Object.keys(oldUnion.branches);
	const newBranchKeys = Object.keys(newUnion.branches);

	for (const branchKey of oldBranchKeys) {
		if (!(branchKey in newUnion.branches)) {
			return manualOutcome(attributePath, "union-branch-removal", `branch ${branchKey} was removed`);
		}

		const nested = compareManifestAttribute(
			oldUnion.branches[branchKey]!,
			newUnion.branches[branchKey]!,
			`${attributePath}.${branchKey}`,
		);
		if (nested.status === "manual") {
			return manualOutcome(
				nested.path,
				nested.kind.startsWith("union-") ? nested.kind : "union-manual",
				nested.detail ?? `branch ${branchKey} requires manual review`,
			);
		}
	}

	const addedBranches = newBranchKeys.filter((branchKey) => !(branchKey in oldUnion.branches));
	if (addedBranches.length > 0) {
		return autoOutcome(attributePath, "union-branch-addition", `branches added: ${addedBranches.join(", ")}`);
	}

	return autoOutcome(attributePath, "copy", "compatible discriminated union");
}

function hasStricterConstraints(oldAttribute: ManifestAttribute, newAttribute: ManifestAttribute): boolean {
	const oldConstraints = oldAttribute.typia.constraints;
	const nextConstraints = newAttribute.typia.constraints;
	const oldEnum = oldAttribute.wp.enum ?? null;
	const nextEnum = newAttribute.wp.enum ?? null;

	if (nextEnum && (!oldEnum || !oldEnum.every((value) => nextEnum.includes(value)))) {
		return true;
	}
	if (
		isNumber(nextConstraints.minLength) &&
		(!isNumber(oldConstraints.minLength) || nextConstraints.minLength > oldConstraints.minLength)
	) {
		return true;
	}
	if (
		isNumber(nextConstraints.maxLength) &&
		(!isNumber(oldConstraints.maxLength) || nextConstraints.maxLength < oldConstraints.maxLength)
	) {
		return true;
	}
	if (
		isNumber(nextConstraints.minimum) &&
		(!isNumber(oldConstraints.minimum) || nextConstraints.minimum > oldConstraints.minimum)
	) {
		return true;
	}
	if (
		isNumber(nextConstraints.maximum) &&
		(!isNumber(oldConstraints.maximum) || nextConstraints.maximum < oldConstraints.maximum)
	) {
		return true;
	}
	if (nextConstraints.pattern && nextConstraints.pattern !== oldConstraints.pattern) {
		return true;
	}
	if (nextConstraints.format && nextConstraints.format !== oldConstraints.format) {
		return true;
	}
	if (nextConstraints.typeTag && nextConstraints.typeTag !== oldConstraints.typeTag) {
		return true;
	}

	return false;
}

function autoOutcome(pathLabel: string, kind: string, detail: string): DiffOutcome {
	return { detail, kind, path: pathLabel, status: "auto" };
}

function manualOutcome(pathLabel: string, kind: string, detail: string): DiffOutcome {
	return { detail, kind, path: pathLabel, status: "manual" };
}
