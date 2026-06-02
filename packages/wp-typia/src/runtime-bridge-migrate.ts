import type { ReadlinePrompt } from '@wp-typia/project-tools/cli-prompt';
import type { RuntimeCompletionPayload } from './runtime-output/types';
import { buildMigrationCompletionPayload } from './runtime-bridge-output';
import { readOptionalLooseStringFlag } from './cli-string-flags';
import type { PrintLine } from './print-line';
import {
  pushFlag,
  shouldWrapCliCommandError,
  wrapCliCommandError,
} from './runtime-bridge-shared';

export type MigrateExecutionInput = {
  command?: string;
  cwd: string;
  flags: Record<string, unknown>;
  printLine?: PrintLine;
  prompt?: ReadlinePrompt;
  renderLine?: PrintLine;
};

const loadMigrationsRuntime = () =>
  import('@wp-typia/project-tools/migrations');
const defaultPrintLine: PrintLine = (line) => {
  process.stdout.write(`${line}\n`);
};

export async function executeMigrateCommand({
  command,
  cwd,
  flags,
  printLine = defaultPrintLine,
  prompt,
  renderLine,
}: MigrateExecutionInput): Promise<RuntimeCompletionPayload | void> {
  try {
    const { formatMigrationHelpText, parseMigrationArgs, runMigrationCommand } =
      await loadMigrationsRuntime();
    const outputLine = renderLine ?? printLine;
    if (!command) {
      const helpText = formatMigrationHelpText();
      outputLine(helpText);
      return;
    }

    const argv = [command];
    pushFlag(argv, 'all', flags.all);
    pushFlag(argv, 'force', flags.force);
    pushFlag(
      argv,
      'current-migration-version',
      readOptionalLooseStringFlag(flags, 'current-migration-version'),
    );
    pushFlag(
      argv,
      'migration-version',
      readOptionalLooseStringFlag(flags, 'migration-version'),
    );
    pushFlag(
      argv,
      'from-migration-version',
      readOptionalLooseStringFlag(flags, 'from-migration-version'),
    );
    pushFlag(
      argv,
      'to-migration-version',
      readOptionalLooseStringFlag(flags, 'to-migration-version'),
    );
    pushFlag(
      argv,
      'iterations',
      readOptionalLooseStringFlag(flags, 'iterations'),
    );
    pushFlag(argv, 'seed', readOptionalLooseStringFlag(flags, 'seed'));

    const parsed = parseMigrationArgs(argv);
    const lines: string[] | null = renderLine ? [] : null;
    const captureLine = (line: string) => {
      lines?.push(line);
      outputLine(line);
    };
    const result = await runMigrationCommand(parsed, cwd, {
      prompt,
      renderLine: captureLine,
    });
    if (renderLine) {
      return result &&
        typeof result === 'object' &&
        'cancelled' in result &&
        result.cancelled === true
        ? undefined
        : buildMigrationCompletionPayload({
            command: parsed.command ?? 'plan',
            lines: lines ?? [],
          });
    }

    if (
      result &&
      typeof result === 'object' &&
      'cancelled' in result &&
      result.cancelled === true
    ) {
      return;
    }
  } catch (error) {
    if (!shouldWrapCliCommandError({ renderLine })) {
      throw error;
    }
    throw await wrapCliCommandError('migrate', error);
  }
}
