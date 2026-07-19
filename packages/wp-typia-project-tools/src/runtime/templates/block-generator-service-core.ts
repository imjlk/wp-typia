import {
	applyBuiltInScaffoldProjectFiles,
	buildGitignore,
	buildReadme,
} from "./scaffold-apply-utils.js";
import {
	buildBuiltInBlockArtifacts,
	type BuiltInBlockArtifact,
} from "./built-in-block-artifacts.js";
import {
	buildBuiltInCodeArtifacts,
	type BuiltInCodeArtifact,
} from "./built-in-block-code-artifacts.js";
import { stableJsonStringify } from "../shared/object-utils.js";
import { getStarterManifestFiles } from "./starter-manifests.js";
import { resolveTemplateSeed, parseTemplateLocator } from "./template-source.js";
import {
	assertExternalTemplateLayersDoNotWriteProtectedOutputs,
	resolveExternalTemplateLayers,
	type ResolvedTemplateLayerEntry,
} from "./template-layers.js";
import {
	getBuiltInTemplateOverlayDir,
	getBuiltInTemplateSharedLayerDirs,
	resolveBuiltInTemplateSource,
	resolveBuiltInTemplateSourceFromLayerDirs,
} from "./template-builtins.js";
import {
	buildTemplateVariablesFromBlockSpec,
	createBuiltInBlockSpec,
	type ApplyBlockInput,
	type BlockSpec,
	type PlanBlockInput,
	type PlanBlockResult,
	type RenderBlockInput,
	type RenderBlockResult,
	type ValidateBlockInput,
	type ValidateBlockResult,
} from "./block-generator-service-spec.js";
import type { ScaffoldProjectResult } from "./scaffold.js";
import { collectBuiltInCompilerArtifactPaths } from "./scaffold-compiler-artifacts.js";
import {
	assertBuiltInTemplateVariantAllowed,
	assertExternalLayerCompositionOptions,
} from "../cli/cli-validation.js";

const renderedArtifactCache = new WeakMap<
	RenderBlockResult,
	{
		artifacts: BuiltInBlockArtifact[];
		codeArtifacts: BuiltInCodeArtifact[];
		variablesFingerprint: string;
	}
>();

function createVariablesFingerprint(
	variables: RenderBlockResult["variables"],
): string {
	return stableJsonStringify(variables);
}

function buildProtectedTemplateOutputPaths({
	codeArtifacts,
	spec,
	variables,
	artifacts,
}: {
	artifacts: readonly BuiltInBlockArtifact[];
	codeArtifacts: readonly BuiltInCodeArtifact[];
	spec: BlockSpec;
	variables: RenderBlockResult["variables"];
}): Set<string> {
	const protectedOutputs = new Set<string>([
		".gitignore",
		"package.json",
		"scripts/add-compound-child.ts",
		"scripts/block-config.ts",
		"scripts/sync-project.ts",
		"scripts/sync-rest-contracts.ts",
		"scripts/sync-types-to-block-json.ts",
		"tsconfig.json",
		"webpack.config.js",
		`${variables.slugKebabCase}.php`,
	]);

	for (const artifact of codeArtifacts) {
		protectedOutputs.add(artifact.relativePath);
	}

	for (const artifact of artifacts) {
		protectedOutputs.add(`${artifact.relativeDir}/block.json`);
		protectedOutputs.add(`${artifact.relativeDir}/types.ts`);
	}

	for (const artifactPath of collectBuiltInCompilerArtifactPaths(
		spec.template.family,
		variables,
	)) {
		protectedOutputs.add(artifactPath);
	}

	for (const manifest of getStarterManifestFiles(spec.template.family, variables)) {
		protectedOutputs.add(manifest.relativePath);
	}

	return protectedOutputs;
}

function buildCombinedTemplateLayerDirs({
	baseLayerDirs,
	externalEntries,
	templateId,
}: {
	baseLayerDirs: readonly string[];
	externalEntries: readonly ResolvedTemplateLayerEntry[];
	templateId: BlockSpec["template"]["family"];
}): string[] {
	const orderedLayerDirs: string[] = [];
	const seenLayerDirs = new Set<string>();

	for (const layerDir of baseLayerDirs) {
		if (seenLayerDirs.has(layerDir)) {
			continue;
		}
		orderedLayerDirs.push(layerDir);
		seenLayerDirs.add(layerDir);
	}

	for (const entry of externalEntries) {
		if (seenLayerDirs.has(entry.dir)) {
			continue;
		}
		orderedLayerDirs.push(entry.dir);
		seenLayerDirs.add(entry.dir);
	}

	const overlayDir = getBuiltInTemplateOverlayDir(templateId);
	if (!seenLayerDirs.has(overlayDir)) {
		orderedLayerDirs.push(overlayDir);
	}

	return orderedLayerDirs;
}

