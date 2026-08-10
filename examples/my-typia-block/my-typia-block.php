<?php
/**
 * Plugin Name:       My Typia Block
 * Description:       Kitchen-sink showcase block for wp-typia.
 * Version:           0.1.0
 * Requires at least: 6.7
 * Tested up to:      6.9
 * Requires PHP:      8.0
 * Author:            imjlk
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       my-typia-block
 * Domain Path:       /languages
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function my_typia_block_load_textdomain() {
	load_plugin_textdomain(
		'my-typia-block',
		false,
		dirname( plugin_basename( __FILE__ ) ) . '/languages'
	);
}

/**
 * Resolve the built block directory across current and legacy build layouts.
 */
function my_typia_block_get_build_dir() {
	$candidates = array(
		__DIR__ . '/build',
		__DIR__ . '/build/my-typia-block',
	);

	foreach ( $candidates as $candidate ) {
		if ( file_exists( $candidate . '/block.json' ) ) {
			return $candidate;
		}
	}

	return null;
}

/**
 * Returns the generated Typia validator when available.
 */
function my_typia_block_get_typia_validator() {
	$build_dir = my_typia_block_get_build_dir();

	if ( ! $build_dir ) {
		return null;
	}

	if ( __DIR__ . '/build' === $build_dir ) {
		if ( ! file_exists( __DIR__ . '/build/typia-validator.php' ) ) {
			return null;
		}
		$validator = require __DIR__ . '/build/typia-validator.php';
	} elseif ( __DIR__ . '/build/my-typia-block' === $build_dir ) {
		if ( ! file_exists( __DIR__ . '/build/my-typia-block/typia-validator.php' ) ) {
			return null;
		}
		$validator = require __DIR__ . '/build/my-typia-block/typia-validator.php';
	} else {
		return null;
	}

	return is_object( $validator ) ? $validator : null;
}

function my_typia_block_get_counter_table_name() {
	global $wpdb;
	return $wpdb->prefix . 'my_typia_block_counters';
}

function my_typia_block_install_counter_table() {
	global $wpdb;

	require_once ABSPATH . 'wp-admin/includes/upgrade.php';

	$table_name      = my_typia_block_get_counter_table_name();
	$charset_collate = $wpdb->get_charset_collate();
	$sql             = "CREATE TABLE {$table_name} (
		post_id bigint(20) unsigned NOT NULL,
		resource_key varchar(100) NOT NULL,
		count bigint(20) unsigned NOT NULL DEFAULT 0,
		updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY  (post_id, resource_key)
	) {$charset_collate};";

	dbDelta( $sql );
	$table_exists = $wpdb->get_var(
		$wpdb->prepare(
			'SHOW TABLES LIKE %s',
			$table_name
		)
	);

	if ( $table_name === $table_exists ) {
		update_option( 'my_typia_block_counter_table_version', '1.0.0' );
	}
}

function my_typia_block_ensure_counter_table() {
	if ( '1.0.0' !== get_option( 'my_typia_block_counter_table_version', '' ) ) {
		my_typia_block_install_counter_table();
	}
}

function my_typia_block_load_schema( $schema_name ) {
	$build_dir = my_typia_block_get_build_dir();
	if ( ! $build_dir ) {
		return null;
	}

	$path = $build_dir . '/api-schemas/' . $schema_name . '.schema.json';
	if ( ! file_exists( $path ) ) {
		return null;
	}

	$decoded = json_decode( file_get_contents( $path ), true );
	return is_array( $decoded ) ? $decoded : null;
}

function my_typia_block_sanitize_rest_schema( $schema ) {
	if ( ! is_array( $schema ) ) {
		return $schema;
	}

	unset( $schema['$schema'], $schema['title'] );

	if ( isset( $schema['properties'] ) && is_array( $schema['properties'] ) ) {
		foreach ( $schema['properties'] as $key => $property_schema ) {
			$schema['properties'][ $key ] = my_typia_block_sanitize_rest_schema( $property_schema );
		}
	}

	if ( isset( $schema['items'] ) && is_array( $schema['items'] ) ) {
		$schema['items'] = my_typia_block_sanitize_rest_schema( $schema['items'] );
	}

	return $schema;
}

