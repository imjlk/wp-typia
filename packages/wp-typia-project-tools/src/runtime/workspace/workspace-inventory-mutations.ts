import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import { escapeRegex } from "../shared/php-utils.js";
import {
	BLOCK_INVENTORY_SECTION,
	INVENTORY_SECTIONS,
} from "./workspace-inventory-section-descriptors.js";
import { WORKSPACE_COMPATIBILITY_CONFIG_FIELD } from "./workspace-inventory-templates.js";
import type { WorkspaceInventoryUpdateOptions } from "./workspace-inventory-types.js";

function ensureWorkspaceInventorySections(source: string): string {
	let nextSource = source.trimEnd();

	for (const section of INVENTORY_SECTIONS) {
		if (
			section.interface &&
			!hasExportedTypeDeclaration(nextSource, section.interface.name)
		) {
			nextSource += section.interface.section;
		}
		if (section.value && !hasExportedConst(nextSource, section.value.name)) {
			nextSource += section.value.section;
		}
	}

	return `${nextSource}\n`;
}

function hasExportedTypeDeclaration(source: string, interfaceName: string): boolean {
	return new RegExp(
		`export\\s+(?:interface|type)\\s+${escapeRegex(interfaceName)}\\b`,
		"u",
	).test(source);
}

function hasExportedConst(source: string, constName: string): boolean {
	return new RegExp(
		`export\\s+const\\s+${escapeRegex(constName)}\\b`,
		"u",
	).test(source);
}

function appendEntriesAtMarker(
	source: string,
	marker: string,
	entries: string[],
): string {
	if (entries.length === 0) {
		return source;
	}
	if (!source.includes(marker)) {
		throw new Error(
			`Workspace inventory marker "${marker}" is missing in scripts/block-config.ts.`,
		);
	}

	const replacement = `${entries.join("\n")}\n${marker}`;
	return source.replace(marker, () => replacement);
}

function appendInventorySectionEntries(
	source: string,
	options: WorkspaceInventoryUpdateOptions,
): string {
	let nextSource = source;
	for (const section of [BLOCK_INVENTORY_SECTION, ...INVENTORY_SECTIONS]) {
		if (!section.append) {
			continue;
		}
		nextSource = appendEntriesAtMarker(
			nextSource,
			section.append.marker,
			options[section.append.optionKey] ?? [],
		);
	}
	return nextSource;
}

function ensureInterfaceField(
	source: string,
	interfaceName: string,
	fieldName: string,
	fieldSource: string,
): string {
	const interfacePattern = new RegExp(
		`(export\\s+interface\\s+${escapeRegex(
			interfaceName,
		)}\\s*\\{\\r?\\n)([\\s\\S]*?)(\\r?\\n\\})`,
		"u",
	);

	return source.replace(
		interfacePattern,
		(match, start: string, body: string, end: string) => {
			if (
				new RegExp(`^[ \t]*${escapeRegex(fieldName)}\\??:`, "mu").test(body)
			) {
				return match;
			}

			const lineEnding = start.endsWith("\r\n") ? "\r\n" : "\n";
			const formattedFieldSource = `${fieldSource
				.replace(/\r?\n$/u, "")
				.split("\n")
				.join(lineEnding)}${lineEnding}`;
			const memberPattern = /^[ \t]*([A-Za-z_$][\w$]*)\??:/gmu;

			for (const member of body.matchAll(memberPattern)) {
				const memberIndex = member.index;
				const memberName = member[1];
				if (memberIndex === undefined || !memberName) {
					continue;
				}
				if (memberName.localeCompare(fieldName) > 0) {
					return `${start}${body.slice(
						0,
						memberIndex,
					)}${formattedFieldSource}${body.slice(memberIndex)}${end}`;
				}
			}

			return `${start}${body}${
				body.length > 0 && !body.endsWith(lineEnding) ? lineEnding : ""
			}${formattedFieldSource}${end}`;
		},
	);
}

