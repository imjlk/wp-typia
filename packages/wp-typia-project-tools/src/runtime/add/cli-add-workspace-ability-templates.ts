import type { ScaffoldCompatibilityPolicy } from '../templates/scaffold-compatibility.js';
import { renderScaffoldCompatibilityConfig } from '../templates/scaffold-compatibility.js';
import { quoteTsString } from './cli-add-shared.js';
import {
  ABILITY_REGISTRY_END_MARKER,
  ABILITY_REGISTRY_START_MARKER,
} from './cli-add-workspace-ability-types.js';
import { quotePhpString } from '../shared/php-utils.js';
import { toPascalCase, toTitleCase } from '../shared/string-case.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

function toAbilityCategorySlug(workspaceNamespace: string): string {
  const normalizedNamespace = workspaceNamespace
		.replace(/[^a-z0-9-]+/gu, '-')
		.replace(/-{2,}/gu, '-')
		.replace(/^-|-$/gu, '');

  return `${normalizedNamespace || 'workspace'}-workflows`;
}

/**
 * Build the `ABILITIES` inventory entry for a generated workflow ability.
 */
export function buildAbilityConfigEntry(
	abilitySlug: string,
	compatibilityPolicy: ScaffoldCompatibilityPolicy,
): string {
  const pascalCase = toPascalCase(abilitySlug);

  return [
		'\t{',
		`\t\tclientFile: ${quoteTsString(`src/abilities/${abilitySlug}/client.ts`)},`,
		`\t\tcompatibility: ${renderScaffoldCompatibilityConfig(
			compatibilityPolicy,
		)},`,
		`\t\tconfigFile: ${quoteTsString(`src/abilities/${abilitySlug}/ability.config.json`)},`,
		`\t\tdataFile: ${quoteTsString(`src/abilities/${abilitySlug}/data.ts`)},`,
		`\t\tinputSchemaFile: ${quoteTsString(`src/abilities/${abilitySlug}/input.schema.json`)},`,
		`\t\tinputTypeName: ${quoteTsString(`${pascalCase}AbilityInput`)},`,
		`\t\toutputSchemaFile: ${quoteTsString(`src/abilities/${abilitySlug}/output.schema.json`)},`,
		`\t\toutputTypeName: ${quoteTsString(`${pascalCase}AbilityOutput`)},`,
		`\t\tphpFile: ${quoteTsString(`inc/abilities/${abilitySlug}.php`)},`,
		`\t\tslug: ${quoteTsString(abilitySlug)},`,
		`\t\ttypesFile: ${quoteTsString(`src/abilities/${abilitySlug}/types.ts`)},`,
		'\t},',
	].join('\n');
}

/**
 * Build the JSON config document that powers server-side ability registration.
 */
export function buildAbilityConfigSource(
	abilitySlug: string,
	workspaceNamespace: string,
): string {
  const abilityTitle = toTitleCase(abilitySlug);

  return `${JSON.stringify(
		{
			abilityId: `${workspaceNamespace}/${abilitySlug}`,
			category: {
				description: `Typed editor and admin workflows exposed by the ${workspaceNamespace} workspace.`,
				label: `${toTitleCase(workspaceNamespace)} Workflows`,
				slug: toAbilityCategorySlug(workspaceNamespace),
			},
			description: `Runs the ${abilityTitle} workflow using a typed server callback.`,
			label: abilityTitle,
			meta: {
				annotations: {
					destructive: false,
					idempotent: true,
					readonly: false,
				},
				mcp: {
					public: false,
				},
				showInRest: true,
			},
		},
		null,
		2,
	)}\n`;
}

/**
 * Build the starter TypeScript input and output contracts for an ability.
 */
export function buildAbilityTypesSource(abilitySlug: string): string {
  const pascalCase = toPascalCase(abilitySlug);

  return `export interface ${pascalCase}AbilityInput {
\tcontextId: number;
\tnote?: string;
}

export interface ${pascalCase}AbilityOutput {
\tprocessedContextId: number;
\treceivedNote?: string;
\tstatus: 'ready';
\tsummary: string;
}
`;
}

