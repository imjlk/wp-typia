import fs from "node:fs";
import * as fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Required prefix for managed wp-typia temporary directories.
 */
export const WP_TYPIA_TEMP_ROOT_PREFIX = "wp-typia-";

/**
 * Default age threshold for pruning stale wp-typia temp roots.
 */
export const STALE_TEMP_ROOT_MAX_AGE_MS = 1000 * 60 * 60 * 24;

const trackedTempRoots = new Set<string>();

let cleanupHandlersInstalled = false;
let staleCleanupRan = false;
let signalCleanupInProgress = false;

type TempRootOptions = {
	maxAgeMs?: number;
	now?: number;
	tmpDir?: string;
};

function getTempDir(tmpDir?: string): string {
	return tmpDir ?? os.tmpdir();
}

function cleanupTrackedTempRootsSync(): void {
	for (const tempRoot of [...trackedTempRoots]) {
		trackedTempRoots.delete(tempRoot);
		try {
			fs.rmSync(tempRoot, { force: true, recursive: true });
		} catch {
			// Process-exit cleanup is best-effort: shutdown-time rm failures
			// such as EPERM are intentionally ignored rather than made fatal.
		}
	}
}

function installCleanupHandlers(): void {
	if (cleanupHandlersInstalled) {
		return;
	}

	cleanupHandlersInstalled = true;
	process.on("exit", cleanupTrackedTempRootsSync);

	for (const [signal, exitCode] of [
		["SIGHUP", 129],
		["SIGINT", 130],
		["SIGTERM", 143],
	] as const) {
		process.once(signal, () => {
			if (signalCleanupInProgress) {
				return;
			}

			signalCleanupInProgress = true;
			cleanupTrackedTempRootsSync();
			process.exitCode = exitCode;
			process.exit();
		});
	}
}

/**
 * Remove a managed temp root and stop tracking it for process-level cleanup.
 *
 * @param tempRoot Absolute temporary directory path to remove.
 */
export async function cleanupManagedTempRoot(tempRoot: string): Promise<void> {
	trackedTempRoots.delete(tempRoot);
	await fsp.rm(tempRoot, { force: true, recursive: true });
}

/**
 * Remove stale `wp-typia-*` temp directories from the target temp root.
 *
 * @param options Optional temp directory, age threshold, and clock override.
 * @returns Absolute temp-root paths removed during the cleanup pass.
 */
export async function cleanupStaleTempRoots({
	maxAgeMs = STALE_TEMP_ROOT_MAX_AGE_MS,
	now = Date.now(),
	tmpDir,
}: TempRootOptions = {}): Promise<string[]> {
	const resolvedTmpDir = getTempDir(tmpDir);
	const removedRoots: string[] = [];
	const entries = await fsp.readdir(resolvedTmpDir, { withFileTypes: true });

	for (const entry of entries) {
		if (
			!entry.isDirectory() ||
			!entry.name.startsWith(WP_TYPIA_TEMP_ROOT_PREFIX)
		) {
			continue;
		}

		const tempRoot = path.join(resolvedTmpDir, entry.name);
		if (trackedTempRoots.has(tempRoot)) {
			continue;
		}

		let stats;
		try {
			stats = await fsp.stat(tempRoot);
		} catch {
			continue;
		}

		if (now - stats.mtimeMs < maxAgeMs) {
			continue;
		}

		try {
			await fsp.rm(tempRoot, { force: true, recursive: true });
			removedRoots.push(tempRoot);
		} catch {
			continue;
		}
	}

	return removedRoots;
}

/**
 * Create a managed wp-typia temp root and install process cleanup handlers.
 *
 * @param prefix Temp directory prefix. Must start with `wp-typia-`.
 * @param options Optional temp directory override.
 * @returns The created temp-root path plus an async cleanup helper.
 */
export async function createManagedTempRoot(
	prefix: string,
	options: Pick<TempRootOptions, "tmpDir"> = {},
): Promise<{
	cleanup: () => Promise<void>;
	path: string;
}> {
	if (!prefix.startsWith(WP_TYPIA_TEMP_ROOT_PREFIX)) {
		throw new Error(
			`Managed wp-typia temp roots must use the "${WP_TYPIA_TEMP_ROOT_PREFIX}" prefix.`,
		);
	}

	installCleanupHandlers();
	if (!staleCleanupRan) {
		staleCleanupRan = true;
		await cleanupStaleTempRoots({ tmpDir: options.tmpDir });
	}

	const tempRoot = await fsp.mkdtemp(
		path.join(getTempDir(options.tmpDir), prefix),
	);
	trackedTempRoots.add(tempRoot);

	return {
		cleanup: async () => cleanupManagedTempRoot(tempRoot),
		path: tempRoot,
	};
}

/**
 * Snapshot the currently tracked temp roots for diagnostics and tests.
 *
 * @returns Absolute paths for temp roots currently registered for cleanup.
 */
export function getTrackedTempRoots(): string[] {
	return [...trackedTempRoots];
}
