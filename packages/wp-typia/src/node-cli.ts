import {
  CLI_DIAGNOSTIC_CODES,
  createCliCommandError,
} from '@wp-typia/project-tools/cli-diagnostics';
import {
  ALL_COMMAND_OPTION_METADATA,
  ADD_OPTION_METADATA,
  buildCommandOptionParser,
  CREATE_OPTION_METADATA,
  extractKnownOptionValuesFromArgv,
  parseCommandArgvWithMetadata,
  resolveCommandOptionValues,
} from './command-option-metadata';
import { detectAIAgents } from './ai-agent-detection';
import {
  normalizeCliOutputFormatArgv,
  validateCliOutputFormatArgv,
} from './cli-output-format';
import { renderCompletionScript } from './completions';
import {
  getAddBlockDefaults,
  getCreateDefaults,
  loadWpTypiaUserConfig,
  loadWpTypiaUserConfigFromSource,
  mergeWpTypiaUserConfig,
  type WpTypiaUserConfig,
} from './config';
import { extractWpTypiaConfigOverride } from './config-override';
import { dispatchMcpCommand } from './commands/mcp';
import type { PrintLine } from './print-line';
import { executeInitCommand } from './runtime-bridge-init';
import { executeMigrateCommand } from './runtime-bridge-migrate';
import {
  buildStructuredInitSuccessPayload,
  buildSyncDryRunPayload,
  printCompletionPayload,
} from './runtime-bridge-output';
import {
  executeSyncCommand,
  resolveSyncExecutionTarget,
} from './runtime-bridge-sync';
import { normalizeWpTypiaArgv } from './command-contract';
import {
  createNodeFallbackNoCommandCliError,
  handleNodeFallbackEntrypointError,
  throwUnsupportedNodeFallbackCommand,
} from './node-fallback/errors';
import {
  NODE_FALLBACK_HELP_RENDERERS,
  renderGeneralHelp,
  renderNoCommandHelp,
} from './node-fallback/help';
import { listSkills, syncSkills } from './skills';
import type {
  NodeFallbackCommandDispatcher,
  NodeFallbackDispatchContext,
  NodeFallbackExecutableCommandName,
  NodeFallbackGlobalFlags,
} from './node-fallback/types';
import { renderNodeFallbackVersion } from './node-fallback/version';

const NODE_FALLBACK_OPTION_PARSER = buildCommandOptionParser(
  ALL_COMMAND_OPTION_METADATA,
);
const NODE_FALLBACK_BOOLEAN_OPTION_NAMES = ['help', 'version'] as const;
const printLine: PrintLine = (line) => {
  console.log(line);
};
const warnLine: PrintLine = (line) => {
  console.warn(line);
};

export function hasFlagBeforeTerminator(argv: string[], flag: string): boolean {
  for (const arg of argv) {
    if (arg === '--') {
      return false;
    }
    if (arg === flag) {
      return true;
    }
  }

  return false;
}

export function parseGlobalFlags(argv: string[]): {
  argv: string[];
  flags: NodeFallbackGlobalFlags;
} {
  const { argv: nextArgv, flags } = extractKnownOptionValuesFromArgv(argv, {
    optionNames: ['format', 'id'],
    parser: NODE_FALLBACK_OPTION_PARSER,
  });

  return {
    argv: nextArgv,
    flags: {
      format: typeof flags.format === 'string' ? flags.format : undefined,
      id: typeof flags.id === 'string' ? flags.id : undefined,
    },
  };
}

async function applyNodeFallbackConfigDefaults(
  command: string | undefined,
  subcommand: string | undefined,
  flags: Record<string, unknown>,
  config: WpTypiaUserConfig,
): Promise<Record<string, unknown>> {
  if (command === 'create') {
    return {
      ...flags,
      ...resolveCommandOptionValues(CREATE_OPTION_METADATA, {
        defaults: getCreateDefaults(config),
        flags,
      }),
    };
  }

  if (command === 'add' && subcommand === 'block') {
    return {
      ...flags,
      ...resolveCommandOptionValues(ADD_OPTION_METADATA, {
        defaults: getAddBlockDefaults(config),
        flags,
      }),
    };
  }

  return flags;
}

async function loadNodeCliConfig(
  cwd: string,
  configOverridePath: string | undefined,
): Promise<WpTypiaUserConfig> {
  let config = await loadWpTypiaUserConfig(cwd);
  if (configOverridePath) {
    const overrideConfig = await loadWpTypiaUserConfigFromSource(
      cwd,
      configOverridePath,
    );
    config = mergeWpTypiaUserConfig(config, overrideConfig);
  }

  return config;
}

function commandNeedsNodeCliConfig(
  command: string | undefined,
  subcommand: string | undefined,
): boolean {
  return (
    command === 'create' ||
    command === 'mcp' ||
    (command === 'add' && subcommand === 'block')
  );
}

