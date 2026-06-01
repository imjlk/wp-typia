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
  NODE_FALLBACK_NO_COMMAND_REASON_LINE,
  STANDALONE_GUIDANCE_LINE,
} from './help';

export function createNodeFallbackNoCommandCliError() {
  return createCliCommandError({
    code: CLI_DIAGNOSTIC_CODES.INVALID_COMMAND,
    command: 'wp-typia',
    detailLines: [NODE_FALLBACK_NO_COMMAND_REASON_LINE],
    summary: 'No command was provided.',
  });
}

function isNodeFallbackNoCommandCliDiagnostic(error: unknown): boolean {
  return (
    isCliDiagnosticError(error) &&
    error.code === CLI_DIAGNOSTIC_CODES.INVALID_COMMAND &&
    error.command === 'wp-typia' &&
    error.detailLines.includes(NODE_FALLBACK_NO_COMMAND_REASON_LINE)
  );
}

export function throwUnsupportedNodeFallbackCommand(command: string): never {
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

export async function handleNodeFallbackEntrypointError(
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
        {
          ok: false,
          error: serializeCliDiagnosticError(diagnostic),
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
    return;
  }
  if (isNodeFallbackNoCommandCliDiagnostic(error)) {
    // Human no-command output already includes the explanatory line and help.
    process.exitCode = 1;
    return;
  }
  console.error(`Error: ${await formatCliDiagnosticError(error)}`);
  process.exitCode = 1;
}
