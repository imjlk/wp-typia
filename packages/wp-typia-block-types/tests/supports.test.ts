import { describe, expect, test } from "bun:test";

import type { WordPressBlockApiCompatibilityDiagnostic } from "../src/blocks/compatibility";
import {
	collectBlockSupportsCompatibilityFeatures,
	createBlockSupportsCompatibilityManifest,
	defineSupports,
	getDefinedSupportsCompatibilityManifest,
} from "../src/blocks/supports";

describe("defineSupports", () => {
	test("returns block.json-ready supports metadata and stores diagnostics out of band", () => {
		const supports = defineSupports({
			minWordPress: "6.6",
			anchor: true,
			color: {
				background: true,
				text: true,
			},
			html: false,
			layout: {
				default: {
					type: "constrained",
				},
			},
			spacing: {
				blockGap: true,
				margin: true,
				padding: true,
			},
			typography: {
				fontSize: true,
				letterSpacing: true,
				lineHeight: true,
				textAlign: ["left", "center"],
			},
		});

		expect(supports).toEqual({
			anchor: true,
			color: {
				background: true,
				text: true,
			},
			html: false,
			layout: {
				default: {
					type: "constrained",
				},
			},
			spacing: {
				blockGap: true,
				margin: true,
				padding: true,
			},
			typography: {
				fontSize: true,
				letterSpacing: true,
				lineHeight: true,
				textAlign: ["left", "center"],
			},
		});
		expect(Object.keys(supports)).not.toContain("minWordPress");
		expect(JSON.parse(JSON.stringify(supports))).toEqual(supports);

		const manifest = getDefinedSupportsCompatibilityManifest(supports);

		expect(manifest?.diagnostics).toEqual([]);
		expect(manifest?.supported.map((feature) => feature.feature)).toEqual([
			"spacing.blockGap",
			"spacing.margin",
			"spacing.padding",
			"typography.fontSize",
			"typography.letterSpacing",
			"typography.lineHeight",
			"typography.textAlign",
		]);
	});

	test("collects only version-gated support keys from nested supports", () => {
		const features = collectBlockSupportsCompatibilityFeatures({
			color: {
				button: true,
				heading: false,
				text: true,
			},
			filter: {
				duotone: true,
			},
			spacing: {
				blockGap: true,
				margin: true,
				padding: true,
			},
			typography: {
				dropCap: true,
				fontSize: true,
				textDecoration: false,
			},
		}).map((feature) => feature.feature);

		expect(features).toEqual([
			"spacing.blockGap",
			"spacing.margin",
			"spacing.padding",
			"typography.fontSize",
			"color.button",
			"filter.duotone",
		]);
	});

	test("does not expand boolean parent supports into version-gated nested keys", () => {
		const manifest = createBlockSupportsCompatibilityManifest(
			{
				spacing: true,
				typography: true,
			},
			{
				minWordPress: "6.5",
			},
		);

		expect(manifest.diagnostics).toEqual([]);
		expect(manifest.evaluations).toEqual([]);
	});

	test("skips disabled object supports during compatibility checks", () => {
		const disabledFeatures = collectBlockSupportsCompatibilityFeatures({
			background: {
				backgroundImage: false,
				backgroundSize: false,
			},
			dimensions: {
				aspectRatio: false,
				height: false,
				minHeight: false,
				width: false,
			},
			position: {
				fixed: false,
				sticky: false,
			},
		}).map((feature) => feature.feature);
		const enabledFeatures = collectBlockSupportsCompatibilityFeatures({
			background: {
				backgroundImage: true,
			},
			dimensions: {
				aspectRatio: true,
			},
			position: {
				sticky: true,
			},
		}).map((feature) => feature.feature);

		expect(disabledFeatures).toEqual([]);
		expect(enabledFeatures).toEqual(["background", "dimensions", "position"]);
	});

	test("does not treat non-plain object support values as enabled top-level features", () => {
		class CustomSupportValue {
			enabled = true;
		}

		const features = collectBlockSupportsCompatibilityFeatures({
			background: new Date() as never,
			contentRole: new CustomSupportValue() as never,
			renaming: new Map([["enabled", true]]) as never,
		}).map((feature) => feature.feature);

		expect(features).toEqual([]);
	});

	test("throws in strict mode when supports require a newer WordPress floor", () => {
		expect(() =>
			defineSupports({
				minWordPress: "6.8",
				allowedBlocks: true,
			}),
		).toThrow("supports.allowedBlocks requires WordPress 6.9+");
	});

	test("checks version gates for newer top-level supports", () => {
		const features = collectBlockSupportsCompatibilityFeatures({
			contentRole: true,
			interactivity: true,
			listView: true,
			splitting: true,
		}).map((feature) => feature.feature);

		expect(features).toEqual([
			"contentRole",
			"interactivity",
			"listView",
			"splitting",
		]);
		expect(() =>
			defineSupports({
				minWordPress: "6.4",
				interactivity: true,
			}),
		).toThrow("supports.interactivity requires WordPress 6.5+");
		expect(() =>
			defineSupports({
				minWordPress: "6.4",
				splitting: true,
			}),
		).toThrow("supports.splitting requires WordPress 6.5+");
		expect(() =>
			defineSupports({
				minWordPress: "6.8",
				contentRole: true,
			}),
		).toThrow("supports.contentRole requires WordPress 6.9+");
		expect(() =>
			defineSupports({
				minWordPress: "6.9",
				listView: true,
			}),
		).toThrow("supports.listView requires WordPress 7.0+");
	});

	test("reports non-strict compatibility warnings without dropping metadata", () => {
		const diagnostics: WordPressBlockApiCompatibilityDiagnostic[] = [];
		const supports = defineSupports({
			minWordPress: "6.8",
			allowedBlocks: true,
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
			strict: false,
		});

		expect(supports).toEqual({
			allowedBlocks: true,
		});
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]).toMatchObject({
			code: "unsupported-wordpress-block-api-feature",
			feature: "allowedBlocks",
			requiredVersion: "6.9",
			severity: "warning",
		});
	});

	test("reports non-strict compatibility warnings through explicit loggers", () => {
		const logs: Array<{
			readonly diagnostic: WordPressBlockApiCompatibilityDiagnostic;
			readonly message: string;
		}> = [];

		defineSupports(
			{
				allowedBlocks: true,
				minWordPress: "6.8",
				strict: false,
			},
			{
				logger: {
					warn: (message, diagnostic) => {
						logs.push({ diagnostic, message });
					},
				},
			},
		);

		expect(logs).toHaveLength(1);
		expect(logs[0]?.message).toContain("[wp-typia]");
		expect(logs[0]?.diagnostic).toMatchObject({
			code: "unsupported-wordpress-block-api-feature",
			feature: "allowedBlocks",
			severity: "warning",
		});
	});

	test("passes through unknown future keys only when explicitly allowed", () => {
		const supports = defineSupports({
			minWordPress: "6.9",
			allowUnknownFutureKeys: true,
			futureLayoutMode: {
				enabled: true,
			},
			spacing: {
				padding: true,
			},
		});
		const manifest = getDefinedSupportsCompatibilityManifest(supports);

		expect(supports).toEqual({
			futureLayoutMode: {
				enabled: true,
			},
			spacing: {
				padding: true,
			},
		});
		expect(manifest?.diagnostics).toEqual([]);
		expect(manifest?.unknown).toMatchObject([
			{
				action: "pass-through",
				feature: "futureLayoutMode",
			},
		]);
		expect(() =>
			defineSupports({
				minWordPress: "6.9",
				futureLayoutMode: true,
			}),
		).toThrow('Unknown WordPress block API feature "blockSupports.futureLayoutMode"');
	});

	test("ignores disabled unknown future keys when collecting diagnostics", () => {
		const diagnostics: WordPressBlockApiCompatibilityDiagnostic[] = [];
		const supports = defineSupports({
			minWordPress: "6.9",
			futureLayoutMode: false,
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
			strict: false,
		});
		const manifest = getDefinedSupportsCompatibilityManifest(supports);

		expect(supports).toEqual({
			futureLayoutMode: false,
		});
		expect(manifest?.unknown).toEqual([]);
		expect(manifest?.diagnostics).toEqual([]);
		expect(diagnostics).toEqual([]);
	});
});
