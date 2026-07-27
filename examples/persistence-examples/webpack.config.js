const fs = require('fs');
const path = require('path');
const defaultConfig = require('@wordpress/scripts/config/webpack.config');

const STATIC_METADATA_FILENAMES = new Set([
  'block.json',
  'render.php',
  'typia.openapi.json',
  'typia.manifest.json',
  'typia.schema.json',
  'typia-validator.php',
]);

function isMetadataAsset(filename) {
  return (
    STATIC_METADATA_FILENAMES.has(filename) ||
    filename.endsWith('.abilities.json') ||
    filename.endsWith('.schema.json') ||
    filename.endsWith('.openapi.json')
  );
}

function normalizeScriptModuleAssetSource(source) {
  return String(source).replace(
    /'dependencies'\s*=>\s*array\([^)]*\)/,
    "'dependencies' => array()",
  );
}

function getBlockDirs() {
  const blocksRoot = path.resolve(process.cwd(), 'src/blocks');

  if (!fs.existsSync(blocksRoot)) {
    return [];
  }

  return fs
    .readdirSync(blocksRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      dir: path.join(blocksRoot, entry.name),
      slug: entry.name,
    }));
}

function getMetadataEntries() {
  const entries = [];

  for (const blockDir of getBlockDirs()) {
    for (const inputPath of findMetadataFiles(blockDir.dir)) {
      entries.push({
        inputPath,
        outputPath: path.join(
          'blocks',
          blockDir.slug,
          path.relative(blockDir.dir, inputPath),
        ),
      });
    }
  }

  return entries;
}

function findMetadataFiles(directory) {
  const metadataFiles = [];

  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true,
  })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      metadataFiles.push(...findMetadataFiles(entryPath));
      continue;
    }

    if (entry.isFile() && isMetadataAsset(entry.name)) {
      metadataFiles.push(entryPath);
    }
  }

  return metadataFiles;
}

function isScriptModuleAsset(assetName) {
  return /(^|\/)(interactivity|view)\.asset\.php$/.test(assetName);
}

function normalizeScriptModuleAssetsInDirectory(directory) {
  if (!fs.existsSync(directory)) {
    return;
  }

  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true,
  })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      normalizeScriptModuleAssetsInDirectory(entryPath);
      continue;
    }
    if (entry.isFile() && isScriptModuleAsset(entryPath)) {
      fs.writeFileSync(
        entryPath,
        normalizeScriptModuleAssetSource(fs.readFileSync(entryPath, 'utf8')),
      );
    }
  }
}

class MetadataAssetPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap(
      'PersistenceExamplesMetadataAssetPlugin',
      (compilation) => {
        compilation.hooks.processAssets.tap(
          {
            name: 'PersistenceExamplesMetadataAssetPlugin',
            stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
          },
          () => {
            for (const entry of getMetadataEntries()) {
              if (compilation.getAsset(entry.outputPath)) {
                continue;
              }

              compilation.emitAsset(
                entry.outputPath,
                new compiler.webpack.sources.RawSource(
                  fs.readFileSync(entry.inputPath),
                ),
              );
            }

            for (const asset of compilation.getAssets()) {
              if (!isScriptModuleAsset(asset.name)) {
                continue;
              }

              compilation.updateAsset(
                asset.name,
                new compiler.webpack.sources.RawSource(
                  normalizeScriptModuleAssetSource(asset.source.source()),
                ),
              );
            }
          },
        );
      },
    );

    compiler.hooks.afterEmit.tap(
      'PersistenceExamplesMetadataAssetPlugin',
      (compilation) => {
        if (!compilation.outputOptions.path) {
          return;
        }

        normalizeScriptModuleAssetsInDirectory(compilation.outputOptions.path);
      },
    );
  }
}

function toWebpackConfigs(config) {
  return Array.isArray(config) ? config : [config];
}

function isModuleConfig(config) {
  return config?.output?.module === true;
}

function getEditorEntries() {
  return Object.fromEntries(
    getBlockDirs().map((blockDir) => [
      `blocks/${blockDir.slug}/index`,
      path.join(blockDir.dir, 'index.tsx'),
    ]),
  );
}

function getOptionalModuleEntries() {
  const entries = [];

  for (const blockDir of getBlockDirs()) {
    for (const filename of [
      'interactivity.ts',
      'interactivity.js',
      'view.ts',
      'view.js',
    ]) {
      const entryPath = path.join(blockDir.dir, filename);
      if (!fs.existsSync(entryPath)) {
        continue;
      }

      entries.push([
        `blocks/${blockDir.slug}/${filename.replace(/\.[^.]+$/, '')}`,
        entryPath,
      ]);
    }
  }

  return Object.fromEntries(entries);
}

module.exports = async () => {
  const { default: UnpluginTypia } = await import('@ttsc/unplugin/webpack');
  const resolvedDefaultConfig =
    typeof defaultConfig === 'function' ? await defaultConfig() : defaultConfig;
  const editorEntries = getEditorEntries();
  const moduleEntries = getOptionalModuleEntries();
  const configs = toWebpackConfigs(resolvedDefaultConfig).map((config) => ({
    ...config,
    entry: async () => (isModuleConfig(config) ? moduleEntries : editorEntries),
    resolve: {
      ...(config.resolve || {}),
      extensionAlias: {
        ...(config.resolve?.extensionAlias || {}),
        '.js': ['.js', '.ts', '.tsx'],
      },
      alias: {
        ...(config.resolve?.alias || {}),
        '@wp-typia/block-runtime/blocks': path.resolve(
          process.cwd(),
          '../../packages/wp-typia-block-runtime/src/blocks.ts',
        ),
        '@wp-typia/block-runtime/defaults': path.resolve(
          process.cwd(),
          '../../packages/wp-typia-block-runtime/src/defaults.ts',
        ),
        '@wp-typia/block-runtime/editor': path.resolve(
          process.cwd(),
          '../../packages/wp-typia-block-runtime/src/editor.ts',
        ),
        '@wp-typia/block-runtime/identifiers': path.resolve(
          process.cwd(),
          '../../packages/wp-typia-block-runtime/src/identifiers.ts',
        ),
        '@wp-typia/block-runtime/inspector': path.resolve(
          process.cwd(),
          '../../packages/wp-typia-block-runtime/src/inspector.ts',
        ),
        '@wp-typia/block-runtime/validation': path.resolve(
          process.cwd(),
          '../../packages/wp-typia-block-runtime/src/validation.ts',
        ),
        '@wp-typia/api-client/runtime-primitives': path.resolve(
          process.cwd(),
          '../../packages/wp-typia-api-client/src/runtime-primitives.ts',
        ),
        '@wp-typia/api-client/client-utils': path.resolve(
          process.cwd(),
          '../../packages/wp-typia-api-client/src/client-utils.ts',
        ),
        '@wp-typia/api-client$': path.resolve(
          process.cwd(),
          '../../packages/wp-typia-api-client/src/index.ts',
        ),
        '@wp-typia/rest': path.resolve(
          process.cwd(),
          '../../packages/wp-typia-rest/src',
        ),
      },
    },
    plugins: [
      UnpluginTypia(),
      ...(config.plugins || []),
      new MetadataAssetPlugin(),
    ],
  }));

  return configs.length === 1 ? configs[0] : configs;
};
