import { promises as fsp } from "node:fs";
import path from "node:path";

import { pathExists } from "../shared/fs-async.js";
import {
	assertBlockStyleDoesNotExist,
	assertValidGeneratedSlug,
	normalizeBlockSlug,
	quoteTsString,
	resolveWorkspaceBlock,
	rollbackWorkspaceMutation,
	type RunAddBlockStyleCommandOptions,
	type WorkspaceMutationSnapshot,
	snapshotWorkspaceFiles,
} from "./cli-add-shared.js";
import { ensureWorkspaceEntrypointCall } from "./cli-add-workspace-registration-hooks.js";
import {
	appendWorkspaceInventoryEntries,
	readWorkspaceInventoryAsync,
} from "../workspace/workspace-inventory.js";
import { resolveWorkspaceProject } from "../workspace/workspace-project.js";
import { toSnakeCase, toTitleCase } from "../shared/string-case.js";

const BLOCK_STYLES_IMPORT_LINE =
	"import { registerWorkspaceBlockStyles } from './styles';";
const BLOCK_STYLES_IMPORT_PATTERN =
	/^\s*import\s*\{\s*registerWorkspaceBlockStyles\s*\}\s*from\s*["']\.\/styles["']\s*;?\s*$/mu;
const BLOCK_STYLES_CALL_LINE = "registerWorkspaceBlockStyles();";
const BLOCK_STYLES_CALL_PATTERN = /registerWorkspaceBlockStyles\s*\(\s*\)\s*;?/u;

function buildWorkspaceConstName(prefix: string, slug: string): string {
	return `workspace${prefix}_${toSnakeCase(slug)}`;
}

function buildBlockStyleConfigEntry(blockSlug: string, styleSlug: string): string {
	return [
		"\t{",
		`\t\tblock: ${quoteTsString(blockSlug)},`,
		`\t\tfile: ${quoteTsString(`src/blocks/${blockSlug}/styles/${styleSlug}.ts`)},`,
		`\t\tslug: ${quoteTsString(styleSlug)},`,
		"\t},",
	].join("\n");
}

function getBlockStyleConstBindings(
	styleSlugs: string[],
): Array<{ constName: string; styleSlug: string }> {
	const seenConstNames = new Map<string, string>();

	return styleSlugs.map((styleSlug) => {
		const constName = buildWorkspaceConstName("BlockStyle", styleSlug);
		const previousSlug = seenConstNames.get(constName);

		if (previousSlug && previousSlug !== styleSlug) {
			throw new Error(
				`Style slugs "${previousSlug}" and "${styleSlug}" generate the same registry identifier "${constName}". Rename one of the styles.`,
			);
		}

		seenConstNames.set(constName, styleSlug);
		return { constName, styleSlug };
	});
}

function buildBlockStyleSource(styleSlug: string, textDomain: string): string {
	const styleTitle = toTitleCase(styleSlug);
	const styleConstName = buildWorkspaceConstName("BlockStyle", styleSlug);

	return `import { __ } from '@wordpress/i18n';

export const ${styleConstName} = {
\tname: ${quoteTsString(styleSlug)},
\tlabel: __( ${quoteTsString(styleTitle)}, ${quoteTsString(textDomain)} ),
} as const;
`;
}

function buildBlockStyleIndexSource(styleSlugs: string[]): string {
	const styleBindings = getBlockStyleConstBindings(styleSlugs);
	const importLines = styleBindings
		.map(({ constName, styleSlug }) => `import { ${constName} } from './${styleSlug}';`)
		.join("\n");
	const styleConstNames = styleBindings.map(({ constName }) => constName).join(",\n\t");

	return `import { registerBlockStyle } from '@wordpress/blocks';
import metadata from '../block.json';
${importLines ? `\n${importLines}` : ""}

const WORKSPACE_BLOCK_STYLES = [
\t${styleConstNames}
\t// wp-typia add style entries
] as const;

export function registerWorkspaceBlockStyles() {
\tfor (const style of WORKSPACE_BLOCK_STYLES) {
\t\tregisterBlockStyle(metadata.name, style);
\t}
}
`;
}

async function ensureBlockStyleRegistrationHook(blockIndexPath: string): Promise<void> {
	await ensureWorkspaceEntrypointCall({
		blockIndexPath,
		callLine: BLOCK_STYLES_CALL_LINE,
		callPattern: BLOCK_STYLES_CALL_PATTERN,
		importLine: BLOCK_STYLES_IMPORT_LINE,
		importPattern: BLOCK_STYLES_IMPORT_PATTERN,
	});
}

async function writeBlockStyleRegistry(
	projectDir: string,
	blockSlug: string,
	styleSlug: string,
): Promise<void> {
	const stylesDir = path.join(projectDir, "src", "blocks", blockSlug, "styles");
	const stylesIndexPath = path.join(stylesDir, "index.ts");
	await fsp.mkdir(stylesDir, { recursive: true });

	const existingStyleSlugs = (await fsp.readdir(stylesDir))
		.filter((entry) => entry.endsWith(".ts") && entry !== "index.ts")
		.map((entry) => entry.replace(/\.ts$/u, ""));
	const nextStyleSlugs = Array.from(new Set([...existingStyleSlugs, styleSlug])).sort();
	await fsp.writeFile(stylesIndexPath, buildBlockStyleIndexSource(nextStyleSlugs), "utf8");
}

/**
 * Add one Block Styles registration to an existing workspace block.
 *
 * @param options Command options for the Block Styles scaffold workflow.
 * @param options.blockName Target workspace block slug that will own the style.
 * @param options.cwd Working directory used to resolve the nearest official workspace.
 * Defaults to `process.cwd()`.
 * @param options.styleName Human-entered style name that will be normalized and
 * validated before files are written.
 * @returns A promise that resolves with the normalized `blockSlug`, `styleSlug`,
 * and owning `projectDir` after the style module, style registry, entrypoint
 * hook, and inventory entry have been written successfully.
 * @throws {Error} When the command is run outside an official workspace, when
 * the target block is unknown, when the style slug is invalid, or when a
 * conflicting file or inventory entry already exists.
 */
export async function runAddBlockStyleCommand({
	blockName,
	cwd = process.cwd(),
	styleName,
}: RunAddBlockStyleCommandOptions): Promise<{
	blockSlug: string;
	projectDir: string;
	styleSlug: string;
}> {
	const workspace = resolveWorkspaceProject(cwd);
	const blockSlug = normalizeBlockSlug(blockName);
	const styleSlug = assertValidGeneratedSlug(
		"Style name",
		normalizeBlockSlug(styleName),
		"wp-typia add style <name> --block <block-slug>",
	);

	const inventory = await readWorkspaceInventoryAsync(workspace.projectDir);
	resolveWorkspaceBlock(inventory, blockSlug);
	assertBlockStyleDoesNotExist(workspace.projectDir, blockSlug, styleSlug, inventory);

	const blockConfigPath = path.join(workspace.projectDir, "scripts", "block-config.ts");
	const blockIndexPath = path.join(workspace.projectDir, "src", "blocks", blockSlug, "index.tsx");
	const stylesDir = path.join(workspace.projectDir, "src", "blocks", blockSlug, "styles");
	const styleFilePath = path.join(stylesDir, `${styleSlug}.ts`);
	const stylesIndexPath = path.join(stylesDir, "index.ts");
	const shouldRemoveStylesDirOnRollback = !(await pathExists(stylesDir));
	const mutationSnapshot: WorkspaceMutationSnapshot = {
		fileSources: await snapshotWorkspaceFiles([
			blockConfigPath,
			blockIndexPath,
			stylesIndexPath,
		]),
		snapshotDirs: [],
		targetPaths: [
			styleFilePath,
			...(shouldRemoveStylesDirOnRollback ? [stylesDir] : []),
		],
	};

	try {
		await fsp.mkdir(stylesDir, { recursive: true });
		await fsp.writeFile(
			styleFilePath,
			buildBlockStyleSource(styleSlug, workspace.workspace.textDomain),
			"utf8",
		);
		await writeBlockStyleRegistry(workspace.projectDir, blockSlug, styleSlug);
		await ensureBlockStyleRegistrationHook(blockIndexPath);
		await appendWorkspaceInventoryEntries(workspace.projectDir, {
			blockStyleEntries: [buildBlockStyleConfigEntry(blockSlug, styleSlug)],
		});

		return {
			blockSlug,
			projectDir: workspace.projectDir,
			styleSlug,
		};
	} catch (error) {
		await rollbackWorkspaceMutation(mutationSnapshot);
		throw error;
	}
}
