import path from 'node:path';

import {
  CLI_DIAGNOSTIC_CODES,
  createCliCommandError,
} from '@wp-typia/project-tools/cli-diagnostics';

import { getMcpSchemaSources, type WpTypiaUserConfig } from '../config';
import { loadMcpToolGroups, syncMcpSchemas } from '../mcp';
import type { PrintLine } from '../print-line';

type McpToolGroupSummary = {
  namespace: string;
  toolCount: number;
  tools: string[];
};

type McpSyncResult = Awaited<ReturnType<typeof syncMcpSchemas>>;

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
  groups: Awaited<ReturnType<typeof loadMcpToolGroups>>,
): McpToolGroupSummary[] {
  return groups.map((group) => ({
    namespace: group.namespace,
    toolCount: group.tools.length,
    tools: group.tools.map((tool) => tool.name),
  }));
}

function throwMissingMcpSchemaSources(): never {
  throw createCliCommandError({
    code: CLI_DIAGNOSTIC_CODES.CONFIGURATION_MISSING,
    command: 'mcp',
    detailLines: [
      'No MCP schema sources are configured. Add `mcp.schemaSources` in ~/.config/wp-typia/config.json, .wp-typiarc(.json), or package.json#wp-typia.',
    ],
  });
}

function throwUnknownMcpSubcommand(subcommand: string): never {
  throw createCliCommandError({
    code: CLI_DIAGNOSTIC_CODES.INVALID_COMMAND,
    command: 'mcp',
    detailLines: [`Unknown mcp subcommand "${subcommand}". Expected list or sync.`],
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

  if (schemaSources.length === 0) {
    throwMissingMcpSchemaSources();
  }

  try {
    if (subcommand === 'list') {
      const groups = await loadMcpToolGroups(cwd, schemaSources);
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
      const result = await syncMcpSchemas(cwd, schemaSources, outputDir);
      if (structured) {
        printLine(JSON.stringify({ sync: result }, null, 2));
        return;
      }
      printMcpSyncSummary(result, printLine);
      return;
    }

    throwUnknownMcpSubcommand(subcommand);
  } catch (error) {
    throw createCliCommandError({
      command: 'mcp',
      error,
    });
  }
}
