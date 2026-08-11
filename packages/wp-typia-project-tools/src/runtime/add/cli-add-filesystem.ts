import { promises as fsp } from 'node:fs';
import path from 'node:path';

import type {
	WorkspaceMutationSnapshot,
} from './cli-add-types.js';
import { readOptionalUtf8File } from '../shared/fs-async.js';
import type {
	WorkspaceProject,
} from '../workspace/workspace-project.js';

/**
 * Resolve the primary PHP bootstrap file for an official workspace.
 *
 * @param workspace Workspace metadata that provides `packageName` and `projectDir`.
 * @returns Absolute path to `<packageBase>.php` in the workspace root.
 */
export function getWorkspaceBootstrapPath(workspace: WorkspaceProject): string {
  const workspaceBaseName = workspace.packageName.split('/').pop() ?? workspace.packageName;
  return path.join(workspace.projectDir, `${workspaceBaseName}.php`);
}

/**
 * Apply a text transform to an existing file only when the contents change.
 */
export async function patchFile(
	filePath: string,
	transform: (source: string) => string,
): Promise<void> {
  const currentSource = await fsp.readFile(filePath, 'utf8');
  const nextSource = transform(currentSource);
  if (nextSource !== currentSource) {
    await fsp.writeFile(filePath, nextSource, 'utf8');
  }
}

/**
 * Read a file when it exists and otherwise return `null`.
 */
export async function readOptionalFile(filePath: string): Promise<string | null> {
  return readOptionalUtf8File(filePath);
}

/**
 * Restore a file to its captured source, deleting it when the snapshot was `null`.
 */
export async function restoreOptionalFile(
	filePath: string,
	source: string | null,
	mode: number | null = null,
): Promise<void> {
  if (source === null) {
    await fsp.rm(filePath, { force: true });
    return;
  }

  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, source, 'utf8');
  if (mode !== null) {
    await fsp.chmod(filePath, mode);
  }
}

/**
 * Capture the current contents of a set of workspace files for rollback.
 */
export async function snapshotWorkspaceFiles(
	filePaths: string[],
): Promise<WorkspaceMutationSnapshot['fileSources']> {
  const uniquePaths = Array.from(new Set(filePaths));
  return Promise.all(
    uniquePaths.map(async (filePath) => {
      const source = await readOptionalFile(filePath);
      return {
        filePath,
        mode:
          source === null ? null : (await fsp.stat(filePath)).mode & 0o7777,
        source,
      };
    }),
  );
}

/**
 * Undo a partially applied workspace mutation from a captured snapshot.
 */
export async function rollbackWorkspaceMutation(snapshot: WorkspaceMutationSnapshot): Promise<void> {
  for (const targetPath of snapshot.targetPaths) {
    await fsp.rm(targetPath, { force: true, recursive: true });
  }
  for (const snapshotDir of snapshot.snapshotDirs) {
    await fsp.rm(snapshotDir, { force: true, recursive: true });
  }
  for (const { filePath, mode, source } of snapshot.fileSources) {
    await restoreOptionalFile(filePath, source, mode);
  }
}
