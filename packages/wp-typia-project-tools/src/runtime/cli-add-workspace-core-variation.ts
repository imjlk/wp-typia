import fs, { promises as fsp } from "node:fs";
import path from "node:path";

import { assertFullBlockName } from "./block-targets.js";
import {
	assertValidGeneratedSlug,
	normalizeBlockSlug,
	quoteTsString,
	rollbackWorkspaceMutation,
	type RunAddCoreVariationCommandOptions,
	type WorkspaceMutationSnapshot,
	snapshotWorkspaceFiles,
} from "./cli-add-shared.js";
import {
	ensureEditorPluginBootstrapAnchors,
	ensureEditorPluginBuildScriptAnchors,
	ensureEditorPluginWebpackAnchors,
	resolveEditorPluginRegistryPath,
	writeEditorPluginRegistry,
} from "./cli-add-workspace-editor-plugin.js";
import { pathExists } from "./fs-async.js";
import { toKebabCase, toPascalCase, toTitleCase } from "./string-case.js";
import { resolveWorkspaceProject } from "./workspace-project.js";

const CORE_VARIATIONS_EDITOR_PLUGIN_SLUG = "core-variations";
const CORE_VARIATION_USAGE =
	"wp-typia add core-variation <block-name> <name> or wp-typia add core-variation <name> --block <namespace/block>";
const KNOWN_CORE_VARIATION_TARGETS = new Set([
	"core/archives",
	"core/audio",
	"core/avatar",
	"core/block",
	"core/button",
	"core/buttons",
	"core/calendar",
	"core/categories",
	"core/code",
	"core/column",
	"core/columns",
	"core/comment-author-name",
	"core/comment-content",
	"core/comment-date",
	"core/comment-edit-link",
	"core/comment-reply-link",
	"core/comment-template",
	"core/comments",
	"core/comments-pagination",
	"core/comments-pagination-next",
	"core/comments-pagination-numbers",
	"core/comments-pagination-previous",
	"core/comments-title",
	"core/cover",
	"core/details",
	"core/embed",
	"core/file",
	"core/footnotes",
	"core/freeform",
	"core/gallery",
	"core/group",
	"core/heading",
	"core/home-link",
	"core/html",
	"core/image",
	"core/latest-comments",
	"core/latest-posts",
	"core/legacy-widget",
	"core/list",
	"core/list-item",
	"core/loginout",
	"core/media-text",
	"core/missing",
	"core/more",
	"core/navigation",
	"core/navigation-link",
	"core/navigation-submenu",
	"core/nextpage",
	"core/page-list",
	"core/paragraph",
	"core/pattern",
	"core/post-author",
	"core/post-author-biography",
	"core/post-author-name",
	"core/post-comments",
	"core/post-comments-form",
	"core/post-content",
	"core/post-date",
	"core/post-excerpt",
	"core/post-featured-image",
	"core/post-navigation-link",
	"core/post-terms",
	"core/post-template",
	"core/post-title",
	"core/preformatted",
	"core/pullquote",
	"core/query",
	"core/query-no-results",
	"core/query-pagination",
	"core/query-pagination-next",
	"core/query-pagination-numbers",
	"core/query-pagination-previous",
	"core/query-title",
	"core/quote",
	"core/read-more",
	"core/rss",
	"core/search",
	"core/separator",
	"core/shortcode",
	"core/site-logo",
	"core/site-tagline",
	"core/site-title",
	"core/social-link",
	"core/social-links",
	"core/spacer",
	"core/table",
	"core/table-of-contents",
	"core/tag-cloud",
	"core/template-part",
	"core/term-description",
	"core/text-columns",
	"core/verse",
	"core/video",
]);
const CORE_VARIATION_SIMPLE_CONTAINER_BLOCKS = new Set([
	"core/column",
	"core/cover",
	"core/group",
	"core/media-text",
]);

interface CoreVariationModuleRef {
	targetBlockName: string;
	variationSlug: string;
}

function getCoreVariationRootDir(projectDir: string): string {
	return path.join(projectDir, "src", "editor-plugins", CORE_VARIATIONS_EDITOR_PLUGIN_SLUG);
}

