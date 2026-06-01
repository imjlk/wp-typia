import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { formatAddKindUsagePlaceholder } from '../src/add-kind-registry';
import { runNodeCli } from '../src/node-cli';
import { runUtf8Command } from '../../../tests/helpers/process-utils';
import {
  linkWorkspaceNodeModules,
  scaffoldOfficialWorkspace,
} from '../../wp-typia-project-tools/tests/helpers/scaffold-test-harness.js';
import {
  entryPath,
  parseJsonObjectFromOutput,
  runCapturedCommand,
  withoutAIAgentEnv,
  withoutLocalBunEnv,
} from './cli-package-test-helpers';

const AI_ENV_KEYS = [
  'AGENT',
  'AMP_CURRENT_THREAD_ID',
  'CLAUDE_CODE',
  'CLAUDECODE',
  'CODEX_CI',
  'CODEX_SANDBOX',
  'CODEX_THREAD_ID',
  'CURSOR_AGENT',
  'GEMINI_CLI',
  'OPENCODE',
] as const;

async function withAIAgentEnvCleared(
  callback: () => Promise<void>,
): Promise<void> {
  const previous = new Map(
    AI_ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  for (const key of AI_ENV_KEYS) {
    delete process.env[key];
  }

  try {
    await callback();
  } finally {
    for (const key of AI_ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('requires --block for add variation', () => {
  expect(() =>
    runUtf8Command('node', [entryPath, 'add', 'variation', 'promo-card']),
  ).toThrow('`wp-typia add variation` requires --block <block-slug>.');
});

test('requires style and transform target flags', () => {
  expect(() =>
    runUtf8Command('node', [entryPath, 'add', 'style', 'callout-emphasis']),
  ).toThrow('`wp-typia add style` requires --block <block-slug>.');
  expect(() =>
    runUtf8Command('node', [entryPath, 'add', 'transform', 'quote-to-card']),
  ).toThrow('`wp-typia add transform` requires --from <namespace/block>.');
  expect(() =>
    runUtf8Command('node', [
      entryPath,
      'add',
      'transform',
      'quote-to-card',
      '--from',
      'core/quote',
    ]),
  ).toThrow(
    '`wp-typia add transform` requires --to <block-slug|namespace/block-slug>.',
  );
});

test('requires --anchor and --position for add hooked-block', () => {
  expect(() =>
    runUtf8Command('node', [entryPath, 'add', 'hooked-block', 'promo-card']),
  ).toThrow(
    '`wp-typia add hooked-block` requires --anchor <anchor-block-name>.',
  );
  expect(() =>
    runUtf8Command('node', [
      entryPath,
      'add',
      'hooked-block',
      'promo-card',
      '--anchor',
      'core/post-content',
    ]),
  ).toThrow(
    '`wp-typia add hooked-block` requires --position <before|after|firstChild|lastChild>.',
  );
});

test('formats add failures with a shared non-interactive diagnostic block', () => {
  const result = runCapturedCommand(
    'node',
    [entryPath, 'add', 'variation', 'promo-card'],
    {
      env: withoutAIAgentEnv(),
    },
  );

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Error: wp-typia add failed');
  expect(result.stderr).toContain(
    'Summary: Unable to complete the requested add workflow.',
  );
  expect(result.stderr).toContain(
    '- `wp-typia add variation` requires --block <block-slug>.',
  );
});

test('emits structured add completion output in Node fallback JSON mode', async () => {
  const projectDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-add-json-'),
  );

  try {
    await scaffoldOfficialWorkspace(projectDir);
    linkWorkspaceNodeModules(projectDir);
    const nestedCwd = path.join(projectDir, 'src', 'nested-cwd');
    fs.mkdirSync(nestedCwd, { recursive: true });

    const result = runCapturedCommand(
      process.execPath,
      [entryPath, 'add', 'block', 'promo-card', '--format', 'json'],
      {
        cwd: nestedCwd,
        env: withoutLocalBunEnv(),
      },
    );
    const parsed = parseJsonObjectFromOutput<{
      data?: {
        command?: string;
        completion?: {
          summaryLines?: string[];
          title?: string;
        };
        kind?: string;
        name?: string;
        projectDir?: string;
      };
      ok?: boolean;
    }>(result.stdout);
    const serialized = JSON.stringify(parsed);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(parsed.ok).toBe(true);
    expect(parsed.data?.command).toBe('add');
    expect(parsed.data?.kind).toBe('block');
    expect(parsed.data?.name).toBe('promo-card');
    expect(parsed.data?.projectDir).toBe(fs.realpathSync(projectDir));
    expect(parsed.data?.completion?.title).toContain('Added workspace block');
    expect(parsed.data?.completion?.summaryLines).toContain(
      'Template family: basic',
    );
    expect(parsed.data).not.toHaveProperty('title');
    expect(parsed.data).not.toHaveProperty('summaryLines');
    expect(serialized).not.toMatch(/[✅🧪⏳⚠]/u);
    expect(
      fs.existsSync(
        path.join(projectDir, 'src', 'blocks', 'promo-card', 'block.json'),
      ),
    ).toBe(true);
  } finally {
    fs.rmSync(projectDir, { force: true, recursive: true });
  }
});

test('preserves add diagnostic metadata in Node fallback JSON mode on failure', () => {
  const result = runCapturedCommand(
    process.execPath,
    [entryPath, 'add', 'variation', 'promo-card', '--format', 'json'],
    {
      env: withoutLocalBunEnv(),
    },
  );
  const parsed = parseJsonObjectFromOutput<{
    error?: { code?: string; command?: string; kind?: string };
    ok?: boolean;
  }>(result.stderr);

  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(parsed.ok).toBe(false);
  expect(parsed.error?.kind).toBe('command-execution');
  expect(parsed.error?.command).toBe('add');
  expect(parsed.error?.code).toBe('missing-argument');
});

test('treats missing add kinds as an error while still printing help text', () => {
  const result = runCapturedCommand('node', [entryPath, 'add'], {
    env: withoutAIAgentEnv(),
  });

  expect(result.status).toBe(1);
  expect(result.stdout).toContain('Usage:');
  expect(result.stdout).toContain('wp-typia add admin-view <name>');
  expect(result.stdout).toContain(
    'wp-typia add block <name> [--template <basic|interactivity|persistence|compound>]',
  );
  expect(result.stdout).toContain('wp-typia add style <name>');
  expect(result.stdout).toContain('wp-typia add transform <name>');
  expect(result.stderr).toContain(
    `\`wp-typia add\` requires <kind>. Usage: wp-typia add ${formatAddKindUsagePlaceholder()} ...`,
  );
});

test('node fallback rest-resource missing-name output keeps usage split by mode', () => {
  const result = runCapturedCommand(
    process.execPath,
    [entryPath, 'add', 'rest-resource'],
    {
      env: withoutLocalBunEnv(),
    },
  );

  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    '`wp-typia add rest-resource` requires <name>. Usage:',
  );
  expect(result.stderr).toContain(
    'Generated: wp-typia add rest-resource <name> [--namespace <vendor/v1>] [--methods <list,read,create,update,delete>]',
  );
  expect(result.stderr).toContain(
    'Manual: wp-typia add rest-resource <name> --manual [--namespace <vendor/v1>] [--method <GET|POST|PUT|PATCH|DELETE>]',
  );
  expect(result.stderr).not.toContain(' or wp-typia add rest-resource ');
});

test('node fallback source entry treats missing add kinds as an error while printing add help', async () => {
  const originalLog = console.log;
  const capturedStdout: string[] = [];
  console.log = (line = '') => {
    capturedStdout.push(String(line));
  };

  try {
    await withAIAgentEnvCleared(async () => {
      await expect(runNodeCli(['add'])).rejects.toThrow('wp-typia add failed');
    });
    expect(capturedStdout.join('\n')).toContain('Usage:');
    expect(capturedStdout.join('\n')).toContain(
      'wp-typia add admin-view <name>',
    );
    expect(capturedStdout.join('\n')).toContain(
      'wp-typia add block <name> [--template <basic|interactivity|persistence|compound>]',
    );
    expect(capturedStdout.join('\n')).toContain('wp-typia add ability <name>');
    expect(capturedStdout.join('\n')).toContain(
      'wp-typia add ai-feature <name>',
    );
    expect(capturedStdout.join('\n')).toContain(
      'wp-typia add integration-env <name>',
    );
    expect(capturedStdout.join('\n')).toContain('wp-typia add style <name>');
    expect(capturedStdout.join('\n')).toContain(
      'wp-typia add transform <name>',
    );
    expect(capturedStdout.join('\n')).toContain(
      'wp-typia add editor-plugin <name>',
    );
  } finally {
    console.log = originalLog;
  }
});
