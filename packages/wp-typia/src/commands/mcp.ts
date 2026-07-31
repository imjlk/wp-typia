import { execFileSync } from 'node:child_process';
import path from 'node:path';

import {
  CLI_DIAGNOSTIC_CODES,
  createCliCommandError,
  isCliDiagnosticError,
} from '@wp-typia/project-tools/cli-diagnostics';

import { getMcpSchemaSources, type WpTypiaUserConfig } from '../config';
import {
  loadMcpToolGroupsWithBuiltin,
  syncMcpSchemasFromGroups,
} from '../mcp.js';
import type { PrintLine } from '../print-line';

type McpToolGroupSummary = {
  namespace: string;
  toolCount: number;
  tools: string[];
};

type McpSyncResult = Awaited<ReturnType<typeof syncMcpSchemasFromGroups>>;

export type DispatchMcpCommandOptions = {
  cwd: string;
  flags: Record<string, unknown>;
  format?: string;
  positionals: string[];
  printLine: PrintLine;
  userConfig: WpTypiaUserConfig;
};

export function printMcpToolGroupSummary(
  summary: McpToolGroupSummary[],
  printLine: PrintLine,
): void {
  for (const group of summary) {
    printLine(`${group.namespace} (${group.toolCount})`);
    for (const tool of group.tools) {
      printLine(`  - ${tool}`);
    }
  }
}

export function printMcpSyncSummary(
  result: McpSyncResult,
  printLine: PrintLine,
): void {
  printLine(
    `Synced ${result.commandCount} MCP tools across ${result.groups.length} namespaces into ${result.outputDir}.`,
  );
}

function buildMcpToolGroupSummary(
  groups: Awaited<ReturnType<typeof loadMcpToolGroupsWithBuiltin>>,
): McpToolGroupSummary[] {
  return groups.map((group) => ({
    namespace: group.namespace,
    toolCount: group.tools.length,
    tools: group.tools.map((tool) => tool.name),
  }));
}

function throwUnknownMcpSubcommand(subcommand: string): never {
  throw createCliCommandError({
    code: CLI_DIAGNOSTIC_CODES.INVALID_COMMAND,
    command: 'mcp',
    detailLines: [
      `Unknown mcp subcommand "${subcommand}". Expected list or sync.`,
    ],
  });
}

export async function dispatchMcpCommand({
  cwd,
  flags,
  format,
  positionals,
  printLine,
  userConfig,
}: DispatchMcpCommandOptions): Promise<void> {
  const subcommand = positionals[1] ?? 'list';
  const schemaSources = getMcpSchemaSources(userConfig);
  const structured = format === 'json';

  if (subcommand !== 'list' && subcommand !== 'sync' && subcommand !== 'call') {
    throwUnknownMcpSubcommand(subcommand);
  }

  try {
    if (subcommand === 'list') {
      const groups = await loadMcpToolGroupsWithBuiltin(cwd, schemaSources);
      const summary = buildMcpToolGroupSummary(groups);
      if (structured) {
        printLine(JSON.stringify({ groups: summary }, null, 2));
        return;
      }
      printMcpToolGroupSummary(summary, printLine);
      return;
    }

    if (subcommand === 'sync') {
      const outputDir =
        typeof flags['output-dir'] === 'string'
          ? flags['output-dir']
          : path.join(cwd, '.wp-typia', 'mcp');
      const groups = await loadMcpToolGroupsWithBuiltin(cwd, schemaSources);
      const result = await syncMcpSchemasFromGroups(groups, outputDir);
      if (structured) {
        printLine(JSON.stringify({ sync: result }, null, 2));
        return;
      }
      printMcpSyncSummary(result, printLine);
      return;
    }

    if (subcommand === 'call') {
      const toolName = typeof flags.tool === 'string' ? flags.tool : '';
      if (!toolName) {
        throw createCliCommandError({
          code: CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
          command: 'mcp',
          detailLines: ['A --tool <name> flag is required for mcp call.'],
        });
      }

      const result = await dispatchBuiltinTool(cwd, toolName, flags);
      if (structured) {
        printLine(JSON.stringify({ result }, null, 2));
        return;
      }
      printLine(
        typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      );
      return;
    }
  } catch (error) {
    if (isCliDiagnosticError(error)) {
      throw error;
    }
    throw createCliCommandError({
      command: 'mcp',
      error,
    });
  }
}

/**
 * Built-in MCP tool names that can be dispatched via `wp-typia mcp call`.
 */
const DISPATCHABLE_TOOLS = new Set([
  'migration-diff',
  'migration-plan',
  'migration-scaffold',
]);

/**
 * Map a built-in MCP tool name + flags to the corresponding CLI command
 * invocation and return its JSON result.
 */
async function dispatchBuiltinTool(
  cwd: string,
  toolName: string,
  flags: Record<string, unknown>,
): Promise<unknown> {
  if (!DISPATCHABLE_TOOLS.has(toolName)) {
    throw createCliCommandError({
      code: CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      command: 'mcp',
      detailLines: [
        `Unknown or non-dispatchable tool "${toolName}". Available: ${[...DISPATCHABLE_TOOLS].join(', ')}.`,
      ],
    });
  }

  const fromVersion = typeof flags['from-migration-version'] === 'string'
    ? flags['from-migration-version']
    : '';
  const toVersion = typeof flags['to-migration-version'] === 'string'
    ? flags['to-migration-version']
    : undefined;

  if (!fromVersion) {
    throw createCliCommandError({
      code: CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      command: 'mcp',
      detailLines: [
        '--from-migration-version is required for migration tools.',
      ],
    });
  }

  // Delegate to the existing CLI by spawning a subprocess. This keeps the
  // dispatch isolated and reuses the full migration runtime.
  const entryPath = path.join(__dirname, '..', 'bin', 'wp-typia.js');
  const args = ['migrate'];
  if (toolName === 'migration-diff') {
    args.push('diff');
  } else if (toolName === 'migration-plan') {
    args.push('plan');
  } else {
    args.push('scaffold');
  }
  args.push('--from-migration-version', fromVersion);
  if (toVersion) {
    args.push('--to-migration-version', toVersion);
  }
  args.push('--format', 'json');

  const stdout = execFileSync(process.execPath, [entryPath, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    return JSON.parse(stdout);
  } catch {
    return stdout.trim();
  }
}
