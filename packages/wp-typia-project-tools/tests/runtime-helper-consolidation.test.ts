import { afterAll, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

import {
  assertFullBlockName,
  resolveWorkspaceBlockTargetName,
  resolveWorkspaceTargetBlockName,
} from '../src/runtime/block-targets.js';
import {
  getNodeErrorCode,
  getOptionalNodeErrorCode,
  isFileNotFoundError,
  pathExists,
  readOptionalUtf8File,
} from '../src/runtime/fs-async.js';
import { getPropertyNameText } from '../src/runtime/ts-property-names.js';

const runtimeRoot = path.join(import.meta.dir, '..', 'src', 'runtime');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-typia-runtime-helpers-'));

afterAll(() => {
  fs.rmSync(tempRoot, { force: true, recursive: true });
});

function readRuntimeSource(fileName: string): string {
  const sourcePath = path.join(runtimeRoot, fileName);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const facadeMatch = source
    .trim()
    .match(/^export \* from ["']\.\/(.+)\.js["'];$/u);
  if (!facadeMatch) {
    return source;
  }

  return fs.readFileSync(
    path.join(path.dirname(sourcePath), `${facadeMatch[1]}.ts`),
    'utf8',
  );
}

test('runtime helper modules own filesystem and TypeScript property-name helpers', () => {
  const initTemplatesSource = readRuntimeSource('cli-init-templates.ts');

  expect(readRuntimeSource('template-source-cache.ts')).not.toContain(
    'async function pathExists',
  );
  expect(readRuntimeSource('template-source-cache.ts')).not.toContain(
    'function getNodeErrorCode',
  );
  expect(readRuntimeSource('workspace-inventory.ts')).not.toContain(
    'function getPropertyNameText',
  );
  expect(readRuntimeSource('cli-add-workspace-assets.ts')).not.toContain(
    'function getPropertyNameText',
  );
  expect(readRuntimeSource('cli-add-workspace.ts')).not.toContain(
    'function assertFullBlockName',
  );
  expect(readRuntimeSource('cli-add-workspace.ts')).not.toContain(
    'function resolveWorkspaceTargetBlockName',
  );
  expect(readRuntimeSource('cli-add-workspace-assets.ts')).not.toContain(
    'function resolveBindingTargetBlockSlug',
  );
  expect(initTemplatesSource).not.toContain(
    "( result.error as NodeJS.ErrnoException ).code === 'ENOENT'",
  );
  expect(initTemplatesSource).toContain('function isFileNotFoundError');
  expect(initTemplatesSource).toContain('isFileNotFoundError( result.error )');
});

test('shared async filesystem helpers expose path existence and node error codes', async () => {
  const existingPath = path.join(tempRoot, 'existing.txt');
  fs.writeFileSync(existingPath, 'ok', 'utf8');

  await expect(pathExists(existingPath)).resolves.toBe(true);
  await expect(pathExists(path.join(tempRoot, 'missing.txt'))).resolves.toBe(false);
  await expect(readOptionalUtf8File(existingPath)).resolves.toBe('ok');
  await expect(
    readOptionalUtf8File(path.join(tempRoot, 'missing.txt')),
  ).resolves.toBeNull();
  expect(getNodeErrorCode(Object.assign(new Error('denied'), { code: 'EACCES' }))).toBe(
    'EACCES',
  );
  expect(getOptionalNodeErrorCode(Object.assign(new Error('denied'), { code: 'EACCES' }))).toBe(
    'EACCES',
  );
  expect(getOptionalNodeErrorCode(new Error('plain'))).toBeUndefined();
  expect(getNodeErrorCode(new Error('plain'))).toBe('');
  expect(isFileNotFoundError(Object.assign(new Error('missing'), { code: 'ENOENT' }))).toBe(
    true,
  );
  expect(isFileNotFoundError(new Error('plain'))).toBe(false);
});

test('deprecated sync helpers document async replacements and removal policy', () => {
  const inventorySource = readRuntimeSource('workspace-inventory-read.ts');
  const externalTemplateSource = readRuntimeSource('template-source-external.ts');
  const remoteTemplateSource = readRuntimeSource('template-source-remote.ts');
  const apiGuideSource = fs.readFileSync(
    path.join(
      runtimeRoot,
      '..',
      '..',
      '..',
      '..',
      'apps',
      'docs',
      'src',
      'content',
      'docs',
      'reference',
      'api.md',
    ),
    'utf8',
  );

  for (const source of [
    inventorySource,
    externalTemplateSource,
    remoteTemplateSource,
    apiGuideSource,
  ]) {
    expect(source).toContain('Removal target: not currently scheduled');
  }
  expect(inventorySource).toContain('Use `readWorkspaceInventoryAsync()`');
  expect(inventorySource).toContain('Use `getWorkspaceBlockSelectOptionsAsync()`');
  expect(externalTemplateSource).toContain('Use `findExternalTemplateEntry()`');
  expect(remoteTemplateSource).toContain('Use `getDefaultCategoryAsync()`');
  expect(remoteTemplateSource).toContain('Use `getTemplateProjectTypeAsync()`');
  expect(apiGuideSource).toContain('Deprecated synchronous helper policy');
});

test('shared TypeScript property-name helper aligns literal property support', () => {
  const sourceFile = ts.createSourceFile(
    'fixture.ts',
    `const value = {
  plain: true,
  'quoted-name': true,
  7: true,
  [dynamicName]: true,
};`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const statement = sourceFile.statements[0];
  const declaration = ts.isVariableStatement(statement)
    ? statement.declarationList.declarations[0]
    : undefined;
  const initializer = declaration?.initializer;
  if (
    !statement ||
    !ts.isVariableStatement(statement) ||
    !initializer ||
    !ts.isObjectLiteralExpression(initializer)
  ) {
    throw new Error('Test fixture did not parse as an object literal.');
  }
  const objectLiteral = initializer;

  expect(
    objectLiteral.properties.map((property) =>
      ts.isPropertyAssignment(property) ? getPropertyNameText(property.name) : null,
    ),
  ).toEqual(['plain', 'quoted-name', '7', null]);
});

test('shared block target helpers preserve workspace target diagnostics', () => {
  expect(assertFullBlockName(' demo-space/counter-card ', '--from')).toBe(
    'demo-space/counter-card',
  );
  expect(() => assertFullBlockName('', '--from')).toThrow(
    '`--from` requires a block name.',
  );
  expect(() => assertFullBlockName('counter-card', '--from')).toThrow(
    '`--from` must use <namespace/block-slug> format.',
  );
  expect(() =>
    assertFullBlockName('counter-card', {
      empty: () =>
        'The first positional argument (target block name) requires a block name.',
      invalidFormat: () =>
        'The first positional argument (target block name) must use <namespace/block-slug> format.',
    }),
  ).toThrow(
    'The first positional argument (target block name) must use <namespace/block-slug> format.',
  );
  expect(resolveWorkspaceTargetBlockName('counter-card', 'demo-space', '--to')).toEqual({
    blockName: 'demo-space/counter-card',
    blockSlug: 'counter-card',
  });
  expect(
    resolveWorkspaceTargetBlockName('demo-space/counter-card', 'demo-space', '--to'),
  ).toEqual({
    blockName: 'demo-space/counter-card',
    blockSlug: 'counter-card',
  });
  expect(() =>
    resolveWorkspaceTargetBlockName('other-space/counter-card', 'demo-space', '--to'),
  ).toThrow('`--to` references namespace "other-space". Expected "demo-space".');
});

test('shared block target resolver lets callers keep custom diagnostics', () => {
  expect(() =>
    resolveWorkspaceBlockTargetName('/counter-card', 'demo-space', {
      empty: () => 'empty',
      emptySegment: (input) => `empty segment: ${input}`,
      invalidFormat: (input) => `invalid: ${input}`,
      namespaceMismatch: (input, actual, expected) =>
        `namespace mismatch: ${input} ${actual} ${expected}`,
    }),
  ).toThrow('empty segment: /counter-card');
});