function getCoreVariationBlockDir(projectDir: string, targetBlockName: string): string {
	const [namespace, blockSlug] = targetBlockName.split("/");
	return path.join(
		getCoreVariationRootDir(projectDir),
		namespace ?? "",
		blockSlug ?? "",
	);
}

function getCoreVariationFilePath(
	projectDir: string,
	targetBlockName: string,
	variationSlug: string,
): string {
	return path.join(
		getCoreVariationBlockDir(projectDir, targetBlockName),
		`${variationSlug}.ts`,
	);
}

function getCoreVariationIndexPath(projectDir: string): string {
	return path.join(getCoreVariationRootDir(projectDir), "index.ts");
}

function buildCoreVariationIdentifier(targetBlockName: string, variationSlug: string): string {
	return toKebabCase(`${targetBlockName}-${variationSlug}`)
		.split("-")
		.filter(Boolean)
		.join("_");
}

function buildCoreVariationConstName(
	targetBlockName: string,
	variationSlug: string,
): string {
	return `coreVariation_${buildCoreVariationIdentifier(targetBlockName, variationSlug)}`;
}

function buildCoreVariationBlockConstName(
	targetBlockName: string,
	variationSlug: string,
): string {
	return `${buildCoreVariationIdentifier(targetBlockName, variationSlug).toUpperCase()}_BLOCK_NAME`;
}

function buildCoreVariationAttributesTypeName(
	targetBlockName: string,
	variationSlug: string,
): string {
	return `${toPascalCase(`${targetBlockName}-${variationSlug}`)}Attributes`;
}

function buildCoreVariationAttributesConstName(
	targetBlockName: string,
	variationSlug: string,
): string {
	return `${buildCoreVariationIdentifier(targetBlockName, variationSlug)}Attributes`;
}

function buildCoreVariationInnerBlocksConstName(
	targetBlockName: string,
	variationSlug: string,
): string {
	return `${buildCoreVariationIdentifier(targetBlockName, variationSlug)}InnerBlocks`;
}

function buildCoreVariationImportPath(ref: CoreVariationModuleRef): string {
	return `./${ref.targetBlockName}/${ref.variationSlug}`;
}

function formatCoreVariationTitle(variationSlug: string): string {
	return toTitleCase(variationSlug);
}

function getUnknownCoreVariationTargetWarning(
	targetBlockName: string,
): string | undefined {
	if (
		!targetBlockName.startsWith("core/") ||
		KNOWN_CORE_VARIATION_TARGETS.has(targetBlockName)
	) {
		return undefined;
	}

	return `Target block "${targetBlockName}" uses the WordPress core namespace but is not in wp-typia's known core block list. The variation was generated for forward compatibility; verify the block name or update wp-typia if this is a newer core block.`;
}

function assertCoreVariationDoesNotExist(
	projectDir: string,
	targetBlockName: string,
	variationSlug: string,
): void {
	const variationFilePath = getCoreVariationFilePath(
		projectDir,
		targetBlockName,
		variationSlug,
	);
	if (fs.existsSync(variationFilePath)) {
		throw new Error(
			`A core block variation already exists at ${path.relative(projectDir, variationFilePath)}. Choose a different name.`,
		);
	}
}

function assertCoreVariationSlugIsNotRegistryIndex(variationSlug: string): void {
	if (variationSlug === "index") {
		throw new Error(
			"Core variation name must not normalize to `index`. Choose a different name so the variation module can be registered.",
		);
	}
}

