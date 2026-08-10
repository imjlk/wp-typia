import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  cleanupScaffoldTempRoot,
  createScaffoldTempRoot,
  entryPath,
  getCommandErrorMessage,
  linkWorkspaceNodeModules,
  parseJsonObjectFromOutput,
  runCapturedCli,
  runCli,
  runGeneratedScript,
  scaffoldOfficialWorkspace,
  templateLayerFixturePath,
  templateLayerWorkspaceAmbiguousFixturePath,
  templateLayerWorkspaceFixturePath,
  typecheckGeneratedProject,
  workspaceTemplatePackageManifest,
} from './helpers/scaffold-test-harness.js';
import {
  runAddBlockCommand,
  runAddCoreVariationCommand,
  runAddPatternCommand,
} from '../src/runtime/cli-core.js';
import { scaffoldProject } from '../src/runtime/index.js';

const GENERATED_PROJECT_BUILD_TIMEOUT_MS = 300_000;
const sharedWebpackEntryLoopSource =
  `\tfor (const [entryName, candidates] of [\n\t\t['bindings/index', ['src/bindings/index.ts', 'src/bindings/index.js']],\n\t\t[\n\t\t\t'editor-plugins/index',\n\t\t\t['src/editor-plugins/index.ts', 'src/editor-plugins/index.js'],\n\t\t],\n\t\t[\n\t\t\t'admin-views/index',\n\t\t\t['src/admin-views/index.ts', 'src/admin-views/index.js'],\n\t\t],\n\t]) {\n\t\tfor (const relativePath of candidates) {\n\t\t\tconst entryPath = path.resolve(process.cwd(), relativePath);\n\t\t\tif (!fs.existsSync(entryPath)) {\n\t\t\t\tcontinue;\n\t\t\t}\n\n\t\t\tentries.push([entryName, entryPath]);\n\t\t\tbreak;\n\t\t}\n\t}`;

const legacyValidatorToolkitSource = [
  "import { parseManifestDefaultsDocument } from '@wp-typia/block-runtime/defaults';",
  'import {',
  '\tcreateScaffoldValidatorToolkit,',
  '\ttype ScaffoldValidatorToolkitOptions,',
  "} from '@wp-typia/block-runtime/validation';",
  '',
  'interface TemplateValidatorToolkitOptions< T extends object > {',
  "\tfinalize?: ScaffoldValidatorToolkitOptions< T >['finalize'];",
  '\tmanifest: unknown;',
  "\tonValidationError?: ScaffoldValidatorToolkitOptions< T >['onValidationError'];",
  '}',
  '',
  'export function createTemplateValidatorToolkit< T extends object >( {',
  '\tfinalize,',
  '\tmanifest,',
  '\tonValidationError,',
  '}: TemplateValidatorToolkitOptions< T > ) {',
  '\treturn createScaffoldValidatorToolkit< T >( {',
  '\t\tmanifest: parseManifestDefaultsDocument( manifest ),',
  '\t\tfinalize,',
  '\t\tonValidationError,',
  '\t} );',
  '}',
  '',
].join('\n');

function writeLegacyValidatorToolkitFixture(targetDir: string) {
  fs.writeFileSync(
    path.join(targetDir, 'src', 'validator-toolkit.ts'),
    legacyValidatorToolkitSource,
    'utf8',
  );
}

function writeLegacyCompoundValidatorFixture(
  targetDir: string,
  blockSlug: string,
  typeName: string,
  exportSuffix: string,
  options?: {
    includeImportStringDecoy?: boolean;
    includeTypiaImport?: boolean;
    lineEnding?: '\n' | '\r\n';
    quoteStyle?: "'" | '"';
  },
) {
  const includeImportStringDecoy =
    options?.includeImportStringDecoy ?? false;
  const includeTypiaImport = options?.includeTypiaImport ?? false;
  const lineEnding = options?.lineEnding ?? '\n';
  const quoteStyle = options?.quoteStyle ?? "'";

  fs.writeFileSync(
    path.join(targetDir, 'src', 'blocks', blockSlug, 'validators.ts'),
    [
      ...(includeTypiaImport
        ? [`import typia from ${quoteStyle}typia${quoteStyle};`]
        : []),
      `import currentManifest from ${quoteStyle}./typia.manifest.json${quoteStyle};`,
      'import type {',
      `\t${typeName},`,
      `} from ${quoteStyle}./types${quoteStyle};`,
      `import { createTemplateValidatorToolkit } from ${quoteStyle}../../validator-toolkit${quoteStyle};`,
      '',
      ...(includeImportStringDecoy
        ? [`export const legacyImportString = 'from "typia"';`, '']
        : []),
      `const scaffoldValidators = createTemplateValidatorToolkit< ${typeName} >( {`,
      '\tmanifest: currentManifest,',
      '} );',
      '',
      `export const validate${exportSuffix} =`,
      '\tscaffoldValidators.validateAttributes;',
      '',
      'export const validators = scaffoldValidators.validators;',
      '',
      `export const sanitize${exportSuffix} =`,
      '\tscaffoldValidators.sanitizeAttributes;',
      '',
      'export const createAttributeUpdater = scaffoldValidators.createAttributeUpdater;',
      '',
    ].join(lineEnding),
    'utf8',
  );
}

function replaceFixtureSource(
  source: string,
  searchValue: string | RegExp,
  replaceValue: string,
  label: string,
): string {
  const nextSource = source.replace(searchValue, replaceValue);
  if (nextSource === source) {
    throw new Error(`Expected fixture rewrite to update ${label}.`);
  }

  return nextSource;
}

function createLegacySyncRestSourceWithoutContractAndRestResources(
  source: string,
): string {
  let nextSource = replaceFixtureSource(
    source,
    /import\s*\{\s*BLOCKS,\s*CONTRACTS,\s*POST_META,\s*REST_RESOURCES,\s*type WorkspaceBlockConfig,\s*type WorkspaceContractConfig,\s*type WorkspacePostMetaConfig,\s*type WorkspaceRestResourceConfig,\s*\}\s*from\s*'\.\/block-config';/u,
    [
      'import {',
      '  BLOCKS,',
      '  type WorkspaceBlockConfig,',
      '  type WorkspaceRestResourceConfig,',
      "} from './block-config';",
    ].join('\n'),
    'legacy sync-rest import',
  );
  nextSource = replaceFixtureSource(
    nextSource,
    /\nfunction isWorkspaceStandaloneContract\([\s\S]*?\n\}\n/u,
    '',
    'standalone contract type guard',
  );
  nextSource = replaceFixtureSource(
    nextSource,
    /\nfunction isWorkspacePostMetaContract\([\s\S]*?\n\}\n/u,
    '',
    'post-meta contract type guard',
  );
  nextSource = replaceFixtureSource(
    nextSource,
    /\nfunction isWorkspaceRestResource\([\s\S]*?\n\}\n/u,
    '',
    'REST resource type guard',
  );
  nextSource = replaceFixtureSource(
    nextSource,
    /\n[ \t]*const standaloneContracts = CONTRACTS\.filter\(\s*isWorkspaceStandaloneContract\s*,?\s*\);/u,
    '',
    'standalone contract filter',
  );
  nextSource = replaceFixtureSource(
    nextSource,
    /\n[ \t]*const postMetaContracts = POST_META\.filter\(\s*isWorkspacePostMetaContract\s*,?\s*\);/u,
    '',
    'post-meta contract filter',
  );
  nextSource = replaceFixtureSource(
    nextSource,
    /\n[ \t]*const restResources = REST_RESOURCES\.filter\(\s*isWorkspaceRestResource\s*,?\s*\);/u,
    '',
    'REST resource filter',
  );
  nextSource = replaceFixtureSource(
    nextSource,
    /\n[ \t]*if \(\s*restBlocks\.length === 0 &&\s*standaloneContracts\.length === 0(?:\s*&&\s*postMetaContracts\.length === 0)? &&\s*restResources\.length === 0\s*\) \{[\s\S]*?\n[ \t]{2}\}/u,
    [
      '\n  if (restBlocks.length === 0) {',
      '    console.log(',
      '      options.check',
      "        ? 'ℹ️ No REST-enabled workspace blocks are registered yet. `sync-rest --check` is already clean.'",
      "        : 'ℹ️ No REST-enabled workspace blocks are registered yet.',",
      '    );',
      '    return;',
      '  }',
    ].join('\n'),
    'no-resources guard',
  );

  return nextSource
    .replace(
      /\n[ \t]*for\s*\(\s*const contract of standaloneContracts\s*\)\s*\{[\s\S]*?\n[ \t]{2}\}\n/u,
      '\n',
    )
    .replace(
      /\n[ \t]*for\s*\(\s*const postMeta of postMetaContracts\s*\)\s*\{[\s\S]*?\n[ \t]{2}\}\n/u,
      '\n',
    )
    .replace(
      /\n[ \t]*for\s*\(\s*const resource of restResources\s*\)\s*\{[\s\S]*?\n[ \t]{2}\}\n\n[ \t]*console\.log\(/u,
      '\n  console.log(',
    )
    .replace(
      '✅ REST contract schemas, standalone schemas, post meta schemas, portable API clients, and endpoint-aware OpenAPI documents are already up to date for workspace blocks, standalone contracts, post meta contracts, and plugin-level resources!',
      '✅ REST contract schemas, portable API clients, and endpoint-aware OpenAPI documents are already up to date with the TypeScript types!',
    )
    .replace(
      '✅ REST contract schemas, standalone schemas, post meta schemas, portable API clients, and endpoint-aware OpenAPI documents generated for workspace blocks, standalone contracts, post meta contracts, and plugin-level resources!',
      '✅ REST contract schemas, portable API clients, and endpoint-aware OpenAPI documents generated from TypeScript types!',
    );
}

describe('@wp-typia/project-tools workspace add', () => {
  const tempRoot = createScaffoldTempRoot('wp-typia-workspace-add-');

  afterAll(() => {
    cleanupScaffoldTempRoot(tempRoot);
  });

test('canonical CLI can add a basic block to an official workspace template', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-basic');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add basic',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-basic',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Basic',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );

  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const syncTypesSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'sync-types-to-block-json.ts'),
    'utf8',
  );
  const indexSource = fs.readFileSync(
    path.join(targetDir, 'src', 'blocks', 'counter-card', 'index.tsx'),
    'utf8',
  );
  const blockJson = JSON.parse(
    fs.readFileSync(
      path.join(targetDir, 'src', 'blocks', 'counter-card', 'block.json'),
      'utf8',
    ),
  );

  expect(blockConfigSource).toContain('defineBlockNesting');
  expect(blockConfigSource).toContain('defineInnerBlocksTemplates');
  expect(blockConfigSource).toContain('export const BLOCK_NESTING');
  expect(blockConfigSource).toContain('export const BLOCK_TEMPLATES');
  expect(blockConfigSource).toContain("slug: 'counter-card'");
  expect(syncTypesSource).toContain('syncInnerBlocksTemplateModule');
  expect(syncTypesSource).toContain('validateBlockPatternContentNesting');
  expect(syncTypesSource).toContain('PATTERNS');
  expect(syncTypesSource).toContain('validateInnerBlocksTemplates');
  expect(syncTypesSource).toContain('validateBlockNestingContract');
  expect(syncTypesSource).toContain('allowExternalBlockNames: true');
  expect(syncTypesSource).toContain('inner-blocks-templates.ts');
  expect(syncTypesSource).toContain('nesting: BLOCK_NESTING');
  expect(indexSource).toContain("import '../../collection';");
  expect(blockJson.name).toBe('demo-space/counter-card');
  typecheckGeneratedProject(targetDir);
  runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts', [
    '--check',
  ]);

  const blockConfigPath = path.join(targetDir, 'scripts', 'block-config.ts');
  fs.writeFileSync(
    blockConfigPath,
    blockConfigSource
      .replace(
        '  // Add parent, ancestor, and allowedBlocks relationships here.',
        "  'demo-space/counter-card': {\n    allowedBlocks: ['core/group'],\n  },",
      )
      .replace(
        '  // Add default InnerBlocks templates here.',
        "  'demo-space/counter-card': [\n    ['core/group', { layout: { type: 'constrained' } }],\n  ],",
      ),
    'utf8',
  );
  runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts');
  const blockJsonWithNesting = JSON.parse(
    fs.readFileSync(
      path.join(targetDir, 'src', 'blocks', 'counter-card', 'block.json'),
      'utf8',
    ),
  );
  expect(blockJsonWithNesting.allowedBlocks).toEqual(['core/group']);
  const innerBlocksTemplateSource = fs.readFileSync(
    path.join(targetDir, 'src', 'inner-blocks-templates.ts'),
    'utf8',
  );
  expect(innerBlocksTemplateSource).toContain(
    'export const INNER_BLOCKS_TEMPLATES',
  );
  expect(innerBlocksTemplateSource).toContain("'demo-space/counter-card'");
  expect(innerBlocksTemplateSource).toContain("'core/group'");
  runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts', [
    '--check',
  ]);

  fs.mkdirSync(path.join(targetDir, 'src', 'patterns'), { recursive: true });
  fs.writeFileSync(
    path.join(targetDir, 'src', 'patterns', 'invalid-nesting.php'),
    [
      '<?php',
      'register_block_pattern(',
      "\t'demo-space/invalid-nesting',",
      '\tarray(',
      "\t\t'title' => 'Invalid nesting',",
      "\t\t'content' => '<!-- wp:demo-space/counter-card --><!-- wp:paragraph /--><!-- /wp:demo-space/counter-card -->',",
      '\t)',
      ');',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    blockConfigPath,
    fs
      .readFileSync(blockConfigPath, 'utf8')
      .replace(
        '  // wp-typia add pattern entries',
        "  {\n    file: 'src/patterns/invalid-nesting.php',\n    slug: 'invalid-nesting',\n  },\n  // wp-typia add pattern entries",
      ),
    'utf8',
  );
  const invalidPatternError = getCommandErrorMessage(() =>
    runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts', [
      '--check',
    ]),
  );
  expect(invalidPatternError).toContain(
    'Pattern content violates block nesting contract',
  );
  expect(invalidPatternError).toContain(
    'demo-space/counter-card.allowedBlocks does not include "core/paragraph"',
  );

  fs.writeFileSync(
    blockConfigPath,
    fs
      .readFileSync(blockConfigPath, 'utf8')
      .replace(
        "    allowedBlocks: ['core/group'],",
        "    allowedBlocks: ['demo-space/missing-child'],",
      ),
    'utf8',
  );
  expect(
    getCommandErrorMessage(() =>
      runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts', [
        '--check',
      ]),
    ),
  ).toContain('allowedBlocks references unknown block "demo-space/missing-child"');
}, 20_000);

test('canonical CLI can add a basic block with an external layer package', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-basic-layered');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add basic layered',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-basic-layered',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Basic Layered',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'counter-card',
      '--template',
      'basic',
      '--external-layer-source',
      templateLayerWorkspaceFixturePath,
    ],
    {
      cwd: targetDir,
    },
  );
  expect(
    fs.existsSync(
      path.join(targetDir, 'src', 'blocks', 'counter-card', 'block-telemetry.ts'),
    ),
  ).toBe(true);
  expect(
    fs.readFileSync(
      path.join(targetDir, 'src', 'blocks', 'counter-card', 'block-telemetry.ts'),
      'utf8',
    ),
  ).toContain('counter-card-telemetry');
  typecheckGeneratedProject(targetDir);
}, 20_000);

test('runAddBlockCommand can select an external layer when multiple workspace-safe roots are available', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-basic-layered-prompt');
  let promptedOptions: Array<{
    description?: string;
    extends: string[];
    id: string;
  }> = [];

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add basic layered prompt',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-basic-layered-prompt',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Basic Layered Prompt',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  const result = await runAddBlockCommand({
    blockName: 'counter-card',
    cwd: targetDir,
    externalLayerSource: templateLayerWorkspaceAmbiguousFixturePath,
    selectExternalLayerId: async (options) => {
      promptedOptions = options;
      return 'acme/beta';
    },
    templateId: 'basic',
  });

  expect(promptedOptions).toEqual([
    {
      description: 'Alpha block-local workspace layer',
      extends: ['acme/internal-base'],
      id: 'acme/alpha',
    },
    {
      description: 'Beta block-local workspace layer',
      extends: ['acme/internal-base'],
      id: 'acme/beta',
    },
  ]);
  expect(result.warnings).toContain(
    `Applied external layer "acme/beta" from "${templateLayerWorkspaceAmbiguousFixturePath}".`,
  );
  expect(
    fs.readFileSync(
      path.join(targetDir, 'src', 'blocks', 'counter-card', 'base.txt'),
      'utf8',
    ),
  ).toContain('base workspace layer for counter-card');
  expect(
    fs.readFileSync(
      path.join(targetDir, 'src', 'blocks', 'counter-card', 'beta.txt'),
      'utf8',
    ),
  ).toContain('beta workspace layer for counter-card');
  typecheckGeneratedProject(targetDir);
}, 20_000);

test('canonical CLI resolves add-block local external layer paths from the caller cwd', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-basic-layered-relative');
  let nestedCwd = path.join(targetDir, 'src');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add basic layered relative',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-basic-layered-relative',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Basic Layered Relative',
    },
  });

  linkWorkspaceNodeModules(targetDir);
  nestedCwd = fs.realpathSync(nestedCwd);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'counter-card',
      '--template',
      'basic',
      '--external-layer-source',
      path.relative(nestedCwd, fs.realpathSync(templateLayerWorkspaceFixturePath)),
    ],
    {
      cwd: nestedCwd,
    },
  );

  expect(
    fs.readFileSync(
      path.join(targetDir, 'src', 'blocks', 'counter-card', 'block-telemetry.ts'),
      'utf8',
    ),
  ).toContain('counter-card-telemetry');
}, 20_000);

test('runAddBlockCommand explains when a block name normalizes to an empty slug', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-invalid-block-name');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add invalid block name',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-invalid-block-name',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Invalid Block Name',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  await expect(
    runAddBlockCommand({
      blockName: '!!!',
      cwd: targetDir,
      templateId: 'basic',
    }),
  ).rejects.toThrow(
    'Block name "!!!" normalizes to an empty slug. Use letters or numbers so wp-typia can generate a block slug.',
  );
}, 20_000);

test('add block rollback restores a bootstrap migrated during manifest sync', async () => {
  const slug = 'demo-workspace-add-block-manifest-rollback';
  const targetDir = path.join(tempRoot, slug);
  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add block manifest rollback',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug,
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Block Manifest Rollback',
    },
  });
  linkWorkspaceNodeModules(targetDir);
  const bootstrapPath = path.join(targetDir, `${slug}.php`);
  const legacyBootstrap = fs.readFileSync(bootstrapPath, 'utf8').replace(
    "require_once __DIR__ . '/src/blocks/wp-typia-modules.php';",
    `foreach ( glob( __DIR__ . '/src/blocks/*/server.php' ) ?: array() as $server_module ) {
\trequire_once $server_module;
}`,
  );
  fs.writeFileSync(bootstrapPath, legacyBootstrap, 'utf8');
  fs.writeFileSync(
    path.join(targetDir, 'src/blocks/wp-typia-modules.php'),
    '<?php\n// Project-owned manifest.\n',
    'utf8',
  );

  await expect(runAddBlockCommand({
    blockName: 'rollback-card',
    cwd: targetDir,
    templateId: 'basic',
  })).rejects.toThrow('Refusing to overwrite unmanaged PHP entrypoint manifest');

  expect(fs.readFileSync(bootstrapPath, 'utf8')).toBe(legacyBootstrap);
  expect(
    fs.existsSync(path.join(targetDir, 'src/blocks/rollback-card')),
  ).toBe(false);
}, 20_000);

test('canonical CLI rejects add-block external layers that emit workspace-level files', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-basic-layered-root-output');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add basic layered root output',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-basic-layered-root-output',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Basic Layered Root Output',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  const commandError = getCommandErrorMessage(() =>
    runCli(
      'node',
      [
        entryPath,
        'add',
        'block',
        'counter-card',
        '--template',
        'basic',
        '--external-layer-source',
        templateLayerFixturePath,
        '--format',
        'text',
      ],
      {
        cwd: targetDir,
      },
    ),
  );

  expect(commandError).toMatch(
    /External layer "acme\/basic-observability" writes workspace-level output "inc\/observability\.php"/,
  );
  expect(
    fs.existsSync(path.join(targetDir, 'src', 'blocks', 'counter-card')),
  ).toBe(false);
}, 20_000);

test('runAddBlockCommand explains that query-loop is a create-time scaffold family', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-query-loop-unsupported',
  );

  await scaffoldOfficialWorkspace(targetDir);

  linkWorkspaceNodeModules(targetDir);

  await expect(
    runAddBlockCommand({
      blockName: 'query-listing',
      cwd: targetDir,
      templateId: 'query-loop',
    }),
  ).rejects.toThrow(
    '`wp-typia add block --template query-loop` is not supported. Query Loop is a create-time `core/query` variation scaffold, so use `wp-typia create <project-dir> --template query-loop` instead.',
  );
});

test('canonical CLI can add a variation to an official workspace template', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-variation');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add variation',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-variation',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Variation',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );
  runCli(
    'node',
    [entryPath, 'add', 'variation', 'hero-card', '--block', 'counter-card'],
    { cwd: targetDir },
  );

  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const blockIndexSource = fs.readFileSync(
    path.join(targetDir, 'src', 'blocks', 'counter-card', 'index.tsx'),
    'utf8',
  );
  const variationsIndexSource = fs.readFileSync(
    path.join(
      targetDir,
      'src',
      'blocks',
      'counter-card',
      'variations',
      'index.ts',
    ),
    'utf8',
  );
  const variationSource = fs.readFileSync(
    path.join(
      targetDir,
      'src',
      'blocks',
      'counter-card',
      'variations',
      'hero-card.ts',
    ),
    'utf8',
  );

  expect(blockConfigSource).toContain("block: 'counter-card'");
  expect(blockConfigSource).toContain("slug: 'hero-card'");
  expect(blockIndexSource).toContain('registerWorkspaceVariations');
  expect(blockIndexSource).toContain('registerWorkspaceVariations();');
  expect(variationsIndexSource).toContain('workspaceVariationHeroCardL4L4');
  expect(variationSource).toContain('BlockVariation');
  expect(variationSource).toContain(
    '@wp-typia/block-types/blocks/registration',
  );
  expect(variationSource).toContain('A starter variation for Hero Card.');

  const doctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doctorOutput);
  expect(
    doctorChecks.checks.find((check) => check.label === 'Workspace inventory')
      ?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Variation counter-card/hero-card',
    )?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Variation entrypoint counter-card',
    )?.status,
  ).toBe('pass');

  linkWorkspaceNodeModules(targetDir);
  runCli('npm', ['run', 'build'], { cwd: targetDir });
}, GENERATED_PROJECT_BUILD_TIMEOUT_MS);

