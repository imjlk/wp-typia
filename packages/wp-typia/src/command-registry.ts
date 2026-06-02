import { ADD_KIND_IDS } from './add-kind-ids';

export const WP_TYPIA_CANONICAL_CREATE_USAGE = 'wp-typia create <project-dir>';
export const WP_TYPIA_POSITIONAL_ALIAS_USAGE = 'wp-typia <project-dir>';
export const WP_TYPIA_CANONICAL_MIGRATE_USAGE = 'wp-typia migrate <subcommand>';
export const WP_TYPIA_DEPRECATED_MIGRATIONS_USAGE =
  'wp-typia migrations <subcommand>';

export const WP_TYPIA_COMMAND_REGISTRY = [
  {
    commandTree: true,
    description: 'Scaffold a new wp-typia project.',
    name: 'create',
    portableCli: true,
    optionGroups: ['create'],
  },
  {
    commandTree: true,
    description:
      'Preview or apply the minimum retrofit plan for an existing project.',
    name: 'init',
    portableCli: true,
    optionGroups: ['init'],
  },
  {
    commandTree: true,
    description: 'Run the common generated-project sync workflow.',
    name: 'sync',
    portableCli: true,
    optionGroups: ['sync'],
    subcommands: ['ai'],
  },
  {
    commandTree: true,
    description: 'Extend an official wp-typia workspace.',
    name: 'add',
    portableCli: true,
    optionGroups: ['add'],
    subcommands: ADD_KIND_IDS,
  },
  {
    commandTree: true,
    description: 'Run migration workflows.',
    name: 'migrate',
    portableCli: true,
    optionGroups: ['migrate'],
    subcommands: [
      'init',
      'snapshot',
      'diff',
      'scaffold',
      'plan',
      'wizard',
      'verify',
      'doctor',
      'fixtures',
      'fuzz',
    ],
  },
  {
    commandTree: true,
    description: 'Inspect scaffold templates.',
    name: 'templates',
    portableCli: true,
    optionGroups: ['templates'],
    subcommands: ['list', 'inspect'],
  },
  {
    commandTree: true,
    description: 'Run repository and project diagnostics.',
    name: 'doctor',
    portableCli: true,
    optionGroups: ['doctor'],
  },
  {
    commandTree: true,
    description: 'Inspect or sync schema-driven MCP metadata.',
    name: 'mcp',
    portableCli: true,
    optionGroups: ['mcp'],
    subcommands: ['list', 'sync'],
  },
  {
    commandTree: false,
    name: 'help',
    portableCli: true,
    optionGroups: [],
  },
  {
    commandTree: false,
    name: 'version',
    portableCli: true,
    optionGroups: [],
  },
  {
    commandTree: false,
    name: 'skills',
    portableCli: true,
    optionGroups: ['skills'],
    subcommands: ['list', 'sync'],
  },
  {
    commandTree: false,
    name: 'completions',
    portableCli: true,
    optionGroups: [],
  },
  {
    commandTree: false,
    name: 'complete',
    portableCli: true,
    optionGroups: [],
  },
] as const;

export type WpTypiaCommandRegistryEntry =
  (typeof WP_TYPIA_COMMAND_REGISTRY)[number];
export type WpTypiaReservedTopLevelCommandName =
  WpTypiaCommandRegistryEntry['name'];
export type WpTypiaCommandOptionGroupName =
  WpTypiaCommandRegistryEntry['optionGroups'][number];
export type WpTypiaCommandTreeEntry = Extract<
  WpTypiaCommandRegistryEntry,
  { commandTree: true }
>;
export type WpTypiaPortableCliCommandName = Extract<
  WpTypiaCommandRegistryEntry,
  { portableCli: true }
>['name'];
export type WpTypiaTopLevelCommandName = WpTypiaCommandTreeEntry['name'];

export const WP_TYPIA_RESERVED_TOP_LEVEL_COMMAND_NAMES =
  WP_TYPIA_COMMAND_REGISTRY.map(
    (command) => command.name,
  ) as readonly WpTypiaReservedTopLevelCommandName[];

export const WP_TYPIA_PORTABLE_CLI_TOP_LEVEL_COMMAND_NAMES =
  WP_TYPIA_COMMAND_REGISTRY.filter((command) => command.portableCli).map(
    (command) => command.name,
  ) as readonly WpTypiaPortableCliCommandName[];

export const WP_TYPIA_TOP_LEVEL_COMMAND_NAMES =
  WP_TYPIA_COMMAND_REGISTRY.filter((command) => command.commandTree).map(
    (command) => command.name,
  ) as readonly WpTypiaTopLevelCommandName[];

export const WP_TYPIA_FUTURE_COMMAND_TREE: ReadonlyArray<{
  description: string;
  name: WpTypiaTopLevelCommandName;
  subcommands?: readonly string[];
}> = WP_TYPIA_COMMAND_REGISTRY.filter(
  (command): command is WpTypiaCommandTreeEntry => command.commandTree,
).map((command) => ({
  description: command.description,
  name: command.name,
  subcommands: 'subcommands' in command ? command.subcommands : undefined,
}));

const commandOptionGroupNamesByTopLevelCommand = {} as Record<
  WpTypiaReservedTopLevelCommandName,
  readonly WpTypiaCommandOptionGroupName[]
>;

for (const command of WP_TYPIA_COMMAND_REGISTRY) {
  commandOptionGroupNamesByTopLevelCommand[command.name] = command.optionGroups;
}

export const WP_TYPIA_COMMAND_OPTION_GROUP_NAMES_BY_TOP_LEVEL_COMMAND =
  commandOptionGroupNamesByTopLevelCommand;
