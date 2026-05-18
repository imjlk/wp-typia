/// <reference path="./external-template-modules.d.ts" />

import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";

import Mustache from "mustache";

const BINARY_EXTENSIONS = new Set([
	".avif",
	".bmp",
	".gif",
	".ico",
	".jpeg",
	".jpg",
	".otf",
	".pdf",
	".png",
	".svg",
	".ttf",
	".webp",
	".woff",
	".woff2",
]);

export type TemplateRenderView = Record<string, unknown>;
/**
 * Optional controls for raw directory copies.
 *
 * The filter runs for each discovered entry before copying. Returning `false`
 * skips only that entry; when the skipped entry is a directory, the subtree is
 * skipped as well.
 */
export interface CopyRawDirectoryOptions {
	/**
	 * Predicate that decides whether a discovered entry should be copied.
	 *
	 * Throwing or rejecting aborts the copy and bubbles to the caller.
	 */
	filter?: CopyDirectoryFilter;
}

type TemplateStringRenderer<TView> = (
	template: string,
	view: TView,
) => string;

export type CopyDirectoryFilter = (
	sourcePath: string,
	destinationPath: string,
	entry: fs.Dirent,
) => boolean | Promise<boolean>;

interface TemplateTraversalOptions<TView> {
	filter?: CopyDirectoryFilter;
	prepareDirectory?: (directoryPath: string) => Promise<void>;
	renderString: TemplateStringRenderer<TView>;
	sourceDir: string;
	targetDir: string;
	view: TView;
	visitFile: (paths: {
		destinationPath: string;
		sourcePath: string;
	}) => Promise<void>;
}

interface MustacheWriterWithConfig {
	render(
		template: string,
		view: TemplateRenderView,
		partials: unknown,
		config: {
			escape: (value: string) => string;
		},
	): string;
}

const IDENTITY_MUSTACHE_ESCAPE = (value: string) => value;

/**
 * Render a Mustache template with full Mustache semantics while leaving values
 * unescaped for scaffold source generation.
 */
