import { promises as fsp } from "node:fs";
import path from "node:path";

import { pathExists } from "../shared/fs-async.js";
import {
	assertPostMetaDoesNotExist,
	assertValidGeneratedSlug,
	assertValidPostMetaPostType,
	assertValidTypeScriptIdentifier,
	getWorkspaceBootstrapPath,
	normalizeBlockSlug,
	resolvePostMetaKey,
	type RunAddPostMetaCommandOptions,
} from "./cli-add-shared.js";
import {
	ensureContractSyncScriptAnchors,
} from "./cli-add-workspace-rest-contract-sync-anchors.js";
import {
	ensurePostMetaBootstrapAnchors,
	ensurePostMetaSyncScriptAnchors,
} from "./cli-add-workspace-post-meta-anchors.js";
import {
	buildPostMetaConfigEntry,
	buildPostMetaPhpSource,
	buildPostMetaReadmeSource,
	buildPostMetaTypesSource,
} from "./cli-add-workspace-post-meta-source-emitters.js";
import { executeWorkspaceMutationPlan } from "./cli-add-workspace-mutation.js";
import { syncStandaloneContractArtifacts } from "./contract-artifacts.js";
import {
	appendWorkspaceInventoryEntries,
	readWorkspaceInventoryAsync,
} from "../workspace/workspace-inventory.js";
import { resolveWorkspaceProject } from "../workspace/workspace-project.js";
import { toPascalCase } from "../shared/string-case.js";

const ADD_POST_META_USAGE =
	"wp-typia add post-meta <name> --post-type <post-type> [--type <ExportedTypeName>] [--meta-key <meta-key>] [--hide-from-rest]";

/**
 * Scaffold a typed WordPress post-meta contract and matching PHP registration.
 */
export async function runAddPostMetaCommand({
	cwd = process.cwd(),
	hideFromRest,
	metaKey,
	postMetaName,
	postType,
	typeName,
}: RunAddPostMetaCommandOptions): Promise<{
	metaKey: string;
	phpFile: string;
	postMetaSlug: string;
	postType: string;
	projectDir: string;
	schemaFile: string;
	showInRest: boolean;
	sourceTypeName: string;
	typesFile: string;
}> {
	const workspace = resolveWorkspaceProject(cwd);
	const postMetaSlug = assertValidGeneratedSlug(
		"Post meta name",
		normalizeBlockSlug(postMetaName),
		ADD_POST_META_USAGE,
	);
	const sourceTypeName = assertValidTypeScriptIdentifier(
		"Post meta type",
		typeName ?? `${toPascalCase(postMetaSlug)}Meta`,
		ADD_POST_META_USAGE,
	);
	const resolvedPostType = assertValidPostMetaPostType(postType);
	const resolvedMetaKey = resolvePostMetaKey({
		metaKey,
		phpPrefix: workspace.workspace.phpPrefix,
		slug: postMetaSlug,
	});
	const showInRest = !hideFromRest;

	const inventory = await readWorkspaceInventoryAsync(workspace.projectDir);
	assertPostMetaDoesNotExist(
		workspace.projectDir,
		postMetaSlug,
		resolvedPostType,
		resolvedMetaKey,
		inventory,
	);

	const blockConfigPath = path.join(workspace.projectDir, "scripts", "block-config.ts");
	const syncRestScriptPath = path.join(workspace.projectDir, "scripts", "sync-rest-contracts.ts");
	const bootstrapPath = getWorkspaceBootstrapPath(workspace);
	const postMetaRoot = path.join(workspace.projectDir, "src", "post-meta");
	const postMetaDir = path.join(postMetaRoot, postMetaSlug);
	const postMetaIncRoot = path.join(workspace.projectDir, "inc", "post-meta");
	const typesFile = `src/post-meta/${postMetaSlug}/types.ts`;
	const schemaFile = `src/post-meta/${postMetaSlug}/meta.schema.json`;
	const phpFile = `inc/post-meta/${postMetaSlug}.php`;
	const readmeFile = `src/post-meta/${postMetaSlug}/README.md`;
	const typesFilePath = path.join(workspace.projectDir, typesFile);
	const schemaFilePath = path.join(workspace.projectDir, schemaFile);
	const phpFilePath = path.join(workspace.projectDir, phpFile);
	const readmeFilePath = path.join(workspace.projectDir, readmeFile);
	const postMetaRootExisted = await pathExists(postMetaRoot);
	const postMetaIncRootExisted = await pathExists(postMetaIncRoot);

	return executeWorkspaceMutationPlan({
		filePaths: [blockConfigPath, bootstrapPath, syncRestScriptPath],
		targetPaths: [
			typesFilePath,
			schemaFilePath,
			phpFilePath,
			readmeFilePath,
			...(postMetaRootExisted ? [] : [postMetaRoot]),
			...(postMetaIncRootExisted ? [] : [postMetaIncRoot]),
		],
		run: async () => {
			await fsp.mkdir(postMetaDir, { recursive: true });
			await fsp.mkdir(postMetaIncRoot, { recursive: true });
			await ensureContractSyncScriptAnchors(workspace);
			await ensurePostMetaSyncScriptAnchors(workspace);
			await ensurePostMetaBootstrapAnchors(workspace);
			await fsp.writeFile(
				typesFilePath,
				buildPostMetaTypesSource(postMetaSlug, sourceTypeName),
				"utf8",
			);
			await syncStandaloneContractArtifacts({
				projectDir: workspace.projectDir,
				schemaFile,
				sourceTypeName,
				typesFile,
			});
			await fsp.writeFile(
				phpFilePath,
				buildPostMetaPhpSource({
					metaKey: resolvedMetaKey,
					phpPrefix: workspace.workspace.phpPrefix,
					postMetaSlug,
					postType: resolvedPostType,
					showInRest,
					textDomain: workspace.workspace.textDomain,
				}),
				"utf8",
			);
			await fsp.writeFile(
				readmeFilePath,
				buildPostMetaReadmeSource({
					metaKey: resolvedMetaKey,
					postMetaSlug,
					postType: resolvedPostType,
					sourceTypeName,
				}),
				"utf8",
			);
			await appendWorkspaceInventoryEntries(workspace.projectDir, {
				postMetaEntries: [
					buildPostMetaConfigEntry({
						metaKey: resolvedMetaKey,
						postMetaSlug,
						postType: resolvedPostType,
						showInRest,
						sourceTypeName,
					}),
				],
			});

			return {
				metaKey: resolvedMetaKey,
				phpFile,
				postMetaSlug,
				postType: resolvedPostType,
				projectDir: workspace.projectDir,
				schemaFile,
				showInRest,
				sourceTypeName,
				typesFile,
			};
		},
	});
}
