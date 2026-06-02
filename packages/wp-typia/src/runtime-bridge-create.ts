import type { ReadlinePrompt } from '@wp-typia/project-tools/cli-prompt';
import type { RuntimeCompletionPayload } from './runtime-output/types';
import {
  buildCreateCompletionPayload,
  buildCreateDryRunPayload,
  type CreateProgressPayload,
  formatCreateProgressLine,
  toExternalLayerPromptOptions,
} from './runtime-bridge-output';
import { isInteractiveTerminal } from './runtime-capabilities';
import { readOptionalLooseStringFlag } from './cli-string-flags';
import type { PrintLine } from './print-line';
import {
  emitCompletion,
  shouldWrapCliCommandError,
  wrapCliCommandError,
} from './runtime-bridge-shared';

export type CreateExecutionInput = {
  projectDir: string;
  cwd: string;
  emitOutput?: boolean;
  flags: Record<string, unknown>;
  interactive?: boolean;
  onProgress?: (payload: CreateProgressPayload) => void;
  printLine?: PrintLine;
  prompt?: ReadlinePrompt;
  warnLine?: PrintLine;
};

const loadCliPromptRuntime = () => import('@wp-typia/project-tools/cli-prompt');
const loadCliScaffoldRuntime = () =>
  import('@wp-typia/project-tools/cli-scaffold');
const loadCliTemplatesRuntime = () =>
  import('@wp-typia/project-tools/cli-templates');
const loadCreateTemplateValidationRuntime = () =>
  import('@wp-typia/project-tools/create-template-validation');

const PACKAGE_MANAGER_PROMPT_OPTIONS = [
  { label: 'npm', value: 'npm', hint: 'Use npm' },
  { label: 'pnpm', value: 'pnpm', hint: 'Use pnpm' },
  { label: 'yarn', value: 'yarn', hint: 'Use yarn' },
  { label: 'bun', value: 'bun', hint: 'Use bun' },
] as const;

const DATA_STORAGE_PROMPT_OPTIONS = [
  {
    label: 'custom-table',
    value: 'custom-table',
    hint: 'Dedicated custom table storage',
  },
  { label: 'post-meta', value: 'post-meta', hint: 'Persist through post meta' },
] as const;

const PERSISTENCE_POLICY_PROMPT_OPTIONS = [
  {
    label: 'authenticated',
    value: 'authenticated',
    hint: 'Authenticated write policy',
  },
  { label: 'public', value: 'public', hint: 'Public token policy' },
] as const;

const BOOLEAN_PROMPT_OPTIONS = [
  { label: 'Yes', value: 'yes', hint: 'Enable this option' },
  { label: 'No', value: 'no', hint: 'Keep the default disabled state' },
] as const;