export function renderMustacheTemplateString(
	template: string,
	view: TemplateRenderView,
): string {
	const mustacheModule = Mustache as unknown as {
		Writer: {
			new (): MustacheWriterWithConfig;
		};
	};
	const writer = new (
		mustacheModule.Writer as {
			new (): MustacheWriterWithConfig;
		}
	)();

	return writer.render(template, view, undefined, {
		escape: IDENTITY_MUSTACHE_ESCAPE,
	});
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Render direct `{{key}}` placeholders without enabling sections, partials, or
 * any other Mustache features.
 */
function renderInterpolatedString(
	template: string,
	view: Record<string, string>,
): string {
	const keys = Object.keys(view);
	if (keys.length === 0) {
		return template;
	}

	const placeholderPattern = new RegExp(
		keys.map((key) => `({{${escapeRegExp(key)}}})`).join("|"),
		"g",
	);

	return template.replace(placeholderPattern, (match) => view[match.slice(2, -2)] ?? match);
}

function isBinaryTemplateFile(filePath: string): boolean {
	return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function resolveRenderedPath(targetDir: string, destinationName: string): string {
	const resolvedTargetDir = path.resolve(targetDir);
	const resolvedDestinationPath = path.resolve(resolvedTargetDir, destinationName);
	const relativePath = path.relative(resolvedTargetDir, resolvedDestinationPath);
	if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
		throw new Error(`Rendered template path escapes target directory: ${destinationName}`);
	}
	return resolvedDestinationPath;
}

function stripTemplateExtension(entryName: string): string {
	return entryName.endsWith(".mustache")
		? entryName.slice(0, -".mustache".length)
		: entryName;
}

function renderTemplateDestinationName<TView>(
	entryName: string,
	view: TView,
	renderString: TemplateStringRenderer<TView>,
): string {
	return renderString(stripTemplateExtension(entryName), view);
}

async function traverseTemplateDirectory<TView>({
	filter,
	prepareDirectory,
	renderString,
	sourceDir,
	targetDir,
	view,
	visitFile,
}: TemplateTraversalOptions<TView>): Promise<void> {
	const entries = await fsp.readdir(sourceDir, { withFileTypes: true });
	for (const entry of entries) {
		const sourcePath = path.join(sourceDir, entry.name);
		const destinationName = renderTemplateDestinationName(
			entry.name,
			view,
			renderString,
		);
		const destinationPath = resolveRenderedPath(targetDir, destinationName);
		if (filter && !(await filter(sourcePath, destinationPath, entry))) {
			continue;
		}

		if (entry.isDirectory()) {
			await prepareDirectory?.(destinationPath);
			await traverseTemplateDirectory({
				filter,
				prepareDirectory,
				renderString,
				sourceDir: sourcePath,
				targetDir: destinationPath,
				view,
				visitFile,
			});
			continue;
		}

		await visitFile({
			destinationPath,
			sourcePath,
		});
	}
}

async function copyTemplateDirectory<TView>({
	filter,
	renderString,
	sourceDir,
	targetDir,
	view,
}: {
	filter?: CopyDirectoryFilter;
	renderString: TemplateStringRenderer<TView>;
	sourceDir: string;
	targetDir: string;
	view: TView;
}): Promise<void> {
	await fsp.mkdir(targetDir, { recursive: true });
	await traverseTemplateDirectory({
		filter,
		prepareDirectory: async (directoryPath) => {
			await fsp.mkdir(directoryPath, { recursive: true });
		},
		renderString,
		sourceDir,
		targetDir,
		view,
		visitFile: async ({ destinationPath, sourcePath }) => {
			await fsp.mkdir(path.dirname(destinationPath), { recursive: true });

			if (isBinaryTemplateFile(sourcePath)) {
				await fsp.copyFile(sourcePath, destinationPath);
				return;
			}

			const content = await fsp.readFile(sourcePath, "utf8");
			await fsp.writeFile(
				destinationPath,
				renderString(content, view),
				"utf8",
			);
		},
	});
}

/**
 * Recursively copies a directory tree without rendering template contents.
 */
export async function copyRawDirectory(
	sourceDir: string,
	targetDir: string,
	options: CopyRawDirectoryOptions = {},
): Promise<void> {
	await fsp.mkdir(targetDir, { recursive: true });
	for (const entry of await fsp.readdir(sourceDir, { withFileTypes: true })) {
		const sourcePath = path.join(sourceDir, entry.name);
		const targetPath = path.join(targetDir, entry.name);
		if (options.filter && !(await options.filter(sourcePath, targetPath, entry))) {
			continue;
		}
		if (entry.isDirectory()) {
			await copyRawDirectory(sourcePath, targetPath, options);
			continue;
		}

		await fsp.mkdir(path.dirname(targetPath), { recursive: true });
		await fsp.copyFile(sourcePath, targetPath);
	}
}

/**
 * Copy a template directory using full Mustache semantics for filenames and
 * text-file contents while leaving rendered values unescaped.
 */
export async function copyRenderedDirectory(
	sourceDir: string,
	targetDir: string,
	view: TemplateRenderView,
	options: {
		filter?: CopyDirectoryFilter;
	} = {},
): Promise<void> {
	await copyTemplateDirectory({
		filter: options.filter,
		renderString: renderMustacheTemplateString,
		sourceDir,
		targetDir,
		view,
	});
}

/**
 * Copy a template directory using direct `{{key}}` replacement only.
 *
 * This intentionally preserves literal Mustache sections, partials, and other
 * advanced constructs so built-in scaffold copy paths keep their historical
 * interpolation behavior.
 */
export async function copyInterpolatedDirectory(
	sourceDir: string,
	targetDir: string,
	view: Record<string, string>,
): Promise<void> {
	await copyTemplateDirectory({
		renderString: renderInterpolatedString,
		sourceDir,
		targetDir,
		view,
	});
}

/**
 * Lists the output file paths produced by an interpolated template directory
 * without writing any files to disk.
 *
 * This walks the source directory, applies the same filename interpolation and
 * `.mustache` stripping rules as `copyInterpolatedDirectory(...)`, and returns
 * normalized output-relative paths under a virtual root.
 *
 * @param sourceDir - The template directory to traverse.
 * @param view - The interpolation map used when resolving file and directory
 * names.
 * @returns A sorted array of normalized output paths relative to a virtual
 * preview root.
 */
export async function listInterpolatedDirectoryOutputs(
	sourceDir: string,
	view: Record<string, string>,
): Promise<string[]> {
	const virtualRoot = path.resolve("/wp-typia-template-preview");
	const outputs: string[] = [];

	await traverseTemplateDirectory({
		renderString: renderInterpolatedString,
		sourceDir,
		targetDir: virtualRoot,
		view,
		visitFile: async ({ destinationPath }) => {
			outputs.push(path.relative(virtualRoot, destinationPath).replace(/\\/g, "/"));
		},
	});
	return outputs.sort((left, right) => left.localeCompare(right));
}

export function pathExistsSync(targetPath: string): boolean {
	return fs.existsSync(targetPath);
}
