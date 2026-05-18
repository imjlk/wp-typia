import path from 'node:path';

import { quoteTsString } from './cli-add-shared.js';
import {
  ADMIN_VIEWS_ASSET,
  ADMIN_VIEWS_SCRIPT,
  ADMIN_VIEWS_STYLE,
  ADMIN_VIEWS_STYLE_RTL,
  formatAdminViewSourceLocator,
  type AdminViewSource,
} from './cli-add-workspace-admin-view-types.js';
import { quotePhpString } from '../shared/php-utils.js';
import { toPascalCase, toTitleCase } from '../shared/string-case.js';
import { type WorkspaceProject } from '../workspace/workspace-project.js';

/**
 * Resolves a relative module specifier from an admin-view module to a workspace file.
 *
 * @param adminViewSlug - Admin-view slug that determines the generated source directory.
 * @param workspaceFile - Workspace file path to import from the admin-view module.
 * @returns Relative extensionless module specifier for generated TypeScript imports.
 */
export function getAdminViewRelativeModuleSpecifier(
  adminViewSlug: string,
  workspaceFile: string,
): string {
  const adminViewDir = `src/admin-views/${adminViewSlug}`;
  const normalizedFile = workspaceFile.replace(/\\/gu, '/');
  const modulePath = normalizedFile.replace(/\.[cm]?[jt]sx?$/u, '');
  const relativeModulePath = path.posix.relative(adminViewDir, modulePath);

  return relativeModulePath.startsWith('.')
    ? relativeModulePath
    : `./${relativeModulePath}`;
}

/**
 * Builds one workspace admin-view config entry.
 *
 * @param adminViewSlug - Admin-view slug used for generated file paths.
 * @param source - Optional source metadata stored with the config entry.
 * @returns Generated TypeScript object entry for the admin-view registry.
 */
