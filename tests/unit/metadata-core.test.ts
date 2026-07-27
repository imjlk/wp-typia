import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'bun:test';

import {
  defineBlockNesting,
  defineEndpointManifest,
  defineInnerBlocksTemplates,
  formatBlockPatternContentNestingDiagnostics,
  getInnerBlocksTemplatesFromNesting,
  renderInnerBlocksTemplateModule,
  runSyncBlockMetadata,
  syncBlockMetadata,
  syncEndpointClient,
  syncInnerBlocksTemplateModule,
  syncRestOpenApi,
  syncTypeSchemas,
  validateBlockPatternContentNesting,
  validateBlockNestingContract,
  validateInnerBlocksTemplates,
  type EndpointManifestDefinition,
  type SyncEndpointClientOptions,
  type SyncRestOpenApiContractsOptions,
  type SyncRestOpenApiManifestOptions,
  type SyncRestOpenApiOptions,
} from '../../packages/wp-typia-block-runtime/src/metadata-core';
import {
  NESTED_BLOCK_FAMILY_BLOCK_NAMES,
  NESTED_BLOCK_FAMILY_NESTING,
  NESTED_BLOCK_FAMILY_PATTERN_CONTENT,
  NESTED_BLOCK_FAMILY_TEMPLATES,
} from '../fixtures/nested-block-family';

const manifest = defineEndpointManifest({
  contracts: {
    query: { sourceTypeName: 'CounterQuery' },
    request: { sourceTypeName: 'WriteCounterRequest' },
    response: { sourceTypeName: 'CounterResponse' },
  },
  endpoints: [
    {
      auth: 'public',
      method: 'GET',
      operationId: 'getCounterState',
      path: '/demo/v1/counter/state',
      queryContract: 'query',
      responseContract: 'response',
      tags: ['Counter'],
    },
    {
      auth: 'authenticated',
      bodyContract: 'request',
      method: 'POST',
      operationId: 'writeCounterState',
      path: '/demo/v1/counter/state',
      responseContract: 'response',
      tags: ['Counter'],
      wordpressAuth: {
        mechanism: 'rest-nonce',
      },
    },
  ],
  info: {
    title: 'Counter REST API',
    version: '1.0.0',
  },
} as const);

const manifestOptions: SyncRestOpenApiManifestOptions = {
  manifest,
  openApiFile: 'src/api.openapi.json',
  typesFile: 'src/api-types.ts',
};
const clientOptions: SyncEndpointClientOptions = {
  clientFile: 'src/api-client.ts',
  manifest,
  typesFile: 'src/api-types.ts',
};

const compatibilityOptions: SyncRestOpenApiContractsOptions = {
  contracts: manifest.contracts,
  endpoints: manifest.endpoints,
  openApiFile: 'src/api.openapi.json',
  openApiInfo: manifest.info,
  typesFile: 'src/api-types.ts',
};

const manifestShape: EndpointManifestDefinition = manifest;
const syncOptions: SyncRestOpenApiOptions = manifestOptions;

void manifestShape;
void syncOptions;
void compatibilityOptions;
void clientOptions;

function createTempProject(): { root: string; typesFile: string } {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-metadata-core-'),
  );
  const typesDir = path.join(root, 'src');
  fs.mkdirSync(typesDir, { recursive: true });
  fs.writeFileSync(
    path.join(typesDir, 'api-types.ts'),
    [
      'export interface CounterQuery {',
      '  postId: number;',
      '}',
      '',
      'export interface WriteCounterRequest {',
      '  postId: number;',
      '  publicWriteToken?: string;',
      '}',
      '',
      'export interface CounterResponse {',
      '  count: number;',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(typesDir, 'api-validators.ts'),
    [
      "import type { ValidationResult } from '@wp-typia/api-client';",
      "import type { CounterQuery, CounterResponse, WriteCounterRequest } from './api-types';",
      '',
      'function ok<T>(input: T): ValidationResult<T> {',
      '  return { data: input, errors: [], isValid: true };',
      '}',
      '',
      'export const apiValidators = {',
      '  query: (input: unknown): ValidationResult<CounterQuery> => ok(input as CounterQuery),',
      '  request: (input: unknown): ValidationResult<WriteCounterRequest> => ok(input as WriteCounterRequest),',
      '  response: (input: unknown): ValidationResult<CounterResponse> => ok(input as CounterResponse),',
      '};',
      '',
    ].join('\n'),
    'utf8',
  );

  return {
    root,
    typesFile: 'src/api-types.ts',
  };
}

