import {
  CLI_DIAGNOSTIC_CODES,
  createCliCommandError,
  formatCliDiagnosticError,
  isCliDiagnosticError,
  serializeCliDiagnosticError,
} from '@wp-typia/project-tools/cli-diagnostics';
import { prefersStructuredCliArgv } from '../cli-diagnostic-output';
import { resolveCanonicalCommandContext } from '../command-contract';
import {
  getStructuredOutputNoticesForArgv,
  withStructuredOutputNotices,
} from '../structured-output-notices';
import {
  PORTABLE_CLI_NO_COMMAND_REASON_LINE,
  STANDALONE_GUIDANCE_LINE,
} from './help';

export function createPortableCliNoCommandCliError() {
  return createCliCommandError({
    code: CLI_DIAGNOSTIC_CODES.INVALID_COMMAND,
    command: 'wp-typia',
    detailLines: [PORTABLE_CLI_NO_COMMAND_REASON_LINE],
    summary: 'No command was provided.',
  });
}

function isPortableCliNoCommandCliDiagnostic(error: unknown): boolean {
  return (
    isCliDiagnosticError(error) &&
    error.code === CLI_DIAGNOSTIC_CODES.INVALID_COMMAND &&
    error.command === 'wp-typia' &&
    error.detailLines.includes(PORTABLE_CLI_NO_COMMAND_REASON_LINE)
  );
}

export function throwUnsupportedPortableCliCommand(command: string): never {
  throw createCliCommandError({
    code: CLI_DIAGNOSTIC_CODES.UNSUPPORTED_COMMAND,
    command: command,
    detailLines: [
      [
        `The wp-typia CLI does not support \`${command}\`.`,
        'Supported commands: `--version`, `--help`, `create`, `init`, `add`, `migrate`, `doctor`, `sync`, `templates`, `mcp`, `skills`, `complete`, and `completions`.',
        STANDALONE_GUIDANCE_LINE,
      ].join(' '),
    ],
    summary: 'Unsupported wp-typia command.',
  });
}

export async function handlePortableCliEntrypointError(
  error: unknown,
  argv: string[],
): Promise<void> {
  if (prefersStructuredCliArgv(argv)) {
    const diagnostic = createCliCommandError({
      command: resolveCanonicalCommandContext(argv),
      error,
    });
    process.stderr.write(
      `${JSON.stringify(
        withStructuredOutputNotices(
          {
            ok: false,
            error: serializeCliDiagnosticError(diagnostic),
          },
          getStructuredOutputNoticesForArgv(argv),
        ),
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
    return;
  }
  if (isPortableCliNoCommandCliDiagnostic(error)) {
    // Human no-command output already includes the explanatory line and help.
    process.exitCode = 1;
    return;
  }
  console.error(`Error: ${await formatCliDiagnosticError(error)}`);
  process.exitCode = 1;
}
