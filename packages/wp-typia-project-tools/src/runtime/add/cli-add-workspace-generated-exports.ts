import fs, { promises as fsp } from 'node:fs';
import path from 'node:path';

import ts from '@typescript/typescript6';

import {
  toCollisionSafePascalCase,
  toKebabCase,
  toSnakeCase,
} from '../shared/string-case.js';

export async function collectGeneratedTypeScriptModulePaths(
  directory: string,
  recursive = false,
): Promise<string[]> {
  let entries;
  try {
    entries = await fsp.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return [];
    }
    throw error;
  }

  const paths = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        return [];
      }
      if (entry.isDirectory() && recursive) {
        return collectGeneratedTypeScriptModulePaths(entryPath, true);
      }
      return entry.isFile() && isGeneratedTypeScriptModuleFilename(entry.name)
        ? [entryPath]
        : [];
    }),
  );
  return paths.flat().sort();
}

export function isGeneratedTypeScriptModuleFilename(filename: string): boolean {
  return (
    filename.endsWith('.ts') &&
    !/\.(?:d|spec|stories|story|test)\.ts$/u.test(filename) &&
    filename !== 'index.ts'
  );
}

interface HistoricalGeneratedExportDescriptor {
  candidates: readonly [string, string];
  filePath: string;
}

function collectGeneratedTypeScriptModulePathsSync(
  directory: string,
  recursive = false,
): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  return entries
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        return [];
      }
      if (entry.isDirectory() && recursive) {
        return collectGeneratedTypeScriptModulePathsSync(entryPath, true);
      }
      return entry.isFile() && isGeneratedTypeScriptModuleFilename(entry.name)
        ? [entryPath]
        : [];
    })
    .sort();
}

function getHistoricalGeneratedExportDescriptor(
  workspaceDir: string,
  filePath: string,
): HistoricalGeneratedExportDescriptor | null {
  const relativePath = path
    .relative(workspaceDir, filePath)
    .split(path.sep)
    .join('/');
  const blockModule =
    /^src\/blocks\/[^/]+\/(variations|styles|transforms)\/([^/]+)\.ts$/u.exec(
      relativePath,
    );
  if (blockModule) {
    const [, family, slug] = blockModule;
    const prefix =
      family === 'variations'
        ? 'Variation'
        : family === 'styles'
          ? 'BlockStyle'
          : 'BlockTransform';
    return {
      candidates: [
        `workspace${prefix}${toCollisionSafePascalCase(slug ?? '')}`,
        `workspace${prefix}_${toSnakeCase(slug ?? '')}`,
      ],
      filePath,
    };
  }
  const coreVariation =
    /^src\/editor-plugins\/core-variations\/([^/]+)\/([^/]+)\/([^/]+)\.ts$/u.exec(
      relativePath,
    );
  if (!coreVariation) {
    return null;
  }
  const targetBlockName = `${coreVariation[1]}/${coreVariation[2]}`;
  const variationSlug = coreVariation[3] ?? '';
  const identifier = `${targetBlockName}-${variationSlug}`;
  return {
    candidates: [
      `coreVariation${toCollisionSafePascalCase(identifier)}`,
      `coreVariation_${toKebabCase(identifier)
        .split('-')
        .filter(Boolean)
        .join('_')}`,
    ],
    filePath,
  };
}

function collectHistoricalGeneratedExportDescriptors(
  workspaceDir: string,
): HistoricalGeneratedExportDescriptor[] {
  const candidates = [
    ...collectGeneratedTypeScriptModulePathsSync(
      path.join(workspaceDir, 'src', 'blocks'),
      true,
    ),
    ...collectGeneratedTypeScriptModulePathsSync(
      path.join(
        workspaceDir,
        'src',
        'editor-plugins',
        'core-variations',
      ),
      true,
    ),
  ];
  return candidates
    .map((filePath) =>
      getHistoricalGeneratedExportDescriptor(workspaceDir, filePath),
    )
    .filter(
      (descriptor): descriptor is HistoricalGeneratedExportDescriptor =>
        descriptor !== null,
    )
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
}

