import fs from 'node:fs';
import path from 'node:path';

import { quoteTsString } from '../add/cli-add-shared.js';
import {
  findManagedWordPressSourcePaths,
  hasWordPressTtscLintConfigSource,
  TTSC_LINT_CONFIG_FILENAMES,
} from '../shared/ttsc-lint-config.js';
import { SHARED_BASE_TEMPLATE_ROOT } from '../templates/template-registry.js';
import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from './cli-diagnostics.js';
import type {
  ProjectPackageJson,
  RetrofitInitBlockTarget,
} from './cli-init-types.js';
import { updateWorkspaceInventorySource } from '../workspace/workspace-inventory.js';

/** Find the first ttsc lint config using the shared discovery precedence. */
export function findTtscLintConfigPath(projectDir: string): string | null {
  for (const filename of TTSC_LINT_CONFIG_FILENAMES) {
    const configPath = path.join(projectDir, filename);
    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }

  return null;
}

/**
 * Check whether a readable config enables the WordPress preset for a project.
 */
export function hasWordPressTtscLintConfig(
  configPath: string | null,
  expectedTextDomain: string,
): boolean {
  if (!configPath) {
    return false;
  }

  let source: string;
  try {
    source = fs.readFileSync(configPath, 'utf8');
  } catch {
    return false;
  }
  let packageModuleType: 'commonjs' | 'module' = 'commonjs';
  let packageDirectory = path.dirname(configPath);
  while (true) {
    const packageJsonPath = path.join(packageDirectory, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, 'utf8'),
        ) as {
          type?: unknown;
        };
        packageModuleType =
          packageJson.type === 'module' ? 'module' : 'commonjs';
      } catch {
        return false;
      }
      break;
    }
    const parentDirectory = path.dirname(packageDirectory);
    if (parentDirectory === packageDirectory) {
      break;
    }
    packageDirectory = parentDirectory;
  }
  return hasWordPressTtscLintConfigSource(
    source,
    expectedTextDomain,
    path.basename(configPath),
    packageModuleType,
    findManagedWordPressSourcePaths(path.dirname(configPath)),
  );
}

/** Build the canonical WordPress-aware lint config for an existing workspace. */
export function buildWordPressTtscLintConfigSource(
  textDomain: string,
): string {
  const templatePath = path.join(
    SHARED_BASE_TEMPLATE_ROOT,
    'lint.config.mts.mustache',
  );
  const source = fs.readFileSync(templatePath, 'utf8');
  const placeholder = "'{{textDomain}}'";
  if (source.split(placeholder).length !== 2) {
    throw new Error(
      `${templatePath} must contain exactly one quoted textDomain placeholder.`,
    );
  }
  const rendered = source.replace(placeholder, () => quoteTsString(textDomain));
  if (/\{\{|\}\}/u.test(rendered)) {
    throw new Error(
      `${templatePath} must not contain unsupported Mustache placeholders.`,
    );
  }
  return rendered;
}

/**
 * Resolve a retrofit text domain from wpTypia metadata, block metadata,
 * package name, the first block slug, then the project directory name.
 * Conflicting block metadata fails closed until the project supplies one
 * explicit wpTypia text domain or aligns its block metadata.
 */
export function resolveRetrofitTextDomain(options: {
  blockTargets: readonly RetrofitInitBlockTarget[];
  packageJson: ProjectPackageJson | null;
  projectDir: string;
}): string {
  const configuredTextDomainValue = options.packageJson?.wpTypia?.textDomain;
  const configuredTextDomain =
    typeof configuredTextDomainValue === 'string'
      ? configuredTextDomainValue.trim()
      : '';
  if (configuredTextDomain) {
    return configuredTextDomain;
  }

  const blockTextDomains = new Set<string>();
  for (const target of options.blockTargets) {
    try {
      const blockJson = JSON.parse(
        fs.readFileSync(
          path.join(options.projectDir, target.blockJsonFile),
          'utf8',
        ),
      ) as { textdomain?: unknown };
      if (
        typeof blockJson.textdomain === 'string' &&
        blockJson.textdomain.trim().length > 0
      ) {
        blockTextDomains.add(blockJson.textdomain.trim());
      }
    } catch {
      // Layout discovery owns malformed block metadata diagnostics. Keep the
      // lint fallback deterministic if this helper is called independently.
    }
  }
  if (blockTextDomains.size > 1) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      `Conflicting WordPress text domains in block metadata: ${[...blockTextDomains].sort().join(', ')}. Align the block.json textdomain values before running wp-typia init.`,
    );
  }
  const blockTextDomain = blockTextDomains.values().next().value;
  if (blockTextDomain) {
    return blockTextDomain;
  }

  const packageNameValue = options.packageJson?.name;
  const packageName =
    typeof packageNameValue === 'string' ? packageNameValue.trim() : '';
  if (packageName) {
    return packageName.includes('/')
      ? packageName.slice(packageName.lastIndexOf('/') + 1)
      : packageName;
  }

  return options.blockTargets[0]?.slug ?? path.basename(options.projectDir);
}

