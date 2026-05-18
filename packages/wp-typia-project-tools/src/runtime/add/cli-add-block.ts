import { promises as fsp } from "node:fs";
import path from "node:path";

import {
	syncBlockMetadata,
} from "@wp-typia/block-runtime/metadata-core";

import {
	ensureMigrationDirectories,
	parseMigrationConfig,
	writeInitialMigrationScaffold,
	writeMigrationConfig,
} from "../migration/migration-project.js";
import {
	syncPersistenceRestArtifacts,
} from "./persistence-rest-artifacts.js";
import { snapshotProjectVersion } from "../migration/migrations.js";
import { getDefaultAnswers, scaffoldProject } from "../templates/scaffold.js";
import type { ScaffoldTemplateVariables } from "../templates/scaffold.js";
import {
	copyInterpolatedDirectory,
	listInterpolatedDirectoryOutputs,
} from "../templates/template-render.js";
import type { MigrationBlockConfig } from "../migration/migration-types.js";
import {
	appendWorkspaceInventoryEntries,
} from "../workspace/workspace-inventory.js";
import { createManagedTempRoot } from "../shared/temp-roots.js";
import {
	resolveWorkspaceProject,
} from "../workspace/workspace-project.js";
import {
	ADD_BLOCK_TEMPLATE_IDS,
	type AddBlockTemplateId,
	buildWorkspacePhpPrefix,
	isAddBlockTemplateId,
	patchFile,
	readOptionalFile,
	type RunAddBlockCommandOptions,
	rollbackWorkspaceMutation,
	type WorkspaceMutationSnapshot,
	snapshotWorkspaceFiles,
	suggestAddBlockTemplateId,
} from "./cli-add-shared.js";
import {
	resolveNonEmptyNormalizedBlockSlug,
} from "../templates/scaffold-identifiers.js";
import {
	buildConfigEntries,
	buildMigrationBlocks,
	buildServerTemplateRoot,
} from "./cli-add-block-config.js";
import {
	COMPOUND_SHARED_SUPPORT_FILES,
	collectLegacyCompoundValidatorPaths,
	ensureBlockConfigCanAddRestManifests,
	ensureCompoundWorkspaceSupportFiles,
} from "./cli-add-block-legacy-validator.js";
import {
	parseTemplateLocator,
	resolveTemplateSeed,
} from "../templates/template-source.js";
import {
	resolveExternalTemplateLayers,
} from "../templates/template-layers.js";
import {
	formatInstallCommand,
	type PackageManagerId,
} from "../shared/package-managers.js";
import { parseCompoundInnerBlocksPreset } from "./compound-inner-blocks.js";
import { isCompoundPersistenceEnabled } from "../templates/scaffold-template-variable-groups.js";
import {
	resolveOptionalInteractiveExternalLayerId,
} from "../templates/external-layer-selection.js";
import { parseAlternateRenderTargets } from "./alternate-render-targets.js";
import {
	assertExternalLayerCompositionOptions,
	normalizeOptionalCliString,
	resolveLocalCliPathOption,
} from "../cli/cli-validation.js";
import { pathExists } from "../shared/fs-async.js";

const COLLECTION_IMPORT_LINE = "import '../../collection';";
// This is a lightweight preflight heuristic for the common install layouts:
// node_modules for npm/pnpm/bun/yarn-classic and Yarn PnP marker files.
// It intentionally favors fast user guidance over exhaustive detection, so
// stale node_modules or hoisted installs outside the workspace root can still
// fall through to deeper resolver errors.
const WORKSPACE_INSTALL_MARKERS = ["node_modules", ".pnp.cjs", ".pnp.loader.mjs"] as const;

async function ensureCollectionImport(filePath: string): Promise<void> {
	await patchFile(filePath, (source) => {
		if (source.includes(COLLECTION_IMPORT_LINE)) {
			return source;
		}
		if (source.includes("import metadata from './block-metadata';")) {
			return source.replace(
				"import metadata from './block-metadata';",
				`${COLLECTION_IMPORT_LINE}\nimport metadata from './block-metadata';`,
			);
		}
		if (source.includes("import metadata from './block.json';")) {
			return source.replace(
				"import metadata from './block.json';",
				`${COLLECTION_IMPORT_LINE}\nimport metadata from './block.json';`,
			);
		}
		return `${COLLECTION_IMPORT_LINE}\n${source}`;
	});
}

