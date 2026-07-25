import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceRoot = resolve(import.meta.dir, '..', 'src');

test('metadata-core keeps artifact sync and endpoint-client helpers in dedicated modules', () => {
  const metadataCoreSource = readFileSync(
    resolve(sourceRoot, 'metadata-core.ts'),
    'utf8',
  );
  const metadataCoreSyncRoutinesSource = readFileSync(
    resolve(sourceRoot, 'metadata-core-sync-routines.ts'),
    'utf8',
  );
  const metadataCoreClientRenderSource = readFileSync(
    resolve(sourceRoot, 'metadata-core-client-render.ts'),
    'utf8',
  );
  const artifactHelperSource = readFileSync(
    resolve(sourceRoot, 'metadata-core-artifacts.ts'),
    'utf8',
  );
  const endpointClientHelperSource = readFileSync(
    resolve(sourceRoot, 'metadata-core-endpoint-client.ts'),
    'utf8',
  );

  expect(metadataCoreSource).toContain("from './metadata-core-artifacts.js'");
  expect(metadataCoreSource).toContain(
    "from './metadata-core-sync-routines.js'",
  );
  expect(metadataCoreSource).toContain(
    "from './metadata-core-client-render.js'",
  );
  expect(metadataCoreSource).not.toContain(
    'function reconcileGeneratedArtifacts(',
  );
  expect(metadataCoreSource).not.toContain(
    'function resolveSyncBlockMetadataPaths(',
  );
  expect(metadataCoreSource).not.toContain(
    'function normalizeSyncRestOpenApiOptions(',
  );
  expect(metadataCoreSource).not.toContain(
    'function normalizeSyncEndpointClientOptions(',
  );
  expect(metadataCoreSource).not.toContain(
    'function normalizeSyncBlockMetadataFailure(',
  );
  expect(artifactHelperSource).toContain(
    'export function reconcileGeneratedArtifacts(',
  );
  expect(artifactHelperSource).toContain(
    'export function normalizeSyncBlockMetadataFailure(',
  );
  expect(endpointClientHelperSource).toContain(
    'export function normalizeSyncRestOpenApiOptions(',
  );
  expect(endpointClientHelperSource).toContain(
    'export function toValidatorAccessExpression(',
  );
  expect(metadataCoreSyncRoutinesSource).toContain(
    "from './metadata-core-endpoint-client.js'",
  );
  expect(metadataCoreSyncRoutinesSource).toContain(
    'export async function syncBlockMetadataArtifacts(',
  );
  expect(metadataCoreSyncRoutinesSource).toContain(
    'export async function syncRestOpenApiArtifacts(',
  );
  expect(metadataCoreSyncRoutinesSource).toContain(
    'export async function syncTypeSchemaArtifacts(',
  );
  expect(metadataCoreClientRenderSource).toContain(
    'export async function syncEndpointClientModule(',
  );
  expect(metadataCoreClientRenderSource).toContain(
    "from './metadata-core-endpoint-client.js'",
  );
  expect(metadataCoreClientRenderSource).toContain(
    'function validateCombinedRequest<TQuery, TBody>(',
  );
});

test('schema-core and metadata-parser keep helper clusters in dedicated modules', () => {
  const schemaCoreSource = readFileSync(
    resolve(sourceRoot, 'schema-core.ts'),
    'utf8',
  );
  const schemaProjectionHelperSource = readFileSync(
    resolve(sourceRoot, 'schema-core-projection.ts'),
    'utf8',
  );
  const schemaAuthHelperSource = readFileSync(
    resolve(sourceRoot, 'schema-core-auth.ts'),
    'utf8',
  );
  const schemaDocumentHelperSource = readFileSync(
    resolve(sourceRoot, 'schema-core-documents.ts'),
    'utf8',
  );
  const metadataParserSource = readFileSync(
    resolve(sourceRoot, 'metadata-parser.ts'),
    'utf8',
  );
  const metadataParserTagsHelperSource = readFileSync(
    resolve(sourceRoot, 'metadata-parser-tags.ts'),
    'utf8',
  );
  const metadataParserSymbolsHelperSource = readFileSync(
    resolve(sourceRoot, 'metadata-parser-symbols.ts'),
    'utf8',
  );

  expect(schemaCoreSource).toContain('from "./schema-core-projection.js"');
  expect(schemaCoreSource).toContain('from "./schema-core-documents.js"');
  expect(schemaCoreSource).not.toContain(
    'function projectSchemaObjectForAiStructuredOutput(',
  );
  expect(schemaCoreSource).not.toContain('function projectSchemaObjectForRest(');
  expect(schemaCoreSource).not.toContain(
    'export function normalizeEndpointAuthDefinition(',
  );
  expect(schemaCoreSource).not.toContain(
    'export function manifestAttributeToJsonSchema(',
  );
  expect(schemaCoreSource).not.toContain(
    'export function manifestToJsonSchema(',
  );
  expect(schemaCoreSource).not.toContain('export function manifestToOpenApi(');
  expect(schemaCoreSource).not.toContain(
    'export function buildEndpointOpenApiDocument(',
  );
  expect(schemaProjectionHelperSource).toContain(
    'export function projectSchemaObjectForAiStructuredOutput(',
  );
  expect(schemaProjectionHelperSource).toContain(
    'export function projectSchemaObjectForRest(',
  );
  expect(schemaAuthHelperSource).toContain(
    'export function normalizeEndpointAuthDefinition(',
  );
  expect(schemaAuthHelperSource).toContain(
    'export function createBootstrapResponseHeaders(',
  );
  expect(schemaDocumentHelperSource).toContain(
    'export function manifestAttributeToJsonSchema(',
  );
  expect(schemaDocumentHelperSource).toContain(
    'export function manifestToJsonSchema(',
  );
  expect(schemaDocumentHelperSource).toContain(
    'export function manifestToOpenApi(',
  );
  expect(schemaDocumentHelperSource).toContain(
    'export function buildEndpointOpenApiDocument(',
  );

  expect(metadataParserSource).toContain('from "./metadata-parser-tags.js"');
  expect(metadataParserSource).toContain('from "./metadata-parser-symbols.js"');
  expect(metadataParserSource).not.toContain(
    'function mergePrimitiveIntersection(',
  );
  expect(metadataParserSource).not.toContain('function applyTag(');
  expect(metadataParserSource).not.toContain(
    'function resolveIndexedAccessPropertyDeclaration(',
  );
  expect(metadataParserSource).not.toContain('function resolveSymbol(');
  expect(metadataParserTagsHelperSource).toContain(
    'export function mergePrimitiveIntersection(',
  );
  expect(metadataParserTagsHelperSource).toContain('export function applyTag(');
  expect(metadataParserSymbolsHelperSource).toContain(
    'export function resolveIndexedAccessPropertyDeclaration(',
  );
  expect(metadataParserSymbolsHelperSource).toContain(
    'export function getReferenceName(',
  );
});
