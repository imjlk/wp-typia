import { afterAll, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  getMutableBlockHooks,
  readWorkspaceBlockJson,
  resolveWorkspaceBlock,
} from '../src/runtime/cli-add-block-json.js';
import {
  assertAbilityDoesNotExist,
  assertAdminViewDoesNotExist,
  assertAiFeatureDoesNotExist,
  assertContractDoesNotExist,
  assertPostMetaDoesNotExist,
  assertRestResourceDoesNotExist,
  assertScaffoldDoesNotExist,
  assertVariationDoesNotExist,
} from '../src/runtime/cli-add-collision.js';
import { readOptionalFile } from '../src/runtime/cli-add-filesystem.js';
import {
  assertValidManualRestContractAuth,
  assertValidGeneratedSlug,
  assertValidRestResourceMethods,
  assertValidRestResourceNamespace,
  assertValidTypeScriptIdentifier,
  assertValidPostMetaPostType,
  resolvePostMetaKey,
  resolveManualRestContractPathPattern,
  resolveRestResourceNamespace,
} from '../src/runtime/cli-add-validation.js';
import type { WorkspaceInventory } from '../src/runtime/workspace-inventory.js';

const runtimeRoot = path.join(import.meta.dir, '..', 'src', 'runtime', 'add');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-typia-add-shared-'));

afterAll(() => {
  fs.rmSync(tempRoot, { force: true, recursive: true });
});

function readRuntimeSource(fileName: string): string {
  return fs.readFileSync(path.join(runtimeRoot, fileName), 'utf8');
}

function createEmptyInventory(
  overrides: Partial<WorkspaceInventory> = {},
): WorkspaceInventory {
  return {
    abilities: [],
    adminViews: [],
    aiFeatures: [],
    bindingSources: [],
    blockConfigPath: 'scripts/block-config.ts',
    blocks: [],
    blockStyles: [],
    blockTransforms: [],
    contracts: [],
    editorPlugins: [],
    hasAbilitiesSection: false,
    hasAdminViewsSection: false,
    hasAiFeaturesSection: false,
    hasBindingSourcesSection: false,
    hasBlockStylesSection: false,
    hasBlockTransformsSection: false,
    hasContractsSection: false,
    hasEditorPluginsSection: false,
    hasPatternsSection: false,
    hasPostMetaSection: false,
    hasRestResourcesSection: false,
    hasVariationsSection: false,
    patterns: [],
    postMeta: [],
    restResources: [],
    source: '',
    variations: [],
    ...overrides,
  };
}

test('shared add runtime keeps compatibility exports around focused modules', () => {
  const sharedSource = readRuntimeSource('cli-add-shared.ts');

  expect(sharedSource).toContain('export * from "./cli-add-types.js";');
  expect(sharedSource).toContain('export * from "./cli-add-validation.js";');
  expect(sharedSource).toContain('export * from "./cli-add-filesystem.js";');
  expect(sharedSource).toContain('export * from "./cli-add-block-json.js";');
  expect(sharedSource).toContain('export * from "./cli-add-collision.js";');
  expect(sharedSource).toContain('export * from "./cli-add-help.js";');
  expect(sharedSource).toContain('from "../templates/scaffold-identifiers.js"');
  expect(sharedSource).not.toContain(
    'export interface RunAddBlockCommandOptions',
  );
  expect(sharedSource).not.toContain('export function assertValidGeneratedSlug');
  expect(sharedSource).not.toContain('export async function patchFile');
  expect(sharedSource).not.toContain(
    'export function assertScaffoldDoesNotExist',
  );
  expect(sharedSource).not.toContain('export function formatAddHelpText');
});

test('converted async add helpers do not use sync filesystem probes', () => {
  for (const fileName of ['cli-add-workspace.ts', 'cli-add-block-json.ts']) {
    expect(readRuntimeSource(fileName)).not.toMatch(
      /\bfs\.(?:readdirSync|readFileSync|existsSync)\b/u,
    );
  }
});

