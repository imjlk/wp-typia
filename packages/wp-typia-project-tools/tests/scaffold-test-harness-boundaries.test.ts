import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const helpersRoot = resolve(import.meta.dir, 'helpers');

test('scaffold test harness facade delegates environment and support helpers', () => {
  const harnessSource = readFileSync(
    resolve(helpersRoot, 'scaffold-test-harness.ts'),
    'utf8',
  );
  const supportSource = readFileSync(
    resolve(helpersRoot, 'scaffold-test-support.ts'),
    'utf8',
  );

  expect(harnessSource).toContain("from './scaffold-test-environment.js'");
  expect(harnessSource).toContain("from './scaffold-test-support.js'");
  expect(harnessSource).not.toContain('function acquireWorkspaceBuildLock(');
  expect(harnessSource).not.toContain(
    'export async function scaffoldOfficialWorkspace(',
  );
  expect(supportSource).toContain(
    'export async function scaffoldOfficialWorkspace(',
  );
  expect(supportSource).toContain(
    'export async function startLocalCounterStubServer(',
  );
});