function buildRetrofitBlockConfigEntry(
	target: RetrofitInitBlockTarget,
): string {
  return [
		'\t{',
		`\t\tslug: ${quoteTsString(target.slug)},`,
		`\t\tattributeTypeName: ${quoteTsString(target.attributeTypeName)},`,
		`\t\tblockJsonFile: ${quoteTsString(target.blockJsonFile)},`,
		`\t\tmanifestFile: ${quoteTsString(target.manifestFile)},`,
		`\t\ttypesFile: ${quoteTsString(target.typesFile)},`,
		'\t},',
	].join('\n');
}

/**
 * Generate the `scripts/block-config.ts` source for retrofit block targets.
 *
 * @param targets Existing block targets detected by the init plan.
 * @returns Complete TypeScript source for the generated block config helper.
 */
export function buildRetrofitBlockConfigSource(
	targets: RetrofitInitBlockTarget[],
): string {
  const blockEntries = targets.map(buildRetrofitBlockConfigEntry).join('\n');
  const baseSource = `export interface WorkspaceBlockConfig {
\tattributeTypeName: string;
\tapiTypesFile?: string;
\tblockJsonFile?: string;
\tmanifestFile?: string;
\topenApiFile?: string;
\trestManifest?: ReturnType<
\t\ttypeof import( '@wp-typia/block-runtime/metadata-core' ).defineEndpointManifest
\t>;
\tslug: string;
\ttypesFile: string;
}

export const BLOCKS: WorkspaceBlockConfig[] = [
${blockEntries}
];
`;

  return `${updateWorkspaceInventorySource(baseSource)}\n`;
}

/**
 * Generate the `scripts/sync-types-to-block-json.ts` helper source.
 *
 * @returns Complete TypeScript source for the metadata sync helper.
 */
