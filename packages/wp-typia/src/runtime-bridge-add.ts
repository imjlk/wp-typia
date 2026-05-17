import type { ReadlinePrompt } from '@wp-typia/project-tools/cli-prompt';
import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from '@wp-typia/project-tools/cli-diagnostics';
import {
  type AddKindExecutionPlan,
  type AddKindExecutionPlanFor,
  type AddKindExecutionContext,
  type AddKindId,
  formatAddKindList,
  getAddKindExecutionPlan,
  isAddKindId,
  supportsAddKindDryRun,
} from './add-kind-registry';
import {
  formatMissingAddKindDetailLine,
  shouldPrintMissingAddKindHelp,
} from './cli-error-messages';
import { simulateWorkspaceAddDryRun } from './runtime-bridge-add-dry-run';
import type { AlternateBufferCompletionPayload } from './ui/alternate-buffer-lifecycle';
import {
  buildAddCompletionPayload,
  buildAddDryRunPayload,
} from './runtime-bridge-output';
import { isInteractiveTerminal } from './runtime-capabilities';
import type { PrintLine } from './print-line';
import {
  emitCompletion,
  shouldWrapCliCommandError,
  wrapCliCommandError,
} from './runtime-bridge-shared';

export type AddExecutionInput = {
  cwd: string;
  emitOutput?: boolean;
  flags: Record<string, unknown>;
  interactive?: boolean;
  kind?: string;
  name?: string;
  positionalArgs?: readonly string[];
  printLine?: PrintLine;
  prompt?: ReadlinePrompt;
  warnLine?: PrintLine;
};

const loadCliAddRuntime = () => import('@wp-typia/project-tools/cli-add');
const loadCliPromptRuntime = () => import('@wp-typia/project-tools/cli-prompt');
const loadWorkspaceProjectRuntime = () =>
  import('@wp-typia/project-tools/workspace-project');

async function executeWorkspaceAddWithOptionalDryRun<TResult>(options: {
  buildCompletion: (
    result: TResult,
  ) => ReturnType<typeof buildAddCompletionPayload>;
  buildDryRunSummaryLines?: (result: TResult) => string[] | undefined;
  cwd: string;
  dryRun: boolean;
  emitOutput: boolean | undefined;
  execute: (cwd: string) => Promise<TResult>;
  printLine: PrintLine;
  warnLine?: PrintLine;
}): Promise<AlternateBufferCompletionPayload | void> {
  const simulated = options.dryRun
    ? await simulateWorkspaceAddDryRun({
        cwd: options.cwd,
        execute: options.execute,
      })
    : null;
  const result = simulated?.result ?? (await options.execute(options.cwd));
  const completion = options.buildCompletion(result);

  if (!options.dryRun) {
    return emitCompletion(completion, {
      emitOutput: options.emitOutput ?? true,
      printLine: options.printLine,
      warnLine: options.warnLine,
    });
  }

  return emitCompletion(
    buildAddDryRunPayload({
      completion,
      fileOperations: simulated!.fileOperations,
      summaryLines: options.buildDryRunSummaryLines?.(result),
    }),
    {
      emitOutput: options.emitOutput ?? true,
      printLine: options.printLine,
      warnLine: options.warnLine,
    },
  );
}

function executePreparedAddKind<TKey extends AddKindId>(
  kind: TKey,
  context: {
    cwd: string;
    dryRun: boolean;
    emitOutput: boolean | undefined;
    printLine: PrintLine;
  },
  plan: AddKindExecutionPlan<any>,
): Promise<AlternateBufferCompletionPayload | void> {
  return executeWorkspaceAddWithOptionalDryRun({
    buildCompletion: (result) =>
      buildAddCompletionPayload({
        kind,
        projectDir: result.projectDir,
        values: plan.getValues(result),
        warnings: plan.getWarnings?.(result),
      }),
    buildDryRunSummaryLines: (result) => plan.getDryRunSummaryLines?.(result),
    cwd: context.cwd,
    dryRun: context.dryRun,
    emitOutput: context.emitOutput,
    execute: plan.execute,
    printLine: context.printLine,
    warnLine: plan.warnLine,
  });
}

async function executePlannedAddKind<TKey extends AddKindId>(
  kind: TKey,
  executionContext: AddKindExecutionContext,
  context: {
    cwd: string;
    dryRun: boolean;
    emitOutput: boolean | undefined;
    printLine: PrintLine;
  },
): Promise<AlternateBufferCompletionPayload | void> {
  const plan = await getAddKindExecutionPlan(kind, executionContext);
  return executePreparedAddKind(
    kind,
    context,
    plan as AddKindExecutionPlanFor<TKey> & AddKindExecutionPlan<any>,
  );
}

export async function executeAddCommand({
  cwd,
  emitOutput = true,
  flags,
  interactive,
  kind,
  name,
  positionalArgs,
  printLine = console.log as PrintLine,
  prompt,
  warnLine = console.warn as PrintLine,
}: AddExecutionInput): Promise<AlternateBufferCompletionPayload | void> {
  let activePrompt: ReadlinePrompt | undefined;
  const dryRun = Boolean(flags['dry-run']);

  try {
    const addRuntime = await loadCliAddRuntime();
    const isInteractiveSession = interactive ?? isInteractiveTerminal();

    if (!kind) {
      if (shouldPrintMissingAddKindHelp({ emitOutput })) {
        printLine(addRuntime.formatAddHelpText());
      }
      throw createCliDiagnosticCodeError(
        CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
        formatMissingAddKindDetailLine(),
      );
    }
    if (!isAddKindId(kind)) {
      throw createCliDiagnosticCodeError(
        CLI_DIAGNOSTIC_CODES.INVALID_COMMAND,
        `Unknown add kind "${kind}". Expected one of: ${formatAddKindList()}.`,
      );
    }
    if (dryRun && !supportsAddKindDryRun(kind)) {
      throw createCliDiagnosticCodeError(
        CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
        `\`wp-typia add ${kind}\` does not support \`--dry-run\` yet.`,
      );
    }

    const executionContext: AddKindExecutionContext = {
      addRuntime,
      cwd,
      flags,
      getOrCreatePrompt: async () => {
        if (activePrompt) {
          return activePrompt;
        }

        const { createReadlinePrompt } = await loadCliPromptRuntime();
        activePrompt = prompt ?? createReadlinePrompt();
        return activePrompt;
      },
      isInteractiveSession,
      name,
      positionalArgs,
      warnLine,
    };
    return await executePlannedAddKind(kind, executionContext, {
      cwd,
      dryRun,
      emitOutput,
      printLine,
    });
  } catch (error) {
    if (!shouldWrapCliCommandError({ emitOutput })) {
      throw error;
    }
    throw await wrapCliCommandError('add', error);
  } finally {
    if (activePrompt && activePrompt !== prompt) {
      activePrompt.close();
    }
  }
}

export async function loadAddWorkspaceBlockOptions(cwd: string) {
  const { tryResolveWorkspaceProject } = await loadWorkspaceProjectRuntime();
  const workspace = tryResolveWorkspaceProject(cwd);
  if (!workspace) {
    return [];
  }

  const { getWorkspaceBlockSelectOptionsAsync } = await loadCliAddRuntime();
  return getWorkspaceBlockSelectOptionsAsync(workspace.projectDir);
}
