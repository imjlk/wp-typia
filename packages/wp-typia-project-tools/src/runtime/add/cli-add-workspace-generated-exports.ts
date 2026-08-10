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

function getGeneratedExportRenameLocations(
  filePath: string,
  source: string,
  position: number,
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
    getCurrentDirectory: () => path.dirname(resolvedFilePath),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    getScriptFileNames: () => [resolvedFilePath],
    getScriptSnapshot: (requestedPath) => {
      const resolvedRequestedPath = path.resolve(requestedPath);
      if (resolvedRequestedPath === resolvedFilePath) {
        return ts.ScriptSnapshot.fromString(source);
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
    return locations.filter(
      (location) => path.resolve(location.fileName) === resolvedFilePath,
    );
  } finally {
    languageService.dispose();
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
    const renameLocations = getGeneratedExportRenameLocations(
      filePath,
      source,
      historicalBinding.getStart(sourceFile),
    );
    const migratedSource = [...renameLocations]
      .sort(
        (left, right) => right.textSpan.start - left.textSpan.start,
      )
      .reduce(
        (current, location) =>
          `${current.slice(0, location.textSpan.start)}${
            location.prefixText ?? ''
          }${preferredName}${location.suffixText ?? ''}${current.slice(
            location.textSpan.start + location.textSpan.length,
          )}`,
        source,
      );
    const migratedSourceFile = ts.createSourceFile(
      filePath,
      migratedSource,
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TS,
    ) as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] };
    if (
      migratedSourceFile.parseDiagnostics &&
      migratedSourceFile.parseDiagnostics.length > 0
    ) {
      throw new Error(
        `Renaming "${historicalName}" to "${preferredName}" in "${filePath}" produced invalid TypeScript.`,
      );
    }
    const temporaryPath =
      `${filePath}.wp-typia-${process.pid}-${Date.now()}.tmp`;
    try {
      const mode = (await fsp.stat(filePath)).mode;
      await fsp.writeFile(temporaryPath, migratedSource, { mode });
      await fsp.rename(temporaryPath, filePath);
    } finally {
      try {
        await fsp.rm(temporaryPath, { force: true });
      } catch {
        // Preserve the original write/rename failure if cleanup also fails.
      }
    }
    return preferredName;
  }

  throw new Error(
    `Unable to resolve a compatible generated export in "${filePath}". Expected one of: ${candidates.join(', ')}. Found: ${Array.from(exportedBindings.keys()).join(', ') || '(none)'}.`,
  );
}
