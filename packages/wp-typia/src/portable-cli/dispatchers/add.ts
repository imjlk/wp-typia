import {
  CLI_DIAGNOSTIC_CODES,
  createCliCommandError,
} from '@wp-typia/project-tools/cli-diagnostics';
import {
  buildMissingAddKindDetailLines,
  shouldPrintMissingAddKindHelp,
} from '../../cli-error-messages';
import { executeAddCommand } from '../../runtime-bridge';
import {
  buildStructuredCompletionSuccessPayload,
  extractCompletionProjectDir,
} from '../../runtime-bridge-output';
import type { PortableCliDispatchContext } from '../types';

function resolvePortableCliAddName(
  positionals: readonly string[],
): string | undefined {
  if (positionals[1] === 'core-variation' && positionals[3]) {
    return positionals[3];
  }

  return positionals[2];
}

export async function dispatchPortableCliAdd({
  cwd,
  mergedFlags,
  positionals,
  printLine,
  warnLine,
}: PortableCliDispatchContext): Promise<void> {
  if (!positionals[1]) {
    if (shouldPrintMissingAddKindHelp({ format: mergedFlags.format })) {
      const { formatAddHelpText } =
        await import('@wp-typia/project-tools/cli-add');
      printLine(formatAddHelpText());
    }
    throw createCliCommandError({
      code: CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
      command: 'add',
      detailLines: buildMissingAddKindDetailLines(),
    });
  }

  // Add-specific normalization stays here: map positionals to kind/name and
  // switch JSON mode to structured completion output.
  const kind = positionals[1];
  const name = resolvePortableCliAddName(positionals);
  const positionalArgs = positionals.slice(1);

  if (mergedFlags.format === 'json') {
    let completion;
    try {
      completion = await executeAddCommand({
        cwd,
        emitOutput: false,
        flags: mergedFlags,
        interactive: false,
        kind,
        name,
        positionalArgs,
        printLine,
        warnLine,
      });
    } catch (error) {
      throw createCliCommandError({
        command: 'add',
        error,
      });
    }
    printLine(
      JSON.stringify(
        buildStructuredCompletionSuccessPayload('add', completion, {
          dryRun: Boolean(mergedFlags['dry-run']),
          kind,
          name,
          projectDir: extractCompletionProjectDir(completion) ?? cwd,
        }),
        null,
        2,
      ),
    );
    return;
  }

  await executeAddCommand({
    cwd,
    flags: mergedFlags,
    interactive: undefined,
    kind,
    name,
    positionalArgs,
    printLine,
    warnLine,
  });
}
