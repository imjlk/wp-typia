type EntryMap = Record<string, string>;

export interface TypiaWebpackArtifactEntry {
  inputPath: string;
  outputPath: string;
}

export interface TypiaWebpackConfigOptions {
  defaultConfig: unknown;
  fs: {
    existsSync(path: string): boolean;
    readFileSync(path: string, encoding?: string): string | Buffer;
    writeFileSync(path: string, data: string): void;
  };
  getArtifactEntries: () => TypiaWebpackArtifactEntry[];
  getEditorEntries?: () => EntryMap;
  getOptionalModuleEntries?: () => EntryMap;
  importTypiaWebpackPlugin: () => Promise<{ default: () => unknown }>;
  isScriptModuleAsset?: (assetName: string) => boolean;
  moduleEntriesMode?: 'merge' | 'replace';
  nonModuleEntriesMode?: 'merge' | 'replace';
  path: {
    isAbsolute(path: string): boolean;
    join(...paths: string[]): string;
    relative(from: string, to: string): string;
    resolve(...paths: string[]): string;
  };
  projectRoot?: string;
}

export interface TypiaWebpackPluginLoaderOptions {
  importTypiaWebpackPlugin: () => Promise<{ default: () => unknown }>;
  projectRoot?: string;
}

interface TypiaWebpackVersionMatrix {
  '@ttsc/unplugin': string | null;
  '@wordpress/scripts': string | null;
  ttsc: string | null;
  typescript: string | null;
  typia: string | null;
  webpack: string | null;
}

type NodeFsModule = typeof import('node:fs');
type NodeModuleBuiltin = typeof import('node:module');
type NodePathBuiltin = typeof import('node:path');
type NodePathJoiner = {
  join(...paths: string[]): string;
  resolve(...paths: string[]): string;
};

interface WebpackAsset {
  name: string;
  source: { source(): unknown };
}

interface WebpackCompilationLike {
  getAsset(name: string): unknown;
  getAssets(): WebpackAsset[];
  emitAsset(name: string, source: unknown): void;
  hooks: {
    processAssets: {
      tap(options: { name: string; stage: number }, cb: () => void): void;
    };
  };
  outputOptions: { path?: string };
  updateAsset(name: string, source: unknown): void;
}

function normalizeScriptModuleAssetSource(source: unknown): string {
  return String(source).replace(
    /'dependencies'\s*=>\s*array\([^)]*\)/,
    "'dependencies' => array()",
  );
}

function normalizeEntryMap(entry: unknown): Record<string, unknown> {
  if (typeof entry === 'string' || Array.isArray(entry)) {
    return { main: entry };
  }

  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    return { ...(entry as Record<string, unknown>) };
  }

  return {};
}

function toWebpackConfigs(config: unknown): unknown[] {
  return Array.isArray(config) ? config : [config];
}

function isModuleConfig(config: unknown): boolean {
  return (
    typeof config === 'object' &&
    config !== null &&
    (config as { output?: { module?: boolean } }).output?.module === true
  );
}

function parseMajorVersion(version: string | null): number | null {
  if (!version) {
    return null;
  }

  const match = /^(\d+)/u.exec(version);
  return match ? Number.parseInt(match[1], 10) : null;
}

function matchesMajorMinor(
  version: string | null,
  expectedMajor: number,
  expectedMinor: number,
): boolean {
  if (!version) {
    return false;
  }

  const match = /^(\d+)\.(\d+)/u.exec(version);
  return (
    match !== null &&
    Number.parseInt(match[1], 10) === expectedMajor &&
    Number.parseInt(match[2], 10) === expectedMinor
  );
}

function readPackageVersion(
  readFileSync: NodeFsModule['readFileSync'],
  packageJsonPath: string,
): string | null {
  try {
    return (
      JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: unknown }
    ).version as string | null;
  } catch {
    return null;
  }
}

async function loadNodeRuntimeHelpers() {
  const importNodeModule = Function(
    'specifier',
    'return import(specifier);',
  ) as (specifier: string) => Promise<unknown>;
  const [fsModule, moduleBuiltin, pathBuiltin] = (await Promise.all([
    importNodeModule('node:fs'),
    importNodeModule('node:module'),
    importNodeModule('node:path'),
  ])) as [NodeFsModule, NodeModuleBuiltin, NodePathBuiltin];

  return {
    createRequire: moduleBuiltin.createRequire,
    pathModule: pathBuiltin as unknown as NodePathJoiner,
    readFileSync: fsModule.readFileSync,
  };
}

function resolveInstalledPackageVersion(
  readFileSync: NodeFsModule['readFileSync'],
  requireFromProject: NodeJS.Require,
  packageName: string,
): string | null {
  try {
    return readPackageVersion(
      readFileSync,
      requireFromProject.resolve(`${packageName}/package.json`),
    );
  } catch {
    return null;
  }
}

