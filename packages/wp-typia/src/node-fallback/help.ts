import packageJson from '../../package.json';
import { formatAddKindList } from '../add-kind-ids';
import {
  ADD_OPTION_METADATA,
  CREATE_OPTION_METADATA,
  DOCTOR_OPTION_METADATA,
  formatNodeFallbackOptionHelp,
  INIT_OPTION_METADATA,
  MCP_OPTION_METADATA,
  MIGRATE_OPTION_METADATA,
  SKILLS_OPTION_METADATA,
  SYNC_OPTION_METADATA,
  TEMPLATES_OPTION_METADATA,
  type CommandOptionMetadataMap,
} from '../command-option-metadata';
import {
  WP_TYPIA_CANONICAL_CREATE_USAGE,
  WP_TYPIA_CANONICAL_MIGRATE_USAGE,
  WP_TYPIA_FUTURE_COMMAND_TREE,
  WP_TYPIA_POSITIONAL_ALIAS_USAGE,
} from '../command-contract';
import type { PrintLine } from '../print-line';
import { printBlock } from '../print-block';
import type { NodeFallbackExecutableCommandName } from './types';

export const STANDALONE_GUIDANCE_LINE =
  'Standalone wp-typia binaries are available from the GitHub release assets.';

export const NODE_FALLBACK_RUNTIME_SUMMARY_LINES = [
  'Runtime: Node-first wp-typia CLI',
  'Gunshi provides the `complete` integration; the command registry owns shared dispatch and diagnostics.',
  'Supported command surfaces include create/init/add/migrate flows, doctor, sync, templates, MCP metadata, skills, completions, --help, and --version.',
  STANDALONE_GUIDANCE_LINE,
  'Output markers: WP_TYPIA_ASCII=1 forces ASCII markers, WP_TYPIA_ASCII=0 opts back into Unicode markers, and non-empty NO_COLOR requests ASCII markers when WP_TYPIA_ASCII is unset.',
];

export const NODE_FALLBACK_NO_COMMAND_REASON_LINE =
  'No command provided. Run wp-typia --help for usage information.';

export type NodeFallbackCommandHelpConfig = {
  bodyLines?: string[];
  heading: string;
  optionMetadata: CommandOptionMetadataMap;
};

export function renderGeneralHelp(printLine: PrintLine) {
  printBlock(printLine, [
    `wp-typia ${packageJson.version}`,
    '',
    'Canonical CLI package for wp-typia scaffolding and project workflows.',
    '',
    ...NODE_FALLBACK_RUNTIME_SUMMARY_LINES,
    '',
    'Commands:',
    ...WP_TYPIA_FUTURE_COMMAND_TREE.map(
      (command) => `- ${command.name}: ${command.description}`,
    ),
    '',
    'Canonical usage:',
    `- ${WP_TYPIA_CANONICAL_CREATE_USAGE}`,
    '- wp-typia init [project-dir]',
    `- ${WP_TYPIA_CANONICAL_MIGRATE_USAGE}`,
    `- ${WP_TYPIA_POSITIONAL_ALIAS_USAGE}`,
  ]);
}

export function renderNoCommandHelp(printLine: PrintLine) {
  printBlock(printLine, [NODE_FALLBACK_NO_COMMAND_REASON_LINE, '']);
  renderGeneralHelp(printLine);
}

export function renderNodeFallbackCommandHelp(
  printLine: PrintLine,
  config: NodeFallbackCommandHelpConfig,
) {
  printBlock(printLine, [
    config.heading,
    '',
    ...NODE_FALLBACK_RUNTIME_SUMMARY_LINES,
    '',
    ...(config.bodyLines ? [...config.bodyLines, ''] : []),
    'Supported flags:',
    ...formatNodeFallbackOptionHelp(config.optionMetadata),
  ]);
}

const NODE_FALLBACK_COMMAND_HELP_CONFIG = {
  add: {
    bodyLines: [`Supported kinds: ${formatAddKindList()}`],
    heading: 'Usage: wp-typia add <kind> <name>',
    optionMetadata: ADD_OPTION_METADATA,
  },
  create: {
    heading: `Usage: ${WP_TYPIA_CANONICAL_CREATE_USAGE}`,
    optionMetadata: CREATE_OPTION_METADATA,
  },
  doctor: {
    bodyLines: [
      'Runs read-only environment readiness checks. Official wp-typia workspace roots also get inventory, source-tree drift, iframe/API v3 compatibility, and shared convention checks. Use --workspace-only for CI gates that should fail only on workspace-scoped checks while keeping environment failures advisory.',
    ],
    heading: 'Usage: wp-typia doctor [--format json] [--workspace-only]',
    optionMetadata: DOCTOR_OPTION_METADATA,
  },
  mcp: {
    bodyLines: [
      'Inspect or sync schema-driven MCP metadata from configured mcp.schemaSources. The default sync output is .wp-typia/mcp; pass --output-dir for a custom path.',
    ],
    heading: 'Usage: wp-typia mcp <list|sync>',
    optionMetadata: MCP_OPTION_METADATA,
  },
  init: {
    bodyLines: [
      'Preview-by-default retrofit planner for existing WordPress block or plugin projects. Re-run with --apply to write package.json updates and helper scripts.',
    ],
    heading: 'Usage: wp-typia init [project-dir]',
    optionMetadata: INIT_OPTION_METADATA,
  },
  migrate: {
    heading: `Usage: ${WP_TYPIA_CANONICAL_MIGRATE_USAGE}`,
    optionMetadata: MIGRATE_OPTION_METADATA,
  },
  skills: {
    bodyLines: [
      'List detected coding agents or generate a compact wp-typia SKILL.md from command metadata.',
    ],
    heading: 'Usage: wp-typia skills <list|sync>',
    optionMetadata: SKILLS_OPTION_METADATA,
  },
  sync: {
    heading: 'Usage: wp-typia sync [ai]',
    optionMetadata: SYNC_OPTION_METADATA,
  },
  templates: {
    heading: 'wp-typia templates <list|inspect>',
    optionMetadata: TEMPLATES_OPTION_METADATA,
  },
  complete: {
    bodyLines: ['Generate shell completion scripts for bash, zsh, fish, or powershell.'],
    heading: 'Usage: wp-typia complete <shell>',
    optionMetadata: {},
  },
  completions: {
    bodyLines: ['Legacy alias for `wp-typia complete <shell>`.'],
    heading: 'Usage: wp-typia completions <shell>',
    optionMetadata: {},
  },
} satisfies Record<NodeFallbackExecutableCommandName, NodeFallbackCommandHelpConfig>;

export const NODE_FALLBACK_HELP_RENDERERS = Object.fromEntries(
  Object.entries(NODE_FALLBACK_COMMAND_HELP_CONFIG).map(([command, config]) => [
    command,
    (printLine: PrintLine) => renderNodeFallbackCommandHelp(printLine, config),
  ]),
) as Record<NodeFallbackExecutableCommandName, (printLine: PrintLine) => void>;
