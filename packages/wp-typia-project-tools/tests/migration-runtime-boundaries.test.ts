import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const runtimeRoot = path.join(import.meta.dir, '..', 'src', 'runtime');
const migrationRuntimeRoot = path.join(runtimeRoot, 'migration');

test('migration runtime source keeps planning and generated-artifact helpers in dedicated modules', () => {
  const migrationsSource = fs.readFileSync(
    path.join(migrationRuntimeRoot, 'migrations.ts'),
    'utf8',
  );
  const planningSource = fs.readFileSync(
    path.join(migrationRuntimeRoot, 'migration-planning.ts'),
    'utf8',
  );
  const generatedArtifactsSource = fs.readFileSync(
    path.join(migrationRuntimeRoot, 'migration-generated-artifacts.ts'),
    'utf8',
  );

  expect(migrationsSource).toContain('from "./migration-planning.js"');
  expect(migrationsSource).toContain(
    'from "./migration-generated-artifacts.js"',
  );
  expect(migrationsSource).not.toContain('function hasSnapshotForVersion(');
  expect(migrationsSource).not.toContain('function resolveLegacyVersions(');
  expect(migrationsSource).not.toContain(
    'function collectGeneratedMigrationEntries(',
  );
  expect(migrationsSource).not.toContain(
    'function regenerateGeneratedArtifacts(',
  );
  expect(planningSource).toContain('export function resolveLegacyVersions(');
  expect(planningSource).toContain(
    'export function createMigrationPlanNextSteps(',
  );
  expect(generatedArtifactsSource).toContain(
    'export function collectGeneratedMigrationEntries(',
  );
  expect(generatedArtifactsSource).toContain(
    'export function regenerateGeneratedArtifacts(',
  );
});

test('migration project barrel delegates layout, config parsing, and workspace helpers', () => {
  const projectSource = fs.readFileSync(
    path.join(migrationRuntimeRoot, 'migration-project.ts'),
    'utf8',
  );
  const configSource = fs.readFileSync(
    path.join(migrationRuntimeRoot, 'migration-project-config-source.ts'),
    'utf8',
  );
  const layoutSource = fs.readFileSync(
    path.join(migrationRuntimeRoot, 'migration-project-layout.ts'),
    'utf8',
  );
  const layoutDiscoverySource = fs.readFileSync(
    path.join(migrationRuntimeRoot, 'migration-project-layout-discovery.ts'),
    'utf8',
  );
  const layoutPathsSource = fs.readFileSync(
    path.join(migrationRuntimeRoot, 'migration-project-layout-paths.ts'),
    'utf8',
  );
  const workspaceSource = fs.readFileSync(
    path.join(migrationRuntimeRoot, 'migration-project-workspace.ts'),
    'utf8',
  );

  expect(projectSource).toContain('from "./migration-project-config-source.js"');
  expect(projectSource).toContain('from "./migration-project-layout.js"');
  expect(projectSource).toContain('from "./migration-project-workspace.js"');
  expect(projectSource).not.toContain(
    'export function discoverMigrationInitLayout(',
  );
  expect(projectSource).not.toContain('export function loadMigrationProject(');
  expect(projectSource).not.toContain('export function writeMigrationConfig(');
  expect(configSource).toContain('export function parseMigrationConfig(');
  expect(configSource).toContain('function stripCommentsAndStrings(');
  expect(configSource).toContain('export function hasLegacyConfigKeys(');
  expect(layoutSource).toContain(
    'from "./migration-project-layout-discovery.js"',
  );
  expect(layoutSource).toContain('from "./migration-project-layout-paths.js"');
  expect(layoutSource).not.toContain('function discoverSingleBlockTarget(');
  expect(layoutSource).not.toContain(
    'export function discoverMigrationEntries(',
  );
  expect(layoutDiscoverySource).toContain(
    'export function discoverMigrationInitLayout(',
  );
  expect(layoutDiscoverySource).toContain(
    'export function resolveMigrationBlocks(',
  );
  expect(layoutPathsSource).toContain(
    'export function discoverMigrationEntries(',
  );
  expect(layoutPathsSource).toContain('export function getSnapshotRoot(');
  expect(workspaceSource).toContain('export function loadMigrationProject(');
  expect(workspaceSource).toContain('export function writeMigrationConfig(');
  expect(workspaceSource).not.toContain('function discoverSingleBlockTarget(');
});

test('migration render barrel delegates renderer families to focused modules', () => {
  const renderBarrelSource = fs.readFileSync(
    path.join(migrationRuntimeRoot, 'migration-render.ts'),
    'utf8',
  );
  const diffRuleSource = fs.readFileSync(
    path.join(migrationRuntimeRoot, 'migration-render-diff-rule.ts'),
    'utf8',
  );
  const generatedSource = fs.readFileSync(
    path.join(migrationRuntimeRoot, 'migration-render-generated.ts'),
    'utf8',
  );
  const executionSource = fs.readFileSync(
    path.join(migrationRuntimeRoot, 'migration-render-execution.ts'),
    'utf8',
  );

  expect(renderBarrelSource).toContain('from "./migration-render-diff-rule.js"');
  expect(renderBarrelSource).toContain('from "./migration-render-generated.js"');
  expect(renderBarrelSource).toContain('from "./migration-render-execution.js"');
  expect(renderBarrelSource).not.toContain(
    'export function renderMigrationRegistryFile(',
  );
  expect(renderBarrelSource).not.toContain('export function renderVerifyFile(');
  expect(diffRuleSource).toContain('export function formatDiffReport(');
  expect(diffRuleSource).toContain('export function renderMigrationRuleFile(');
  expect(generatedSource).toContain(
    'export function renderMigrationRegistryFile(',
  );
  expect(generatedSource).toContain(
    'export function renderPhpMigrationRegistryFile(',
  );
  expect(executionSource).toContain('export function renderVerifyFile(');
  expect(executionSource).toContain('export function renderFuzzFile(');
});