test('focused add runtime modules own their helper categories', () => {
  const addKindIdsSource = readRuntimeSource('cli-add-kind-ids.ts');
  const typesSource = readRuntimeSource('cli-add-types.ts');
  const validationSource = readRuntimeSource('cli-add-validation.ts');
  const filesystemSource = readRuntimeSource('cli-add-filesystem.ts');
  const blockJsonSource = readRuntimeSource('cli-add-block-json.ts');
  const collisionSource = readRuntimeSource('cli-add-collision.ts');
  const helpSource = readRuntimeSource('cli-add-help.ts');

  expect(addKindIdsSource).toContain('export const ADD_KIND_IDS');
  expect(typesSource).toContain('export interface RunAddBlockCommandOptions');
  expect(typesSource).toContain('from "./cli-add-kind-ids.js"');
  expect(typesSource).toContain(
    'export type { AddKindId } from "./cli-add-kind-ids.js";',
  );
  expect(typesSource).not.toContain('export const ADD_KIND_IDS = [');
  expect(validationSource).toContain('export function assertValidGeneratedSlug');
  expect(validationSource).toContain(
    'export function assertValidTypeScriptIdentifier',
  );
  expect(validationSource).toContain(
    'export function assertValidRestResourceMethods',
  );
  expect(validationSource).toContain(
    'export function assertValidPostMetaPostType',
  );
  expect(validationSource).toContain(
    'export function assertValidEditorPluginSlot',
  );
  expect(filesystemSource).toContain(
    'export async function snapshotWorkspaceFiles',
  );
  expect(filesystemSource).toContain(
    'export async function rollbackWorkspaceMutation',
  );
  expect(filesystemSource).not.toContain('function isFileNotFoundError');
  expect(blockJsonSource).toContain(
    'export async function readWorkspaceBlockJson',
  );
  expect(blockJsonSource).toContain('export function getMutableBlockHooks');
  expect(collisionSource).toContain(
    'function assertAddKindScaffoldDoesNotExist',
  );
  expect(collisionSource).toContain(
    'export function assertScaffoldDoesNotExist',
  );
  expect(collisionSource).toContain(
    'export function assertEditorPluginDoesNotExist',
  );
  expect(helpSource).toContain('export function formatAddHelpText');
  expect(helpSource).toContain('REST_RESOURCE_METHOD_IDS.join(",")');
});

// Filesystem mutation helpers and add help rendering stay covered by their
// existing boundary and integration tests; these unit tests focus on the pure
// validation, collision, optional filesystem, and block-json helper seams.
test('focused validation helpers accept generated slugs and reject malformed values', () => {
  expect(
    assertValidGeneratedSlug(
      'Pattern name',
      'hero-card',
      'wp-typia add pattern <name>',
    ),
  ).toBe('hero-card');

  expect(() =>
    assertValidGeneratedSlug(
      'Pattern name',
      '',
      'wp-typia add pattern <name>',
    ),
  ).toThrow('Pattern name is required. Use `wp-typia add pattern <name>`.');
  expect(() =>
    assertValidGeneratedSlug(
      'Pattern name',
      'HeroCard',
      'wp-typia add pattern <name>',
    ),
  ).toThrow(
    'Pattern name must start with a letter and contain only lowercase letters, numbers, and hyphens.',
  );
  expect(() =>
    assertValidGeneratedSlug(
      'Pattern name',
      '1-hero',
      'wp-typia add pattern <name>',
    ),
  ).toThrow(
    'Pattern name must start with a letter and contain only lowercase letters, numbers, and hyphens.',
  );
});

