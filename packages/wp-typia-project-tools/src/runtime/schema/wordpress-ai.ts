import type {
  EndpointManifestDefinition,
  EndpointManifestEndpointDefinition,
} from '@wp-typia/block-runtime/metadata-core';
import {
  normalizeEndpointAuthDefinition,
  projectJsonSchemaDocument,
  type EndpointAuthIntent,
  type EndpointWordPressAuthDefinition,
  type JsonSchemaDocument,
} from './schema-core.js';
import {
  resolveAbilityCategorySpec,
  type AbilityCategorySpec,
  type AbilitySpec,
  type AbilitySpecCatalog,
} from '../add/ability-spec.js';

export type {
  AbilityAnnotationSpec,
  AbilityCategorySpec,
  AbilityMcpProjectionSpec,
  AbilityMetaSpec,
  AbilitySpec,
  AbilitySpecCatalog,
} from '../add/ability-spec.js';

/**
 * Represents one projected WordPress-native ability derived from an endpoint
 * manifest plus an AbilitySpec definition.
 */
export interface ProjectedWordPressAbilityDefinition {
  /** Normalized auth intent derived from the endpoint manifest. */
  authIntent: EndpointAuthIntent;
  /** Optional auth mode propagated from the manifest when present. */
  authMode?: EndpointManifestEndpointDefinition['authMode'];
  /** Shared category identifier resolved from the AbilitySpec catalog. */
  category: string;
  /** Human-readable summary shown to ability discovery consumers. */
  description: string;
  /** PHP callback that executes the ability. */
  executeCallback: string;
  /** Stable generated ability identifier. */
  id: string;
  /** Optional projected input schema, or null when no input exists. */
  inputSchema: Record<string, unknown> | null;
  /** Display label propagated from the AbilitySpec layer. */
  label: string;
  /** WordPress-owned metadata preserved in the projected document. */
  meta: Record<string, unknown>;
  /** HTTP method from the source endpoint manifest. */
  method: EndpointManifestEndpointDefinition['method'];
  /** Source operation identifier from the endpoint manifest. */
  operationId: string;
  /** Projected AI response schema shared by the document. */
  outputSchema: Record<string, unknown>;
  /** HTTP path from the source endpoint manifest. */
  path: string;
  /** PHP permission callback that gates the ability. */
  permissionCallback: string;
  /** Optional WordPress auth metadata preserved for downstream adapters. */
  wordpressAuth?: EndpointWordPressAuthDefinition;
}

/**
 * Bundles a single-category WordPress AI abilities document together with the
 * metadata that describes how it was generated.
 */
export interface ProjectedWordPressAbilitiesDocument {
  /** Ability definitions generated from the current manifest and AbilitySpec map. */
  abilities: ProjectedWordPressAbilityDefinition[];
  /** Shared category metadata for the generated document. */
  category: {
    id: string;
    label: string;
  };
  /** Source metadata that points downstream consumers at the generated schema. */
  generatedFrom: {
    blockSlug: string;
    responseSchemaPath: string;
    schemaProfile: 'ai-structured-output';
  };
}

/**
 * Carries the projected input schema plus endpoint metadata into an optional
 * transform hook.
 */
export interface WordPressAiInputSchemaTransformContext {
  /** Name of the input contract being transformed. */
  contractName: string;
  /** Source endpoint that requested the input schema. */
  endpoint: EndpointManifestEndpointDefinition;
  /** Already-projected AI-friendly input schema. */
  schema: JsonSchemaDocument & Record<string, unknown>;
}

interface BuildWordPressAbilitiesDocumentOptions {
  abilityCatalog: AbilitySpecCatalog;
  buildAbilityId?: (operationId: string) => string;
  generatedFrom: ProjectedWordPressAbilitiesDocument['generatedFrom'];
  loadInputSchema?: (
    endpoint: EndpointManifestEndpointDefinition,
    contractName: string,
  ) => Promise<JsonSchemaDocument & Record<string, unknown>>;
  manifest: EndpointManifestDefinition;
  outputSchema: Record<string, unknown>;
  transformInputSchema?: (
    context: WordPressAiInputSchemaTransformContext,
  ) => JsonSchemaDocument & Record<string, unknown>;
}