test('canonical CLI can add core block variations without generating block manifests', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-core-variation');

  await scaffoldOfficialWorkspace(targetDir);

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [entryPath, 'add', 'core-variation', 'core/group', 'section-hero'],
    {
      cwd: targetDir,
    },
  );
  runCli(
    'node',
    [
      entryPath,
      'add',
      'core-variation',
      'editorial-paragraph',
      '--block',
      'core/paragraph',
    ],
    {
      cwd: targetDir,
    },
  );
  runCli(
    'node',
    [entryPath, 'add', 'core-variation', 'core/columns', 'columns-layout'],
    {
      cwd: targetDir,
    },
  );
  runCli(
    'node',
    [entryPath, 'add', 'core-variation', 'foo/bar-baz', 'shared-slug'],
    {
      cwd: targetDir,
    },
  );
  runCli(
    'node',
    [entryPath, 'add', 'core-variation', 'foo-bar/baz', 'shared-slug'],
    {
      cwd: targetDir,
    },
  );
  await expect(
    runAddCoreVariationCommand({
      cwd: targetDir,
      targetBlockName: 'core/group',
      variationName: 'index',
    }),
  ).rejects.toThrow('Core variation name must not normalize to `index`.');
  const knownCoreResult = await runAddCoreVariationCommand({
    cwd: targetDir,
    targetBlockName: 'core/heading',
    variationName: 'hero-heading',
  });
  expect(knownCoreResult.warnings).toBeUndefined();
  const thirdPartyResult = await runAddCoreVariationCommand({
    cwd: targetDir,
    targetBlockName: 'demo-space/feature-card',
    variationName: 'brand-feature',
  });
  expect(thirdPartyResult.warnings).toBeUndefined();
  const unknownCoreResult = await runAddCoreVariationCommand({
    cwd: targetDir,
    targetBlockName: 'core/groub',
    variationName: 'typo-target',
  });
  expect(unknownCoreResult.warnings).toEqual([
    'Target block "core/groub" uses the WordPress core namespace but is not in wp-typia\'s known core block list. The variation was generated for forward compatibility; verify the block name or update wp-typia if this is a newer core block.',
  ]);

  const editorPluginIndexSource = fs.readFileSync(
    path.join(targetDir, 'src', 'editor-plugins', 'index.ts'),
    'utf8',
  );
  const coreVariationsIndexSource = fs.readFileSync(
    path.join(targetDir, 'src', 'editor-plugins', 'core-variations', 'index.ts'),
    'utf8',
  );
  const groupVariationSource = fs.readFileSync(
    path.join(
      targetDir,
      'src',
      'editor-plugins',
      'core-variations',
      'core',
      'group',
      'section-hero.ts',
    ),
    'utf8',
  );
  const paragraphVariationSource = fs.readFileSync(
    path.join(
      targetDir,
      'src',
      'editor-plugins',
      'core-variations',
      'core',
      'paragraph',
      'editorial-paragraph.ts',
    ),
    'utf8',
  );
  const columnsVariationSource = fs.readFileSync(
    path.join(
      targetDir,
      'src',
      'editor-plugins',
      'core-variations',
      'core',
      'columns',
      'columns-layout.ts',
    ),
    'utf8',
  );

  expect(editorPluginIndexSource).toContain("import './core-variations';");
  expect(coreVariationsIndexSource).toContain('registerBlockVariation');
  expect(coreVariationsIndexSource).toContain('core/group');
  expect(coreVariationsIndexSource).toContain('core/paragraph');
  expect(coreVariationsIndexSource).toContain(
    'coreVariationCoreGroupSectionHeroL4L5L7L4',
  );
  expect(groupVariationSource).toContain('BlockVariation');
  expect(groupVariationSource).toContain('BlockTemplate');
  expect(groupVariationSource).toContain("category: 'design'");
  expect(groupVariationSource).toContain("icon: 'layout'");
  expect(groupVariationSource).toContain('keywords:');
  expect(groupVariationSource).toContain('innerBlocks:');
  expect(groupVariationSource).toContain("isActive: ['className']");
  expect(groupVariationSource).toContain(
    "scope: ['block', 'inserter', 'transform']",
  );
  expect(groupVariationSource).toContain("'core/heading'");
  expect(groupVariationSource).toContain("'core/paragraph'");
  expect(paragraphVariationSource).toContain(
    "export const CORE_PARAGRAPH_EDITORIAL_PARAGRAPH_BLOCK_NAME = 'core/paragraph'",
  );
  expect(paragraphVariationSource).toContain('[] satisfies BlockTemplate');
  expect(columnsVariationSource).toContain("'core/column'");
  expect(coreVariationsIndexSource).toContain('CORE_VARIATION_BLOCK_');
  expect(coreVariationsIndexSource).toContain('coreVariationEntry');
  expect(
    fs.existsSync(path.join(targetDir, 'src', 'blocks', 'core', 'group')),
  ).toBe(false);
  expect(
    fs.existsSync(path.join(targetDir, 'src', 'blocks', 'core-group')),
  ).toBe(false);
  expect(
    fs.existsSync(path.join(targetDir, 'src', 'blocks', 'core', 'paragraph')),
  ).toBe(false);
  expect(
    fs.existsSync(path.join(targetDir, 'src', 'blocks', 'core-paragraph')),
  ).toBe(false);
  expect(
    fs.existsSync(
      path.join(
        targetDir,
        'src',
        'editor-plugins',
        'core-variations',
        'core',
        'group',
        'index.ts',
      ),
    ),
  ).toBe(false);

  runCli('npm', ['run', 'build'], { cwd: targetDir });
}, GENERATED_PROJECT_BUILD_TIMEOUT_MS);

test('variation workflow keeps registry identifiers unique for similar slugs', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-variation-collision-safe',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace variation collision safe',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-variation-collision-safe',
      textDomain: 'demo-space',
      title: 'Demo Workspace Variation Collision Safe',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );
  runCli(
    'node',
    [entryPath, 'add', 'variation', 'hero-2-card', '--block', 'counter-card'],
    { cwd: targetDir },
  );
  runCli(
    'node',
    [entryPath, 'add', 'variation', 'hero2-card', '--block', 'counter-card'],
    { cwd: targetDir },
  );

  const variationsIndexSource = fs.readFileSync(
    path.join(
      targetDir,
      'src',
      'blocks',
      'counter-card',
      'variations',
      'index.ts',
    ),
    'utf8',
  );

  expect(variationsIndexSource).toContain(
    "import { workspaceVariationHero2CardL4L1L4 } from './hero-2-card';",
  );
  expect(variationsIndexSource).toContain(
    "import { workspaceVariationHero2CardL5L4 } from './hero2-card';",
  );

  runCli('npm', ['run', 'build'], { cwd: targetDir });
}, GENERATED_PROJECT_BUILD_TIMEOUT_MS);

test('add workflows preserve historical generated registry identifiers', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-historical-registry-identifiers',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace historical registry identifiers',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-historical-registry-identifiers',
      textDomain: 'demo-space',
      title: 'Demo Workspace Historical Registry Identifiers',
    },
  });
  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    { cwd: targetDir },
  );
  runCli(
    'node',
    [entryPath, 'add', 'variation', 'hero-card', '--block', 'counter-card'],
    { cwd: targetDir },
  );
  runCli(
    'node',
    [entryPath, 'add', 'style', 'callout-emphasis', '--block', 'counter-card'],
    { cwd: targetDir },
  );
  runCli(
    'node',
    [
      entryPath,
      'add',
      'transform',
      'quote-to-counter',
      '--from',
      'core/quote',
      '--to',
      'counter-card',
    ],
    { cwd: targetDir },
  );
  runCli(
    'node',
    [entryPath, 'add', 'core-variation', 'core/group', 'section-hero'],
    { cwd: targetDir },
  );

  const historicalModules = [
    {
      filePath: path.join(
        targetDir,
        'src',
        'blocks',
        'counter-card',
        'variations',
        'hero-card.ts',
      ),
      historicalName: 'workspaceVariation_hero_card',
      managedName: 'workspaceVariationHeroCardL4L4',
    },
    {
      filePath: path.join(
        targetDir,
        'src',
        'blocks',
        'counter-card',
        'styles',
        'callout-emphasis.ts',
      ),
      historicalName: 'workspaceBlockStyle_callout_emphasis',
      managedName: 'workspaceBlockStyleCalloutEmphasisL7L8',
    },
    {
      filePath: path.join(
        targetDir,
        'src',
        'blocks',
        'counter-card',
        'transforms',
        'quote-to-counter.ts',
      ),
      historicalName: 'workspaceBlockTransform_quote_to_counter',
      managedName: 'workspaceBlockTransformQuoteToCounterL5L2L7',
    },
    {
      filePath: path.join(
        targetDir,
        'src',
        'editor-plugins',
        'core-variations',
        'core',
        'group',
        'section-hero.ts',
      ),
      historicalName: 'coreVariation_core_group_section_hero',
      managedName: 'coreVariationCoreGroupSectionHeroL4L5L7L4',
    },
  ] as const;
  for (const historicalModule of historicalModules) {
    const source = fs.readFileSync(historicalModule.filePath, 'utf8');
    fs.writeFileSync(
      historicalModule.filePath,
      replaceFixtureSource(
        source,
        historicalModule.managedName,
        historicalModule.historicalName,
        `historical export ${historicalModule.historicalName}`,
      ),
      'utf8',
    );
  }

  runCli(
    'node',
    [entryPath, 'add', 'variation', 'gallery-card', '--block', 'counter-card'],
    { cwd: targetDir },
  );
  runCli(
    'node',
    [entryPath, 'add', 'style', 'soft-border', '--block', 'counter-card'],
    { cwd: targetDir },
  );
  runCli(
    'node',
    [
      entryPath,
      'add',
      'transform',
      'paragraph-to-counter',
      '--from',
      'core/paragraph',
      '--to',
      'counter-card',
    ],
    { cwd: targetDir },
  );
  runCli(
    'node',
    [entryPath, 'add', 'core-variation', 'core/group', 'feature-panel'],
    { cwd: targetDir },
  );

  const registrySources = [
    fs.readFileSync(
      path.join(
        targetDir,
        'src',
        'blocks',
        'counter-card',
        'variations',
        'index.ts',
      ),
      'utf8',
    ),
    fs.readFileSync(
      path.join(
        targetDir,
        'src',
        'blocks',
        'counter-card',
        'styles',
        'index.ts',
      ),
      'utf8',
    ),
    fs.readFileSync(
      path.join(
        targetDir,
        'src',
        'blocks',
        'counter-card',
        'transforms',
        'index.ts',
      ),
      'utf8',
    ),
    fs.readFileSync(
      path.join(
        targetDir,
        'src',
        'editor-plugins',
        'core-variations',
        'index.ts',
      ),
      'utf8',
    ),
  ];
  for (const [index, historicalModule] of historicalModules.entries()) {
    expect(registrySources[index]).toContain(historicalModule.historicalName);
    expect(registrySources[index]).not.toContain(historicalModule.managedName);
  }
}, 60_000);

test('canonical CLI can add block styles and transforms to an official workspace block', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-style-transform');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add style transform',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-style-transform',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Style Transform',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );
  const blockIndexPath = path.join(
    targetDir,
    'src',
    'blocks',
    'counter-card',
    'index.tsx',
  );
  fs.writeFileSync(
    blockIndexPath,
    `${fs.readFileSync(blockIndexPath, 'utf8')}
const copiedStyleImport = \`import { registerWorkspaceBlockStyles } from './styles';\`;
`,
    'utf8',
  );
  runCli(
    'node',
    [entryPath, 'add', 'style', 'callout-emphasis', '--block', 'counter-card'],
    { cwd: targetDir },
  );
  const semicolonlessBlockIndexSource = fs
    .readFileSync(blockIndexPath, 'utf8')
    .replace(
      'registerScaffoldBlockType(registration.name, registration.settings);',
      'registerScaffoldBlockType(registration.name, registration.settings)',
    );
  fs.writeFileSync(
    blockIndexPath,
    [
      "import { applyWorkspaceBlockTransforms } from './transforms'",
      semicolonlessBlockIndexSource,
    ].join('\n'),
    'utf8',
  );
  runCli(
    'node',
    [
      entryPath,
      'add',
      'transform',
      'quote-to-counter',
      '--from',
      '3d/quote',
      '--to',
      'counter-card',
    ],
    { cwd: targetDir },
  );

  const blockConfigPath = path.join(targetDir, 'scripts', 'block-config.ts');
  let blockConfigSource = fs.readFileSync(blockConfigPath, 'utf8');
  let blockIndexSource = fs.readFileSync(
    blockIndexPath,
    'utf8',
  );
  const stylesIndexPath = path.join(
    targetDir,
    'src',
    'blocks',
    'counter-card',
    'styles',
    'index.ts',
  );
  const stylesIndexSource = fs.readFileSync(
    stylesIndexPath,
    'utf8',
  );
  const styleSource = fs.readFileSync(
    path.join(
      targetDir,
      'src',
      'blocks',
      'counter-card',
      'styles',
      'callout-emphasis.ts',
    ),
    'utf8',
  );
  const transformsIndexPath = path.join(
    targetDir,
    'src',
    'blocks',
    'counter-card',
    'transforms',
    'index.ts',
  );
  let transformsIndexSource = fs.readFileSync(
    transformsIndexPath,
    'utf8',
  );
  const transformSource = fs.readFileSync(
    path.join(
      targetDir,
      'src',
      'blocks',
      'counter-card',
      'transforms',
      'quote-to-counter.ts',
    ),
    'utf8',
  );

  expect(blockConfigSource).toContain('export const BLOCK_STYLES');
  expect(blockConfigSource).toContain('export const BLOCK_TRANSFORMS');
  expect(blockConfigSource).toContain(
    "file: 'src/blocks/counter-card/styles/callout-emphasis.ts'",
  );
  expect(blockConfigSource).toContain(
    "file: 'src/blocks/counter-card/transforms/quote-to-counter.ts'",
  );
  expect(blockConfigSource).toContain("from: '3d/quote'");
  expect(blockConfigSource).toContain("to: 'demo-space/counter-card'");
  expect(blockIndexSource).toContain('registerWorkspaceBlockStyles();');
  expect(blockIndexSource).toContain(
    'applyWorkspaceBlockTransforms(registration.settings);',
  );
  expect(blockIndexSource).toContain(
    'applyWorkspaceBlockTransforms(registration.settings);\nregisterScaffoldBlockType(registration.name, registration.settings)',
  );
  expect(
    blockIndexSource.match(
      /^\s*import\s*\{\s*registerWorkspaceBlockStyles\s*\}\s*from\s*["']\.\/styles["']\s*;?\s*$/gmu,
    )?.length ?? 0,
  ).toBe(1);
  expect(
    blockIndexSource.match(
      /import\s*\{\s*applyWorkspaceBlockTransforms\s*\}\s*from\s*["']\.\/transforms["']\s*;?/gu,
    )?.length ?? 0,
  ).toBe(1);
  expect(stylesIndexSource).toContain('registerBlockStyle(metadata.name, style)');
  expect(stylesIndexSource).toContain(
    'workspaceBlockStyleCalloutEmphasisL7L8',
  );
  expect(styleSource).toContain("name: 'callout-emphasis'");
  expect(styleSource).toContain('Callout Emphasis');
  expect(transformsIndexSource).toContain('WORKSPACE_BLOCK_TRANSFORMS');
  expect(transformSource).toContain("blocks: ['3d/quote']");
  expect(transformSource).toContain('createBlock(metadata.name');

  const semicolonlessTransformHookSource = replaceFixtureSource(
    blockIndexSource,
    'applyWorkspaceBlockTransforms(registration.settings);',
    'applyWorkspaceBlockTransforms(registration.settings)',
    'semicolonless transform hook',
  );
  const transformImportComment = [
    '/*',
    'import { applyWorkspaceBlockTransforms } from "./transforms";',
    '*/',
  ].join('\n');
  fs.writeFileSync(
    blockIndexPath,
    `${transformImportComment}\n${semicolonlessTransformHookSource}`,
    'utf8',
  );
  runCli(
    'node',
    [
      entryPath,
      'add',
      'transform',
      'paragraph-to-counter',
      '--from',
      'core/paragraph',
      '--to',
      'counter-card',
    ],
    { cwd: targetDir },
  );

  blockConfigSource = fs.readFileSync(blockConfigPath, 'utf8');
  blockIndexSource = fs.readFileSync(blockIndexPath, 'utf8');
  transformsIndexSource = fs.readFileSync(transformsIndexPath, 'utf8');
  expect(blockConfigSource).toContain(
    "file: 'src/blocks/counter-card/transforms/paragraph-to-counter.ts'",
  );
  expect(blockConfigSource).toContain("from: 'core/paragraph'");
  expect(
    blockIndexSource.match(
      /applyWorkspaceBlockTransforms\s*\(\s*registration\s*\.\s*settings\s*\)/gu,
    )?.length ?? 0,
  ).toBe(1);
  expect(blockIndexSource).toContain(transformImportComment);
  expect(transformsIndexSource).toContain('paragraph-to-counter');

  const doctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doctorOutput);
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Block style counter-card/callout-emphasis',
    )?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Block style entrypoint counter-card',
    )?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Block style registry counter-card',
    )?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Block transform config counter-card/quote-to-counter',
    )?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Block transform counter-card/quote-to-counter',
    )?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Block transform config counter-card/paragraph-to-counter',
    )?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Block transform counter-card/paragraph-to-counter',
    )?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Block transform registry counter-card',
    )?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Block transform entrypoint counter-card',
    )?.status,
  ).toBe('pass');

  let commentedHookSource = replaceFixtureSource(
    blockIndexSource,
    /import\s*\{\s*registerWorkspaceBlockStyles\s*\}\s*from\s*["']\.\/styles["']\s*;?/u,
    "// import { registerWorkspaceBlockStyles } from './styles';",
    'block style import hook',
  );
  commentedHookSource = replaceFixtureSource(
    commentedHookSource,
    /import\s*\{\s*applyWorkspaceBlockTransforms\s*\}\s*from\s*["']\.\/transforms["']\s*;?/u,
    "// import { applyWorkspaceBlockTransforms } from './transforms';",
    'block transform import hook',
  );
  commentedHookSource = replaceFixtureSource(
    commentedHookSource,
    /registerWorkspaceBlockStyles\s*\(\s*\)\s*;/u,
    '// registerWorkspaceBlockStyles();',
    'block style registration hook',
  );
  commentedHookSource = replaceFixtureSource(
    commentedHookSource,
    /applyWorkspaceBlockTransforms\s*\(\s*registration\s*\.\s*settings\s*\)\s*;?/u,
    '// applyWorkspaceBlockTransforms(registration.settings);',
    'block transform registration hook',
  );
  fs.writeFileSync(blockIndexPath, commentedHookSource, 'utf8');

  const commentedHookDoctorError = getCommandErrorMessage(() =>
    runCli('node', [entryPath, 'doctor', '--format', 'json'], {
      cwd: targetDir,
    }),
  );
  expect(commentedHookDoctorError).toContain('Block style entrypoint counter-card');
  expect(commentedHookDoctorError).toContain('Block transform entrypoint counter-card');
  expect(commentedHookDoctorError).toContain(
    'Missing ./styles import or registerWorkspaceBlockStyles() call',
  );
  expect(commentedHookDoctorError).toContain(
    'Missing ./transforms import or applyWorkspaceBlockTransforms(registration.settings) call',
  );
  fs.writeFileSync(blockIndexPath, blockIndexSource, 'utf8');

  fs.rmSync(stylesIndexPath);
  const missingStyleRegistryDoctorError = getCommandErrorMessage(() =>
    runCli('node', [entryPath, 'doctor', '--format', 'json'], {
      cwd: targetDir,
    }),
  );
  expect(missingStyleRegistryDoctorError).toContain('Block style registry counter-card');
  expect(missingStyleRegistryDoctorError).toContain(
    'src/blocks/counter-card/styles/index.ts',
  );
  fs.writeFileSync(stylesIndexPath, stylesIndexSource, 'utf8');

  fs.rmSync(transformsIndexPath);
  const missingTransformRegistryDoctorError = getCommandErrorMessage(() =>
    runCli('node', [entryPath, 'doctor', '--format', 'json'], {
      cwd: targetDir,
    }),
  );
  expect(missingTransformRegistryDoctorError).toContain(
    'Block transform registry counter-card',
  );
  expect(missingTransformRegistryDoctorError).toContain(
    'src/blocks/counter-card/transforms/index.ts',
  );
  fs.writeFileSync(transformsIndexPath, transformsIndexSource, 'utf8');

  runCli('npm', ['run', 'build'], { cwd: targetDir });
}, GENERATED_PROJECT_BUILD_TIMEOUT_MS);

test('transform workflow rejects direct registerBlockType entrypoints without writing partial files', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-transform-direct-entry');

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace transform direct entry',
    slug: 'demo-workspace-transform-direct-entry',
    title: 'Demo Workspace Transform Direct Entry',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );

  const blockIndexPath = path.join(
    targetDir,
    'src',
    'blocks',
    'counter-card',
    'index.tsx',
  );
  const directBlockIndexSource = [
    "import { registerBlockType } from '@wordpress/blocks';",
    "import metadata from './block.json';",
    '',
    '// TODO: migrate to registerScaffoldBlockType(registration.name, registration.settings);',
    'registerBlockType(metadata.name, {',
    '\tedit: () => null,',
    '\tsave: () => null,',
    '});',
    '',
  ].join('\n');
  fs.writeFileSync(blockIndexPath, directBlockIndexSource, 'utf8');

  runCli(
    'node',
    [
      entryPath,
      'add',
      'style',
      'callout-emphasis',
      '--block',
      'counter-card',
    ],
    { cwd: targetDir },
  );
  const originalBlockIndexSource = fs.readFileSync(blockIndexPath, 'utf8');
  const transformsDirPath = path.join(
    targetDir,
    'src',
    'blocks',
    'counter-card',
    'transforms',
  );

  expect(
    originalBlockIndexSource.indexOf('registerWorkspaceBlockStyles();'),
  ).toBeGreaterThan(
    originalBlockIndexSource.indexOf('registerBlockType(metadata.name'),
  );
  expect(originalBlockIndexSource).toContain(
    '});\nregisterWorkspaceBlockStyles();',
  );

  const commandError = getCommandErrorMessage(() =>
    runCli(
      'node',
      [
        entryPath,
        'add',
        'transform',
        'quote-to-counter',
        '--from',
        'core/quote',
        '--to',
        'counter-card',
      ],
      { cwd: targetDir },
    ),
  );
  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );

  expect(commandError).toContain(
    'does not expose a scaffold registration settings object',
  );
  expect(fs.readFileSync(blockIndexPath, 'utf8')).toBe(originalBlockIndexSource);
  expect(blockConfigSource).not.toContain('quote-to-counter');
  expect(fs.existsSync(transformsDirPath)).toBe(false);
  expect(
    fs.existsSync(
      path.join(
        targetDir,
        'src',
        'blocks',
        'counter-card',
        'transforms',
        'quote-to-counter.ts',
      ),
    ),
  ).toBe(false);
}, 60_000);

test('canonical CLI can add hooked-block metadata to an official workspace block', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-hooked-block');

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace add hooked block',
    slug: 'demo-workspace-add-hooked-block',
    title: 'Demo Workspace Add Hooked Block',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );
  const typesPath = path.join(
    targetDir,
    'src',
    'blocks',
    'counter-card',
    'types.ts',
  );
  fs.writeFileSync(
    typesPath,
    `interface UnrelatedBindingFixture {\n\theadline?: string;\n}\n\n${fs.readFileSync(typesPath, 'utf8')}`,
    'utf8',
  );
  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'binding-source',
          'broken-target',
          '--block',
          'demo-space/counter-card/extra',
          '--attribute',
          'headline',
        ],
        {
          cwd: targetDir,
        },
      ),
    ),
  ).toContain('must use <block-slug> or <namespace/block-slug> format');
  runCli(
    'node',
    [
      entryPath,
      'add',
      'hooked-block',
      'counter-card',
      '--anchor',
      'core/post-content',
      '--position',
      'after',
    ],
    { cwd: targetDir },
  );

  const blockJson = JSON.parse(
    fs.readFileSync(
      path.join(targetDir, 'src', 'blocks', 'counter-card', 'block.json'),
      'utf8',
    ),
  );

  expect(blockJson.blockHooks).toEqual({
    'core/post-content': 'after',
  });

  runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts');
  const syncedBlockJson = JSON.parse(
    fs.readFileSync(
      path.join(targetDir, 'src', 'blocks', 'counter-card', 'block.json'),
      'utf8',
    ),
  );
  expect(syncedBlockJson.blockHooks).toEqual({
    'core/post-content': 'after',
  });

  const doctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doctorOutput);
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Block hooks counter-card',
    )?.status,
  ).toBe('pass');
}, 20_000);

