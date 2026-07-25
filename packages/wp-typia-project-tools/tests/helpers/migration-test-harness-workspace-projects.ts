import * as fs from "node:fs";
import * as path from "node:path";

import {
	createManifestAttribute,
	HELPERS_SOURCE,
} from "./migration-test-harness-manifest.js";
import {
	repoTtsxPath,
	writeFile,
	writeJson,
} from "./migration-test-harness-runtime.js";
import { createCurrentSingleBlockScaffoldProject } from "./migration-test-harness-basic-projects.js";
import type { ReadlinePrompt } from "../../src/runtime/cli-prompt.js";

export type PromptSelectionCall = {
	defaultValue?: number;
	message: string;
	options: Array<{
		hint?: string;
		label: string;
		value: string;
	}>;
};

export function createStubPrompt(selectedValue: string | undefined, calls: PromptSelectionCall[]): ReadlinePrompt {
	return {
		close(): void {
			// Tests inject a no-op prompt and manage their own lifecycle.
		},
		async select<T extends string>(
			message: string,
			options: Array<{ hint?: string; label: string; value: T }>,
			defaultValue?: number,
		): Promise<T> {
			calls.push({
				defaultValue,
				message,
				options: options.map((option) => ({
					hint: option.hint,
					label: option.label,
					value: option.value,
				})),
			});
			if (
				selectedValue === undefined &&
				typeof defaultValue === "number" &&
				defaultValue > 0 &&
				options[defaultValue - 1]
			) {
				return options[defaultValue - 1].value;
			}
			return (selectedValue ?? options[0]?.value) as T;
		},
		async text(_message: string, defaultValue: string): Promise<string> {
			return defaultValue;
		},
	};
}

export function writeMultiBlockCurrentFiles(
	projectDir: string,
	block: {
		blockName: string;
		blockSlug: string;
		title: string;
		typeName: string;
	},
) {
	const blockDir = path.join(projectDir, "src", "blocks", block.blockSlug);
	writeFile(
		path.join(blockDir, "save.tsx"),
		`export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.content ?? null;\n}\n`,
	);
	writeFile(
		path.join(blockDir, "types.ts"),
		`export interface ${block.typeName} {\n\tcontent: string;\n}\n`,
	);
	writeFile(
		path.join(blockDir, "validators.ts"),
		`export const validators = {\n\tvalidate(input: Record<string, unknown>) {\n\t\tconst success = typeof input.content === "string";\n\t\treturn success\n\t\t\t? { success: true as const, data: input }\n\t\t\t: { success: false as const, errors: [{ path: "$", expected: "${block.typeName}" }] };\n\t},\n\trandom() {\n\t\treturn { content: "Hello ${block.blockSlug}" };\n\t},\n};\n`,
	);
	writeJson(path.join(blockDir, "block.json"), {
		apiVersion: 3,
		attributes: {
			content: { default: `Hello ${block.blockSlug}`, type: "string" },
		},
		name: block.blockName,
		title: block.title,
	});
	writeJson(path.join(blockDir, "typia.manifest.json"), {
		attributes: {
			content: createManifestAttribute("string", {
				defaultValue: `Hello ${block.blockSlug}`,
				required: true,
			}),
		},
		manifestVersion: 2,
		sourceType: block.typeName,
	});
}

export function writeMultiBlockSnapshot(
	projectDir: string,
	version: string,
	block: {
		blockName: string;
		blockSlug: string;
		title: string;
		typeName: string;
	},
	legacyLabel = `Legacy ${block.blockSlug}`,
) {
	const snapshotRoot = path.join(
		projectDir,
		"src",
		"migrations",
		"versions",
		version,
		block.blockSlug,
	);
	writeJson(path.join(snapshotRoot, "block.json"), {
		apiVersion: 3,
		attributes: {
			content: { default: legacyLabel, type: "string" },
		},
		name: block.blockName,
		title: block.title,
	});
	writeJson(path.join(snapshotRoot, "typia.manifest.json"), {
		attributes: {
			content: createManifestAttribute("string", {
				defaultValue: legacyLabel,
				required: true,
			}),
		},
		manifestVersion: 2,
		sourceType: block.typeName,
	});
	writeFile(
		path.join(snapshotRoot, "save.tsx"),
		`export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.content ?? null;\n}\n`,
	);
}

