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

function renderNamedTypeClause(
  prefix: string,
  typeNames: readonly string[],
  suffix: string,
): string {
  const compact = `${prefix}{ ${typeNames.join(', ')} }${suffix}`;
  return compact.length <= 80
    ? compact
    : `${prefix}{\n${typeNames.map((typeName) => `  ${typeName},`).join('\n')}\n}${suffix}`;
}

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
    '  {',
    `    clientFile: ${quoteTsString(`src/abilities/${abilitySlug}/client.ts`)},`,
    `    compatibility: ${renderScaffoldCompatibilityConfig(
      compatibilityPolicy,
    )},`,
    `    configFile: ${quoteTsString(`src/abilities/${abilitySlug}/ability.config.json`)},`,
    `    dataFile: ${quoteTsString(`src/abilities/${abilitySlug}/data.ts`)},`,
    `    inputSchemaFile: ${quoteTsString(`src/abilities/${abilitySlug}/input.schema.json`)},`,
    `    inputTypeName: ${quoteTsString(`${pascalCase}AbilityInput`)},`,
    `    outputSchemaFile: ${quoteTsString(`src/abilities/${abilitySlug}/output.schema.json`)},`,
    `    outputTypeName: ${quoteTsString(`${pascalCase}AbilityOutput`)},`,
    `    phpFile: ${quoteTsString(`inc/abilities/${abilitySlug}.php`)},`,
    `    slug: ${quoteTsString(abilitySlug)},`,
    `    typesFile: ${quoteTsString(`src/abilities/${abilitySlug}/types.ts`)},`,
    '  },',
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
  contextId: number;
  note?: string;
}

export interface ${pascalCase}AbilityOutput {
  processedContextId: number;
  receivedNote?: string;
  status: 'ready';
  summary: string;
}
`;
}

/**
 * Build the typed client helper module that wraps the WordPress Abilities API.
 */
export function buildAbilityDataSource(abilitySlug: string): string {
  const pascalCase = toPascalCase(abilitySlug);
  const abilityTypeNames = [
    `${pascalCase}AbilityInput`,
    `${pascalCase}AbilityOutput`,
  ];
  const abilityTypeImport = renderNamedTypeClause(
    'import type ',
    abilityTypeNames,
    " from './types';",
  );
  const abilityTypeExport = renderNamedTypeClause(
    'export type ',
    abilityTypeNames,
    ';',
  );
  const abilityConstBase = abilitySlug
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, '_')
    .replace(/_{2,}/gu, '_')
    .replace(/^_|_$/gu, '');

  return `import {
  executeAbility,
  getAbilities,
  getAbility as getRegisteredAbility,
} from '@wordpress/abilities';
import '@wordpress/core-abilities';

import abilityConfig from './ability.config.json';

${abilityTypeImport}

interface WordPressAbilityDefinition {
  category?: string;
  description?: string;
  label?: string;
  meta?: Record<string, unknown>;
  name?: string;
}

export const ${abilityConstBase}_ABILITY = abilityConfig;
export const ${abilityConstBase}_ABILITY_CATEGORY = abilityConfig.category;
export const ${abilityConstBase}_ABILITY_ID = abilityConfig.abilityId;
export const ${abilityConstBase}_ABILITY_META = abilityConfig.meta;
const ABILITY_DISCOVERY_POLL_INTERVAL_MS = 50;
const ABILITY_DISCOVERY_TIMEOUT_MS = 5000;

${abilityTypeExport}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function waitFor${pascalCase}AbilityRegistration(): Promise<void> {
  const deadline = Date.now() + ABILITY_DISCOVERY_TIMEOUT_MS;
  while (!getRegisteredAbility(${abilityConstBase}_ABILITY_ID)) {
    if (Date.now() >= deadline) {
      return;
    }

    await sleep(ABILITY_DISCOVERY_POLL_INTERVAL_MS);
  }
}

