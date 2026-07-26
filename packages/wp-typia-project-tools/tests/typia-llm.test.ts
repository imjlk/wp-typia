import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { EndpointManifestDefinition } from '@wp-typia/block-runtime/metadata-core';
import type { ILlmSchema } from 'typia';
import type { OpenApiDocument } from '@wp-typia/project-tools/schema-core';
import type {
  ProjectedTypiaLlmApplicationArtifact,
  ProjectedTypiaLlmStructuredOutputArtifact,
} from '@wp-typia/project-tools/typia-llm';
import {
  applyOpenApiConstraintsToTypiaLlmFunctionArtifact,
  buildTypiaLlmEndpointMethodDescriptors,
  projectTypiaLlmApplicationArtifact,
  projectTypiaLlmStructuredOutputArtifact,
  renderTypiaLlmModule,
  syncTypiaLlmAdapterModule,
} from '@wp-typia/project-tools/typia-llm';

const COUNTER_MANIFEST = {
  contracts: {
    CounterQuery: {
      sourceTypeName: 'CounterQuery',
    },
    CounterResponse: {
      sourceTypeName: 'CounterResponse',
    },
    CounterUpdateRequest: {
      sourceTypeName: 'CounterUpdateRequest',
    },
  },
  endpoints: [
    {
      auth: 'public',
      method: 'GET',
      operationId: 'getCounter',
      path: '/demo/v1/counter',
      queryContract: 'CounterQuery',
      responseContract: 'CounterResponse',
      summary: 'Read the counter.',
      tags: ['Counter'],
    },
    {
      auth: 'public-write-protected',
      bodyContract: 'CounterUpdateRequest',
      method: 'POST',
      operationId: 'incrementCounter',
      path: '/demo/v1/counter',
      responseContract: 'CounterResponse',
      summary: 'Increment the counter.',
      tags: ['Counter'],
      wordpressAuth: {
        mechanism: 'public-signed-token',
        publicTokenField: 'publicWriteToken',
      },
    },
  ],
} as const satisfies EndpointManifestDefinition;

const COUNTER_OPENAPI = {
  components: {
    schemas: {
      CounterResponse: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        additionalProperties: false,
        properties: {
          count: {
            minimum: 0,
            type: 'integer',
          },
        },
        required: ['count'],
        title: 'CounterResponse',
        type: 'object',
      },
      CounterUpdateRequest: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        additionalProperties: false,
        properties: {
          publicWriteToken: {
            minLength: 16,
            pattern: '^pt_[a-z0-9]+$',
            type: 'string',
          },
        },
        required: ['publicWriteToken'],
        title: 'CounterUpdateRequest',
        type: 'object',
      },
      UpdateCounterBody: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        additionalProperties: false,
        properties: {
          publicWriteToken: {
            minLength: 24,
            pattern: '^body_[a-z0-9]+$',
            type: 'string',
          },
        },
        required: ['publicWriteToken'],
        title: 'UpdateCounterBody',
        type: 'object',
      },
    },
  },
  info: {
    title: 'Counter API',
    version: '1.0.0',
  },
  openapi: '3.1.0',
  paths: {
    '/demo/v1/counter': {
      post: {
        operationId: 'incrementCounter',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/CounterUpdateRequest',
              },
            },
          },
          required: true,
        },
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/CounterResponse',
                },
              },
            },
            description: 'Counter response.',
          },
        },
        summary: 'Increment the counter.',
        tags: ['Counter'],
        'x-typia-authIntent': 'public-write-protected',
      },
    },
    '/demo/v1/counter/update': {
      post: {
        operationId: 'updateCounter',
        parameters: [
          {
            in: 'query',
            name: 'page',
            required: true,
            schema: {
              minimum: 1,
              type: 'integer',
            },
          },
          {
            in: 'query',
            name: 'search',
            required: false,
            schema: {
              minLength: 2,
              type: 'string',
            },
          },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UpdateCounterBody',
              },
            },
          },
          required: true,
        },
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/CounterResponse',
                },
              },
            },
            description: 'Updated counter response.',
          },
        },
        summary: 'Update the counter.',
        tags: ['Counter'],
        'x-typia-authIntent': 'authenticated',
      },
    },
  },
} as const satisfies OpenApiDocument;

