import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";

import { readOptionalFile } from "./cli-add-shared.js";

export const COMPOUND_SHARED_SUPPORT_FILES = [
	"hooks.ts",
	"validator-toolkit.ts",
] as const;
const LEGACY_ASSERT_PATTERN = /assert:\s*typia\.createAssert</u;
const LEGACY_MANIFEST_PATTERN = /\r?\n[ \t]*manifest:\s*currentManifest,/u;
const LEGACY_VALIDATOR_MANIFEST_IMPORT_PATTERN =
	/^[\uFEFF \t]*import\s+currentManifest\s+from\s*["']\.\/typia\.manifest\.json["'];?$/u;
const LEGACY_TOOLKIT_CALL_PATTERN =
	/createTemplateValidatorToolkit<\s*(?<typeName>[A-Za-z0-9_]+)\s*>\s*\(\s*\{/u;
const LEGACY_VALIDATOR_TOOLKIT_IMPORT_PATTERN =
	/from\s*["']\.\.\/\.\.\/validator-toolkit["']/u;
const TYPIA_IMPORT_PATTERN =
	/^[\uFEFF \t]*import\s+typia\s+from\s*["']typia["'];?/mu;
const COMPATIBLE_COMPOUND_TOOLKIT_PATTERNS = [
	/interface\s+TemplateValidatorFunctions\s*<\s*T\s+extends\s+object\s*>\s*\{/u,
	/\bassert\s*:\s*ScaffoldValidatorToolkitOptions\s*<\s*T\s*>\s*\[\s*["']assert["']\s*\]/u,
	/\bclone\s*:\s*ScaffoldValidatorToolkitOptions\s*<\s*T\s*>\s*\[\s*["']clone["']\s*\]/u,
	/\bis\s*:\s*ScaffoldValidatorToolkitOptions\s*<\s*T\s*>\s*\[\s*["']is["']\s*\]/u,
	/\bprune\s*:\s*ScaffoldValidatorToolkitOptions\s*<\s*T\s*>\s*\[\s*["']prune["']\s*\]/u,
	/\brandom\s*:\s*ScaffoldValidatorToolkitOptions\s*<\s*T\s*>\s*\[\s*["']random["']\s*\]/u,
	/\bvalidate\s*:\s*ScaffoldValidatorToolkitOptions\s*<\s*T\s*>\s*\[\s*["']validate["']\s*\]/u,
	/createTemplateValidatorToolkit\s*<\s*T\s+extends\s+object\s*>\s*\(\s*\{/u,
] as const;

const REST_MANIFEST_IMPORT_PATTERN =
	/import\s*\{[^}]*\bdefineEndpointManifest\b[^}]*\}\s*from\s*["']@wp-typia\/block-runtime\/metadata-core["'];?/m;

export function ensureBlockConfigCanAddRestManifests(source: string): string {
	const importLine =
		"import { defineEndpointManifest } from '@wp-typia/block-runtime/metadata-core';";
	if (REST_MANIFEST_IMPORT_PATTERN.test(source)) {
		return source;
	}
	return `${importLine}\n\n${source}`;
}

function shouldRefreshCompoundValidatorToolkit(source: string | null): boolean {
	return (
		source === null ||
		!COMPATIBLE_COMPOUND_TOOLKIT_PATTERNS.every((pattern) =>
			pattern.test(source),
		)
	);
}

function isLegacyCompoundValidatorSource(source: string | null): source is string {
	return (
		typeof source === "string" &&
		LEGACY_VALIDATOR_TOOLKIT_IMPORT_PATTERN.test(source) &&
		!LEGACY_ASSERT_PATTERN.test(source)
	);
}

function hasTypiaImport(source: string): boolean {
	return TYPIA_IMPORT_PATTERN.test(source.replace(/\/\*[\s\S]*?\*\//gu, ""));
}

function replaceFirstNonCommentLine(
	source: string,
	pattern: RegExp,
	replacement: string,
): string {
	const lineEnding = source.includes("\r\n") ? "\r\n" : "\n";
	const lines = source.split(/\r?\n/);
	let inBlockComment = false;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const trimmed = line.trimStart();

		if (inBlockComment) {
			if (trimmed.includes("*/")) {
				inBlockComment = false;
			}
			continue;
		}

		if (trimmed.startsWith("//")) {
			continue;
		}

		if (trimmed.startsWith("/*")) {
			if (!trimmed.includes("*/")) {
				inBlockComment = true;
			}
			continue;
		}

		if (!pattern.test(line)) {
			continue;
		}

		lines[index] = replacement;
		return lines.join(lineEnding);
	}

	return source;
}

function upgradeLegacyCompoundValidatorSource(source: string): string {
	const typeNameMatch = source.match(LEGACY_TOOLKIT_CALL_PATTERN);
	const typeName = typeNameMatch?.groups?.typeName;
	if (!typeName) {
		throw new Error(
			"Unable to upgrade a legacy compound validator without a generated type import.",
		);
	}

	let nextSource = source;
	if (!hasTypiaImport(nextSource)) {
		nextSource = `import typia from 'typia';\n${nextSource}`;
	}

	nextSource = replaceFirstNonCommentLine(
		nextSource,
		LEGACY_VALIDATOR_MANIFEST_IMPORT_PATTERN,
		"import currentManifest from './manifest-defaults-document';",
	);

	nextSource = nextSource.replace(
		LEGACY_TOOLKIT_CALL_PATTERN,
		[
			`createTemplateValidatorToolkit< ${typeName} >( {`,
			`\tassert: typia.createAssert< ${typeName} >(),`,
			`\tclone: typia.misc.createClone< ${typeName} >() as (`,
			`\t\tvalue: ${typeName},`,
			`\t) => ${typeName},`,
			`\tis: typia.createIs< ${typeName} >(),`,
		].join("\n") + "\n",
	);

	const replacedManifest = nextSource.replace(
		LEGACY_MANIFEST_PATTERN,
		[
			"",
			"\tmanifest: currentManifest,",
			`\tprune: typia.misc.createPrune< ${typeName} >(),`,
			`\trandom: typia.createRandom< ${typeName} >() as (`,
			"\t\t...args: unknown[]",
			`\t) => ${typeName},`,
			`\tvalidate: typia.createValidate< ${typeName} >(),`,
		].join("\n"),
	);
	if (replacedManifest === nextSource) {
		throw new Error(
			"Unable to upgrade legacy compound validator: manifest anchor not found.",
		);
	}

	return replacedManifest;
}

function renderLegacyManifestDefaultsWrapperSource(): string {
	return [
		"import rawCurrentManifest from './typia.manifest.json';",
		"import { defineManifestDefaultsDocument } from '@wp-typia/block-runtime/defaults';",
		"",
		"const currentManifest = defineManifestDefaultsDocument( rawCurrentManifest );",
		"",
		"export default currentManifest;",
		"",
	].join("\n");
}

async function ensureLegacyCompoundValidatorManifestDefaultsWrapper(
	validatorPath: string,
): Promise<void> {
	const validatorDir = path.dirname(validatorPath);
	const wrapperPath = path.join(validatorDir, "manifest-defaults-document.ts");
	const manifestPath = path.join(validatorDir, "typia.manifest.json");
	if (fs.existsSync(wrapperPath) || !fs.existsSync(manifestPath)) {
		return;
	}

	await fsp.writeFile(
		wrapperPath,
		renderLegacyManifestDefaultsWrapperSource(),
		"utf8",
	);
}

export async function collectLegacyCompoundValidatorPaths(
	projectDir: string,
): Promise<string[]> {
	const blocksDir = path.join(projectDir, "src", "blocks");
	if (!fs.existsSync(blocksDir)) {
		return [];
	}

	const blockEntries = await fsp.readdir(blocksDir, { withFileTypes: true });
	const validatorPaths = await Promise.all(
		blockEntries
			.filter((entry) => entry.isDirectory())
			.map(async (entry) => {
				const validatorPath = path.join(blocksDir, entry.name, "validators.ts");
				const validatorSource = await readOptionalFile(validatorPath);
				return isLegacyCompoundValidatorSource(validatorSource)
					? validatorPath
					: null;
			}),
	);

	return validatorPaths.filter(
		(validatorPath): validatorPath is string => validatorPath !== null,
	);
}

export async function ensureCompoundWorkspaceSupportFiles(
	projectDir: string,
	tempProjectDir: string,
	legacyValidatorPaths: readonly string[],
): Promise<void> {
	for (const fileName of COMPOUND_SHARED_SUPPORT_FILES) {
		const sourcePath = path.join(tempProjectDir, "src", fileName);
		if (!fs.existsSync(sourcePath)) {
			continue;
		}

		const targetPath = path.join(projectDir, "src", fileName);
		const currentSource = await readOptionalFile(targetPath);
		if (
			fileName === "validator-toolkit.ts"
				? shouldRefreshCompoundValidatorToolkit(currentSource)
				: currentSource === null
		) {
			await fsp.mkdir(path.dirname(targetPath), { recursive: true });
			await fsp.copyFile(sourcePath, targetPath);
		}
	}

	for (const validatorPath of legacyValidatorPaths) {
		const currentSource = await readOptionalFile(validatorPath);
		if (!isLegacyCompoundValidatorSource(currentSource)) {
			continue;
		}

		await ensureLegacyCompoundValidatorManifestDefaultsWrapper(validatorPath);
		await fsp.writeFile(
			validatorPath,
			upgradeLegacyCompoundValidatorSource(currentSource),
			"utf8",
		);
	}
}