function resolveWebpackVersion(
  readFileSync: NodeFsModule['readFileSync'],
  requireFromProject: NodeJS.Require,
  createRequire: NodeModuleBuiltin['createRequire'],
): string | null {
  try {
    const wordpressScriptsPackageJsonPath = requireFromProject.resolve(
      '@wordpress/scripts/package.json',
    );
    const requireFromWordPressScripts = createRequire(
      wordpressScriptsPackageJsonPath,
    );
    const bundledWebpackVersion = resolveInstalledPackageVersion(
      readFileSync,
      requireFromWordPressScripts,
      'webpack',
    );
    if (bundledWebpackVersion) {
      return bundledWebpackVersion;
    }
  } catch {
    // fall through to the project-level webpack resolution below
  }

  return resolveInstalledPackageVersion(
    readFileSync,
    requireFromProject,
    'webpack',
  );
}

async function getTypiaWebpackVersionMatrix(
  projectRoot = process.cwd(),
): Promise<TypiaWebpackVersionMatrix> {
  const { createRequire, pathModule, readFileSync } =
    await loadNodeRuntimeHelpers();
  const packageJsonPath = pathModule.resolve(projectRoot, 'package.json');
  const requireFromProject = createRequire(packageJsonPath);

  return {
    '@ttsc/unplugin': resolveInstalledPackageVersion(
      readFileSync,
      requireFromProject,
      '@ttsc/unplugin',
    ),
    '@wordpress/scripts': resolveInstalledPackageVersion(
      readFileSync,
      requireFromProject,
      '@wordpress/scripts',
    ),
    ttsc: resolveInstalledPackageVersion(
      readFileSync,
      requireFromProject,
      'ttsc',
    ),
    typescript: resolveInstalledPackageVersion(
      readFileSync,
      requireFromProject,
      'typescript',
    ),
    typia: resolveInstalledPackageVersion(
      readFileSync,
      requireFromProject,
      'typia',
    ),
    webpack: resolveWebpackVersion(
      readFileSync,
      requireFromProject,
      createRequire,
    ),
  };
}

function formatInstalledMatrix(
  versionMatrix: TypiaWebpackVersionMatrix,
): string {
  return [
    `typia=${versionMatrix.typia ?? 'missing'}`,
    `ttsc=${versionMatrix.ttsc ?? 'missing'}`,
    `typescript=${versionMatrix.typescript ?? 'missing'}`,
    `@ttsc/unplugin=${versionMatrix['@ttsc/unplugin'] ?? 'missing'}`,
    `@wordpress/scripts=${versionMatrix['@wordpress/scripts'] ?? 'missing'}`,
    `webpack=${versionMatrix.webpack ?? 'missing'}`,
  ].join(', ');
}

export async function assertTypiaWebpackCompatibility({
  projectRoot = process.cwd(),
}: {
  projectRoot?: string;
} = {}): Promise<TypiaWebpackVersionMatrix> {
  const versionMatrix = await getTypiaWebpackVersionMatrix(projectRoot);
  const isSupported =
    parseMajorVersion(versionMatrix.typia) === 13 &&
    matchesMajorMinor(versionMatrix.ttsc, 0, 21) &&
    parseMajorVersion(versionMatrix.typescript) === 7 &&
    matchesMajorMinor(versionMatrix['@ttsc/unplugin'], 0, 21) &&
    parseMajorVersion(versionMatrix['@wordpress/scripts']) === 30 &&
    parseMajorVersion(versionMatrix.webpack) === 5;

  if (isSupported) {
    return versionMatrix;
  }

  throw new Error(
    [
      'Unsupported Typia/Webpack toolchain for generated wp-typia projects.',
      `Installed versions: ${formatInstalledMatrix(versionMatrix)}.`,
      'Supported matrix: typia 13.x, ttsc 0.21.x, TypeScript 7.x, @ttsc/unplugin 0.21.x, @wordpress/scripts 30.x with webpack 5.x.',
      'Generated project defaults were tested against this matrix.',
    ].join(' '),
  );
}

export async function loadCompatibleTypiaWebpackPlugin({
  importTypiaWebpackPlugin,
  projectRoot = process.cwd(),
}: TypiaWebpackPluginLoaderOptions): Promise<() => unknown> {
  await assertTypiaWebpackCompatibility({ projectRoot });
  const { default: UnpluginTypia } = await importTypiaWebpackPlugin();
  return UnpluginTypia;
}