describe('metadata-core endpoint manifests', () => {
  test('defineBlockNesting preserves typed nesting contracts', () => {
    const nesting = defineBlockNesting({
      'demo/container': {
        allowedBlocks: ['demo/section'],
      },
      'demo/section': {
        parent: ['demo/container'],
      },
    } as const);

    expect(nesting['demo/container'].allowedBlocks).toEqual(['demo/section']);
    expect(() =>
      validateBlockNestingContract(nesting, {
        knownBlockNames: ['demo/container', 'demo/section'],
      }),
    ).not.toThrow();
  });

  test('validateBlockNestingContract can allow external relationship names', () => {
    expect(() =>
      validateBlockNestingContract(
        defineBlockNesting({
          'demo/section': {
            parent: ['core/group'],
          },
        }),
        {
          allowExternalBlockNames: true,
          knownBlockNames: ['demo/section'],
        },
      ),
    ).not.toThrow();

    expect(() =>
      validateBlockNestingContract(
        defineBlockNesting({
          'demo/section': {
            parent: ['demo/missing-parent'],
          },
        }),
        {
          allowExternalBlockNames: true,
          knownBlockNames: ['demo/section'],
        },
      ),
    ).toThrow('parent references unknown block "demo/missing-parent"');

    expect(() =>
      validateBlockNestingContract(
        defineBlockNesting({
          'core/group': {
            allowedBlocks: ['demo/section'],
          },
        }),
        {
          allowExternalBlockNames: true,
          knownBlockNames: ['demo/section'],
        },
      ),
    ).toThrow('Contract key references unknown block "core/group"');
  });

  test('defineInnerBlocksTemplates validates multi-level template relationships', () => {
    const nesting = defineBlockNesting({
      'demo/container': {
        allowedBlocks: ['demo/section'],
      },
      'demo/section': {
        allowedBlocks: ['demo/title', 'demo/body'],
        parent: ['demo/container'],
      },
      'demo/title': {
        ancestor: ['demo/container'],
      },
      'demo/body': {
        parent: ['demo/section'],
      },
    });
    const templates = defineInnerBlocksTemplates({
      'demo/container': [
        [
          'demo/section',
          { role: 'hero' },
          [
            ['demo/title', { placeholder: 'Title' }],
            ['demo/body', { placeholder: 'Write...' }],
          ],
        ],
      ],
    });

    expect(() =>
      validateInnerBlocksTemplates(templates, {
        knownBlockNames: [
          'demo/container',
          'demo/section',
          'demo/title',
          'demo/body',
        ],
        nesting,
      }),
    ).not.toThrow();

    expect(() =>
      validateInnerBlocksTemplates(
        defineInnerBlocksTemplates({
          'demo/container': [['demo/body', { placeholder: 'Invalid' }]],
        }),
        {
          knownBlockNames: [
            'demo/container',
            'demo/section',
            'demo/title',
            'demo/body',
          ],
          nesting,
        },
      ),
    ).toThrow(
      'InnerBlocks template "demo/container"[0] uses "demo/body", but demo/container.allowedBlocks does not include "demo/body".',
    );
  });

  test('validateBlockPatternContentNesting accepts serialized patterns that follow nesting rules', () => {
    const nesting = defineBlockNesting({
      'demo/container': {
        allowedBlocks: ['demo/section'],
      },
      'demo/section': {
        allowedBlocks: ['demo/title', 'core/paragraph'],
        parent: ['demo/container'],
      },
      'demo/title': {
        ancestor: ['demo/container'],
      },
    });
    const result = validateBlockPatternContentNesting(
      [
        '<!-- wp:demo/container -->',
        '<div class="wp-block-demo-container">',
        '<!-- wp:demo/section -->',
        '<section class="wp-block-demo-section">',
        '<!-- wp:demo/title {"placeholder":"Title"} /-->',
        '<!-- wp:paragraph {"placeholder":"Body copy"} /-->',
        '</section>',
        '<!-- /wp:demo/section -->',
        '</div>',
        '<!-- /wp:demo/container -->',
      ].join('\n'),
      {
        allowExternalBlockNames: true,
        knownBlockNames: ['demo/container', 'demo/section', 'demo/title'],
        nesting,
        patternFile: 'src/patterns/valid.php',
      },
    );

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.blocks[0]?.blockName).toBe('demo/container');
    expect(result.blocks[0]?.innerBlocks[0]?.innerBlocks[1]?.blockName).toBe(
      'core/paragraph',
    );
  });

  test('validateBlockPatternContentNesting reports invalid block relationships with file and block path', () => {
    const nesting = defineBlockNesting({
      'demo/container': {
        allowedBlocks: ['demo/section'],
      },
      'demo/section': {
        parent: ['demo/container'],
      },
      'demo/body': {
        parent: ['demo/section'],
      },
      'demo/eyebrow': {
        ancestor: ['demo/container'],
      },
    });
    const result = validateBlockPatternContentNesting(
      [
        '<!-- wp:demo/container -->',
        '<!-- wp:demo/body /-->',
        '<!-- /wp:demo/container -->',
        '<!-- wp:demo/eyebrow /-->',
      ].join('\n'),
      {
        knownBlockNames: [
          'demo/container',
          'demo/section',
          'demo/body',
          'demo/eyebrow',
        ],
        nesting,
        patternFile: 'src/patterns/invalid.php',
      },
    );
    const formatted = formatBlockPatternContentNestingDiagnostics(result.errors);

    expect(result.warnings).toEqual([]);
    expect(result.errors.map((diagnostic) => diagnostic.code)).toEqual([
      'disallowed-child-block',
      'invalid-block-parent',
      'invalid-block-ancestor',
    ]);
    expect(formatted).toContain('src/patterns/invalid.php');
    expect(formatted).toContain('demo/container[0] > demo/body[0]');
    expect(formatted).toContain(
      'demo/container.allowedBlocks does not include "demo/body"',
    );
    expect(formatted).toContain(
      '"demo/eyebrow" requires one of these ancestor blocks: demo/container',
    );
  });

  test('validateBlockPatternContentNesting treats unknown and unparseable pattern content as warnings', () => {
    const result = validateBlockPatternContentNesting(
      [
        '<!-- wp:demo/unknown {"broken":} -->',
        '<p>Unknown block content</p>',
        '<!-- /wp:demo/unknown -->',
        '<!-- /wp:demo/orphan -->',
      ].join('\n'),
      {
        allowExternalBlockNames: true,
        knownBlockNames: ['demo/container'],
        nesting: defineBlockNesting({}),
        patternFile: 'src/patterns/warn.php',
      },
    );
    const formattedWarnings = formatBlockPatternContentNestingDiagnostics(
      result.warnings,
    );

    expect(result.errors).toEqual([]);
    expect(result.warnings.map((diagnostic) => diagnostic.code)).toContain(
      'invalid-block-pattern-attributes',
    );
    expect(result.warnings.map((diagnostic) => diagnostic.code)).toContain(
      'unknown-block',
    );
    expect(result.warnings.map((diagnostic) => diagnostic.code)).toContain(
      'unbalanced-block-pattern-comment',
    );
    expect(formattedWarnings).toContain('src/patterns/warn.php');
    expect(formattedWarnings).toContain('unknown block "demo/unknown"');
    expect(formattedWarnings).toContain(
      'closing block "demo/orphan" does not match an open block',
    );
  });

  test('validateBlockPatternContentNesting reports every block dropped by a mid-stack close', () => {
    const result = validateBlockPatternContentNesting(
      [
        '<!-- wp:demo/container -->',
        '<!-- wp:demo/section -->',
        '<!-- wp:demo/body -->',
        '<!-- /wp:demo/container -->',
      ].join('\n'),
      {
        knownBlockNames: ['demo/container', 'demo/section', 'demo/body'],
        nesting: defineBlockNesting({}),
        patternFile: 'src/patterns/unbalanced.php',
      },
    );
    const formattedWarnings = formatBlockPatternContentNestingDiagnostics(
      result.warnings,
    );

    expect(result.errors).toEqual([]);
    expect(formattedWarnings).toContain(
      'Serialized opening block "demo/body" was not closed before "demo/container" closed.',
    );
    expect(formattedWarnings).toContain(
      'Serialized opening block "demo/section" was not closed before "demo/container" closed.',
    );
    expect(formattedWarnings).toContain(
      'Serialized closing block "demo/container" appeared before all nested blocks were closed.',
    );
  });

  test('nested block family fixture documents reusable contract, template, and pattern validation', () => {
    expect(() =>
      validateBlockNestingContract(NESTED_BLOCK_FAMILY_NESTING, {
        knownBlockNames: NESTED_BLOCK_FAMILY_BLOCK_NAMES,
      }),
    ).not.toThrow();
    expect(() =>
      validateInnerBlocksTemplates(NESTED_BLOCK_FAMILY_TEMPLATES, {
        knownBlockNames: NESTED_BLOCK_FAMILY_BLOCK_NAMES,
        nesting: NESTED_BLOCK_FAMILY_NESTING,
      }),
    ).not.toThrow();

    const patternValidation = validateBlockPatternContentNesting(
      NESTED_BLOCK_FAMILY_PATTERN_CONTENT,
      {
        knownBlockNames: NESTED_BLOCK_FAMILY_BLOCK_NAMES,
        nesting: NESTED_BLOCK_FAMILY_NESTING,
        patternFile: 'src/patterns/nested-family.php',
      },
    );

    expect(patternValidation.errors).toEqual([]);
    expect(patternValidation.warnings).toEqual([]);
    expect(patternValidation.blocks[0]?.blockName).toBe('example/container');
    expect(
      renderInnerBlocksTemplateModule(NESTED_BLOCK_FAMILY_TEMPLATES),
    ).toContain("'example/container'");
  });

  test('block nesting contracts can carry generated InnerBlocks templates', () => {
    const nesting = defineBlockNesting({
      'demo/container': {
        allowedBlocks: ['demo/section'],
        template: [['demo/section', { role: 'intro' }]],
      },
      'demo/section': {
        parent: ['demo/container'],
      },
    } as const);

    expect(getInnerBlocksTemplatesFromNesting(nesting)).toEqual({
      'demo/container': [['demo/section', { role: 'intro' }]],
    });
    expect(
      getInnerBlocksTemplatesFromNesting({
        'demo/empty': {
          template: undefined,
        },
      } as unknown as Parameters<typeof getInnerBlocksTemplatesFromNesting>[0]),
    ).toEqual({});
    expect(() =>
      validateBlockNestingContract(nesting, {
        knownBlockNames: ['demo/container', 'demo/section'],
      }),
    ).not.toThrow();
  });

  test('syncInnerBlocksTemplateModule writes editor template constants and detects drift', async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-innerblocks-template-'),
    );
    const nesting = defineBlockNesting({
      'demo/container': {
        allowedBlocks: ['demo/section'],
      },
      'demo/section': {
        parent: ['demo/container'],
      },
    });
    const templates = defineInnerBlocksTemplates({
      'demo/container': [['demo/section', { role: 'hero' }]],
    });

    try {
      const result = await syncInnerBlocksTemplateModule({
        knownBlockNames: ['demo/container', 'demo/section'],
        nesting,
        outputFile: 'src/inner-blocks-templates.ts',
        projectRoot: root,
        templates,
      });

      expect(result.templateNames).toEqual(['demo/container']);
      const output = fs.readFileSync(result.outputPath, 'utf8');
      expect(output).toContain('generated by wp-typia');
      expect(output).toContain('export const INNER_BLOCKS_TEMPLATES');
      expect(output).toContain("'demo/container'");
      expect(output).toContain("'demo/section'");
      expect(renderInnerBlocksTemplateModule(templates)).toBe(output);
      expect(() =>
        renderInnerBlocksTemplateModule(templates, {
          exportName: "INNER_BLOCKS_TEMPLATES; console.log('nope')",
        }),
      ).toThrow('is not a valid TypeScript identifier');

      fs.writeFileSync(result.outputPath, output.replace('hero', 'stale'), 'utf8');
      await expect(
        syncInnerBlocksTemplateModule(
          {
            knownBlockNames: ['demo/container', 'demo/section'],
            nesting,
            outputFile: 'src/inner-blocks-templates.ts',
            projectRoot: root,
            templates,
          },
          { check: true },
        ),
      ).rejects.toThrow(path.join(root, 'src', 'inner-blocks-templates.ts'));

      await expect(
        syncInnerBlocksTemplateModule({
          knownBlockNames: ['demo/container', 'demo/section'],
          nesting: {
            'demo/container': {
              allowedBlocks: ['demo/section'],
            },
            'demo/section': {
              parent: ['demo/other-container'],
            },
          },
          outputFile: 'src/inner-blocks-templates.ts',
          projectRoot: root,
          templates,
        }),
      ).rejects.toThrow(
        'demo/section.parent references unknown block "demo/other-container"',
      );
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  test('syncBlockMetadata applies typed nesting relationships to block metadata', async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-nesting-sync-'),
    );
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'block.json'),
      JSON.stringify(
        {
          name: 'demo/container',
          ancestor: ['demo/legacy'],
          attributes: {},
          example: { attributes: {} },
        },
        null,
        2,
      ),
      'utf8',
    );
    fs.writeFileSync(
      path.join(root, 'section.json'),
      JSON.stringify(
        {
          name: 'demo/section',
          allowedBlocks: ['demo/legacy-child'],
          attributes: {},
          example: { attributes: {} },
        },
        null,
        2,
      ),
      'utf8',
    );
    fs.writeFileSync(
      path.join(root, 'src', 'types.ts'),
      [
        'export interface ContainerAttributes {',
        '  title: string;',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );

    try {
      await syncBlockMetadata({
        allowExternalBlockNames: true,
        blockJsonFile: 'block.json',
        knownBlockNames: ['demo/container', 'demo/section'],
        manifestFile: 'typia.manifest.json',
        nesting: defineBlockNesting({
          'demo/container': {
            allowedBlocks: ['demo/section', 'core/paragraph'],
          },
          'demo/section': {
            parent: ['demo/container'],
          },
        }),
        projectRoot: root,
        sourceTypeName: 'ContainerAttributes',
        typesFile: 'src/types.ts',
      });

      const blockJson = JSON.parse(
        fs.readFileSync(path.join(root, 'block.json'), 'utf8'),
      );
      expect(blockJson.allowedBlocks).toEqual([
        'demo/section',
        'core/paragraph',
      ]);
      expect(blockJson.ancestor).toBeUndefined();
      expect(blockJson.attributes.title).toEqual({ type: 'string' });

      await syncBlockMetadata({
        blockJsonFile: 'section.json',
        knownBlockNames: ['demo/root', 'demo/container', 'demo/section'],
        manifestFile: 'section.manifest.json',
        nesting: defineBlockNesting({
          'demo/section': {
            ancestor: ['demo/root'],
            parent: ['demo/container'],
          },
        }),
        projectRoot: root,
        sourceTypeName: 'ContainerAttributes',
        typesFile: 'src/types.ts',
      });
      const sectionBlockJson = JSON.parse(
        fs.readFileSync(path.join(root, 'section.json'), 'utf8'),
      );
      expect(sectionBlockJson.parent).toEqual(['demo/container']);
      expect(sectionBlockJson.ancestor).toEqual(['demo/root']);
      expect(sectionBlockJson.allowedBlocks).toBeUndefined();

      fs.writeFileSync(
        path.join(root, 'block.json'),
        JSON.stringify(
          {
            ...blockJson,
            allowedBlocks: ['demo/other-section'],
          },
          null,
          2,
        ),
        'utf8',
      );
      await expect(
        syncBlockMetadata(
          {
            blockJsonFile: 'block.json',
            knownBlockNames: ['demo/container', 'demo/section'],
            manifestFile: 'typia.manifest.json',
            nesting: defineBlockNesting({
              'demo/container': {
                allowedBlocks: ['demo/section'],
              },
              'demo/section': {
                parent: ['demo/container'],
              },
            }),
            projectRoot: root,
            sourceTypeName: 'ContainerAttributes',
            typesFile: 'src/types.ts',
          },
          { check: true },
        ),
      ).rejects.toThrow(path.join(root, 'block.json'));
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  test('runSyncBlockMetadata reports unknown nesting references', async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-nesting-invalid-'),
    );
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'block.json'),
      JSON.stringify(
        {
          name: 'demo/container',
          attributes: {},
          example: { attributes: {} },
        },
        null,
        2,
      ),
      'utf8',
    );
    fs.writeFileSync(
      path.join(root, 'src', 'types.ts'),
      [
        'export interface ContainerAttributes {',
        '  title: string;',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );

    try {
      const report = await runSyncBlockMetadata({
        blockJsonFile: 'block.json',
        knownBlockNames: ['demo/container'],
        manifestFile: 'typia.manifest.json',
        nesting: defineBlockNesting({
          'demo/container': {
            allowedBlocks: ['demo/missing-section'],
          },
        }),
        projectRoot: root,
        sourceTypeName: 'ContainerAttributes',
        typesFile: 'src/types.ts',
      });

      expect(report.status).toBe('error');
      expect(report.failure?.code).toBe('invalid-block-nesting-contract');
      expect(report.failure?.message).toContain('demo/missing-section');
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  test('defineEndpointManifest preserves the manifest payload', () => {
    expect(manifest.contracts.query.sourceTypeName).toBe('CounterQuery');
    expect(manifest.endpoints[0]).toMatchObject({
      auth: 'public',
      method: 'GET',
      operationId: 'getCounterState',
      path: '/demo/v1/counter/state',
      queryContract: 'query',
      responseContract: 'response',
    });
    expect(manifest.info).toEqual({
      title: 'Counter REST API',
      version: '1.0.0',
    });
  });

  test('syncRestOpenApi accepts manifest-first input and preserves the existing output shape', async () => {
    const project = createTempProject();

    try {
      const manifestResult = await syncRestOpenApi({
        manifest,
        openApiFile: 'build/manifest.openapi.json',
        projectRoot: project.root,
        typesFile: project.typesFile,
      });
      const compatibilityResult = await syncRestOpenApi({
        contracts: manifest.contracts,
        endpoints: manifest.endpoints,
        openApiFile: 'build/compat.openapi.json',
        openApiInfo: manifest.info,
        projectRoot: project.root,
        typesFile: project.typesFile,
      });

      const manifestOpenApi = JSON.parse(
        fs.readFileSync(
          path.join(project.root, 'build', 'manifest.openapi.json'),
          'utf8',
        ),
      );
      const compatibilityOpenApi = JSON.parse(
        fs.readFileSync(
          path.join(project.root, 'build', 'compat.openapi.json'),
          'utf8',
        ),
      );

      expect(manifestResult.schemaNames).toEqual([
        'CounterQuery',
        'WriteCounterRequest',
        'CounterResponse',
      ]);
      expect(compatibilityResult.schemaNames).toEqual(
        manifestResult.schemaNames,
      );
      expect(manifestOpenApi).toEqual(compatibilityOpenApi);
      expect(manifestOpenApi.paths['/demo/v1/counter/state'].get).toBeDefined();
      expect(
        manifestOpenApi.paths['/demo/v1/counter/state'].post,
      ).toBeDefined();
    } finally {
      fs.rmSync(project.root, { force: true, recursive: true });
    }
  });

  test('syncEndpointClient emits a portable manifest-first client module', async () => {
    const project = createTempProject();

    try {
      const result = await syncEndpointClient({
        clientFile: 'build/api-client.ts',
        manifest,
        projectRoot: project.root,
        typesFile: project.typesFile,
      });
      const generatedClient = fs.readFileSync(
        path.join(project.root, 'build', 'api-client.ts'),
        'utf8',
      );

      expect(result.endpointCount).toBe(2);
      expect(result.operationIds).toEqual([
        'getCounterState',
        'writeCounterState',
      ]);
      expect(generatedClient).toContain("from '@wp-typia/api-client'");
      expect(generatedClient).toContain('import type {');
      expect(generatedClient).toContain('  CounterQuery,');
      expect(generatedClient).toContain('  CounterResponse,');
      expect(generatedClient).toContain('  WriteCounterRequest,');
      expect(generatedClient).toContain(
        "import { apiValidators } from '../src/api-validators'",
      );
      expect(generatedClient).toContain("authIntent: 'public'");
      expect(generatedClient).toContain("authIntent: 'authenticated'");
      expect(generatedClient).toContain("requestLocation: 'query'");
      expect(generatedClient).toContain("requestLocation: 'body'");
      expect(generatedClient).toContain("authMode: 'public-read'");
      expect(generatedClient).toContain("authMode: 'authenticated-rest-nonce'");
      expect(generatedClient).toContain('validateRequest: apiValidators.query');
      expect(generatedClient).toContain(
        'validateRequest: apiValidators.request',
      );
      expect(generatedClient).toContain(
        'validateResponse: apiValidators.response',
      );
      expect(generatedClient).toContain(
        'export const getCounterStateEndpoint = createEndpoint<',
      );
      expect(generatedClient).toContain('export function getCounterState(');
      expect(generatedClient).toContain('export function writeCounterState(');
    } finally {
      fs.rmSync(project.root, { force: true, recursive: true });
    }
  });

  test('check mode verifies generated artifacts and reports stale files without rewriting them', async () => {
    const project = createTempProject();
    const blockJsonPath = path.join(project.root, 'block.json');
    const blockTypesPath = path.join(project.root, 'src', 'block-types.ts');
    const schemaPath = path.join(project.root, 'build', 'query.schema.json');
    const openApiPath = path.join(
      project.root,
      'build',
      'manifest.openapi.json',
    );
    const clientPath = path.join(project.root, 'build', 'api-client.ts');
    const blockManifestPath = path.join(
      project.root,
      'build',
      'block.manifest.json',
    );

    fs.writeFileSync(
      blockJsonPath,
      JSON.stringify({ attributes: {}, example: { attributes: {} } }, null, 2),
      'utf8',
    );
    fs.writeFileSync(
      blockTypesPath,
      [
        'export interface DemoBlockAttributes {',
        '  title: string;',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );

    try {
      await syncTypeSchemas({
        jsonSchemaFile: 'build/query.schema.json',
        projectRoot: project.root,
        sourceTypeName: 'CounterQuery',
        typesFile: project.typesFile,
      });
      await syncRestOpenApi({
        manifest,
        openApiFile: 'build/manifest.openapi.json',
        projectRoot: project.root,
        typesFile: project.typesFile,
      });
      await syncEndpointClient({
        clientFile: 'build/api-client.ts',
        manifest,
        projectRoot: project.root,
        typesFile: project.typesFile,
      });
      await syncBlockMetadata({
        blockJsonFile: 'block.json',
        manifestFile: 'build/block.manifest.json',
        projectRoot: project.root,
        sourceTypeName: 'DemoBlockAttributes',
        typesFile: 'src/block-types.ts',
      });

      await syncTypeSchemas(
        {
          jsonSchemaFile: 'build/query.schema.json',
          projectRoot: project.root,
          sourceTypeName: 'CounterQuery',
          typesFile: project.typesFile,
        },
        { check: true },
      );
      await syncRestOpenApi(
        {
          manifest,
          openApiFile: 'build/manifest.openapi.json',
          projectRoot: project.root,
          typesFile: project.typesFile,
        },
        { check: true },
      );
      await syncEndpointClient(
        {
          clientFile: 'build/api-client.ts',
          manifest,
          projectRoot: project.root,
          typesFile: project.typesFile,
        },
        { check: true },
      );
      await syncBlockMetadata(
        {
          blockJsonFile: 'block.json',
          manifestFile: 'build/block.manifest.json',
          projectRoot: project.root,
          sourceTypeName: 'DemoBlockAttributes',
          typesFile: 'src/block-types.ts',
        },
        { check: true },
      );

      fs.writeFileSync(
        schemaPath,
        fs.readFileSync(schemaPath, 'utf8').replace(/\n/g, '\r\n'),
        'utf8',
      );
      await syncTypeSchemas(
        {
          jsonSchemaFile: 'build/query.schema.json',
          projectRoot: project.root,
          sourceTypeName: 'CounterQuery',
          typesFile: project.typesFile,
        },
        { check: true },
      );

      fs.writeFileSync(schemaPath, '{\n  "stale": true\n}\n', 'utf8');
      await expect(
        syncTypeSchemas(
          {
            jsonSchemaFile: 'build/query.schema.json',
            projectRoot: project.root,
            sourceTypeName: 'CounterQuery',
            typesFile: project.typesFile,
          },
          { check: true },
        ),
      ).rejects.toThrow(schemaPath);
      expect(fs.readFileSync(schemaPath, 'utf8')).toBe(
        '{\n  "stale": true\n}\n',
      );

      await syncTypeSchemas({
        jsonSchemaFile: 'build/query.schema.json',
        projectRoot: project.root,
        sourceTypeName: 'CounterQuery',
        typesFile: project.typesFile,
      });
      fs.writeFileSync(openApiPath, '{\n  "stale": true\n}\n', 'utf8');
      await expect(
        syncRestOpenApi(
          {
            manifest,
            openApiFile: 'build/manifest.openapi.json',
            projectRoot: project.root,
            typesFile: project.typesFile,
          },
          { check: true },
        ),
      ).rejects.toThrow(openApiPath);
      expect(fs.readFileSync(openApiPath, 'utf8')).toBe(
        '{\n  "stale": true\n}\n',
      );

      await syncRestOpenApi({
        manifest,
        openApiFile: 'build/manifest.openapi.json',
        projectRoot: project.root,
        typesFile: project.typesFile,
      });
      fs.writeFileSync(clientPath, '// stale\n', 'utf8');
      await expect(
        syncEndpointClient(
          {
            clientFile: 'build/api-client.ts',
            manifest,
            projectRoot: project.root,
            typesFile: project.typesFile,
          },
          { check: true },
        ),
      ).rejects.toThrow(clientPath);
      expect(fs.readFileSync(clientPath, 'utf8')).toBe('// stale\n');

      await syncEndpointClient({
        clientFile: 'build/api-client.ts',
        manifest,
        projectRoot: project.root,
        typesFile: project.typesFile,
      });
      fs.rmSync(blockManifestPath);
      await expect(
        syncBlockMetadata(
          {
            blockJsonFile: 'block.json',
            manifestFile: 'build/block.manifest.json',
            projectRoot: project.root,
            sourceTypeName: 'DemoBlockAttributes',
            typesFile: 'src/block-types.ts',
          },
          { check: true },
        ),
      ).rejects.toThrow(blockManifestPath);
    } finally {
      fs.rmSync(project.root, { force: true, recursive: true });
    }
  });

  test('reuses repeated analysis safely across sync flows and preserves typia tag projections', async () => {
    const project = createTempProject();
    const blockJsonPath = path.join(project.root, 'block.json');
    const blockTypesPath = path.join(project.root, 'src', 'block-types.ts');

    fs.writeFileSync(
      blockJsonPath,
      JSON.stringify({ attributes: {}, example: { attributes: {} } }, null, 2),
      'utf8',
    );
    fs.writeFileSync(
      blockTypesPath,
      [
        'import { tags } from "typia";',
        '',
        'export interface DemoBlockAttributes {',
        '  content: string & tags.Source<"html"> & tags.Selector<".wp-block-demo__content">;',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.mkdirSync(path.join(project.root, 'node_modules', 'typia'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(project.root, 'node_modules', 'typia', 'index.d.ts'),
      [
        'export namespace tags {',
        '  export type Selector<T extends string> = T & { readonly __selector?: unique symbol };',
        '  export type Source<T extends string> = T & { readonly __source?: unique symbol };',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(project.root, 'node_modules', 'typia', 'package.json'),
      JSON.stringify({ name: 'typia', types: 'index.d.ts' }, null, 2),
      'utf8',
    );

    try {
      const querySchema = await syncTypeSchemas({
        jsonSchemaFile: 'build/query.schema.json',
        openApiFile: 'build/query.openapi.json',
        projectRoot: project.root,
        sourceTypeName: 'CounterQuery',
        typesFile: project.typesFile,
      });
      const requestSchema = await syncTypeSchemas({
        jsonSchemaFile: 'build/request.schema.json',
        openApiFile: 'build/request.openapi.json',
        projectRoot: project.root,
        sourceTypeName: 'WriteCounterRequest',
        typesFile: project.typesFile,
      });
      const openApiResult = await syncRestOpenApi({
        manifest,
        openApiFile: 'build/reused.openapi.json',
        projectRoot: project.root,
        typesFile: project.typesFile,
      });
      const clientResult = await syncEndpointClient({
        clientFile: 'build/reused-client.ts',
        manifest,
        projectRoot: project.root,
        typesFile: project.typesFile,
      });
      const blockResult = await syncBlockMetadata({
        blockJsonFile: 'block.json',
        jsonSchemaFile: 'build/block.schema.json',
        manifestFile: 'build/block.manifest.json',
        openApiFile: 'build/block.openapi.json',
        projectRoot: project.root,
        sourceTypeName: 'DemoBlockAttributes',
        typesFile: 'src/block-types.ts',
      });

      const generatedBlockJson = JSON.parse(
        fs.readFileSync(blockJsonPath, 'utf8'),
      );
      const generatedManifest = JSON.parse(
        fs.readFileSync(
          path.join(project.root, 'build', 'block.manifest.json'),
          'utf8',
        ),
      );
      const generatedQuerySchema = JSON.parse(
        fs.readFileSync(
          path.join(project.root, 'build', 'query.schema.json'),
          'utf8',
        ),
      );
      const generatedRequestSchema = JSON.parse(
        fs.readFileSync(
          path.join(project.root, 'build', 'request.schema.json'),
          'utf8',
        ),
      );

      expect(querySchema.sourceTypeName).toBe('CounterQuery');
      expect(requestSchema.sourceTypeName).toBe('WriteCounterRequest');
      expect(openApiResult.schemaNames).toEqual([
        'CounterQuery',
        'WriteCounterRequest',
        'CounterResponse',
      ]);
      expect(clientResult.operationIds).toEqual([
        'getCounterState',
        'writeCounterState',
      ]);
      expect(generatedQuerySchema.properties.postId.type).toBe('number');
      expect(generatedRequestSchema.properties.publicWriteToken.type).toBe(
        'string',
      );
      expect(blockResult.attributeNames).toEqual(['content']);
      expect(generatedBlockJson.attributes.content).toEqual({
        selector: '.wp-block-demo__content',
        source: 'html',
        type: 'string',
      });
      expect(generatedBlockJson.example.attributes.content).toBe(
        'Example content',
      );
      expect(generatedManifest.attributes.content.wp.selector).toBe(
        '.wp-block-demo__content',
      );
      expect(generatedManifest.attributes.content.wp.source).toBe('html');
      expect(generatedManifest.attributes.content.ts.kind).toBe('string');
    } finally {
      fs.rmSync(project.root, { force: true, recursive: true });
    }
  });

  test('invalidates cached analysis when an imported dependency file changes', async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-metadata-import-cache-'),
    );
    const srcDir = path.join(root, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'shared-types.ts'),
      [
        'export interface SharedCounterResponse {',
        '  total: number;',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(srcDir, 'api-types.ts'),
      [
        'import type { SharedCounterResponse } from "./shared-types";',
        '',
        'export interface CounterResponse extends SharedCounterResponse {}',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            resolveJsonModule: true,
            strict: true,
            target: 'ES2022',
          },
          include: ['src/**/*.ts'],
        },
        null,
        2,
      ),
      'utf8',
    );

    try {
      await syncTypeSchemas({
        jsonSchemaFile: 'build/counter.schema.json',
        projectRoot: root,
        sourceTypeName: 'CounterResponse',
        typesFile: 'src/api-types.ts',
      });

      const firstSchema = JSON.parse(
        fs.readFileSync(path.join(root, 'build', 'counter.schema.json'), 'utf8'),
      );

      fs.writeFileSync(
        path.join(srcDir, 'shared-types.ts'),
        [
          'export interface SharedCounterResponse {',
          '  total: string;',
          '}',
          '',
        ].join('\n'),
        'utf8',
      );

      await syncTypeSchemas({
        jsonSchemaFile: 'build/counter.schema.json',
        projectRoot: root,
        sourceTypeName: 'CounterResponse',
        typesFile: 'src/api-types.ts',
      });

      const secondSchema = JSON.parse(
        fs.readFileSync(path.join(root, 'build', 'counter.schema.json'), 'utf8'),
      );

      expect(firstSchema.properties.total.type).toBe('number');
      expect(secondSchema.properties.total.type).toBe('string');
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  test('invalidates cached analysis when NodeNext package metadata changes resolution', async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-metadata-package-json-cache-'),
    );
    const srcDir = path.join(root, 'src');
    const dependencyDir = path.join(
      root,
      'node_modules',
      '@wp-typia',
      'block-types',
    );
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(dependencyDir, { recursive: true });
    fs.writeFileSync(
      path.join(dependencyDir, 'v1.d.ts'),
      [
        'export interface ExternalCounterResponse {',
        '  total: number;',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(dependencyDir, 'v2.d.ts'),
      [
        'export interface ExternalCounterResponse {',
        '  total: string;',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(dependencyDir, 'package.json'),
      JSON.stringify(
        {
          name: '@wp-typia/block-types',
          type: 'module',
          types: './v1.d.ts',
        },
        null,
        2,
      ),
      'utf8',
    );
    fs.writeFileSync(
      path.join(srcDir, 'api-types.ts'),
      [
        'import type { ExternalCounterResponse } from "@wp-typia/block-types";',
        '',
        'export interface CounterResponse extends ExternalCounterResponse {}',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            resolveJsonModule: true,
            strict: true,
            target: 'ES2022',
          },
          include: ['src/**/*.ts'],
        },
        null,
        2,
      ),
      'utf8',
    );

    try {
      await syncTypeSchemas({
        jsonSchemaFile: 'build/counter.schema.json',
        projectRoot: root,
        sourceTypeName: 'CounterResponse',
        typesFile: 'src/api-types.ts',
      });

      const firstSchema = JSON.parse(
        fs.readFileSync(path.join(root, 'build', 'counter.schema.json'), 'utf8'),
      );

      fs.writeFileSync(
        path.join(dependencyDir, 'package.json'),
        JSON.stringify(
          {
            name: '@wp-typia/block-types',
            type: 'module',
            types: './v2.d.ts',
          },
          null,
          2,
        ),
        'utf8',
      );

      await syncTypeSchemas({
        jsonSchemaFile: 'build/counter.schema.json',
        projectRoot: root,
        sourceTypeName: 'CounterResponse',
        typesFile: 'src/api-types.ts',
      });

      const secondSchema = JSON.parse(
        fs.readFileSync(path.join(root, 'build', 'counter.schema.json'), 'utf8'),
      );

      expect(firstSchema.properties.total.type).toBe('number');
      expect(secondSchema.properties.total.type).toBe('string');
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  test('invalidates cached analysis when a package manifest is created later', async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-metadata-package-json-create-'),
    );
    const srcDir = path.join(root, 'src');
    const scopeDir = path.join(root, 'node_modules', '@wp-typia');
    const dependencyDir = path.join(
      root,
      'node_modules',
      '@wp-typia',
      'block-types',
    );
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(scopeDir, { recursive: true });
    fs.mkdirSync(dependencyDir, { recursive: true });
    fs.writeFileSync(
      path.join(scopeDir, 'package.json'),
      JSON.stringify(
        {
          name: '@wp-typia/block-types',
        },
        null,
        2,
      ),
      'utf8',
    );
    fs.writeFileSync(
      path.join(dependencyDir, 'index.d.ts'),
      [
        'export interface ExternalCounterResponse {',
        '  total: number;',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(dependencyDir, 'v2.d.ts'),
      [
        'export interface ExternalCounterResponse {',
        '  total: string;',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(srcDir, 'api-types.ts'),
      [
        'import type { ExternalCounterResponse } from "@wp-typia/block-types";',
        '',
        'export interface CounterResponse extends ExternalCounterResponse {}',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            resolveJsonModule: true,
            strict: true,
            target: 'ES2022',
          },
          include: ['src/**/*.ts'],
        },
        null,
        2,
      ),
      'utf8',
    );

    try {
      await syncTypeSchemas({
        jsonSchemaFile: 'build/counter.schema.json',
        projectRoot: root,
        sourceTypeName: 'CounterResponse',
        typesFile: 'src/api-types.ts',
      });

      const firstSchema = JSON.parse(
        fs.readFileSync(path.join(root, 'build', 'counter.schema.json'), 'utf8'),
      );

      fs.writeFileSync(
        path.join(dependencyDir, 'package.json'),
        JSON.stringify(
          {
            name: '@wp-typia/block-types',
            type: 'module',
            types: './v2.d.ts',
          },
          null,
          2,
        ),
        'utf8',
      );

      await syncTypeSchemas({
        jsonSchemaFile: 'build/counter.schema.json',
        projectRoot: root,
        sourceTypeName: 'CounterResponse',
        typesFile: 'src/api-types.ts',
      });

      const secondSchema = JSON.parse(
        fs.readFileSync(path.join(root, 'build', 'counter.schema.json'), 'utf8'),
      );

      expect(firstSchema.properties.total.type).toBe('number');
      expect(secondSchema.properties.total.type).toBe('string');
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  test('syncRestOpenApi normalizes legacy authMode manifests identically to the new auth shape', async () => {
    const project = createTempProject();
    const legacyManifest = defineEndpointManifest({
      contracts: manifest.contracts,
      endpoints: [
        {
          authMode: 'public-read',
          method: 'GET',
          operationId: 'getCounterState',
          path: '/demo/v1/counter/state',
          queryContract: 'query',
          responseContract: 'response',
          tags: ['Counter'],
        },
        {
          authMode: 'authenticated-rest-nonce',
          bodyContract: 'request',
          method: 'POST',
          operationId: 'writeCounterState',
          path: '/demo/v1/counter/state',
          responseContract: 'response',
          tags: ['Counter'],
        },
      ],
      info: manifest.info,
    });

    try {
      await syncRestOpenApi({
        manifest,
        openApiFile: 'build/current.openapi.json',
        projectRoot: project.root,
        typesFile: project.typesFile,
      });
      await syncRestOpenApi({
        manifest: legacyManifest,
        openApiFile: 'build/legacy.openapi.json',
        projectRoot: project.root,
        typesFile: project.typesFile,
      });

      const currentOpenApi = JSON.parse(
        fs.readFileSync(
          path.join(project.root, 'build', 'current.openapi.json'),
          'utf8',
        ),
      );
      const legacyOpenApi = JSON.parse(
        fs.readFileSync(
          path.join(project.root, 'build', 'legacy.openapi.json'),
          'utf8',
        ),
      );

      expect(currentOpenApi).toEqual(legacyOpenApi);
    } finally {
      fs.rmSync(project.root, { force: true, recursive: true });
    }
  });

  test('syncEndpointClient rejects unresolved manifest source type names before emitting the client', async () => {
    const project = createTempProject();
    const brokenManifest = defineEndpointManifest({
      contracts: {
        query: { sourceTypeName: 'MissingQuery' },
        response: { sourceTypeName: 'CounterResponse' },
      },
      endpoints: [
        {
          authMode: 'public-read',
          method: 'GET',
          operationId: 'getCounterState',
          path: '/demo/v1/counter/state',
          queryContract: 'query',
          responseContract: 'response',
          tags: ['Counter'],
        },
      ],
    });

    try {
      await expect(
        syncEndpointClient({
          clientFile: 'build/api-client.ts',
          manifest: brokenManifest,
          projectRoot: project.root,
          typesFile: project.typesFile,
        }),
      ).rejects.toThrow(/MissingQuery/u);
    } finally {
      fs.rmSync(project.root, { force: true, recursive: true });
    }
  });

  test('syncEndpointClient rejects nonstandard types filenames when validatorsFile cannot be inferred', async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-metadata-core-'),
    );
    const typesDir = path.join(root, 'src');
    fs.mkdirSync(typesDir, { recursive: true });
    fs.writeFileSync(
      path.join(typesDir, 'contracts.ts'),
      'export interface CounterResponse { count: number; }\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(typesDir, 'contracts.validators.ts'),
      'export const apiValidators = {};\n',
      'utf8',
    );

    try {
      await expect(
        syncEndpointClient({
          clientFile: 'build/api-client.ts',
          manifest: defineEndpointManifest({
            contracts: {
              response: { sourceTypeName: 'CounterResponse' },
            },
            endpoints: [
              {
                authMode: 'public-read',
                method: 'GET',
                operationId: 'getCounterState',
                path: '/demo/v1/counter/state',
                responseContract: 'response',
                tags: ['Counter'],
              },
            ],
          }),
          projectRoot: root,
          typesFile: 'src/contracts.ts',
        }),
      ).rejects.toThrow(
        'syncEndpointClient() could not infer validatorsFile from typesFile; pass validatorsFile explicitly.',
      );
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  test('syncEndpointClient rejects colliding validator property names', async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-metadata-core-'),
    );
    const typesDir = path.join(root, 'src');
    fs.mkdirSync(typesDir, { recursive: true });
    fs.writeFileSync(
      path.join(typesDir, 'api-types.ts'),
      [
        'export interface FirstQuery {',
        '  page: number;',
        '}',
        '',
        'export interface FirstResponse {',
        '  ok: boolean;',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(typesDir, 'api-validators.ts'),
      'export const apiValidators = {};\n',
      'utf8',
    );

    try {
      await expect(
        syncEndpointClient({
          clientFile: 'build/api-client.ts',
          manifest: defineEndpointManifest({
            contracts: {
              'first-query': { sourceTypeName: 'FirstQuery' },
              'first--query': { sourceTypeName: 'FirstQuery' },
              response: { sourceTypeName: 'FirstResponse' },
            },
            endpoints: [
              {
                authMode: 'public-read',
                method: 'GET',
                operationId: 'getFirstState',
                path: '/demo/v1/first/state',
                queryContract: 'first-query',
                responseContract: 'response',
                tags: ['First'],
              },
              {
                authMode: 'public-read',
                method: 'GET',
                operationId: 'getSecondState',
                path: '/demo/v1/second/state',
                queryContract: 'first--query',
                responseContract: 'response',
                tags: ['Second'],
              },
            ],
          }),
          projectRoot: root,
          typesFile: 'src/api-types.ts',
        }),
      ).rejects.toThrow(/both normalize to apiValidators/u);
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  test('syncEndpointClient emits mixed query/body request helpers', async () => {
    const project = createTempProject();
    const mixedManifest = defineEndpointManifest({
      contracts: manifest.contracts,
      endpoints: [
        {
          authMode: 'public-read',
          bodyContract: 'request',
          method: 'POST',
          operationId: 'writeCounterState',
          path: '/demo/v1/counter/state',
          queryContract: 'query',
          responseContract: 'response',
          tags: ['Counter'],
        },
      ],
    });

    try {
      await syncEndpointClient({
        clientFile: 'build/api-client.ts',
        manifest: mixedManifest,
        projectRoot: project.root,
        typesFile: project.typesFile,
      });
      const generatedClient = fs.readFileSync(
        path.join(project.root, 'build', 'api-client.ts'),
        'utf8',
      );

      expect(generatedClient).toContain(
        '  type ValidationError as PortableValidationError,',
      );
      expect(generatedClient).toContain(
        '  type ValidationResult as PortableValidationResult,',
      );
      expect(generatedClient).toContain(
        'function validateCombinedRequest<TQuery, TBody>(',
      );
      expect(generatedClient).toContain("expected: '{ query, body }'");
      expect(generatedClient).toContain(
        "path: prefixPath( '$.query', error.path )",
      );
      expect(generatedClient).toContain(
        "path: prefixPath( '$.body', error.path )",
      );
      expect(generatedClient).not.toContain(
        'queryValidation.data === undefined',
      );
      expect(generatedClient).not.toContain(
        'bodyValidation.data === undefined',
      );
      expect(generatedClient).toContain(
        'query: queryValidation.data ?? ( request.query as TQuery )',
      );
      expect(generatedClient).toContain(
        'body: bodyValidation.data ?? ( request.body as TBody )',
      );
      expect(generatedClient).toContain("requestLocation: 'query-and-body'");
      expect(generatedClient).toContain(
        [
          '  request: {',
          '    query: CounterQuery;',
          '    body: WriteCounterRequest;',
          '  },',
        ].join('\n'),
      );
      expect(generatedClient).toContain(
        [
          'validateRequest: (input) =>',
          '    validateCombinedRequest(input, apiValidators.query, apiValidators.request),',
        ].join('\n'),
      );
    } finally {
      fs.rmSync(project.root, { force: true, recursive: true });
    }
  });

  test('syncEndpointClient aliases helper validation imports to avoid contract-name collisions', async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-metadata-core-'),
    );
    const typesDir = path.join(root, 'src');
    fs.mkdirSync(typesDir, { recursive: true });
    fs.writeFileSync(
      path.join(typesDir, 'api-types.ts'),
      [
        'export interface QueryContract {',
        '  page: number;',
        '}',
        '',
        'export interface BodyContract {',
        '  title: string;',
        '}',
        '',
        'export interface ValidationError {',
        '  code: string;',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(typesDir, 'api-validators.ts'),
      [
        "import type { ValidationResult } from '@wp-typia/api-client';",
        "import type { BodyContract, QueryContract, ValidationError } from './api-types';",
        '',
        'function ok<T>(input: T): ValidationResult<T> {',
        '  return { data: input, errors: [], isValid: true };',
        '}',
        '',
        'export const apiValidators = {',
        '  body: (input: unknown): ValidationResult<BodyContract> => ok(input as BodyContract),',
        '  query: (input: unknown): ValidationResult<QueryContract> => ok(input as QueryContract),',
        '  response: (input: unknown): ValidationResult<ValidationError> => ok(input as ValidationError),',
        '};',
        '',
      ].join('\n'),
      'utf8',
    );

    try {
      await syncEndpointClient({
        clientFile: 'build/api-client.ts',
        manifest: defineEndpointManifest({
          contracts: {
            body: { sourceTypeName: 'BodyContract' },
            query: { sourceTypeName: 'QueryContract' },
            response: { sourceTypeName: 'ValidationError' },
          },
          endpoints: [
            {
              authMode: 'public-read',
              bodyContract: 'body',
              method: 'POST',
              operationId: 'writeState',
              path: '/demo/v1/state',
              queryContract: 'query',
              responseContract: 'response',
              tags: ['State'],
            },
          ],
        }),
        projectRoot: root,
        typesFile: 'src/api-types.ts',
      });
      const generatedClient = fs.readFileSync(
        path.join(root, 'build', 'api-client.ts'),
        'utf8',
      );

      expect(generatedClient).toContain(
        'type ValidationError as PortableValidationError,',
      );
      expect(generatedClient).toContain(
        'type ValidationResult as PortableValidationResult,',
      );
      expect(generatedClient).toContain('  ValidationError,');
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  test('syncEndpointClient picks non-conflicting helper aliases for imported portable types', async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-metadata-core-'),
    );
    const typesDir = path.join(root, 'src');
    fs.mkdirSync(typesDir, { recursive: true });
    fs.writeFileSync(
      path.join(typesDir, 'api-types.ts'),
      [
        'export interface QueryContract {',
        '  page: number;',
        '}',
        '',
        'export interface PortableValidationError {',
        '  title: string;',
        '}',
        '',
        'export interface PortableValidationResult {',
        '  ok: boolean;',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(typesDir, 'api-validators.ts'),
      [
        "import type { ValidationResult } from '@wp-typia/api-client';",
        "import type { QueryContract, PortableValidationError, PortableValidationResult } from './api-types';",
        '',
        'function ok<T>(input: T): ValidationResult<T> {',
        '  return { data: input, errors: [], isValid: true };',
        '}',
        '',
        'export const apiValidators = {',
        '  body: (input: unknown): ValidationResult<PortableValidationError> => ok(input as PortableValidationError),',
        '  query: (input: unknown): ValidationResult<QueryContract> => ok(input as QueryContract),',
        '  response: (input: unknown): ValidationResult<PortableValidationResult> => ok(input as PortableValidationResult),',
        '};',
        '',
      ].join('\n'),
      'utf8',
    );

    try {
      await syncEndpointClient({
        clientFile: 'build/api-client.ts',
        manifest: defineEndpointManifest({
          contracts: {
            body: { sourceTypeName: 'PortableValidationError' },
            query: { sourceTypeName: 'QueryContract' },
            response: { sourceTypeName: 'PortableValidationResult' },
          },
          endpoints: [
            {
              authMode: 'public-read',
              bodyContract: 'body',
              method: 'POST',
              operationId: 'writeState',
              path: '/demo/v1/state',
              queryContract: 'query',
              responseContract: 'response',
              tags: ['State'],
            },
          ],
        }),
        projectRoot: root,
        typesFile: 'src/api-types.ts',
      });
      const generatedClient = fs.readFileSync(
        path.join(root, 'build', 'api-client.ts'),
        'utf8',
      );

      expect(generatedClient).toContain(
        '  type ValidationError as PortableValidationErrorAlias,',
      );
      expect(generatedClient).toContain(
        '  type ValidationResult as PortableValidationResultAlias,',
      );
      expect(generatedClient).toContain(
        '  validateQuery: (input: unknown) => PortableValidationResultAlias<TQuery>,',
      );
      expect(generatedClient).toContain(
        '  const errors: PortableValidationErrorAlias[] = [',
      );
      expect(generatedClient).toContain('  QueryContract,');
      expect(generatedClient).toContain('  PortableValidationError,');
      expect(generatedClient).toContain('  PortableValidationResult,');
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  test('syncEndpointClient rejects reserved-word operation identifiers', async () => {
    const project = createTempProject();

    try {
      await expect(
        syncEndpointClient({
          clientFile: 'build/api-client.ts',
          manifest: defineEndpointManifest({
            contracts: {
              response: { sourceTypeName: 'CounterResponse' },
            },
            endpoints: [
              {
                authMode: 'public-read',
                method: 'GET',
                operationId: 'default',
                path: '/demo/v1/counter/state',
                responseContract: 'response',
                tags: ['Counter'],
              },
            ],
          }),
          projectRoot: project.root,
          typesFile: project.typesFile,
        }),
      ).rejects.toThrow(
        'Generated endpoint client operationId "default" is a reserved JavaScript identifier.',
      );
    } finally {
      fs.rmSync(project.root, { force: true, recursive: true });
    }
  });

  test('syncEndpointClient rejects helper and endpoint symbol collisions', async () => {
    const project = createTempProject();

    try {
      await expect(
        syncEndpointClient({
          clientFile: 'build/api-client.ts',
          manifest: defineEndpointManifest({
            contracts: {
              response: { sourceTypeName: 'CounterResponse' },
            },
            endpoints: [
              {
                authMode: 'public-read',
                method: 'GET',
                operationId: 'callEndpoint',
                path: '/demo/v1/counter/state',
                responseContract: 'response',
                tags: ['Counter'],
              },
            ],
          }),
          projectRoot: project.root,
          typesFile: project.typesFile,
        }),
      ).rejects.toThrow(
        'Generated endpoint client identifier "callEndpoint" collides with another emitted symbol.',
      );
    } finally {
      fs.rmSync(project.root, { force: true, recursive: true });
    }
  });

  test('syncEndpointClient emits no-request wrappers without a request parameter', async () => {
    const project = createTempProject();

    try {
      await syncEndpointClient({
        clientFile: 'build/api-client.ts',
        manifest: defineEndpointManifest({
          contracts: {
            response: { sourceTypeName: 'CounterResponse' },
          },
          endpoints: [
            {
              authMode: 'public-read',
              method: 'GET',
              operationId: 'getCounterState',
              path: '/demo/v1/counter/state',
              responseContract: 'response',
              tags: ['Counter'],
            },
          ],
        }),
        projectRoot: project.root,
        typesFile: project.typesFile,
      });
      const generatedClient = fs.readFileSync(
        path.join(project.root, 'build', 'api-client.ts'),
        'utf8',
      );

      expect(generatedClient).toContain(
        'function validateNoRequest(input: unknown)',
      );
      expect(generatedClient).toContain("expected: 'undefined'");
      expect(generatedClient).toContain('export function getCounterState(');
      expect(generatedClient).not.toContain('\trequest: undefined,');
      expect(generatedClient).toContain(
        'return callEndpoint(getCounterStateEndpoint, undefined, options);',
      );
    } finally {
      fs.rmSync(project.root, { force: true, recursive: true });
    }
  });

  test('syncRestOpenApi rejects mixed manifest and decomposed inputs', async () => {
    const project = createTempProject();

    try {
      await expect(
        syncRestOpenApi({
          manifest,
          contracts: manifest.contracts,
          endpoints: manifest.endpoints,
          openApiFile: 'build/mixed.openapi.json',
          typesFile: project.typesFile,
          projectRoot: project.root,
        } as unknown as SyncRestOpenApiOptions),
      ).rejects.toThrow(
        'syncRestOpenApi() accepts either { manifest, ... } or { contracts, endpoints, ... }, but not both.',
      );
    } finally {
      fs.rmSync(project.root, { force: true, recursive: true });
    }
  });

  test('syncRestOpenApi rejects an undefined manifest value', async () => {
    const project = createTempProject();

    try {
      await expect(
        syncRestOpenApi({
          manifest: undefined,
          openApiFile: 'build/undefined.openapi.json',
          projectRoot: project.root,
          typesFile: project.typesFile,
        } as unknown as SyncRestOpenApiOptions),
      ).rejects.toThrow(
        'syncRestOpenApi() requires a manifest object when using { manifest, ... }.',
      );
    } finally {
      fs.rmSync(project.root, { force: true, recursive: true });
    }
  });
});
