import type {
  ManifestAttribute,
  ManifestConstraints,
  ManifestDocument,
  ManifestUnionMetadata,
} from './migration-types.js';
import {
  createBootstrapResponseHeaders,
  normalizeEndpointAuthDefinition,
} from './schema-core-auth.js';
import { projectSchemaObjectForRest } from './schema-core-projection.js';

import type {
  EndpointOpenApiContractDocument,
  EndpointOpenApiDocumentOptions,
  EndpointOpenApiEndpointDefinition,
  EndpointOpenApiMethod,
  JsonSchemaDocument,
  JsonSchemaObject,
  NormalizedEndpointAuthDefinition,
  OpenApiDocument,
  OpenApiInfo,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiPathItem,
  OpenApiResponse,
  OpenApiSchemaReference,
} from './schema-core.js';

const WP_TYPIA_OPENAPI_EXTENSION_KEYS = {
  AUTH_INTENT: 'x-typia-authIntent',
  AUTH_POLICY: 'x-wp-typia-authPolicy',
  PRESERVE_ON_EMPTY: 'x-wp-typia-preserveOnEmpty',
  PUBLIC_TOKEN_FIELD: 'x-wp-typia-publicTokenField',
  SECRET: 'x-wp-typia-secret',
  SECRET_STATE_FIELD: 'x-wp-typia-secretStateField',
  TYPE_TAG: 'x-typeTag',
} as const;

const WP_TYPIA_OPENAPI_LITERALS = {
  JSON_CONTENT_TYPE: 'application/json',
  PUBLIC_WRITE_TOKEN_FIELD: 'publicWriteToken',
  QUERY_LOCATION: 'query' as const,
  SUCCESS_RESPONSE_DESCRIPTION: 'Successful response',
  WORDPRESS_PUBLIC_TOKEN_MECHANISM: 'public-signed-token' as const,
  WORDPRESS_REST_NONCE_MECHANISM: 'rest-nonce' as const,
  WP_REST_NONCE_HEADER: 'X-WP-Nonce',
  WP_REST_NONCE_SCHEME: 'wpRestNonce',
} as const;

function applyConstraintIfNumber(
	schema: JsonSchemaObject,
	key: string,
	value: number | null | undefined,
): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    schema[key] = value;
  }
}

function applyConstraintIfString(
	schema: JsonSchemaObject,
	key: string,
	value: string | null | undefined,
): void {
  if (typeof value === 'string' && value.length > 0) {
    schema[key] = value;
  }
}

function applyCommonConstraints(
	schema: JsonSchemaObject,
	constraints: ManifestConstraints,
): void {
  applyConstraintIfString(schema, 'format', constraints.format);
  applyConstraintIfString(schema, 'pattern', constraints.pattern);
  applyConstraintIfString(
    schema,
    WP_TYPIA_OPENAPI_EXTENSION_KEYS.TYPE_TAG,
    constraints.typeTag,
  );

  applyConstraintIfNumber(schema, 'minLength', constraints.minLength);
  applyConstraintIfNumber(schema, 'maxLength', constraints.maxLength);
  applyConstraintIfNumber(schema, 'minimum', constraints.minimum);
  applyConstraintIfNumber(schema, 'maximum', constraints.maximum);
  applyConstraintIfNumber(
    schema,
    'exclusiveMinimum',
    constraints.exclusiveMinimum,
  );
  applyConstraintIfNumber(
    schema,
    'exclusiveMaximum',
    constraints.exclusiveMaximum,
  );
  applyConstraintIfNumber(schema, 'multipleOf', constraints.multipleOf);
  applyConstraintIfNumber(schema, 'minItems', constraints.minItems);
  applyConstraintIfNumber(schema, 'maxItems', constraints.maxItems);
}

function applyWordPressFieldMetadata(
	schema: JsonSchemaObject,
	attribute: ManifestAttribute,
): void {
  if (attribute.wp.writeOnly) {
    schema.writeOnly = true;
  }
  if (attribute.wp.preserveOnEmpty) {
    schema[WP_TYPIA_OPENAPI_EXTENSION_KEYS.PRESERVE_ON_EMPTY] = true;
  }
  if (attribute.wp.secret) {
    schema[WP_TYPIA_OPENAPI_EXTENSION_KEYS.SECRET] = true;
    schema.description =
			typeof schema.description === 'string' && schema.description.length > 0
        ? `${schema.description} This value is write-only and must never be returned raw in responses.`
        : 'Write-only secret value. Responses should expose only masked state.';
  }
  if (attribute.wp.secretStateField) {
    schema[WP_TYPIA_OPENAPI_EXTENSION_KEYS.SECRET_STATE_FIELD] =
			attribute.wp.secretStateField;
  }
}

