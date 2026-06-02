import { z } from 'zod';
import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from '@wp-typia/project-tools/cli-diagnostics';
import {
  ADD_OPTION_METADATA,
  CREATE_OPTION_METADATA,
  DOCTOR_OPTION_METADATA,
  GLOBAL_OPTION_METADATA,
  INIT_OPTION_METADATA,
  MCP_OPTION_METADATA,
  MIGRATE_OPTION_METADATA,
  SKILLS_OPTION_METADATA,
  SYNC_OPTION_METADATA,
  TEMPLATES_OPTION_METADATA,
} from './command-options';
import type {
  CommandOptionGroupName,
  CommandOptionMetadata,
  CommandOptionMetadataMap,
  CommandOptionParser,
  ParsedCommandArgv,
  ShortOptionDescriptor,
} from './command-options/types';

export type {
  CommandOptionGroupName,
  CommandOptionMetadata,
  CommandOptionMetadataMap,
  CommandOptionParser,
  ParsedCommandArgv,
  ShortOptionDescriptor,
} from './command-options/types';
export {
  ADD_OPTION_METADATA,
  CREATE_OPTION_METADATA,
  DOCTOR_OPTION_METADATA,
  GLOBAL_OPTION_METADATA,
  INIT_OPTION_METADATA,
  MCP_OPTION_METADATA,
  MIGRATE_OPTION_METADATA,
  SKILLS_OPTION_METADATA,
  SYNC_OPTION_METADATA,
  TEMPLATES_OPTION_METADATA,
} from './command-options';

export const COMMAND_OPTION_METADATA_BY_GROUP = {
  add: ADD_OPTION_METADATA,
  create: CREATE_OPTION_METADATA,
  doctor: DOCTOR_OPTION_METADATA,
  global: GLOBAL_OPTION_METADATA,
  init: INIT_OPTION_METADATA,
  migrate: MIGRATE_OPTION_METADATA,
  mcp: MCP_OPTION_METADATA,
  skills: SKILLS_OPTION_METADATA,
  sync: SYNC_OPTION_METADATA,
  templates: TEMPLATES_OPTION_METADATA,
} as const satisfies Record<CommandOptionGroupName, CommandOptionMetadataMap>;

export const COMMAND_OPTION_GROUP_NAMES = Object.keys(
  COMMAND_OPTION_METADATA_BY_GROUP,
) as CommandOptionGroupName[];

export function collectCommandOptionMetadata(
  ...groupNames: readonly CommandOptionGroupName[]
): CommandOptionMetadataMap {
  const metadata: CommandOptionMetadataMap = {};

  for (const groupName of groupNames) {
    for (const [optionName, option] of Object.entries(
      COMMAND_OPTION_METADATA_BY_GROUP[groupName],
    )) {
      metadata[optionName] = {
        ...(metadata[optionName] ?? {}),
        ...option,
      };
    }
  }

  return metadata;
}

export const ALL_COMMAND_OPTION_METADATA = collectCommandOptionMetadata(
  ...COMMAND_OPTION_GROUP_NAMES,
);

export function buildCommandOptions<TOptions extends CommandOptionMetadataMap>(
  metadata: TOptions,
): Record<
  string,
  {
    argumentKind?: 'flag';
    description: string;
    repeatable?: boolean;
    schema: z.ZodTypeAny;
    short?: string;
  }
> {
  return Object.fromEntries(
    Object.entries(metadata).map(([name, option]) => [
      name,
      {
        ...(option.argumentKind ? { argumentKind: option.argumentKind } : {}),
        description: option.description,
        ...(option.repeatable ? { repeatable: true } : {}),
        schema:
          option.type === 'boolean'
            ? z.boolean().default(false)
            : option.repeatable
              ? z.union([z.string(), z.array(z.string())]).optional()
              : z.string().optional(),
        ...(option.short ? { short: option.short } : {}),
      },
    ]),
  );
}

export function collectOptionNamesByType(
  metadata: CommandOptionMetadataMap,
  type: CommandOptionMetadata['type'],
): string[] {
  return Object.entries(metadata)
    .filter(([, option]) => option.type === type)
    .map(([name]) => name);
}

export function formatPortableCliOptionHelp(
  metadata: CommandOptionMetadataMap,
): string[] {
  return Object.entries(metadata).map(([name, option]) => {
    const short = option.short ? `, -${option.short}` : '';
    return `- --${name}${short}: ${option.description}`;
  });
}

