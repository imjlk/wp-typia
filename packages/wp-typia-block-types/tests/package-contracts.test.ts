import { execFileSync } from "node:child_process";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const packageRoot = resolve(import.meta.dir, "..");
const tscBinary = resolve(packageRoot, "../../node_modules/.bin/tsc");

function writeMockWordPressBlocks(projectRoot: string) {
	const packageDir = resolve(projectRoot, "node_modules", "@wordpress", "blocks");
	mkdirSync(packageDir, { recursive: true });
	writeFileSync(
		resolve(packageDir, "package.json"),
		JSON.stringify(
			{
				exports: {
					".": "./index.js",
				},
				name: "@wordpress/blocks",
				type: "module",
			},
			null,
			2,
		),
		"utf8",
	);
	writeFileSync(
		resolve(packageDir, "index.js"),
		[
			"export function registerBlockType(name, settings) {",
			"  return { name, settings, source: '@wordpress/blocks' };",
			"}",
			"export function registerBlockVariation(blockName, variation) {",
			"  globalThis.__wpTypiaRegisteredVariations ??= [];",
			"  globalThis.__wpTypiaRegisteredVariations.push({ blockName, variation });",
			"}",
			"export function registerBlockBindingsSource(source) {",
			"  globalThis.__wpTypiaRegisteredBindingSources ??= [];",
			"  globalThis.__wpTypiaRegisteredBindingSources.push(source);",
			"}",
			"",
		].join("\n"),
		"utf8",
	);
}

function withPublishedConsumer<T>(
	run: (projectRoot: string) => T,
	options: { installWordPressBlocks?: boolean } = {},
): T {
	const projectRoot = mkdtempSync(resolve(tmpdir(), "wp-typia-block-types-consumer-"));
	const packageDir = resolve(projectRoot, "node_modules", "@wp-typia", "block-types");

	try {
		mkdirSync(resolve(projectRoot, "node_modules", "@wp-typia"), {
			recursive: true,
		});
		mkdirSync(packageDir, { recursive: true });
		writeFileSync(
			resolve(projectRoot, "package.json"),
			JSON.stringify({ name: "block-types-consumer", private: true, type: "module" }),
			"utf8",
		);
		cpSync(resolve(packageRoot, "dist"), resolve(packageDir, "dist"), {
			recursive: true,
		});
		writeFileSync(
			resolve(packageDir, "package.json"),
			readFileSync(resolve(packageRoot, "package.json"), "utf8"),
			"utf8",
		);
		if (options.installWordPressBlocks ?? true) {
			writeMockWordPressBlocks(projectRoot);
		}

		return run(projectRoot);
	} finally {
		rmSync(projectRoot, { force: true, recursive: true });
	}
}

