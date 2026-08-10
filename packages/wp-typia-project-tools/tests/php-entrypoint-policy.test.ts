import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const VARIABLE_INCLUDE_PATTERN =
  /\b(?:require|require_once|include|include_once)\s*(?:\(\s*)?\$[A-Za-z_]/u;
const PHP_GLOB_PATTERN = /\bglob\s*\(/u;

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
      const source = fs.readFileSync(filePath, 'utf8');
      if (
        VARIABLE_INCLUDE_PATTERN.test(source) ||
        PHP_GLOB_PATTERN.test(source)
      ) {
        violations.push(path.relative(repositoryRoot, filePath));
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
