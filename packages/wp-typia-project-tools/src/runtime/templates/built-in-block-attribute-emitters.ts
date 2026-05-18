import type {
	JsonValue,
	ManifestAttribute,
	ManifestConstraints,
	ManifestDocument,
} from "../migration/migration-types.js";

/**
 * Default placeholder copy used for generated compound child body fields.
 */
export const DEFAULT_COMPOUND_CHILD_BODY_PLACEHOLDER =
	"Add supporting details for this internal item.";

type StarterManifestSourceType = NonNullable<ManifestAttribute["wp"]["type"]>;
type WordPressAttributeSource = NonNullable<ManifestAttribute["wp"]["source"]>;

interface StarterManifestAttributeDefinition {
	constraints?: Partial<ManifestConstraints>;
	defaultValue?: JsonValue;
	enumValues?: Array<string | number | boolean> | null;
	kind: ManifestAttribute["ts"]["kind"];
	required: boolean;
	selector?: string | null;
	source?: WordPressAttributeSource | null;
	sourceType: StarterManifestSourceType;
}

interface BlockJsonAttributeDefinition {
	defaultValue?: JsonValue;
	enumValues?: Array<string | number | boolean> | null;
	selector?: string;
	source?: WordPressAttributeSource;
	type: StarterManifestSourceType;
}

export interface AttributeDescription {
	lines: string[];
}

/**
 * Emitted attribute metadata shared between block.json, manifest, and type emitters.
 */
export interface EmittedAttributeDefinition {
	blockJson: BlockJsonAttributeDefinition;
	description?: AttributeDescription;
	manifest: StarterManifestAttributeDefinition;
	name: string;
	optional: boolean;
	typeExpression: string;
}

interface BuiltInAttributeSpec {
	blockJsonDefaultValue?: JsonValue;
	constraints?: Partial<ManifestConstraints>;
	defaultValue?: JsonValue;
	description?: AttributeDescription;
	enumValues?: Array<string | number | boolean> | null;
	kind: ManifestAttribute["ts"]["kind"];
	manifestDefaultValue?: JsonValue;
	name: string;
	optional: boolean;
	selector?: string | null;
	source?: WordPressAttributeSource | null;
	sourceType: StarterManifestSourceType;
	typeExpression: string;
}

type BuiltInAttributeValueResolver<TContext, TValue> =
	| TValue
	| ((context: TContext) => TValue);

export interface BuiltInAttributeTemplateSpec<TContext> {
	attributeType: "boolean" | "number" | "string";
	blockJsonDefaultValue?: BuiltInAttributeValueResolver<
		TContext,
		JsonValue | undefined
	>;
	constraints?: BuiltInAttributeValueResolver<
		TContext,
		Partial<ManifestConstraints> | undefined
	>;
	defaultValue?: BuiltInAttributeValueResolver<TContext, JsonValue | undefined>;
	description?: BuiltInAttributeValueResolver<
		TContext,
		AttributeDescription | undefined
	>;
	enumValues?: BuiltInAttributeValueResolver<
		TContext,
		Array<string | number | boolean> | null | undefined
	>;
	manifestDefaultValue?: BuiltInAttributeValueResolver<
		TContext,
		JsonValue | undefined
	>;
	name: string;
	optional: boolean;
	selector?: BuiltInAttributeValueResolver<TContext, string | null | undefined>;
	source?: BuiltInAttributeValueResolver<
		TContext,
		WordPressAttributeSource | null | undefined
	>;
	typeExpression: BuiltInAttributeValueResolver<TContext, string>;
}

function createConstraints(
	overrides: Partial<ManifestConstraints> = {},
): ManifestConstraints {
	return {
		exclusiveMaximum: null,
		exclusiveMinimum: null,
		format: null,
		maxLength: null,
		maxItems: null,
		maximum: null,
		minLength: null,
		minItems: null,
		minimum: null,
		multipleOf: null,
		pattern: null,
		typeTag: null,
		...overrides,
	};
}

function createManifestAttribute({
	constraints,
	defaultValue,
	enumValues = null,
	kind,
	required,
	selector = null,
	source = null,
	sourceType,
}: StarterManifestAttributeDefinition): ManifestAttribute {
	const hasDefault = defaultValue !== undefined;

	return {
		ts: {
			items: null,
			kind,
			properties: null,
			required,
			union: null,
		},
		typia: {
			constraints: createConstraints(constraints),
			defaultValue: hasDefault ? defaultValue : null,
			hasDefault,
		},
		wp: {
			defaultValue: hasDefault ? defaultValue : null,
			enum: enumValues,
			hasDefault,
			...(selector ? { selector } : {}),
			...(source ? { source } : {}),
			type: sourceType,
		},
	};
}

function createBlockJsonAttribute({
	defaultValue,
	enumValues = null,
	selector,
	source,
	type,
}: BlockJsonAttributeDefinition): Record<string, unknown> {
	const attribute: Record<string, unknown> = {
		type,
	};

	if (defaultValue !== undefined) {
		attribute.default = defaultValue;
	}
	if (enumValues !== null && enumValues.length > 0) {
		attribute.enum = enumValues;
	}
	if (source) {
		attribute.source = source;
	}
	if (selector) {
		attribute.selector = selector;
	}

	return attribute;
}

