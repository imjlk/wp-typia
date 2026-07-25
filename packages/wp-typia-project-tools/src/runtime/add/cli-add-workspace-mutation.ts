import {
  rollbackWorkspaceMutation,
  snapshotWorkspaceFiles,
  type WorkspaceMutationSnapshot,
} from './cli-add-shared.js';

/**
 * Paths captured before a workspace mutation so its filesystem changes can be rolled back.
 */
export interface WorkspaceMutationSnapshotPlan {
	/** Files to capture before the mutation starts. Missing files are restored as absent. */
  filePaths: string[];
	/** Snapshot directories created by the mutation, usually migration fixtures. */
  snapshotDirs?: string[];
	/** Created files or directories to remove if the mutation fails. */
  targetPaths?: string[];
}

/**
 * A workspace mutation snapshot plan paired with the operation to execute.
 */
export interface WorkspaceMutationPlan<
  TResult,
> extends WorkspaceMutationSnapshotPlan {
	/** Mutating work to execute after the snapshot is captured. */
  run: () => Promise<TResult>;
}

const DEFAULT_PHP_SNIPPET_INSERTION_ANCHORS = [
  /add_action\(\s*["']init["']\s*,\s*["'][^"']+_load_textdomain["']\s*\);\s*\n/u,
  /\?>\s*$/u,
] as const;

/**
 * Error thrown when the mutation and its rollback both fail.
 */
export class WorkspaceMutationRollbackError extends Error {
  readonly mutationError: unknown;
  readonly rollbackError: unknown;

  constructor(mutationError: unknown, rollbackError: unknown) {
    super('Workspace mutation failed and rollback also failed.');
    this.name = 'WorkspaceMutationRollbackError';
    this.mutationError = mutationError;
    this.rollbackError = rollbackError;
  }
}

/**
 * Capture the files and paths needed to roll back a workspace add mutation.
 */
export async function createWorkspaceMutationSnapshot({
	filePaths,
	snapshotDirs = [],
	targetPaths = [],
}: WorkspaceMutationSnapshotPlan): Promise<WorkspaceMutationSnapshot> {
  return {
    fileSources: await snapshotWorkspaceFiles(filePaths),
    snapshotDirs: [...snapshotDirs],
    targetPaths: [...targetPaths],
  };
}

/**
 * Execute a workspace add mutation with rollback on any failure.
 */
export async function executeWorkspaceMutationPlan<TResult>(
	plan: WorkspaceMutationPlan<TResult>,
): Promise<TResult> {
  const mutationSnapshot = await createWorkspaceMutationSnapshot(plan);

  try {
    return await plan.run();
  } catch (error) {
    try {
      await rollbackWorkspaceMutation(mutationSnapshot);
    } catch (rollbackError) {
      throw new WorkspaceMutationRollbackError(error, rollbackError);
    }
    throw error;
  }
}

/**
 * Insert a PHP snippet before the workspace textdomain hook or closing tag.
 */
export function insertPhpSnippetBeforeWorkspaceAnchors(
	source: string,
	snippet: string,
): string {
  for (const anchor of DEFAULT_PHP_SNIPPET_INSERTION_ANCHORS) {
    const candidate = source.replace(anchor, (match) => `${snippet}\n${match}`);
    if (candidate !== source) {
      return candidate;
    }
  }

  return `${source.trimEnd()}\n${snippet}\n`;
}

/**
 * Append a PHP snippet before the closing tag when one is present.
 */
export function appendPhpSnippetBeforeClosingTag(
	source: string,
	snippet: string,
): string {
  const closingTagPattern = /\?>\s*$/u;
  if (closingTagPattern.test(source)) {
    return source.replace(closingTagPattern, `${snippet}\n?>`);
  }

  return `${source.trimEnd()}\n${snippet}\n`;
}
