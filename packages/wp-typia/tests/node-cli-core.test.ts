import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';

import { afterEach, describe, expect, test } from 'bun:test';

import { CLI_DIAGNOSTIC_CODES } from '@wp-typia/project-tools/cli-diagnostics';

import packageJson from '../package.json';
import {
  buildMissingAddKindDetailLines,
  buildMissingCreateProjectDirDetailLines,
} from '../src/cli-error-messages';
import {
  runNodeCli,
  runNodeCliEntrypoint,
  shouldInheritTextSyncStdio,
  writeProcessOutput,
} from '../src/node-cli';

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
    onStderrWrite?: (chunk: string) => void;
    stdoutBackpressureMs?: number;
  } = {},
): Promise<{
  error: unknown;
  exitCode: string | number;
  stderr: string;
  stdout: string;
  stdoutBackpressureDrained: boolean;
  stdoutBackpressureTriggered: boolean;
}> {
  const originalCwd = process.cwd();
  const originalExitCode = process.exitCode;
  const originalError = console.error;
  const originalLog = console.log;
  const originalStderrWrite = process.stderr.write;
  const originalStdoutWrite = process.stdout.write;
  const originalWarn = console.warn;
  const originalAgentEnv = new Map(
    AI_AGENT_ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  const stderr: string[] = [];
  const stdout: string[] = [];
  let stdoutBackpressureDrained = false;
  let stdoutBackpressureTimer: ReturnType<typeof setTimeout> | undefined;
  let stdoutBackpressureTriggered = false;
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
    const rendered = Buffer.isBuffer(chunk)
      ? chunk.toString('utf8')
      : String(chunk);
    stderr.push(rendered);
    options.onStderrWrite?.(rendered);
    const callback = args.find(
      (arg): arg is (error?: Error | null) => void =>
        typeof arg === 'function',
    );
    callback?.();
    return true;
  }) as typeof process.stderr.write;
  process.stdout.write = ((chunk: unknown, ...args: unknown[]) => {
    stdout.push(
      Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk),
    );
    const callback = args.find(
      (arg): arg is (error?: Error | null) => void =>
        typeof arg === 'function',
    );
    if (
      options.stdoutBackpressureMs !== undefined &&
      !stdoutBackpressureTriggered
    ) {
      stdoutBackpressureTriggered = true;
      stdoutBackpressureTimer = setTimeout(() => {
        stdoutBackpressureDrained = true;
        process.stdout.emit('drain');
      }, options.stdoutBackpressureMs);
      callback?.();
      return false;
    }
    callback?.();
    return true;
  }) as typeof process.stdout.write;

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
      stdoutBackpressureDrained,
      stdoutBackpressureTriggered,
    };
  } finally {
    if (stdoutBackpressureTimer) {
      clearTimeout(stdoutBackpressureTimer);
    }
    if (options.cwd) {
      process.chdir(originalCwd);
    }
    console.error = originalError;
    console.log = originalLog;
    console.warn = originalWarn;
    process.stderr.write = originalStderrWrite;
    process.stdout.write = originalStdoutWrite;
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

async function withProcessEnv<T>(
  overrides: Partial<NodeJS.ProcessEnv>,
  callback: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();

  for (const key of Object.keys(overrides)) {
    previous.set(key, process.env[key]);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
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
  test('preserves terminal stdio only for interactive text sync runs', () => {
    expect(
      shouldInheritTextSyncStdio({
        dryRun: false,
        stderrIsTTY: true,
        stdoutIsTTY: true,
        structured: false,
      }),
    ).toBe(true);
    expect(
      shouldInheritTextSyncStdio({
        dryRun: false,
        stderrIsTTY: false,
        stdoutIsTTY: true,
        structured: false,
      }),
    ).toBe(false);
    expect(
      shouldInheritTextSyncStdio({
        dryRun: false,
        stderrIsTTY: true,
        stdoutIsTTY: true,
        structured: true,
      }),
    ).toBe(false);
  });

  test('treats a closed process output pipe as a completed write', async () => {
    const error = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    const stream = new Writable({
      write(_chunk, _encoding, callback) {
        callback(error);
      },
    });

    await Promise.resolve(writeProcessOutput(stream, 'sync output'));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(writeProcessOutput(stream, 'discarded output')).toBeUndefined();
  });

  test('discards future output after a late closed-pipe error', async () => {
    const error = Object.assign(new Error('late write EPIPE'), {
      code: 'EPIPE',
    });
    const stream = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
        queueMicrotask(() => stream.emit('error', error));
      },
    });

    await Promise.resolve(writeProcessOutput(stream, 'sync output'));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(writeProcessOutput(stream, 'discarded output')).toBeUndefined();
  });

  test('forwards a late non-pipe error after a completed write', async () => {
    const error = Object.assign(new Error('late stream failure'), {
      code: 'ERR_STREAM_WRITE_AFTER_END',
    });
    const forwardedErrors: Error[] = [];
    const stream = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
        queueMicrotask(() => stream.emit('error', error));
      },
    });
    const emit = stream.emit.bind(stream);
    stream.emit = ((event: string | symbol, ...args: unknown[]) => {
      if (event === 'error' && stream.listenerCount('error') === 0) {
        forwardedErrors.push(args[0] as Error);
        return true;
      }
      return emit(event, ...args);
    }) as typeof stream.emit;

    await Promise.resolve(writeProcessOutput(stream, 'sync output'));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(forwardedErrors).toEqual([error]);
  });

  test('does not rethrow a non-pipe error already reported by the write callback', async () => {
    const error = Object.assign(new Error('callback stream failure'), {
      code: 'ERR_STREAM_WRITE_AFTER_END',
    });
    const forwardedErrors: Error[] = [];
    const stream = new Writable({
      write(_chunk, _encoding, callback) {
        callback(error);
      },
    });
    const emit = stream.emit.bind(stream);
    stream.emit = ((event: string | symbol, ...args: unknown[]) => {
      if (event === 'error' && stream.listenerCount('error') === 0) {
        forwardedErrors.push(args[0] as Error);
        return true;
      }
      return emit(event, ...args);
    }) as typeof stream.emit;

    const caught = await Promise.resolve(
      writeProcessOutput(stream, 'sync output'),
    ).catch((thrown) => thrown);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(caught).toBe(error);
    expect(forwardedErrors).toEqual([]);
  });

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
    const skillsHelp = await captureNodeCli(['skills', '--help']);

    expect(generalHelp.error).toBeUndefined();
    expect(generalHelp.exitCode).toBe(0);
    expect(generalHelp.stdout).toContain('Commands:');
    expect(generalHelp.stdout).toContain('Standalone wp-typia binaries');
    expect(generalHelp.stdout).not.toContain('No command provided.');

    expect(addHelp.error).toBeUndefined();
    expect(addHelp.exitCode).toBe(0);
    expect(addHelp.stdout).toContain('Usage: wp-typia add <kind> <name>');
    expect(addHelp.stdout).toContain(
      '- --secret-field <value>: Write-only request body field for manual settings REST contracts; requires --manual and a request body, typically generated by POST, PUT, or PATCH.',
    );

    expect(createHelp.error).toBeUndefined();
    expect(createHelp.exitCode).toBe(0);
    expect(createHelp.stdout).toContain('Usage: wp-typia create <project-dir>');
    expect(createHelp.stdout).toContain('Runtime: Node-first wp-typia CLI');
    expect(createHelp.stdout).toContain('Supported flags:');
    expect(createHelp.stdout).toContain('--template');
    expect(createHelp.stdout).toContain('--wp-version');

    expect(commandHelp.error).toBeUndefined();
    expect(commandHelp.exitCode).toBe(0);
    expect(commandHelp.stdout).toContain('wp-typia templates <list|inspect>');
    expect(commandHelp.stdout).toContain('Runtime: Node-first wp-typia CLI');
    expect(commandHelp.stdout).toContain('Supported flags:');
    expect(commandHelp.stdout).toContain('--id');

    expect(skillsHelp.error).toBeUndefined();
    expect(skillsHelp.exitCode).toBe(0);
    expect(skillsHelp.stdout).toContain('Usage: wp-typia skills <list|sync>');
    expect(skillsHelp.stdout).toContain('.agents/skills/wp-typia/');
    expect(skillsHelp.stdout).toContain('.gitignore');
  });

  test('renders focused guidance for unknown help targets without dispatching commands', async () => {
    const result = await captureNodeCli(['help', 'definitely-not-a-command']);
    const typoResult = await captureNodeCli(['help', 'docotr']);
    const structuredResult = await captureNodeCli([
      '--format',
      'json',
      'help',
      'definitely-not-a-command',
    ]);

    expect(result.error).toBeUndefined();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      'Unknown help target "definitely-not-a-command".',
    );
    expect(result.stdout).toContain('Supported commands: create, init, sync');
    expect(result.stdout).toContain('wp-typia --help');
    expect(result.stdout).not.toContain('Usage: wp-typia create <project-dir>');

    expect(typoResult.error).toBeUndefined();
    expect(typoResult.exitCode).toBe(0);
    expect(typoResult.stdout).toContain('Unknown help target "docotr".');
    expect(typoResult.stdout).toContain(
      'Did you mean "doctor"? Run wp-typia doctor --help.',
    );
    expect(typoResult.stdout).toContain('Supported commands: create, init, sync');

    expect(structuredResult.error).toBeUndefined();
    expect(structuredResult.exitCode).toBe(0);
    expect(structuredResult.stdout).toContain(
      'Unknown help target "definitely-not-a-command".',
    );
    expect(structuredResult.stderr).toBe('');
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
    expect(addDispatcherSource).toContain('executeAddCommand');
    expect(addDispatcherSource).not.toContain('buildMissingAddKindDetailLines');
    expect(addDispatcherSource).not.toContain('shouldPrintMissingAddKindHelp');
    expect(addDispatcherSource).not.toContain('formatAddKindUsagePlaceholder');
    expect(createDispatcherSource).toContain(
      'export async function dispatchPortableCliCreate',
    );
    expect(createDispatcherSource).toContain(
      'buildMissingCreateProjectDirDetailLines',
    );
    expect(runtimeBridgeSource).toContain("from './runtime-bridge-add'");
    expect(runtimeBridgeAddSource).toContain('getAddKindOptions');
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
        'package.json, generated helper files, and any package-manager configuration updates are snapshotted',
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

  test('replays captured sync output for successful text runs', async () => {
    const tempRoot = createTempRoot('wp-typia-node-sync-output-');

    try {
      fs.mkdirSync(path.join(tempRoot, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(tempRoot, 'node_modules'), { recursive: true });
      writeJson(path.join(tempRoot, 'package.json'), {
        name: 'demo-sync-output',
        packageManager: 'npm@10.9.0',
        scripts: {
          sync: 'node scripts/succeed.mjs',
        },
      });
      fs.writeFileSync(
        path.join(tempRoot, 'scripts', 'succeed.mjs'),
        [
          'console.log("sync stdout marker");',
          'process.stderr.write("sync stderr marker\\r\\n");',
        ].join('\n'),
        'utf8',
      );

      const result = await captureNodeCli(['sync', '--format', 'text'], {
        cwd: tempRoot,
        entrypoint: true,
      });

      expect(result.error).toBeUndefined();
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('sync stdout marker');
      expect(result.stderr).toContain('sync stderr marker');
      expect(result.stderr).not.toContain('\r');
    } finally {
      removeTempRoot(tempRoot);
    }
  });

  test('streams non-stack partial stderr prompts before exit', async () => {
    const tempRoot = createTempRoot('wp-typia-node-sync-prompt-');
    const continuePath = path.join(tempRoot, 'continue');
    const atPromptPath = path.join(tempRoot, 'at-prompt');

    try {
      fs.mkdirSync(path.join(tempRoot, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(tempRoot, 'node_modules'), { recursive: true });
      writeJson(path.join(tempRoot, 'package.json'), {
        name: 'demo-sync-stderr-prompt',
        packageManager: 'npm@10.9.0',
        scripts: {
          sync: 'node scripts/prompt.mjs',
        },
      });
      fs.writeFileSync(
        path.join(tempRoot, 'scripts', 'prompt.mjs'),
        [
          "import fs from 'node:fs';",
          "process.stderr.write('Continue? ');",
          "while (!fs.existsSync('continue')) {",
          '  await new Promise((resolve) => setTimeout(resolve, 10));',
          '}',
          "process.stderr.write('\\nat path: ');",
          "while (!fs.existsSync('at-prompt')) {",
          '  await new Promise((resolve) => setTimeout(resolve, 10));',
          '}',
        ].join('\n'),
        'utf8',
      );
      let streamedStderr = '';
      const execution = captureNodeCli(['sync', '--format', 'text'], {
        cwd: tempRoot,
        entrypoint: true,
        onStderrWrite: (chunk) => {
          streamedStderr += chunk;
          if (
            streamedStderr.includes('Continue? ') &&
            !fs.existsSync(continuePath)
          ) {
            fs.writeFileSync(continuePath, '', 'utf8');
          }
          if (
            streamedStderr.includes('at path: ') &&
            !fs.existsSync(atPromptPath)
          ) {
            fs.writeFileSync(atPromptPath, '', 'utf8');
          }
        },
      });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const outcome = await Promise.race([
        execution.then(() => 'completed' as const),
        new Promise<'timed-out'>((resolve) => {
          timeout = setTimeout(() => resolve('timed-out'), 2_000);
        }),
      ]);
      if (timeout) {
        clearTimeout(timeout);
      }
      if (outcome === 'timed-out') {
        fs.writeFileSync(continuePath, '', 'utf8');
        fs.writeFileSync(atPromptPath, '', 'utf8');
        await execution;
      }

      expect(outcome).toBe('completed');
      expect(streamedStderr).toContain('Continue? ');
      expect(streamedStderr).toContain('at path: ');
    } finally {
      removeTempRoot(tempRoot);
    }
  });

  test('waits for stdout drain before completing streamed sync output', async () => {
    const tempRoot = createTempRoot('wp-typia-node-sync-backpressure-');

    try {
      fs.mkdirSync(path.join(tempRoot, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(tempRoot, 'node_modules'), { recursive: true });
      writeJson(path.join(tempRoot, 'package.json'), {
        name: 'demo-sync-stdout-backpressure',
        packageManager: 'npm@10.9.0',
        scripts: {
          sync: 'node scripts/succeed.mjs',
        },
      });
      fs.writeFileSync(
        path.join(tempRoot, 'scripts', 'succeed.mjs'),
        "console.log('backpressure marker');\n",
        'utf8',
      );

      const result = await captureNodeCli(['sync', '--format', 'text'], {
        cwd: tempRoot,
        entrypoint: true,
        stdoutBackpressureMs: 500,
      });

      expect(result.error).toBeUndefined();
      expect(result.stdoutBackpressureTriggered).toBe(true);
      expect(result.stdoutBackpressureDrained).toBe(true);
      expect(result.stdout).toContain('backpressure marker');
    } finally {
      removeTempRoot(tempRoot);
    }
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
        [
          'console.error("sync failed intentionally");',
          'console.error(`failed file: ${process.cwd()}/src/private.ts`);',
          'console.error(`sibling path: ${process.cwd()}-cache/schema.ts`);',
          'console.error("outside cache: /home/alice/.cache/wp-typia/schema.json");',
          'console.error("outside windows: C:\\\\Users\\\\Alice\\\\.cache\\\\wp-typia\\\\schema.json");',
          'console.error(\'outside spaced: "/Users/alice/Library/Application Support/wp-typia/schema.json"\');',
          'console.error("outside spaced unquoted: /Users/alice/Library/Application Support/wp-typia/schema.json");',
          'console.error("outside spaced diagnostic: /Users/alice/Library/Application Support/wp-typia/schema.json - error: not found");',
          'await new Promise((resolve) => process.stderr.write("outside split diagnostic: /Users/alice/Library/Application Support/wp-typia/schema.json", resolve));',
          'await new Promise((resolve) => setImmediate(resolve));',
          'console.error(" - error: split preserved");',
          'console.error(`case variant: ${process.cwd().toUpperCase()}/src/case.ts`);',
          'console.error(`alternate separators: ${process.cwd().replaceAll("/", "\\\\")}/src/alternate.ts`);',
          'console.error("at least 3 generated files need attention");',
          'console.error("    at cachedTool (/home/alice/.cache/tool.ts:12:34)");',
          'console.error("    at runSyncScript (sync-project.ts:78:9)");',
          'process.exit(42);',
        ].join('\n'),
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
          data?: Record<string, unknown>;
          detailLines?: string[];
          kind?: string;
          message?: string;
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
      expect(parsed.error?.detailLines).toContain(
        '`npm run sync` failed with exit code 42.',
      );
      expect(parsed.error?.detailLines).toContain('sync failed intentionally');
      expect(parsed.error?.detailLines).toContain(
        'failed file: <project-root>/src/private.ts',
      );
      expect(parsed.error?.detailLines).toContain(
        'sibling path: <redacted-path-prefix>-cache/schema.ts',
      );
      expect(parsed.error?.detailLines).not.toContain(
        'sibling path: <project-root>-cache/schema.ts',
      );
      expect(parsed.error?.detailLines).toContain(
        'outside cache: <redacted-path>',
      );
      expect(parsed.error?.detailLines).toContain(
        'outside windows: <redacted-path>',
      );
      expect(parsed.error?.detailLines).toContain(
        'outside spaced: "<redacted-path>"',
      );
      expect(parsed.error?.detailLines).toContain(
        'outside spaced unquoted: <redacted-path>',
      );
      expect(parsed.error?.detailLines).toContain(
        'outside spaced diagnostic: <redacted-path> - error: not found',
      );
      expect(parsed.error?.detailLines).toContain(
        'outside split diagnostic: <redacted-path> - error: split preserved',
      );
      expect(parsed.error?.detailLines).toContain(
        'case variant: <project-root>/src/case.ts',
      );
      expect(parsed.error?.detailLines).toContain(
        'alternate separators: <project-root>/src/alternate.ts',
      );
      expect(parsed.error?.detailLines).toContain(
        'at least 3 generated files need attention',
      );
      expect(parsed.error?.message).not.toContain(fs.realpathSync(tempRoot));
      expect(parsed.error?.message).not.toContain('/home/alice');
      expect(parsed.error?.message).not.toContain('C:\\Users\\Alice');
      expect(parsed.error?.message).not.toContain('Application Support');
      expect(parsed.error?.data).toEqual({
        command: 'npm run sync',
        exitCode: 42,
      });

      const textResult = await captureNodeCli(['sync', '--format', 'text'], {
        cwd: tempRoot,
        entrypoint: true,
      });
      expect(textResult.exitCode).toBe(1);
      expect(textResult.stderr).toContain('sync failed intentionally');
      expect(textResult.stderr).toContain(
        'failed file: <project-root>/src/private.ts',
      );
      expect(textResult.stderr).toContain(
        'sibling path: <redacted-path-prefix>-cache/schema.ts',
      );
      expect(textResult.stderr).not.toContain(
        'sibling path: <project-root>-cache/schema.ts',
      );
      expect(textResult.stderr).toContain('outside cache: <redacted-path>');
      expect(textResult.stderr).toContain('outside windows: <redacted-path>');
      expect(textResult.stderr).toContain(
        'outside spaced: "<redacted-path>"',
      );
      expect(textResult.stderr).toContain(
        'outside spaced unquoted: <redacted-path>',
      );
      expect(textResult.stderr).toContain(
        'outside spaced diagnostic: <redacted-path> - error: not found',
      );
      expect(textResult.stderr).toMatch(
        /outside split diagnostic:\s*<redacted-path> - error: split preserved/u,
      );
      expect(textResult.stderr).toContain(
        'case variant: <project-root>/src/case.ts',
      );
      expect(textResult.stderr).toContain(
        'alternate separators: <project-root>/src/alternate.ts',
      );
      expect(textResult.stderr).toContain(
        'at least 3 generated files need attention',
      );
      expect(textResult.stderr).not.toContain(fs.realpathSync(tempRoot));
      expect(textResult.stderr).not.toContain('/home/alice');
      expect(textResult.stderr).not.toContain('C:\\Users\\Alice');
      expect(textResult.stderr).not.toContain('Application Support');
      expect(textResult.stderr).not.toContain('\n    at ');
      expect(textResult.stderr).not.toContain('cachedTool');
    } finally {
      removeTempRoot(tempRoot);
    }
  });

  test('emits project-relative generated artifact drift details', async () => {
    const tempRoot = createTempRoot('wp-typia-node-sync-drift-');

    try {
      fs.mkdirSync(path.join(tempRoot, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(tempRoot, 'node_modules'), { recursive: true });
      writeJson(path.join(tempRoot, 'package.json'), {
        name: 'demo-sync-drift',
        packageManager: 'npm@10.9.0',
        scripts: {
          sync: 'node scripts/drift.mjs',
        },
      });
      fs.writeFileSync(
        path.join(tempRoot, 'scripts', 'drift.mjs'),
        [
          "import path from 'node:path';",
          "console.error('Generated artifacts are missing or stale:');",
          "console.error(`- ${path.join(process.cwd(), 'src', 'block.json')} (stale)`);",
          "console.error(`- ${path.join(process.cwd(), 'src', 'typia-validator.php')} (missing)`);",
          "console.error('    at runSyncScript (sync-project.ts:78:9)');",
          'process.exit(1);',
        ].join('\n'),
        'utf8',
      );

      const result = await captureNodeCli(
        ['sync', '--check', '--format', 'json'],
        {
          cwd: tempRoot,
          entrypoint: true,
        },
      );
      const parsed = JSON.parse(result.stderr) as {
        error?: {
          code?: string;
          data?: {
            artifacts?: Array<{ path: string; status: string }>;
            command?: string;
            exitCode?: number;
          };
          detailLines?: string[];
          message?: string;
        };
        ok?: boolean;
      };

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(parsed.ok).toBe(false);
      expect(parsed.error?.code).toBe('generated-artifact-drift');
      expect(parsed.error?.data).toEqual({
        artifacts: [
          { path: 'src/block.json', status: 'stale' },
          { path: 'src/typia-validator.php', status: 'missing' },
        ],
        command: 'npm run sync -- --check',
        exitCode: 1,
      });
      expect(parsed.error?.detailLines).toContain(
        'Stale generated artifact: src/block.json.',
      );
      expect(parsed.error?.message).not.toContain(tempRoot);
      expect(parsed.error?.message).not.toContain('at runSyncScript');
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

  test('reports generated local skill gitignore updates in text and json output', async () => {
    const tempRoot = createTempRoot('wp-typia-skills-cli-');
    const home = path.join(tempRoot, 'home');
    const textCwd = path.join(tempRoot, 'text-project');
    const jsonCwd = path.join(tempRoot, 'json-project');
    const dataHome = path.join(tempRoot, 'data');

    try {
      fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
      fs.mkdirSync(textCwd, { recursive: true });
      fs.mkdirSync(jsonCwd, { recursive: true });

      const env = {
        CODEX_HOME: path.join(home, '.codex'),
        XDG_CONFIG_HOME: path.join(home, '.config'),
        XDG_DATA_HOME: dataHome,
      };
      const textResult = await withProcessEnv(env, () =>
        captureNodeCli(['skills', 'sync', '--local'], { cwd: textCwd }),
      );

      expect(textResult.error).toBeUndefined();
      expect(textResult.exitCode).toBe(0);
      expect(textResult.stderr).toBe('');
      expect(textResult.stdout).toContain(
        'Updated .gitignore for generated local skills: .agents/skills/wp-typia/',
      );
      expect(
        fs.readFileSync(path.join(textCwd, '.gitignore'), 'utf8'),
      ).toContain('.agents/skills/wp-typia/');

      const jsonResult = await withProcessEnv(env, () =>
        captureNodeCli(['skills', 'sync', '--local', '--format', 'json'], {
          cwd: jsonCwd,
        }),
      );
      const parsed = JSON.parse(jsonResult.stdout) as {
        gitignore?: { entries?: string[]; path?: string; updated?: boolean };
        paths?: string[];
        updated?: boolean;
      };

      expect(jsonResult.error).toBeUndefined();
      expect(jsonResult.exitCode).toBe(0);
      expect(jsonResult.stderr).toBe('');
      expect(parsed.updated).toBe(true);
      const resolvedJsonCwd = fs.realpathSync(jsonCwd);
      expect(parsed.paths).toContain(
        path.join(resolvedJsonCwd, '.agents', 'skills', 'wp-typia'),
      );
      expect(parsed.gitignore).toEqual({
        entries: ['.agents/skills/wp-typia/'],
        path: path.join(resolvedJsonCwd, '.gitignore'),
        updated: true,
      });
    } finally {
      removeTempRoot(tempRoot);
    }
  });
});