async function runCleanupGroup(
	label: string,
	cleanups: Array<(() => Promise<void>) | undefined>,
): Promise<void> {
	const cleanupErrors: Error[] = [];
	const seen = new Set<(() => Promise<void>) | undefined>();

	for (const cleanup of cleanups) {
		if (!cleanup || seen.has(cleanup)) {
			continue;
		}
		seen.add(cleanup);
		try {
			await cleanup();
		} catch (error) {
			cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
		}
	}

	if (cleanupErrors.length > 0) {
		throw new Error(
			[
				label,
				...cleanupErrors.map((error) => `- ${error.message}`),
			].join("\n"),
		);
	}
}

export class BlockGeneratorService {
	async plan({
		allowExistingDir = false,
		alternateRenderTargets,
		answers,
		cwd = process.cwd(),
		dataStorageMode,
		externalLayerId,
		externalLayerSource,
		externalLayerSourceLabel,
		noInstall = false,
		packageManager,
		persistencePolicy,
		projectDir,
		repositoryReference,
		templateId,
		variant,
		withMigrationUi = false,
		withTestPreset = false,
		withWpEnv = false,
		wpVersion,
	}: PlanBlockInput): Promise<PlanBlockResult> {
		return {
			spec: createBuiltInBlockSpec({
				alternateRenderTargets,
				answers,
				dataStorageMode,
				persistencePolicy,
				templateId,
				withMigrationUi,
				withTestPreset,
				withWpEnv,
				wpVersion,
			}),
			target: {
				allowExistingDir,
				cwd,
				externalLayerId,
				externalLayerSource,
				externalLayerSourceLabel,
				noInstall,
				packageManager,
				projectDir,
				repositoryReference,
				variant,
			},
		};
	}

	async validate({ plan }: ValidateBlockInput): Promise<ValidateBlockResult> {
		assertExternalLayerCompositionOptions({
			externalLayerId: plan.target.externalLayerId,
			externalLayerSource: plan.target.externalLayerSource,
		});
		assertBuiltInTemplateVariantAllowed({
			templateId: plan.spec.template.family,
			variant: plan.target.variant,
		});

		return plan;
	}