test('canonical CLI can dry-run an add block scaffold without mutating the workspace', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-block-dry-run');

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace add block dry run',
    slug: 'demo-workspace-add-block-dry-run',
    title: 'Demo Workspace Add Block Dry Run',
  });

  linkWorkspaceNodeModules(targetDir);
  const output = runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'counter-card',
      '--template',
      'basic',
      '--dry-run',
    ],
    { cwd: targetDir },
  );

  expect(output).toContain('Dry run');
  expect(output).toContain('Blocks: counter-card');
  expect(output).toContain('write src/blocks/counter-card/index.tsx');
  expect(
    fs.existsSync(path.join(targetDir, 'src', 'blocks', 'counter-card')),
  ).toBe(false);
}, 20_000);

test('canonical CLI can add an integration environment starter to an official workspace template', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-integration-env');

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace add integration env',
    slug: 'demo-workspace-add-integration-env',
    title: 'Demo Workspace Add Integration Env',
  });

  linkWorkspaceNodeModules(targetDir);
  const output = runCli(
    'node',
    [
      entryPath,
      'add',
      'integration-env',
      'local-smoke',
      '--wp-env',
      '--release-zip',
      '--service',
      'docker-compose',
    ],
    { cwd: targetDir },
  );

  expect(output).toContain('Added integration environment starter');
  expect(output).toContain('Integration env: local-smoke');
  expect(output).toContain('Release zip scripts: true');

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'),
  ) as {
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
  };
  expect(packageJson.devDependencies['@wordpress/env']).toBe('^11.2.0');
  expect(packageJson.scripts['wp-env:start']).toBe('wp-env start');
  expect(packageJson.scripts['service:start']).toBe(
    'docker compose -f docker-compose.integration.yml up -d',
  );
  expect(packageJson.scripts['smoke:local-smoke']).toBe(
    'node scripts/integration-smoke/local-smoke.mjs',
  );
  expect(packageJson.scripts['smoke:integration']).toBe(
    'npm run smoke:local-smoke',
  );
  expect(packageJson.scripts['release:zip']).toBe(
    'npm run sync-rest:package && npm run build && wp-scripts plugin-zip',
  );
  expect(packageJson.scripts['release:zip:check']).toBe(
    'npm run sync-rest:package:check && npm run build',
  );
  expect(packageJson.scripts['qa:check']).toBe(
    'npm run wp-typia:doctor:workspace && npm run release:zip:check',
  );

  const envExampleSource = fs.readFileSync(
    path.join(targetDir, '.env.example'),
    'utf8',
  );
  expect(envExampleSource).toContain(
    'WP_TYPIA_SMOKE_BASE_URL=http://localhost:8888',
  );
  expect(envExampleSource).toContain(
    'WP_TYPIA_SERVICE_URL=http://localhost:3000',
  );
  expect(envExampleSource).toContain('WP_TYPIA_SMOKE_TIMEOUT_MS=30000');
  expect(
    fs.readFileSync(path.join(targetDir, '.gitignore'), 'utf8'),
  ).toContain('.env');
  expect(
    fs.readFileSync(path.join(targetDir, '.wp-env.json'), 'utf8'),
  ).toContain('"plugins": [');
  expect(
    fs.readFileSync(
      path.join(targetDir, 'docker-compose.integration.yml'),
      'utf8',
    ),
  ).toContain('integration-service');

  const smokeScriptPath = path.join(
    targetDir,
    'scripts',
    'integration-smoke',
    'local-smoke.mjs',
  );
  const smokeScriptSource = fs.readFileSync(smokeScriptPath, 'utf8');
  expect(smokeScriptSource).toContain('WordPress REST index');
  expect(smokeScriptSource).toContain('generated REST clients or schema');
  expect(smokeScriptSource).toContain('local-smoke');
  expect(smokeScriptSource).toContain('function resolveEndpointUrl');
  expect(smokeScriptSource).toContain('function getPositiveIntegerEnv');
  expect(smokeScriptSource).toContain('AbortSignal.timeout');
  expect(smokeScriptSource).toContain('WP_TYPIA_SMOKE_TIMEOUT_MS');
  expect(smokeScriptSource).toContain(
    'resolveEndpointUrl(baseUrl, "wp-json/")',
  );
  expect(smokeScriptSource).toContain(
    'resolveEndpointUrl(serviceUrl, "health")',
  );
  runCli('node', ['--check', smokeScriptPath], { cwd: targetDir });
  expect(
    fs.readFileSync(
      path.join(targetDir, 'docs', 'integration-env', 'local-smoke.md'),
      'utf8',
    ),
  ).toContain('Adapting the Starter');
  expect(
    fs.readFileSync(
      path.join(targetDir, 'docs', 'integration-env', 'local-smoke.md'),
      'utf8',
    ),
  ).toContain('release:zip');
});

test('canonical CLI preserves an existing wp-env dependency when adding an integration environment', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-integration-env-existing-wp-env',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace add integration env existing wp-env',
    slug: 'demo-workspace-add-integration-env-existing-wp-env',
    title: 'Demo Workspace Add Integration Env Existing Wp Env',
  });

  const packageJsonPath = path.join(targetDir, 'package.json');
  const packageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, 'utf8'),
  ) as {
    devDependencies?: Record<string, string>;
  };
  packageJson.devDependencies = {
    ...(packageJson.devDependencies ?? {}),
    '@wordpress/env': '^10.0.0',
  };
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, '\t')}\n`,
    'utf8',
  );

  linkWorkspaceNodeModules(targetDir);
  runCli('node', [entryPath, 'add', 'integration-env', 'local-smoke', '--wp-env'], {
    cwd: targetDir,
  });

  const updatedPackageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, 'utf8'),
  ) as {
    devDependencies: Record<string, string>;
  };
  expect(updatedPackageJson.devDependencies['@wordpress/env']).toBe('^10.0.0');
  expect(fs.existsSync(path.join(targetDir, '.wp-env.json'))).toBe(true);
}, 20_000);

test('canonical CLI can dry-run hooked-block metadata updates without rewriting block.json', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-hooked-block-dry-run');

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace add hooked block dry run',
    slug: 'demo-workspace-add-hooked-block-dry-run',
    title: 'Demo Workspace Add Hooked Block Dry Run',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );
  const originalBlockJsonSource = fs.readFileSync(
    path.join(targetDir, 'src', 'blocks', 'counter-card', 'block.json'),
    'utf8',
  );

  const output = runCli(
    'node',
    [
      entryPath,
      'add',
      'hooked-block',
      'counter-card',
      '--anchor',
      'core/post-content',
      '--position',
      'after',
      '--dry-run',
    ],
    { cwd: targetDir },
  );

  expect(output).toContain('Dry run');
  expect(output).toContain('Block: counter-card');
  expect(output).toContain('update src/blocks/counter-card/block.json');
  expect(
    fs.readFileSync(
      path.join(targetDir, 'src', 'blocks', 'counter-card', 'block.json'),
      'utf8',
    ),
  ).toBe(originalBlockJsonSource);
}, 20_000);

test(
  'duplicate add block failures preserve existing workspace blocks',
  async () => {
    const targetDir = path.join(tempRoot, 'demo-workspace-add-duplicate');

    await scaffoldProject({
      projectDir: targetDir,
      templateId: workspaceTemplatePackageManifest.name,
      packageManager: 'npm',
      noInstall: true,
      answers: {
        author: 'Test Runner',
        description: 'Demo workspace add duplicate',
        namespace: 'demo-space',
        phpPrefix: 'demo_space',
        slug: 'demo-workspace-add-duplicate',
        textDomain: 'demo-space',
        title: 'Demo Workspace Add Duplicate',
      },
    });

    linkWorkspaceNodeModules(targetDir);

    runCli(
      'node',
      [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
      {
        cwd: targetDir,
      },
    );

    const originalIndexSource = fs.readFileSync(
      path.join(targetDir, 'src', 'blocks', 'counter-card', 'index.tsx'),
      'utf8',
    );
    const originalBlockConfigSource = fs.readFileSync(
      path.join(targetDir, 'scripts', 'block-config.ts'),
      'utf8',
    );

    expect(() =>
      runCli(
        'node',
        [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
        {
          cwd: targetDir,
        },
      ),
    ).toThrow(
      'A block already exists at src/blocks/counter-card. Choose a different name.',
    );

    expect(
      fs.readFileSync(
        path.join(targetDir, 'src', 'blocks', 'counter-card', 'index.tsx'),
        'utf8',
      ),
    ).toBe(originalIndexSource);
    expect(
      fs.readFileSync(
        path.join(targetDir, 'scripts', 'block-config.ts'),
        'utf8',
      ),
    ).toBe(originalBlockConfigSource);
  },
  15_000,
);

test('hooked-block workflow rejects unknown blocks, invalid anchors, self-hooks, invalid positions, and duplicate anchors', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-hooked-block-invalid',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace hooked block invalid',
    slug: 'demo-workspace-hooked-block-invalid',
    title: 'Demo Workspace Hooked Block Invalid',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );

  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'hooked-block',
          'missing-card',
          '--anchor',
          'core/post-content',
          '--position',
          'after',
        ],
        { cwd: targetDir },
      ),
    ),
  ).toContain('Unknown workspace block');

  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'hooked-block',
          'counter-card',
          '--anchor',
          'post-content',
          '--position',
          'after',
        ],
        { cwd: targetDir },
      ),
    ),
  ).toContain('full `namespace/slug` block name format');

  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'hooked-block',
          'counter-card',
          '--anchor',
          'demo-space/counter-card',
          '--position',
          'after',
        ],
        { cwd: targetDir },
      ),
    ),
  ).toContain('cannot hook a block relative to its own block name');

  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'hooked-block',
          'counter-card',
          '--anchor',
          'core/post-content',
          '--position',
          'around',
        ],
        { cwd: targetDir },
      ),
    ),
  ).toContain(
    'Hook position must be one of: before, after, firstChild, lastChild.',
  );

  runCli(
    'node',
    [
      entryPath,
      'add',
      'hooked-block',
      'counter-card',
      '--anchor',
      'core/post-content',
      '--position',
      'after',
    ],
    { cwd: targetDir },
  );

  const originalBlockJsonSource = fs.readFileSync(
    path.join(targetDir, 'src', 'blocks', 'counter-card', 'block.json'),
    'utf8',
  );

  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'hooked-block',
          'counter-card',
          '--anchor',
          'core/post-content',
          '--position',
          'before',
        ],
        { cwd: targetDir },
      ),
    ),
  ).toContain('already defines a blockHooks entry');
  expect(
    fs.readFileSync(
      path.join(targetDir, 'src', 'blocks', 'counter-card', 'block.json'),
      'utf8',
    ),
  ).toBe(originalBlockJsonSource);
}, 20_000);

test('variation workflow rejects unknown blocks and preserves existing variation files on duplicate failure', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-variation-duplicate');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace variation duplicate',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-variation-duplicate',
      textDomain: 'demo-space',
      title: 'Demo Workspace Variation Duplicate',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );

  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'variation',
          'hero-card',
          '--block',
          'missing-card',
        ],
        { cwd: targetDir },
      ),
    ),
  ).toContain('missing-card');
  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'variation',
          '2024-hero',
          '--block',
          'counter-card',
        ],
        { cwd: targetDir },
      ),
    ),
  ).toContain('Variation name must start with a letter');

  runCli(
    'node',
    [entryPath, 'add', 'variation', 'hero-card', '--block', 'counter-card'],
    { cwd: targetDir },
  );

  const originalVariationSource = fs.readFileSync(
    path.join(
      targetDir,
      'src',
      'blocks',
      'counter-card',
      'variations',
      'hero-card.ts',
    ),
    'utf8',
  );
  const originalInventorySource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );

  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'variation',
          'hero-card',
          '--block',
          'counter-card',
        ],
        { cwd: targetDir },
      ),
    ),
  ).toContain('A variation already exists');

  expect(
    fs.readFileSync(
      path.join(
        targetDir,
        'src',
        'blocks',
        'counter-card',
        'variations',
        'hero-card.ts',
      ),
      'utf8',
    ),
  ).toBe(originalVariationSource);
  expect(
    fs.readFileSync(
      path.join(targetDir, 'scripts', 'block-config.ts'),
      'utf8',
    ),
  ).toBe(originalInventorySource);
}, 15_000);

test('canonical CLI can add a compound persistence block to an official workspace template', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-compound');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add compound',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-compound',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Compound',
    },
  });

  const packageJsonPath = path.join(targetDir, 'package.json');
  const legacyPackageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
  };
  delete legacyPackageJson.dependencies?.['@wordpress/data'];
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(legacyPackageJson, null, 2)}\n`,
    'utf8',
  );
  linkWorkspaceNodeModules(targetDir);

  const result = await runAddBlockCommand({
    blockName: 'faq-stack',
    cwd: targetDir,
    dataStorageMode: 'custom-table',
    persistencePolicy: 'public',
    templateId: 'compound',
  });

  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const serverModuleSource = fs.readFileSync(
    path.join(targetDir, 'src', 'blocks', 'faq-stack', 'server.php'),
    'utf8',
  );
  const parentBlockJson = JSON.parse(
    fs.readFileSync(
      path.join(targetDir, 'src', 'blocks', 'faq-stack', 'block.json'),
      'utf8',
    ),
  );
  const packageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
  };
  const parentEditSource = fs.readFileSync(
    path.join(targetDir, 'src', 'blocks', 'faq-stack', 'edit.tsx'),
    'utf8',
  );

  expect(blockConfigSource).toContain('defineEndpointManifest');
  expect(blockConfigSource).toContain("slug: 'faq-stack-item'");
  expect(serverModuleSource).toContain('rest-public.php');
  expect(serverModuleSource).toContain(
    "array_key_exists( 'resourceKey', $attributes )",
  );
  expect(serverModuleSource).toContain(
    "define( 'DEMO_SPACE_FAQ_STACK_DATA_STORAGE_MODE', 'custom-table' );",
  );
  expect(serverModuleSource).toContain(
    "if ( 'custom-table' === DEMO_SPACE_FAQ_STACK_DATA_STORAGE_MODE",
  );
  expect(serverModuleSource).toContain(
    "'storage'     => DEMO_SPACE_FAQ_STACK_DATA_STORAGE_MODE,",
  );
  expect(serverModuleSource).toContain('is_post_publicly_viewable( $post )');
  expect(serverModuleSource).toContain(": 'primary';");
  expect(parentBlockJson.name).toBe('demo-space/faq-stack');
  expect(packageJson.dependencies?.['@wordpress/data']).toBe('~10.46.0');
  expect(parentEditSource).toContain('usePersistentBlockIdentity');
  expect(result.warnings).toContain(
    'Added @wordpress/data for persistent block identities. Run `npm install --no-audit` before building the workspace.',
  );
  expect(result.warnings.join('\n')).not.toContain(
    'Compiler-derived artifacts were deferred',
  );
  expect(fs.existsSync(path.join(targetDir, 'src', 'hooks.ts'))).toBe(true);
  expect(fs.existsSync(path.join(targetDir, 'src', 'validator-toolkit.ts'))).toBe(
    true,
  );
  runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts', [
    '--check',
  ]);
  runGeneratedScript(targetDir, 'scripts/sync-rest-contracts.ts', [
    '--check',
  ]);
}, 60_000);

test('canonical CLI can add a persistence block with alternate render targets', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-persistence-alternate-render-targets',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add persistence alternate render targets',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-persistence-alternate-render-targets',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Persistence Alternate Render Targets',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'mailing-card',
      '--template',
      'persistence',
      '--alternate-render-targets',
      'email,plain-text',
      '--data-storage',
      'custom-table',
      '--persistence-policy',
      'authenticated',
    ],
    {
      cwd: targetDir,
    },
  );

  const renderTargetsSource = fs.readFileSync(
    path.join(targetDir, 'src', 'blocks', 'mailing-card', 'render-targets.php'),
    'utf8',
  );
  const emailRenderSource = fs.readFileSync(
    path.join(targetDir, 'src', 'blocks', 'mailing-card', 'render-email.php'),
    'utf8',
  );
  const textRenderSource = fs.readFileSync(
    path.join(targetDir, 'src', 'blocks', 'mailing-card', 'render-text.php'),
    'utf8',
  );

  expect(renderTargetsSource).toMatch(/function\s+.+_render_target\(/);
  expect(emailRenderSource).toContain("render_target( 'email'");
  expect(textRenderSource).toContain("render_target( 'plain-text'");
  expect(
    fs.existsSync(
      path.join(targetDir, 'src', 'blocks', 'mailing-card', 'render-mjml.php'),
    ),
  ).toBe(false);
  runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts', [
    '--check',
  ]);
  runGeneratedScript(targetDir, 'scripts/sync-rest-contracts.ts', [
    '--check',
  ]);
}, 60_000);

test('add compound block repairs a legacy shared validator toolkit in an official workspace template', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-compound-legacy-validator-toolkit',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add compound legacy validator toolkit',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-compound-legacy-validator-toolkit',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Compound Legacy Validator Toolkit',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'faq-stack',
      '--template',
      'compound',
    ],
    {
      cwd: targetDir,
    },
  );

  writeLegacyValidatorToolkitFixture(targetDir);

  writeLegacyCompoundValidatorFixture(
    targetDir,
    'faq-stack',
    'FaqStackAttributes',
    'FaqStackAttributes',
  );
  writeLegacyCompoundValidatorFixture(
    targetDir,
    'faq-stack-item',
    'FaqStackItemAttributes',
    'FaqStackItemAttributes',
    {
      includeImportStringDecoy: true,
      lineEnding: '\r\n',
      quoteStyle: '"',
    },
  );

  runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'feature-grid',
      '--template',
      'compound',
    ],
    {
      cwd: targetDir,
    },
  );

  const validatorToolkitSource = fs.readFileSync(
    path.join(targetDir, 'src', 'validator-toolkit.ts'),
    'utf8',
  );
  const repairedParentValidatorSource = fs.readFileSync(
    path.join(targetDir, 'src', 'blocks', 'faq-stack', 'validators.ts'),
    'utf8',
  );
  const repairedChildValidatorSource = fs.readFileSync(
    path.join(targetDir, 'src', 'blocks', 'faq-stack-item', 'validators.ts'),
    'utf8',
  );

  expect(validatorToolkitSource).toContain('interface TemplateValidatorFunctions<');
  expect(validatorToolkitSource).toContain(
    "assert: ScaffoldValidatorToolkitOptions<T>['assert'];",
  );
  expect(repairedParentValidatorSource).toContain("import typia from 'typia';");
  expect(repairedParentValidatorSource).toContain(
    "import currentManifest from './manifest-defaults-document';",
  );
  expect(repairedParentValidatorSource).toContain(
    'assert: typia.createAssert< FaqStackAttributes >()',
  );
  expect(repairedChildValidatorSource).toContain("import typia from 'typia';");
  expect(repairedChildValidatorSource).toContain(
    "import currentManifest from './manifest-defaults-document';",
  );
  expect(repairedChildValidatorSource).toContain(
    'assert: typia.createAssert< FaqStackItemAttributes >()',
  );
  expect(repairedChildValidatorSource).toContain(
    `export const legacyImportString = 'from "typia"';`,
  );
  expect(repairedChildValidatorSource.replace(/\r\n/gu, '')).not.toContain(
    '\n',
  );
  runCli(
    path.join(targetDir, 'node_modules', '.bin', 'ttsc'),
    ['format', '--singleThreaded'],
    { cwd: targetDir },
  );
  typecheckGeneratedProject(targetDir);
}, 60_000);

test('add compound block backfills a missing manifest-defaults wrapper during legacy validator repair', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-compound-legacy-validator-wrapper-backfill',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description:
        'Demo workspace add compound legacy validator wrapper backfill',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-compound-legacy-validator-wrapper-backfill',
      textDomain: 'demo-space',
      title:
        'Demo Workspace Add Compound Legacy Validator Wrapper Backfill',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'faq-stack',
      '--template',
      'compound',
    ],
    {
      cwd: targetDir,
    },
  );

  writeLegacyValidatorToolkitFixture(targetDir);
  fs.rmSync(
    path.join(
      targetDir,
      'src',
      'blocks',
      'faq-stack',
      'manifest-defaults-document.ts',
    ),
  );
  writeLegacyCompoundValidatorFixture(
    targetDir,
    'faq-stack',
    'FaqStackAttributes',
    'FaqStackAttributes',
  );

  runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'feature-grid',
      '--template',
      'compound',
    ],
    {
      cwd: targetDir,
    },
  );

  const manifestDefaultsWrapperSource = fs.readFileSync(
    path.join(
      targetDir,
      'src',
      'blocks',
      'faq-stack',
      'manifest-defaults-document.ts',
    ),
    'utf8',
  );
  const repairedParentValidatorSource = fs.readFileSync(
    path.join(targetDir, 'src', 'blocks', 'faq-stack', 'validators.ts'),
    'utf8',
  );

  expect(manifestDefaultsWrapperSource).toContain(
    "import rawCurrentManifest from './typia.manifest.json';",
  );
  expect(manifestDefaultsWrapperSource).toContain(
    'defineManifestDefaultsDocument( rawCurrentManifest )',
  );
  expect(repairedParentValidatorSource).toContain(
    "import currentManifest from './manifest-defaults-document';",
  );

  typecheckGeneratedProject(targetDir);
}, 60_000);

test('add compound block does not duplicate an existing typia import during legacy validator repair', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-compound-legacy-validator-typia-import',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add compound legacy validator typia import',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-compound-legacy-validator-typia-import',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Compound Legacy Validator Typia Import',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'faq-stack',
      '--template',
      'compound',
    ],
    {
      cwd: targetDir,
    },
  );

  writeLegacyValidatorToolkitFixture(targetDir);

  writeLegacyCompoundValidatorFixture(
    targetDir,
    'faq-stack',
    'FaqStackAttributes',
    'FaqStackAttributes',
    {
      includeTypiaImport: true,
      quoteStyle: '"',
    },
  );

  runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'feature-grid',
      '--template',
      'compound',
    ],
    {
      cwd: targetDir,
    },
  );

  const repairedParentValidatorSource = fs.readFileSync(
    path.join(targetDir, 'src', 'blocks', 'faq-stack', 'validators.ts'),
    'utf8',
  );
  const typiaImportMatches = repairedParentValidatorSource.match(
    /import typia from ['"]typia['"];/gu,
  );

  expect(typiaImportMatches).toHaveLength(1);
  expect(repairedParentValidatorSource).toContain(
    'assert: typia.createAssert< FaqStackAttributes >()',
  );

  typecheckGeneratedProject(targetDir);
}, 60_000);