async function copyTempDirectory(sourceDir: string, targetDir: string): Promise<void> {
	await fsp.mkdir(path.dirname(targetDir), { recursive: true });
	await fsp.cp(sourceDir, targetDir, { recursive: true });
}

async function addCollectionImportsForTemplate(
	projectDir: string,
	templateId: AddBlockTemplateId,
	variables: ScaffoldTemplateVariables,
): Promise<void> {
	if (templateId === "compound") {
		await ensureCollectionImport(
			path.join(projectDir, "src", "blocks", variables.slugKebabCase, "index.tsx"),
		);
		await ensureCollectionImport(
			path.join(projectDir, "src", "blocks", `${variables.slugKebabCase}-item`, "index.tsx"),
		);
		return;
	}

	await ensureCollectionImport(
		path.join(projectDir, "src", "blocks", variables.slugKebabCase, "index.tsx"),
	);
}

async function appendBlockConfigEntries(
	projectDir: string,
	entries: string[],
	needsRestManifestImport: boolean,
): Promise<void> {
	await appendWorkspaceInventoryEntries(projectDir, {
		blockEntries: entries,
		transformSource: needsRestManifestImport ? ensureBlockConfigCanAddRestManifests : undefined,
	});
}

async function renderWorkspacePersistenceServerModule(
	projectDir: string,
	variables: ScaffoldTemplateVariables,
): Promise<void> {
	const targetDir = path.join(projectDir, "src", "blocks", variables.slugKebabCase);
	const templateDir = buildServerTemplateRoot(variables.persistencePolicy);
	await copyInterpolatedDirectory(templateDir, targetDir, variables);
}

async function hasInstalledWorkspaceDependencies(projectDir: string): Promise<boolean> {
	for (const marker of WORKSPACE_INSTALL_MARKERS) {
		if (await pathExists(path.join(projectDir, marker))) {
			return true;
		}
	}
	return false;
}

async function assertWorkspaceDependenciesInstalled(workspace: {
	packageManager: PackageManagerId;
	projectDir: string;
}): Promise<void> {
	if (await hasInstalledWorkspaceDependencies(workspace.projectDir)) {
		return;
	}

	throw new Error(
		`Workspace dependencies have not been installed yet. Run \`${formatInstallCommand(workspace.packageManager)}\` from the workspace root before using \`wp-typia add block ...\`.`,
	);
}

function getMistypedAddBlockTemplateMessage(templateId: string): string | null {
	const suggestion = suggestAddBlockTemplateId(templateId);
	if (!suggestion) {
		return null;
	}

	return `Unknown add-block template "${templateId}". Did you mean "${suggestion}"? Use \`--template ${suggestion}\`, or run \`wp-typia templates list\` to inspect available templates.`;
}

async function copyScaffoldedBlockSlice(
	projectDir: string,
	templateId: AddBlockTemplateId,
	tempProjectDir: string,
	variables: ScaffoldTemplateVariables,
	legacyValidatorPaths: readonly string[] = [],
): Promise<void> {
	if (templateId === "compound") {
		await ensureCompoundWorkspaceSupportFiles(
			projectDir,
			tempProjectDir,
			legacyValidatorPaths,
		);
		await copyTempDirectory(
			path.join(tempProjectDir, "src", "blocks", variables.slugKebabCase),
			path.join(projectDir, "src", "blocks", variables.slugKebabCase),
		);
		await copyTempDirectory(
			path.join(tempProjectDir, "src", "blocks", `${variables.slugKebabCase}-item`),
			path.join(projectDir, "src", "blocks", `${variables.slugKebabCase}-item`),
		);
		if (isCompoundPersistenceEnabled(variables)) {
			await renderWorkspacePersistenceServerModule(projectDir, variables);
		}
		return;
	}

	await copyTempDirectory(
		path.join(tempProjectDir, "src"),
		path.join(projectDir, "src", "blocks", variables.slugKebabCase),
	);

	if (templateId === "persistence") {
		await renderWorkspacePersistenceServerModule(projectDir, variables);
	}
}

function isSupportedAddBlockLayerOutput(options: {
	relativePath: string;
	templateId: AddBlockTemplateId;
	variables: ScaffoldTemplateVariables;
}): boolean {
	const { relativePath, templateId, variables } = options;
	if (templateId === "compound") {
		return (
			relativePath === "src/hooks.ts" ||
			relativePath === "src/validator-toolkit.ts" ||
			relativePath.startsWith(`src/blocks/${variables.slugKebabCase}/`) ||
			relativePath.startsWith(`src/blocks/${variables.slugKebabCase}-item/`)
		);
	}

	return relativePath.startsWith("src/");
}

