import { quoteTsString } from './cli-add-shared.js';
import {
  renderAdminViewQuerySource,
  renderNamedTypeScriptTypeImport,
  renderTypeScriptConstDeclaration,
  wrapLongDataViewsDeclaration,
  wrapLongTranslationCalls,
} from './cli-add-workspace-admin-view-typescript-format.js';
import {
  toCamelCase,
  toPascalCase,
  toTitleCase,
} from '../shared/string-case.js';

/**
 * Builds starter item and dataset types for the default admin-view variant.
 *
 * @param adminViewSlug - Admin-view slug used to derive generated type names.
 * @returns Generated TypeScript source for default admin-view types.
 */
export function buildDefaultAdminViewTypesSource(adminViewSlug: string): string {
  const pascalName = toPascalCase(adminViewSlug);
  const itemTypeName = `${pascalName}AdminViewItem`;
  const dataSetTypeName = `${pascalName}AdminViewDataSet`;

  return `export type ${pascalName}AdminViewStatus = 'draft' | 'published';

export interface ${itemTypeName} {
\tid: number;
\towner: string;
\tstatus: ${pascalName}AdminViewStatus;
\ttitle: string;
\tupdatedAt: string;
}

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
 * Builds a DataViews config module for the default admin-view variant.
 *
 * @param adminViewSlug - Admin-view slug used to derive generated identifiers.
 * @param textDomain - WordPress i18n text domain for generated labels.
 * @returns Generated TypeScript source for the default DataViews config.
 */
export function buildDefaultAdminViewConfigSource(
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
\tsearch: true,
\tsearchLabel: __('Search records', ${quoteTsString(textDomain)}),
\ttitleField: 'title',
\tdefaultView: {
\t\tfields: ['title', 'status', 'updatedAt'],
\t\tpage: 1,
\t\tperPage: 10,
\t\tsort: {
\t\t\tdirection: 'desc',
\t\t\tfield: 'updatedAt',
\t\t},
\t\ttitleField: 'title',
\t\ttype: 'table',
\t},
\tfields: {
\t\tid: {
\t\t\tenableHiding: false,
\t\t\tlabel: __('ID', ${quoteTsString(textDomain)}),
\t\t\treadOnly: true,
\t\t\tschema: { type: 'integer' },
\t\t},
\t\towner: {
\t\t\tlabel: __('Owner', ${quoteTsString(textDomain)}),
\t\t\tschema: { type: 'string' },
\t\t},
\t\tstatus: {
\t\t\tfilterBy: { operators: ['isAny', 'isNone'] },
\t\t\tlabel: __('Status', ${quoteTsString(textDomain)}),
\t\t\tschema: {
\t\t\t\tenum: ['draft', 'published'],
\t\t\t\tenumLabels: {
\t\t\t\t\tdraft: __('Draft', ${quoteTsString(textDomain)}),
\t\t\t\t\tpublished: __('Published', ${quoteTsString(textDomain)}),
\t\t\t\t},
\t\t\t\ttype: 'string',
\t\t\t},
\t\t},
\t\ttitle: {
\t\t\tenableGlobalSearch: true,
\t\t\tenableSorting: true,
\t\t\tlabel: __('Title', ${quoteTsString(textDomain)}),
\t\t\tschema: { type: 'string' },
\t\t},
\t\tupdatedAt: {
\t\t\tenableSorting: true,
\t\t\tlabel: __('Updated', ${quoteTsString(textDomain)}),
\t\t\tschema: { format: 'date-time', type: 'string' },
\t\t\ttype: 'datetime',
\t\t},
\t},
});
`;
  return wrapLongTranslationCalls(
    wrapLongDataViewsDeclaration(source, dataViewsName, itemTypeName),
    textDomain,
  );
}

/**
 * Builds an in-memory starter data module for the default admin-view variant.
 *
 * @param adminViewSlug - Admin-view slug used to derive generated identifiers.
 * @returns Generated TypeScript source for starter data loading.
 */