export function buildCommandOptionParser(
  ...metadataMaps: CommandOptionMetadataMap[]
): CommandOptionParser {
  const metadata: CommandOptionMetadataMap = {};

  for (const metadataMap of metadataMaps) {
    for (const [optionName, option] of Object.entries(metadataMap)) {
      metadata[optionName] = {
        ...(metadata[optionName] ?? {}),
        ...option,
      };
    }
  }

  return {
    booleanOptionNames: new Set(collectOptionNamesByType(metadata, 'boolean')),
    repeatableOptionNames: new Set(
      Object.entries(metadata)
        .filter(([, option]) => option.repeatable)
        .map(([name]) => name),
    ),
    shortFlagMap: new Map<string, ShortOptionDescriptor>(
      Object.entries(metadata).flatMap(([name, option]) =>
        option.short
          ? [[option.short, { name, type: option.type }] as const]
          : [],
      ),
    ),
    stringOptionNames: new Set(collectOptionNamesByType(metadata, 'string')),
  };
}

function assignParsedOptionValue(
  flags: Record<string, unknown>,
  options: {
    name: string;
    parser: CommandOptionParser;
    value: string | boolean;
  },
): void {
  if (!options.parser.repeatableOptionNames.has(options.name)) {
    flags[options.name] = options.value;
    return;
  }

  const current = flags[options.name];
  flags[options.name] = Array.isArray(current)
    ? [...current, options.value]
    : current === undefined
      ? [options.value]
      : [current, options.value];
}

export function buildArgvWalkerRoutingMetadata(
  ...metadataMaps: CommandOptionMetadataMap[]
): {
  longValueOptions: string[];
  shortValueOptions: string[];
} {
  const parser = buildCommandOptionParser(...metadataMaps);

  return {
    longValueOptions: Array.from(parser.stringOptionNames)
      .map((optionName) => `--${optionName}`)
      .sort((left, right) => left.localeCompare(right)),
    shortValueOptions: Array.from(parser.shortFlagMap.entries())
      .filter(([, option]) => option.type === 'string')
      .map(([short]) => `-${short}`)
      .sort((left, right) => left.localeCompare(right)),
  };
}

export const COMMAND_ROUTING_METADATA = buildArgvWalkerRoutingMetadata(
  ALL_COMMAND_OPTION_METADATA,
);

export function createMissingOptionValueError(
  optionLabel: string,
): ReturnType<typeof createCliDiagnosticCodeError> {
  return createCliDiagnosticCodeError(
    CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
    `\`${optionLabel}\` requires a value.`,
  );
}

function createUnknownOptionError(
  optionLabel: string,
): ReturnType<typeof createCliDiagnosticCodeError> {
  return createCliDiagnosticCodeError(
    CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
    `Unknown option \`${optionLabel}\`.`,
  );
}

function walkArgvOptions(
  argv: string[],
  options: {
    extraBooleanOptionNames?: Iterable<string>;
    optionNames?: Iterable<string>;
    parser: CommandOptionParser;
    strict: boolean;
  },
): {
  argv: string[];
  flags: Record<string, unknown>;
} {
  const flags: Record<string, unknown> = {};
  const nextArgv: string[] = [];
  const booleanOptionNames = new Set(options.parser.booleanOptionNames);
  const optionNames = new Set(options.optionNames ?? []);

  for (const optionName of options.extraBooleanOptionNames ?? []) {
    booleanOptionNames.add(optionName);
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }

    if (arg === '--') {
      nextArgv.push(...argv.slice(index + (options.strict ? 1 : 0)));
      break;
    }

    if (arg.length === 2 && arg.startsWith('-')) {
      const shortFlag = options.parser.shortFlagMap.get(arg.slice(1));
      if (
        !shortFlag ||
        (!options.strict && !optionNames.has(shortFlag.name))
      ) {
        if (options.strict) {
          throw createUnknownOptionError(arg);
        }
        nextArgv.push(arg);
        continue;
      }
      if (shortFlag.type === 'boolean') {
        flags[shortFlag.name] = true;
        continue;
      }
      const next = argv[index + 1];
      if (!next || next.startsWith('-')) {
        throw createMissingOptionValueError(arg);
      }
      assignParsedOptionValue(flags, {
        name: shortFlag.name,
        parser: options.parser,
        value: next,
      });
      index += 1;
      continue;
    }

    if (arg.startsWith('--')) {
      const option = arg.slice(2);
      const separatorIndex = option.indexOf('=');
      const rawName =
        separatorIndex === -1 ? option : option.slice(0, separatorIndex);
      const inlineValue =
        separatorIndex === -1 ? undefined : option.slice(separatorIndex + 1);
      if (!options.strict && !optionNames.has(rawName)) {
        nextArgv.push(arg);
        continue;
      }
      if (booleanOptionNames.has(rawName)) {
        flags[rawName] = true;
        continue;
      }
      if (!options.parser.stringOptionNames.has(rawName)) {
        if (options.strict) {
          throw createUnknownOptionError(`--${rawName}`);
        }
        nextArgv.push(arg);
        continue;
      }
      if (inlineValue !== undefined) {
        if (!inlineValue) {
          throw createMissingOptionValueError(`--${rawName}`);
        }
        assignParsedOptionValue(flags, {
          name: rawName,
          parser: options.parser,
          value: inlineValue,
        });
        continue;
      }
      const next = argv[index + 1];
      if (!next || next.startsWith('-')) {
        throw createMissingOptionValueError(`--${rawName}`);
      }
      assignParsedOptionValue(flags, {
        name: rawName,
        parser: options.parser,
        value: next,
      });
      index += 1;
      continue;
    }

    if (arg.startsWith('-') && options.strict) {
      throw createUnknownOptionError(arg);
    }

    nextArgv.push(arg);
  }

  return {
    argv: nextArgv,
    flags,
  };
}

