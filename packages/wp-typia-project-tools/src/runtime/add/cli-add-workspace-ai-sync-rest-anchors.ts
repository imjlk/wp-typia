import path from "node:path";

import { patchFile } from "./cli-add-shared.js";
import type { WorkspaceProject } from "../workspace/workspace-project.js";

function assertSyncRestAnchor(
	nextSource: string,
	target: string,
	anchorDescription: string,
	hasAnchor: boolean,
	syncRestScriptPath: string,
): void {
	if (!nextSource.includes(target) && !hasAnchor) {
		throw new Error(
			[
				`ensureAiFeatureSyncRestAnchors could not patch ${path.basename(syncRestScriptPath)}.`,
				`Missing expected ${anchorDescription} anchor in scripts/sync-rest-contracts.ts.`,
				"Restore the generated template or add the AI feature wiring manually before retrying.",
			].join(" "),
		);
	}
}

function replaceRequiredSyncRestSource(
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
	assertSyncRestAnchor(
		nextSource,
		target,
		anchorDescription,
		hasAnchor,
		syncRestScriptPath,
	);

	return nextSource.replace(anchor, replacement);
}

function replaceBlockConfigImportForAiFeatures(
	nextSource: string,
	syncRestScriptPath: string,
): string {
	const importPatterns = [
		/^import\s*\{\n(?:\t[^\n]*\n)+\} from ["']\.\/block-config["'];?$/mu,
		/^import\s*\{[^\n]*\}\s*from\s*["']\.\/block-config["'];?$/mu,
	];
	const importMatch =
		importPatterns.map((pattern) => pattern.exec(nextSource)).find(Boolean) ??
		null;

	if (!importMatch) {
		throw new Error(
			[
				`ensureAiFeatureSyncRestAnchors could not patch ${path.basename(syncRestScriptPath)}.`,
				"Missing expected workspace inventory import anchor in scripts/sync-rest-contracts.ts.",
				"Restore the generated template or add the AI feature wiring manually before retrying.",
			].join(" "),
		);
	}

	const importSource = importMatch[0];
	if (
		importSource.includes("AI_FEATURES") &&
		importSource.includes("WorkspaceAiFeatureConfig")
	) {
		return nextSource;
	}

	const hasContracts = importSource.includes("CONTRACTS");
	const hasContractConfig = importSource.includes("WorkspaceContractConfig");
	const hasPostMeta = importSource.includes("POST_META");
	const hasPostMetaConfig = importSource.includes("WorkspacePostMetaConfig");
	const replacement = [
		"import {",
		"\tAI_FEATURES,",
		"\tBLOCKS,",
		...(hasContracts ? ["\tCONTRACTS,"] : []),
		...(hasPostMeta ? ["\tPOST_META,"] : []),
		"\tREST_RESOURCES,",
		"\ttype WorkspaceAiFeatureConfig,",
		"\ttype WorkspaceBlockConfig,",
		...(hasContractConfig ? ["\ttype WorkspaceContractConfig,"] : []),
		...(hasPostMetaConfig ? ["\ttype WorkspacePostMetaConfig,"] : []),
		"\ttype WorkspaceRestResourceConfig,",
		"} from './block-config';",
	].join("\n");

	return nextSource.replace(importSource, replacement);
}

function replaceAiFeatureSyncSummaryCopy(
	nextSource: string,
	syncRestScriptPath: string,
): string {
	const standaloneSummary =
		"workspace blocks, standalone contracts, and plugin-level resources";
	const standaloneAiSummary =
		"workspace blocks, standalone contracts, plugin-level resources, and AI features";
	const standalonePostMetaSummary =
		"workspace blocks, standalone contracts, post meta contracts, and plugin-level resources";
	const standalonePostMetaAiSummary =
		"workspace blocks, standalone contracts, post meta contracts, plugin-level resources, and AI features";
	const postMetaSummary =
		"workspace blocks, post meta contracts, and plugin-level resources";
	const postMetaAiSummary =
		"workspace blocks, post meta contracts, plugin-level resources, and AI features";
	const restResourceSummary = "workspace blocks and plugin-level resources";
	const restResourceAiSummary =
		"workspace blocks, plugin-level resources, and AI features";

	if (nextSource.includes(standalonePostMetaSummary)) {
		return nextSource
			.split(standalonePostMetaSummary)
			.join(standalonePostMetaAiSummary);
	}
	if (nextSource.includes(standaloneSummary)) {
		return nextSource.split(standaloneSummary).join(standaloneAiSummary);
	}
	if (nextSource.includes(postMetaSummary)) {
		return nextSource.split(postMetaSummary).join(postMetaAiSummary);
	}
	if (nextSource.includes(restResourceSummary)) {
		return nextSource.split(restResourceSummary).join(restResourceAiSummary);
	}
	if (
		nextSource.includes(standaloneAiSummary) ||
		nextSource.includes(standalonePostMetaAiSummary) ||
		nextSource.includes(postMetaAiSummary) ||
		nextSource.includes(restResourceAiSummary)
	) {
		return nextSource;
	}

	throw new Error(
		[
			`ensureAiFeatureSyncRestAnchors could not patch ${path.basename(syncRestScriptPath)}.`,
			"Missing expected sync summary copy anchor in scripts/sync-rest-contracts.ts.",
			"Restore the generated template or add the AI feature wiring manually before retrying.",
		].join(" "),
	);
}

function formatNoResourcesSubject(subjects: readonly string[]): string {
	if (subjects.length <= 2) {
		return subjects.join(" or ");
	}

	const lastSubject = subjects[subjects.length - 1];
	return `${subjects.slice(0, -1).join(", ")}, or ${lastSubject}`;
}

function buildAiFeatureNoResourcesGuard({
	hasPostMeta,
	hasStandaloneContracts,
}: {
	hasPostMeta: boolean;
	hasStandaloneContracts: boolean;
}): string {
	const condition = ["restBlocks.length === 0"];
	if (hasStandaloneContracts) {
		condition[condition.length - 1] = `${condition[condition.length - 1]} &&`;
		condition.push("standaloneContracts.length === 0");
	}
	if (hasPostMeta) {
		condition[condition.length - 1] = `${condition[condition.length - 1]} &&`;
		condition.push("postMetaContracts.length === 0");
	}
	condition[condition.length - 1] = `${condition[condition.length - 1]} &&`;
	condition.push("restResources.length === 0 &&");
	condition.push("aiFeatures.length === 0");

	const noResourcesSubject = formatNoResourcesSubject([
		"REST-enabled workspace blocks",
		...(hasStandaloneContracts ? ["standalone contracts"] : []),
		...(hasPostMeta ? ["post meta contracts"] : []),
		"plugin-level REST resources",
		"AI features",
	]);

	return [
		"if (",
		...condition.map((line) => `\t\t${line}`),
		"\t) {",
		"\t\tconsole.log(",
		"\t\t\toptions.check",
		`\t\t\t\t? 'ℹ️ No ${noResourcesSubject} are registered yet. \`sync-rest --check\` is already clean.'`,
		`\t\t\t\t: 'ℹ️ No ${noResourcesSubject} are registered yet.'`,
		"\t\t);",
		"\t\treturn;",
		"\t}",
	].join("\n");
}

const NO_RESOURCES_GUARD_PATTERN =
	/if \(\s*restBlocks\.length === 0(?:\s*&&\s*standaloneContracts\.length === 0)?(?:\s*&&\s*postMetaContracts\.length === 0)?\s*&&\s*restResources\.length === 0(?:\s*&&\s*aiFeatures\.length === 0)?\s*\) \{[\s\S]*?\n\t\treturn;\n\t\}/u;

/**
 * Patch `scripts/sync-rest-contracts.ts` after sync-project wiring so AI feature REST artifacts join the split sync flow.
 */
export async function ensureAiFeatureSyncRestAnchors(
	workspace: WorkspaceProject,
): Promise<void> {
	const syncRestScriptPath = path.join(
		workspace.projectDir,
		"scripts",
		"sync-rest-contracts.ts",
	);

	await patchFile(syncRestScriptPath, (source) => {
		let nextSource = replaceBlockConfigImportForAiFeatures(
			source,
			syncRestScriptPath,
		);
		const helperInsertionAnchor = "async function assertTypeArtifactsCurrent";
		const restResourcesAnchor =
			"const restResources = REST_RESOURCES.filter( isWorkspaceRestResource );";
		const consoleLogPattern = /\n\tconsole\.log\(\n\t\toptions\.check/u;

		nextSource = replaceRequiredSyncRestSource(
			nextSource,
			"function isWorkspaceAiFeature(",
			helperInsertionAnchor,
			[
				"function isWorkspaceAiFeature(",
				"\tfeature: WorkspaceAiFeatureConfig",
				"): feature is WorkspaceAiFeatureConfig & {",
				"\taiSchemaFile: string;",
				"\tclientFile: string;",
				"\topenApiFile: string;",
				"\trestManifest: NonNullable< WorkspaceAiFeatureConfig[ 'restManifest' ] >;",
				"\ttypesFile: string;",
				"\tvalidatorsFile: string;",
				"} {",
				"\treturn (",
				"\t\ttypeof feature.aiSchemaFile === 'string' &&",
				"\t\ttypeof feature.clientFile === 'string' &&",
				"\t\ttypeof feature.openApiFile === 'string' &&",
				"\t\ttypeof feature.typesFile === 'string' &&",
				"\t\ttypeof feature.validatorsFile === 'string' &&",
				"\t\ttypeof feature.restManifest === 'object' &&",
				"\t\tfeature.restManifest !== null &&",
				"\t\ttypeof feature.restManifest.contracts === 'object' &&",
				"\t\tfeature.restManifest.contracts !== null",
				"\t);",
				"}",
				"",
				"async function assertTypeArtifactsCurrent",
			].join("\n"),
			"type artifact assertion helper",
			syncRestScriptPath,
		);

		nextSource = replaceRequiredSyncRestSource(
			nextSource,
			"const aiFeatures = AI_FEATURES.filter( isWorkspaceAiFeature );",
			restResourcesAnchor,
			[
				"const restResources = REST_RESOURCES.filter( isWorkspaceRestResource );",
				"const aiFeatures = AI_FEATURES.filter( isWorkspaceAiFeature );",
			].join("\n"),
			"rest resource filter",
			syncRestScriptPath,
		);

		nextSource = replaceRequiredSyncRestSource(
			nextSource,
			"aiFeatures.length === 0",
			NO_RESOURCES_GUARD_PATTERN,
			buildAiFeatureNoResourcesGuard({
				hasPostMeta: nextSource.includes(
					"const postMetaContracts = POST_META.filter( isWorkspacePostMetaContract );",
				),
				hasStandaloneContracts: nextSource.includes(
					"const standaloneContracts = CONTRACTS.filter( isWorkspaceStandaloneContract );",
				),
			}),
			"no-resources guard",
			syncRestScriptPath,
		);

		nextSource = replaceRequiredSyncRestSource(
			nextSource,
			"for ( const feature of aiFeatures ) {",
			consoleLogPattern,
			[
				"",
				"\tfor ( const feature of aiFeatures ) {",
				"\t\tconst contracts = feature.restManifest.contracts;",
				"",
				"\t\tfor ( const [ baseName, contract ] of Object.entries( contracts ) ) {",
				"\t\t\tawait syncTypeSchemas(",
				"\t\t\t\t{",
				"\t\t\t\t\tjsonSchemaFile: path.join(",
				"\t\t\t\t\t\tpath.dirname( feature.typesFile ),",
				"\t\t\t\t\t\t'api-schemas',",
				"\t\t\t\t\t\t`${ baseName }.schema.json`",
				"\t\t\t\t\t),",
				"\t\t\t\t\topenApiFile: path.join(",
				"\t\t\t\t\t\tpath.dirname( feature.typesFile ),",
				"\t\t\t\t\t\t'api-schemas',",
				"\t\t\t\t\t\t`${ baseName }.openapi.json`",
				"\t\t\t\t\t),",
				"\t\t\t\t\tsourceTypeName: contract.sourceTypeName,",
				"\t\t\t\t\ttypesFile: feature.typesFile,",
				"\t\t\t\t},",
				"\t\t\t\t{",
				"\t\t\t\t\tcheck: options.check,",
				"\t\t\t\t}",
				"\t\t\t);",
				"\t\t}",
				"",
				"\t\tawait syncRestOpenApi(",
				"\t\t\t{",
				"\t\t\t\tmanifest: feature.restManifest,",
				"\t\t\t\topenApiFile: feature.openApiFile,",
				"\t\t\t\ttypesFile: feature.typesFile,",
				"\t\t\t},",
				"\t\t\t{",
				"\t\t\t\tcheck: options.check,",
				"\t\t\t}",
				"\t\t);",
				"",
				"\t\tawait syncEndpointClient(",
				"\t\t\t{",
				"\t\t\t\tclientFile: feature.clientFile,",
				"\t\t\t\tmanifest: feature.restManifest,",
				"\t\t\t\ttypesFile: feature.typesFile,",
				"\t\t\t\tvalidatorsFile: feature.validatorsFile,",
				"\t\t\t},",
				"\t\t\t{",
				"\t\t\t\tcheck: options.check,",
				"\t\t\t}",
				"\t\t);",
				"\t}",
				"",
				"\tconsole.log(",
				"\t\toptions.check",
			].join("\n"),
			"final sync summary",
			syncRestScriptPath,
		);

		nextSource = replaceAiFeatureSyncSummaryCopy(
			nextSource,
			syncRestScriptPath,
		);

		return nextSource;
	});
}
