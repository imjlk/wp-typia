import {
  CLI_DIAGNOSTIC_CODES,
  createCliCommandError,
} from '@wp-typia/project-tools/cli-diagnostics';
import { resolveEntrypointCliCommand } from './cli-command-resolution';
import { PUBLIC_CLI_OUTPUT_FORMATS } from './command-options/global';

export { PUBLIC_CLI_OUTPUT_FORMATS } from './command-options/global';

// `toon` was the original internal spelling for human output. Keep accepting it
// for old automation, but do not advertise it in user-facing supported lists.
const LEGACY_CLI_OUTPUT_FORMAT_ALIASES = ['toon'] as const;

export const SUPPORTED_CLI_OUTPUT_FORMATS = [
  ...PUBLIC_CLI_OUTPUT_FORMATS,
  ...LEGACY_CLI_OUTPUT_FORMAT_ALIASES,
] as const;

const SUPPORTED_CLI_OUTPUT_FORMAT_VALUES: readonly string[] =
  SUPPORTED_CLI_OUTPUT_FORMATS;

export type CliOutputFormat = (typeof SUPPORTED_CLI_OUTPUT_FORMATS)[number];

export function formatSupportedCliOutputFormats(): string {
  return PUBLIC_CLI_OUTPUT_FORMATS.join(', ');
}

export function isSupportedCliOutputFormat(
  value: string | undefined,
): value is CliOutputFormat {
  return (
    typeof value === 'string' &&
    SUPPORTED_CLI_OUTPUT_FORMAT_VALUES.includes(value)
  );
}

export function normalizeCliOutputFormatArgv(argv: string[]): string[] {
  let normalized: string[] | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }

    if (arg === '--') {
      break;
    }

    if (arg === '--format') {
      const next = argv[index + 1];
      if (next === 'text') {
        normalized ??= [...argv];
        normalized[index + 1] = 'toon';
      }
      if (next && !next.startsWith('-')) {
        index += 1;
      }
      continue;
    }

    if (arg === '--format=text') {
      normalized ??= [...argv];
      normalized[index] = '--format=toon';
    }
  }

  return normalized ?? argv;
}

export function formatInvalidCliOutputFormatMessage(value: string): string {
  return `Invalid --format value "${value}". Supported values: ${formatSupportedCliOutputFormats()}.`;
}

function assertSupportedCliOutputFormat(
  value: string,
  argv: string[],
): void {
  if (isSupportedCliOutputFormat(value)) {
    return;
  }

  throw createCliCommandError({
    code: CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
    command: resolveEntrypointCliCommand(argv),
    detailLines: [formatInvalidCliOutputFormatMessage(value)],
  });
}

export function validateCliOutputFormatArgv(argv: string[]): void {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }

    if (arg === '--') {
      return;
    }

    if (arg === '--format') {
      const next = argv[index + 1];
      if (next && !next.startsWith('-')) {
        assertSupportedCliOutputFormat(next, argv);
        index += 1;
      }
      continue;
    }

    if (arg.startsWith('--format=')) {
      const value = arg.slice('--format='.length);
      if (value) {
        assertSupportedCliOutputFormat(value, argv);
      }
    }
  }
}
