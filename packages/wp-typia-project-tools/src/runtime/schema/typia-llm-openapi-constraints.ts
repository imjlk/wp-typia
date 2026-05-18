import { cloneJsonValue } from '../shared/json-utils.js';
import type {
  JsonSchemaObject,
  OpenApiDocument,
  OpenApiOperation,
} from './schema-core.js';
import type {
  ApplyOpenApiConstraintsToTypiaLlmFunctionArtifactOptions,
  ProjectedTypiaLlmFunctionArtifact,
} from './typia-llm-types.js';
import {
  assertJsonSchemaObject,
  cloneJsonValueIfDefined,
  isJsonSchemaObject,
} from './typia-llm-json-schema.js';

const JSON_SCHEMA_CONSTRAINT_KEYS = [
  'additionalProperties',
  'const',
  'default',
  'enum',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'format',
  'maxItems',
  'maxLength',
  'maximum',
  'minItems',
  'minLength',
  'minimum',
  'multipleOf',
  'pattern',
  'type',
] as const;

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function resolveOpenApiReferenceTarget(
  document: OpenApiDocument,
  reference: string,
): unknown {
  if (!reference.startsWith('#/')) {
    throw new Error(`Unsupported OpenAPI schema reference "${reference}".`);
  }

  let current: unknown = document;
  for (const rawSegment of reference.slice(2).split('/')) {
    const segment = decodeJsonPointerSegment(rawSegment);
    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }
    if (!isJsonSchemaObject(current)) {
      current = undefined;
      break;
    }
    current = current[segment];
  }

  if (!isJsonSchemaObject(current)) {
    throw new Error(
      `Unable to resolve OpenAPI schema reference "${reference}".`,
    );
  }

  return current;
}

function resolveOpenApiSchemaObject(
  document: OpenApiDocument,
  schema: unknown,
  seenReferences: ReadonlySet<string> = new Set(),
): JsonSchemaObject {
  if (!isJsonSchemaObject(schema)) {
    return {};
  }

  const reference = schema.$ref;
  if (typeof reference !== 'string') {
    return schema;
  }

  if (seenReferences.has(reference)) {
    return schema;
  }

  return resolveOpenApiSchemaObject(
    document,
    resolveOpenApiReferenceTarget(document, reference),
    new Set([...seenReferences, reference]),
  );
}

function collectOpenApiSeenReferences(
  schema: JsonSchemaObject,
  seenReferences: ReadonlySet<string>,
): ReadonlySet<string> {
  const reference = schema.$ref;
  if (typeof reference !== 'string' || seenReferences.has(reference)) {
    return seenReferences;
  }

  return new Set([...seenReferences, reference]);
}

/**
 * Copy constraint-oriented JSON Schema keywords from `source` into `target`.
 *
 * This helper intentionally mutates and returns `target` so nested OpenAPI
 * constraint restoration can preserve the projected typia.llm schema shape.
 * Callers that need immutable behavior should clone the target before calling.
 */
function mergeJsonSchemaConstraintProperties(
  document: OpenApiDocument,
  target: JsonSchemaObject,
  source: JsonSchemaObject,
  seenReferences: ReadonlySet<string> = new Set(),
): JsonSchemaObject {
  const nextSeenReferences = collectOpenApiSeenReferences(
    source,
    seenReferences,
  );
  const resolvedSource = resolveOpenApiSchemaObject(
    document,
    source,
    seenReferences,
  );
  const merged = target;

  for (const key of JSON_SCHEMA_CONSTRAINT_KEYS) {
    if (resolvedSource[key] !== undefined) {
      merged[key] = cloneJsonValue(resolvedSource[key]);
    }
  }

  if (Array.isArray(resolvedSource.required)) {
    merged.required = resolvedSource.required.filter(
      (value): value is string => typeof value === 'string',
    );
  }

  if (Array.isArray(resolvedSource.items)) {
    merged.items = cloneJsonValue(resolvedSource.items) as JsonSchemaObject[];
  } else if (isJsonSchemaObject(resolvedSource.items)) {
    const nextItems = isJsonSchemaObject(merged.items) ? merged.items : {};
    merged.items = mergeJsonSchemaConstraintProperties(
      document,
      nextItems,
      resolvedSource.items,
      nextSeenReferences,
    );
  }

  if (isJsonSchemaObject(resolvedSource.properties)) {
    const targetProperties = isJsonSchemaObject(merged.properties)
      ? merged.properties
      : {};

    for (const [propertyName, propertySchema] of Object.entries(
      resolvedSource.properties,
    )) {
      if (!isJsonSchemaObject(propertySchema)) {
        continue;
      }

      const nextProperty = isJsonSchemaObject(targetProperties[propertyName])
        ? (targetProperties[propertyName] as JsonSchemaObject)
        : {};
      targetProperties[propertyName] = mergeJsonSchemaConstraintProperties(
        document,
        nextProperty,
        propertySchema,
        nextSeenReferences,
      );
    }

    merged.properties = targetProperties;
  }

  return merged;
}

