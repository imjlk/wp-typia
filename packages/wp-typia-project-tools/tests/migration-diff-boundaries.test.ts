import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { renderMigrationRuleFile } from '../src/runtime/migration/migration-render-diff-rule.js';
import { renderObjectKey } from '../src/runtime/migration/migration-utils.js';

const sourceRoot = resolve(
  import.meta.dir,
  '..',
  'src',
  'runtime',
  'migration',
);

test('migration-diff keeps rename and transform helpers in dedicated modules', () => {
  const migrationDiffSource = readFileSync(
    resolve(sourceRoot, 'migration-diff.ts'),
    'utf8',
  );
  const migrationDiffRenameSource = readFileSync(
    resolve(sourceRoot, 'migration-diff-rename.ts'),
    'utf8',
  );
  const migrationDiffTransformSource = readFileSync(
    resolve(sourceRoot, 'migration-diff-transform.ts'),
    'utf8',
  );

  expect(migrationDiffSource).toMatch(
    /from\s+['"]\.\/migration-diff-rename\.js['"]/,
  );
  expect(migrationDiffSource).toMatch(
    /from\s+['"]\.\/migration-diff-transform\.js['"]/,
  );
  expect(migrationDiffSource).not.toContain('function createRenameCandidates(');
  expect(migrationDiffSource).not.toContain('function assessRenameCandidate(');
  expect(migrationDiffSource).not.toContain(
    'function createTransformSuggestions(',
  );
  expect(migrationDiffSource).not.toContain('function buildTransformBodyLines(');
  expect(migrationDiffRenameSource).toContain(
    'export function createRenameCandidates(',
  );
  expect(migrationDiffRenameSource).toContain(
    'export function passesNameSimilarityRule(',
  );
  expect(migrationDiffTransformSource).toContain(
    'export function createTransformSuggestions(',
  );
  expect(migrationDiffTransformSource).toContain(
    'export function describeConstraintChange(',
  );
});

test('migration rules use a record fallback when sourceType is missing', () => {
  const projectDir = '/tmp/wp-typia-migration-rule-fallback';
  const source = renderMigrationRuleFile({
    block: {
      blockJsonFile: 'src/block.json',
      blockName: 'demo/fallback',
      key: 'fallback',
      manifestFile: 'typia.manifest.json',
      saveFile: 'src/save.tsx',
      typesFile: 'src/types.ts',
    },
    currentAttributes: {},
    currentTypeName: null,
    diff: {
      currentTypeName: null,
      fromVersion: 'v1',
      summary: {
        auto: 0,
        autoItems: [],
        manual: 0,
        manualItems: [],
        renameCandidates: [],
        transformSuggestions: [],
      },
      toVersion: 'v2',
    },
    fromVersion: 'v1',
    projectDir,
    rulePath: `${projectDir}/src/migrations/rules/v1-to-v2.ts`,
    targetVersion: 'v2',
  });

  expect(source).not.toContain('import type { null }');
  expect(source).not.toContain('import type { Record<string, unknown> }');
  expect(source).toContain(
    'export function migrate(input: Record<string, unknown>): ' +
      'Record<string, unknown>',
  );
});

test('migration object keys remain valid TypeScript string literals', () => {
  expect(renderObjectKey('plainKey')).toBe('plainKey');
  expect(renderObjectKey("line\n'quoted'")).toBe(`'line\\n\\'quoted\\''`);
});
