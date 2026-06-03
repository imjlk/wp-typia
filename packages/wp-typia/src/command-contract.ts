import path from 'node:path';
import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from '@wp-typia/project-tools/cli-diagnostics';
import {
  collectPositionalIndexes,
  findFirstPositionalIndex,
} from '../bin/argv-walker.js';
import {
  ALL_COMMAND_OPTION_METADATA,
  buildCommandOptionParser,
  collectOptionNamesByType,
  COMMAND_OPTION_METADATA_BY_GROUP,
  COMMAND_ROUTING_METADATA,
  GLOBAL_OPTION_METADATA,
  createMissingOptionValueError,
} from './command-option-metadata';
export {
  WP_TYPIA_CANONICAL_CREATE_USAGE,
  WP_TYPIA_CANONICAL_MIGRATE_USAGE,
  WP_TYPIA_DEPRECATED_MIGRATIONS_USAGE,
  WP_TYPIA_FUTURE_COMMAND_TREE,
  WP_TYPIA_PORTABLE_CLI_TOP_LEVEL_COMMAND_NAMES,
  WP_TYPIA_POSITIONAL_ALIAS_USAGE,
  WP_TYPIA_RESERVED_TOP_LEVEL_COMMAND_NAMES,
  WP_TYPIA_TOP_LEVEL_COMMAND_NAMES,
} from './command-registry';
import {
  WP_TYPIA_COMMAND_OPTION_GROUP_NAMES_BY_TOP_LEVEL_COMMAND,
  WP_TYPIA_CANONICAL_CREATE_USAGE,
  WP_TYPIA_RESERVED_TOP_LEVEL_COMMAND_NAMES,
  type WpTypiaReservedTopLevelCommandName,
} from './command-registry';

const SHARED_OPTION_PARSER = buildCommandOptionParser(
  ALL_COMMAND_OPTION_METADATA,
);

const STRING_OPTION_NAMES_BY_GROUP = Object.fromEntries(
  Object.entries(COMMAND_OPTION_METADATA_BY_GROUP).map(
    ([groupName, metadata]) => [
      groupName,
      new Set(collectOptionNamesByType(metadata, 'string')),
    ],
  ),
) as {
  [GroupName in keyof typeof COMMAND_OPTION_METADATA_BY_GROUP]: Set<string>;
};

const STRING_OPTION_NAMES_BY_COMMAND = Object.fromEntries(
  WP_TYPIA_RESERVED_TOP_LEVEL_COMMAND_NAMES.map((commandName) => [
    commandName,
    new Set(
      WP_TYPIA_COMMAND_OPTION_GROUP_NAMES_BY_TOP_LEVEL_COMMAND[
        commandName
      ].flatMap((groupName) =>
        Array.from(STRING_OPTION_NAMES_BY_GROUP[groupName]),
      ),
    ),
  ]),
) as Record<WpTypiaReservedTopLevelCommandName, Set<string>>;

const GLOBAL_STRING_OPTION_NAMES = new Set(
  collectOptionNamesByType(GLOBAL_OPTION_METADATA, 'string'),
);

const SHORT_OPTION_NAMES_WITH_VALUES = new Set<string>(
  [...SHARED_OPTION_PARSER.shortFlagMap.entries()]
    .filter(([, option]) => option.type === 'string')
    .map(([short]) => short),
);

export function isReservedTopLevelCommandName(value: string): boolean {
  return WP_TYPIA_RESERVED_TOP_LEVEL_COMMAND_NAMES.includes(
    value as (typeof WP_TYPIA_RESERVED_TOP_LEVEL_COMMAND_NAMES)[number],
  );
}

function getLongOptionName(arg: string): string {
  return arg.slice(2).split('=', 1)[0] ?? '';
}

