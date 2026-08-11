import { promises as fsp } from 'node:fs';
import path from 'node:path';

import ts from '@typescript/typescript6';

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

const WORKSPACE_TYPESCRIPT_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
const WORKSPACE_TYPESCRIPT_EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
]);

export async function collectWorkspaceTypeScriptFilePaths(
  directory: string,
): Promise<string[]> {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        return [];
      }
      if (entry.isDirectory()) {
        return WORKSPACE_TYPESCRIPT_EXCLUDED_DIRECTORIES.has(entry.name)
          ? []
          : collectWorkspaceTypeScriptFilePaths(entryPath);
      }
      return entry.isFile() &&
        WORKSPACE_TYPESCRIPT_EXTENSIONS.some((extension) =>
          entry.name.endsWith(extension),
        ) &&
        !/\.d\.(?:cts|mts|ts)$/u.test(entry.name)
        ? [entryPath]
        : [];
    }),
  );
  return paths.flat().sort();
}

function getGeneratedExportRenameLocations(
  filePath: string,
  sources: ReadonlyMap<string, string>,
  position: number,
  workspaceDir: string,
): readonly ts.RenameLocation[] {
  const resolvedFilePath = path.resolve(filePath);
  const compilerOptions: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.Latest,
  };
  const host: ts.LanguageServiceHost = {
    fileExists: ts.sys.fileExists,
    getCompilationSettings: () => compilerOptions,
    getCurrentDirectory: () => workspaceDir,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    getScriptFileNames: () => Array.from(sources.keys()),
    getScriptSnapshot: (requestedPath) => {
      const resolvedRequestedPath = path.resolve(requestedPath);
      const workspaceSource = sources.get(resolvedRequestedPath);
      if (workspaceSource !== undefined) {
        return ts.ScriptSnapshot.fromString(workspaceSource);
      }
      const dependencySource = ts.sys.readFile(requestedPath);
      return dependencySource === undefined
        ? undefined
        : ts.ScriptSnapshot.fromString(dependencySource);
    },
    getScriptVersion: () => '0',
    readDirectory: ts.sys.readDirectory,
    readFile: ts.sys.readFile,
  };
  const languageService = ts.createLanguageService(host);
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

async function migrateGeneratedExportRenameLocations(options: {
  historicalName: string;
  locations: readonly ts.RenameLocation[];
  preferredName: string;
  sources: ReadonlyMap<string, string>;
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
      filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    ) as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] };
    if (
      migratedSourceFile.parseDiagnostics &&
      migratedSourceFile.parseDiagnostics.length > 0
    ) {
      throw new Error(
        `Renaming "${options.historicalName}" to "${options.preferredName}" in "${filePath}" produced invalid TypeScript.`,
      );
    }
    return { filePath, migratedSource };
  });
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
    const workspaceFilePaths = await collectWorkspaceTypeScriptFilePaths(
      workspaceDir,
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
    const renameLocations = getGeneratedExportRenameLocations(
      filePath,
      sources,
      historicalBinding.getStart(sourceFile),
      workspaceDir,
    );
    await migrateGeneratedExportRenameLocations({
      historicalName,
      locations: renameLocations,
      preferredName,
      sources,
    });
    return preferredName;
  }

  throw new Error(
    `Unable to resolve a compatible generated export in "${filePath}". Expected one of: ${candidates.join(', ')}. Found: ${Array.from(exportedBindings.keys()).join(', ') || '(none)'}.`,
  );
}