function upsertInterfaceField(
	source: string,
	interfaceName: string,
	fieldName: string,
	fieldSource: string,
): string {
	const interfacePattern = new RegExp(
		`(export\\s+interface\\s+${escapeRegex(
			interfaceName,
		)}\\s*\\{\\r?\\n)([\\s\\S]*?)(\\r?\\n\\})`,
		"u",
	);

	return source.replace(
		interfacePattern,
		(match, start: string, body: string, end: string) => {
			const lineEnding = start.endsWith("\r\n") ? "\r\n" : "\n";
			const formattedFieldSource = `${fieldSource
				.replace(/\r?\n$/u, "")
				.split("\n")
				.join(lineEnding)}${lineEnding}`;
			const existingFieldPattern = new RegExp(
				`(^[ \\t]*${escapeRegex(fieldName)}\\??:\\s*[^;\\r\\n]+;?\\r?\\n?)`,
				"mu",
			);
			const existingFieldMatch = existingFieldPattern.exec(body);

			if (existingFieldMatch?.[0]) {
				if (existingFieldMatch[0].trim() === fieldSource.trim()) {
					return match;
				}

				return `${start}${body.slice(
					0,
					existingFieldMatch.index,
				)}${formattedFieldSource}${body.slice(existingFieldMatch.index + existingFieldMatch[0].length)}${end}`;
			}

			const memberPattern = /^[ \t]*([A-Za-z_$][\w$]*)\??:/gmu;
			for (const member of body.matchAll(memberPattern)) {
				const memberIndex = member.index;
				const memberName = member[1];
				if (memberIndex === undefined || !memberName) {
					continue;
				}
				if (memberName.localeCompare(fieldName) > 0) {
					return `${start}${body.slice(
						0,
						memberIndex,
					)}${formattedFieldSource}${body.slice(memberIndex)}${end}`;
				}
			}

			return `${start}${body}${
				body.length > 0 && !body.endsWith(lineEnding) ? lineEnding : ""
			}${formattedFieldSource}${end}`;
		},
	);
}

function normalizeInterfaceFieldBlock(
	source: string,
	interfaceName: string,
	fieldName: string,
	fieldSource: string,
	requiredFragments: string[],
): string {
	const interfacePattern = new RegExp(
		`(export\\s+interface\\s+${escapeRegex(
			interfaceName,
		)}\\s*\\{\\r?\\n)([\\s\\S]*?)(\\r?\\n\\})`,
		"u",
	);

	return source.replace(
		interfacePattern,
		(match, start: string, body: string, end: string) => {
			const fieldPattern = new RegExp(
				`(^([ \\t]*)${escapeRegex(
					fieldName,
				)}\\??:\\s*\\{[ \\t]*\\r?\\n)([\\s\\S]*?)(^\\2\\};\\r?\\n?)`,
				"mu",
			);
			const fieldMatch = fieldPattern.exec(body);
			if (!fieldMatch) {
				return match;
			}

			const existingFieldSource = fieldMatch[0];
			if (
				requiredFragments.every((fragment) =>
					existingFieldSource.includes(fragment),
				)
			) {
				return match;
			}

			const lineEnding = start.endsWith("\r\n") ? "\r\n" : "\n";
			const formattedFieldSource = `${fieldSource
				.replace(/\r?\n$/u, "")
				.split("\n")
				.join(lineEnding)}${lineEnding}`;

			return `${start}${body.slice(
				0,
				fieldMatch.index,
			)}${formattedFieldSource}${body.slice(fieldMatch.index + existingFieldSource.length)}${end}`;
		},
	);
}

/**
 * Update `scripts/block-config.ts` source text with additional inventory entries.
 *
 * Missing inventory sections for variations, patterns, binding sources, REST
 * resources, workflow abilities, AI features, editor plugins, block styles, and
 * block transforms are created
 * automatically before new entries are appended at their marker comments.
 * When provided, `transformSource` runs before any entries are inserted.
 *
 * @param source Existing `scripts/block-config.ts` source.
 * @param options Entry lists plus an optional source transformer.
 * @returns Updated source text with all requested inventory entries appended.
 */
