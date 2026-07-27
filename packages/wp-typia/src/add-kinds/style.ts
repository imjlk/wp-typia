import { requireStrictStringFlag } from '../cli-string-flags';
import {
  createNamedExecutionPlan,
  defineAddKindRegistryEntry,
  NAME_BLOCK_VISIBLE_FIELDS,
  requireAddKindName,
  type AddBlockStyleResult,
} from '../add-kind-registry-shared';

const STYLE_MISSING_NAME_MESSAGE =
  '`wp-typia add style` requires <name>. Usage: wp-typia add style <name> --block <block-slug>.';

export const styleAddKindEntry =
  defineAddKindRegistryEntry<AddBlockStyleResult>({
    completion: {
      nextSteps: (values) => [
        `Review src/blocks/${values.blockSlug}/styles/${values.styleSlug}.ts.`,
        'Run your workspace build or dev command to verify the new block style registration.',
      ],
      summaryLines: (values, projectDir) => [
        `Block style: ${values.styleSlug}`,
        `Target block: ${values.blockSlug}`,
        `Project directory: ${projectDir}`,
      ],
      title: 'Added block style',
    },
    description: 'Add a Block Styles registration to an existing block',
    nameLabel: 'Style name',
    async prepareExecution(context) {
      const name = requireAddKindName(context, STYLE_MISSING_NAME_MESSAGE);
      const blockSlug = requireStrictStringFlag(
        context.flags,
        'block',
        '`wp-typia add style` requires --block <block-slug>.',
      );

      return createNamedExecutionPlan(context, {
        execute: ({ cwd, name }) =>
          context.addRuntime.runAddBlockStyleCommand({
            blockName: blockSlug,
            cwd,
            styleName: name,
          }),
        getValues: (result) => ({
          blockSlug: result.blockSlug,
          styleSlug: result.styleSlug,
        }),
        missingNameMessage: STYLE_MISSING_NAME_MESSAGE,
        name,
        warnLine: context.warnLine,
      });
    },
    sortOrder: 40,
    supportsDryRun: true,
    usage: 'wp-typia add style <name> --block <block-slug> [--dry-run]',
    visibleFieldNames: () => NAME_BLOCK_VISIBLE_FIELDS,
  });