function hasUnknownOptionBefore(argv: string[], endIndex: number): boolean {
  for (let index = 0; index < endIndex; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      return false;
    }
    if (!arg.startsWith('-') || arg === '-') {
      continue;
    }

    if (arg.startsWith('--')) {
      const optionName = getLongOptionName(arg);
      if (
        !SHARED_OPTION_PARSER.booleanOptionNames.has(optionName) &&
        !SHARED_OPTION_PARSER.stringOptionNames.has(optionName)
      ) {
        return true;
      }
      if (
        !arg.includes('=') &&
        SHARED_OPTION_PARSER.stringOptionNames.has(optionName) &&
        argv[index + 1] &&
        !argv[index + 1].startsWith('-')
      ) {
        index += 1;
      }
      continue;
    }

    if (arg.length === 2) {
      const option = SHARED_OPTION_PARSER.shortFlagMap.get(arg.slice(1));
      if (!option) {
        return true;
      }
      if (
        option.type === 'string' &&
        argv[index + 1] &&
        !argv[index + 1].startsWith('-')
      ) {
        index += 1;
      }
      continue;
    }

    return true;
  }

  return false;
}

function getEditDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    current[0] = leftIndex + 1;

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex] === right[rightIndex] ? 0 : 1;
      current[rightIndex + 1] = Math.min(
        current[rightIndex] + 1,
        previous[rightIndex + 1] + 1,
        previous[rightIndex] + substitutionCost,
      );
    }

    for (let index = 0; index < current.length; index += 1) {
      previous[index] = current[index] as number;
    }
  }

  return previous[right.length] as number;
}

function isEdgeInsertionOrDeletionTypo(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) !== 1) {
    return false;
  }

  const [shorter, longer] =
    left.length < right.length ? [left, right] : [right, left];

  return longer.startsWith(shorter) || longer.endsWith(shorter);
}

function suggestTopLevelCommandTypo(
  value: string,
): WpTypiaReservedTopLevelCommandName | null {
  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue.length < 4) {
    return null;
  }

  let bestCandidate: {
    command: WpTypiaReservedTopLevelCommandName;
    distance: number;
  } | null = null;

  for (const command of WP_TYPIA_RESERVED_TOP_LEVEL_COMMAND_NAMES) {
    const normalizedCommand = command.toLowerCase();
    const distance = getEditDistance(normalizedValue, normalizedCommand);
    if (distance > 2) {
      continue;
    }
    if (
      distance === 1 &&
      isEdgeInsertionOrDeletionTypo(normalizedValue, normalizedCommand)
    ) {
      continue;
    }
    if (
      distance > 1 &&
      normalizedValue[0] !== normalizedCommand[0]
    ) {
      continue;
    }
    if (bestCandidate === null || distance < bestCandidate.distance) {
      bestCandidate = { command, distance };
    }
  }

  return bestCandidate?.command ?? null;
}

function assertNoLikelyTopLevelCommandTypo(value: string): void {
  const suggestion = suggestTopLevelCommandTypo(value);
  if (!suggestion) {
    return;
  }

  throw createCliDiagnosticCodeError(
    CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
    `Unknown top-level command "${value}". Did you mean "${suggestion}"? If you meant to create a project named "${value}", run \`${WP_TYPIA_CANONICAL_CREATE_USAGE.replace('<project-dir>', value)}\`.`,
  );
}

export function resolveCanonicalCommandContext(argv: string[]): string {
  const positionalIndexes = collectPositionalIndexes(
    argv,
    COMMAND_ROUTING_METADATA,
  );
  const firstPositionalIndex = positionalIndexes[0] ?? -1;
  if (firstPositionalIndex === -1) {
    return 'wp-typia';
  }

  const firstPositional = argv[firstPositionalIndex];
  if (!firstPositional) {
    return 'wp-typia';
  }

  if (hasUnknownOptionBefore(argv, firstPositionalIndex)) {
    return 'wp-typia';
  }

  if (isReservedTopLevelCommandName(firstPositional)) {
    return firstPositional;
  }

  if (suggestTopLevelCommandTypo(firstPositional)) {
    return firstPositional;
  }

  return positionalIndexes.length === 1 ? 'create' : firstPositional;
}

