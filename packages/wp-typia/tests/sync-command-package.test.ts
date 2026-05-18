import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runUtf8Command } from '../../../tests/helpers/process-utils';
import {
  entryPath,
  parseJsonObjectFromOutput,
  runCapturedCommand,
  runtimeEntrypoint,
  withoutAIAgentEnv,
  withoutLocalBunEnv,
} from './cli-package-test-helpers';

function createSyncFixture(options: {
  packageManager?: string | null;
  scripts: Record<string, string>;
  withSyncTypesMarker?: boolean;
  withSyncRestMarker?: boolean;
}): { fixtureRoot: string; logPath: string } {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-sync-fixture-'),
  );
  const logPath = path.join(fixtureRoot, '.sync-log.jsonl');

  fs.mkdirSync(path.join(fixtureRoot, 'scripts'), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: path.basename(fixtureRoot),
        ...(options.packageManager === null
          ? {}
          : {
              packageManager: options.packageManager ?? 'npm@11.6.1',
            }),
        private: true,
        scripts: options.scripts,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(fixtureRoot, 'scripts', 'record.mjs'),
    `import fs from "node:fs";
import path from "node:path";

const [, , label, ...args] = process.argv;
const logPath = path.join(process.cwd(), ".sync-log.jsonl");
fs.appendFileSync(logPath, \`\${JSON.stringify({ args, label })}\n\`);
`,
    'utf8',
  );
  if (options.withSyncTypesMarker !== false) {
    fs.writeFileSync(
      path.join(fixtureRoot, 'scripts', 'sync-types-to-block-json.ts'),
      'export {};\n',
      'utf8',
    );
  }

  if (options.withSyncRestMarker) {
    fs.writeFileSync(
      path.join(fixtureRoot, 'scripts', 'sync-rest-contracts.ts'),
      'export {};\n',
      'utf8',
    );
  }

  return { fixtureRoot, logPath };
}

function readSyncLog(
  logPath: string,
): Array<{ args: string[]; label: string }> {
  if (!fs.existsSync(logPath)) {
    return [];
  }

  return fs
    .readFileSync(logPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { args: string[]; label: string });
}