function buildCoreVariationInnerBlocksSource(options: {
	constName: string;
	targetBlockName: string;
	textDomain: string;
}): string {
	if (options.targetBlockName === "core/columns") {
		return `export const ${options.constName} = [
\t[
\t\t'core/column',
\t\t{},
\t\t[
\t\t\t[
\t\t\t\t'core/heading',
\t\t\t\t{
\t\t\t\t\tlevel: 2,
\t\t\t\t\tplaceholder: __( ${quoteTsString("Add a section heading")}, ${quoteTsString(options.textDomain)} ),
\t\t\t\t},
\t\t\t],
\t\t\t[
\t\t\t\t'core/paragraph',
\t\t\t\t{
\t\t\t\t\tplaceholder: __( ${quoteTsString("Add supporting copy")}, ${quoteTsString(options.textDomain)} ),
\t\t\t\t},
\t\t\t],
\t\t],
\t],
] satisfies BlockTemplate;`;
	}

	if (CORE_VARIATION_SIMPLE_CONTAINER_BLOCKS.has(options.targetBlockName)) {
		return `export const ${options.constName} = [
\t[
\t\t'core/heading',
\t\t{
\t\t\tlevel: 2,
\t\t\tplaceholder: __( ${quoteTsString("Add a section heading")}, ${quoteTsString(options.textDomain)} ),
\t\t},
\t],
\t[
\t\t'core/paragraph',
\t\t{
\t\t\tplaceholder: __( ${quoteTsString("Add supporting copy")}, ${quoteTsString(options.textDomain)} ),
\t\t},
\t],
] satisfies BlockTemplate;`;
	}

	return `// Non-container core blocks can keep this empty or replace it with a
// block-supported InnerBlocks template when the target block accepts children.
export const ${options.constName} = [] satisfies BlockTemplate;`;
}

function buildCoreVariationSource(options: {
	targetBlockName: string;
	textDomain: string;
	variationSlug: string;
}): string {
	const attributesTypeName = buildCoreVariationAttributesTypeName(
		options.targetBlockName,
		options.variationSlug,
	);
	const blockConstName = buildCoreVariationBlockConstName(
		options.targetBlockName,
		options.variationSlug,
	);
	const attributesConstName = buildCoreVariationAttributesConstName(
		options.targetBlockName,
		options.variationSlug,
	);
	const innerBlocksConstName = buildCoreVariationInnerBlocksConstName(
		options.targetBlockName,
		options.variationSlug,
	);
	const variationConstName = buildCoreVariationConstName(
		options.targetBlockName,
		options.variationSlug,
	);
	const variationTitle = formatCoreVariationTitle(options.variationSlug);
	const variationClassName = `is-${options.variationSlug}`;

	return `import type {
\tBlockTemplate,
\tBlockVariation,
} from '@wp-typia/block-types/blocks/registration';
import { __ } from '@wordpress/i18n';

export const ${blockConstName} = ${quoteTsString(options.targetBlockName)};

export interface ${attributesTypeName} {
\tclassName?: string;
\tmetadata?: {
\t\tname?: string;
\t};
\t[key: string]: unknown;
}

export const ${attributesConstName} = {
\tclassName: ${quoteTsString(variationClassName)},
\tmetadata: {
\t\tname: ${quoteTsString(variationTitle)},
\t},
} satisfies ${attributesTypeName};

${buildCoreVariationInnerBlocksSource({
	constName: innerBlocksConstName,
	targetBlockName: options.targetBlockName,
	textDomain: options.textDomain,
})}

export const ${variationConstName} = {
\tname: ${quoteTsString(options.variationSlug)},
\ttitle: __( ${quoteTsString(variationTitle)}, ${quoteTsString(options.textDomain)} ),
\tdescription: __(
\t\t${quoteTsString(`A starter ${options.targetBlockName} variation for ${variationTitle}.`)},
\t\t${quoteTsString(options.textDomain)},
\t),
\tcategory: 'design',
\ticon: 'layout',
\tkeywords: [
\t\t__( ${quoteTsString("variation")}, ${quoteTsString(options.textDomain)} ),
\t\t__( ${quoteTsString(variationTitle)}, ${quoteTsString(options.textDomain)} ),
\t],
\tattributes: ${attributesConstName},
\tinnerBlocks: ${innerBlocksConstName},
\tisActive: ['className'],
\tscope: ['block', 'inserter', 'transform'],
} satisfies BlockVariation<${attributesTypeName}>;
`;
}

