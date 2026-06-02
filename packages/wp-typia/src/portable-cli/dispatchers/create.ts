import {
  CLI_DIAGNOSTIC_CODES,
  createCliCommandError,
} from '@wp-typia/project-tools/cli-diagnostics';
import { executeCreateCommand } from '../../runtime-bridge';
import {
  buildStructuredCompletionSuccessPayload,
  extractCompletionProjectDir,
} from '../../runtime-bridge-output';
import { buildMissingCreateProjectDirDetailLines } from '../../cli-error-messages';
import type { PortableCliDispatchContext } from '../types';

export async function dispatchPortableCliCreate({
  cwd,
  mergedFlags,
  positionals,
  printLine,
  warnLine,
}: PortableCliDispatchContext): Promise<void> {
  const projectDir = positionals[1];
  if (!projectDir) {
    throw createCliCommandError({
      code: CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
      command: 'create',
      detailLines: buildMissingCreateProjectDirDetailLines(),
    });
  }

  // Create-specific normalization stays here: JSON mode suppresses human output
  // and forces non-interactive execution after shared flag parsing/defaults.
  let completion;
  try {
    completion = await executeCreateCommand({
      cwd,
      emitOutput: mergedFlags.format !== 'json',
      flags: mergedFlags,
      interactive: mergedFlags.format === 'json' ? false : undefined,
      printLine,
      projectDir,
      warnLine,
    });
  } catch (error) {
    throw createCliCommandError({
      command: 'create',
      error,
    });
  }

  if (mergedFlags.format === 'json') {
    printLine(
      JSON.stringify(
        buildStructuredCompletionSuccessPayload('create', completion, {
          dryRun: Boolean(mergedFlags['dry-run']),
          projectDir: extractCompletionProjectDir(completion) ?? projectDir,
          template:
            typeof mergedFlags.template === 'string'
              ? mergedFlags.template
              : undefined,
        }),
        null,
        2,
      ),
    );
  }
}
