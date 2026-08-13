import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { FORMATTING_TOOLCHAIN_POLICY } from '../../scripts/validate-formatting-toolchain-policy.mjs';

const repoRoot = path.resolve(import.meta.dir, '..', '..');
const syncScript = path.join(
  repoRoot,
  'scripts',
  'sync-generated-ttsc-lint-compat.mjs',
);
const tempDirs: string[] = [];

function runSync(repoRoot: string, arguments_: string[] = []) {
  return spawnSync('node', [syncScript, '--repo', repoRoot, ...arguments_], {
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

describe('generated ttsc lint compatibility template synchronization', () => {
  test('reports a missing canonical template directly', () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-ttsc-lint-sync-missing-'),
    );
    tempDirs.push(fixtureRoot);

    const result = runSync(fixtureRoot);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Canonical @ttsc/lint compatibility hook not found at',
    );
  });

  test('reports drift and rewrites every copy from the canonical template', () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-ttsc-lint-sync-'),
    );
    tempDirs.push(fixtureRoot);
    const policy = FORMATTING_TOOLCHAIN_POLICY;
    const canonicalRelativePath = path.join(
      policy.generatedTtscLintCompatCanonicalTemplateRoot,
      policy.generatedTtscLintCompatTemplatePath,
    );
    const canonicalSource = 'canonical compatibility hook\n';

    for (const templateRoot of policy.generatedTtscLintCompatTemplateRoots) {
      const relativePath = path.join(
        templateRoot,
        policy.generatedTtscLintCompatTemplatePath,
      );
      const targetPath = path.join(fixtureRoot, relativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(
        targetPath,
        relativePath === canonicalRelativePath
          ? canonicalSource
          : 'drifted compatibility hook\n',
      );
    }

    const checkResult = runSync(fixtureRoot);
    expect(checkResult.error).toBeUndefined();
    expect(checkResult.status).toBe(1);
    expect(checkResult.stderr).toContain(
      `Generated @ttsc/lint compatibility hooks differ from ${canonicalRelativePath}`,
    );

    const writeResult = runSync(fixtureRoot, ['--write']);
    expect(writeResult.error).toBeUndefined();
    expect(writeResult.status, writeResult.stderr).toBe(0);
    expect(writeResult.stdout).toContain(
      'Synced 2 generated @ttsc/lint compatibility hook(s).',
    );

    for (const templateRoot of policy.generatedTtscLintCompatTemplateRoots) {
      const templateDirectory = path.join(
        fixtureRoot,
        templateRoot,
        path.dirname(policy.generatedTtscLintCompatTemplatePath),
      );
      expect(
        fs.readFileSync(
          path.join(
            fixtureRoot,
            templateRoot,
            policy.generatedTtscLintCompatTemplatePath,
          ),
          'utf8',
        ),
      ).toBe(canonicalSource);
      expect(
        fs
          .readdirSync(templateDirectory)
          .some((entry) => entry.includes('.wp-typia-') && entry.endsWith('.tmp')),
      ).toBe(false);
    }

    const finalCheck = runSync(fixtureRoot);
    expect(finalCheck.error).toBeUndefined();
    expect(finalCheck.status, finalCheck.stderr).toBe(0);
    expect(finalCheck.stdout).toContain(
      'Generated @ttsc/lint compatibility hooks are synced.',
    );

    const nonCanonicalRoot = policy.generatedTtscLintCompatTemplateRoots.find(
      (templateRoot) =>
        path.join(
          templateRoot,
          policy.generatedTtscLintCompatTemplatePath,
        ) !== canonicalRelativePath,
    );
    expect(nonCanonicalRoot).toBeDefined();
    const crlfCopyPath = path.join(
      fixtureRoot,
      nonCanonicalRoot!,
      policy.generatedTtscLintCompatTemplatePath,
    );
    fs.writeFileSync(crlfCopyPath, canonicalSource.replace(/\n/gu, '\r\n'));
    const crlfCheck = runSync(fixtureRoot);
    expect(crlfCheck.error).toBeUndefined();
    expect(crlfCheck.status).toBe(1);
    expect(crlfCheck.stderr).toContain(nonCanonicalRoot!);
  });

  test('identifies a target when write mode encounters a filesystem error', () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-ttsc-lint-sync-failure-'),
    );
    tempDirs.push(fixtureRoot);
    const policy = FORMATTING_TOOLCHAIN_POLICY;
    const canonicalPath = path.join(
      fixtureRoot,
      policy.generatedTtscLintCompatCanonicalTemplateRoot,
      policy.generatedTtscLintCompatTemplatePath,
    );
    fs.mkdirSync(path.dirname(canonicalPath), { recursive: true });
    fs.writeFileSync(canonicalPath, 'canonical compatibility hook\n');

    const blockedRoot = policy.generatedTtscLintCompatTemplateRoots.find(
      (templateRoot) =>
        templateRoot !==
        policy.generatedTtscLintCompatCanonicalTemplateRoot,
    );
    expect(blockedRoot).toBeDefined();
    const blockedParent = path.join(fixtureRoot, blockedRoot!);
    fs.mkdirSync(path.dirname(blockedParent), { recursive: true });
    fs.writeFileSync(blockedParent, 'not a directory');

    const result = runSync(fixtureRoot, ['--write']);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Failed to sync ${blockedRoot!}`);
    expect(result.stderr).toContain('bun run ttsc-lint-compat:sync');
  });
});