function hasHistoricalBinding(
  descriptor: HistoricalGeneratedExportDescriptor,
): boolean {
  const source = fs.readFileSync(descriptor.filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    descriptor.filePath,
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );
  const exportedBindings = collectExportedConstBindings(sourceFile);
  return (
    !exportedBindings.has(descriptor.candidates[0]) &&
    exportedBindings.has(descriptor.candidates[1])
  );
}

/** Return generated modules that still use the preceding export convention. */
export function collectHistoricalGeneratedExportFilePaths(
  workspaceDir: string,
): string[] {
  return collectHistoricalGeneratedExportDescriptors(workspaceDir)
    .filter(hasHistoricalBinding)
    .map((descriptor) => descriptor.filePath);
}

/** Return whether init must migrate a preceding generated-export convention. */
export function hasHistoricalGeneratedExportNames(
  workspaceDir: string,
): boolean {
  return collectHistoricalGeneratedExportFilePaths(workspaceDir).length > 0;
}

/** Transactionally migrate every known historical generated export in a workspace. */
export async function migrateHistoricalGeneratedExportNames(
  workspaceDir: string,
): Promise<void> {
  for (const descriptor of collectHistoricalGeneratedExportDescriptors(
    workspaceDir,
  )) {
    if (!hasHistoricalBinding(descriptor)) {
      continue;
    }
    await resolveAndMigrateGeneratedExportedConstName(
      descriptor.filePath,
      descriptor.candidates,
      workspaceDir,
    );
  }
}

const WORKSPACE_SCRIPT_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
];
const WORKSPACE_SCRIPT_EXCLUDED_DIRECTORIES = new Set([
  '.bun',
  '.cache',
  '.git',
  '.npm',
  '.pnpm-store',
  '.turbo',
  '.yarn',
  'build',
  'coverage',
  'dist',
  'node_modules',
]);
const WORKSPACE_SCRIPT_EXCLUDED_FILES = new Set([
  '.pnp.cjs',
  '.pnp.loader.mjs',
]);

interface WorkspaceFileEntry {
  entry: fs.Dirent;
  filePath: string;
}

async function collectWorkspaceFileEntries(
  directory: string,
): Promise<WorkspaceFileEntry[]> {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        return [];
      }
      if (entry.isDirectory()) {
        return WORKSPACE_SCRIPT_EXCLUDED_DIRECTORIES.has(entry.name)
          ? []
          : collectWorkspaceFileEntries(entryPath);
      }
      return entry.isFile() ? [{ entry, filePath: entryPath }] : [];
    }),
  );
  return files.flat();
}

function getWorkspaceScriptFilePaths(
  entries: readonly WorkspaceFileEntry[],
): string[] {
  return entries
    .filter(
      ({ entry }) =>
        !WORKSPACE_SCRIPT_EXCLUDED_FILES.has(entry.name) &&
        WORKSPACE_SCRIPT_EXTENSIONS.some((extension) =>
          entry.name.endsWith(extension),
        ),
    )
    .map(({ filePath }) => filePath)
    .sort();
}

export async function collectWorkspaceScriptFilePaths(
  directory: string,
): Promise<string[]> {
  return getWorkspaceScriptFilePaths(
    await collectWorkspaceFileEntries(directory),
  );
}

async function collectWorkspacePackageManifestSources(
  entries: readonly WorkspaceFileEntry[],
): Promise<ReadonlyMap<string, string>> {
  const manifests = entries.filter(
    ({ entry }) => entry.name === 'package.json',
  );
  return new Map(
    await Promise.all(
      manifests.map(
        async ({ filePath }) =>
          [
            path.resolve(filePath),
            await fsp.readFile(filePath, 'utf8'),
          ] as const,
      ),
    ),
  );
}

