import fs from 'node:fs';
import path from 'node:path';

export const PROJECT_TOOLS_PREBUILT_FILES = Object.freeze([
  'packages/wp-typia-api-client/dist/index.js',
  'packages/wp-typia-block-types/dist/index.js',
  'packages/wp-typia-block-runtime/dist/index.js',
  'packages/wp-typia-dataviews/dist/index.js',
  'packages/wp-typia-rest/dist/index.js',
  'packages/wp-typia-project-tools/dist/runtime/index.js',
  'packages/wp-typia/dist/cli.js',
]);

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT' || nodeError.code === 'ENOTDIR') {
      return false;
    }
    throw error;
  }
}

export function findMissingProjectToolsPrebuiltFiles(
  repoRoot: string,
): string[] {
  return PROJECT_TOOLS_PREBUILT_FILES.filter(
    (relativePath) => !isFile(path.join(repoRoot, relativePath)),
  );
}

export function validateProjectToolsPrebuilt(repoRoot: string): void {
  const missingFiles = findMissingProjectToolsPrebuiltFiles(repoRoot);
  if (missingFiles.length === 0) {
    return;
  }

  throw new Error(
    `Project Tools prebuilt workspace is incomplete:\n${missingFiles
      .map((relativePath) => `- ${relativePath}`)
      .join(
        '\n',
      )}\nRun \`bun run project-tools-prebuilt:prepare\` before a run-only Project Tools test shard.`,
  );
}

if (import.meta.main) {
  const repoRoot = path.resolve(import.meta.dir, '..');
  try {
    validateProjectToolsPrebuilt(repoRoot);
    console.log('Project Tools prebuilt workspace is complete.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
