import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { CLI_DIAGNOSTIC_CODES } from '@wp-typia/project-tools/cli-diagnostics';

import packageJson from '../package.json';
import {
  buildMissingAddKindDetailLines,
  buildMissingCreateProjectDirDetailLines,
} from '../src/cli-error-messages';
import { runNodeCli, runNodeCliEntrypoint } from '../src/node-cli';

const AI_AGENT_ENV_KEYS = [
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

async function captureNodeCli(
  argv: string[],
  options: {
    cwd?: string;
    entrypoint?: boolean;
  } = {},
): Promise<{
  error: unknown;
  exitCode: string | number;
  stderr: string;
  stdout: string;
}> {
  const originalCwd = process.cwd();
  const originalExitCode = process.exitCode;
  const originalError = console.error;
  const originalLog = console.log;
  const originalStderrWrite = process.stderr.write;
  const originalWarn = console.warn;
  const originalAgentEnv = new Map(
    AI_AGENT_ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  const stderr: string[] = [];
  const stdout: string[] = [];
  let error: unknown;

  for (const key of AI_AGENT_ENV_KEYS) {
    delete process.env[key];
  }
  process.exitCode = 0;
  console.log = (...args: unknown[]) => {
    stdout.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args.map(String).join(' '));
  };
  console.warn = (...args: unknown[]) => {
    stderr.push(args.map(String).join(' '));
  };
  process.stderr.write = ((chunk: unknown, ...args: unknown[]) => {
    stderr.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
    const callback = args.find(
      (arg): arg is (error?: Error | null) => void =>
        typeof arg === 'function',
    );
    callback?.();
    return true;
  }) as typeof process.stderr.write;

  try {
    if (options.cwd) {
      process.chdir(options.cwd);
    }
    try {
      if (options.entrypoint) {
        await runNodeCliEntrypoint(argv);
      } else {
        await runNodeCli(argv);
      }
    } catch (caught) {
      error = caught;
    }

    return {
      error,
      exitCode: process.exitCode ?? 0,
      stderr: stderr.join('\n'),
      stdout: stdout.join('\n'),
    };
  } finally {
    if (options.cwd) {
      process.chdir(originalCwd);
    }
    console.error = originalError;
    console.log = originalLog;
    console.warn = originalWarn;
    process.stderr.write = originalStderrWrite;
    process.exitCode = originalExitCode;
    for (const key of AI_AGENT_ENV_KEYS) {
      const value = originalAgentEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function createTempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeTempRoot(tempRoot: string): void {
  fs.rmSync(tempRoot, { force: true, recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

describe('Gunshi CLI core routing', () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  test('prints general help and marks no-command invocations as errors', async () => {
    const result = await captureNodeCli([], { entrypoint: true });

    expect(result.error).toBeUndefined();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      'No command provided. Run wp-typia --help for usage information.',
    );
    expect(result.stdout).toContain(`wp-typia ${packageJson.version}`);
    expect(result.stdout).toContain(
      'Canonical CLI package for wp-typia scaffolding',
    );
    expect(result.stdout).toContain('Runtime: Node-first wp-typia CLI');
    expect(result.stdout).toContain('Commands:');

    const directResult = await captureNodeCli([]);
    const directError = directResult.error as {
      code?: string;
      command?: string;
      detailLines?: string[];
    };

    expect(directError.code).toBe(CLI_DIAGNOSTIC_CODES.INVALID_COMMAND);
    expect(directError.command).toBe('wp-typia');
    expect(directError.detailLines).toContain(
      'No command provided. Run wp-typia --help for usage information.',
    );
    expect(directResult.stdout).toContain('Commands:');
  });

  test('serializes no-command failures when JSON output is requested', async () => {
    const result = await captureNodeCli(['--format', 'json'], {
      entrypoint: true,
    });
    const payload = JSON.parse(result.stderr) as {
      error?: {
        code?: string;
        command?: string;
        detailLines?: string[];
        summary?: string;
      };
      ok?: boolean;
    };

    expect(result.error).toBeUndefined();
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe(CLI_DIAGNOSTIC_CODES.INVALID_COMMAND);
    expect(payload.error?.command).toBe('wp-typia');
    expect(payload.error?.detailLines).toContain(
      'No command provided. Run wp-typia --help for usage information.',
    );
  });

  test('routes explicit help flags and help targets to the portable CLI help renderers', async () => {
    const generalHelp = await captureNodeCli(['--help']);
    const addHelp = await captureNodeCli(['help', 'add']);
    const createHelp = await captureNodeCli(['--help', 'create']);
    const commandHelp = await captureNodeCli(['help', 'templates']);

    expect(generalHelp.error).toBeUndefined();
    expect(generalHelp.exitCode).toBe(0);
    expect(generalHelp.stdout).toContain('Commands:');
    expect(generalHelp.stdout).toContain('Standalone wp-typia binaries');
    expect(generalHelp.stdout).not.toContain('No command provided.');

    expect(addHelp.error).toBeUndefined();
    expect(addHelp.exitCode).toBe(0);
    expect(addHelp.stdout).toContain('Usage: wp-typia add <kind> <name>');
    expect(addHelp.stdout).toContain(
      '- --secret-field: Write-only request body field for manual settings REST contracts; requires --manual and a request body, typically generated by POST, PUT, or PATCH.',
    );

    expect(createHelp.error).toBeUndefined();
    expect(createHelp.exitCode).toBe(0);
    expect(createHelp.stdout).toContain('Usage: wp-typia create <project-dir>');
    expect(createHelp.stdout).toContain('Runtime: Node-first wp-typia CLI');
    expect(createHelp.stdout).toContain('Supported flags:');
    expect(createHelp.stdout).toContain('--template');

    expect(commandHelp.error).toBeUndefined();
    expect(commandHelp.exitCode).toBe(0);
    expect(commandHelp.stdout).toContain('wp-typia templates <list|inspect>');
    expect(commandHelp.stdout).toContain('Runtime: Node-first wp-typia CLI');
    expect(commandHelp.stdout).toContain('Supported flags:');
    expect(commandHelp.stdout).toContain('--id');
  });

  test('falls back to general help for unknown help targets without dispatching commands', async () => {
    const result = await captureNodeCli(['help', 'definitely-not-a-command']);

    expect(result.error).toBeUndefined();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Commands:');
    expect(result.stdout).toContain(
      'Canonical CLI package for wp-typia scaffolding',
    );
    expect(result.stdout).not.toContain('Usage: wp-typia create <project-dir>');
  });

  test('keeps portable CLI dispatcher and help modules focused', () => {
    const packageRoot = path.resolve(import.meta.dir, '..');
    const nodeCliSource = fs.readFileSync(
      path.join(packageRoot, 'src', 'node-cli.ts'),
      'utf8',
    );
    const addDispatcherSource = fs.readFileSync(
      path.join(packageRoot, 'src', 'portable-cli', 'dispatchers', 'add.ts'),
      'utf8',
    );
    const createDispatcherSource = fs.readFileSync(
      path.join(
        packageRoot,
        'src',
        'portable-cli',
        'dispatchers',
        'create.ts',
      ),
      'utf8',
    );
    const runtimeBridgeSource = fs.readFileSync(
      path.join(packageRoot, 'src', 'runtime-bridge.ts'),
      'utf8',
    );
    const runtimeBridgeAddSource = fs.readFileSync(
      path.join(packageRoot, 'src', 'runtime-bridge-add.ts'),
      'utf8',
    );
    const helpSource = fs.readFileSync(
      path.join(packageRoot, 'src', 'portable-cli', 'help.ts'),
      'utf8',
    );
    const versionSource = fs.readFileSync(
      path.join(packageRoot, 'src', 'portable-cli', 'version.ts'),
      'utf8',
    );
    const templatesSource = fs.readFileSync(
      path.join(packageRoot, 'src', 'portable-cli', 'templates.ts'),
      'utf8',
    );
    const doctorSource = fs.readFileSync(
      path.join(packageRoot, 'src', 'portable-cli', 'doctor.ts'),
      'utf8',
    );
    const errorsSource = fs.readFileSync(
      path.join(packageRoot, 'src', 'portable-cli', 'errors.ts'),
      'utf8',
    );
    const cliErrorMessagesSource = fs.readFileSync(
      path.join(packageRoot, 'src', 'cli-error-messages.ts'),
      'utf8',
    );
    const printBlockSource = fs.readFileSync(
      path.join(packageRoot, 'src', 'print-block.ts'),
      'utf8',
    );

    expect(nodeCliSource).toContain(
      "'./portable-cli/dispatchers/add'",
    );
    expect(nodeCliSource).toContain(
      "'./portable-cli/dispatchers/create'",
    );
    expect(nodeCliSource).toContain("'./portable-cli/doctor'");
    expect(nodeCliSource).toContain("from './portable-cli/errors'");
    expect(nodeCliSource).toContain("from './portable-cli/help'");
    expect(nodeCliSource).toContain("'./portable-cli/templates'");
    expect(nodeCliSource).toContain("from './portable-cli/version'");
    expect(nodeCliSource).not.toContain('formatAddHelpText');
    expect(nodeCliSource).not.toContain('function renderVersion');
    expect(nodeCliSource).not.toContain('function renderTemplatesJson');
    expect(nodeCliSource).not.toContain('function renderDoctorJson');
    expect(nodeCliSource).not.toContain('formatCliDiagnosticError');
    expect(nodeCliSource).not.toContain('serializeCliDiagnosticError');
    expect(nodeCliSource).not.toContain('getTemplateById');
    expect(nodeCliSource).not.toContain('getDoctorChecks');
    expect(addDispatcherSource).toContain(
      'export async function dispatchPortableCliAdd',
    );
    expect(addDispatcherSource).toContain('buildMissingAddKindDetailLines');
    expect(addDispatcherSource).toContain('shouldPrintMissingAddKindHelp');
    expect(addDispatcherSource).not.toContain('formatAddKindUsagePlaceholder');
    expect(createDispatcherSource).toContain(
      'export async function dispatchPortableCliCreate',
    );
    expect(createDispatcherSource).toContain(
      'buildMissingCreateProjectDirDetailLines',
    );
    expect(runtimeBridgeSource).toContain("from './runtime-bridge-add'");
    expect(runtimeBridgeAddSource).toContain('formatMissingAddKindDetailLine');
    expect(runtimeBridgeAddSource).toContain('shouldPrintMissingAddKindHelp');
    expect(cliErrorMessagesSource).toContain(
      'export function formatMissingAddKindDetailLine',
    );
    expect(cliErrorMessagesSource).toContain(
      'export function shouldPrintMissingAddKindHelp',
    );
    expect(cliErrorMessagesSource).toContain(
      'export function buildMissingCreateProjectDirDetailLines',
    );
    expect(helpSource).toContain("import { printBlock } from '../print-block'");
    expect(helpSource).not.toContain('export function printBlock');
    expect(versionSource).toContain('export function renderPortableCliVersion');
    expect(versionSource).toContain("import packageJson from '../../package.json'");
    expect(templatesSource).toContain(
      'export async function dispatchPortableCliTemplates',
    );
    expect(templatesSource).toContain('function renderPortableCliTemplatesJson');
    expect(doctorSource).toContain(
      'export async function dispatchPortableCliDoctor',
    );
    expect(doctorSource).toContain('function renderPortableCliDoctorJson');
    expect(errorsSource).toContain(
      'export async function handlePortableCliEntrypointError',
    );
    expect(errorsSource).toContain('throwUnsupportedPortableCliCommand');
    expect(printBlockSource).toContain(
      'export function printBlock(printLine: PrintLine, lines: string[])',
    );
    expect(printBlockSource).not.toContain(
      'export function printBlock(lines: string[], printLine: PrintLine)',
    );
  });

  test('prints human and structured version output from the portable CLI runtime', async () => {
    const human = await captureNodeCli(['--version']);
    const text = await captureNodeCli(['version', '--format', 'text']);
    const legacyToon = await captureNodeCli(['version', '--format', 'toon']);
    const structured = await captureNodeCli(['version', '--format', 'json']);
    const parsed = JSON.parse(structured.stdout) as {
      data?: { name?: string; type?: string; version?: string };
      ok?: boolean;
    };

    expect(human.error).toBeUndefined();
    expect(human.exitCode).toBe(0);
    expect(human.stdout.trim()).toBe(`wp-typia ${packageJson.version}`);

    expect(text.error).toBeUndefined();
    expect(text.exitCode).toBe(0);
    expect(text.stdout.trim()).toBe(`wp-typia ${packageJson.version}`);

    expect(legacyToon.error).toBeUndefined();
    expect(legacyToon.exitCode).toBe(0);
    expect(legacyToon.stdout.trim()).toBe(`wp-typia ${packageJson.version}`);

    expect(structured.error).toBeUndefined();
    expect(structured.exitCode).toBe(0);
    expect(parsed.ok).toBe(true);
    expect(parsed.data?.name).toBe('wp-typia');
    expect(parsed.data?.type).toBe('version');
    expect(parsed.data?.version).toBe(packageJson.version);
  });

  test('dispatches create dry-runs through the portable CLI runtime', async () => {
    const tempRoot = createTempRoot('wp-typia-node-create-');

    try {
      const result = await captureNodeCli(
        ['create', 'demo-card', '--dry-run', '--template', 'basic', '--yes'],
        { cwd: tempRoot },
      );

      expect(result.error).toBeUndefined();
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('Dry run for Demo Card');
      expect(result.stdout).toContain('Template: basic');
      expect(result.stdout).toContain('No files were written');
      expect(fs.existsSync(path.join(tempRoot, 'demo-card'))).toBe(false);

      const textResult = await captureNodeCli(
        [
          'create',
          'text-card',
          '--dry-run',
          '--template',
          'basic',
          '--yes',
          '--format',
          'text',
        ],
        { cwd: tempRoot },
      );

      expect(textResult.error).toBeUndefined();
      expect(textResult.exitCode).toBe(0);
      expect(textResult.stderr).toBe('');
      expect(textResult.stdout).toContain('Dry run for Text Card');
      expect(textResult.stdout).toContain('Template: basic');
      expect(textResult.stdout.trim()).not.toMatch(/^\{/u);
      expect(fs.existsSync(path.join(tempRoot, 'text-card'))).toBe(false);
    } finally {
      removeTempRoot(tempRoot);
    }
  });

  test('routes portable CLI completion warnings through stderr', async () => {
    const tempRoot = createTempRoot('wp-typia-node-init-warning-');
    writeJson(path.join(tempRoot, 'package.json'), {
      name: 'node-init-warning',
      private: true,
    });

    try {
      const result = await captureNodeCli(['init'], { cwd: tempRoot });

      expect(result.error).toBeUndefined();
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain(
        'Preview only: `wp-typia init` does not write files yet.',
      );
      expect(result.stderr).toContain(
        'package.json and generated helper files are snapshotted',
      );
      expect(result.stdout).toContain('Retrofit init plan for node-init-warning');
      expect(result.stdout).not.toContain(
        'Preview only: `wp-typia init` does not write files yet.',
      );
    } finally {
      removeTempRoot(tempRoot);
    }
  });

  test('keeps add dispatch on stdout help and command diagnostics for missing kinds', async () => {
    const result = await captureNodeCli(['add']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('wp-typia add block <name>');
    expect(result.error).toMatchObject({
      code: 'missing-argument',
      command: 'add',
    });
  });

  test('keeps missing add kinds machine-readable in structured mode', async () => {
    const result = await captureNodeCli(['add', '--format', 'json'], {
      entrypoint: true,
    });
    const parsed = JSON.parse(result.stderr) as {
      error?: {
        code?: string;
        command?: string;
        detailLines?: string[];
        kind?: string;
      };
      ok?: boolean;
    };

    expect(result.error).toBeUndefined();
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.kind).toBe('command-execution');
    expect(parsed.error?.command).toBe('add');
    expect(parsed.error?.code).toBe('missing-argument');
    expect(parsed.error?.detailLines).toEqual(buildMissingAddKindDetailLines());
  });

  test('dispatches init structured previews from the portable CLI runtime', async () => {
    const tempRoot = createTempRoot('wp-typia-node-init-');

    try {
      const result = await captureNodeCli(['init', '--format', 'json'], {
        cwd: tempRoot,
      });
      const parsed = JSON.parse(result.stdout) as {
        data?: {
          command?: string;
          detectedLayout?: { kind?: string };
          mode?: string;
          packageManager?: string;
        };
        ok?: boolean;
      };

      expect(result.error).toBeUndefined();
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(parsed.ok).toBe(true);
      expect(parsed.data?.command).toBe('init');
      expect(parsed.data?.mode).toBe('preview');
      expect(parsed.data?.packageManager).toBe('npm');
      expect(parsed.data?.detectedLayout?.kind).toBe('unsupported');
    } finally {
      removeTempRoot(tempRoot);
    }
  });

  test('rejects invalid output formats before portable CLI dispatch', async () => {
    const result = await captureNodeCli(['templates', 'list', '--format', 'jso']);

    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(result.error).toMatchObject({
      code: 'invalid-argument',
      command: 'templates',
    });
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toContain(
      'Invalid --format value "jso". Supported values: json, text.',
    );
  });

  test('reports missing output format values before portable CLI dispatch', async () => {
    const result = await captureNodeCli(['doctor', '--format']);

    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as { code?: string }).code).toBe('missing-argument');
    expect((result.error as Error).message).toContain(
      '`--format` requires a value.',
    );
  });

  test('emits structured missing option value diagnostics with command context', async () => {
    const result = await captureNodeCli(
      ['templates', '--id', '--format', 'json'],
      { entrypoint: true },
    );
    const parsed = JSON.parse(result.stderr) as {
      error?: {
        code?: string;
        command?: string;
        detailLines?: string[];
        kind?: string;
      };
      ok?: boolean;
    };

    expect(result.error).toBeUndefined();
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.kind).toBe('command-execution');
    expect(parsed.error?.code).toBe('missing-argument');
    expect(parsed.error?.command).toBe('templates');
    expect(parsed.error?.detailLines).toContain('`--id` requires a value.');
  });

  test('emits structured alias option diagnostics with create command context', async () => {
    const result = await captureNodeCli(
      ['alias-project', '--id', '--format', 'json'],
      { entrypoint: true },
    );
    const parsed = JSON.parse(result.stderr) as {
      error?: {
        code?: string;
        command?: string;
        detailLines?: string[];
        kind?: string;
      };
      ok?: boolean;
    };

    expect(result.error).toBeUndefined();
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.kind).toBe('command-execution');
    expect(parsed.error?.code).toBe('missing-argument');
    expect(parsed.error?.command).toBe('create');
    expect(parsed.error?.detailLines).toContain('`--id` requires a value.');
  });

  test('emits structured positional alias diagnostics with stable codes', async () => {
    const result = await captureNodeCli(['.', '--format', 'json'], {
      entrypoint: true,
    });
    const parsed = JSON.parse(result.stderr) as {
      error?: {
        code?: string;
        command?: string;
        detailLines?: string[];
        kind?: string;
      };
      ok?: boolean;
    };

    expect(result.error).toBeUndefined();
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.kind).toBe('command-execution');
    expect(parsed.error?.code).toBe('invalid-argument');
    expect(parsed.error?.command).toBe('create');
    expect(parsed.error?.detailLines?.join('\n')).toContain(
      'The positional alias does not scaffold into `.`.',
    );
  });

  test('keeps pre-command unknown options on the top-level structured context', async () => {
    const result = await captureNodeCli(
      ['--unknown', 'alias-project', '--format', 'json'],
      { entrypoint: true },
    );
    const parsed = JSON.parse(result.stderr) as {
      error?: {
        code?: string;
        command?: string;
        detailLines?: string[];
        kind?: string;
      };
      ok?: boolean;
    };

    expect(result.error).toBeUndefined();
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.kind).toBe('command-execution');
    expect(parsed.error?.code).toBe('invalid-argument');
    expect(parsed.error?.command).toBe('wp-typia');
    expect(parsed.error?.detailLines).toContain('Unknown option `--unknown`.');
  });

  test('keeps reserved commands after unknown options on the top-level structured context', async () => {
    const result = await captureNodeCli(
      ['--unknown', 'templates', '--format', 'json'],
      { entrypoint: true },
    );
    const parsed = JSON.parse(result.stderr) as {
      error?: {
        code?: string;
        command?: string;
        detailLines?: string[];
        kind?: string;
      };
      ok?: boolean;
    };

    expect(result.error).toBeUndefined();
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.kind).toBe('command-execution');
    expect(parsed.error?.code).toBe('invalid-argument');
    expect(parsed.error?.command).toBe('wp-typia');
    expect(parsed.error?.detailLines).toContain('Unknown option `--unknown`.');
  });

  test('does not skip option-like tokens after missing pre-command option values', async () => {
    const result = await captureNodeCli(
      ['--id', '--unknown', 'templates', '--format', 'json'],
      { entrypoint: true },
    );
    const parsed = JSON.parse(result.stderr) as {
      error?: {
        code?: string;
        command?: string;
        detailLines?: string[];
        kind?: string;
      };
      ok?: boolean;
    };

    expect(result.error).toBeUndefined();
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.kind).toBe('command-execution');
    expect(parsed.error?.code).toBe('missing-argument');
    expect(parsed.error?.command).toBe('wp-typia');
    expect(parsed.error?.detailLines).toContain('`--id` requires a value.');
  });

  test('emits structured command output when --format json is explicit', async () => {
    const tempRoot = createTempRoot('wp-typia-node-json-create-');

    try {
      const result = await captureNodeCli(
        [
          'create',
          'json-card',
          '--dry-run',
          '--template',
          'basic',
          '--yes',
          '--format',
          'json',
        ],
        { cwd: tempRoot },
      );
      const parsed = JSON.parse(result.stdout) as {
        data?: {
          command?: string;
          dryRun?: boolean;
          files?: string[];
          template?: string;
        };
        ok?: boolean;
      };

      expect(result.error).toBeUndefined();
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(parsed.ok).toBe(true);
      expect(parsed.data?.command).toBe('create');
      expect(parsed.data?.dryRun).toBe(true);
      expect(parsed.data?.template).toBe('basic');
      expect(parsed.data?.files).toContain('src/block.json');
    } finally {
      removeTempRoot(tempRoot);
    }
  });

  test('applies --config overrides before dispatching create defaults', async () => {
    const tempRoot = createTempRoot('wp-typia-node-config-create-');
    writeJson(path.join(tempRoot, 'wp-typia.config.json'), {
      create: {
        'dry-run': true,
        'package-manager': 'pnpm',
        template: 'interactivity',
        yes: true,
      },
    });

    try {
      const result = await captureNodeCli(
        [
          'create',
          'config-card',
          '--config',
          'wp-typia.config.json',
          '--format',
          'json',
        ],
        { cwd: tempRoot },
      );
      const parsed = JSON.parse(result.stdout) as {
        data?: {
          completion?: { summaryLines?: string[] };
          dryRun?: boolean;
          files?: string[];
          template?: string;
        };
        ok?: boolean;
      };

      expect(result.error).toBeUndefined();
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(parsed.ok).toBe(true);
      expect(parsed.data?.dryRun).toBe(true);
      expect(parsed.data?.template).toBe('interactivity');
      expect(parsed.data?.completion?.summaryLines).toContain(
        'Package manager: pnpm',
      );
      expect(parsed.data?.files).toContain('src/interactivity.ts');
    } finally {
      removeTempRoot(tempRoot);
    }
  });

  test('reports config validation errors before dispatching create defaults', async () => {
    const tempRoot = createTempRoot('wp-typia-node-config-invalid-');
    writeJson(path.join(tempRoot, 'wp-typia.config.json'), {
      create: {
        'dry-run': 'yes',
      },
    });

    try {
      const result = await captureNodeCli(
        [
          'create',
          'config-card',
          '--config',
          'wp-typia.config.json',
          '--format',
          'json',
        ],
        { cwd: tempRoot, entrypoint: true },
      );
      const parsed = JSON.parse(result.stderr) as {
        error?: {
          code?: string;
          command?: string;
          detailLines?: string[];
          kind?: string;
        };
        ok?: boolean;
      };

      expect(result.error).toBeUndefined();
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(parsed.ok).toBe(false);
      expect(parsed.error?.kind).toBe('command-execution');
      expect(parsed.error?.command).toBe('create');
      expect(parsed.error?.code).toBe('invalid-argument');
      expect(parsed.error?.detailLines?.join('\n')).toContain(
        'create.dry-run',
      );
      expect(parsed.error?.detailLines?.join('\n')).toContain(
        'expected boolean',
      );
    } finally {
      removeTempRoot(tempRoot);
    }
  });

  test('keeps config-independent commands from parsing cwd config', async () => {
    const tempRoot = createTempRoot('wp-typia-node-config-lazy-');
    writeJson(path.join(tempRoot, '.wp-typiarc.json'), {
      create: {
        'dry-run': 'yes',
      },
    });

    try {
      const skillsResult = await captureNodeCli(
        ['skills', 'list', '--format', 'json'],
        { cwd: tempRoot },
      );
      const skillsPayload = JSON.parse(skillsResult.stdout) as {
        agents?: unknown[];
        commands?: unknown[];
      };

      expect(skillsResult.error).toBeUndefined();
      expect(skillsResult.exitCode).toBe(0);
      expect(skillsResult.stderr).toBe('');
      expect(Array.isArray(skillsPayload.agents)).toBe(true);
      expect(Array.isArray(skillsPayload.commands)).toBe(true);

      const completionResult = await captureNodeCli(['completions', 'bash'], {
        cwd: tempRoot,
      });

      expect(completionResult.error).toBeUndefined();
      expect(completionResult.exitCode).toBe(0);
      expect(completionResult.stderr).toBe('');
      expect(completionResult.stdout).toContain('wp-typia complete -- bash');

      const mcpResult = await captureNodeCli(
        ['mcp', 'list', '--format', 'json'],
        {
          cwd: tempRoot,
          entrypoint: true,
        },
      );
      const mcpError = JSON.parse(mcpResult.stderr) as {
        error?: {
          code?: string;
          command?: string;
          detailLines?: string[];
        };
        ok?: boolean;
      };

      expect(mcpResult.error).toBeUndefined();
      expect(mcpResult.exitCode).toBe(1);
      expect(mcpResult.stdout).toBe('');
      expect(mcpError.ok).toBe(false);
      expect(mcpError.error?.command).toBe('mcp');
      expect(mcpError.error?.code).toBe('invalid-argument');
      expect(mcpError.error?.detailLines?.join('\n')).toContain(
        'create.dry-run',
      );
      expect(mcpError.error?.detailLines?.join('\n')).toContain(
        'expected boolean',
      );
    } finally {
      removeTempRoot(tempRoot);
    }
  });

  test('captures structured entrypoint errors on stderr', async () => {
    const result = await captureNodeCli(['create', '--format', 'json'], {
      entrypoint: true,
    });
    const parsed = JSON.parse(result.stderr) as {
      error?: {
        code?: string;
        command?: string;
        detailLines?: string[];
        kind?: string;
      };
      ok?: boolean;
    };

    expect(result.error).toBeUndefined();
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.kind).toBe('command-execution');
    expect(parsed.error?.command).toBe('create');
    expect(parsed.error?.code).toBe('missing-argument');
    expect(parsed.error?.detailLines).toEqual(
      buildMissingCreateProjectDirDetailLines(),
    );
  });

  test('emits structured sync execution diagnostics with stable codes', async () => {
    const tempRoot = createTempRoot('wp-typia-node-sync-failure-');

    try {
      fs.mkdirSync(path.join(tempRoot, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(tempRoot, 'node_modules'), { recursive: true });
      writeJson(path.join(tempRoot, 'package.json'), {
        name: 'demo-sync-failure',
        packageManager: 'npm@10.9.0',
        scripts: {
          sync: 'node scripts/fail.mjs',
        },
      });
      fs.writeFileSync(
        path.join(tempRoot, 'scripts', 'fail.mjs'),
        ['console.error("sync failed intentionally");', 'process.exit(42);'].join(
          '\n',
        ),
        'utf8',
      );

      const result = await captureNodeCli(['sync', '--format', 'json'], {
        cwd: tempRoot,
        entrypoint: true,
      });
      const parsed = JSON.parse(result.stderr) as {
        error?: {
          code?: string;
          command?: string;
          detailLines?: string[];
          kind?: string;
        };
        ok?: boolean;
      };

      expect(result.error).toBeUndefined();
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(parsed.ok).toBe(false);
      expect(parsed.error?.kind).toBe('command-execution');
      expect(parsed.error?.code).toBe('command-execution');
      expect(parsed.error?.command).toBe('sync');
      expect(parsed.error?.detailLines).toContain('`npm run sync` failed.');
    } finally {
      removeTempRoot(tempRoot);
    }
  });

  test('runs first-party skills commands through the runtime dispatcher', async () => {
    const textResult = await captureNodeCli([
      'skills',
      'list',
      '--format',
      'text',
    ]);

    expect(textResult.error).toBeUndefined();
    expect(textResult.exitCode).toBe(0);
    expect(textResult.stdout).toMatch(/Detected|No agents detected/);
    expect(textResult.stdout).not.toContain('"commands": [');

    const jsonResult = await captureNodeCli([
      'skills',
      'list',
      '--format',
      'json',
    ]);

    expect(jsonResult.error).toBeUndefined();
    expect(jsonResult.exitCode).toBe(0);
    expect(jsonResult.stdout).toContain('"agents": [');
    expect(jsonResult.stdout).toContain('"commands": [');

    const unknownResult = await captureNodeCli(
      ['skills', 'unknown', '--format', 'json'],
      {
        entrypoint: true,
      },
    );
    const parsed = JSON.parse(unknownResult.stderr) as {
      error?: { code?: string; command?: string };
      ok?: boolean;
    };

    expect(unknownResult.error).toBeUndefined();
    expect(unknownResult.exitCode).toBe(1);
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.code).toBe(CLI_DIAGNOSTIC_CODES.INVALID_COMMAND);
    expect(parsed.error?.command).toBe('skills');
  });
});