test('focused validation helpers normalize REST namespaces, methods, and manual route inputs', () => {
  expect(assertValidRestResourceNamespace(' demo-space/v1 ')).toBe(
    'demo-space/v1',
  );
  expect(resolveRestResourceNamespace('demo-space')).toBe('demo-space/v1');
  expect(assertValidRestResourceMethods()).toEqual(['list', 'read', 'create']);
  expect(assertValidRestResourceMethods('list, read, list, delete')).toEqual([
    'list',
    'read',
    'delete',
  ]);
  expect(assertValidManualRestContractAuth(' Authenticated ')).toBe(
    'authenticated',
  );
  expect(resolveManualRestContractPathPattern('external-record')).toBe(
    '/external-record',
  );
  expect(resolveManualRestContractPathPattern('external-record', ' records ')).toBe(
    '/records',
  );
  expect(assertValidPostMetaPostType('example_post_type')).toBe(
    'example_post_type',
  );
  expect(
    resolvePostMetaKey({
      phpPrefix: 'demo_space',
      slug: 'integration-state',
    }),
  ).toBe('_demo_space_integration_state');

  expect(() => assertValidRestResourceNamespace('')).toThrow(
    'REST resource namespace is required. Use `--namespace <vendor/v1>` or let the workspace default apply.',
  );
  expect(() => assertValidRestResourceNamespace('DemoSpace/v1')).toThrow(
    'REST resource namespace must use lowercase slash-separated segments like `demo-space/v1`.',
  );
  expect(() => assertValidRestResourceNamespace('demo-space')).toThrow(
    'REST resource namespace must use lowercase slash-separated segments like `demo-space/v1`.',
  );
  expect(() => assertValidRestResourceMethods('list, publish')).toThrow(
    'REST resource methods must be a comma-separated list of: list, read, create, update, delete.',
  );
  expect(() => assertValidRestResourceMethods(',,')).toThrow(
    'REST resource methods must include at least one of: list, read, create, update, delete.',
  );
  expect(() =>
    resolveManualRestContractPathPattern('external-record', '   '),
  ).toThrow('Manual REST contract path is required');
  expect(() => assertValidPostMetaPostType('Example Post')).toThrow(
    'Post meta post type must use a WordPress post type key',
  );
  expect(() => assertValidPostMetaPostType('twenty_one_characters')).toThrow(
    'Post meta post type must be 20 characters or fewer.',
  );
  expect(() =>
    resolvePostMetaKey({
      metaKey: 'bad key',
      phpPrefix: 'demo_space',
      slug: 'integration-state',
    }),
  ).toThrow('Post meta key must not contain whitespace');
  expect(() =>
    resolvePostMetaKey({
      metaKey: '_bad\u007fkey',
      phpPrefix: 'demo_space',
      slug: 'integration-state',
    }),
  ).toThrow('Post meta key must not contain whitespace');
});

test('focused validation helpers accept TypeScript identifiers and reject malformed type names', () => {
  expect(
    assertValidTypeScriptIdentifier(
      'Contract type',
      ' ExternalRetrieveResponse ',
      'wp-typia add contract <name> [--type <ExportedTypeName>]',
    ),
  ).toBe('ExternalRetrieveResponse');

  expect(() =>
    assertValidTypeScriptIdentifier(
      'Contract type',
      '',
      'wp-typia add contract <name> [--type <ExportedTypeName>]',
    ),
  ).toThrow(
    'Contract type is required. Use `wp-typia add contract <name> [--type <ExportedTypeName>]`.',
  );
  expect(() =>
    assertValidTypeScriptIdentifier(
      'Contract type',
      'external-response',
      'wp-typia add contract <name> [--type <ExportedTypeName>]',
    ),
  ).toThrow(
    'Contract type must be a valid TypeScript identifier, such as ExternalRetrieveResponse.',
  );
  for (const reservedName of ['class', 'default', 'interface']) {
    expect(() =>
      assertValidTypeScriptIdentifier(
        'Contract type',
        reservedName,
        'wp-typia add contract <name> [--type <ExportedTypeName>]',
      ),
    ).toThrow(
      `Contract type must not be a reserved TypeScript keyword, such as ${reservedName}.`,
    );
  }
});

test('shared add collision helper allows missing filesystem paths and inventory entries', () => {
  expect(() =>
    assertScaffoldDoesNotExist({
      filesystemCollisions: [
        {
          label: 'A pattern',
          relativePath: 'src/patterns/hero.php',
        },
      ],
      inventoryCollision: {
        entries: [],
        exists: () => false,
        message: 'inventory collision',
      },
      projectDir: tempRoot,
    }),
  ).not.toThrow();
});

test('shared add collision helper preserves filesystem collision messages', () => {
  const projectDir = path.join(tempRoot, 'filesystem-collision');
  const patternPath = path.join(projectDir, 'src', 'patterns', 'hero.php');
  fs.mkdirSync(path.dirname(patternPath), { recursive: true });
  fs.writeFileSync(patternPath, '<?php\n', 'utf8');

  expect(() =>
    assertScaffoldDoesNotExist({
      filesystemCollisions: [
        {
          label: 'A pattern',
          relativePath: path.join('src', 'patterns', 'hero.php'),
        },
      ],
      projectDir,
    }),
  ).toThrow(
    'A pattern already exists at src/patterns/hero.php. Choose a different name.',
  );
});

