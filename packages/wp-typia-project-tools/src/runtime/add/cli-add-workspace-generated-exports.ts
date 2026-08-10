import { promises as fsp } from 'node:fs';

import ts from '@typescript/typescript6';

function collectExportedConstNames(source: string): Set<string> {
  const sourceFile = ts.createSourceFile(
    'generated-module.ts',
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );
  const names = new Set<string>();

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
        names.add(declaration.name.text);
      }
    }
  }

  return names;
}

/**
 * Resolve the actual generated export used by an existing scaffold module.
 * New modules use the first candidate, while older managed modules can retain
 * their historical identifier until a project explicitly reformats them.
 *
 * @param filePath Generated TypeScript module to inspect.
 * @param candidates Preferred identifier followed by compatible historical identifiers.
 * @returns The first candidate exported by the module, or the preferred candidate
 * when the file does not exist yet.
 */
export async function resolveGeneratedExportedConstName(
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

  const exportedNames = collectExportedConstNames(source);
  const resolvedName = candidates.find((candidate) =>
    exportedNames.has(candidate),
  );
  if (resolvedName) {
    return resolvedName;
  }

  throw new Error(
    `Unable to resolve a compatible generated export in "${filePath}". Expected one of: ${candidates.join(', ')}. Found: ${Array.from(exportedNames).join(', ') || '(none)'}.`,
  );
}