async function readCoreVariationModuleRefs(
	coreVariationsDir: string,
): Promise<CoreVariationModuleRef[]> {
	if (!(await pathExists(coreVariationsDir))) {
		return [];
	}

	const refs: CoreVariationModuleRef[] = [];
	const namespaceEntries = await fsp.readdir(coreVariationsDir, {
		withFileTypes: true,
	});
	for (const namespaceEntry of namespaceEntries) {
		if (!namespaceEntry.isDirectory()) {
			continue;
		}

		const namespaceDir = path.join(coreVariationsDir, namespaceEntry.name);
		const blockEntries = await fsp.readdir(namespaceDir, {
			withFileTypes: true,
		});
		for (const blockEntry of blockEntries) {
			if (!blockEntry.isDirectory()) {
				continue;
			}

			const blockDir = path.join(namespaceDir, blockEntry.name);
			const variationEntries = await fsp.readdir(blockDir, {
				withFileTypes: true,
			});
			for (const variationEntry of variationEntries) {
				if (!variationEntry.isFile() || !variationEntry.name.endsWith(".ts")) {
					continue;
				}
				const variationSlug = variationEntry.name.replace(/\.ts$/u, "");
				if (variationSlug === "index") {
					continue;
				}

				refs.push({
					targetBlockName: `${namespaceEntry.name}/${blockEntry.name}`,
					variationSlug,
				});
			}
		}
	}

	return refs.sort((left, right) => {
		const leftKey = `${left.targetBlockName}/${left.variationSlug}`;
		const rightKey = `${right.targetBlockName}/${right.variationSlug}`;
		return leftKey.localeCompare(rightKey);
	});
}

function buildCoreVariationIndexSource(refs: readonly CoreVariationModuleRef[]): string {
	const importLines = refs
		.map((ref, index) => {
			const blockConstName = buildCoreVariationBlockConstName(
				ref.targetBlockName,
				ref.variationSlug,
			);
			const variationConstName = buildCoreVariationConstName(
				ref.targetBlockName,
				ref.variationSlug,
			);
			return `import { ${blockConstName} as CORE_VARIATION_BLOCK_${index}, ${variationConstName} as coreVariationEntry${index} } from '${buildCoreVariationImportPath(ref)}';`;
		})
		.join("\n");
	const entryLines = refs
		.map((_, index) => {
			return `\t{ blockName: CORE_VARIATION_BLOCK_${index}, variation: coreVariationEntry${index} },`;
		})
		.join("\n");

	return `import { registerBlockVariation } from '@wordpress/blocks';
${importLines ? `\n${importLines}\n` : ""}
const WORKSPACE_CORE_VARIATIONS = [
${entryLines}
] as const;

export function registerWorkspaceCoreVariations() {
\tfor (const { blockName, variation } of WORKSPACE_CORE_VARIATIONS) {
\t\tregisterBlockVariation(blockName, variation);
\t}
}

registerWorkspaceCoreVariations();
`;
}

async function writeCoreVariationRegistry(
	projectDir: string,
	targetBlockName: string,
	textDomain: string,
	variationSlug: string,
): Promise<void> {
	const coreVariationsDir = getCoreVariationRootDir(projectDir);
	const targetBlockDir = getCoreVariationBlockDir(projectDir, targetBlockName);
	const variationFilePath = getCoreVariationFilePath(
		projectDir,
		targetBlockName,
		variationSlug,
	);
	await fsp.mkdir(targetBlockDir, { recursive: true });
	await fsp.writeFile(
		variationFilePath,
		buildCoreVariationSource({
			targetBlockName,
			textDomain,
			variationSlug,
		}),
		"utf8",
	);
	const refs = await readCoreVariationModuleRefs(coreVariationsDir);
	await fsp.writeFile(
		getCoreVariationIndexPath(projectDir),
		buildCoreVariationIndexSource(refs),
		"utf8",
	);
}

/**
 * Add one editor-side variation registration for an existing core or external block.
 *
 * @param options Command options for the core-variation scaffold workflow.
 * @param options.cwd Working directory used to resolve the nearest official workspace.
 * Defaults to `process.cwd()`.
 * @param options.targetBlockName Full `namespace/block` name that receives the variation.
 * @param options.variationName Human-entered variation name normalized into the generated slug.
 * @returns The normalized variation metadata, owning workspace directory, and
 * optional warnings for suspicious but forward-compatible targets.
 * @throws {Error} When the command is run outside an official workspace, the
 * target block name is not full `namespace/block` form, or the generated file
 * already exists.
 */