test('shared add collision helper preserves inventory collision messages', () => {
  expect(() =>
    assertScaffoldDoesNotExist({
      inventoryCollision: {
        entries: [{ slug: 'hero' }],
        exists: (entry) => entry.slug === 'hero',
        message: 'A pattern inventory entry already exists for hero. Choose a different name.',
      },
      filesystemCollisions: [],
      projectDir: tempRoot,
    }),
  ).toThrow(
    'A pattern inventory entry already exists for hero. Choose a different name.',
  );
});

test('focused collision helpers reject duplicate variation files and inventory entries', () => {
  const projectDir = path.join(tempRoot, 'variation-collision');
  const variationPath = path.join(
    projectDir,
    'src',
    'blocks',
    'counter-card',
    'variations',
    'hero-card.ts',
  );
  fs.mkdirSync(path.dirname(variationPath), { recursive: true });
  fs.writeFileSync(variationPath, 'export {};\n', 'utf8');

  expect(() =>
    assertVariationDoesNotExist(
      projectDir,
      'counter-card',
      'hero-card',
      createEmptyInventory(),
    ),
  ).toThrow(
    'A variation already exists at src/blocks/counter-card/variations/hero-card.ts. Choose a different name.',
  );

  expect(() =>
    assertVariationDoesNotExist(
      tempRoot,
      'counter-card',
      'hero-card',
      createEmptyInventory({
        variations: [
          {
            block: 'counter-card',
            file: 'src/blocks/counter-card/variations/hero-card.ts',
            slug: 'hero-card',
          },
        ],
      }),
    ),
  ).toThrow(
    'A variation inventory entry already exists for counter-card/hero-card. Choose a different name.',
  );
});

test('focused collision helpers check every REST resource filesystem target', () => {
  const projectDir = path.join(tempRoot, 'rest-resource-collision');
  const bootstrapPath = path.join(projectDir, 'inc', 'rest', 'products.php');
  fs.mkdirSync(path.dirname(bootstrapPath), { recursive: true });
  fs.writeFileSync(bootstrapPath, '<?php\n', 'utf8');

  expect(() =>
    assertRestResourceDoesNotExist(
      projectDir,
      'products',
      createEmptyInventory(),
    ),
  ).toThrow(
    'A REST resource bootstrap already exists at inc/rest/products.php. Choose a different name.',
  );
});

test('focused collision helpers check post meta filesystem and inventory targets', () => {
  const projectDir = path.join(tempRoot, 'post-meta-collision');
  const phpPath = path.join(projectDir, 'inc', 'post-meta', 'integration-state.php');
  fs.mkdirSync(path.dirname(phpPath), { recursive: true });
  fs.writeFileSync(phpPath, '<?php\n', 'utf8');

  expect(() =>
    assertPostMetaDoesNotExist(
      projectDir,
      'integration-state',
      'post',
      '_demo_space_integration_state',
      createEmptyInventory(),
    ),
  ).toThrow(
    'A post meta bootstrap already exists at inc/post-meta/integration-state.php. Choose a different name.',
  );

  fs.rmSync(projectDir, { force: true, recursive: true });
  expect(() =>
    assertPostMetaDoesNotExist(
      projectDir,
      'alternate-state',
      'post',
      '_demo_space_integration_state',
      createEmptyInventory({
        postMeta: [
          {
            metaKey: '_demo_space_integration_state',
            phpFile: 'inc/post-meta/integration-state.php',
            postType: 'post',
            schemaFile: 'src/post-meta/integration-state/meta.schema.json',
            showInRest: true,
            slug: 'integration-state',
            sourceTypeName: 'IntegrationStateMeta',
            typesFile: 'src/post-meta/integration-state/types.ts',
          },
        ],
      }),
    ),
  ).toThrow(
    'A post meta inventory entry already registers _demo_space_integration_state for post. Choose a different meta key or post type.',
  );
});

test('focused collision helpers check standalone contract filesystem targets', () => {
  const projectDir = path.join(tempRoot, 'contract-collision');
  const schemaPath = path.join(
    projectDir,
    'src',
    'contracts',
    'external-response.schema.json',
  );
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
  fs.writeFileSync(schemaPath, '{}\n', 'utf8');

  expect(() =>
    assertContractDoesNotExist(
      projectDir,
      'external-response',
      createEmptyInventory(),
    ),
  ).toThrow(
    'A standalone contract schema already exists at src/contracts/external-response.schema.json. Choose a different name.',
  );
});

