import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const packageRoot = path.resolve(import.meta.dir, '..');
const sourceRoot = path.join(packageRoot, 'src');

test('runtime bridge delegates command, output, and sync helpers to focused modules', () => {
  const bridgeSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-bridge.ts'),
    'utf8',
  );
  const addSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-bridge-add.ts'),
    'utf8',
  );
  const createSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-bridge-create.ts'),
    'utf8',
  );
  const doctorSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-bridge-doctor.ts'),
    'utf8',
  );
  const initSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-bridge-init.ts'),
    'utf8',
  );
  const migrateSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-bridge-migrate.ts'),
    'utf8',
  );
  const outputSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-bridge-output.ts'),
    'utf8',
  );
  const outputAddSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-output', 'add.ts'),
    'utf8',
  );
  const outputCreateSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-output', 'create.ts'),
    'utf8',
  );
  const outputInitSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-output', 'init.ts'),
    'utf8',
  );
  const outputMigrateSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-output', 'migrate.ts'),
    'utf8',
  );
  const outputPrintSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-output', 'print.ts'),
    'utf8',
  );
  const outputStructuredSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-output', 'structured.ts'),
    'utf8',
  );
  const outputSyncSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-output', 'sync.ts'),
    'utf8',
  );
  const sharedSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-bridge-shared.ts'),
    'utf8',
  );
  const syncSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-bridge-sync.ts'),
    'utf8',
  );
  const templatesSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-bridge-templates.ts'),
    'utf8',
  );

  expect(bridgeSource).toMatch(/from ['"]\.\/runtime-bridge-add['"]/);
  expect(bridgeSource).toMatch(/from ['"]\.\/runtime-bridge-create['"]/);
  expect(bridgeSource).toMatch(/from ['"]\.\/runtime-bridge-doctor['"]/);
  expect(bridgeSource).toMatch(/from ['"]\.\/runtime-bridge-init['"]/);
  expect(bridgeSource).toMatch(/from ['"]\.\/runtime-bridge-migrate['"]/);
  expect(bridgeSource).toMatch(/from ['"]\.\/runtime-bridge-templates['"]/);
  expect(bridgeSource).toMatch(/from ['"]\.\/runtime-bridge-output['"]/);
  expect(bridgeSource).toMatch(/from ['"]\.\/runtime-bridge-sync['"]/);
  expect(bridgeSource).toMatch(
    /export\s*\{[\s\S]*printCompletionPayload[\s\S]*\}\s*from\s*["']\.\/runtime-bridge-output["']/,
  );
  expect(bridgeSource).toMatch(
    /export\s*\{[\s\S]*executeSyncCommand[\s\S]*\}\s*from\s*["']\.\/runtime-bridge-sync["']/,
  );
  expect(bridgeSource).not.toContain('export function printCompletionPayload(');
  expect(bridgeSource).not.toContain(
    'export function buildCreateCompletionPayload(',
  );
  expect(bridgeSource).not.toContain('function buildAddCompletionPayload(');
  expect(bridgeSource).not.toContain('function resolveSyncProjectContext(');
  expect(bridgeSource).not.toContain(
    'export async function executeSyncCommand(',
  );
  expect(bridgeSource).not.toContain('formatMissingAddKindDetailLine');
  expect(bridgeSource).not.toContain('runScaffoldFlow');
  expect(bridgeSource).not.toContain('runInitCommand');
  expect(bridgeSource).not.toContain('runMigrationCommand');
  expect(addSource).toContain('export async function executeAddCommand(');
  expect(addSource).toContain('formatMissingAddKindDetailLine');
  expect(createSource).toContain('export async function executeCreateCommand(');
  expect(createSource).toContain('runScaffoldFlow');
  expect(doctorSource).toContain('export async function executeDoctorCommand(');
  expect(initSource).toContain('export async function executeInitCommand(');
  expect(migrateSource).toContain(
    'export async function executeMigrateCommand(',
  );
  expect(migrateSource).not.toContain('console.log');
  expect(sharedSource).toContain('export async function wrapCliCommandError(');
  expect(templatesSource).toContain(
    'export async function executeTemplatesCommand(',
  );
  expect(outputSource).toMatch(/from ['"]\.\/runtime-output\/types['"]/);
  expect(outputSource).toMatch(/from ['"]\.\/runtime-output\/structured['"]/);
  expect(outputSource).toMatch(/from ['"]\.\/runtime-output\/create['"]/);
  expect(outputSource).toMatch(/from ['"]\.\/runtime-output\/add['"]/);
  expect(outputSource).toMatch(/from ['"]\.\/runtime-output\/init['"]/);
  expect(outputSource).toMatch(/from ['"]\.\/runtime-output\/migrate['"]/);
  expect(outputSource).toMatch(/from ['"]\.\/runtime-output\/sync['"]/);
  expect(outputSource).toMatch(/from ['"]\.\/runtime-output\/print['"]/);
  expect(outputSource).not.toContain('export function printCompletionPayload(');
  expect(outputSource).not.toContain(
    'export function buildCreateCompletionPayload(',
  );
  expect(outputSource).not.toContain('function buildAddCompletionPayload(');
  expect(outputPrintSource).toContain('export function printCompletionPayload(');
  expect(outputPrintSource).toContain(
    "export { printBlock } from '../print-block';",
  );
  expect(outputCreateSource).toContain(
    'export function buildCreateCompletionPayload(',
  );
  expect(outputCreateSource).toContain(
    'export function buildCreateDryRunPayload(',
  );
  expect(outputAddSource).toContain(
    'export function buildAddCompletionPayload(',
  );
  expect(outputAddSource).toContain('export function buildAddDryRunPayload(');
  expect(outputInitSource).toContain(
    'export function buildInitCompletionPayload(',
  );
  expect(outputMigrateSource).toContain(
    'export function buildMigrationCompletionPayload(',
  );
  expect(outputSyncSource).toContain('export function buildSyncDryRunPayload(');
  expect(outputStructuredSource).toContain(
    'export function buildStructuredCompletionSuccessPayload(',
  );
  expect(syncSource).toContain('export async function executeSyncCommand(');
  expect(syncSource).toContain('function resolveSyncProjectContext(');
});

test('runtime bridge modules share the CLI print-line type', () => {
  const registrySharedSource = fs.readFileSync(
    path.join(sourceRoot, 'add-kind-registry-shared.ts'),
    'utf8',
  );
  const outputSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-bridge-output.ts'),
    'utf8',
  );
  const outputPrintSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-output', 'print.ts'),
    'utf8',
  );
  const addSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-bridge-add.ts'),
    'utf8',
  );
  const createSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-bridge-create.ts'),
    'utf8',
  );
  const initSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-bridge-init.ts'),
    'utf8',
  );
  const sharedSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-bridge-shared.ts'),
    'utf8',
  );
  const templatesSource = fs.readFileSync(
    path.join(sourceRoot, 'runtime-bridge-templates.ts'),
    'utf8',
  );
  const printLineSource = fs.readFileSync(
    path.join(sourceRoot, 'print-line.ts'),
    'utf8',
  );

  for (const source of [
    registrySharedSource,
    addSource,
    createSource,
    initSource,
    sharedSource,
    templatesSource,
  ]) {
    expect(source).toContain("import type { PrintLine } from './print-line';");
    expect(source).not.toContain('type PrintLine = (line: string) => void;');
  }
  expect(outputSource).not.toContain(
    "import type { PrintLine } from './print-line';",
  );
  expect(outputPrintSource).toContain(
    "import type { PrintLine } from '../print-line';",
  );
  expect(outputPrintSource).not.toContain(
    'type PrintLine = (line: string) => void;',
  );
  expect(printLineSource).toContain(
    'export type PrintLine = (line: string) => void;',
  );
});
