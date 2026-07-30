import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { shouldUseGunshiCompletion } from '../src/gunshi-cli';
import {
  entryPath,
  packageRoot,
  parseJsonObjectFromOutput,
  runCapturedCommand,
  withoutAIAgentEnv,
} from './cli-package-test-helpers';

type JsonCommandError = {
  error?: {
    code?: string;
    command?: string;
    detailLines?: string[];
    kind?: string;
  };
  ok?: boolean;
};

type JsonCommandSuccess = {
  data?: {
    command?: string;
    dryRun?: boolean;
    projectDir?: string;
    template?: string;
  };
  ok?: boolean;
};

function isolatedEnv(
  root: string,
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    ...withoutAIAgentEnv(),
    CLAUDE_CONFIG_DIR: path.join(root, 'claude'),
    CODEX_HOME: path.join(root, 'codex'),
    HOME: path.join(root, 'home'),
    XDG_CONFIG_HOME: path.join(root, 'config'),
    XDG_DATA_HOME: path.join(root, 'data'),
    ...overrides,
  };
}

function runWpTypia(
  args: string[],
  options: Parameters<typeof runCapturedCommand>[2] = {},
) {
  return runCapturedCommand('node', [entryPath, ...args], {
    env: withoutAIAgentEnv(),
    ...options,
  });
}

