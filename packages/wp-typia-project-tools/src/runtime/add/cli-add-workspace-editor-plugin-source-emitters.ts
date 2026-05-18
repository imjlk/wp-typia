import { quoteTsString } from "./cli-add-shared.js";
import { toPascalCase, toTitleCase } from "../shared/string-case.js";

/**
 * Render one `scripts/block-config.ts` editor-plugin inventory entry.
 *
 * @param editorPluginSlug Normalized editor-plugin slug.
 * @param slot Canonical editor-plugin slot id.
 * @returns TypeScript source for the inventory entry.
 */
export function buildEditorPluginConfigEntry(
	editorPluginSlug: string,
	slot: string,
): string {
	return [
		"\t{",
		`\t\tfile: ${quoteTsString(`src/editor-plugins/${editorPluginSlug}/index.tsx`)},`,
		`\t\tslug: ${quoteTsString(editorPluginSlug)},`,
		`\t\tslot: ${quoteTsString(slot)},`,
		"\t},",
	].join("\n");
}

/**
 * Render the generated editor-plugin model type module.
 *
 * @param editorPluginSlug Normalized editor-plugin slug.
 * @returns TypeScript source for the plugin model type.
 */
export function buildEditorPluginTypesSource(editorPluginSlug: string): string {
	const typeName = `${toPascalCase(editorPluginSlug)}EditorPluginModel`;

	return `export interface ${typeName} {
\tprimaryActionLabel: string;
\tsummary: string;
}
`;
}

/**
 * Render the generated editor-plugin data module.
 *
 * @param editorPluginSlug Normalized editor-plugin slug.
 * @param slot Canonical editor-plugin slot id.
 * @returns TypeScript source for default plugin data helpers.
 */
export function buildEditorPluginDataSource(
	editorPluginSlug: string,
	slot: string,
): string {
	const typeName = `${toPascalCase(editorPluginSlug)}EditorPluginModel`;
	const pluginTitle = toTitleCase(editorPluginSlug);
	const modelFactoryName = `get${toPascalCase(editorPluginSlug)}EditorPluginModel`;
	const enabledFactoryName = `is${toPascalCase(editorPluginSlug)}Enabled`;

	return `import type { ${typeName} } from './types';

export const EDITOR_PLUGIN_SLOT = ${quoteTsString(slot)} as const;
export const REQUIRED_CAPABILITY = 'edit_posts' as const;

const DEFAULT_EDITOR_PLUGIN_MODEL: ${typeName} = {
\tprimaryActionLabel: ${quoteTsString(`Review ${pluginTitle}`)},
\tsummary: ${quoteTsString(`Replace this summary with your ${pluginTitle} workflow state.`)},
};

export function ${modelFactoryName}(): ${typeName} {
\treturn DEFAULT_EDITOR_PLUGIN_MODEL;
}

export function ${enabledFactoryName}(): boolean {
\treturn true;
}
`;
}

/**
 * Render the React surface for a generated editor plugin.
 *
 * @param editorPluginSlug Normalized editor-plugin slug.
 * @param slot Canonical editor-plugin slot id.
 * @param textDomain Workspace text domain used for translatable UI strings.
 * @returns TSX source for the generated plugin surface.
 */