const NESTED_REFERENCE_OPENAPI = {
  components: {
    parameters: {
      NestedPostId: {
        in: 'query',
        name: 'postId',
        required: true,
        schema: {
          maximum: 4294967295,
          minimum: 0,
          multipleOf: 1,
          type: 'integer',
        },
      },
    },
    requestBodies: {
      NestedCounterBody: {
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/NestedCounterBodySchema',
            },
          },
        },
        required: true,
      },
    },
    responses: {
      NestedCounterResponse: {
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/NestedCounterResponseSchema',
            },
          },
        },
        description: 'Nested counter response.',
      },
    },
    schemas: {
      NestedCounterBodySchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        additionalProperties: false,
        properties: {
          payload: {
            properties: {
              delta: {
                maximum: 9,
                minimum: 1,
                multipleOf: 1,
                type: 'integer',
              },
            },
            required: ['delta'],
            type: 'object',
          },
        },
        required: ['payload'],
        title: 'NestedCounterBodySchema',
        type: 'object',
      },
      NestedCounterResponseSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        additionalProperties: false,
        properties: {
          count: {
            maximum: 4294967295,
            minimum: 0,
            multipleOf: 1,
            type: 'integer',
          },
        },
        required: ['count'],
        title: 'NestedCounterResponseSchema',
        type: 'object',
      },
    },
  },
  info: {
    title: 'Nested Counter API',
    version: '1.0.0',
  },
  openapi: '3.1.0',
  paths: {
    '/demo/v1/counter/nested': {
      post: {
        operationId: 'syncNestedCounter',
        parameters: [
          {
            $ref: '#/components/parameters/NestedPostId',
          },
        ],
        requestBody: {
          $ref: '#/components/requestBodies/NestedCounterBody',
        },
        responses: {
          '2XX': {
            $ref: '#/components/responses/NestedCounterResponse',
          },
        },
        summary: 'Synchronize the nested counter.',
        tags: ['Counter'],
        'x-typia-authIntent': 'authenticated',
      },
    },
  },
} as const as unknown as OpenApiDocument;

const RECURSIVE_REFERENCE_OPENAPI = {
  components: {
    requestBodies: {
      RecursiveNodeBody: {
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/RecursiveNode',
            },
          },
        },
        required: true,
      },
    },
    schemas: {
      RecursiveNode: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        additionalProperties: false,
        properties: {
          child: {
            $ref: '#/components/schemas/RecursiveNode',
          },
          label: {
            minLength: 1,
            type: 'string',
          },
        },
        required: ['label'],
        title: 'RecursiveNode',
        type: 'object',
      },
    },
  },
  info: {
    title: 'Recursive Node API',
    version: '1.0.0',
  },
  openapi: '3.1.0',
  paths: {
    '/demo/v1/tree': {
      post: {
        operationId: 'syncRecursiveNode',
        requestBody: {
          $ref: '#/components/requestBodies/RecursiveNodeBody',
        },
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/RecursiveNode',
                },
              },
            },
            description: 'Recursive node response.',
          },
        },
        summary: 'Synchronize the recursive node.',
        tags: ['Tree'],
        'x-typia-authIntent': 'authenticated',
      },
    },
  },
} as const as unknown as OpenApiDocument;

const EMPTY_LLM_PARAMETERS: ILlmSchema.IParameters = {
  $defs: {},
  additionalProperties: false,
  properties: {},
  required: [],
  type: 'object',
};

function createLlmParameters(description: string): ILlmSchema.IParameters {
  return {
    $defs: {},
    additionalProperties: false,
    properties: {
      count: {
        description,
        type: 'number',
      },
    },
    required: ['count'],
    type: 'object',
  } as ILlmSchema.IParameters;
}