function createWorkspaceLanguageService(
  sources: ReadonlyMap<string, string>,
  workspaceDir: string,
  packageManifestSources: ReadonlyMap<string, string>,
): ts.LanguageService {
  const compilerOptions: ts.CompilerOptions = {
    ...getWorkspaceCompilerOptions(workspaceDir),
    noLib: true,
    skipLibCheck: true,
    types: [],
  };
  const readWorkspaceSource = (requestedPath: string): string | undefined =>
    sources.get(path.resolve(requestedPath));
  const readWorkspaceFile = (requestedPath: string): string | undefined => {
    const resolvedPath = path.resolve(requestedPath);
    return (
      sources.get(resolvedPath) ?? packageManifestSources.get(resolvedPath)
    );
  };
  const host: ts.LanguageServiceHost = {
    // Rename only needs the workspace graph. Loading external declaration
    // trees makes this one-time migration disproportionately expensive and
    // cannot add rename locations to the project-owned source snapshot.
    fileExists: (requestedPath) =>
      readWorkspaceFile(requestedPath) !== undefined,
    getCompilationSettings: () => compilerOptions,
    getCurrentDirectory: () => workspaceDir,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    getScriptFileNames: () => Array.from(sources.keys()),
    getScriptSnapshot: (requestedPath) => {
      const workspaceSource = readWorkspaceSource(requestedPath);
      return workspaceSource === undefined
        ? undefined
        : ts.ScriptSnapshot.fromString(workspaceSource);
    },
    getScriptVersion: () => '0',
    readDirectory: ts.sys.readDirectory,
    readFile: readWorkspaceFile,
  };
  return ts.createLanguageService(host);
}

function getGeneratedExportRenameLocations(
  filePath: string,
  sources: ReadonlyMap<string, string>,
  position: number,
  workspaceDir: string,
  packageManifestSources: ReadonlyMap<string, string>,
): readonly ts.RenameLocation[] {
  const resolvedFilePath = path.resolve(filePath);
  const languageService = createWorkspaceLanguageService(
    sources,
    workspaceDir,
    packageManifestSources,
  );
  try {
    const locations = languageService.findRenameLocations(
      resolvedFilePath,
      position,
      false,
      false,
      true,
    );
    if (!locations || locations.length === 0) {
      throw new Error(`Unable to resolve rename locations in "${filePath}".`);
    }
    return locations;
  } finally {
    languageService.dispose();
  }
}

function getSemanticDiagnosticsByFile(
  filePaths: readonly string[],
  sources: ReadonlyMap<string, string>,
  workspaceDir: string,
  packageManifestSources: ReadonlyMap<string, string>,
): ReadonlyMap<string, readonly ts.Diagnostic[]> {
  const languageService = createWorkspaceLanguageService(
    sources,
    workspaceDir,
    packageManifestSources,
  );
  try {
    return new Map(
      filePaths.map((filePath) => [
        filePath,
        languageService.getSemanticDiagnostics(path.resolve(filePath)),
      ]),
    );
  } finally {
    languageService.dispose();
  }
}

function mapMigratedPositionToOriginal(
  position: number | undefined,
  locations: readonly ts.RenameLocation[],
  preferredName: string,
): number | undefined {
  if (position === undefined) {
    return undefined;
  }
  let delta = 0;
  for (const location of [...locations].sort(
    (left, right) => left.textSpan.start - right.textSpan.start,
  )) {
    const replacementLength =
      (location.prefixText?.length ?? 0) +
      preferredName.length +
      (location.suffixText?.length ?? 0);
    const migratedStart = location.textSpan.start + delta;
    if (position < migratedStart) {
      return position - delta;
    }
    if (position < migratedStart + replacementLength) {
      return location.textSpan.start;
    }
    delta += replacementLength - location.textSpan.length;
  }
  return position - delta;
}

function getDiagnosticIdentity(
  diagnostic: ts.Diagnostic,
  originalPosition = diagnostic.start,
): string {
  return `${diagnostic.code}:${originalPosition ?? -1}`;
}

function getWorkspaceCompilerOptions(
  workspaceDir: string,
): ts.CompilerOptions {
  const fallbackOptions: ts.CompilerOptions = {
    allowJs: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.Latest,
  };
  const configPath = ts.findConfigFile(
    workspaceDir,
    ts.sys.fileExists,
    'tsconfig.json',
  );
  if (!configPath) {
    return fallbackOptions;
  }
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(
      `Unable to read workspace compiler options from "${configPath}": ${ts.flattenDiagnosticMessageText(config.error.messageText, '\n')}`,
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(configPath),
    { allowJs: true },
    configPath,
  );
  return {
    ...fallbackOptions,
    ...parsed.options,
    allowJs: true,
  };
}