export function buildEditorPluginSurfaceSource(
	editorPluginSlug: string,
	slot: string,
	textDomain: string,
): string {
	const pascalName = toPascalCase(editorPluginSlug);
	const modelFactoryName = `get${pascalName}EditorPluginModel`;
	const enabledFactoryName = `is${pascalName}Enabled`;
	const componentName = `${pascalName}Surface`;

	if (slot === "document-setting-panel") {
		return `import { Button } from '@wordpress/components';
import { PluginDocumentSettingPanel } from '@wordpress/editor';
import { __ } from '@wordpress/i18n';

import { ${modelFactoryName}, ${enabledFactoryName} } from './data';
import './style.scss';

export interface ${componentName}Props {
\tsurfaceName: string;
\ttitle: string;
}

export function ${componentName}( {
\tsurfaceName,
\ttitle,
}: ${componentName}Props ) {
\tif ( ! ${enabledFactoryName}() ) {
\t\treturn null;
\t}

\tconst editorPluginModel = ${modelFactoryName}();

\treturn (
\t\t<PluginDocumentSettingPanel
\t\t\tclassName="wp-typia-editor-plugin-shell"
\t\t\tname={ surfaceName }
\t\t\ttitle={ title }
\t\t>
\t\t\t<p>{ editorPluginModel.summary }</p>
\t\t\t<Button variant="secondary">
\t\t\t\t{ editorPluginModel.primaryActionLabel }
\t\t\t</Button>
\t\t\t<p className="wp-typia-editor-plugin-shell__hint">
\t\t\t\t{ __( 'Use data.ts to add post type, capability, or editor context guards before showing this panel.', ${quoteTsString(textDomain)} ) }
\t\t\t</p>
\t\t</PluginDocumentSettingPanel>
\t);
}
`;
	}

	return `import { Button, PanelBody } from '@wordpress/components';
import { PluginSidebar, PluginSidebarMoreMenuItem } from '@wordpress/editor';
import { __ } from '@wordpress/i18n';

import { ${modelFactoryName}, ${enabledFactoryName} } from './data';
import './style.scss';

export interface ${componentName}Props {
\tsurfaceName: string;
\ttitle: string;
}

export function ${componentName}( {
\tsurfaceName,
\ttitle,
}: ${componentName}Props ) {
\tif ( ! ${enabledFactoryName}() ) {
\t\treturn null;
\t}

\tconst editorPluginModel = ${modelFactoryName}();

\treturn (
\t\t<>
\t\t\t<PluginSidebarMoreMenuItem target={ surfaceName }>
\t\t\t\t{ title }
\t\t\t</PluginSidebarMoreMenuItem>
\t\t\t<PluginSidebar name={ surfaceName } title={ title }>
\t\t\t\t<div className="wp-typia-editor-plugin-shell">
\t\t\t\t\t<PanelBody
\t\t\t\t\t\tinitialOpen
\t\t\t\t\t\ttitle={ __( 'Document workflow', ${quoteTsString(textDomain)} ) }
\t\t\t\t\t>
\t\t\t\t\t\t<p>{ editorPluginModel.summary }</p>
\t\t\t\t\t\t<Button variant="secondary">
\t\t\t\t\t\t\t{ editorPluginModel.primaryActionLabel }
\t\t\t\t\t\t</Button>
\t\t\t\t\t</PanelBody>
\t\t\t\t</div>
\t\t\t</PluginSidebar>
\t\t</>
\t);
}
`;
}

/**
 * Render the generated editor-plugin entry module.
 *
 * @param editorPluginSlug Normalized editor-plugin slug.
 * @param namespace Workspace block namespace.
 * @param textDomain Workspace text domain used for translatable UI strings.
 * @returns TSX source for registering the editor plugin.
 */
export function buildEditorPluginEntrySource(
	editorPluginSlug: string,
	namespace: string,
	textDomain: string,
): string {
	const pascalName = toPascalCase(editorPluginSlug);
	const componentName = `${pascalName}Surface`;
	const pluginName = `${namespace}-${editorPluginSlug}`;
	const surfaceName = `${pluginName}-surface`;
	const pluginTitle = toTitleCase(editorPluginSlug);

	return `import { registerPlugin } from '@wordpress/plugins';
import { __ } from '@wordpress/i18n';

import { REQUIRED_CAPABILITY } from './data';
import { ${componentName} } from './Surface';

const EDITOR_PLUGIN_NAME = ${quoteTsString(pluginName)};
const EDITOR_PLUGIN_SURFACE_NAME = ${quoteTsString(surfaceName)};
const EDITOR_PLUGIN_TITLE = __( ${quoteTsString(pluginTitle)}, ${quoteTsString(textDomain)} );

registerPlugin( EDITOR_PLUGIN_NAME, {
\ticon: 'admin-generic',
\trender: () => (
\t\t<${componentName}
\t\t\tsurfaceName={ EDITOR_PLUGIN_SURFACE_NAME }
\t\t\ttitle={ EDITOR_PLUGIN_TITLE }
\t\t/>
\t),
} );

export { REQUIRED_CAPABILITY };
`;
}

/**
 * Render the generated editor-plugin stylesheet.
 *
 * @returns SCSS source for the generated editor plugin shell.
 */
export function buildEditorPluginStyleSource(): string {
	return `.wp-typia-editor-plugin-shell {
\tpadding: 16px;
}

.wp-typia-editor-plugin-shell p {
\tmargin: 0 0 12px;
}

.wp-typia-editor-plugin-shell__hint {
\tcolor: #757575;
\tfont-size: 12px;
}
`;
}
