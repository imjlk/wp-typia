import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  blockTypesPackageVersion,
  buildGeneratedProject,
  cleanupScaffoldTempRoot,
  createScaffoldTempRoot,
  normalizedBlockRuntimePackageVersion,
  runGeneratedScript,
  typecheckGeneratedProject,
  wpTypiaPackageManifest,
} from './helpers/scaffold-test-harness.js';
import { scaffoldProject } from '../src/runtime/index.js';
import { applyMigrationUiCapability } from '../src/runtime/migration-ui-capability.js';

const GENERATED_INTERACTIVITY_TYPECHECK_TIMEOUT_MS = 300_000;

describe('@wp-typia/project-tools scaffold core', () => {
  const tempRoot = createScaffoldTempRoot('wp-typia-scaffold-basic-');

  afterAll(() => {
    cleanupScaffoldTempRoot(tempRoot);
  });

  test(
    'scaffoldProject creates an npm-ready basic template',
    async () => {
      const targetDir = path.join(tempRoot, 'demo-npm');

      await scaffoldProject({
        projectDir: targetDir,
        templateId: 'basic',
        packageManager: 'npm',
        noInstall: true,
        answers: {
          author: 'Test Runner',
          description: 'Demo npm block',
          namespace: 'demo-space',
          slug: 'demo-npm',
          title: 'Demo Npm',
        },
      });

      runGeneratedScript(targetDir, 'scripts/sync-project.ts', ['--check']);

      const packageJsonPath = path.join(targetDir, 'package.json');
      const readmePath = path.join(targetDir, 'README.md');

      expect(fs.existsSync(packageJsonPath)).toBe(true);
      expect(fs.existsSync(readmePath)).toBe(true);

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const blockJson = JSON.parse(
        fs.readFileSync(path.join(targetDir, 'src', 'block.json'), 'utf8'),
      );
      const readme = fs.readFileSync(readmePath, 'utf8');
      const generatedEdit = fs.readFileSync(
        path.join(targetDir, 'src', 'edit.tsx'),
        'utf8',
      );
      const generatedHooks = fs.readFileSync(
        path.join(targetDir, 'src', 'hooks.ts'),
        'utf8',
      );
      const generatedIndex = fs.readFileSync(
        path.join(targetDir, 'src', 'index.tsx'),
        'utf8',
      );
      const generatedManifest = JSON.parse(
        fs.readFileSync(
          path.join(targetDir, 'src', 'typia.manifest.json'),
          'utf8',
        ),
      );
      const generatedManifestWrapper = fs.readFileSync(
        path.join(targetDir, 'src', 'manifest-document.ts'),
        'utf8',
      );
      const generatedManifestDefaultsWrapper = fs.readFileSync(
        path.join(targetDir, 'src', 'manifest-defaults-document.ts'),
        'utf8',
      );
      const generatedBlockMetadata = fs.readFileSync(
        path.join(targetDir, 'src', 'block-metadata.ts'),
        'utf8',
      );
      const generatedEditorStyle = fs.readFileSync(
        path.join(targetDir, 'src', 'editor.scss'),
        'utf8',
      );
      const generatedSave = fs.readFileSync(
        path.join(targetDir, 'src', 'save.tsx'),
        'utf8',
      );
      const generatedRenderPlaceholder = fs.readFileSync(
        path.join(targetDir, 'src', 'render.php'),
        'utf8',
      );
      const generatedStyle = fs.readFileSync(
        path.join(targetDir, 'src', 'style.scss'),
        'utf8',
      );
      const generatedTypes = fs.readFileSync(
        path.join(targetDir, 'src', 'types.ts'),
        'utf8',
      );
      const generatedValidators = fs.readFileSync(
        path.join(targetDir, 'src', 'validators.ts'),
        'utf8',
      );
      const generatedValidatorToolkit = fs.readFileSync(
        path.join(targetDir, 'src', 'validator-toolkit.ts'),
        'utf8',
      );
      const generatedPluginBootstrap = fs.readFileSync(
        path.join(targetDir, 'demo-npm.php'),
        'utf8',
      );
      const generatedWebpackConfig = fs.readFileSync(
        path.join(targetDir, 'webpack.config.js'),
        'utf8',
      );
      const generatedLintConfig = fs.readFileSync(
        path.join(targetDir, 'lint.config.ts'),
        'utf8',
      );

      expect(packageJson.name).toBe('demo-npm');
      expect(packageJson.packageManager).toBeUndefined();
      expect(packageJson.devDependencies['@wp-typia/block-runtime']).toBe(
        normalizedBlockRuntimePackageVersion,
      );
      expect(packageJson.devDependencies['@wp-typia/block-runtime']).not.toBe(
        '^0.0.0',
      );
      expect(packageJson.devDependencies['@wp-typia/block-types']).toBe(
        blockTypesPackageVersion,
      );
      expect(packageJson.devDependencies.prettier).toBe('3.8.2');
      expect(
        packageJson.devDependencies['@wp-typia/ttsc-lint-plugin-wp'],
      ).toBe('^0.1.1');
      expect(
        packageJson.devDependencies['@wp-typia/project-tools'],
      ).toBeUndefined();
      expect(packageJson.devDependencies['chokidar-cli']).toBe('^3.0.0');
      expect(packageJson.devDependencies.concurrently).toBe('^9.0.1');
      expect(packageJson.scripts.sync).toBe('ttsx scripts/sync-project.ts');
      expect(packageJson.scripts.build).toBe(
        'npm run sync -- --check && wp-scripts build --experimental-modules',
      );
      expect(packageJson.scripts.dev).toBe(
        'npm run sync && concurrently -k -n sync-types,editor -c yellow,blue "npm run watch:sync-types" "npm run start:editor"',
      );
      expect(packageJson.scripts['start:editor']).toBe(
        'wp-scripts start --experimental-modules',
      );
      expect(packageJson.scripts.start).toBe(
        'npm run sync && wp-scripts start --experimental-modules',
      );
      expect(packageJson.scripts.typecheck).toBe(
        'npm run sync -- --check && ttsc --noEmit',
      );
      expect(packageJson.scripts['watch:sync-types']).toBe(
        'chokidar "src/types.ts" --debounce 200 -c "npm run sync-types"',
      );
      expect(generatedLintConfig).toContain(
        "from '@wp-typia/ttsc-lint-plugin-wp'",
      );
      expect(generatedLintConfig).toContain('...configs.recommended');
      expect(generatedLintConfig).toContain(
        "allowedTextDomain: 'demo-npm'",
      );
      expect(blockJson.textdomain).toBe('demo-npm');
      expect(blockJson.version).toBe('0.1.0');
      expect(blockJson.category).toBe('text');
      expect(blockJson.icon).toBe('smiley');
      expect(blockJson.editorStyle).toBe('file:./index.css');
      expect(blockJson.render).toBeUndefined();
      expect(generatedManifest.manifestVersion).toBe(2);
      expect(generatedManifest.sourceType).toBe('DemoNpmAttributes');
      expect(generatedManifest.attributes.content.typia.defaultValue).toBe('');
      expect(
        generatedManifest.attributes.content.typia.constraints.minLength,
      ).toBe(null);
      expect(generatedManifest.attributes.alignment.wp.enum).toEqual([
        'left',
        'center',
        'right',
        'justify',
      ]);
      expect(generatedHooks).toContain('type TypiaValidationError');
      expect(generatedHooks).toContain('useTypiaValidation');
      expect(generatedEdit).toContain('RichText');
      expect(generatedEdit).toContain('TextControl');
      expect(generatedEdit).toContain("label={__('Content'");
      expect(generatedEdit).toContain("'Mirrors the main block content.'");
      expect(generatedEdit).toContain("placeholder={__('Add your content...'");
      expect(generatedEdit).toContain('@wp-typia/block-runtime/inspector');
      expect(generatedEdit).not.toContain(
        '@wp-typia/project-tools/schema-core',
      );
      expect(generatedEdit).toContain('InspectorFromManifest');
      expect(generatedEdit).toContain('useEditorFields');
      expect(generatedEdit).toContain('useTypedAttributeUpdater');
      expect(generatedSave).toContain('RichText.Content');
      expect(generatedSave).not.toContain('return null;');
      expect(generatedRenderPlaceholder).toContain(
        'Optional server render placeholder',
      );
      expect(generatedRenderPlaceholder).toContain(
        'Server render placeholder.',
      );
      expect(generatedEdit).toContain(
        "className: `wp-block-demo-space-demo-npm${isVisible ? '' : ' is-hidden'}`",
      );
      expect(generatedSave).toContain(
        "className: `wp-block-demo-space-demo-npm${isVisible ? '' : ' is-hidden'}`",
      );
      expect(generatedEdit).toContain(
        'className="wp-block-demo-space-demo-npm__content"',
      );
      expect(generatedSave).toContain(
        'className="wp-block-demo-space-demo-npm__content"',
      );
      expect(generatedEditorStyle).toContain('.wp-block-demo-space-demo-npm');
      expect(generatedStyle).toContain('.wp-block-demo-space-demo-npm');
      expect(generatedHooks).toContain('@wp-typia/block-runtime/validation');
      expect(generatedHooks).toContain('createUseTypiaValidationHook');
      expect(generatedBlockMetadata).toContain(
        'defineScaffoldBlockMetadata(rawMetadata)',
      );
      expect(generatedManifestWrapper).toContain(
        'defineManifestDocument(rawCurrentManifest)',
      );
      expect(generatedManifestDefaultsWrapper).toContain(
        'defineManifestDefaultsDocument(rawCurrentManifest)',
      );
      expect(generatedIndex).toContain('@wp-typia/block-runtime/blocks');
      expect(generatedIndex).toContain('buildScaffoldBlockRegistration');
      expect(generatedIndex).toContain(
        '@wp-typia/block-types/blocks/registration',
      );
      expect(generatedIndex).toContain(
        'registerScaffoldBlockType(registration.name, registration.settings);',
      );
      expect(generatedIndex).not.toContain('registerBlockType<');
      expect(generatedIndex).toContain('registerScaffoldBlockType');
      expect(generatedIndex).not.toContain('type ScaffoldBlockMetadata');
      expect(generatedIndex).toContain("import metadata from './block-metadata';");
      expect(generatedIndex).toContain('@wp-typia/block-types/blocks/supports');
      expect(generatedIndex).toContain("import './editor.scss';");
      expect(generatedIndex).toContain('} satisfies BlockSupports;');
      expect(generatedIndex).toContain('Typia-powered type-safe block');
      expect(generatedEdit).toContain(
        "import currentManifest from './manifest-document';",
      );
      expect(generatedTypes).not.toMatch(/[가-힣]/u);
      expect(generatedValidators).toContain("from './validator-toolkit'");
      expect(generatedValidators).toContain("import typia from 'typia';");
      expect(generatedValidators).toContain(
        "from './manifest-defaults-document'",
      );
      expect(generatedValidators).toContain(
        '@wp-typia/block-runtime/identifiers',
      );
      expect(generatedValidators).toContain('generateBlockId');
      expect(generatedValidators).toMatch(
        /typia\.createValidate<\s*DemoNpmAttributes\s*>\(\)/,
      );
      expect(generatedValidators).not.toContain(
        'createScaffoldValidatorToolkit',
      );
      expect(generatedValidators).not.toContain(
        'applyTemplateDefaultsFromManifest',
      );
      expect(generatedValidators).not.toContain('generateRuntimeId');
      expect(generatedValidatorToolkit).toContain(
        'createScaffoldValidatorToolkit',
      );
      expect(generatedValidatorToolkit).toContain(
        'parseManifestDefaultsDocument',
      );
      expect(generatedValidatorToolkit).not.toContain(
        'manifest as ManifestDefaultsDocument',
      );
      expect(generatedValidatorToolkit).not.toContain(
        "import typia from 'typia';",
      );
      expect(generatedValidatorToolkit).not.toContain('typia.createValidate');
      expect(generatedPluginBootstrap).toContain('Plugin Name:       Demo Npm');
      expect(generatedPluginBootstrap).toContain('Requires at least: 6.7');
      expect(generatedPluginBootstrap).toContain('Tested up to:      7.0');
      expect(generatedPluginBootstrap).toContain('Text Domain:       demo-npm');
      expect(generatedPluginBootstrap).toContain('load_plugin_textdomain(');
      expect(generatedPluginBootstrap).toContain(
        'register_block_type( $build_dir );',
      );
      expect(generatedWebpackConfig).toContain(
        '@wp-typia/block-runtime/blocks',
      );
      expect(generatedWebpackConfig).toContain('createTypiaWebpackConfig');
      expect(generatedEdit).not.toMatch(/[가-힣]/u);
      expect(generatedSave).not.toMatch(/[가-힣]/u);
      expect(generatedValidators).not.toMatch(/[가-힣]/u);
      expect(blockJson.example.attributes).toEqual({
        content: '',
        alignment: 'left',
        isVisible: true,
        className: '',
        id: '00000000-0000-4000-8000-000000000000',
        schemaVersion: 1,
      });
      expect(fs.existsSync(path.join(targetDir, '.wp-env.json'))).toBe(false);
      expect(fs.existsSync(path.join(targetDir, '.wp-env.test.json'))).toBe(
        false,
      );
      expect(readme).toContain('npm install --no-audit');
      expect(readme).toContain('Run `npm audit` separately');
      expect(readme).toContain('React peer dependency noise');
      expect(readme).toContain('npm run dev');
      expect(readme).toContain('npm run start');
      expect(readme).toContain('## Quick Start');
      expect(readme).toContain('- Family: basic');
      expect(readme).toContain('- Type: built-in block scaffold');
      expect(readme).toContain('## Build and Verify');
      expect(readme).toContain(
        `npx --yes wp-typia@${wpTypiaPackageManifest.version} doctor`,
      );
      expect(readme).toContain('## Advanced Sync');
      expect(readme).toContain('## Before First Commit');
      expect(readme).toContain('npm run sync');
      expect(readme).toContain('npm run sync-types');
      expect(readme).toContain('-- --fail-on-lossy');
      expect(readme).toContain('-- --strict --report json');
      expect(readme).not.toContain('npm run sync-rest');
      expect(readme).toContain(
        '`src/render.php` is only an opt-in server placeholder',
      );
      expect(readme).toContain(
        'keeps the editor and type-derived artifacts moving together during local development',
      );
      expect(readme).toContain('do not create migration history');
      expect(readme).toContain('git init');
      expect(readme).toContain('git add .');
      expect(readme).toContain('Initial scaffold');
      expect(readme).not.toContain('## PHP REST Extension Points');

      typecheckGeneratedProject(targetDir);
      runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts');
      const buildOutput = buildGeneratedProject(targetDir);
      expect(buildOutput).not.toContain('non-specified generic argument');
    },
    { timeout: 120_000 },
  );

  test(
    'scaffoldProject can target the legacy WordPress 6.9 plugin header',
    async () => {
      const targetDir = path.join(tempRoot, 'demo-wp69-target');

      await scaffoldProject({
        projectDir: targetDir,
        templateId: 'basic',
        packageManager: 'npm',
        noInstall: true,
        wpVersion: '6.9',
        answers: {
          author: 'Test Runner',
          description: 'Demo WordPress 6.9 target block',
          namespace: 'demo-space',
          slug: 'demo-wp69-target',
          title: 'Demo WP 6.9 Target',
        },
      });

      const generatedPluginBootstrap = fs.readFileSync(
        path.join(targetDir, 'demo-wp69-target.php'),
        'utf8',
      );

      expect(generatedPluginBootstrap).toContain('Requires at least: 6.7');
      expect(generatedPluginBootstrap).toContain('Tested up to:      6.9');
    },
  );

  test(
    'scaffoldProject rewrites forked repository placeholders in existing files when repositoryReference is overridden',
    async () => {
      const targetDir = path.join(tempRoot, 'demo-npm-fork-reference');
      const notesPath = path.join(targetDir, 'FORK_REFERENCE.md');

      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(
        notesPath,
        [
          'Docs: https://github.com/yourusername/wp-typia-boilerplate/issues',
          'CLI: yourusername/wp-typia',
        ].join('\n'),
        'utf8',
      );

      await scaffoldProject({
        projectDir: targetDir,
        templateId: 'basic',
        packageManager: 'npm',
        noInstall: true,
        allowExistingDir: true,
        repositoryReference: 'fork-owner/fork-typia',
        answers: {
          author: 'Test Runner',
          description: 'Demo npm fork reference block',
          namespace: 'demo-space',
          slug: 'demo-npm-fork-reference',
          title: 'Demo Npm Fork Reference',
        },
      });

      const notes = fs.readFileSync(notesPath, 'utf8');
      expect(notes).toContain(
        'Docs: https://github.com/fork-owner/fork-typia/issues',
      );
      expect(notes).toContain('CLI: fork-owner/fork-typia');
      expect(notes).not.toContain('yourusername/wp-typia');
    },
  );

  test(
    'scaffoldProject can opt into migration UI for built-in single-block templates',
    async () => {
      const targetDir = path.join(tempRoot, 'demo-migration-ui');

      await scaffoldProject({
        projectDir: targetDir,
        templateId: 'basic',
        packageManager: 'npm',
        noInstall: true,
        withMigrationUi: true,
        answers: {
          author: 'Test Runner',
          description: 'Demo migration UI block',
          namespace: 'demo-space',
          slug: 'demo-migration-ui',
          title: 'Demo Migration UI',
        },
      });

      const packageJson = JSON.parse(
        fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'),
      );
      const readme = fs.readFileSync(path.join(targetDir, 'README.md'), 'utf8');
      const generatedEdit = fs.readFileSync(
        path.join(targetDir, 'src', 'edit.tsx'),
        'utf8',
      );
      const generatedIndex = fs.readFileSync(
        path.join(targetDir, 'src', 'index.tsx'),
        'utf8',
      );
      const migrationConfig = fs.readFileSync(
        path.join(targetDir, 'src', 'migrations', 'config.ts'),
        'utf8',
      );
      const migrationIndex = fs.readFileSync(
        path.join(targetDir, 'src', 'migrations', 'index.ts'),
        'utf8',
      );

      expect(packageJson.dependencies['@wordpress/api-fetch']).toBe('^7.42.0');
      expect(
        packageJson.devDependencies['@wp-typia/project-tools'],
      ).toBeUndefined();
      expect(packageJson.scripts['migration:init']).toBe(
        `npx --yes wp-typia@${wpTypiaPackageManifest.version} migrate init --current-migration-version v1`,
      );
      expect(packageJson.scripts['migration:doctor']).toBe(
        `npx --yes wp-typia@${wpTypiaPackageManifest.version} migrate doctor --all`,
      );
      expect(readme).toContain('## Migration UI');
      expect(readme).toContain('initialized migration workspace at `v1`');
      expect(generatedEdit).toContain('MigrationDashboard');
      expect(generatedIndex).toContain(
        './migrations/generated/demo-migration-ui/deprecated',
      );
      expect(generatedIndex).toContain('deprecated,');
      expect(generatedIndex).not.toContain('as NonNullable<BlockConfiguration');
      expect(migrationConfig).toContain("key: 'demo-migration-ui'");
      expect(migrationConfig).toContain("blockJsonFile: 'src/block.json'");
      expect(migrationIndex).toContain(
        'migrated as unknown as Record<string, unknown>',
      );
      expect(
        fs.existsSync(
          path.join(targetDir, 'src', 'admin', 'migration-dashboard.tsx'),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(targetDir, 'src', 'migrations', 'generated', 'index.ts'),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(targetDir, 'typia-migration-registry.php')),
      ).toBe(true);

      typecheckGeneratedProject(targetDir);
    },
    { timeout: 30_000 },
  );

  test(
    'generated sync-types scripts support strict and JSON report modes',
    async () => {
      const targetDir = path.join(tempRoot, 'demo-sync-types-report');

      await scaffoldProject({
        projectDir: targetDir,
        templateId: 'basic',
        packageManager: 'npm',
        noInstall: true,
        answers: {
          author: 'Test Runner',
          description: 'Demo sync-types report block',
          namespace: 'create-block',
          slug: 'demo-sync-types-report',
          title: 'Demo Sync Types Report',
        },
      });

      const syncScriptPath = path.join(
        targetDir,
        'scripts',
        'sync-types-to-block-json.ts',
      );
      const syncScript = fs.readFileSync(syncScriptPath, 'utf8');
      const typesPath = path.join(targetDir, 'src', 'types.ts');

      expect(syncScript).toContain('runSyncBlockMetadata');
      expect(syncScript).toContain('--strict');
      expect(syncScript).toContain('--report');
      expect(syncScript).toContain('--fail-on-lossy');
      expect(syncScript).toContain('--check');
      expect(syncScript).toContain('Unknown sync-types flag');
      expect(syncScript).toContain('Generated attributes');

      fs.writeFileSync(
        typesPath,
        [
          'import { tags } from "typia";',
          '',
          'export interface DemoSyncTypesReportAttributes {',
          '  title: string & tags.Default<"Hello world">;',
          '  settings: {',
          '    slug: string & tags.MinLength<1>;',
          '  };',
          '  endpoint?: string & tags.Format<"hostname">;',
          '}',
          '',
        ].join('\n'),
      );

      const warningOutput = runGeneratedScript(
        targetDir,
        'scripts/sync-types-to-block-json.ts',
        ['--report', 'json'],
      );
      const warningReport = JSON.parse(warningOutput);

      expect(warningReport.status).toBe('warning');
      expect(warningReport.strict).toBe(false);
      expect(warningReport.failOnLossy).toBe(false);
      expect(warningReport.failOnPhpWarnings).toBe(false);
      expect(warningReport.lossyProjectionWarnings.length).toBeGreaterThan(0);
      expect(warningReport.phpGenerationWarnings).toContain(
        'endpoint: unsupported PHP validator format "hostname"',
      );

      let strictError: unknown;
      try {
        runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts', [
          '--strict',
          '--report',
          'json',
        ]);
      } catch (error) {
        strictError = error;
      }

      expect(strictError).toBeDefined();
      const strictStdout =
        (strictError as { stdout?: Buffer | string }).stdout ?? '';
      const strictReport = JSON.parse(
        typeof strictStdout === 'string'
          ? strictStdout
          : strictStdout.toString('utf8'),
      );

      expect(strictReport.status).toBe('error');
      expect(strictReport.failure).toBeNull();
      expect(strictReport.strict).toBe(true);
      expect(strictReport.failOnLossy).toBe(true);
      expect(strictReport.failOnPhpWarnings).toBe(true);
      expect(strictReport.lossyProjectionWarnings.length).toBeGreaterThan(0);
      expect(strictReport.phpGenerationWarnings.length).toBeGreaterThan(0);

      runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts');

      const checkOutput = runGeneratedScript(
        targetDir,
        'scripts/sync-types-to-block-json.ts',
        ['--check', '--report', 'json'],
      );
      const checkReport = JSON.parse(checkOutput);

      expect(checkReport.status).toBe('warning');
      expect(checkReport.failure).toBeNull();

      fs.writeFileSync(
        path.join(targetDir, 'src', 'block.json'),
        JSON.stringify(
          { attributes: {}, example: { attributes: {} } },
          null,
          2,
        ),
      );

      let staleError: unknown;
      try {
        runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts', [
          '--check',
          '--report',
          'json',
        ]);
      } catch (error) {
        staleError = error;
      }

      expect(staleError).toBeDefined();
      const staleStdout =
        (staleError as { stdout?: Buffer | string }).stdout ?? '';
      const staleReport = JSON.parse(
        typeof staleStdout === 'string'
          ? staleStdout
          : staleStdout.toString('utf8'),
      );

      expect(staleReport.status).toBe('error');
      expect(staleReport.failure?.code).toBe('stale-generated-artifact');
      expect(staleReport.failure?.message).toContain(
        path.join(targetDir, 'src', 'block.json'),
      );
    },
    { timeout: 30_000 },
  );

  test('migration UI capability patches legacy block.json metadata imports', async () => {
    const targetDir = path.join(tempRoot, 'demo-migration-ui-legacy-anchor');

    await scaffoldProject({
      projectDir: targetDir,
      templateId: 'basic',
      packageManager: 'npm',
      noInstall: true,
      answers: {
        author: 'Test Runner',
        description: 'Demo migration ui legacy anchor',
        namespace: 'create-block',
        slug: 'demo-migration-ui-legacy-anchor',
        title: 'Demo Migration UI Legacy Anchor',
      },
    });

    const indexPath = path.join(targetDir, 'src', 'index.tsx');
    fs.writeFileSync(
      indexPath,
      fs
        .readFileSync(indexPath, 'utf8')
        .replace("import metadata from './block-metadata';", "import metadata from './block.json';"),
      'utf8',
    );

    await applyMigrationUiCapability({
      packageManager: 'npm',
      projectDir: targetDir,
      templateId: 'basic',
      variables: {
        namespace: 'create-block',
        slugKebabCase: 'demo-migration-ui-legacy-anchor',
        textDomain: 'create-block',
      } as any,
    });

    const generatedIndex = fs.readFileSync(indexPath, 'utf8');
    expect(generatedIndex).toContain("import metadata from './block.json';");
    expect(generatedIndex).toContain(
      "import { deprecated } from './migrations/generated/demo-migration-ui-legacy-anchor/deprecated';",
    );
    expect(generatedIndex).toContain('deprecated,');
  });

  test(
    'scaffoldProject creates an interactivity template with typed validation wiring',
    async () => {
      const targetDir = path.join(tempRoot, 'demo-interactivity');

      await scaffoldProject({
        projectDir: targetDir,
        templateId: 'interactivity',
        packageManager: 'npm',
        noInstall: true,
        answers: {
          author: 'Test Runner',
          description: 'Demo interactivity block',
          namespace: 'demo-space',
          slug: 'demo-interactivity',
          title: 'Demo Interactivity',
        },
      });

      runGeneratedScript(targetDir, 'scripts/sync-project.ts', ['--check']);

      const generatedTypes = fs.readFileSync(
        path.join(targetDir, 'src', 'types.ts'),
        'utf8',
      );
      const generatedHooks = fs.readFileSync(
        path.join(targetDir, 'src', 'hooks.ts'),
        'utf8',
      );
      const generatedValidators = fs.readFileSync(
        path.join(targetDir, 'src', 'validators.ts'),
        'utf8',
      );
      const generatedEdit = fs.readFileSync(
        path.join(targetDir, 'src', 'edit.tsx'),
        'utf8',
      );
      const generatedInteractivity = fs.readFileSync(
        path.join(targetDir, 'src', 'interactivity.ts'),
        'utf8',
      );
      const generatedInteractivityStore = fs.readFileSync(
        path.join(targetDir, 'src', 'interactivity-store.ts'),
        'utf8',
      );
      const generatedManifest = JSON.parse(
        fs.readFileSync(
          path.join(targetDir, 'src', 'typia.manifest.json'),
          'utf8',
        ),
      );
      const generatedManifestWrapper = fs.readFileSync(
        path.join(targetDir, 'src', 'manifest-document.ts'),
        'utf8',
      );
      const generatedManifestDefaultsWrapper = fs.readFileSync(
        path.join(targetDir, 'src', 'manifest-defaults-document.ts'),
        'utf8',
      );
      const generatedBlockMetadata = fs.readFileSync(
        path.join(targetDir, 'src', 'block-metadata.ts'),
        'utf8',
      );
      const generatedSave = fs.readFileSync(
        path.join(targetDir, 'src', 'save.tsx'),
        'utf8',
      );
      const generatedStyle = fs.readFileSync(
        path.join(targetDir, 'src', 'style.scss'),
        'utf8',
      );
      const generatedEditorStyle = fs.readFileSync(
        path.join(targetDir, 'src', 'editor.scss'),
        'utf8',
      );
      const generatedIndex = fs.readFileSync(
        path.join(targetDir, 'src', 'index.tsx'),
        'utf8',
      );
      const generatedPluginBootstrap = fs.readFileSync(
        path.join(targetDir, 'demo-interactivity.php'),
        'utf8',
      );
      const generatedWebpackConfig = fs.readFileSync(
        path.join(targetDir, 'webpack.config.js'),
        'utf8',
      );
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'),
      );
      const blockJson = JSON.parse(
        fs.readFileSync(path.join(targetDir, 'src', 'block.json'), 'utf8'),
      );

      expect(packageJson.name).toBe('demo-interactivity');
      expect(packageJson.devDependencies.prettier).toBe('3.8.2');
      expect(packageJson.scripts.sync).toBe('ttsx scripts/sync-project.ts');
      expect(packageJson.scripts.dev).toBe(
        'npm run sync && concurrently -k -n sync-types,editor -c yellow,blue "npm run watch:sync-types" "npm run start:editor"',
      );
      expect(packageJson.scripts.build).toBe(
        'npm run sync -- --check && wp-scripts build --experimental-modules',
      );
      expect(packageJson.scripts.start).toBe(
        'npm run sync && wp-scripts start --experimental-modules',
      );
      expect(packageJson.scripts.typecheck).toBe(
        'npm run sync -- --check && ttsc --noEmit',
      );
      expect(packageJson.scripts['watch:sync-types']).toBe(
        'chokidar "src/types.ts" --debounce 200 -c "npm run sync-types"',
      );
      expect(blockJson.name).toBe('demo-space/demo-interactivity');
      expect(blockJson.textdomain).toBe('demo-interactivity');
      expect(blockJson.version).toBe('0.1.0');
      expect(blockJson.category).toBe('widgets');
      expect(blockJson.icon).toBe('smiley');
      expect(blockJson.editorStyle).toBe('file:./index.css');
      expect(blockJson.attributes.interactiveMode.enum).toEqual([
        'click',
        'hover',
      ]);
      expect(blockJson.attributes.autoPlayInterval).toBeUndefined();
      expect(blockJson.attributes.uniqueId).toBeUndefined();
      expect(generatedManifest.manifestVersion).toBe(2);
      expect(generatedManifest.sourceType).toBe('DemoInteractivityAttributes');
      expect(generatedManifest.attributes.interactiveMode.wp.enum).toEqual([
        'click',
        'hover',
      ]);
      expect(generatedManifest.attributes.autoPlayInterval).toBeUndefined();
      expect(generatedManifest.attributes.uniqueId).toBeUndefined();
      expect(
        generatedManifest.attributes.clickCount.typia.constraints.typeTag,
      ).toBe('uint32');
      expect(generatedTypes).toContain('ValidationResult');
      expect(generatedTypes).toContain('export interface DemoInteractivityState');
      expect(generatedHooks).toContain('useTypiaValidation');
      expect(generatedHooks).toContain('createUseTypiaValidationHook');
      expect(generatedValidators).toContain("from './validator-toolkit'");
      expect(generatedValidators).not.toContain(
        '@wp-typia/block-runtime/identifiers',
      );
      expect(generatedValidators).not.toContain('generateScopedClientId');
      expect(generatedValidators).not.toContain(
        'createScaffoldValidatorToolkit',
      );
      expect(generatedValidators).not.toContain('generateUniqueId');
      expect(generatedEdit).toContain('@wp-typia/block-runtime/inspector');
      expect(generatedEdit).toContain(
        "import type { BlockEditProps } from '@wp-typia/block-types/blocks/registration';",
      );
      expect(generatedEdit).toContain(
        "import { demoInteractivityStore } from './interactivity-store';",
      );
      expect(generatedEdit).toContain(
        'type EditProps = BlockEditProps<DemoInteractivityAttributes>;',
      );
      expect(generatedEdit).toContain(
        'export default function Edit({',
      );
      expect(generatedEdit).not.toContain(
        '@wp-typia/project-tools/schema-core',
      );
      expect(generatedEdit).toContain('InspectorFromManifest');
      expect(generatedEdit).toContain(
        "import currentManifest from './manifest-document';",
      );
      expect(generatedEdit).not.toContain(
        'currentManifest as ManifestDocument',
      );
      expect(generatedEdit).toContain('useEditorFields');
      expect(generatedEdit).toContain('useTypiaValidation');
      expect(generatedEdit).toContain('useTypedAttributeUpdater');
      expect(generatedEdit).toContain('aria-pressed={isPreviewing}');
      expect(generatedEdit).not.toContain('TextControl');
      expect(generatedEdit).not.toContain('Unique ID');
      expect(generatedEdit).not.toContain('Auto Play Interval');
      expect(generatedEdit).not.toContain('autoPlayInterval');
      expect(generatedEdit).not.toContain('lastInteraction');
      expect(generatedEdit).not.toContain("interactiveMode === 'auto'");
      expect(generatedEdit).toContain(
        'className: `wp-block-demo-space-demo-interactivity wp-block-demo-space-demo-interactivity--${interactiveMode}`',
      );
      expect(generatedEdit).toContain(
        'wp-block-demo-space-demo-interactivity__content',
      );
      expect(generatedEdit).toContain(
        'const isAnimatingDirective =',
      );
      expect(generatedEdit).toContain(
        "demoInteractivityStore.directive.state('isAnimating');",
      );
      expect(generatedEdit).not.toContain('data-wp-class="is-active"');
      expect(generatedEdit).toContain(
        "const clicksDirective = demoInteractivityStore.directive.state('clicks');",
      );
      expect(generatedEdit).toContain(
        'data-wp-text={clicksDirective}',
      );
      expect(generatedEdit).toContain(
        'data-wp-class--is-active={isAnimatingDirective}',
      );
      expect(generatedEdit).toContain(
        'data-wp-on--click={',
      );
      expect(generatedInteractivityStore).toContain(
        "type InteractivityCallable =\n  | ((...args: unknown[]) => unknown)\n  | ReturnType<typeof import('@wordpress/interactivity').withSyncEvent>;",
      );
      expect(generatedInteractivityStore).toContain(
        'type InteractivityActionHandler = InteractivityCallable;',
      );
      expect(generatedInteractivityStore).not.toContain('CallableFunction');
      expect(generatedValidators).toContain("from './validator-toolkit'");
      expect(generatedBlockMetadata).toContain(
        'defineScaffoldBlockMetadata(rawMetadata)',
      );
      expect(generatedManifestWrapper).toContain(
        'defineManifestDocument(rawCurrentManifest)',
      );
      expect(generatedManifestDefaultsWrapper).toContain(
        'defineManifestDefaultsDocument(rawCurrentManifest)',
      );
      expect(generatedIndex).toContain('@wp-typia/block-runtime/blocks');
      expect(generatedIndex).toContain('buildScaffoldBlockRegistration');
      expect(generatedIndex).not.toContain('type ScaffoldBlockMetadata');
      expect(generatedIndex).toContain("import metadata from './block-metadata';");
      expect(generatedIndex).toContain('@wp-typia/block-types/blocks/supports');
      expect(generatedIndex).toContain('} satisfies BlockSupports;');
      expect(generatedPluginBootstrap).toContain(
        'Plugin Name:       Demo Interactivity',
      );
      expect(generatedPluginBootstrap).toContain(
        'Text Domain:       demo-interactivity',
      );
      expect(generatedPluginBootstrap).toContain('load_plugin_textdomain(');
      expect(generatedPluginBootstrap).toContain(
        'register_block_type( $build_dir );',
      );
      expect(generatedWebpackConfig).toContain('createTypiaWebpackConfig');
      expect(generatedInteractivity).not.toContain('onInit:');
      expect(generatedInteractivity).not.toContain('onInteraction:');
      expect(generatedInteractivity).not.toContain('onDestroy:');
      expect(generatedInteractivity).toContain(
        "import {\n  demoInteractivityStore,\n  type DemoInteractivityStoreActions,\n} from './interactivity-store';",
      );
      expect(generatedInteractivity).toContain(
        "import type { DemoInteractivityContext, DemoInteractivityState } from './types';",
      );
      expect(generatedInteractivity).toContain(
        'return getContext<DemoInteractivityContext>();',
      );
      expect(generatedInteractivity).toContain('const actions: DemoInteractivityStoreActions = {');
      expect(generatedInteractivity).toContain('const state = {');
      expect(generatedInteractivity).toContain('} satisfies DemoInteractivityState;');
      expect(generatedInteractivity).toContain('store(demoInteractivityStore.namespace, {');
      expect(generatedInteractivity).toContain('callbacks: demoInteractivityStore.callbacks,');
      expect(generatedInteractivity).toContain('withSyncEvent');
      expect(generatedInteractivity).toContain('reset: withSyncEvent');
      expect(generatedInteractivity).toContain('event.stopPropagation();');
      expect(generatedInteractivity).toContain(
        'if (context.maxClicks > 0 && context.clicks >= context.maxClicks)',
      );
      expect(generatedInteractivity).toContain(
        'const previousClicks = context.clicks;',
      );
      expect(generatedInteractivity).toContain('const clampedClicks =');
      expect(generatedInteractivity).not.toContain('declare global');
      expect(generatedInteractivity).toContain('get clampedClicks()');
      expect(generatedInteractivity).not.toContain('animationClass');
      expect(generatedInteractivity).not.toContain('toggleVisibility');
      expect(generatedInteractivity).not.toContain('toggleAutoPlay');
      expect(generatedInteractivity).not.toContain('lastInteraction');
      expect(generatedInteractivity).not.toContain('autoPlayTimer');
      expect(generatedInteractivity).not.toContain('context.interactiveMode');
      expect(generatedTypes).toContain("animation: 'none' | 'bounce'");
      expect(generatedTypes).toContain(
        "interactiveMode?: ('click' | 'hover') & tags.Default<'click'>;",
      );
      expect(generatedTypes).not.toContain('autoPlayInterval');
      expect(generatedTypes).not.toContain('uniqueId');
      expect(generatedTypes).not.toContain('lastInteraction');
      expect(generatedTypes).not.toContain('autoPlayTimer');
      expect(generatedSave).toContain(
        'const clickCount = attributes.clickCount ?? 0;',
      );
      expect(generatedSave).toContain(
        'const maxClicks = attributes.maxClicks ?? 0;',
      );
      expect(generatedSave).toContain(
        "const interactiveMode = attributes.interactiveMode ?? 'click';",
      );
      expect(generatedSave).not.toContain('autoPlayInterval');
      expect(generatedSave).not.toContain('lastInteraction');
      expect(generatedSave).toContain("import { __ } from '@wordpress/i18n';");
      expect(generatedSave).toContain(
        "import { demoInteractivityStore } from './interactivity-store';",
      );
      expect(generatedSave).toContain("__('Clicks:', 'demo-interactivity')");
      expect(generatedSave).toContain(
        "aria-label={__('Click progress', 'demo-interactivity')}",
      );
      expect(generatedSave).toContain(
        "aria-label={__('Reset counter', 'demo-interactivity')}",
      );
      expect(generatedSave).toContain(
        "{__('🎉 Complete!', 'demo-interactivity')}",
      );
      expect(generatedSave).toContain('className="screen-reader-text"');
      expect(generatedSave).toContain('role="progressbar"');
      expect(generatedSave).toContain(
        'const clampedClicksDirective =',
      );
      expect(generatedSave).toContain(
        "demoInteractivityStore.directive.state('clampedClicks');",
      );
      expect(generatedSave).toContain('role="status"');
      expect(generatedSave).toContain('aria-live="polite"');
      expect(generatedSave).toContain('aria-hidden="true"');
      expect(generatedSave).toContain(
        'className: `wp-block-demo-space-demo-interactivity wp-block-demo-space-demo-interactivity--${interactiveMode}`',
      );
      expect(generatedSave).toContain(
        'wp-block-demo-space-demo-interactivity__content',
      );
      expect(generatedSave).toContain(
        'const isAnimatingDirective =',
      );
      expect(generatedSave).toContain(
        "demoInteractivityStore.directive.state('isAnimating');",
      );
      expect(generatedSave).not.toContain('data-wp-class="is-active"');
      expect(generatedSave).toContain(
        'const clickActionDirective =',
      );
      expect(generatedSave).toContain(
        "demoInteractivityStore.directive.action('handleClick');",
      );
      expect(generatedSave).toContain(
        'const visibilityHiddenDirective =',
      );
      expect(generatedSave).toContain(
        'demoInteractivityStore.directive.negate(',
      );
      expect(generatedSave).toContain(
        'data-wp-bind--aria-valuenow={clampedClicksDirective}',
      );
      expect(generatedSave).toContain(
        'data-wp-class--is-active={isAnimatingDirective}',
      );
      expect(generatedSave).toContain(
        'data-wp-on--click={clickActionDirective}',
      );
      expect(generatedSave).toContain(
        'data-wp-bind--hidden={visibilityHiddenDirective}',
      );
      expect(generatedSave).not.toContain(
        'data-wp-text="state.clicks"\n              aria-live=',
      );
      expect(generatedSave).not.toContain('data-clicks');
      expect(generatedSave).not.toContain('data-is-animating');
      expect(generatedSave).not.toContain('data-is-visible');
      expect(generatedSave).not.toContain('data-unique-id');
      expect(generatedStyle).toContain(
        '.wp-block-demo-space-demo-interactivity',
      );
      expect(generatedEditorStyle).toContain(
        '.wp-block-demo-space-demo-interactivity',
      );
      expect(generatedInteractivityStore).toContain('export function defineInteractivityStore<');
      expect(generatedInteractivityStore).toContain('action<Key extends InteractivityMethodKey<Actions>>');
      expect(generatedInteractivityStore).toContain('callback<Key extends InteractivityMethodKey<Callbacks>>');
      expect(generatedInteractivityStore).toContain('negate<Path extends string>(');
      expect(generatedInteractivityStore).toContain('export interface DemoInteractivityStoreActions');
      expect(generatedInteractivityStore).toContain('export interface DemoInteractivityStoreCallbacks {}');
      expect(generatedInteractivityStore).toContain(
        'export const demoInteractivityStore = defineInteractivityStore({',
      );
      fs.writeFileSync(
        path.join(targetDir, 'src', 'interactivity-directive-typing.ts'),
        `import {
  defineInteractivityStore,
  demoInteractivityStore,
} from './interactivity-store';
import type { DemoInteractivityContext, DemoInteractivityState } from './types';

void demoInteractivityStore.directive.action('handleClick');
void demoInteractivityStore.directive.state('clicks');
void demoInteractivityStore.directive.context('clicks');
void demoInteractivityStore.directive.negate(
  demoInteractivityStore.directive.state('isVisible'),
);
void demoInteractivityStore.createContext({
  clicks: 0,
  isAnimating: false,
  isVisible: true,
  animation: 'none',
  maxClicks: 1,
});

const customStore = defineInteractivityStore({
  namespace: 'demo-space/demo-interactivity',
  state: {} as DemoInteractivityState,
  context: {} as DemoInteractivityContext,
  actions: {
    handleClick() {},
  },
  callbacks: {
    init() {},
  },
});

void customStore.directive.callback('init');

// @ts-expect-error invalid generated action key
demoInteractivityStore.directive.action('missingAction');
// @ts-expect-error invalid generated state key
demoInteractivityStore.directive.state('missingState');
// @ts-expect-error invalid generated context key
demoInteractivityStore.directive.context('missingContext');
// @ts-expect-error missing required context field
demoInteractivityStore.createContext({
  clicks: 0,
  isAnimating: false,
  isVisible: true,
  animation: 'none',
});
`,
      );
      runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts');
      runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts', [
        '--check',
      ]);
      typecheckGeneratedProject(targetDir);
    },
    { timeout: GENERATED_INTERACTIVITY_TYPECHECK_TIMEOUT_MS },
  );

  test('scaffoldProject supports the optional local wp-env preset without adding test files', async () => {
    const targetDir = path.join(tempRoot, 'demo-local-wp-env');

    await scaffoldProject({
      projectDir: targetDir,
      templateId: 'basic',
      packageManager: 'npm',
      noInstall: true,
      withWpEnv: true,
      answers: {
        author: 'Test Runner',
        description: 'Demo local wp-env preset',
        namespace: 'create-block',
        slug: 'demo-local-wp-env',
        title: 'Demo Local Wp Env',
      },
    });

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'),
    );
    const readme = fs.readFileSync(path.join(targetDir, 'README.md'), 'utf8');
    const wpEnvConfig = JSON.parse(
      fs.readFileSync(path.join(targetDir, '.wp-env.json'), 'utf8'),
    );
    const gitignore = fs.readFileSync(
      path.join(targetDir, '.gitignore'),
      'utf8',
    );

    expect(packageJson.devDependencies['@wordpress/env']).toBe('^11.2.0');
    expect(packageJson.scripts['wp-env:start']).toBe('wp-env start');
    expect(packageJson.scripts['wp-env:stop']).toBe('wp-env stop');
    expect(packageJson.scripts['wp-env:reset']).toBe(
      'wp-env destroy all && wp-env start',
    );
    expect(fs.existsSync(path.join(targetDir, '.wp-env.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, '.wp-env.test.json'))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(targetDir, 'playwright.config.ts'))).toBe(
      false,
    );
    expect(wpEnvConfig.plugins).toEqual(['.']);
    expect(gitignore).not.toContain('playwright-report/');
    expect(gitignore).not.toContain('test-results/');
    expect(readme).toContain('## Local WordPress');
    expect(readme).not.toContain('## Local Test Preset');
  });

  test('scaffoldProject supports the optional test preset without adding the normal wp-env preset', async () => {
    const targetDir = path.join(tempRoot, 'demo-test-preset');

    await scaffoldProject({
      projectDir: targetDir,
      templateId: 'basic',
      packageManager: 'npm',
      noInstall: true,
      withTestPreset: true,
      answers: {
        author: 'Test Runner',
        description: 'Demo test preset',
        namespace: 'create-block',
        slug: 'demo-test-preset',
        title: 'Demo Test Preset',
      },
    });

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'),
    );
    const readme = fs.readFileSync(path.join(targetDir, 'README.md'), 'utf8');
    const gitignore = fs.readFileSync(
      path.join(targetDir, '.gitignore'),
      'utf8',
    );
    const wpEnvTestConfig = JSON.parse(
      fs.readFileSync(path.join(targetDir, '.wp-env.test.json'), 'utf8'),
    );

    expect(packageJson.devDependencies['@wordpress/env']).toBe('^11.2.0');
    expect(packageJson.devDependencies['@playwright/test']).toBe('^1.54.2');
    expect(packageJson.scripts['wp-env:start:test']).toBe(
      'wp-env start --config=.wp-env.test.json',
    );
    expect(packageJson.scripts['wp-env:wait:test']).toBe(
      'node scripts/wait-for-wp-env.mjs http://localhost:8889 180000 .wp-env.test.json',
    );
    expect(packageJson.scripts['test:e2e']).toBe(
      'npm run wp-env:start:test && npm run wp-env:wait:test && playwright test',
    );
    expect(fs.existsSync(path.join(targetDir, '.wp-env.json'))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, '.wp-env.test.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'playwright.config.ts'))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(targetDir, 'tests', 'e2e', 'smoke.spec.ts')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(targetDir, 'scripts', 'wait-for-wp-env.mjs')),
    ).toBe(true);
    expect(wpEnvTestConfig.plugins).toEqual(['.']);
    expect(gitignore).toContain('playwright-report/');
    expect(gitignore).toContain('test-results/');
    expect(readme).toContain('## Local Test Preset');
    expect(readme).not.toContain('## Local WordPress');
  });
});
