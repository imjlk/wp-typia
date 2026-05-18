import path from "node:path";

import { patchFile } from "./cli-add-shared.js";
import {
	buildNoResourcesGuard,
	getSyncRestPatchErrorMessage,
	replaceBlockConfigImport,
	replaceNoResourcesGuard,
} from "./cli-add-workspace-rest-sync-script-shared.js";
import type { WorkspaceProject } from "../workspace/workspace-project.js";

function replaceRequiredContractSyncRestSource(
	nextSource: string,
	target: string,
	anchor: string | RegExp,
	replacement: string,
	anchorDescription: string,
	syncRestScriptPath: string,
): string {
	if (nextSource.includes(target)) {
		return nextSource;
	}

	const hasAnchor =
		typeof anchor === "string" ? nextSource.includes(anchor) : anchor.test(nextSource);
	if (!hasAnchor) {
		throw new Error(
			getSyncRestPatchErrorMessage(
				"ensureContractSyncScriptAnchors",
				syncRestScriptPath,
				anchorDescription,
				"CONTRACTS",
			),
		);
	}

	return nextSource.replace(anchor, replacement);
}

function insertStandaloneContractFilter(nextSource: string, syncRestScriptPath: string): string {
	if (nextSource.includes("const standaloneContracts = CONTRACTS.filter")) {
		return nextSource;
	}

	const restResourcesFilter =
		"const restResources = REST_RESOURCES.filter( isWorkspaceRestResource );";
	if (nextSource.includes(restResourcesFilter)) {
		return nextSource.replace(
			restResourcesFilter,
			[
				"const standaloneContracts = CONTRACTS.filter( isWorkspaceStandaloneContract );",
				restResourcesFilter,
			].join("\n\t"),
		);
	}

	const restBlocksFilter = "const restBlocks = BLOCKS.filter( isRestEnabledBlock );";
	return replaceRequiredContractSyncRestSource(
		nextSource,
		"const standaloneContracts = CONTRACTS.filter",
		restBlocksFilter,
		[
			restBlocksFilter,
			"const standaloneContracts = CONTRACTS.filter( isWorkspaceStandaloneContract );",
		].join("\n\t"),
		"restBlocks filter",
		syncRestScriptPath,
	);
}

function insertStandaloneContractNoResourcesGuard(
	nextSource: string,
	syncRestScriptPath: string,
): string {
	const hasRestResources = nextSource.includes(
		"const restResources = REST_RESOURCES.filter( isWorkspaceRestResource );",
	);
	const hasAiFeatures = nextSource.includes(
		"const aiFeatures = AI_FEATURES.filter( isWorkspaceAiFeature );",
	);
	const hasPostMeta = nextSource.includes(
		"const postMetaContracts = POST_META.filter( isWorkspacePostMetaContract );",
	);

	return replaceNoResourcesGuard(
		nextSource,
		buildNoResourcesGuard({
			subjects: [
				{
					condition: "restBlocks.length === 0",
					include: true,
					subject: "REST-enabled workspace blocks",
				},
				{
					condition: "standaloneContracts.length === 0",
					include: true,
					subject: "standalone contracts",
				},
				{
					condition: "postMetaContracts.length === 0",
					include: hasPostMeta,
					subject: "post meta contracts",
				},
				{
					condition: "restResources.length === 0",
					include: hasRestResources,
					subject: "plugin-level REST resources",
				},
				{
					condition: "aiFeatures.length === 0",
					include: hasAiFeatures,
					subject: "AI features",
				},
			],
		}),
		"ensureContractSyncScriptAnchors",
		syncRestScriptPath,
		"CONTRACTS",
	);
}