export async function executeCreateCommand({
  projectDir,
  cwd,
  emitOutput = true,
  flags,
  interactive,
  onProgress,
  printLine = console.log as PrintLine,
  prompt,
  warnLine = console.warn as PrintLine,
}: CreateExecutionInput): Promise<RuntimeCompletionPayload> {
  let activePrompt: ReadlinePrompt | undefined;

  try {
    const requestedTemplateId = readOptionalLooseStringFlag(flags, 'template');
    const resolvedTemplateId = requestedTemplateId
      ? (
          await loadCreateTemplateValidationRuntime()
        ).validateExplicitCreateTemplateId(requestedTemplateId)
      : undefined;
    const [
      { createReadlinePrompt },
      { runScaffoldFlow },
      { getTemplateSelectOptions },
    ] = await Promise.all([
      loadCliPromptRuntime(),
      loadCliScaffoldRuntime(),
      loadCliTemplatesRuntime(),
    ]);
    const shouldPrompt =
      interactive ?? (!Boolean(flags.yes) && isInteractiveTerminal());
    activePrompt = shouldPrompt
      ? (prompt ?? createReadlinePrompt())
      : undefined;
    const scaffoldPrompt = activePrompt;
    const shouldPromptForExternalLayerSelection =
      Boolean(scaffoldPrompt) && scaffoldPrompt !== prompt;
    const effectiveYes =
      Boolean(flags.yes) ||
      (Boolean(flags['dry-run']) && !Boolean(scaffoldPrompt));

    const flow = await runScaffoldFlow({
      alternateRenderTargets: readOptionalLooseStringFlag(
        flags,
        'alternate-render-targets',
      ),
      cwd,
      dataStorageMode: readOptionalLooseStringFlag(flags, 'data-storage'),
      dryRun: Boolean(flags['dry-run']),
      externalLayerId: readOptionalLooseStringFlag(flags, 'external-layer-id'),
      externalLayerSource: readOptionalLooseStringFlag(
        flags,
        'external-layer-source',
      ),
      innerBlocksPreset: readOptionalLooseStringFlag(
        flags,
        'inner-blocks-preset',
      ),
      isInteractive: Boolean(scaffoldPrompt),
      namespace: readOptionalLooseStringFlag(flags, 'namespace'),
      noInstall: Boolean(flags['no-install']),
      packageManager: readOptionalLooseStringFlag(flags, 'package-manager'),
      persistencePolicy: readOptionalLooseStringFlag(
        flags,
        'persistence-policy',
      ),
      phpPrefix: readOptionalLooseStringFlag(flags, 'php-prefix'),
      profile: readOptionalLooseStringFlag(flags, 'profile'),
      projectInput: projectDir,
      onProgress: async (progress) => {
        const payload = {
          detail: progress.detail,
          title: progress.title,
        };
        onProgress?.(payload);
        if (emitOutput) {
          printLine(formatCreateProgressLine(payload));
        }
      },
      promptText: scaffoldPrompt
        ? (message, defaultValue, validate) =>
            scaffoldPrompt.text(message, defaultValue, validate)
        : undefined,
      queryPostType: readOptionalLooseStringFlag(flags, 'query-post-type'),
      selectDataStorage: scaffoldPrompt
        ? () =>
            scaffoldPrompt.select(
              'Select a data storage mode',
              [...DATA_STORAGE_PROMPT_OPTIONS],
              1,
            )
        : undefined,
      selectExternalLayerId:
        shouldPromptForExternalLayerSelection && scaffoldPrompt
          ? (options) =>
              scaffoldPrompt.select(
                'Select an external layer',
                toExternalLayerPromptOptions(options),
                1,
              )
          : undefined,
      selectPackageManager: scaffoldPrompt
        ? () =>
            scaffoldPrompt.select(
              'Select a package manager',
              [...PACKAGE_MANAGER_PROMPT_OPTIONS],
              1,
            )
        : undefined,
      selectPersistencePolicy: scaffoldPrompt
        ? () =>
            scaffoldPrompt.select(
              'Select a persistence policy',
              [...PERSISTENCE_POLICY_PROMPT_OPTIONS],
              1,
            )
        : undefined,
      selectTemplate: scaffoldPrompt
        ? () =>
            scaffoldPrompt.select(
              'Select a template',
              getTemplateSelectOptions(),
              1,
            )
        : undefined,
      selectWithMigrationUi: scaffoldPrompt
        ? async () =>
            (await scaffoldPrompt.select(
              'Enable migration UI support?',
              [...BOOLEAN_PROMPT_OPTIONS],
              2,
            )) === 'yes'
        : undefined,
      selectWithTestPreset: scaffoldPrompt
        ? async () =>
            (await scaffoldPrompt.select(
              'Include the Playwright test preset?',
              [...BOOLEAN_PROMPT_OPTIONS],
              2,
            )) === 'yes'
        : undefined,
      selectWithWpEnv: scaffoldPrompt
        ? async () =>
            (await scaffoldPrompt.select(
              'Include a local wp-env preset?',
              [...BOOLEAN_PROMPT_OPTIONS],
              2,
            )) === 'yes'
        : undefined,
      templateId: resolvedTemplateId,
      textDomain: readOptionalLooseStringFlag(flags, 'text-domain'),
      variant: readOptionalLooseStringFlag(flags, 'variant'),
      withMigrationUi: flags['with-migration-ui'] as boolean | undefined,
      withTestPreset: flags['with-test-preset'] as boolean | undefined,
      withWpEnv: flags['with-wp-env'] as boolean | undefined,
      yes: effectiveYes,
    });

    const payload =
      flow.dryRun && flow.plan
        ? buildCreateDryRunPayload({
            packageManager: flow.packageManager,
            plan: flow.plan,
            projectDir: flow.projectDir,
            result: flow.result,
          })
        : buildCreateCompletionPayload(flow);
    return emitCompletion(payload, { emitOutput, printLine, warnLine });
  } catch (error) {
    if (!shouldWrapCliCommandError({ emitOutput })) {
      throw error;
    }
    throw await wrapCliCommandError('create', error);
  } finally {
    if (activePrompt && activePrompt !== prompt) {
      activePrompt.close();
    }
  }
}
