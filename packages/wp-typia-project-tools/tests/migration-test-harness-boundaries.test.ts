import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const helpersRoot = resolve(import.meta.dir, 'helpers');

test('migration test harness facade delegates runtime, manifest, and project fixtures to focused modules', () => {
  const harnessSource = readFileSync(
    resolve(helpersRoot, 'migration-test-harness.ts'),
    'utf8',
  );
  const runtimeSource = readFileSync(
    resolve(helpersRoot, 'migration-test-harness-runtime.ts'),
    'utf8',
  );
  const manifestSource = readFileSync(
    resolve(helpersRoot, 'migration-test-harness-manifest.ts'),
    'utf8',
  );
  const basicProjectsSource = readFileSync(
    resolve(helpersRoot, 'migration-test-harness-basic-projects.ts'),
    'utf8',
  );
  const workspaceProjectsSource = readFileSync(
    resolve(helpersRoot, 'migration-test-harness-workspace-projects.ts'),
    'utf8',
  );
  const caseProjectsSource = readFileSync(
    resolve(helpersRoot, 'migration-test-harness-case-projects.ts'),
    'utf8',
  );

  expect(harnessSource).toContain("from './migration-test-harness-runtime.js'");
  expect(harnessSource).toContain("from './migration-test-harness-manifest.js'");
  expect(harnessSource).toContain(
    "from './migration-test-harness-basic-projects.js'",
  );
  expect(harnessSource).toContain(
    "from './migration-test-harness-workspace-projects.js'",
  );
  expect(harnessSource).toContain(
    "from './migration-test-harness-case-projects.js'",
  );
  expect(harnessSource).not.toContain('function resolvePackageRoot(');
  expect(harnessSource).not.toContain('function createManifestAttribute(');
  expect(harnessSource).not.toContain(
    'function createVersionedMigrationProject(',
  );
  expect(harnessSource).not.toContain(
    'function createMultiBlockMigrationProject(',
  );
  expect(harnessSource).not.toContain('function createRenameCandidateProject(');

  expect(runtimeSource).toContain('export function resolvePackageRoot()');
  expect(runtimeSource).toContain('export function runCli(');
  expect(manifestSource).toContain('export function createManifestAttribute(');
  expect(manifestSource).toContain('export const HELPERS_SOURCE');
  expect(basicProjectsSource).toContain(
    'export function createVersionedMigrationProject(',
  );
  expect(basicProjectsSource).toContain('export function addLegacyVersion(');
  expect(workspaceProjectsSource).toContain('export function createStubPrompt(');
  expect(workspaceProjectsSource).toContain(
    'export function createMultiBlockMigrationProject(',
  );
  expect(caseProjectsSource).toContain(
    'export function createRenameCandidateProject(',
  );
  expect(caseProjectsSource).toContain(
    'export function createFuzzFailureProject(',
  );
});
