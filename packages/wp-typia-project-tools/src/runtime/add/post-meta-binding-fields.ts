import path from 'node:path';

import { readJsonFile, readJsonFileSync } from '../shared/json-utils.js';
import type { WorkspacePostMetaInventoryEntry } from '../workspace/workspace-inventory-types.js';

/**
 * Field metadata extracted from a typed post-meta schema for a generated block
 * bindings source.
 *
 * @property fallbackValue Editor preview value used when live post meta is unavailable.
 * @property label Human-readable label derived from the schema property name.
 * @property name Binding `field` arg. Top-level fields use the property name.
 * Resolved nested fields use the full `parent.child` path.
 * @property properties Child fields captured for an object property so one
 * `parent.child` path can be resolved. Omitted for scalars and for nested children.
 * @property required Whether the field is listed in the schema's required array.
 * @property schemaType Resolved JSON Schema type used to choose a preview value.
 */
export interface PostMetaBindingField {
  fallbackValue: string;
  label: string;
  name: string;
  properties?: readonly PostMetaBindingField[];
  required: boolean;
  schemaType: string;
}

type JsonRecord = Record<string, unknown>;

/**
 * JSON Schema types recognized for post-meta binding fields.
 */
export const POST_META_BINDING_SCHEMA_TYPES = [
  'array',
  'boolean',
  'integer',
  'number',
  'object',
  'string',
] as const;

/**
 * Scalar JSON Schema types that can be selected with one `parent.child` meta path.
 */
export const BINDABLE_NESTED_POST_META_SCHEMA_TYPES = [
  'boolean',
  'integer',
  'number',
  'string',
] as const;

const SUPPORTED_SCHEMA_TYPES = new Set<string>(POST_META_BINDING_SCHEMA_TYPES);
const BINDABLE_NESTED_SCHEMA_TYPES = new Set<string>(
  BINDABLE_NESTED_POST_META_SCHEMA_TYPES,
);

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveSchemaType(schema: JsonRecord): string {
  const type = schema.type;
  if (typeof type === 'string' && SUPPORTED_SCHEMA_TYPES.has(type)) {
    return type;
  }
  if (
		Array.isArray(type) &&
		type.every((entry) => typeof entry === 'string')
	) {
    const nonNullType = type.find(
      (entry) => entry !== 'null' && SUPPORTED_SCHEMA_TYPES.has(entry),
    );
    if (nonNullType) {
      return nonNullType;
    }
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return 'string';
  }

  return 'unknown';
}

function resolveFallbackValue(name: string, schema: JsonRecord, schemaType: string): string {
  const enumValue = Array.isArray(schema.enum)
    ? schema.enum.find((entry) => typeof entry === 'string')
    : undefined;
  if (typeof enumValue === 'string') {
    return enumValue;
  }

  switch (schemaType) {
    case 'array':
      return '[]';
    case 'boolean':
      return 'false';
    case 'integer':
    case 'number':
      return '0';
    case 'object':
      return '{}';
    default:
      return `${name} preview`;
  }
}

function resolveFieldLabel(name: string): string {
  return name
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/\b\w/g, (match) => match.toUpperCase());
}

function readRequiredNames(required: unknown): Set<string> {
  if (!Array.isArray(required)) {
    return new Set();
  }

  return new Set(
    required.filter((entry): entry is string => typeof entry === 'string'),
  );
}

function extractBindingField(
	name: string,
	propertySchema: unknown,
	requiredNames: ReadonlySet<string>,
	captureNestedProperties: boolean,
): PostMetaBindingField {
  const property = isJsonRecord(propertySchema) ? propertySchema : {};
  const schemaType = resolveSchemaType(property);
  const field: PostMetaBindingField = {
    fallbackValue: resolveFallbackValue(name, property, schemaType),
    label: resolveFieldLabel(name),
    name,
    required: requiredNames.has(name),
    schemaType,
  };

  if (
    !captureNestedProperties ||
		schemaType !== 'object' ||
		!isJsonRecord(property.properties)
  ) {
    return field;
  }

  const nested = Object.entries(property.properties).map(
    ([childName, childSchema]) =>
      extractBindingField(
        childName,
        childSchema,
        readRequiredNames(property.required),
        false,
      ),
  );
  if (nested.length > 0) {
    field.properties = nested;
  }

  return field;
}

function formatFieldNames(fields: readonly PostMetaBindingField[]): string {
  return fields.map((field) => field.name).join(', ');
}

function extractPostMetaBindingFields(
	schema: unknown,
	context: string,
): PostMetaBindingField[] {
  if (!isJsonRecord(schema) || !isJsonRecord(schema.properties)) {
    throw new Error(
      `${context} must expose an object schema with top-level properties before it can back a binding source.`,
    );
  }

  const required = readRequiredNames(schema.required);
  const fields = Object.entries(schema.properties).map(
    ([name, propertySchema]) =>
      extractBindingField(name, propertySchema, required, true),
  );

  if (fields.length === 0) {
    throw new Error(
      `${context} does not expose any top-level properties that can back binding fields.`,
    );
  }

  return fields;
}

