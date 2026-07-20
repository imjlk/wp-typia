import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

import {
	cleanupScaffoldTempRoot,
	createScaffoldTempRoot,
	templateLayerConflictFixturePath,
	templateLayerFixturePath,
	typecheckGeneratedProject,
} from "./helpers/scaffold-test-harness.js";
import { BlockGeneratorService } from "../src/runtime/index.js";
import {
	BlockGeneratorService as BlockGeneratorServiceFromCore,
} from "../src/runtime/block-generator-service-core.js";
import {
	buildTemplateVariablesFromBlockSpec,
	createBuiltInBlockSpec,
} from "../src/runtime/block-generator-service-spec.js";
import {
	buildTemplateVariablesFromBlockSpec as buildTemplateVariablesFromFacade,
	createBuiltInBlockSpec as createBuiltInBlockSpecFromFacade,
} from "../src/runtime/block-generator-service.js";
import { getDefaultAnswers } from "../src/runtime/scaffold.js";
import type { BuiltInTemplateId } from "../src/runtime/template-registry.js";

function buildAnswers(templateId: BuiltInTemplateId) {
	return {
		...getDefaultAnswers("demo-generator-service", templateId),
		author: "Test Runner",
		description: `Demo ${templateId} block`,
		namespace: "demo-space",
		phpPrefix: "demo_space",
		slug: "demo-generator-service",
		textDomain: "demo-space",
		title: "Demo Generator Service",
	};
}