function findOpenApiOperationById(
  document: OpenApiDocument,
  operationId: string,
): OpenApiOperation | null {
  for (const pathItem of Object.values(document.paths)) {
    if (!isJsonSchemaObject(pathItem)) {
      continue;
    }

    for (const method of ['delete', 'get', 'patch', 'post', 'put'] as const) {
      const operation = resolveOpenApiSchemaObject(document, pathItem[method]);
      if (
        !isJsonSchemaObject(operation) ||
        typeof operation.operationId !== 'string'
      ) {
        continue;
      }

      if (operation.operationId === operationId) {
        return operation as OpenApiOperation;
      }
    }
  }

  return null;
}

function resolveOpenApiRequestBodySchema(
  operation: OpenApiOperation,
  document: OpenApiDocument,
): JsonSchemaObject | null {
  const requestBody = resolveOpenApiSchemaObject(document, operation.requestBody);
  const content = isJsonSchemaObject(requestBody.content)
    ? requestBody.content
    : null;
  const jsonMediaType =
    content && isJsonSchemaObject(content['application/json'])
      ? content['application/json']
      : null;
  const schema = jsonMediaType?.schema;
  if (!isJsonSchemaObject(schema)) {
    return null;
  }

  return resolveOpenApiSchemaObject(document, schema);
}

function resolveOpenApiSuccessResponseSchema(
  operation: OpenApiOperation,
  document: OpenApiDocument,
): JsonSchemaObject | null {
  for (const [statusCode, response] of Object.entries(operation.responses)) {
    const resolvedResponse = resolveOpenApiSchemaObject(document, response);
    if (
      !/^2(?:\d\d|XX)$/u.test(statusCode) ||
      !isJsonSchemaObject(resolvedResponse)
    ) {
      continue;
    }

    const content = isJsonSchemaObject(resolvedResponse.content)
      ? resolvedResponse.content
      : null;
    const jsonMediaType =
      content && isJsonSchemaObject(content['application/json'])
        ? content['application/json']
        : null;
    const schema = jsonMediaType?.schema;
    if (!isJsonSchemaObject(schema)) {
      continue;
    }

    return resolveOpenApiSchemaObject(document, schema);
  }

  return null;
}

function getOrCreateObjectProperty(
  target: JsonSchemaObject,
  propertyName: string,
): JsonSchemaObject {
  const targetProperties = isJsonSchemaObject(target.properties)
    ? target.properties
    : {};
  const nextProperty = isJsonSchemaObject(targetProperties[propertyName])
    ? (targetProperties[propertyName] as JsonSchemaObject)
    : {};

  targetProperties[propertyName] = nextProperty;
  target.properties = targetProperties;
  return nextProperty;
}

