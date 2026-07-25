import type { ReadlinePrompt } from '@wp-typia/project-tools/cli-prompt';
import { HOOKED_BLOCK_POSITION_IDS } from '@wp-typia/project-tools/hooked-blocks';
import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from '@wp-typia/project-tools/cli-diagnostics';
import {
  type AddFieldName,
  type AddKindExecutionPlan,
  type AddKindExecutionPlanFor,
  type AddKindExecutionContext,
  type AddKindId,
  formatAddKindList,
  getAddKindOptions,
  getAddKindExecutionPlan,
  getAddNameLabel,
  isAddKindId,
  supportsAddKindDryRun,
} from './add-kind-registry';
import {
  formatMissingAddKindDetailLine,
  shouldPrintMissingAddKindHelp,
} from './cli-error-messages';
import { simulateWorkspaceAddDryRun } from './runtime-bridge-add-dry-run';
import type { RuntimeCompletionPayload } from './runtime-output/types';
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

type RequiredPromptableAddFieldName = Extract<
  AddFieldName,
  'anchor' | 'block' | 'from' | 'position' | 'post-type' | 'to'
>;

const REQUIRED_FIELD_PROMPTS_BY_ADD_KIND: Partial<
  Record<AddKindId, readonly RequiredPromptableAddFieldName[]>
> = {
  'core-variation': ['block'],
  'hooked-block': ['anchor', 'position'],
  'post-meta': ['post-type'],
  style: ['block'],
  transform: ['from', 'to'],
  variation: ['block'],
};

const REQUIRED_FIELD_PROMPT_LABELS = {
  anchor: 'Anchor block',
  block: 'Target block',
  from: 'Source block',
  position: 'Hook position',
  'post-type': 'Post type',
  to: 'Target block',
} as const satisfies Record<RequiredPromptableAddFieldName, string>;

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
}): Promise<RuntimeCompletionPayload | void> {
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
): Promise<RuntimeCompletionPayload | void> {
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
): Promise<RuntimeCompletionPayload | void> {
  const plan = await getAddKindExecutionPlan(kind, executionContext);
  return executePreparedAddKind(
    kind,
    context,
    plan as AddKindExecutionPlanFor<TKey> & AddKindExecutionPlan<any>,
  );
}

function contextAllowsInteractivePrompts(flags: Record<string, unknown>): boolean {
  return flags.format !== 'json';
}

function shouldPromptForRequiredAddField(
  flags: Record<string, unknown>,
  fieldName: RequiredPromptableAddFieldName,
): boolean {
  const value = flags[fieldName];
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  );
}

async function promptForRequiredAddFields(options: {
  flags: Record<string, unknown>;
  getOrCreatePrompt: () => Promise<ReadlinePrompt>;
  kind: AddKindId;
}): Promise<void> {
  const requiredFields = REQUIRED_FIELD_PROMPTS_BY_ADD_KIND[options.kind] ?? [];
  for (const fieldName of requiredFields) {
    if (!shouldPromptForRequiredAddField(options.flags, fieldName)) {
      continue;
    }

    const label = REQUIRED_FIELD_PROMPT_LABELS[fieldName];
    const fieldPrompt = await options.getOrCreatePrompt();
    if (fieldName === 'position') {
      options.flags[fieldName] = await fieldPrompt.select(
        label,
        HOOKED_BLOCK_POSITION_IDS.map((position) => ({
          hint: `Insert relative to the anchor block as ${position}`,
          label: position,
          value: position,
        })),
        2,
      );
      continue;
    }

    options.flags[fieldName] = await fieldPrompt.text(label, '', (value) =>
      value.trim().length > 0 ? true : `${label} is required.`,
    );
  }
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
}: AddExecutionInput): Promise<RuntimeCompletionPayload | void> {
  let activePrompt: ReadlinePrompt | undefined;
  const resolvedFlags = { ...flags };
  const dryRun = Boolean(resolvedFlags['dry-run']);

  try {
    const addRuntime = await loadCliAddRuntime();
    const isInteractiveSession = interactive ?? isInteractiveTerminal();
    const getOrCreatePrompt = async () => {
      if (activePrompt) {
        return activePrompt;
      }

      const { createReadlinePrompt } = await loadCliPromptRuntime();
      activePrompt = prompt ?? createReadlinePrompt();
      return activePrompt;
    };
    let resolvedKind = kind;
    let resolvedName = name;

    if (
      !resolvedKind &&
      isInteractiveSession &&
      contextAllowsInteractivePrompts(resolvedFlags)
    ) {
      const kindPrompt = await getOrCreatePrompt();
      resolvedKind = await kindPrompt.select(
        'Select what to add',
        getAddKindOptions().map((option) => ({
          hint: option.description,
          label: option.name,
          value: option.value,
        })),
        1,
      );
    }

    if (!resolvedKind) {
      if (shouldPrintMissingAddKindHelp({ emitOutput })) {
        printLine(addRuntime.formatAddHelpText());
      }
      throw createCliDiagnosticCodeError(
        CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
        formatMissingAddKindDetailLine(),
      );
    }
    if (!isAddKindId(resolvedKind)) {
      throw createCliDiagnosticCodeError(
        CLI_DIAGNOSTIC_CODES.INVALID_COMMAND,
        `Unknown add kind "${resolvedKind}". Expected one of: ${formatAddKindList()}.`,
      );
    }
    if (
      !resolvedName &&
      isInteractiveSession &&
      contextAllowsInteractivePrompts(resolvedFlags)
    ) {
      const namePrompt = await getOrCreatePrompt();
      resolvedName = await namePrompt.text(
        getAddNameLabel(resolvedKind),
        '',
        (value) =>
          value.trim().length > 0
            ? true
            : `${getAddNameLabel(resolvedKind)} is required.`,
      );
    }
    if (
      isInteractiveSession &&
      contextAllowsInteractivePrompts(resolvedFlags)
    ) {
      await promptForRequiredAddFields({
        flags: resolvedFlags,
        getOrCreatePrompt,
        kind: resolvedKind,
      });
    }
    if (dryRun && !supportsAddKindDryRun(resolvedKind)) {
      throw createCliDiagnosticCodeError(
        CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
        `\`wp-typia add ${resolvedKind}\` does not support \`--dry-run\` yet.`,
      );
    }

    const executionContext: AddKindExecutionContext = {
      addRuntime,
      cwd,
      flags: resolvedFlags,
      getOrCreatePrompt,
      isInteractiveSession,
      name: resolvedName,
      positionalArgs,
      warnLine,
    };
    return await executePlannedAddKind(resolvedKind, executionContext, {
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
