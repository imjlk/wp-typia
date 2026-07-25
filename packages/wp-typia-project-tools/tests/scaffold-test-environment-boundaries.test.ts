import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const helpersRoot = resolve(import.meta.dir, 'helpers');

test('scaffold test environment facade delegates focused helper modules', () => {
  const environmentSource = readFileSync(
    resolve(helpersRoot, 'scaffold-test-environment.ts'),
    'utf8',
  );
  const pathsSource = readFileSync(
    resolve(helpersRoot, 'scaffold-test-paths.ts'),
    'utf8',
  );
  const runtimeSource = readFileSync(
    resolve(helpersRoot, 'scaffold-test-runtime.ts'),
    'utf8',
  );
  const workspaceSource = readFileSync(
    resolve(helpersRoot, 'scaffold-test-workspace.ts'),
    'utf8',
  );
  const generatedProjectSource = readFileSync(
    resolve(helpersRoot, 'scaffold-test-generated-project.ts'),
    'utf8',
  );

  expect(environmentSource).toContain('from "./scaffold-test-paths.js"');
  expect(environmentSource).toContain('from "./scaffold-test-runtime.js"');
  expect(environmentSource).toContain('from "./scaffold-test-workspace.js"');
  expect(environmentSource).toContain(
    'from "./scaffold-test-generated-project.js"',
  );
  expect(environmentSource).not.toContain('function acquireWorkspaceBuildLock(');
  expect(environmentSource).not.toContain('export function runGeneratedScript(');

  expect(pathsSource).toContain('export const createBlockExternalFixturePath');
  expect(runtimeSource).toContain('export function runCli(');
  expect(workspaceSource).toContain('function acquireWorkspaceBuildLock(');
  expect(workspaceSource).toContain('export function linkWorkspaceNodeModules(');
  expect(generatedProjectSource).toContain(
    'export function runGeneratedScript(',
  );
  expect(generatedProjectSource).toContain(
    'export async function runGeneratedJsonScriptAsync(',
  );
});
