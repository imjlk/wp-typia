import { describe, expect, test } from 'bun:test';

import { BLOCKS } from '../../examples/persistence-examples/scripts/block-config';
import type { EndpointManifestDefinition } from '../../packages/wp-typia-block-runtime/src/metadata-core';
import {
  buildTypiaLlmEndpointMethodDescriptors,
  renderTypiaLlmModule,
} from '../../packages/wp-typia-project-tools/src/internal/typia-llm';

const counterManifest = BLOCKS.find(
  (block) => block.slug === 'counter',
)?.restManifest;

describe('typia.llm internal helper', () => {
  test('maps endpoint manifests to tool/controller method descriptors', () => {
    expect(counterManifest).toBeDefined();

    const methods = buildTypiaLlmEndpointMethodDescriptors(counterManifest!);

    expect(methods).toEqual([
      {
        authIntent: 'public',
        authMode: 'public-read',
        description: 'Read the current counter state.',
        inputTypeName: 'PersistenceCounterQuery',
        method: 'GET',
        operationId: 'getPersistenceCounterState',
        outputTypeName: 'PersistenceCounterResponse',
        path: '/persistence-examples/v1/counter',
        tags: ['Counter'],
      },
      {
        authIntent: 'public-write-protected',
        authMode: 'public-signed-token',
        description: 'Increment the current counter state.',
        inputTypeName: 'PersistenceCounterIncrementRequest',
        method: 'POST',
        operationId: 'incrementPersistenceCounterState',
        outputTypeName: 'PersistenceCounterResponse',
        path: '/persistence-examples/v1/counter',
        tags: ['Counter'],
        wordpressAuth: {
          mechanism: 'public-signed-token',
          publicTokenField: 'publicWriteToken',
        },
      },
      {
        authIntent: 'public',
        authMode: 'public-read',
        description:
          'Read fresh counter write bootstrap state for the current viewer.',
        inputTypeName: 'PersistenceCounterBootstrapQuery',
        method: 'GET',
        operationId: 'getPersistenceCounterBootstrap',
        outputTypeName: 'PersistenceCounterBootstrapResponse',
        path: '/persistence-examples/v1/counter/bootstrap',
        tags: ['Counter'],
      },
    ]);
  });

  test('renders a deterministic typia.llm evaluation module from the manifest', () => {
    expect(counterManifest).toBeDefined();

    const source = renderTypiaLlmModule({
      applicationExportName: 'counterLlmApplication',
      interfaceName: 'CounterRestToolController',
      manifest: counterManifest!,
      structuredOutputExportName: 'counterResponseStructuredOutput',
      structuredOutputTypeName: 'PersistenceCounterResponse',
      typesImportPath:
        '../../../persistence-examples/src/blocks/counter/api-types',
    });

    expect(source).toContain("import typia from 'typia';");
    expect(source).toContain('export interface CounterRestToolController');
    expect(source).toContain(
      [
        '  getPersistenceCounterState(',
        '    input: PersistenceCounterQuery,',
        '  ): PersistenceCounterResponse;',
      ].join('\n'),
    );
    expect(source).toContain(
      [
        '  incrementPersistenceCounterState(',
        '    input: PersistenceCounterIncrementRequest,',
        '  ): PersistenceCounterResponse;',
      ].join('\n'),
    );
    expect(source).toContain(
      [
        '  getPersistenceCounterBootstrap(',
        '    input: PersistenceCounterBootstrapQuery,',
        '  ): PersistenceCounterBootstrapResponse;',
      ].join('\n'),
    );
    expect(source).toContain('REST path: GET /persistence-examples/v1/counter');
    expect(source).toContain(
      'REST path: POST /persistence-examples/v1/counter',
    );
    expect(source).toContain(
      'REST path: GET /persistence-examples/v1/counter/bootstrap',
    );
    expect(source).toContain('Auth intent: public');
    expect(source).toContain('Auth intent: public-write-protected');
    expect(source).toContain(
      'WordPress auth: public-signed-token (field: publicWriteToken)',
    );
    expect(source).toContain('@tag Counter');
    expect(source).toContain(
      'export const counterLlmApplication =\n  typia.llm.application<CounterRestToolController>();',
    );
    expect(source).toContain(
      'export const counterResponseStructuredOutput =\n  typia.llm.structuredOutput<PersistenceCounterResponse>();',
    );
  });

  test('uses query contracts for non-GET endpoints when no body contract exists', () => {
    const manifest = {
      contracts: {
        deleteCounterQuery: { sourceTypeName: 'DeleteCounterQuery' },
        persistenceCounterResponse: {
          sourceTypeName: 'PersistenceCounterResponse',
        },
      },
      endpoints: [
        {
          auth: 'authenticated',
          method: 'DELETE',
          operationId: 'deletePersistenceCounterState',
          path: '/persistence-examples/v1/counter',
          queryContract: 'deleteCounterQuery',
          responseContract: 'persistenceCounterResponse',
          tags: ['Counter'],
          wordpressAuth: {
            mechanism: 'rest-nonce',
          },
        },
      ],
    } satisfies EndpointManifestDefinition;

    expect(buildTypiaLlmEndpointMethodDescriptors(manifest)).toEqual([
      expect.objectContaining({
        inputTypeName: 'DeleteCounterQuery',
        operationId: 'deletePersistenceCounterState',
      }),
    ]);
  });

  test('projects non-GET endpoints that define both body and query contracts', () => {
    const manifest = {
      contracts: {
        body: { sourceTypeName: 'BodyInput' },
        query: { sourceTypeName: 'QueryInput' },
        response: { sourceTypeName: 'ResponseOutput' },
      },
      endpoints: [
        {
          authMode: 'authenticated-rest-nonce',
          bodyContract: 'body',
          method: 'POST',
          operationId: 'ambiguousInput',
          path: '/persistence-examples/v1/counter',
          queryContract: 'query',
          responseContract: 'response',
          tags: ['Counter'],
        },
      ],
    } satisfies EndpointManifestDefinition;

    expect(buildTypiaLlmEndpointMethodDescriptors(manifest)).toEqual([
      expect.objectContaining({
        inputTypeImportNames: ['BodyInput', 'QueryInput'],
        inputTypeName: '{ body: BodyInput; query: QueryInput }',
        operationId: 'ambiguousInput',
      }),
    ]);
  });

  test('quotes invalid operation ids when rendering generated TypeScript', () => {
    const manifest = {
      contracts: {
        query: { sourceTypeName: 'CounterQuery' },
        response: { sourceTypeName: 'CounterResponse' },
      },
      endpoints: [
        {
          auth: 'public',
          method: 'GET',
          operationId: 'get-counter state',
          path: '/persistence-examples/v1/counter',
          queryContract: 'query',
          responseContract: 'response',
          tags: ['Counter'],
        },
      ],
    } satisfies EndpointManifestDefinition;

    const source = renderTypiaLlmModule({
      applicationExportName: 'counterLlmApplication',
      interfaceName: 'CounterRestToolController',
      manifest,
      structuredOutputExportName: 'counterResponseStructuredOutput',
      structuredOutputTypeName: 'CounterResponse',
      typesImportPath: './counter-types',
    });

    expect(source).toContain(
      '"get-counter state"(input: CounterQuery): CounterResponse;',
    );
  });
});