test('add compound block does not duplicate a BOM-prefixed typia import during legacy validator repair', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-compound-legacy-validator-bom-typia-import',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add compound legacy validator BOM typia import',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-compound-legacy-validator-bom-typia-import',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Compound Legacy Validator BOM Typia Import',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'faq-stack',
      '--template',
      'compound',
    ],
    {
      cwd: targetDir,
    },
  );

  writeLegacyValidatorToolkitFixture(targetDir);

  fs.writeFileSync(
    path.join(targetDir, 'src', 'blocks', 'faq-stack', 'validators.ts'),
    [
      '\uFEFFimport typia from "typia";',
      'import currentManifest from "./typia.manifest.json";',
      'import type {',
      '\tFaqStackAttributes,',
      '} from "./types";',
      'import { createTemplateValidatorToolkit } from "../../validator-toolkit";',
      '',
      'const scaffoldValidators = createTemplateValidatorToolkit< FaqStackAttributes >( {',
      '\tmanifest: currentManifest,',
      '} );',
      '',
      'export const validateFaqStackAttributes =',
      '\tscaffoldValidators.validateAttributes;',
      '',
      'export const validators = scaffoldValidators.validators;',
      '',
      'export const sanitizeFaqStackAttributes =',
      '\tscaffoldValidators.sanitizeAttributes;',
      '',
      'export const createAttributeUpdater = scaffoldValidators.createAttributeUpdater;',
      '',
    ].join('\n'),
    'utf8',
  );

  runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'feature-grid',
      '--template',
      'compound',
    ],
    {
      cwd: targetDir,
    },
  );

  const repairedParentValidatorSource = fs.readFileSync(
    path.join(targetDir, 'src', 'blocks', 'faq-stack', 'validators.ts'),
    'utf8',
  );
  const typiaImportMatches = repairedParentValidatorSource.match(
    /^[\uFEFF \t]*import typia from ['"]typia['"];/gmu,
  );

  expect(typiaImportMatches).toHaveLength(1);
  expect(repairedParentValidatorSource).toContain(
    'assert: typia.createAssert< FaqStackAttributes >()',
  );

  typecheckGeneratedProject(targetDir);
}, 30_000);

test('add compound block ignores a commented typia import during legacy validator repair', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-compound-legacy-validator-commented-typia-import',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description:
        'Demo workspace add compound legacy validator commented typia import',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-compound-legacy-validator-commented-typia-import',
      textDomain: 'demo-space',
      title:
        'Demo Workspace Add Compound Legacy Validator Commented Typia Import',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'faq-stack',
      '--template',
      'compound',
    ],
    {
      cwd: targetDir,
    },
  );

  writeLegacyValidatorToolkitFixture(targetDir);

  fs.writeFileSync(
    path.join(targetDir, 'src', 'blocks', 'faq-stack', 'validators.ts'),
    [
      '// import typia from "typia";',
      'import currentManifest from "./typia.manifest.json";',
      'import type {',
      '\tFaqStackAttributes,',
      '} from "./types";',
      'import { createTemplateValidatorToolkit } from "../../validator-toolkit";',
      '',
      'const scaffoldValidators = createTemplateValidatorToolkit< FaqStackAttributes >( {',
      '\tmanifest: currentManifest,',
      '} );',
      '',
      'export const validateFaqStackAttributes =',
      '\tscaffoldValidators.validateAttributes;',
      '',
      'export const validators = scaffoldValidators.validators;',
      '',
      'export const sanitizeFaqStackAttributes =',
      '\tscaffoldValidators.sanitizeAttributes;',
      '',
      'export const createAttributeUpdater = scaffoldValidators.createAttributeUpdater;',
      '',
    ].join('\n'),
    'utf8',
  );

  runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'feature-grid',
      '--template',
      'compound',
    ],
    {
      cwd: targetDir,
    },
  );

  const repairedParentValidatorSource = fs.readFileSync(
    path.join(targetDir, 'src', 'blocks', 'faq-stack', 'validators.ts'),
    'utf8',
  );
  const typiaImportMatches = repairedParentValidatorSource
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .match(/^[ \t]*import typia from ['"]typia['"];/gmu);

  expect(typiaImportMatches).toHaveLength(1);
  expect(repairedParentValidatorSource).toContain(
    '// import typia from "typia";',
  );
  expect(repairedParentValidatorSource).toContain(
    'assert: typia.createAssert< FaqStackAttributes >()',
  );

  typecheckGeneratedProject(targetDir);
}, 30_000);

test('add compound block ignores a block-commented typia import during legacy validator repair', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-compound-legacy-validator-block-commented-typia-import',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description:
        'Demo workspace add compound legacy validator block commented typia import',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-compound-legacy-validator-block-commented-typia-import',
      textDomain: 'demo-space',
      title:
        'Demo Workspace Add Compound Legacy Validator Block Commented Typia Import',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'faq-stack',
      '--template',
      'compound',
    ],
    {
      cwd: targetDir,
    },
  );

  writeLegacyValidatorToolkitFixture(targetDir);

  fs.writeFileSync(
    path.join(targetDir, 'src', 'blocks', 'faq-stack', 'validators.ts'),
    [
      '/*',
      'import typia from "typia";',
      '*/',
      'import currentManifest from "./typia.manifest.json";',
      'import type {',
      '\tFaqStackAttributes,',
      '} from "./types";',
      'import { createTemplateValidatorToolkit } from "../../validator-toolkit";',
      '',
      'const scaffoldValidators = createTemplateValidatorToolkit< FaqStackAttributes >( {',
      '\tmanifest: currentManifest,',
      '} );',
      '',
      'export const validateFaqStackAttributes =',
      '\tscaffoldValidators.validateAttributes;',
      '',
      'export const validators = scaffoldValidators.validators;',
      '',
      'export const sanitizeFaqStackAttributes =',
      '\tscaffoldValidators.sanitizeAttributes;',
      '',
      'export const createAttributeUpdater = scaffoldValidators.createAttributeUpdater;',
      '',
    ].join('\n'),
    'utf8',
  );

  runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'feature-grid',
      '--template',
      'compound',
    ],
    {
      cwd: targetDir,
    },
  );

  const repairedParentValidatorSource = fs.readFileSync(
    path.join(targetDir, 'src', 'blocks', 'faq-stack', 'validators.ts'),
    'utf8',
  );
  const typiaImportMatches = repairedParentValidatorSource
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .match(/^[ \t]*import typia from ['"]typia['"];/gmu);

  expect(typiaImportMatches).toHaveLength(1);
  expect(repairedParentValidatorSource).toContain('/*');
  expect(repairedParentValidatorSource).toContain(
    'assert: typia.createAssert< FaqStackAttributes >()',
  );

  typecheckGeneratedProject(targetDir);
}, 30_000);

test('add compound block ignores a block-commented manifest import during legacy validator repair', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-compound-legacy-validator-block-commented-manifest-import',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description:
        'Demo workspace add compound legacy validator block commented manifest import',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-compound-legacy-validator-block-commented-manifest-import',
      textDomain: 'demo-space',
      title:
        'Demo Workspace Add Compound Legacy Validator Block Commented Manifest Import',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'faq-stack',
      '--template',
      'compound',
    ],
    {
      cwd: targetDir,
    },
  );

  writeLegacyValidatorToolkitFixture(targetDir);

  fs.writeFileSync(
    path.join(targetDir, 'src', 'blocks', 'faq-stack', 'validators.ts'),
    [
      '/*',
      'import currentManifest from "./typia.manifest.json";',
      '*/',
      'import type {',
      '\tFaqStackAttributes,',
      '} from "./types";',
      'import { createTemplateValidatorToolkit } from "../../validator-toolkit";',
      'import currentManifest from "./typia.manifest.json";',
      '',
      'const scaffoldValidators = createTemplateValidatorToolkit< FaqStackAttributes >( {',
      '\tmanifest: currentManifest,',
      '} );',
      '',
      'export const validateFaqStackAttributes =',
      '\tscaffoldValidators.validateAttributes;',
      '',
      'export const validators = scaffoldValidators.validators;',
      '',
      'export const sanitizeFaqStackAttributes =',
      '\tscaffoldValidators.sanitizeAttributes;',
      '',
      'export const createAttributeUpdater = scaffoldValidators.createAttributeUpdater;',
      '',
    ].join('\n'),
    'utf8',
  );

  runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'feature-grid',
      '--template',
      'compound',
    ],
    {
      cwd: targetDir,
    },
  );

  const repairedParentValidatorSource = fs.readFileSync(
    path.join(targetDir, 'src', 'blocks', 'faq-stack', 'validators.ts'),
    'utf8',
  );

  expect(repairedParentValidatorSource).toContain(
    "import currentManifest from './manifest-defaults-document';",
  );
  expect(repairedParentValidatorSource).toContain(
    'import currentManifest from "./typia.manifest.json";',
  );
  expect(repairedParentValidatorSource).toContain(
    'assert: typia.createAssert< FaqStackAttributes >()',
  );

  typecheckGeneratedProject(targetDir);
}, 30_000);

test('add compound block preserves a compatible shared validator toolkit', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-compound-compatible-validator-toolkit',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add compound compatible validator toolkit',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-compound-compatible-validator-toolkit',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Compound Compatible Validator Toolkit',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'faq-stack',
      '--template',
      'compound',
    ],
    {
      cwd: targetDir,
    },
  );

  const validatorToolkitPath = path.join(
    targetDir,
    'src',
    'validator-toolkit.ts',
  );
  fs.writeFileSync(
    validatorToolkitPath,
    `// preserve-compatible-toolkit
import {
  createScaffoldValidatorToolkit,
  type ScaffoldValidatorToolkitOptions,
} from '@wp-typia/block-runtime/validation';
import { parseManifestDefaultsDocument } from '@wp-typia/block-runtime/defaults';

interface TemplateValidatorFunctions<T extends object> {
  assert: ScaffoldValidatorToolkitOptions<T>['assert'];
  clone: ScaffoldValidatorToolkitOptions<T>['clone'];
  is: ScaffoldValidatorToolkitOptions<T>['is'];
  prune: ScaffoldValidatorToolkitOptions<T>['prune'];
  random: ScaffoldValidatorToolkitOptions<T>['random'];
  validate: ScaffoldValidatorToolkitOptions<T>['validate'];
}

interface TemplateValidatorToolkitOptions<
  T extends object,
> extends TemplateValidatorFunctions<T> {
  finalize?: ScaffoldValidatorToolkitOptions<T>['finalize'];
  manifest: unknown;
  onValidationError?: ScaffoldValidatorToolkitOptions<T>['onValidationError'];
}

export function createTemplateValidatorToolkit<T extends object>({
  assert,
  clone,
  finalize,
  is,
  manifest,
  onValidationError,
  prune,
  random,
  validate,
}: TemplateValidatorToolkitOptions<T>) {
  return createScaffoldValidatorToolkit<T>({
    manifest: parseManifestDefaultsDocument(manifest),
    validate,
    assert,
    is,
    random,
    clone,
    prune,
    finalize,
    onValidationError,
  });
}
`,
    'utf8',
  );

  runCli(
    'node',
    [
      entryPath,
      'add',
      'block',
      'feature-grid',
      '--template',
      'compound',
    ],
    {
      cwd: targetDir,
    },
  );

  const validatorToolkitSource = fs.readFileSync(validatorToolkitPath, 'utf8');

  expect(validatorToolkitSource).toContain('// preserve-compatible-toolkit');

  typecheckGeneratedProject(targetDir);
}, 30_000);

test('add block updates migration config in a migration-enabled workspace template', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-migration');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    withMigrationUi: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add migration',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-migration',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Migration',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [entryPath, 'add', 'block', 'release-note', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );

  const migrationConfigSource = fs.readFileSync(
    path.join(targetDir, 'src', 'migrations', 'config.ts'),
    'utf8',
  );

  expect(migrationConfigSource).toContain("key: 'release-note'");
  expect(
    fs.existsSync(
      path.join(
        targetDir,
        'src',
        'migrations',
        'versions',
        'v1',
        'release-note',
        'typia.manifest.json',
      ),
    ),
  ).toBe(true);

  const doctorOutput = runCli(
    'node',
    [entryPath, 'migrate', 'doctor', '--all'],
    {
      cwd: targetDir,
    },
  );
  expect(doctorOutput).toContain('PASS Migration config');
  const rootDoctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const rootDoctorChecks = JSON.parse(rootDoctorOutput) as {
    checks: Array<{ label: string; status: string }>;
  };
  expect(
    rootDoctorChecks.checks.find(
      (check) => check.label === 'Migration workspace',
    )?.status,
  ).toBe('pass');
  expect(doctorOutput).toContain('PASS Migration doctor summary');
}, 20_000);

test('canonical CLI can add a pattern to an official workspace template', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-pattern');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add pattern',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-pattern',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Pattern',
    },
  });

  linkWorkspaceNodeModules(targetDir);
  const bootstrapPath = path.join(targetDir, 'demo-workspace-add-pattern.php');
  const nestedPatternLoader = [
    '\t$pattern_modules = array_merge(',
    "\t\tglob( __DIR__ . '/src/patterns/*.php' ) ?: array(),",
    "\t\tglob( __DIR__ . '/src/patterns/*/*.php' ) ?: array()",
    '\t);',
  ].join('\n');
  const flatPatternLoader = [
    "\tforeach ( glob( __DIR__ . '/src/patterns/*.php' ) ?: array() as $pattern_module ) {",
    '\t\trequire $pattern_module;',
    '\t}',
  ].join('\n');
  fs.writeFileSync(
    bootstrapPath,
    fs.readFileSync(bootstrapPath, 'utf8').replace(
      nestedPatternLoader,
      flatPatternLoader,
    ),
    'utf8',
  );

  expect(
    getCommandErrorMessage(() =>
      runCli('node', [entryPath, 'add', 'pattern', '2024-hero'], {
        cwd: targetDir,
      }),
    ),
  ).toContain('Pattern name must start with a letter');
  await expect(
    runAddPatternCommand({
      contentFile: 'lib/hero-layout.php',
      cwd: targetDir,
      patternName: 'hero-layout',
    }),
  ).rejects.toThrow(
    'Pattern content file must live directly under `src/patterns/` or one nested directory under `src/patterns/` and end in `.php`',
  );
  await expect(
    runAddPatternCommand({
      contentFile: 'src/patterns/sections/hero/primary.php',
      cwd: targetDir,
      patternName: 'deep-hero-layout',
    }),
  ).rejects.toThrow(
    'Pattern content file must live directly under `src/patterns/` or one nested directory under `src/patterns/` and end in `.php`',
  );
  await expect(
    runAddPatternCommand({
      cwd: targetDir,
      patternName: 'bad-thumbnail',
      thumbnailUrl: 'ftp://example.com/hero.png',
    }),
  ).rejects.toThrow(
    'Pattern thumbnail URL must be an http(s) URL or safe relative project path.',
  );

  runCli(
    'node',
    [
      entryPath,
      'add',
      'pattern',
      'hero-layout',
      '--scope',
      'section',
      '--section-role',
      'hero',
      '--catalog-title',
      'Homepage Hero',
      '--tags',
      'landing,hero',
      '--thumbnail-url',
      './thumbnails/hero-layout.png',
    ],
    {
      cwd: targetDir,
    },
  );

  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const bootstrapSource = fs.readFileSync(bootstrapPath, 'utf8');
  const patternSource = fs.readFileSync(
    path.join(targetDir, 'src', 'patterns', 'sections', 'hero-layout.php'),
    'utf8',
  );

  expect(blockConfigSource).toContain("slug: 'hero-layout'");
  expect(blockConfigSource).toContain(
    "contentFile: 'src/patterns/sections/hero-layout.php'",
  );
  expect(blockConfigSource).toContain("scope: 'section'");
  expect(blockConfigSource).toContain("sectionRole: 'hero'");
  expect(blockConfigSource).toContain("tags: ['hero', 'landing']");
  expect(blockConfigSource).toContain("title: 'Homepage Hero'");
  expect(blockConfigSource).toContain(
    "thumbnailUrl: './thumbnails/hero-layout.png'",
  );
  expect(bootstrapSource).toContain('register_block_pattern_category');
  expect(bootstrapSource).toContain(
    "require __DIR__ . '/src/patterns/wp-typia-modules.php';",
  );
  const patternManifestSource = fs.readFileSync(
    path.join(targetDir, 'src', 'patterns', 'wp-typia-modules.php'),
    'utf8',
  );
  expect(patternManifestSource).toContain(
    "require __DIR__ . '/sections/hero-layout.php';",
  );
  expect(patternSource).toContain('demo-space/hero-layout');
  expect(patternSource).toContain('section section--hero');
  expect(patternSource).toContain('"Homepage Hero"');
  expect(patternSource).toContain('<!-- wp:group');
  expect(patternSource).toContain('"className":"section section--hero"');

  runCli(
    'node',
    [
      entryPath,
      'add',
      'pattern',
      'gallery-grid',
      '--tags',
      'gallery,landing',
      '--tag',
      'hero',
      '--tag',
      'gallery',
    ],
    {
      cwd: targetDir,
    },
  );

  const updatedBlockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  expect(updatedBlockConfigSource).toContain("slug: 'gallery-grid'");
  expect(updatedBlockConfigSource).toContain(
    "tags: ['gallery', 'hero', 'landing']",
  );

  const doctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doctorOutput);
  expect(
    doctorChecks.checks.find((check) => check.label === 'Pattern bootstrap')
      ?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find((check) => check.label === 'Pattern catalog')
      ?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find((check) => check.label === 'Pattern hero-layout')
      ?.status,
  ).toBe('pass');
}, 15_000);

test('runAddBlockCommand carries compound InnerBlocks presets into workspace scaffolds', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-compound-horizontal');

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace add compound horizontal',
    slug: 'demo-workspace-add-compound-horizontal',
    title: 'Demo Workspace Add Compound Horizontal',
  });

  linkWorkspaceNodeModules(targetDir);

  const result = await runAddBlockCommand({
    blockName: 'feature-grid',
    cwd: targetDir,
    innerBlocksPreset: 'horizontal',
    templateId: 'compound',
  });

  const parentChildren = fs.readFileSync(
    path.join(targetDir, 'src', 'blocks', 'feature-grid', 'children.ts'),
    'utf8',
  );

  expect(result.blockSlugs).toEqual(['feature-grid', 'feature-grid-item']);
  expect(parentChildren).toContain("ROOT_INNER_BLOCKS_PRESET_ID = 'horizontal'");
  expect(parentChildren).toContain('directInsert: true');
  expect(parentChildren).toContain("orientation: 'horizontal'");
  typecheckGeneratedProject(targetDir);
}, 20_000);

test('canonical CLI can add a binding source to an official workspace template', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-binding-source');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add binding source',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-binding-source',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Binding Source',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli('node', [entryPath, 'add', 'binding-source', 'hero-data'], {
    cwd: targetDir,
  });

  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const bootstrapSource = fs.readFileSync(
    path.join(targetDir, 'demo-workspace-add-binding-source.php'),
    'utf8',
  );
  const bindingsIndexSource = fs.readFileSync(
    path.join(targetDir, 'src', 'bindings', 'index.ts'),
    'utf8',
  );
  const bindingServerSource = fs.readFileSync(
    path.join(targetDir, 'src', 'bindings', 'hero-data', 'server.php'),
    'utf8',
  );
  const bindingEditorSource = fs.readFileSync(
    path.join(targetDir, 'src', 'bindings', 'hero-data', 'editor.ts'),
    'utf8',
  );

  expect(blockConfigSource).toContain("slug: 'hero-data'");
  expect(blockConfigSource).toContain(
    "serverFile: 'src/bindings/hero-data/server.php'",
  );
  expect(blockConfigSource).toContain(
    "editorFile: 'src/bindings/hero-data/editor.ts'",
  );
  expect(bootstrapSource).toContain(
    "require_once __DIR__ . '/src/bindings/wp-typia-modules.php';",
  );
  expect(
    fs.readFileSync(
      path.join(targetDir, 'src', 'bindings', 'wp-typia-modules.php'),
      'utf8',
    ),
  ).toContain("require_once __DIR__ . '/hero-data/server.php';");
  expect(bootstrapSource).toContain('build/bindings/index.js');
  expect(bindingsIndexSource).toContain("import './hero-data/editor';");
  expect(bindingServerSource).toContain('register_block_bindings_source');
  expect(bindingServerSource).toContain(
    'function demo_space_hero_data_binding_source_values() : array',
  );
  expect(bindingServerSource).toContain(
    "'get_value_callback' => 'demo_space_hero_data_resolve_binding_source_value'",
  );
  expect(bindingServerSource).toContain("'hero-data' => 'Hero Data starter value'");
  expect(bindingEditorSource).toContain('registerBlockBindingsSource');
  expect(bindingEditorSource).toContain('const BINDING_SOURCE_VALUES');
  expect(bindingEditorSource).toContain(
    "'hero-data': 'Hero Data starter value'",
  );
  expect(bindingEditorSource).toContain('resolveBindingSourceValue(field)');
  expect(bindingEditorSource).toContain('getFieldsList()');

  const doctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doctorOutput);
  expect(
    doctorChecks.checks.find((check) => check.label === 'Binding bootstrap')
      ?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Binding sources index',
    )?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Binding source hero-data',
    )?.status,
  ).toBe('pass');

  runCli('npm', ['run', 'build'], { cwd: targetDir });
  expect(
    fs.existsSync(path.join(targetDir, 'build', 'bindings', 'index.js')),
  ).toBe(true);
  expect(
    fs.readFileSync(path.join(targetDir, 'build', 'bindings', 'index.js'), 'utf8'),
  ).toContain('Hero Data starter value');
  expect(
    fs.existsSync(
      path.join(targetDir, 'build', 'bindings', 'index.asset.php'),
    ),
  ).toBe(true);
  expect(
    fs.existsSync(path.join(targetDir, 'build', 'blocks-manifest.php')),
  ).toBe(true);
}, GENERATED_PROJECT_BUILD_TIMEOUT_MS);

test('canonical CLI can add an end-to-end binding source target to an existing block', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-binding-source-target',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add binding source target',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-binding-source-target',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Binding Source Target',
    },
  });

  linkWorkspaceNodeModules(targetDir);
  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );
  for (const invalidBlockName of ['/counter-card', 'counter-card/']) {
    expect(
      getCommandErrorMessage(() =>
        runCli(
          'node',
          [
            entryPath,
            'add',
            'binding-source',
            'hero-data',
            '--block',
            invalidBlockName,
            '--attribute',
            'headline',
          ],
          {
            cwd: targetDir,
          },
        ),
      ),
    ).toContain('must use <block-slug> or <namespace/block-slug> format');
  }
  runCli(
    'node',
    [
      entryPath,
      'add',
      'binding-source',
      'hero-data',
      '--block',
      'demo-space/counter-card',
      '--attribute',
      'headline',
    ],
    {
      cwd: targetDir,
    },
  );

  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const blockJson = JSON.parse(
    fs.readFileSync(
      path.join(targetDir, 'src', 'blocks', 'counter-card', 'block.json'),
      'utf8',
    ),
  );
  const bindingServerSource = fs.readFileSync(
    path.join(targetDir, 'src', 'bindings', 'hero-data', 'server.php'),
    'utf8',
  );
  const bindingEditorSource = fs.readFileSync(
    path.join(targetDir, 'src', 'bindings', 'hero-data', 'editor.ts'),
    'utf8',
  );

  expect(blockConfigSource).toContain("block: 'counter-card'");
  expect(blockConfigSource).toContain("attribute: 'headline'");
  expect(blockJson.attributes.headline).toEqual({ type: 'string' });
  expect(bindingServerSource).toContain(
    'block_bindings_supported_attributes_demo-space/counter-card',
  );
  expect(bindingServerSource).toContain(
    "if ( function_exists( 'demo_space_hero_data_supported_binding_attributes' ) )",
  );
  expect(bindingServerSource).toContain(
    'function demo_space_hero_data_supported_binding_attributes',
  );
  expect(bindingServerSource).toContain("'headline'");
  expect(bindingEditorSource).toContain('export const BINDING_SOURCE_TARGET');
  expect(bindingEditorSource).toContain("block: 'demo-space/counter-card'");
  expect(bindingEditorSource).toContain("attribute: 'headline'");

  const doctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doctorOutput);
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Binding target hero-data',
    )?.status,
  ).toBe('pass');

  runCli('npm', ['run', 'build'], { cwd: targetDir });
  expect(
    fs.existsSync(path.join(targetDir, 'build', 'bindings', 'index.js')),
  ).toBe(true);
}, GENERATED_PROJECT_BUILD_TIMEOUT_MS);

