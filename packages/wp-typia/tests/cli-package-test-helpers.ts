import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export const packageRoot = path.resolve(import.meta.dir, '..');
export const entryPath = path.join(packageRoot, 'bin', 'wp-typia.js');
export const runtimeEntrypoint = path.join(packageRoot, 'dist', 'cli.js');

export function runCapturedCommand(
  command: string,
  args: string[],
  options: Parameters<typeof spawnSync>[2] = {},
) {
  return spawnSync(command, args, {
    ...options,
    encoding: 'utf8',
  });
}

export function withoutAIAgentEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AGENT: '',
    AMP_CURRENT_THREAD_ID: '',
    CLAUDECODE: '',
    CLAUDE_CODE: '',
    CODEX_CI: '',
    CODEX_SANDBOX: '',
    CODEX_THREAD_ID: '',
    CURSOR_AGENT: '',
    GEMINI_CLI: '',
    OPENCODE: '',
  };
}

export function withoutLocalBunEnv(): NodeJS.ProcessEnv {
  return {
    ...withoutAIAgentEnv(),
    BUN_BIN: path.join(os.tmpdir(), 'wp-typia-missing-bun'),
    PATH: path.dirname(process.execPath),
  };
}

export function parseJsonObjectFromOutput<T>(output: string): T {
  const trimmed = output.trim();
  const jsonStart = trimmed.startsWith('{') ? 0 : trimmed.lastIndexOf('\n{');
  const jsonSource = (
    jsonStart >= 0
      ? trimmed.slice(jsonStart === 0 ? 0 : jsonStart + 1)
      : trimmed
  ).trim();
  return JSON.parse(jsonSource) as T;
}

export function parseJsonArrayFromOutput<T>(output: string): T {
  const trimmed = output.trim();
  const jsonStart = trimmed.startsWith('[') ? 0 : trimmed.lastIndexOf('\n[');
  const jsonSource = (
    jsonStart >= 0
      ? trimmed.slice(jsonStart === 0 ? 0 : jsonStart + 1)
      : trimmed
  ).trim();
  return JSON.parse(jsonSource) as T;
}
