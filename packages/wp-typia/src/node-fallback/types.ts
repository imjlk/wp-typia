import type { WP_TYPIA_NODE_FALLBACK_TOP_LEVEL_COMMAND_NAMES } from '../command-contract';
import type { WpTypiaUserConfig } from '../config';
import type { PrintLine } from '../print-line';

export type NodeFallbackGlobalFlags = {
  format?: string;
  id?: string;
};

export type NodeFallbackTopLevelCommandName =
  (typeof WP_TYPIA_NODE_FALLBACK_TOP_LEVEL_COMMAND_NAMES)[number];

export type NodeFallbackExecutableCommandName = Exclude<
  NodeFallbackTopLevelCommandName,
  'help' | 'version'
>;

export type NodeFallbackDispatchContext = {
  config: WpTypiaUserConfig;
  cwd: string;
  mergedFlags: Record<string, unknown>;
  positionals: string[];
  printLine: PrintLine;
  warnLine: PrintLine;
};

export type NodeFallbackCommandDispatcher = (
  context: NodeFallbackDispatchContext,
) => Promise<void>;