test('binding source workflow preserves existing files on duplicate failure', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-binding-source-duplicate',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace binding source duplicate',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-binding-source-duplicate',
      textDomain: 'demo-space',
      title: 'Demo Workspace Binding Source Duplicate',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  expect(
    getCommandErrorMessage(() =>
      runCli('node', [entryPath, 'add', 'binding-source', '2024-hero'], {
        cwd: targetDir,
      }),
    ),
  ).toContain('Binding source name must start with a letter');

  runCli('node', [entryPath, 'add', 'binding-source', 'hero-data'], {
    cwd: targetDir,
  });

  const originalServerSource = fs.readFileSync(
    path.join(targetDir, 'src', 'bindings', 'hero-data', 'server.php'),
    'utf8',
  );
  const originalInventorySource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );

  expect(
    getCommandErrorMessage(() =>
      runCli('node', [entryPath, 'add', 'binding-source', 'hero-data'], {
        cwd: targetDir,
      }),
    ),
  ).toContain('A binding source already exists');

  expect(
    fs.readFileSync(
      path.join(targetDir, 'src', 'bindings', 'hero-data', 'server.php'),
      'utf8',
    ),
  ).toBe(originalServerSource);
  expect(
    fs.readFileSync(
      path.join(targetDir, 'scripts', 'block-config.ts'),
      'utf8',
    ),
  ).toBe(originalInventorySource);
}, 15_000);

test('binding source rollback restores an existing src/bindings/index.js registry', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-binding-source-js-rollback',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace binding js rollback',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-binding-source-js-rollback',
      textDomain: 'demo-space',
      title: 'Demo Workspace Binding Js Rollback',
    },
  });

  linkWorkspaceNodeModules(targetDir);
  runCli('node', [entryPath, 'add', 'binding-source', 'hero-data'], {
    cwd: targetDir,
  });

  const bindingsTsPath = path.join(targetDir, 'src', 'bindings', 'index.ts');
  const bindingsJsPath = path.join(targetDir, 'src', 'bindings', 'index.js');
  fs.renameSync(bindingsTsPath, bindingsJsPath);
  const originalBindingsIndexSource = fs.readFileSync(bindingsJsPath, 'utf8');

  const blockConfigPath = path.join(targetDir, 'scripts', 'block-config.ts');
  fs.writeFileSync(
    blockConfigPath,
    fs
      .readFileSync(blockConfigPath, 'utf8')
      .replace(
        '// wp-typia add binding-source entries',
        '// missing binding source marker',
      ),
    'utf8',
  );

  expect(
    getCommandErrorMessage(() =>
      runCli('node', [entryPath, 'add', 'binding-source', 'news-data'], {
        cwd: targetDir,
      }),
    ),
  ).toContain('Workspace inventory marker');

  const rolledBackBindingSourceDir = path.join(
    targetDir,
    'src',
    'bindings',
    'news-data',
  );
  expect(fs.existsSync(bindingsTsPath)).toBe(false);
  expect(fs.readFileSync(bindingsJsPath, 'utf8')).toBe(
    originalBindingsIndexSource,
  );
  expect(fs.existsSync(rolledBackBindingSourceDir)).toBe(false);
  expect(
    fs.existsSync(path.join(rolledBackBindingSourceDir, 'server.php')),
  ).toBe(false);
  expect(
    fs.existsSync(path.join(rolledBackBindingSourceDir, 'editor.ts')),
  ).toBe(false);
}, 15_000);

test('canonical CLI can add a standalone contract to an official workspace template', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-contract');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add contract',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-contract',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Contract',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'contract',
      'external-retrieve-response',
      '--type',
      'ExternalRetrieveResponse',
    ],
    {
      cwd: targetDir,
    },
  );

  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const syncRestSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'sync-rest-contracts.ts'),
    'utf8',
  );
  const typesSource = fs.readFileSync(
    path.join(targetDir, 'src', 'contracts', 'external-retrieve-response.ts'),
    'utf8',
  );
  const schemaPath = path.join(
    targetDir,
    'src',
    'contracts',
    'external-retrieve-response.schema.json',
  );

  expect(blockConfigSource).toContain('export const CONTRACTS');
  expect(blockConfigSource).toContain("slug: 'external-retrieve-response'");
  expect(blockConfigSource).toContain(
    "sourceTypeName: 'ExternalRetrieveResponse'",
  );
  expect(blockConfigSource).toContain(
    "schemaFile: 'src/contracts/external-retrieve-response.schema.json'",
  );
  expect(typesSource).toContain('export interface ExternalRetrieveResponse');
  expect(syncRestSource).toContain('const standaloneContracts');
  expect(syncRestSource).toContain('contract.schemaFile');
  expect(fs.existsSync(schemaPath)).toBe(true);
  expect(
    fs.existsSync(
      path.join(targetDir, 'inc', 'rest', 'external-retrieve-response.php'),
    ),
  ).toBe(false);

  runCli('npm', ['run', 'sync', '--', '--check'], { cwd: targetDir });

  fs.writeFileSync(schemaPath, '{}\n', 'utf8');
  expect(() =>
    runCli('npm', ['run', 'sync', '--', '--check'], { cwd: targetDir }),
  ).toThrow('Sync script failed');
  runCli('npm', ['run', 'sync'], { cwd: targetDir });
  typecheckGeneratedProject(targetDir);
}, GENERATED_PROJECT_BUILD_TIMEOUT_MS);

test('contract workflow rejects reserved TypeScript type names before writing files', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-contract-reserved-type',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add contract reserved type',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-contract-reserved-type',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Contract Reserved Type',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'contract',
          'external-retrieve-response',
          '--type',
          'class',
        ],
        { cwd: targetDir },
      ),
    ),
  ).toContain(
    'Contract type must not be a reserved TypeScript keyword, such as class.',
  );
  expect(
    fs.existsSync(
      path.join(targetDir, 'src', 'contracts', 'external-retrieve-response.ts'),
    ),
  ).toBe(false);
  expect(
    fs.existsSync(
      path.join(
        targetDir,
        'src',
        'contracts',
        'external-retrieve-response.schema.json',
      ),
    ),
  ).toBe(false);
  expect(
    fs
      .readFileSync(path.join(targetDir, 'scripts', 'block-config.ts'), 'utf8')
      .includes("slug: 'external-retrieve-response'"),
  ).toBe(false);
}, 20_000);

test('canonical CLI can add a typed post meta contract to an official workspace template', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-post-meta');

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace add post meta',
    slug: 'demo-workspace-add-post-meta',
    title: 'Demo Workspace Add Post Meta',
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'post-meta',
      'integration-state',
      '--post-type',
      'example_post_type',
      '--type',
      'IntegrationStateMeta',
      '--meta-key',
      '_demo_space_integration_state',
    ],
    {
      cwd: targetDir,
    },
  );

  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const bootstrapSource = fs.readFileSync(
    path.join(targetDir, 'demo-workspace-add-post-meta.php'),
    'utf8',
  );
  const syncRestSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'sync-rest-contracts.ts'),
    'utf8',
  );
  const typesSource = fs.readFileSync(
    path.join(targetDir, 'src', 'post-meta', 'integration-state', 'types.ts'),
    'utf8',
  );
  const phpSource = fs.readFileSync(
    path.join(targetDir, 'inc', 'post-meta', 'integration-state.php'),
    'utf8',
  );
  const readmeSource = fs.readFileSync(
    path.join(targetDir, 'src', 'post-meta', 'integration-state', 'README.md'),
    'utf8',
  );
  const schemaPath = path.join(
    targetDir,
    'src',
    'post-meta',
    'integration-state',
    'meta.schema.json',
  );

  expect(blockConfigSource).toContain('export const POST_META');
  expect(blockConfigSource).toContain("slug: 'integration-state'");
  expect(blockConfigSource).toContain("postType: 'example_post_type'");
  expect(blockConfigSource).toContain(
    "metaKey: '_demo_space_integration_state'",
  );
  expect(blockConfigSource).toContain('showInRest: true');
  expect(blockConfigSource).toContain(
    "sourceTypeName: 'IntegrationStateMeta'",
  );
  expect(blockConfigSource).toContain(
    "schemaFile: 'src/post-meta/integration-state/meta.schema.json'",
  );
  expect(bootstrapSource).toContain(
    'function demo_space_register_post_meta_contracts()',
  );
  expect(bootstrapSource).toContain(
    "require_once __DIR__ . '/inc/post-meta/wp-typia-modules.php';",
  );
  expect(
    fs.readFileSync(
      path.join(targetDir, 'inc', 'post-meta', 'wp-typia-modules.php'),
      'utf8',
    ),
  ).toContain("require_once __DIR__ . '/integration-state.php';");
  expect(syncRestSource).toContain('POST_META');
  expect(syncRestSource).toContain('const postMetaContracts');
  expect(syncRestSource).toContain('for (const postMeta of postMetaContracts)');
  expect(typesSource).toContain('export interface IntegrationStateMeta');
  expect(phpSource).toContain('register_post_meta');
  expect(phpSource).toContain('example_post_type');
  expect(phpSource).toContain('_demo_space_integration_state');
  expect(phpSource).toContain('src/post-meta/integration-state/meta.schema.json');
  expect(phpSource).toContain("'show_in_rest'");
  expect(readmeSource).toContain('wp-typia sync-rest --check');
  expect(fs.existsSync(schemaPath)).toBe(true);

  const doctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doctorOutput);
  expect(
    doctorChecks.checks.find((check) => check.label === 'Post meta bootstrap')
      ?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Post meta config integration-state',
    )?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find((check) => check.label === 'Post meta integration-state')
      ?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Post meta PHP integration-state',
    )?.status,
  ).toBe('pass');

  runCli('npm', ['run', 'sync-rest', '--', '--check'], { cwd: targetDir });

  fs.writeFileSync(schemaPath, '{}\n', 'utf8');
  expect(() =>
    runCli('npm', ['run', 'sync-rest', '--', '--check'], { cwd: targetDir }),
  ).toThrow('Generated artifacts are missing or stale');
  runCli('npm', ['run', 'sync-rest'], { cwd: targetDir });
  typecheckGeneratedProject(targetDir);
}, 120_000);

test('canonical CLI can add a binding source backed by typed post meta', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-post-meta-binding-source',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace add post meta binding source',
    slug: 'demo-workspace-add-post-meta-binding-source',
    title: 'Demo Workspace Add Post Meta Binding Source',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );
  runCli(
    'node',
    [
      entryPath,
      'add',
      'post-meta',
      'integration-state',
      '--post-type',
      'post',
      '--type',
      'IntegrationStateMeta',
      '--meta-key',
      '_demo_space_integration_state',
    ],
    {
      cwd: targetDir,
    },
  );

  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'binding-source',
          'integration-state-source',
          '--from-post-meta',
          'integration-state',
          '--meta-path',
          'missing',
        ],
        {
          cwd: targetDir,
        },
      ),
    ),
  ).toContain('does not exist in the "integration-state" schema');

  runCli(
    'node',
    [
      entryPath,
      'add',
      'binding-source',
      'integration-state-source',
      '--from-post-meta',
      'integration-state',
      '--meta-path',
      'enabled',
      '--block',
      'counter-card',
      '--attribute',
      'isEnabled',
    ],
    {
      cwd: targetDir,
    },
  );

  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const bindingServerSource = fs.readFileSync(
    path.join(
      targetDir,
      'src',
      'bindings',
      'integration-state-source',
      'server.php',
    ),
    'utf8',
  );
  const bindingEditorSource = fs.readFileSync(
    path.join(
      targetDir,
      'src',
      'bindings',
      'integration-state-source',
      'editor.ts',
    ),
    'utf8',
  );
  const blockTypesSource = fs.readFileSync(
    path.join(targetDir, 'src', 'blocks', 'counter-card', 'types.ts'),
    'utf8',
  );
  const blockJson = JSON.parse(
    fs.readFileSync(
      path.join(targetDir, 'src', 'blocks', 'counter-card', 'block.json'),
      'utf8',
    ),
  ) as { attributes?: Record<string, unknown> };

  expect(blockConfigSource).toContain("postMeta: 'integration-state'");
  expect(blockConfigSource).toContain("metaPath: 'enabled'");
  expect(bindingServerSource).toContain('get_post_meta');
  expect(bindingServerSource).toContain('dirname( __DIR__, 3 )');
  expect(bindingServerSource).toContain('_demo_space_integration_state');
  expect(bindingServerSource).not.toContain('_post_meta_preview_values');
  expect(bindingServerSource).not.toContain('_format_binding_value');
  expect(bindingServerSource).toContain('return null;');
  expect(bindingServerSource).toContain('return $value;');
  expect(bindingServerSource).toContain(
    "'uses_context' => array( 'postId', 'postType' )",
  );
  expect(bindingServerSource).toContain(
    "$post_type = is_string( $post->post_type ) ? $post->post_type : '';",
  );
  expect(bindingServerSource).toContain('_can_read_post_meta( $post_id )');
  expect(bindingServerSource).not.toContain("$block_instance->context['postType']");
  expect(bindingServerSource).toContain("current_user_can( 'read_post'");
  expect(bindingServerSource).not.toContain('is_protected_meta');
  expect(bindingServerSource).toContain('get_registered_meta_keys');
  expect(bindingServerSource).toContain("['show_in_rest']");
  expect(bindingServerSource).not.toContain('get_the_ID');
  expect(bindingServerSource).toContain(
    'src/post-meta/integration-state/meta.schema.json',
  );
  expect(bindingServerSource).toContain("'enabled'");
  expect(bindingEditorSource).toContain('POST_META_BINDING_SOURCE');
  expect(bindingEditorSource).toContain('POST_META_BINDING_FIELDS');
  expect(bindingEditorSource).toContain(
    "label: __('Status', 'demo-space')",
  );
  expect(bindingEditorSource).toContain("schemaType: 'boolean'");
  expect(bindingEditorSource).toContain('previewValue: false');
  expect(bindingEditorSource).toContain(
    'const POST_META_PREVIEW_VALUES: Record<string, unknown>',
  );
  expect(bindingEditorSource).toContain(
    'type: resolveBindingFieldType(field.schemaType)',
  );
  expect(bindingEditorSource).toContain(
    'const values: Record<string, unknown>',
  );
  expect(bindingEditorSource).toContain("field: 'enabled'");
  expect(bindingEditorSource).toContain(
    "schemaFile: 'src/post-meta/integration-state/meta.schema.json'",
  );
  expect(blockTypesSource).toContain('isEnabled?: boolean;');
  expect(blockJson.attributes?.isEnabled).toEqual({ type: 'boolean' });

  const doctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doctorOutput);
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Binding post meta integration-state-source',
    )?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Binding target integration-state-source',
    )?.status,
  ).toBe('pass');

  runCli('npm', ['run', 'sync-rest', '--', '--check'], { cwd: targetDir });
  runCli('npm', ['run', 'build'], { cwd: targetDir });
}, GENERATED_PROJECT_BUILD_TIMEOUT_MS);

test('canonical CLI can add a type-only manual REST contract to an official workspace template', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-manual-rest-contract');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add manual rest contract',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-manual-rest-contract',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Manual Rest Contract',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  const blockConfigPath = path.join(targetDir, 'scripts', 'block-config.ts');
  fs.writeFileSync(
    blockConfigPath,
    replaceFixtureSource(
      fs.readFileSync(blockConfigPath, 'utf8'),
      /export interface WorkspaceRestResourceBaseConfig \{[\s\S]*?export type WorkspaceRestResourceConfig =\s*\|\s*GeneratedWorkspaceRestResourceConfig\s*\|\s*ManualWorkspaceRestResourceConfig;\n/u,
      `export interface WorkspaceRestResourceConfig {
  apiFile: string;
  clientFile: string;
  dataFile: string;
  methods: Array<'list' | 'read' | 'create' | 'update' | 'delete'>;
  namespace: string;
  openApiFile: string;
  phpFile: string;
  restManifest?: ReturnType<
    typeof import('@wp-typia/block-runtime/metadata-core').defineEndpointManifest
  >;
  slug: string;
  typesFile: string;
  validatorsFile: string;
}
`,
      'legacy REST resource config interface',
    ),
    'utf8',
  );

  runCli(
    'node',
    [
      entryPath,
      'add',
      'rest-resource',
      'external-record',
      '--manual',
      '--namespace',
      'legacy/v1',
      '--method',
      'POST',
      '--auth',
      'Authenticated',
      '--route-pattern',
      '/records/(?P<post_id>[\\d]+(?:-[\\d]+)*)',
      '--permission-callback',
      'legacy_can_read_external_record',
      '--controller-class',
      'Legacy\\Records\\Controller',
      '--controller-extends',
      'Legacy\\Records\\BaseController',
      '--query-type',
      'ExternalRecordQuery',
      '--body-type',
      'ExternalRecordRequest',
      '--response-type',
      'ExternalRecordResponse',
      '--secret-field',
      'apiKey',
      '--secret-has-value-field',
      'hasApiKey',
      '--secret-preserve-on-empty',
      'true',
    ],
    {
      cwd: targetDir,
    },
  );

  const blockConfigSource = fs.readFileSync(
    blockConfigPath,
    'utf8',
  );
  const syncRestSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'sync-rest-contracts.ts'),
    'utf8',
  );
  const typesSource = fs.readFileSync(
    path.join(targetDir, 'src', 'rest', 'external-record', 'api-types.ts'),
    'utf8',
  );
  const validatorsSource = fs.readFileSync(
    path.join(targetDir, 'src', 'rest', 'external-record', 'api-validators.ts'),
    'utf8',
  );
  const clientSource = fs.readFileSync(
    path.join(targetDir, 'src', 'rest', 'external-record', 'api-client.ts'),
    'utf8',
  );
  const openApiSource = fs.readFileSync(
    path.join(targetDir, 'src', 'rest', 'external-record', 'api.openapi.json'),
    'utf8',
  );
  const responseSchemaPath = path.join(
    targetDir,
    'src',
    'rest',
    'external-record',
    'api-schemas',
    'response.schema.json',
  );
  const requestSchemaPath = path.join(
    targetDir,
    'src',
    'rest',
    'external-record',
    'api-schemas',
    'request.schema.json',
  );

  expect(blockConfigSource).toContain("slug: 'external-record'");
  expect(blockConfigSource).toContain("mode: 'manual'");
  expect(blockConfigSource).toContain("auth: 'authenticated'");
  expect(blockConfigSource).toContain("namespace: 'legacy/v1'");
  expect(blockConfigSource).toContain("method: 'POST'");
  expect(blockConfigSource).toContain(
    "pathPattern: '/records/(?P<post_id>[\\\\d]+(?:-[\\\\d]+)*)'",
  );
  expect(blockConfigSource).toContain(
    "permissionCallback: 'legacy_can_read_external_record'",
  );
  expect(blockConfigSource).toContain(
    "controllerClass: 'Legacy\\\\Records\\\\Controller'",
  );
  expect(blockConfigSource).toContain(
    "controllerExtends: 'Legacy\\\\Records\\\\BaseController'",
  );
  expect(blockConfigSource).toContain(
    "queryTypeName: 'ExternalRecordQuery'",
  );
  expect(blockConfigSource).toContain(
    "bodyTypeName: 'ExternalRecordRequest'",
  );
  expect(blockConfigSource).toContain(
    "responseTypeName: 'ExternalRecordResponse'",
  );
  expect(blockConfigSource).toContain('secretPreserveOnEmpty: true');
  expect(blockConfigSource).toContain('  dataFile?: string;');
  expect(blockConfigSource).toContain('  phpFile?: string;');
  expect(blockConfigSource).not.toContain('inc/rest/external-record.php');
  expect(blockConfigSource).not.toContain(
    "dataFile: 'src/rest/external-record/data.ts'",
  );
  expect(syncRestSource).toContain(
    'REST_RESOURCES.filter(isWorkspaceRestResource)',
  );
  expect(typesSource).toContain('export interface ExternalRecordQuery');
  expect(typesSource).toContain('post_id: string & tags.MinLength< 1 >;');
  expect(typesSource).toContain('export interface ExternalRecordRequest');
  expect(typesSource).toContain('apiKey?: string');
  expect(typesSource).toContain("tags.Secret< 'hasApiKey' >");
  expect(typesSource).toContain('tags.PreserveOnEmpty< true >');
  expect(typesSource).toContain('export interface ExternalRecordResponse');
  expect(typesSource).toContain('hasApiKey: boolean');
  expect(typesSource).not.toContain('apiKey: boolean');
  expect(validatorsSource).toContain('query:');
  expect(validatorsSource).toContain('request:');
  expect(validatorsSource).toContain('response:');
  expect(clientSource).toContain('callExternalRecordManualRestContract');
  expect(clientSource).toContain("authIntent: 'authenticated'");
  expect(clientSource).toContain("authMode: 'authenticated-rest-nonce'");
  expect(clientSource).toContain('buildRequestOptions: (request) => {');
  expect(clientSource).toContain('const rawPathParams = request.query as unknown;');
  expect(clientSource).toContain(
    "const pathParams = rawPathParams && typeof rawPathParams === 'object'",
  );
  expect(clientSource).toContain("const pathParam0Name = 'post_id';");
  expect(clientSource).toContain('const pathParam0 = pathParams[pathParam0Name];');
  expect(clientSource).toContain(
    'path: `/legacy/v1/records/${encodeURIComponent( String( pathParam0 ) )}`',
  );
  expect(clientSource).toContain("requestLocation: 'query-and-body'");
  expect(openApiSource).toContain(
    '/legacy/v1/records/(?P<post_id>[\\\\d]+(?:-[\\\\d]+)*)',
  );
  expect(openApiSource).toContain('"x-typia-authIntent": "authenticated"');

  runCli(
    'node',
    [
      entryPath,
      'add',
      'rest-resource',
      'external-token',
      '--manual',
      '--namespace',
      'legacy/v1',
      '--method',
      'POST',
      '--auth',
      'Authenticated',
      '--body-type',
      'ExternalTokenRequest',
      '--response-type',
      'ExternalTokenResponse',
      '--secret-field',
      'apiToken',
      '--secret-state-field',
      'hasApiToken',
      '--secret-preserve-on-empty',
      'false',
    ],
    {
      cwd: targetDir,
    },
  );

  const updatedBlockConfigSource = fs.readFileSync(
    blockConfigPath,
    'utf8',
  );
  const nonPreservedTypesSource = fs.readFileSync(
    path.join(targetDir, 'src', 'rest', 'external-token', 'api-types.ts'),
    'utf8',
  );
  const nonPreservedOpenApiSource = fs.readFileSync(
    path.join(targetDir, 'src', 'rest', 'external-token', 'api.openapi.json'),
    'utf8',
  );
  const nonPreservedRequestSchema = JSON.parse(
    fs.readFileSync(
      path.join(
        targetDir,
        'src',
        'rest',
        'external-token',
        'api-schemas',
        'request.schema.json',
      ),
      'utf8',
    ),
  ) as { properties: Record<string, Record<string, unknown>> };

  expect(updatedBlockConfigSource).toContain('secretPreserveOnEmpty: false');
  expect(nonPreservedTypesSource).toContain(
    "apiToken?: string & tags.MaxLength< 4096 > & tags.Secret< 'hasApiToken' >;",
  );
  expect(nonPreservedTypesSource).not.toContain(
    'apiToken?: string & tags.MinLength< 1 >',
  );
  expect(nonPreservedTypesSource).not.toContain('tags.PreserveOnEmpty< true >');
  expect(nonPreservedOpenApiSource).toContain('"writeOnly": true');
  expect(nonPreservedOpenApiSource).not.toContain(
    '"x-wp-typia-preserveOnEmpty": true',
  );
  expect(nonPreservedRequestSchema.properties.apiToken).toMatchObject({
    writeOnly: true,
    'x-wp-typia-secret': true,
    'x-wp-typia-secretStateField': 'hasApiToken',
  });
  expect(
    nonPreservedRequestSchema.properties.apiToken?.['x-wp-typia-preserveOnEmpty'],
  ).not.toBe(true);
  expect(openApiSource).toContain('"writeOnly": true');
  expect(openApiSource).toContain('"x-wp-typia-preserveOnEmpty": true');
  expect(openApiSource).toContain('"x-wp-typia-secret": true');
  expect(openApiSource).toContain('"x-wp-typia-secretStateField": "hasApiKey"');
  expect(fs.existsSync(responseSchemaPath)).toBe(true);
  expect(fs.existsSync(requestSchemaPath)).toBe(true);
  const requestSchema = JSON.parse(
    fs.readFileSync(requestSchemaPath, 'utf8'),
  ) as { properties: Record<string, Record<string, unknown>> };
  const responseSchema = JSON.parse(
    fs.readFileSync(responseSchemaPath, 'utf8'),
  ) as { properties: Record<string, unknown> };
  expect(requestSchema.properties.apiKey).toMatchObject({
    writeOnly: true,
    'x-wp-typia-preserveOnEmpty': true,
    'x-wp-typia-secret': true,
    'x-wp-typia-secretStateField': 'hasApiKey',
  });
  expect(responseSchema.properties).toHaveProperty('hasApiKey');
  expect(responseSchema.properties).not.toHaveProperty('apiKey');
  expect(
    fs.existsSync(path.join(targetDir, 'inc', 'rest', 'external-record.php')),
  ).toBe(false);
  expect(
    fs.existsSync(path.join(targetDir, 'src', 'rest', 'external-record', 'data.ts')),
  ).toBe(false);

  const doctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doctorOutput);
  expect(
    doctorChecks.checks.find((check) => check.label === 'REST resource bootstrap'),
  ).toBeUndefined();
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'REST resource config external-record',
    )?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find((check) => check.label === 'REST resource external-record')
      ?.status,
  ).toBe('pass');

  runCli('npm', ['run', 'sync-rest', '--', '--check'], { cwd: targetDir });

  fs.writeFileSync(responseSchemaPath, '{}\n', 'utf8');
  expect(() =>
    runCli('npm', ['run', 'sync-rest', '--', '--check'], { cwd: targetDir }),
  ).toThrow('Generated artifacts are missing or stale');
  runCli('npm', ['run', 'sync-rest'], { cwd: targetDir });
  typecheckGeneratedProject(targetDir);
}, 60_000);