describe("@wp-typia/block-types export contracts", () => {
	test("publishes the documented block-editor and block registration entrypoints", () => {
		const packageJson = JSON.parse(
			readFileSync(resolve(packageRoot, "package.json"), "utf8"),
		) as {
			exports?: Record<string, unknown>;
		};

		expect(packageJson.exports?.["./block-editor"]).toEqual({
			default: "./dist/block-editor/index.js",
			import: "./dist/block-editor/index.js",
			types: "./dist/block-editor/index.d.ts",
		});
		expect(packageJson.exports?.["./blocks"]).toEqual({
			default: "./dist/blocks/index.js",
			import: "./dist/blocks/index.js",
			types: "./dist/blocks/index.d.ts",
		});
		expect(packageJson.exports?.["./blocks/bindings"]).toEqual({
			default: "./dist/blocks/bindings.js",
			import: "./dist/blocks/bindings.js",
			types: "./dist/blocks/bindings.d.ts",
		});
		expect(packageJson.exports?.["./blocks/compatibility"]).toEqual({
			default: "./dist/blocks/compatibility.js",
			import: "./dist/blocks/compatibility.js",
			types: "./dist/blocks/compatibility.d.ts",
		});
		expect(packageJson.exports?.["./blocks/registration"]).toEqual({
			default: "./dist/blocks/registration.js",
			import: "./dist/blocks/registration.js",
			types: "./dist/blocks/registration.d.ts",
		});
		expect(packageJson.exports?.["./blocks/supports"]).toEqual({
			default: "./dist/blocks/supports.js",
			import: "./dist/blocks/supports.js",
			types: "./dist/blocks/supports.d.ts",
		});
		expect(packageJson.exports?.["./blocks/variations"]).toEqual({
			default: "./dist/blocks/variations.js",
			import: "./dist/blocks/variations.js",
			types: "./dist/blocks/variations.d.ts",
		});
	});

	test("peer-free aggregate declarations compile without optional WordPress peers", () => {
		const alignmentDeclaration = readFileSync(
			resolve(packageRoot, "dist", "block-editor", "alignment.d.ts"),
			"utf8",
		);
		expect(alignmentDeclaration).not.toMatch(
			/(?:from|import\()["'](?:react|@wordpress\/block-editor)/u,
		);

		withPublishedConsumer(
			(projectRoot) => {
				writeFileSync(
					resolve(projectRoot, "consumer.ts"),
					[
						'import { BLOCK_SUPPORT_FEATURES, BLOCK_VARIATION_SCOPES, defineVariation, type BlockAttributes, type BlockVariation } from "@wp-typia/block-types";',
						'import { BLOCK_SUPPORT_FEATURES as blockFeatures, BLOCK_VARIATION_SCOPES as blockScopes, type BlockVariationDefinition } from "@wp-typia/block-types/blocks";',
						"",
						"interface DemoAttributes extends BlockAttributes {",
						"  className: string;",
						"  content: string;",
						"}",
						"",
						"const variation: BlockVariationDefinition<DemoAttributes> = {",
						"  attributes: { className: 'is-style-demo' },",
						"  example: { innerBlocks: [{ name: 'core/paragraph' }] },",
						"  isActive: ['className'],",
						"  name: 'demo',",
						"  scope: ['inserter'],",
						"  title: 'Demo',",
						"};",
						"const invalidVariation: BlockVariationDefinition<DemoAttributes> = {",
						"  // @ts-expect-error variation examples require a structured attributes object",
						"  example: 'invalid',",
						"  name: 'invalid',",
						"  title: 'Invalid',",
						"};",
						"const publicVariation: BlockVariation<DemoAttributes> = {",
						"  attributes: { className: 'is-style-demo' },",
						"  name: 'demo',",
						"  title: 'Demo',",
						"};",
						"const defined = defineVariation('core/paragraph', variation);",
						"void [BLOCK_SUPPORT_FEATURES, BLOCK_VARIATION_SCOPES, blockFeatures, blockScopes, defined, invalidVariation, publicVariation];",
						"",
					].join("\n"),
					"utf8",
				);
				writeFileSync(
					resolve(projectRoot, "tsconfig.json"),
					JSON.stringify(
						{
							compilerOptions: {
								lib: ["ES2020"],
								module: "NodeNext",
								moduleResolution: "NodeNext",
								noEmit: true,
								skipLibCheck: false,
								strict: true,
								target: "ES2020",
								types: [],
							},
							include: ["consumer.ts"],
						},
						null,
						2,
					),
					"utf8",
				);

				execFileSync(
					tscBinary,
					["--project", "tsconfig.json"],
					{
						cwd: projectRoot,
						encoding: "utf8",
						stdio: ["ignore", "inherit", "inherit"],
					},
				);
			},
			{ installWordPressBlocks: false },
		);
	});

	test("published self imports resolve through the package entrypoints with the expected runtime values", () => {
		const summary = withPublishedConsumer((projectRoot) =>
			JSON.parse(
				execFileSync(
					["node", process.execPath].includes(process.argv0)
						? process.argv0
						: "node",
					[
						"--input-type=module",
						"--eval",
						[
							"const root = await import('@wp-typia/block-types');",
							"const blockEditor = await import('@wp-typia/block-types/block-editor');",
							"const alignment = await import('@wp-typia/block-types/block-editor/alignment');",
							"const color = await import('@wp-typia/block-types/block-editor/color');",
							"const dimensions = await import('@wp-typia/block-types/block-editor/dimensions');",
							"const layout = await import('@wp-typia/block-types/block-editor/layout');",
							"const spacing = await import('@wp-typia/block-types/block-editor/spacing');",
							"const styleAttributes = await import('@wp-typia/block-types/block-editor/style-attributes');",
							"const typography = await import('@wp-typia/block-types/block-editor/typography');",
							"const blocks = await import('@wp-typia/block-types/blocks');",
							"const bindings = await import('@wp-typia/block-types/blocks/bindings');",
							"const compatibility = await import('@wp-typia/block-types/blocks/compatibility');",
							"const registration = await import('@wp-typia/block-types/blocks/registration');",
							"const supports = await import('@wp-typia/block-types/blocks/supports');",
							"const variations = await import('@wp-typia/block-types/blocks/variations');",
							"const registered = registration.registerScaffoldBlockType('wp-typia/demo', { title: 'Demo' });",
							"const definedSupports = supports.defineSupports({ minWordPress: '6.6', spacing: { padding: true }, typography: { fontSize: true } });",
							"const supportsManifest = supports.getDefinedSupportsCompatibilityManifest(definedSupports);",
							"const paragraphVariation = variations.defineVariation('core/paragraph', { allowMissingIsActive: true, name: 'demo-paragraph', title: 'Demo Paragraph', attributes: { className: 'is-style-demo' } });",
							"const variationManifest = variations.getDefinedVariationCompatibilityManifest(paragraphVariation);",
							"const variationSource = variations.createStaticBlockVariationRegistrationSource([paragraphVariation]);",
							"const profileSource = bindings.defineBindingSource({ name: 'example/profile-data', label: 'Profile Data', getValueCallback: 'example_get_profile_binding_value', minWordPress: { server: '6.5', editor: '6.7', fieldsList: '6.9', supportedAttributesFilter: '6.9' }, fields: [{ name: 'image_url', label: 'Image URL', args: { field: 'image_url' } }], bindableAttributes: [bindings.defineBindableAttributes('example/profile-card', ['imageUrl'])] });",
							"const bindingManifest = bindings.getDefinedBindingSourceCompatibilityManifest(profileSource);",
							"const bindingMetadata = bindings.defineBlockMetadataBindings({ imageUrl: { source: profileSource.name, args: { field: 'image_url' } } });",
							"const bindingPhpSource = bindings.createPhpBindingSourceRegistrationSource(profileSource);",
							"const bindingEditorSource = bindings.createEditorBindingSourceRegistrationSource(profileSource);",
							"console.log(JSON.stringify({",
							"  bindingEditorSourceHasRegistration: bindingEditorSource.includes('registerBlockBindingsSource({'),",
							"  bindingManifestFeatures: bindingManifest.supported.map((feature) => feature.feature),",
							"  bindingMetadataSource: bindingMetadata.bindings.imageUrl.source,",
							"  bindingPhpSourceHasRegistration: bindingPhpSource.includes(\"register_block_bindings_source( 'example/profile-data'\"),",
							"  definedSupportsPadding: definedSupports.spacing.padding,",
							"  definedSupportsManifestFeatures: supportsManifest.supported.map((feature) => feature.feature),",
							"  definedVariationBlockName: variations.getDefinedVariationBlockName(paragraphVariation),",
							"  definedVariationManifestFeatures: variationManifest.supported.map((feature) => feature.feature),",
							"  rootHasBindings: typeof root.defineBindingSource === 'function',",
							"  rootHasVariations: typeof root.defineVariation === 'function',",
							"  rootHasRegister: typeof root.registerScaffoldBlockType === 'function',",
							"  rootHasSupports: Array.isArray(root.BLOCK_SUPPORT_FEATURES),",
							"  blocksHasRegister: typeof blocks.registerScaffoldBlockType === 'function',",
							"  blockEditorHasSpacing: Array.isArray(blockEditor.SPACING_DIMENSIONS),",
							"  alignments: alignment.BLOCK_ALIGNMENTS,",
							"  namedColors: color.CSS_NAMED_COLORS,",
							"  aspectRatios: dimensions.ASPECT_RATIOS,",
							"  layoutTypes: layout.LAYOUT_TYPES,",
							"  manifestStatus: compatibility.createWordPressBlockApiCompatibilityManifest([{ area: 'blockSupports', feature: 'visibility' }], { minVersion: '6.8' }).unsupported[0]?.status ?? null,",
							"  spacingDimensions: spacing.SPACING_DIMENSIONS,",
							"  textDecorations: typography.TEXT_DECORATIONS,",
							"  supportsFeatures: supports.BLOCK_SUPPORT_FEATURES,",
							"  variationSourceHasRegistration: variationSource.includes('registerBlockVariation(blockName, variation);'),",
							"  variationScopes: registration.BLOCK_VARIATION_SCOPES,",
							"  registeredName: registered?.name ?? null,",
							"  registeredTitle: registered?.settings?.title ?? null,",
							"  styleAttributeKeys: Object.keys(styleAttributes),",
							"}));",
						].join(" "),
					],
					{
						cwd: projectRoot,
						encoding: "utf8",
					},
				),
			) as {
				alignments: string[];
				aspectRatios: string[];
				bindingEditorSourceHasRegistration: boolean;
				bindingManifestFeatures: string[];
				bindingMetadataSource: string;
				bindingPhpSourceHasRegistration: boolean;
				blocksHasRegister: boolean;
				blockEditorHasSpacing: boolean;
				definedVariationBlockName: string | undefined;
				definedVariationManifestFeatures: string[];
				definedSupportsManifestFeatures: string[];
				definedSupportsPadding: boolean;
				layoutTypes: string[];
				namedColors: string[];
				registeredName: string | null;
				registeredTitle: string | null;
				rootHasBindings: boolean;
				rootHasRegister: boolean;
				rootHasSupports: boolean;
				rootHasVariations: boolean;
				manifestStatus: string | null;
				spacingDimensions: string[];
				styleAttributeKeys: string[];
				supportsFeatures: string[];
				textDecorations: string[];
				variationSourceHasRegistration: boolean;
				variationScopes: string[];
			},
		);

		expect(summary.rootHasRegister).toBe(false);
		expect(summary.blocksHasRegister).toBe(false);
		expect(summary.rootHasSupports).toBe(true);
		expect(summary.rootHasVariations).toBe(true);
		expect(summary.rootHasBindings).toBe(true);
		expect(summary.bindingManifestFeatures).toEqual([
			"metadata.bindings",
			"serverRegistration",
			"editorRegistration",
			"editorFieldsList",
			"supportedAttributesFilter",
		]);
		expect(summary.bindingMetadataSource).toBe("example/profile-data");
		expect(summary.bindingPhpSourceHasRegistration).toBe(true);
		expect(summary.bindingEditorSourceHasRegistration).toBe(true);
		expect(summary.definedSupportsPadding).toBe(true);
		expect(summary.definedSupportsManifestFeatures).toEqual([
			"spacing.padding",
			"typography.fontSize",
		]);
		expect(summary.definedVariationBlockName).toBe("core/paragraph");
		expect(summary.definedVariationManifestFeatures).toEqual([
			"editorRegistration",
		]);
		expect(summary.blockEditorHasSpacing).toBe(true);
		expect(summary.alignments).toEqual(["left", "center", "right", "wide", "full"]);
		expect(summary.namedColors).toEqual([
			"transparent",
			"currentColor",
			"inherit",
			"initial",
			"unset",
		]);
		expect(summary.aspectRatios).toContain("16/9");
		expect(summary.layoutTypes).toEqual(["flow", "constrained", "flex", "grid"]);
		expect(summary.manifestStatus).toBe("unsupported");
		expect(summary.spacingDimensions).toEqual([
			"top",
			"right",
			"bottom",
			"left",
			"horizontal",
			"vertical",
		]);
		expect(summary.textDecorations).toEqual(["none", "underline", "line-through"]);
		expect(summary.supportsFeatures).toContain("interactivity");
		expect(summary.variationSourceHasRegistration).toBe(true);
		expect(summary.variationScopes).toEqual(["block", "inserter", "transform"]);
		expect(summary.registeredName).toBe("wp-typia/demo");
		expect(summary.registeredTitle).toBe("Demo");
		expect(summary.styleAttributeKeys).toEqual([]);
	});

	test("built entries preserve ESM-safe .js re-export specifiers", () => {
		const builtIndexJs = readFileSync(resolve(packageRoot, "dist/index.js"), "utf8");
		const builtIndexDts = readFileSync(resolve(packageRoot, "dist/index.d.ts"), "utf8");
		const builtBlockEditorIndexJs = readFileSync(
			resolve(packageRoot, "dist/block-editor/index.js"),
			"utf8",
		);
		const builtBlocksIndexJs = readFileSync(
			resolve(packageRoot, "dist/blocks/index.js"),
			"utf8",
		);

		expect(builtIndexJs).toContain('export * from "./block-editor/index.js";');
		expect(builtIndexJs).toContain('export * from "./blocks/index.js";');
		expect(builtIndexDts).toContain('export * from "./block-editor/index.js";');
		expect(builtIndexDts).toContain('export * from "./blocks/index.js";');
		expect(builtBlockEditorIndexJs).toContain('export * from "./alignment.js";');
		expect(builtBlockEditorIndexJs).toContain('export * from "./style-attributes.js";');
		expect(builtBlocksIndexJs).toContain('export * from "./bindings.js";');
		expect(builtBlocksIndexJs).not.toContain('export * from "./registration.js";');
		expect(builtBlocksIndexJs).toContain('export * from "./supports.js";');
		expect(builtBlocksIndexJs).toContain('export * from "./compatibility.js";');
		expect(builtBlocksIndexJs).toContain('export * from "./variations.js";');
	});
});