/**
 * Build the typed client helper module that wraps the WordPress Abilities API.
 */
export function buildAbilityDataSource(abilitySlug: string): string {
  const pascalCase = toPascalCase(abilitySlug);
  const abilityConstBase = abilitySlug
		.toUpperCase()
		.replace(/[^A-Z0-9]+/gu, '_')
		.replace(/_{2,}/gu, '_')
		.replace(/^_|_$/gu, '');

  return `import {
\texecuteAbility,
\tgetAbilities,
\tgetAbility as getRegisteredAbility,
} from '@wordpress/abilities';
import '@wordpress/core-abilities';

import abilityConfig from './ability.config.json';

import type { ${pascalCase}AbilityInput, ${pascalCase}AbilityOutput } from './types';

interface WordPressAbilityDefinition {
\tcategory?: string;
\tdescription?: string;
\tlabel?: string;
\tmeta?: Record<string, unknown>;
\tname?: string;
}

export const ${abilityConstBase}_ABILITY = abilityConfig;
export const ${abilityConstBase}_ABILITY_CATEGORY = abilityConfig.category;
export const ${abilityConstBase}_ABILITY_ID = abilityConfig.abilityId;
export const ${abilityConstBase}_ABILITY_META = abilityConfig.meta;
const ABILITY_DISCOVERY_POLL_INTERVAL_MS = 50;
const ABILITY_DISCOVERY_TIMEOUT_MS = 5000;

export type {
\t${pascalCase}AbilityInput,
\t${pascalCase}AbilityOutput,
};

function sleep( milliseconds: number ): Promise< void > {
\treturn new Promise( ( resolve ) => {
\t\tsetTimeout( resolve, milliseconds );
\t} );
}

async function waitFor${pascalCase}AbilityRegistration(): Promise< void > {
\tconst deadline = Date.now() + ABILITY_DISCOVERY_TIMEOUT_MS;
\twhile ( ! getRegisteredAbility( ${abilityConstBase}_ABILITY_ID ) ) {
\t\tif ( Date.now() >= deadline ) {
\t\t\treturn;
\t\t}

\t\tawait sleep( ABILITY_DISCOVERY_POLL_INTERVAL_MS );
\t}
}

export async function list${pascalCase}CategoryAbilities(): Promise< WordPressAbilityDefinition[] > {
\tawait waitFor${pascalCase}AbilityRegistration();

\treturn getAbilities( {
\t\tcategory: ${abilityConstBase}_ABILITY_CATEGORY.slug,
\t} ) as WordPressAbilityDefinition[];
}

export async function get${pascalCase}Ability(): Promise<
\t| WordPressAbilityDefinition
\t| undefined
> {
\tawait waitFor${pascalCase}AbilityRegistration();

\treturn getRegisteredAbility( ${abilityConstBase}_ABILITY_ID ) as
\t\t| WordPressAbilityDefinition
\t\t| undefined;
}

export async function require${pascalCase}Ability(): Promise< WordPressAbilityDefinition > {
\tconst ability = await get${pascalCase}Ability();
\tif ( ability ) {
\t\treturn ability;
\t}

\tthrow new Error(
\t\t[
\t\t\t\`Ability "\${ ${abilityConstBase}_ABILITY_ID }" is not available yet.\`,
\t\t\t'Load the WordPress core abilities integration on this screen and confirm the server-side registration succeeded.',
\t\t].join( ' ' )
\t);
}

export async function run${pascalCase}Ability(
\tinput: ${pascalCase}AbilityInput
): Promise< ${pascalCase}AbilityOutput > {
\tawait waitFor${pascalCase}AbilityRegistration();

\treturn ( await executeAbility(
\t\t${abilityConstBase}_ABILITY_ID,
\t\tinput
\t) ) as ${pascalCase}AbilityOutput;
}
`;
}

/**
 * Build the re-export shim for the generated ability client helpers.
 */
