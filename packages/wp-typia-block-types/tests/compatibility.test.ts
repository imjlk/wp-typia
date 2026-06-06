import { describe, expect, test } from "bun:test";

import {
	WORDPRESS_BLOCK_API_COMPATIBILITY,
	WORDPRESS_BLOCK_API_COMPATIBILITY_SOURCES,
	assertWordPressVersion,
	compareWordPressVersions,
	createWordPressBlockApiCompatibilityManifest,
	evaluateWordPressBlockApiCompatibility,
	getWordPressBlockApiCompatibilityEntry,
	isWordPressVersionAtLeast,
} from "../src/blocks/compatibility";

describe("WordPress block API compatibility matrix", () => {
	test("captures the block API feature floors needed by follow-up helpers", () => {
		expect(WORDPRESS_BLOCK_API_COMPATIBILITY.blockSupports.allowedBlocks).toMatchObject({
			derivedAttributes: ["allowedBlocks"],
			since: "6.9",
			source: "blockSupportsHandbook",
		});
		expect(WORDPRESS_BLOCK_API_COMPATIBILITY.blockSupports.contentRole).toMatchObject({
			since: "6.9",
			source: "blockSupportsHandbook",
		});
		expect(WORDPRESS_BLOCK_API_COMPATIBILITY.blockSupports.listView).toMatchObject({
			since: "7.0",
			source: "blockSupportsHandbook",
		});
		expect(
			WORDPRESS_BLOCK_API_COMPATIBILITY.blockSupports["typography.textAlign"],
		).toMatchObject({
			derivedAttributes: ["style"],
			since: "6.6",
			source: "blockSupportsHandbook",
		});
		expect(WORDPRESS_BLOCK_API_COMPATIBILITY.blockSupports.interactivity).toMatchObject({
			runtime: ["block-json", "editor-js"],
			since: "6.5",
			source: "blockSupportsHandbook",
		});
		expect(WORDPRESS_BLOCK_API_COMPATIBILITY.blockSupports.splitting).toMatchObject({
			runtime: ["block-json", "editor-js"],
			since: "6.5",
			source: "blockSupportsHandbook",
		});
		expect(WORDPRESS_BLOCK_API_COMPATIBILITY.blockMetadata.blockHooks).toMatchObject({
			runtime: ["block-json", "php"],
			since: "6.4",
			source: "blockMetadataReference",
		});
		expect(
			WORDPRESS_BLOCK_API_COMPATIBILITY.blockVariations.editorRegistration,
		).toMatchObject({
			runtime: ["editor-js"],
			since: "5.4",
			source: "blockVariationsDevNote",
		});
		expect(
			WORDPRESS_BLOCK_API_COMPATIBILITY.blockVariations.registrationMetadata,
		).toMatchObject({
			runtime: ["editor-js"],
			since: "5.4",
			source: "blockVariationsDevNote",
		});
		expect(
			WORDPRESS_BLOCK_API_COMPATIBILITY.blockVariations
				.registrationBlockJsonMetadata,
		).toMatchObject({
			runtime: ["block-json"],
			since: "5.9",
			source: "blockMetadataReference",
		});
		expect(
			WORDPRESS_BLOCK_API_COMPATIBILITY.blockVariations.registrationMetadataFile,
		).toMatchObject({
			runtime: ["block-json", "php"],
			since: "6.7",
			source: "blockMetadataReference",
		});
		expect(
			WORDPRESS_BLOCK_API_COMPATIBILITY.blockBindings.serverRegistration,
		).toMatchObject({
			runtime: ["php"],
			since: "6.5",
			source: "blockBindingsReference",
		});
		expect(
			WORDPRESS_BLOCK_API_COMPATIBILITY.blockBindings.editorFieldsList,
		).toMatchObject({
			runtime: ["editor-js"],
			since: "6.9",
			source: "blockBindingsHandbook",
		});
		expect(
			WORDPRESS_BLOCK_API_COMPATIBILITY.blockBindings.supportedAttributesFilter,
		).toMatchObject({
			since: "6.9",
			source: "blockBindingsSupportedAttributes",
		});
		expect(WORDPRESS_BLOCK_API_COMPATIBILITY_SOURCES.blockSupportsHandbook).toContain(
			"developer.wordpress.org",
		);
		expect(
			WORDPRESS_BLOCK_API_COMPATIBILITY_SOURCES.blockMetadataReference,
		).toContain("developer.wordpress.org");
	});

	test("compares dotted WordPress versions with missing patch parts as zero", () => {
		expect(compareWordPressVersions("6.7", "6.7.0")).toBe(0);
		expect(compareWordPressVersions("6.10", "6.9.9")).toBe(1);
		expect(compareWordPressVersions("6.6.2", "6.7")).toBe(-1);
		expect(isWordPressVersionAtLeast("6.9", "6.7.1")).toBe(true);
		expect(() => assertWordPressVersion("6.x")).toThrow(
			'Invalid WordPress version "6.x"',
		);
	});

	test("evaluates strict unsupported features as skip-worthy errors", () => {
		const evaluation = evaluateWordPressBlockApiCompatibility(
			{
				area: "blockSupports",
				feature: "allowedBlocks",
			},
			{
				minVersion: "6.8",
				strict: true,
			},
		);

		expect(evaluation.status).toBe("unsupported");
		expect(evaluation.action).toBe("skip");
		expect(evaluation.diagnostic).toMatchObject({
			code: "unsupported-wordpress-block-api-feature",
			feature: "allowedBlocks",
			minVersion: "6.8",
			requiredVersion: "6.9",
			severity: "error",
		});
	});

	test("keeps non-strict unsupported features guardable", () => {
		const evaluation = evaluateWordPressBlockApiCompatibility(
			{
				area: "blockBindings",
				feature: "editorRegistration",
			},
			{
				minVersion: "6.5",
				strict: false,
			},
		);

		expect(evaluation.status).toBe("unsupported");
		expect(evaluation.action).toBe("guard");
		expect(evaluation.diagnostic?.severity).toBe("warning");
		expect(evaluation.entry?.fallback).toContain("server-side registration");
	});

	test("allows future keys only when explicitly configured", () => {
		const guarded = evaluateWordPressBlockApiCompatibility(
			{
				area: "blockSupports",
				feature: "futureLayoutMode",
			},
			{
				minVersion: "6.9",
			},
		);
		const passThrough = evaluateWordPressBlockApiCompatibility(
			{
				area: "blockSupports",
				feature: "futureLayoutMode",
			},
			{
				allowUnknownFutureKeys: true,
				minVersion: "6.9",
			},
		);

		expect(guarded.status).toBe("unknown");
		expect(guarded.action).toBe("guard");
		expect(guarded.diagnostic?.code).toBe("unknown-wordpress-block-api-feature");
		expect(passThrough.status).toBe("unknown");
		expect(passThrough.action).toBe("pass-through");
		expect(passThrough.diagnostic).toBeUndefined();
	});

	test("creates manifest-shaped summaries for codegen and diagnostics", () => {
		const manifest = createWordPressBlockApiCompatibilityManifest(
			[
				{
					area: "blockSupports",
					feature: "typography.fontSize",
				},
				{
					area: "blockSupports",
					feature: "visibility",
				},
				{
					area: "blockBindings",
					feature: "futureEditorFieldList",
				},
				{
					area: "blockMetadata",
					feature: "blockHooks",
				},
			],
			{
				minVersion: "6.8",
				strict: false,
			},
		);

		expect(manifest.supported.map((feature) => feature.feature)).toEqual([
			"typography.fontSize",
			"blockHooks",
		]);
		expect(manifest.unsupported.map((feature) => feature.feature)).toEqual([
			"visibility",
		]);
		expect(manifest.unknown.map((feature) => feature.feature)).toEqual([
			"futureEditorFieldList",
		]);
		expect(manifest.diagnostics).toHaveLength(2);
	});

	test("resolves individual matrix entries by area and feature", () => {
		expect(
			getWordPressBlockApiCompatibilityEntry(
				"blockVariations",
				"phpVariationsFilter",
			),
		).toMatchObject({
			since: "6.5",
			source: "blockVariationsPhpDevNote",
		});
		expect(
			getWordPressBlockApiCompatibilityEntry("blockVariations", "missing"),
		).toBeUndefined();
	});
});
