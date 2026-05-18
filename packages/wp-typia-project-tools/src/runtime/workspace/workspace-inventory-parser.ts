import ts from "typescript";

import { parseInventorySection } from "./workspace-inventory-parser-entries.js";
import {
	BLOCK_INVENTORY_SECTION,
	INVENTORY_SECTIONS,
} from "./workspace-inventory-section-descriptors.js";
import type {
	WorkspaceBlockInventoryEntry,
	WorkspaceInventory,
	WorkspaceInventoryParseResult,
} from "./workspace-inventory-types.js";

export {
	BLOCK_INVENTORY_SECTION,
	INVENTORY_SECTIONS,
} from "./workspace-inventory-section-descriptors.js";
export type { InventorySectionDescriptor } from "./workspace-inventory-parser-validation.js";

/**
 * Parse workspace inventory entries from the source of `scripts/block-config.ts`.
 *
 * @param source Raw TypeScript source from `scripts/block-config.ts`.
 * @returns Parsed inventory sections without the resolved `blockConfigPath`.
 * @throws {Error} When `BLOCKS` is missing or any inventory entry is malformed.
 */
export function parseWorkspaceInventorySource(
	source: string,
): Omit<WorkspaceInventory, "blockConfigPath"> {
	const sourceFile = ts.createSourceFile(
		"block-config.ts",
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const parsedInventory: WorkspaceInventoryParseResult = {
		abilities: [],
		adminViews: [],
		aiFeatures: [],
		bindingSources: [],
		blockStyles: [],
		blockTransforms: [],
		blocks: parseInventorySection<WorkspaceBlockInventoryEntry>(
			sourceFile,
			BLOCK_INVENTORY_SECTION,
		).entries,
		contracts: [],
		editorPlugins: [],
		hasAbilitiesSection: false,
		hasAdminViewsSection: false,
		hasAiFeaturesSection: false,
		hasBindingSourcesSection: false,
		hasBlockStylesSection: false,
		hasBlockTransformsSection: false,
		hasContractsSection: false,
		hasEditorPluginsSection: false,
		hasPatternsSection: false,
		hasPostMetaSection: false,
		hasRestResourcesSection: false,
		hasVariationsSection: false,
		patterns: [],
		postMeta: [],
		restResources: [],
		source,
		variations: [],
	};

	const mutableInventory = parsedInventory as Record<string, unknown>;
	for (const section of INVENTORY_SECTIONS) {
		if (!section.parse) {
			continue;
		}

		const parsedSection = parseInventorySection(sourceFile, section);
		mutableInventory[section.parse.entriesKey] = parsedSection.entries;
		if (section.parse.hasSectionKey) {
			mutableInventory[section.parse.hasSectionKey] = parsedSection.found;
		}
	}

	return parsedInventory;
}