test('canonical CLI can add a typed admin settings screen from a manual REST contract', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-admin-settings-screen',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add admin settings screen',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-admin-settings-screen',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Admin Settings Screen',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'rest-resource',
      'integration-settings',
      '--manual',
      '--namespace',
      'demo-space/v1',
      '--method',
      'POST',
      '--path',
      '/settings',
      '--secret-field',
      'apiKey',
    ],
    { cwd: targetDir },
  );
  fs.writeFileSync(
    path.join(targetDir, 'src', 'rest', 'integration-settings', 'api.ts'),
    "export * from './api-client';\n",
    'utf8',
  );
  runCli(
    'node',
    [
      entryPath,
      'add',
      'admin-view',
      'integration-settings',
      '--source',
      'rest-resource:integration-settings',
    ],
    { cwd: targetDir },
  );

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const apiSource = fs.readFileSync(
    path.join(targetDir, 'src', 'rest', 'integration-settings', 'api.ts'),
    'utf8',
  );
  const entrySource = fs.readFileSync(
    path.join(targetDir, 'src', 'admin-views', 'integration-settings', 'index.tsx'),
    'utf8',
  );
  const configSource = fs.readFileSync(
    path.join(targetDir, 'src', 'admin-views', 'integration-settings', 'config.ts'),
    'utf8',
  );
  const dataSource = fs.readFileSync(
    path.join(targetDir, 'src', 'admin-views', 'integration-settings', 'data.ts'),
    'utf8',
  );
  const screenSource = fs.readFileSync(
    path.join(targetDir, 'src', 'admin-views', 'integration-settings', 'Screen.tsx'),
    'utf8',
  );

  expect(packageJson.dependencies?.['@wordpress/dataviews']).toBeUndefined();
  expect(packageJson.devDependencies?.['@wp-typia/dataviews']).toBeUndefined();
  expect(blockConfigSource).toContain(
    "source: 'rest-resource:integration-settings'",
  );
  expect(blockConfigSource).toContain("secretFieldName: 'apiKey'");
  expect(blockConfigSource).toContain('secretPreserveOnEmpty: true');
  expect(blockConfigSource).toContain(
    "secretStateFieldName: 'hasApiKey'",
  );
  expect(apiSource).toContain('manualRestContractEndpoint');
  expect(apiSource).toContain('callManualRestContract');
  expect(apiSource).toContain('resolveRestRouteUrl');
  expect(entrySource).not.toContain('@wordpress/dataviews/build-style/style.css');
  expect(configSource).toContain('integrationSettingsSettingsConfig');
  expect(configSource).toContain("secretFieldName: 'apiKey'");
  expect(configSource).toContain('secretPreserveOnEmpty: true');
  expect(configSource).toContain('preserveOnEmpty: true');
  expect(configSource).toContain("secretStateFieldName: 'hasApiKey'");
  expect(dataSource).toContain('callManualRestContract');
  expect(dataSource).toContain('saveIntegrationSettingsSettings');
  expect(dataSource).not.toContain("apiKey: ''");
  expect(dataSource).toContain("const secretFieldName = 'apiKey';");
  expect(dataSource).toContain('delete requestBody[secretFieldName]');
  expect(dataSource).toContain('if (!result.isValid)');
  expect(dataSource).not.toContain('!result.data');
  expect(dataSource).toContain(
    'body: requestBody as unknown as IntegrationSettingsSettingsRequest',
  );
  expect(screenSource).toContain('Typed settings screen');
  expect(screenSource).toContain('TextControl');
  expect(screenSource).toContain('TextareaControl');
  expect(screenSource).toContain('Save settings');
  expect(screenSource).toContain('A secret is currently configured');

  runCli(
    'node',
    [
      entryPath,
      'add',
      'rest-resource',
      'credential-reset',
      '--manual',
      '--namespace',
      'demo-space/v1',
      '--method',
      'POST',
      '--path',
      '/credential-reset',
      '--secret-field',
      'apiToken',
      '--secret-preserve-on-empty',
      'false',
    ],
    { cwd: targetDir },
  );
  fs.writeFileSync(
    path.join(targetDir, 'src', 'rest', 'credential-reset', 'api.ts'),
    "export * from './api-client';\n",
    'utf8',
  );
  runCli(
    'node',
    [
      entryPath,
      'add',
      'admin-view',
      'credential-reset',
      '--source',
      'rest-resource:credential-reset',
    ],
    { cwd: targetDir },
  );

  const nonPreservedSettingsConfigSource = fs.readFileSync(
    path.join(targetDir, 'src', 'admin-views', 'credential-reset', 'config.ts'),
    'utf8',
  );
  const nonPreservedSettingsDataSource = fs.readFileSync(
    path.join(targetDir, 'src', 'admin-views', 'credential-reset', 'data.ts'),
    'utf8',
  );

  expect(nonPreservedSettingsConfigSource).toContain(
    'secretPreserveOnEmpty: false',
  );
  expect(nonPreservedSettingsConfigSource).toContain('preserveOnEmpty: false');
  expect(nonPreservedSettingsDataSource).toContain("apiToken: '',");
  expect(nonPreservedSettingsDataSource).not.toContain(
    'delete requestBody["apiToken"]',
  );

  const doctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doctorOutput);
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Admin view config integration-settings',
    )?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Admin view PHP integration-settings',
    )?.status,
  ).toBe('pass');

  runCli('npm', ['run', 'sync-rest', '--', '--check'], { cwd: targetDir });
  runCli('npm', ['run', 'build'], { cwd: targetDir });
  typecheckGeneratedProject(targetDir);
}, GENERATED_PROJECT_BUILD_TIMEOUT_MS);

test('admin settings screens reject manual REST contracts with route parameters', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-admin-settings-route-params',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace admin settings route params',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-admin-settings-route-params',
      textDomain: 'demo-space',
      title: 'Demo Workspace Admin Settings Route Params',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'rest-resource',
      'integration-settings',
      '--manual',
      '--namespace',
      'demo-space/v1',
      '--method',
      'POST',
      '--path',
      '/settings/([\\d]+)',
    ],
    { cwd: targetDir },
  );

  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'admin-view',
          'integration-settings',
          '--source',
          'rest-resource:integration-settings',
        ],
        { cwd: targetDir },
      ),
    ),
  ).toContain(
    'REST resource source "integration-settings" uses route parameters or regex groups and cannot scaffold a singleton admin settings form',
  );
  expect(
    fs.existsSync(
      path.join(targetDir, 'src', 'admin-views', 'integration-settings'),
    ),
  ).toBe(false);

  const blockConfigPath = path.join(targetDir, 'scripts', 'block-config.ts');
  const blockConfigSource = fs.readFileSync(blockConfigPath, 'utf8');
  fs.writeFileSync(
    blockConfigPath,
    blockConfigSource.replace(
      '  // wp-typia add admin-view entries',
      [
        '  {',
        "    file: 'src/admin-views/integration-settings/index.tsx',",
        "    phpFile: 'inc/admin-views/integration-settings.php',",
        "    slug: 'integration-settings',",
        "    source: 'rest-resource:integration-settings',",
        '  },',
        '  // wp-typia add admin-view entries',
      ].join('\n'),
    ),
    'utf8',
  );

  const doctorResult = runCapturedCli(
    'node',
    [entryPath, 'doctor', '--format', 'json'],
    {
      cwd: targetDir,
    },
  );
  expect(doctorResult.status).toBe(1);
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doctorResult.stdout);
  const configCheck = doctorChecks.checks.find(
    (check) => check.label === 'Admin view config integration-settings',
  );
  expect(configCheck?.status).toBe('fail');
  expect(configCheck?.detail).toContain(
    'uses route parameters or regex groups and cannot scaffold a singleton settings form',
  );
}, 30_000);

test('admin settings screens require manual REST api shims to export the shared caller', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-admin-settings-api-export',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace admin settings api export',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-admin-settings-api-export',
      textDomain: 'demo-space',
      title: 'Demo Workspace Admin Settings API Export',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'rest-resource',
      'integration-settings',
      '--manual',
      '--namespace',
      'demo-space/v1',
      '--method',
      'POST',
      '--path',
      '/settings',
    ],
    { cwd: targetDir },
  );
  fs.writeFileSync(
    path.join(targetDir, 'src', 'rest', 'integration-settings', 'api.ts'),
    [
      "const callManualRestContract = 'local-only';",
      "export * from './api-client';",
      '',
    ].join('\n'),
    'utf8',
  );

  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'admin-view',
          'integration-settings',
          '--source',
          'rest-resource:integration-settings',
        ],
        { cwd: targetDir },
      ),
    ),
  ).toContain(
    'Manual REST resource source "integration-settings" must export callManualRestContract',
  );
  expect(
    fs.existsSync(
      path.join(targetDir, 'src', 'admin-views', 'integration-settings'),
    ),
  ).toBe(false);
}, 30_000);

test('manual REST contract workflow rejects duplicate type names before writing files', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-manual-rest-contract-duplicate-types',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace manual rest duplicate types',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-manual-rest-contract-duplicate-types',
      textDomain: 'demo-space',
      title: 'Demo Workspace Manual Rest Duplicate Types',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'rest-resource',
          'external-record',
          '--manual',
          '--query-type',
          'ExternalRecordContract',
          '--response-type',
          'ExternalRecordContract',
        ],
        { cwd: targetDir },
      ),
    ),
  ).toContain('Manual REST contract type names must be unique');
  expect(
    fs.existsSync(path.join(targetDir, 'src', 'rest', 'external-record')),
  ).toBe(false);
}, 20_000);

test('manual REST contract workflow rejects secret field name collisions before writing files', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-manual-rest-contract-secret-collisions',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace manual rest secret collisions',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-manual-rest-contract-secret-collisions',
      textDomain: 'demo-space',
      title: 'Demo Workspace Manual Rest Secret Collisions',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'rest-resource',
          'external-record',
          '--manual',
          '--method',
          'POST',
          '--secret-field',
          'payload',
        ],
        { cwd: targetDir },
      ),
    ),
  ).toContain(
    'Manual REST contract secret field must not reuse scaffolded request body fields',
  );
  expect(
    fs.existsSync(path.join(targetDir, 'src', 'rest', 'external-record')),
  ).toBe(false);

  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'rest-resource',
          'external-record',
          '--manual',
          '--method',
          'POST',
          '--secret-field',
          'apiKey',
          '--secret-state-field',
          'status',
        ],
        { cwd: targetDir },
      ),
    ),
  ).toContain(
    'Manual REST contract secret state field must not reuse scaffolded response fields',
  );
  expect(
    fs.existsSync(path.join(targetDir, 'src', 'rest', 'external-record')),
  ).toBe(false);
}, 20_000);

test('manual REST contract workflow rejects GET routes with body types before writing files', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-manual-rest-contract-get-body',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace manual rest GET body',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-manual-rest-contract-get-body',
      textDomain: 'demo-space',
      title: 'Demo Workspace Manual Rest GET Body',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'rest-resource',
          'external-record',
          '--manual',
          '--method',
          'GET',
          '--body-type',
          'ExternalRecordRequest',
        ],
        { cwd: targetDir },
      ),
    ),
  ).toContain('Manual REST contract GET routes cannot define a body type');
  expect(
    fs.existsSync(path.join(targetDir, 'src', 'rest', 'external-record')),
  ).toBe(false);
}, 20_000);

test('canonical CLI can add a plugin-level REST resource to an official workspace template', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-rest-resource');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add rest resource',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-rest-resource',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Rest Resource',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'rest-resource',
      'snapshots',
      '--namespace',
      'demo-space/v1',
      '--methods',
      'list,read,create,update,delete',
    ],
    {
      cwd: targetDir,
    },
  );

  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const bootstrapSource = fs.readFileSync(
    path.join(targetDir, 'demo-workspace-add-rest-resource.php'),
    'utf8',
  );
  const restSchemaHelperSource = fs.readFileSync(
    path.join(targetDir, 'inc', 'rest-schema.php'),
    'utf8',
  );
  const typesSource = fs.readFileSync(
    path.join(targetDir, 'src', 'rest', 'snapshots', 'api-types.ts'),
    'utf8',
  );
  const validatorsSource = fs.readFileSync(
    path.join(targetDir, 'src', 'rest', 'snapshots', 'api-validators.ts'),
    'utf8',
  );
  const apiSource = fs.readFileSync(
    path.join(targetDir, 'src', 'rest', 'snapshots', 'api.ts'),
    'utf8',
  );
  const dataSource = fs.readFileSync(
    path.join(targetDir, 'src', 'rest', 'snapshots', 'data.ts'),
    'utf8',
  );
  const phpSource = fs.readFileSync(
    path.join(targetDir, 'inc', 'rest', 'snapshots.php'),
    'utf8',
  );

  expect(blockConfigSource).toContain("slug: 'snapshots'");
  expect(blockConfigSource).toContain("namespace: 'demo-space/v1'");
  expect(blockConfigSource).toContain('methods: [');
  expect(blockConfigSource).toContain("'list'");
  expect(blockConfigSource).toContain("'read'");
  expect(blockConfigSource).toContain("'create'");
  expect(blockConfigSource).toContain("'update'");
  expect(blockConfigSource).toContain("'delete'");
  expect(blockConfigSource).toContain("apiFile: 'src/rest/snapshots/api.ts'");
  expect(blockConfigSource).toContain("phpFile: 'inc/rest/snapshots.php'");
  expect(blockConfigSource).toContain('defineEndpointManifest');
  expect(bootstrapSource).toContain('function demo_space_register_rest_resources()');
  expect(bootstrapSource).toContain(
    "require_once __DIR__ . '/inc/rest/wp-typia-modules.php';",
  );
  expect(
    fs.readFileSync(
      path.join(targetDir, 'inc', 'rest', 'wp-typia-modules.php'),
      'utf8',
    ),
  ).toContain("require_once __DIR__ . '/snapshots.php';");
  expect(bootstrapSource).toContain('function demo_space_load_rest_schema_helpers()');
  expect(bootstrapSource).toContain('inc/rest-schema.php');
  expect(restSchemaHelperSource).toContain('function demo_space_load_rest_schema');
  expect(restSchemaHelperSource).toContain(
    'function demo_space_prepare_rest_schema_for_wordpress',
  );
  expect(restSchemaHelperSource).toContain(
    'function demo_space_get_wordpress_rest_schema',
  );
  expect(restSchemaHelperSource).toContain(
    'function demo_space_validate_and_sanitize_rest_payload',
  );
  expect(restSchemaHelperSource).toContain('malformed_rest_schema');
  expect(typesSource).toContain('export interface SnapshotsListQuery');
  expect(typesSource).toContain('export interface SnapshotsDeleteResponse');
  expect(validatorsSource).toContain('apiValidators');
  expect(validatorsSource).toContain('listQuery');
  expect(validatorsSource).toContain('deleteResponse');
  expect(apiSource).toContain('restResourceCreateEndpoint');
  expect(apiSource).toContain('resolveRestNonce');
  expect(apiSource).toContain('headers: nonce');
  expect(apiSource).not.toContain('requestOptions: nonce');
  expect(dataSource).toContain('useSnapshotsListQuery');
  expect(dataSource).toContain('useDeleteSnapshotsResourceMutation');
  expect(phpSource).toContain('register_rest_route');
  expect(phpSource).toContain("'demo-space/v1'");
  expect(phpSource).toContain("current_user_can( 'edit_posts' )");
  expect(phpSource).toContain('demo_space_validate_and_sanitize_rest_payload');
  expect(phpSource).toContain("array( 'resource' => 'snapshots' )");
  expect(phpSource).not.toContain('demo_space_snapshots_load_rest_resource_schema');
  expect(phpSource).not.toContain('$schema_json = file_get_contents( $schema_path );');
  expect(
    fs.existsSync(path.join(targetDir, 'src', 'rest', 'snapshots', 'api-client.ts')),
  ).toBe(true);
  expect(
    fs.existsSync(path.join(targetDir, 'src', 'rest', 'snapshots', 'api.openapi.json')),
  ).toBe(true);
  expect(
    fs.existsSync(
      path.join(
        targetDir,
        'src',
        'rest',
        'snapshots',
        'api-schemas',
        'list-query.schema.json',
      ),
    ),
  ).toBe(true);

  runCli('npm', ['run', 'sync-rest:package'], { cwd: targetDir });

  const packagedListQuerySchemaPath = path.join(
    targetDir,
    'inc',
    'rest-schemas',
    'rest',
    'snapshots',
    'list-query.schema.json',
  );
  const packageManifestPath = path.join(
    targetDir,
    'inc',
    'rest-schemas',
    'manifest.json',
  );
  expect(fs.existsSync(packagedListQuerySchemaPath)).toBe(true);
  expect(fs.existsSync(packageManifestPath)).toBe(true);

  const packageManifest = JSON.parse(
    fs.readFileSync(packageManifestPath, 'utf8'),
  ) as {
    outputDir: string;
    schemas: Array<{ id: string; path: string; source: string }>;
  };
  expect(packageManifest.outputDir).toBe('inc/rest-schemas');
  expect(packageManifest.schemas).toContainEqual(
    expect.objectContaining({
      id: 'rest:snapshots:list-query',
      path: 'inc/rest-schemas/rest/snapshots/list-query.schema.json',
      source: 'src/rest/snapshots/api-schemas/list-query.schema.json',
    }),
  );

  runCli('npm', ['run', 'sync-rest:package:check'], { cwd: targetDir });
  fs.writeFileSync(packagedListQuerySchemaPath, '{}\n', 'utf8');
  const stalePackageError = getCommandErrorMessage(() =>
    runCli('npm', ['run', 'sync-rest:package:check'], { cwd: targetDir }),
  );
  expect(stalePackageError).toContain(
    'Runtime REST schema package is missing or stale',
  );
  expect(stalePackageError).toContain(
    'inc/rest-schemas/rest/snapshots/list-query.schema.json (stale)',
  );
  runCli('npm', ['run', 'sync-rest:package'], { cwd: targetDir });
  runCli('npm', ['run', 'sync-rest:package:check'], { cwd: targetDir });

  const doctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doctorOutput);
  expect(
    doctorChecks.checks.find((check) => check.label === 'REST resource bootstrap')
      ?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'REST resource config snapshots',
    )?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'REST resource snapshots',
    )?.status,
  ).toBe('pass');

  runCli('npm', ['run', 'sync-rest', '--', '--check'], { cwd: targetDir });
  typecheckGeneratedProject(targetDir);
}, 60_000);

test('sync-rest package check flags stale packaged schemas after REST resources are removed', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-empty-rest-schema-package');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace empty rest schema package',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-empty-rest-schema-package',
      textDomain: 'demo-space',
      title: 'Demo Workspace Empty Rest Schema Package',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli('npm', ['run', 'sync-rest:package:check'], { cwd: targetDir });

  const staleSchemaPath = path.join(
    targetDir,
    'inc',
    'rest-schemas',
    'rest',
    'snapshots',
    'old.schema.json',
  );
  fs.mkdirSync(path.dirname(staleSchemaPath), { recursive: true });
  fs.writeFileSync(staleSchemaPath, '{}\n', 'utf8');

  const stalePackageError = getCommandErrorMessage(() =>
    runCli('npm', ['run', 'sync-rest:package:check'], { cwd: targetDir }),
  );
  expect(stalePackageError).toContain(
    'Runtime REST schema package is missing or stale',
  );
  expect(stalePackageError).toContain(
    'inc/rest-schemas/rest/snapshots/old.schema.json (unexpected)',
  );

  runCli('npm', ['run', 'sync-rest:package'], { cwd: targetDir });
  expect(fs.existsSync(staleSchemaPath)).toBe(false);
  runCli('npm', ['run', 'sync-rest:package:check'], { cwd: targetDir });
}, 30_000);

