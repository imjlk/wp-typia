import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

import { hasPhpVariableIncludeExpression } from '../src/runtime/shared/php-utils.js';

const PHP_GLOB_PATTERN = /\bglob\s*\(/u;
const LEGACY_MIGRATION_SOURCE_PATHS = new Set([
  'packages/wp-typia-project-tools/src/runtime/add/cli-add-workspace-binding-source-anchors.ts',
  'packages/wp-typia-project-tools/src/runtime/add/cli-add-workspace-editor-plugin-anchors.ts',
  'packages/wp-typia-project-tools/src/runtime/add/cli-add-workspace-pattern-anchors.ts',
  'packages/wp-typia-project-tools/src/runtime/add/cli-add-workspace-php-loader-migration.ts',
  'packages/wp-typia-project-tools/src/runtime/workspace/workspace-php-entrypoint-manifests.ts',
]);

function collectFiles(directoryPath: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      if (['build', 'dist', 'dist-bunli', 'node_modules'].includes(
        entry.name,
      )) {
        continue;
      }
      files.push(...collectFiles(entryPath));
      continue;
    }
    if (
      entry.isFile() &&
      (['.php', '.ts'].includes(path.extname(entry.name)) ||
        entry.name.endsWith('.php.mustache'))
    ) {
      files.push(entryPath);
    }
  }
  return files;
}

describe('generated PHP entrypoint policy', () => {
  test('owned templates and examples avoid discovery globs and variable includes', () => {
    const repositoryRoot = path.resolve(import.meta.dir, '../../..');
    const roots = [
      path.join(repositoryRoot, 'examples'),
      path.join(repositoryRoot, 'packages/create-workspace-template'),
      path.join(
        repositoryRoot,
        'packages/wp-typia-project-tools/src/runtime',
      ),
      path.join(repositoryRoot, 'packages/wp-typia-project-tools/templates'),
    ];
    const violations: string[] = [];

    for (const filePath of roots.flatMap(collectFiles)) {
      const relativePath = path.relative(repositoryRoot, filePath)
        .split(path.sep)
        .join('/');
      if (LEGACY_MIGRATION_SOURCE_PATHS.has(relativePath)) {
        continue;
      }
      const source = fs.readFileSync(filePath, 'utf8');
      if (
        hasPhpVariableIncludeExpression(source, {
          requirePhpOpenTag: true,
        }) ||
        PHP_GLOB_PATTERN.test(source)
      ) {
        violations.push(relativePath);
      }
    }

    expect(violations).toEqual([]);
  });

  test('example validator loading keeps both supported build layouts literal', () => {
    const repositoryRoot = path.resolve(import.meta.dir, '../../..');
    const source = fs.readFileSync(
      path.join(repositoryRoot, 'examples/my-typia-block/my-typia-block.php'),
      'utf8',
    );

    for (const validatorPath of [
      '/build/typia-validator.php',
      '/build/my-typia-block/typia-validator.php',
    ]) {
      expect(source).toContain(
        `file_exists( __DIR__ . '${validatorPath}' )`,
      );
      expect(source).toContain(`require __DIR__ . '${validatorPath}'`);
    }
    expect(source).not.toContain("require __DIR__ . '/typia-validator.php'");
  });
});