export function updateWorkspaceInventorySource(
	source: string,
	options: WorkspaceInventoryUpdateOptions = {},
): string {
	let nextSource = ensureWorkspaceInventorySections(source);
	if (options.transformSource) {
		nextSource = options.transformSource(nextSource);
	}
	nextSource = appendInventorySectionEntries(nextSource, options);
	for (const [fieldName, fieldSource] of [
		["contentFile", "\tcontentFile?: string;"],
		["file", "\tfile?: string;"],
		["scope", "\tscope?: 'full' | 'section';"],
		["sectionRole", "\tsectionRole?: string;"],
		["tags", "\ttags?: string[];"],
		["thumbnailUrl", "\tthumbnailUrl?: string;"],
		["title", "\ttitle?: string;"],
	] as const) {
		nextSource = upsertInterfaceField(
			nextSource,
			"WorkspacePatternConfig",
			fieldName,
			fieldSource,
		);
	}
	nextSource = ensureInterfaceField(
		nextSource,
		"WorkspaceBindingSourceConfig",
		"attribute",
		"\tattribute?: string;",
	);
	nextSource = ensureInterfaceField(
		nextSource,
		"WorkspaceBindingSourceConfig",
		"block",
		"\tblock?: string;",
	);
	nextSource = ensureInterfaceField(
		nextSource,
		"WorkspaceBindingSourceConfig",
		"metaPath",
		"\tmetaPath?: string;",
	);
	nextSource = ensureInterfaceField(
		nextSource,
		"WorkspaceBindingSourceConfig",
		"postMeta",
		"\tpostMeta?: string;",
	);
	nextSource = ensureInterfaceField(
		nextSource,
		"WorkspaceAbilityConfig",
		"compatibility",
		WORKSPACE_COMPATIBILITY_CONFIG_FIELD,
	);
	nextSource = normalizeInterfaceFieldBlock(
		nextSource,
		"WorkspaceAbilityConfig",
		"compatibility",
		WORKSPACE_COMPATIBILITY_CONFIG_FIELD,
		["optionalFeatureIds: string[];", "requiredFeatureIds: string[];"],
	);
	nextSource = ensureInterfaceField(
		nextSource,
		"WorkspaceAiFeatureConfig",
		"compatibility",
		WORKSPACE_COMPATIBILITY_CONFIG_FIELD,
	);
	nextSource = normalizeInterfaceFieldBlock(
		nextSource,
		"WorkspaceAiFeatureConfig",
		"compatibility",
		WORKSPACE_COMPATIBILITY_CONFIG_FIELD,
		["optionalFeatureIds: string[];", "requiredFeatureIds: string[];"],
	);
	for (const [fieldName, fieldSource] of [
		["auth", "\tauth?: 'authenticated' | 'public' | 'public-write-protected';"],
		["bodyTypeName", "\tbodyTypeName?: string;"],
		["controllerClass", "\tcontrollerClass?: string;"],
		["controllerExtends", "\tcontrollerExtends?: string;"],
		["dataFile", "\tdataFile?: string;"],
		["method", "\tmethod?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';"],
		["mode", "\tmode?: 'generated' | 'manual';"],
		["pathPattern", "\tpathPattern?: string;"],
		["permissionCallback", "\tpermissionCallback?: string;"],
		["phpFile", "\tphpFile?: string;"],
		["queryTypeName", "\tqueryTypeName?: string;"],
		["responseTypeName", "\tresponseTypeName?: string;"],
		["routePattern", "\troutePattern?: string;"],
		["secretFieldName", "\tsecretFieldName?: string;"],
		["secretPreserveOnEmpty", "\tsecretPreserveOnEmpty?: boolean;"],
		["secretStateFieldName", "\tsecretStateFieldName?: string;"],
	] as const) {
		nextSource = upsertInterfaceField(
			nextSource,
			"WorkspaceRestResourceConfig",
			fieldName,
			fieldSource,
		);
	}
	return nextSource;
}

/**
 * Append new entries to the canonical workspace inventory file on disk.
 *
 * @param projectDir Workspace root directory.
 * @param options Entry lists and optional source transform passed through to
 * `updateWorkspaceInventorySource`.
 * @returns Resolves once `scripts/block-config.ts` has been updated if needed.
 */
export async function appendWorkspaceInventoryEntries(
	projectDir: string,
	options: Parameters<typeof updateWorkspaceInventorySource>[1],
): Promise<void> {
	const blockConfigPath = path.join(projectDir, "scripts", "block-config.ts");
	const source = await readFile(blockConfigPath, "utf8");
	const nextSource = updateWorkspaceInventorySource(source, options);
	if (nextSource !== source) {
		await writeFile(blockConfigPath, nextSource, "utf8");
	}
}
