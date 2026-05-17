import { readOptionalStrictStringFlag } from '../cli-string-flags';
import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from '@wp-typia/project-tools/cli-diagnostics';
import {
  createNamedExecutionPlan,
  defineAddKindRegistryEntry,
  NAME_BLOCK_VISIBLE_FIELDS,
  requireAddKindName,
  type AddCoreVariationResult,
  type AddKindExecutionContext,
} from '../add-kind-registry-shared';

const CORE_VARIATION_MISSING_NAME_MESSAGE =
  '`wp-typia add core-variation` requires <name>. Usage: wp-typia add core-variation <block-name> <name> or wp-typia add core-variation <name> --block <namespace/block>.';

const CORE_VARIATION_MISSING_BLOCK_MESSAGE =
  '`wp-typia add core-variation` requires <block-name>. Usage: wp-typia add core-variation <block-name> <name> or wp-typia add core-variation <name> --block <namespace/block>.';

function formatCoreVariationMissingPositionalNameMessage(
  blockName: string,
): string {
  return [
    `\`wp-typia add core-variation ${blockName}\` is missing <name>.`,
    'Usage: wp-typia add core-variation <block-name> <name>',
    'Alternative: wp-typia add core-variation <name> --block <block-name>',
  ].join('\n');
}

function resolveCoreVariationInputs(context: AddKindExecutionContext): {
  targetBlockName: string;
  variationName: string;
} {
  const positionalTargetBlockName = context.positionalArgs?.[1];
  const positionalVariationName = context.positionalArgs?.[2];

  if (positionalVariationName) {
    if (!positionalTargetBlockName) {
      throw createCliDiagnosticCodeError(
        CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
        CORE_VARIATION_MISSING_BLOCK_MESSAGE,
      );
    }

    return {
      targetBlockName: positionalTargetBlockName,
      variationName: positionalVariationName,
    };
  }

  const targetBlockFlag = readOptionalStrictStringFlag(context.flags, 'block');
  const missingPositionalNameTarget =
    context.name !== undefined &&
    positionalTargetBlockName === context.name &&
    context.name.includes('/')
      ? context.name
      : undefined;

  if (missingPositionalNameTarget && !targetBlockFlag) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
      formatCoreVariationMissingPositionalNameMessage(
        missingPositionalNameTarget,
      ),
    );
  }

  const variationName = requireAddKindName(
    context,
    CORE_VARIATION_MISSING_NAME_MESSAGE,
  );
  if (!targetBlockFlag) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
      CORE_VARIATION_MISSING_BLOCK_MESSAGE,
    );
  }

  return {
    targetBlockName: targetBlockFlag,
    variationName,
  };
}

export const coreVariationAddKindEntry =
  defineAddKindRegistryEntry<AddCoreVariationResult>({
    completion: {
      nextSteps: (values) => [
        `Review ${values.variationFile}.`,
        'Run your workspace build or dev command to verify the editor-side variation registration.',
      ],
      summaryLines: (values, projectDir) => [
        `Core variation: ${values.variationSlug}`,
        `Target block: ${values.targetBlockName}`,
        `Project directory: ${projectDir}`,
      ],
      title: 'Added core block variation',
    },
    description: 'Add an editor-side variation for an existing core or external block',
    nameLabel: 'Variation name',
    async prepareExecution(context) {
      const { targetBlockName, variationName } =
        resolveCoreVariationInputs(context);

      return createNamedExecutionPlan(context, {
        execute: ({ cwd, name }) =>
          context.addRuntime.runAddCoreVariationCommand({
            cwd,
            targetBlockName,
            variationName: name,
          }),
        getValues: (result) => ({
          targetBlockName: result.targetBlockName,
          variationFile: result.variationFile,
          variationSlug: result.variationSlug,
        }),
        getWarnings: (result) => result.warnings,
        missingNameMessage: CORE_VARIATION_MISSING_NAME_MESSAGE,
        name: variationName,
        warnLine: context.warnLine,
      });
    },
    sortOrder: 25,
    supportsDryRun: true,
    usage:
      'wp-typia add core-variation <block-name> <name> [--dry-run]\nAlias: wp-typia add core-variation <name> --block <namespace/block> [--dry-run]',
    visibleFieldNames: () => NAME_BLOCK_VISIBLE_FIELDS,
  });
