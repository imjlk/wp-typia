import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ensurePersistentBlockIdentityDependency } from "../src/runtime/add/cli-add-block-package-json.js";
import { DEFAULT_WORDPRESS_DATA_VERSION } from "../src/runtime/shared/package-versions.js";

describe("add-block package dependencies", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "wp-typia-add-block-package-json-"),
	);

	afterAll(() => {
		fs.rmSync(tempRoot, { force: true, recursive: true });
	});

	function writePackageJson(
		name: string,
		packageJson: Record<string, unknown>,
	): string {
		const projectDir = path.join(tempRoot, name);
		fs.mkdirSync(projectDir, { recursive: true });
		fs.writeFileSync(
			path.join(projectDir, "package.json"),
			`${JSON.stringify(packageJson, null, "\t")}\n`,
			"utf8",
		);
		return projectDir;
	}

	test("adds the managed WordPress data range for persistence blocks", async () => {
		const projectDir = writePackageJson("missing", {
			dependencies: {
				"@wordpress/blocks": "~15.19.0",
			},
			name: "legacy-workspace",
		});

		await expect(
			ensurePersistentBlockIdentityDependency(projectDir, true),
		).resolves.toBe(true);
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(projectDir, "package.json"), "utf8"),
		) as { dependencies?: Record<string, string> };
		expect(packageJson.dependencies?.["@wordpress/data"]).toBe(
			DEFAULT_WORDPRESS_DATA_VERSION,
		);
	});

	test("preserves an existing dependency range", async () => {
		const projectDir = writePackageJson("existing", {
			dependencies: {
				"@wordpress/data": "^9.0.0",
			},
			name: "existing-workspace",
		});
		const packageJsonPath = path.join(projectDir, "package.json");
		const originalSource = fs.readFileSync(packageJsonPath, "utf8");

		await expect(
			ensurePersistentBlockIdentityDependency(projectDir, true),
		).resolves.toBe(false);
		expect(fs.readFileSync(packageJsonPath, "utf8")).toBe(originalSource);
	});

	test("does not add the dependency for non-persistence blocks", async () => {
		const projectDir = writePackageJson("not-required", {
			name: "basic-workspace",
		});

		await expect(
			ensurePersistentBlockIdentityDependency(projectDir, false),
		).resolves.toBe(false);
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(projectDir, "package.json"), "utf8"),
		) as { dependencies?: Record<string, string> };
		expect(packageJson.dependencies?.["@wordpress/data"]).toBeUndefined();
	});
});
