import path from "node:path";

import {
	compareMigrationVersionLabels,
	formatLegacyMigrationWorkspaceResetGuidance,
	isLegacySemverMigrationVersion,
	isMigrationVersionLabel,
} from "./migration-utils.js";
import type { MigrationBlockConfig, MigrationConfig } from "./migration-types.js";

export function normalizeRelativePath(value: string): string {
	return value.replace(/\\/g, "/");
}

export function ensureRelativePath(projectDir: string, filePath: string): string {
	return normalizeRelativePath(path.relative(projectDir, filePath));
}

function stripCommentsAndStrings(source: string): string {
	let result = "";
	let index = 0;
	let mode: "block-comment" | "code" | "double-quote" | "line-comment" | "single-quote" | "template" = "code";

	while (index < source.length) {
		const current = source[index];
		const next = source[index + 1];

		if (mode === "code") {
			if (current === "/" && next === "/") {
				result += "  ";
				index += 2;
				mode = "line-comment";
				continue;
			}
			if (current === "/" && next === "*") {
				result += "  ";
				index += 2;
				mode = "block-comment";
				continue;
			}
			if (current === "'") {
				result += current;
				index += 1;
				mode = "single-quote";
				continue;
			}
			if (current === "\"") {
				result += current;
				index += 1;
				mode = "double-quote";
				continue;
			}
			if (current === "`") {
				result += current;
				index += 1;
				mode = "template";
				continue;
			}
			result += current;
			index += 1;
			continue;
		}

		if (mode === "line-comment") {
			result += current === "\n" ? "\n" : " ";
			index += 1;
			if (current === "\n") {
				mode = "code";
			}
			continue;
		}

		if (mode === "block-comment") {
			if (current === "*" && next === "/") {
				result += "  ";
				index += 2;
				mode = "code";
				continue;
			}
			result += current === "\n" ? "\n" : " ";
			index += 1;
			continue;
		}

		if (current === "\\") {
			result += index + 1 < source.length ? "  " : " ";
			index += Math.min(2, source.length - index);
			continue;
		}

		const closingQuote =
			mode === "single-quote"
				? "'"
				: mode === "double-quote"
					? "\""
					: "`";
		if (current === closingQuote) {
			result += current;
			index += 1;
			mode = "code";
			continue;
		}

		result += current === "\n" ? "\n" : " ";
		index += 1;
	}

	return result;
}

