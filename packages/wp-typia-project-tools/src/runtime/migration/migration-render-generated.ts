import fs from "node:fs";
import path from "node:path";

import { summarizeManifest, summarizeUnionBranches } from "./migration-manifest.js";
import {
	getSnapshotBlockJsonPath,
	getSnapshotManifestPath,
	getSnapshotSavePath,
	readRuleMetadata,
} from "./migration-project.js";
import { getGeneratedDir, normalizeImportPath } from "./migration-render-support.js";
import { readJson, renderPhpValue } from "./migration-utils.js";
import type {
	GeneratedMigrationEntry,
	ManifestDocument,
	MigrationEntry,
	MigrationProjectState,
} from "./migration-types.js";

/**
 * Renders the generated migration registry module for a block target.
 *
 * Prefers manifest wrapper modules when they are available in the project,
 * while still validating the imported manifest before the registry consumes it.
 *
 * @param state The resolved migration project state.
 * @param blockKey The stable key for the block whose registry is being generated.
 * @param entries The generated migration entries to include in the registry.
 * @returns The generated TypeScript source code for the migration registry file.
 */
export function renderMigrationRegistryFile(
	state: MigrationProjectState,
	blockKey: string,
	entries: GeneratedMigrationEntry[],
): string {
	const block = state.blocks.find((entry) => entry.key === blockKey);
	if (!block) {
		throw new Error(`Unknown migration block target: ${blockKey}`);
	}
	const generatedDir = getGeneratedDir(block, state);
	const currentManifestWrapperCandidates = [
		block.manifestFile.replace(/typia\.manifest\.json$/u, "manifest-document.ts"),
		path.join(path.dirname(block.typesFile), "manifest-document.ts"),
	].filter(
		(candidate, index, allCandidates) =>
			candidate !== block.manifestFile && allCandidates.indexOf(candidate) === index,
	);
	const currentManifestWrapperFile =
		currentManifestWrapperCandidates.find((candidate) =>
			fs.existsSync(path.join(state.projectDir, candidate)),
		) ?? null;
	const currentManifestSourceFile = currentManifestWrapperFile ?? block.manifestFile;
	const currentManifestImport = normalizeImportPath(
		path.relative(
			generatedDir,
			path.join(state.projectDir, currentManifestSourceFile),
		),
		currentManifestWrapperFile !== null,
	);
	const imports = [
		`import rawCurrentManifest from "${currentManifestImport}";`,
		`import type { ManifestDocument, MigrationRiskSummary } from "${normalizeImportPath(path.relative(getGeneratedDir(block, state), path.join(state.projectDir, "src", "migrations", "helpers.ts")), true)}";`,
		`import { parseManifestDocument } from "@wp-typia/block-runtime/editor";`,
	];
	const body: string[] = [];

	entries.forEach(({ entry, riskSummary }, index) => {
		imports.push(`import manifest_${index} from "${entry.manifestImport}";`);
		imports.push(`import * as rule_${index} from "${entry.ruleImport}";`);
		body.push(`\t{`);
		body.push(`\t\tfromMigrationVersion: "${entry.fromVersion}",`);
		body.push(`\t\tmanifest: parseManifestDocument<ManifestDocument>(manifest_${index}),`);
		body.push(`\t\triskSummary: ${JSON.stringify(riskSummary, null, "\t").replace(/\n/g, "\n\t\t")},`);
		body.push(`\t\trule: rule_${index},`);
		body.push(`\t},`);
	});

	return `/* eslint-disable prettier/prettier, @typescript-eslint/method-signature-style */
${imports.join("\n")}

interface MigrationRegistryEntry {
\tfromMigrationVersion: string;
\tmanifest: ManifestDocument;
\triskSummary: MigrationRiskSummary;
\trule: {
\t\tmigrate(input: Record<string, unknown>): Record<string, unknown>;
\t\tunresolved?: readonly string[];
\t};
}

export const migrationRegistry: {
\tcurrentMigrationVersion: string;
\tcurrentManifest: ManifestDocument;
\tentries: MigrationRegistryEntry[];
} = {
\tcurrentMigrationVersion: "${state.config.currentMigrationVersion}",
\tcurrentManifest: parseManifestDocument<ManifestDocument>(rawCurrentManifest),
\tentries: [
${body.join("\n")}
\t],
};

export default migrationRegistry;
`;
}