test('descriptor-backed collision helpers preserve representative add-kind messages', () => {
  const projectDir = path.join(tempRoot, 'descriptor-collision');
  const adminViewDir = path.join(projectDir, 'src', 'admin-views', 'reports');
  const abilityDir = path.join(projectDir, 'src', 'abilities', 'review-workflow');
  const aiFeatureBootstrapPath = path.join(
    projectDir,
    'inc',
    'ai-features',
    'brief-suggestions.php',
  );
  fs.mkdirSync(adminViewDir, { recursive: true });
  fs.mkdirSync(abilityDir, { recursive: true });
  fs.mkdirSync(path.dirname(aiFeatureBootstrapPath), { recursive: true });
  fs.writeFileSync(aiFeatureBootstrapPath, '<?php\n', 'utf8');

  expect(() =>
    assertAdminViewDoesNotExist(projectDir, 'reports', createEmptyInventory()),
  ).toThrow(
    'An admin view already exists at src/admin-views/reports. Choose a different name.',
  );
  expect(() =>
    assertAbilityDoesNotExist(
      projectDir,
      'review-workflow',
      createEmptyInventory(),
    ),
  ).toThrow(
    'An ability scaffold already exists at src/abilities/review-workflow. Choose a different name.',
  );
  expect(() =>
    assertAiFeatureDoesNotExist(
      projectDir,
      'brief-suggestions',
      createEmptyInventory(),
    ),
  ).toThrow(
    'An AI feature bootstrap already exists at inc/ai-features/brief-suggestions.php. Choose a different name.',
  );
});

test('shared optional file reader returns null for missing paths and reads existing files', async () => {
  const filePath = path.join(tempRoot, 'optional-file.txt');

  await expect(readOptionalFile(filePath)).resolves.toBeNull();
  fs.writeFileSync(filePath, 'hello\n', 'utf8');
  await expect(readOptionalFile(filePath)).resolves.toBe('hello\n');
});

test('focused block-json helpers resolve workspace blocks and read metadata', async () => {
  const projectDir = path.join(tempRoot, 'block-json-read');
  const blockJsonPath = path.join(
    projectDir,
    'src',
    'blocks',
    'counter-card',
    'block.json',
  );
  const inventory = createEmptyInventory({
    blocks: [
      {
        slug: 'counter-card',
        typesFile: 'src/blocks/counter-card/types.ts',
      },
    ],
  });

  fs.mkdirSync(path.dirname(blockJsonPath), { recursive: true });
  fs.writeFileSync(
    blockJsonPath,
    `${JSON.stringify({ name: 'demo/counter-card', title: 'Counter Card' })}\n`,
    'utf8',
  );

  expect(resolveWorkspaceBlock(inventory, 'counter-card').typesFile).toBe(
    'src/blocks/counter-card/types.ts',
  );
  expect(() => resolveWorkspaceBlock(inventory, 'missing-card')).toThrow(
    'Unknown workspace block "missing-card". Choose one of: counter-card',
  );

  const { blockJson, blockJsonPath: resolvedBlockJsonPath } =
    await readWorkspaceBlockJson(projectDir, 'counter-card');
  expect(resolvedBlockJsonPath).toBe(blockJsonPath);
  expect(blockJson).toMatchObject({
    name: 'demo/counter-card',
    title: 'Counter Card',
  });
  await expect(
    readWorkspaceBlockJson(projectDir, 'missing-card'),
  ).rejects.toThrow(
    'Missing src/blocks/missing-card/block.json for workspace block "missing-card".',
  );
});

test('focused block-json helpers create mutable hooks and reject malformed hook maps', () => {
  const withoutHooks: Record<string, unknown> = {
    name: 'demo/counter-card',
  };
  const hooks = getMutableBlockHooks(withoutHooks, 'src/block.json');
  hooks['core/post-content'] = 'before';

  expect(withoutHooks.blockHooks).toEqual({
    'core/post-content': 'before',
  });

  const existingHooks: { blockHooks: Record<string, string> } = {
    blockHooks: {
      'core/query': 'after',
    },
  };
  expect(getMutableBlockHooks(existingHooks, 'src/block.json')).toBe(
    existingHooks.blockHooks,
  );
  expect(() =>
    getMutableBlockHooks({ blockHooks: [] }, 'src/block.json'),
  ).toThrow('src/block.json must define blockHooks as an object when present.');
});