export function buildAdminViewConfigEntry(
  adminViewSlug: string,
  source: AdminViewSource | undefined,
): string {
  return [
    '\t{',
    `\t\tfile: ${quoteTsString(`src/admin-views/${adminViewSlug}/index.tsx`)},`,
    `\t\tphpFile: ${quoteTsString(`inc/admin-views/${adminViewSlug}.php`)},`,
    `\t\tslug: ${quoteTsString(adminViewSlug)},`,
    source
      ? `\t\tsource: ${quoteTsString(formatAdminViewSourceLocator(source))},`
      : null,
    '\t},',
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n');
}

/**
 * Builds the admin-view registry source that imports generated view entries.
 *
 * @param adminViewSlugs - Ordered admin-view slugs to import into the registry.
 * @returns Generated TypeScript source for the admin-view registry module.
 */
export function buildAdminViewRegistrySource(adminViewSlugs: string[]): string {
  const importLines = adminViewSlugs
    .map((adminViewSlug) => `import './${adminViewSlug}';`)
    .join('\n');

  return `${importLines}${importLines ? '\n\n' : ''}// wp-typia add admin-view entries\n`;
}

/**
 * Builds the generated admin-view browser entrypoint.
 *
 * @param adminViewSlug - Admin-view slug used to derive component and root ids.
 * @param options - Optional entrypoint generation flags.
 * @returns Generated TSX source for mounting the admin-view screen.
 */
export function buildAdminViewEntrySource(
  adminViewSlug: string,
  options: { includeDataViewsStyle?: boolean } = {},
): string {
  const pascalName = toPascalCase(adminViewSlug);
  const componentName = `${pascalName}AdminViewScreen`;
  const rootId = `wp-typia-admin-view-${adminViewSlug}`;
  const dataViewsStyleImport =
    options.includeDataViewsStyle === false
      ? ''
      : "\nimport '@wordpress/dataviews/build-style/style.css';";

  return `import { createRoot } from '@wordpress/element';
${dataViewsStyleImport}
import { ${componentName} } from './Screen';
import './style.scss';

const ROOT_ELEMENT_ID = ${quoteTsString(rootId)};

function mountAdminView() {
\tconst rootElement = document.getElementById(ROOT_ELEMENT_ID);
\tif (!rootElement) {
\t\treturn;
\t}

\tcreateRoot(rootElement).render(<${componentName} />);
}

if (document.readyState === 'loading') {
\tdocument.addEventListener('DOMContentLoaded', mountAdminView);
} else {
\tmountAdminView();
}
`;
}

/**
 * Builds shared SCSS for generated admin-view screens.
 *
 * @returns Generated SCSS source for admin-view layouts and settings forms.
 */
export function buildAdminViewStyleSource(): string {
  return `.wp-typia-admin-view-screen {
\tbox-sizing: border-box;
\tmax-width: 1180px;
\tpadding: 24px 24px 48px 0;
}

.wp-typia-admin-view-screen__header {
\talign-items: flex-start;
\tdisplay: flex;
\tgap: 24px;
\tjustify-content: space-between;
\tmargin-bottom: 24px;
}

.wp-typia-admin-view-screen__header h1 {
\tfont-size: 28px;
\tline-height: 1.2;
\tmargin: 0 0 8px;
}

.wp-typia-admin-view-screen__header p {
\tmax-width: 680px;
}

.wp-typia-admin-view-screen__eyebrow {
\tcolor: #3858e9;
\tfont-size: 11px;
\tfont-weight: 600;
\tletter-spacing: 0.08em;
\tmargin: 0 0 8px;
\ttext-transform: uppercase;
}

.wp-typia-admin-view-screen__actions {
\talign-items: center;
\tdisplay: flex;
\tgap: 12px;
}

.wp-typia-admin-view-screen__settings-form {
\tbackground: #fff;
\tborder: 1px solid #dcdcde;
\tborder-radius: 2px;
\tbox-shadow: 0 1px 1px rgba(0, 0, 0, 0.04);
\tdisplay: grid;
\tgap: 20px;
\tmax-width: 720px;
\tpadding: 24px;
}

.wp-typia-admin-view-screen__field .components-base-control {
\tmargin-bottom: 0;
}
`;
}

/**
 * Builds the PHP registration module for a generated admin-view page.
 *
 * @param adminViewSlug - Admin-view slug used for hooks, handles, and root ids.
 * @param workspace - Workspace metadata used for PHP prefixes and text domains.
 * @returns Generated PHP source for registering and enqueueing the admin view.
 */
export function buildAdminViewPhpSource(
  adminViewSlug: string,
  workspace: WorkspaceProject,
): string {
  const workspaceBaseName =
    workspace.packageName.split('/').pop() ?? workspace.packageName;
  const phpSlug = adminViewSlug.replace(/-/g, '_');
  const functionPrefix = `${workspace.workspace.phpPrefix}_${phpSlug}`;
  const menuSlugFunctionName = `${functionPrefix}_admin_view_menu_slug`;
  const renderFunctionName = `${functionPrefix}_render_admin_view`;
  const registerFunctionName = `${functionPrefix}_register_admin_view`;
  const enqueueFunctionName = `${functionPrefix}_enqueue_admin_view`;
  const hookGlobalName = `${functionPrefix}_admin_view_hook`;
  const rootId = `wp-typia-admin-view-${adminViewSlug}`;
  const title = toTitleCase(adminViewSlug);

  return `<?php
if ( ! defined( 'ABSPATH' ) ) {
\treturn;
}

if ( ! function_exists( '${menuSlugFunctionName}' ) ) {
\tfunction ${menuSlugFunctionName}() : string {
\t\treturn '${workspaceBaseName}-${adminViewSlug}';
\t}
}

if ( ! function_exists( '${renderFunctionName}' ) ) {
\tfunction ${renderFunctionName}() : void {
\t\t?>
\t\t<div class="wrap">
\t\t\t<div id="${rootId}"></div>
\t\t</div>
\t\t<?php
\t}
}

if ( ! function_exists( '${registerFunctionName}' ) ) {
\tfunction ${registerFunctionName}() : void {
\t\t$GLOBALS['${hookGlobalName}'] = add_submenu_page(
\t\t\t'tools.php',
\t\t\t__( ${quotePhpString(title)}, ${quotePhpString(workspace.workspace.textDomain)} ),
\t\t\t__( ${quotePhpString(title)}, ${quotePhpString(workspace.workspace.textDomain)} ),
\t\t\t'edit_posts',
\t\t\t${menuSlugFunctionName}(),
\t\t\t'${renderFunctionName}'
\t\t);
\t}
}

if ( ! function_exists( '${enqueueFunctionName}' ) ) {
\tfunction ${enqueueFunctionName}( string $hook_suffix ) : void {
\t\t$page_hook = isset( $GLOBALS['${hookGlobalName}'] ) && is_string( $GLOBALS['${hookGlobalName}'] )
\t\t\t? $GLOBALS['${hookGlobalName}']
\t\t\t: '';

\t\tif ( $page_hook !== $hook_suffix ) {
\t\t\treturn;
\t\t}

\t\t$plugin_file = dirname( __DIR__, 2 ) . '/${workspaceBaseName}.php';
\t\t$script_path = dirname( __DIR__, 2 ) . '/${ADMIN_VIEWS_SCRIPT}';
\t\t$asset_path  = dirname( __DIR__, 2 ) . '/${ADMIN_VIEWS_ASSET}';
\t\t$style_path  = dirname( __DIR__, 2 ) . '/${ADMIN_VIEWS_STYLE}';
\t\t$style_rtl_path = dirname( __DIR__, 2 ) . '/${ADMIN_VIEWS_STYLE_RTL}';

\t\tif ( ! file_exists( $script_path ) || ! file_exists( $asset_path ) ) {
\t\t\treturn;
\t\t}

\t\t$asset = require $asset_path;
\t\tif ( ! is_array( $asset ) ) {
\t\t\t$asset = array();
\t\t}

\t\t$dependencies = isset( $asset['dependencies'] ) && is_array( $asset['dependencies'] )
\t\t\t? $asset['dependencies']
\t\t\t: array();

\t\twp_enqueue_script(
\t\t\t'${workspaceBaseName}-${adminViewSlug}-admin-view',
\t\t\tplugins_url( '${ADMIN_VIEWS_SCRIPT}', $plugin_file ),
\t\t\t$dependencies,
\t\t\tisset( $asset['version'] ) ? $asset['version'] : filemtime( $script_path ),
\t\t\ttrue
\t\t);

\t\tif ( file_exists( $style_path ) ) {
\t\t\twp_enqueue_style(
\t\t\t\t'${workspaceBaseName}-${adminViewSlug}-admin-view',
\t\t\t\tplugins_url( '${ADMIN_VIEWS_STYLE}', $plugin_file ),
\t\t\t\tarray( 'wp-components' ),
\t\t\t\tisset( $asset['version'] ) ? $asset['version'] : filemtime( $style_path )
\t\t\t);
\t\t\tif ( file_exists( $style_rtl_path ) ) {
\t\t\t\twp_style_add_data( '${workspaceBaseName}-${adminViewSlug}-admin-view', 'rtl', 'replace' );
\t\t\t}
\t\t}
\t}
}

add_action( 'admin_menu', '${registerFunctionName}' );
add_action( 'admin_enqueue_scripts', '${enqueueFunctionName}' );
`;
}
