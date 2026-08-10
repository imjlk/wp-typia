import { quoteTsString } from './cli-add-shared.js';
import { type AdminViewManualSettingsRestResource } from './cli-add-workspace-admin-view-types.js';
import { getAdminViewRelativeModuleSpecifier } from './cli-add-workspace-admin-view-templates-shared.js';
import {
  renderNamedTypeScriptValueImport,
  renderNamedTypeScriptTypeImport,
  renderTypeScriptConstDeclaration,
  wrapLongTranslationCalls,
} from './cli-add-workspace-admin-view-typescript-format.js';
import {
  toCamelCase,
  toPascalCase,
  toTitleCase,
} from '../shared/string-case.js';
import { renderTypeScriptValue } from '../shared/ts-string-literals.js';

/**
 * Builds TypeScript request, response, and form-state types for REST settings.
 *
 * @param adminViewSlug - Admin-view slug used to derive generated type names.
 * @param restResource - Manual REST settings resource metadata for imports.
 * @returns Generated TypeScript source for REST settings types.
 */
export function buildRestSettingsAdminViewTypesSource(
  adminViewSlug: string,
  restResource: AdminViewManualSettingsRestResource,
): string {
  const pascalName = toPascalCase(adminViewSlug);
  const restTypesModule = getAdminViewRelativeModuleSpecifier(
    adminViewSlug,
    restResource.typesFile,
  );
  const formStateTypeName = `${pascalName}SettingsFormState`;
  const loadResultTypeName = `${pascalName}SettingsLoadResult`;
  const restTypesImport = renderNamedTypeScriptTypeImport(
    [
      restResource.bodyTypeName,
      restResource.queryTypeName,
      restResource.responseTypeName,
    ],
    restTypesModule,
  );

  return `${restTypesImport}

export type ${pascalName}SettingsRequest = ${restResource.bodyTypeName};
export type ${pascalName}SettingsQuery = ${restResource.queryTypeName};
export type ${pascalName}SettingsResponse = ${restResource.responseTypeName};
export type ${formStateTypeName} = Partial<${pascalName}SettingsRequest>;

export interface ${loadResultTypeName} {
\tform: ${formStateTypeName};
\tresponse: ${pascalName}SettingsResponse | null;
}
`;
}

/**
 * Builds display metadata for a manual REST settings form admin screen.
 *
 * @param adminViewSlug - Admin-view slug used to derive generated identifiers.
 * @param textDomain - WordPress i18n text domain for generated labels.
 * @param restResource - Manual REST settings metadata, including secret fields.
 * @returns Generated TypeScript source for settings form configuration.
 */
export function buildRestSettingsAdminViewConfigSource(
  adminViewSlug: string,
  textDomain: string,
  restResource: AdminViewManualSettingsRestResource,
): string {
  const pascalName = toPascalCase(adminViewSlug);
  const camelName = toCamelCase(adminViewSlug);
  const title = toTitleCase(adminViewSlug);
  const configName = `${camelName}SettingsConfig`;
  const formStateTypeName = `${pascalName}SettingsFormState`;
  const typesImport = renderNamedTypeScriptTypeImport([formStateTypeName]);
  const secretPreserveOnEmpty = restResource.secretPreserveOnEmpty !== false;
  const secretFieldSource =
    restResource.secretFieldName && restResource.secretStateFieldName
      ? `\t{
\t\tdescription: __(${quoteTsString(
        secretPreserveOnEmpty
          ? 'Write-only secret value. Leave blank to keep the existing secret.'
          : 'Write-only secret value. Blank submissions are sent to the REST route.',
      )}, ${quoteTsString(textDomain)}),
\t\tid: ${quoteTsString(restResource.secretFieldName)},
\t\tlabel: __(${quoteTsString(toTitleCase(restResource.secretFieldName))}, ${quoteTsString(textDomain)}),
\t\tpreserveOnEmpty: ${secretPreserveOnEmpty},
\t\tsecretStateField: ${quoteTsString(restResource.secretStateFieldName)},
\t\ttype: 'secret',
\t},`
      : '';

  const source = `import { __ } from '@wordpress/i18n';

${typesImport}

export type ${pascalName}SettingsFieldType = 'secret' | 'text' | 'textarea';

export interface ${pascalName}SettingsField {
\tdescription?: string;
\tid: Extract<keyof ${formStateTypeName}, string> | string;
\tlabel: string;
\tpreserveOnEmpty?: boolean;
\tsecretStateField?: string;
\ttype: ${pascalName}SettingsFieldType;
}

export const ${configName} = {
\tdescription: __('This generated settings form is backed by the ${restResource.slug} REST contract. Adjust config.ts and data.ts as the contract becomes product-specific.', ${quoteTsString(textDomain)}),
\tfields: [
\t\t{
\t\t\tdescription: __('Primary settings payload for this integration.', ${quoteTsString(textDomain)}),
\t\t\tid: 'payload',
\t\t\tlabel: __('Payload', ${quoteTsString(textDomain)}),
\t\t\ttype: 'textarea',
\t\t},
\t\t{
\t\t\tdescription: __('Optional operator note included with the save request.', ${quoteTsString(textDomain)}),
\t\t\tid: 'comment',
\t\t\tlabel: __('Comment', ${quoteTsString(textDomain)}),
\t\t\ttype: 'text',
\t\t},
${secretFieldSource}
\t] satisfies ${pascalName}SettingsField[],
\tsecretFieldName: ${restResource.secretFieldName ? quoteTsString(restResource.secretFieldName) : 'undefined'},
\tsecretPreserveOnEmpty: ${restResource.secretFieldName ? secretPreserveOnEmpty : 'undefined'},
\tsecretStateFieldName: ${restResource.secretStateFieldName ? quoteTsString(restResource.secretStateFieldName) : 'undefined'},
\ttitle: __(${quoteTsString(title)}, ${quoteTsString(textDomain)}),
};
`;
  return wrapLongTranslationCalls(source, textDomain);
}

