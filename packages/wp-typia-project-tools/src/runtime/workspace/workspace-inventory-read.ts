import { readFileSync } from "node:fs";
import path from "node:path";
import { readFile } from "node:fs/promises";

import { isFileNotFoundError } from "../shared/fs-async.js";
import { parseWorkspaceInventorySource } from "./workspace-inventory-parser.js";
import type {
	WorkspaceBlockInventoryEntry,
	WorkspaceBlockSelectOption,
	WorkspaceInventory,
} from "./workspace-inventory-types.js";

/**
 * Synchronously read and parse the canonical workspace inventory file.
 *
 * This compatibility helper is intentionally sync-only for callers that expose
 * synchronous APIs. Prefer `readWorkspaceInventoryAsync()` from async command
 * paths so workspace reads do not block the event loop.
 *
 * @deprecated Since 0.22.10. Use `readWorkspaceInventoryAsync()` from async
 * command paths. Removal target: not currently scheduled; this sync
 * compatibility helper remains available until release notes announce a
 * versioned target.
 *
 * @param projectDir Workspace root directory.
 * @returns Parsed `WorkspaceInventory` including the resolved `blockConfigPath`.
 * @throws {Error} When `scripts/block-config.ts` is missing or invalid.
 */
export function readWorkspaceInventory(projectDir: string): WorkspaceInventory {
	const blockConfigPath = path.join(projectDir, "scripts", "block-config.ts");
	let source: string;
	try {
		source = readFileSync(blockConfigPath, "utf8");
	} catch (error) {
		if (isFileNotFoundError(error)) {
			throw new Error(
				`Workspace inventory file is missing at ${blockConfigPath}. Expected scripts/block-config.ts to exist.`,
			);
		}
		throw error;
	}

	return {
		blockConfigPath,
		...parseWorkspaceInventorySource(source),
	};
}

/**
 * Asynchronously read and parse the canonical workspace inventory file.
 *
 * @param projectDir Workspace root directory.
 * @returns Parsed `WorkspaceInventory` including the resolved `blockConfigPath`.
 * @throws {Error} When `scripts/block-config.ts` is missing or invalid.
 */
export async function readWorkspaceInventoryAsync(
	projectDir: string,
): Promise<WorkspaceInventory> {
	const blockConfigPath = path.join(projectDir, "scripts", "block-config.ts");
	let source: string;
	try {
		source = await readFile(blockConfigPath, "utf8");
	} catch (error) {
		if (isFileNotFoundError(error)) {
			throw new Error(
				`Workspace inventory file is missing at ${blockConfigPath}. Expected scripts/block-config.ts to exist.`,
			);
		}
		throw error;
	}

	return {
		blockConfigPath,
		...parseWorkspaceInventorySource(source),
	};
}

function toWorkspaceBlockSelectOptions(
	blocks: readonly WorkspaceBlockInventoryEntry[],
): WorkspaceBlockSelectOption[] {
	return blocks.map((block) => ({
		description: block.typesFile,
		name: block.slug,
		value: block.slug,
	}));
}

/**
 * Synchronously return select options for the current workspace block inventory.
 *
 * The `description` field mirrors `block.typesFile`, while `name` and `value`
 * both map to the block slug for use in interactive add flows.
 *
 * @deprecated Since 0.22.10. Use `getWorkspaceBlockSelectOptionsAsync()` from
 * async command paths. Removal target: not currently scheduled; this sync
 * compatibility helper remains available until release notes announce a
 * versioned target.
 *
 * @param projectDir Workspace root directory.
 * @returns Block options for variation-target selection.
 */
export function getWorkspaceBlockSelectOptions(
	projectDir: string,
): WorkspaceBlockSelectOption[] {
	return toWorkspaceBlockSelectOptions(
		readWorkspaceInventory(projectDir).blocks,
	);
}

/**
 * Asynchronously return select options for the current workspace block inventory.
 *
 * The returned option shape matches `getWorkspaceBlockSelectOptions()` while
 * avoiding synchronous inventory reads in interactive or async command paths.
 *
 * @param projectDir Workspace root directory.
 * @returns Block options for variation-target selection.
 */
export async function getWorkspaceBlockSelectOptionsAsync(
	projectDir: string,
): Promise<WorkspaceBlockSelectOption[]> {
	return toWorkspaceBlockSelectOptions(
		(await readWorkspaceInventoryAsync(projectDir)).blocks,
	);
}