export function buildDefaultAdminViewDataSource(adminViewSlug: string): string {
  const pascalName = toPascalCase(adminViewSlug);
  const camelName = toCamelCase(adminViewSlug);
  const title = toTitleCase(adminViewSlug);
  const itemTypeName = `${pascalName}AdminViewItem`;
  const dataSetTypeName = `${pascalName}AdminViewDataSet`;
  const queryTypeName = `${pascalName}AdminViewQuery`;
  const dataViewsName = `${camelName}AdminDataViews`;
  const fetchName = `fetch${pascalName}AdminViewData`;
  const typesImport = renderNamedTypeScriptTypeImport([
    dataSetTypeName,
    itemTypeName,
  ]);
  const querySource = renderAdminViewQuerySource({
    dataViewsName,
    properties: ["perPageParam: 'perPage'"],
    queryTypeName,
  });

  return `import type { DataViewsView } from '@wp-typia/dataviews';

import { ${dataViewsName} } from './config';
${typesImport}

export interface ${queryTypeName} {
\tpage?: number;
\tperPage?: number;
\tsearch?: string;
}

const STARTER_ITEMS: ${itemTypeName}[] = [
\t{
\t\tid: 1,
\t\towner: 'Editorial',
\t\tstatus: 'published',
\t\ttitle: ${quoteTsString(`${title} launch checklist`)},
\t\tupdatedAt: '2026-04-01T10:30:00Z',
\t},
\t{
\t\tid: 2,
\t\towner: 'Design',
\t\tstatus: 'draft',
\t\ttitle: ${quoteTsString(`${title} content refresh`)},
\t\tupdatedAt: '2026-04-03T14:15:00Z',
\t},
\t{
\t\tid: 3,
\t\towner: 'Operations',
\t\tstatus: 'published',
\t\ttitle: ${quoteTsString(`${title} support handoff`)},
\t\tupdatedAt: '2026-04-08T08:45:00Z',
\t},
];

function matchesSearch(item: ${itemTypeName}, search: string | undefined): boolean {
\tif (!search) {
\t\treturn true;
\t}

\tconst needle = search.toLowerCase();
\treturn [item.title, item.owner, item.status].some((value) =>
\t\tvalue.toLowerCase().includes(needle),
\t);
}

export async function ${fetchName}(
\tview: DataViewsView<${itemTypeName}>,
): Promise<${dataSetTypeName}> {
${querySource}
\tconst requestedPage = query.page ?? 1;
\tconst page = requestedPage > 0 ? requestedPage : 1;
\tconst requestedPerPage = query.perPage ?? view.perPage ?? 10;
\tconst perPage = requestedPerPage > 0 ? requestedPerPage : 10;
\tconst filteredItems = STARTER_ITEMS.filter((item) =>
\t\tmatchesSearch(item, query.search),
\t);
\tconst offset = (page - 1) * perPage;
\tconst items = filteredItems.slice(offset, offset + perPage);

\treturn {
\t\titems,
\t\tpaginationInfo: {
\t\t\ttotalItems: filteredItems.length,
\t\t\ttotalPages: Math.max(1, Math.ceil(filteredItems.length / perPage)),
\t\t},
\t};
}
`;
}

/**
 * Builds the React screen module for the default admin-view variant.
 *
 * @param adminViewSlug - Admin-view slug used to derive generated identifiers.
 * @param textDomain - WordPress i18n text domain for generated labels.
 * @returns Generated TSX source for the default admin-view screen.
 */
