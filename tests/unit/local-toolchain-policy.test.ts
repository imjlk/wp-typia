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

  test('reports missing workflow and documentation files without throwing', () => {
    const repoRoot = createPolicyRepo();
    fs.rmSync(path.join(repoRoot, '.github/workflows/ci.yml'));
    fs.rmSync(path.join(repoRoot, 'README.md'));

    expect(validateLocalToolchainPolicy(repoRoot)).toEqual({
      errors: ['.github/workflows/ci.yml must exist.', 'README.md must exist.'],
      valid: false,
    });
  });
});