/**
 * Load and extract binding fields from a post-meta JSON Schema artifact.
 *
 * @param projectDir Workspace root directory.
 * @param postMeta Post-meta inventory entry that points to the schema file.
 * @returns Promise resolving to the extracted top-level binding fields.
 * @throws If the schema cannot be read or does not expose object properties.
 */
export async function loadPostMetaBindingFields(
	projectDir: string,
	postMeta: WorkspacePostMetaInventoryEntry,
): Promise<PostMetaBindingField[]> {
  const schemaPath = path.join(projectDir, postMeta.schemaFile);
  const schema = await readJsonFile(schemaPath, {
    context: `post meta schema for ${postMeta.slug}`,
  });

  return extractPostMetaBindingFields(schema, postMeta.schemaFile);
}

/**
 * Synchronously load and extract binding fields from a post-meta JSON Schema artifact.
 *
 * @param projectDir Workspace root directory.
 * @param postMeta Post-meta inventory entry that points to the schema file.
 * @returns Extracted top-level binding fields.
 * @throws If the schema cannot be read or does not expose object properties.
 */
export function loadPostMetaBindingFieldsSync(
	projectDir: string,
	postMeta: WorkspacePostMetaInventoryEntry,
): PostMetaBindingField[] {
  const schemaPath = path.join(projectDir, postMeta.schemaFile);
  const schema = readJsonFileSync(schemaPath, {
    context: `post meta schema for ${postMeta.slug}`,
  });

  return extractPostMetaBindingFields(schema, postMeta.schemaFile);
}

/**
 * Validate and resolve a post-meta binding path.
 *
 * Accepts a top-level field, or one nested object property (`parent.child`)
 * when that child is a bindable scalar. Deeper paths are rejected.
 *
 * @param fields Binding fields extracted from the post-meta schema.
 * @param postMetaSlug Post-meta contract slug used in diagnostics.
 * @param metaPath User-provided field path to validate.
 * @returns The matching binding field. Nested paths use the full `parent.child` name.
 * @throws If the path is empty, deeper than one property, or missing from the schema.
 */
export function assertPostMetaBindingPath(
	fields: readonly PostMetaBindingField[],
	postMetaSlug: string,
	metaPath: string,
): PostMetaBindingField {
  const trimmed = metaPath.trim();
  if (!trimmed) {
    throw new Error('Post meta binding path must include a value.');
  }

  const segments = trimmed.split('.');
  if (segments.length > 2) {
    throw new Error(
      `Post meta path "${trimmed}" for "${postMetaSlug}" is deeper than one nested property. Use a top-level field or one parent.child path.`,
    );
  }
  if (segments.some((segment) => segment.length === 0)) {
    throw new Error(
      `Post meta path "${trimmed}" for "${postMetaSlug}" must use non-empty field names.`,
    );
  }
  if (segments.length === 1) {
    const field = fields.find((candidate) => candidate.name === trimmed);
    if (!field) {
      throw new Error(
        `Post meta path "${trimmed}" does not exist in the "${postMetaSlug}" schema. Expected one of: ${formatFieldNames(fields)}.`,
      );
    }

    return field;
  }

  const [parentName, childName] = segments;
  const parent = fields.find((candidate) => candidate.name === parentName);
  if (!parent) {
    throw new Error(
      `Post meta path "${trimmed}" does not exist in the "${postMetaSlug}" schema. Expected one of: ${formatFieldNames(fields)}.`,
    );
  }
  if (parent.schemaType !== 'object') {
    throw new Error(
      `Post meta path "${trimmed}" cannot select "${childName}" because "${parent.name}" is not an object in the "${postMetaSlug}" schema.`,
    );
  }

  const nestedFields = parent.properties ?? [];
  const child = nestedFields.find((candidate) => candidate.name === childName);
  if (!child) {
    const expected = nestedFields
			.filter((candidate) => BINDABLE_NESTED_SCHEMA_TYPES.has(candidate.schemaType))
			.map((candidate) => `${parent.name}.${candidate.name}`);
    throw new Error(
      expected.length > 0
        ? `Post meta path "${trimmed}" does not exist in the "${postMetaSlug}" schema. Expected one of: ${expected.join(', ')}.`
        : `Post meta path "${trimmed}" does not exist in the "${postMetaSlug}" schema. "${parent.name}" does not define bindable nested properties.`,
    );
  }
  if (!BINDABLE_NESTED_SCHEMA_TYPES.has(child.schemaType)) {
    throw new Error(
      `Post meta path "${trimmed}" for "${postMetaSlug}" is not a bindable scalar field. Supported nested types: ${BINDABLE_NESTED_POST_META_SCHEMA_TYPES.join(', ')}.`,
    );
  }

  return {
    fallbackValue: child.fallbackValue,
    label: resolveFieldLabel(`${parent.name} ${child.name}`),
    name: `${parent.name}.${child.name}`,
    required: parent.required && child.required,
    schemaType: child.schemaType,
  };
}
