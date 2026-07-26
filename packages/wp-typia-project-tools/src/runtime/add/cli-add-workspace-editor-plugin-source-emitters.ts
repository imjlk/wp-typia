import { quoteTsString } from './cli-add-shared.js';
import { toPascalCase, toTitleCase } from '../shared/string-case.js';
import {
  renderNamedTypeScriptImport,
  renderTypeScriptCallLine,
  TYPESCRIPT_PRINT_WIDTH,
} from '../shared/ts-string-literals.js';

function renderEditorPluginSurfaceDeclaration(
  componentName: string,
): string {
  const compact =
    `export function ${componentName}({ surfaceName, title }: ${componentName}Props) {`;
  if (compact.length <= TYPESCRIPT_PRINT_WIDTH) {
    return compact;
  }

  return `export function ${componentName}({
  surfaceName,
  title,
}: ${componentName}Props) {`;
}

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
    '  {',
    `    file: ${quoteTsString(`src/editor-plugins/${editorPluginSlug}/index.tsx`)},`,
    `    slug: ${quoteTsString(editorPluginSlug)},`,
    `    slot: ${quoteTsString(slot)},`,
    '  },',
  ].join('\n');
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
  primaryActionLabel: string;
  summary: string;
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
  primaryActionLabel: ${quoteTsString(`Review ${pluginTitle}`)},
  summary: ${quoteTsString(`Replace this summary with your ${pluginTitle} workflow state.`)},
};

export function ${modelFactoryName}(): ${typeName} {
  return DEFAULT_EDITOR_PLUGIN_MODEL;
}

export function ${enabledFactoryName}(): boolean {
  return true;
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
  const dataImport = renderNamedTypeScriptImport(
    [modelFactoryName, enabledFactoryName],
    './data',
  );
  const componentDeclaration =
    renderEditorPluginSurfaceDeclaration(componentName);

  if (slot === 'document-setting-panel') {
    const hintTranslation = renderTypeScriptCallLine({
      args: [
        quoteTsString(
          'Use data.ts to add post type, capability, or editor context guards before showing this panel.',
        ),
        quoteTsString(textDomain),
      ],
      callee: '__',
      indentation: '        ',
      prefix: '{',
      suffix: '}',
    });

    return `import { Button } from '@wordpress/components';
import { PluginDocumentSettingPanel } from '@wordpress/editor';
import { __ } from '@wordpress/i18n';

${dataImport}
import './style.scss';

export interface ${componentName}Props {
  surfaceName: string;
  title: string;
}

${componentDeclaration}
  if (!${enabledFactoryName}()) {
    return null;
  }

  const editorPluginModel = ${modelFactoryName}();

  return (
    <PluginDocumentSettingPanel
      className="wp-typia-editor-plugin-shell"
      name={surfaceName}
      title={title}
    >
      <p>{editorPluginModel.summary}</p>
      <Button variant="secondary">
        {editorPluginModel.primaryActionLabel}
      </Button>
      <p className="wp-typia-editor-plugin-shell__hint">
${hintTranslation}
      </p>
    </PluginDocumentSettingPanel>
  );
}
`;
  }

  const panelTitleTranslation = renderTypeScriptCallLine({
    args: [quoteTsString('Document workflow'), quoteTsString(textDomain)],
    callee: '__',
    indentation: '            ',
    prefix: 'title={',
    suffix: '}',
  });

  return `import { Button, PanelBody } from '@wordpress/components';
import { PluginSidebar, PluginSidebarMoreMenuItem } from '@wordpress/editor';
import { __ } from '@wordpress/i18n';

${dataImport}
import './style.scss';

export interface ${componentName}Props {
  surfaceName: string;
  title: string;
}

${componentDeclaration}
  if (!${enabledFactoryName}()) {
    return null;
  }

  const editorPluginModel = ${modelFactoryName}();

  return (
    <>
      <PluginSidebarMoreMenuItem target={surfaceName}>
        {title}
      </PluginSidebarMoreMenuItem>
      <PluginSidebar name={surfaceName} title={title}>
        <div className="wp-typia-editor-plugin-shell">
          <PanelBody
            initialOpen
${panelTitleTranslation}
          >
            <p>{editorPluginModel.summary}</p>
            <Button variant="secondary">
              {editorPluginModel.primaryActionLabel}
            </Button>
          </PanelBody>
        </div>
      </PluginSidebar>
    </>
  );
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
  const titleDeclaration = renderTypeScriptCallLine({
    args: [quoteTsString(pluginTitle), quoteTsString(textDomain)],
    callee: '__',
    indentation: '',
    prefix: 'const EDITOR_PLUGIN_TITLE = ',
    suffix: ';',
  });

  return `import { registerPlugin } from '@wordpress/plugins';
import { __ } from '@wordpress/i18n';

import { REQUIRED_CAPABILITY } from './data';
import { ${componentName} } from './Surface';

const EDITOR_PLUGIN_NAME = ${quoteTsString(pluginName)};
const EDITOR_PLUGIN_SURFACE_NAME = ${quoteTsString(surfaceName)};
${titleDeclaration}

registerPlugin(EDITOR_PLUGIN_NAME, {
  icon: 'admin-generic',
  render: () => (
    <${componentName}
      surfaceName={EDITOR_PLUGIN_SURFACE_NAME}
      title={EDITOR_PLUGIN_TITLE}
    />
  ),
});

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