async function assertAddBlockSupportsExternalLayerOutputs(options: {
	callerCwd: string;
	externalLayerId?: string;
	externalLayerSource?: string;
	templateId: AddBlockTemplateId;
	variables: ScaffoldTemplateVariables;
}): Promise<void> {
	const {
		callerCwd,
		externalLayerId,
		externalLayerSource,
		templateId,
		variables,
	} = options;
	if (!externalLayerSource) {
		return;
	}

	const layerSeed = await resolveTemplateSeed(
		parseTemplateLocator(externalLayerSource),
		callerCwd,
	);
	try {
		const resolvedLayers = await resolveExternalTemplateLayers({
			externalLayerId,
			sourceRoot: layerSeed.rootDir,
		});

		for (const entry of resolvedLayers.entries) {
			if (entry.kind !== "external") {
				continue;
			}

			for (const relativePath of await listInterpolatedDirectoryOutputs(
				entry.dir,
				variables,
			)) {
				if (
					isSupportedAddBlockLayerOutput({
						relativePath,
						templateId,
						variables,
					})
				) {
					continue;
				}

				throw new Error(
					`External layer "${entry.id}" writes workspace-level output "${relativePath}", which \`wp-typia add block\` cannot merge safely. Restrict the layer to block-local files or scaffold it through \`wp-typia create\` instead.`,
				);
			}
		}
	} finally {
		await layerSeed.cleanup?.();
	}
}

function collectWorkspaceBlockPaths(
	projectDir: string,
	templateId: AddBlockTemplateId,
	variables: ScaffoldTemplateVariables,
): string[] {
	if (templateId === "compound") {
		return [
			path.join(projectDir, "src", "blocks", variables.slugKebabCase),
			path.join(projectDir, "src", "blocks", `${variables.slugKebabCase}-item`),
		];
	}

	return [path.join(projectDir, "src", "blocks", variables.slugKebabCase)];
}

async function assertBlockTargetsDoNotExist(
	projectDir: string,
	templateId: AddBlockTemplateId,
	variables: ScaffoldTemplateVariables,
): Promise<void> {
	for (const targetPath of collectWorkspaceBlockPaths(projectDir, templateId, variables)) {
		if (await pathExists(targetPath)) {
			throw new Error(
				`A block already exists at ${path.relative(projectDir, targetPath)}. Choose a different name.`,
			);
		}
	}
}

async function updateWorkspaceMigrationConfigIfPresent(
	projectDir: string,
	newBlocks: MigrationBlockConfig[],
): Promise<void> {
	const configPath = path.join(projectDir, "src", "migrations", "config.ts");
	const configSource = await readOptionalFile(configPath);
	if (configSource === null) {
		return;
	}

	const config = parseMigrationConfig(configSource);
	const existingBlocks = Array.isArray(config.blocks) ? config.blocks : [];
	const nextBlocks = [
		...existingBlocks,
		...newBlocks.filter(
			(block) => !existingBlocks.some((existing) => existing.key === block.key),
		),
	];

	writeMigrationConfig(projectDir, {
		...config,
		blocks: nextBlocks,
	});

	snapshotProjectVersion(projectDir, config.currentMigrationVersion, {
		skipConfigUpdate: true,
	});
}

async function syncWorkspaceBlockMetadata(
	projectDir: string,
	slug: string,
	sourceTypeName: string,
	typesFile: string,
): Promise<void> {
	await syncBlockMetadata(
		{
			blockJsonFile: path.join("src", "blocks", slug, "block.json"),
			jsonSchemaFile: path.join("src", "blocks", slug, "typia.schema.json"),
			manifestFile: path.join("src", "blocks", slug, "typia.manifest.json"),
			openApiFile: path.join("src", "blocks", slug, "typia.openapi.json"),
			projectRoot: projectDir,
			sourceTypeName,
			typesFile,
		},
	);
}

async function syncWorkspacePersistenceArtifacts(
	projectDir: string,
	variables: ScaffoldTemplateVariables,
): Promise<void> {
	await syncPersistenceRestArtifacts({
		apiTypesFile: path.join("src", "blocks", variables.slugKebabCase, "api-types.ts"),
		outputDir: path.join("src", "blocks", variables.slugKebabCase),
		projectDir,
		variables,
	});
}

