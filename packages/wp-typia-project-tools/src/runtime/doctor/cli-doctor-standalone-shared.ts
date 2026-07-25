import path from 'node:path';

import ts from '@typescript/typescript6';

function hasFilesystemRoot(filePath: string): boolean {
  return (
    path.isAbsolute(filePath) || path.win32.parse(filePath).root.length > 0
  );
}

/**
 * Detect TypeScript errors reported during isolated transpilation.
 * This includes syntax errors and does not perform a full type check.
 *
 * @param source TypeScript source text to parse.
 * @param fileName File name to associate with parser diagnostics.
 * @returns Whether the source produces at least one error diagnostic.
 */
export function hasTypeScriptSyntaxErrors(
  source: string,
  fileName: string,
): boolean {
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.Latest },
    fileName,
    reportDiagnostics: true,
  });
  return (result.diagnostics ?? []).some(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
}

/**
 * Check whether a relative path stays within its project boundary.
 *
 * @param relativePath Relative path to validate.
 * @returns Whether the path is non-empty, rootless, and does not escape upward.
 */
export function isProjectLocalRelativePath(relativePath: string): boolean {
  if (relativePath.length === 0 || hasFilesystemRoot(relativePath)) {
    return false;
  }
  return [path.posix, path.win32].every((pathApi) => {
    const normalizedPath = pathApi.normalize(relativePath);
    return (
      normalizedPath !== '..' &&
      !normalizedPath.startsWith(`..${pathApi.sep}`)
    );
  });
}

/**
 * Check whether a file path resolves inside a project directory.
 *
 * @param projectDir Absolute project directory used as the resolution base.
 * @param filePath Project-relative file path to validate.
 * @returns Whether the resolved file path remains inside the project directory.
 */
export function isSafeProjectRelativePath(
  projectDir: string,
  filePath: string,
): boolean {
  if (!path.isAbsolute(projectDir) || hasFilesystemRoot(filePath)) {
    return false;
  }
  return isProjectLocalRelativePath(
    path.relative(projectDir, path.resolve(projectDir, filePath)),
  );
}
