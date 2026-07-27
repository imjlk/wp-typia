/**
 * WordPress-script import path for actual DataViews/DataForm components.
 */
export const DATAVIEWS_WORDPRESS_COMPONENT_IMPORT = '@wordpress/dataviews/wp';

/**
 * Stylesheet dependency that WordPress plugins should preserve for DataViews UI.
 */
export const DATAVIEWS_WORDPRESS_STYLE_DEPENDENCIES = [
  'wp-components',
] as const;

/**
 * CSS imports needed when the upstream package is rendered outside WordPress.
 */
export const DATAVIEWS_STANDALONE_STYLE_IMPORTS = [
  '@wordpress/theme/design-tokens.css',
  '@wordpress/components/build-style/style.css',
  '@wordpress/dataviews/build-style/style.css',
] as const;