test('canonical CLI can add a generated REST resource with custom route and controller hooks', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-custom-rest-resource',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add custom rest resource',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-custom-rest-resource',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Custom Rest Resource',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'rest-resource',
      'snapshots',
      '--namespace',
      'demo-space/v1',
      '--methods',
      'read,update,delete',
      '--route-pattern',
      '/snapshots/(?P<id>[\\d]+)',
      '--permission-callback',
      'demo_space_can_manage_snapshots',
      '--controller-class',
      '\\Demo_Space_Snapshots_Controller',
      '--controller-extends',
      'WP_REST_Controller',
    ],
    {
      cwd: targetDir,
    },
  );

  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const apiSource = fs.readFileSync(
    path.join(targetDir, 'src', 'rest', 'snapshots', 'api.ts'),
    'utf8',
  );
  const clientSource = fs.readFileSync(
    path.join(targetDir, 'src', 'rest', 'snapshots', 'api-client.ts'),
    'utf8',
  );
  const openApiSource = fs.readFileSync(
    path.join(targetDir, 'src', 'rest', 'snapshots', 'api.openapi.json'),
    'utf8',
  );
  const phpSource = fs.readFileSync(
    path.join(targetDir, 'inc', 'rest', 'snapshots.php'),
    'utf8',
  );

  expect(blockConfigSource).toContain(
    "controllerClass: '\\\\Demo_Space_Snapshots_Controller'",
  );
  expect(blockConfigSource).toContain(
    "controllerExtends: 'WP_REST_Controller'",
  );
  expect(blockConfigSource).toContain(
    "permissionCallback: 'demo_space_can_manage_snapshots'",
  );
  expect(blockConfigSource).toContain(
    "routePattern: '/snapshots/(?P<id>[\\\\d]+)'",
  );
  expect(apiSource).toContain(
    'resolveEndpointRouteOptions(readSnapshotsResourceEndpoint, request)',
  );
  expect(clientSource).toContain(
    'path: `/demo-space/v1/snapshots/${encodeURIComponent( String( pathParam0 ) )}`,',
  );
  expect(openApiSource).toContain('"/demo-space/v1/snapshots/(?P<id>[\\\\d]+)"');
  expect(phpSource).toContain(
    'class Demo_Space_Snapshots_Controller extends \\WP_REST_Controller',
  );
  expect(phpSource).toContain(
    "class_exists( 'Demo_Space_Snapshots_Controller' )",
  );
  expect(phpSource).toContain(
    '$controller_class = \\Demo_Space_Snapshots_Controller::class;',
  );
  expect(phpSource).toContain(
    "'callback'            => array( $controller, 'read_item' )",
  );
  expect(phpSource).toContain(
    "'permission_callback' => 'demo_space_can_manage_snapshots'",
  );
  expect(phpSource).toContain("'/snapshots/(?P<id>[\\\\d]+)'");

  runCli('npm', ['run', 'sync-rest', '--', '--check'], { cwd: targetDir });
  typecheckGeneratedProject(targetDir);
}, 30_000);

test('canonical CLI can add a DataViews admin screen without an unpublished override', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-admin-view-public');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add admin view public',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-admin-view-public',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Admin View Public',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli('node', [entryPath, 'add', 'admin-view', 'snapshots'], {
    cwd: targetDir,
  });
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  expect(packageJson.devDependencies?.['@wp-typia/dataviews']).toBeTruthy();
  expect(packageJson.dependencies?.['@wordpress/dataviews']).toBeTruthy();
  expect(
    fs.existsSync(path.join(targetDir, 'src', 'admin-views', 'snapshots')),
  ).toBe(true);
}, 20_000);

test('canonical CLI can add a DataViews admin screen with a REST resource source', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-admin-view');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add admin view',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-admin-view',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Admin View',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'rest-resource',
      'snapshots',
      '--namespace',
      'demo-space/v1',
      '--methods',
      'list,read',
    ],
    {
      cwd: targetDir,
    },
  );
  runCli(
    'node',
    [
      entryPath,
      'add',
      'admin-view',
      'snapshots',
      '--source',
      'rest-resource:snapshots',
    ],
    {
      cwd: targetDir,
    },
  );

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const bootstrapSource = fs.readFileSync(
    path.join(targetDir, 'demo-workspace-add-admin-view.php'),
    'utf8',
  );
  const adminViewsIndexSource = fs.readFileSync(
    path.join(targetDir, 'src', 'admin-views', 'index.ts'),
    'utf8',
  );
  const entrySource = fs.readFileSync(
    path.join(targetDir, 'src', 'admin-views', 'snapshots', 'index.tsx'),
    'utf8',
  );
  const screenSource = fs.readFileSync(
    path.join(targetDir, 'src', 'admin-views', 'snapshots', 'Screen.tsx'),
    'utf8',
  );
  const dataSource = fs.readFileSync(
    path.join(targetDir, 'src', 'admin-views', 'snapshots', 'data.ts'),
    'utf8',
  );
  const configSource = fs.readFileSync(
    path.join(targetDir, 'src', 'admin-views', 'snapshots', 'config.ts'),
    'utf8',
  );
  const adminViewPhpPath = path.join(
    targetDir,
    'inc',
    'admin-views',
    'snapshots.php',
  );
  const phpSource = fs.readFileSync(adminViewPhpPath, 'utf8');

  expect(packageJson.devDependencies?.['@wp-typia/dataviews']).toBeTruthy();
  expect(packageJson.dependencies?.['@wordpress/dataviews']).toBeTruthy();
  expect(packageJson.dependencies?.['@wordpress/core-data']).toBeUndefined();
  expect(packageJson.dependencies?.['@wordpress/data']).toBe('~10.46.0');
  expect(blockConfigSource).toContain("slug: 'snapshots'");
  expect(blockConfigSource).toContain(
    "source: 'rest-resource:snapshots'",
  );
  expect(blockConfigSource).toContain(
    "file: 'src/admin-views/snapshots/index.tsx'",
  );
  expect(blockConfigSource).toContain(
    "phpFile: 'inc/admin-views/snapshots.php'",
  );
  expect(bootstrapSource).toContain(
    "require_once __DIR__ . '/inc/admin-views/wp-typia-modules.php';",
  );
  expect(
    fs.readFileSync(
      path.join(targetDir, 'inc', 'admin-views', 'wp-typia-modules.php'),
      'utf8',
    ),
  ).toContain("require_once __DIR__ . '/snapshots.php';");
  expect(adminViewsIndexSource).toContain("import './snapshots';");
  expect(entrySource).toContain('@wordpress/dataviews/build-style/style.css');
  expect(entrySource).toContain('createRoot');
  expect(screenSource).toContain('TypedDataViews');
  expect(screenSource).toContain('isLoading');
  expect(screenSource).toContain('paginationInfo');
  expect(dataSource).toContain('listResource');
  expect(dataSource).toContain("perPageParam: 'perPage'");
  expect(dataSource).toContain('searchParam: false');
  expect(dataSource).toContain("from '../../rest/snapshots/api'");
  expect(dataSource).toContain("from '../../rest/snapshots/api-types'");
  expect(dataSource).not.toContain('search: query.search');
  expect(dataSource).toContain('if (!result.isValid || !result.data)');
  expect(dataSource).toContain('const response = result.data');
  expect(dataSource).toContain('paginationInfo');
  expect(configSource).toContain('defineDataViews<SnapshotsAdminViewItem>');
  expect(configSource).toContain("fields: ['id']");
  expect(configSource).toContain('search: false');
  expect(configSource).not.toContain('content');
  expect(configSource).not.toContain('owner');
  expect(configSource).not.toContain("titleField: 'title'");
  expect(configSource).not.toContain('updatedAt');
  expect(phpSource).toContain('add_submenu_page');
  expect(phpSource).toContain('admin_enqueue_scripts');
  expect(phpSource).toContain('build/admin-views/index.js');
  expect(phpSource).toContain('build/admin-views/style-index.css');
  expect(phpSource).toContain("'wp-components'");

  const doctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doctorOutput);
  expect(
    doctorChecks.checks.find((check) => check.label === 'Admin view bootstrap')
      ?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find((check) => check.label === 'Admin views index')
      ?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Admin view config snapshots',
    )?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find((check) => check.label === 'Admin view snapshots')
      ?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find((check) => check.label === 'Admin view PHP snapshots')
      ?.status,
  ).toBe('pass');

  fs.writeFileSync(
    adminViewPhpPath,
    phpSource.replace("'wp-components'", '"wp-components"'),
  );
  const doubleQuotedDoctorOutput = runCli(
    'node',
    [entryPath, 'doctor', '--format', 'json'],
    {
      cwd: targetDir,
    },
  );
  const doubleQuotedDoctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doubleQuotedDoctorOutput);
  expect(
    doubleQuotedDoctorChecks.checks.find(
      (check) => check.label === 'Admin view PHP snapshots',
    )?.status,
  ).toBe('pass');

  linkWorkspaceNodeModules(targetDir);
  runCli('npm', ['run', 'build'], { cwd: targetDir });
  expect(
    fs.existsSync(path.join(targetDir, 'build', 'admin-views', 'index.js')),
  ).toBe(true);
  expect(
    fs.existsSync(
      path.join(targetDir, 'build', 'admin-views', 'index.asset.php'),
    ),
  ).toBe(true);
  expect(
    fs.existsSync(
      path.join(targetDir, 'build', 'admin-views', 'style-index.css'),
    ),
  ).toBe(true);
  typecheckGeneratedProject(targetDir);
}, GENERATED_PROJECT_BUILD_TIMEOUT_MS);

test('canonical CLI can add a DataViews admin screen with a core-data source', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-admin-view-core-data',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add admin view core data',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-admin-view-core-data',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Admin View Core Data',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'admin-view',
      'posts',
      '--source',
      'core-data:postType/post',
    ],
    {
      cwd: targetDir,
    },
  );

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const dataSource = fs.readFileSync(
    path.join(targetDir, 'src', 'admin-views', 'posts', 'data.ts'),
    'utf8',
  );
  const screenSource = fs.readFileSync(
    path.join(targetDir, 'src', 'admin-views', 'posts', 'Screen.tsx'),
    'utf8',
  );
  const configSource = fs.readFileSync(
    path.join(targetDir, 'src', 'admin-views', 'posts', 'config.ts'),
    'utf8',
  );
  const typesSource = fs.readFileSync(
    path.join(targetDir, 'src', 'admin-views', 'posts', 'types.ts'),
    'utf8',
  );

  expect(packageJson.devDependencies?.['@wp-typia/dataviews']).toBeTruthy();
  expect(packageJson.dependencies?.['@wordpress/dataviews']).toBeTruthy();
  expect(packageJson.dependencies?.['@wordpress/core-data']).toBeTruthy();
  expect(packageJson.dependencies?.['@wordpress/data']).toBeTruthy();
  expect(blockConfigSource).toContain(
    "source: 'core-data:postType/post'",
  );
  expect(dataSource).toContain('useEntityRecord');
  expect(dataSource).toContain('useEntityRecords');
  expect(dataSource).toContain("const CORE_DATA_ENTITY_KIND = 'postType'");
  expect(dataSource).toContain("const CORE_DATA_ENTITY_NAME = 'post'");
  expect(dataSource).toContain("perPageParam: 'per_page'");
  expect(dataSource).toContain('export function usePostsAdminViewData');
  expect(screenSource).toContain('usePostsAdminViewData');
  expect(screenSource).toContain('WordPress core-data entity store');
  expect(screenSource).not.toContain('setReloadToken');
  expect(configSource).toContain("fields: ['title', 'slug', 'status', 'updatedAt']");
  expect(configSource).toContain('search: true');
  expect(configSource).not.toContain('sort:');
  expect(typesSource).toContain('export interface PostsCoreDataRecord');
  expect(typesSource).toContain('raw: PostsCoreDataRecord');

  const doctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doctorOutput);
  expect(
    doctorChecks.checks.find((check) => check.label === 'Admin view config posts')
      ?.status,
  ).toBe('pass');

  linkWorkspaceNodeModules(targetDir);
  runCli('npm', ['run', 'build'], { cwd: targetDir });
  typecheckGeneratedProject(targetDir);
}, GENERATED_PROJECT_BUILD_TIMEOUT_MS);

test('canonical CLI can add a taxonomy core-data admin screen', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-admin-view-core-data-taxonomy',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add admin view core data taxonomy',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-admin-view-core-data-taxonomy',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Admin View Core Data Taxonomy',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'admin-view',
      'categories',
      '--source',
      'core-data:taxonomy/category',
    ],
    {
      cwd: targetDir,
    },
  );

  typecheckGeneratedProject(targetDir);

  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const dataSource = fs.readFileSync(
    path.join(targetDir, 'src', 'admin-views', 'categories', 'data.ts'),
    'utf8',
  );
  const configSource = fs.readFileSync(
    path.join(targetDir, 'src', 'admin-views', 'categories', 'config.ts'),
    'utf8',
  );
  const typesSource = fs.readFileSync(
    path.join(targetDir, 'src', 'admin-views', 'categories', 'types.ts'),
    'utf8',
  );

  expect(blockConfigSource).toContain(
    "source: 'core-data:taxonomy/category'",
  );
  expect(typesSource).toContain('export interface CategoriesCoreDataRecord');
  expect(typesSource).toContain('count?: number');
  expect(typesSource).toContain('name?: string');
  expect(typesSource).toContain('taxonomy?: string');
  expect(typesSource).toContain('count: number');
  expect(typesSource).toContain('name: string');
  expect(configSource).toContain("fields: ['name', 'slug', 'count']");
  expect(configSource).toContain("titleField: 'name'");
  expect(configSource).toContain("label: __('Count'");
  expect(configSource).toContain("label: __('Taxonomy'");
  expect(configSource).not.toContain('updatedAt');
  expect(configSource).not.toContain('Status');
  expect(dataSource).toContain("const CORE_DATA_ENTITY_KIND = 'taxonomy'");
  expect(dataSource).toContain("const CORE_DATA_ENTITY_NAME = 'category'");
  expect(dataSource).toContain('function normalizeTaxonomyRecord');
  expect(dataSource).toContain('count: normalizeCoreDataNumber(record.count)');
  expect(dataSource).toContain(
    'name: normalizeCoreDataString(record.name) || normalizeCoreDataString(record.slug)',
  );
  expect(dataSource).not.toContain('updatedAt');
  expect(dataSource).not.toContain('status:');
}, 60_000);

test('admin view core-data sources reject unsupported entity families', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-admin-view-core-data-invalid',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add admin view core data invalid',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-admin-view-core-data-invalid',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Admin View Core Data Invalid',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  const errorMessage = getCommandErrorMessage(() =>
    runCli(
      'node',
      [
        entryPath,
        'add',
        'admin-view',
        'plugins',
        '--source',
        'core-data:root/plugin',
      ],
      {
        cwd: targetDir,
      },
    ),
  );

  expect(errorMessage).toContain('currently support only: postType, taxonomy');
}, 20_000);

test('admin view rest-resource sources reject extra locator segments', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-admin-view-rest-resource-malformed',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add admin view rest resource malformed',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-admin-view-rest-resource-malformed',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Admin View Rest Resource Malformed',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  const errorMessage = getCommandErrorMessage(() =>
    runCli(
      'node',
      [
        entryPath,
        'add',
        'admin-view',
        'snapshots',
        '--source',
        'rest-resource:products:v2',
      ],
      {
        cwd: targetDir,
      },
    ),
  );

  expect(errorMessage).toContain(
    'Admin view source slug must start with a letter and contain only lowercase letters, numbers, and hyphens.',
  );
}, 20_000);

test('admin view core-data sources reject uppercase entity names', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-admin-view-core-data-uppercase',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add admin view core data uppercase',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-admin-view-core-data-uppercase',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Admin View Core Data Uppercase',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  const errorMessage = getCommandErrorMessage(() =>
    runCli(
      'node',
      [
        entryPath,
        'add',
        'admin-view',
        'posts',
        '--source',
        'core-data:postType/Post',
      ],
      {
        cwd: targetDir,
      },
    ),
  );

  expect(errorMessage).toContain(
    'entity name must start with a lowercase letter or number',
  );
}, 20_000);

test('admin view core-data sources accept numeric-leading entity names', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-admin-view-core-data-numeric-leading',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add admin view core data numeric leading',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-admin-view-core-data-numeric-leading',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Admin View Core Data Numeric Leading',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'admin-view',
      'audit-logs',
      '--source',
      'core-data:postType/2fa_logs',
    ],
    {
      cwd: targetDir,
    },
  );

  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const doctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doctorOutput);

  expect(blockConfigSource).toContain(
    "source: 'core-data:postType/2fa_logs'",
  );
  expect(
    doctorChecks.checks.find((check) => check.label === 'Admin view config audit-logs')
      ?.status,
  ).toBe('pass');
}, 20_000);

test('admin view workflow accepts formatted shared webpack entries', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-admin-view-formatted-webpack',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add admin view formatted webpack',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-admin-view-formatted-webpack',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Admin View Formatted Webpack',
    },
  });

  const buildScriptPath = path.join(targetDir, 'scripts', 'build-workspace.mjs');
  const webpackConfigPath = path.join(targetDir, 'webpack.config.js');
  fs.writeFileSync(
    buildScriptPath,
    replaceFixtureSource(
      fs.readFileSync(buildScriptPath, 'utf8'),
      `[\n\t\t'src/bindings/index.ts',\n\t\t'src/bindings/index.js',\n\t\t'src/editor-plugins/index.ts',\n\t\t'src/editor-plugins/index.js',\n\t\t'src/admin-views/index.ts',\n\t\t'src/admin-views/index.js',\n\t]`,
      `[\n      \"src/bindings/index.ts\",\n      \"src/bindings/index.js\",\n      \"src/editor-plugins/index.ts\",\n      \"src/editor-plugins/index.js\"\n    ]`,
      'formatted admin view build entries',
    ),
    'utf8',
  );
  fs.writeFileSync(
    webpackConfigPath,
    replaceFixtureSource(
      fs.readFileSync(webpackConfigPath, 'utf8'),
      sharedWebpackEntryLoopSource,
      `\tfor ( const [ entryName, candidates ] of [\n\t\t[\n\t\t\t\"bindings/index\",\n\t\t\t[\n\t\t\t\t\"src/bindings/index.ts\",\n\t\t\t\t\"src/bindings/index.js\",\n\t\t\t],\n\t\t],\n\t\t[ \"editor-plugins/index\", [\n\t\t\t\"src/editor-plugins/index.ts\",\n\t\t\t\"src/editor-plugins/index.js\",\n\t\t] ],\n\t] ) {\n\t\tfor ( const relativePath of candidates ) {\n\t\t\tconst entryPath = path.resolve( process.cwd(), relativePath );\n\t\t\tif ( ! fs.existsSync( entryPath ) ) {\n\t\t\t\tcontinue;\n\t\t\t}\n\n\t\t\tentries.push( [ entryName, entryPath ] );\n\t\t\tbreak;\n\t\t}\n\t}`,
      'formatted admin view webpack entries',
    ),
    'utf8',
  );

  runCli('node', [entryPath, 'add', 'admin-view', 'reports'], {
    cwd: targetDir,
  });

  expect(fs.readFileSync(buildScriptPath, 'utf8')).toContain(
    "'src/admin-views/index.ts'",
  );
  expect(fs.readFileSync(webpackConfigPath, 'utf8')).toContain(
    "'admin-views/index'",
  );
}, 30_000);

test('rest resource workflow repairs legacy sync-rest scripts before writing workspace resources', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-rest-resource-legacy-sync-rest',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace rest resource legacy sync-rest',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-rest-resource-legacy-sync-rest',
      textDomain: 'demo-space',
      title: 'Demo Workspace Rest Resource Legacy Sync Rest',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  const bootstrapPath = path.join(
    targetDir,
    'demo-workspace-rest-resource-legacy-sync-rest.php',
  );
  const restSchemaHelperPath = path.join(targetDir, 'inc', 'rest-schema.php');
  const syncRestScriptPath = path.join(
    targetDir,
    'scripts',
    'sync-rest-contracts.ts',
  );
  const legacySyncRestSource = createLegacySyncRestSourceWithoutContractAndRestResources(
    fs.readFileSync(syncRestScriptPath, 'utf8'),
  );
  fs.writeFileSync(syncRestScriptPath, legacySyncRestSource, 'utf8');
  fs.rmSync(restSchemaHelperPath, { force: true });
  fs.writeFileSync(
    bootstrapPath,
    fs
      .readFileSync(bootstrapPath, 'utf8')
      .replace(
        /\nfunction demo_space_load_rest_schema_helpers\(\) \{[\s\S]*?\n\}\n\ndemo_space_load_rest_schema_helpers\(\);\n/u,
        '\n',
      ),
    'utf8',
  );

  runCli('node', [entryPath, 'add', 'rest-resource', 'snapshots'], {
    cwd: targetDir,
  });

  const repairedBootstrapSource = fs.readFileSync(bootstrapPath, 'utf8');
  const repairedSyncRestSource = fs.readFileSync(syncRestScriptPath, 'utf8');
  const repairedRestSchemaHelperSource = fs.readFileSync(
    restSchemaHelperPath,
    'utf8',
  );
  expect(repairedBootstrapSource).toContain('inc/rest-schema.php');
  expect(repairedRestSchemaHelperSource).toContain(
    'function demo_space_validate_and_sanitize_rest_payload',
  );
  expect(repairedSyncRestSource).toContain('REST_RESOURCES');
  expect(repairedSyncRestSource).toContain('function isWorkspaceRestResource(');
  expect(repairedSyncRestSource).toContain(
    'const restResources = REST_RESOURCES.filter(isWorkspaceRestResource);',
  );
  expect(repairedSyncRestSource).toContain(
    'plugin-level REST resources are registered yet',
  );
  expect(repairedSyncRestSource).toContain(
    'for (const resource of restResources)',
  );

  runCli('npm', ['run', 'sync-rest', '--', '--check'], { cwd: targetDir });
}, 120_000);

test('contract workflow repairs legacy sync-rest scripts before writing standalone schemas', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-contract-legacy-sync-rest',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace contract legacy sync rest',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-contract-legacy-sync-rest',
      textDomain: 'demo-space',
      title: 'Demo Workspace Contract Legacy Sync Rest',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  const syncRestScriptPath = path.join(
    targetDir,
    'scripts',
    'sync-rest-contracts.ts',
  );
  const legacySyncRestSource = createLegacySyncRestSourceWithoutContractAndRestResources(
    fs.readFileSync(syncRestScriptPath, 'utf8'),
  );
  fs.writeFileSync(syncRestScriptPath, legacySyncRestSource, 'utf8');

  runCli(
    'node',
    [
      entryPath,
      'add',
      'contract',
      'external-response',
      '--type',
      'ExternalResponse',
    ],
    { cwd: targetDir },
  );

  const repairedSyncRestSource = fs.readFileSync(syncRestScriptPath, 'utf8');
  expect(repairedSyncRestSource).toContain('CONTRACTS');
  expect(repairedSyncRestSource).toContain('function isWorkspaceStandaloneContract(');
  expect(repairedSyncRestSource).toContain(
    'const standaloneContracts = CONTRACTS.filter(',
  );
  expect(repairedSyncRestSource).toContain(
    'for (const contract of standaloneContracts)',
  );

  runCli('npm', ['run', 'sync-rest', '--', '--check'], { cwd: targetDir });
}, 120_000);

test('rest resource workflow repairs sync-rest after legacy contract-first repairs', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-contract-first-rest-resource-legacy-sync-rest',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace contract first rest resource legacy sync rest',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-contract-first-rest-resource-legacy-sync-rest',
      textDomain: 'demo-space',
      title: 'Demo Workspace Contract First Rest Resource Legacy Sync Rest',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  const syncRestScriptPath = path.join(
    targetDir,
    'scripts',
    'sync-rest-contracts.ts',
  );
  fs.writeFileSync(
    syncRestScriptPath,
    createLegacySyncRestSourceWithoutContractAndRestResources(
      fs.readFileSync(syncRestScriptPath, 'utf8'),
    ),
    'utf8',
  );

  runCli(
    'node',
    [
      entryPath,
      'add',
      'contract',
      'external-response',
      '--type',
      'ExternalResponse',
    ],
    { cwd: targetDir },
  );
  runCli(
    'node',
    [
      entryPath,
      'add',
      'rest-resource',
      'snapshots',
      '--namespace',
      'demo-space/v1',
      '--methods',
      'list,read,create,update,delete',
    ],
    { cwd: targetDir },
  );

  const repairedSyncRestSource = fs.readFileSync(syncRestScriptPath, 'utf8');
  expect(repairedSyncRestSource).toContain('CONTRACTS');
  expect(repairedSyncRestSource).toContain('REST_RESOURCES');
  expect(repairedSyncRestSource).toContain(
    'const standaloneContracts = CONTRACTS.filter(',
  );
  expect(repairedSyncRestSource).toContain(
    'const restResources = REST_RESOURCES.filter(isWorkspaceRestResource);',
  );

  runCli('npm', ['run', 'sync-rest', '--', '--check'], { cwd: targetDir });
}, 120_000);