function createUnionDiscriminatorProperty(branchKey: string): JsonSchemaObject {
  return {
    const: branchKey,
    enum: [branchKey],
    type: 'string',
  };
}

function addDiscriminatorToObjectBranch(
	schema: JsonSchemaObject,
	discriminator: string,
	branchKey: string,
): JsonSchemaObject | null {
  if (
		typeof schema.properties !== 'object' ||
		schema.properties === null ||
		Array.isArray(schema.properties)
	) {
    return null;
  }

  const properties = schema.properties as Record<string, JsonSchemaObject>;
  properties[discriminator] = createUnionDiscriminatorProperty(branchKey);
  const required = Array.isArray(schema.required)
    ? [...new Set([...(schema.required as string[]), discriminator])]
    : [discriminator];
  schema.required = required;
  return schema;
}

function manifestUnionToJsonSchema(union: ManifestUnionMetadata): JsonSchemaObject {
  const oneOf = Object.entries(union.branches).map(([branchKey, branch]) => {
    if (branch.ts.kind !== 'object') {
      throw new Error(
        `Discriminated union branch "${branchKey}" must be an object to carry "${union.discriminator}".`,
      );
    }

    const schema = manifestAttributeToJsonSchema(branch);
    const objectSchema = addDiscriminatorToObjectBranch(
      schema,
      union.discriminator,
      branchKey,
    );
    if (!objectSchema) {
      throw new Error(
        `Discriminated union branch "${branchKey}" is missing an object schema for "${union.discriminator}".`,
      );
    }

    return objectSchema;
  });

  return {
    discriminator: {
      propertyName: union.discriminator,
    },
    oneOf,
  };
}

/**
 * Converts one manifest attribute definition into a JSON Schema fragment.
 *
 * @param attribute Manifest-derived attribute metadata.
 * @returns A JSON-compatible schema fragment for the attribute.
 */
export function manifestAttributeToJsonSchema(
	attribute: ManifestAttribute,
): JsonSchemaObject {
  const schema: JsonSchemaObject = {};
  const enumValues = Array.isArray(attribute.wp.enum)
    ? attribute.wp.enum
    : null;
  if (enumValues && enumValues.length > 0) {
    schema.enum = enumValues;
  }
  if (attribute.typia.hasDefault) {
    schema.default = attribute.typia.defaultValue ?? null;
  }

  switch (attribute.ts.kind) {
    case 'string':
      schema.type = 'string';
      break;
    case 'number':
      schema.type = 'number';
      break;
    case 'boolean':
      schema.type = 'boolean';
      break;
    case 'array':
      schema.type = 'array';
      if (attribute.ts.items) {
        schema.items = manifestAttributeToJsonSchema(attribute.ts.items);
      }
      break;
    case 'object': {
      schema.type = 'object';
      // Recursive terminal nodes allow any additional properties so deeper
      // recursive data remains valid past the unrolling depth limit.
      schema.additionalProperties = attribute.ts.recursiveTerminal === true;
      const properties = attribute.ts.properties ?? {};
      schema.properties = Object.fromEntries(
        Object.entries(properties).map(([key, value]) => [
          key,
          manifestAttributeToJsonSchema(value),
        ]),
      );
      const required = Object.entries(properties)
				.filter(([, value]) => value.ts.required !== false)
				.map(([key]) => key);
      if (required.length > 0) {
        schema.required = required;
      }
      break;
    }
    case 'union':
      if (attribute.ts.union) {
        Object.assign(schema, manifestUnionToJsonSchema(attribute.ts.union));
      } else {
        schema.oneOf = [];
      }
      break;
    default:
      schema.type = attribute.wp.type ?? 'string';
      break;
  }

  applyCommonConstraints(schema, attribute.typia.constraints);
  applyWordPressFieldMetadata(schema, attribute);
  return schema;
}

/**
 * Builds a full JSON Schema document from a Typia manifest document.
 *
 * @param doc Manifest-derived attribute document.
 * @returns A draft 2020-12 JSON Schema document for the manifest root object.
 */
export function manifestToJsonSchema(doc: ManifestDocument): JsonSchemaDocument {
  const attributes = doc.attributes ?? {};
  return {
		$schema: 'https://json-schema.org/draft/2020-12/schema',
		additionalProperties: false,
		properties: Object.fromEntries(
			Object.entries(attributes).map(([key, value]) => [
				key,
				manifestAttributeToJsonSchema(value),
			]),
		),
		required: Object.entries(attributes)
			.filter(([, value]) => value.ts.required !== false)
			.map(([key]) => key),
		title: doc.sourceType ?? 'TypiaDocument',
		type: 'object',
	};
}

