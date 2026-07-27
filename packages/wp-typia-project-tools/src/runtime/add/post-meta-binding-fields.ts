import path from 'node:path';

import { readJsonFile, readJsonFileSync } from '../shared/json-utils.js';
import type { WorkspacePostMetaInventoryEntry } from '../workspace/workspace-inventory-types.js';

/**
 * Field metadata extracted from a typed post-meta schema for a generated block
 * bindings source.
 *
 * @property fallbackValue Editor preview value used when live post meta is unavailable.
 * @property label Human-readable label derived from the schema property name.
 * @property name Top-level schema property name used as the binding `field` arg.
 * @property required Whether the field is listed in the schema's required array.
 * @property schemaType Resolved JSON Schema type used to choose a preview value.
 */
export interface PostMetaBindingField {
  fallbackValue: string;
  label: string;
  name: string;
  required: boolean;
  schemaType: string;
}

type JsonRecord = Record<string, unknown>;

const SUPPORTED_SCHEMA_TYPES = new Set([
  'array',
  'boolean',
  'integer',
  'number',
  'object',
  'string',
]);

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

function extractPostMetaBindingFields(
	schema: unknown,
	context: string,
): PostMetaBindingField[] {
  if (!isJsonRecord(schema) || !isJsonRecord(schema.properties)) {
    throw new Error(
      `${context} must expose an object schema with top-level properties before it can back a binding source.`,
    );
  }

  const required = Array.isArray(schema.required)
    ? new Set(
        schema.required.filter(
          (entry): entry is string => typeof entry === 'string',
        ),
      )
    : new Set<string>();
  const fields = Object.entries(schema.properties).map(
    ([name, propertySchema]) => {
      const property = isJsonRecord(propertySchema) ? propertySchema : {};
      const schemaType = resolveSchemaType(property);

      return {
        fallbackValue: resolveFallbackValue(name, property, schemaType),
        label: resolveFieldLabel(name),
        name,
        required: required.has(name),
        schemaType,
      };
    },
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
 * Validate and resolve a top-level post-meta binding path.
 *
 * @param fields Binding fields extracted from the post-meta schema.
 * @param postMetaSlug Post-meta contract slug used in diagnostics.
 * @param metaPath User-provided field path to validate.
 * @returns The matching binding field.
 * @throws If the path is empty, nested, or missing from the schema fields.
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
  if (trimmed.includes('.')) {
    throw new Error(
      `Nested post meta path "${trimmed}" for "${postMetaSlug}" is not supported yet. Use one of the top-level fields: ${fields.map((field) => field.name).join(', ')}.`,
    );
  }

  const field = fields.find((candidate) => candidate.name === trimmed);
  if (!field) {
    throw new Error(
      `Post meta path "${trimmed}" does not exist in the "${postMetaSlug}" schema. Expected one of: ${fields.map((candidate) => candidate.name).join(', ')}.`,
    );
  }

  return field;
}
