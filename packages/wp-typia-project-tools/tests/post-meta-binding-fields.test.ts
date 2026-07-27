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
