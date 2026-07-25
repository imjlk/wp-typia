import { quoteTsString } from './cli-add-shared.js';
import { quotePhpString } from '../shared/php-utils.js';
import { toTitleCase } from '../shared/string-case.js';

/**
 * Render one `POST_META` inventory entry for `scripts/block-config.ts`.
 *
 * @param options Metadata used to render the inventory entry.
 * @param options.metaKey WordPress meta key registered by the generated PHP.
 * @param options.postMetaSlug Stable post-meta contract slug.
 * @param options.postType WordPress post type scoped to the meta key.
 * @param options.showInRest Whether the meta key is exposed to REST/editor APIs.
 * @param options.sourceTypeName Exported TypeScript interface name.
 * @returns Formatted TypeScript object literal for the `POST_META` array.
 */
export function buildPostMetaConfigEntry(options: {
  metaKey: string;
  postMetaSlug: string;
  postType: string;
  showInRest: boolean;
  sourceTypeName: string;
}): string {
  return [
		'\t{',
		`\t\tmetaKey: ${quoteTsString(options.metaKey)},`,
		`\t\tphpFile: ${quoteTsString(`inc/post-meta/${options.postMetaSlug}.php`)},`,
		`\t\tpostType: ${quoteTsString(options.postType)},`,
		`\t\tschemaFile: ${quoteTsString(`src/post-meta/${options.postMetaSlug}/meta.schema.json`)},`,
		`\t\tshowInRest: ${options.showInRest ? 'true' : 'false'},`,
		`\t\tslug: ${quoteTsString(options.postMetaSlug)},`,
		`\t\tsourceTypeName: ${quoteTsString(options.sourceTypeName)},`,
		`\t\ttypesFile: ${quoteTsString(`src/post-meta/${options.postMetaSlug}/types.ts`)},`,
		'\t},',
	].join('\n');
}

/**
 * Render a starter TypeScript post-meta contract.
 *
 * @param postMetaSlug Stable post-meta contract slug used to build the title.
 * @param sourceTypeName Exported TypeScript interface name to emit.
 * @returns Generated TypeScript source for the post-meta contract.
 */
export function buildPostMetaTypesSource(
	postMetaSlug: string,
	sourceTypeName: string,
): string {
  const title = toTitleCase(postMetaSlug);

  return `/**
 * ${title} is the source of truth for a generated WordPress post meta contract.
 *
 * Edit this interface, then run \`wp-typia sync-rest --check\` to verify the
 * JSON Schema artifact and PHP registration stay aligned.
 */
export interface ${sourceTypeName} {
\tenabled: boolean;
\tstatus: 'draft' | 'ready';
\tupdatedAt: string;
\tnotes?: string;
}
`;
}

/**
 * Render smoke-test guidance beside the generated TypeScript contract.
 *
 * @param options Metadata used to render the README content.
 * @param options.metaKey WordPress meta key registered by the generated PHP.
 * @param options.postMetaSlug Stable post-meta contract slug.
 * @param options.postType WordPress post type scoped to the meta key.
 * @param options.sourceTypeName Exported TypeScript interface name.
 * @returns Generated README content for the post-meta contract directory.
 */
export function buildPostMetaReadmeSource(options: {
  metaKey: string;
  postMetaSlug: string;
  postType: string;
  sourceTypeName: string;
}): string {
  const title = toTitleCase(options.postMetaSlug);

  return `# ${title} Post Meta Contract

\`${options.sourceTypeName}\` in \`types.ts\` defines the shape for
\`${options.metaKey}\` on the \`${options.postType}\` post type.

After editing the TypeScript interface, run:

\`\`\`bash
wp-typia sync-rest --check
\`\`\`

If the check reports stale artifacts, run \`wp-typia sync-rest\` and commit the
updated \`meta.schema.json\`. For an end-to-end smoke test in WordPress, create
or update a \`${options.postType}\` post and confirm the REST response exposes
the meta key only when \`showInRest\` is enabled in \`scripts/block-config.ts\`.
`;
}

