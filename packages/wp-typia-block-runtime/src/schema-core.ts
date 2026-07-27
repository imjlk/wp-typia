import type { JsonValue, ManifestDocument } from './migration-types.js';
import {
  projectSchemaObjectForAiStructuredOutput,
  projectSchemaObjectForRest,
} from './schema-core-projection.js';
export { normalizeEndpointAuthDefinition } from './schema-core-auth.js';
export {
  buildEndpointOpenApiDocument,
  manifestAttributeToJsonSchema,
  manifestToJsonSchema,
  manifestToOpenApi,
} from './schema-core-documents.js';

export interface JsonSchemaObject {
  [key: string]: JsonValue | JsonSchemaObject | JsonSchemaObject[] | undefined;
}

/**
 * Full JSON Schema document for a manifest-derived root object.
 */
export interface JsonSchemaDocument extends JsonSchemaObject {
  $schema: string;
  additionalProperties: boolean;
  properties: Record<string, JsonSchemaObject>;
  required: string[];
  title: string;
  type: 'object';
}

/**
 * Document-level metadata applied to generated OpenAPI files.
 */
export interface OpenApiInfo {
  description?: string;
  title?: string;
  version?: string;
}

/**
 * JSON Schema reference used inside generated OpenAPI documents.
 */
export interface OpenApiSchemaReference extends JsonSchemaObject {
  $ref: string;
}

/**
 * OpenAPI query parameter emitted from a manifest attribute.
 */
export interface OpenApiParameter extends JsonSchemaObject {
  in: 'query';
  name: string;
  required: boolean;
  schema: JsonSchemaObject;
}

/**
 * OpenAPI media type wrapper for JSON responses and request bodies.
 */
export interface OpenApiMediaType extends JsonSchemaObject {
  schema: OpenApiSchemaReference;
}

/**
 * OpenAPI request body definition for generated JSON endpoints.
 */
export interface OpenApiRequestBody extends JsonSchemaObject {
  content: {
    'application/json': OpenApiMediaType;
  };
  required: true;
}

/**
 * Successful JSON response entry in the generated OpenAPI document.
 */
export interface OpenApiResponse extends JsonSchemaObject {
  content: {
    'application/json': OpenApiMediaType;
  };
  description: string;
  headers?: Record<string, JsonSchemaObject>;
}

/**
 * Header-based security scheme used by authenticated WordPress REST routes.
 */
export interface OpenApiSecurityScheme extends JsonSchemaObject {
  description?: string;
  in: 'header';
  name: string;
  type: 'apiKey';
}

/**
 * One generated OpenAPI operation for a scaffolded REST endpoint.
 */
export interface OpenApiOperation extends JsonSchemaObject {
  operationId: string;
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
  security?: Array<Record<string, string[]>>;
  summary?: string;
  tags: string[];
  'x-typia-authIntent': EndpointAuthIntent;
  'x-wp-typia-authPolicy'?: EndpointOpenApiAuthMode;
  'x-wp-typia-publicTokenField'?: string;
}

/**
 * Path item containing one or more generated REST operations.
 */
export type OpenApiPathItem = JsonSchemaObject &
	Partial<Record<Lowercase<EndpointOpenApiMethod>, OpenApiOperation>>;

/**
 * Named tag entry surfaced at the top level of generated OpenAPI docs.
 */
export interface OpenApiTag extends JsonSchemaObject {
  name: string;
}

/**
 * OpenAPI component registry for generated schemas and security schemes.
 */
export interface OpenApiComponents extends JsonSchemaObject {
  schemas: Record<string, JsonSchemaDocument>;
  securitySchemes?: Record<string, OpenApiSecurityScheme>;
}

/**
 * Complete OpenAPI 3.1 document emitted for endpoint-aware REST contracts.
 */
export interface OpenApiDocument extends JsonSchemaObject {
  components: OpenApiComponents;
  info: {
    description?: string;
    title: string;
    version: string;
  };
  openapi: '3.1.0';
  paths: Record<string, OpenApiPathItem>;
  tags?: OpenApiTag[];
}

/**
 * Backend-neutral auth intent for one manifest-defined endpoint.
 */
export type EndpointAuthIntent =
	| 'authenticated'
	| 'public'
	| 'public-write-protected';

/**
 * WordPress-specific authentication mechanisms that can implement neutral auth intent.
 */
export type EndpointWordPressAuthMechanism =
	| 'public-signed-token'
	| 'rest-nonce';

