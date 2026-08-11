#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const wpExamples = [
  'examples/my-typia-block',
  'examples/persistence-examples',
  'examples/compound-patterns',
];

// Example checks execute sync scripts through published workspace entrypoints
// before loading the lint contributor. Build both dependency surfaces so this
// lane is reproducible from a clean checkout without stale dist directories.
for (const packageName of [
  '@wp-typia/project-tools',
  '@wp-typia/ttsc-lint-plugin-wp',
]) {
  execFileSync('bun', ['run', '--filter', packageName, 'build'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

for (const relativePath of wpExamples) {
  execFileSync('bun', ['run', 'check'], {
    cwd: path.join(repoRoot, relativePath),
    stdio: 'inherit',
  });
}

execFileSync(
  'bun',
  ['run', '--filter', 'api-contract-adapter-poc', '--if-present', 'check'],
  {
    cwd: repoRoot,
    stdio: 'inherit',
  },
);