/**
 * Render the PHP module loaded by the workspace bootstrap to register the post
 * meta key with the schema generated from TypeScript.
 *
 * @param options Metadata used to render the PHP module.
 * @param options.metaKey WordPress meta key to register.
 * @param options.phpPrefix Workspace PHP function prefix.
 * @param options.postMetaSlug Stable post-meta contract slug.
 * @param options.postType WordPress post type scoped to the meta key.
 * @param options.showInRest Whether `register_post_meta()` exposes REST schema.
 * @param options.textDomain Workspace text domain used for descriptions.
 * @returns Generated PHP source for registering the post-meta contract.
 */
export function buildPostMetaPhpSource(options: {
  metaKey: string;
  phpPrefix: string;
  postMetaSlug: string;
  postType: string;
  showInRest: boolean;
  textDomain: string;
}): string {
  const postMetaTitle = toTitleCase(options.postMetaSlug);
  const postMetaPhpId = options.postMetaSlug.replace(/-/gu, '_');
  const functionPrefix = `${options.phpPrefix}_${postMetaPhpId}`;
  const loadSchemaFunctionName = `${functionPrefix}_load_post_meta_schema`;
  const normalizeSchemaFunctionName = `${functionPrefix}_normalize_post_meta_schema`;
  const authFunctionName = `${functionPrefix}_can_edit_post_meta`;
  const registerFunctionName = `${functionPrefix}_register_post_meta`;
  const showInRestSource = options.showInRest
		? `array(
\t\t\t'schema' => ${loadSchemaFunctionName}(),
\t\t)`
		: 'false';

  return `<?php
/**
 * Registers the ${postMetaTitle} post meta contract.
 *
 * The REST schema is generated from src/post-meta/${options.postMetaSlug}/types.ts.
 *
 * @package ${options.phpPrefix}
 */

if ( ! defined( 'ABSPATH' ) ) {
\texit;
}

if ( ! function_exists( '${normalizeSchemaFunctionName}' ) ) {
\tfunction ${normalizeSchemaFunctionName}( $schema ) {
\t\tif ( ! is_array( $schema ) ) {
\t\t\treturn array(
\t\t\t\t'type'       => 'object',
\t\t\t\t'properties' => array(),
\t\t\t);
\t\t}

\t\tunset( $schema['$schema'], $schema['$id'], $schema['title'] );

\t\tif ( empty( $schema['type'] ) ) {
\t\t\t$schema['type'] = 'object';
\t\t}

\t\treturn $schema;
\t}
}

if ( ! function_exists( '${loadSchemaFunctionName}' ) ) {
\tfunction ${loadSchemaFunctionName}() {
\t\t$schema_file = dirname( __DIR__, 2 ) . '/src/post-meta/${options.postMetaSlug}/meta.schema.json';

\t\tif ( ! file_exists( $schema_file ) ) {
\t\t\treturn ${normalizeSchemaFunctionName}( array() );
\t\t}

\t\t$schema = json_decode( (string) file_get_contents( $schema_file ), true );

\t\treturn ${normalizeSchemaFunctionName}( $schema );
\t}
}

if ( ! function_exists( '${authFunctionName}' ) ) {
\tfunction ${authFunctionName}( $allowed, $meta_key, $post_id, $user_id, $cap, $caps ) {
\t\tunset( $allowed, $meta_key, $cap, $caps );

\t\treturn user_can( $user_id, 'edit_post', $post_id );
\t}
}

if ( ! function_exists( '${registerFunctionName}' ) ) {
\tfunction ${registerFunctionName}() {
\t\tregister_post_meta(
\t\t\t${quotePhpString(options.postType)},
\t\t\t${quotePhpString(options.metaKey)},
\t\t\tarray(
\t\t\t\t'auth_callback' => ${quotePhpString(authFunctionName)},
\t\t\t\t'description'   => __( ${quotePhpString(`${postMetaTitle} typed post meta contract.`)}, ${quotePhpString(options.textDomain)} ),
\t\t\t\t'show_in_rest'  => ${showInRestSource},
\t\t\t\t'single'        => true,
\t\t\t\t'type'          => 'object',
\t\t\t)
\t\t);
\t}
}

${registerFunctionName}();
`;
}