function my_typia_block_validate_request_payload( $value, $schema_name, $param_name ) {
	$schema = my_typia_block_load_schema( $schema_name );
	if ( ! is_array( $schema ) ) {
		return new WP_Error( 'missing_schema', 'Missing REST schema.', array( 'status' => 500 ) );
	}

	$rest_schema = my_typia_block_sanitize_rest_schema( $schema );
	$validation  = rest_validate_value_from_schema( $value, $rest_schema, $param_name );
	if ( is_wp_error( $validation ) ) {
		return $validation;
	}

	return rest_sanitize_value_from_schema( $value, $rest_schema, $param_name );
}

function my_typia_block_get_counter( $post_id, $resource_key ) {
	global $wpdb;

	$table_name = my_typia_block_get_counter_table_name();
	$count      = $wpdb->get_var(
		$wpdb->prepare(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from an internal helper.
			"SELECT count FROM {$table_name} WHERE post_id = %d AND resource_key = %s",
			$post_id,
			$resource_key
		)
	);

	return null === $count ? 0 : (int) $count;
}

function my_typia_block_increment_counter( $post_id, $resource_key, $delta ) {
	global $wpdb;

	$table_name   = my_typia_block_get_counter_table_name();
	$delta_value  = (int) $delta;
	$insert_count = max( 0, $delta_value );
	$result       = $wpdb->query(
		$wpdb->prepare(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from an internal helper.
			"INSERT INTO {$table_name} (post_id, resource_key, count, updated_at)
			VALUES (%d, %s, %d, %s)
			ON DUPLICATE KEY UPDATE
				count = GREATEST(0, count + VALUES(count)),
				updated_at = VALUES(updated_at)",
			$post_id,
			$resource_key,
			$insert_count,
			current_time( 'mysql', true )
		)
	);

	if ( false === $result ) {
		return new WP_Error( 'counter_update_failed', 'Failed to update the counter.', array( 'status' => 500 ) );
	}

	return my_typia_block_get_counter( $post_id, $resource_key );
}

function my_typia_block_build_counter_response( $post_id, $resource_key, $count ) {
	return array(
		'postId'      => (int) $post_id,
		'resourceKey' => (string) $resource_key,
		'count'       => (int) $count,
		'storage'     => 'custom-table',
	);
}

function my_typia_block_handle_get_counter( WP_REST_Request $request ) {
	$payload = my_typia_block_validate_request_payload(
		array(
			'postId'      => $request->get_param( 'postId' ),
			'resourceKey' => $request->get_param( 'resourceKey' ),
		),
		'counter-query',
		'query'
	);

	if ( is_wp_error( $payload ) ) {
		return $payload;
	}

	$count = my_typia_block_get_counter( (int) $payload['postId'], (string) $payload['resourceKey'] );
	return rest_ensure_response(
		my_typia_block_build_counter_response(
			(int) $payload['postId'],
			(string) $payload['resourceKey'],
			$count
		)
	);
}

function my_typia_block_handle_increment_counter( WP_REST_Request $request ) {
	$payload = my_typia_block_validate_request_payload(
		$request->get_json_params(),
		'increment-request',
		'body'
	);

	if ( is_wp_error( $payload ) ) {
		return $payload;
	}

	$count = my_typia_block_increment_counter(
		(int) $payload['postId'],
		(string) $payload['resourceKey'],
		isset( $payload['delta'] ) ? (int) $payload['delta'] : 1
	);

	if ( is_wp_error( $count ) ) {
		return $count;
	}

	return rest_ensure_response(
		my_typia_block_build_counter_response(
			(int) $payload['postId'],
			(string) $payload['resourceKey'],
			$count
		)
	);
}

function my_typia_block_register_routes() {
	register_rest_route(
		'my-typia-block/v1',
		'/counter',
		array(
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'my_typia_block_handle_get_counter',
				'permission_callback' => '__return_true',
			),
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => 'my_typia_block_handle_increment_counter',
				'permission_callback' => '__return_true',
			),
		)
	);
}

/**
 * Register the showcase block from the generated build directory.
 */
function my_typia_block_register_block() {
	$build_dir = my_typia_block_get_build_dir();

	if ( ! $build_dir ) {
		return;
	}

	register_block_type( $build_dir );
}
add_action( 'init', 'my_typia_block_load_textdomain' );
add_action( 'init', 'my_typia_block_register_block' );
add_action( 'init', 'my_typia_block_ensure_counter_table' );
add_action( 'rest_api_init', 'my_typia_block_register_routes' );
register_activation_hook( __FILE__, 'my_typia_block_install_counter_table' );