export function buildAbilityClientSource(abilitySlug: string): string {
  const pascalCase = toPascalCase(abilitySlug);

  return `/**
 * Re-export the typed ${pascalCase} ability client helpers.
 *
 * The helper methods load the WordPress core abilities integration and wait for
 * this server-registered ability before reading or executing it.
 */
export * from './data';
`;
}

/**
 * Build the schema sync script that keeps generated ability JSON artifacts current.
 */
export function buildAbilitySyncScriptSource(): string {
  return `/* eslint-disable no-console */
import { syncTypeSchemas } from '@wp-typia/block-runtime/metadata-core';

import {
\tABILITIES,
\ttype WorkspaceAbilityConfig,
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

\t\tthrow new Error( \`Unknown sync-abilities flag: \${ argument }\` );
\t}

\treturn options;
}

function isWorkspaceAbility(
\tability: WorkspaceAbilityConfig
): ability is WorkspaceAbilityConfig & {
\tclientFile: string;
\tconfigFile: string;
\tdataFile: string;
\tinputSchemaFile: string;
\tinputTypeName: string;
\toutputSchemaFile: string;
\toutputTypeName: string;
\tphpFile: string;
\ttypesFile: string;
} {
\treturn (
\t\ttypeof ability.clientFile === 'string' &&
\t\ttypeof ability.configFile === 'string' &&
\t\ttypeof ability.dataFile === 'string' &&
\t\ttypeof ability.inputSchemaFile === 'string' &&
\t\ttypeof ability.inputTypeName === 'string' &&
\t\ttypeof ability.outputSchemaFile === 'string' &&
\t\ttypeof ability.outputTypeName === 'string' &&
\t\ttypeof ability.phpFile === 'string' &&
\t\ttypeof ability.typesFile === 'string'
\t);
}

async function main() {
\tconst options = parseCliOptions( process.argv.slice( 2 ) );
\tconst abilities = ABILITIES.filter( isWorkspaceAbility );

\tif ( ABILITIES.length > 0 && abilities.length === 0 ) {
\t\tconsole.warn(
\t\t\t'⚠️ Ability inventory entries exist, but none include the required typed schema files. Check scripts/block-config.ts before relying on sync-abilities.'
\t\t);
\t}

\tif ( abilities.length === 0 ) {
\t\tconsole.log(
\t\t\toptions.check
\t\t\t\t? 'ℹ️ No typed workflow abilities are registered yet. "sync-abilities --check" is already clean.'
\t\t\t\t: 'ℹ️ No typed workflow abilities are registered yet.'
\t\t);
\t\treturn;
\t}

\tfor ( const ability of abilities ) {
\t\tawait syncTypeSchemas(
\t\t\t{
\t\t\t\tjsonSchemaFile: ability.inputSchemaFile,
\t\t\t\tprojectRoot: process.cwd(),
\t\t\t\tsourceTypeName: ability.inputTypeName,
\t\t\t\ttypesFile: ability.typesFile,
\t\t\t},
\t\t\t{
\t\t\t\tcheck: options.check,
\t\t\t}
\t\t);

\t\tawait syncTypeSchemas(
\t\t\t{
\t\t\t\tjsonSchemaFile: ability.outputSchemaFile,
\t\t\t\tprojectRoot: process.cwd(),
\t\t\t\tsourceTypeName: ability.outputTypeName,
\t\t\t\ttypesFile: ability.typesFile,
\t\t\t},
\t\t\t{
\t\t\t\tcheck: options.check,
\t\t\t}
\t\t);
\t}

\tconsole.log(
\t\toptions.check
\t\t\t? '✅ Ability input and output schemas are already up to date for all registered workflow abilities!'
\t\t\t: '✅ Ability input and output schemas generated for all registered workflow abilities!'
\t);
}

main().catch( ( error ) => {
\tconsole.error( '❌ Ability schema sync failed:', error );
\tprocess.exit( 1 );
} );
`;
}

/**
 * Build the PHP ability registration module for a generated workflow ability.
 */
