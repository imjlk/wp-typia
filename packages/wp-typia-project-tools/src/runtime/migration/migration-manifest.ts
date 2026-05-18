import type {
	FlattenedAttributeDescriptor,
	JsonValue,
	ManifestAttribute,
	ManifestDocument,
	ManifestSummary,
	UnionBranchSummary,
} from "./migration-types.js";

interface FlattenContext {
	rootPath: string;
	unionBranch: string | null;
	unionDiscriminator: string | null;
	unionRoot: string | null;
}

type ManifestDefaultValue = ManifestAttribute["typia"]["defaultValue"] | JsonValue[] | Record<string, JsonValue>;

export function flattenManifestLeafAttributes(
	attributes: Record<string, ManifestAttribute>,
): FlattenedAttributeDescriptor[] {
	return Object.entries(attributes).flatMap(([key, attribute]) =>
		flattenManifestAttribute(attribute, key, key, {
			rootPath: key,
			unionBranch: null,
			unionDiscriminator: null,
			unionRoot: null,
		}),
	);
}

export function flattenManifestAttribute(
	attribute: ManifestAttribute | undefined | null,
	currentPath: string,
	sourcePath: string,
	context: FlattenContext,
): FlattenedAttributeDescriptor[] {
	if (!attribute) {
		return [];
	}

	if (attribute.ts.kind === "object") {
		const properties = Object.entries(attribute.ts.properties ?? {});
		if (properties.length === 0) {
			return [{ ...context, attribute, currentPath, sourcePath }];
		}

		return properties.flatMap(([key, property]) =>
			flattenManifestAttribute(property, `${currentPath}.${key}`, `${sourcePath}.${key}`, {
				...context,
			}),
		);
	}

	if (attribute.ts.kind === "union" && attribute.ts.union) {
		const unionMetadata = attribute.ts.union;
		return Object.entries(attribute.ts.union.branches ?? {}).flatMap(([branchKey, branchAttribute]) =>
			Object.entries(branchAttribute.ts.properties ?? {})
				.filter(([key]) => key !== unionMetadata.discriminator)
				.flatMap(([key, property]) =>
					flattenManifestAttribute(property, `${currentPath}.${branchKey}.${key}`, `${sourcePath}.${key}`, {
						rootPath: context.rootPath,
						unionBranch: branchKey,
						unionDiscriminator: unionMetadata.discriminator,
						unionRoot: currentPath,
					}),
				),
		);
	}

	return [{ ...context, attribute, currentPath, sourcePath }];
}

export function getAttributeByCurrentPath(
	attributes: Record<string, ManifestAttribute>,
	currentPath: string,
): ManifestAttribute | null {
	const segments = String(currentPath).split(".");
	const rootKey = segments.shift();
	if (!rootKey) {
		return null;
	}

	let attribute = attributes[rootKey] ?? null;
	while (attribute && segments.length > 0) {
		if (attribute.ts.kind === "union" && attribute.ts.union) {
			const branchKey = segments.shift();
			if (!branchKey || !(branchKey in attribute.ts.union.branches)) {
				return null;
			}
			attribute = attribute.ts.union.branches[branchKey];
			continue;
		}

		if (attribute.ts.kind === "object" && attribute.ts.properties) {
			const propertyKey = segments.shift();
			if (!propertyKey || !(propertyKey in attribute.ts.properties)) {
				return null;
			}
			attribute = attribute.ts.properties[propertyKey];
			continue;
		}

		return null;
	}

	return attribute;
}

export function hasManifestDefault(attribute: ManifestAttribute | undefined | null): boolean {
	return attribute?.typia?.hasDefault === true;
}

export function getManifestDefaultValue(attribute: ManifestAttribute | undefined | null) {
	return attribute?.typia?.defaultValue ?? null;
}

export function summarizeManifest(manifest: ManifestDocument): ManifestSummary {
	return {
		attributes: Object.fromEntries(
			Object.entries(manifest.attributes ?? {}).map(([name, attribute]) => [
				name,
				{
					constraints: attribute.typia?.constraints ?? {},
					defaultValue: attribute.typia?.defaultValue ?? null,
					hasDefault: attribute.typia?.hasDefault ?? false,
					enum: attribute.wp?.enum ?? null,
					kind: attribute.ts?.kind ?? null,
					required: attribute.ts?.required ?? false,
					union: attribute.ts?.union ?? null,
				},
			]),
		),
		manifestVersion: manifest.manifestVersion ?? null,
		sourceType: manifest.sourceType ?? null,
	};
}

export function summarizeUnionBranches(manifestSummary: ManifestSummary): UnionBranchSummary[] {
	if (!manifestSummary?.attributes) {
		return [];
	}

	return Object.entries(manifestSummary.attributes)
		.filter(([, attribute]) => attribute.kind === "union" && attribute.union)
		.map(([field, attribute]) => ({
			branches: Object.keys(attribute.union?.branches ?? {}),
			discriminator: attribute.union?.discriminator ?? null,
			field,
		}));
}

export function defaultValueForManifestAttribute(attribute: ManifestAttribute): ManifestDefaultValue | null {
	if (attribute.typia?.hasDefault) {
		return attribute.typia.defaultValue;
	}
	if (attribute.wp?.enum && attribute.wp.enum.length > 0) {
		return attribute.wp.enum[0] ?? null;
	}
	switch (attribute.ts.kind) {
		case "string":
			return "";
		case "number":
			return 0;
		case "boolean":
			return false;
		case "array":
			return [];
		case "object": {
			const result: Record<string, JsonValue> = {};
			for (const [key, property] of Object.entries(attribute.ts.properties ?? {})) {
				result[key] = defaultValueForManifestAttribute(property) as JsonValue;
			}
			return result;
		}
		case "union": {
			const firstBranch = Object.values(attribute.ts.union?.branches ?? {})[0];
			return firstBranch ? defaultValueForManifestAttribute(firstBranch) : null;
		}
		default:
			return null;
	}
}
