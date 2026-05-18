import fs from "node:fs";
import path from "node:path";

import { parseScaffoldBlockMetadata } from "@wp-typia/block-runtime/blocks";

import { createDoctorCheck } from "./cli-doctor-workspace-shared.js";
import { readJsonFileSync } from "../shared/json-utils.js";
import {
	hasExecutablePattern,
	maskTypeScriptCommentsAndLiterals,
} from "../shared/ts-source-masking.js";

import type { DoctorCheck } from "./cli-doctor.js";

const WORKSPACE_BLOCK_IFRAME_COMPATIBILITY_DOC_URL =
	"https://developer.wordpress.org/block-editor/reference-guides/block-api/block-api-versions/block-migration-for-iframe-editor-compatibility/";
const WORKSPACE_BLOCK_IFRAME_DIAGNOSTIC_CODES = {
	API_VERSION: "wp-typia.workspace.block.iframe.api-version",
	BLOCK_PROPS: "wp-typia.workspace.block.iframe.block-props",
	EDITOR_GLOBALS: "wp-typia.workspace.block.iframe.editor-globals",
	EDITOR_STYLES: "wp-typia.workspace.block.iframe.editor-styles",
} as const;
const WORKSPACE_BLOCK_EDITOR_SOURCE_FILE_PATTERN = /\.[cm]?[jt]sx?$/u;
const WORKSPACE_BLOCK_EDITOR_SOURCE_BASENAMES = new Set([
	"edit",
	"editor",
	"index",
	"save",
]);
const WORKSPACE_BLOCK_EDITOR_SOURCE_DIRECTORIES = new Set([
	"components",
	"controls",
	"editor",
	"inspector",
]);
const WORKSPACE_BLOCK_LOCAL_STYLE_FILES = [
	"editor.css",
	"editor.scss",
	"index.css",
	"style.css",
	"style.scss",
];
const WORKSPACE_BLOCK_IFRAME_GLOBAL_DOM_PATTERN =
	/\b(?:document|window)\b|\b(?:parent|top)\b(?!\s*:)/gu;
