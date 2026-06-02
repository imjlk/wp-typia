import type { RuntimeCompletionPayload } from './runtime-output/types';
import { printCompletionPayload } from './runtime-bridge-output';
import type { PrintLine } from './print-line';

export type CliCommandId = 'add' | 'create' | 'doctor' | 'init' | 'migrate';

const loadCliDiagnosticsRuntime = () =>
  import('@wp-typia/project-tools/cli-diagnostics');

export async function wrapCliCommandError(
  command: CliCommandId,
  error: unknown,
) {
  const { createCliCommandError } = await loadCliDiagnosticsRuntime();
  return createCliCommandError({ command, error });
}

export function shouldWrapCliCommandError(options: {
  emitOutput?: boolean;
  renderLine?: ((line: string) => void) | undefined;
}): boolean {
  if (options.emitOutput === false) {
    return false;
  }

  if (options.renderLine) {
    return false;
  }

  return true;
}

export function emitCompletion(
  payload: RuntimeCompletionPayload,
  options: {
    emitOutput: boolean;
    printLine: PrintLine;
    warnLine?: PrintLine;
  },
): RuntimeCompletionPayload {
  if (options.emitOutput) {
    printCompletionPayload(payload, {
      printLine: options.printLine,
      warnLine: options.warnLine,
    });
  }

  return payload;
}

export function pushFlag(argv: string[], name: string, value: unknown): void {
  if (value === undefined || value === null || value === false) {
    return;
  }
  if (value === true) {
    argv.push(`--${name}`);
    return;
  }
  argv.push(`--${name}`, String(value));
}