describe('wp-typia sync package command', () => {
  test('rejects sync outside a generated project root with explicit guidance', () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-sync-outside-'),
    );

    try {
      expect(() =>
        runUtf8Command('node', [entryPath, 'sync'], {
          cwd: tempRoot,
        }),
      ).toThrow(
        /run `wp-typia sync` from a scaffolded project or official workspace root that already contains generated sync scripts/i,
      );
    } finally {
      fs.rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  test('prefers the project-local sync script and forwards --check', () => {
    const { fixtureRoot, logPath } = createSyncFixture({
      scripts: {
        sync: 'node scripts/record.mjs sync',
        'sync-rest': 'node scripts/record.mjs sync-rest',
        'sync-types': 'node scripts/record.mjs sync-types',
      },
      withSyncRestMarker: true,
    });

    try {
      runUtf8Command('node', [entryPath, 'sync', '--check'], {
        cwd: fixtureRoot,
      });

      expect(readSyncLog(logPath)).toEqual([
        {
          args: ['--check'],
          label: 'sync',
        },
      ]);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  test('accepts custom scaffold sync scripts without the built-in sync-types marker', () => {
    const { fixtureRoot, logPath } = createSyncFixture({
      scripts: {
        sync: 'node scripts/record.mjs sync',
      },
      withSyncTypesMarker: false,
    });

    try {
      runUtf8Command('node', [entryPath, 'sync', '--check'], {
        cwd: fixtureRoot,
      });

      expect(readSyncLog(logPath)).toEqual([
        {
          args: ['--check'],
          label: 'sync',
        },
      ]);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  test('infers npm when a legacy sync project omits the packageManager field', () => {
    const { fixtureRoot, logPath } = createSyncFixture({
      packageManager: null,
      scripts: {
        sync: 'node scripts/record.mjs sync',
      },
      withSyncTypesMarker: false,
    });

    try {
      runUtf8Command('node', [entryPath, 'sync', '--check'], {
        cwd: fixtureRoot,
      });

      expect(readSyncLog(logPath)).toEqual([
        {
          args: ['--check'],
          label: 'sync',
        },
      ]);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  test('falls back to sync-types only for legacy single-block projects', () => {
    const { fixtureRoot, logPath } = createSyncFixture({
      scripts: {
        'sync-types': 'node scripts/record.mjs sync-types',
      },
    });

    try {
      runUtf8Command('node', [entryPath, 'sync'], {
        cwd: fixtureRoot,
      });

      expect(readSyncLog(logPath)).toEqual([
        {
          args: [],
          label: 'sync-types',
        },
      ]);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  test('falls back to sync-types without requiring the built-in marker layout', () => {
    const { fixtureRoot, logPath } = createSyncFixture({
      scripts: {
        'sync-types': 'node scripts/record.mjs sync-types',
      },
      withSyncTypesMarker: false,
    });

    try {
      runUtf8Command('node', [entryPath, 'sync'], {
        cwd: fixtureRoot,
      });

      expect(readSyncLog(logPath)).toEqual([
        {
          args: [],
          label: 'sync-types',
        },
      ]);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  test('falls back to sync-types then sync-rest for legacy persistence projects', () => {
    const { fixtureRoot, logPath } = createSyncFixture({
      scripts: {
        'sync-rest': 'node scripts/record.mjs sync-rest',
        'sync-types': 'node scripts/record.mjs sync-types',
      },
      withSyncRestMarker: true,
    });

    try {
      runUtf8Command('node', [entryPath, 'sync', '--check'], {
        cwd: fixtureRoot,
      });

      expect(readSyncLog(logPath)).toEqual([
        {
          args: ['--check'],
          label: 'sync-types',
        },
        {
          args: ['--check'],
          label: 'sync-rest',
        },
      ]);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  test('includes sync-ai in the planned split sync workflow when a project opts in', () => {
    const { fixtureRoot, logPath } = createSyncFixture({
      scripts: {
        'sync-ai': 'node scripts/record.mjs sync-ai',
        'sync-rest': 'node scripts/record.mjs sync-rest',
        'sync-types': 'node scripts/record.mjs sync-types',
      },
      withSyncRestMarker: true,
    });

    try {
      runUtf8Command('node', [entryPath, 'sync', '--check'], {
        cwd: fixtureRoot,
      });

      expect(readSyncLog(logPath)).toEqual([
        {
          args: ['--check'],
          label: 'sync-types',
        },
        {
          args: ['--check'],
          label: 'sync-rest',
        },
        {
          args: ['--check'],
          label: 'sync-ai',
        },
      ]);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  test('runs sync ai through the dedicated sync-ai script in Node fallback', () => {
    const { fixtureRoot, logPath } = createSyncFixture({
      scripts: {
        sync: 'node scripts/record.mjs sync',
        'sync-ai': 'node scripts/record.mjs sync-ai',
      },
      withSyncTypesMarker: false,
    });

    try {
      runUtf8Command('node', [entryPath, 'sync', 'ai', '--check'], {
        cwd: fixtureRoot,
      });

      expect(readSyncLog(logPath)).toEqual([
        {
          args: ['--check'],
          label: 'sync-ai',
        },
      ]);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  test('previews sync commands without running scripts in Node fallback dry-run JSON mode', () => {
    const { fixtureRoot, logPath } = createSyncFixture({
      scripts: {
        'sync-rest': 'node scripts/record.mjs sync-rest',
        'sync-types': 'node scripts/record.mjs sync-types',
      },
      withSyncRestMarker: true,
    });

    try {
      const result = runCapturedCommand(
        process.execPath,
        [entryPath, 'sync', '--dry-run', '--format', 'json'],
        {
          cwd: fixtureRoot,
          env: withoutLocalBunEnv(),
        },
      );
      const parsed = parseJsonObjectFromOutput<{
        sync?: {
          dryRun?: boolean;
          executedCommands?: unknown[];
          plannedCommands?: Array<{ displayCommand?: string }>;
        };
      }>(result.stdout);

      expect(result.status).toBe(0);
      expect(parsed.sync?.dryRun).toBe(true);
      expect(parsed.sync?.executedCommands).toBeUndefined();
      expect(parsed.sync?.plannedCommands).toMatchObject([
        {
          displayCommand: 'npm run sync-types',
        },
        {
          displayCommand: 'npm run sync-rest',
        },
      ]);
      expect(readSyncLog(logPath)).toEqual([]);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  test('previews sync ai commands without running scripts in Node fallback dry-run JSON mode', () => {
    const { fixtureRoot, logPath } = createSyncFixture({
      scripts: {
        'sync-ai': 'node scripts/record.mjs sync-ai',
      },
      withSyncTypesMarker: false,
    });

    try {
      const result = runCapturedCommand(
        process.execPath,
        [entryPath, 'sync', 'ai', '--dry-run', '--format', 'json'],
        {
          cwd: fixtureRoot,
          env: withoutLocalBunEnv(),
        },
      );
      const parsed = parseJsonObjectFromOutput<{
        sync?: {
          dryRun?: boolean;
          plannedCommands?: Array<{
            args?: string[];
            command?: string;
            displayCommand?: string;
            scriptName?: string;
          }>;
          target?: string;
        };
      }>(result.stdout);

      expect(result.status).toBe(0);
      expect(parsed.sync?.dryRun).toBe(true);
      expect(parsed.sync?.target).toBe('ai');
      expect(parsed.sync?.plannedCommands).toEqual([
        {
          args: ['run', 'sync-ai'],
          command: 'npm',
          displayCommand: 'npm run sync-ai',
          scriptName: 'sync-ai',
        },
      ]);
      expect(readSyncLog(logPath)).toEqual([]);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  test('renders sync help with preview-oriented dry-run guidance in Node fallback', () => {
    const result = runCapturedCommand(
      process.execPath,
      [entryPath, 'sync', '--help'],
      {
        env: withoutLocalBunEnv(),
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: wp-typia sync [ai]');
    expect(result.stdout).toContain('--check');
    expect(result.stdout).toContain('--dry-run');
  });

  test('emits a machine-readable outside-project-root error code for sync in Node fallback JSON mode', () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-sync-json-'),
    );

    try {
      const result = runCapturedCommand(
        process.execPath,
        [entryPath, 'sync', '--format', 'json'],
        {
          cwd: tempRoot,
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
      expect(parsed.error?.command).toBe('sync');
      expect(parsed.error?.code).toBe('outside-project-root');
    } finally {
      fs.rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  test('emits a machine-readable malformed package JSON code for sync in Node fallback JSON mode', () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-sync-malformed-json-'),
    );
    const packageJsonPath = path.join(tempRoot, 'package.json');

    try {
      fs.writeFileSync(packageJsonPath, '{\n', 'utf8');

      const result = runCapturedCommand(
        'node',
        [entryPath, 'sync', '--format', 'json'],
        {
          cwd: tempRoot,
          env: {
            ...withoutAIAgentEnv(),
            BUN_BIN: path.join(os.tmpdir(), 'wp-typia-missing-bun'),
          },
        },
      );
      const parsed = parseJsonObjectFromOutput<{
        error?: {
          code?: string;
          command?: string;
          detailLines?: string[];
          kind?: string;
        };
        ok?: boolean;
      }>(result.stderr);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(parsed.ok).toBe(false);
      expect(parsed.error?.kind).toBe('command-execution');
      expect(parsed.error?.command).toBe('sync');
      expect(parsed.error?.code).toBe('invalid-argument');
      expect(parsed.error?.detailLines?.join('\n')).toContain(
        `Unable to parse ${fs.realpathSync(packageJsonPath)}`,
      );
    } finally {
      fs.rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  test('emits a machine-readable invalid-command error code for sync subcommands in Node fallback JSON mode', () => {
    const result = runCapturedCommand(
      process.execPath,
      [entryPath, 'sync', 'unknown', '--format', 'json'],
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
    expect(parsed.error?.command).toBe('sync');
    expect(parsed.error?.code).toBe('invalid-command');
  });

  test('emits a machine-readable outside-project-root error code for sync in Gunshi runtime JSON mode', () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-bun-sync-json-'),
    );

    try {
      const result = runCapturedCommand(
        process.execPath,
        [runtimeEntrypoint, 'sync', '--format', 'json'],
        {
          cwd: tempRoot,
          env: withoutAIAgentEnv(),
        },
      );
      const parsed = JSON.parse(result.stderr.trim()) as {
        error?: { code?: string; command?: string; kind?: string };
        ok?: boolean;
      };

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(parsed.ok).toBe(false);
      expect(parsed.error?.kind).toBe('command-execution');
      expect(parsed.error?.command).toBe('sync');
      expect(parsed.error?.code).toBe('outside-project-root');
    } finally {
      fs.rmSync(tempRoot, { force: true, recursive: true });
    }
  });
});
