import type { Writable } from 'node:stream';

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
  createPortableCliNoCommandCliError,
  handlePortableCliEntrypointError,
  throwUnsupportedPortableCliCommand,
} from './portable-cli/errors';
import {
  PORTABLE_CLI_HELP_RENDERERS,
  renderGeneralHelp,
  renderNoCommandHelp,
  renderUnknownHelpTarget,
} from './portable-cli/help';
import { listSkills, syncSkills } from './skills';
import type {
  PortableCliCommandDispatcher,
  PortableCliDispatchContext,
  PortableCliExecutableCommandName,
  PortableCliGlobalFlags,
} from './portable-cli/types';
import { renderPortableCliVersion } from './portable-cli/version';
import {
  getStructuredOutputNoticesForArgv,
  withStructuredOutputNotices,
} from './structured-output-notices';
import {
  isPossibleSyncStackFramePrefix,
  isSyncStackFrameLine,
} from './sync-output';

const PORTABLE_CLI_OPTION_PARSER = buildCommandOptionParser(
  ALL_COMMAND_OPTION_METADATA,
);
const PORTABLE_CLI_BOOLEAN_OPTION_NAMES = ['help', 'version'] as const;
const MAX_PENDING_SYNC_STDERR_LINE = 64 * 1024;
const CLOSED_PROCESS_OUTPUT_STREAMS = new WeakSet<Writable>();
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
  flags: PortableCliGlobalFlags;
} {
  const { argv: nextArgv, flags } = extractKnownOptionValuesFromArgv(argv, {
    optionNames: ['format', 'id'],
    parser: PORTABLE_CLI_OPTION_PARSER,
  });

  return {
    argv: nextArgv,
    flags: {
      format: typeof flags.format === 'string' ? flags.format : undefined,
      id: typeof flags.id === 'string' ? flags.id : undefined,
    },
  };
}

async function applyPortableCliConfigDefaults(
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
    extraBooleanOptionNames: PORTABLE_CLI_BOOLEAN_OPTION_NAMES,
    parser: PORTABLE_CLI_OPTION_PARSER,
  });
}

async function dispatchPortableCliCompletion({
  positionals,
  printLine,
}: PortableCliDispatchContext): Promise<void> {
  const shell = positionals[1];
  printLine(renderCompletionScript(shell));
}

const dispatchPortableCliAddLazy: PortableCliCommandDispatcher = async (
  context,
) => {
  const { dispatchPortableCliAdd } =
    await import('./portable-cli/dispatchers/add');
  await dispatchPortableCliAdd(context);
};

const dispatchPortableCliCreateLazy: PortableCliCommandDispatcher = async (
  context,
) => {
  const { dispatchPortableCliCreate } =
    await import('./portable-cli/dispatchers/create');
  await dispatchPortableCliCreate(context);
};

const dispatchPortableCliDoctorLazy: PortableCliCommandDispatcher = async (
  context,
) => {
  const { dispatchPortableCliDoctor } = await import('./portable-cli/doctor');
  await dispatchPortableCliDoctor(context);
};

const dispatchPortableCliTemplatesLazy: PortableCliCommandDispatcher = async (
  context,
) => {
  const { dispatchPortableCliTemplates } =
    await import('./portable-cli/templates');
  await dispatchPortableCliTemplates(context);
};