export function createMultiBlockMigrationProject(
	projectDir: string,
	{ includeLegacyChild = true }: { includeLegacyChild?: boolean } = {},
) {
	writeJson(path.join(projectDir, "package.json"), {
		name: "multi-block-migration-smoke",
		packageManager: "bun@1.3.11",
		private: true,
		scripts: {},
		type: "module",
		version: "0.1.0",
	});

	const parent = {
		blockName: "create-block/multi-parent",
		blockSlug: "multi-parent",
		title: "Multi Parent",
		typeName: "MultiParentAttributes",
	};
	const child = {
		blockName: "create-block/multi-parent-item",
		blockSlug: "multi-parent-item",
		title: "Multi Parent Item",
		typeName: "MultiParentItemAttributes",
	};

	writeMultiBlockCurrentFiles(projectDir, parent);
	writeMultiBlockCurrentFiles(projectDir, child);
	writeFile(
		path.join(projectDir, "src", "migrations", "config.ts"),
		`export const migrationConfig = {\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n\tblocks: [\n\t\t{\n\t\t\tkey: "multi-parent",\n\t\t\tblockName: "create-block/multi-parent",\n\t\t\tblockJsonFile: "src/blocks/multi-parent/block.json",\n\t\t\tmanifestFile: "src/blocks/multi-parent/typia.manifest.json",\n\t\t\tsaveFile: "src/blocks/multi-parent/save.tsx",\n\t\t\ttypesFile: "src/blocks/multi-parent/types.ts",\n\t\t},\n\t\t{\n\t\t\tkey: "multi-parent-item",\n\t\t\tblockName: "create-block/multi-parent-item",\n\t\t\tblockJsonFile: "src/blocks/multi-parent-item/block.json",\n\t\t\tmanifestFile: "src/blocks/multi-parent-item/typia.manifest.json",\n\t\t\tsaveFile: "src/blocks/multi-parent-item/save.tsx",\n\t\t\ttypesFile: "src/blocks/multi-parent-item/types.ts",\n\t\t},\n\t],\n} as const;\n\nexport default migrationConfig;\n`,
	);
	writeFile(path.join(projectDir, "src", "migrations", "helpers.ts"), HELPERS_SOURCE);
	writeMultiBlockSnapshot(projectDir, "v3", parent, "Hello multi-parent");
	writeMultiBlockSnapshot(projectDir, "v3", child, "Hello multi-parent-item");
	writeMultiBlockSnapshot(projectDir, "v1", parent);
	if (includeLegacyChild) {
		writeMultiBlockSnapshot(projectDir, "v1", child);
	}

	const localBinDir = path.join(projectDir, "node_modules", ".bin");
	fs.mkdirSync(localBinDir, { recursive: true });
	fs.symlinkSync(repoTtsxPath, path.join(localBinDir, "ttsx"));
}

export function addOfficialWorkspaceInventory(
	projectDir: string,
	blockSlugs: string[],
) {
	const packageJsonPath = path.join(projectDir, "package.json");
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
	packageJson.wpTypia = {
		projectType: "workspace",
		templatePackage: "@wp-typia/create-workspace-template",
		namespace: "create-block",
		textDomain: "create-block",
		phpPrefix: "create_block",
	};
	writeJson(packageJsonPath, packageJson);

	const blockEntries = blockSlugs
		.map(
			(blockSlug) => `\t{\n\t\tslug: "${blockSlug}",\n\t\tattributeTypeName: "${blockSlug
				.split("-")
				.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
				.join("")}Attributes",\n\t\ttypesFile: "src/blocks/${blockSlug}/types.ts",\n\t},`,
		)
		.join("\n");

	writeFile(
		path.join(projectDir, "scripts", "block-config.ts"),
		`export interface WorkspaceBlockConfig {\n\tslug: string;\n\tattributeTypeName: string;\n\ttypesFile: string;\n\tapiTypesFile?: string;\n\topenApiFile?: string;\n}\n\nexport interface WorkspaceVariationConfig {\n\tblock: string;\n\tfile: string;\n\tslug: string;\n}\n\nexport interface WorkspacePatternConfig {\n\tfile: string;\n\tslug: string;\n}\n\nexport const BLOCKS: WorkspaceBlockConfig[] = [\n${blockEntries}\n];\n\nexport const VARIATIONS: WorkspaceVariationConfig[] = [];\n\nexport const PATTERNS: WorkspacePatternConfig[] = [];\n`,
	);
}

