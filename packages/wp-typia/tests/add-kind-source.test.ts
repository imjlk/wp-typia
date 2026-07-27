import { expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { ADD_KIND_IDS as PROJECT_TOOLS_ADD_KIND_IDS } from '@wp-typia/project-tools/cli-add-kind-ids';
import { ADD_KIND_IDS } from '../src/add-kind-registry';
import { WP_TYPIA_COMMAND_REGISTRY } from '../src/command-registry';

const packageRoot = path.resolve(import.meta.dir, '..');

test('single-sources add-kind ids from project-tools metadata', () => {
  const cliAddKindIdsSource = fs.readFileSync(
    path.join(packageRoot, 'src', 'add-kind-ids.ts'),
    'utf8',
  );
  const addCommand = WP_TYPIA_COMMAND_REGISTRY.find(
    (command) => command.name === 'add',
  );

  expect(cliAddKindIdsSource).toContain(
    "'@wp-typia/project-tools/cli-add-kind-ids'",
  );
  expect(cliAddKindIdsSource).not.toContain('export const ADD_KIND_IDS = [');
  expect(ADD_KIND_IDS).toEqual([...PROJECT_TOOLS_ADD_KIND_IDS]);
  expect(addCommand?.subcommands).toEqual([...PROJECT_TOOLS_ADD_KIND_IDS]);
});

test('single-sources add-kind missing-name messages inside kind modules', () => {
  const addKindSourceDir = path.join(packageRoot, 'src', 'add-kinds');
  const offenders: string[] = [];

  for (const filename of fs
    .readdirSync(addKindSourceDir)
    .filter((name) => name.endsWith('.ts'))) {
    const source = fs.readFileSync(
      path.join(addKindSourceDir, filename),
      'utf8',
    );
    if (!source.includes('missingNameMessage')) {
      continue;
    }

    const definitions = [
      ...source.matchAll(/const\s+([A-Z0-9_]+_MISSING_NAME_MESSAGE)\s*=/g),
    ].map((match) => match[1]);
    const [constantName] = definitions;
    const hasInlinePlanMessage = /missingNameMessage:\s*['"`]/.test(source);
    const requireAddKindNameArguments = [
      ...source.matchAll(/requireAddKindName\(\s*[^,]+,\s*([^),]+)\s*[),]/gs),
    ].map((match) => match[1]?.trim());
    const hasInlineRequireMessage = requireAddKindNameArguments.some(
      (argument) => /^['"`]/.test(argument ?? ''),
    );
    const hasMismatchedRequireMessage = requireAddKindNameArguments.some(
      (argument) => argument !== constantName,
    );

    if (
      definitions.length !== 1 ||
      !constantName ||
      !source.includes(`missingNameMessage: ${constantName}`) ||
      hasInlinePlanMessage ||
      hasInlineRequireMessage ||
      hasMismatchedRequireMessage
    ) {
      offenders.push(filename);
    }
  }

  expect(offenders).toEqual([]);
});

test('keeps add-kind formatting helpers below the execution registry', () => {
  const leafSource = fs.readFileSync(
    path.join(packageRoot, 'src', 'add-kind-ids.ts'),
    'utf8',
  );
  const registrySource = fs.readFileSync(
    path.join(packageRoot, 'src', 'add-kind-registry.ts'),
    'utf8',
  );
  const cliErrorMessagesSource = fs.readFileSync(
    path.join(packageRoot, 'src', 'cli-error-messages.ts'),
    'utf8',
  );
  const portableCliHelpSource = fs.readFileSync(
    path.join(packageRoot, 'src', 'portable-cli', 'help.ts'),
    'utf8',
  );

  expect(leafSource).toContain('export function formatAddKindList');
  expect(leafSource).toContain('export function formatAddKindUsagePlaceholder');
  expect(registrySource).toContain("} from './add-kind-ids';");
  expect(registrySource).not.toContain('export function formatAddKindList');
  expect(registrySource).not.toContain(
    'export function formatAddKindUsagePlaceholder',
  );
  expect(cliErrorMessagesSource).toContain("from './add-kind-ids'");
  expect(cliErrorMessagesSource).not.toContain("from './add-kind-registry'");
  expect(portableCliHelpSource).toContain("from '../add-kind-ids'");
  expect(portableCliHelpSource).not.toContain("from '../add-kind-registry'");
});
