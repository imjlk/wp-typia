import path from "node:path";

import type { MigrationProjectState } from "./migration-types.js";

export function normalizeImportPath(relativePath: string, stripExtension = false): string {
	let nextPath = relativePath.replace(/\\/g, "/");
	if (!nextPath.startsWith(".")) {
		nextPath = `./${nextPath}`;
	}
	if (stripExtension) {
		nextPath = nextPath.replace(/\.[^.]+$/u, "");
	}
	return nextPath;
}

export function getGeneratedDir(
	block: MigrationProjectState["blocks"][number],
	state: MigrationProjectState,
): string {
	return block.layout === "legacy"
		? state.paths.generatedDir
		: path.join(state.paths.generatedDir, block.key);
}
