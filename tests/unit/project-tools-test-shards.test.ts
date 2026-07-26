import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  PROJECT_TOOLS_TEST_SHARDS,
  PROJECT_TOOLS_TEST_SHARD_TIMEOUT_MS,
  resolveProjectToolsTestShards,
  resolveProjectToolsShardStatus,
  runProjectToolsTestShards,
} from '../../scripts/run-project-tools-test-shard';

const repoRoot = path.resolve(import.meta.dir, '..', '..');
const testsRoot = path.join(
  repoRoot,
  'packages',
  'wp-typia-project-tools',
  'tests',
);
const packageManifest = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, 'packages', 'wp-typia-project-tools', 'package.json'),
    'utf8',
  ),
) as { scripts?: Record<string, string> };
const workspaceAddTestSource = fs.readFileSync(
  path.join(testsRoot, 'workspace-add.test.ts'),
  'utf8',
);

describe('Project Tools test shard manifest', () => {
  test('resolves all shards in declaration order', () => {
    expect(resolveProjectToolsTestShards('all').map(String)).toEqual(
      Object.keys(PROJECT_TOOLS_TEST_SHARDS),
    );
    expect(resolveProjectToolsTestShards('workspace')).toEqual(['workspace']);
  });

  test('contains existing, non-overlapping test files', () => {
    const testFiles = Object.values(PROJECT_TOOLS_TEST_SHARDS).flat();

    expect(new Set(testFiles).size).toBe(testFiles.length);
    for (const testFile of testFiles) {
      expect(fs.statSync(path.join(testsRoot, testFile)).isFile()).toBe(true);
    }
  });

  test('keeps the package scaffold-core wrapper aligned with its CI shard', () => {
    const packageScript = packageManifest.scripts?.['test:scaffold-core'] ?? '';
    const packageTestFiles = Array.from(
      packageScript.matchAll(/\btests\/([a-z0-9-]+\.test\.ts)\b/g),
      (match) => match[1],
    );
    const expectedTestFiles = PROJECT_TOOLS_TEST_SHARDS[
      'scaffold-core'
    ].filter(
      (testFile) => testFile !== 'scaffold-test-workspace-prebuilt.test.ts',
    );

    expect(packageTestFiles).toEqual(expectedTestFiles);
  });

  test('keeps generated workspace builds on the cold-build timeout', () => {
    expect(workspaceAddTestSource).toContain(
      'const GENERATED_PROJECT_BUILD_TIMEOUT_MS = 300_000;',
    );

    const generatedBuildTests = Array.from(
      workspaceAddTestSource.matchAll(
        /(?:^|\n)test\([\s\S]*?(?=\ntest\(|\s*$)/g,
      ),
      (match) => match[0],
    ).filter((testSource) =>
      testSource.includes(
        "runCli('npm', ['run', 'build'], { cwd: targetDir });",
      ),
    );

    expect(generatedBuildTests).toHaveLength(12);
    for (const testSource of generatedBuildTests) {
      expect(testSource.trimEnd()).toEndWith(
        '}, GENERATED_PROJECT_BUILD_TIMEOUT_MS);',
      );
    }
  });

  test('rejects missing and unknown selections', () => {
    expect(() => resolveProjectToolsTestShards('')).toThrow(
      'Unknown Project Tools test shard',
    );
    expect(() => resolveProjectToolsTestShards('unknown')).toThrow(
      'Unknown Project Tools test shard',
    );
    expect(() => resolveProjectToolsTestShards('constructor')).toThrow(
      'Unknown Project Tools test shard',
    );
  });

  test('fails before spawning a run-only shard when prebuilt output is missing', () => {
    const testRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-project-tools-shard-'),
    );
    try {
      expect(() => runProjectToolsTestShards(['compound'], testRoot)).toThrow(
        'Project Tools prebuilt workspace is incomplete',
      );
    } finally {
      fs.rmSync(testRoot, { force: true, recursive: true });
    }
  });

  test('bounds hung shards and reports timeout or signal termination', () => {
    expect(PROJECT_TOOLS_TEST_SHARD_TIMEOUT_MS).toBe(30 * 60 * 1000);
    const messages: string[] = [];
    const logError = (message: string) => messages.push(message);
    const timeoutError = Object.assign(new Error('timed out'), {
      code: 'ETIMEDOUT',
    });

    expect(
      resolveProjectToolsShardStatus(
        'workspace',
        { error: timeoutError, signal: 'SIGTERM', status: null },
        logError,
      ),
    ).toBe(1);
    expect(
      resolveProjectToolsShardStatus(
        'compound',
        { signal: 'SIGTERM', status: null },
        logError,
      ),
    ).toBe(1);
    expect(messages).toEqual([
      'bun test for Project Tools shard "workspace" exceeded the 30-minute timeout.',
      'bun test for Project Tools shard "compound" was terminated by signal SIGTERM.',
    ]);
  });
});