/**
 * Renders the generated deprecated module for a block target.
 *
 * The emitted module exposes the ordered deprecation array consumed by block
 * registration and migration helpers.
 *
 * @param state The resolved migration project state.
 * @param blockKey The stable key for the block whose deprecated entries are being generated.
 * @param entries The migration entries that define deprecated manifest versions.
 * @returns The generated TypeScript source code for the deprecated module.
 */
export function renderGeneratedDeprecatedFile(
	state: MigrationProjectState,
	blockKey: string,
	entries: MigrationEntry[],
): string {
	const block = state.blocks.find((entry) => entry.key === blockKey);
	if (!block) {
		throw new Error(`Unknown migration block target: ${blockKey}`);
	}
	const currentTypeName =
		typeof block.currentManifest.sourceType === "string" &&
		block.currentManifest.sourceType.length > 0
			? block.currentManifest.sourceType
			: "Record<string, unknown>";
	const hasNamedCurrentType = currentTypeName !== "Record<string, unknown>";
	const generatedDir = getGeneratedDir(block, state);
	const typesImport = normalizeImportPath(
		path.relative(generatedDir, path.join(state.projectDir, block.typesFile)),
		true,
	);

	if (entries.length === 0) {
		return `/* eslint-disable prettier/prettier */
import type { BlockDeprecationList } from "@wp-typia/block-types/blocks/registration";
${hasNamedCurrentType ? `import type { ${currentTypeName} } from "${typesImport}";\n` : ""}

export const deprecated: BlockDeprecationList<${currentTypeName}> = [];
`;
	}

	const imports = [
		`import type { BlockConfiguration, BlockDeprecationList } from "@wp-typia/block-types/blocks/registration";`,
		...(hasNamedCurrentType
			? [`import type { ${currentTypeName} } from "${typesImport}";`]
			: []),
	];
	const definitions: string[] = [];
	const arrayEntries: string[] = [];

	entries.forEach((entry, index) => {
		imports.push(`import block_${index} from "${entry.blockJsonImport}";`);
		imports.push(`import save_${index} from "${entry.saveImport}";`);
		imports.push(`import * as rule_${index} from "${entry.ruleImport}";`);
		definitions.push(`const deprecated_${index}: BlockDeprecationList<${currentTypeName}>[number] = {`);
		definitions.push(
			`\tattributes: (block_${index}.attributes ?? {}) as BlockConfiguration["attributes"],`,
		);
		definitions.push(`\tsave: save_${index} as BlockConfiguration["save"],`);
		definitions.push(`\tmigrate(attributes: Record<string, unknown>) {`);
		definitions.push(`\t\treturn rule_${index}.migrate(attributes);`);
		definitions.push(`\t},`);
		definitions.push(`};`);
		arrayEntries.push(`deprecated_${index}`);
	});

	return `/* eslint-disable prettier/prettier */
${imports.join("\n")}

${definitions.join("\n\n")}

export const deprecated: BlockDeprecationList<${currentTypeName}> = [${arrayEntries.join(", ")}];
`;
}