export async function list${pascalCase}CategoryAbilities(): Promise<WordPressAbilityDefinition[]> {
  await waitFor${pascalCase}AbilityRegistration();

  return getAbilities({
    category: ${abilityConstBase}_ABILITY_CATEGORY.slug,
  }) as WordPressAbilityDefinition[];
}

export async function get${pascalCase}Ability(): Promise<
  | WordPressAbilityDefinition
  | undefined
> {
  await waitFor${pascalCase}AbilityRegistration();

  return getRegisteredAbility(${abilityConstBase}_ABILITY_ID) as
    | WordPressAbilityDefinition
    | undefined;
}

export async function require${pascalCase}Ability(): Promise<WordPressAbilityDefinition> {
  const ability = await get${pascalCase}Ability();
  if (ability) {
    return ability;
  }

  throw new Error(
    [
      \`Ability "\${${abilityConstBase}_ABILITY_ID}" is not available yet.\`,
      'Load the WordPress core abilities integration on this screen and confirm the server-side registration succeeded.',
    ].join(' '),
  );
}

export async function run${pascalCase}Ability(
  input: ${pascalCase}AbilityInput,
): Promise<${pascalCase}AbilityOutput> {
  await waitFor${pascalCase}AbilityRegistration();

  return (await executeAbility(
    ${abilityConstBase}_ABILITY_ID,
    input,
  )) as ${pascalCase}AbilityOutput;
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

import { ABILITIES, type WorkspaceAbilityConfig } from './block-config';

function parseCliOptions(argv: string[]) {
  const options = {
    check: false,
  };

  for (const argument of argv) {
    if (argument === '--check') {
      options.check = true;
      continue;
    }

    throw new Error(\`Unknown sync-abilities flag: \${argument}\`);
  }

  return options;
}

function isWorkspaceAbility(
  ability: WorkspaceAbilityConfig,
): ability is WorkspaceAbilityConfig & {
  clientFile: string;
  configFile: string;
  dataFile: string;
  inputSchemaFile: string;
  inputTypeName: string;
  outputSchemaFile: string;
  outputTypeName: string;
  phpFile: string;
  typesFile: string;
} {
  return (
    typeof ability.clientFile === 'string' &&
    typeof ability.configFile === 'string' &&
    typeof ability.dataFile === 'string' &&
    typeof ability.inputSchemaFile === 'string' &&
    typeof ability.inputTypeName === 'string' &&
    typeof ability.outputSchemaFile === 'string' &&
    typeof ability.outputTypeName === 'string' &&
    typeof ability.phpFile === 'string' &&
    typeof ability.typesFile === 'string'
  );
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const abilities = ABILITIES.filter(isWorkspaceAbility);

  if (ABILITIES.length > 0 && abilities.length === 0) {
    console.warn(
      '⚠️ Ability inventory entries exist, but none include the required typed schema files. Check scripts/block-config.ts before relying on sync-abilities.',
    );
  }

  if (abilities.length === 0) {
    console.log(
      options.check
        ? 'ℹ️ No typed workflow abilities are registered yet. "sync-abilities --check" is already clean.'
        : 'ℹ️ No typed workflow abilities are registered yet.',
    );
    return;
  }

  for (const ability of abilities) {
    await syncTypeSchemas(
      {
        jsonSchemaFile: ability.inputSchemaFile,
        projectRoot: process.cwd(),
        sourceTypeName: ability.inputTypeName,
        typesFile: ability.typesFile,
      },
      {
        check: options.check,
      },
    );

    await syncTypeSchemas(
      {
        jsonSchemaFile: ability.outputSchemaFile,
        projectRoot: process.cwd(),
        sourceTypeName: ability.outputTypeName,
        typesFile: ability.typesFile,
      },
      {
        check: options.check,
      },
    );
  }

  console.log(
    options.check
      ? '✅ Ability input and output schemas are already up to date for all registered workflow abilities!'
      : '✅ Ability input and output schemas generated for all registered workflow abilities!',
  );
}

main().catch((error) => {
  console.error('❌ Ability schema sync failed:', error);
  process.exit(1);
});
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