describe('Gunshi dispatch parity boundaries', () => {
  test('routes only completion surfaces through Gunshi before delegating to the portable dispatcher', () => {
    const nodeVersions = { ...process.versions, bun: undefined };
    const bunVersions = { ...process.versions, bun: '1.3.13' };
    const routedToGunshi = [
      ['complete', 'bash'],
      ['complete', '--', 'bash'],
      ['completions', 'zsh'],
      ['completions', '--', 'fish'],
    ];
    const delegatedToPortableDispatcher = [
      ['complete', '--help'],
      ['completions', '--version'],
      ['create', 'demo'],
      ['add', '--help'],
      ['skills', 'list'],
      ['mcp', 'list'],
      ['doctor'],
      ['templates', 'list'],
    ];

    for (const argv of routedToGunshi) {
      expect(shouldUseGunshiCompletion(argv, nodeVersions)).toBe(true);
    }
    for (const argv of delegatedToPortableDispatcher) {
      expect(shouldUseGunshiCompletion(argv, nodeVersions)).toBe(false);
    }
    expect(shouldUseGunshiCompletion(['complete', 'bash'], bunVersions)).toBe(
      false,
    );

    const source = fs.readFileSync(
      path.join(packageRoot, 'src', 'gunshi-cli.ts'),
      'utf8',
    );
    expect(source).toContain(
      "command === 'complete' || command === 'completions'",
    );
    expect(source).toContain(
      'await runNodeCli(normalizeFallbackShortAliases(argv));',
    );
    expect(source).toContain('normalizeGunshiCompletionArgv(argv)');
  });

  test('keeps complete and completions shell output identical', () => {
    for (const shell of ['bash', 'zsh', 'fish']) {
      const complete = runWpTypia(['complete', shell]);
      const completions = runWpTypia(['completions', shell]);

      expect(complete.status).toBe(0);
      expect(completions.status).toBe(0);
      expect(complete.stderr).toBe('');
      expect(completions.stderr).toBe('');
      expect(completions.stdout).toBe(complete.stdout);
      expect(complete.stdout).toContain('complete --');
    }
  });

  test('keeps dynamic completion requests on the Gunshi completion path', () => {
    const result = runWpTypia(['complete', '--', 'bash']);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim()).toBe(':4');
  });

  test('keeps non-completion commands on the portable dispatcher surface', () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-dispatch-parity-'),
    );

    try {
      fs.mkdirSync(path.join(tempRoot, 'project'), { recursive: true });

      const addHelp = runWpTypia(['add', '--help'], {
        cwd: tempRoot,
        env: isolatedEnv(tempRoot),
      });
      expect(addHelp.status).toBe(0);
      expect(addHelp.stderr).toBe('');
      expect(addHelp.stdout).toContain('Usage: wp-typia add');

      const skillsList = runWpTypia(['skills', 'list', '--format', 'json'], {
        cwd: tempRoot,
        env: isolatedEnv(tempRoot),
      });
      const skillsPayload = parseJsonObjectFromOutput<{
        commands?: Array<{ name?: string }>;
      }>(skillsList.stdout);
      const skillCommandNames = skillsPayload.commands?.map(
        (command) => command.name,
      );
      expect(skillsList.status).toBe(0);
      expect(skillsList.stderr).toBe('');
      expect(skillCommandNames).toContain('skills');
      expect(skillCommandNames).toContain('mcp');
      expect(skillCommandNames).toContain('complete');
      expect(skillCommandNames).toContain('completions');

      const mcpList = runWpTypia(['mcp', 'list', '--format', 'json'], {
        cwd: tempRoot,
        env: isolatedEnv(tempRoot),
      });
      const mcpPayload = parseJsonObjectFromOutput<{
        groups?: Array<{ namespace?: string }>;
      }>(mcpList.stdout);
      // Built-in wp-typia tools are always available even without external sources.
      expect(mcpList.status).toBe(0);
      const wpTypiaGroup = mcpPayload.groups?.find(
        (group) => group.namespace === 'wp-typia',
      );
      expect(wpTypiaGroup).toBeDefined();

      const typo = runWpTypia(['docotr', '--format', 'json'], {
        cwd: tempRoot,
        env: isolatedEnv(tempRoot),
      });
      const typoError = parseJsonObjectFromOutput<JsonCommandError>(
        typo.stderr,
      );
      expect(typo.status).toBe(1);
      expect(typo.stdout).toBe('');
      expect(typoError.ok).toBe(false);
      expect(typoError.error?.command).toBe('docotr');
      expect(typoError.error?.code).toBe('invalid-argument');
      expect(typoError.error?.detailLines?.join('\n')).toContain(
        'Did you mean "doctor"?',
      );

      for (const [label, args] of [
        [
          'explicit create',
          [
            'create',
            'dispatch-explicit',
            '--template',
            'basic',
            '--package-manager',
            'npm',
            '--yes',
            '--dry-run',
            '--no-install',
            '--format',
            'json',
          ],
        ],
        [
          'positional create alias',
          [
            'dispatch-alias',
            '--template',
            'basic',
            '--package-manager',
            'npm',
            '--yes',
            '--dry-run',
            '--no-install',
            '--format',
            'json',
          ],
        ],
      ] as const) {
        const create = runWpTypia([...args], {
          cwd: tempRoot,
          env: {
            ...isolatedEnv(tempRoot),
            BUN_BIN: path.join(tempRoot, 'missing-bun'),
          },
        });
        const payload = parseJsonObjectFromOutput<JsonCommandSuccess>(
          create.stdout,
        );

        expect(create.status, label).toBe(0);
        expect(create.stderr, label).toBe('');
        expect(payload.ok, label).toBe(true);
        expect(payload.data?.command, label).toBe('create');
        expect(payload.data?.dryRun, label).toBe(true);
        expect(payload.data?.template, label).toBe('basic');
      }
    } finally {
      fs.rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  test('preserves structured-output defaults for explicit JSON and AI-agent environments', () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-ai-json-parity-'),
    );

    try {
      const explicitJson = runWpTypia(['create', '--format', 'json'], {
        cwd: tempRoot,
        env: isolatedEnv(tempRoot),
      });
      const explicitError = parseJsonObjectFromOutput<JsonCommandError>(
        explicitJson.stderr,
      );
      expect(explicitJson.status).toBe(1);
      expect(explicitJson.stdout).toBe('');
      expect(explicitError.ok).toBe(false);
      expect((explicitError as { notices?: unknown[] }).notices).toBeUndefined();
      expect(explicitError.error?.command).toBe('create');
      expect(explicitError.error?.code).toBe('missing-argument');

      const aiDefault = runWpTypia(['create'], {
        cwd: tempRoot,
        env: isolatedEnv(tempRoot, {
          CODEX_THREAD_ID: 'thread-1',
        }),
      });
      const aiError = parseJsonObjectFromOutput<JsonCommandError>(
        aiDefault.stderr,
      );
      expect(aiDefault.status).toBe(1);
      expect(aiDefault.stdout).toBe('');
      expect(aiError.ok).toBe(false);
      expect((aiError as { notices?: string[] }).notices?.[0]).toContain(
        'Detected codex via CODEX_THREAD_ID; defaulting to --format json.',
      );
      expect(aiError.error?.command).toBe('create');
      expect(aiError.error?.code).toBe('missing-argument');

      const explicitText = runWpTypia(['create', '--format', 'text'], {
        cwd: tempRoot,
        env: isolatedEnv(tempRoot, {
          CODEX_THREAD_ID: 'thread-1',
        }),
      });
      expect(explicitText.status).toBe(1);
      expect(explicitText.stdout).toBe('');
      expect(explicitText.stderr).toContain('Error: wp-typia create failed');
      expect(explicitText.stderr.trim().startsWith('{')).toBe(false);
    } finally {
      fs.rmSync(tempRoot, { force: true, recursive: true });
    }
  });
});