function applyOpenApiQueryParameterConstraints(
  target: JsonSchemaObject,
  operation: OpenApiOperation,
  document: OpenApiDocument,
): void {
  for (const parameter of operation.parameters ?? []) {
    const resolvedParameter = resolveOpenApiSchemaObject(document, parameter);
    if (
      !isJsonSchemaObject(resolvedParameter) ||
      resolvedParameter.in !== 'query' ||
      typeof resolvedParameter.name !== 'string'
    ) {
      continue;
    }

    const propertyTarget = getOrCreateObjectProperty(
      target,
      resolvedParameter.name,
    );
    mergeJsonSchemaConstraintProperties(
      document,
      propertyTarget,
      resolveOpenApiSchemaObject(document, resolvedParameter.schema),
    );

    if (resolvedParameter.required === true) {
      const required = new Set(
        Array.isArray(target.required)
          ? target.required.filter(
              (value): value is string => typeof value === 'string',
            )
          : [],
      );
      required.add(resolvedParameter.name);
      target.required = [...required];
    }
  }
}

/**
 * Clone a projected function artifact before mutation-oriented constraint work.
 *
 * @param functionArtifact Projected artifact to clone.
 * @returns A cloned artifact with parameters and optional output deep-cloned,
 * and tags shallow-copied when present.
 */
export function cloneProjectedTypiaLlmFunctionArtifact(
  functionArtifact: ProjectedTypiaLlmFunctionArtifact,
): ProjectedTypiaLlmFunctionArtifact {
  return {
    description: functionArtifact.description,
    name: functionArtifact.name,
    output: cloneJsonValueIfDefined(functionArtifact.output),
    parameters: cloneJsonValue(functionArtifact.parameters),
    ...(functionArtifact.tags ? { tags: [...functionArtifact.tags] } : {}),
  };
}

/**
 * Restores canonical request and response constraints from an endpoint-aware
 * OpenAPI document onto one projected `typia.llm` function artifact.
 *
 * Query-only inputs merge into the root parameter object. Mixed body/query
 * inputs merge into the generated `body` and `query` properties.
 *
 * @param options Projected artifact plus the canonical OpenAPI document.
 * @returns A cloned artifact enriched with OpenAPI-backed constraints when available.
 */
export function applyOpenApiConstraintsToTypiaLlmFunctionArtifact({
  functionArtifact,
  openApiDocument,
  operationId,
}: ApplyOpenApiConstraintsToTypiaLlmFunctionArtifactOptions): ProjectedTypiaLlmFunctionArtifact {
  const constrainedArtifact =
    cloneProjectedTypiaLlmFunctionArtifact(functionArtifact);
  const operation = findOpenApiOperationById(openApiDocument, operationId);
  if (!operation) {
    return constrainedArtifact;
  }

  const hasQueryParameters = (operation.parameters ?? []).some(
    (parameter) => {
      const resolvedParameter = resolveOpenApiSchemaObject(
        openApiDocument,
        parameter,
      );
      return (
        isJsonSchemaObject(resolvedParameter) &&
        resolvedParameter.in === 'query' &&
        typeof resolvedParameter.name === 'string'
      );
    },
  );
  const requestBodySchema = resolveOpenApiRequestBodySchema(
    operation,
    openApiDocument,
  );
  const parameterSchema = assertJsonSchemaObject(
    constrainedArtifact.parameters,
    `typia.llm parameters for "${constrainedArtifact.name}"`,
  );

  if (requestBodySchema) {
    if (hasQueryParameters) {
      mergeJsonSchemaConstraintProperties(
        openApiDocument,
        getOrCreateObjectProperty(parameterSchema, 'body'),
        requestBodySchema,
      );
    } else {
      mergeJsonSchemaConstraintProperties(
        openApiDocument,
        parameterSchema,
        requestBodySchema,
      );
    }
  }

  if (hasQueryParameters) {
    applyOpenApiQueryParameterConstraints(
      requestBodySchema
        ? getOrCreateObjectProperty(parameterSchema, 'query')
        : parameterSchema,
      operation,
      openApiDocument,
    );
  }

  if (constrainedArtifact.output) {
    const outputSchema = assertJsonSchemaObject(
      constrainedArtifact.output,
      `typia.llm output for "${constrainedArtifact.name}"`,
    );
    const responseSchema = resolveOpenApiSuccessResponseSchema(
      operation,
      openApiDocument,
    );
    if (responseSchema) {
      mergeJsonSchemaConstraintProperties(
        openApiDocument,
        outputSchema,
        responseSchema,
      );
    }
  }

  return constrainedArtifact;
}
