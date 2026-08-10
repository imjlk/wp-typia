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

// The examples import the workspace contributor from its published entrypoint.
// Build that entrypoint in this lane so a clean checkout cannot depend on a
// locally hoisted or previously built dist directory.
execFileSync(
  'bun',
  ['run', '--filter', '@wp-typia/ttsc-lint-plugin-wp', 'build'],
  {
    cwd: repoRoot,
    stdio: 'inherit',
  },
);

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
