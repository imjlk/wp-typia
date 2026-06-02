import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	cleanupStaleTempRoots,
	createManagedTempRoot,
	getTrackedTempRoots,
} from "../src/runtime/temp-roots.js";

describe("@wp-typia/project-tools temp root management", () => {
	const testRoots: string[] = [];

	afterEach(async () => {
		for (const testRoot of testRoots.splice(0)) {
			await fs.promises.rm(testRoot, { force: true, recursive: true });
		}
	});

	test("tracks managed temp roots until cleanup runs", async () => {
		const tmpDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "wp-typia-temp-roots-test-"),
		);
		testRoots.push(tmpDir);

		const managed = await createManagedTempRoot("wp-typia-temp-root-", {
			tmpDir,
		});

		expect(fs.existsSync(managed.path)).toBe(true);
		expect(getTrackedTempRoots()).toContain(managed.path);

		await managed.cleanup();

		expect(fs.existsSync(managed.path)).toBe(false);
		expect(getTrackedTempRoots()).not.toContain(managed.path);
	});

	test("stale cleanup prunes old wp-typia temp roots without touching fresh or unrelated dirs", async () => {
		const tmpDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "wp-typia-temp-roots-stale-"),
		);
		testRoots.push(tmpDir);

		const staleRoot = path.join(tmpDir, "wp-typia-stale-root");
		const freshRoot = path.join(tmpDir, "wp-typia-fresh-root");
		const unrelatedRoot = path.join(tmpDir, "unrelated-root");
		await fs.promises.mkdir(staleRoot);
		await fs.promises.mkdir(freshRoot);
		await fs.promises.mkdir(unrelatedRoot);

		const now = Date.now();
		const staleDate = new Date(now - 10_000);
		await fs.promises.utimes(staleRoot, staleDate, staleDate);

		const removedRoots = await cleanupStaleTempRoots({
			maxAgeMs: 5_000,
			now,
			tmpDir,
		});

		expect(removedRoots).toContain(staleRoot);
		expect(fs.existsSync(staleRoot)).toBe(false);
		expect(fs.existsSync(freshRoot)).toBe(true);
		expect(fs.existsSync(unrelatedRoot)).toBe(true);
	});

	test("documents why process-exit cleanup ignores rm failures", async () => {
		const source = await fs.promises.readFile(
			new URL("../src/runtime/shared/temp-roots.ts", import.meta.url),
			"utf8",
		);

		expect(source).toContain("Process-exit cleanup is best-effort");
		expect(source).toContain("such as EPERM are intentionally ignored");
	});
});
