import path from 'node:path';
import {
  buildInitCompletionPayload,
  printCompletionPayload,
} from './runtime-bridge-output';
import type { PrintLine } from './print-line';
import {
  shouldWrapCliCommandError,
  wrapCliCommandError,
} from './runtime-bridge-shared';

export type InitExecutionInput = {
  apply?: boolean;
  cwd: string;
  packageManager?: string;
  projectDir?: string;
};

const loadCliInitRuntime = () => import('@wp-typia/project-tools/cli-init');

export async function executeInitCommand(
  { apply, cwd, packageManager, projectDir }: InitExecutionInput,
  options: {
    emitOutput?: boolean;
    printLine?: PrintLine;
    warnLine?: PrintLine;
  } = {},
) {
  try {
    const { runInitCommand } = await loadCliInitRuntime();
    const resolvedProjectDir = projectDir ? path.resolve(cwd, projectDir) : cwd;
    const plan = await runInitCommand({
      apply,
      packageManager,
      projectDir: resolvedProjectDir,
    });
    const completion = buildInitCompletionPayload(plan);

    if (options.emitOutput ?? true) {
      printCompletionPayload(completion, {
        printLine: options.printLine,
        warnLine: options.warnLine,
      });
    }

    return plan;
  } catch (error) {
    if (!shouldWrapCliCommandError({ emitOutput: options.emitOutput })) {
      throw error;
    }
    throw await wrapCliCommandError('init', error);
  }
}