describe('typia.llm adapter emitter', () => {
  test('projects endpoint manifests into controller method descriptors', () => {
    expect(buildTypiaLlmEndpointMethodDescriptors(COUNTER_MANIFEST)).toEqual([
      {
        authIntent: 'public',
        authMode: 'public-read',
        description: 'Read the counter.',
        inputTypeName: 'CounterQuery',
        method: 'GET',
        operationId: 'getCounter',
        outputTypeName: 'CounterResponse',
        path: '/demo/v1/counter',
        tags: ['Counter'],
      },
      {
        authIntent: 'public-write-protected',
        authMode: 'public-signed-token',
        description: 'Increment the counter.',
        inputTypeName: 'CounterUpdateRequest',
        method: 'POST',
        operationId: 'incrementCounter',
        outputTypeName: 'CounterResponse',
        path: '/demo/v1/counter',
        tags: ['Counter'],
        wordpressAuth: {
          mechanism: 'public-signed-token',
          publicTokenField: 'publicWriteToken',
        },
      },
    ]);
  });

  test('renders a build-time typia.llm module from canonical contracts', () => {
    const source = renderTypiaLlmModule({
      applicationExportName: 'counterLlmApplication',
      interfaceName: 'CounterRestToolController',
      manifest: COUNTER_MANIFEST,
      structuredOutputExportName: 'counterStructuredOutput',
      structuredOutputTypeName: 'CounterResponse',
      typesImportPath: '../counter/api-types',
    });

    expect(source).toContain("import typia from 'typia';");
    expect(source).toContain("} from '../counter/api-types';");
    expect(source).toContain('export interface CounterRestToolController');
    expect(source).toContain('getCounter(input: CounterQuery): CounterResponse;');
    expect(source).toContain(
      'incrementCounter(input: CounterUpdateRequest): CounterResponse;',
    );
    expect(source).toContain(
      'WordPress auth: public-signed-token (field: publicWriteToken)',
    );
    expect(source).toContain(
      'typia.llm.application<CounterRestToolController>();',
    );
    expect(source).toContain('typia.llm.structuredOutput<CounterResponse>();');
  });

  test('quotes reserved operation ids in generated controller methods', () => {
    const source = renderTypiaLlmModule({
      applicationExportName: 'counterLlmApplication',
      interfaceName: 'CounterRestToolController',
      manifest: {
        ...COUNTER_MANIFEST,
        endpoints: [
          {
            ...COUNTER_MANIFEST.endpoints[1],
            operationId: 'delete',
          },
        ],
      },
      structuredOutputExportName: 'counterStructuredOutput',
      structuredOutputTypeName: 'CounterResponse',
      typesImportPath: '../counter/api-types',
    });

    expect(source).toContain(
      '"delete"(input: CounterUpdateRequest): CounterResponse;',
    );
  });

  test('renders multiline endpoint summaries as valid JSDoc lines', () => {
    const source = renderTypiaLlmModule({
      applicationExportName: 'counterLlmApplication',
      interfaceName: 'CounterRestToolController',
      manifest: {
        ...COUNTER_MANIFEST,
        endpoints: [
          {
            ...COUNTER_MANIFEST.endpoints[0],
            summary: 'Read the counter.\nIncludes generated adapter context.',
          },
        ],
      },
      structuredOutputExportName: 'counterStructuredOutput',
      structuredOutputTypeName: 'CounterResponse',
      typesImportPath: '../counter/api-types',
    });

    expect(source).toContain(
      [
        '  /**',
        '   * Read the counter.',
        '   * Includes generated adapter context.',
        '   *',
      ].join('\n'),
    );
  });

  test('writes and checks the generated adapter module', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'wp-typia-llm-'));
    const sourceFile = path.join(tempRoot, 'counter.llm.generated.ts');

    try {
      const written = await syncTypiaLlmAdapterModule({
        applicationExportName: 'counterLlmApplication',
        generatedSourceFile: sourceFile,
        interfaceName: 'CounterRestToolController',
        manifest: COUNTER_MANIFEST,
        structuredOutputExportName: 'counterStructuredOutput',
        structuredOutputTypeName: 'CounterResponse',
        typesImportPath: '../counter/api-types',
      });

      expect(written.check).toBe(false);
      expect(written.methodDescriptors).toHaveLength(2);

      const checked = await syncTypiaLlmAdapterModule({
        applicationExportName: 'counterLlmApplication',
        check: true,
        generatedSourceFile: sourceFile,
        interfaceName: 'CounterRestToolController',
        manifest: COUNTER_MANIFEST,
        structuredOutputExportName: 'counterStructuredOutput',
        structuredOutputTypeName: 'CounterResponse',
        typesImportPath: '../counter/api-types',
      });

      expect(checked.source).toBe(written.source);

      await writeFile(sourceFile, '// stale\n', 'utf8');
      await expect(
        syncTypiaLlmAdapterModule({
          applicationExportName: 'counterLlmApplication',
          check: true,
          generatedSourceFile: sourceFile,
          interfaceName: 'CounterRestToolController',
          manifest: COUNTER_MANIFEST,
          structuredOutputExportName: 'counterStructuredOutput',
          structuredOutputTypeName: 'CounterResponse',
          typesImportPath: '../counter/api-types',
        }),
      ).rejects.toThrow(/typia\.llm artifacts are missing or stale/);
      expect(await readFile(sourceFile, 'utf8')).toBe('// stale\n');
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  test('projects compiled typia.llm outputs into JSON-friendly artifacts', () => {
    const applicationArtifact = projectTypiaLlmApplicationArtifact({
      application: {
        functions: [
          {
            description: 'Read the counter.',
            name: 'getCounter',
            output: EMPTY_LLM_PARAMETERS,
            parameters: EMPTY_LLM_PARAMETERS,
            tags: ['Counter'],
          },
        ],
      },
      generatedFrom: {
        baselineOpenApiPath: 'src/blocks/counter/api.openapi.json',
        blockSlug: 'counter',
        manifestSource: 'endpoint-manifest+typescript',
      },
    });

    expect(applicationArtifact).toEqual({
      functions: [
        {
          description: 'Read the counter.',
          name: 'getCounter',
          output: EMPTY_LLM_PARAMETERS,
          parameters: EMPTY_LLM_PARAMETERS,
          tags: ['Counter'],
        },
      ],
      generatedFrom: {
        baselineOpenApiPath: 'src/blocks/counter/api.openapi.json',
        blockSlug: 'counter',
        manifestSource: 'endpoint-manifest+typescript',
      },
    });

    expect(
      projectTypiaLlmStructuredOutputArtifact({
        generatedFrom: {
          aiSchemaPath: 'src/blocks/counter/wordpress-ai/counter.ai.schema.json',
          blockSlug: 'counter',
          outputTypeName: 'CounterResponse',
        },
        structuredOutput: {
          parameters: EMPTY_LLM_PARAMETERS,
        },
      }),
    ).toEqual({
      generatedFrom: {
        aiSchemaPath: 'src/blocks/counter/wordpress-ai/counter.ai.schema.json',
        blockSlug: 'counter',
        outputTypeName: 'CounterResponse',
      },
      parameters: EMPTY_LLM_PARAMETERS,
    });
  });

  test('projects typia.llm outputs without retaining source references', () => {
    const generatedFrom: ProjectedTypiaLlmApplicationArtifact['generatedFrom'] =
      {
        baselineOpenApiPath: 'src/blocks/counter/api.openapi.json',
        blockSlug: 'counter',
        manifestSource: 'endpoint-manifest+typescript',
      };
    const output = createLlmParameters('Original output schema.');
    const parameters = createLlmParameters('Original input schema.');
    const tags = ['Counter'];

    const applicationArtifact = projectTypiaLlmApplicationArtifact({
      application: {
        functions: [
          {
            description: 'Read the counter.',
            name: 'getCounter',
            output,
            parameters,
            tags,
          },
        ],
      },
      generatedFrom,
    });

    (output.properties as Record<string, unknown>).count = {
      type: 'string',
    };
    (parameters.properties as Record<string, unknown>).count = {
      type: 'string',
    };
    generatedFrom.blockSlug = 'mutated-counter';
    tags.push('Mutated');

    expect(applicationArtifact).toEqual({
      functions: [
        {
          description: 'Read the counter.',
          name: 'getCounter',
          output: createLlmParameters('Original output schema.'),
          parameters: createLlmParameters('Original input schema.'),
          tags: ['Counter'],
        },
      ],
      generatedFrom: {
        baselineOpenApiPath: 'src/blocks/counter/api.openapi.json',
        blockSlug: 'counter',
        manifestSource: 'endpoint-manifest+typescript',
      },
    });
    expect(applicationArtifact.functions[0]?.output).not.toBe(output);
    expect(applicationArtifact.functions[0]?.parameters).not.toBe(parameters);
    expect(applicationArtifact.generatedFrom).not.toBe(generatedFrom);

    const structuredGeneratedFrom: ProjectedTypiaLlmStructuredOutputArtifact['generatedFrom'] =
      {
        aiSchemaPath: 'src/blocks/counter/wordpress-ai/counter.ai.schema.json',
        blockSlug: 'counter',
        outputTypeName: 'CounterResponse',
      };
    const structuredParameters = createLlmParameters(
      'Original structured output schema.',
    );
    const structuredArtifact = projectTypiaLlmStructuredOutputArtifact({
      generatedFrom: structuredGeneratedFrom,
      structuredOutput: {
        parameters: structuredParameters,
      },
    });

    (structuredParameters.properties as Record<string, unknown>).count = {
      type: 'string',
    };
    structuredGeneratedFrom.blockSlug = 'mutated-counter';

    expect(structuredArtifact).toEqual({
      generatedFrom: {
        aiSchemaPath: 'src/blocks/counter/wordpress-ai/counter.ai.schema.json',
        blockSlug: 'counter',
        outputTypeName: 'CounterResponse',
      },
      parameters: createLlmParameters('Original structured output schema.'),
    });
    expect(structuredArtifact.parameters).not.toBe(structuredParameters);
    expect(structuredArtifact.generatedFrom).not.toBe(structuredGeneratedFrom);
  });

  test('restores canonical OpenAPI constraints for projected function artifacts', () => {
    const constrainedArtifact = applyOpenApiConstraintsToTypiaLlmFunctionArtifact(
      {
        functionArtifact: {
          description: 'Increment the counter.',
          name: 'incrementCounter',
          output: {
            $defs: {},
            additionalProperties: false,
            properties: {
              count: {
                type: 'number',
              },
            },
            required: ['count'],
            type: 'object',
          },
          parameters: {
            $defs: {},
            additionalProperties: false,
            properties: {
              publicWriteToken: {
                type: 'string',
              },
            },
            required: ['publicWriteToken'],
            type: 'object',
          },
          tags: ['Counter'],
        },
        openApiDocument: COUNTER_OPENAPI,
        operationId: 'incrementCounter',
      },
    );

    expect(constrainedArtifact.parameters).toMatchObject({
      properties: {
        publicWriteToken: {
          minLength: 16,
          pattern: '^pt_[a-z0-9]+$',
          type: 'string',
        },
      },
      required: ['publicWriteToken'],
    });
    expect(constrainedArtifact.output).toMatchObject({
      properties: {
        count: {
          minimum: 0,
          type: 'integer',
        },
      },
      required: ['count'],
    });
  });

  test('restores OpenAPI constraints by mutating only the cloned target schema', () => {
    const parameters = {
      $defs: {},
      additionalProperties: false,
      properties: {
        publicWriteToken: {
          type: 'string',
        },
      },
      required: ['publicWriteToken'],
      type: 'object',
    } satisfies ILlmSchema.IParameters;
    const sourceArtifact = {
      description: 'Increment the counter.',
      name: 'incrementCounter',
      parameters,
      tags: ['Counter'],
    };
    const sourceParametersSnapshot = JSON.parse(
      JSON.stringify(parameters),
    ) as ILlmSchema.IParameters;

    const constrainedArtifact = applyOpenApiConstraintsToTypiaLlmFunctionArtifact(
      {
        functionArtifact: sourceArtifact,
        openApiDocument: COUNTER_OPENAPI,
        operationId: 'incrementCounter',
      },
    );

    expect(constrainedArtifact).not.toBe(sourceArtifact);
    expect(constrainedArtifact.parameters).not.toBe(parameters);
    expect(parameters as ILlmSchema.IParameters).toEqual(sourceParametersSnapshot);
    expect(constrainedArtifact.parameters).toMatchObject({
      properties: {
        publicWriteToken: {
          minLength: 16,
          pattern: '^pt_[a-z0-9]+$',
          type: 'string',
        },
      },
    });
  });

  test('rejects malformed typia.llm parameter artifacts before OpenAPI constraint projection', () => {
    expect(() =>
      applyOpenApiConstraintsToTypiaLlmFunctionArtifact({
        functionArtifact: {
          description: 'Increment the counter.',
          name: 'incrementCounter',
          parameters: [] as unknown as ILlmSchema.IParameters,
        },
        openApiDocument: COUNTER_OPENAPI,
        operationId: 'incrementCounter',
      }),
    ).toThrow(
      'typia.llm parameters for "incrementCounter" must be a JSON Schema object.',
    );
  });

  test('rejects malformed typia.llm output artifacts before OpenAPI constraint projection', () => {
    expect(() =>
      applyOpenApiConstraintsToTypiaLlmFunctionArtifact({
        functionArtifact: {
          description: 'Increment the counter.',
          name: 'incrementCounter',
          output: [] as unknown as ILlmSchema.IParameters,
          parameters: EMPTY_LLM_PARAMETERS,
        },
        openApiDocument: COUNTER_OPENAPI,
        operationId: 'incrementCounter',
      }),
    ).toThrow(
      'typia.llm output for "incrementCounter" must be a JSON Schema object.',
    );
  });

  test('rejects malformed typia.llm output artifacts when no OpenAPI response schema exists', () => {
    const noResponseOpenApi = {
      info: {
        title: 'No-response API',
        version: '1.0.0',
      },
      openapi: '3.1.0',
      paths: {
        '/stub': {
          post: {
            operationId: 'stubOp',
            responses: {},
            summary: 'Stub with no success response.',
            tags: [],
          },
        },
      },
    } as const as unknown as OpenApiDocument;

    expect(() =>
      applyOpenApiConstraintsToTypiaLlmFunctionArtifact({
        functionArtifact: {
          description: 'Stub.',
          name: 'stubOp',
          output: [] as unknown as ILlmSchema.IParameters,
          parameters: EMPTY_LLM_PARAMETERS,
        },
        openApiDocument: noResponseOpenApi,
        operationId: 'stubOp',
      }),
    ).toThrow('typia.llm output for "stubOp" must be a JSON Schema object.');
  });

  test('restores canonical OpenAPI constraints for mixed body/query tool inputs', () => {
    const applicationArtifact = projectTypiaLlmApplicationArtifact({
      application: {
        functions: [
          {
            description: 'Update the counter.',
            name: 'updateCounter',
            parameters: {
              $defs: {},
              additionalProperties: false,
              properties: {
                body: {
                  additionalProperties: false,
                  properties: {
                    publicWriteToken: {
                      type: 'string',
                    },
                  },
                  required: ['publicWriteToken'],
                  type: 'object',
                },
                query: {
                  additionalProperties: false,
                  properties: {
                    page: {
                      type: 'number',
                    },
                    search: {
                      type: 'string',
                    },
                  },
                  required: [],
                  type: 'object',
                },
              },
              required: ['body', 'query'],
              type: 'object',
            },
          },
        ],
      },
      generatedFrom: {
        baselineOpenApiPath: 'src/blocks/counter/api.openapi.json',
        blockSlug: 'counter',
        manifestSource: 'endpoint-manifest+typescript',
      },
      openApiProjection: {
        openApiDocument: COUNTER_OPENAPI,
      },
    });

    expect(applicationArtifact.functions[0]?.parameters).toMatchObject({
      properties: {
        body: {
          properties: {
            publicWriteToken: {
              minLength: 24,
              pattern: '^body_[a-z0-9]+$',
              type: 'string',
            },
          },
          required: ['publicWriteToken'],
        },
        query: {
          properties: {
            page: {
              minimum: 1,
              type: 'integer',
            },
            search: {
              minLength: 2,
              type: 'string',
            },
          },
          required: ['page'],
        },
      },
      required: ['body', 'query'],
    });
  });

  test('resolves nested OpenAPI component references and wildcard 2XX responses', () => {
    const constrainedArtifact = applyOpenApiConstraintsToTypiaLlmFunctionArtifact(
      {
        functionArtifact: {
          description: 'Synchronize the nested counter.',
          name: 'syncNestedCounter',
          output: {
            $defs: {},
            additionalProperties: false,
            properties: {
              count: {
                type: 'number',
              },
            },
            required: ['count'],
            type: 'object',
          },
          parameters: {
            $defs: {},
            additionalProperties: false,
            properties: {
              body: {
                additionalProperties: false,
                properties: {
                  payload: {
                    properties: {
                      delta: {
                        type: 'number',
                      },
                    },
                    required: ['delta'],
                    type: 'object',
                  },
                },
                required: ['payload'],
                type: 'object',
              },
              query: {
                additionalProperties: false,
                properties: {
                  postId: {
                    type: 'number',
                  },
                },
                required: [],
                type: 'object',
              },
            },
            required: ['body', 'query'],
            type: 'object',
          },
        },
        openApiDocument: NESTED_REFERENCE_OPENAPI,
        operationId: 'syncNestedCounter',
      },
    );

    expect(constrainedArtifact.parameters).toMatchObject({
      properties: {
        body: {
          properties: {
            payload: {
              properties: {
                delta: {
                  maximum: 9,
                  minimum: 1,
                  multipleOf: 1,
                  type: 'integer',
                },
              },
              required: ['delta'],
            },
          },
          required: ['payload'],
        },
        query: {
          properties: {
            postId: {
              maximum: 4294967295,
              minimum: 0,
              multipleOf: 1,
              type: 'integer',
            },
          },
          required: ['postId'],
        },
      },
    });
    expect(constrainedArtifact.output).toMatchObject({
      properties: {
        count: {
          maximum: 4294967295,
          minimum: 0,
          multipleOf: 1,
          type: 'integer',
        },
      },
      required: ['count'],
    });
  });

  test('preserves non-recursive constraints without failing on recursive schema references', () => {
    const constrainedArtifact = applyOpenApiConstraintsToTypiaLlmFunctionArtifact(
      {
        functionArtifact: {
          description: 'Synchronize the recursive node.',
          name: 'syncRecursiveNode',
          parameters: {
            $defs: {},
            additionalProperties: false,
            properties: {
              label: {
                type: 'string',
              },
            },
            required: ['label'],
            type: 'object',
          },
        },
        openApiDocument: RECURSIVE_REFERENCE_OPENAPI,
        operationId: 'syncRecursiveNode',
      },
    );

    expect(constrainedArtifact.parameters).toMatchObject({
      properties: {
        child: {
          properties: {
            label: {
              minLength: 1,
              type: 'string',
            },
          },
        },
        label: {
          minLength: 1,
          type: 'string',
        },
      },
      required: ['label'],
    });
  });

  test('projects mixed query/body endpoint inputs as composite tool input', () => {
    const mixedInputManifest = {
      contracts: {
        CounterQuery: {
          sourceTypeName: 'CounterQuery',
        },
        CounterResponse: {
          sourceTypeName: 'CounterResponse',
        },
        CounterUpdateRequest: {
          sourceTypeName: 'CounterUpdateRequest',
        },
      },
      endpoints: [
        {
          auth: 'authenticated',
          bodyContract: 'CounterUpdateRequest',
          method: 'POST',
          operationId: 'updateCounter',
          path: '/demo/v1/counter/(?P<id>\\d+)',
          queryContract: 'CounterQuery',
          responseContract: 'CounterResponse',
          summary: 'Update the counter.',
          tags: ['Counter'],
          wordpressAuth: {
            mechanism: 'rest-nonce',
          },
        },
      ],
    } as const satisfies EndpointManifestDefinition;

    expect(buildTypiaLlmEndpointMethodDescriptors(mixedInputManifest)).toEqual([
      {
        authIntent: 'authenticated',
        authMode: 'authenticated-rest-nonce',
        description: 'Update the counter.',
        inputTypeImportNames: ['CounterUpdateRequest', 'CounterQuery'],
        inputTypeName: '{ body: CounterUpdateRequest; query: CounterQuery }',
        method: 'POST',
        operationId: 'updateCounter',
        outputTypeName: 'CounterResponse',
        path: '/demo/v1/counter/(?P<id>\\d+)',
        tags: ['Counter'],
        wordpressAuth: {
          mechanism: 'rest-nonce',
        },
      },
    ]);

    const source = renderTypiaLlmModule({
      applicationExportName: 'counterLlmApplication',
      interfaceName: 'CounterRestToolController',
      manifest: mixedInputManifest,
      structuredOutputExportName: 'counterStructuredOutput',
      structuredOutputTypeName: 'CounterResponse',
      typesImportPath: '../counter/api-types',
    });

    expect(source).toContain(
      [
        '  updateCounter(',
        '    input: {',
        '      body: CounterUpdateRequest;',
        '      query: CounterQuery;',
        '    },',
        '  ): CounterResponse;',
      ].join('\n'),
    );
    expect(source).toContain('CounterQuery,');
    expect(source).toContain('CounterUpdateRequest,');
  });
});