	async render({ validated }: RenderBlockInput): Promise<RenderBlockResult> {
		const variables = buildTemplateVariablesFromBlockSpec(validated.spec);
		const persistenceEnabled = validated.spec.persistence.enabled;
		const artifacts = buildBuiltInBlockArtifacts({
			templateId: validated.spec.template.family,
			variables,
		});
		const codeArtifacts = buildBuiltInCodeArtifacts({
			templateId: validated.spec.template.family,
			variables,
		});
		const templateVariantOptions = {
			persistenceEnabled,
			persistencePolicy:
				validated.spec.persistence.enabled &&
				validated.spec.persistence.persistencePolicy === "public"
					? "public"
					: "authenticated",
		} as const;
		let templateSource = await resolveBuiltInTemplateSource(
			validated.spec.template.family,
			templateVariantOptions,
		);
		const warnings = [...(templateSource.warnings ?? [])];

		if (validated.target.externalLayerSource) {
			let layerSeed:
				| Awaited<ReturnType<typeof resolveTemplateSeed>>
				| undefined;
			let pendingLayerCleanup: (() => Promise<void>) | undefined;
			let pendingTemplateCleanup: (() => Promise<void>) | undefined;
			let composedCleanup: (() => Promise<void>) | undefined;
			try {
				layerSeed = await resolveTemplateSeed(
					parseTemplateLocator(validated.target.externalLayerSource),
					validated.target.cwd,
				);
				pendingLayerCleanup = layerSeed.cleanup;
				const resolvedLayers = await resolveExternalTemplateLayers({
					externalLayerId: validated.target.externalLayerId,
					sourceRoot: layerSeed.rootDir,
				});
				const baseLayerDirs = getBuiltInTemplateSharedLayerDirs(
					validated.spec.template.family,
					templateVariantOptions,
				);
				await assertExternalTemplateLayersDoNotWriteProtectedOutputs({
					externalEntries: resolvedLayers.entries,
					protectedOutputPaths: buildProtectedTemplateOutputPaths({
						artifacts,
						codeArtifacts,
						spec: validated.spec,
						variables,
						}),
						view: variables,
					});

				const previousTemplateCleanup = templateSource.cleanup;
				const nextTemplateSource = await resolveBuiltInTemplateSourceFromLayerDirs(
					validated.spec.template.family,
					buildCombinedTemplateLayerDirs({
						baseLayerDirs,
						externalEntries: resolvedLayers.entries,
						templateId: validated.spec.template.family,
					}),
				);
				pendingTemplateCleanup = nextTemplateSource.cleanup;
				await previousTemplateCleanup?.();
				templateSource = nextTemplateSource;
				composedCleanup = async () =>
					runCleanupGroup("Failed to cleanup composed template sources.", [
						pendingTemplateCleanup,
						pendingLayerCleanup,
					]);
				templateSource.cleanup = composedCleanup;
				warnings.push(
					`Applied external layer "${resolvedLayers.selectedLayerId}" from "${validated.target.externalLayerSourceLabel ?? validated.target.externalLayerSource}".`,
				);
			} catch (error) {
				try {
					if (composedCleanup) {
						await composedCleanup();
					} else {
						await runCleanupGroup(
							"Failed to cleanup partially composed template sources.",
							[
								templateSource.cleanup,
								pendingTemplateCleanup,
								pendingLayerCleanup,
							],
						);
					}
				} catch {
					// Preserve the original compose failure instead of masking it with cleanup errors.
				}
				throw error;
			}
		}

		const rendered: RenderBlockResult = {
			...validated,
			cleanup: templateSource.cleanup,
			gitignoreContent: buildGitignore(),
			postRender: {
				applyLocalDevPresets: true,
				applyMigrationUiCapability: validated.spec.runtime.withMigrationUi,
				seedPersistenceArtifacts:
					validated.spec.template.family === "persistence" ||
					(validated.spec.template.family === "compound" && persistenceEnabled),
				seedStarterManifestFiles: true,
			},
			readmeContent: buildReadme(
				validated.spec.template.family,
				variables,
				validated.target.packageManager,
				{
					withMigrationUi: validated.spec.runtime.withMigrationUi,
					withTestPreset: validated.spec.runtime.withTestPreset,
					withWpEnv: validated.spec.runtime.withWpEnv,
				},
			),
			selectedVariant: null,
			templateDir: templateSource.templateDir,
			variables,
			warnings,
		};

		renderedArtifactCache.set(rendered, {
			artifacts,
			codeArtifacts,
			variablesFingerprint: createVariablesFingerprint(variables),
		});

		return rendered;
	}

	async apply({
		rendered,
		installDependencies,
		onProgress,
		seedCompilerArtifacts = true,
	}: ApplyBlockInput): Promise<ScaffoldProjectResult> {
		const cachedArtifacts = renderedArtifactCache.get(rendered);
		const currentVariablesFingerprint = createVariablesFingerprint(
			rendered.variables,
		);
		const artifacts =
			cachedArtifacts &&
			cachedArtifacts.variablesFingerprint === currentVariablesFingerprint
				? cachedArtifacts.artifacts
				: buildBuiltInBlockArtifacts({
						templateId: rendered.spec.template.family,
						variables: rendered.variables,
					});
		const codeArtifacts =
			cachedArtifacts &&
			cachedArtifacts.variablesFingerprint === currentVariablesFingerprint
				? cachedArtifacts.codeArtifacts
				: buildBuiltInCodeArtifacts({
						templateId: rendered.spec.template.family,
						variables: rendered.variables,
					});

		let applyWarnings: string[] = [];
		try {
			applyWarnings = await applyBuiltInScaffoldProjectFiles({
				allowExistingDir: rendered.target.allowExistingDir,
				artifacts,
				codeArtifacts,
				installDependencies,
				noInstall: rendered.target.noInstall,
				onProgress,
				packageManager: rendered.target.packageManager,
				projectDir: rendered.target.projectDir,
				repositoryReference: rendered.target.repositoryReference,
				gitignoreContent: rendered.gitignoreContent,
				readmeContent: rendered.readmeContent,
				seedCompilerArtifacts,
				templateDir: rendered.templateDir,
				templateId: rendered.spec.template.family,
				variables: rendered.variables,
				withMigrationUi: rendered.spec.runtime.withMigrationUi,
				withTestPreset: rendered.spec.runtime.withTestPreset,
				withWpEnv: rendered.spec.runtime.withWpEnv,
			});
		} finally {
			await rendered.cleanup?.();
		}

		return {
			packageManager: rendered.target.packageManager,
			projectDir: rendered.target.projectDir,
			selectedVariant: rendered.selectedVariant,
			templateId: rendered.spec.template.family,
			variables: rendered.variables,
			warnings: [...rendered.warnings, ...applyWarnings],
		};
	}
}
