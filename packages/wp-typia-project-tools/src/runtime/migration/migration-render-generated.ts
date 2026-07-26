import fs from 'node:fs';
import path from 'node:path';

import {
  summarizeManifest,
  summarizeUnionBranches,
} from './migration-manifest.js';
import {
  getSnapshotBlockJsonPath,
  getSnapshotManifestPath,
  getSnapshotSavePath,
  readRuleMetadata,
} from './migration-project.js';
import {
  getGeneratedDir,
  normalizeImportPath,
} from './migration-render-support.js';
import { readJson, renderPhpValue } from './migration-utils.js';
import {
  quoteTypeScriptString,
  renderTypeScriptValue,
} from '../shared/ts-string-literals.js';
import type {
  GeneratedMigrationEntry,
  ManifestDocument,
  MigrationEntry,
  MigrationProjectState,
} from './migration-types.js';

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
  const currentTypeName =
		typeof block.currentManifest.sourceType === 'string' &&
		block.currentManifest.sourceType.length > 0
			? block.currentManifest.sourceType
			: 'Record<string, unknown>';
  const hasNamedCurrentType = currentTypeName !== 'Record<string, unknown>';
  const generatedDir = getGeneratedDir(block, state);
  const currentManifestWrapperCandidates = [
		block.manifestFile.replace(/typia\.manifest\.json$/u, 'manifest-document.ts'),
		path.join(path.dirname(block.typesFile), 'manifest-document.ts'),
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
  const currentManifestImportAttributes =
    currentManifestWrapperFile === null ? " with { type: 'json' }" : '';
  const imports = [
    `import rawCurrentManifest from ${quoteTypeScriptString(currentManifestImport)}${currentManifestImportAttributes};`,
    `import type { ManifestDocument, MigrationRiskSummary } from ${quoteTypeScriptString(normalizeImportPath(path.relative(getGeneratedDir(block, state), path.join(state.projectDir, 'src', 'migrations', 'helpers.ts')), true))};`,
    ...(hasNamedCurrentType
      ? [
          `import type { ${currentTypeName} } from ${quoteTypeScriptString(normalizeImportPath(path.relative(generatedDir, path.join(state.projectDir, block.typesFile)), true))};`,
        ]
      : []),
    `import { parseManifestDocument } from '@wp-typia/block-runtime/editor';`,
  ];
  const body: string[] = [];

  entries.forEach(({ entry, riskSummary }, index) => {
    imports.push(
      `import manifest_${index} from ${quoteTypeScriptString(entry.manifestImport)} with { type: 'json' };`,
    );
    imports.push(
      `import * as rule_${index} from ${quoteTypeScriptString(entry.ruleImport)};`,
    );
    body.push(`  {`);
    body.push(
      `    fromMigrationVersion: ${quoteTypeScriptString(entry.fromVersion)},`,
    );
    body.push(
      `    manifest: parseManifestDocument<ManifestDocument>(manifest_${index}),`,
    );
    body.push(
      `    riskSummary: ${renderTypeScriptValue(riskSummary, 60).replace(/\n/g, '\n    ')},`,
    );
    body.push(`    rule: rule_${index},`);
    body.push(`  },`);
  });

  const renderedEntries =
    body.length === 0 ? '[]' : `[\n${body.join('\n')}\n]`;

  return `${imports.join('\n')}

interface MigrationRegistryEntry {
  fromMigrationVersion: string;
  manifest: ManifestDocument;
  riskSummary: MigrationRiskSummary;
  rule: {
    migrate(input: Record<string, unknown>): ${currentTypeName};
    unresolved?: readonly string[];
  };
}

export const migrationRegistry: {
  currentMigrationVersion: string;
  currentManifest: ManifestDocument;
  entries: MigrationRegistryEntry[];
} = {
  currentMigrationVersion: ${quoteTypeScriptString(state.config.currentMigrationVersion)},
  currentManifest: parseManifestDocument<ManifestDocument>(rawCurrentManifest),
  entries: ${renderedEntries.replace(/\n/g, '\n  ')},
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
		typeof block.currentManifest.sourceType === 'string' &&
		block.currentManifest.sourceType.length > 0
			? block.currentManifest.sourceType
			: 'Record<string, unknown>';
  const hasNamedCurrentType = currentTypeName !== 'Record<string, unknown>';
  const generatedDir = getGeneratedDir(block, state);
  const typesImport = normalizeImportPath(
    path.relative(generatedDir, path.join(state.projectDir, block.typesFile)),
    true,
  );

  if (entries.length === 0) {
    const imports = [
      "import type { BlockDeprecationList } from '@wp-typia/block-types/blocks/registration';",
      ...(hasNamedCurrentType
        ? [
            `import type { ${currentTypeName} } from ${quoteTypeScriptString(typesImport)};`,
          ]
        : []),
    ];
    return `${imports.join('\n')}

export const deprecated: BlockDeprecationList<${currentTypeName}> = [];
`;
  }

  const imports = [
		`import type {
  BlockConfiguration,
  BlockDeprecationList,
} from '@wp-typia/block-types/blocks/registration';`,
		...(hasNamedCurrentType
			? [
					`import type { ${currentTypeName} } from ${quoteTypeScriptString(typesImport)};`,
				]
			: []),
	];
  const definitions: string[] = [];
  const arrayEntries: string[] = [];

  entries.forEach((entry, index) => {
    imports.push(
      `import block_${index} from ${quoteTypeScriptString(entry.blockJsonImport)} with { type: 'json' };`,
    );
    imports.push(
      `import save_${index} from ${quoteTypeScriptString(entry.saveImport)};`,
    );
    imports.push(
      `import * as rule_${index} from ${quoteTypeScriptString(entry.ruleImport)};`,
    );
    definitions.push(
      [
        `const deprecated_${index}: BlockDeprecationList<${currentTypeName}>[number] = {`,
        `  attributes: (block_${index}.attributes ?? {}) as BlockConfiguration['attributes'],`,
        '',
        `  save: save_${index} as NonNullable<BlockConfiguration['save']>,`,
        '',
        '  migrate(attributes: Record<string, unknown>) {',
        `    return rule_${index}.migrate(attributes);`,
        '  },',
        '};',
      ].join('\n'),
    );
    arrayEntries.push(`deprecated_${index}`);
  });

  return `${imports.join('\n')}

${definitions.join('\n\n')}

export const deprecated: BlockDeprecationList<${currentTypeName}> = [
${arrayEntries.map((entry) => `  ${entry},`).join('\n')}
];
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
			block.layout === 'legacy' ? './registry' : `./${block.key}/registry`;
		const deprecatedImport =
			block.layout === 'legacy' ? './deprecated' : `./${block.key}/deprecated`;
		const validatorsImport = normalizeImportPath(
			path.relative(
				generatedDir,
				path.join(
					state.projectDir,
					block.typesFile.replace(/types\.ts$/u, 'validators.ts'),
				),
			),
			true,
		);
		imports.push(
			`import registry_${index} from ${quoteTypeScriptString(registryImport)};`,
		);
		imports.push(
			`import { deprecated as deprecated_${index} } from ${quoteTypeScriptString(deprecatedImport)};`,
		);
		imports.push(
			`import { validators as validators_${index} } from ${quoteTypeScriptString(validatorsImport)};`,
		);
		definitions.push(`  {`);
		definitions.push(`    key: ${quoteTypeScriptString(block.key)},`);
		definitions.push(`    blockName: ${quoteTypeScriptString(block.blockName)},`);
		definitions.push(`    registry: registry_${index},`);
		definitions.push(`    deprecated: deprecated_${index},`);
		definitions.push(`    validators: validators_${index},`);
		definitions.push(
			`    legacyMigrationVersions: ${renderTypeScriptValue(
				scopedEntries.map((entry) => entry.fromVersion),
			).replace(/\n/g, '\n    ')},`,
		);
		definitions.push(`  },`);
	});

  return `${imports.join('\n')}

export const migrationBlocks = [
${definitions.join('\n')}
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
					nestedPathRenames: ruleMetadata.renameMap.filter((item) => item.currentPath.includes('.')),
					ruleFile: path.relative(state.projectDir, entry.rulePath).replace(/\\/g, '/'),
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