function parseArgv(argv: string[]) {
  return parseCommandArgvWithMetadata(argv, {
    extraBooleanOptionNames: NODE_FALLBACK_BOOLEAN_OPTION_NAMES,
    parser: NODE_FALLBACK_OPTION_PARSER,
  });
}

async function dispatchNodeFallbackCompletion({
  positionals,
  printLine,
}: NodeFallbackDispatchContext): Promise<void> {
  const shell = positionals[1];
  printLine(renderCompletionScript(shell));
}

const dispatchNodeFallbackAddLazy: NodeFallbackCommandDispatcher = async (
  context,
) => {
  const { dispatchNodeFallbackAdd } = await import(
    './node-fallback/dispatchers/add'
  );
  await dispatchNodeFallbackAdd(context);
};

const dispatchNodeFallbackCreateLazy: NodeFallbackCommandDispatcher = async (
  context,
) => {
  const { dispatchNodeFallbackCreate } = await import(
    './node-fallback/dispatchers/create'
  );
  await dispatchNodeFallbackCreate(context);
};

const dispatchNodeFallbackDoctorLazy: NodeFallbackCommandDispatcher = async (
  context,
) => {
  const { dispatchNodeFallbackDoctor } = await import('./node-fallback/doctor');
  await dispatchNodeFallbackDoctor(context);
};

const dispatchNodeFallbackTemplatesLazy: NodeFallbackCommandDispatcher = async (
  context,
) => {
  const { dispatchNodeFallbackTemplates } = await import(
    './node-fallback/templates'
  );
  await dispatchNodeFallbackTemplates(context);
};

async function dispatchNodeFallbackSkills({
  cwd,
  mergedFlags,
  positionals,
  printLine,
}: NodeFallbackDispatchContext): Promise<void> {
  const subcommand = positionals[1] ?? 'list';
  const structured = mergedFlags.format === 'json';

  if (subcommand === 'list') {
    const result = listSkills();
    if (structured) {
      printLine(JSON.stringify(result, null, 2));
      return;
    }
    if (result.agents.length === 0) {
      printLine('No agents detected.');
    } else {
      printLine(`Detected ${result.agents.length} agent(s):`);
      for (const agent of result.agents) {
        printLine(`  ${agent.name}${agent.universal ? ' (universal)' : ''}`);
        printLine(`    ${agent.projectSkillsDir}`);
      }
    }
    return;
  }

  if (subcommand === 'sync') {
    const result = await syncSkills({
      cwd,
      force: Boolean(mergedFlags.force),
      global: mergedFlags.local ? false : true,
    });
    if (structured) {
      printLine(JSON.stringify(result, null, 2));
      return;
    }
    if (!result.updated) {
      printLine('Skills are up to date.');
      return;
    }
    printLine(`Synced skills to ${result.paths.length} location(s).`);
    for (const install of result.agents) {
      printLine(`  ${install.agent}: ${install.mode} -> ${install.path}`);
    }
    return;
  }

  throw createCliCommandError({
    code: CLI_DIAGNOSTIC_CODES.INVALID_COMMAND,
    command: 'skills',
    detailLines: [
      `Unknown skills subcommand "${subcommand}". Expected list or sync.`,
    ],
  });
}

const NODE_FALLBACK_COMMAND_DISPATCHERS = {
  add: dispatchNodeFallbackAddLazy,
  complete: dispatchNodeFallbackCompletion,
  completions: dispatchNodeFallbackCompletion,
  create: dispatchNodeFallbackCreateLazy,
  doctor: dispatchNodeFallbackDoctorLazy,
  init: async ({
    cwd,
    mergedFlags,
    positionals,
    printLine,
    warnLine,
  }: NodeFallbackDispatchContext) => {
    const plan = await executeInitCommand(
      {
        apply: Boolean(mergedFlags.apply),
        cwd,
        packageManager:
          typeof mergedFlags['package-manager'] === 'string'
            ? mergedFlags['package-manager']
            : undefined,
        projectDir: positionals[1],
      },
      {
        emitOutput: mergedFlags.format !== 'json',
        printLine,
        warnLine,
      },
    );
    if (mergedFlags.format === 'json') {
      printLine(
        JSON.stringify(buildStructuredInitSuccessPayload(plan), null, 2),
      );
    }
  },
  migrate: async ({
    cwd,
    mergedFlags,
    positionals,
    printLine,
  }: NodeFallbackDispatchContext) => {
    await executeMigrateCommand({
      command: positionals[1],
      cwd,
      flags: mergedFlags,
      printLine,
    });
  },
  sync: async ({
    cwd,
    mergedFlags,
    positionals,
    printLine,
    warnLine,
  }: NodeFallbackDispatchContext) => {
    try {
      const syncTarget = resolveSyncExecutionTarget(positionals[1]);
      const sync = await executeSyncCommand({
        captureOutput:
          mergedFlags.format === 'json' && !Boolean(mergedFlags['dry-run']),
        check: Boolean(mergedFlags.check),
        cwd,
        dryRun: Boolean(mergedFlags['dry-run']),
        target: syncTarget,
      });
      if (mergedFlags.format === 'json') {
        printLine(
          JSON.stringify(
            {
              sync,
            },
            null,
            2,
          ),
        );
        return;
      }
      if (sync.dryRun) {
        printCompletionPayload(
          buildSyncDryRunPayload({
            check: sync.check,
            packageManager: sync.packageManager,
            plannedCommands: sync.plannedCommands,
            projectDir: sync.projectDir,
            target: sync.target,
          }),
          {
            printLine,
            warnLine,
          },
        );
      }
    } catch (error) {
      throw createCliCommandError({
        command: 'sync',
        error,
      });
    }
  },
  mcp: async ({
    config,
    cwd,
    mergedFlags,
    positionals,
    printLine,
  }: NodeFallbackDispatchContext) => {
    await dispatchMcpCommand({
      cwd,
      flags: mergedFlags,
      format:
        typeof mergedFlags.format === 'string'
          ? mergedFlags.format
          : undefined,
      positionals,
      printLine,
      userConfig: config,
    });
  },
  skills: dispatchNodeFallbackSkills,
  templates: dispatchNodeFallbackTemplatesLazy,
} satisfies Record<
  NodeFallbackExecutableCommandName,
  NodeFallbackCommandDispatcher