export function renderGeneratedMigrationIndexFile(
	state: MigrationProjectState,
	entries: MigrationEntry[],
): string {
	if (state.blocks.length === 0) {
		return `export const migrationBlocks = [] as const;\nexport default migrationBlocks;\n`;
	}

	const generatedDir = state.paths.generatedDir;
	const imports: string[] = [];
	const definitions: string[] = [];

	state.blocks.forEach((block, index) => {
		const scopedEntries = entries.filter((entry) => entry.block.key === block.key);
		const registryImport =
			block.layout === "legacy" ? "./registry" : `./${block.key}/registry`;
		const deprecatedImport =
			block.layout === "legacy" ? "./deprecated" : `./${block.key}/deprecated`;
		const validatorsImport = normalizeImportPath(
			path.relative(
				generatedDir,
				path.join(
					state.projectDir,
					block.typesFile.replace(/types\.ts$/u, "validators.ts"),
				),
			),
			true,
		);
		imports.push(`import registry_${index} from "${registryImport}";`);
		imports.push(`import { deprecated as deprecated_${index} } from "${deprecatedImport}";`);
		imports.push(`import { validators as validators_${index} } from "${validatorsImport}";`);
		definitions.push(`\t{`);
		definitions.push(`\t\tkey: "${block.key}",`);
		definitions.push(`\t\tblockName: "${block.blockName}",`);
		definitions.push(`\t\tregistry: registry_${index},`);
		definitions.push(`\t\tdeprecated: deprecated_${index},`);
		definitions.push(`\t\tvalidators: validators_${index},`);
		definitions.push(`\t\tlegacyMigrationVersions: ${JSON.stringify(scopedEntries.map((entry) => entry.fromVersion))},`);
		definitions.push(`\t},`);
	});

	return `/* eslint-disable prettier/prettier */
${imports.join("\n")}

export const migrationBlocks = [
${definitions.join("\n")}
] as const;

export default migrationBlocks;
`;
}

export function renderPhpMigrationRegistryFile(
	state: MigrationProjectState,
	entries: MigrationEntry[],
): string {
	const blocks = state.blocks.map((block) => {
		const snapshots = Object.fromEntries(
			state.config.supportedMigrationVersions.map((version) => {
				const manifestPath = getSnapshotManifestPath(state.projectDir, block, version);
				const blockJsonPath = getSnapshotBlockJsonPath(state.projectDir, block, version);
				const savePath = getSnapshotSavePath(state.projectDir, block, version);

				return [
					version,
					{
						blockJson: fs.existsSync(blockJsonPath)
							? {
									attributeNames: Object.keys(
										(readJson<{ attributes?: Record<string, unknown> }>(blockJsonPath).attributes ?? {}),
									),
									name: readJson<{ name?: string | null }>(blockJsonPath).name ?? null,
								}
							: null,
						hasSaveSnapshot: fs.existsSync(savePath),
						manifest: fs.existsSync(manifestPath)
							? summarizeManifest(readJson<ManifestDocument>(manifestPath))
							: null,
					},
				] as const;
			}),
		);

		const edgeSummaries = entries
			.filter((entry) => entry.block.key === block.key)
			.map((entry) => {
				const ruleMetadata = readRuleMetadata(entry.rulePath);
				const snapshotManifest = snapshots[entry.fromVersion]?.manifest ?? null;
				return {
					autoAppliedRenameCount: ruleMetadata.renameMap.length,
					autoAppliedRenames: ruleMetadata.renameMap,
					fromMigrationVersion: entry.fromVersion,
					nestedPathRenames: ruleMetadata.renameMap.filter((item) => item.currentPath.includes(".")),
					ruleFile: path.relative(state.projectDir, entry.rulePath).replace(/\\/g, "/"),
					toMigrationVersion: entry.toVersion,
					transformKeys: ruleMetadata.transforms,
					unionBranches: snapshotManifest ? summarizeUnionBranches(snapshotManifest) : [],
					unresolved: ruleMetadata.unresolved,
				};
			});

		return {
			blockName: block.blockName,
			currentManifest: summarizeManifest(block.currentManifest),
			edges: edgeSummaries,
			key: block.key,
			legacyMigrationVersions: state.config.supportedMigrationVersions.filter(
				(version) => version !== state.config.currentMigrationVersion,
			),
			snapshots,
		};
	});

	return `<?php
declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
\texit;
}

/**
 * Generated from advanced migration snapshots. Do not edit manually.
 */
return ${renderPhpValue(
		{
			currentMigrationVersion: state.config.currentMigrationVersion,
			blocks,
			snapshotDir: state.config.snapshotDir,
			supportedMigrationVersions: state.config.supportedMigrationVersions,
		},
		0,
	)};
`;
}
