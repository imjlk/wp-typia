/**
 * Generate the `scripts/sync-ai-features.ts` source that projects AI-safe schemas for workspace features.
 */
export function buildAiFeatureSyncScriptSource(): string {
	return `/* eslint-disable no-console */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { projectWordPressAiSchema } from '@wp-typia/project-tools/ai-artifacts';

import {
\tAI_FEATURES,
\ttype WorkspaceAiFeatureConfig,
} from './block-config';

function parseCliOptions( argv: string[] ) {
\tconst options = {
\t\tcheck: false,
\t};

\tfor ( const argument of argv ) {
\t\tif ( argument === '--check' ) {
\t\t\toptions.check = true;
\t\t\tcontinue;
\t\t}

\t\tthrow new Error( \`Unknown sync-ai flag: \${ argument }\` );
\t}

\treturn options;
}

function isWorkspaceAiFeature(
\tfeature: WorkspaceAiFeatureConfig
): feature is WorkspaceAiFeatureConfig & {
\taiSchemaFile: string;
\ttypesFile: string;
} {
\treturn (
\t\ttypeof feature.aiSchemaFile === 'string' &&
\t\ttypeof feature.typesFile === 'string'
\t);
}

function normalizeGeneratedArtifactContent( content: string ) {
\treturn content.replace( /\\r\\n?/g, '\\n' );
}

async function reconcileGeneratedArtifact( options: {
\tcheck: boolean;
\tcontent: string;
\tfilePath: string;
\tlabel: string;
} ) {
\tif ( ! options.check ) {
\t\tawait mkdir( path.dirname( options.filePath ), {
\t\t\trecursive: true,
\t\t} );
\t\tawait writeFile( options.filePath, options.content, 'utf8' );
\t\treturn;
\t}

\tconst current = normalizeGeneratedArtifactContent(
\t\tawait readFile( options.filePath, 'utf8' )
\t);
\tconst expected = normalizeGeneratedArtifactContent( options.content );
\tif ( current !== expected ) {
\t\tthrow new Error(
\t\t\t\`Generated AI feature artifact is stale: \${ options.label } (\${ options.filePath }).\`
\t\t);
\t}
}

async function loadJsonDocument( filePath: string ) {
\tlet source: string;
\ttry {
\t\tsource = await readFile( filePath, 'utf8' );
\t} catch ( error ) {
\t\tthrow new Error(
\t\t\t\`Failed to read AI schema document at \${ filePath }: \${ error instanceof Error ? error.message : String( error ) }\`
\t\t);
\t}

\tlet decoded: unknown;
\ttry {
\t\tdecoded = JSON.parse( source ) as unknown;
\t} catch ( error ) {
\t\tthrow new Error(
\t\t\t\`Failed to parse AI schema document at \${ filePath }: \${ error instanceof Error ? error.message : String( error ) }\`
\t\t);
\t}
\tif ( ! decoded || typeof decoded !== 'object' || Array.isArray( decoded ) ) {
\t\tthrow new Error( \`Expected \${ filePath } to decode to a JSON object.\` );
\t}

\treturn decoded as Parameters< typeof projectWordPressAiSchema >[ 0 ];
}

async function main() {
\tconst options = parseCliOptions( process.argv.slice( 2 ) );
\tconst aiFeatures = AI_FEATURES.filter( isWorkspaceAiFeature );
\tif ( AI_FEATURES.length > 0 && aiFeatures.length === 0 ) {
\t\tconsole.warn(
\t\t\t'⚠️ AI_FEATURES entries exist, but none satisfied the generated sync-ai guard. Check for missing aiSchemaFile/typesFile fields in scripts/block-config.ts.'
\t\t);
\t}

\tif ( aiFeatures.length === 0 ) {
\t\tconsole.log(
\t\t\toptions.check
\t\t\t\t? 'ℹ️ No workspace AI features are registered yet. \`sync-ai --check\` is already clean.'
\t\t\t\t: 'ℹ️ No workspace AI features are registered yet.'
\t\t);
\t\treturn;
\t}

\tfor ( const feature of aiFeatures ) {
\t\tconst sourceSchemaPath = path.join(
\t\t\tpath.dirname( feature.typesFile ),
\t\t\t'api-schemas',
\t\t\t'feature-result.schema.json'
\t\t);
\t\tconst sourceSchema = await loadJsonDocument( sourceSchemaPath );
\t\tconst aiSchema = projectWordPressAiSchema( sourceSchema );
\t\tawait reconcileGeneratedArtifact( {
\t\t\tcheck: options.check,
\t\t\tcontent: \`\${ JSON.stringify( aiSchema, null, 2 ) }\\n\`,
\t\t\tfilePath: feature.aiSchemaFile,
\t\t\tlabel: feature.slug,
\t\t} );
\t}

\tconsole.log(
\t\toptions.check
\t\t\t? '✅ AI feature structured-output schemas are already synchronized.'
\t\t\t: '✅ AI feature structured-output schemas were synchronized.'
\t);
}

main().catch( ( error ) => {
\tconsole.error( '❌ AI feature sync failed:', error );
\tprocess.exit( 1 );
} );
`;
}
