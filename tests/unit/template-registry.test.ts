import { describe, expect, test } from 'bun:test';
import path from 'node:path';

import {
  BUILTIN_TEMPLATE_IDS,
  OFFICIAL_WORKSPACE_TEMPLATE_ALIAS,
  OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE,
  TEMPLATE_IDS,
  getTemplateById,
  getTemplateSelectOptions,
  isBuiltInTemplateId,
  listTemplates,
  resolvePackageRoot,
} from '../../packages/wp-typia-project-tools/src/runtime/template-registry';
import {
  BUILTIN_BLOCK_METADATA_VERSION,
  BUILTIN_TEMPLATE_METADATA_DEFAULTS,
  COMPOUND_CHILD_BLOCK_METADATA_DEFAULTS,
  REMOVED_BUILTIN_TEMPLATE_IDS,
  getRemovedBuiltInTemplateMessage,
  isRemovedBuiltInTemplateId,
} from '../../packages/wp-typia-project-tools/src/runtime/template-defaults';
import {
  createTempDir,
  writeJsonFile,
  writeTextFile,
} from '../helpers/file-fixtures';

describe('template registry runtime helpers', () => {
  test('resolvePackageRoot walks upward and ignores malformed package.json files', () => {
    const packageRoot = createTempDir('wp-typia-template-root-');
    const nestedDir = path.join(packageRoot, 'src', 'runtime', 'nested');

    writeJsonFile(path.join(packageRoot, 'package.json'), {
      name: '@wp-typia/project-tools',
    });
    writeTextFile(
      path.join(packageRoot, 'src', 'runtime', 'package.json'),
      '{not-json',
    );

    expect(resolvePackageRoot(nestedDir)).toBe(packageRoot);
  });

  test('resolvePackageRoot fails clearly when no matching package root exists', () => {
    const startDir = createTempDir('wp-typia-missing-template-root-');

    expect(() => resolvePackageRoot(startDir)).toThrow(
      'Unable to resolve the @wp-typia/project-tools package root.',
    );
  });

  test('reports built-in template metadata and select options', () => {
    expect([...BUILTIN_TEMPLATE_IDS]).toEqual([
      'basic',
      'interactivity',
      'persistence',
      'compound',
      'query-loop',
    ]);
    expect([...TEMPLATE_IDS]).toEqual([...BUILTIN_TEMPLATE_IDS]);
    expect(listTemplates().map((template) => template.id)).toEqual([
      ...BUILTIN_TEMPLATE_IDS,
      OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE,
    ]);
    expect(isBuiltInTemplateId('compound')).toBe(true);
    expect(isBuiltInTemplateId('remote-template')).toBe(false);
    expect(getTemplateById('persistence')).toEqual(
      expect.objectContaining({
        defaultCategory: 'widgets',
        features: [
          'Interactivity API',
          'Typed REST client',
          'Schema sync',
          'Persistence policies',
        ],
        id: 'persistence',
      }),
    );
    expect(getTemplateById(OFFICIAL_WORKSPACE_TEMPLATE_ALIAS)).toEqual(
      expect.objectContaining({
        id: OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE,
      }),
    );
    expect(getTemplateSelectOptions()).toEqual([
      {
        hint: 'Type-safe attributes, Runtime validation, Minimal setup',
        label: 'basic',
        value: 'basic',
      },
      {
        hint: 'Interactivity API, Client-side state, Event handling',
        label: 'interactivity',
        value: 'interactivity',
      },
      {
        hint: 'Interactivity API, Typed REST client, Schema sync, Persistence policies',
        label: 'persistence',
        value: 'persistence',
      },
      {
        hint: 'InnerBlocks, Hidden child blocks, Optional persistence layer',
        label: 'compound',
        value: 'compound',
      },
      {
        hint: 'core/query variation, Default innerBlocks, Connected patterns, Custom query hooks, Runtime parity hooks, Allowed controls',
        label: 'query-loop',
        value: 'query-loop',
      },
      {
        hint: 'Workspace inventory, Add block workflows, Workspace doctor and migrate',
        label: OFFICIAL_WORKSPACE_TEMPLATE_ALIAS,
        value: OFFICIAL_WORKSPACE_TEMPLATE_ALIAS,
      },
    ]);
  });

  test('shared template defaults preserve built-in metadata values and removed template ids', () => {
    expect(BUILTIN_BLOCK_METADATA_VERSION).toBe('0.1.0');
    expect(BUILTIN_TEMPLATE_METADATA_DEFAULTS.basic).toEqual({
      category: 'text',
      icon: 'smiley',
    });
    expect(BUILTIN_TEMPLATE_METADATA_DEFAULTS.interactivity).toEqual({
      category: 'widgets',
      icon: 'smiley',
    });
    expect(BUILTIN_TEMPLATE_METADATA_DEFAULTS.persistence).toEqual({
      category: 'widgets',
      icon: 'database',
    });
    expect(BUILTIN_TEMPLATE_METADATA_DEFAULTS.compound).toEqual({
      category: 'widgets',
      icon: 'screenoptions',
    });
    expect(BUILTIN_TEMPLATE_METADATA_DEFAULTS['query-loop']).toEqual({
      category: 'widgets',
      icon: 'query-pagination',
    });
    expect(COMPOUND_CHILD_BLOCK_METADATA_DEFAULTS).toEqual({
      category: 'widgets',
      icon: 'excerpt-view',
    });
    expect([...REMOVED_BUILTIN_TEMPLATE_IDS]).toEqual(['data', 'persisted']);
    expect(isRemovedBuiltInTemplateId('data')).toBe(true);
    expect(isRemovedBuiltInTemplateId('basic')).toBe(false);
    expect(getRemovedBuiltInTemplateMessage('persisted')).toBe(
      'Built-in template "persisted" was removed. Use --template persistence --persistence-policy authenticated instead.',
    );
  });

  test('throws a helpful error for unknown template ids', () => {
    expect(() => getTemplateById('unknown-template')).toThrow(
      `Unknown template "unknown-template". Expected one of: basic, interactivity, persistence, compound, query-loop, ${OFFICIAL_WORKSPACE_TEMPLATE_ALIAS}, ${OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE}`,
    );
  });
});