function assertStringOptionValues(argv: string[]): void {
  const firstPositionalIndex = findFirstPositionalIndex(
    argv,
    COMMAND_ROUTING_METADATA,
  );
  if (firstPositionalIndex === -1) {
    return;
  }

  const commandName = argv[
    firstPositionalIndex
  ] as keyof typeof STRING_OPTION_NAMES_BY_COMMAND;
  const stringOptionNames = new Set<string>(GLOBAL_STRING_OPTION_NAMES);
  for (const optionName of STRING_OPTION_NAMES_BY_COMMAND[commandName] ?? []) {
    stringOptionNames.add(optionName);
  }

  for (let index = firstPositionalIndex + 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      break;
    }
    if (arg.length === 2 && arg.startsWith('-')) {
      if (SHORT_OPTION_NAMES_WITH_VALUES.has(arg.slice(1))) {
        const next = argv[index + 1];
        if (!next || next.startsWith('-')) {
          throw createMissingOptionValueError(arg);
        }
        index += 1;
      }
      continue;
    }
    if (!arg.startsWith('--')) {
      continue;
    }

    const [rawName, inlineValue] = arg.slice(2).split('=', 2);
    if (!stringOptionNames.has(rawName)) {
      continue;
    }

    if (arg.includes('=')) {
      if (!inlineValue) {
        throw createMissingOptionValueError(`--${rawName}`);
      }
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith('-')) {
      throw createMissingOptionValueError(`--${rawName}`);
    }
    index += 1;
  }
}

function isWindowsDrivePath(value: string): boolean {
  return /^[A-Za-z]:([\\/]|$)/.test(value);
}

function looksLikeStructuredProjectInput(value: string): boolean {
  if (value.includes('#')) {
    return true;
  }

  if (!isWindowsDrivePath(value) && /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)) {
    return true;
  }

  return value.startsWith('@') && value.includes('/');
}

function assertPositionalAliasProjectDir(projectDir: string): void {
  const normalizedProjectDir =
    path.normalize(projectDir).replace(/[\\/]+$/u, '') ||
    path.normalize(projectDir);
  if (normalizedProjectDir === '.' || normalizedProjectDir === '..') {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      `The positional alias does not scaffold into \`${projectDir}\`. Use \`${WP_TYPIA_CANONICAL_CREATE_USAGE}\` with an explicit child directory instead.`,
    );
  }

  if (looksLikeStructuredProjectInput(projectDir)) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      `The positional alias only accepts unambiguous local project directories. Use \`${WP_TYPIA_CANONICAL_CREATE_USAGE}\` for \`${projectDir}\`.`,
    );
  }
}

export function normalizeWpTypiaArgv(argv: string[]): string[] {
  const positionalIndexes = collectPositionalIndexes(
    argv,
    COMMAND_ROUTING_METADATA,
  );
  const firstPositionalIndex = positionalIndexes[0] ?? -1;
  if (firstPositionalIndex === -1) {
    return argv;
  }

  const firstPositional = argv[firstPositionalIndex];
  if (!firstPositional) {
    return argv;
  }

  if (firstPositional === 'migrations') {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      '`wp-typia migrations` was removed in favor of `wp-typia migrate`. Use `wp-typia migrate <subcommand>` instead.',
    );
  }

  if (isReservedTopLevelCommandName(firstPositional)) {
    assertStringOptionValues(argv);
    return argv;
  }

  if (positionalIndexes.length > 1) {
    const extraPositionals = positionalIndexes
      .slice(1)
      .map((index) => argv[index])
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      );

    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      `The positional alias only accepts a single project directory. Use \`${WP_TYPIA_CANONICAL_CREATE_USAGE}\` for scaffold invocations with additional positional arguments, or check the command spelling if you meant another top-level command. Extra positional arguments: ${extraPositionals.map((value) => `\`${value}\``).join(', ')}.`,
    );
  }

  assertPositionalAliasProjectDir(firstPositional);
  assertNoLikelyTopLevelCommandTypo(firstPositional);

  const normalizedArgv = [
    ...argv.slice(0, firstPositionalIndex),
    'create',
    ...argv.slice(firstPositionalIndex),
  ];
  assertStringOptionValues(normalizedArgv);
  return normalizedArgv;
}