describe("BlockGeneratorService", () => {
	const tempRoot = createScaffoldTempRoot("wp-typia-block-generator-service-");

	afterAll(() => {
		cleanupScaffoldTempRoot(tempRoot);
	});

	test("block generator facade re-exports focused spec helpers and service core", () => {
		expect(BlockGeneratorService).toBe(BlockGeneratorServiceFromCore);
		expect(createBuiltInBlockSpecFromFacade).toBe(createBuiltInBlockSpec);
		expect(buildTemplateVariablesFromFacade).toBe(
			buildTemplateVariablesFromBlockSpec,
		);
	});

	test.each([
		["basic", false],
		["interactivity", false],
		["persistence", true],
		["compound", true],
	] as const)(
		"plan normalizes %s into a typed block spec",
		async (templateId, expectPersistence) => {
			const service = new BlockGeneratorService();
			const plan = await service.plan({
				answers: buildAnswers(templateId),
				dataStorageMode: expectPersistence ? "custom-table" : undefined,
				noInstall: true,
				packageManager: "npm",
				persistencePolicy: expectPersistence ? "authenticated" : undefined,
				projectDir: path.join(tempRoot, `plan-${templateId}`),
				templateId,
			});

			expect(plan.spec.template.family).toBe(templateId);
			expect(plan.spec.block.slug).toBe("demo-generator-service");
			expect(plan.spec.block.namespace).toBe("demo-space");
			expect(plan.spec.block.textDomain).toBe("demo-space");
			expect(plan.spec.project.author).toBe("Test Runner");
			expect(plan.target.packageManager).toBe("npm");
			expect(plan.target.noInstall).toBe(true);
			expect(plan.spec.persistence.enabled).toBe(expectPersistence);

			if (plan.spec.persistence.enabled) {
				expect(plan.spec.persistence.dataStorageMode).toBe("custom-table");
				expect(plan.spec.persistence.persistencePolicy).toBe("authenticated");
			}
		},
	);

	test("validate preserves built-in behavior for unsupported variants", async () => {
		const service = new BlockGeneratorService();
		const plan = await service.plan({
			answers: buildAnswers("basic"),
			noInstall: true,
			packageManager: "npm",
			projectDir: path.join(tempRoot, "variant-rejection"),
			templateId: "basic",
			variant: "hero",
		});

		await expect(service.validate({ plan })).rejects.toThrow(
			'--variant is only supported for official external template configs. Received variant "hero" for built-in template "basic".',
		);
	});

	test("validate rejects external layer ids without a layer source through the shared contract", async () => {
		const service = new BlockGeneratorService();
		const plan = await service.plan({
			answers: buildAnswers("basic"),
			externalLayerId: "acme/observability",
			noInstall: true,
			packageManager: "npm",
			projectDir: path.join(tempRoot, "external-layer-id-only"),
			templateId: "basic",
		});

		await expect(service.validate({ plan })).rejects.toThrow(
			"externalLayerId requires externalLayerSource when composing built-in template layers.",
		);
	});

	test("render exposes explicit stage intent for compound persistence scaffolds", async () => {
		const service = new BlockGeneratorService();
		const plan = await service.plan({
			answers: buildAnswers("compound"),
			dataStorageMode: "post-meta",
			noInstall: true,
			packageManager: "npm",
			persistencePolicy: "public",
			projectDir: path.join(tempRoot, "render-compound"),
			templateId: "compound",
			withMigrationUi: true,
			withTestPreset: true,
			withWpEnv: true,
		});
		const validated = await service.validate({ plan });
		const rendered = await service.render({ validated });

		expect(path.basename(rendered.templateDir)).toBe("compound");
		expect(rendered.cleanup).toBeFunction();
		expect(rendered.variables.compoundPersistenceEnabled).toBe("true");
		expect(rendered.variables.isPublicPersistencePolicy).toBe("true");
		expect(rendered.variables.isAuthenticatedPersistencePolicy).toBe("false");
		expect(rendered.variables.dataStorageMode).toBe("post-meta");
		expect(rendered.variables.blockMetadataVersion).toBe("0.1.0");
		expect(rendered.readmeContent).toContain("## Template");
		expect(rendered.gitignoreContent).toContain("node_modules/");
		expect(rendered.postRender.seedStarterManifestFiles).toBe(true);
		expect(rendered.postRender.seedPersistenceArtifacts).toBe(true);
		expect(rendered.postRender.applyLocalDevPresets).toBe(true);
		expect(rendered.postRender.applyMigrationUiCapability).toBe(true);
	});

	test("plan preserves compound persistence settings from scaffold answers", async () => {
		const service = new BlockGeneratorService();
		const plan = await service.plan({
			answers: {
				...buildAnswers("compound"),
				dataStorageMode: "post-meta",
				persistencePolicy: "public",
			},
			noInstall: true,
			packageManager: "npm",
			projectDir: path.join(tempRoot, "plan-compound-from-answers"),
			templateId: "compound",
		});

		expect(plan.spec.persistence.enabled).toBe(true);
		if (plan.spec.persistence.enabled) {
			expect(plan.spec.persistence.scope).toBe("compound-parent");
			expect(plan.spec.persistence.dataStorageMode).toBe("post-meta");
			expect(plan.spec.persistence.persistencePolicy).toBe("public");
		}
	});

	test("apply writes a built-in scaffold through the service boundary", async () => {
		const service = new BlockGeneratorService();
		const projectDir = path.join(tempRoot, "apply-basic");
		const plan = await service.plan({
			answers: buildAnswers("basic"),
			noInstall: true,
			packageManager: "npm",
			projectDir,
			templateId: "basic",
		});
		const validated = await service.validate({ plan });
		const rendered = await service.render({ validated });
		const result = await service.apply({ rendered });

		expect(result.templateId).toBe("basic");
		expect(result.selectedVariant).toBeNull();
		expect(fs.existsSync(path.join(projectDir, "src", "block.json"))).toBe(true);
		expect(fs.existsSync(path.join(projectDir, "src", "typia.manifest.json"))).toBe(
			true,
		);
		expect(fs.readFileSync(path.join(projectDir, "README.md"), "utf8")).toContain(
			"Demo Generator Service",
		);

		typecheckGeneratedProject(projectDir);
	}, { timeout: 30_000 });

	test("render composes external template layers on top of built-in shared layers", async () => {
		const service = new BlockGeneratorService();
		const projectDir = path.join(tempRoot, "apply-basic-with-layer");
		const plan = await service.plan({
			answers: buildAnswers("basic"),
			externalLayerSource: templateLayerFixturePath,
			noInstall: true,
			packageManager: "npm",
			projectDir,
			templateId: "basic",
		});
		const validated = await service.validate({ plan });
		const rendered = await service.render({ validated });
		const result = await service.apply({ rendered });

		expect(result.warnings).toContain(
			`Applied external layer "acme/basic-observability" from "${templateLayerFixturePath}".`,
		);
		expect(
			fs.existsSync(path.join(projectDir, "inc", "observability.php")),
		).toBe(true);
		expect(
			fs.readFileSync(
				path.join(projectDir, "src", "observability.ts"),
				"utf8",
			),
		).toContain("demo-generator-service-observability");
		expect(
			fs.existsSync(path.join(projectDir, "inc", "rest-shared.php")),
		).toBe(true);
		expect(
			fs.readFileSync(path.join(projectDir, "src", "types.ts"), "utf8"),
		).toContain("DemoGeneratorServiceAttributes");

		typecheckGeneratedProject(projectDir);
	}, { timeout: 30_000 });

	test("render rejects protected output conflicts from external template layers", async () => {
		const service = new BlockGeneratorService();
		const plan = await service.plan({
			answers: buildAnswers("basic"),
			externalLayerSource: templateLayerConflictFixturePath,
			noInstall: true,
			packageManager: "npm",
			projectDir: path.join(tempRoot, "apply-basic-with-conflict"),
			templateId: "basic",
		});
		const validated = await service.validate({ plan });

		await expect(service.render({ validated })).rejects.toThrow(
			'External layer "acme/conflict" writes protected output "src/types.ts".',
		);
	});

	test("render rejects compiler-derived output conflicts from external template layers", async () => {
		const layerSource = path.join(tempRoot, "compiler-output-conflict-layer");
		const layerDir = path.join(layerSource, "layers", "conflict");
		fs.mkdirSync(path.join(layerDir, "src"), { recursive: true });
		fs.writeFileSync(
			path.join(layerSource, "wp-typia.layers.json"),
			JSON.stringify({
				layers: {
					"acme/compiler-conflict": {
						path: "layers/conflict",
					},
				},
				version: 1,
			}),
			"utf8",
		);
		fs.writeFileSync(
			path.join(layerDir, "src", "typia.schema.json.mustache"),
			"{}\n",
			"utf8",
		);

		const service = new BlockGeneratorService();
		const plan = await service.plan({
			answers: buildAnswers("persistence"),
			dataStorageMode: "post-meta",
			externalLayerSource: layerSource,
			noInstall: true,
			packageManager: "npm",
			persistencePolicy: "authenticated",
			projectDir: path.join(tempRoot, "apply-persistence-with-conflict"),
			templateId: "persistence",
		});
		const validated = await service.validate({ plan });

		await expect(service.render({ validated })).rejects.toThrow(
			'External layer "acme/compiler-conflict" writes protected output "src/typia.schema.json".',
		);
	});
});