/**
 * Builds load and save helpers for a manual REST settings form.
 *
 * @param adminViewSlug - Admin-view slug used to derive generated identifiers.
 * @param restResource - Manual REST settings metadata for API imports and secret handling.
 * @returns Generated TypeScript source for settings data helpers.
 */
export function buildRestSettingsAdminViewDataSource(
  adminViewSlug: string,
  restResource: AdminViewManualSettingsRestResource,
): string {
  const pascalName = toPascalCase(adminViewSlug);
  const restApiModule = getAdminViewRelativeModuleSpecifier(
    adminViewSlug,
    restResource.apiFile,
  );
  const formStateTypeName = `${pascalName}SettingsFormState`;
  const loadResultTypeName = `${pascalName}SettingsLoadResult`;
  const loadName = `load${pascalName}Settings`;
  const saveName = `save${pascalName}Settings`;
  const typesImport = renderNamedTypeScriptTypeImport([
    formStateTypeName,
    loadResultTypeName,
    `${pascalName}SettingsQuery`,
    `${pascalName}SettingsRequest`,
    `${pascalName}SettingsResponse`,
  ]);
  const secretPreserveOnEmpty = restResource.secretPreserveOnEmpty !== false;
  const initialStateSource = renderTypeScriptValue(
    {
      payload: '',
      comment: '',
      ...(restResource.secretFieldName && !secretPreserveOnEmpty
        ? { [restResource.secretFieldName]: '' }
        : {}),
    },
    60,
  ).replace(/\n/gu, '\n  ');
  const requestBodySource = restResource.secretFieldName && secretPreserveOnEmpty
    ? `\tconst requestBody = { ...form } as Record<string, unknown>;
\tconst secretFieldName = ${quoteTsString(restResource.secretFieldName)};
\tif (requestBody[secretFieldName] === '') {
\t\tdelete requestBody[secretFieldName];
\t}
`
    : `\tconst requestBody = form as Record<string, unknown>;
`;

  return `import { callManualRestContract } from ${quoteTsString(restApiModule)};
${typesImport}

function formatValidationError(prefix: string, errors: unknown): string {
\tif (!Array.isArray(errors) || errors.length === 0) {
\t\treturn prefix;
\t}

\treturn \`\${prefix} \${JSON.stringify(errors)}\`;
}

export function createInitial${pascalName}SettingsFormState(): ${formStateTypeName} {
\treturn ${initialStateSource} as ${formStateTypeName};
}

export async function ${loadName}(): Promise<${loadResultTypeName}> {
\treturn {
\t\tform: createInitial${pascalName}SettingsFormState(),
\t\tresponse: null,
\t};
}

export async function ${saveName}(
\tform: ${formStateTypeName},
\tquery: Partial<${pascalName}SettingsQuery> = {},
): Promise<${pascalName}SettingsResponse> {
${requestBodySource}
\tconst result = await callManualRestContract({
\t\tbody: requestBody as unknown as ${pascalName}SettingsRequest,
\t\tquery: query as ${pascalName}SettingsQuery,
\t});
\tif (!result.isValid) {
\t\tconst message =
\t\t\tresult.validationTarget === 'request'
\t\t\t\t? 'Settings request failed validation.'
\t\t\t\t: 'Settings response failed validation.';
\t\tthrow new Error(formatValidationError(message, result.errors));
\t}

\treturn result.data as ${pascalName}SettingsResponse;
}
`;
}

