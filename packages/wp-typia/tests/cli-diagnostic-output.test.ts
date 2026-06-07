import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { CLI_DIAGNOSTIC_CODES } from '@wp-typia/project-tools/cli-diagnostics';

import {
  emitCliDiagnosticFailure,
  prefersStructuredCliArgv,
  prefersStructuredCliOutput,
  writeStructuredCliDiagnosticError,
} from '../src/cli-diagnostic-output';
import {
  formatInvalidCliOutputFormatMessage,
  isSupportedCliOutputFormat,
  normalizeCliOutputFormatArgv,
  validateCliOutputFormatArgv,
} from '../src/cli-output-format';

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

let originalAIAgentEnv: Map<string, string | undefined>;

function captureStderr(callback: () => void): {
  exitCode: string | number | undefined;
  stderr: string;
} {
  const originalExitCode = process.exitCode;
  const originalWrite = process.stderr.write;
  let stderr = '';

  process.exitCode = undefined;
  process.stderr.write = ((chunk: unknown) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;

  try {
    callback();
    return {
      exitCode: process.exitCode,
      stderr,
    };
  } finally {
    process.stderr.write = originalWrite;
    process.exitCode = originalExitCode;
  }
}

describe('CLI structured diagnostic output', () => {
  beforeEach(() => {
    originalAIAgentEnv = new Map(
      AI_ENV_KEYS.map((key) => [key, process.env[key]]),
    );
    for (const key of AI_ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.exitCode = 0;
    for (const key of AI_ENV_KEYS) {
      const value = originalAIAgentEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  test('detects explicit structured format requests before argv terminators', () => {
    expect(prefersStructuredCliArgv(['doctor', '--format', 'json'])).toBe(true);
    expect(prefersStructuredCliArgv(['doctor', '--format=json'])).toBe(true);
    expect(prefersStructuredCliArgv(['doctor', '--format', 'text'])).toBe(false);
    expect(prefersStructuredCliArgv(['doctor', '--format', 'toon'])).toBe(false);
    expect(
      prefersStructuredCliArgv(['doctor', '--', '--format', 'json']),
    ).toBe(false);
  });

  test('prefers structured output for explicit JSON and agent contexts', () => {
    expect(
      prefersStructuredCliOutput({
        format: 'json',
        formatExplicit: true,
        output: () => {},
      }),
    ).toBe(true);
    expect(
      prefersStructuredCliOutput({
        format: 'json',
        formatExplicit: false,
        output: () => {},
      }),
    ).toBe(false);
    expect(
      prefersStructuredCliOutput({
        agent: {},
        format: 'text',
        formatExplicit: true,
        output: () => {},
      }),
    ).toBe(false);
    expect(
      prefersStructuredCliOutput({
        context: {
          store: {
            isAIAgent: true,
          },
        },
        output: () => {},
      }),
    ).toBe(true);
  });

  test('writes structured command failures to stderr and leaves stdout callbacks unused', () => {
    let outputCalls = 0;
    const captured = captureStderr(() => {
      const handled = emitCliDiagnosticFailure(
        {
          format: 'json',
          formatExplicit: true,
          output: () => {
            outputCalls += 1;
          },
        },
        {
          code: CLI_DIAGNOSTIC_CODES.INVALID_COMMAND,
          command: 'templates',
          detailLines: ['Unknown templates subcommand "wat".'],
        },
      );

      expect(handled).toBe(true);
    });
    const parsed = JSON.parse(captured.stderr) as {
      error?: { code?: string; command?: string };
      ok?: boolean;
    };

    expect(outputCalls).toBe(0);
    expect(captured.exitCode).toBe(1);
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.code).toBe(CLI_DIAGNOSTIC_CODES.INVALID_COMMAND);
    expect(parsed.error?.command).toBe('templates');
  });

  test('returns false for human output and serializes structured argv errors to stderr', () => {
    expect(
      writeStructuredCliDiagnosticError(['doctor'], new Error('boom')),
    ).toBe(false);

    const captured = captureStderr(() => {
      const handled = writeStructuredCliDiagnosticError(
        ['doctor', '--format', 'json'],
        new Error('doctor exploded'),
      );

      expect(handled).toBe(true);
    });
    const parsed = JSON.parse(captured.stderr) as {
      error?: { command?: string; kind?: string; message?: string };
      ok?: boolean;
    };

    expect(captured.exitCode).toBe(1);
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.command).toBe('doctor');
    expect(parsed.error?.kind).toBe('command-execution');
    expect(parsed.error?.message).toContain('doctor exploded');
  });

  test('adds AI-agent notices only for implicit structured argv errors', () => {
    process.env.CODEX_THREAD_ID = 'thread-1';

    const captured = captureStderr(() => {
      const handled = writeStructuredCliDiagnosticError(
        ['doctor'],
        new Error('doctor exploded'),
      );

      expect(handled).toBe(true);
    });
    const parsed = JSON.parse(captured.stderr) as {
      notices?: string[];
      ok?: boolean;
    };

    expect(parsed.ok).toBe(false);
    expect(parsed.notices?.[0]).toContain(
      'Detected codex via CODEX_THREAD_ID; defaulting to --format json.',
    );

    const explicit = captureStderr(() => {
      const handled = writeStructuredCliDiagnosticError(
        ['doctor', '--format', 'json'],
        new Error('doctor exploded'),
      );

      expect(handled).toBe(true);
    });
    const explicitParsed = JSON.parse(explicit.stderr) as {
      notices?: string[];
    };
    expect(explicitParsed.notices).toBeUndefined();
  });

  test('throws human diagnostics and validates unsupported output formats before dispatch', () => {
    expect(() =>
      emitCliDiagnosticFailure(
        {
          format: 'toon',
          formatExplicit: true,
          output: () => {},
        },
        {
          code: CLI_DIAGNOSTIC_CODES.INVALID_COMMAND,
          command: 'sync',
          detailLines: ['Unknown sync target.'],
        },
      ),
    ).toThrow('wp-typia sync failed');

    try {
      validateCliOutputFormatArgv(['sync', '--format', 'jso']);
      throw new Error('Expected invalid output format validation to throw.');
    } catch (error) {
      expect(error).toMatchObject({
        code: CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
        command: 'sync',
      });
    }
  });

  test('advertises text output while accepting the legacy toon alias', () => {
    expect(formatInvalidCliOutputFormatMessage('jso')).toBe(
      'Invalid --format value "jso". Supported values: json, text.',
    );
    expect(isSupportedCliOutputFormat('json')).toBe(true);
    expect(isSupportedCliOutputFormat('text')).toBe(true);
    expect(isSupportedCliOutputFormat('toon')).toBe(true);

    expect(() =>
      validateCliOutputFormatArgv(['sync', '--format', 'text']),
    ).not.toThrow();
    expect(() =>
      validateCliOutputFormatArgv(['sync', '--format', 'toon']),
    ).not.toThrow();
    expect(() =>
      validateCliOutputFormatArgv(['sync', '--format', 'jso']),
    ).toThrow('Supported values: json, text.');
  });

  test('normalizes public text format to the internal runtime alias', () => {
    expect(normalizeCliOutputFormatArgv(['doctor', '--format', 'text'])).toEqual(
      ['doctor', '--format', 'toon'],
    );
    expect(normalizeCliOutputFormatArgv(['doctor', '--format=text'])).toEqual([
      'doctor',
      '--format=toon',
    ]);
    expect(
      normalizeCliOutputFormatArgv(['doctor', '--', '--format', 'text']),
    ).toEqual(['doctor', '--', '--format', 'text']);
    expect(
      normalizeCliOutputFormatArgv(['doctor', '--format', '--', '--format=text']),
    ).toEqual(['doctor', '--format', '--', '--format=text']);
  });
});