function insertStandaloneContractSyncLoop(
	nextSource: string,
	syncRestScriptPath: string,
): string {
	if (nextSource.includes("for ( const contract of standaloneContracts )")) {
		return nextSource;
	}

	const loopSource = [
		"\tfor ( const contract of standaloneContracts ) {",
		"\t\tawait syncTypeSchemas(",
		"\t\t\t{",
		"\t\t\t\tjsonSchemaFile: contract.schemaFile,",
		"\t\t\t\tsourceTypeName: contract.sourceTypeName,",
		"\t\t\t\ttypesFile: contract.typesFile,",
		"\t\t\t},",
		"\t\t\t{",
		"\t\t\t\tcheck: options.check,",
		"\t\t\t}",
		"\t\t);",
		"\t}",
	].join("\n");
	const resourceLoopAnchor = "\n\tfor ( const resource of restResources ) {";
	if (nextSource.includes(resourceLoopAnchor)) {
		return nextSource.replace(
			resourceLoopAnchor,
			`\n${loopSource}\n${resourceLoopAnchor}`,
		);
	}

	const consoleLogPattern = /\n\tconsole\.log\(\n\t\toptions\.check/u;
	return replaceRequiredContractSyncRestSource(
		nextSource,
		"for ( const contract of standaloneContracts )",
		consoleLogPattern,
		[
			"",
			loopSource,
			"",
			"\tconsole.log(",
			"\t\toptions.check",
		].join("\n"),
		"success log insertion point",
		syncRestScriptPath,
	);
}

/**
 * Ensure sync-rest can repair and validate standalone workspace contracts.
 *
 * @param workspace Workspace project whose sync-rest script should be patched.
 * @returns A promise that resolves after the sync-rest script is updated.
 * @throws When the generated sync-rest anchors cannot be found.
 */
export async function ensureContractSyncScriptAnchors(
	workspace: WorkspaceProject,
): Promise<void> {
	const syncRestScriptPath = path.join(workspace.projectDir, "scripts", "sync-rest-contracts.ts");

	await patchFile(syncRestScriptPath, (source) => {
		let nextSource = replaceBlockConfigImport({
			functionName: "ensureContractSyncScriptAnchors",
			nextSource: source,
			subject: {
				configTypeName: "WorkspaceContractConfig",
				constName: "CONTRACTS",
			},
			syncRestScriptPath,
		});
		const helperInsertionAnchor = "async function assertTypeArtifactsCurrent";

		nextSource = replaceRequiredContractSyncRestSource(
			nextSource,
			"function isWorkspaceStandaloneContract(",
			helperInsertionAnchor,
			[
				"function isWorkspaceStandaloneContract(",
				"\tcontract: WorkspaceContractConfig",
				"): contract is WorkspaceContractConfig & {",
				"\tschemaFile: string;",
				"\tsourceTypeName: string;",
				"\ttypesFile: string;",
				"} {",
				"\treturn (",
				"\t\ttypeof contract.schemaFile === 'string' &&",
				"\t\ttypeof contract.sourceTypeName === 'string' &&",
				"\t\ttypeof contract.typesFile === 'string'",
				"\t);",
				"}",
				"",
				"async function assertTypeArtifactsCurrent",
			].join("\n"),
			"type artifact assertion helper",
			syncRestScriptPath,
		);
		nextSource = insertStandaloneContractFilter(nextSource, syncRestScriptPath);
		nextSource = insertStandaloneContractNoResourcesGuard(
			nextSource,
			syncRestScriptPath,
		);
		nextSource = insertStandaloneContractSyncLoop(nextSource, syncRestScriptPath);
		nextSource = nextSource.replace(
			"✅ REST contract schemas, portable API clients, and endpoint-aware OpenAPI documents are already up to date for workspace blocks and plugin-level resources!",
			"✅ REST contract schemas, standalone schemas, portable API clients, and endpoint-aware OpenAPI documents are already up to date for workspace blocks, standalone contracts, and plugin-level resources!",
		);
		nextSource = nextSource.replace(
			"✅ REST contract schemas, portable API clients, and endpoint-aware OpenAPI documents generated for workspace blocks and plugin-level resources!",
			"✅ REST contract schemas, standalone schemas, portable API clients, and endpoint-aware OpenAPI documents generated for workspace blocks, standalone contracts, and plugin-level resources!",
		);
		nextSource = nextSource.replace(
			"✅ REST contract schemas, portable API clients, and endpoint-aware OpenAPI documents are already up to date with the TypeScript types!",
			"✅ REST contract schemas, standalone schemas, portable API clients, and endpoint-aware OpenAPI documents are already up to date with the TypeScript types!",
		);
		nextSource = nextSource.replace(
			"✅ REST contract schemas, portable API clients, and endpoint-aware OpenAPI documents generated from TypeScript types!",
			"✅ REST contract schemas, standalone schemas, portable API clients, and endpoint-aware OpenAPI documents generated from TypeScript types!",
		);

		return nextSource;
	});
}
