<?php
/**
 * Plugin Name:       Compound Patterns
 * Description:       A parent-and-child WordPress block scaffold with InnerBlocks, optional persistence wiring, and hidden implementation child blocks
 * Version:           0.1.0
 * Requires at least: 6.7
 * Tested up to:      6.9
 * Requires PHP:      8.0
 * Author:            imjlk
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       compound_patterns
 * Domain Path:       /languages
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function compound_patterns_load_textdomain() {
	load_plugin_textdomain(
		'compound_patterns',
		false,
		dirname( plugin_basename( __FILE__ ) ) . '/languages'
	);
}

function compound_patterns_get_build_root() {
	return __DIR__ . '/build/blocks';
}

function compound_patterns_register_blocks() {
	$build_root = compound_patterns_get_build_root();
	if ( ! is_dir( $build_root ) ) {
		return;
	}

	$parent_block_dir = $build_root . '/compound-patterns';
	$child_block_dir  = $build_root . '/compound-patterns-item';

	if ( file_exists( $parent_block_dir . '/block.json' ) ) {
		register_block_type( $parent_block_dir );
	}
	if ( file_exists( $child_block_dir . '/block.json' ) ) {
		register_block_type( $child_block_dir );
	}
}

add_action( 'init', 'compound_patterns_load_textdomain' );
add_action( 'init', 'compound_patterns_register_blocks' );
