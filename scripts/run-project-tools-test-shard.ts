import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { validateProjectToolsPrebuilt } from './validate-project-tools-prebuilt';

export const PROJECT_TOOLS_TEST_SHARDS = Object.freeze({
  'scaffold-core': [
    'scaffold-test-workspace-prebuilt.test.ts',
    'block-generator-service.test.ts',
    'built-in-block-artifacts.test.ts',
    'scaffold-basic.test.ts',
    'scaffold-persistence.test.ts',
    'template-source.test.ts',
    'init-command.test.ts',
    'package-versions.test.ts',
    'cli-entry.test.ts',
    'cli-prompt.test.ts',
    'import-policy.test.ts',
    'wordpress-ai-spec.test.ts',
    'typia-llm.test.ts',
  ],
  workspace: [
    'workspace-add.test.ts',
    'cli-add-workspace-ability.test.ts',
    'cli-add-workspace-ai.test.ts',
    'workspace-doctor.test.ts',
  ],
  compound: ['scaffold-compound.test.ts'],
  'migration-planning': [
    'migration-init.test.ts',
    'migration-config.test.ts',
    'migration-plan-wizard.test.ts',
  ],
  'migration-execution': [
    'migration-scaffold-diff.test.ts',
    'migration-doctor.test.ts',
    'migration-fixtures-fuzz.test.ts',
  ],
});

export type ProjectToolsTestShard = keyof typeof PROJECT_TOOLS_TEST_SHARDS;
export const PROJECT_TOOLS_TEST_SHARD_TIMEOUT_MS = 30 * 60 * 1000;

interface ProjectToolsShardProcessResult {
  error?: Error;
  signal: NodeJS.Signals | null;
  status: number | null;
}

export function resolveProjectToolsShardStatus(
  shard: ProjectToolsTestShard,
  result: ProjectToolsShardProcessResult,
  logError: (message: string) => void = console.error,
): number {
  if (result.error) {
    const nodeError = result.error as NodeJS.ErrnoException;
    if (nodeError.code === 'ETIMEDOUT') {
      logError(
        `bun test for Project Tools shard "${shard}" exceeded the 30-minute timeout.`,
      );
      return 1;
    }
    throw result.error;
  }
  if (result.signal) {
    logError(
      `bun test for Project Tools shard "${shard}" was terminated by signal ${result.signal}.`,
    );
    return 1;
  }
  return result.status ?? 1;
}

export function resolveProjectToolsTestShards(
  selection: string,
): ProjectToolsTestShard[] {
  if (selection === 'all') {
    return Object.keys(PROJECT_TOOLS_TEST_SHARDS) as ProjectToolsTestShard[];
  }
  if (
    Object.prototype.hasOwnProperty.call(PROJECT_TOOLS_TEST_SHARDS, selection)
  ) {
    return [selection as ProjectToolsTestShard];
  }
  throw new Error(
    `Unknown Project Tools test shard "${selection}". Expected one of: all, ${Object.keys(
      PROJECT_TOOLS_TEST_SHARDS,
    ).join(', ')}.`,
  );
}

function runProjectToolsTestShard(
  shard: ProjectToolsTestShard,
  repoRoot: string,
): number {
  const testsRoot = path.join(
    repoRoot,
    'packages',
    'wp-typia-project-tools',
    'tests',
  );
  const result = spawnSync(
    process.execPath,
    [
      'test',
      ...PROJECT_TOOLS_TEST_SHARDS[shard].map((testFile) =>
        path.join(testsRoot, testFile),
      ),
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        WP_TYPIA_PROJECT_TOOLS_REQUIRE_PREBUILT: '1',
      },
      stdio: 'inherit',
      timeout: PROJECT_TOOLS_TEST_SHARD_TIMEOUT_MS,
    },
  );
  return resolveProjectToolsShardStatus(shard, result);
}

export function runProjectToolsTestShards(
  shards: readonly ProjectToolsTestShard[],
  repoRoot = path.resolve(import.meta.dir, '..'),
): number {
  validateProjectToolsPrebuilt(repoRoot);
  for (const shard of shards) {
    const status = runProjectToolsTestShard(shard, repoRoot);
    if (status !== 0) {
      return status;
    }
  }
  return 0;
}

if (import.meta.main) {
  const selection = process.argv[2] ?? '';
  try {
    process.exitCode = runProjectToolsTestShards(
      resolveProjectToolsTestShards(selection),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
