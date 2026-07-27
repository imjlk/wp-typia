import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildScaffoldBlockRegistration,
  createTypiaWebpackConfig,
  parseScaffoldBlockMetadata,
} from '../../packages/wp-typia-block-runtime/src/blocks';
import {
  buildScaffoldBlockRegistration as buildScaffoldBlockRegistrationFromRegistrationModule,
  parseScaffoldBlockMetadata as parseScaffoldBlockMetadataFromRegistrationModule,
} from '../../packages/wp-typia-block-runtime/src/blocks-registration';
import { createTypiaWebpackConfig as createTypiaWebpackConfigFromWebpackModule } from '../../packages/wp-typia-block-runtime/src/blocks-webpack';
import { createTempDir, writeTextFile } from '../helpers/file-fixtures';

class FakeRawSource {
  constructor(private readonly value: unknown) {}

  source() {
    return this.value;
  }
}

function toAssetSource(value: unknown): { source(): unknown } {
  return value &&
    typeof value === 'object' &&
    value !== null &&
    'source' in value &&
    typeof (value as { source?: unknown }).source === 'function'
    ? (value as { source(): unknown })
    : new FakeRawSource(value);
}

function assetToString(value: unknown): string {
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
}

function createWebpackFsAdapter() {
  return {
    existsSync(targetPath: string) {
      return fs.existsSync(targetPath);
    },
    readFileSync(targetPath: string, encoding?: string) {
      return encoding
        ? fs.readFileSync(targetPath, encoding as BufferEncoding)
        : fs.readFileSync(targetPath);
    },
    writeFileSync(targetPath: string, data: string) {
      fs.writeFileSync(targetPath, data);
    },
  };
}

function writeMockPackage(
  projectRoot: string,
  packageName: string,
  version: string,
) {
  const packageDir = path.join(
    projectRoot,
    'node_modules',
    ...packageName.split('/'),
  );
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({ name: packageName, version }, null, 2),
    'utf8',
  );
}

function createSupportedWebpackProjectRoot() {
  const projectRoot = createTempDir('wp-typia-webpack-project-');
  writeTextFile(
    path.join(projectRoot, 'package.json'),
    JSON.stringify({ name: 'webpack-project', private: true }, null, 2),
  );
  writeMockPackage(projectRoot, 'typia', '13.2.0');
  writeMockPackage(projectRoot, 'ttsc', '0.23.0');
  writeMockPackage(projectRoot, 'typescript', '7.0.2');
  writeMockPackage(projectRoot, '@ttsc/unplugin', '0.23.0');
  writeMockPackage(projectRoot, '@wordpress/scripts', '30.23.0');
  writeMockPackage(projectRoot, 'webpack', '5.106.0');

  return projectRoot;
}

function createFakeCompilation(
  initialAssets: Record<string, unknown> = {},
  outputPath?: string,
) {
  const assets = new Map<string, { source(): unknown }>(
    Object.entries(initialAssets).map(([name, value]) => [
      name,
      toAssetSource(value),
    ]),
  );
  let processAssetsCallback: (() => void) | undefined;

  return {
    getAsset(name: string) {
      return assets.has(name)
        ? {
            name,
            source: assets.get(name)!,
          }
        : undefined;
    },
    getAssets() {
      return Array.from(assets.entries()).map(([name, source]) => ({
        name,
        source,
      }));
    },
    emitAsset(name: string, source: unknown) {
      assets.set(name, toAssetSource(source));
    },
    hooks: {
      processAssets: {
        tap(_options: { name: string; stage: number }, callback: () => void) {
          processAssetsCallback = callback;
        },
      },
    },
    outputOptions: {
      path: outputPath,
    },
    readAsset(name: string) {
      return assets.get(name)?.source();
    },
    runProcessAssets() {
      processAssetsCallback?.();
    },
    updateAsset(name: string, source: unknown) {
      assets.set(name, toAssetSource(source));
    },
  };
}

function createFakeCompiler(
  compilation: ReturnType<typeof createFakeCompilation>,
) {
  let thisCompilationCallback:
    | ((compilationLike: ReturnType<typeof createFakeCompilation>) => void)
    | undefined;
  let afterEmitCallback:
    | ((compilationLike: ReturnType<typeof createFakeCompilation>) => void)
    | undefined;

  return {
    hooks: {
      afterEmit: {
        tap(
          _name: string,
          callback: (
            compilationLike: ReturnType<typeof createFakeCompilation>,
          ) => void,
        ) {
          afterEmitCallback = callback;
        },
      },
      thisCompilation: {
        tap(
          _name: string,
          callback: (
            compilationLike: ReturnType<typeof createFakeCompilation>,
          ) => void,
        ) {
          thisCompilationCallback = callback;
        },
      },
    },
    runLifecycle() {
      thisCompilationCallback?.(compilation);
      compilation.runProcessAssets();
      afterEmitCallback?.(compilation);
    },
    webpack: {
      Compilation: {
        PROCESS_ASSETS_STAGE_ADDITIONS: 1,
      },
      sources: {
        RawSource: FakeRawSource,
      },
    },
  };
}

