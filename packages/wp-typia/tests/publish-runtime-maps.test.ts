import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function loadPublishRuntimeMapsModule(): Promise<{
	preparePublishedRuntimeMaps(packageRoot?: string): void;
	restorePublishedRuntimeMaps(packageRoot?: string): void;
}> {
	return import(new URL("../scripts/publish-runtime-maps.mjs", import.meta.url).href);
}

function writeText(filePath: string, content: string) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content, "utf8");
}

describe("publish runtime maps", () => {
	test("prepare fails fast when the built runtime directory is missing", async () => {
		const { preparePublishedRuntimeMaps } = await loadPublishRuntimeMapsModule();
		const packageRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "wp-typia-runtime-maps-missing-"),
		);

		expect(() => preparePublishedRuntimeMaps(packageRoot)).toThrow(
			`Cannot prepare runtime source maps: missing ${path.join(packageRoot, "dist")}`,
		);
	});

	test("prepare moves source maps into the backup area and restore moves them back", async () => {
		const {
			preparePublishedRuntimeMaps,
			restorePublishedRuntimeMaps,
		} = await loadPublishRuntimeMapsModule();
		const packageRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "wp-typia-runtime-maps-roundtrip-"),
		);
		const mapPath = path.join(packageRoot, "dist", "cli.js.map");

		writeText(mapPath, "demo-map");
		preparePublishedRuntimeMaps(packageRoot);

		expect(fs.existsSync(mapPath)).toBe(false);
		expect(
			fs.existsSync(
				path.join(packageRoot, ".pack-backup", "runtime-maps", "cli.js.map"),
			),
		).toBe(true);

		restorePublishedRuntimeMaps(packageRoot);

		expect(fs.existsSync(mapPath)).toBe(true);
		expect(fs.existsSync(path.join(packageRoot, ".pack-backup"))).toBe(false);
	});

	test("restore fails when a backup entry is missing and the destination was not already restored", async () => {
		const { restorePublishedRuntimeMaps } = await loadPublishRuntimeMapsModule();
		const packageRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "wp-typia-runtime-maps-missing-backup-"),
		);
		const backupRoot = path.join(packageRoot, ".pack-backup", "runtime-maps");

		fs.mkdirSync(backupRoot, { recursive: true });
		writeText(
			path.join(backupRoot, "manifest.json"),
			JSON.stringify({ files: ["cli.js.map"] }, null, 2),
		);
		fs.mkdirSync(path.join(packageRoot, "dist"), { recursive: true });

		expect(() => restorePublishedRuntimeMaps(packageRoot)).toThrow(
			"Missing runtime source map backup: cli.js.map",
		);
	});
});