function projectSchemaDocumentForRest(schema: JsonSchemaDocument): JsonSchemaDocument {
  return projectSchemaObjectForRest(schema, '#') as JsonSchemaDocument;
}

function projectSchemaComponent(doc: ManifestDocument): JsonSchemaDocument {
  const projectedSchema = projectSchemaDocumentForRest(
    manifestToJsonSchema(doc),
  );
  delete (projectedSchema as { $schema?: string }).$schema;
  return projectedSchema;
}

/**
 * Wraps a manifest-derived JSON Schema document in a minimal OpenAPI 3.1 shell.
 *
 * @param doc Manifest-derived attribute document.
 * @param info Optional OpenAPI document metadata.
 * @returns An OpenAPI document containing the schema as a single component.
 */
export function manifestToOpenApi(
	doc: ManifestDocument,
	info: OpenApiInfo = {},
): OpenApiDocument {
  const schemaName = doc.sourceType ?? 'TypiaDocument';
  return {
    components: {
      schemas: {
        [schemaName]: projectSchemaComponent(doc),
      },
    },
    info: {
      title: info.title ?? schemaName,
      version: info.version ?? '1.0.0',
      ...(info.description ? { description: info.description } : {}),
    },
    openapi: '3.1.0',
    paths: {},
  };
}

function createOpenApiSchemaRef(schemaName: string): OpenApiSchemaReference {
  return {
    $ref: `#/components/schemas/${schemaName}`,
  };
}

function formatEndpointDescription(endpoint: EndpointOpenApiEndpointDefinition): string {
  return `${endpoint.operationId} (${endpoint.method} ${endpoint.path})`;
}

function getContractSchemaName(
	contractKey: string,
	contract: EndpointOpenApiContractDocument | undefined,
	endpoint?: EndpointOpenApiEndpointDefinition,
	role = 'contract',
): string {
  if (!contract) {
    if (endpoint) {
      throw new Error(
        `Missing ${role} contract "${contractKey}" while building endpoint "${formatEndpointDescription(endpoint)}"`,
      );
    }

    throw new Error(`Missing OpenAPI contract definition for "${contractKey}"`);
  }

  return contract.schemaName ?? contract.document.sourceType ?? contractKey;
}

function buildQueryParameters(
	contract: EndpointOpenApiContractDocument,
): OpenApiParameter[] {
  const attributes: Record<string, ManifestAttribute> =
		contract.document.attributes ?? {};

  return Object.entries(attributes).map(([name, attribute]) => ({
    in: WP_TYPIA_OPENAPI_LITERALS.QUERY_LOCATION,
    name,
    required: attribute.ts.required !== false,
    schema: manifestAttributeToJsonSchema(attribute),
  }));
}

function createSuccessResponse(
	schemaName: string,
	headers?: Record<string, JsonSchemaObject>,
): OpenApiResponse {
  return {
    content: {
      [WP_TYPIA_OPENAPI_LITERALS.JSON_CONTENT_TYPE]: {
        schema: createOpenApiSchemaRef(schemaName),
      },
    },
    description: WP_TYPIA_OPENAPI_LITERALS.SUCCESS_RESPONSE_DESCRIPTION,
    ...(headers ? { headers } : {}),
  };
}

