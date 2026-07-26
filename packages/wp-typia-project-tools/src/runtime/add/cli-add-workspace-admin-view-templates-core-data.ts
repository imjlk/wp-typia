import { quoteTsString } from './cli-add-shared.js';
import { type AdminViewCoreDataSource } from './cli-add-workspace-admin-view-types.js';
import {
  renderAdminViewQuerySource,
  renderNamedTypeScriptTypeImport,
  wrapLongDataViewsDeclaration,
  wrapLongTranslationCalls,
} from './cli-add-workspace-admin-view-typescript-format.js';
import {
  toCamelCase,
  toPascalCase,
  toTitleCase,
} from '../shared/string-case.js';

/**
 * Builds TypeScript item and dataset types for a core-data-backed admin view.
 *
 * @param adminViewSlug - Admin-view slug used to derive generated type names.
 * @param coreDataSource - WordPress core-data entity source for the admin view.
 * @returns Generated TypeScript source for core-data admin-view types.
 */
export function buildCoreDataAdminViewTypesSource(
  adminViewSlug: string,
  coreDataSource: AdminViewCoreDataSource,
): string {
  const pascalName = toPascalCase(adminViewSlug);
  const coreDataRecordTypeName = `${pascalName}CoreDataRecord`;
  const itemTypeName = `${pascalName}AdminViewItem`;
  const dataSetTypeName = `${pascalName}AdminViewDataSet`;

  if (coreDataSource.entityKind === 'taxonomy') {
    return `export interface ${coreDataRecordTypeName} {
\tcount?: number;
\tdescription?: string;
\tid: number;
\tlink?: string;
\tmeta?: Record<string, unknown>;
\tname?: string;
\tparent?: number;
\tslug?: string;
\ttaxonomy?: string;
\t[key: string]: unknown;
}

export interface ${itemTypeName} {
\tcount: number;
\tdescription: string;
\tid: number;
\tlink: string;
\tname: string;
\tparent: number;
\traw: ${coreDataRecordTypeName};
\tslug: string;
\ttaxonomy: string;
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

  return `export interface ${coreDataRecordTypeName} {
\tid: number;
\tdate?: string;
\tmodified?: string;
\tname?: string;
\tslug?: string;
\tstatus?: string;
\ttitle?: string | {
\t\traw?: string;
\t\trendered?: string;
\t};
\t[key: string]: unknown;
}

export interface ${itemTypeName} {
\tid: number;
\traw: ${coreDataRecordTypeName};
\tslug: string;
\tstatus: string;
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
 * Builds a DataViews config module for a core-data-backed admin view.
 *
 * @param adminViewSlug - Admin-view slug used to derive generated identifiers.
 * @param textDomain - WordPress i18n text domain for generated labels.
 * @param coreDataSource - WordPress core-data entity source for field selection.
 * @returns Generated TypeScript source for the core-data DataViews config.
 */
export function buildCoreDataAdminViewConfigSource(
  adminViewSlug: string,
  textDomain: string,
  coreDataSource: AdminViewCoreDataSource,
): string {
  const pascalName = toPascalCase(adminViewSlug);
  const camelName = toCamelCase(adminViewSlug);
  const itemTypeName = `${pascalName}AdminViewItem`;
  const dataViewsName = `${camelName}AdminDataViews`;
  const typesImport = renderNamedTypeScriptTypeImport([itemTypeName]);
  const isTaxonomyCoreDataSource = coreDataSource.entityKind === 'taxonomy';
  const defaultViewFields = isTaxonomyCoreDataSource
    ? "['name', 'slug', 'count']"
    : "['title', 'slug', 'status', 'updatedAt']";
  const titleFieldSource = isTaxonomyCoreDataSource
    ? "\ttitleField: 'name',\n"
    : "\ttitleField: 'title',\n";
  const defaultViewEnhancementsSource = isTaxonomyCoreDataSource
    ? "\t\ttitleField: 'name',\n"
    : "\t\ttitleField: 'title',\n";
  const additionalFieldsSource = isTaxonomyCoreDataSource
    ? `\t\tcount: {
\t\t\tlabel: __('Count', ${quoteTsString(textDomain)}),
\t\t\tschema: { type: 'integer' },
\t\t},
\t\tdescription: {
\t\t\tlabel: __('Description', ${quoteTsString(textDomain)}),
\t\t\tschema: { type: 'string' },
\t\t},
\t\tlink: {
\t\t\tlabel: __('Link', ${quoteTsString(textDomain)}),
\t\t\tschema: { format: 'uri', type: 'string' },
\t\t},
\t\tname: {
\t\t\tenableGlobalSearch: true,
\t\t\tlabel: __('Name', ${quoteTsString(textDomain)}),
\t\t\tschema: { type: 'string' },
\t\t},
\t\tparent: {
\t\t\tlabel: __('Parent', ${quoteTsString(textDomain)}),
\t\t\tschema: { type: 'integer' },
\t\t},
\t\tslug: {
\t\t\tenableGlobalSearch: true,
\t\t\tlabel: __('Slug', ${quoteTsString(textDomain)}),
\t\t\tschema: { type: 'string' },
\t\t},
\t\ttaxonomy: {
\t\t\tlabel: __('Taxonomy', ${quoteTsString(textDomain)}),
\t\t\tschema: { type: 'string' },
\t\t},`
    : `\t\tslug: {
\t\t\tenableGlobalSearch: true,
\t\t\tlabel: __('Slug', ${quoteTsString(textDomain)}),
\t\t\tschema: { type: 'string' },
\t\t},
\t\tstatus: {
\t\t\tlabel: __('Status', ${quoteTsString(textDomain)}),
\t\t\tschema: { type: 'string' },
\t\t},
\t\ttitle: {
\t\t\tenableGlobalSearch: true,
\t\t\tlabel: __('Title', ${quoteTsString(textDomain)}),
\t\t\tschema: { type: 'string' },
\t\t},
\t\tupdatedAt: {
\t\t\tlabel: __('Updated', ${quoteTsString(textDomain)}),
\t\t\tschema: { format: 'date-time', type: 'string' },
\t\t\ttype: 'datetime',
\t\t},`;

  const source = `import { defineDataViews } from '@wp-typia/dataviews';
import { __ } from '@wordpress/i18n';

${typesImport}

export const ${dataViewsName} = defineDataViews<${itemTypeName}>({
\tidField: 'id',
\tsearch: true,
\tsearchLabel: __('Search records', ${quoteTsString(textDomain)}),
${titleFieldSource}
\tdefaultView: {
\t\tfields: ${defaultViewFields},
\t\tpage: 1,
\t\tperPage: 10,
${defaultViewEnhancementsSource}
\t\ttype: 'table',
\t},
\tfields: {
\t\tid: {
\t\t\tenableHiding: false,
\t\t\tlabel: __('ID', ${quoteTsString(textDomain)}),
\t\t\treadOnly: true,
\t\t\tschema: { type: 'integer' },
\t\t},
${additionalFieldsSource}
\t},
});
`;
  return wrapLongTranslationCalls(
    wrapLongDataViewsDeclaration(source, dataViewsName, itemTypeName),
    textDomain,
  );
}

/**
 * Builds data hooks for loading records from the WordPress core-data store.
 *
 * @param adminViewSlug - Admin-view slug used to derive generated identifiers.
 * @param coreDataSource - WordPress core-data entity source for generated hooks.
 * @returns Generated TypeScript source for core-data data access.
 */
export function buildCoreDataAdminViewDataSource(
  adminViewSlug: string,
  coreDataSource: AdminViewCoreDataSource,
): string {
  const pascalName = toPascalCase(adminViewSlug);
  const camelName = toCamelCase(adminViewSlug);
  const coreDataRecordTypeName = `${pascalName}CoreDataRecord`;
  const dataSetTypeName = `${pascalName}AdminViewDataSet`;
  const itemTypeName = `${pascalName}AdminViewItem`;
  const queryTypeName = `${pascalName}AdminViewQuery`;
  const dataViewsName = `${camelName}AdminDataViews`;
  const useEntityRecordName = `use${pascalName}EntityRecord`;
  const useEntityRecordsName = `use${pascalName}EntityRecords`;
  const useAdminViewDataName = `use${pascalName}AdminViewData`;
  const querySource = renderAdminViewQuerySource({
    dataViewsName,
    properties: ["perPageParam: 'per_page'"],
    queryTypeName,
  });
  const typesImport = renderNamedTypeScriptTypeImport([
    coreDataRecordTypeName,
    dataSetTypeName,
    itemTypeName,
  ]);

  if (coreDataSource.entityKind === 'taxonomy') {
    return `import type { DataViewsView } from '@wp-typia/dataviews';
import { useEntityRecord, useEntityRecords } from '@wordpress/core-data';
import { useMemo } from '@wordpress/element';

import { ${dataViewsName} } from './config';
${typesImport}

export interface ${queryTypeName} {
\tpage?: number;
\tper_page?: number;
\tsearch?: string;
}

const CORE_DATA_ENTITY_KIND = ${quoteTsString(coreDataSource.entityKind)};
const CORE_DATA_ENTITY_NAME = ${quoteTsString(coreDataSource.entityName)};

function normalizeCoreDataNumber(value: unknown): number {
\treturn typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeCoreDataString(value: unknown): string {
\treturn typeof value === 'string' ? value : '';
}

function normalizeTaxonomyRecord(record: ${coreDataRecordTypeName}): ${itemTypeName} {
\treturn {
\t\tcount: normalizeCoreDataNumber(record.count),
\t\tdescription: normalizeCoreDataString(record.description),
\t\tid: record.id,
\t\tlink: normalizeCoreDataString(record.link),
\t\tname: normalizeCoreDataString(record.name) || normalizeCoreDataString(record.slug),
\t\tparent: normalizeCoreDataNumber(record.parent),
\t\traw: record,
\t\tslug: normalizeCoreDataString(record.slug),
\t\ttaxonomy: normalizeCoreDataString(record.taxonomy),
\t};
}

export function ${useEntityRecordName}(recordId: number | undefined) {
\treturn useEntityRecord<${coreDataRecordTypeName}>(
\t\tCORE_DATA_ENTITY_KIND,
\t\tCORE_DATA_ENTITY_NAME,
\t\trecordId ?? 0,
\t\t{ enabled: typeof recordId === 'number' },
\t);
}

export function ${useEntityRecordsName}(view: DataViewsView<${itemTypeName}>) {
${querySource}

\treturn useEntityRecords<${coreDataRecordTypeName}>(
\t\tCORE_DATA_ENTITY_KIND,
\t\tCORE_DATA_ENTITY_NAME,
\t\tquery,
\t);
}

export function ${useAdminViewDataName}(view: DataViewsView<${itemTypeName}>) {
\tconst { hasResolved, isResolving, records, totalItems, totalPages } =
\t\t${useEntityRecordsName}(view);
\tconst items = useMemo(
\t\t() => (records ?? []).map((record) => normalizeTaxonomyRecord(record)),
\t\t[records],
\t);
\tconst dataSet = useMemo<${dataSetTypeName}>(
\t\t() => ({
\t\t\titems,
\t\t\tpaginationInfo: {
\t\t\t\ttotalItems: totalItems ?? items.length,
\t\t\t\ttotalPages: Math.max(1, totalPages ?? 1),
\t\t\t},
\t\t}),
\t\t[items, totalItems, totalPages],
\t);
\tconst error =
\t\t!isResolving && hasResolved && records === null
\t\t\t? 'Unable to load core-data entity records.'
\t\t\t: null;

\treturn {
\t\tdataSet,
\t\terror,
\t\tisLoading: isResolving,
\t};
}
`;
  }

  return `import type { DataViewsView } from '@wp-typia/dataviews';
import { useEntityRecord, useEntityRecords } from '@wordpress/core-data';
import { useMemo } from '@wordpress/element';

import { ${dataViewsName} } from './config';
${typesImport}

export interface ${queryTypeName} {
\tpage?: number;
\tper_page?: number;
\tsearch?: string;
}

const CORE_DATA_ENTITY_KIND = ${quoteTsString(coreDataSource.entityKind)};
const CORE_DATA_ENTITY_NAME = ${quoteTsString(coreDataSource.entityName)};

function normalizeCoreDataString(value: unknown): string {
\treturn typeof value === 'string' ? value : '';
}

function normalizeCoreDataTitle(record: ${coreDataRecordTypeName}): string {
\tif (typeof record.title === 'string') {
\t\treturn record.title;
\t}
\tif (record.title && typeof record.title === 'object') {
\t\tif (typeof record.title.rendered === 'string') {
\t\t\treturn record.title.rendered;
\t\t}
\t\tif (typeof record.title.raw === 'string') {
\t\t\treturn record.title.raw;
\t\t}
\t}

\treturn (
\t\tnormalizeCoreDataString(record.name) ||
\t\tnormalizeCoreDataString(record.slug)
\t);
}

function normalizeCoreDataUpdatedAt(record: ${coreDataRecordTypeName}): string {
\treturn (
\t\tnormalizeCoreDataString(record.modified) ||
\t\tnormalizeCoreDataString(record.date)
\t);
}

function normalizeCoreDataRecord(record: ${coreDataRecordTypeName}): ${itemTypeName} {
\treturn {
\t\tid: record.id,
\t\traw: record,
\t\tslug: normalizeCoreDataString(record.slug),
\t\tstatus: normalizeCoreDataString(record.status),
\t\ttitle: normalizeCoreDataTitle(record),
\t\tupdatedAt: normalizeCoreDataUpdatedAt(record),
\t};
}

export function ${useEntityRecordName}(recordId: number | undefined) {
\treturn useEntityRecord<${coreDataRecordTypeName}>(
\t\tCORE_DATA_ENTITY_KIND,
\t\tCORE_DATA_ENTITY_NAME,
\t\trecordId ?? 0,
\t\t{ enabled: typeof recordId === 'number' },
\t);
}

export function ${useEntityRecordsName}(view: DataViewsView<${itemTypeName}>) {
${querySource}

\treturn useEntityRecords<${coreDataRecordTypeName}>(
\t\tCORE_DATA_ENTITY_KIND,
\t\tCORE_DATA_ENTITY_NAME,
\t\tquery,
\t);
}

export function ${useAdminViewDataName}(view: DataViewsView<${itemTypeName}>) {
\tconst { hasResolved, isResolving, records, totalItems, totalPages } =
\t\t${useEntityRecordsName}(view);
\tconst items = useMemo(
\t\t() => (records ?? []).map((record) => normalizeCoreDataRecord(record)),
\t\t[records],
\t);
\tconst dataSet = useMemo<${dataSetTypeName}>(
\t\t() => ({
\t\t\titems,
\t\t\tpaginationInfo: {
\t\t\t\ttotalItems: totalItems ?? items.length,
\t\t\t\ttotalPages: Math.max(1, totalPages ?? 1),
\t\t\t},
\t\t}),
\t\t[items, totalItems, totalPages],
\t);
\tconst error =
\t\t!isResolving && hasResolved && records === null
\t\t\t? 'Unable to load core-data entity records.'
\t\t\t: null;

\treturn {
\t\tdataSet,
\t\terror,
\t\tisLoading: isResolving,
\t};
}
`;
}

/**
 * Builds the React screen module for a core-data-backed admin view.
 *
 * @param adminViewSlug - Admin-view slug used to derive generated identifiers.
 * @param textDomain - WordPress i18n text domain for generated labels.
 * @returns Generated TSX source for the core-data admin-view screen.
 */
export function buildCoreDataAdminViewScreenSource(
  adminViewSlug: string,
  textDomain: string,
): string {
  const pascalName = toPascalCase(adminViewSlug);
  const camelName = toCamelCase(adminViewSlug);
  const itemTypeName = `${pascalName}AdminViewItem`;
  const dataSetTypeName = `${pascalName}AdminViewDataSet`;
  const componentName = `${pascalName}AdminViewScreen`;
  const dataViewsName = `${camelName}AdminDataViews`;
  const useAdminViewDataName = `use${pascalName}AdminViewData`;
  const title = toTitleCase(adminViewSlug);
  const typesImport = renderNamedTypeScriptTypeImport([
    dataSetTypeName,
    itemTypeName,
  ]);

  return `import type { DataViewsConfig, DataViewsView } from '@wp-typia/dataviews';
import { Notice, Spinner } from '@wordpress/components';
import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { DataViews } from '@wordpress/dataviews/wp';

import { ${dataViewsName} } from './config';
import { ${useAdminViewDataName} } from './data';
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
\tconst {
\t\tdataSet = EMPTY_DATA_SET,
\t\terror,
\t\tisLoading,
\t} = ${useAdminViewDataName}(view);
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
\t\t\t\t\t\t{ __('This screen reads from the WordPress core-data entity store. Extend data.ts when you need entity-specific field mapping or edit flows.', ${quoteTsString(textDomain)}) }
\t\t\t\t\t</p>
\t\t\t\t</div>
\t\t\t\t<div className="wp-typia-admin-view-screen__actions">
\t\t\t\t\t{ isLoading ? <Spinner /> : null }
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