async function dispatchPortableCliSkills({
  cwd,
  mergedFlags,
  positionals,
  printLine,
  structuredNotices,
}: PortableCliDispatchContext): Promise<void> {
  const subcommand = positionals[1] ?? 'list';
  const structured = mergedFlags.format === 'json';

  if (subcommand === 'list') {
    const result = listSkills();
    if (structured) {
      printLine(
        JSON.stringify(
          withStructuredOutputNotices(result, structuredNotices),
          null,
          2,
        ),
      );
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
      printLine(
        JSON.stringify(
          withStructuredOutputNotices(result, structuredNotices),
          null,
          2,
        ),
      );
      return;
    }
    if (!result.updated) {
      printLine('Skills are up to date.');
      return;
    }
    if (result.paths.length > 0) {
      printLine(`Synced skills to ${result.paths.length} location(s).`);
    }
    for (const install of result.agents) {
      const reason = install.reason ? ` (${install.reason})` : '';
      printLine(
        `  ${install.agent}: ${install.mode} -> ${install.path}${reason}`,
      );
    }
    if (result.gitignore?.updated) {
      printLine(
        `Updated .gitignore for generated local skills: ${result.gitignore.entries.join(
          ', ',
        )}`,
      );
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

function isClosedPipeError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'EPIPE' || code === 'ERR_STREAM_DESTROYED';
}

/**
 * Writes one process-output chunk while honoring Writable backpressure.
 * Closed pipes complete normally for shell pipelines; an unexpected late
 * stream error is re-emitted and therefore remains fatal when otherwise
 * unhandled, matching EventEmitter's standard `error` semantics.
 */
export function writeProcessOutput(
  stream: Writable,
  chunk: string,
): Promise<void> | void {
  // A downstream shell consumer already closed this pipe, so later output is
  // intentionally discarded instead of turning a successful command into an
  // EPIPE failure.
  if (CLOSED_PROCESS_OUTPUT_STREAMS.has(stream) || stream.destroyed) {
    return;
  }

  return new Promise<void>((resolve, reject) => {
    let drainRequired = false;
    let drained = false;
    let rejectedWriteError = false;
    let settled = false;
    let writeCallbackComplete = false;
    let writeResultObserved = false;
    const cleanup = (deferErrorCleanup: boolean) => {
      stream.off('close', onClose);
      stream.off('drain', onDrain);
      if (deferErrorCleanup) {
        // A Writable callback can run immediately before a matching `error`
        // event. Keep the listener through the current turn so a late EPIPE
        // is treated as the same closed-pipe outcome instead of going
        // uncaught.
        setImmediate(() => stream.off('error', onError));
      } else {
        stream.off('error', onError);
      }
    };
    const settle = (
      error?: Error | null,
      deferErrorCleanup = false,
    ) => {
      if (settled) {
        return;
      }
      settled = true;
      if (!error || isClosedPipeError(error)) {
        if (error) {
          CLOSED_PROCESS_OUTPUT_STREAMS.add(stream);
        }
        cleanup(deferErrorCleanup);
        resolve();
        return;
      }
      rejectedWriteError = true;
      cleanup(deferErrorCleanup);
      reject(error);
    };
    const settleCompletedWrite = () => {
      if (
        writeResultObserved &&
        writeCallbackComplete &&
        (!drainRequired || drained)
      ) {
        settle(undefined, true);
      }
    };
    const onDrain = () => {
      drained = true;
      settleCompletedWrite();
    };
    const onError = (error: Error) => {
      if (isClosedPipeError(error)) {
        CLOSED_PROCESS_OUTPUT_STREAMS.add(stream);
      }
      if (settled) {
        if (rejectedWriteError) {
          return;
        }
        // `once` removes this listener before invoking it. If no other error
        // listener remains, forward a non-pipe failure so it retains normal
        // EventEmitter error semantics instead of being swallowed.
        if (!isClosedPipeError(error) && stream.listenerCount('error') === 0) {
          queueMicrotask(() => {
            if (stream.listenerCount('error') === 0) {
              stream.emit('error', error);
            }
          });
        }
        return;
      }
      settle(error);
    };
    const onClose = () => {
      CLOSED_PROCESS_OUTPUT_STREAMS.add(stream);
      settle();
    };

    stream.once('error', onError);
    stream.once('close', onClose);
    stream.once('drain', onDrain);
    try {
      const accepted = stream.write(chunk, (error) => {
        if (error) {
          settle(error, true);
          return;
        }
        writeCallbackComplete = true;
        settleCompletedWrite();
      });
      drainRequired = !accepted;
      writeResultObserved = true;
      if (!drainRequired) {
        stream.off('drain', onDrain);
      }
      settleCompletedWrite();
    } catch (error) {
      settle(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export function shouldInheritTextSyncStdio({
  dryRun,
  stderrIsTTY = Boolean(process.stderr.isTTY),
  stdoutIsTTY = Boolean(process.stdout.isTTY),
  structured,
}: {
  dryRun: boolean;
  stderrIsTTY?: boolean;
  stdoutIsTTY?: boolean;
  structured: boolean;
}): boolean {
  return !dryRun && !structured && stderrIsTTY && stdoutIsTTY;
}

function createSyncStderrWriter(): {
  flush: () => PromiseLike<void> | void;
  write: (chunk: string) => PromiseLike<void> | void;
} {
  let pending = '';
  let writeQueue: Promise<void> | undefined;
  const emit = (line: string) => {
    if (isSyncStackFrameLine(line)) {
      return;
    }
    if (writeQueue) {
      const nextWrite = writeQueue.then(() =>
        writeProcessOutput(process.stderr, line),
      );
      writeQueue = nextWrite;
      void nextWrite.then(
        () => {
          if (writeQueue === nextWrite) {
            writeQueue = undefined;
          }
        },
        () => {
          if (writeQueue === nextWrite) {
            writeQueue = undefined;
          }
        },
      );
      return;
    }
    const writeResult = writeProcessOutput(process.stderr, line);
    if (writeResult) {
      const nextWrite = Promise.resolve(writeResult);
      writeQueue = nextWrite;
      void nextWrite.then(
        () => {
          if (writeQueue === nextWrite) {
            writeQueue = undefined;
          }
        },
        () => {
          if (writeQueue === nextWrite) {
            writeQueue = undefined;
          }
        },
      );
    }
  };
  const append = (chunk: string, final: boolean) => {
    pending += chunk;
    pending = pending
      .replace(/\r\n/gu, '\n')
      .replace(final ? /\r/gu : /\r(?!$)/gu, '\n');

    let newlineIndex = pending.indexOf('\n');
    while (newlineIndex >= 0) {
      emit(pending.slice(0, newlineIndex + 1));
      pending = pending.slice(newlineIndex + 1);
      newlineIndex = pending.indexOf('\n');
    }

    const trailingCarriageReturn = !final && pending.endsWith('\r');
    const partialLine = trailingCarriageReturn ? pending.slice(0, -1) : pending;
    if (
      partialLine.length > 0 &&
      !isPossibleSyncStackFramePrefix(partialLine)
    ) {
      emit(partialLine);
      pending = trailingCarriageReturn ? '\r' : '';
    }
  };

  return {
    flush: () => {
      append('', true);
      if (pending.length > 0) {
        emit(pending);
      }
      pending = '';
      return writeQueue;
    },
    write: (chunk) => {
      append(chunk, false);

      // Stack frames are short, line-oriented records. Do not retain an
      // arbitrarily large stderr line just to determine whether it is one.
      if (pending.length > MAX_PENDING_SYNC_STDERR_LINE) {
        emit(pending);
        pending = '';
      }
      return writeQueue;
    },
  };
}

const PORTABLE_CLI_COMMAND_DISPATCHERS = {
  add: dispatchPortableCliAddLazy,
  complete: dispatchPortableCliCompletion,
  completions: dispatchPortableCliCompletion,
  create: dispatchPortableCliCreateLazy,
  doctor: dispatchPortableCliDoctorLazy,
  init: async ({
    cwd,
    mergedFlags,
    positionals,
    printLine,
    structuredNotices,
    warnLine,
  }: PortableCliDispatchContext) => {
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
        JSON.stringify(
          withStructuredOutputNotices(
            buildStructuredInitSuccessPayload(plan),
            structuredNotices,
          ),
          null,
          2,
        ),
      );
    }
  },
  migrate: async ({
    cwd,
    mergedFlags,
    positionals,
    printLine,
  }: PortableCliDispatchContext) => {
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
    structuredNotices,
    warnLine,
  }: PortableCliDispatchContext) => {
    let stderrWriter: ReturnType<typeof createSyncStderrWriter> | undefined;
    try {
      const syncTarget = resolveSyncExecutionTarget(positionals[1]);
      const dryRun = Boolean(mergedFlags['dry-run']);
      const structured = mergedFlags.format === 'json';
      const inheritStdio = shouldInheritTextSyncStdio({
        dryRun,
        structured,
      });
      stderrWriter =
        structured || dryRun || inheritStdio
          ? undefined
          : createSyncStderrWriter();
      const sync = await executeSyncCommand({
        captureOutput: !dryRun && !inheritStdio,
        check: Boolean(mergedFlags.check),
        cwd,
        dryRun,
        onStderr: stderrWriter?.write,
        onStdout: stderrWriter
          ? (chunk) => writeProcessOutput(process.stdout, chunk)
          : undefined,
        target: syncTarget,
      });
      await stderrWriter?.flush();
      if (structured) {
        printLine(
          JSON.stringify(
            withStructuredOutputNotices({ sync }, structuredNotices),
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
      // Flush any final partial stderr line before rendering the summary.
      await stderrWriter?.flush();
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
  }: PortableCliDispatchContext) => {
    await dispatchMcpCommand({
      cwd,
      flags: mergedFlags,
      format:
        typeof mergedFlags.format === 'string' ? mergedFlags.format : undefined,
      positionals,
      printLine,
      userConfig: config,
    });
  },
  skills: dispatchPortableCliSkills,
  templates: dispatchPortableCliTemplatesLazy,
} satisfies Record<
  PortableCliExecutableCommandName,
  PortableCliCommandDispatcher
>;

export async function runNodeCli(argv = process.argv.slice(2)): Promise<void> {
  const normalizedArgv = normalizeWpTypiaArgv(argv);
  const { argv: argvWithoutConfigOverride, configOverridePath } =
    extractWpTypiaConfigOverride(normalizedArgv);
  validateCliOutputFormatArgv(argvWithoutConfigOverride);
  const outputFormatArgv = normalizeCliOutputFormatArgv(
    argvWithoutConfigOverride,
  );
  const structuredNotices = getStructuredOutputNoticesForArgv(
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
    const noCommandError = createPortableCliNoCommandCliError();
    if (rawMergedFlags.format !== 'json') {
      renderNoCommandHelp(printLine);
    }
    throw noCommandError;
  }

  if (helpRequested) {
    if (helpTarget) {
      const helpRenderer =
        PORTABLE_CLI_HELP_RENDERERS[
          helpTarget as PortableCliExecutableCommandName
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
    renderUnknownHelpTarget(printLine, helpTarget);
    return;
  }

  if (versionRequested) {
    renderPortableCliVersion(printLine, {
      format:
        typeof rawMergedFlags.format === 'string'
          ? rawMergedFlags.format
          : undefined,
    });
    return;
  }

  const commandDispatcher =
    command &&
    PORTABLE_CLI_COMMAND_DISPATCHERS[
      command as PortableCliExecutableCommandName
    ];
  if (commandDispatcher) {
    const configNeeded = commandNeedsNodeCliConfig(command, subcommand);
    const config = configNeeded
      ? await loadNodeCliConfig(process.cwd(), configOverridePath)
      : {};
    const mergedFlags = configNeeded
      ? await applyPortableCliConfigDefaults(
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
      structuredNotices,
      warnLine,
    });
    return;
  }

  throwUnsupportedPortableCliCommand(command ?? '(missing)');
}

export async function runNodeCliEntrypoint(
  argv = process.argv.slice(2),
): Promise<void> {
  try {
    await runNodeCli(argv);
  } catch (error) {
    await handlePortableCliEntrypointError(error, argv);
  }
}
