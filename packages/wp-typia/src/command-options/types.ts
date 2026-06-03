export type CommandOptionMetadata = {
  argumentKind?: 'flag';
  description: string;
  hidden?: boolean;
  repeatable?: boolean;
  short?: string;
  type: 'boolean' | 'string';
};

export type CommandOptionMetadataMap = Record<string, CommandOptionMetadata>;

export type ParsedCommandArgv = {
  flags: Record<string, unknown>;
  positionals: string[];
};

export type ShortOptionDescriptor = {
  name: string;
  type: CommandOptionMetadata['type'];
};

export type CommandOptionParser = {
  booleanOptionNames: Set<string>;
  repeatableOptionNames: Set<string>;
  shortFlagMap: Map<string, ShortOptionDescriptor>;
  stringOptionNames: Set<string>;
};

export type CommandOptionGroupName =
  | 'global'
  | 'create'
  | 'add'
  | 'init'
  | 'migrate'
  | 'mcp'
  | 'skills'
  | 'sync'
  | 'doctor'
  | 'templates';
