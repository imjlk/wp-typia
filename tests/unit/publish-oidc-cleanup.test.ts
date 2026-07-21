import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "../..");
const publishPackageDirs = [
	"wp-typia-block-types",
	"wp-typia-dataviews",
	"wp-typia-api-client",
	"wp-typia-rest",
	"wp-typia-block-runtime",
	"wp-typia-project-tools",
	"wp-typia",
	"create-workspace-template",
];

function writeText(filePath: string, content: string) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content, "utf8");
}

describe("publish OIDC cleanup", () => {
	test("restores wp-typia runtime maps after the publish process exits", () => {
		const tempRoot = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "wp-typia-publish-cleanup-")),
		);

		try {
			fs.mkdirSync(path.join(tempRoot, "scripts"), { recursive: true });
			fs.copyFileSync(
				path.join(repoRoot, "scripts", "publish-oidc.sh"),
				path.join(tempRoot, "scripts", "publish-oidc.sh"),
			);

			for (const packageDir of publishPackageDirs) {
				writeText(
					path.join(tempRoot, "packages", packageDir, "package.json"),
					`${JSON.stringify(
						{
							main: "index.js",
							name: `@test/${packageDir}`,
							version: "1.0.0",
						},
						null,
						2,
					)}\n`,
				);
			}

			const wpTypiaRoot = path.join(tempRoot, "packages", "wp-typia");
			fs.mkdirSync(path.join(wpTypiaRoot, "scripts"), { recursive: true });
			fs.copyFileSync(
				path.join(
					repoRoot,
					"packages",
					"wp-typia",
					"scripts",
					"publish-runtime-maps.mjs",
				),
				path.join(wpTypiaRoot, "scripts", "publish-runtime-maps.mjs"),
			);
			writeText(path.join(wpTypiaRoot, "dist", "cli.js.map"), "runtime-map\n");

			const fakeBin = path.join(tempRoot, "fake-bin");
			const fakeNpm = path.join(fakeBin, "npm");
			writeText(
				fakeNpm,
				`#!/usr/bin/env bash
set -euo pipefail

if [[ "\${1:-}" == "view" ]]; then
  exit 1
fi

if [[ "\${1:-}" == "publish" && "$(basename "$PWD")" == "wp-typia" ]]; then
  mkdir -p .pack-backup/runtime-maps
  mv dist/cli.js.map .pack-backup/runtime-maps/cli.js.map
  printf '{"files":["cli.js.map"]}\n' > .pack-backup/runtime-maps/manifest.json
fi
`,
			);
			fs.chmodSync(fakeNpm, 0o755);

			const result = spawnSync(
				"bash",
				[path.join(tempRoot, "scripts", "publish-oidc.sh")],
				{
					cwd: tempRoot,
					encoding: "utf8",
					env: {
						...process.env,
						DRY_RUN: "1",
						PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
					},
				},
			);

			const runtimeMapPath = path.join(wpTypiaRoot, "dist", "cli.js.map");
			if (result.status !== 0 || !fs.existsSync(runtimeMapPath)) {
				const backupMapPath = path.join(
					wpTypiaRoot,
					".pack-backup",
					"runtime-maps",
					"cli.js.map",
				);
				const manifestPath = path.join(
					wpTypiaRoot,
					".pack-backup",
					"runtime-maps",
					"manifest.json",
				);
				throw new Error(
					`publish wrapper did not restore runtime maps (backup exists: ${fs.existsSync(backupMapPath)}, manifest exists: ${fs.existsSync(manifestPath)})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
				);
			}

			expect(fs.readFileSync(runtimeMapPath, "utf8")).toBe(
				"runtime-map\n",
			);
			expect(fs.existsSync(path.join(wpTypiaRoot, ".pack-backup"))).toBe(false);
		} finally {
			fs.rmSync(tempRoot, { force: true, recursive: true });
		}
	}, 30_000);
});
