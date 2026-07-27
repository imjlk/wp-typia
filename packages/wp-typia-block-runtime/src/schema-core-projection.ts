import type { JsonValue } from './migration-types.js';

import type { JsonSchemaObject } from './schema-core.js';

const WP_TYPIA_OPENAPI_EXTENSION_KEYS = {
  AUTH_INTENT: 'x-typia-authIntent',
  AUTH_POLICY: 'x-wp-typia-authPolicy',
  PUBLIC_TOKEN_FIELD: 'x-wp-typia-publicTokenField',
  TYPE_TAG: 'x-typeTag',
} as const;

const WP_TYPIA_SCHEMA_UINT32_MAX = 4_294_967_295;
const WP_TYPIA_SCHEMA_INT32_MAX = 2_147_483_647;
const WP_TYPIA_SCHEMA_INT32_MIN = -2_147_483_648;

function isJsonSchemaObject(value: unknown): value is JsonSchemaObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJsonSchemaNode<T extends JsonValue | JsonSchemaObject>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) =>
      isJsonSchemaObject(item) || Array.isArray(item)
        ? cloneJsonSchemaNode(item as JsonValue | JsonSchemaObject)
        : item,
    ) as T;
  }

  if (!isJsonSchemaObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      child === undefined
        ? undefined
        : isJsonSchemaObject(child) || Array.isArray(child)
          ? cloneJsonSchemaNode(child as JsonValue | JsonSchemaObject)
          : child,
    ]),
  ) as T;
}

function isWpTypiaSchemaExtensionKey(key: string): boolean {
  return key.startsWith('x-wp-typia-');
}

function getProjectedNumericMultipleOf(
	schema: JsonSchemaObject,
	path: string,
	typeTag: string,
): number {
  const currentMultipleOf = schema.multipleOf;
  if (
		currentMultipleOf !== undefined &&
		(typeof currentMultipleOf !== 'number' ||
			!Number.isFinite(currentMultipleOf) ||
			!Number.isInteger(currentMultipleOf) ||
			currentMultipleOf <= 0)
	) {
    throw new Error(
      `Unable to project unsupported ${typeTag} multipleOf at "${path}".`,
    );
  }

  return typeof currentMultipleOf === 'number' ? currentMultipleOf : 1;
}

function applyProjectedUint32Constraints(
	schema: JsonSchemaObject,
	path: string,
): void {
  const currentMinimum = schema.minimum;
  if (typeof currentMinimum === 'number' && Number.isFinite(currentMinimum)) {
    schema.minimum = Math.max(currentMinimum, 0);
  } else {
    schema.minimum = 0;
  }

  const currentMaximum = schema.maximum;
  if (typeof currentMaximum === 'number' && Number.isFinite(currentMaximum)) {
    schema.maximum = Math.min(currentMaximum, WP_TYPIA_SCHEMA_UINT32_MAX);
  } else {
    schema.maximum = WP_TYPIA_SCHEMA_UINT32_MAX;
  }

  schema.multipleOf = getProjectedNumericMultipleOf(schema, path, 'uint32');
  schema.type = 'integer';
}

function applyProjectedInt32Constraints(
	schema: JsonSchemaObject,
	path: string,
): void {
  const currentMinimum = schema.minimum;
  if (typeof currentMinimum === 'number' && Number.isFinite(currentMinimum)) {
    schema.minimum = Math.max(currentMinimum, WP_TYPIA_SCHEMA_INT32_MIN);
  } else {
    schema.minimum = WP_TYPIA_SCHEMA_INT32_MIN;
  }

  const currentMaximum = schema.maximum;
  if (typeof currentMaximum === 'number' && Number.isFinite(currentMaximum)) {
    schema.maximum = Math.min(currentMaximum, WP_TYPIA_SCHEMA_INT32_MAX);
  } else {
    schema.maximum = WP_TYPIA_SCHEMA_INT32_MAX;
  }

  schema.multipleOf = getProjectedNumericMultipleOf(schema, path, 'int32');
  schema.type = 'integer';
}

function applyProjectedTypeTag(
	schema: JsonSchemaObject,
	typeTag: string,
	path: string,
): void {
  switch (typeTag) {
    case 'uint32':
      applyProjectedUint32Constraints(schema, path);
      break;
    case 'int32':
      applyProjectedInt32Constraints(schema, path);
      break;
    case 'float':
    case 'double':
      schema.type = 'number';
      break;
    default:
      throw new Error(
        `Unsupported wp-typia schema type tag "${typeTag}" at "${path}".`,
      );
  }
}

function canProjectTypeTag(typeTag: string): boolean {
  switch (typeTag) {
    case 'uint32':
    case 'int32':
    case 'float':
    case 'double':
      return true;
    default:
      return false;
  }
}

function projectSchemaArrayItemsForAiStructuredOutput(
	items: JsonSchemaObject[],
	path: string,
): JsonSchemaObject[] {
  return items.map((item, index) =>
    projectSchemaObjectForAiStructuredOutput(item, `${path}/${index}`),
  );
}

function projectSchemaArrayItemsForRest(
	items: JsonSchemaObject[],
	path: string,
): JsonSchemaObject[] {
  return items.map((item, index) =>
    projectSchemaObjectForRest(item, `${path}/${index}`),
  );
}

function projectSchemaPropertyMapForAiStructuredOutput(
	properties: Record<string, JsonSchemaObject>,
	path: string,
): Record<string, JsonSchemaObject> {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [
      key,
      projectSchemaObjectForAiStructuredOutput(value, `${path}/${key}`),
    ]),
  );
}

function projectSchemaPropertyMapForRest(
	properties: Record<string, JsonSchemaObject>,
	path: string,
): Record<string, JsonSchemaObject> {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [
      key,
      projectSchemaObjectForRest(value, `${path}/${key}`),
    ]),
  );
}

