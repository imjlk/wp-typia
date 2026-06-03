import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from '@wp-typia/project-tools/cli-diagnostics';
import {
  defineAddKindRegistryEntry,
  type AddKindExecutionContext,
  PATTERN_CATALOG_VISIBLE_FIELDS,
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
    // Legacy repeatable --tag remains CLI-only; prompt values use comma-separated --tags.
    hiddenStringSubmitFields: ['tag'],
    nameLabel: 'Pattern name',
    async prepareExecution(context) {
      const name = requireAddKindName(context, PATTERN_MISSING_NAME_MESSAGE);
      const rawScope =
        typeof context.flags.scope === 'string' ? context.flags.scope : undefined;
      const rawSectionRole =
        typeof context.flags['section-role'] === 'string'
          ? context.flags['section-role']
          : undefined;
      const rawCatalogTitle =
        typeof context.flags['catalog-title'] === 'string'
          ? context.flags['catalog-title']
          : undefined;
      const rawThumbnailUrl =
        typeof context.flags['thumbnail-url'] === 'string'
          ? context.flags['thumbnail-url']
          : undefined;
      const scope = resolvePatternScopeFlag(context);
      const sectionRole = resolvePatternSectionRoleFlag(context, scope);
      const catalogTitle = rawCatalogTitle;
      const tags =
        normalizePatternTagFlags(context.flags.tags, context.flags.tag);
      const thumbnailUrl = rawThumbnailUrl;

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
        getDryRunSummaryLines: (result: AddPatternResult) =>
          buildPatternCatalogDryRunSummaryLines(result, {
            rawCatalogTitle,
            rawScope,
            rawSectionRole,
            rawTags: tags,
            rawThumbnailUrl,
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
      'wp-typia add pattern <name> [--scope <full|section>] [--section-role <role>] [--catalog-title <title>] [--tags <tag,...>] [--thumbnail-url <url>] [--dry-run]',
    visibleFieldNames: () => PATTERN_CATALOG_VISIBLE_FIELDS,
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

function quoteValue(value: string): string {
  return `"${value}"`;
}

function formatTags(tags: readonly string[]): string {
  return tags.length > 0 ? tags.join(', ') : 'no tags';
}

function collectPatternTagTokens(tags: readonly string[] | undefined): string[] {
  return (tags ?? [])
    .flatMap((tag) => tag.split(','))
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function valuesMatch(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function createNormalizationNote(options: {
  fieldLabel: string;
  rawValue: string | undefined;
  resolvedValue: string | undefined;
}): string | undefined {
  const rawValue = options.rawValue;
  if (
    rawValue === undefined ||
    rawValue.trim().length === 0 ||
    !options.resolvedValue ||
    rawValue === options.resolvedValue
  ) {
    return undefined;
  }

  return `${options.fieldLabel} normalized from ${quoteValue(
    rawValue,
  )} to ${quoteValue(options.resolvedValue)}.`;
}

function collectPatternCatalogNormalizationNotes(
  result: AddPatternResult,
  options: {
    rawCatalogTitle?: string;
    rawScope?: string;
    rawSectionRole?: string;
    rawTags?: readonly string[];
    rawThumbnailUrl?: string;
  },
): string[] {
  const notes = [
    createNormalizationNote({
      fieldLabel: 'Scope',
      rawValue: options.rawScope,
      resolvedValue: result.patternScope,
    }),
    createNormalizationNote({
      fieldLabel: 'Section role',
      rawValue: options.rawSectionRole,
      resolvedValue: result.sectionRole,
    }),
    createNormalizationNote({
      fieldLabel: 'Title',
      rawValue: options.rawCatalogTitle,
      resolvedValue: result.title,
    }),
    createNormalizationNote({
      fieldLabel: 'Thumbnail URL',
      rawValue: options.rawThumbnailUrl,
      resolvedValue: result.thumbnailUrl,
    }),
  ].filter((note): note is string => typeof note === 'string');
  const rawTags = collectPatternTagTokens(options.rawTags);
  if (rawTags.length > 0 && !valuesMatch(rawTags, result.tags)) {
    notes.push(
      `Tags normalized from ${quoteValue(formatTags(rawTags))} to ${quoteValue(
        formatTags(result.tags),
      )}.`,
    );
  }

  return notes;
}

function buildPatternCatalogDryRunSummaryLines(
  result: AddPatternResult,
  options: {
    rawCatalogTitle?: string;
    rawScope?: string;
    rawSectionRole?: string;
    rawTags?: readonly string[];
    rawThumbnailUrl?: string;
  },
): string[] {
  const catalogLines = [
    '',
    'Catalog metadata:',
    `  Scope: ${result.patternScope}`,
    ...(result.sectionRole ? [`  Section role: ${result.sectionRole}`] : []),
    `  Title: ${result.title}`,
    ...(result.tags.length > 0 ? [`  Tags: ${formatTags(result.tags)}`] : []),
    ...(result.thumbnailUrl
      ? [`  Thumbnail URL: ${result.thumbnailUrl}`]
      : []),
  ];
  const normalizationNotes = collectPatternCatalogNormalizationNotes(
    result,
    options,
  );

  if (normalizationNotes.length === 0) {
    return catalogLines;
  }

  return [
    ...catalogLines,
    '',
    'Normalization notes:',
    ...normalizationNotes.map((note) => `  ${note}`),
  ];
}