/**
 * Optional WordPress adapter metadata that explains how the default runtime satisfies auth intent.
 */
export interface EndpointWordPressAuthDefinition {
  mechanism: EndpointWordPressAuthMechanism;
  publicTokenField?: string;
}

/**
 * Legacy WordPress auth-mode literals kept for backward compatibility.
 */
export type EndpointOpenApiAuthMode =
	| 'authenticated-rest-nonce'
	| 'public-read'
	| 'public-signed-token';

/**
 * Supported HTTP methods for generated REST OpenAPI endpoints.
 */
export type EndpointOpenApiMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

/**
 * Contract document used when composing an endpoint-aware OpenAPI file.
 */
export interface EndpointOpenApiContractDocument {
	/** Manifest-derived contract document for this schema component. */
  document: ManifestDocument;
	/** Optional component name override for the generated schema reference. */
  schemaName?: string;
}

interface EndpointOpenApiEndpointBaseDefinition {
	/** Authentication policy surfaced in OpenAPI metadata. */
  auth?: EndpointAuthIntent;
	/** @deprecated Prefer `auth` plus `wordpressAuth` for new manifests. */
  authMode?: EndpointOpenApiAuthMode;
	/** Contract key for a JSON request body, when the endpoint accepts one. */
  bodyContract?: string;
	/** HTTP method exposed by the route. */
  method: EndpointOpenApiMethod;
	/** Stable OpenAPI operation id for this route. */
  operationId: string;
	/** Absolute REST path including namespace and version. */
  path: string;
	/** Contract key for query parameters, when the endpoint reads from the query string. */
  queryContract?: string;
	/** Contract key for the successful JSON response body. */
  responseContract: string;
	/** Optional short endpoint summary shown in generated docs. */
  summary?: string;
	/** OpenAPI tag names applied to this endpoint. */
  tags: readonly string[];
	/** Optional WordPress adapter metadata for the default runtime. */
  wordpressAuth?: EndpointWordPressAuthDefinition;
}

/**
 * Route metadata for one REST endpoint in the aggregate OpenAPI document.
 */
export type EndpointOpenApiEndpointDefinition =
	| (EndpointOpenApiEndpointBaseDefinition & {
			auth: EndpointAuthIntent;
	  })
	| (EndpointOpenApiEndpointBaseDefinition & {
			/** @deprecated Prefer `auth` plus `wordpressAuth` for new manifests. */
			authMode: EndpointOpenApiAuthMode;
	  });

export interface NormalizedEndpointAuthDefinition {
  auth: EndpointAuthIntent;
  authMode?: EndpointOpenApiAuthMode;
  wordpressAuth?: EndpointWordPressAuthDefinition;
}

/**
 * Options for building an aggregate endpoint-aware OpenAPI document.
 */
export interface EndpointOpenApiDocumentOptions {
	/** Named contract documents keyed by the endpoint registry identifiers. */
  contracts: Readonly<Record<string, EndpointOpenApiContractDocument>>;
	/** Route definitions that should appear in the generated OpenAPI file. */
  endpoints: readonly EndpointOpenApiEndpointDefinition[];
	/** Optional document-level OpenAPI info metadata. */
  info?: OpenApiInfo;
}

/**
 * Supported schema projection profiles derived from one canonical wp-typia JSON Schema document.
 */
export type JsonSchemaProjectionProfile = 'ai-structured-output' | 'rest';

/**
 * Options for projecting one generated JSON Schema document into another consumer-facing profile.
 */
export interface JsonSchemaProjectionOptions {
	/** Projection profile that controls schema transformation rules. */
  profile: JsonSchemaProjectionProfile;
}

/**
 * Projects one generated wp-typia JSON Schema document into a consumer-facing profile.
 *
 * @param schema Existing generated JSON Schema document.
 * @param options Projection profile options.
 * @returns A cloned schema document adjusted for the requested profile.
 */
export function projectJsonSchemaDocument<
	Schema extends JsonSchemaDocument | JsonSchemaObject,
>(schema: Schema, options: JsonSchemaProjectionOptions): Schema {
  if (options.profile === 'rest') {
    return projectSchemaObjectForRest(schema, '#') as Schema;
  }

  if (options.profile === 'ai-structured-output') {
    return projectSchemaObjectForAiStructuredOutput(schema, '#') as Schema;
  }

  throw new Error(
		`Unsupported JSON Schema projection profile "${String(
			(options as { profile?: unknown }).profile,
		)}".`,
	);
}