function mergeEntries(
  existingEntries: Record<string, unknown>,
  nextEntries: EntryMap | undefined,
  mode: 'merge' | 'replace',
): Record<string, unknown> {
  if (!nextEntries) {
    return existingEntries;
  }

  return mode === 'replace'
    ? { ...nextEntries }
    : {
        ...existingEntries,
        ...nextEntries,
      };
}

/**
 * Extend a WordPress webpack config with Typia-generated artifact handling.
 *
 * @remarks
 * This helper keeps emitted validator assets and script-module manifests aligned
 * with the generated scaffold runtime without rewriting the caller's config by hand.
 *
 * @param options - Default config plus artifact, module-entry, and plugin loaders.
 * @returns A webpack config or config array augmented with Typia support.
 * @example
 * ```ts
 * const config = await createTypiaWebpackConfig({
 *   defaultConfig,
 *   fs,
 *   getArtifactEntries,
 *   importTypiaWebpackPlugin,
 *   path,
 * });
 * ```
 * @category Scaffolding
 */
export async function createTypiaWebpackConfig(
  options: TypiaWebpackConfigOptions,
) {
  const {
    defaultConfig,
    fs,
    getArtifactEntries,
    getEditorEntries,
    getOptionalModuleEntries,
    importTypiaWebpackPlugin,
    isScriptModuleAsset = (assetName: string) =>
      /(^|\/)(interactivity|view)\.asset\.php$/.test(assetName),
    moduleEntriesMode = 'merge',
    nonModuleEntriesMode = 'merge',
    path,
    projectRoot = process.cwd(),
  } = options;
  const UnpluginTypia = await loadCompatibleTypiaWebpackPlugin({
    importTypiaWebpackPlugin,
    projectRoot,
  });
  const resolvedDefaultConfig =
    typeof defaultConfig === 'function'
      ? await (defaultConfig as () => Promise<unknown> | unknown)()
      : defaultConfig;

  class TypiaArtifactAssetPlugin {
    apply(compiler: {
      hooks: {
        afterEmit: {
          tap(
            name: string,
            cb: (compilation: WebpackCompilationLike) => void,
          ): void;
        };
        thisCompilation: {
          tap(
            name: string,
            cb: (compilation: WebpackCompilationLike) => void,
          ): void;
        };
      };
      webpack: {
        Compilation: { PROCESS_ASSETS_STAGE_ADDITIONS: number };
        sources: { RawSource: new (source: unknown) => unknown };
      };
    }) {
      compiler.hooks.thisCompilation.tap(
        'TypiaArtifactAssetPlugin',
        (compilation) => {
          compilation.hooks.processAssets.tap(
            {
              name: 'TypiaArtifactAssetPlugin',
              stage:
                compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
            },
            () => {
              const artifactEntries = getArtifactEntries();
              for (const entry of artifactEntries) {
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
        'TypiaArtifactAssetPlugin',
        (compilation) => {
          const outputPath = compilation.outputOptions.path;
          if (!outputPath) {
            return;
          }
          const outputRoot = path.resolve(outputPath);

          for (const asset of compilation.getAssets()) {
            if (!isScriptModuleAsset(asset.name)) {
              continue;
            }

            const assetPath = path.resolve(outputRoot, asset.name);
            const relativeAssetPath = path.relative(outputRoot, assetPath);
            if (
              relativeAssetPath.startsWith('..') ||
              path.isAbsolute(relativeAssetPath)
            ) {
              continue;
            }
            if (!fs.existsSync(assetPath)) {
              continue;
            }

            fs.writeFileSync(
              assetPath,
              normalizeScriptModuleAssetSource(
                fs.readFileSync(assetPath, 'utf8'),
              ),
            );
          }
        },
      );
    }
  }

  const configs = toWebpackConfigs(resolvedDefaultConfig).map((config) => ({
    ...(config as Record<string, unknown>),
    entry: async () => {
      const existingEntries = normalizeEntryMap(
        typeof (config as { entry?: unknown }).entry === 'function'
          ? await (
              config as { entry: () => Promise<unknown> | unknown }
            ).entry()
          : (config as { entry?: unknown }).entry,
      );
      const editorEntries = getEditorEntries?.();
      const optionalModuleEntries = getOptionalModuleEntries?.();

      if (isModuleConfig(config)) {
        return mergeEntries(
          existingEntries,
          optionalModuleEntries,
          moduleEntriesMode,
        );
      }

      return mergeEntries(existingEntries, editorEntries, nonModuleEntriesMode);
    },
    plugins: [
      UnpluginTypia(),
      ...(((config as { plugins?: unknown[] }).plugins ?? []) as unknown[]),
      new TypiaArtifactAssetPlugin(),
    ],
  }));

  return configs.length === 1 ? configs[0] : configs;
}