function buildEndpointOpenApiOperation(
	endpoint: EndpointOpenApiEndpointDefinition,
	contracts: Readonly<Record<string, EndpointOpenApiContractDocument>>,
	normalizedAuth: NormalizedEndpointAuthDefinition,
): OpenApiOperation {
  const isBootstrapEndpoint = endpoint.path.endsWith('/bootstrap');
  const operation: OpenApiOperation = {
		operationId: endpoint.operationId,
		responses: {
			'200': createSuccessResponse(
				getContractSchemaName(
					endpoint.responseContract,
					contracts[endpoint.responseContract],
					endpoint,
					'response',
				),
				isBootstrapEndpoint
					? createBootstrapResponseHeaders(normalizedAuth)
					: undefined,
			),
		},
		tags: [...endpoint.tags],
		[WP_TYPIA_OPENAPI_EXTENSION_KEYS.AUTH_INTENT]: normalizedAuth.auth,
		...(normalizedAuth.authMode
			? {
					[WP_TYPIA_OPENAPI_EXTENSION_KEYS.AUTH_POLICY]:
						normalizedAuth.authMode,
			  }
			: {}),
	};

  if (typeof endpoint.summary === 'string' && endpoint.summary.length > 0) {
    operation.summary = endpoint.summary;
  }

  if (typeof endpoint.queryContract === 'string') {
    operation.parameters = buildQueryParameters(
			contracts[endpoint.queryContract] ??
				(() => {
					throw new Error(
						`Missing query contract "${endpoint.queryContract}" while building endpoint "${formatEndpointDescription(endpoint)}"`,
					);
				})(),
		);
  }

  if (typeof endpoint.bodyContract === 'string') {
    operation.requestBody = {
      content: {
        [WP_TYPIA_OPENAPI_LITERALS.JSON_CONTENT_TYPE]: {
          schema: createOpenApiSchemaRef(
            getContractSchemaName(
              endpoint.bodyContract,
              contracts[endpoint.bodyContract],
              endpoint,
              'request body',
            ),
          ),
        },
      },
      required: true,
    };
  }

  if (
		normalizedAuth.wordpressAuth?.mechanism ===
		WP_TYPIA_OPENAPI_LITERALS.WORDPRESS_REST_NONCE_MECHANISM
	) {
    operation.security = [
      {
        [WP_TYPIA_OPENAPI_LITERALS.WP_REST_NONCE_SCHEME]: [],
      },
    ];
  } else if (
		normalizedAuth.wordpressAuth?.mechanism ===
		WP_TYPIA_OPENAPI_LITERALS.WORDPRESS_PUBLIC_TOKEN_MECHANISM
	) {
    operation[WP_TYPIA_OPENAPI_EXTENSION_KEYS.PUBLIC_TOKEN_FIELD] =
			normalizedAuth.wordpressAuth.publicTokenField ??
			WP_TYPIA_OPENAPI_LITERALS.PUBLIC_WRITE_TOKEN_FIELD;
  }

  return operation;
}

/**
 * Build a complete OpenAPI 3.1 document from contract manifests and route metadata.
 *
 * @param options Aggregate contract and endpoint definitions for the REST surface.
 * @returns A JSON-compatible OpenAPI document with paths, components, and auth metadata.
 */
export function buildEndpointOpenApiDocument(
	options: EndpointOpenApiDocumentOptions,
): OpenApiDocument {
  const contractEntries = Object.entries(options.contracts);
  const schemas = Object.fromEntries(
    contractEntries.map(([contractKey, contract]) => [
      getContractSchemaName(contractKey, contract),
      projectSchemaComponent(contract.document),
    ]),
  );
  const paths: Record<string, OpenApiPathItem> = {};
  const topLevelTags = [...new Set(options.endpoints.flatMap((endpoint) => endpoint.tags))]
		.filter((tag) => typeof tag === 'string' && tag.length > 0)
		.map((name) => ({ name }));
  const normalizedEndpoints = options.endpoints.map((endpoint) => ({
    endpoint,
    normalizedAuth: normalizeEndpointAuthDefinition(endpoint),
  }));
  const usesWpRestNonce = normalizedEndpoints.some(
		({ normalizedAuth }) =>
			normalizedAuth.wordpressAuth?.mechanism ===
			WP_TYPIA_OPENAPI_LITERALS.WORDPRESS_REST_NONCE_MECHANISM,
	);

  for (const { endpoint, normalizedAuth } of normalizedEndpoints) {
    const pathItem = paths[endpoint.path] ?? {};
    const methodKey = endpoint.method.toLowerCase() as Lowercase<EndpointOpenApiMethod>;
    pathItem[methodKey] = buildEndpointOpenApiOperation(
      endpoint,
      options.contracts,
      normalizedAuth,
    );
    paths[endpoint.path] = pathItem;
  }

  return {
		components: {
			schemas,
			...(usesWpRestNonce
				? {
						securitySchemes: {
							[WP_TYPIA_OPENAPI_LITERALS.WP_REST_NONCE_SCHEME]: {
								description: 'WordPress REST nonce sent in the X-WP-Nonce header.',
								in: 'header',
								name: WP_TYPIA_OPENAPI_LITERALS.WP_REST_NONCE_HEADER,
								type: 'apiKey',
							},
						},
				  }
				: {}),
		},
		info: {
			title: options.info?.title ?? 'Typia REST API',
			version: options.info?.version ?? '1.0.0',
			...(options.info?.description ? { description: options.info.description } : {}),
		},
		openapi: '3.1.0',
		paths,
		...(topLevelTags.length > 0 ? { tags: topLevelTags } : {}),
	};
}
