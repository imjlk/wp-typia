import type { WP_TYPIA_PORTABLE_CLI_TOP_LEVEL_COMMAND_NAMES } from '../command-contract';
import type { WpTypiaUserConfig } from '../config';
import type { PrintLine } from '../print-line';

export type PortableCliGlobalFlags = {
  format?: string;
  id?: string;
};

export type PortableCliTopLevelCommandName =
  (typeof WP_TYPIA_PORTABLE_CLI_TOP_LEVEL_COMMAND_NAMES)[number];

export type PortableCliExecutableCommandName = Exclude<
  PortableCliTopLevelCommandName,
  'help' | 'version'
>;

export type PortableCliDispatchContext = {
  config: WpTypiaUserConfig;
  cwd: string;
  mergedFlags: Record<string, unknown>;
  positionals: string[];
  printLine: PrintLine;
  warnLine: PrintLine;
};

export type PortableCliCommandDispatcher = (
  context: PortableCliDispatchContext,
) => Promise<void>;
