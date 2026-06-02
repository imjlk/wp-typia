import { describe, expect, test } from 'bun:test';

import { COMMAND_OPTION_METADATA_BY_GROUP } from '../src/command-option-metadata';
import {
  WP_TYPIA_COMMAND_OPTION_GROUP_NAMES_BY_TOP_LEVEL_COMMAND,
  WP_TYPIA_COMMAND_REGISTRY,
  WP_TYPIA_FUTURE_COMMAND_TREE,
  WP_TYPIA_PORTABLE_CLI_TOP_LEVEL_COMMAND_NAMES,
  WP_TYPIA_RESERVED_TOP_LEVEL_COMMAND_NAMES,
  WP_TYPIA_TOP_LEVEL_COMMAND_NAMES,
} from '../src/command-registry';

describe('wp-typia command registry metadata', () => {
  test('keeps top-level command names unique and derived lists in sync', () => {
    const commandNames = WP_TYPIA_COMMAND_REGISTRY.map(
      (command) => command.name,
    );
    const commandTreeNames = WP_TYPIA_COMMAND_REGISTRY.filter(
      (command) => command.commandTree,
    ).map((command) => command.name);
    const portableCliNames = WP_TYPIA_COMMAND_REGISTRY.filter(
      (command) => command.portableCli,
    ).map((command) => command.name);

    expect(new Set(commandNames).size).toBe(commandNames.length);
    expect(WP_TYPIA_RESERVED_TOP_LEVEL_COMMAND_NAMES).toEqual(commandNames);
    expect(WP_TYPIA_TOP_LEVEL_COMMAND_NAMES).toEqual(commandTreeNames);
    expect(WP_TYPIA_PORTABLE_CLI_TOP_LEVEL_COMMAND_NAMES).toEqual(
      portableCliNames,
    );
  });

  test('keeps every command option group backed by shared option metadata', () => {
    for (const command of WP_TYPIA_COMMAND_REGISTRY) {
      expect(
        WP_TYPIA_COMMAND_OPTION_GROUP_NAMES_BY_TOP_LEVEL_COMMAND[command.name],
      ).toEqual(command.optionGroups);

      for (const groupName of command.optionGroups) {
        expect(COMMAND_OPTION_METADATA_BY_GROUP[groupName]).toBeDefined();
      }
    }
  });

  test('derives the public command tree from command-tree registry entries', () => {
    const commandTreeEntries = WP_TYPIA_COMMAND_REGISTRY.filter(
      (command) => command.commandTree,
    );

    expect(WP_TYPIA_FUTURE_COMMAND_TREE).toEqual(
      commandTreeEntries.map((command) => ({
        description: command.description,
        name: command.name,
        subcommands:
          'subcommands' in command ? command.subcommands : undefined,
      })),
    );

    for (const command of WP_TYPIA_FUTURE_COMMAND_TREE) {
      expect(command.description).toBeTruthy();
      expect(WP_TYPIA_TOP_LEVEL_COMMAND_NAMES).toContain(command.name);
    }
  });
});
