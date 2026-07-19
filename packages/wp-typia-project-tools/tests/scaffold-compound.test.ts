import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  apiClientPackageVersion,
  buildGeneratedProject,
  cleanupScaffoldTempRoot,
  createBlockSubsetFixturePath,
  createScaffoldTempRoot,
  getCommandErrorMessage,
  restPackageVersion,
  runGeneratedScript,
  typecheckGeneratedProject,
  wpTypiaPackageManifest,
} from './helpers/scaffold-test-harness.js';
import { scaffoldProject } from '../src/runtime/index.js';
import { applyMigrationUiCapability } from '../src/runtime/migration-ui-capability.js';

describe('@wp-typia/project-tools scaffold compound', () => {
  const tempRoot = createScaffoldTempRoot('wp-typia-scaffold-compound-');

  afterAll(() => {
    cleanupScaffoldTempRoot(tempRoot);
  });

  test(
    'scaffoldProject creates a pure compound template with parent and hidden child blocks',
    async () => {
      const targetDir = path.join(tempRoot, 'demo-compound');

      await scaffoldProject({
        projectDir: targetDir,
        templateId: 'compound',
        packageManager: 'npm',
        noInstall: true,
        answers: {
          author: 'Test Runner',
          description: 'Demo compound block',
          namespace: 'create-block',
          slug: 'demo-compound',
          title: 'Demo Compound',
        },
      });

      runGeneratedScript(targetDir, 'scripts/sync-project.ts', ['--check']);

      const packageJson = JSON.parse(
        fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'),
      );
      const pluginBootstrap = fs.readFileSync(
        path.join(targetDir, 'demo-compound.php'),
        'utf8',
      );
      const readme = fs.readFileSync(path.join(targetDir, 'README.md'), 'utf8');
      const blockConfig = fs.readFileSync(
        path.join(targetDir, 'scripts', 'block-config.ts'),
        'utf8',
      );
      const addChildScript = fs.readFileSync(
        path.join(targetDir, 'scripts', 'add-compound-child.ts'),
        'utf8',
      );
      const parentEdit = fs.readFileSync(
        path.join(targetDir, 'src', 'blocks', 'demo-compound', 'edit.tsx'),
        'utf8',
      );
      const parentHooks = fs.readFileSync(
        path.join(targetDir, 'src', 'blocks', 'demo-compound', 'hooks.ts'),
        'utf8',
      );
      const parentValidators = fs.readFileSync(
        path.join(targetDir, 'src', 'blocks', 'demo-compound', 'validators.ts'),
        'utf8',
      );
      const generatedRootHooks = fs.readFileSync(
        path.join(targetDir, 'src', 'hooks.ts'),
        'utf8',
      );
      const generatedValidatorToolkit = fs.readFileSync(
        path.join(targetDir, 'src', 'validator-toolkit.ts'),
        'utf8',
      );
      const parentManifest = JSON.parse(
        fs.readFileSync(
          path.join(
            targetDir,
            'src',
            'blocks',
            'demo-compound',
            'typia.manifest.json',
          ),
          'utf8',
        ),
      );
      const parentManifestWrapper = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound',
          'manifest-document.ts',
        ),
        'utf8',
      );
      const parentManifestDefaultsWrapper = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound',
          'manifest-defaults-document.ts',
        ),
        'utf8',
      );
      const parentBlockMetadata = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound',
          'block-metadata.ts',
        ),
        'utf8',
      );
      const parentChildren = fs.readFileSync(
        path.join(targetDir, 'src', 'blocks', 'demo-compound', 'children.ts'),
        'utf8',
      );
      const parentStyle = fs.readFileSync(
        path.join(targetDir, 'src', 'blocks', 'demo-compound', 'style.scss'),
        'utf8',
      );
      const childEdit = fs.readFileSync(
        path.join(targetDir, 'src', 'blocks', 'demo-compound-item', 'edit.tsx'),
        'utf8',
      );
      const childHooks = fs.readFileSync(
        path.join(targetDir, 'src', 'blocks', 'demo-compound-item', 'hooks.ts'),
        'utf8',
      );
      const childValidators = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-item',
          'validators.ts',
        ),
        'utf8',
      );
      const childManifest = JSON.parse(
        fs.readFileSync(
          path.join(
            targetDir,
            'src',
            'blocks',
            'demo-compound-item',
            'typia.manifest.json',
          ),
          'utf8',
        ),
      );
      const childManifestWrapper = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-item',
          'manifest-document.ts',
        ),
        'utf8',
      );
      const childManifestDefaultsWrapper = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-item',
          'manifest-defaults-document.ts',
        ),
        'utf8',
      );
      const childBlockMetadata = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-item',
          'block-metadata.ts',
        ),
        'utf8',
      );
      const parentBlockJson = JSON.parse(
        fs.readFileSync(
          path.join(targetDir, 'src', 'blocks', 'demo-compound', 'block.json'),
          'utf8',
        ),
      );
      expect(packageJson.devDependencies.prettier).toBe('3.8.2');
      const childBlockJson = JSON.parse(
        fs.readFileSync(
          path.join(
            targetDir,
            'src',
            'blocks',
            'demo-compound-item',
            'block.json',
          ),
          'utf8',
        ),
      );
      const generatedWebpackConfig = fs.readFileSync(
        path.join(targetDir, 'webpack.config.js'),
        'utf8',
      );

      expect(packageJson.scripts.sync).toBe('tsx scripts/sync-project.ts');
      expect(packageJson.scripts.build).toBe(
        'npm run sync -- --check && wp-scripts build --experimental-modules',
      );
      expect(packageJson.scripts.dev).toBe(
        'npm run sync && concurrently -k -n sync-types,editor -c yellow,blue "npm run watch:sync-types" "npm run start:editor"',
      );
      expect(packageJson.scripts['watch:sync-types']).toBe(
        'chokidar "src/blocks/**/types.ts" "scripts/block-config.ts" --debounce 200 -c "npm run sync-types"',
      );
      expect(packageJson.scripts.typecheck).toBe(
        'npm run sync -- --check && tsc --noEmit',
      );
      expect(pluginBootstrap).toContain('build/blocks');
      expect(
        fs.existsSync(path.join(targetDir, 'inc', 'rest-shared.php')),
      ).toBe(false);
      expect(fs.existsSync(path.join(targetDir, 'inc', 'rest-auth.php'))).toBe(
        false,
      );
      expect(
        fs.existsSync(path.join(targetDir, 'inc', 'rest-public.php')),
      ).toBe(false);
      expect(parentBlockJson.name).toBe('create-block/demo-compound');
      expect(parentBlockJson.version).toBe('0.1.0');
      expect(parentBlockJson.category).toBe('widgets');
      expect(parentBlockJson.icon).toBe('screenoptions');
      expect(parentBlockJson.allowedBlocks).toEqual([
        'create-block/demo-compound-item',
      ]);
      expect(blockConfig).toContain('defineBlockNesting');
      expect(blockConfig).toContain('defineInnerBlocksTemplates');
      expect(blockConfig).toContain('export const BLOCK_NESTING');
      expect(blockConfig).toContain('export const BLOCK_TEMPLATES');
      expect(blockConfig).toContain('export const PATTERNS');
      expect(parentManifest.sourceType).toBe('DemoCompoundAttributes');
      expect(parentManifest.attributes.heading.typia.defaultValue).toBe(
        'Demo Compound',
      );
      expect(childBlockJson.parent).toEqual(['create-block/demo-compound']);
      expect(childBlockJson.version).toBe('0.1.0');
      expect(childBlockJson.category).toBe('widgets');
      expect(childBlockJson.icon).toBe('excerpt-view');
      expect(childBlockJson.style).toBeUndefined();
      expect(childBlockJson.supports.inserter).toBe(false);
      expect(childManifest.sourceType).toBe('DemoCompoundItemAttributes');
      expect(childManifest.attributes.title.typia.defaultValue).toBe(
        'Demo Compound Item',
      );
      expect(packageJson.scripts['add-child']).toBe(
        'tsx scripts/add-compound-child.ts',
      );
      expect(
        fs.existsSync(
          path.join(targetDir, 'scripts', 'sync-rest-contracts.ts'),
        ),
      ).toBe(false);
      expect(
        fs.existsSync(
          path.join(
            targetDir,
            'src',
            'blocks',
            'demo-compound',
            'api.openapi.json',
          ),
        ),
      ).toBe(false);
      expect(parentEdit).toContain('createAttributeUpdater');
      expect(parentEdit).toContain(
        "import type { BlockEditProps } from '@wp-typia/block-types/blocks/registration';",
      );
      expect(parentEdit).toContain(
        'type EditProps = BlockEditProps< DemoCompoundAttributes >;',
      );
      expect(parentEdit).toContain('}: EditProps )');
      expect(parentEdit).toContain('useTypiaValidation');
      expect(parentEdit).toContain('getRootInnerBlocksPropsOptions');
      expect(parentEdit).toContain('rootInnerBlocksPropsOptions');
      expect(parentEdit).not.toMatch(/setAttributes\s*\(\s*\{/);
      expect(generatedRootHooks).toContain('useTypiaValidation');
      expect(parentHooks).toContain('useTypiaValidation');
      expect(parentHooks).toContain("from '../../hooks'");
      expect(parentValidators).toContain('validator-toolkit');
      expect(parentValidators).toContain("import typia from 'typia';");
      expect(parentValidators).not.toContain('createScaffoldValidatorToolkit');
      expect(parentValidators).toContain('DemoCompoundValidationResult');
      expect(parentValidators).toContain(
        'scaffoldValidators.validateAttributes as (',
      );
      expect(generatedValidatorToolkit).toContain(
        'createScaffoldValidatorToolkit',
      );
      expect(generatedValidatorToolkit).toContain(
        'parseManifestDefaultsDocument',
      );
      expect(generatedValidatorToolkit).not.toContain(
        'manifest as ManifestDefaultsDocument',
      );
      expect(generatedValidatorToolkit).not.toContain('typia.createValidate');
      expect(parentChildren).toContain('DEFAULT_CHILD_BLOCK_NAME');
      expect(parentChildren).toContain('COMPOUND_CHILD_SPECS');
      expect(parentChildren).toContain('ROOT_INNER_BLOCKS_PRESET_ID');
      expect(parentChildren).toContain('getChildInnerBlocksConfig');
      expect(parentChildren).toContain('getRootInnerBlocksConfig');
      expect(parentChildren).toContain('getChildInnerBlocksPropsOptions');
      expect(parentChildren).toContain('getRootInnerBlocksPropsOptions');
      expect(parentChildren).toContain('renderAppender');
      expect(parentChildren).toContain('hasNestedChildBlocks');
      expect(parentChildren).not.toContain('ALLOWED_CHILD_BLOCKS');
      expect(parentChildren).not.toContain('getChildAllowedBlocks');
      expect(parentChildren).toContain(
        '@wp-typia/block-types/blocks/registration',
      );
      expect(parentChildren).toContain('BlockTemplate');
      expect(parentChildren).toContain(
        'add-child: insert new child specs here',
      );
      expect(addChildScript).toContain('--dry-run');
      expect(parentStyle).toContain('.wp-block-create-block-demo-compound');
      expect(parentStyle).toContain(
        '.wp-block-create-block-demo-compound-item',
      );
      expect(childEdit).toContain('createAttributeUpdater');
      expect(childEdit).toContain(
        "import type { BlockEditProps } from '@wp-typia/block-types/blocks/registration';",
      );
      expect(childEdit).toContain(
        'type EditProps = BlockEditProps< DemoCompoundItemAttributes >;',
      );
      expect(childEdit).toContain('}: EditProps )');
      expect(childEdit).toContain('useTypiaValidation');
      expect(childEdit).not.toMatch(/setAttributes\s*\(\s*\{/);
      expect(childEdit).toContain('getChildInnerBlocksPropsOptions');
      expect(childEdit).toContain('hasNestedChildBlocks( metadata.name )');
      expect(childEdit).not.toContain('allowedBlocks={');
      expect(childEdit).toContain("from '../demo-compound/children'");
      expect(childEdit).toContain(
        'wp-block-create-block-demo-compound-item__title',
      );
      expect(childHooks).toContain('useTypiaValidation');
      expect(childHooks).toContain("from '../../hooks'");
      expect(childValidators).toContain('validator-toolkit');
      expect(childValidators).toContain("import typia from 'typia';");
      expect(childValidators).not.toContain('createScaffoldValidatorToolkit');
      expect(childValidators).toContain('DemoCompoundItemValidationResult');
      expect(childValidators).toContain(
        'scaffoldValidators.validateAttributes as (',
      );
      expect(parentBlockMetadata).toContain(
        'defineScaffoldBlockMetadata(rawMetadata)',
      );
      expect(parentManifestWrapper).toContain(
        'defineManifestDocument(rawCurrentManifest)',
      );
      expect(parentManifestDefaultsWrapper).toContain(
        'defineManifestDefaultsDocument(rawCurrentManifest)',
      );
      expect(childBlockMetadata).toContain(
        'defineScaffoldBlockMetadata(rawMetadata)',
      );
      expect(childManifestWrapper).toContain(
        'defineManifestDocument(rawCurrentManifest)',
      );
      expect(childManifestDefaultsWrapper).toContain(
        'defineManifestDefaultsDocument(rawCurrentManifest)',
      );
      expect(childBlockJson.attributes.title.selector).toBe(
        '.wp-block-create-block-demo-compound-item__title',
      );
      expect(childBlockJson.attributes.body.selector).toBe(
        '.wp-block-create-block-demo-compound-item__body',
      );
      expect(addChildScript).toContain('createUseTypiaValidationHook');
      expect(addChildScript).toContain('createTemplateValidatorToolkit');
      expect(addChildScript).not.toContain('createScaffoldValidatorToolkit');
      expect(addChildScript).toContain(
        "import type { BlockEditProps } from '@wp-typia/block-types/blocks/registration';",
      );
      expect(addChildScript).toContain(
        'type EditProps = BlockEditProps< ${ childTypeName } >;',
      );
      expect(addChildScript).toContain('buildScaffoldBlockRegistration');
      expect(addChildScript).toContain(
        'registerScaffoldBlockType( registration.name, registration.settings );',
      );
      expect(addChildScript).not.toContain('registerBlockType<');
      expect(addChildScript).toContain('registerScaffoldBlockType');
      expect(addChildScript).toContain(
        "import metadata from './block-metadata';",
      );
      expect(addChildScript).toContain('renderBlockMetadataFile()');
      expect(addChildScript).toContain('renderManifestDocumentFile()');
      expect(addChildScript).toContain('renderManifestDefaultsDocumentFile()');
      expect(addChildScript).toContain('getChildInnerBlocksPropsOptions');
      expect(addChildScript).toContain(
        "import currentManifest from './manifest-defaults-document';",
      );
      expect(addChildScript).toContain('CHILD_SPEC_MARKER');
      expect(addChildScript).toContain('BLOCK_CONFIG_MARKER');
      expect(addChildScript).toContain('buildBlockCssClassName');
      expect(addChildScript).toContain('--ancestor');
      expect(addChildScript).toContain('--container');
      expect(addChildScript).toContain('--inserter');
      expect(generatedWebpackConfig).toContain('createTypiaWebpackConfig');
      expect(readme).toContain('npm run sync');
      expect(readme).toContain('npm run sync-types');
      expect(readme).not.toContain('npm run sync-rest');
      expect(readme).toContain('npm run dev');
      expect(readme).toContain('## Quick Start');
      expect(readme).toContain('## Compound InnerBlocks Presets');
      expect(readme).toContain('`freeform`');
      expect(readme).toContain('useInnerBlocksProps');
      expect(readme).toContain(
        `npx --yes wp-typia@${wpTypiaPackageManifest.version} doctor`,
      );
      expect(readme).toContain('## Advanced Sync');
      expect(readme).toContain('## Before First Commit');
      expect(readme).toContain('src/blocks/*/types.ts');
      expect(readme).toContain(
        'npm run add-child -- --slug faq-item --title "FAQ Item"',
      );
      expect(readme).toContain('git init');
      expect(readme).not.toContain('## PHP REST Extension Points');
      expect(blockConfig).not.toContain('restManifest');

      typecheckGeneratedProject(targetDir);
      runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts');
      const buildOutput = buildGeneratedProject(targetDir);
      expect(buildOutput).not.toContain('non-specified generic argument');
    },
    { timeout: 90_000 },
  );

  test('compound scaffolds can opt into migration UI and keep add-child migration-aware', async () => {
    const targetDir = path.join(tempRoot, 'demo-compound-migration');

    await scaffoldProject({
      projectDir: targetDir,
      templateId: 'compound',
      packageManager: 'npm',
      noInstall: true,
      withMigrationUi: true,
      answers: {
        author: 'Test Runner',
        description: 'Demo compound migration block',
        namespace: 'create-block',
        slug: 'demo-compound-migration',
        title: 'Demo Compound Migration',
      },
    });

    const migrationConfigPath = path.join(
      targetDir,
      'src',
      'migrations',
      'config.ts',
    );
    const parentIndexPath = path.join(
      targetDir,
      'src',
      'blocks',
      'demo-compound-migration',
      'index.tsx',
    );
    const childIndexPath = path.join(
      targetDir,
      'src',
      'blocks',
      'demo-compound-migration-item',
      'index.tsx',
    );
    const parentEditPath = path.join(
      targetDir,
      'src',
      'blocks',
      'demo-compound-migration',
      'edit.tsx',
    );
    const addChildScriptPath = path.join(
      targetDir,
      'scripts',
      'add-compound-child.ts',
    );

    expect(fs.readFileSync(parentIndexPath, 'utf8')).toContain(
      '../../migrations/generated/demo-compound-migration/deprecated',
    );
    expect(fs.readFileSync(childIndexPath, 'utf8')).toContain(
      '../../migrations/generated/demo-compound-migration-item/deprecated',
    );
    expect(fs.readFileSync(parentEditPath, 'utf8')).toContain(
      'MigrationDashboard',
    );
    expect(fs.readFileSync(migrationConfigPath, 'utf8')).toContain(
      "key: 'demo-compound-migration'",
    );
    expect(fs.readFileSync(migrationConfigPath, 'utf8')).toContain(
      "key: 'demo-compound-migration-item'",
    );
    expect(fs.readFileSync(addChildScriptPath, 'utf8')).toContain(
      'appendMigrationBlockConfig',
    );

    runGeneratedScript(targetDir, 'scripts/add-compound-child.ts', [
      '--slug',
      'faq-item',
      '--title',
      'FAQ Item',
    ]);

    const nextMigrationConfig = fs.readFileSync(migrationConfigPath, 'utf8');
    expect(nextMigrationConfig).toContain(
      "key: 'demo-compound-migration-faq-item'",
    );
    expect(nextMigrationConfig).toContain(
      "blockName: 'create-block/demo-compound-migration-faq-item'",
    );
  });

  test('migration UI capability rejects non-built-in templates', async () => {
    const targetDir = path.join(tempRoot, 'demo-migration-ui-remote');

    await expect(
      scaffoldProject({
        projectDir: targetDir,
        templateId: createBlockSubsetFixturePath,
        packageManager: 'npm',
        noInstall: true,
        withMigrationUi: true,
        answers: {
          author: 'Test Runner',
          description: 'Demo remote migration ui block',
          namespace: 'create-block',
          slug: 'demo-migration-ui-remote',
          title: 'Demo Migration UI Remote',
        },
    }),
    ).rejects.toThrow(
      '`--with-migration-ui` is currently supported only for built-in templates and workspace-capable wp-typia templates.',
    );
    expect(fs.existsSync(targetDir)).toBe(false);
  });

  test('compound migration UI patches legacy add-child metadata anchors', async () => {
    const targetDir = path.join(tempRoot, 'demo-compound-migration-legacy-anchor');

    await scaffoldProject({
      projectDir: targetDir,
      templateId: 'compound',
      packageManager: 'npm',
      noInstall: true,
      answers: {
        author: 'Test Runner',
        description: 'Demo compound migration legacy anchor',
        namespace: 'create-block',
        slug: 'demo-compound-migration-legacy-anchor',
        title: 'Demo Compound Migration Legacy Anchor',
      },
    });

    const addChildScriptPath = path.join(targetDir, 'scripts', 'add-compound-child.ts');
    fs.writeFileSync(
      addChildScriptPath,
      fs
        .readFileSync(addChildScriptPath, 'utf8')
        .replace("import metadata from './block-metadata';", "import metadata from './block.json';"),
      'utf8',
    );

    await applyMigrationUiCapability({
      packageManager: 'npm',
      projectDir: targetDir,
      templateId: 'compound',
      variables: {
        namespace: 'create-block',
        slugKebabCase: 'demo-compound-migration-legacy-anchor',
        textDomain: 'create-block',
      } as any,
    });

    const addChildScript = fs.readFileSync(addChildScriptPath, 'utf8');
    expect(addChildScript).toContain("import metadata from './block.json';");
    expect(addChildScript).toContain(
      "import { deprecated } from '../../migrations/generated/${ childFolderSlug }/deprecated';",
    );
    expect(addChildScript).toContain(
      "\\t\\tdeprecated,\n\\t\\tedit: Edit,\n\\t\\tsave: Save,",
    );
  });

  test(
    'compound scaffolds enable authenticated persistence when only data storage is provided',
    async () => {
      const targetDir = path.join(tempRoot, 'demo-compound-storage');

      await scaffoldProject({
        projectDir: targetDir,
        templateId: 'compound',
        dataStorageMode: 'post-meta',
        packageManager: 'npm',
        noInstall: true,
        answers: {
          author: 'Test Runner',
          dataStorageMode: 'post-meta',
          description: 'Demo compound persistence block',
          namespace: 'create-block',
          slug: 'demo-compound-storage',
          title: 'Demo Compound Storage',
        },
      });

      runGeneratedScript(targetDir, 'scripts/sync-project.ts', ['--check']);

      const packageJson = JSON.parse(
        fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'),
      );
      const pluginBootstrap = fs.readFileSync(
        path.join(targetDir, 'demo-compound-storage.php'),
        'utf8',
      );
      const readme = fs.readFileSync(path.join(targetDir, 'README.md'), 'utf8');
      const generatedSyncRest = fs.readFileSync(
        path.join(targetDir, 'scripts', 'sync-rest-contracts.ts'),
        'utf8',
      );
      const generatedBlockConfig = fs.readFileSync(
        path.join(targetDir, 'scripts', 'block-config.ts'),
        'utf8',
      );
      const generatedAddChild = fs.readFileSync(
        path.join(targetDir, 'scripts', 'add-compound-child.ts'),
        'utf8',
      );
      const generatedApiTypes = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-storage',
          'api-types.ts',
        ),
        'utf8',
      );
      const generatedTransport = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-storage',
          'transport.ts',
        ),
        'utf8',
      );
      const parentEdit = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-storage',
          'edit.tsx',
        ),
        'utf8',
      );
      const parentInteractivity = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-storage',
          'interactivity.ts',
        ),
        'utf8',
      );
      const parentChildren = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-storage',
          'children.ts',
        ),
        'utf8',
      );
      const parentManifest = JSON.parse(
        fs.readFileSync(
          path.join(
            targetDir,
            'src',
            'blocks',
            'demo-compound-storage',
            'typia.manifest.json',
          ),
          'utf8',
        ),
      );
      const childEdit = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-storage-item',
          'edit.tsx',
        ),
        'utf8',
      );
      const childHooks = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-storage-item',
          'hooks.ts',
        ),
        'utf8',
      );
      const childValidators = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-storage-item',
          'validators.ts',
        ),
        'utf8',
      );
      const parentValidators = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-storage',
          'validators.ts',
        ),
        'utf8',
      );
      const generatedValidatorToolkit = fs.readFileSync(
        path.join(targetDir, 'src', 'validator-toolkit.ts'),
        'utf8',
      );
      const childManifest = JSON.parse(
        fs.readFileSync(
          path.join(
            targetDir,
            'src',
            'blocks',
            'demo-compound-storage-item',
            'typia.manifest.json',
          ),
          'utf8',
        ),
      );
      const parentIndex = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-storage',
          'index.tsx',
        ),
        'utf8',
      );
      const parentBlockJson = JSON.parse(
        fs.readFileSync(
          path.join(
            targetDir,
            'src',
            'blocks',
            'demo-compound-storage',
            'block.json',
          ),
          'utf8',
        ),
      );
      const generatedWebpackConfig = fs.readFileSync(
        path.join(targetDir, 'webpack.config.js'),
        'utf8',
      );

      expect(packageJson.devDependencies['@wp-typia/api-client']).toBe(
        apiClientPackageVersion,
      );
      expect(packageJson.devDependencies['@wp-typia/rest']).toBe(
        restPackageVersion,
      );
      expect(packageJson.dependencies['@wordpress/data']).toBe('~10.46.0');
      expect(packageJson.scripts.dev).toBe(
        'npm run sync && concurrently -k -n sync-types,sync-rest,editor -c yellow,magenta,blue "npm run watch:sync-types" "npm run watch:sync-rest" "npm run start:editor"',
      );
      expect(packageJson.scripts['watch:sync-types']).toBe(
        'chokidar "src/blocks/**/types.ts" "scripts/block-config.ts" --debounce 200 -c "npm run sync-types"',
      );
      expect(packageJson.scripts['watch:sync-rest']).toBe(
        'chokidar "src/blocks/**/api-types.ts" "scripts/block-config.ts" --debounce 200 -c "npm run sync-rest"',
      );
      expect(packageJson.scripts.sync).toBe('tsx scripts/sync-project.ts');
      expect(packageJson.scripts.build).toBe(
        'npm run sync -- --check && wp-scripts build --experimental-modules',
      );
      expect(packageJson.scripts.typecheck).toBe(
        'npm run sync -- --check && tsc --noEmit',
      );
      expect(
        fs.existsSync(path.join(targetDir, 'inc', 'rest-shared.php')),
      ).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'inc', 'rest-auth.php'))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(targetDir, 'languages', '.gitkeep'))).toBe(
        true,
      );
      expect(pluginBootstrap).toContain('can_write_authenticated');
      expect(pluginBootstrap).toContain('is_post_publicly_viewable( $post )');
      expect(pluginBootstrap).toContain(
        "current_user_can( 'read_post', $post->ID )",
      );
      expect(pluginBootstrap).toContain('Tested up to:      7.0');
      expect(pluginBootstrap).toContain('Domain Path:       /languages');
      expect(pluginBootstrap).toContain('load_plugin_textdomain(');
      expect(pluginBootstrap).toContain(
        "require_once __DIR__ . '/inc/rest-shared.php';",
      );
      expect(pluginBootstrap).toContain(
        "require_once __DIR__ . '/inc/rest-auth.php';",
      );
      expect(pluginBootstrap).toContain("return 'wpt_pcl_' . md5(");
      expect(parentBlockJson.render).toBe('file:./render.php');
      expect(parentBlockJson.viewScriptModule).toBe('file:./interactivity.js');
      expect(parentBlockJson.attributes.resourceKey).not.toHaveProperty(
        'default',
      );
      expect(parentManifest.attributes.resourceKey.typia.hasDefault).toBe(false);
      expect(
        parentManifest.attributes.resourceKey.typia.defaultValue,
      ).toBeNull();
      expect(parentEdit).toContain('store as blockEditorStore');
      expect(parentEdit).toContain('usePersistentBlockIdentity');
      expect(parentEdit).toContain("attributeName: 'resourceKey'");
      expect(parentEdit).toContain(
        "blockName: 'create-block/demo-compound-storage'",
      );
      expect(parentEdit).toContain("prefix: 'demo-compound-storage'");
      expect(generatedSyncRest).toContain('syncRestOpenApi');
      expect(generatedSyncRest).toContain('syncEndpointClient');
      expect(generatedSyncRest).toContain('manifest: block.restManifest');
      expect(generatedBlockConfig).toContain(
        'src/blocks/demo-compound-storage/api.openapi.json',
      );
      expect(generatedBlockConfig).toContain('defineBlockNesting');
      expect(generatedBlockConfig).toContain('defineInnerBlocksTemplates');
      expect(generatedBlockConfig).toContain('export const BLOCK_NESTING');
      expect(generatedBlockConfig).toContain('export const BLOCK_TEMPLATES');
      expect(generatedBlockConfig).toContain('export const PATTERNS');
      expect(generatedBlockConfig).toContain(
        'restManifest: defineEndpointManifest',
      );
      expect(generatedBlockConfig).toContain(
        'add-child: insert new block config entries here',
      );
      expect(generatedBlockConfig).toMatch(
        /auth:\s*'public'[\s\S]*?operationId:\s*'getDemoCompoundStorageBootstrap'/,
      );
      expect(generatedApiTypes).toContain('publicWriteRequestId?: string');
      expect(generatedApiTypes).toContain('restNonce?: string');
      expect(generatedApiTypes).not.toContain('publicWriteExpiresAt?: number');
      expect(generatedApiTypes).not.toContain('{{#isPublicPersistencePolicy}}');
      expect(parentInteractivity).toContain(
        'includePublicWriteCredentials = false',
      );
      expect(parentInteractivity).toContain(
        "'publicWriteExpiresAt' in result.data",
      );
      expect(parentInteractivity).toContain(
        "'publicWriteToken' in result.data",
      );
      expect(parentInteractivity).toContain("'restNonce' in result.data");
      expect(
        fs.existsSync(
          path.join(
            targetDir,
            'src',
            'blocks',
            'demo-compound-storage',
            'api-client.ts',
          ),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(
            targetDir,
            'src',
            'blocks',
            'demo-compound-storage',
            'api-schemas',
            'bootstrap-query.schema.json',
          ),
        ),
      ).toBe(true);
      expect(generatedBlockConfig).not.toContain('contracts: [');
      expect(generatedBlockConfig).not.toContain('openApiInfo:');
      expect(
        generatedBlockConfig.match(/restManifest: defineEndpointManifest/g),
      ).toHaveLength(1);
      expect(parentEdit).toContain('createAttributeUpdater');
      expect(parentEdit).toContain(
        "import type { BlockEditProps } from '@wp-typia/block-types/blocks/registration';",
      );
      expect(parentEdit).toContain(
        'type EditProps = BlockEditProps< DemoCompoundStorageAttributes >;',
      );
      expect(parentEdit).toContain('}: EditProps )');
      expect(parentEdit).toContain('useTypiaValidation');
      expect(parentEdit).toContain('getRootInnerBlocksPropsOptions');
      expect(parentEdit).toContain('rootInnerBlocksPropsOptions');
      expect(parentEdit).not.toMatch(/setAttributes\s*\(\s*\{/);
      expect(parentInteractivity).toContain(
        '@wp-typia/block-runtime/identifiers',
      );
      expect(parentInteractivity).toContain('generatePublicWriteRequestId');
      expect(parentInteractivity).not.toContain(
        'function createPublicWriteRequestId',
      );
      expect(parentInteractivity).toContain('await actions.loadBootstrap();');
      expect(parentInteractivity).toContain("transportTarget: 'frontend'");
      expect(pluginBootstrap).toContain(
        "define( 'DEMO_COMPOUND_STORAGE_DATA_STORAGE_MODE', 'post-meta' );",
      );
      expect(pluginBootstrap).toContain(
        "if ( 'custom-table' !== DEMO_COMPOUND_STORAGE_DATA_STORAGE_MODE )",
      );
      expect(pluginBootstrap).toContain(
        "'storage'     => DEMO_COMPOUND_STORAGE_DATA_STORAGE_MODE,",
      );
      expect(generatedTransport).toContain('resolveTransportCallOptions');
      expect(generatedTransport).toContain('includeRestNonce: true');
      expect(generatedTransport).toContain('includeRestNonce: false');
      expect(parentIndex).toContain('buildScaffoldBlockRegistration');
      expect(parentIndex).toContain(
        "import metadata from './block-metadata';",
      );
      expect(parentIndex).toContain(
        'registerScaffoldBlockType(registration.name, registration.settings);',
      );
      expect(parentIndex).not.toContain('registerBlockType<');
      expect(parentIndex).toContain('registerScaffoldBlockType');
      expect(parentValidators).toContain('@wp-typia/block-runtime/identifiers');
      expect(parentValidators).toContain('generateResourceKey');
      expect(parentValidators).not.toContain('const generateResourceKey');
      expect(parentChildren).toContain('DEFAULT_CHILD_BLOCK_NAME');
      expect(childManifest.attributes.title.typia.defaultValue).toBe(
        'Demo Compound Storage Item',
      );
      expect(childEdit).toContain('createAttributeUpdater');
      expect(childEdit).toContain('useTypiaValidation');
      expect(childEdit).not.toMatch(/setAttributes\s*\(\s*\{/);
      expect(childHooks).toContain('useTypiaValidation');
      expect(childHooks).toContain("from '../../hooks'");
      expect(childValidators).toContain('validator-toolkit');
      expect(childValidators).toContain("import typia from 'typia';");
      expect(childValidators).not.toContain('createScaffoldValidatorToolkit');
      expect(childValidators).toContain(
        'DemoCompoundStorageItemValidationResult',
      );
      expect(childValidators).toContain(
        'scaffoldValidators.validateAttributes as (',
      );
      expect(generatedValidatorToolkit).toContain(
        'createScaffoldValidatorToolkit',
      );
      expect(generatedValidatorToolkit).toContain(
        'parseManifestDefaultsDocument',
      );
      expect(generatedValidatorToolkit).not.toContain(
        'manifest as ManifestDefaultsDocument',
      );
      expect(generatedValidatorToolkit).not.toContain('typia.createValidate');
      expect(generatedAddChild).toContain('CHILD_SPEC_MARKER');
      expect(generatedAddChild).toContain('buildScaffoldBlockRegistration');
      expect(generatedAddChild).toContain(
        'registerScaffoldBlockType( registration.name, registration.settings );',
      );
      expect(generatedAddChild).not.toContain('registerBlockType<');
      expect(generatedAddChild).toContain('registerScaffoldBlockType');
      expect(generatedAddChild).toContain(
        "import metadata from './block-metadata';",
      );
      expect(generatedAddChild).toContain('renderBlockMetadataFile()');
      expect(generatedAddChild).toContain('renderManifestDocumentFile()');
      expect(generatedAddChild).toContain('renderManifestDefaultsDocumentFile()');
      expect(generatedAddChild).toContain(
        "import currentManifest from './manifest-defaults-document';",
      );
      expect(generatedAddChild).toContain('createTemplateValidatorToolkit');
      expect(generatedAddChild).not.toContain('createScaffoldValidatorToolkit');
      expect(packageJson.scripts['add-child']).toBe(
        'tsx scripts/add-compound-child.ts',
      );
      expect(
        fs.existsSync(path.join(targetDir, 'scripts', 'sync-project.ts')),
      ).toBe(true);
      const generatedParentSyncProject = fs.readFileSync(
        path.join(targetDir, 'scripts', 'sync-project.ts'),
        'utf8',
      );
      expect(generatedParentSyncProject).toContain('spawnSync');
      expect(generatedParentSyncProject).toContain(
        "shell: process.platform === 'win32'",
      );
      expect(generatedParentSyncProject).toContain("spawnSync( 'tsx', args");
      expect(generatedParentSyncProject).not.toContain('getLocalTsxBinary');
      expect(generatedWebpackConfig).toContain('createTypiaWebpackConfig');
      expect(readme).toContain('npm run dev');
      expect(readme).toContain('npm run sync');
      expect(readme).toContain('npm run sync-rest');
      expect(readme).toContain('## Quick Start');
      expect(readme).toContain(
        `npx --yes wp-typia@${wpTypiaPackageManifest.version} doctor`,
      );
      expect(readme).toContain('## Advanced Sync');
      expect(readme).toContain('## Before First Commit');
      expect(readme).toContain('src/blocks/*/api-types.ts');
      expect(readme).toContain('src/blocks/*/transport.ts');
      expect(readme).toContain(
        'npm run add-child -- --slug faq-item --title "FAQ Item"',
      );
      expect(readme).toContain('git commit -m "Initial scaffold"');
      expect(readme).toContain('## PHP REST Extension Points');
      expect(readme).toContain(
        'Edit `src/blocks/demo-compound-storage/transport.ts` when you need to switch between direct WordPress REST and a contract-compatible proxy or BFF',
      );
      expect(readme).toContain(
        'The hidden child block does not own REST routes or storage.',
      );
      expect(pluginBootstrap).toContain('Customize storage helpers');

      const generatedApiClient = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-storage',
          'api-client.ts',
        ),
        'utf8',
      );
      const generatedParentApi = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-storage',
          'api.ts',
        ),
        'utf8',
      );
      const generatedParentData = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-storage',
          'data.ts',
        ),
        'utf8',
      );
      expect(generatedApiClient).toContain("from '@wp-typia/api-client'");
      expect(generatedApiClient).toContain(
        'export const getDemoCompoundStorageStateEndpoint',
      );
      expect(generatedParentApi).toContain("from './api-client'");
      expect(generatedParentApi).toContain(
        'getDemoCompoundStorageStateEndpoint',
      );
      expect(generatedParentApi).toContain(
        'writeDemoCompoundStorageStateEndpoint',
      );
      expect(generatedParentApi).not.toContain('createEndpoint(');
      expect(generatedParentData).toContain("from '@wp-typia/rest/react'");
      expect(generatedParentData).toContain('useDemoCompoundStorageStateQuery');
      expect(generatedParentData).toContain(
        'useWriteDemoCompoundStorageStateMutation',
      );
      expect(
        fs.existsSync(
          path.join(
            targetDir,
            'src',
            'blocks',
            'demo-compound-storage-item',
            'api-client.ts',
          ),
        ),
      ).toBe(false);
    },
    { timeout: 30_000 },
  );

  test('compound persistence sync-rest fails fast when block metadata is stale', async () => {
    const targetDir = path.join(tempRoot, 'demo-compound-sync-stale');

    await scaffoldProject({
      projectDir: targetDir,
      templateId: 'compound',
      dataStorageMode: 'post-meta',
      packageManager: 'npm',
      noInstall: true,
      answers: {
        author: 'Test Runner',
        dataStorageMode: 'post-meta',
        description: 'Demo compound stale guard',
        namespace: 'create-block',
        slug: 'demo-compound-sync-stale',
        title: 'Demo Compound Sync Stale',
      },
    });

    const staleCompoundBlockJsonPath = path.join(
      targetDir,
      'src',
      'blocks',
      'demo-compound-sync-stale',
      'block.json',
    );
    const staleCompoundBlockJson = JSON.parse(
      fs.readFileSync(staleCompoundBlockJsonPath, 'utf8'),
    );

    staleCompoundBlockJson.attributes.__staleCoverage = {
      type: 'string',
    };

    fs.writeFileSync(
      staleCompoundBlockJsonPath,
      `${JSON.stringify(staleCompoundBlockJson, null, 2)}\n`,
      'utf8',
    );

    const errorMessage = getCommandErrorMessage(() =>
      runGeneratedScript(targetDir, 'scripts/sync-rest-contracts.ts'),
    );

    expect(errorMessage).toContain('Run `sync` or `sync-types` first');
    expect(errorMessage).toContain('demo-compound-sync-stale');

    runGeneratedScript(targetDir, 'scripts/sync-project.ts');
    runGeneratedScript(targetDir, 'scripts/sync-rest-contracts.ts');
  }, 40_000);

  test(
    'compound add-child workflow scaffolds a new hidden child block and keeps the default template stable',
    async () => {
      const targetDir = path.join(tempRoot, 'demo-compound-add-child');

      await scaffoldProject({
        projectDir: targetDir,
        templateId: 'compound',
        dataStorageMode: 'post-meta',
        packageManager: 'npm',
        noInstall: true,
        answers: {
          author: 'Test Runner',
          dataStorageMode: 'post-meta',
          description: 'Demo compound add-child workflow',
          namespace: 'create-block',
          slug: 'demo-compound-add-child',
          title: 'Demo Compound Add Child',
        },
      });

      const blockConfigPath = path.join(
        targetDir,
        'scripts',
        'block-config.ts',
      );
      const childrenRegistryPath = path.join(
        targetDir,
        'src',
        'blocks',
        'demo-compound-add-child',
        'children.ts',
      );
      fs.writeFileSync(
        blockConfigPath,
        fs
          .readFileSync(blockConfigPath, 'utf8')
          .replace(
            /\t\/\/ add-child: insert new block config entries here/u,
            '  // add-child: insert new block config entries here',
          ),
        'utf8',
      );
      fs.writeFileSync(
        childrenRegistryPath,
        fs
          .readFileSync(childrenRegistryPath, 'utf8')
          .replace(
            /\t\/\/ add-child: insert new child specs here/u,
            '  // add-child: insert new child specs here',
          ),
        'utf8',
      );

      runGeneratedScript(targetDir, 'scripts/add-compound-child.ts', [
        '--slug',
        'faq-item',
        '--title',
        'FAQ Item',
      ]);

      const newChildDir = path.join(
        targetDir,
        'src',
        'blocks',
        'demo-compound-add-child-faq-item',
      );
      const blockConfig = fs.readFileSync(blockConfigPath, 'utf8');
      const childrenRegistry = fs.readFileSync(childrenRegistryPath, 'utf8');
      const newChildBlockJson = JSON.parse(
        fs.readFileSync(path.join(newChildDir, 'block.json'), 'utf8'),
      );
      const newChildEdit = fs.readFileSync(
        path.join(newChildDir, 'edit.tsx'),
        'utf8',
      );
      const newChildHooks = fs.readFileSync(
        path.join(newChildDir, 'hooks.ts'),
        'utf8',
      );
      const newChildIndex = fs.readFileSync(
        path.join(newChildDir, 'index.tsx'),
        'utf8',
      );
      const newChildSave = fs.readFileSync(
        path.join(newChildDir, 'save.tsx'),
        'utf8',
      );
      const newChildValidators = fs.readFileSync(
        path.join(newChildDir, 'validators.ts'),
        'utf8',
      );

      expect(fs.existsSync(path.join(newChildDir, 'block.json'))).toBe(true);
      expect(fs.existsSync(path.join(newChildDir, 'edit.tsx'))).toBe(true);
      expect(fs.existsSync(path.join(newChildDir, 'hooks.ts'))).toBe(true);
      expect(fs.existsSync(path.join(newChildDir, 'index.tsx'))).toBe(true);
      expect(fs.existsSync(path.join(newChildDir, 'save.tsx'))).toBe(true);
      expect(fs.existsSync(path.join(newChildDir, 'typia.manifest.json'))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(newChildDir, 'types.ts'))).toBe(true);
      expect(fs.existsSync(path.join(newChildDir, 'validators.ts'))).toBe(true);
      expect(newChildBlockJson.version).toBe('0.1.0');
      expect(newChildBlockJson.category).toBe('widgets');
      expect(newChildBlockJson.icon).toBe('excerpt-view');
      expect(blockConfig).toContain('demo-compound-add-child-faq-item');
      expect(blockConfig).toContain('DemoCompoundAddChildFaqItemAttributes');
      expect(childrenRegistry).toMatch(
        /blockName:\s*["']create-block\/demo-compound-add-child-faq-item["'][\s\S]*?placement:\s*["']root["'][\s\S]*?templateInstances:\s*\[\]/u,
      );
      expect(newChildHooks).toContain('createUseTypiaValidationHook');
      expect(newChildValidators).toContain('createTemplateValidatorToolkit');
      expect(newChildValidators).not.toContain(
        'createScaffoldValidatorToolkit',
      );
      expect(newChildValidators).toContain(
        'DemoCompoundAddChildFaqItemValidationResult',
      );
      expect(newChildValidators).toContain(
        'scaffoldValidators.validateAttributes as (',
      );
      expect(newChildIndex).toContain('buildScaffoldBlockRegistration');
      expect(newChildIndex).toContain(
        "import metadata from './block-metadata';",
      );
      expect(newChildIndex).toContain(
        'registerScaffoldBlockType( registration.name, registration.settings );',
      );
      expect(newChildIndex).not.toContain('registerBlockType<');
      expect(newChildIndex).toContain('registerScaffoldBlockType');
      expect(newChildValidators).toContain(
        "import currentManifest from './manifest-defaults-document';",
      );
      expect(newChildEdit).toContain(
        'wp-block-create-block-demo-compound-add-child-faq-item',
      );
      expect(newChildSave).toContain(
        'wp-block-create-block-demo-compound-add-child-faq-item',
      );
      expect(newChildBlockJson.attributes.title.selector).toBe(
        '.wp-block-create-block-demo-compound-add-child-faq-item__title',
      );
      expect(newChildBlockJson.attributes.body.selector).toBe(
        '.wp-block-create-block-demo-compound-add-child-faq-item__body',
      );
      expect(
        (
          childrenRegistry.match(
            /create-block\/demo-compound-add-child-faq-item/g,
          ) ?? []
        ).length,
      ).toBe(1);
      expect(childrenRegistry).toContain('add-child: insert new child specs here');

      runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts');

      expect(fs.existsSync(path.join(newChildDir, 'typia.manifest.json'))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(newChildDir, 'typia.schema.json'))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(newChildDir, 'typia.openapi.json'))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(newChildDir, 'typia-validator.php'))).toBe(
        true,
      );
    },
    { timeout: 30_000 },
  );

  test(
    'compound add-child dry-run previews the nested child graph without writing files',
    async () => {
      const targetDir = path.join(tempRoot, 'demo-compound-dry-run-preview');

      await scaffoldProject({
        projectDir: targetDir,
        templateId: 'compound',
        packageManager: 'npm',
        noInstall: true,
        answers: {
          author: 'Test Runner',
          description: 'Demo compound dry-run preview workflow',
          namespace: 'create-block',
          slug: 'demo-compound-dry-run-preview',
          title: 'Demo Compound Dry Run Preview',
        },
      });

      runGeneratedScript(targetDir, 'scripts/add-compound-child.ts', [
        '--slug',
        'section',
        '--title',
        'Section',
        '--container',
        '--inserter',
        'visible',
      ]);

      const childrenFilePath = path.join(
        targetDir,
        'src',
        'blocks',
        'demo-compound-dry-run-preview',
        'children.ts',
      );
      const blockConfigPath = path.join(targetDir, 'scripts', 'block-config.ts');
      const sectionBlockJsonPath = path.join(
        targetDir,
        'src',
        'blocks',
        'demo-compound-dry-run-preview-section',
        'block.json',
      );
      const clauseDir = path.join(
        targetDir,
        'src',
        'blocks',
        'demo-compound-dry-run-preview-clause',
      );
      const childrenBefore = fs.readFileSync(childrenFilePath, 'utf8');
      const blockConfigBefore = fs.readFileSync(blockConfigPath, 'utf8');
      const sectionBlockJsonBefore = fs.readFileSync(sectionBlockJsonPath, 'utf8');

      const dryRunOutput = runGeneratedScript(
        targetDir,
        'scripts/add-compound-child.ts',
        [
          '--slug',
          'clause',
          '--title',
          'Clause',
          '--ancestor',
          'section',
          '--dry-run',
        ],
      );

      expect(dryRunOutput).toContain('Compound child graph preview');
      expect(dryRunOutput).toContain(
        '- item -> create-block/demo-compound-dry-run-preview-item [existing, root, leaf, hidden]',
      );
      expect(dryRunOutput).toContain(
        '- section -> create-block/demo-compound-dry-run-preview-section [existing, root, container, visible]',
      );
      expect(dryRunOutput).toContain(
        '  - clause -> create-block/demo-compound-dry-run-preview-clause [new, nested, leaf, visible]',
      );
      expect(dryRunOutput).toContain('Dry run only; no files were written.');
      expect(fs.existsSync(clauseDir)).toBe(false);
      expect(fs.readFileSync(childrenFilePath, 'utf8')).toBe(childrenBefore);
      expect(fs.readFileSync(blockConfigPath, 'utf8')).toBe(blockConfigBefore);
      expect(fs.readFileSync(sectionBlockJsonPath, 'utf8')).toBe(
        sectionBlockJsonBefore,
      );
    },
    { timeout: 30_000 },
  );

  test(
    'compound add-child scaffolds visible container children and nested ancestor children',
    async () => {
      const targetDir = path.join(tempRoot, 'demo-compound-nested');

      await scaffoldProject({
        projectDir: targetDir,
        templateId: 'compound',
        packageManager: 'npm',
        noInstall: true,
        answers: {
          author: 'Test Runner',
          description: 'Demo compound nested workflow',
          namespace: 'create-block',
          slug: 'demo-compound-nested',
          title: 'Demo Compound Nested',
        },
      });

      const sectionOutput = runGeneratedScript(
        targetDir,
        'scripts/add-compound-child.ts',
        [
          '--slug',
          'section',
          '--title',
          'Section',
          '--container',
          '--inserter',
          'visible',
        ],
      );

      const clauseOutput = runGeneratedScript(
        targetDir,
        'scripts/add-compound-child.ts',
        [
          '--slug',
          'clause',
          '--title',
          'Clause',
          '--ancestor',
          'section',
        ],
      );

      const parentBlockJson = JSON.parse(
        fs.readFileSync(
          path.join(targetDir, 'src', 'blocks', 'demo-compound-nested', 'block.json'),
          'utf8',
        ),
      );
      const sectionDir = path.join(
        targetDir,
        'src',
        'blocks',
        'demo-compound-nested-section',
      );
      const clauseDir = path.join(
        targetDir,
        'src',
        'blocks',
        'demo-compound-nested-clause',
      );
      const sectionBlockJson = JSON.parse(
        fs.readFileSync(path.join(sectionDir, 'block.json'), 'utf8'),
      );
      const clauseBlockJson = JSON.parse(
        fs.readFileSync(path.join(clauseDir, 'block.json'), 'utf8'),
      );
      const sectionEdit = fs.readFileSync(path.join(sectionDir, 'edit.tsx'), 'utf8');
      const sectionSave = fs.readFileSync(path.join(sectionDir, 'save.tsx'), 'utf8');
      const childrenRegistry = fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-nested',
          'children.ts',
        ),
        'utf8',
      );

      expect(parentBlockJson.allowedBlocks).toEqual([
        'create-block/demo-compound-nested-item',
        'create-block/demo-compound-nested-section',
      ]);
      expect(sectionBlockJson.parent).toEqual(['create-block/demo-compound-nested']);
      expect(sectionBlockJson.allowedBlocks).toEqual([
        'create-block/demo-compound-nested-clause',
      ]);
      expect(sectionBlockJson.supports.inserter).toBe(true);
      expect(clauseBlockJson.ancestor).toEqual([
        'create-block/demo-compound-nested-section',
      ]);
      expect(clauseBlockJson.supports.inserter).toBe(true);
      expect(sectionOutput).toContain('Compound child graph preview');
      expect(sectionOutput).toContain('Applying these updates now.');
      expect(clauseOutput).toContain(
        '  - clause -> create-block/demo-compound-nested-clause [new, nested, leaf, visible]',
      );
      expect(sectionEdit).toContain('InnerBlocks');
      expect(sectionEdit).toContain('hasNestedChildBlocks( metadata.name )');
      expect(sectionEdit).not.toContain('allowedBlocks={');
      expect(sectionSave).toContain('InnerBlocks.Content');
      expect(childrenRegistry).toContain('key: "section"');
      expect(childrenRegistry).toContain('key: "clause"');
      expect(childrenRegistry).toContain('ancestorKeys: [ "section" ]');
      expect(childrenRegistry).toContain('placement: "nested"');
      expect(childrenRegistry).toContain(
        'create-block/demo-compound-nested-clause',
      );
    },
    { timeout: 30_000 },
  );

  test(
    'compound add-child rejects nesting under visible non-container ancestor children',
    async () => {
      const targetDir = path.join(tempRoot, 'demo-compound-visible-leaf');

      await scaffoldProject({
        projectDir: targetDir,
        templateId: 'compound',
        packageManager: 'npm',
        noInstall: true,
        answers: {
          author: 'Test Runner',
          description: 'Demo compound visible leaf workflow',
          namespace: 'create-block',
          slug: 'demo-compound-visible-leaf',
          title: 'Demo Compound Visible Leaf',
        },
      });

      runGeneratedScript(targetDir, 'scripts/add-compound-child.ts', [
        '--slug',
        'faq-item',
        '--title',
        'FAQ Item',
        '--inserter',
        'visible',
      ]);

      expect(() =>
        runGeneratedScript(targetDir, 'scripts/add-compound-child.ts', [
          '--slug',
          'follow-up',
          '--title',
          'Follow Up',
          '--ancestor',
          'faq-item',
        ]),
      ).toThrow(
        'Cannot nest descendants under create-block/demo-compound-visible-leaf-faq-item because it is not declared as a container child. Re-add that child with --container or target an existing container child.',
      );
    },
    { timeout: 30_000 },
  );

  test(
    'compound add-child rejects nesting under hidden unseeded ancestor children',
    async () => {
      const targetDir = path.join(tempRoot, 'demo-compound-unreachable-nested');

      await scaffoldProject({
        projectDir: targetDir,
        templateId: 'compound',
        packageManager: 'npm',
        noInstall: true,
        answers: {
          author: 'Test Runner',
          description: 'Demo compound unreachable nested workflow',
          namespace: 'create-block',
          slug: 'demo-compound-unreachable-nested',
          title: 'Demo Compound Unreachable Nested',
        },
      });

      runGeneratedScript(targetDir, 'scripts/add-compound-child.ts', [
        '--slug',
        'faq-item',
        '--title',
        'FAQ Item',
      ]);

      expect(() =>
        runGeneratedScript(targetDir, 'scripts/add-compound-child.ts', [
          '--slug',
          'follow-up',
          '--title',
          'Follow Up',
          '--ancestor',
          'faq-item',
        ]),
      ).toThrow(
        'Cannot nest descendants under create-block/demo-compound-unreachable-nested-faq-item because it is hidden and has no seeded template instances.',
      );
    },
    { timeout: 30_000 },
  );

  test(
    'compound add-child rejects structurally invalid existing child graphs before writing',
    async () => {
      const targetDir = path.join(tempRoot, 'demo-compound-invalid-graph');

      await scaffoldProject({
        projectDir: targetDir,
        templateId: 'compound',
        packageManager: 'npm',
        noInstall: true,
        answers: {
          author: 'Test Runner',
          description: 'Demo compound invalid graph workflow',
          namespace: 'create-block',
          slug: 'demo-compound-invalid-graph',
          title: 'Demo Compound Invalid Graph',
        },
      });

      runGeneratedScript(targetDir, 'scripts/add-compound-child.ts', [
        '--slug',
        'section',
        '--title',
        'Section',
        '--container',
        '--inserter',
        'visible',
      ]);

      const sectionBlockJsonPath = path.join(
        targetDir,
        'src',
        'blocks',
        'demo-compound-invalid-graph-section',
        'block.json',
      );
      const sectionBlockJson = JSON.parse(
        fs.readFileSync(sectionBlockJsonPath, 'utf8'),
      );
      delete sectionBlockJson.parent;
      sectionBlockJson.ancestor = [
        'create-block/demo-compound-invalid-graph-missing',
      ];
      fs.writeFileSync(
        sectionBlockJsonPath,
        `${JSON.stringify(sectionBlockJson, null, '\t')}\n`,
        'utf8',
      );

      expect(() =>
        runGeneratedScript(targetDir, 'scripts/add-compound-child.ts', [
          '--slug',
          'clause',
          '--title',
          'Clause',
        ]),
      ).toThrow(
        'Existing compound child graph is invalid: create-block/demo-compound-invalid-graph-section references missing ancestor create-block/demo-compound-invalid-graph-missing.',
      );
    },
    { timeout: 30_000 },
  );

  test(
    'compound add-child rejects ancestor routes that do not connect through the current graph',
    async () => {
      const targetDir = path.join(tempRoot, 'demo-compound-orphaned-route');

      await scaffoldProject({
        projectDir: targetDir,
        templateId: 'compound',
        packageManager: 'npm',
        noInstall: true,
        answers: {
          author: 'Test Runner',
          description: 'Demo compound orphaned route workflow',
          namespace: 'create-block',
          slug: 'demo-compound-orphaned-route',
          title: 'Demo Compound Orphaned Route',
        },
      });

      runGeneratedScript(targetDir, 'scripts/add-compound-child.ts', [
        '--slug',
        'section',
        '--title',
        'Section',
        '--container',
        '--inserter',
        'visible',
      ]);

      runGeneratedScript(targetDir, 'scripts/add-compound-child.ts', [
        '--slug',
        'part',
        '--title',
        'Part',
        '--container',
        '--inserter',
        'visible',
      ]);

      runGeneratedScript(targetDir, 'scripts/add-compound-child.ts', [
        '--slug',
        'clause',
        '--title',
        'Clause',
        '--ancestor',
        'section',
      ]);

      const partBlockJsonPath = path.join(
        targetDir,
        'src',
        'blocks',
        'demo-compound-orphaned-route-part',
        'block.json',
      );
      const partBlockJson = JSON.parse(
        fs.readFileSync(partBlockJsonPath, 'utf8'),
      );
      partBlockJson.allowedBlocks = [
        'create-block/demo-compound-orphaned-route-section',
      ];
      fs.writeFileSync(
        partBlockJsonPath,
        `${JSON.stringify(partBlockJson, null, '\t')}\n`,
        'utf8',
      );

      const clauseBlockJsonPath = path.join(
        targetDir,
        'src',
        'blocks',
        'demo-compound-orphaned-route-clause',
        'block.json',
      );
      const clauseBlockJson = JSON.parse(
        fs.readFileSync(clauseBlockJsonPath, 'utf8'),
      );
      clauseBlockJson.ancestor = [
        'create-block/demo-compound-orphaned-route-part',
        'create-block/demo-compound-orphaned-route-section',
      ];
      fs.writeFileSync(
        clauseBlockJsonPath,
        `${JSON.stringify(clauseBlockJson, null, '\t')}\n`,
        'utf8',
      );

      expect(() =>
        runGeneratedScript(targetDir, 'scripts/add-compound-child.ts', [
          '--slug',
          'appendix',
          '--title',
          'Appendix',
        ]),
      ).toThrow(
        'Existing compound child graph is invalid: create-block/demo-compound-orphaned-route-section is not on the declared ancestor route for create-block/demo-compound-orphaned-route-clause.',
      );
    },
    { timeout: 30_000 },
  );

  test(
    'compound add-child rejects unknown CLI flags before writing files',
    async () => {
      const targetDir = path.join(tempRoot, 'demo-compound-unknown-option');

      await scaffoldProject({
        projectDir: targetDir,
        templateId: 'compound',
        packageManager: 'npm',
        noInstall: true,
        answers: {
          author: 'Test Runner',
          description: 'Demo compound unknown option workflow',
          namespace: 'create-block',
          slug: 'demo-compound-unknown-option',
          title: 'Demo Compound Unknown Option',
        },
      });

      expect(() =>
        runGeneratedScript(targetDir, 'scripts/add-compound-child.ts', [
          '--slug',
          'faq-item',
          '--title',
          'FAQ Item',
          '--dryrun',
        ]),
      ).toThrow('Unknown option: --dryrun.');
    },
    { timeout: 30_000 },
  );

  test('compound add-child reads live parent metadata from disk', async () => {
    const targetDir = path.join(tempRoot, 'demo-compound-live-parent');

    await scaffoldProject({
      projectDir: targetDir,
      templateId: 'compound',
      packageManager: 'npm',
      noInstall: true,
      answers: {
        author: 'Test Runner',
        description: 'Demo compound live parent metadata',
        namespace: 'create-block',
        slug: 'demo-compound-live-parent',
        title: 'Demo Compound Live Parent',
      },
    });

    const parentBlockJsonPath = path.join(
      targetDir,
      'src',
      'blocks',
      'demo-compound-live-parent',
      'block.json',
    );
    const parentBlockJson = JSON.parse(
      fs.readFileSync(parentBlockJsonPath, 'utf8'),
    );
    parentBlockJson.name = 'renamed-space/renamed-parent';
    parentBlockJson.textdomain = 'renamed-parent';
    parentBlockJson.title = 'Renamed Parent';
    fs.writeFileSync(
      parentBlockJsonPath,
      `${JSON.stringify(parentBlockJson, null, '\t')}\n`,
      'utf8',
    );

    runGeneratedScript(targetDir, 'scripts/add-compound-child.ts', [
      '--slug',
      'faq-item',
      '--title',
      'FAQ Item',
    ]);

    const childDir = path.join(
      targetDir,
      'src',
      'blocks',
      'demo-compound-live-parent-faq-item',
    );
    const childBlockJson = JSON.parse(
      fs.readFileSync(path.join(childDir, 'block.json'), 'utf8'),
    );
    const childrenRegistry = fs.readFileSync(
      path.join(
        targetDir,
        'src',
        'blocks',
        'demo-compound-live-parent',
        'children.ts',
      ),
      'utf8',
    );
    const childEdit = fs.readFileSync(path.join(childDir, 'edit.tsx'), 'utf8');

    expect(childBlockJson.name).toBe('renamed-space/renamed-parent-faq-item');
    expect(childBlockJson.parent).toEqual(['renamed-space/renamed-parent']);
    expect(childBlockJson.textdomain).toBe('renamed-parent');
      expect(childrenRegistry).toContain(
        'renamed-space/renamed-parent-faq-item',
      );
    expect(childEdit).toContain("'renamed-parent'");
  });

  test('compound scaffolds enable public persistence when only a public policy is provided', async () => {
    const targetDir = path.join(tempRoot, 'demo-compound-public');

    await scaffoldProject({
      projectDir: targetDir,
      templateId: 'compound',
      packageManager: 'npm',
      noInstall: true,
      answers: {
        author: 'Test Runner',
        description: 'Demo public compound block',
        namespace: 'create-block',
        persistencePolicy: 'public',
        slug: 'demo-compound-public',
        title: 'Demo Compound Public',
      },
      persistencePolicy: 'public',
    });

    const pluginBootstrap = fs.readFileSync(
      path.join(targetDir, 'demo-compound-public.php'),
      'utf8',
    );
    const generatedApiTypes = fs.readFileSync(
      path.join(
        targetDir,
        'src',
        'blocks',
        'demo-compound-public',
        'api-types.ts',
      ),
      'utf8',
    );
    const generatedTransport = fs.readFileSync(
      path.join(
        targetDir,
        'src',
        'blocks',
        'demo-compound-public',
        'transport.ts',
      ),
      'utf8',
    );
    const restPublicHelper = fs.readFileSync(
      path.join(targetDir, 'inc', 'rest-public.php'),
      'utf8',
    );
    const parentRender = fs.readFileSync(
      path.join(
        targetDir,
        'src',
        'blocks',
        'demo-compound-public',
        'render.php',
      ),
      'utf8',
    );
    const readme = fs.readFileSync(path.join(targetDir, 'README.md'), 'utf8');

    expect(fs.existsSync(path.join(targetDir, 'inc', 'rest-shared.php'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(targetDir, 'inc', 'rest-public.php'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(targetDir, 'languages', '.gitkeep'))).toBe(
      true,
    );
    expect(pluginBootstrap).toContain(
      "permission_callback' => 'demo_compound_public_can_write_publicly'",
    );
    expect(pluginBootstrap).toContain('Tested up to:      7.0');
    expect(pluginBootstrap).toContain('Domain Path:       /languages');
    expect(pluginBootstrap).toContain('load_plugin_textdomain(');
    expect(pluginBootstrap).toContain(
      "require_once __DIR__ . '/inc/rest-shared.php';",
    );
    expect(pluginBootstrap).toContain(
      "require_once __DIR__ . '/inc/rest-public.php';",
    );
    expect(pluginBootstrap).toContain("return 'wpt_pcl_' . md5(");
    expect(pluginBootstrap).toContain('HOUR_IN_SECONDS');
    expect(pluginBootstrap).toContain('PUBLIC_WRITE_RATE_LIMIT_WINDOW');
    expect(pluginBootstrap).toContain('PUBLIC_WRITE_RATE_LIMIT_MAX');
    expect(pluginBootstrap).toContain(
      'demo_compound_public_handle_get_bootstrap',
    );
    expect(pluginBootstrap).toContain(
      'function demo_compound_public_has_rendered_block_instance',
    );
    expect(parentRender).toContain(
      "array_key_exists( 'resourceKey', $normalized ) ? (string) $normalized['resourceKey'] : 'primary'",
    );
    expect(pluginBootstrap).toContain('create-block/demo-compound-public');
    expect(pluginBootstrap).toContain(
      "Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, s-maxage=0'",
    );
    expect(pluginBootstrap).toContain("Pragma', 'no-cache'");
    expect(pluginBootstrap).toContain(
      "if ( '' !== $token && $expires_at > 0 && ! $is_expired ) {",
    );
    expect(pluginBootstrap).toContain(
      '! is_post_publicly_viewable( $post ) ||',
    );
    expect(restPublicHelper).toContain(
      'function demo_compound_public_verify_public_write_token',
    );
    expect(restPublicHelper).toContain(
      'function demo_compound_public_consume_public_write_request_id',
    );
    expect(restPublicHelper).toContain('SELECT GET_LOCK(%s, 5)');
    expect(restPublicHelper).toContain("return 'wpt_pwl_' . md5(");
    expect(parentRender).not.toContain('publicWriteToken');
    expect(parentRender).toContain(
      'demo_compound_public_record_rendered_block_instance',
    );
    expect(parentRender).toContain(
      'context.bootstrapReady || context.canWrite',
    );
    expect(parentRender).toContain(
      "$allowed_inner_html = wp_kses_allowed_html( 'post' );",
    );
    expect(parentRender).toContain(
      "$allowed_attributes['data-wp-interactive'] = true;",
    );
    expect(parentRender).toContain('wp_kses( $content, $allowed_inner_html )');
    expect(parentRender).toContain('role="status"');
    expect(parentRender).toContain('aria-live="polite"');
    expect(generatedApiTypes).toContain('publicWriteRequestId: string');
    expect(generatedApiTypes).not.toContain('{{#isPublicPersistencePolicy}}');
    expect(generatedTransport).toContain('resolveTransportCallOptions');
    expect(generatedTransport).not.toContain('includeRestNonce: true');
    expect(generatedTransport).toContain('includeRestNonce: false');
    expect(restPublicHelper).toContain('Customize the public write gate here');
    expect(readme).toContain(
      'per-request ids, and coarse rate limiting by default',
    );
  });

  test('compound scaffolds honor namespace, text-domain, and php-prefix overrides', async () => {
    const targetDir = path.join(tempRoot, 'demo-compound-identifiers');

    await scaffoldProject({
      projectDir: targetDir,
      templateId: 'compound',
      packageManager: 'npm',
      noInstall: true,
      answers: {
        author: 'Test Runner',
        description: 'Demo compound identifier overrides',
        namespace: 'experiments',
        phpPrefix: 'compound_panel_group',
        slug: 'demo-compound-identifiers',
        textDomain: 'demo-compound-text',
        title: 'Demo Compound Identifiers',
      },
    });

    const pluginBootstrap = fs.readFileSync(
      path.join(targetDir, 'demo-compound-identifiers.php'),
      'utf8',
    );
    const parentBlockJson = JSON.parse(
      fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-identifiers',
          'block.json',
        ),
        'utf8',
      ),
    );
    const childBlockJson = JSON.parse(
      fs.readFileSync(
        path.join(
          targetDir,
          'src',
          'blocks',
          'demo-compound-identifiers-item',
          'block.json',
        ),
        'utf8',
      ),
    );

    expect(parentBlockJson.name).toBe('experiments/demo-compound-identifiers');
    expect(parentBlockJson.textdomain).toBe('demo-compound-text');
    expect(childBlockJson.name).toBe(
      'experiments/demo-compound-identifiers-item',
    );
    expect(childBlockJson.textdomain).toBe('demo-compound-text');
    expect(pluginBootstrap).toContain('Text Domain:       demo-compound-text');
    expect(pluginBootstrap).toContain(
      'function compound_panel_group_register_blocks',
    );
  });
});
