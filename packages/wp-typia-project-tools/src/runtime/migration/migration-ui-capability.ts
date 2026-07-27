import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { getPackageVersions } from '../shared/package-versions.js';
import { formatPackageExecCommand } from '../shared/package-managers.js';
import type { PackageManagerId } from '../shared/package-managers.js';
import { readJsonFile } from '../shared/json-utils.js';
import { seedProjectMigrations } from './migrations.js';
import { copyInterpolatedDirectory } from '../templates/template-render.js';
import {
	SHARED_MIGRATION_UI_TEMPLATE_ROOT,
} from '../templates/template-registry.js';
import type { MigrationBlockConfig } from './migration-types.js';
import type { ScaffoldTemplateVariables } from '../templates/scaffold.js';

interface PackageJsonShape {
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

interface ApplyMigrationUiCapabilityOptions {
  packageManager: PackageManagerId;
  projectDir: string;
  templateId: string;
  variables: ScaffoldTemplateVariables;
}

const INITIAL_MIGRATION_VERSION = 'v1';
const BLOCK_METADATA_IMPORT_LINE = "import metadata from './block-metadata';";
const LEGACY_BLOCK_JSON_IMPORT_LINE = "import metadata from './block.json';";

async function mutatePackageJson(
	projectDir: string,
	mutate: (packageJson: PackageJsonShape) => void,
): Promise<void> {
  const packageJsonPath = path.join(projectDir, 'package.json');
  const packageJson = await readJsonFile<PackageJsonShape>(packageJsonPath, {
    context: 'migration UI package manifest',
  });
  mutate(packageJson);
  await fsp.writeFile(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, '\t')}\n`,
    'utf8',
  );
}

async function patchFile(
	filePath: string,
	transform: (source: string) => string,
): Promise<void> {
  const source = await fsp.readFile(filePath, 'utf8');
  const nextSource = transform(source);
  if (nextSource === source) {
    throw new Error(`Unable to apply migration UI patch for ${filePath}`);
  }
  await fsp.writeFile(filePath, nextSource, 'utf8');
}

function injectAfter(source: string, needle: string, insertion: string): string {
  if (source.includes(insertion)) {
    return source;
  }
  if (!source.includes(needle)) {
    return source;
  }
  return source.replace(needle, `${needle}\n${insertion}`);
}

function injectBefore(source: string, needle: string, insertion: string): string {
  if (source.includes(insertion)) {
    return source;
  }
  if (!source.includes(needle)) {
    return source;
  }
  return source.replace(needle, `${insertion}\n${needle}`);
}

function injectAfterBlockMetadataImport(source: string, insertion: string): string {
  const nextSource = injectAfter(source, BLOCK_METADATA_IMPORT_LINE, insertion);
  if (nextSource !== source) {
    return nextSource;
  }

  return injectAfter(source, LEGACY_BLOCK_JSON_IMPORT_LINE, insertion);
}

function injectAfterBlockMetadataImportInFunction(
  source: string,
  functionName: string,
  insertion: string,
): string {
  const functionStart = source.indexOf(`function ${functionName}(`);
  if (functionStart === -1) {
    return source;
  }

  const nextFunctionStart = source.indexOf('\nfunction ', functionStart + 1);
  const functionEnd =
    nextFunctionStart === -1 ? source.length : nextFunctionStart;
  const functionSource = source.slice(functionStart, functionEnd);
  const nextFunctionSource = injectAfterBlockMetadataImport(
    functionSource,
    insertion,
  );

  return nextFunctionSource === functionSource
    ? source
    : `${source.slice(0, functionStart)}${nextFunctionSource}${source.slice(functionEnd)}`;
}

function renderAppendMigrationBlockConfigHelper(): string {
  return [
    'function appendMigrationBlockConfig(',
    '  filePath: string,',
    '  childBlockName: string,',
    '  childFolderSlug: string,',
    ') {',
    '  if (!fs.existsSync(filePath)) {',
    '    return;',
    '  }',
    '',
    "  const source = fs.readFileSync(filePath, 'utf8');",
    '  const childKeyLiteral = quoteTypeScriptString(childFolderSlug);',
    '  if (source.includes(`key: ${childKeyLiteral}`)) {',
    '    return;',
    '  }',
    '',
    '  const blockEntry = [',
    "    '    {',",
    '    `      key: ${childKeyLiteral},`,',
    '    `      blockName: ${quoteTypeScriptString(childBlockName)},`,',
    '    `      blockJsonFile: ${quoteTypeScriptString(`src/blocks/${childFolderSlug}/block.json`)},`,',
    '    `      manifestFile: ${quoteTypeScriptString(`src/blocks/${childFolderSlug}/typia.manifest.json`)},`,',
    '    `      saveFile: ${quoteTypeScriptString(`src/blocks/${childFolderSlug}/save.tsx`)},`,',
    '    `      typesFile: ${quoteTypeScriptString(`src/blocks/${childFolderSlug}/types.ts`)},`,',
    "    '    },',",
    "  ].join('\\n');",
    '  const blocksPattern = /(\\n  blocks: \\[[\\s\\S]*?)(\\n  \\],\\n\\};)/;',
    '',
    '  if (!blocksPattern.test(source)) {',
    '    throw new Error(',
    '      `Unable to update ${filePath}: migration blocks array not found.`,',
    '    );',
    '  }',
    '',
    '  const nextSource = source.replace(',
    '    blocksPattern,',
    '    `$1\\n${blockEntry}$2`,',
    '  );',
    "  fs.writeFileSync(filePath, nextSource, 'utf8');",
    '}',
  ].join('\n');
}

function buildMigrationBlocks(
	templateId: string,
	variables: ScaffoldTemplateVariables,
): MigrationBlockConfig[] {
  if (templateId === 'compound') {
    return [
      {
        blockJsonFile: `src/blocks/${variables.slugKebabCase}/block.json`,
        blockName: `${variables.namespace}/${variables.slugKebabCase}`,
        key: variables.slugKebabCase,
        manifestFile: `src/blocks/${variables.slugKebabCase}/typia.manifest.json`,
        saveFile: `src/blocks/${variables.slugKebabCase}/save.tsx`,
        typesFile: `src/blocks/${variables.slugKebabCase}/types.ts`,
      },
      {
        blockJsonFile: `src/blocks/${variables.slugKebabCase}-item/block.json`,
        blockName: `${variables.namespace}/${variables.slugKebabCase}-item`,
        key: `${variables.slugKebabCase}-item`,
        manifestFile: `src/blocks/${variables.slugKebabCase}-item/typia.manifest.json`,
        saveFile: `src/blocks/${variables.slugKebabCase}-item/save.tsx`,
        typesFile: `src/blocks/${variables.slugKebabCase}-item/types.ts`,
      },
    ];
  }

  return [
    {
      blockJsonFile: 'src/block.json',
      blockName: `${variables.namespace}/${variables.slugKebabCase}`,
      key: variables.slugKebabCase,
      manifestFile: 'src/typia.manifest.json',
      saveFile: 'src/save.tsx',
      typesFile: 'src/types.ts',
    },
  ];
}

async function applySingleBlockPatches(
	projectDir: string,
	variables: ScaffoldTemplateVariables,
): Promise<void> {
  const editPath = path.join(projectDir, 'src', 'edit.tsx');
  const indexPath = path.join(projectDir, 'src', 'index.tsx');
  const deprecatedImport = `import { deprecated } from './migrations/generated/${variables.slugKebabCase}/deprecated';`;
  const deprecatedLine = '    deprecated,';
  const dashboardImport = `import { MigrationDashboard } from './admin/migration-dashboard';`;
  const migrationPanel = `\n        <PanelBody title={__('Migration Manager', '${variables.textDomain}')}>\n          <MigrationDashboard />\n        </PanelBody>\n      </InspectorControls>`;

  await patchFile(indexPath, (source) => {
    let nextSource = injectAfterBlockMetadataImport(source, deprecatedImport);
    nextSource = injectBefore(nextSource, '    edit: Edit,', deprecatedLine);
    return nextSource;
  });

  await patchFile(editPath, (source) => {
    let nextSource = injectAfter(
      source,
      "import { useTypiaValidation } from './hooks';",
      dashboardImport,
    );
    nextSource = nextSource.replace(
      '      </InspectorControls>',
      migrationPanel,
    );
    return nextSource;
  });
}

async function applyCompoundPatches(
	projectDir: string,
	variables: ScaffoldTemplateVariables,
): Promise<void> {
  const parentEditPath = path.join(
    projectDir,
    'src',
    'blocks',
    variables.slugKebabCase,
    'edit.tsx',
  );
  const parentIndexPath = path.join(
    projectDir,
    'src',
    'blocks',
    variables.slugKebabCase,
    'index.tsx',
  );
  const childIndexPath = path.join(
    projectDir,
    'src',
    'blocks',
    `${variables.slugKebabCase}-item`,
    'index.tsx',
  );
  const addChildScriptPath = path.join(
    projectDir,
    'scripts',
    'add-compound-child.ts',
  );

  await patchFile(parentIndexPath, (source) => {
    let nextSource = injectAfterBlockMetadataImport(
      source,
      `import { deprecated } from '../../migrations/generated/${variables.slugKebabCase}/deprecated';`,
    );
    nextSource = injectBefore(
      nextSource,
      '    edit: Edit,',
      '    deprecated,',
    );
    return nextSource;
  });

  await patchFile(childIndexPath, (source) => {
    let nextSource = injectAfterBlockMetadataImport(
      source,
      `import { deprecated } from '../../migrations/generated/${variables.slugKebabCase}-item/deprecated';`,
    );
    nextSource = injectBefore(
      nextSource,
      '    edit: Edit,',
      '    deprecated,',
    );
    return nextSource;
  });

  await patchFile(parentEditPath, (source) => {
    let nextSource = injectAfter(
      source,
      "import { useTypiaValidation } from './hooks';",
      `import { MigrationDashboard } from '../../admin/migration-dashboard';`,
    );
    nextSource = nextSource.replace(
      '      </InspectorControls>',
      `        <PanelBody title={__('Migration Manager', '${variables.textDomain}')}>\n          <MigrationDashboard />\n        </PanelBody>\n      </InspectorControls>`,
    );
    return nextSource;
  });

  await patchFile(addChildScriptPath, (source) => {
    let nextSource = injectAfter(
      source,
      'const PROJECT_ROOT = process.cwd();',
      "const MIGRATION_CONFIG_FILE = path.join(PROJECT_ROOT, 'src', 'migrations', 'config.ts');",
    );
    nextSource = injectAfterBlockMetadataImportInFunction(
      nextSource,
      'renderIndexFile',
      "import { deprecated } from '../../migrations/generated/${childFolderSlug}/deprecated';",
    );
    nextSource = nextSource.replace(
      '    edit: Edit,\n    save: Save,',
      '    deprecated,\n    edit: Edit,\n    save: Save,',
    );
    if (!nextSource.includes('function appendMigrationBlockConfig')) {
      nextSource = nextSource.replace(
        'function readBlockJsonDocument(',
        `${renderAppendMigrationBlockConfigHelper()}\n\nfunction readBlockJsonDocument(`,
      );
    }
    nextSource = nextSource.replace(
      '  console.log(`✅ Added compound child block ${childBlockName}`);',
      '  appendMigrationBlockConfig(\n    MIGRATION_CONFIG_FILE,\n    childBlockName,\n    childFolderSlug,\n  );\n\n  console.log(`✅ Added compound child block ${childBlockName}`);',
    );
    return nextSource;
  });
}

/**
 * Layer the migration dashboard capability onto a freshly scaffolded project.
 *
 * This copies the shared migration UI files, wires template-specific editor
 * hooks, and injects pinned migration scripts that shell out to the matching
 * `wp-typia` CLI version.
 */
export async function applyMigrationUiCapability({
	packageManager,
	projectDir,
	templateId,
	variables,
}: ApplyMigrationUiCapabilityOptions): Promise<void> {
  const commonTemplateDir = path.join(
    SHARED_MIGRATION_UI_TEMPLATE_ROOT,
    'common',
  );
  await copyInterpolatedDirectory(commonTemplateDir, projectDir, variables);

  await mutatePackageJson(projectDir, (packageJson) => {
		const wpTypiaPackageVersion = getPackageVersions().wpTypiaPackageVersion;
		const canonicalCliSpecifier =
			wpTypiaPackageVersion === '^0.0.0'
				? 'wp-typia'
				: `wp-typia@${wpTypiaPackageVersion.replace(/^[~^]/u, '')}`;
		const migrationCli = (args: string) =>
			formatPackageExecCommand(packageManager, canonicalCliSpecifier, `migrate ${args}`);
		packageJson.dependencies = {
			...(packageJson.dependencies ?? {}),
			'@wordpress/api-fetch': '^7.42.0',
		};
		packageJson.scripts = {
			...(packageJson.scripts ?? {}),
			'migration:init': migrationCli(`init --current-migration-version ${INITIAL_MIGRATION_VERSION}`),
			'migration:snapshot': migrationCli('snapshot'),
			'migration:diff': migrationCli('diff'),
			'migration:scaffold': migrationCli('scaffold'),
			'migration:doctor': migrationCli('doctor --all'),
			'migration:fixtures': migrationCli('fixtures --all'),
			'migration:verify': migrationCli('verify --all'),
			'migration:fuzz': migrationCli('fuzz --all'),
		};
	});

  if (templateId === 'compound') {
    await applyCompoundPatches(projectDir, variables);
  } else {
    await applySingleBlockPatches(projectDir, variables);
  }

  await seedProjectMigrations(
    projectDir,
    INITIAL_MIGRATION_VERSION,
    buildMigrationBlocks(templateId, variables),
  );
}