export function projectSchemaObjectForAiStructuredOutput(
	node: JsonSchemaObject,
	path: string,
): JsonSchemaObject {
  const projectedNode = cloneJsonSchemaNode(node);
  const rawTypeTag = projectedNode[WP_TYPIA_OPENAPI_EXTENSION_KEYS.TYPE_TAG];

  if (typeof rawTypeTag === 'string') {
    applyProjectedTypeTag(projectedNode, rawTypeTag, path);
  }

  delete projectedNode[WP_TYPIA_OPENAPI_EXTENSION_KEYS.TYPE_TAG];

  for (const key of Object.keys(projectedNode)) {
    if (isWpTypiaSchemaExtensionKey(key)) {
      delete projectedNode[key];
      continue;
    }

    const child = projectedNode[key];
    if (Array.isArray(child)) {
      projectedNode[key] = child.every(isJsonSchemaObject)
        ? projectSchemaArrayItemsForAiStructuredOutput(
            child as JsonSchemaObject[],
            `${path}/${key}`,
          )
        : child;
      continue;
    }

    if (!isJsonSchemaObject(child)) {
      continue;
    }

    if (key === 'properties') {
      projectedNode[key] = projectSchemaPropertyMapForAiStructuredOutput(
        child as Record<string, JsonSchemaObject>,
        `${path}/${key}`,
      );
      continue;
    }

    projectedNode[key] = projectSchemaObjectForAiStructuredOutput(
      child,
      `${path}/${key}`,
    );
  }

  return projectedNode;
}

export function projectSchemaObjectForRest(
	node: JsonSchemaObject,
	path: string,
): JsonSchemaObject {
  const projectedNode = cloneJsonSchemaNode(node);
  const rawTypeTag = projectedNode[WP_TYPIA_OPENAPI_EXTENSION_KEYS.TYPE_TAG];

  if (typeof rawTypeTag === 'string' && canProjectTypeTag(rawTypeTag)) {
    applyProjectedTypeTag(projectedNode, rawTypeTag, path);
  }

  for (const key of Object.keys(projectedNode)) {
    const child = projectedNode[key];
    if (Array.isArray(child)) {
      projectedNode[key] = child.every(isJsonSchemaObject)
        ? projectSchemaArrayItemsForRest(
            child as JsonSchemaObject[],
            `${path}/${key}`,
          )
        : child;
      continue;
    }

    if (!isJsonSchemaObject(child)) {
      continue;
    }

    if (key === 'properties') {
      projectedNode[key] = projectSchemaPropertyMapForRest(
        child as Record<string, JsonSchemaObject>,
        `${path}/${key}`,
      );
      continue;
    }

    projectedNode[key] = projectSchemaObjectForRest(child, `${path}/${key}`);
  }

  applyProjectedBootstrapContract(projectedNode);

  return projectedNode;
}

function applyProjectedBootstrapContract(schema: JsonSchemaObject): void {
  if (schema.type !== 'object' || !isJsonSchemaObject(schema.properties)) {
    return;
  }

  const properties = schema.properties as Record<string, JsonSchemaObject>;
  if (properties.canWrite?.type !== 'boolean') {
    return;
  }

  const allOf = Array.isArray(schema.allOf)
    ? [...(schema.allOf as JsonSchemaObject[])]
    : [];
  const canWriteIsTrue: JsonSchemaObject = {
    properties: {
      canWrite: {
        const: true,
      },
    },
    required: ['canWrite'],
  };
  const buildRequiredPropertyObject = (
		requiredKeys: string[],
	): Record<string, JsonSchemaObject> =>
		Object.fromEntries(
      requiredKeys.map((requiredKey) => [
        requiredKey,
        properties[requiredKey] ?? {},
      ]),
    );
  const hasRestNonce = properties.restNonce?.type === 'string';
  const hasPublicWriteCredential =
		properties.publicWriteToken?.type === 'string' &&
		isJsonSchemaObject(properties.publicWriteExpiresAt);

  if (hasRestNonce && hasPublicWriteCredential) {
    allOf.push({
      if: canWriteIsTrue,
      then: {
        anyOf: [
          {
            properties: buildRequiredPropertyObject(['restNonce']),
            required: ['restNonce'],
          },
          {
            properties: buildRequiredPropertyObject([
              'publicWriteExpiresAt',
              'publicWriteToken',
            ]),
            required: ['publicWriteExpiresAt', 'publicWriteToken'],
          },
        ],
      },
      else: {
        not: {
          anyOf: [
            {
              properties: buildRequiredPropertyObject(['restNonce']),
              required: ['restNonce'],
            },
            {
              properties: buildRequiredPropertyObject(['publicWriteToken']),
              required: ['publicWriteToken'],
            },
          ],
        },
      },
    });
  }

  if (hasRestNonce && !hasPublicWriteCredential) {
    allOf.push({
      if: canWriteIsTrue,
      then: {
        properties: buildRequiredPropertyObject(['restNonce']),
        required: ['restNonce'],
      },
      else: {
        not: {
          properties: buildRequiredPropertyObject(['restNonce']),
          required: ['restNonce'],
        },
      },
    });
  }

  if (hasPublicWriteCredential && !hasRestNonce) {
    allOf.push({
      if: canWriteIsTrue,
      then: {
        properties: buildRequiredPropertyObject([
          'publicWriteExpiresAt',
          'publicWriteToken',
        ]),
        required: ['publicWriteExpiresAt', 'publicWriteToken'],
      },
      else: {
        not: {
          properties: buildRequiredPropertyObject(['publicWriteToken']),
          required: ['publicWriteToken'],
        },
      },
    });
  }

  if (allOf.length > 0) {
    schema.allOf = allOf;
  }
}