function getWorkspaceScriptKind(filePath: string): ts.ScriptKind {
  switch (path.extname(filePath).toLowerCase()) {
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.tsx':
      return ts.ScriptKind.TSX;
    default:
      return ts.ScriptKind.TS;
  }
}

async function migrateGeneratedExportRenameLocations(options: {
  historicalName: string;
  locations: readonly ts.RenameLocation[];
  preferredName: string;
  sources: ReadonlyMap<string, string>;
  workspaceDir: string;
  packageManifestSources: ReadonlyMap<string, string>;
}): Promise<void> {
  const locationsByFile = new Map<string, ts.RenameLocation[]>();
  for (const location of options.locations) {
    const resolvedLocationPath = path.resolve(location.fileName);
    const locations = locationsByFile.get(resolvedLocationPath) ?? [];
    locations.push(location);
    locationsByFile.set(resolvedLocationPath, locations);
  }

  const updates = Array.from(locationsByFile, ([filePath, locations]) => {
    const source = options.sources.get(filePath);
    if (source === undefined) {
      throw new Error(
        `Unable to read rename target "${filePath}" while migrating "${options.historicalName}".`,
      );
    }
    const migratedSource = locations
      .sort((left, right) => right.textSpan.start - left.textSpan.start)
      .reduce(
        (current, location) =>
          `${current.slice(0, location.textSpan.start)}${
            location.prefixText ?? ''
          }${options.preferredName}${location.suffixText ?? ''}${current.slice(
            location.textSpan.start + location.textSpan.length,
          )}`,
        source,
      );
    const migratedSourceFile = ts.createSourceFile(
      filePath,
      migratedSource,
      ts.ScriptTarget.Latest,
      false,
      getWorkspaceScriptKind(filePath),
    ) as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] };
    if (
      migratedSourceFile.parseDiagnostics &&
      migratedSourceFile.parseDiagnostics.length > 0
    ) {
      throw new Error(
        `Renaming "${options.historicalName}" to "${options.preferredName}" in "${filePath}" produced an invalid workspace source file.`,
      );
    }
    return { filePath, locations, migratedSource };
  });
  const updatedFilePaths = updates.map((update) => update.filePath);
  const baselineDiagnostics = getSemanticDiagnosticsByFile(
    updatedFilePaths,
    options.sources,
    options.workspaceDir,
    options.packageManifestSources,
  );
  const migratedSources = new Map(options.sources);
  for (const update of updates) {
    migratedSources.set(update.filePath, update.migratedSource);
  }
  const migratedDiagnostics = getSemanticDiagnosticsByFile(
    updatedFilePaths,
    migratedSources,
    options.workspaceDir,
    options.packageManifestSources,
  );
  for (const update of updates) {
    const baselineIdentityCounts = new Map<string, number>();
    for (const diagnostic of baselineDiagnostics.get(update.filePath) ?? []) {
      const identity = getDiagnosticIdentity(diagnostic);
      baselineIdentityCounts.set(
        identity,
        (baselineIdentityCounts.get(identity) ?? 0) + 1,
      );
    }
    const introducedDiagnostics = (
      migratedDiagnostics.get(update.filePath) ?? []
    ).filter((diagnostic) => {
      const identity = getDiagnosticIdentity(
        diagnostic,
        mapMigratedPositionToOriginal(
          diagnostic.start,
          update.locations,
          options.preferredName,
        ),
      );
      const remainingBaselineCount = baselineIdentityCounts.get(identity) ?? 0;
      if (remainingBaselineCount === 0) {
        return true;
      }
      baselineIdentityCounts.set(identity, remainingBaselineCount - 1);
      return false;
    });
    if (introducedDiagnostics.length > 0) {
      const diagnosticDetails = introducedDiagnostics.map(
        (diagnostic) =>
          `TS${diagnostic.code} at offset ${diagnostic.start ?? 'unknown'}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
      );
      throw new Error(
        `Renaming "${options.historicalName}" to "${options.preferredName}" in "${update.filePath}" produced new semantic diagnostics: ${diagnosticDetails.join('; ')}.`,
      );
    }
  }
  const temporaryPaths: string[] = [];
  try {
    for (const [index, update] of updates.entries()) {
      const temporaryPath =
        `${update.filePath}.wp-typia-${process.pid}-${Date.now()}-${index}.tmp`;
      const mode = (await fsp.stat(update.filePath)).mode;
      await fsp.writeFile(temporaryPath, update.migratedSource, { mode });
      temporaryPaths.push(temporaryPath);
    }
    for (const [index, update] of updates.entries()) {
      await fsp.rename(temporaryPaths[index], update.filePath);
    }
  } finally {
    await Promise.allSettled(
      temporaryPaths.map((temporaryPath) =>
        fsp.rm(temporaryPath, { force: true }),
      ),
    );
  }
}

function collectExportedConstBindings(
  sourceFile: ts.SourceFile,
): Map<string, ts.Identifier> {
  const bindings = new Map<string, ts.Identifier>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isVariableStatement(statement) ||
      (statement.declarationList.flags & ts.NodeFlags.Const) === 0 ||
      !statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
    ) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        bindings.set(declaration.name.text, declaration.name);
      }
    }
  }

  return bindings;
}

/**
 * Resolve the actual generated export used by an existing scaffold module.
 * New modules use the first candidate. Older managed modules are upgraded to
 * that lint-compatible identifier when a registry is regenerated.
 *
 * @param filePath Generated TypeScript module to inspect.
 * @param candidates Preferred identifier followed by compatible historical identifiers.
 * @returns The first candidate exported by the module, or the preferred candidate
 * when the file does not exist yet.
 */
export async function resolveAndMigrateGeneratedExportedConstName(
	filePath: string,
	candidates: readonly [string, ...string[]],
	workspaceDir = path.dirname(filePath),
): Promise<string> {
  let source: string;
  try {
    source = await fsp.readFile(filePath, 'utf8');
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return candidates[0];
    }
    throw error;
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );
  const exportedBindings = collectExportedConstBindings(sourceFile);
  const preferredName = candidates[0];
  if (exportedBindings.has(preferredName)) {
    return preferredName;
  }

  const historicalName = candidates
    .slice(1)
    .find((candidate) => exportedBindings.has(candidate));
  if (historicalName) {
    const historicalBinding = exportedBindings.get(historicalName);
    if (!historicalBinding) {
      throw new Error(
        `Unable to locate historical export "${historicalName}".`,
      );
    }
    const workspaceFileEntries =
      await collectWorkspaceFileEntries(workspaceDir);
    const workspaceFilePaths = getWorkspaceScriptFilePaths(
      workspaceFileEntries,
    );
    const resolvedFilePath = path.resolve(filePath);
    const sources = new Map(
      await Promise.all(
        Array.from(
          new Set([
            ...workspaceFilePaths.map((workspaceFilePath) =>
              path.resolve(workspaceFilePath),
            ),
            resolvedFilePath,
          ]),
        ).map(async (workspaceFilePath) => [
          workspaceFilePath,
          workspaceFilePath === resolvedFilePath
            ? source
            : await fsp.readFile(workspaceFilePath, 'utf8'),
        ] as const),
      ),
    );
    const packageManifestSources =
      await collectWorkspacePackageManifestSources(workspaceFileEntries);
    const renameLocations = getGeneratedExportRenameLocations(
      filePath,
      sources,
      historicalBinding.getStart(sourceFile),
      workspaceDir,
      packageManifestSources,
    );
    await migrateGeneratedExportRenameLocations({
      historicalName,
      locations: renameLocations,
      packageManifestSources,
      preferredName,
      sources,
      workspaceDir,
    });
    return preferredName;
  }

  throw new Error(
    `Unable to resolve a compatible generated export in "${filePath}". Expected one of: ${candidates.join(', ')}. Found: ${Array.from(exportedBindings.keys()).join(', ') || '(none)'}.`,
  );
}
