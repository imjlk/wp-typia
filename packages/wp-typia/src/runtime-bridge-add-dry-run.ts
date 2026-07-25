import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { createManagedTempRoot } from '@wp-typia/project-tools/temp-roots';

type WorkspaceFileOperation = `delete ${string}` | `update ${string}` | `write ${string}`;
type InstallMarkerFs = Pick<typeof fs, 'copyFileSync' | 'linkSync' | 'symlinkSync'>;
type InstallMarkerFailure = {
  operation: 'copy' | 'hard link' | 'symlink';
  reason: string;
};

const SKIPPED_COPY_ROOT_ENTRIES = new Set(['.git', 'node_modules']);
const SKIPPED_COMPARE_ROOT_ENTRIES = new Set([
  '.git',
  '.pnp.cjs',
  '.pnp.loader.mjs',
  'node_modules',
]);

async function copyWorkspaceProject(sourceDir: string, targetDir: string): Promise<void> {
  await fsp.cp(sourceDir, targetDir, {
    filter: (sourcePath) => {
      const relativePath = path.relative(sourceDir, sourcePath);
      if (relativePath === '') {
        return true;
      }

      const [rootEntry] = relativePath.split(path.sep);
      return !SKIPPED_COPY_ROOT_ENTRIES.has(rootEntry ?? '');
    },
    recursive: true,
  });
}

function formatInstallMarkerError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function formatInstallMarkerFailures(failures: InstallMarkerFailure[]): string {
  return failures
		.map((failure) => `${failure.operation}: ${failure.reason}`)
		.join('; ');
}

export function ensureWorkspaceInstallMarker({
	fsAdapter = fs,
	sourceMarker,
	targetMarker,
}: {
  fsAdapter?: InstallMarkerFs;
  sourceMarker: string;
  targetMarker: string;
}): void {
  const failures: InstallMarkerFailure[] = [];

  try {
    fsAdapter.symlinkSync(sourceMarker, targetMarker);
    return;
  } catch (error) {
    failures.push({
      operation: 'symlink',
      reason: formatInstallMarkerError(error),
    });
  }

  try {
    fsAdapter.linkSync(sourceMarker, targetMarker);
    return;
  } catch (error) {
    failures.push({
      operation: 'hard link',
      reason: formatInstallMarkerError(error),
    });
  }

  try {
    fsAdapter.copyFileSync(sourceMarker, targetMarker);
    return;
  } catch (error) {
    failures.push({
      operation: 'copy',
      reason: formatInstallMarkerError(error),
    });
  }

  throw new Error(
		[
			'Failed to prepare dry-run install marker.',
			`Source: ${sourceMarker}`,
			`Target: ${targetMarker}`,
			`Fallback failures: ${formatInstallMarkerFailures(failures)}`,
		].join(' '),
	);
}

function ensureWorkspaceInstallMarkers(sourceDir: string, targetDir: string): void {
  const sourceNodeModules = path.join(sourceDir, 'node_modules');
  if (fs.existsSync(sourceNodeModules)) {
    fs.symlinkSync(
      sourceNodeModules,
      path.join(targetDir, 'node_modules'),
      'junction',
    );
  }

  for (const marker of ['.pnp.cjs', '.pnp.loader.mjs'] as const) {
    const sourceMarker = path.join(sourceDir, marker);
    if (!fs.existsSync(sourceMarker)) {
      continue;
    }

    const targetMarker = path.join(targetDir, marker);
    ensureWorkspaceInstallMarker({ sourceMarker, targetMarker });
  }
}

async function listWorkspaceFiles(rootDir: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();

  async function visit(currentDir: string): Promise<void> {
    const entries = await fsp.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = path.relative(rootDir, absolutePath);
      const [rootEntry] = relativePath.split(path.sep);
      if (SKIPPED_COMPARE_ROOT_ENTRIES.has(rootEntry ?? '')) {
        continue;
      }

      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      files.set(
        relativePath.replace(path.sep === '\\' ? /\\/gu : /\//gu, '/'),
        await fsp.readFile(absolutePath),
      );
    }
  }

  await visit(rootDir);
  return files;
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

async function collectWorkspaceFileOperations(
	sourceDir: string,
	simulatedDir: string,
): Promise<WorkspaceFileOperation[]> {
  const [sourceFiles, simulatedFiles] = await Promise.all([
    listWorkspaceFiles(sourceDir),
    listWorkspaceFiles(simulatedDir),
  ]);
  const operations: WorkspaceFileOperation[] = [];

  for (const [relativePath, simulatedSource] of simulatedFiles) {
    const originalSource = sourceFiles.get(relativePath);
    if (originalSource === undefined) {
      operations.push(`write ${relativePath}`);
      continue;
    }

    if (!originalSource.equals(simulatedSource)) {
      operations.push(`update ${relativePath}`);
    }
  }

  for (const relativePath of sourceFiles.keys()) {
    if (!simulatedFiles.has(relativePath)) {
      operations.push(`delete ${relativePath}`);
    }
  }

  return operations.sort(compareStrings);
}

/**
 * Runs a mutating workspace add command against a temporary clone and reports
 * the file operations that would be applied to the real workspace.
 *
 * @param options Workspace add dry-run options.
 * @returns The simulated command result plus normalized file operations.
 */
export async function simulateWorkspaceAddDryRun<T>({
	cwd,
	execute,
}: {
  cwd: string;
  execute: (simulatedCwd: string) => Promise<T>;
}): Promise<{
  fileOperations: WorkspaceFileOperation[];
  result: T;
}> {
  const { resolveWorkspaceProject } = await import(
    '@wp-typia/project-tools/workspace-project'
  );
  const workspace = resolveWorkspaceProject(cwd);
  const relativeCwd = path.relative(workspace.projectDir, path.resolve(cwd));
  const { path: tempRoot, cleanup } = await createManagedTempRoot(
    'wp-typia-add-plan-',
  );
  const simulatedProjectDir = path.join(tempRoot, 'workspace');

  try {
    await copyWorkspaceProject(workspace.projectDir, simulatedProjectDir);
    ensureWorkspaceInstallMarkers(workspace.projectDir, simulatedProjectDir);

    const simulatedCwd =
			relativeCwd.length > 0
        ? path.join(simulatedProjectDir, relativeCwd)
        : simulatedProjectDir;
    const result = await execute(simulatedCwd);
    const fileOperations = await collectWorkspaceFileOperations(
      workspace.projectDir,
      simulatedProjectDir,
    );

    return {
      fileOperations,
      result,
    };
  } finally {
    await cleanup();
  }
}
