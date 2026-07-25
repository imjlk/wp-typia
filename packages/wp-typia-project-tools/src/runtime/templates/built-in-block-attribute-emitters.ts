import type {
  JsonValue,
  ManifestAttribute,
  ManifestConstraints,
  ManifestDocument,
} from '../migration/migration-types.js';

/**
 * Default placeholder copy used for generated compound child body fields.
 */
export const DEFAULT_COMPOUND_CHILD_BODY_PLACEHOLDER =
	'Add supporting details for this internal item.';

const EXAMPLE_UUID = '00000000-0000-4000-8000-000000000000';
const STRING_EXAMPLES_BY_FORMAT: Readonly<Record<string, string>> = {
  date: '2026-01-01',
  'date-time': '2026-01-01T00:00:00.000Z',
  email: 'example@example.com',
  hostname: 'example.com',
  ipv4: '192.0.2.1',
  ipv6: '2001:db8::1',
  time: '00:00:00Z',
  uri: 'https://example.com/',
  uuid: EXAMPLE_UUID,
};

type StarterManifestSourceType = NonNullable<ManifestAttribute['wp']['type']>;
type WordPressAttributeSource = NonNullable<ManifestAttribute['wp']['source']>;

interface StarterManifestAttributeDefinition {
  constraints?: Partial<ManifestConstraints>;
  defaultValue?: JsonValue;
  enumValues?: Array<string | number | boolean> | null;
  kind: ManifestAttribute['ts']['kind'];
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

function createNumberExampleValue(
	attributeName: string,
	constraints: Partial<ManifestConstraints> | undefined,
): number {
  const minimum = constraints?.minimum ?? Number.NEGATIVE_INFINITY;
  const exclusiveMinimum =
		constraints?.exclusiveMinimum ?? Number.NEGATIVE_INFINITY;
  const maximum = constraints?.maximum ?? Number.POSITIVE_INFINITY;
  const exclusiveMaximum =
		constraints?.exclusiveMaximum ?? Number.POSITIVE_INFINITY;
  const lowerBound = Math.max(minimum, exclusiveMinimum);
  const upperBound = Math.min(maximum, exclusiveMaximum);
  const lowerIsExclusive = exclusiveMinimum >= minimum;
  const upperIsExclusive = exclusiveMaximum <= maximum;

  if (
		lowerBound > upperBound ||
		(lowerBound === upperBound && (lowerIsExclusive || upperIsExclusive))
	) {
    throw new Error(
      `Built-in block attribute "${attributeName}" has incompatible numeric bounds.`,
    );
  }

  let candidate = 0;
  if (
		candidate < lowerBound ||
		(candidate === lowerBound && lowerIsExclusive) ||
		candidate > upperBound ||
		(candidate === upperBound && upperIsExclusive)
	) {
    if (Number.isFinite(lowerBound) && Number.isFinite(upperBound)) {
      candidate =
				lowerBound === upperBound
          ? lowerBound
          : lowerBound / 2 + upperBound / 2;
    } else if (Number.isFinite(lowerBound)) {
      candidate = lowerIsExclusive ? lowerBound + 1 : lowerBound;
    } else if (Number.isFinite(upperBound)) {
      candidate = upperIsExclusive ? upperBound - 1 : upperBound;
    }
  }

  return candidate;
}

/**
 * Resolves a deterministic preview value from defaults, enums, scalar kinds,
 * and the supported built-in constraint formats, in that priority order.
 */
function createBlockJsonExampleValue(
	attribute: EmittedAttributeDefinition,
): JsonValue {
  const { constraints, defaultValue, enumValues } = attribute.manifest;
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  if (enumValues && enumValues.length > 0) {
    return enumValues[0];
  }
  if (attribute.manifest.kind === 'boolean') {
    return true;
  }
  if (attribute.manifest.kind === 'number') {
    return createNumberExampleValue(attribute.name, constraints);
  }
  if (attribute.manifest.kind === 'array') {
    return [];
  }
  if (attribute.manifest.kind === 'object') {
    return {};
  }
  if (attribute.manifest.kind === 'union') {
    return null;
  }

  const format = constraints?.format;
  const formattedExample = format
    ? STRING_EXAMPLES_BY_FORMAT[format]
    : undefined;
  if (formattedExample) {
    return formattedExample;
  }

  const example = `Example ${attribute.name}`;
  const minLength = constraints?.minLength ?? 0;
  return example.length >= minLength ? example : example.padEnd(minLength, '_');
}

interface BuiltInAttributeSpec {
  blockJsonDefaultValue?: JsonValue;
  constraints?: Partial<ManifestConstraints>;
  defaultValue?: JsonValue;
  description?: AttributeDescription;
  enumValues?: Array<string | number | boolean> | null;
  kind: ManifestAttribute['ts']['kind'];
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
  attributeType: 'boolean' | 'number' | 'string';
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
    typia: {
      constraints: createConstraints(constraints),
      defaultValue: hasDefault ? defaultValue : null,
      hasDefault,
    },
    ts: {
      items: null,
      kind,
      properties: null,
      required,
      union: null,
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
	spec: Omit<BuiltInAttributeSpec, 'kind' | 'sourceType'>,
): EmittedAttributeDefinition {
  return defineAttribute({
    ...spec,
    kind: 'string',
    sourceType: 'string',
  });
}

function defineBooleanAttribute(
	spec: Omit<BuiltInAttributeSpec, 'kind' | 'sourceType'>,
): EmittedAttributeDefinition {
  return defineAttribute({
    ...spec,
    kind: 'boolean',
    sourceType: 'boolean',
  });
}

function defineNumberAttribute(
	spec: Omit<BuiltInAttributeSpec, 'kind' | 'sourceType'>,
): EmittedAttributeDefinition {
  return defineAttribute({
    ...spec,
    kind: 'number',
    sourceType: 'number',
  });
}

function resolveBuiltInAttributeValue<TContext, TValue>(
	value: BuiltInAttributeValueResolver<TContext, TValue> | undefined,
	context: TContext,
): TValue | undefined {
  if (typeof value === 'function') {
    return (value as (context: TContext) => TValue)(context);
  }

  return value;
}

function appendWordPressExtractionTags(
	typeExpression: string,
	source: WordPressAttributeSource | null | undefined,
	selector: string | null | undefined,
): string {
  return [
		typeExpression,
		...(source ? [`tags.Source<${JSON.stringify(source)}>`] : []),
		...(selector ? [`tags.Selector<${JSON.stringify(selector)}>`] : []),
	].join(' & ');
}

export function buildAttributesFromSpecs<TContext>(
	specs: readonly BuiltInAttributeTemplateSpec<TContext>[],
	context: TContext,
): EmittedAttributeDefinition[] {
  return specs.map((spec) => {
		const selector = resolveBuiltInAttributeValue(spec.selector, context);
		const source = resolveBuiltInAttributeValue(spec.source, context);
		const typeExpression =
			resolveBuiltInAttributeValue(spec.typeExpression, context) ?? 'unknown';
		const resolvedSpec: Omit<BuiltInAttributeSpec, 'kind' | 'sourceType'> = {
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
			selector,
			source,
			typeExpression: appendWordPressExtractionTags(
				typeExpression,
				source,
				selector,
			),
		};

		if (spec.attributeType === 'boolean') {
			return defineBooleanAttribute(resolvedSpec);
		}

		if (spec.attributeType === 'number') {
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

/**
 * Builds the canonical block preview examples derived from emitted defaults,
 * enums, and supported scalar constraints.
 */
export function buildBlockJsonExampleAttributes(
	attributes: readonly EmittedAttributeDefinition[],
): Record<string, JsonValue> {
  return Object.fromEntries(
    attributes.map((attribute) => [
      attribute.name,
      createBlockJsonExampleValue(attribute),
    ]),
  );
}