function findMigrationConfigBodyRange(source: string): { end: number; start: number } | null {
	const sanitizedSource = stripCommentsAndStrings(source);
	const configAssignment = /\bmigrationConfig\s*=\s*\{/u.exec(sanitizedSource);
	if (!configAssignment) {
		return null;
	}

	const braceStart = configAssignment.index + configAssignment[0].length - 1;
	let braceDepth = 0;
	for (let index = braceStart; index < sanitizedSource.length; index += 1) {
		const current = sanitizedSource[index];
		if (current === "{") {
			braceDepth += 1;
			continue;
		}
		if (current === "}") {
			braceDepth -= 1;
			if (braceDepth === 0) {
				return {
					end: index,
					start: braceStart + 1,
				};
			}
		}
	}

	return null;
}

function createTopLevelConfigView(source: string): string | null {
	const range = findMigrationConfigBodyRange(source);
	if (!range) {
		return null;
	}

	const bodySource = source.slice(range.start, range.end);
	const sanitizedBody = stripCommentsAndStrings(bodySource);
	let view = "";
	let braceDepth = 0;
	let bracketDepth = 0;
	let parenDepth = 0;

	for (let index = 0; index < sanitizedBody.length; index += 1) {
		const current = sanitizedBody[index];

		if (current === "{") {
			braceDepth += 1;
		} else if (current === "}") {
			braceDepth = Math.max(0, braceDepth - 1);
		} else if (current === "[") {
			bracketDepth += 1;
		} else if (current === "]") {
			bracketDepth = Math.max(0, bracketDepth - 1);
		} else if (current === "(") {
			parenDepth += 1;
		} else if (current === ")") {
			parenDepth = Math.max(0, parenDepth - 1);
		}

		const nested = braceDepth > 0 || bracketDepth > 0 || parenDepth > 0;
		view += nested && current !== "{" && current !== "}" && current !== "[" && current !== "]" && current !== "(" && current !== ")"
			? current === "\n"
				? "\n"
				: " "
			: current;
	}

	return view;
}

function findTopLevelConfigPropertyValueStart(source: string, key: string): { bodySource: string; start: number } | null {
	const range = findMigrationConfigBodyRange(source);
	if (!range) {
		return null;
	}

	const bodySource = source.slice(range.start, range.end);
	const topLevelView = createTopLevelConfigView(source);
	if (!topLevelView) {
		return null;
	}

	const pattern = new RegExp(`\\b${key}\\s*:\\s*`, "u");
	const match = pattern.exec(topLevelView);
	if (!match) {
		return null;
	}

	let start = match.index + match[0].length;
	while (start < bodySource.length && /\s/u.test(bodySource[start])) {
		start += 1;
	}

	return { bodySource, start };
}

export function hasLegacyConfigKeys(source: string): boolean {
	const topLevelView = createTopLevelConfigView(source);
	if (!topLevelView) {
		return false;
	}
	return /\bcurrentVersion\s*:/u.test(topLevelView) || /\bsupportedVersions\s*:/u.test(topLevelView);
}

function readQuotedString(source: string, startIndex: number): string | null {
	const quote = source[startIndex];
	if (quote !== "\"" && quote !== "'") {
		return null;
	}

	let value = "";
	let index = startIndex + 1;
	while (index < source.length) {
		const current = source[index];
		if (current === "\\") {
			if (index + 1 < source.length) {
				value += source.slice(index, index + 2);
				index += 2;
				continue;
			}
			value += current;
			index += 1;
			continue;
		}
		if (current === quote) {
			return value;
		}
		value += current;
		index += 1;
	}

	return null;
}

function readStringArrayLiteral(source: string, startIndex: number): string[] | null {
	if (source[startIndex] !== "[") {
		return null;
	}

	let bracketDepth = 0;
	let index = startIndex;
	let quote: "'" | "\"" | null = null;
	while (index < source.length) {
		const current = source[index];
		if (quote) {
			if (current === "\\") {
				index += 2;
				continue;
			}
			if (current === quote) {
				quote = null;
			}
			index += 1;
			continue;
		}
		if (current === "\"" || current === "'") {
			quote = current;
			index += 1;
			continue;
		}
		if (current === "[") {
			bracketDepth += 1;
		} else if (current === "]") {
			bracketDepth -= 1;
			if (bracketDepth === 0) {
				const body = source.slice(startIndex + 1, index);
				return [...body.matchAll(/["']([^"']+)["']/gu)].map((match) => match[1]);
			}
		}
		index += 1;
	}

	return null;
}

function readArrayLiteralBody(source: string, startIndex: number): string | null {
	if (source[startIndex] !== "[") {
		return null;
	}

	let bracketDepth = 0;
	let index = startIndex;
	let quote: "'" | "\"" | null = null;
	while (index < source.length) {
		const current = source[index];
		if (quote) {
			if (current === "\\") {
				index += 2;
				continue;
			}
			if (current === quote) {
				quote = null;
			}
			index += 1;
			continue;
		}
		if (current === "\"" || current === "'") {
			quote = current;
			index += 1;
			continue;
		}
		if (current === "[") {
			bracketDepth += 1;
		} else if (current === "]") {
			bracketDepth -= 1;
			if (bracketDepth === 0) {
				return source.slice(startIndex + 1, index);
			}
		}
		index += 1;
	}

	return null;
}

function extractObjectLiteralBodies(source: string): string[] {
	const results: string[] = [];
	let braceDepth = 0;
	let objectStart = -1;
	let quote: "'" | "\"" | null = null;

	for (let index = 0; index < source.length; index += 1) {
		const current = source[index];
		if (quote) {
			if (current === "\\") {
				index += 1;
				continue;
			}
			if (current === quote) {
				quote = null;
			}
			continue;
		}
		if (current === "\"" || current === "'") {
			quote = current;
			continue;
		}
		if (current === "{") {
			if (braceDepth === 0) {
				objectStart = index + 1;
			}
			braceDepth += 1;
			continue;
		}
		if (current === "}") {
			braceDepth -= 1;
			if (braceDepth === 0 && objectStart >= 0) {
				results.push(source.slice(objectStart, index));
				objectStart = -1;
			}
		}
	}

	return results;
}

export function createLegacyMigrationWorkspaceResetError(reason: string): Error {
	return new Error(
		`Detected a legacy semver-based migration workspace. ${formatLegacyMigrationWorkspaceResetGuidance(reason)}`,
	);
}

function parseMigrationBlocks(source: string): MigrationBlockConfig[] {
	const blocksArrayBody = matchRootConfigArrayBody(source, "blocks");
	if (!blocksArrayBody) {
		return [];
	}

	const blockLiterals = extractObjectLiteralBodies(blocksArrayBody);
	return blockLiterals
		.map((body) => {
			const key = matchConfigValue(body, "key");
			const blockName = matchConfigValue(body, "blockName");
			const blockJsonFile = matchConfigValue(body, "blockJsonFile");
			const manifestFile = matchConfigValue(body, "manifestFile");
			const saveFile = matchConfigValue(body, "saveFile");
			const typesFile = matchConfigValue(body, "typesFile");
			if (!key || !blockName || !blockJsonFile || !manifestFile || !saveFile || !typesFile) {
				return null;
			}
			return {
				blockJsonFile,
				blockName,
				key,
				manifestFile,
				saveFile,
				typesFile,
			} satisfies MigrationBlockConfig;
		})
		.filter((block): block is MigrationBlockConfig => block !== null);
}

function matchConfigValue(source: string, key: string): string | null {
	const pattern = new RegExp(`${key}:\\s*["']([^"']+)["']`, "u");
	return source.match(pattern)?.[1] ?? null;
}

function matchRootConfigValue(source: string, key: string): string | null {
	const match = findTopLevelConfigPropertyValueStart(source, key);
	if (!match) {
		return null;
	}
	return readQuotedString(match.bodySource, match.start);
}

function matchRootConfigStringArrayValue(source: string, key: string): string[] | null {
	const match = findTopLevelConfigPropertyValueStart(source, key);
	if (!match) {
		return null;
	}
	return readStringArrayLiteral(match.bodySource, match.start);
}

function matchRootConfigArrayBody(source: string, key: string): string | null {
	const match = findTopLevelConfigPropertyValueStart(source, key);
	if (!match) {
		return null;
	}
	return readArrayLiteralBody(match.bodySource, match.start);
}

export function parseMigrationConfig(source: string): MigrationConfig {
	if (hasLegacyConfigKeys(source)) {
		throw createLegacyMigrationWorkspaceResetError(
			"Detected legacy config keys `currentVersion` / `supportedVersions` in `src/migrations/config.ts`.",
		);
	}

	const blockName = matchRootConfigValue(source, "blockName");
	const currentMigrationVersion = matchRootConfigValue(source, "currentMigrationVersion");
	const snapshotDir = matchRootConfigValue(source, "snapshotDir");
	const supportedMigrationVersions = matchRootConfigStringArrayValue(source, "supportedMigrationVersions");
	const blocksArrayBody = matchRootConfigArrayBody(source, "blocks");
	const blocks = blocksArrayBody === null ? [] : parseMigrationBlocks(source);

	if (!currentMigrationVersion || !snapshotDir || !supportedMigrationVersions) {
		throw new Error("Unable to parse migration config. Regenerate with `wp-typia migrate init --current-migration-version v1`.");
	}
	if (blocksArrayBody !== null && blocks.length === 0 && blocksArrayBody.trim().length > 0) {
		throw new Error(
			"Migration config defines `blocks`, but the array entries could not be parsed. Regenerate the config or fix the malformed block targets in `src/migrations/config.ts`.",
		);
	}
	if (!blockName && blocks.length === 0 && blocksArrayBody === null) {
		throw new Error("Migration config must define `blockName` or `blocks`.");
	}

	if (!isMigrationVersionLabel(currentMigrationVersion)) {
		if (isLegacySemverMigrationVersion(currentMigrationVersion)) {
			throw createLegacyMigrationWorkspaceResetError(
				`Detected legacy semver migration version label \`${currentMigrationVersion}\` in \`src/migrations/config.ts\`.`,
			);
		}
		throw new Error(`Invalid current migration version: ${currentMigrationVersion}. Expected vN with N >= 1.`);
	}

	for (const version of supportedMigrationVersions) {
		if (!isMigrationVersionLabel(version)) {
			if (isLegacySemverMigrationVersion(version)) {
				throw createLegacyMigrationWorkspaceResetError(
					`Detected legacy semver migration version label \`${version}\` in \`src/migrations/config.ts\`.`,
				);
			}
			throw new Error(`Invalid supported migration version: ${version}. Expected vN with N >= 1.`);
		}
	}
	supportedMigrationVersions.sort(compareMigrationVersionLabels);

	return {
		blockName: blockName ?? undefined,
		blocks: blocksArrayBody === null ? undefined : blocks,
		currentMigrationVersion,
		snapshotDir,
		supportedMigrationVersions,
	};
}