export function buildAdminViewScreenSource(
  adminViewSlug: string,
  textDomain: string,
): string {
  const pascalName = toPascalCase(adminViewSlug);
  const camelName = toCamelCase(adminViewSlug);
  const itemTypeName = `${pascalName}AdminViewItem`;
  const dataSetTypeName = `${pascalName}AdminViewDataSet`;
  const componentName = `${pascalName}AdminViewScreen`;
  const dataViewsName = `${camelName}AdminDataViews`;
  const fetchName = `fetch${pascalName}AdminViewData`;
  const title = toTitleCase(adminViewSlug);
  const typesImport = renderNamedTypeScriptTypeImport([
    dataSetTypeName,
    itemTypeName,
  ]);
  const dataSetStateSource = renderTypeScriptConstDeclaration(
    '[dataSet, setDataSet]',
    `useState<${dataSetTypeName}>(EMPTY_DATA_SET)`,
  );

  return `import type { DataViewsConfig, DataViewsView } from '@wp-typia/dataviews';
import { Button, Notice, Spinner } from '@wordpress/components';
import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { DataViews } from '@wordpress/dataviews/wp';

import { ${dataViewsName} } from './config';
import { ${fetchName} } from './data';
${typesImport}

const TypedDataViews = DataViews as unknown as <TItem extends object>(
\tprops: DataViewsConfig<TItem>,
) => ReturnType<typeof DataViews>;

const EMPTY_DATA_SET: ${dataSetTypeName} = {
\titems: [],
\tpaginationInfo: {
\t\ttotalItems: 0,
\t\ttotalPages: 1,
\t},
};

export function ${componentName}() {
\tconst [view, setView] = useState<DataViewsView<${itemTypeName}>>(
\t\t${dataViewsName}.defaultView,
\t);
${dataSetStateSource}
\tconst [error, setError] = useState<string | null>(null);
\tconst [isLoading, setIsLoading] = useState(true);
\tconst [reloadToken, setReloadToken] = useState(0);

\tuseEffect(() => {
\t\tlet isCurrentRequest = true;
\t\tsetIsLoading(true);
\t\tsetError(null);

\t\tvoid ${fetchName}(view)
\t\t\t.then((nextDataSet) => {
\t\t\t\tif (isCurrentRequest) {
\t\t\t\t\tsetDataSet(nextDataSet);
\t\t\t\t}
\t\t\t})
\t\t\t.catch((nextError: unknown) => {
\t\t\t\tif (isCurrentRequest) {
\t\t\t\t\tsetError(
\t\t\t\t\t\tnextError instanceof Error
\t\t\t\t\t\t\t? nextError.message
\t\t\t\t\t\t\t: __('Unable to load records.', ${quoteTsString(textDomain)}),
\t\t\t\t\t);
\t\t\t\t}
\t\t\t})
\t\t\t.finally(() => {
\t\t\t\tif (isCurrentRequest) {
\t\t\t\t\tsetIsLoading(false);
\t\t\t\t}
\t\t\t});

\t\treturn () => {
\t\t\tisCurrentRequest = false;
\t\t};
\t}, [reloadToken, view]);

\tconst config = ${dataViewsName}.createConfig({
\t\tdata: dataSet.items,
\t\tisLoading,
\t\tonChangeView: setView,
\t\tpaginationInfo: dataSet.paginationInfo,
\t\tview,
\t});

\treturn (
\t\t<div className="wp-typia-admin-view-screen">
\t\t\t<header className="wp-typia-admin-view-screen__header">
\t\t\t\t<div>
\t\t\t\t\t<p className="wp-typia-admin-view-screen__eyebrow">
\t\t\t\t\t\t{ __('DataViews admin screen', ${quoteTsString(textDomain)}) }
\t\t\t\t\t</p>
\t\t\t\t\t<h1>{ __(${quoteTsString(title)}, ${quoteTsString(textDomain)}) }</h1>
\t\t\t\t\t<p>
\t\t\t\t\t\t{ __('Replace the fetcher in data.ts with your project data source when this screen graduates from scaffold to product UI.', ${quoteTsString(textDomain)}) }
\t\t\t\t\t</p>
\t\t\t\t</div>
\t\t\t\t<div className="wp-typia-admin-view-screen__actions">
\t\t\t\t\t{ isLoading ? <Spinner /> : null }
\t\t\t\t\t<Button
\t\t\t\t\t\tisBusy={ isLoading }
\t\t\t\t\t\tonClick={ () => setReloadToken((token) => token + 1) }
\t\t\t\t\t\tvariant="secondary"
\t\t\t\t\t>
\t\t\t\t\t\t{ __('Reload', ${quoteTsString(textDomain)}) }
\t\t\t\t\t</Button>
\t\t\t\t</div>
\t\t\t</header>
\t\t\t{ error ? (
\t\t\t\t<Notice isDismissible={ false } status="error">
\t\t\t\t\t{ error }
\t\t\t\t</Notice>
\t\t\t) : null }
\t\t\t<TypedDataViews<${itemTypeName}> { ...config } />
\t\t</div>
\t);
}
`;
}
