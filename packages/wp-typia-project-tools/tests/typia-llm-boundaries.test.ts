import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const runtimeRoot = path.join(import.meta.dir, '..', 'src', 'runtime', 'schema');

test('typia-llm delegates rendering, sync, projection, and OpenAPI constraint helpers to focused modules', () => {
  const facadeSource = fs.readFileSync(
    path.join(runtimeRoot, 'typia-llm.ts'),
    'utf8',
  );
  const typesSource = fs.readFileSync(
    path.join(runtimeRoot, 'typia-llm-types.ts'),
    'utf8',
  );
  const jsonSchemaSource = fs.readFileSync(
    path.join(runtimeRoot, 'typia-llm-json-schema.ts'),
    'utf8',
  );
  const constraintsSource = fs.readFileSync(
    path.join(runtimeRoot, 'typia-llm-openapi-constraints.ts'),
    'utf8',
  );
  const projectionSource = fs.readFileSync(
    path.join(runtimeRoot, 'typia-llm-projection.ts'),
    'utf8',
  );
  const renderSource = fs.readFileSync(
    path.join(runtimeRoot, 'typia-llm-render.ts'),
    'utf8',
  );
  const syncSource = fs.readFileSync(
    path.join(runtimeRoot, 'typia-llm-sync.ts'),
    'utf8',
  );

  expect(facadeSource).toContain("from './typia-llm-types.js'");
  expect(facadeSource).toContain("from './typia-llm-json-schema.js'");
  expect(facadeSource).toContain("from './typia-llm-openapi-constraints.js'");
  expect(facadeSource).toContain("from './typia-llm-projection.js'");
  expect(facadeSource).toContain("from './typia-llm-render.js'");
  expect(facadeSource).toContain("from './typia-llm-sync.js'");
  expect(facadeSource).not.toContain('function mergeJsonSchemaConstraintProperties');
  expect(facadeSource).not.toContain('function renderMethodSignature');
  expect(facadeSource).not.toContain('async function reconcileGeneratedTypiaLlmArtifacts');

  expect(typesSource).toContain('export interface TypiaLlmEndpointMethodDescriptor');
  expect(typesSource).toContain('export interface ProjectedTypiaLlmApplicationArtifact');

  expect(jsonSchemaSource).toContain('export function assertJsonSchemaObject(');
  expect(jsonSchemaSource).not.toContain('resolveOpenApiReferenceTarget');

  expect(constraintsSource).toContain(
    'export function applyOpenApiConstraintsToTypiaLlmFunctionArtifact(',
  );
  expect(constraintsSource).toContain('function mergeJsonSchemaConstraintProperties(');
  expect(constraintsSource).not.toContain('export function renderTypiaLlmModule(');

  expect(projectionSource).toContain(
    'export function projectTypiaLlmApplicationArtifact(',
  );
  expect(projectionSource).toContain(
    'export function projectTypiaLlmStructuredOutputArtifact(',
  );
  expect(projectionSource).not.toContain('resolveOpenApiReferenceTarget');

  expect(renderSource).toContain(
    'export function buildTypiaLlmEndpointMethodDescriptors(',
  );
  expect(renderSource).toContain('export function renderTypiaLlmModule(');
  expect(renderSource).not.toContain('reconcileGeneratedTypiaLlmArtifacts');

  expect(syncSource).toContain('export async function syncTypiaLlmAdapterModule(');
  expect(syncSource).toContain('async function reconcileGeneratedTypiaLlmArtifacts(');
  expect(syncSource).not.toContain('export function projectTypiaLlmApplicationArtifact(');
});
