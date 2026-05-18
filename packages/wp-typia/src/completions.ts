import {
  CLI_DIAGNOSTIC_CODES,
  createCliCommandError,
} from '@wp-typia/project-tools/cli-diagnostics';

import { WP_TYPIA_COMMAND_REGISTRY } from './command-registry';

export const COMPLETION_SHELLS = [
  'bash',
  'fish',
  'powershell',
  'zsh',
] as const;

export type CompletionShell = (typeof COMPLETION_SHELLS)[number];

function commandWords(): string {
  return WP_TYPIA_COMMAND_REGISTRY.map((command) => command.name).join(' ');
}

function isCompletionShell(value: string): value is CompletionShell {
  return COMPLETION_SHELLS.includes(value as CompletionShell);
}

function renderBashCompletion(commandName: string): string {
  const words = commandWords();
  return [
    `# bash completion for ${commandName}`,
    `# Regenerate with: ${commandName} complete -- bash`,
    `_${commandName.replace(/[^A-Za-z0-9_]/g, '_')}_complete() {`,
    '  local cur',
    '  COMPREPLY=()',
    '  cur="${COMP_WORDS[COMP_CWORD]}"',
    `  COMPREPLY=( $(compgen -W "${words}" -- "$cur") )`,
    '  return 0',
    '}',
    `complete -F _${commandName.replace(/[^A-Za-z0-9_]/g, '_')}_complete ${commandName}`,
    '',
  ].join('\n');
}

function renderZshCompletion(commandName: string): string {
  const words = commandWords()
    .split(' ')
    .map((word) => `'${word}'`)
    .join(' ');
  return [
    `#compdef ${commandName}`,
    `# Regenerate with: ${commandName} complete -- zsh`,
    `_${commandName.replace(/[^A-Za-z0-9_]/g, '_')}() {`,
    `  _describe 'command' "(${words})"`,
    '}',
    `_${commandName.replace(/[^A-Za-z0-9_]/g, '_')} "$@"`,
    '',
  ].join('\n');
}

function renderFishCompletion(commandName: string): string {
  return [
    `# fish completion for ${commandName}`,
    `# Regenerate with: ${commandName} complete -- fish`,
    ...WP_TYPIA_COMMAND_REGISTRY.map(
      (command) => {
        const description =
          'description' in command ? command.description : command.name;

        return `complete -c ${commandName} -f -n "__fish_use_subcommand" -a "${command.name}" -d "${description}"`;
      },
    ),
    '',
  ].join('\n');
}

function renderPowerShellCompletion(commandName: string): string {
  const words = commandWords()
    .split(' ')
    .map((word) => `'${word}'`)
    .join(', ');
  return [
    `# PowerShell completion for ${commandName}`,
    `# Regenerate with: ${commandName} complete -- powershell`,
    `Register-ArgumentCompleter -Native -CommandName '${commandName}' -ScriptBlock {`,
    '  param($wordToComplete)',
    `  @(${words}) | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {`,
    "    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)",
    '  }',
    '}',
    '',
  ].join('\n');
}

export function renderCompletionScript(
  shell: string | undefined,
  commandName = 'wp-typia',
): string {
  if (!shell) {
    throw createCliCommandError({
      code: CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
      command: 'complete',
      detailLines: [
        `Missing shell name. Expected one of: ${COMPLETION_SHELLS.join(', ')}.`,
      ],
    });
  }

  if (!isCompletionShell(shell)) {
    throw createCliCommandError({
      code: CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      command: 'complete',
      detailLines: [
        `Unsupported completion shell "${shell}". Expected one of: ${COMPLETION_SHELLS.join(', ')}.`,
      ],
    });
  }

  switch (shell) {
    case 'bash':
      return renderBashCompletion(commandName);
    case 'fish':
      return renderFishCompletion(commandName);
    case 'powershell':
      return renderPowerShellCompletion(commandName);
    case 'zsh':
      return renderZshCompletion(commandName);
  }
}