const WORKSPACE_BLOCK_PROPS_PATTERN =
	/\buse(?:Block|InnerBlocks)Props(?:\.save)?\s*\(/u;

type WorkspaceBlockIframeMetadata = Record<string, unknown> & {
	apiVersion?: unknown;
	editorStyle?: unknown;
	style?: unknown;
};

interface WorkspaceBlockEditorSource {
	relativePath: string;
	source: string;
}

function normalizePathSeparators(relativePath: string): string {
	return relativePath.split(path.sep).join("/");
}

function hasRegisteredBlockAsset(value: unknown): boolean {
	if (typeof value === "string") {
		return value.trim().length > 0;
	}
	if (Array.isArray(value)) {
		return value.some((entry) => hasRegisteredBlockAsset(entry));
	}
	return false;
}

function readWorkspaceBlockIframeMetadata(
	projectDir: string,
	blockSlug: string,
): {
	blockJsonRelativePath: string;
	document?: WorkspaceBlockIframeMetadata;
	error?: string;
} {
	const blockJsonRelativePath = path.join("src", "blocks", blockSlug, "block.json");
	const blockJsonPath = path.join(projectDir, blockJsonRelativePath);

	if (!fs.existsSync(blockJsonPath)) {
		return {
			blockJsonRelativePath,
			error: `Missing ${blockJsonRelativePath}`,
		};
	}

	try {
		const document = parseScaffoldBlockMetadata<WorkspaceBlockIframeMetadata>(
			readJsonFileSync(blockJsonPath, {
				context: "workspace block metadata",
			}),
		);
		return {
			blockJsonRelativePath,
			document,
		};
	} catch (error) {
		return {
			blockJsonRelativePath,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function isWorkspaceBlockEditorSource(relativePath: string): boolean {
	if (!WORKSPACE_BLOCK_EDITOR_SOURCE_FILE_PATTERN.test(relativePath)) {
		return false;
	}

	const normalizedRelativePath = normalizePathSeparators(relativePath);
	const normalizedDirName = path.posix.dirname(normalizedRelativePath);
	const normalizedBaseName = path.posix.basename(
		normalizedRelativePath,
		path.posix.extname(normalizedRelativePath),
	);
	if (WORKSPACE_BLOCK_EDITOR_SOURCE_BASENAMES.has(normalizedBaseName)) {
		return true;
	}

	const pathSegments = normalizedDirName.split("/");
	return pathSegments.some((segment) =>
		WORKSPACE_BLOCK_EDITOR_SOURCE_DIRECTORIES.has(segment),
	);
}

function isWorkspaceBlockSaveSource(relativePath: string): boolean {
	const normalizedBaseName = path.basename(relativePath, path.extname(relativePath));
	return normalizedBaseName === "save";
}

function collectWorkspaceBlockEditorSources(
	projectDir: string,
	blockSlug: string,
): WorkspaceBlockEditorSource[] {
	const blockDir = path.join(projectDir, "src", "blocks", blockSlug);
	if (!fs.existsSync(blockDir)) {
		return [];
	}

	const collected: WorkspaceBlockEditorSource[] = [];
	const queue: string[] = [blockDir];

	while (queue.length > 0) {
		const currentDir = queue.pop();
		if (!currentDir) {
			continue;
		}

		for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
			const absolutePath = path.join(currentDir, entry.name);
			if (entry.isDirectory()) {
				queue.push(absolutePath);
				continue;
			}
			if (!entry.isFile()) {
				continue;
			}

			const relativePath = path.relative(projectDir, absolutePath);
			if (!isWorkspaceBlockEditorSource(relativePath)) {
				continue;
			}

			collected.push({
				relativePath: normalizePathSeparators(relativePath),
				source: fs.readFileSync(absolutePath, "utf8"),
			});
		}
	}

	return collected.sort((left, right) =>
		left.relativePath.localeCompare(right.relativePath),
	);
}

function getSourceLineNumber(source: string, index: number): number {
	let line = 1;
	for (let cursor = 0; cursor < index; cursor += 1) {
		if (source[cursor] === "\n") {
			line += 1;
		}
	}
	return line;
}

function isGlobalDomAccessCandidate(
	source: string,
	index: number,
	identifier: string,
): boolean {
	const lineStart = source.lastIndexOf("\n", index - 1) + 1;
	const lineEndCandidate = source.indexOf("\n", index);
	const lineEnd = lineEndCandidate === -1 ? source.length : lineEndCandidate;
	const lineSource = source.slice(lineStart, lineEnd);
	const trimmedLine = lineSource.trimStart();

	if (trimmedLine.startsWith("import ")) {
		return false;
	}
	if (
		trimmedLine.startsWith("const ") ||
		trimmedLine.startsWith("let ") ||
		trimmedLine.startsWith("var ")
	) {
		return false;
	}
	if (trimmedLine.startsWith("function ") || trimmedLine.startsWith("class ")) {
		return false;
	}

	const precedingCharacter = index > 0 ? source[index - 1] : "";
	if (precedingCharacter === "." || precedingCharacter === "'" || precedingCharacter === '"') {
		return false;
	}

	return (
		identifier === "document" ||
		identifier === "window" ||
		identifier === "parent" ||
		identifier === "top"
	);
}

function findWorkspaceBlockGlobalDomAccesses(
	editorSources: WorkspaceBlockEditorSource[],
): string[] {
	return editorSources.flatMap(({ relativePath, source }) => {
		const maskedSource = maskTypeScriptCommentsAndLiterals(source);
		const matches = maskedSource.matchAll(WORKSPACE_BLOCK_IFRAME_GLOBAL_DOM_PATTERN);
		const findings: string[] = [];

		for (const match of matches) {
			const identifier = match[0];
			const matchIndex = match.index ?? -1;
			if (matchIndex < 0) {
				continue;
			}
			if (!isGlobalDomAccessCandidate(source, matchIndex, identifier)) {
				continue;
			}

			findings.push(`${relativePath}:${getSourceLineNumber(source, matchIndex)}`);
		}

		return findings;
	});
}

/**
 * Collect iframe/API v3 compatibility checks for one workspace block.
 *
 * @param projectDir Absolute workspace project root.
 * @param blockSlug Block slug from the workspace inventory.
 * @returns Ordered iframe compatibility doctor checks.
 */
export function getWorkspaceBlockIframeCompatibilityChecks(
	projectDir: string,
	blockSlug: string,
): DoctorCheck[] {
	const metadataResult = readWorkspaceBlockIframeMetadata(projectDir, blockSlug);
	if (!metadataResult.document) {
		return [
			createDoctorCheck(
				`Block iframe/API v3 ${blockSlug}`,
				"warn",
				metadataResult.error ?? `Unable to inspect ${metadataResult.blockJsonRelativePath}`,
				WORKSPACE_BLOCK_IFRAME_DIAGNOSTIC_CODES.API_VERSION,
			),
		];
	}

	const blockJson = metadataResult.document;
	const apiVersion =
		typeof blockJson.apiVersion === "number" && Number.isFinite(blockJson.apiVersion)
			? blockJson.apiVersion
			: null;
	const blockDir = path.join(projectDir, "src", "blocks", blockSlug);
	const localStyleFiles = WORKSPACE_BLOCK_LOCAL_STYLE_FILES.filter((fileName) =>
		fs.existsSync(path.join(blockDir, fileName)),
	).map((fileName) =>
		normalizePathSeparators(path.join("src", "blocks", blockSlug, fileName)),
	);
	const hasRegisteredEditorStyles =
		hasRegisteredBlockAsset(blockJson.style) ||
		hasRegisteredBlockAsset(blockJson.editorStyle);
	const editorSources = collectWorkspaceBlockEditorSources(projectDir, blockSlug);
	const editorWrapperSources = editorSources.filter(
		(source) => !isWorkspaceBlockSaveSource(source.relativePath),
	);
	const globalDomAccesses = findWorkspaceBlockGlobalDomAccesses(editorSources);
	const hasBlockPropsUsage = editorSources.some(({ source }) =>
		hasExecutablePattern(source, WORKSPACE_BLOCK_PROPS_PATTERN),
	);
	const hasEditorBlockPropsUsage = editorWrapperSources.some(({ source }) =>
		hasExecutablePattern(source, WORKSPACE_BLOCK_PROPS_PATTERN),
	);
	const blockWrapperStatus: DoctorCheck["status"] =
		editorWrapperSources.length === 0 || hasEditorBlockPropsUsage ? "pass" : "warn";
	const blockWrapperDetail =
		editorSources.length === 0
			? "No editor-facing block source files found; general file checks will report missing entrypoints"
			: editorWrapperSources.length === 0
				? "No editor wrapper source files found; general file checks will report missing entrypoints"
				: hasEditorBlockPropsUsage
					? "Editor-facing sources use block wrapper props"
					: hasBlockPropsUsage
						? "Only save-facing useBlockProps.save() usage was detected. Confirm the editor wrapper also receives useBlockProps() or useInnerBlocksProps() before relying on iframe editor rendering."
						: "No useBlockProps(), useBlockProps.save(), or useInnerBlocksProps() usage was detected in editor-facing sources. Confirm the block wrapper receives WordPress block editor props before relying on iframe editor rendering.";

	return [
		createDoctorCheck(
			`Block iframe API version ${blockSlug}`,
			apiVersion !== null && apiVersion >= 3 ? "pass" : "warn",
			apiVersion !== null && apiVersion >= 3
				? "block.json declares apiVersion 3 for iframe editor readiness"
				: `Set ${metadataResult.blockJsonRelativePath} apiVersion to 3 after testing the block in iframe-enabled Post Editor and Site Editor contexts. WordPress recommends API v3 for iframe editor compatibility. See ${WORKSPACE_BLOCK_IFRAME_COMPATIBILITY_DOC_URL}`,
			WORKSPACE_BLOCK_IFRAME_DIAGNOSTIC_CODES.API_VERSION,
		),
		createDoctorCheck(
			`Block iframe styles ${blockSlug}`,
			localStyleFiles.length === 0 || hasRegisteredEditorStyles ? "pass" : "warn",
			localStyleFiles.length === 0
				? "No local block stylesheet source files found to register"
				: hasRegisteredEditorStyles
					? "block.json registers block styles for iframe editor loading"
					: `Found stylesheet source files (${localStyleFiles.join(", ")}) but block.json does not declare style or editorStyle. Register block content styles so iframe editors do not depend on parent admin styles.`,
			WORKSPACE_BLOCK_IFRAME_DIAGNOSTIC_CODES.EDITOR_STYLES,
		),
		createDoctorCheck(
			`Block iframe globals ${blockSlug}`,
			globalDomAccesses.length === 0 ? "pass" : "warn",
			globalDomAccesses.length === 0
				? "No direct window/document/parent DOM access detected in editor-facing block sources"
				: `Direct global DOM access detected at ${globalDomAccesses.join(", ")}. Prefer element.ownerDocument/defaultView via refs or useRefEffect for iframe editor content.`,
			WORKSPACE_BLOCK_IFRAME_DIAGNOSTIC_CODES.EDITOR_GLOBALS,
		),
		createDoctorCheck(
			`Block iframe wrapper ${blockSlug}`,
			blockWrapperStatus,
			blockWrapperDetail,
			WORKSPACE_BLOCK_IFRAME_DIAGNOSTIC_CODES.BLOCK_PROPS,
		),
	];
}
