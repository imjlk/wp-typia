import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  LOCAL_TOOLCHAIN_POLICY,
  validateLocalToolchainPolicy,
} from '../../scripts/validate-local-toolchain-policy.mjs';

const tempRoots: string[] = [];

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
});

function writeFile(repoRoot: string, relativePath: string, source: string) {
  const filePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source, 'utf8');
}

function writeJson(repoRoot: string, relativePath: string, value: unknown) {
  writeFile(repoRoot, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createPolicyRepo() {
  const repoRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-local-toolchain-policy-'),
  );
  tempRoots.push(repoRoot);

  writeJson(repoRoot, 'package.json', {
    packageManager: LOCAL_TOOLCHAIN_POLICY.packageManager,
    scripts: {
      'ci:local': 'bun run toolchain-policy:validate && bun run test',
      'toolchain-policy:validate': LOCAL_TOOLCHAIN_POLICY.validateScript,
    },
  });
  writeFile(repoRoot, 'mise.toml', `[tools]\nbun = "1.3.11"\nnode = "24"\n`);
  writeFile(
    repoRoot,
    '.github/workflows/ci.yml',
    `env:\n  NODE_VERSION: '24'\n  BUN_VERSION: '1.3.11'\n  PHP_VERSION: '8.1'\nsteps:\n  - run: bun run toolchain-policy:validate\n`,
  );
  writeFile(
    repoRoot,
    '.github/actions/setup-bun-workspace/action.yml',
    `name: Setup Bun Workspace\ninputs:\n  node-version:\n    required: false\n    default: '24'\nruns:\n  using: composite\n  steps: []\n`,
  );
  for (const relativePath of Object.keys(LOCAL_TOOLCHAIN_POLICY.docs)) {
    writeFile(
      repoRoot,
      relativePath,
      'mise install\nmise exec -- bun install --frozen-lockfile\n',
    );
  }

  return repoRoot;
}

describe('validateLocalToolchainPolicy', () => {
  test('passes for the repository toolchain baseline', () => {
    const repoRoot = path.resolve(import.meta.dir, '../..');

    expect(validateLocalToolchainPolicy(repoRoot)).toEqual({
      errors: [],
      valid: true,
    });
  });

  test('rejects mise and package manager drift', () => {
    const repoRoot = createPolicyRepo();
    writeFile(repoRoot, 'mise.toml', `[tools]\nbun = "1.3.13"\nnode = "24"\n`);
    writeJson(repoRoot, 'package.json', {
      packageManager: 'bun@1.3.13',
      scripts: {
        'ci:local': 'bun run toolchain-policy:validate && bun run test',
        'toolchain-policy:validate': LOCAL_TOOLCHAIN_POLICY.validateScript,
      },
    });

    const result = validateLocalToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'package.json must declare packageManager="bun@1.3.11", found "bun@1.3.13".',
    );
    expect(result.errors).toContain(
      'mise.toml must declare tools.bun="1.3.11", found "1.3.13".',
    );
  });

  test('rejects CI and contributor documentation drift', () => {
    const repoRoot = createPolicyRepo();
    writeFile(
      repoRoot,
      '.github/workflows/ci.yml',
      `env:\n  NODE_VERSION: '22'\n  BUN_VERSION: '1.3.11'\n  PHP_VERSION: '8.1'\nsteps: []\n`,
    );
    writeFile(repoRoot, 'CONTRIBUTING.md', 'bun install\n');

    const result = validateLocalToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      '.github/workflows/ci.yml must declare NODE_VERSION="24", found "22".',
    );
    expect(result.errors).toContain(
      '.github/workflows/ci.yml must run bun run toolchain-policy:validate.',
    );
    expect(result.errors).toContain(
      'CONTRIBUTING.md must document "mise install".',
    );
  });

  test('rejects Node majors below 24 in workflows and the shared setup action', () => {
    const repoRoot = createPolicyRepo();
    writeFile(
      repoRoot,
      '.github/workflows/legacy.yml',
      `name: Legacy Node\njobs:\n  test:\n    strategy:\n      matrix:\n        node: ['20', '24']\n`,
    );
    writeFile(
      repoRoot,
      '.github/actions/setup-bun-workspace/action.yml',
      `name: Setup Bun Workspace\ninputs:\n  node-version:\n    required: false\n    default: '22'\nruns:\n  using: composite\n  steps: []\n`,
    );

    const result = validateLocalToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      '.github/workflows/legacy.yml must not configure Node 20 at jobs.test.strategy.matrix.node.0; the minimum supported major is 24.',
    );
    expect(result.errors).toContain(
      '.github/actions/setup-bun-workspace/action.yml must not configure Node 22 at inputs.node-version.default; the minimum supported major is 24.',
    );
    expect(result.errors).toContain(
      '.github/actions/setup-bun-workspace/action.yml must default inputs.node-version to "24", found "22".',
    );
  });

  test('ignores unrelated two-digit numbers nested below Node labels', () => {
    const repoRoot = createPolicyRepo();
    writeFile(
      repoRoot,
      '.github/workflows/node-service.yml',
      `name: Node service
jobs:
  node-service:
    timeout-minutes: 15
    strategy:
      matrix:
        node:
          timeout: 15
    steps:
      - run: echo node200
`,
    );

    expect(validateLocalToolchainPolicy(repoRoot)).toEqual({
      errors: [],
      valid: true,
    });
  });

  test('checks workflow input defaults and options for legacy Node majors', () => {
    const repoRoot = createPolicyRepo();
    writeFile(
      repoRoot,
      '.github/workflows/input.yml',
      `name: Node input
on:
  workflow_dispatch:
    inputs:
      node_version:
        default: '22'
        options: ['22', '24']
`,
    );

    const result = validateLocalToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      '.github/workflows/input.yml must not configure Node 22 at on.workflow_dispatch.inputs.node_version.default; the minimum supported major is 24.',
    );
    expect(result.errors).toContain(
      '.github/workflows/input.yml must not configure Node 22 at on.workflow_dispatch.inputs.node_version.options.0; the minimum supported major is 24.',
    );
  });

  test('reports each explicit legacy Node reference once', () => {
    const repoRoot = createPolicyRepo();
    writeFile(
      repoRoot,
      '.github/workflows/legacy-label.yml',
      `name: Legacy Node reference
jobs:
  test:
    strategy:
      matrix:
        node: ['node-20']
`,
    );

    const result = validateLocalToolchainPolicy(repoRoot);
    const matchingErrors = result.errors.filter((error) =>
      error.includes(
        '.github/workflows/legacy-label.yml must not configure Node 20',
      ),
    );

    expect(matchingErrors).toEqual([
      '.github/workflows/legacy-label.yml must not configure Node 20 at jobs.test.strategy.matrix.node.0; the minimum supported major is 24.',
    ]);
  });

  test('rejects single-digit legacy Node majors', () => {
    const repoRoot = createPolicyRepo();
    writeFile(
      repoRoot,
      '.github/workflows/ancient.yml',
      `name: Ancient Node
jobs:
  test:
    strategy:
      matrix:
        node: ['8', '24']
`,
    );

    const result = validateLocalToolchainPolicy(repoRoot);

    expect(result.errors).toContain(
      '.github/workflows/ancient.yml must not configure Node 8 at jobs.test.strategy.matrix.node.0; the minimum supported major is 24.',
    );
  });

  test('ignores numeric workflow expression placeholders in Node contexts', () => {
    const repoRoot = createPolicyRepo();
    writeFile(
      repoRoot,
      '.github/workflows/expression.yml',
      `name: Node expression
jobs:
  test:
    strategy:
      matrix:
        node: \${{ fromJSON(format('["{0}"]', '24')) }}
`,
    );

    expect(validateLocalToolchainPolicy(repoRoot)).toEqual({
      errors: [],
      valid: true,
    });
  });

  test('reports missing workflow and documentation files without throwing', () => {
    const repoRoot = createPolicyRepo();
    fs.rmSync(path.join(repoRoot, '.github/workflows/ci.yml'));
    fs.rmSync(path.join(repoRoot, 'README.md'));

    expect(validateLocalToolchainPolicy(repoRoot)).toEqual({
      errors: ['.github/workflows/ci.yml must exist.', 'README.md must exist.'],
      valid: false,
    });
  });

  test('reports missing and malformed package metadata without throwing', () => {
    const repoRoot = createPolicyRepo();
    fs.rmSync(path.join(repoRoot, 'package.json'));

    expect(validateLocalToolchainPolicy(repoRoot)).toEqual({
      errors: ['package.json must exist.'],
      valid: false,
    });

    writeFile(repoRoot, 'package.json', '{');
    const malformedResult = validateLocalToolchainPolicy(repoRoot);

    expect(malformedResult.valid).toBe(false);
    expect(malformedResult.errors).toHaveLength(1);
    expect(malformedResult.errors[0]).toStartWith(
      'package.json must contain valid JSON:',
    );
  });

  test('reports non-object package metadata without cascading errors', () => {
    const repoRoot = createPolicyRepo();

    for (const source of ['null', '[]', '42', '"wp-typia"']) {
      writeFile(repoRoot, 'package.json', source);

      expect(validateLocalToolchainPolicy(repoRoot)).toEqual({
        errors: ['package.json must contain a JSON object.'],
        valid: false,
      });
    }
  });
});
