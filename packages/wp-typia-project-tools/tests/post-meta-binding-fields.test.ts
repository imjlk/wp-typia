import { afterEach, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  assertPostMetaBindingPath,
  loadPostMetaBindingFields,
  loadPostMetaBindingFieldsSync,
} from '../src/runtime/post-meta-binding-fields.js';
import type { WorkspacePostMetaInventoryEntry } from '../src/runtime/workspace-inventory-types.js';

const tempRoots: string[] = [];

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
});

function createSchemaProject(schema: unknown): string {
  const projectDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-post-meta-binding-fields-'),
  );
  tempRoots.push(projectDir);
  const schemaDir = path.join(projectDir, 'src', 'post-meta', 'state');
  fs.mkdirSync(schemaDir, { recursive: true });
  fs.writeFileSync(
    path.join(schemaDir, 'meta.schema.json'),
    `${JSON.stringify(schema, null, 2)}\n`,
    'utf8',
  );

  return projectDir;
}

function createPostMetaEntry(): WorkspacePostMetaInventoryEntry {
  return {
    metaKey: '_demo_state',
    phpFile: 'inc/post-meta/state.php',
    postType: 'post',
    schemaFile: 'src/post-meta/state/meta.schema.json',
    showInRest: true,
    slug: 'state',
    sourceTypeName: 'StateMeta',
    typesFile: 'src/post-meta/state/types.ts',
  };
}

test('post meta binding fields resolve nullable schema types', async () => {
  const projectDir = createSchemaProject({
    properties: {
      enabled: { type: ['boolean', 'null'] },
      payload: { type: ['null', 'object'] },
      score: { type: ['number', 'null'] },
      status: { enum: ['ready', null], type: ['string', 'null'] },
    },
    required: ['enabled'],
    type: 'object',
  });
  const postMeta = createPostMetaEntry();

  const fields = await loadPostMetaBindingFields(projectDir, postMeta);

  expect(fields).toContainEqual({
    fallbackValue: 'false',
    label: 'Enabled',
    name: 'enabled',
    required: true,
    schemaType: 'boolean',
  });
  expect(fields).toContainEqual({
    fallbackValue: '0',
    label: 'Score',
    name: 'score',
    required: false,
    schemaType: 'number',
  });
  expect(fields).toContainEqual({
    fallbackValue: '{}',
    label: 'Payload',
    name: 'payload',
    required: false,
    schemaType: 'object',
  });
  expect(fields).toContainEqual({
    fallbackValue: 'ready',
    label: 'Status',
    name: 'status',
    required: false,
    schemaType: 'string',
  });
  expect(loadPostMetaBindingFieldsSync(projectDir, postMeta)).toEqual(fields);
  expect(assertPostMetaBindingPath(fields, 'state', 'score').schemaType).toBe(
    'number',
  );
});

function createNestedStateSchema(): Record<string, unknown> {
  return {
    properties: {
      score: { type: 'number' },
      status: {
        properties: {
          count: { type: ['integer', 'null'] },
          details: { enum: ['ready', null], type: 'string' },
          payload: {
            properties: {
              note: { type: 'string' },
            },
            type: 'object',
          },
        },
        required: ['details'],
        type: ['object', 'null'],
      },
    },
    required: ['status'],
    type: 'object',
  };
}

test('top-level post meta binding paths still resolve', async () => {
  const projectDir = createSchemaProject(createNestedStateSchema());
  const fields = await loadPostMetaBindingFields(projectDir, createPostMetaEntry());

  expect(assertPostMetaBindingPath(fields, 'state', 'score')).toEqual({
    fallbackValue: '0',
    label: 'Score',
    name: 'score',
    required: false,
    schemaType: 'number',
  });
});

test('one nested object field resolves to the full meta path', async () => {
  const projectDir = createSchemaProject(createNestedStateSchema());
  const fields = await loadPostMetaBindingFields(projectDir, createPostMetaEntry());
  const status = fields.find((field) => field.name === 'status');

  expect(status?.schemaType).toBe('object');
  expect(status?.properties?.map((field) => field.name)).toEqual([
    'count',
    'details',
    'payload',
  ]);
  expect(assertPostMetaBindingPath(fields, 'state', 'status.details')).toEqual({
    fallbackValue: 'ready',
    label: 'Status Details',
    name: 'status.details',
    required: true,
    schemaType: 'string',
  });
  expect(assertPostMetaBindingPath(fields, 'state', 'status.count')).toEqual({
    fallbackValue: '0',
    label: 'Status Count',
    name: 'status.count',
    required: false,
    schemaType: 'integer',
  });
});

test('missing nested post meta binding fields fail', async () => {
  const projectDir = createSchemaProject(createNestedStateSchema());
  const fields = await loadPostMetaBindingFields(projectDir, createPostMetaEntry());

  expect(() => assertPostMetaBindingPath(fields, 'state', '   ')).toThrow(
    'Post meta binding path must include a value.',
  );
  expect(() => assertPostMetaBindingPath(fields, 'state', 'status.')).toThrow(
    'must use non-empty field names',
  );
  expect(() => assertPostMetaBindingPath(fields, 'state', 'status.missing')).toThrow(
    /Post meta path "status\.missing" does not exist in the "state" schema\. Expected one of: status\.count, status\.details\./u,
  );
  expect(() => assertPostMetaBindingPath(fields, 'state', 'score.value')).toThrow(
    'because "score" is not an object',
  );
  expect(() => assertPostMetaBindingPath(fields, 'state', 'status.payload')).toThrow(
    'is not a bindable scalar field',
  );
  expect(() => assertPostMetaBindingPath(fields, 'state', 'missing.details')).toThrow(
    'does not exist in the "state" schema',
  );
});

test('post meta binding paths deeper than one property fail', async () => {
  const projectDir = createSchemaProject(createNestedStateSchema());
  const fields = await loadPostMetaBindingFields(projectDir, createPostMetaEntry());

  expect(() =>
    assertPostMetaBindingPath(fields, 'state', 'status.details.note'),
  ).toThrow(
    'Post meta path "status.details.note" for "state" is deeper than one nested property.',
  );
  expect(() => assertPostMetaBindingPath(fields, 'state', 'status.payload.note')).toThrow(
    'is deeper than one nested property',
  );
});

test('generated binding sources read one-level nested meta paths', () => {
  const bindingSource = fs.readFileSync(
    path.join(
      import.meta.dir,
      '../src/runtime/add/cli-add-workspace-binding-source.ts',
    ),
    'utf8',
  );
  const emitterSource = fs.readFileSync(
    path.join(
      import.meta.dir,
      '../src/runtime/add/cli-add-workspace-binding-source-source-emitters.ts',
    ),
    'utf8',
  );

  expect(bindingSource).toContain('toEmittedPostMetaBindingField(selectedField)');
  expect(emitterSource).toContain('postMeta.metaPath');
  expect(emitterSource).toContain("explode( '.', $field, 3 )");
  expect(emitterSource).toContain('$meta[ $segments[0] ][ $segments[1] ]');
  expect(emitterSource).toContain("array_key_exists( $field, $meta )");
  expect(emitterSource).toContain("$fields[] = $name . '.' . $child_name;");
  expect(emitterSource).toContain('options.postMeta.metaPath');
});