interface BuildWordPressAiArtifactsOptions extends Omit<
  BuildWordPressAbilitiesDocumentOptions,
  'outputSchema'
> {
  responseSchema: JsonSchemaDocument & Record<string, unknown>;
}

function getEndpointInputContractName(
  endpoint: EndpointManifestEndpointDefinition,
): string | null {
  if (
    endpoint.method !== 'GET' &&
    endpoint.bodyContract &&
    endpoint.queryContract
  ) {
    throw new Error(
      `Endpoint "${endpoint.operationId}" defines both bodyContract and queryContract; WordPress AI input projection is ambiguous.`,
    );
  }

  if (endpoint.method === 'GET') {
    return endpoint.queryContract ?? null;
  }

  return endpoint.bodyContract ?? endpoint.queryContract ?? null;
}

function toAbilityId(categoryId: string, operationId: string): string {
  return `${categoryId}/${operationId
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()}`;
}

/**
 * Projects a canonical schema into the AI structured-output profile used by
 * WordPress AI artifact generation.
 *
 * @param schema Canonical JSON Schema document from the manifest-owned source.
 * @returns The projected AI-friendly schema document.
 */
export function projectWordPressAiSchema(
  schema: JsonSchemaDocument & Record<string, unknown>,
): JsonSchemaDocument & Record<string, unknown> {
  return projectJsonSchemaDocument(schema, {
    profile: 'ai-structured-output',
  }) as JsonSchemaDocument & Record<string, unknown>;
}

function assertAbilityMetaKeys(
  abilitySpec: AbilitySpec,
  operationId: string,
): void {
  if (!abilitySpec.meta) {
    return;
  }

  if ('annotations' in abilitySpec.meta) {
    throw new Error(
      `Operation "${operationId}" cannot set AbilitySpec.meta.annotations directly; use AbilitySpec.annotations instead.`,
    );
  }

  if ('show_in_rest' in abilitySpec.meta) {
    throw new Error(
      `Operation "${operationId}" cannot set AbilitySpec.meta.show_in_rest directly; use AbilitySpec.showInRest instead.`,
    );
  }
}

/**
 * Builds a WordPress abilities document from a manifest-first REST surface and
 * a matching AbilitySpec catalog.
 *
 * Input schemas are loaded lazily per endpoint only when an input contract
 * exists, and `transformInputSchema` runs after the schema has already been
 * projected into the AI structured-output profile.
 *
 * @param options Manifest, ability catalog, and projected output schema inputs.
 * @returns The generated WordPress abilities document.
 * @throws When an endpoint is missing an AbilitySpec.
 * @throws When categories are missing, inconsistent, or span multiple documents.
 * @throws When an endpoint references a missing input contract or no loader was supplied.
 */
