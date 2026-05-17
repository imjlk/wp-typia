import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from '@wp-typia/project-tools/cli-diagnostics';
import {
  defineAddKindRegistryEntry,
  type AddKindExecutionContext,
  NAME_ONLY_VISIBLE_FIELDS,
  requireAddKindName,
  type AddPatternResult,
} from '../add-kind-registry-shared';
import { readOptionalLooseStringFlag } from '../cli-string-flags';

const PATTERN_MISSING_NAME_MESSAGE =
  '`wp-typia add pattern` requires <name>. Usage: wp-typia add pattern <name>.';

export const patternAddKindEntry =
  defineAddKindRegistryEntry<AddPatternResult>({
    completion: {
      nextSteps: (values) => [
        `Review ${values.contentFile}.`,
        'Run your workspace build or dev command to verify the new pattern registration.',
      ],
      summaryLines: (values, projectDir) => [
        `Pattern: ${values.patternSlug}`,
        `Content file: ${values.contentFile}`,
        `Project directory: ${projectDir}`,
      ],
      title: 'Added workspace pattern',
    },
    description: 'Add a PHP block pattern shell',
    hiddenStringSubmitFields: [
      'catalog-title',
      'scope',
      'section-role',
      'tag',
      'tags',
      'thumbnail-url',
    ],
    nameLabel: 'Pattern name',
    async prepareExecution(context) {
      const name = requireAddKindName(context, PATTERN_MISSING_NAME_MESSAGE);
      const scope = resolvePatternScopeFlag(context);
      const sectionRole = resolvePatternSectionRoleFlag(context, scope);
      const catalogTitle =
        typeof context.flags['catalog-title'] === 'string'
          ? context.flags['catalog-title']
          : undefined;
      const tags =
        normalizePatternTagFlags(context.flags.tags, context.flags.tag);
      const thumbnailUrl =
        typeof context.flags['thumbnail-url'] === 'string'
          ? context.flags['thumbnail-url']
          : undefined;

      return {
        execute: (cwd) =>
          context.addRuntime.runAddPatternCommand({
            catalogTitle,
            cwd,
            patternScope: scope,
            patternName: name,
            sectionRole,
            tags,
            thumbnailUrl,
          }),
        getValues: (result: AddPatternResult) => ({
          contentFile: result.contentFile,
          patternSlug: result.patternSlug,
          patternScope: result.patternScope,
          ...(result.sectionRole ? { sectionRole: result.sectionRole } : {}),
        }),
        warnLine: context.warnLine,
      };
    },
    sortOrder: 60,
    supportsDryRun: true,
    usage:
      'wp-typia add pattern <name> [--scope <full|section>] [--section-role <role>] [--catalog-title <title>] [--tags <tag,...>] [--tag <tag>...] [--thumbnail-url <url>] [--dry-run]',
    visibleFieldNames: () => NAME_ONLY_VISIBLE_FIELDS,
  });

function createInvalidPatternArgumentError(message: string) {
  return createCliDiagnosticCodeError(
    CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
    message,
  );
}

function createMissingPatternArgumentError(message: string) {
  return createCliDiagnosticCodeError(
    CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
    message,
  );
}

function resolvePatternScopeFlag(
  context: AddKindExecutionContext,
): string | undefined {
  const scope = readOptionalLooseStringFlag(context.flags, 'scope');
  if (!scope) {
    return undefined;
  }
  if (
    (context.addRuntime.PATTERN_CATALOG_SCOPE_IDS as readonly string[]).includes(
      scope,
    )
  ) {
    return scope;
  }
  throw createInvalidPatternArgumentError(
    `\`--scope\` must be one of: ${context.addRuntime.PATTERN_CATALOG_SCOPE_IDS.join(
      ', ',
    )}. Usage: wp-typia add pattern <name> --scope <full|section>.`,
  );
}

function resolvePatternSectionRoleFlag(
  context: AddKindExecutionContext,
  scope: string | undefined,
): string | undefined {
  const sectionRole = readOptionalLooseStringFlag(
    context.flags,
    'section-role',
  );
  if (scope === 'section' && sectionRole === undefined) {
    throw createMissingPatternArgumentError(
      '`wp-typia add pattern --scope section` requires --section-role <role> because section-scoped patterns need a typed catalog section role.',
    );
  }
  if (scope !== 'section' && sectionRole !== undefined) {
    throw createInvalidPatternArgumentError(
      '`--section-role` only applies with `--scope section`. Use `--scope section --section-role <role>` or omit `--section-role` for full patterns.',
    );
  }
  const normalizedSectionRole =
    sectionRole === undefined
      ? undefined
      : context.addRuntime.normalizeBlockSlug(sectionRole);
  if (
    normalizedSectionRole &&
    !context.addRuntime.PATTERN_SECTION_ROLE_PATTERN.test(
      normalizedSectionRole,
    )
  ) {
    throw createInvalidPatternArgumentError(
      '`--section-role` must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens. Section roles apply only with `--scope section`.',
    );
  }
  if (sectionRole !== undefined && !normalizedSectionRole) {
    throw createInvalidPatternArgumentError(
      '`--section-role` must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens. Section roles apply only with `--scope section`.',
    );
  }

  return normalizedSectionRole;
}

function collectStringFlagValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

function normalizePatternTagFlags(
  tagsFlag: unknown,
  tagFlag: unknown,
): string[] | undefined {
  const tags = [
    ...collectStringFlagValues(tagsFlag),
    ...collectStringFlagValues(tagFlag),
  ];
  return tags.length > 0 ? tags : undefined;
}