export function buildRetrofitSyncTypesScriptSource(): string {
  return `/* eslint-disable no-console */
import path from 'node:path';

import { syncBlockMetadata } from '@wp-typia/block-runtime/metadata-core';

import { BLOCKS } from './block-config';

function parseCliOptions( argv: string[] ) {
\tconst options = {
\t\tcheck: false,
\t};

\tfor ( const argument of argv ) {
\t\tif ( argument === '--check' ) {
\t\t\toptions.check = true;
\t\t\tcontinue;
\t\t}

\t\tthrow new Error( \`Unknown sync-types flag: \${ argument }\` );
\t}

\treturn options;
}

async function main() {
\tconst options = parseCliOptions( process.argv.slice( 2 ) );

\tif ( BLOCKS.length === 0 ) {
\t\tconsole.log(
\t\t\toptions.check
\t\t\t\t? 'ℹ️ No retrofit blocks are registered yet. \`sync-types --check\` is already clean.'
\t\t\t\t: 'ℹ️ No retrofit blocks are registered yet. Add one block target to scripts/block-config.ts before rerunning sync-types.'
\t\t);
\t\treturn;
\t}

\tfor ( const block of BLOCKS ) {
\t\tconst blockDir = path.dirname( block.typesFile );
\t\tconst blockJsonFile =
\t\t\tblock.blockJsonFile ?? path.join( blockDir, 'block.json' );
\t\tconst manifestFile =
\t\t\tblock.manifestFile ?? path.join( blockDir, 'typia.manifest.json' );
\t\tconst manifestDir = path.dirname( manifestFile );
\t\tconst result = await syncBlockMetadata(
\t\t\t{
\t\t\t\tblockJsonFile,
\t\t\t\tjsonSchemaFile: path.join( manifestDir, 'typia.schema.json' ),
\t\t\t\tmanifestFile,
\t\t\t\topenApiFile: path.join( manifestDir, 'typia.openapi.json' ),
\t\t\t\tsourceTypeName: block.attributeTypeName,
\t\t\t\ttypesFile: block.typesFile,
\t\t\t},
\t\t\t{
\t\t\t\tcheck: options.check,
\t\t\t}
\t\t);
\t\tfor ( const warning of result.lossyProjectionWarnings ) {
\t\t\tconsole.warn( \`⚠️ \${ block.slug }: \${ warning }\` );
\t\t}
\t\tfor ( const warning of result.phpGenerationWarnings ) {
\t\t\tconsole.warn( \`⚠️ \${ block.slug }: \${ warning }\` );
\t\t}

\t\tconsole.log(
\t\t\toptions.check
\t\t\t\t? \`✅ \${ block.slug }: block.json, typia.manifest.json, typia-validator.php, typia.schema.json, and typia.openapi.json are already up to date with the TypeScript types!\`
\t\t\t\t: \`✅ \${ block.slug }: block.json, typia.manifest.json, typia-validator.php, typia.schema.json, and typia.openapi.json were generated from TypeScript types!\`
\t\t);
\t\tconsole.log( '📝 Generated attributes:', result.attributeNames );
\t}
}

main().catch( ( error ) => {
\tconsole.error( '❌ Type sync failed:', error );
\tprocess.exit( 1 );
} );
`;
}

/** Read the canonical managed ttsc lint compatibility helper source. */
export function getTtscLintCompatSource(): string {
  const templatePath = path.join(
    SHARED_BASE_TEMPLATE_ROOT,
    'scripts',
    'apply-ttsc-lint-compat.mjs.mustache',
  );
  const source = fs.readFileSync(templatePath, 'utf8');
  if (/\{\{|\}\}/u.test(source)) {
    throw new Error(
      `${templatePath} must remain interpolation-free because retrofit init writes it without Mustache rendering.`,
    );
  }
  return source;
}

/** Check whether the generated ttsc compatibility helper is current. */
export function hasCurrentTtscLintCompatFile(projectDir: string): boolean {
  const compatPath = path.join(
    projectDir,
    'scripts',
    'apply-ttsc-lint-compat.mjs',
  );
  try {
    const normalizeLineEndings = (source: string) =>
      source.replace(/\r\n/gu, '\n');
    return (
      normalizeLineEndings(fs.readFileSync(compatPath, 'utf8')) ===
      normalizeLineEndings(getTtscLintCompatSource())
    );
  } catch {
    return false;
  }
}

/**
 * Generate the `scripts/sync-project.ts` orchestration helper source.
 *
 * @returns Complete TypeScript source for the project sync entrypoint.
 */