async function syncWorkspaceAddedBlockArtifacts(
	projectDir: string,
	templateId: AddBlockTemplateId,
	variables: ScaffoldTemplateVariables,
): Promise<void> {
	await syncWorkspaceBlockMetadata(
		projectDir,
		variables.slugKebabCase,
		`${variables.pascalCase}Attributes`,
		path.join("src", "blocks", variables.slugKebabCase, "types.ts"),
	);

	if (templateId === "compound") {
		await syncWorkspaceBlockMetadata(
			projectDir,
			`${variables.slugKebabCase}-item`,
			`${variables.pascalCase}ItemAttributes`,
			path.join("src", "blocks", `${variables.slugKebabCase}-item`, "types.ts"),
		);
	}

	if (
		templateId === "persistence" ||
		(templateId === "compound" && isCompoundPersistenceEnabled(variables))
	) {
		await syncWorkspacePersistenceArtifacts(projectDir, variables);
	}
}

function assertPersistenceFlagsAllowed(
	templateId: AddBlockTemplateId,
	options: Pick<
		RunAddBlockCommandOptions,
		"alternateRenderTargets" | "dataStorageMode" | "persistencePolicy"
	>,
): void {
	const hasPersistenceFlags =
		typeof options.alternateRenderTargets === "string" ||
		typeof options.dataStorageMode === "string" ||
		typeof options.persistencePolicy === "string";

	if (!hasPersistenceFlags) {
		return;
	}

	if (templateId === "persistence" || templateId === "compound") {
		parseAlternateRenderTargets(options.alternateRenderTargets);
		if (
			typeof options.dataStorageMode === "string" &&
			options.dataStorageMode !== "custom-table" &&
			options.dataStorageMode !== "post-meta"
		) {
			throw new Error(
				`Unsupported data storage mode "${options.dataStorageMode}". Expected one of: post-meta, custom-table.`,
			);
		}
		if (
			typeof options.persistencePolicy === "string" &&
			options.persistencePolicy !== "authenticated" &&
			options.persistencePolicy !== "public"
		) {
			throw new Error(
				`Unsupported persistence policy "${options.persistencePolicy}". Expected one of: authenticated, public.`,
			);
		}
		if (
			templateId === "compound" &&
			typeof options.alternateRenderTargets === "string" &&
			!options.dataStorageMode &&
			!options.persistencePolicy
		) {
			throw new Error(
				"`--alternate-render-targets` on `wp-typia add block --template compound` requires the persistence-enabled server render path. Add `--data-storage <post-meta|custom-table>` or `--persistence-policy <authenticated|public>` first.",
			);
		}
		return;
	}

	throw new Error(
		`--data-storage, --persistence-policy, and --alternate-render-targets are supported only for \`wp-typia add block --template persistence\` or persistence-enabled \`--template compound\`.`,
	);
}

function assertCompoundInnerBlocksPresetAllowed(
	templateId: AddBlockTemplateId,
	innerBlocksPreset?: string,
): void {
	if (!innerBlocksPreset) {
		return;
	}

	if (templateId !== "compound") {
		throw new Error(
			"`--inner-blocks-preset` is supported only for `wp-typia add block --template compound`.",
		);
	}

	parseCompoundInnerBlocksPreset(innerBlocksPreset);
}

/**
 * Seeds an empty official workspace migration project before any blocks are added.
 *
 * @param projectDir Absolute path to the workspace root that will own the
 * migration config and generated scaffold files.
 * @param currentMigrationVersion Initial migration label to record as the
 * current version in the seeded workspace.
 */
export async function seedWorkspaceMigrationProject(
	projectDir: string,
	currentMigrationVersion: string,
): Promise<void> {
	writeMigrationConfig(projectDir, {
		blocks: [],
		currentMigrationVersion,
		snapshotDir: "src/migrations/versions",
		supportedMigrationVersions: [currentMigrationVersion],
	});
	ensureMigrationDirectories(projectDir, []);
	writeInitialMigrationScaffold(projectDir, currentMigrationVersion, []);
}