export interface WorkspaceVariationConfig {
	block: string;
	file: string;
	slug: string;
}

export interface WorkspacePatternConfig {
	file: string;
	slug: string;
}

type WorkspaceBlockConfig = {
	attributeTypeName: string;
	slug: string;
	typesFile: string;
};

export const BLOCKS: WorkspaceBlockConfig[] = [
];

export const VARIATIONS: WorkspaceVariationConfig[] = [];

export const PATTERNS: WorkspacePatternConfig[] = [];

export function createRetrofitMultiBlockProject(projectDir: string) {
	writeJson(path.join(projectDir, "package.json"), {
		name: "retrofit-multi-block",
		packageManager: "bun@1.3.11",
		private: true,
		scripts: {},
		type: "module",
		version: "0.1.0",
	});

	writeMultiBlockCurrentFiles(projectDir, {
		blockName: "create-block/multi-parent",
		blockSlug: "multi-parent",
		title: "Multi Parent",
		typeName: "MultiParentAttributes",
	});
	writeMultiBlockCurrentFiles(projectDir, {
		blockName: "create-block/multi-parent-item",
		blockSlug: "multi-parent-item",
		title: "Multi Parent Item",
		typeName: "MultiParentItemAttributes",
	});
}

export function createRetrofitMultiBlockProjectWithBrokenCandidate(projectDir: string) {
	createRetrofitMultiBlockProject(projectDir);
	writeFile(
		path.join(projectDir, "src", "blocks", "broken-item", "save.tsx"),
		`export default function Save() {\n\treturn null;\n}\n`,
	);
	writeFile(
		path.join(projectDir, "src", "blocks", "broken-item", "types.ts"),
		`export interface BrokenItemAttributes {}\n`,
	);
	writeFile(path.join(projectDir, "src", "blocks", "broken-item", "block.json"), '{"apiVersion":3,');
}

export function createSingleBlockProjectWithBrokenMultiBlockCandidate(projectDir: string) {
	createCurrentSingleBlockScaffoldProject(projectDir);
	writeFile(
		path.join(projectDir, "src", "blocks", "broken-item", "save.tsx"),
		`export default function Save() {\n\treturn null;\n}\n`,
	);
	writeFile(
		path.join(projectDir, "src", "blocks", "broken-item", "types.ts"),
		`export interface BrokenItemAttributes {}\n`,
	);
	writeFile(path.join(projectDir, "src", "blocks", "broken-item", "block.json"), '{"apiVersion":3,');
}

export function createBrokenOnlyMultiBlockProject(projectDir: string) {
	writeJson(path.join(projectDir, "package.json"), {
		name: "broken-only-multi-block",
		packageManager: "bun@1.3.11",
		private: true,
		scripts: {},
		type: "module",
		version: "0.1.0",
	});
	writeFile(
		path.join(projectDir, "src", "blocks", "broken-item", "save.tsx"),
		`export default function Save() {\n\treturn null;\n}\n`,
	);
	writeFile(
		path.join(projectDir, "src", "blocks", "broken-item", "types.ts"),
		`export interface BrokenItemAttributes {}\n`,
	);
	writeFile(path.join(projectDir, "src", "blocks", "broken-item", "block.json"), '{"apiVersion":3,');
}