export function buildRetrofitSyncProjectScriptSource(): string {
  return `/* eslint-disable no-console */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

interface SyncCliOptions {
\tcheck: boolean;
}

function parseCliOptions( argv: string[] ): SyncCliOptions {
\tconst options: SyncCliOptions = {
\t\tcheck: false,
\t};

\tfor ( const argument of argv ) {
\t\tif ( argument === '--check' ) {
\t\t\toptions.check = true;
\t\t\tcontinue;
\t\t}

\t\tthrow new Error( \`Unknown sync flag: \${ argument }\` );
\t}

\treturn options;
}

function getSyncScriptEnv() {
\tconst binaryDirectory = path.join( process.cwd(), 'node_modules', '.bin' );
\tconst inheritedPath =
\t\tprocess.env.PATH ??
\t\tprocess.env.Path ??
\t\tObject.entries( process.env ).find(
\t\t\t( [ key ] ) => key.toLowerCase() === 'path'
\t\t)?.[ 1 ] ??
\t\t'';
\tconst nextPath = fs.existsSync( binaryDirectory )
\t\t? \`\${ binaryDirectory }\${ path.delimiter }\${ inheritedPath }\`
\t\t: inheritedPath;
\tconst env: NodeJS.ProcessEnv = {
\t\t...process.env,
\t};

\tfor ( const key of Object.keys( env ) ) {
\t\tif ( key.toLowerCase() === 'path' ) {
\t\t\tdelete env[ key ];
\t\t}
\t}

\tenv.PATH = nextPath;

\treturn env;
}

function getOptionalNodeErrorCode( error: unknown ): string | undefined {
\treturn typeof error === 'object' && error !== null && 'code' in error
\t\t? String( ( error as { code: unknown } ).code )
\t\t: undefined;
}

function isFileNotFoundError( error: unknown ): boolean {
\treturn getOptionalNodeErrorCode( error ) === 'ENOENT';
}

function runSyncScript( scriptPath: string, options: SyncCliOptions ) {
\tconst args = [ scriptPath ];
\tif ( options.check ) {
\t\targs.push( '--check' );
\t}

\tconst result = spawnSync( 'ttsx', args, {
\t\tcwd: process.cwd(),
\t\tenv: getSyncScriptEnv(),
\t\tshell: process.platform === 'win32',
\t\tstdio: 'inherit',
\t} );

\tif ( result.error ) {
\t\tif ( isFileNotFoundError( result.error ) ) {
\t\t\tthrow new Error(
\t\t\t\t'Unable to resolve \`ttsx\` for project sync. Install project dependencies or rerun the command through your package manager.'
\t\t\t);
\t\t}

\t\tthrow result.error;
\t}

\tif ( result.status !== 0 ) {
\t\tthrow new Error( \`Sync script failed: \${ scriptPath }\` );
\t}
}

async function main() {
\tconst options = parseCliOptions( process.argv.slice( 2 ) );
\tconst syncTypesScriptPath = path.join( 'scripts', 'sync-types-to-block-json.ts' );

\trunSyncScript( syncTypesScriptPath, options );

\tconsole.log(
\t\toptions.check
\t\t\t? '✅ Generated project metadata is already synchronized.'
\t\t\t: '✅ Generated project metadata was synchronized.'
\t);
}

main().catch( ( error ) => {
\tconsole.error( '❌ Project sync failed:', error );
\tprocess.exit( 1 );
} );
`;
}

/**
 * Build the helper file source map written by `wp-typia init --apply`.
 *
 * @param blockTargets Existing block targets detected by the init plan.
 * @returns Relative helper file paths mapped to their generated source.
 */
export function buildRetrofitHelperFiles(
	blockTargets: RetrofitInitBlockTarget[],
	options?: {
		projectDir: string;
		textDomain: string;
	},
): Record<string, string> {
  return {
		[path.join('scripts', 'apply-ttsc-lint-compat.mjs')]:
			getTtscLintCompatSource(),
		[path.join('scripts', 'block-config.ts')]:
			buildRetrofitBlockConfigSource(blockTargets),
		[path.join('scripts', 'sync-project.ts')]:
			buildRetrofitSyncProjectScriptSource(),
		[path.join('scripts', 'sync-types-to-block-json.ts')]:
			buildRetrofitSyncTypesScriptSource(),
		...(options && !findTtscLintConfigPath(options.projectDir)
			? {
					'lint.config.mts': buildWordPressTtscLintConfigSource(
						options.textDomain,
					),
			  }
			: {}),
	};
}

/**
 * Build only the lint files that are safe to add to an official workspace.
 * Existing lint configs are never overwritten because they can contain
 * project-owned contributor rules or file routing.
 */
export function buildOfficialWorkspaceLintFiles(options: {
  projectDir: string;
  textDomain: string;
}): Record<string, string> {
  return {
    ...(hasCurrentTtscLintCompatFile(options.projectDir)
      ? {}
      : {
          [path.join('scripts', 'apply-ttsc-lint-compat.mjs')]:
            getTtscLintCompatSource(),
        }),
    ...(findTtscLintConfigPath(options.projectDir)
      ? {}
      : {
          'lint.config.mts': buildWordPressTtscLintConfigSource(
            options.textDomain,
          ),
        }),
  };
}