describe('block runtime helpers', () => {
  test('blocks facade re-exports focused registration and webpack helpers', () => {
    expect(buildScaffoldBlockRegistration).toBe(
      buildScaffoldBlockRegistrationFromRegistrationModule,
    );
    expect(parseScaffoldBlockMetadata).toBe(
      parseScaffoldBlockMetadataFromRegistrationModule,
    );
    expect(createTypiaWebpackConfig).toBe(
      createTypiaWebpackConfigFromWebpackModule,
    );
  });

  test('buildScaffoldBlockRegistration merges metadata and preserves override inference', () => {
    const registration = buildScaffoldBlockRegistration(
      {
        category: 'widgets',
        name: 'demo/block',
        supports: {
          align: true,
          html: false,
        },
        title: 'Demo Block',
      },
      {
        edit: 'edit-component',
        supports: {
          html: true as const,
        },
      },
    );

    const blockName: string = registration.name;
    const blockCategory: string | undefined = registration.settings.category;
    const htmlSupport: true = registration.settings.supports.html;
    const editComponent: string = registration.settings.edit;

    void blockName;
    void blockCategory;
    void htmlSupport;
    void editComponent;

    expect(registration).toEqual({
      name: 'demo/block',
      settings: {
        category: 'widgets',
        edit: 'edit-component',
        supports: {
          html: true,
        },
        title: 'Demo Block',
      },
    });
  });

  test('buildScaffoldBlockRegistration rejects missing or empty block names', () => {
    expect(() =>
      buildScaffoldBlockRegistration({ name: '' } as never, {}),
    ).toThrow('Scaffold block metadata must include a string name.');
    expect(() => buildScaffoldBlockRegistration({} as never, {})).toThrow(
      'Scaffold block metadata must include a string name.',
    );
  });

  test('parseScaffoldBlockMetadata centralizes scaffold metadata narrowing without caller casts', () => {
    const parsed = parseScaffoldBlockMetadata({
      attributes: {
        content: { default: 'demo', type: 'string' },
      },
      category: 'widgets',
      name: 'demo/block',
      title: 'Demo Block',
    });

    expect(parsed.name).toBe('demo/block');
    expect(parsed.attributes.content.type).toBe('string');
  });

  test('createTypiaWebpackConfig merges editor and module entries and preserves plugin ordering', async () => {
    const existingPlugin = { name: 'existing-plugin' };
    const projectRoot = createSupportedWebpackProjectRoot();
    const config = await createTypiaWebpackConfig({
      defaultConfig: async () => [
        {
          entry: './index.js',
          plugins: [existingPlugin],
        },
        {
          entry: async () => ['./view.js'],
          output: {
            module: true,
          },
        },
      ],
      fs: createWebpackFsAdapter(),
      getArtifactEntries: () => [],
      getEditorEntries: () => ({
        editor: './editor.js',
      }),
      getOptionalModuleEntries: () => ({
        interactive: './interactive.js',
      }),
      importTypiaWebpackPlugin: async () => ({
        default: () => ({ name: 'typia-plugin' }),
      }),
      path,
      projectRoot,
    });

    expect(Array.isArray(config)).toBe(true);

    const [editorConfig, moduleConfig] = config as Array<{
      entry: () => Promise<Record<string, unknown>>;
      plugins: unknown[];
    }>;

    expect(await editorConfig.entry()).toEqual({
      editor: './editor.js',
      main: './index.js',
    });
    expect(await moduleConfig.entry()).toEqual({
      interactive: './interactive.js',
      main: ['./view.js'],
    });
    expect(editorConfig.plugins[0]).toEqual({ name: 'typia-plugin' });
    expect(editorConfig.plugins[1]).toBe(existingPlugin);
    expect(
      (editorConfig.plugins[2] as { constructor: { name: string } }).constructor
        .name,
    ).toBe('TypiaArtifactAssetPlugin');
  });

  test('createTypiaWebpackConfig respects replace modes for editor and module entries', async () => {
    const projectRoot = createSupportedWebpackProjectRoot();
    const config = await createTypiaWebpackConfig({
      defaultConfig: [
        {
          entry: {
            index: './index.js',
          },
        },
        {
          entry: {
            view: './view.js',
          },
          output: {
            module: true,
          },
        },
      ],
      fs: createWebpackFsAdapter(),
      getArtifactEntries: () => [],
      getEditorEntries: () => ({
        editor: './editor.js',
      }),
      getOptionalModuleEntries: () => ({
        interactive: './interactive.js',
      }),
      importTypiaWebpackPlugin: async () => ({
        default: () => ({ name: 'typia-plugin' }),
      }),
      moduleEntriesMode: 'replace',
      nonModuleEntriesMode: 'replace',
      path,
      projectRoot,
    });

    const [editorConfig, moduleConfig] = config as Array<{
      entry: () => Promise<Record<string, string>>;
    }>;

    expect(await editorConfig.entry()).toEqual({
      editor: './editor.js',
    });
    expect(await moduleConfig.entry()).toEqual({
      interactive: './interactive.js',
    });
  });

  test('createTypiaWebpackConfig copies missing artifacts and normalizes script-module assets', async () => {
    const outputDir = createTempDir('wp-typia-webpack-output-');
    const projectRoot = createSupportedWebpackProjectRoot();
    const artifactPath = path.join(outputDir, 'typia.manifest.json');
    const emittedAssetPath = path.join(outputDir, 'view.asset.php');
    const rawAssetSource =
      "<?php return array( 'dependencies' => array( 'wp-i18n' ), 'version' => '1' );";

    writeTextFile(artifactPath, '{"manifestVersion":2}');
    writeTextFile(emittedAssetPath, rawAssetSource);

    const config = await createTypiaWebpackConfig({
      defaultConfig: {
        entry: {},
      },
      fs: createWebpackFsAdapter(),
      getArtifactEntries: () => [
        {
          inputPath: artifactPath,
          outputPath: 'typia.manifest.json',
        },
      ],
      importTypiaWebpackPlugin: async () => ({
        default: () => ({ name: 'typia-plugin' }),
      }),
      isScriptModuleAsset: (assetName) => assetName === 'view.asset.php',
      path,
      projectRoot,
    });
    const plugin = (config as { plugins: unknown[] }).plugins.find(
      (candidate) =>
        (candidate as { constructor?: { name?: string } })?.constructor
          ?.name === 'TypiaArtifactAssetPlugin',
    ) as
      | { apply(compiler: ReturnType<typeof createFakeCompiler>): void }
      | undefined;
    const compilation = createFakeCompilation(
      {
        'style.css': 'body{color:red;}',
        'view.asset.php': rawAssetSource,
      },
      outputDir,
    );
    const compiler = createFakeCompiler(compilation);

    expect(plugin).toBeDefined();
    plugin!.apply(compiler);
    compiler.runLifecycle();

    expect(assetToString(compilation.readAsset('typia.manifest.json'))).toBe(
      '{"manifestVersion":2}',
    );
    expect(assetToString(compilation.readAsset('view.asset.php'))).toContain(
      "'dependencies' => array()",
    );
    expect(assetToString(compilation.readAsset('style.css'))).toBe(
      'body{color:red;}',
    );
    expect(fs.readFileSync(emittedAssetPath, 'utf8')).toContain(
      "'dependencies' => array()",
    );
  });

  test('createTypiaWebpackConfig skips afterEmit writes outside the output directory', async () => {
    const outputDir = createTempDir('wp-typia-webpack-traversal-');
    const projectRoot = createSupportedWebpackProjectRoot();
    const outsideAssetPath = path.resolve(outputDir, '..', 'view.asset.php');
    const rawAssetSource =
      "<?php return array( 'dependencies' => array( 'wp-i18n' ), 'version' => '1' );";

    writeTextFile(outsideAssetPath, rawAssetSource);

    const config = await createTypiaWebpackConfig({
      defaultConfig: {
        entry: {},
      },
      fs: createWebpackFsAdapter(),
      getArtifactEntries: () => [],
      importTypiaWebpackPlugin: async () => ({
        default: () => ({ name: 'typia-plugin' }),
      }),
      isScriptModuleAsset: (assetName) => assetName.endsWith('view.asset.php'),
      path,
      projectRoot,
    });
    const plugin = (config as { plugins: unknown[] }).plugins.find(
      (candidate) =>
        (candidate as { constructor?: { name?: string } })?.constructor
          ?.name === 'TypiaArtifactAssetPlugin',
    ) as
      | { apply(compiler: ReturnType<typeof createFakeCompiler>): void }
      | undefined;
    const compilation = createFakeCompilation(
      {
        '../view.asset.php': rawAssetSource,
      },
      outputDir,
    );
    const compiler = createFakeCompiler(compilation);

    expect(plugin).toBeDefined();
    plugin!.apply(compiler);
    compiler.runLifecycle();

    expect(assetToString(compilation.readAsset('../view.asset.php'))).toContain(
      "'dependencies' => array()",
    );
    expect(fs.readFileSync(outsideAssetPath, 'utf8')).toBe(rawAssetSource);
  });
});
