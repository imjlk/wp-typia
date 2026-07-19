import { describe, expect, test } from "bun:test";

import {
	buildCompoundChildStarterManifestDocument,
	getStarterManifestFiles,
	stringifyStarterManifest,
} from "../../packages/wp-typia-project-tools/src/runtime/starter-manifests";
import { createTestScaffoldTemplateVariables } from "../helpers/scaffold-template-variables";

describe("starter manifest builders", () => {
	test("seeds single-block starter manifests with stable root paths and defaults", () => {
		const variables = createTestScaffoldTemplateVariables();

		expect(getStarterManifestFiles("basic", variables)).toEqual([
			{
				document: {
					attributes: expect.objectContaining({
						alignment: expect.objectContaining({
							wp: expect.objectContaining({
								defaultValue: "left",
								enum: ["left", "center", "right", "justify"],
							}),
						}),
						content: expect.objectContaining({
							typia: expect.objectContaining({
								defaultValue: "",
							}),
						}),
						schemaVersion: expect.objectContaining({
							typia: expect.objectContaining({
								defaultValue: 1,
							}),
						}),
					}),
					manifestVersion: 2,
					sourceType: "DemoBlockAttributes",
				},
				relativePath: "src/typia.manifest.json",
			},
		]);

		expect(getStarterManifestFiles("interactivity", variables)).toHaveLength(1);
		expect(getStarterManifestFiles("interactivity", variables)).toEqual([
			expect.objectContaining({
				document: expect.objectContaining({
					attributes: expect.objectContaining({
						animation: expect.objectContaining({
							wp: expect.objectContaining({
								defaultValue: "none",
								enum: ["none", "bounce", "pulse", "shake", "flip"],
							}),
						}),
						interactiveMode: expect.objectContaining({
							wp: expect.objectContaining({
								defaultValue: "click",
								enum: ["click", "hover"],
							}),
						}),
					}),
				}),
				relativePath: "src/typia.manifest.json",
			}),
		]);

		expect(getStarterManifestFiles("persistence", variables)).toHaveLength(1);
		expect(getStarterManifestFiles("persistence", variables)).toEqual([
			expect.objectContaining({
				document: expect.objectContaining({
					attributes: expect.objectContaining({
						buttonLabel: expect.objectContaining({
							typia: expect.objectContaining({
								defaultValue: "Persist Count",
							}),
						}),
						content: expect.objectContaining({
							typia: expect.objectContaining({
								defaultValue: "Demo Block persistence block",
							}),
						}),
						resourceKey: expect.objectContaining({
							typia: expect.objectContaining({
								defaultValue: "primary",
							}),
						}),
					}),
				}),
				relativePath: "src/typia.manifest.json",
			}),
		]);
	});

	test("seeds compound starter manifests for parent and hidden child blocks", () => {
		const variables = createTestScaffoldTemplateVariables({
			compoundChildTitle: "Demo Child",
			compoundPersistenceEnabled: "true",
		});
		const files = getStarterManifestFiles("compound", variables);

		expect(files).toHaveLength(2);
		expect(files[0]).toEqual({
			document: expect.objectContaining({
				attributes: expect.objectContaining({
					buttonLabel: expect.objectContaining({
						typia: expect.objectContaining({
							defaultValue: "Persist Count",
						}),
					}),
					heading: expect.objectContaining({
						typia: expect.objectContaining({
							defaultValue: "Demo Block",
						}),
					}),
					resourceKey: expect.objectContaining({
						typia: expect.objectContaining({
							defaultValue: "primary",
						}),
					}),
				}),
				sourceType: "DemoBlockAttributes",
			}),
			relativePath: "src/blocks/demo-block/typia.manifest.json",
		});
		expect(files[1]).toEqual({
			document: expect.objectContaining({
				attributes: expect.objectContaining({
					body: expect.objectContaining({
						typia: expect.objectContaining({
							defaultValue: "Add supporting details for this internal item.",
						}),
					}),
					title: expect.objectContaining({
						typia: expect.objectContaining({
							defaultValue: "Demo Child",
						}),
					}),
				}),
				sourceType: "DemoBlockItemAttributes",
			}),
			relativePath: "src/blocks/demo-block-item/typia.manifest.json",
		});
		expect(getStarterManifestFiles("remote-template", variables)).toEqual([]);
	});

	test("buildCompoundChildStarterManifestDocument supports custom placeholders", () => {
		expect(
			buildCompoundChildStarterManifestDocument(
				"FeatureCardAttributes",
				"Feature Card",
				"Add feature details.",
			),
		).toEqual({
			attributes: {
				body: {
					ts: {
						items: null,
						kind: "string",
						properties: null,
						required: true,
						union: null,
					},
					typia: {
						constraints: {
							exclusiveMaximum: null,
							exclusiveMinimum: null,
							format: null,
							maxLength: 280,
							maxItems: null,
							maximum: null,
							minLength: 1,
							minItems: null,
							minimum: null,
							multipleOf: null,
							pattern: null,
							typeTag: null,
						},
						defaultValue: "Add feature details.",
						hasDefault: true,
					},
					wp: {
						defaultValue: "Add feature details.",
						enum: null,
						hasDefault: true,
						type: "string",
					},
				},
				title: {
					ts: {
						items: null,
						kind: "string",
						properties: null,
						required: true,
						union: null,
					},
					typia: {
						constraints: {
							exclusiveMaximum: null,
							exclusiveMinimum: null,
							format: null,
							maxLength: 80,
							maxItems: null,
							maximum: null,
							minLength: 1,
							minItems: null,
							minimum: null,
							multipleOf: null,
							pattern: null,
							typeTag: null,
						},
						defaultValue: "Feature Card",
						hasDefault: true,
					},
					wp: {
						defaultValue: "Feature Card",
						enum: null,
						hasDefault: true,
						type: "string",
					},
				},
			},
			manifestVersion: 2,
			sourceType: "FeatureCardAttributes",
		});
	});

	test("stringifyStarterManifest uses canonical sync formatting", () => {
		const [manifestFile] = getStarterManifestFiles(
			"basic",
			createTestScaffoldTemplateVariables(),
		);
		const serialized = stringifyStarterManifest(manifestFile.document);

		expect(serialized.endsWith("\n")).toBe(false);
		expect(serialized).toContain("\n\t");
		expect(JSON.parse(serialized)).toEqual(manifestFile.document);
	});
});
