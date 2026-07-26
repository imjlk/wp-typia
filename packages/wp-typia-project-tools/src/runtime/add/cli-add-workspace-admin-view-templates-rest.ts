import { quoteTsString } from './cli-add-shared.js';
import { type AdminViewRestResource } from './cli-add-workspace-admin-view-types.js';
import { getAdminViewRelativeModuleSpecifier } from './cli-add-workspace-admin-view-templates-shared.js';
import {
  renderAdminViewQuerySource,
  renderNamedTypeScriptTypeImport,
  wrapLongDataViewsDeclaration,
  wrapLongTranslationCalls,
} from './cli-add-workspace-admin-view-typescript-format.js';
import { toCamelCase, toPascalCase } from '../shared/string-case.js';

/**
 * Builds TypeScript item and dataset types for a REST-backed admin view.
 *
 * @param adminViewSlug - Admin-view slug used to derive generated type names.
 * @param restResource - REST resource metadata used for imported record types.
 * @returns Generated TypeScript source for REST admin-view types.
 */
export function buildRestAdminViewTypesSource(
  adminViewSlug: string,
  restResource: AdminViewRestResource,
): string {
  const pascalName = toPascalCase(adminViewSlug);
  const restPascalName = toPascalCase(restResource.slug);
  const itemTypeName = `${pascalName}AdminViewItem`;
  const dataSetTypeName = `${pascalName}AdminViewDataSet`;
  const restTypesModule = getAdminViewRelativeModuleSpecifier(
    adminViewSlug,
    restResource.typesFile,
  );
  const restTypesImport = renderNamedTypeScriptTypeImport(
    [`${restPascalName}Record`],
    restTypesModule,
  );

  return `${restTypesImport}

export type ${itemTypeName} = ${restPascalName}Record;

export interface ${dataSetTypeName} {
\titems: ${itemTypeName}[];
\tpaginationInfo: {
\t\ttotalItems: number;
\t\ttotalPages: number;
\t};
}
`;
}

/**
 * Builds a DataViews config module for a REST-backed admin view.
 *
 * @param adminViewSlug - Admin-view slug used to derive generated identifiers.
 * @param textDomain - WordPress i18n text domain for generated labels.
 * @returns Generated TypeScript source for the REST DataViews config.
 */
export function buildRestAdminViewConfigSource(
  adminViewSlug: string,
  textDomain: string,
): string {
  const pascalName = toPascalCase(adminViewSlug);
  const camelName = toCamelCase(adminViewSlug);
  const itemTypeName = `${pascalName}AdminViewItem`;
  const dataViewsName = `${camelName}AdminDataViews`;
  const typesImport = renderNamedTypeScriptTypeImport([itemTypeName]);

  const source = `import { defineDataViews } from '@wp-typia/dataviews';
import { __ } from '@wordpress/i18n';

${typesImport}

export const ${dataViewsName} = defineDataViews<${itemTypeName}>({
\tidField: 'id',
\tsearch: false,
\tsearchLabel: __('Search records', ${quoteTsString(textDomain)}),
\tdefaultView: {
\t\tfields: ['id'],
\t\tpage: 1,
\t\tperPage: 10,
\t\ttype: 'table',
\t},
\tfields: {
\t\tid: {
\t\t\tenableHiding: false,
\t\t\tlabel: __('ID', ${quoteTsString(textDomain)}),
\t\t\treadOnly: true,
\t\t\tschema: { type: 'integer' },
\t\t},
\t\t// REST-backed screens start with the guaranteed ID column. Add project-owned fields here once they are declared on the REST record type.
\t},
});
`;
  return wrapLongTranslationCalls(
    wrapLongDataViewsDeclaration(source, dataViewsName, itemTypeName),
    textDomain,
  );
}

/**
 * Builds a REST list data module with pagination mapping for an admin view.
 *
 * @param adminViewSlug - Admin-view slug used to derive generated identifiers.
 * @param restResource - REST resource metadata used for generated imports.
 * @returns Generated TypeScript source for REST data loading.
 */
export function buildRestAdminViewDataSource(
  adminViewSlug: string,
  restResource: AdminViewRestResource,
): string {
  const pascalName = toPascalCase(adminViewSlug);
  const restPascalName = toPascalCase(restResource.slug);
  const camelName = toCamelCase(adminViewSlug);
  const itemTypeName = `${pascalName}AdminViewItem`;
  const dataSetTypeName = `${pascalName}AdminViewDataSet`;
  const dataViewsName = `${camelName}AdminDataViews`;
  const fetchName = `fetch${pascalName}AdminViewData`;
  const restApiModule = getAdminViewRelativeModuleSpecifier(
    adminViewSlug,
    restResource.apiFile,
  );
  const restTypesModule = getAdminViewRelativeModuleSpecifier(
    adminViewSlug,
    restResource.typesFile,
  );
  const restQueryImport = renderNamedTypeScriptTypeImport(
    [`${restPascalName}ListQuery`],
    restTypesModule,
  );
  const typesImport = renderNamedTypeScriptTypeImport([
    dataSetTypeName,
    itemTypeName,
  ]);
  const querySource = renderAdminViewQuerySource({
    dataViewsName,
    properties: ["perPageParam: 'perPage'", 'searchParam: false'],
    queryTypeName: `${restPascalName}ListQuery`,
  });

  return `import type { DataViewsView } from '@wp-typia/dataviews';

import { listResource } from ${quoteTsString(restApiModule)};
${restQueryImport}
import { ${dataViewsName} } from './config';
${typesImport}

function resolveTotalPages(total: number, perPage: number | undefined): number {
\tconst resolvedPerPage = perPage && perPage > 0 ? perPage : 1;
\treturn Math.max(1, Math.ceil(total / resolvedPerPage));
}

export async function ${fetchName}(
\tview: DataViewsView<${itemTypeName}>,
): Promise<${dataSetTypeName}> {
${querySource}
\tconst result = await listResource({
\t\tpage: query.page,
\t\tperPage: query.perPage,
\t});
\tif (!result.isValid || !result.data) {
\t\tthrow new Error('Unable to load REST resource records.');
\t}

\tconst response = result.data;

\treturn {
\t\titems: response.items,
\t\tpaginationInfo: {
\t\t\ttotalItems: response.total,
\t\t\ttotalPages: resolveTotalPages(
\t\t\t\tresponse.total,
\t\t\t\tresponse.perPage ?? query.perPage,
\t\t\t),
\t\t},
\t};
}
`;
}
