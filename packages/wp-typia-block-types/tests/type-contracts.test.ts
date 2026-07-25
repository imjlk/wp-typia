import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const packageRoot = resolve(import.meta.dir, "..");
const fixtureSourcePath = resolve(import.meta.dir, "fixtures/public-type-contracts.ts");
const fixtureTsconfigPath = resolve(import.meta.dir, "tsconfig.type-tests.json");
const ttscBinary = resolve(packageRoot, "../../node_modules/.bin/ttsc");

function runTypeFixture() {
	return spawnSync(ttscBinary, ["-p", fixtureTsconfigPath, "--noEmit"], {
		cwd: packageRoot,
		encoding: "utf8",
	});
}

describe("@wp-typia/block-types type contracts", () => {
	test("consumer-style public imports compile through the dedicated fixture", () => {
		const result = runTypeFixture();

		expect(
			{
				code: result.status,
				stderr: result.stderr,
				stdout: result.stdout,
			},
			result.stderr || result.stdout,
		).toEqual({
			code: 0,
			stderr: "",
			stdout: "",
		});
	});

	test("fixture locks both positive and negative type expectations for the public surface", () => {
		const fixtureSource = readFileSync(fixtureSourcePath, "utf8");

		expect(fixtureSource).toContain("@wp-typia/block-types/blocks/registration");
		expect(fixtureSource).toContain("@wp-typia/block-types/blocks/bindings");
		expect(fixtureSource).toContain("@wp-typia/block-types/blocks/compatibility");
		expect(fixtureSource).toContain("@wp-typia/block-types/blocks/supports");
		expect(fixtureSource).toContain("@wp-typia/block-types/blocks/variations");
		expect(fixtureSource).toContain(
			"@wp-typia/block-types/block-editor/style-attributes",
		);
		expect(fixtureSource).toContain("@ts-expect-error");
		expect(fixtureSource).toContain("defineSupports");
		expect(fixtureSource).toContain("SupportAttributes<typeof proseSupports>");
		expect(fixtureSource).toContain("defineVariation");
		expect(fixtureSource).toContain("defineVariations");
		expect(fixtureSource).toContain("defineBindingSource");
		expect(fixtureSource).toContain("Binding<typeof profileDataSource");
		expect(fixtureSource).toContain("registerScaffoldBlockType");
		expect(fixtureSource).toContain("BlockAttributeSchema<GalleryAttributes>");
	});
});