/**
 * Adds one built-in block slice to an official workspace project.
 *
 * @param options Command options for the built-in workspace block scaffold flow.
 * @param options.blockName Human-entered block name that will be normalized
 * into the generated workspace block slug.
 * @param options.cwd Working directory used to resolve the nearest official
 * workspace. Defaults to `process.cwd()`.
 * @param options.dataStorageMode Optional storage mode for persistence-capable
 * templates.
 * @param options.innerBlocksPreset Optional compound-only InnerBlocks preset
 * (`freeform`, `ordered`, `horizontal`, or `locked-structure`) that controls
 * the generated authoring defaults for nested compound containers.
 * @param options.persistencePolicy Optional persistence policy for
 * persistence-capable templates.
 * @param options.templateId Built-in block family to scaffold. Defaults to
 * `"basic"`.
 * @returns A promise that resolves with the created block slugs, the owning
 * project directory, and the resolved template id after workspace mutation
 * succeeds.
 * @throws {Error} When the template id is unknown, persistence flags are used
 * with unsupported templates, the command runs outside an official workspace,
 * workspace dependencies have not been installed yet, or target block paths
 * already exist.
 */
export async function runAddBlockCommand({
	alternateRenderTargets,
	blockName,
	cwd = process.cwd(),
	dataStorageMode,
	externalLayerId,
	externalLayerSource,
	innerBlocksPreset,
	persistencePolicy,
	selectExternalLayerId,
	templateId = "basic",
}: RunAddBlockCommandOptions): Promise<{
	blockSlugs: string[];
	projectDir: string;
	templateId: AddBlockTemplateId;
	warnings: string[];
}> {
	if (templateId === "query-loop") {
		throw new Error(
			"`wp-typia add block --template query-loop` is not supported. Query Loop is a create-time `core/query` variation scaffold, so use `wp-typia create <project-dir> --template query-loop` instead.",
		);
	}
	if (!isAddBlockTemplateId(templateId)) {
		const mistypedAddBlockTemplateMessage =
			getMistypedAddBlockTemplateMessage(templateId);
		if (mistypedAddBlockTemplateMessage) {
			throw new Error(mistypedAddBlockTemplateMessage);
		}

		throw new Error(
			`Unknown add-block template "${templateId}". Expected one of: ${ADD_BLOCK_TEMPLATE_IDS.join(", ")}. Run \`wp-typia templates list\` to inspect available templates.`,
		);
	}
	const resolvedTemplateId = templateId;

	assertPersistenceFlagsAllowed(resolvedTemplateId, {
		alternateRenderTargets,
		dataStorageMode,
		persistencePolicy,
	});
	assertCompoundInnerBlocksPresetAllowed(
		resolvedTemplateId,
		innerBlocksPreset,
	);
	const resolvedInnerBlocksPreset =
		parseCompoundInnerBlocksPreset(innerBlocksPreset);

	const workspace = resolveWorkspaceProject(cwd);
	await assertWorkspaceDependenciesInstalled(workspace);
	const normalizedExternalLayerId = normalizeOptionalCliString(externalLayerId);
	const normalizedExternalLayerSource = resolveLocalCliPathOption({
		cwd,
		label: "--external-layer-source",
		value: externalLayerSource,
	});
	assertExternalLayerCompositionOptions({
		externalLayerId: normalizedExternalLayerId,
		externalLayerSource: normalizedExternalLayerSource,
	});
	const resolvedExternalLayerSelection =
		await resolveOptionalInteractiveExternalLayerId({
		callerCwd: cwd,
		externalLayerId: normalizedExternalLayerId,
		externalLayerSource: normalizedExternalLayerSource,
		selectExternalLayerId,
	});
	let tempRoot = "";
	let cleanupTempRoot: (() => Promise<void>) | undefined;

	try {
		const normalizedSlug = resolveNonEmptyNormalizedBlockSlug({
			input: blockName,
			label: "Block name",
			usage: "wp-typia add block <name> --template <family>",
		});

		const defaults = getDefaultAnswers(normalizedSlug, resolvedTemplateId);
		({
			path: tempRoot,
			cleanup: cleanupTempRoot,
		} = await createManagedTempRoot("wp-typia-add-block-"));
		const tempProjectDir = path.join(tempRoot, normalizedSlug);
		const blockConfigPath = path.join(workspace.projectDir, "scripts", "block-config.ts");
		const migrationConfigPath = path.join(workspace.projectDir, "src", "migrations", "config.ts");
		const blockPhpPrefix = buildWorkspacePhpPrefix(
			workspace.workspace.phpPrefix,
			normalizedSlug,
		);
		const migrationConfigSource = await readOptionalFile(migrationConfigPath);
		const migrationConfig =
			migrationConfigSource === null ? null : parseMigrationConfig(migrationConfigSource);
		const compoundSupportPaths =
			resolvedTemplateId === "compound"
				? COMPOUND_SHARED_SUPPORT_FILES.map((fileName) =>
						path.join(workspace.projectDir, "src", fileName),
					)
				: [];
		const legacyCompoundValidatorPaths =
			resolvedTemplateId === "compound"
				? await collectLegacyCompoundValidatorPaths(workspace.projectDir)
				: [];
		const result = await (async () => {
			const scaffoldResult = await scaffoldProject({
				alternateRenderTargets,
				answers: {
					...defaults,
					author: workspace.author,
					compoundInnerBlocksPreset: resolvedInnerBlocksPreset,
					namespace: workspace.workspace.namespace,
					phpPrefix: blockPhpPrefix,
					slug: normalizedSlug,
					textDomain: workspace.workspace.textDomain,
					title: defaults.title,
				},
				cwd: workspace.projectDir,
				dataStorageMode: dataStorageMode as "custom-table" | "post-meta" | undefined,
				externalLayerId:
					resolvedExternalLayerSelection.externalLayerId,
				externalLayerSource:
					resolvedExternalLayerSelection.externalLayerSource,
				externalLayerSourceLabel: normalizedExternalLayerSource,
				noInstall: true,
				packageManager: workspace.packageManager,
				persistencePolicy:
					persistencePolicy as "authenticated" | "public" | undefined,
				projectDir: tempProjectDir,
				templateId: resolvedTemplateId,
			});
			await assertAddBlockSupportsExternalLayerOutputs({
				callerCwd: cwd,
				externalLayerId:
					resolvedExternalLayerSelection.externalLayerId,
				externalLayerSource:
					resolvedExternalLayerSelection.externalLayerSource,
				templateId: resolvedTemplateId,
				variables: scaffoldResult.variables,
			});
			return scaffoldResult;
		})();
		await assertBlockTargetsDoNotExist(
			workspace.projectDir,
			resolvedTemplateId,
			result.variables,
		);
		const mutationSnapshot: WorkspaceMutationSnapshot = {
			fileSources: await snapshotWorkspaceFiles([
				blockConfigPath,
				migrationConfigPath,
				...compoundSupportPaths,
				...legacyCompoundValidatorPaths,
			]),
			snapshotDirs:
				migrationConfig === null
					? []
					: buildMigrationBlocks(resolvedTemplateId, result.variables).map((block) =>
						path.join(
							workspace.projectDir,
							...migrationConfig.snapshotDir.split("/"),
							migrationConfig.currentMigrationVersion,
							block.key,
						),
					),
			targetPaths: collectWorkspaceBlockPaths(
				workspace.projectDir,
				resolvedTemplateId,
				result.variables,
			),
		};

		try {
			await copyScaffoldedBlockSlice(
				workspace.projectDir,
				resolvedTemplateId,
				tempProjectDir,
				result.variables,
				legacyCompoundValidatorPaths,
			);
			await addCollectionImportsForTemplate(
				workspace.projectDir,
				resolvedTemplateId,
				result.variables,
			);
			await appendBlockConfigEntries(
				workspace.projectDir,
				buildConfigEntries(resolvedTemplateId, result.variables),
				resolvedTemplateId === "persistence" ||
					(resolvedTemplateId === "compound" &&
						isCompoundPersistenceEnabled(result.variables)),
			);
			await syncWorkspaceAddedBlockArtifacts(
				workspace.projectDir,
				resolvedTemplateId,
				result.variables,
			);
			await updateWorkspaceMigrationConfigIfPresent(
				workspace.projectDir,
				buildMigrationBlocks(resolvedTemplateId, result.variables),
			);

			return {
				blockSlugs: collectWorkspaceBlockPaths(
					workspace.projectDir,
					resolvedTemplateId,
					result.variables,
				).map((targetPath) => path.basename(targetPath)),
				projectDir: workspace.projectDir,
				templateId: resolvedTemplateId,
				warnings: result.warnings,
			};
		} catch (error) {
			await rollbackWorkspaceMutation(mutationSnapshot);
			throw error;
		}
	} finally {
		try {
			await resolvedExternalLayerSelection.cleanup?.();
		} finally {
			await cleanupTempRoot?.();
		}
	}
}
