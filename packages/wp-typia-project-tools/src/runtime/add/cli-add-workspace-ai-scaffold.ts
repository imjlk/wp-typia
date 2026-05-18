import { promises as fsp } from "node:fs";
import path from "node:path";

import { ensureBlockConfigCanAddRestManifests } from "./cli-add-block-legacy-validator.js";
import {
	buildAiFeatureConfigEntry,
	buildAiFeatureDataSource,
	buildAiFeatureTypesSource,
	buildAiFeatureValidatorsSource,
	buildAiFeatureApiSource,
} from "./cli-add-workspace-ai-source-emitters.js";
import {
	buildAiFeatureSyncScriptSource,
} from "./cli-add-workspace-ai-sync-script-source.js";
import {
	ensureAiFeatureBootstrapAnchors,
	ensureAiFeaturePackageScripts,
	ensureAiFeatureSyncProjectAnchors,
} from "./cli-add-workspace-ai-anchors.js";
import {
	ensureAiFeatureSyncRestAnchors,
} from "./cli-add-workspace-ai-sync-rest-anchors.js";
import { buildAiFeaturePhpSource } from "./cli-add-workspace-ai-templates.js";
import { appendWorkspaceInventoryEntries } from "../workspace/workspace-inventory.js";
import {
	getWorkspaceBootstrapPath,
	patchFile,
} from "./cli-add-shared.js";
import { executeWorkspaceMutationPlan } from "./cli-add-workspace-mutation.js";
import { updatePluginHeaderCompatibility } from "../templates/scaffold-compatibility.js";
import { toPascalCase, toTitleCase } from "../shared/string-case.js";
import {
	syncAiFeatureRestArtifacts,
	syncAiFeatureSchemaArtifact,
} from "./ai-feature-artifacts.js";
import type { ScaffoldCompatibilityPolicy } from "../templates/scaffold-compatibility.js";
import type { WorkspaceProject } from "../workspace/workspace-project.js";

/**
 * Inputs required to scaffold a generated AI feature into a workspace.
 */
export interface ScaffoldAiFeatureWorkspaceOptions {
	/** Kebab-case feature slug used for file paths and route ids. */
	aiFeatureSlug: string;
	/** Compatibility metadata applied to the generated workspace bootstrap. */
	compatibilityPolicy: ScaffoldCompatibilityPolicy;
	/** WordPress REST namespace used for generated feature routes. */
	namespace: string;
	/** Resolved workspace metadata and filesystem paths for the target project. */
	workspace: WorkspaceProject;
}

/**
 * Write generated AI feature sources and patch shared workspace anchors.
 */
export async function scaffoldAiFeatureWorkspace({
	aiFeatureSlug,
	compatibilityPolicy,
	namespace,
	workspace,
}: ScaffoldAiFeatureWorkspaceOptions): Promise<{
	warnings: string[];
}> {
	const compatibilityWarnings: string[] = [];
	const blockConfigPath = path.join(workspace.projectDir, "scripts", "block-config.ts");
	const bootstrapPath = getWorkspaceBootstrapPath(workspace);
	const packageJsonPath = path.join(workspace.projectDir, "package.json");
	const syncAiScriptPath = path.join(workspace.projectDir, "scripts", "sync-ai-features.ts");
	const syncProjectScriptPath = path.join(workspace.projectDir, "scripts", "sync-project.ts");
	const syncRestScriptPath = path.join(workspace.projectDir, "scripts", "sync-rest-contracts.ts");
	const aiFeatureDir = path.join(
		workspace.projectDir,
		"src",
		"ai-features",
		aiFeatureSlug,
	);
	const typesFilePath = path.join(aiFeatureDir, "api-types.ts");
	const validatorsFilePath = path.join(aiFeatureDir, "api-validators.ts");
	const apiFilePath = path.join(aiFeatureDir, "api.ts");
	const dataFilePath = path.join(aiFeatureDir, "data.ts");
	const phpFilePath = path.join(
		workspace.projectDir,
		"inc",
		"ai-features",
		`${aiFeatureSlug}.php`,
	);
	return executeWorkspaceMutationPlan({
		filePaths: [
			blockConfigPath,
			bootstrapPath,
			packageJsonPath,
			syncAiScriptPath,
			syncProjectScriptPath,
			syncRestScriptPath,
		],
		targetPaths: [aiFeatureDir, phpFilePath, syncAiScriptPath],
		run: async () => {
			await fsp.mkdir(aiFeatureDir, { recursive: true });
			await fsp.mkdir(path.dirname(phpFilePath), { recursive: true });
			await ensureAiFeatureBootstrapAnchors(workspace);
			await patchFile(bootstrapPath, (source) =>
				updatePluginHeaderCompatibility(source, compatibilityPolicy, {
					onWarning: (warning) => {
						compatibilityWarnings.push(warning);
					},
				}),
			);
			const packageScriptChanges = await ensureAiFeaturePackageScripts(workspace);
			await ensureAiFeatureSyncProjectAnchors(workspace);
			await ensureAiFeatureSyncRestAnchors(workspace);
			await fsp.writeFile(
				syncAiScriptPath,
				buildAiFeatureSyncScriptSource(),
				"utf8",
			);
			await fsp.writeFile(typesFilePath, buildAiFeatureTypesSource(aiFeatureSlug), "utf8");
			await fsp.writeFile(
				validatorsFilePath,
				buildAiFeatureValidatorsSource(aiFeatureSlug),
				"utf8",
			);
			await fsp.writeFile(apiFilePath, buildAiFeatureApiSource(aiFeatureSlug), "utf8");
			await fsp.writeFile(dataFilePath, buildAiFeatureDataSource(aiFeatureSlug), "utf8");
			await fsp.writeFile(
				phpFilePath,
				buildAiFeaturePhpSource(
					aiFeatureSlug,
					namespace,
					workspace.workspace.phpPrefix,
					workspace.workspace.textDomain,
				),
				"utf8",
			);

			const pascalCase = toPascalCase(aiFeatureSlug);
			await syncAiFeatureRestArtifacts({
				clientFile: `src/ai-features/${aiFeatureSlug}/api-client.ts`,
				outputDir: path.join("src", "ai-features", aiFeatureSlug),
				projectDir: workspace.projectDir,
				typesFile: `src/ai-features/${aiFeatureSlug}/api-types.ts`,
				validatorsFile: `src/ai-features/${aiFeatureSlug}/api-validators.ts`,
				variables: {
					namespace,
					pascalCase,
					slugKebabCase: aiFeatureSlug,
					title: toTitleCase(aiFeatureSlug),
				},
			});
			await syncAiFeatureSchemaArtifact({
				aiSchemaFile: `src/ai-features/${aiFeatureSlug}/ai-schemas/feature-result.ai.schema.json`,
				outputDir: path.join("src", "ai-features", aiFeatureSlug),
				projectDir: workspace.projectDir,
			});
			await appendWorkspaceInventoryEntries(workspace.projectDir, {
				aiFeatureEntries: [
					buildAiFeatureConfigEntry(aiFeatureSlug, namespace),
				],
				transformSource: ensureBlockConfigCanAddRestManifests,
			});

			return {
				warnings: [
					...compatibilityWarnings,
					...(packageScriptChanges.addedProjectToolsDependency
						? [
								"Added `@wp-typia/project-tools` to devDependencies for `sync-ai`. If this workspace was already installed, rerun your package manager install command before the first `wp-typia sync ai`.",
							]
						: []),
				],
			};
		},
	});
}
