import { expect, test } from "bun:test";
import { join, resolve, sep } from "node:path";

import {
	hasTypeScriptSyntaxErrors,
	isProjectLocalRelativePath,
	isSafeProjectRelativePath,
} from "../src/runtime/doctor/cli-doctor-standalone-shared.js";

test("standalone doctor shared validation detects TypeScript syntax errors", () => {
	expect(
		hasTypeScriptSyntaxErrors(
			"const value: string = 'valid';",
			"sync-project.ts",
		),
	).toBe(false);
	expect(
		hasTypeScriptSyntaxErrors("const value = ;", "sync-project.ts"),
	).toBe(true);
});

test("standalone doctor shared validation identifies project-local relative paths", () => {
	const projectDir = resolve("/tmp", "wp-typia-standalone-shared");

	expect(isProjectLocalRelativePath("")).toBe(false);
	expect(isProjectLocalRelativePath("..")).toBe(false);
	expect(isProjectLocalRelativePath(join("..", "outside.ts"))).toBe(false);
	expect(isProjectLocalRelativePath("..\\..\\outside.ts")).toBe(false);
	for (const windowsRootedPath of [
		"C:outside.ts",
		"C:\\outside.ts",
		"\\outside.ts",
		"\\\\server\\share\\outside.ts",
	]) {
		expect(isProjectLocalRelativePath(windowsRootedPath)).toBe(false);
	}
	expect(
		isProjectLocalRelativePath(
			["src", "nested", "..", "..", "..", "outside.ts"].join(sep),
		),
	).toBe(false);
	expect(isProjectLocalRelativePath(resolve(projectDir, "src", "types.ts"))).toBe(
		false,
	);
	expect(isProjectLocalRelativePath(join("src", "types.ts"))).toBe(true);
});

test("standalone doctor shared validation rejects unsafe configured paths", () => {
	const projectDir = resolve("/tmp", "wp-typia-standalone-shared");

	expect(isSafeProjectRelativePath(projectDir, "")).toBe(false);
	expect(isSafeProjectRelativePath(projectDir, "..")).toBe(false);
	expect(isSafeProjectRelativePath(projectDir, join("..", "outside.ts"))).toBe(
		false,
	);
	expect(
		isSafeProjectRelativePath(projectDir, "..\\..\\outside.ts"),
	).toBe(false);
	for (const windowsRootedPath of [
		"C:outside.ts",
		"C:\\outside.ts",
		"\\outside.ts",
		"\\\\server\\share\\outside.ts",
	]) {
		expect(isSafeProjectRelativePath(projectDir, windowsRootedPath)).toBe(false);
	}
	expect(isSafeProjectRelativePath("relative-project", "src/types.ts")).toBe(
		false,
	);
	expect(
		isSafeProjectRelativePath(
			projectDir,
			["src", "..", "..", "outside.ts"].join(sep),
		),
	).toBe(false);
	expect(
		isSafeProjectRelativePath(projectDir, resolve(projectDir, "src", "types.ts")),
	).toBe(false);
	expect(isSafeProjectRelativePath(projectDir, join("src", "types.ts"))).toBe(
		true,
	);
});
