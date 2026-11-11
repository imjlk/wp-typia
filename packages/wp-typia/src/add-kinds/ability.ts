import { readOptionalStrictStringFlag } from '../cli-string-flags';
import {
  createNamedExecutionPlan,
  defineAddKindRegistryEntry,
  NAME_ONLY_VISIBLE_FIELDS,
  type AddAbilityResult,
} from '../add-kind-registry-shared';

const ABILITY_MISSING_NAME_MESSAGE =
  '`wp-typia add ability` requires <name>. Usage: wp-typia add ability <name>.';

export const abilityAddKindEntry =
  defineAddKindRegistryEntry<AddAbilityResult>({
    completion: {
      nextSteps: (values) => [
        `Review src/abilities/${values.abilitySlug}/ and inc/abilities/${values.abilitySlug}.php.`,
        'Run `wp-typia sync` or `npm run sync-abilities -- --check` and then your workspace build/dev command to verify the generated workflow ability.',
      ],
      summaryLines: (values, projectDir) => [
        `Ability: ${values.abilitySlug}`,
        `Category: ${values.categorySlug}`,
        `MCP public: ${values.publicMcp}`,
        `Project directory: ${projectDir}`,
      ],
      title: 'Added workflow ability',
    },
    description: 'Add a typed server/client workflow ability scaffold',
    nameLabel: 'Ability name',
    async prepareExecution(context) {
      const categorySlug = readOptionalStrictStringFlag(context.flags, 'category');
      const publicMcp = Boolean(context.flags.public);

      return createNamedExecutionPlan(context, {
        execute: ({ cwd, name }) =>
          context.addRuntime.runAddAbilityCommand({
            abilityName: name,
            ...(categorySlug ? { categorySlug } : {}),
            cwd,
            publicMcp,
          }),
        getValues: (result) => ({
          abilitySlug: result.abilitySlug,
          categorySlug: result.categorySlug,
          publicMcp: String(result.publicMcp),
        }),
        getWarnings: (result) => result.warnings,
        missingNameMessage: ABILITY_MISSING_NAME_MESSAGE,
        warnLine: context.warnLine,
      });
    },
    sortOrder: 90,
    hiddenBooleanSubmitFields: ['public'],
    hiddenStringSubmitFields: ['category'],
    supportsDryRun: true,
    usage:
      'wp-typia add ability <name> [--category <slug>] [--public] [--dry-run]',
    visibleFieldNames: () => NAME_ONLY_VISIBLE_FIELDS,
  });
