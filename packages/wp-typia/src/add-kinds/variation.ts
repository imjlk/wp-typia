import { requireStrictStringFlag } from '../cli-string-flags';
import {
  createNamedExecutionPlan,
  defineAddKindRegistryEntry,
  NAME_BLOCK_VISIBLE_FIELDS,
  requireAddKindName,
  type AddVariationResult,
} from '../add-kind-registry-shared';

const VARIATION_MISSING_NAME_MESSAGE =
  '`wp-typia add variation` requires <name>. Usage: wp-typia add variation <name> --block <block-slug>';

export const variationAddKindEntry =
  defineAddKindRegistryEntry<AddVariationResult>({
    completion: {
      nextSteps: (values) => [
        `Review src/blocks/${values.blockSlug}/variations/${values.variationSlug}.ts.`,
        'Run your workspace build or dev command to pick up the new variation.',
      ],
      summaryLines: (values, projectDir) => [
        `Variation: ${values.variationSlug}`,
        `Target block: ${values.blockSlug}`,
        `Project directory: ${projectDir}`,
      ],
      title: 'Added workspace variation',
    },
    description: 'Add a variation to an existing block',
    nameLabel: 'Variation name',
    async prepareExecution(context) {
      const name = requireAddKindName(context, VARIATION_MISSING_NAME_MESSAGE);
      const blockSlug = requireStrictStringFlag(
        context.flags,
        'block',
        '`wp-typia add variation` requires --block <block-slug>.',
      );

      return createNamedExecutionPlan(context, {
        execute: ({ cwd, name }) =>
          context.addRuntime.runAddVariationCommand({
            blockName: blockSlug,
            cwd,
            variationName: name,
          }),
        getValues: (result) => ({
          blockSlug: result.blockSlug,
          variationSlug: result.variationSlug,
        }),
        missingNameMessage: VARIATION_MISSING_NAME_MESSAGE,
        name,
        warnLine: context.warnLine,
      });
    },
    sortOrder: 30,
    supportsDryRun: true,
    usage: 'wp-typia add variation <name> --block <block-slug> [--dry-run]',
    visibleFieldNames: () => NAME_BLOCK_VISIBLE_FIELDS,
  });