export async function runAddCoreVariationCommand({
	cwd = process.cwd(),
	targetBlockName,
	targetBlockNameDiagnostics = "core-variation target",
	variationName,
}: RunAddCoreVariationCommandOptions): Promise<{
	projectDir: string;
	targetBlockName: string;
	variationFile: string;
	variationSlug: string;
	warnings?: string[];
}> {
	const workspace = resolveWorkspaceProject(cwd);
	const resolvedTargetBlockName = assertFullBlockName(
		targetBlockName,
		targetBlockNameDiagnostics,
	);
	const variationSlug = assertValidGeneratedSlug(
		"Core variation name",
		normalizeBlockSlug(variationName),
		CORE_VARIATION_USAGE,
	);
	const unknownCoreTargetWarning =
		getUnknownCoreVariationTargetWarning(resolvedTargetBlockName);
	assertCoreVariationSlugIsNotRegistryIndex(variationSlug);

	assertCoreVariationDoesNotExist(
		workspace.projectDir,
		resolvedTargetBlockName,
		variationSlug,
	);

	const bootstrapPath = path.join(
		workspace.projectDir,
		`${workspace.packageName.split("/").pop() ?? workspace.packageName}.php`,
	);
	const buildScriptPath = path.join(workspace.projectDir, "scripts", "build-workspace.mjs");
	const webpackConfigPath = path.join(workspace.projectDir, "webpack.config.js");
	const editorPluginsIndexPath = await resolveEditorPluginRegistryPath(
		workspace.projectDir,
	);
	const coreVariationsDir = getCoreVariationRootDir(workspace.projectDir);
	const targetNamespaceDir = path.join(
		coreVariationsDir,
		resolvedTargetBlockName.split("/")[0] ?? "",
	);
	const targetBlockDir = getCoreVariationBlockDir(
		workspace.projectDir,
		resolvedTargetBlockName,
	);
	const variationFilePath = getCoreVariationFilePath(
		workspace.projectDir,
		resolvedTargetBlockName,
		variationSlug,
	);
	const coreVariationsIndexPath = getCoreVariationIndexPath(workspace.projectDir);
	const shouldRemoveCoreVariationsDir = !(await pathExists(coreVariationsDir));
	const shouldRemoveTargetNamespaceDir =
		!shouldRemoveCoreVariationsDir && !(await pathExists(targetNamespaceDir));
	const shouldRemoveTargetBlockDir =
		!shouldRemoveCoreVariationsDir &&
		!shouldRemoveTargetNamespaceDir &&
		!(await pathExists(targetBlockDir));
	const mutationSnapshot: WorkspaceMutationSnapshot = {
		fileSources: await snapshotWorkspaceFiles([
			bootstrapPath,
			buildScriptPath,
			editorPluginsIndexPath,
			webpackConfigPath,
			coreVariationsIndexPath,
		]),
		snapshotDirs: [],
		targetPaths: [
			variationFilePath,
			...(shouldRemoveCoreVariationsDir ? [coreVariationsDir] : []),
			...(shouldRemoveTargetNamespaceDir ? [targetNamespaceDir] : []),
			...(shouldRemoveTargetBlockDir ? [targetBlockDir] : []),
		],
	};

	try {
		await ensureEditorPluginBootstrapAnchors(workspace);
		await ensureEditorPluginBuildScriptAnchors(workspace);
		await ensureEditorPluginWebpackAnchors(workspace);
		await writeCoreVariationRegistry(
			workspace.projectDir,
			resolvedTargetBlockName,
			workspace.workspace.textDomain,
			variationSlug,
		);
		await writeEditorPluginRegistry(
			workspace.projectDir,
			CORE_VARIATIONS_EDITOR_PLUGIN_SLUG,
		);

		return {
			projectDir: workspace.projectDir,
			targetBlockName: resolvedTargetBlockName,
			variationFile: path.relative(workspace.projectDir, variationFilePath),
			variationSlug,
			...(unknownCoreTargetWarning
				? { warnings: [unknownCoreTargetWarning] }
				: {}),
		};
	} catch (error) {
		await rollbackWorkspaceMutation(mutationSnapshot);
		throw error;
	}
}