test('rest resource workflow fails fast when sync-rest anchors drift past automatic repair', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-rest-resource-sync-rest-drift',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace rest resource sync-rest drift',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-rest-resource-sync-rest-drift',
      textDomain: 'demo-space',
      title: 'Demo Workspace Rest Resource Sync Rest Drift',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  const syncRestScriptPath = path.join(
    targetDir,
    'scripts',
    'sync-rest-contracts.ts',
  );
  fs.writeFileSync(
    syncRestScriptPath,
    [
      "import { WORKSPACE_BLOCKS, type WorkspaceBlockConfig } from './block-config';",
      '',
      'function isRestEnabledBlock(',
      '\tblock: WorkspaceBlockConfig',
      '): block is WorkspaceBlockConfig & {',
      "\trestManifest: NonNullable< WorkspaceBlockConfig[ 'restManifest' ] >;",
      '\ttypesFile: string;',
      '} {',
      '\treturn (',
      "\t\ttypeof block.typesFile === 'string' &&",
      "\t\ttypeof block.restManifest === 'object' &&",
      '\t\tblock.restManifest !== null',
      '\t);',
      '}',
      '',
      'async function assertTypeArtifactsCurrent() {',
      '\tconst restBlocks = WORKSPACE_BLOCKS.filter( isRestEnabledBlock );',
      '\tif ( restBlocks.length === 0 ) {',
      "\t\tconsole.log( 'legacy drift' );",
      '\t\treturn;',
      '\t}',
      "\tconsole.log( 'legacy drift' );",
      '}',
    ].join('\n'),
    'utf8',
  );

  expect(() =>
    runCli('node', [entryPath, 'add', 'rest-resource', 'snapshots'], {
      cwd: targetDir,
    }),
  ).toThrow(
    'ensureRestResourceSyncScriptAnchors could not patch sync-rest-contracts.ts',
  );
}, 20_000);

test('workspace doctor fails when required REST resource schemas are missing', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-rest-resource-missing-schema',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace rest resource missing schema',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-rest-resource-missing-schema',
      textDomain: 'demo-space',
      title: 'Demo Workspace Rest Resource Missing Schema',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'rest-resource',
      'snapshots',
      '--namespace',
      'demo-space/v1',
    ],
    {
      cwd: targetDir,
    },
  );

  fs.rmSync(
    path.join(
      targetDir,
      'src',
      'rest',
      'snapshots',
      'api-schemas',
      'list-response.schema.json',
    ),
  );

  const doctorError = getCommandErrorMessage(() =>
    runCli('node', [entryPath, 'doctor', '--format', 'json'], {
      cwd: targetDir,
    }),
  );

  expect(doctorError).toContain('REST resource snapshots');
  expect(doctorError).toContain('list-response.schema.json');
}, 20_000);

test('rest resource workflow rejects invalid namespace and methods and preserves existing files on duplicate failure', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-rest-resource-duplicate',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace rest resource duplicate',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-rest-resource-duplicate',
      textDomain: 'demo-space',
      title: 'Demo Workspace Rest Resource Duplicate',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'rest-resource',
          'snapshots',
          '--namespace',
          'DemoSpace/v1',
        ],
        {
          cwd: targetDir,
        },
      ),
    ),
  ).toContain('REST resource namespace must use lowercase');

  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'rest-resource',
          'snapshots',
          '--methods',
          'list,archive',
        ],
        {
          cwd: targetDir,
        },
      ),
    ),
  ).toContain('REST resource methods must be a comma-separated list');

  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'rest-resource',
          'snapshots',
          '--route-pattern',
          '/snapshots/(?P<recordId>[\\d]+)',
        ],
        {
          cwd: targetDir,
        },
      ),
    ),
  ).toContain('must use only an `(?P<id>...)` named capture');

  expect(
    getCommandErrorMessage(() =>
      runCli(
        'node',
        [
          entryPath,
          'add',
          'rest-resource',
          'snapshots',
          '--route-pattern',
          '/snapshots/([\\d]+)',
        ],
        {
          cwd: targetDir,
        },
      ),
    ),
  ).toContain('must use only an `(?P<id>...)` named capture');

  runCli('node', [entryPath, 'add', 'rest-resource', 'snapshots'], {
    cwd: targetDir,
  });

  const originalConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const originalPhpSource = fs.readFileSync(
    path.join(targetDir, 'inc', 'rest', 'snapshots.php'),
    'utf8',
  );

  expect(
    getCommandErrorMessage(() =>
      runCli('node', [entryPath, 'add', 'rest-resource', 'snapshots'], {
        cwd: targetDir,
      }),
    ),
  ).toContain('A REST resource already exists');

  expect(
    fs.readFileSync(path.join(targetDir, 'scripts', 'block-config.ts'), 'utf8'),
  ).toBe(originalConfigSource);
  expect(
    fs.readFileSync(path.join(targetDir, 'inc', 'rest', 'snapshots.php'), 'utf8'),
  ).toBe(originalPhpSource);
}, 20_000);

test('workspace add smoke keeps AI feature scaffolds in the broad canonical suite', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-ai-feature');

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace add ai feature',
    slug: 'demo-workspace-add-ai-feature',
    title: 'Demo Workspace Add AI Feature',
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'ai-feature',
      'brief-suggestions',
      '--namespace',
      'demo-space/v1',
    ],
    {
      cwd: targetDir,
    },
  );

  expect(
    fs.existsSync(
      path.join(
        targetDir,
        'src',
        'ai-features',
        'brief-suggestions',
        'api-client.ts',
      ),
    ),
  ).toBe(true);
  expect(
    fs.existsSync(
      path.join(
        targetDir,
        'src',
        'ai-features',
        'brief-suggestions',
        'api.openapi.json',
      ),
    ),
  ).toBe(true);
  expect(
    fs.existsSync(
      path.join(
        targetDir,
        'src',
        'ai-features',
        'brief-suggestions',
        'api-schemas',
        'feature-request.schema.json',
      ),
    ),
  ).toBe(true);
  expect(
    fs.existsSync(
      path.join(
        targetDir,
        'src',
        'ai-features',
        'brief-suggestions',
        'ai-schemas',
        'feature-result.ai.schema.json',
      ),
    ),
  ).toBe(true);
}, 30_000);

test('workspace add smoke keeps workflow ability scaffolds in the broad canonical suite', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-ability');
  const workspaceSlug = 'demo-workspace-add-ability';

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace add ability',
    slug: workspaceSlug,
    title: 'Demo Workspace Add Ability',
  });

  linkWorkspaceNodeModules(targetDir);

  const packageJsonPath = path.join(targetDir, 'package.json');
  const seededPackageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
  };
  seededPackageJson.dependencies = {
    ...(seededPackageJson.dependencies ?? {}),
    '@wordpress/abilities': '^0.9.0',
    '@wordpress/core-abilities': '^0.8.0',
  };
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(seededPackageJson, null, '\t')}\n`,
  );

  const bootstrapPath = path.join(
    targetDir,
    `${workspaceSlug}.php`,
  );
  fs.writeFileSync(
    bootstrapPath,
    `${fs.readFileSync(bootstrapPath, 'utf8').trimEnd()}

function demo_space_enqueue_workflow_abilities() {
\t// Legacy ability enqueue marker.
\twp_enqueue_script(
\t\t'demo-space-legacy-abilities',
\t\tplugins_url( 'build/abilities/index.js', __FILE__ ),
\t\tarray(),
\t\t'1.0.0',
\t\ttrue
\t);
}
`,
  );

  runCli('node', [entryPath, 'add', 'ability', 'review-workflow'], {
    cwd: targetDir,
  });

  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );

  expect(blockConfigSource).toContain("slug: 'review-workflow'");

  expect(
    fs.existsSync(
      path.join(
        targetDir,
        'src',
        'abilities',
        'review-workflow',
        'input.schema.json',
      ),
    ),
  ).toBe(true);
  expect(
    fs.existsSync(
      path.join(
        targetDir,
        'src',
        'abilities',
        'review-workflow',
        'output.schema.json',
      ),
    ),
  ).toBe(true);
}, 30_000);

test('canonical CLI can add an editor plugin to an official workspace template', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-add-editor-plugin');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add editor plugin',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-editor-plugin',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Editor Plugin',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [entryPath, 'add', 'editor-plugin', 'document-tools', '--slot', 'PluginSidebar'],
    {
      cwd: targetDir,
    },
  );

  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const bootstrapSource = fs.readFileSync(
    path.join(targetDir, 'demo-workspace-add-editor-plugin.php'),
    'utf8',
  );
  const editorPluginsIndexSource = fs.readFileSync(
    path.join(targetDir, 'src', 'editor-plugins', 'index.ts'),
    'utf8',
  );
  const entrySource = fs.readFileSync(
    path.join(targetDir, 'src', 'editor-plugins', 'document-tools', 'index.tsx'),
    'utf8',
  );
  const surfaceSource = fs.readFileSync(
    path.join(targetDir, 'src', 'editor-plugins', 'document-tools', 'Surface.tsx'),
    'utf8',
  );
  const dataSource = fs.readFileSync(
    path.join(targetDir, 'src', 'editor-plugins', 'document-tools', 'data.ts'),
    'utf8',
  );

  expect(blockConfigSource).toContain("slug: 'document-tools'");
  expect(blockConfigSource).toContain("slot: 'sidebar'");
  expect(blockConfigSource).toContain(
    "file: 'src/editor-plugins/document-tools/index.tsx'",
  );
  expect(bootstrapSource).toContain('build/editor-plugins/index.js');
  expect(bootstrapSource).toContain('build/editor-plugins/style-index.css');
  expect(bootstrapSource).toContain(
    'demo_space_enqueue_editor_plugins_editor',
  );
  expect(editorPluginsIndexSource).toContain("import './document-tools';");
  expect(entrySource).toContain('registerPlugin');
  expect(entrySource).toContain('demo-space-document-tools');
  expect(entrySource).toContain('Surface');
  expect(surfaceSource).toContain('PluginSidebar');
  expect(surfaceSource).toContain('PluginSidebarMoreMenuItem');
  expect(dataSource).toContain("EDITOR_PLUGIN_SLOT = 'sidebar'");
  expect(dataSource).toContain('getDocumentToolsEditorPluginModel');
  expect(dataSource).toContain('isDocumentToolsEnabled');

  const doctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doctorOutput);
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Editor plugin bootstrap',
    )?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Editor plugins index',
    )?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Editor plugin document-tools',
    )?.status,
  ).toBe('pass');
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Editor plugin config document-tools',
    )?.status,
  ).toBe('pass');

  runCli('npm', ['run', 'build'], { cwd: targetDir });
  expect(
    fs.existsSync(path.join(targetDir, 'build', 'editor-plugins', 'index.js')),
  ).toBe(true);
  expect(
    fs.existsSync(
      path.join(targetDir, 'build', 'editor-plugins', 'index.asset.php'),
    ),
  ).toBe(true);
  expect(
    fs.existsSync(
      path.join(targetDir, 'build', 'editor-plugins', 'style-index.css'),
    ),
  ).toBe(true);
  expect(
    fs.existsSync(path.join(targetDir, 'build', 'blocks-manifest.php')),
  ).toBe(true);
}, GENERATED_PROJECT_BUILD_TIMEOUT_MS);

test('canonical CLI can add a document settings panel editor plugin', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-editor-plugin-document-panel',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add editor plugin document panel',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-editor-plugin-document-panel',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Editor Plugin Document Panel',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [
      entryPath,
      'add',
      'editor-plugin',
      'seo-notes',
      '--slot',
      'document-setting-panel',
    ],
    {
      cwd: targetDir,
    },
  );

  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const entrySource = fs.readFileSync(
    path.join(targetDir, 'src', 'editor-plugins', 'seo-notes', 'index.tsx'),
    'utf8',
  );
  const surfaceSource = fs.readFileSync(
    path.join(targetDir, 'src', 'editor-plugins', 'seo-notes', 'Surface.tsx'),
    'utf8',
  );
  const dataSource = fs.readFileSync(
    path.join(targetDir, 'src', 'editor-plugins', 'seo-notes', 'data.ts'),
    'utf8',
  );

  expect(blockConfigSource).toContain("slug: 'seo-notes'");
  expect(blockConfigSource).toContain(
    "slot: 'document-setting-panel'",
  );
  expect(entrySource).toContain('registerPlugin');
  expect(entrySource).toContain('demo-space-seo-notes');
  expect(surfaceSource).toContain('PluginDocumentSettingPanel');
  expect(surfaceSource).not.toContain('PluginSidebarMoreMenuItem');
  expect(surfaceSource).toContain('Use data.ts to add post type');
  expect(dataSource).toContain(
    "EDITOR_PLUGIN_SLOT = 'document-setting-panel'",
  );
  expect(dataSource).toContain('getSeoNotesEditorPluginModel');

  const doctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doctorOutput);
  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Editor plugin config seo-notes',
    )?.status,
  ).toBe('pass');

  typecheckGeneratedProject(targetDir);
}, 30_000);

test('editor plugin workflow repairs legacy workspace build config hooks', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-editor-plugin-legacy-build',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add editor plugin legacy build',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-editor-plugin-legacy-build',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Editor Plugin Legacy Build',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  const buildScriptPath = path.join(targetDir, 'scripts', 'build-workspace.mjs');
  const webpackConfigPath = path.join(targetDir, 'webpack.config.js');
  fs.writeFileSync(
    buildScriptPath,
    replaceFixtureSource(
      fs.readFileSync(buildScriptPath, 'utf8'),
      `[\n\t\t'src/bindings/index.ts',\n\t\t'src/bindings/index.js',\n\t\t'src/editor-plugins/index.ts',\n\t\t'src/editor-plugins/index.js',\n\t\t'src/admin-views/index.ts',\n\t\t'src/admin-views/index.js',\n\t]`,
      "[ 'src/bindings/index.ts', 'src/bindings/index.js' ]",
      'legacy editor plugin build entries',
    ),
    'utf8',
  );
  fs.writeFileSync(
    webpackConfigPath,
    replaceFixtureSource(
      fs.readFileSync(webpackConfigPath, 'utf8'),
      sharedWebpackEntryLoopSource,
      `\tfor ( const relativePath of [ 'src/bindings/index.ts', 'src/bindings/index.js' ] ) {\n\t\tconst entryPath = path.resolve( process.cwd(), relativePath );\n\t\tif ( ! fs.existsSync( entryPath ) ) {\n\t\t\tcontinue;\n\t\t}\n\n\t\tentries.push( [ 'bindings/index', entryPath ] );\n\t\tbreak;\n\t}`,
      'legacy editor plugin webpack entries',
    ),
    'utf8',
  );

  runCli(
    'node',
    [entryPath, 'add', 'editor-plugin', 'document-tools'],
    {
      cwd: targetDir,
    },
  );

  expect(fs.readFileSync(buildScriptPath, 'utf8')).toContain(
    "'src/editor-plugins/index.ts'",
  );
  expect(fs.readFileSync(webpackConfigPath, 'utf8')).toContain(
    "'editor-plugins/index'",
  );

  runCli('npm', ['run', 'build'], { cwd: targetDir });
  expect(
    fs.existsSync(path.join(targetDir, 'build', 'editor-plugins', 'index.js')),
  ).toBe(true);
}, GENERATED_PROJECT_BUILD_TIMEOUT_MS);

test('editor plugin workflow repairs formatted legacy workspace build config hooks', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-editor-plugin-formatted-legacy-build',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add editor plugin formatted legacy build',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-editor-plugin-formatted-legacy-build',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Editor Plugin Formatted Legacy Build',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  const buildScriptPath = path.join(targetDir, 'scripts', 'build-workspace.mjs');
  const webpackConfigPath = path.join(targetDir, 'webpack.config.js');
  fs.writeFileSync(
    buildScriptPath,
    replaceFixtureSource(
      fs.readFileSync(buildScriptPath, 'utf8'),
      `[\n\t\t'src/bindings/index.ts',\n\t\t'src/bindings/index.js',\n\t\t'src/editor-plugins/index.ts',\n\t\t'src/editor-plugins/index.js',\n\t\t'src/admin-views/index.ts',\n\t\t'src/admin-views/index.js',\n\t]`,
      `[\n      \"src/bindings/index.ts\",\n      \"src/bindings/index.js\",\n    ]`,
      'formatted legacy editor plugin build entries',
    ),
    'utf8',
  );
  fs.writeFileSync(
    webpackConfigPath,
    replaceFixtureSource(
      fs.readFileSync(webpackConfigPath, 'utf8'),
      sharedWebpackEntryLoopSource,
      `\tfor ( const relativePath of [\n\t\t\"src/bindings/index.ts\",\n\t\t\"src/bindings/index.js\",\n\t] ) {\n\t\tconst entryPath = path.resolve( process.cwd(), relativePath );\n\t\tif ( ! fs.existsSync( entryPath ) ) {\n\t\t\tcontinue;\n\t\t}\n\n\t\tentries.push( [ \"bindings/index\", entryPath ] );\n\t\tbreak;\n\t}`,
      'formatted legacy editor plugin webpack entries',
    ),
    'utf8',
  );

  runCli(
    'node',
    [entryPath, 'add', 'editor-plugin', 'document-tools'],
    {
      cwd: targetDir,
    },
  );

  expect(fs.readFileSync(buildScriptPath, 'utf8')).toContain(
    "'src/editor-plugins/index.ts'",
  );
  expect(fs.readFileSync(webpackConfigPath, 'utf8')).toContain(
    "'editor-plugins/index'",
  );
}, 30_000);

test('editor plugin workflow accepts double-quoted shared entry hooks', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-editor-plugin-double-quoted-shared-entries',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add editor plugin double quoted shared entries',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-editor-plugin-double-quoted-shared-entries',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Editor Plugin Double Quoted Shared Entries',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  const buildScriptPath = path.join(targetDir, 'scripts', 'build-workspace.mjs');
  const webpackConfigPath = path.join(targetDir, 'webpack.config.js');
  fs.writeFileSync(
    buildScriptPath,
    fs
      .readFileSync(buildScriptPath, 'utf8')
      .replace(/'src\/editor-plugins\/index\.ts'/g, '"src/editor-plugins/index.ts"')
      .replace(/'src\/editor-plugins\/index\.js'/g, '"src/editor-plugins/index.js"'),
    'utf8',
  );
  fs.writeFileSync(
    webpackConfigPath,
    fs
      .readFileSync(webpackConfigPath, 'utf8')
      .replace(/'editor-plugins\/index'/g, '"editor-plugins/index"')
      .replace(/'src\/editor-plugins\/index\.ts'/g, '"src/editor-plugins/index.ts"')
      .replace(/'src\/editor-plugins\/index\.js'/g, '"src/editor-plugins/index.js"'),
    'utf8',
  );

  runCli(
    'node',
    [entryPath, 'add', 'editor-plugin', 'document-tools'],
    {
      cwd: targetDir,
    },
  );

  expect(fs.readFileSync(buildScriptPath, 'utf8')).toContain(
    '"src/editor-plugins/index.ts"',
  );
  expect(fs.readFileSync(webpackConfigPath, 'utf8')).toContain(
    '"editor-plugins/index"',
  );
}, 30_000);

test('editor plugin workflow preserves legacy registry imports outside inventory', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-editor-plugin-legacy-registry',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add editor plugin legacy registry',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-editor-plugin-legacy-registry',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Editor Plugin Legacy Registry',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  const editorPluginsDir = path.join(targetDir, 'src', 'editor-plugins');
  const legacyPluginDir = path.join(editorPluginsDir, 'legacy-tools');
  fs.mkdirSync(legacyPluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(editorPluginsDir, 'index.js'),
    "import './legacy-tools/index.js';\n",
    'utf8',
  );
  fs.writeFileSync(
    path.join(legacyPluginDir, 'index.js'),
    'export {};\n',
    'utf8',
  );

  runCli(
    'node',
    [entryPath, 'add', 'editor-plugin', 'document-tools'],
    {
      cwd: targetDir,
    },
  );

  const registrySource = fs.readFileSync(
    path.join(editorPluginsDir, 'index.js'),
    'utf8',
  );
  expect(registrySource).toContain("import './legacy-tools';");
  expect(registrySource).toContain("import './document-tools';");
}, 30_000);

test('editor plugin workflow accepts existing js shared entry hooks', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-editor-plugin-js-entry',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add editor plugin js entry',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-editor-plugin-js-entry',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Editor Plugin JS Entry',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  const buildScriptPath = path.join(targetDir, 'scripts', 'build-workspace.mjs');
  const editorPluginsDir = path.join(targetDir, 'src', 'editor-plugins');
  fs.mkdirSync(editorPluginsDir, { recursive: true });
  fs.writeFileSync(path.join(editorPluginsDir, 'index.js'), '', 'utf8');
  fs.writeFileSync(
    buildScriptPath,
    replaceFixtureSource(
      fs.readFileSync(buildScriptPath, 'utf8'),
      `[\n\t\t'src/bindings/index.ts',\n\t\t'src/bindings/index.js',\n\t\t'src/editor-plugins/index.ts',\n\t\t'src/editor-plugins/index.js',\n\t\t'src/admin-views/index.ts',\n\t\t'src/admin-views/index.js',\n\t]`,
      `[\n\t\t'src/bindings/index.ts',\n\t\t'src/bindings/index.js',\n\t\t'src/editor-plugins/index.js',\n\t]`,
      'editor plugin js shared entry hooks',
    ),
    'utf8',
  );

  runCli(
    'node',
    [entryPath, 'add', 'editor-plugin', 'document-tools'],
    {
      cwd: targetDir,
    },
  );

  expect(fs.readFileSync(buildScriptPath, 'utf8')).toContain(
    "'src/editor-plugins/index.js'",
  );
  expect(fs.readFileSync(path.join(editorPluginsDir, 'index.js'), 'utf8')).toContain(
    "import './document-tools';",
  );
}, 30_000);

test('editor plugin workflow repairs stale legacy bootstrap functions', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-add-editor-plugin-legacy-bootstrap',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace add editor plugin legacy bootstrap',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-add-editor-plugin-legacy-bootstrap',
      textDomain: 'demo-space',
      title: 'Demo Workspace Add Editor Plugin Legacy Bootstrap',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [entryPath, 'add', 'editor-plugin', 'document-tools'],
    {
      cwd: targetDir,
    },
  );

  const bootstrapPath = path.join(
    targetDir,
    'demo-workspace-add-editor-plugin-legacy-bootstrap.php',
  );
  fs.writeFileSync(
    bootstrapPath,
    fs
      .readFileSync(bootstrapPath, 'utf8')
      .replace(
        /\n\t\$style_path\s+= __DIR__ \. '\/build\/editor-plugins\/style-index\.css';[\s\S]+?\n\t\}\n/u,
        '\n',
      ),
    'utf8',
  );
  fs.appendFileSync(
    bootstrapPath,
    '\n// build/editor-plugins/style-index.css\n// build/editor-plugins/style-index-rtl.css\n// wp_style_add_data\n',
    'utf8',
  );

  runCli(
    'node',
    [entryPath, 'add', 'editor-plugin', 'review-panel'],
    {
      cwd: targetDir,
    },
  );

  const bootstrapSource = fs.readFileSync(bootstrapPath, 'utf8');
  expect(bootstrapSource).toContain('build/editor-plugins/style-index.css');
  expect(bootstrapSource).toContain('build/editor-plugins/style-index-rtl.css');
  expect(bootstrapSource).toContain('wp_style_add_data');
}, 30_000);
});
