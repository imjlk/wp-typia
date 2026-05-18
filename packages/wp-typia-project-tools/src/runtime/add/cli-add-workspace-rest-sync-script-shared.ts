import path from "node:path";

/**
 * Build the standard sync-rest patch failure message for missing anchors.
 *
 * @param functionName Name of the patcher that could not complete.
 * @param syncRestScriptPath Path to the workspace sync-rest script.
 * @param anchorDescription Human-readable description of the missing anchor.
 * @param subject Configuration subject the patcher was trying to wire.
 * @returns A formatted error message with manual recovery guidance.
 */
export function getSyncRestPatchErrorMessage(
	functionName: string,
	syncRestScriptPath: string,
	anchorDescription: string,
	subject: string,
): string {
	return [
		`${functionName} could not patch ${path.basename(syncRestScriptPath)}.`,
		`Missing expected ${anchorDescription} anchor in scripts/sync-rest-contracts.ts.`,
		`Restore the generated template or add the ${subject} wiring manually before retrying.`,
	].join(" ");
}

const BLOCK_CONFIG_IMPORT_PATTERNS = [
	/^import\s*\{\n(?:\t[^\n]*\n)+\} from ["']\.\/block-config["'];?$/mu,
	/^import\s*\{[^\n]*\}\s*from\s*["']\.\/block-config["'];?$/mu,
] as const;

const BLOCK_CONFIG_VALUE_IMPORT_ORDER = [
	"AI_FEATURES",
	"BLOCKS",
	"CONTRACTS",
	"POST_META",
	"REST_RESOURCES",
] as const;

const BLOCK_CONFIG_TYPE_IMPORT_ORDER = [
	"WorkspaceAiFeatureConfig",
	"WorkspaceBlockConfig",
	"WorkspaceContractConfig",
	"WorkspacePostMetaConfig",
	"WorkspaceRestResourceConfig",
] as const;

/**
 * Add a required block-config value and type import to sync-rest source.
 *
 * @param options Import patching options.
 * @param options.functionName Name of the calling patcher for error messages.
 * @param options.nextSource Current sync-rest script source.
 * @param options.subject Value and type names that must be imported.
 * @param options.syncRestScriptPath Path to the target sync-rest script.
 * @returns Source with the block-config import updated or left unchanged.
 * @throws When the generated block-config import anchor cannot be found.
 */
export function replaceBlockConfigImport({
	functionName,
	nextSource,
	subject,
	syncRestScriptPath,
}: {
	functionName: string;
	nextSource: string;
	subject: {
		configTypeName: string;
		constName: string;
	};
	syncRestScriptPath: string;
}): string {
	const importMatch =
		BLOCK_CONFIG_IMPORT_PATTERNS.map((pattern) => pattern.exec(nextSource)).find(
			Boolean,
		) ?? null;

	if (!importMatch) {
		throw new Error(
			getSyncRestPatchErrorMessage(
				functionName,
				syncRestScriptPath,
				"block-config import",
				subject.constName,
			),
		);
	}

	const importSource = importMatch[0];
	if (
		importSource.includes(subject.constName) &&
		importSource.includes(subject.configTypeName)
	) {
		return nextSource;
	}
	if (
		!importSource.includes("BLOCKS") ||
		!importSource.includes("WorkspaceBlockConfig")
	) {
		throw new Error(
			getSyncRestPatchErrorMessage(
				functionName,
				syncRestScriptPath,
				"BLOCKS import",
				subject.constName,
			),
		);
	}

	const replacement = [
		"import {",
		...BLOCK_CONFIG_VALUE_IMPORT_ORDER.flatMap((constName) =>
			constName === subject.constName || importSource.includes(constName)
				? [`\t${constName},`]
				: [],
		),
		...BLOCK_CONFIG_TYPE_IMPORT_ORDER.flatMap((configTypeName) =>
			configTypeName === subject.configTypeName ||
			importSource.includes(configTypeName)
				? [`\ttype ${configTypeName},`]
				: [],
		),
		"} from './block-config';",
	].join("\n");

	return nextSource.replace(importSource, replacement);
}

function formatNoResourcesSubject(subjects: readonly string[]): string {
	if (subjects.length <= 2) {
		return subjects.join(" or ");
	}

	const lastSubject = subjects[subjects.length - 1];
	return `${subjects.slice(0, -1).join(", ")}, or ${lastSubject}`;
}

/**
 * Render a sync-rest guard for the selected empty resource collections.
 *
 * @param options Guard rendering options.
 * @param options.subjects Candidate guard subjects and conditions.
 * @returns TypeScript source for the no-resources guard block.
 */
export function buildNoResourcesGuard({
	subjects,
}: {
	subjects: readonly {
		condition: string;
		include: boolean;
		subject: string;
	}[];
}): string {
	const includedSubjects = subjects.filter((subject) => subject.include);
	const condition = includedSubjects.map(({ condition }, index) =>
		index === includedSubjects.length - 1 ? condition : `${condition} &&`,
	);
	const noResourcesSubject = formatNoResourcesSubject(
		includedSubjects.map(({ subject }) => subject),
	);

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
	/if \(\s*restBlocks\.length === 0(?:\s*&&\s*standaloneContracts\.length === 0)?(?:\s*&&\s*postMetaContracts\.length === 0)?(?:\s*&&\s*restResources\.length === 0)?(?:\s*&&\s*aiFeatures\.length === 0)?\s*\) \{[\s\S]*?\n\t\treturn;\n\t\}/u;

/**
 * Replace the generated no-resources guard in sync-rest source.
 *
 * @param nextSource Current sync-rest script source.
 * @param replacement New no-resources guard source.
 * @param functionName Name of the calling patcher for error messages.
 * @param syncRestScriptPath Path to the target sync-rest script.
 * @param subject Configuration subject the patcher was trying to wire.
 * @returns Source with the no-resources guard replaced.
 * @throws When the generated no-resources guard cannot be found.
 */
export function replaceNoResourcesGuard(
	nextSource: string,
	replacement: string,
	functionName: string,
	syncRestScriptPath: string,
	subject: string,
): string {
	if (!NO_RESOURCES_GUARD_PATTERN.test(nextSource)) {
		throw new Error(
			getSyncRestPatchErrorMessage(
				functionName,
				syncRestScriptPath,
				"no-resources guard",
				subject,
			),
		);
	}

	return nextSource.replace(NO_RESOURCES_GUARD_PATTERN, replacement);
}
