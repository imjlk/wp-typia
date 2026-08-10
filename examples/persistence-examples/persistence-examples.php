<?php
/**
 * Plugin Name:       Persistence Examples
 * Description:       Policy-aware persistence example blocks for wp-typia.
 * Version:           0.1.0
 * Requires at least: 6.7
 * Tested up to:      6.9
 * Requires PHP:      8.0
 * Author:            imjlk
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       persistence-examples
 * Domain Path:       /languages
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function persistence_examples_load_textdomain() {
	load_plugin_textdomain(
		'persistence-examples',
		false,
		dirname( plugin_basename( __FILE__ ) ) . '/languages'
	);
}

define( 'PERSISTENCE_EXAMPLES_PUBLIC_WRITE_TTL', 5 );
define( 'PERSISTENCE_EXAMPLES_PUBLIC_WRITE_RATE_LIMIT_WINDOW', MINUTE_IN_SECONDS );
define( 'PERSISTENCE_EXAMPLES_PUBLIC_WRITE_RATE_LIMIT_MAX', 10 );

require_once __DIR__ . '/inc/wordpress-ai.php';

function persistence_examples_get_build_root() {
	return __DIR__ . '/build/blocks';
}

function persistence_examples_get_block_build_dir( $block_slug ) {
	$candidate = trailingslashit( persistence_examples_get_build_root() ) . $block_slug;

	return file_exists( $candidate . '/block.json' ) ? $candidate : null;
}

function persistence_examples_register_blocks() {
	$build_root = persistence_examples_get_build_root();
	if ( ! is_dir( $build_root ) ) {
		return;
	}

	$counter_block_dir     = $build_root . '/counter';
	$like_button_block_dir = $build_root . '/like-button';

	if ( file_exists( $counter_block_dir . '/block.json' ) ) {
		register_block_type( $counter_block_dir );
	}
	if ( file_exists( $like_button_block_dir . '/block.json' ) ) {
		register_block_type( $like_button_block_dir );
	}
}

function persistence_examples_load_schema( $block_slug, $schema_name ) {
	$build_dir = persistence_examples_get_block_build_dir( $block_slug );
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

function persistence_examples_sanitize_rest_schema( $schema ) {
	if ( ! is_array( $schema ) ) {
		return $schema;
	}

	unset( $schema['$schema'], $schema['title'] );

	if ( isset( $schema['properties'] ) && is_array( $schema['properties'] ) ) {
		foreach ( $schema['properties'] as $key => $property_schema ) {
			$schema['properties'][ $key ] = persistence_examples_sanitize_rest_schema( $property_schema );
		}
	}

	if ( isset( $schema['items'] ) && is_array( $schema['items'] ) ) {
		$schema['items'] = persistence_examples_sanitize_rest_schema( $schema['items'] );
	}

	return $schema;
}

function persistence_examples_validate_and_sanitize_request( $block_slug, $value, $schema_name, $param_name ) {
	$schema = persistence_examples_load_schema( $block_slug, $schema_name );
	if ( ! is_array( $schema ) ) {
		return new WP_Error( 'missing_schema', 'Missing REST schema.', array( 'status' => 500 ) );
	}

	$rest_schema = persistence_examples_sanitize_rest_schema( $schema );
	$validation  = rest_validate_value_from_schema( $value, $rest_schema, $param_name );
	if ( is_wp_error( $validation ) ) {
		return $validation;
	}

	return rest_sanitize_value_from_schema( $value, $rest_schema, $param_name );
}

function persistence_examples_get_counter_table_name() {
	global $wpdb;
	return $wpdb->prefix . 'persistence_examples_counters';
}

function persistence_examples_get_like_table_name() {
	global $wpdb;
	return $wpdb->prefix . 'persistence_examples_likes';
}

function persistence_examples_with_lock( $lock_name, $callback ) {
	global $wpdb;

	$lock_name = 'pex_lock_' . md5( (string) $lock_name );
	$acquired = (int) $wpdb->get_var(
		$wpdb->prepare(
			'SELECT GET_LOCK(%s, 5)',
			$lock_name
		)
	);

	if ( 1 !== $acquired ) {
		return new WP_Error( 'persistence_lock_timeout', 'Could not acquire the persistence lock.', array( 'status' => 503 ) );
	}

	try {
		return $callback();
	} finally {
		$wpdb->get_var(
			$wpdb->prepare(
				'SELECT RELEASE_LOCK(%s)',
				$lock_name
			)
		);
	}
}

function persistence_examples_install_storage() {
	global $wpdb;

	require_once ABSPATH . 'wp-admin/includes/upgrade.php';

	$charset_collate = $wpdb->get_charset_collate();
	$counter_table   = persistence_examples_get_counter_table_name();
	$like_table      = persistence_examples_get_like_table_name();

	dbDelta(
		"CREATE TABLE {$counter_table} (
			post_id bigint(20) unsigned NOT NULL,
			resource_key varchar(100) NOT NULL,
			count bigint(20) unsigned NOT NULL DEFAULT 0,
			updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (post_id, resource_key)
		) {$charset_collate};"
	);

	dbDelta(
		"CREATE TABLE {$like_table} (
			post_id bigint(20) unsigned NOT NULL,
			resource_key varchar(100) NOT NULL,
			user_id bigint(20) unsigned NOT NULL,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (post_id, resource_key, user_id)
		) {$charset_collate};"
	);

	$counter_exists = $wpdb->get_var(
		$wpdb->prepare(
			'SHOW TABLES LIKE %s',
			$counter_table
		)
	);
	$like_exists    = $wpdb->get_var(
		$wpdb->prepare(
			'SHOW TABLES LIKE %s',
			$like_table
		)
	);

	if ( $counter_table === $counter_exists && $like_table === $like_exists ) {
		update_option( 'persistence_examples_storage_version', '1.0.0' );
	}
}

function persistence_examples_ensure_storage() {
	if ( '1.0.0' !== get_option( 'persistence_examples_storage_version', '' ) ) {
		persistence_examples_install_storage();
	}
}

function persistence_examples_get_counter( $post_id, $resource_key ) {
	global $wpdb;

	$table_name = persistence_examples_get_counter_table_name();
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

function persistence_examples_increment_counter( $post_id, $resource_key, $delta ) {
	global $wpdb;

	$table_name   = persistence_examples_get_counter_table_name();
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

	return persistence_examples_get_counter( $post_id, $resource_key );
}

function persistence_examples_base64url_encode( $value ) {
	return rtrim( strtr( base64_encode( $value ), '+/', '-_' ), '=' );
}

function persistence_examples_base64url_decode( $value ) {
	if ( ! is_string( $value ) || '' === $value ) {
		return false;
	}

	$padding = strlen( $value ) % 4;
	if ( $padding > 0 ) {
		$value .= str_repeat( '=', 4 - $padding );
	}

	return base64_decode( strtr( $value, '-_', '+/' ), true );
}

function persistence_examples_get_counter_public_write_action() {
	return 'persistence-examples/counter/increment';
}

function persistence_examples_get_public_write_client_subject() {
	$remote_addr = isset( $_SERVER['REMOTE_ADDR'] ) && is_string( $_SERVER['REMOTE_ADDR'] )
		? wp_unslash( $_SERVER['REMOTE_ADDR'] )
		: '';
	$user_agent  = isset( $_SERVER['HTTP_USER_AGENT'] ) && is_string( $_SERVER['HTTP_USER_AGENT'] )
		? wp_unslash( $_SERVER['HTTP_USER_AGENT'] )
		: '';

	return md5( $remote_addr . '|' . $user_agent );
}

function persistence_examples_get_counter_rate_limit_key( $post_id, $resource_key ) {
	return 'persistence_examples_counter_rl_' . (int) $post_id . '_' . md5(
		(string) $resource_key . '|' . persistence_examples_get_public_write_client_subject()
	);
}

function persistence_examples_enforce_counter_rate_limit( $post_id, $resource_key ) {
	return persistence_examples_with_lock(
		persistence_examples_get_counter_rate_limit_key( $post_id, $resource_key ),
		function () use ( $post_id, $resource_key ) {
			$key   = persistence_examples_get_counter_rate_limit_key( $post_id, $resource_key );
			$count = (int) get_transient( $key );

			if ( $count >= (int) PERSISTENCE_EXAMPLES_PUBLIC_WRITE_RATE_LIMIT_MAX ) {
				return new WP_Error(
					'rest_rate_limited',
					'Too many public write attempts. Wait a minute and try again.',
					array( 'status' => 429 )
				);
			}

			set_transient(
				$key,
				$count + 1,
				(int) PERSISTENCE_EXAMPLES_PUBLIC_WRITE_RATE_LIMIT_WINDOW
			);

			return true;
		}
	);
}

function persistence_examples_get_counter_replay_key( $post_id, $resource_key, $request_id ) {
	return 'persistence_examples_counter_req_' . (int) $post_id . '_' . md5(
		(string) $resource_key . '|' . (string) $request_id
	);
}

function persistence_examples_consume_counter_request_id( $post_id, $resource_key, $request_id ) {
	if ( ! is_string( $request_id ) || '' === $request_id ) {
		return new WP_Error(
			'rest_forbidden',
			'The public write request id is missing.',
			array( 'status' => 403 )
		);
	}

	return persistence_examples_with_lock(
		persistence_examples_get_counter_replay_key( $post_id, $resource_key, $request_id ),
		function () use ( $post_id, $resource_key, $request_id ) {
			$key = persistence_examples_get_counter_replay_key( $post_id, $resource_key, $request_id );
			if ( false !== get_transient( $key ) ) {
				return new WP_Error(
					'rest_conflict',
					'This public write request was already processed.',
					array( 'status' => 409 )
				);
			}

			set_transient( $key, 1, (int) PERSISTENCE_EXAMPLES_PUBLIC_WRITE_TTL );

			return true;
		}
	);
}

function persistence_examples_release_counter_request_id( $post_id, $resource_key, $request_id ) {
	if ( ! is_string( $request_id ) || '' === $request_id ) {
		return;
	}

	delete_transient( persistence_examples_get_counter_replay_key( $post_id, $resource_key, $request_id ) );
}

function persistence_examples_create_counter_public_write_token( $post_id, $resource_key ) {
	$expires_at = time() + (int) PERSISTENCE_EXAMPLES_PUBLIC_WRITE_TTL;
	$payload    = array(
		'action'      => persistence_examples_get_counter_public_write_action(),
		'exp'         => $expires_at,
		'postId'      => (int) $post_id,
		'resourceKey' => (string) $resource_key,
	);
	$json       = wp_json_encode( $payload );

	if ( ! is_string( $json ) || '' === $json ) {
		return array(
			'expiresAt' => $expires_at,
			'token'     => '',
		);
	}

	$payload_segment   = persistence_examples_base64url_encode( $json );
	$signature_segment = persistence_examples_base64url_encode(
		hash_hmac( 'sha256', $payload_segment, wp_salt( 'nonce' ), true )
	);

	return array(
		'expiresAt' => $expires_at,
		'token'     => $payload_segment . '.' . $signature_segment,
	);
}

function persistence_examples_verify_counter_public_write_token( $token, $post_id, $resource_key ) {
	if ( ! is_string( $token ) || '' === $token ) {
		return new WP_Error(
			'rest_forbidden',
			'The public write token is missing.',
			array( 'status' => 403 )
		);
	}

	$segments = explode( '.', $token );
	if ( 2 !== count( $segments ) ) {
		return new WP_Error(
			'rest_forbidden',
			'The public write token format is invalid.',
			array( 'status' => 403 )
		);
	}

	list( $payload_segment, $signature_segment ) = $segments;
	$expected_signature = persistence_examples_base64url_encode(
		hash_hmac( 'sha256', $payload_segment, wp_salt( 'nonce' ), true )
	);

	if ( ! hash_equals( $expected_signature, $signature_segment ) ) {
		return new WP_Error(
			'rest_forbidden',
			'The public write token signature is invalid.',
			array( 'status' => 403 )
		);
	}

	$payload_json = persistence_examples_base64url_decode( $payload_segment );
	if ( false === $payload_json ) {
		return new WP_Error(
			'rest_forbidden',
			'The public write token payload is invalid.',
			array( 'status' => 403 )
		);
	}

	$payload = json_decode( $payload_json, true );
	if ( ! is_array( $payload ) ) {
		return new WP_Error(
			'rest_forbidden',
			'The public write token payload is invalid.',
			array( 'status' => 403 )
		);
	}

	$expires_at = isset( $payload['exp'] ) ? (int) $payload['exp'] : 0;
	if ( $expires_at < time() ) {
		return new WP_Error(
			'rest_forbidden',
			'The public write token has expired. Refresh write access and try again.',
			array( 'status' => 403 )
		);
	}

	if ( persistence_examples_get_counter_public_write_action() !== ( isset( $payload['action'] ) ? (string) $payload['action'] : '' ) ) {
		return new WP_Error(
			'rest_forbidden',
			'The public write token action is invalid.',
			array( 'status' => 403 )
		);
	}

	if ( (int) ( isset( $payload['postId'] ) ? $payload['postId'] : 0 ) !== (int) $post_id ) {
		return new WP_Error(
			'rest_forbidden',
			'The public write token is not valid for this post.',
			array( 'status' => 403 )
		);
	}

	if ( (string) ( isset( $payload['resourceKey'] ) ? $payload['resourceKey'] : '' ) !== (string) $resource_key ) {
		return new WP_Error(
			'rest_forbidden',
			'The public write token is not valid for this resource key.',
			array( 'status' => 403 )
		);
	}

	return true;
}

function persistence_examples_can_write_counter( WP_REST_Request $request ) {
	$payload = $request->get_json_params();
	if ( ! is_array( $payload ) ) {
		$payload = array();
	}

	$post_id      = isset( $payload['postId'] ) ? (int) $payload['postId'] : 0;
	$resource_key = isset( $payload['resourceKey'] ) ? (string) $payload['resourceKey'] : '';
	$request_id   = isset( $payload['publicWriteRequestId'] ) ? (string) $payload['publicWriteRequestId'] : '';
	$token        = isset( $payload['publicWriteToken'] ) ? (string) $payload['publicWriteToken'] : '';

	if ( '' === $token ) {
		$fallback = $request->get_param( 'publicWriteToken' );
		$token    = is_string( $fallback ) ? $fallback : '';
	}

	if ( '' === $request_id ) {
		$fallback   = $request->get_param( 'publicWriteRequestId' );
		$request_id = is_string( $fallback ) ? $fallback : '';
	}

	return persistence_examples_authorize_counter_write_payload(
		array(
			'postId'               => $post_id,
			'publicWriteRequestId' => $request_id,
			'publicWriteToken'     => $token,
			'resourceKey'          => $resource_key,
		)
	);
}

function persistence_examples_build_counter_response( $post_id, $resource_key, $count ) {
	return array(
		'postId'      => (int) $post_id,
		'resourceKey' => (string) $resource_key,
		'count'       => (int) $count,
		'storage'     => 'custom-table',
	);
}

function persistence_examples_block_tree_has_resource_key( $blocks, $block_name, $resource_key ) {
	if ( ! is_array( $blocks ) ) {
		return false;
	}

	foreach ( $blocks as $block ) {
		if ( ! is_array( $block ) ) {
			continue;
		}

		if ( (string) ( $block['blockName'] ?? '' ) === $block_name ) {
			$attributes = isset( $block['attrs'] ) && is_array( $block['attrs'] ) ? $block['attrs'] : array();
			$candidate_resource_key = array_key_exists( 'resourceKey', $attributes )
				? (string) $attributes['resourceKey']
				: 'primary';
			if ( (string) $resource_key === $candidate_resource_key ) {
				return true;
			}
		}

		if (
			isset( $block['innerBlocks'] ) &&
			persistence_examples_block_tree_has_resource_key( $block['innerBlocks'], $block_name, $resource_key )
		) {
			return true;
		}
	}

	return false;
}

function persistence_examples_get_rendered_block_instance_key( $post_id, $block_name, $resource_key ) {
	return 'wpt_pri_' . md5( implode( '|', array( (string) $block_name, (int) $post_id, (string) $resource_key ) ) );
}

function persistence_examples_record_rendered_block_instance( $post_id, $block_name, $resource_key ) {
	if ( $post_id <= 0 || '' === (string) $resource_key || '' === (string) $block_name ) {
		return;
	}

	set_transient(
		persistence_examples_get_rendered_block_instance_key( $post_id, $block_name, $resource_key ),
		1,
		5 * MINUTE_IN_SECONDS
	);
}

function persistence_examples_has_rendered_block_instance( $post_id, $block_name, $resource_key ) {
	if ( $post_id <= 0 || '' === (string) $resource_key ) {
		return false;
	}

	if (
		false !== get_transient(
			persistence_examples_get_rendered_block_instance_key( $post_id, $block_name, $resource_key )
		)
	) {
		return true;
	}

	$post = get_post( $post_id );
	if ( ! ( $post instanceof WP_Post ) ) {
		return false;
	}

	return persistence_examples_block_tree_has_resource_key(
		parse_blocks( (string) $post->post_content ),
		(string) $block_name,
		(string) $resource_key
	);
}

function persistence_examples_build_counter_bootstrap_response( $post_id, $resource_key ) {
	$response = array(
		'canWrite' => false,
	);

	$post = get_post( $post_id );
	if (
		$post_id <= 0 ||
		! ( $post instanceof WP_Post ) ||
		! is_post_publicly_viewable( $post ) ||
		! persistence_examples_has_rendered_block_instance(
			(int) $post_id,
			'create-block/persistence-counter',
			(string) $resource_key
		)
	) {
		return $response;
	}

	$public_write = persistence_examples_create_counter_public_write_token(
		(int) $post_id,
		(string) $resource_key
	);

	if ( ! is_array( $public_write ) ) {
		return $response;
	}

	$token      = isset( $public_write['token'] ) ? (string) $public_write['token'] : '';
	$expires_at = isset( $public_write['expiresAt'] ) ? (int) $public_write['expiresAt'] : 0;

	if ( '' !== $token && $expires_at > 0 && $expires_at > time() ) {
		$response['publicWriteToken'] = $token;
		$response['canWrite']         = true;
	}

	if ( $expires_at > 0 ) {
		$response['publicWriteExpiresAt'] = $expires_at;
		if ( $expires_at <= time() ) {
			$response['canWrite'] = false;
		}
	}

	return $response;
}

function persistence_examples_handle_get_counter( WP_REST_Request $request ) {
	$payload = persistence_examples_validate_and_sanitize_request(
		'counter',
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

	return rest_ensure_response(
		persistence_examples_build_counter_response(
			(int) $payload['postId'],
			(string) $payload['resourceKey'],
			persistence_examples_get_counter(
				(int) $payload['postId'],
				(string) $payload['resourceKey']
			)
		)
	);
}

function persistence_examples_handle_get_counter_bootstrap( WP_REST_Request $request ) {
	$payload = persistence_examples_validate_and_sanitize_request(
		'counter',
		array(
			'postId'      => $request->get_param( 'postId' ),
			'resourceKey' => $request->get_param( 'resourceKey' ),
		),
		'counter-bootstrap-query',
		'query'
	);

	if ( is_wp_error( $payload ) ) {
		return $payload;
	}

	$response = rest_ensure_response(
		persistence_examples_build_counter_bootstrap_response(
			(int) $payload['postId'],
			(string) $payload['resourceKey']
		)
	);

	$response->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, s-maxage=0' );
	$response->header( 'Pragma', 'no-cache' );
	return $response;
}

function persistence_examples_handle_increment_counter( WP_REST_Request $request ) {
	$payload = persistence_examples_validate_and_sanitize_request(
		'counter',
		$request->get_json_params(),
		'increment-request',
		'body'
	);

	if ( is_wp_error( $payload ) ) {
		return $payload;
	}

	$request_consumed = persistence_examples_consume_counter_request_id(
		(int) $payload['postId'],
		(string) $payload['resourceKey'],
		isset( $payload['publicWriteRequestId'] ) ? (string) $payload['publicWriteRequestId'] : ''
	);

	if ( is_wp_error( $request_consumed ) ) {
		return $request_consumed;
	}

	$count = persistence_examples_increment_counter(
		(int) $payload['postId'],
		(string) $payload['resourceKey'],
		isset( $payload['delta'] ) ? (int) $payload['delta'] : 1
	);

	if ( is_wp_error( $count ) ) {
		persistence_examples_release_counter_request_id(
			(int) $payload['postId'],
			(string) $payload['resourceKey'],
			isset( $payload['publicWriteRequestId'] ) ? (string) $payload['publicWriteRequestId'] : ''
		);
		return $count;
	}

	return rest_ensure_response(
		persistence_examples_build_counter_response(
			(int) $payload['postId'],
			(string) $payload['resourceKey'],
			$count
		)
	);
}

function persistence_examples_get_rest_nonce( WP_REST_Request $request ) {
	$header_nonce = $request->get_header( 'X-WP-Nonce' );
	if ( is_string( $header_nonce ) && '' !== $header_nonce ) {
		return $header_nonce;
	}

	$query_nonce = $request->get_param( '_wpnonce' );
	if ( is_string( $query_nonce ) && '' !== $query_nonce ) {
		return $query_nonce;
	}

	return null;
}

function persistence_examples_can_toggle_like( WP_REST_Request $request ) {
	if ( ! is_user_logged_in() ) {
		return new WP_Error(
			'rest_forbidden',
			'Authentication is required to toggle likes.',
			array( 'status' => rest_authorization_required_code() )
		);
	}

	$nonce = persistence_examples_get_rest_nonce( $request );
	if ( ! is_string( $nonce ) || '' === $nonce || ! wp_verify_nonce( $nonce, 'wp_rest' ) ) {
		return new WP_Error(
			'rest_forbidden',
			'The REST nonce is missing or invalid.',
			array( 'status' => 403 )
		);
	}

	return true;
}

function persistence_examples_get_like_count( $post_id, $resource_key ) {
	global $wpdb;

	$table_name = persistence_examples_get_like_table_name();
	$count      = $wpdb->get_var(
		$wpdb->prepare(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from an internal helper.
			"SELECT COUNT(*) FROM {$table_name} WHERE post_id = %d AND resource_key = %s",
			$post_id,
			$resource_key
		)
	);

	return null === $count ? 0 : (int) $count;
}

function persistence_examples_has_like( $post_id, $resource_key, $user_id ) {
	global $wpdb;

	if ( $user_id <= 0 ) {
		return false;
	}

	$table_name = persistence_examples_get_like_table_name();
	$exists     = $wpdb->get_var(
		$wpdb->prepare(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from an internal helper.
			"SELECT 1 FROM {$table_name} WHERE post_id = %d AND resource_key = %s AND user_id = %d LIMIT 1",
			$post_id,
			$resource_key,
			$user_id
		)
	);

	return '1' === (string) $exists;
}

function persistence_examples_toggle_like_for_user( $post_id, $resource_key, $user_id ) {
	global $wpdb;

	$table_name = persistence_examples_get_like_table_name();
	$lock_name  = 'persistence_like_' . (int) $post_id . '_' . md5( (string) $resource_key );

	return persistence_examples_with_lock(
		$lock_name,
		function () use ( $post_id, $resource_key, $table_name, $user_id, $wpdb ) {
			$has_like = persistence_examples_has_like( $post_id, $resource_key, $user_id );

			if ( $has_like ) {
				$deleted = $wpdb->delete(
					$table_name,
					array(
						'post_id'      => (int) $post_id,
						'resource_key' => (string) $resource_key,
						'user_id'      => (int) $user_id,
					),
					array( '%d', '%s', '%d' )
				);

				if ( false === $deleted ) {
					return new WP_Error( 'like_toggle_failed', 'Failed to remove the like.', array( 'status' => 500 ) );
				}

				return false;
			}

			$inserted = $wpdb->insert(
				$table_name,
				array(
					'post_id'      => (int) $post_id,
					'resource_key' => (string) $resource_key,
					'user_id'      => (int) $user_id,
					'created_at'   => current_time( 'mysql', true ),
				),
				array( '%d', '%s', '%d', '%s' )
			);

			if ( false === $inserted ) {
				return new WP_Error( 'like_toggle_failed', 'Failed to add the like.', array( 'status' => 500 ) );
			}

			return true;
		}
	);
}

function persistence_examples_build_like_response( $post_id, $resource_key, $user_id ) {
	return array(
		'postId'              => (int) $post_id,
		'resourceKey'         => (string) $resource_key,
		'count'               => persistence_examples_get_like_count( $post_id, $resource_key ),
		'storage'             => 'custom-table',
	);
}

function persistence_examples_build_like_bootstrap_response( $post_id, $resource_key, $user_id ) {
	$post          = get_post( $post_id );
	$can_read_post =
		$post instanceof WP_Post &&
		(
			is_post_publicly_viewable( $post ) ||
			current_user_can( 'read_post', $post->ID )
		);
	$has_instance = $can_read_post && persistence_examples_has_rendered_block_instance(
		(int) $post_id,
		'create-block/persistence-like-button',
		(string) $resource_key
	);
	$can_write = $post_id > 0 && $user_id > 0 && $can_read_post && $has_instance;
	$response  = array(
		'canWrite'           => $can_write,
		'likedByCurrentUser' => $has_instance && persistence_examples_has_like( $post_id, $resource_key, $user_id ),
	);

	if ( $can_write ) {
		$response['restNonce'] = wp_create_nonce( 'wp_rest' );
	}

	return $response;
}

function persistence_examples_build_toggle_like_response( $post_id, $resource_key, $user_id ) {
	return array(
		'postId'              => (int) $post_id,
		'resourceKey'         => (string) $resource_key,
		'count'               => persistence_examples_get_like_count( $post_id, $resource_key ),
		'likedByCurrentUser'  => persistence_examples_has_like( $post_id, $resource_key, $user_id ),
		'storage'             => 'custom-table',
	);
}

function persistence_examples_handle_get_like_status( WP_REST_Request $request ) {
	$payload = persistence_examples_validate_and_sanitize_request(
		'like-button',
		array(
			'postId'      => $request->get_param( 'postId' ),
			'resourceKey' => $request->get_param( 'resourceKey' ),
		),
		'like-status-query',
		'query'
	);

	if ( is_wp_error( $payload ) ) {
		return $payload;
	}

	$user_id = is_user_logged_in() ? get_current_user_id() : 0;
	return rest_ensure_response(
		persistence_examples_build_like_response(
			(int) $payload['postId'],
			(string) $payload['resourceKey'],
			(int) $user_id
		)
	);
}

function persistence_examples_handle_get_like_bootstrap( WP_REST_Request $request ) {
	$payload = persistence_examples_validate_and_sanitize_request(
		'like-button',
		array(
			'postId'      => $request->get_param( 'postId' ),
			'resourceKey' => $request->get_param( 'resourceKey' ),
		),
		'like-bootstrap-query',
		'query'
	);

	if ( is_wp_error( $payload ) ) {
		return $payload;
	}

	$user_id = is_user_logged_in() ? get_current_user_id() : 0;
	$response = rest_ensure_response(
		persistence_examples_build_like_bootstrap_response(
			(int) $payload['postId'],
			(string) $payload['resourceKey'],
			(int) $user_id
		)
	);

	$response->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, s-maxage=0' );
	$response->header( 'Pragma', 'no-cache' );
	$response->header( 'Vary', 'Cookie' );
	return $response;
}

function persistence_examples_handle_toggle_like( WP_REST_Request $request ) {
	$payload = persistence_examples_validate_and_sanitize_request(
		'like-button',
		$request->get_json_params(),
		'toggle-like-request',
		'body'
	);

	if ( is_wp_error( $payload ) ) {
		return $payload;
	}

	$user_id = get_current_user_id();
	$result  = persistence_examples_toggle_like_for_user(
		(int) $payload['postId'],
		(string) $payload['resourceKey'],
		(int) $user_id
	);

	if ( is_wp_error( $result ) ) {
		return $result;
	}

	return rest_ensure_response(
		persistence_examples_build_toggle_like_response(
			(int) $payload['postId'],
			(string) $payload['resourceKey'],
			(int) $user_id
		)
	);
}

function persistence_examples_register_routes() {
	register_rest_route(
		'persistence-examples/v1',
		'/counter',
		array(
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'persistence_examples_handle_get_counter',
				'permission_callback' => '__return_true',
			),
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => 'persistence_examples_handle_increment_counter',
				'permission_callback' => 'persistence_examples_can_write_counter',
			),
		)
	);

	register_rest_route(
		'persistence-examples/v1',
		'/counter/bootstrap',
		array(
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'persistence_examples_handle_get_counter_bootstrap',
				'permission_callback' => '__return_true',
			),
		)
	);

	register_rest_route(
		'persistence-examples/v1',
		'/likes',
		array(
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'persistence_examples_handle_get_like_status',
				'permission_callback' => '__return_true',
			),
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => 'persistence_examples_handle_toggle_like',
				'permission_callback' => 'persistence_examples_can_toggle_like',
			),
		)
	);

	register_rest_route(
		'persistence-examples/v1',
		'/likes/bootstrap',
		array(
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'persistence_examples_handle_get_like_bootstrap',
				'permission_callback' => '__return_true',
			),
		)
	);
}

register_activation_hook( __FILE__, 'persistence_examples_install_storage' );
add_action( 'init', 'persistence_examples_load_textdomain' );
add_action( 'init', 'persistence_examples_ensure_storage' );
add_action( 'init', 'persistence_examples_register_blocks' );
add_action( 'rest_api_init', 'persistence_examples_register_routes' );