export async function buildWordPressAbilitiesDocument({
  abilityCatalog,
  buildAbilityId,
  generatedFrom,
  loadInputSchema,
  manifest,
  outputSchema,
  transformInputSchema,
}: BuildWordPressAbilitiesDocumentOptions): Promise<ProjectedWordPressAbilitiesDocument> {
  const resolvedEndpoints = manifest.endpoints.map((endpoint) => {
    const abilitySpec = abilityCatalog.abilities[endpoint.operationId];
    if (!abilitySpec) {
      throw new Error(
        `Missing AbilitySpec for operationId "${endpoint.operationId}".`,
      );
    }

    assertAbilityMetaKeys(abilitySpec, endpoint.operationId);

    return {
      abilitySpec,
      category: resolveAbilityCategorySpec(
        abilitySpec,
        abilityCatalog.categories,
        endpoint.operationId,
      ),
      endpoint,
    };
  });

  const documentCategory: AbilityCategorySpec | null =
    resolvedEndpoints[0]?.category ?? null;
  if (!documentCategory) {
    throw new Error(
      'WordPress AI projection requires at least one endpoint before it can resolve an AbilitySpec category.',
    );
  }

  for (const resolvedEndpoint of resolvedEndpoints) {
    if (resolvedEndpoint.category.id !== documentCategory.id) {
      throw new Error(
        `Operation "${resolvedEndpoint.endpoint.operationId}" uses AbilitySpec category "${resolvedEndpoint.category.id}" but WordPress AI projections currently support one shared category per document.`,
      );
    }
  }

  const abilities = await Promise.all(
    resolvedEndpoints.map(async ({ abilitySpec, category, endpoint }) => {
      const inputContractName = getEndpointInputContractName(endpoint);
      let inputSchema: (JsonSchemaDocument & Record<string, unknown>) | null =
        null;

      if (inputContractName) {
        if (!manifest.contracts[inputContractName]) {
          throw new Error(
            `Endpoint "${endpoint.operationId}" references missing input contract "${inputContractName}".`,
          );
        }
        if (!loadInputSchema) {
          throw new Error(
            `Missing input schema loader for operationId "${endpoint.operationId}".`,
          );
        }

        const projectedInputSchema = projectWordPressAiSchema(
          await loadInputSchema(endpoint, inputContractName),
        );
        inputSchema = transformInputSchema
          ? transformInputSchema({
              contractName: inputContractName,
              endpoint,
              schema: projectedInputSchema,
            })
          : projectedInputSchema;
      }

      const normalizedAuth = normalizeEndpointAuthDefinition(endpoint);
      return {
        authIntent: normalizedAuth.auth,
        ...(normalizedAuth.authMode
          ? { authMode: normalizedAuth.authMode }
          : {}),
        category: category.id,
        description: endpoint.summary ?? abilitySpec.label,
        executeCallback: abilitySpec.executeCallback,
        id: (
          buildAbilityId ??
          ((operationId) => toAbilityId(category.id, operationId))
        )(endpoint.operationId),
        inputSchema,
        label: abilitySpec.label,
        meta: {
          ...(abilitySpec.meta ?? {}),
          ...(abilitySpec.annotations
            ? {
                annotations: abilitySpec.annotations,
              }
            : {}),
          show_in_rest: abilitySpec.showInRest ?? true,
        },
        method: endpoint.method,
        operationId: endpoint.operationId,
        outputSchema,
        path: endpoint.path,
        permissionCallback: abilitySpec.permissionCallback,
        ...(normalizedAuth.wordpressAuth
          ? { wordpressAuth: normalizedAuth.wordpressAuth }
          : {}),
      } satisfies ProjectedWordPressAbilityDefinition;
    }),
  );

  return {
    abilities,
    category: documentCategory,
    generatedFrom,
  };
}

/**
 * Builds the projected AI response schema together with its companion
 * WordPress abilities document.
 *
 * All endpoints must share the same response contract and category so the
 * generated artifacts stay aligned with one manifest-owned response surface.
 *
 * @param options Manifest, ability catalog, and response schema inputs.
 * @returns The projected AI response schema and generated abilities document.
 * @throws When the manifest has no endpoints.
 * @throws When the shared response contract is missing or inconsistent.
 */
export async function buildWordPressAiArtifacts({
  abilityCatalog,
  buildAbilityId,
  generatedFrom,
  loadInputSchema,
  manifest,
  responseSchema,
  transformInputSchema,
}: BuildWordPressAiArtifactsOptions): Promise<{
  abilitiesDocument: ProjectedWordPressAbilitiesDocument;
  aiResponseSchema: Record<string, unknown>;
}> {
  if (manifest.endpoints.length === 0) {
    throw new Error(
      'WordPress AI projection requires at least one endpoint in the manifest.',
    );
  }

  const responseContractName = manifest.endpoints[0].responseContract;
  if (!responseContractName) {
    throw new Error('The manifest is missing its shared response contract.');
  }
  for (const endpoint of manifest.endpoints) {
    if (endpoint.responseContract !== responseContractName) {
      throw new Error(
        `Endpoint "${endpoint.operationId}" uses response contract "${endpoint.responseContract}" but expected shared response contract "${responseContractName}".`,
      );
    }
  }
  if (!manifest.contracts[responseContractName]) {
    throw new Error(
      `The manifest references missing response contract "${responseContractName}".`,
    );
  }

  const aiResponseSchema = projectWordPressAiSchema(responseSchema);
  const abilitiesDocument = await buildWordPressAbilitiesDocument({
    abilityCatalog,
    buildAbilityId,
    generatedFrom,
    loadInputSchema,
    manifest,
    outputSchema: aiResponseSchema,
    transformInputSchema,
  });

  return {
    abilitiesDocument,
    aiResponseSchema,
  };
}
