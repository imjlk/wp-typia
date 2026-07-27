import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const runtimeRoot = path.join(import.meta.dir, '..', 'src', 'runtime', 'add');

test('REST secret preserve options cross project-tools APIs as normalized booleans', () => {
  const addTypesSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-types.ts'),
    'utf8',
  );
  const restManualSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-rest-manual.ts'),
    'utf8',
  );
  const restTypesSource = fs.readFileSync(
    path.join(runtimeRoot, 'cli-add-workspace-rest-types.ts'),
    'utf8',
  );

  expect(addTypesSource).toContain('secretPreserveOnEmpty?: boolean;');
  expect(addTypesSource).not.toContain(
    'secretPreserveOnEmpty?: boolean | string;',
  );
  expect(restTypesSource).toContain(
    'secretPreserveOnEmpty: boolean | undefined;',
  );
  expect(restTypesSource).not.toContain(
    'secretPreserveOnEmpty: boolean | string | undefined;',
  );
  expect(restManualSource).not.toContain('value.trim().toLowerCase()');
  expect(restManualSource).not.toContain('["1", "true", "yes"]');
});