export function describe(...lines: string[]): AttributeDescription {
	return {
		lines,
	};
}

function defineAttribute({
	blockJsonDefaultValue,
	constraints,
	defaultValue,
	description,
	enumValues = null,
	kind,
	manifestDefaultValue,
	name,
	optional,
	selector = null,
	source = null,
	sourceType,
	typeExpression,
}: BuiltInAttributeSpec): EmittedAttributeDefinition {
	const resolvedBlockJsonDefaultValue =
		blockJsonDefaultValue !== undefined ? blockJsonDefaultValue : defaultValue;
	const resolvedManifestDefaultValue =
		manifestDefaultValue !== undefined ? manifestDefaultValue : defaultValue;

	return {
		blockJson: {
			defaultValue: resolvedBlockJsonDefaultValue,
			enumValues,
			...(selector ? { selector } : {}),
			...(source ? { source } : {}),
			type: sourceType,
		},
		description,
		manifest: {
			constraints,
			defaultValue: resolvedManifestDefaultValue,
			enumValues,
			kind,
			required: !optional,
			selector,
			source,
			sourceType,
		},
		name,
		optional,
		typeExpression,
	};
}

function defineStringAttribute(
	spec: Omit<BuiltInAttributeSpec, "kind" | "sourceType">,
): EmittedAttributeDefinition {
	return defineAttribute({
		...spec,
		kind: "string",
		sourceType: "string",
	});
}

function defineBooleanAttribute(
	spec: Omit<BuiltInAttributeSpec, "kind" | "sourceType">,
): EmittedAttributeDefinition {
	return defineAttribute({
		...spec,
		kind: "boolean",
		sourceType: "boolean",
	});
}

function defineNumberAttribute(
	spec: Omit<BuiltInAttributeSpec, "kind" | "sourceType">,
): EmittedAttributeDefinition {
	return defineAttribute({
		...spec,
		kind: "number",
		sourceType: "number",
	});
}

function resolveBuiltInAttributeValue<TContext, TValue>(
	value: BuiltInAttributeValueResolver<TContext, TValue> | undefined,
	context: TContext,
): TValue | undefined {
	if (typeof value === "function") {
		return (value as (context: TContext) => TValue)(context);
	}

	return value;
}

export function buildAttributesFromSpecs<TContext>(
	specs: readonly BuiltInAttributeTemplateSpec<TContext>[],
	context: TContext,
): EmittedAttributeDefinition[] {
	return specs.map((spec) => {
		const resolvedSpec: Omit<BuiltInAttributeSpec, "kind" | "sourceType"> = {
			blockJsonDefaultValue: resolveBuiltInAttributeValue(
				spec.blockJsonDefaultValue,
				context,
			),
			constraints: resolveBuiltInAttributeValue(spec.constraints, context),
			defaultValue: resolveBuiltInAttributeValue(spec.defaultValue, context),
			description: resolveBuiltInAttributeValue(spec.description, context),
			enumValues: resolveBuiltInAttributeValue(spec.enumValues, context),
			manifestDefaultValue: resolveBuiltInAttributeValue(
				spec.manifestDefaultValue,
				context,
			),
			name: spec.name,
			optional: spec.optional,
			selector: resolveBuiltInAttributeValue(spec.selector, context),
			source: resolveBuiltInAttributeValue(spec.source, context),
			typeExpression: resolveBuiltInAttributeValue(
				spec.typeExpression,
				context,
			) ?? "unknown",
		};

		if (spec.attributeType === "boolean") {
			return defineBooleanAttribute(resolvedSpec);
		}

		if (spec.attributeType === "number") {
			return defineNumberAttribute(resolvedSpec);
		}

		return defineStringAttribute(resolvedSpec);
	});
}

/**
 * Builds the manifest document for a generated built-in block artifact.
 *
 * @param sourceType Generated TypeScript source type name referenced by the manifest.
 * @param attributes Emitted attribute definitions used to populate the manifest.
 * @returns A starter manifest document for the generated block.
 */
export function buildManifestDocument(
	sourceType: string,
	attributes: readonly EmittedAttributeDefinition[],
): ManifestDocument {
	return {
		attributes: Object.fromEntries(
			attributes.map((attribute) => [
				attribute.name,
				createManifestAttribute(attribute.manifest),
			]),
		),
		manifestVersion: 2,
		sourceType,
	};
}

/**
 * Builds the block.json attributes object for a generated built-in block artifact.
 *
 * @param attributes Emitted attribute definitions used to populate block.json.
 * @returns A block.json-compatible attributes record.
 */
export function buildBlockJsonAttributes(
	attributes: readonly EmittedAttributeDefinition[],
): Record<string, Record<string, unknown>> {
	return Object.fromEntries(
		attributes.map((attribute) => [
			attribute.name,
			createBlockJsonAttribute(attribute.blockJson),
		]),
	);
}