/**
 * Builds the React form screen for a manual REST settings admin view.
 *
 * @param adminViewSlug - Admin-view slug used to derive generated identifiers.
 * @param textDomain - WordPress i18n text domain for generated labels.
 * @returns Generated TSX source for the REST settings screen.
 */
export function buildRestSettingsAdminViewScreenSource(
  adminViewSlug: string,
  textDomain: string,
): string {
  const pascalName = toPascalCase(adminViewSlug);
  const componentName = `${pascalName}AdminViewScreen`;
  const formStateTypeName = `${pascalName}SettingsFormState`;
  const responseTypeName = `${pascalName}SettingsResponse`;
  const camelName = toCamelCase(adminViewSlug);
  const configName = `${camelName}SettingsConfig`;
  const loadName = `load${pascalName}Settings`;
  const saveName = `save${pascalName}Settings`;
  const typesImport = renderNamedTypeScriptTypeImport([
    formStateTypeName,
    responseTypeName,
  ]);
  const dataImport = renderNamedTypeScriptValueImport(
    [loadName, saveName],
    './data',
  );
  const responseStateSource = renderTypeScriptConstDeclaration(
    '[response, setResponse]',
    `useState<${responseTypeName} | null>(null)`,
  );

  return `import {
\tButton,
\tNotice,
\tSpinner,
\tTextControl,
\tTextareaControl,
} from '@wordpress/components';
import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { ${configName} } from './config';
${dataImport}
${typesImport}

function getFieldValue(form: ${formStateTypeName}, fieldId: string): string {
\tconst value = (form as Record<string, unknown>)[fieldId];
\tif (typeof value === 'string') {
\t\treturn value;
\t}
\tif (value === null || value === undefined) {
\t\treturn '';
\t}

\treturn String(value);
}

function getSecretState(response: ${responseTypeName} | null): boolean | null {
\tconst stateField = ${configName}.secretStateFieldName;
\tif (!stateField || !response) {
\t\treturn null;
\t}

\tconst value = (response as unknown as Record<string, unknown>)[stateField];
\treturn typeof value === 'boolean' ? value : null;
}

export function ${componentName}() {
\tconst [form, setForm] = useState<${formStateTypeName}>({});
${responseStateSource}
\tconst [error, setError] = useState<string | null>(null);
\tconst [isLoading, setIsLoading] = useState(true);
\tconst [isSaving, setIsSaving] = useState(false);
\tconst [successMessage, setSuccessMessage] = useState<string | null>(null);

\tuseEffect(() => {
\t\tlet isCurrent = true;
\t\tsetIsLoading(true);
\t\tsetError(null);

\t\tvoid ${loadName}()
\t\t\t.then((result) => {
\t\t\t\tif (isCurrent) {
\t\t\t\t\tsetForm(result.form);
\t\t\t\t\tsetResponse(result.response);
\t\t\t\t}
\t\t\t})
\t\t\t.catch((nextError: unknown) => {
\t\t\t\tif (isCurrent) {
\t\t\t\t\tsetError(
\t\t\t\t\t\tnextError instanceof Error
\t\t\t\t\t\t\t? nextError.message
\t\t\t\t\t\t\t: __('Unable to prepare settings form.', ${quoteTsString(textDomain)}),
\t\t\t\t\t);
\t\t\t\t}
\t\t\t})
\t\t\t.finally(() => {
\t\t\t\tif (isCurrent) {
\t\t\t\t\tsetIsLoading(false);
\t\t\t\t}
\t\t\t});

\t\treturn () => {
\t\t\tisCurrent = false;
\t\t};
\t}, []);

\tconst setFormValue = (fieldId: string, value: string) => {
\t\tsetForm(
\t\t\t(current) =>
\t\t\t\t({
\t\t\t\t\t...current,
\t\t\t\t\t[fieldId]: value,
\t\t\t\t}) as ${formStateTypeName},
\t\t);
\t};
\tconst secretState = getSecretState(response);

\tconst handleSubmit = (event: { preventDefault: () => void }) => {
\t\tevent.preventDefault();
\t\tsetError(null);
\t\tsetSuccessMessage(null);
\t\tsetIsSaving(true);

\t\tvoid ${saveName}(form)
\t\t\t.then((nextResponse) => {
\t\t\t\tsetResponse(nextResponse);
\t\t\t\tsetSuccessMessage(__('Settings saved.', ${quoteTsString(textDomain)}));
\t\t\t})
\t\t\t.catch((nextError: unknown) => {
\t\t\t\tsetError(
\t\t\t\t\tnextError instanceof Error
\t\t\t\t\t\t? nextError.message
\t\t\t\t\t\t: __('Unable to save settings.', ${quoteTsString(textDomain)}),
\t\t\t\t);
\t\t\t})
\t\t\t.finally(() => setIsSaving(false));
\t};

\treturn (
\t\t<div className="wp-typia-admin-view-screen wp-typia-admin-view-screen--settings">
\t\t\t<header className="wp-typia-admin-view-screen__header">
\t\t\t\t<div>
\t\t\t\t\t<p className="wp-typia-admin-view-screen__eyebrow">
\t\t\t\t\t\t{ __('Typed settings screen', ${quoteTsString(textDomain)}) }
\t\t\t\t\t</p>
\t\t\t\t\t<h1>{ ${configName}.title }</h1>
\t\t\t\t\t<p>{ ${configName}.description }</p>
\t\t\t\t</div>
\t\t\t\t<div className="wp-typia-admin-view-screen__actions">
\t\t\t\t\t{ isLoading || isSaving ? <Spinner /> : null }
\t\t\t\t</div>
\t\t\t</header>
\t\t\t{ error ? (
\t\t\t\t<Notice isDismissible={ false } status="error">
\t\t\t\t\t{ error }
\t\t\t\t</Notice>
\t\t\t) : null }
\t\t\t{ successMessage ? (
\t\t\t\t<Notice isDismissible={ false } status="success">
\t\t\t\t\t{ successMessage }
\t\t\t\t</Notice>
\t\t\t) : null }
\t\t\t{ secretState !== null ? (
\t\t\t\t<Notice isDismissible={ false } status="info">
\t\t\t\t\t{ secretState
\t\t\t\t\t\t? __('A secret is currently configured for this integration.', ${quoteTsString(textDomain)})
\t\t\t\t\t\t: __('No secret is currently configured for this integration.', ${quoteTsString(textDomain)}) }
\t\t\t\t</Notice>
\t\t\t) : null }
\t\t\t<form className="wp-typia-admin-view-screen__settings-form" onSubmit={ handleSubmit }>
\t\t\t\t{ ${configName}.fields.map((field) => (
\t\t\t\t\t<div className="wp-typia-admin-view-screen__field" key={ field.id }>
\t\t\t\t\t\t{ field.type === 'textarea' ? (
\t\t\t\t\t\t\t<TextareaControl
\t\t\t\t\t\t\t\thelp={ field.description }
\t\t\t\t\t\t\t\tlabel={ field.label }
\t\t\t\t\t\t\t\tonChange={ (value) => setFormValue(field.id, value) }
\t\t\t\t\t\t\t\tvalue={ getFieldValue(form, field.id) }
\t\t\t\t\t\t\t/>
\t\t\t\t\t\t) : (
\t\t\t\t\t\t\t<TextControl
\t\t\t\t\t\t\t\thelp={ field.description }
\t\t\t\t\t\t\t\tlabel={ field.label }
\t\t\t\t\t\t\t\tonChange={ (value) => setFormValue(field.id, value) }
\t\t\t\t\t\t\t\ttype={ field.type === 'secret' ? 'password' : 'text' }
\t\t\t\t\t\t\t\tvalue={ getFieldValue(form, field.id) }
\t\t\t\t\t\t\t/>
\t\t\t\t\t\t) }
\t\t\t\t\t</div>
\t\t\t\t)) }
\t\t\t\t<Button
\t\t\t\t\tdisabled={ isLoading || isSaving }
\t\t\t\t\tisBusy={ isSaving }
\t\t\t\t\ttype="submit"
\t\t\t\t\tvariant="primary"
\t\t\t\t>
\t\t\t\t\t{ __('Save settings', ${quoteTsString(textDomain)}) }
\t\t\t\t</Button>
\t\t\t</form>
\t\t</div>
\t);
}
`;
}