export function extractKnownOptionValuesFromArgv(
  argv: string[],
  options: {
    optionNames: Iterable<string>;
    parser: CommandOptionParser;
  },
): {
  argv: string[];
  flags: Record<string, unknown>;
} {
  return walkArgvOptions(argv, {
    optionNames: options.optionNames,
    parser: options.parser,
    strict: false,
  });
}

export function parseCommandArgvWithMetadata(
  argv: string[],
  options: {
    extraBooleanOptionNames?: Iterable<string>;
    parser: CommandOptionParser;
  },
): ParsedCommandArgv {
  const { argv: positionals, flags } = walkArgvOptions(argv, {
    extraBooleanOptionNames: options.extraBooleanOptionNames,
    parser: options.parser,
    strict: true,
  });

  return {
    flags,
    positionals,
  };
}

/**
 * Resolve CLI option values from defaults and parsed flags.
 *
 * Repeatable string options keep the historical comma-joined value by default
 * for form initial values. Pass `preserveArrays` when downstream code needs
 * the parsed repeated flag boundaries.
 */
export function resolveCommandOptionValues<
  TMetadata extends CommandOptionMetadataMap,
>(
  metadata: TMetadata,
  options: {
    defaults?: Record<string, unknown>;
    flags?: Record<string, unknown>;
    optionNames?: Iterable<keyof TMetadata | string>;
    preserveArrays: true;
  },
): Record<string, string | boolean | string[] | undefined>;
export function resolveCommandOptionValues<
  TMetadata extends CommandOptionMetadataMap,
>(
  metadata: TMetadata,
  options: {
    defaults?: Record<string, unknown>;
    flags?: Record<string, unknown>;
    optionNames?: Iterable<keyof TMetadata | string>;
    preserveArrays?: false;
  },
): Record<string, string | boolean | undefined>;
export function resolveCommandOptionValues<
  TMetadata extends CommandOptionMetadataMap,
>(
  metadata: TMetadata,
  options: {
    defaults?: Record<string, unknown>;
    flags?: Record<string, unknown>;
    optionNames?: Iterable<keyof TMetadata | string>;
    preserveArrays?: boolean;
  },
): Record<string, string | boolean | string[] | undefined> {
  const resolved: Record<string, string | boolean | string[] | undefined> = {};
  const optionNames =
    options.optionNames ?? (Object.keys(metadata) as Array<keyof TMetadata>);

  for (const optionName of optionNames) {
    const name = String(optionName);
    const descriptor = metadata[name];
    if (!descriptor) {
      continue;
    }

    const value = options.flags?.[name] ?? options.defaults?.[name];
    if (descriptor.type === 'boolean') {
      resolved[name] = Boolean(value ?? false);
      continue;
    }

    if (descriptor.repeatable && Array.isArray(value)) {
      if (!value.every((item): item is string => typeof item === 'string')) {
        resolved[name] = undefined;
        continue;
      }

      resolved[name] = options.preserveArrays ? [...value] : value.join(',');
      continue;
    }

    resolved[name] = typeof value === 'string' ? value : undefined;
  }

  return resolved;
}
