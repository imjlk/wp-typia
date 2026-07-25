import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  defineEndpointManifest,
  syncEndpointClient,
  syncRestOpenApi,
  syncTypeSchemas,
  type ArtifactSyncExecutionOptions,
} from '@wp-typia/block-runtime/metadata-core';

import { projectWordPressAiSchema } from '../schema/ai-artifacts.js';
import { isFileNotFoundError } from '../shared/fs-async.js';
import { readJsonFile } from '../shared/json-utils.js';
import type { JsonSchemaDocument } from '../schema/schema-core.js';

interface AiFeatureTemplateVariablesLike {
  namespace: string;
  pascalCase: string;
  slugKebabCase: string;
  title: string;
}

interface SyncAiFeatureRestArtifactsOptions {
  clientFile: string;
  executionOptions?: ArtifactSyncExecutionOptions;
  outputDir: string;
  projectDir: string;
  typesFile: string;
  validatorsFile: string;
  variables: AiFeatureTemplateVariablesLike;
}

/**
 * Configures the AI-safe schema projection for one scaffolded AI feature.
 */
export interface SyncAiFeatureSchemaArtifactOptions
	extends ArtifactSyncExecutionOptions {
  aiSchemaFile: string;
  outputDir: string;
  projectDir: string;
}

/**
 * Carries the generated AI schema document and the file paths touched on disk.
 */
export interface SyncAiFeatureSchemaArtifactResult {
  aiSchema: JsonSchemaDocument & Record<string, unknown>;
  aiSchemaPath: string;
  check: boolean;
  sourceSchemaPath: string;
}

function normalizeGeneratedArtifactContent(content: string): string {
  return content.replace(/\r\n?/g, '\n');
}

async function reconcileGeneratedArtifact(options: {
  check: boolean;
  content: string;
  filePath: string;
  label: string;
}): Promise<void> {
  if (!options.check) {
    await mkdir(path.dirname(options.filePath), {
      recursive: true,
    });
    await writeFile(options.filePath, options.content, 'utf8');
    return;
  }

  try {
    const current = normalizeGeneratedArtifactContent(
      await readFile(options.filePath, 'utf8'),
    );
    const expected = normalizeGeneratedArtifactContent(options.content);
    if (current !== expected) {
      throw new Error(
        `Generated AI feature artifact is stale: ${options.label} (${options.filePath}).`,
      );
    }
  } catch (error) {
    if (isFileNotFoundError(error)) {
      throw new Error(
        `Generated AI feature artifact is missing: ${options.label} (${options.filePath}).`,
      );
    }
    throw error;
  }
}

function assertJsonObject(
	value: unknown,
	label: string,
): JsonSchemaDocument & Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected ${label} to decode to a JSON object.`);
  }

  return value as JsonSchemaDocument & Record<string, unknown>;
}

/**
 * Build the endpoint manifest for a workspace-level AI feature scaffold.
 *
 * The endpoint response wraps a typed AI result payload together with provider,
 * model, and token-usage telemetry. The nested `feature-result` contract is
 * also kept in the manifest so `sync-rest` can emit the canonical JSON Schema
 * that `sync-ai` later projects into the AI structured-output profile.
 *
 * @param variables Template naming data used for type names, routes, and docs.
 * @returns Endpoint manifest consumed by schema, OpenAPI, and client generators.
 */
export function buildAiFeatureEndpointManifest(
	variables: AiFeatureTemplateVariablesLike,
) {
  return defineEndpointManifest({
    contracts: {
      'feature-request': {
        sourceTypeName: `${variables.pascalCase}AiFeatureRequest`,
      },
      'feature-response': {
        sourceTypeName: `${variables.pascalCase}AiFeatureResponse`,
      },
      'feature-result': {
        sourceTypeName: `${variables.pascalCase}AiFeatureResult`,
      },
    },
    endpoints: [
      {
        auth: 'authenticated',
        bodyContract: 'feature-request',
        method: 'POST',
        operationId: `run${variables.pascalCase}AiFeature`,
        path: `/${variables.namespace}/ai/${variables.slugKebabCase}`,
        responseContract: 'feature-response',
        summary: `Run the ${variables.title} AI feature endpoint.`,
        tags: [`${variables.title} AI`],
        wordpressAuth: {
          mechanism: 'rest-nonce',
        },
      },
    ],
    info: {
      title: `${variables.title} AI Feature API`,
      version: '1.0.0',
    },
  });
}

/**
 * Synchronize generated schemas, OpenAPI output, and endpoint client code for
 * a workspace-level AI feature scaffold.
 *
 * @param options Feature file paths and naming variables.
 * @returns A promise that resolves after every generated REST artifact has been refreshed.
 */
export async function syncAiFeatureRestArtifacts({
	clientFile,
	executionOptions,
	outputDir,
	projectDir,
	typesFile,
	validatorsFile,
	variables,
}: SyncAiFeatureRestArtifactsOptions): Promise<void> {
  const manifest = buildAiFeatureEndpointManifest(variables);

  for (const [baseName, contract] of Object.entries(
    manifest.contracts,
  ) as Array<
		[string, { sourceTypeName: string }]
	>) {
    await syncTypeSchemas(
      {
        jsonSchemaFile: path.join(
          outputDir,
          'api-schemas',
          `${baseName}.schema.json`,
        ),
        openApiFile: path.join(
          outputDir,
          'api-schemas',
          `${baseName}.openapi.json`,
        ),
        projectRoot: projectDir,
        sourceTypeName: contract.sourceTypeName,
        typesFile,
      },
      executionOptions,
    );
  }

  await syncRestOpenApi(
    {
      manifest,
      openApiFile: path.join(outputDir, 'api.openapi.json'),
      projectRoot: projectDir,
      typesFile,
    },
    executionOptions,
  );

  await syncEndpointClient(
    {
      clientFile,
      manifest,
      projectRoot: projectDir,
      typesFile,
      validatorsFile,
    },
    executionOptions,
  );
}

/**
 * Project the canonical AI result contract for one scaffolded feature into the
 * AI structured-output schema profile consumed by `wp_ai_client_prompt()`.
 *
 * @param options Artifact destination plus the feature output directory.
 * @returns The projected AI schema and the source schema path it derived from.
 */
export async function syncAiFeatureSchemaArtifact({
	aiSchemaFile,
	check = false,
	outputDir,
	projectDir,
}: SyncAiFeatureSchemaArtifactOptions): Promise<SyncAiFeatureSchemaArtifactResult> {
  const sourceSchemaPath = path.join(
    projectDir,
    outputDir,
    'api-schemas',
    'feature-result.schema.json',
  );
  const responseSchema = assertJsonObject(
		await readJsonFile(sourceSchemaPath, {
			context: 'AI feature response schema',
		}),
		sourceSchemaPath,
	);
  const aiSchema = projectWordPressAiSchema(responseSchema);
  await reconcileGeneratedArtifact({
    check,
    content: `${JSON.stringify(aiSchema, null, 2)}\n`,
    filePath: path.join(projectDir, aiSchemaFile),
    label: 'AI feature schema',
  });

  return {
    aiSchema,
    aiSchemaPath: path.join(projectDir, aiSchemaFile),
    check,
    sourceSchemaPath,
  };
}