export function buildAbilityPhpSource(
	abilitySlug: string,
	workspace: WorkspaceProject,
): string {
  const abilityTitle = toTitleCase(abilitySlug);
  const abilityPhpId = abilitySlug.replace(/-/g, '_');
  const categoryRegisterFunctionName = `${workspace.workspace.phpPrefix}_${abilityPhpId}_register_ability_category`;
  const abilityRegisterFunctionName = `${workspace.workspace.phpPrefix}_${abilityPhpId}_register_ability`;
  const configLoaderFunctionName = `${workspace.workspace.phpPrefix}_${abilityPhpId}_load_ability_config`;
  const schemaLoaderFunctionName = `${workspace.workspace.phpPrefix}_${abilityPhpId}_load_ability_schema`;
  const permissionFunctionName = `${workspace.workspace.phpPrefix}_${abilityPhpId}_can_execute_ability`;
  const executeFunctionName = `${workspace.workspace.phpPrefix}_${abilityPhpId}_execute_ability`;
  const metaFactoryFunctionName = `${workspace.workspace.phpPrefix}_${abilityPhpId}_build_ability_meta`;

  return `<?php
if ( ! defined( 'ABSPATH' ) ) {
\treturn;
}

if ( ! function_exists( '${configLoaderFunctionName}' ) ) {
\tfunction ${configLoaderFunctionName}() {
\t\t$project_root = dirname( __DIR__, 2 );
\t\t$config_path  = $project_root . '/src/abilities/${abilitySlug}/ability.config.json';
\t\tif ( ! file_exists( $config_path ) ) {
\t\t\treturn null;
\t\t}

\t\t$decoded = json_decode( file_get_contents( $config_path ), true );
\t\treturn is_array( $decoded ) ? $decoded : null;
\t}
}

if ( ! function_exists( '${schemaLoaderFunctionName}' ) ) {
\tfunction ${schemaLoaderFunctionName}( $schema_name ) {
\t\t$project_root = dirname( __DIR__, 2 );
\t\t$schema_path  = $project_root . '/src/abilities/${abilitySlug}/' . $schema_name;
\t\tif ( ! file_exists( $schema_path ) ) {
\t\t\treturn null;
\t\t}

\t\t$decoded = json_decode( file_get_contents( $schema_path ), true );
\t\treturn is_array( $decoded ) ? $decoded : null;
\t}
}

if ( ! function_exists( '${metaFactoryFunctionName}' ) ) {
\tfunction ${metaFactoryFunctionName}( array $config ) {
\t\t$meta = array(
\t\t\t'annotations' => isset( $config['meta']['annotations'] ) && is_array( $config['meta']['annotations'] )
\t\t\t\t? $config['meta']['annotations']
\t\t\t\t: array(
\t\t\t\t\t'destructive' => false,
\t\t\t\t\t'idempotent'  => true,
\t\t\t\t\t'readonly'    => false,
\t\t\t\t),
\t\t\t'show_in_rest' => ! empty( $config['meta']['showInRest'] ),
\t\t);

\t\tif ( ! empty( $config['meta']['mcp']['public'] ) ) {
\t\t\t$meta['mcp'] = array(
\t\t\t\t'public' => true,
\t\t\t);
\t\t}

\t\treturn $meta;
\t}
}

if ( ! function_exists( '${permissionFunctionName}' ) ) {
\tfunction ${permissionFunctionName}( $input = array() ) {
\t\tunset( $input );

\t\treturn current_user_can( 'edit_posts' );
\t}
}

if ( ! function_exists( '${executeFunctionName}' ) ) {
\tfunction ${executeFunctionName}( $input = array() ) {
\t\t$payload = is_array( $input ) ? $input : array();
\t\t$context_id = isset( $payload['contextId'] ) ? (int) $payload['contextId'] : 0;
\t\t$note = isset( $payload['note'] ) && is_string( $payload['note'] )
\t\t\t? trim( $payload['note'] )
\t\t\t: '';
\t\t$result = array(
\t\t\t'processedContextId' => $context_id,
\t\t\t'status'             => 'ready',
\t\t\t'summary'            => sprintf(
\t\t\t\t/* translators: 1: workflow title, 2: context id */
\t\t\t\t__( '%1$s processed context %2$d.', ${quotePhpString(
					workspace.workspace.textDomain,
				)} ),
\t\t\t\t${quotePhpString(abilityTitle)},
\t\t\t\t$context_id
\t\t\t),
\t\t);

\t\tif ( '' !== $note ) {
\t\t\t$result['receivedNote'] = $note;
\t\t}

\t\treturn $result;
\t}
}

if ( ! function_exists( '${categoryRegisterFunctionName}' ) ) {
\tfunction ${categoryRegisterFunctionName}() {
\t\tif ( ! function_exists( 'wp_register_ability_category' ) ) {
\t\t\treturn;
\t\t}

\t\t$config = ${configLoaderFunctionName}();
\t\tif (
\t\t\t! is_array( $config ) ||
\t\t\tempty( $config['category']['slug'] ) ||
\t\t\tempty( $config['category']['label'] )
\t\t) {
\t\t\treturn;
\t\t}

\t\twp_register_ability_category(
\t\t\t(string) $config['category']['slug'],
\t\t\tarray(
\t\t\t\t'description' => isset( $config['category']['description'] ) && is_string( $config['category']['description'] )
\t\t\t\t\t? $config['category']['description']
\t\t\t\t\t: '',
\t\t\t\t'label'       => (string) $config['category']['label'],
\t\t\t)
\t\t);
\t}
}

if ( ! function_exists( '${abilityRegisterFunctionName}' ) ) {
\tfunction ${abilityRegisterFunctionName}() {
\t\tif ( ! function_exists( 'wp_register_ability' ) ) {
\t\t\treturn;
\t\t}

\t\t$config = ${configLoaderFunctionName}();
\t\tif (
\t\t\t! is_array( $config ) ||
\t\t\tempty( $config['abilityId'] ) ||
\t\t\tempty( $config['category']['slug'] ) ||
\t\t\tempty( $config['label'] ) ||
\t\t\tempty( $config['description'] )
\t\t) {
\t\t\treturn;
\t\t}

\t\t$input_schema  = ${schemaLoaderFunctionName}( 'input.schema.json' );
\t\t$output_schema = ${schemaLoaderFunctionName}( 'output.schema.json' );
\t\tif ( ! is_array( $output_schema ) ) {
\t\t\treturn;
\t\t}

\t\t$args = array(
\t\t\t'category'            => (string) $config['category']['slug'],
\t\t\t'description'         => (string) $config['description'],
\t\t\t'execute_callback'    => ${quotePhpString(executeFunctionName)},
\t\t\t'label'               => (string) $config['label'],
\t\t\t'meta'                => ${metaFactoryFunctionName}( $config ),
\t\t\t'output_schema'       => $output_schema,
\t\t\t'permission_callback' => ${quotePhpString(permissionFunctionName)},
\t\t);

\t\tif ( is_array( $input_schema ) ) {
\t\t\t$args['input_schema'] = $input_schema;
\t\t}

\t\twp_register_ability(
\t\t\t(string) $config['abilityId'],
\t\t\t$args
\t\t);
\t}
}

add_action( 'wp_abilities_api_categories_init', '${categoryRegisterFunctionName}' );
add_action( 'wp_abilities_api_init', '${abilityRegisterFunctionName}' );
`;
}

/**
 * Build the generated abilities index section managed by `wp-typia add ability`.
 */
export function buildAbilityRegistrySource(abilitySlugs: string[]): string {
  const exportLines = abilitySlugs
		.map((abilitySlug) => `export * from './${abilitySlug}/client';`)
		.join('\n');

  return [
		ABILITY_REGISTRY_START_MARKER,
		exportLines,
		ABILITY_REGISTRY_END_MARKER,
	]
		.filter((line) => line.length > 0)
		.join('\n')
		.concat('\n');
}
