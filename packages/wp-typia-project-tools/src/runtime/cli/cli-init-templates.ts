import path from "node:path";

import { quoteTsString } from "../add/cli-add-shared.js";
import type { RetrofitInitBlockTarget } from "./cli-init-types.js";
import { updateWorkspaceInventorySource } from "../workspace/workspace-inventory.js";

function buildRetrofitBlockConfigEntry(
	target: RetrofitInitBlockTarget,
): string {
	return [
		"\t{",
		`\t\tslug: ${quoteTsString(target.slug)},`,
		`\t\tattributeTypeName: ${quoteTsString(target.attributeTypeName)},`,
		`\t\tblockJsonFile: ${quoteTsString(target.blockJsonFile)},`,
		`\t\tmanifestFile: ${quoteTsString(target.manifestFile)},`,
		`\t\ttypesFile: ${quoteTsString(target.typesFile)},`,
		"\t},",
	].join("\n");
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
	const blockEntries = targets.map(buildRetrofitBlockConfigEntry).join("\n");
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

\tconst result = spawnSync( 'tsx', args, {
\t\tcwd: process.cwd(),
\t\tenv: getSyncScriptEnv(),
\t\tshell: process.platform === 'win32',
\t\tstdio: 'inherit',
\t} );

\tif ( result.error ) {
\t\tif ( isFileNotFoundError( result.error ) ) {
\t\t\tthrow new Error(
\t\t\t\t'Unable to resolve \`tsx\` for project sync. Install project dependencies or rerun the command through your package manager.'
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
): Record<string, string> {
	return {
		[path.join("scripts", "block-config.ts")]:
			buildRetrofitBlockConfigSource(blockTargets),
		[path.join("scripts", "sync-project.ts")]:
			buildRetrofitSyncProjectScriptSource(),
		[path.join("scripts", "sync-types-to-block-json.ts")]:
			buildRetrofitSyncTypesScriptSource(),
	};
}
