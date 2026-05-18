/**
 * Build the shared PHP helper loaded by workspace bootstraps for generated REST schemas.
 *
 * @param phpPrefix Plugin-scoped PHP function prefix.
 * @returns PHP source for `inc/rest-schema.php`.
 */
export function buildWorkspaceRestSchemaHelperPhpSource(phpPrefix: string): string {
	return `<?php
if ( ! defined( 'ABSPATH' ) ) {
\treturn;
}

if ( ! function_exists( '${phpPrefix}_is_valid_rest_schema_key' ) ) {
\tfunction ${phpPrefix}_is_valid_rest_schema_key( $value ) {
\t\treturn is_string( $value ) && 1 === preg_match( '/\\A[A-Za-z0-9_-]+\\z/', $value );
\t}
}

if ( ! function_exists( '${phpPrefix}_is_valid_rest_resource_slug' ) ) {
\tfunction ${phpPrefix}_is_valid_rest_resource_slug( $value ) {
\t\treturn is_string( $value ) && 1 === preg_match( '/\\A[a-z0-9]+(?:-[a-z0-9]+)*\\z/', $value );
\t}
}

if ( ! function_exists( '${phpPrefix}_resolve_rest_schema_paths' ) ) {
\tfunction ${phpPrefix}_resolve_rest_schema_paths( $schema_name, $options = array() ) {
\t\tif ( ! ${phpPrefix}_is_valid_rest_schema_key( $schema_name ) ) {
\t\t\treturn new WP_Error(
\t\t\t\t'invalid_rest_schema_name',
\t\t\t\t'Invalid REST schema name.',
\t\t\t\tarray( 'status' => 500 )
\t\t\t);
\t\t}

\t\t$options      = is_array( $options ) ? $options : array();
\t\t$project_root = dirname( __DIR__ );
\t\t$paths        = array();

\t\tif ( isset( $options['resource'] ) && '' !== $options['resource'] ) {
\t\t\tif ( ! ${phpPrefix}_is_valid_rest_resource_slug( $options['resource'] ) ) {
\t\t\t\treturn new WP_Error(
\t\t\t\t\t'invalid_rest_schema_resource',
\t\t\t\t\t'Invalid REST schema resource slug.',
\t\t\t\t\tarray( 'status' => 500 )
\t\t\t\t);
\t\t\t}

\t\t\t$resource_slug = $options['resource'];
\t\t\t$paths[]       = __DIR__ . '/rest-schemas/rest/' . $resource_slug . '/' . $schema_name . '.schema.json';
\t\t\t$paths[]       = $project_root . '/src/rest/' . $resource_slug . '/api-schemas/' . $schema_name . '.schema.json';
\t\t}

\t\tif ( isset( $options['paths'] ) && is_array( $options['paths'] ) ) {
\t\t\tforeach ( $options['paths'] as $schema_path ) {
\t\t\t\tif ( is_string( $schema_path ) && '' !== $schema_path && ! in_array( $schema_path, $paths, true ) ) {
\t\t\t\t\t$paths[] = $schema_path;
\t\t\t\t}
\t\t\t}
\t\t}

\t\treturn $paths;
\t}
}

if ( ! function_exists( '${phpPrefix}_load_rest_schema' ) ) {
\tfunction ${phpPrefix}_load_rest_schema( $schema_name, $options = array() ) {
\t\t$schema_paths = ${phpPrefix}_resolve_rest_schema_paths( $schema_name, $options );
\t\tif ( is_wp_error( $schema_paths ) ) {
\t\t\treturn $schema_paths;
\t\t}

\t\tforeach ( $schema_paths as $schema_path ) {
\t\t\tif ( ! is_file( $schema_path ) ) {
\t\t\t\tcontinue;
\t\t\t}

\t\t\tif ( ! is_readable( $schema_path ) ) {
\t\t\t\treturn new WP_Error(
\t\t\t\t\t'unreadable_rest_schema',
\t\t\t\t\t'Generated REST schema is not readable.',
\t\t\t\t\tarray(
\t\t\t\t\t\t'path'   => $schema_path,
\t\t\t\t\t\t'status' => 500,
\t\t\t\t\t)
\t\t\t\t);
\t\t\t}

\t\t\t$schema_json = file_get_contents( $schema_path );
\t\t\tif ( false === $schema_json ) {
\t\t\t\treturn new WP_Error(
\t\t\t\t\t'rest_schema_read_failed',
\t\t\t\t\t'Generated REST schema could not be read.',
\t\t\t\t\tarray(
\t\t\t\t\t\t'path'   => $schema_path,
\t\t\t\t\t\t'status' => 500,
\t\t\t\t\t)
\t\t\t\t);
\t\t\t}

\t\t\t$decoded = json_decode( $schema_json, true );
\t\t\tif ( ! is_array( $decoded ) ) {
\t\t\t\treturn new WP_Error(
\t\t\t\t\t'malformed_rest_schema',
\t\t\t\t\t'Generated REST schema contains malformed JSON.',
\t\t\t\t\tarray(
\t\t\t\t\t\t'json_error' => json_last_error_msg(),
\t\t\t\t\t\t'path'       => $schema_path,
\t\t\t\t\t\t'status'     => 500,
\t\t\t\t\t)
\t\t\t\t);
\t\t\t}

\t\t\treturn $decoded;
\t\t}

\t\treturn new WP_Error(
\t\t\t'missing_rest_schema',
\t\t\t'Generated REST schema could not be found.',
\t\t\tarray(
\t\t\t\t'paths'  => $schema_paths,
\t\t\t\t'schema' => $schema_name,
\t\t\t\t'status' => 500,
\t\t\t)
\t\t);
\t}
}

if ( ! function_exists( '${phpPrefix}_prepare_rest_schema_for_wordpress' ) ) {
\tfunction ${phpPrefix}_prepare_rest_schema_for_wordpress( $schema ) {
\t\tif ( ! is_array( $schema ) ) {
\t\t\treturn $schema;
\t\t}

\t\tunset( $schema['$schema'], $schema['title'] );

\t\tforeach ( array( 'properties', 'patternProperties', 'definitions', '$defs' ) as $schema_map_key ) {
\t\t\tif ( ! isset( $schema[ $schema_map_key ] ) || ! is_array( $schema[ $schema_map_key ] ) ) {
\t\t\t\tcontinue;
\t\t\t}

\t\t\tforeach ( $schema[ $schema_map_key ] as $key => $property_schema ) {
\t\t\t\t$schema[ $schema_map_key ][ $key ] = ${phpPrefix}_prepare_rest_schema_for_wordpress( $property_schema );
\t\t\t}
\t\t}

\t\tforeach ( array( 'items', 'additionalProperties', 'contains', 'propertyNames', 'not', 'if', 'then', 'else' ) as $nested_schema_key ) {
\t\t\tif ( isset( $schema[ $nested_schema_key ] ) && is_array( $schema[ $nested_schema_key ] ) ) {
\t\t\t\t$schema[ $nested_schema_key ] = ${phpPrefix}_prepare_rest_schema_for_wordpress( $schema[ $nested_schema_key ] );
\t\t\t}
\t\t}

\t\tforeach ( array( 'allOf', 'anyOf', 'oneOf' ) as $schema_list_key ) {
\t\t\tif ( ! isset( $schema[ $schema_list_key ] ) || ! is_array( $schema[ $schema_list_key ] ) ) {
\t\t\t\tcontinue;
\t\t\t}

\t\t\tforeach ( $schema[ $schema_list_key ] as $index => $variant_schema ) {
\t\t\t\t$schema[ $schema_list_key ][ $index ] = ${phpPrefix}_prepare_rest_schema_for_wordpress( $variant_schema );
\t\t\t}
\t\t}

\t\treturn $schema;
\t}
}

if ( ! function_exists( '${phpPrefix}_get_wordpress_rest_schema' ) ) {
\tfunction ${phpPrefix}_get_wordpress_rest_schema( $schema_name, $options = array() ) {
\t\t$schema = ${phpPrefix}_load_rest_schema( $schema_name, $options );
\t\tif ( is_wp_error( $schema ) ) {
\t\t\treturn $schema;
\t\t}

\t\treturn ${phpPrefix}_prepare_rest_schema_for_wordpress( $schema );
\t}
}

if ( ! function_exists( '${phpPrefix}_validate_and_sanitize_rest_payload' ) ) {
\tfunction ${phpPrefix}_validate_and_sanitize_rest_payload( $value, $schema_name, $param_name, $options = array() ) {
\t\t$rest_schema = ${phpPrefix}_get_wordpress_rest_schema( $schema_name, $options );
\t\tif ( is_wp_error( $rest_schema ) ) {
\t\t\treturn $rest_schema;
\t\t}

\t\t$validation = rest_validate_value_from_schema( $value, $rest_schema, $param_name );
\t\tif ( is_wp_error( $validation ) ) {
\t\t\treturn $validation;
\t\t}

\t\treturn rest_sanitize_value_from_schema( $value, $rest_schema, $param_name );
\t}
}
`;
}