>;

export async function runNodeCli(argv = process.argv.slice(2)): Promise<void> {
  const normalizedArgv = normalizeWpTypiaArgv(argv);
  const { argv: argvWithoutConfigOverride, configOverridePath } =
    extractWpTypiaConfigOverride(normalizedArgv);
  validateCliOutputFormatArgv(argvWithoutConfigOverride);
  const outputFormatArgv = normalizeCliOutputFormatArgv(
    argvWithoutConfigOverride,
  );
  const { argv: cliArgv, flags } = parseGlobalFlags(outputFormatArgv);
  const { flags: commandFlags, positionals } = parseArgv(cliArgv);
  const aiDetection = detectAIAgents();
  const globalFlags =
    flags.format === undefined && aiDetection.isAIAgent
      ? { ...flags, format: 'json' }
      : flags;
  const rawMergedFlags: Record<string, unknown> = {
    ...commandFlags,
    ...globalFlags,
  };
  const [command, subcommand] = positionals;
  const helpRequested =
    hasFlagBeforeTerminator(cliArgv, '--help') || command === 'help';
  const helpTarget = command === 'help' ? subcommand : command;
  const versionRequested =
    hasFlagBeforeTerminator(cliArgv, '--version') || command === 'version';

  if (cliArgv.length === 0) {
    const noCommandError = createNodeFallbackNoCommandCliError();
    if (rawMergedFlags.format !== 'json') {
      renderNoCommandHelp(printLine);
    }
    throw noCommandError;
  }

  if (helpRequested) {
    if (helpTarget) {
      const helpRenderer =
        NODE_FALLBACK_HELP_RENDERERS[
          helpTarget as NodeFallbackExecutableCommandName
        ];
      if (helpRenderer) {
        helpRenderer(printLine);
        return;
      }
      if (helpTarget === 'help' || helpTarget === 'version') {
        renderGeneralHelp(printLine);
        return;
      }
    } else {
      renderGeneralHelp(printLine);
      return;
    }
    renderGeneralHelp(printLine);
    return;
  }

  if (versionRequested) {
    renderNodeFallbackVersion(printLine, {
      format:
        typeof rawMergedFlags.format === 'string'
          ? rawMergedFlags.format
          : undefined,
    });
    return;
  }

  const commandDispatcher =
    command &&
    NODE_FALLBACK_COMMAND_DISPATCHERS[
      command as NodeFallbackExecutableCommandName
    ];
  if (commandDispatcher) {
    const configNeeded = commandNeedsNodeCliConfig(command, subcommand);
    const config = configNeeded
      ? await loadNodeCliConfig(process.cwd(), configOverridePath)
      : {};
    const mergedFlags = configNeeded
      ? await applyNodeFallbackConfigDefaults(
          command,
          subcommand,
          rawMergedFlags,
          config,
        )
      : rawMergedFlags;
    await commandDispatcher({
      config,
      cwd: process.cwd(),
      mergedFlags,
      positionals,
      printLine,
      warnLine,
    });
    return;
  }

  throwUnsupportedNodeFallbackCommand(command ?? '(missing)');
}

export async function runNodeCliEntrypoint(
  argv = process.argv.slice(2),
): Promise<void> {
  try {
    await runNodeCli(argv);
  } catch (error) {
    await handleNodeFallbackEntrypointError(error, argv);
  }
}
