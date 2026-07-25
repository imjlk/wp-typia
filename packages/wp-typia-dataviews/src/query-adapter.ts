import type {
  DataViewsFieldId,
  DataViewsQueryAdapterArguments,
  DataViewsQueryAdapterFactoryArguments,
  DataViewsQueryAdapterMapContext,
  DataViewsQueryAdapterRuntimeOptions,
  DataViewsQueryArgs,
  DataViewsQueryMapperResult,
  DataViewsQueryParamName,
  DataViewsQuerySortMap,
  DataViewsQuerySortValue,
  DataViewsRecord,
  DataViewsView,
  QueryAdapter,
} from './types.js';

export function createDataViewsQueryAdapter<
  TItem extends object = DataViewsRecord,
  TQuery extends object = DataViewsQueryArgs,
>(
  ...args: DataViewsQueryAdapterFactoryArguments<TItem, TQuery>
): QueryAdapter<TItem, Partial<TQuery>> {
  return (view, context) =>
    toDataViewsQueryArgs<TItem, TQuery>(
      view,
      ...([args[0], context] as DataViewsQueryAdapterArguments<TItem, TQuery>),
    );
}

export function toDataViewsQueryArgs<
  TItem extends object = DataViewsRecord,
  TQuery extends object = DataViewsQueryArgs,
>(
  view: DataViewsView<TItem>,
  ...args: DataViewsQueryAdapterArguments<TItem, TQuery>
): Partial<TQuery> {
  const options = (args[0] ?? {}) as DataViewsQueryAdapterRuntimeOptions<TItem, TQuery>;
  const context = args[1] ?? { fields: [] };
  const query: Record<string, unknown> = {};
  const mapContext: DataViewsQueryAdapterMapContext<TItem> = {
    ...context,
    view,
  };

  assignDataViewsQueryParam(query, options.pageParam, 'page', view.page);
  assignDataViewsQueryParam(
    query,
    options.perPageParam,
    'per_page',
    view.perPage,
  );
  assignDataViewsQueryParam(query, options.searchParam, 'search', view.search);
  mergeDataViewsSortQuery(query, view, options, mapContext);
  mergeDataViewsFilterQueries(query, view, options, mapContext);

  return query as Partial<TQuery>;
}

function assignDataViewsQueryParam<TQuery extends object>(
  query: Record<string, unknown>,
  param: DataViewsQueryParamName<TQuery> | false | undefined,
  defaultParam: string,
  value: unknown,
): void {
  if (param === false || value === undefined) {
    return;
  }

  query[param ?? defaultParam] = value;
}

function mergeDataViewsSortQuery<TItem extends object, TQuery extends object>(
  query: Record<string, unknown>,
  view: DataViewsView<TItem>,
  options: DataViewsQueryAdapterRuntimeOptions<TItem, TQuery>,
  context: DataViewsQueryAdapterMapContext<TItem>,
): void {
  if (view.sort === undefined || options.mapSort === undefined) {
    return;
  }

  if (typeof options.mapSort === 'function') {
    mergeDataViewsQueryResult(query, options.mapSort(view.sort, context));
    return;
  }

  const orderBy = getDataViewsQuerySortMapValue(
    options.mapSort,
    view.sort.field,
  );

  if (orderBy === undefined) {
    return;
  }

  if (options.orderByParam === false) {
    return;
  }

  assignDataViewsQueryParam(query, options.orderByParam, 'orderby', orderBy);
  assignDataViewsQueryParam(
    query,
    options.orderParam,
    'order',
    view.sort.direction,
  );
}

function getDataViewsQuerySortMapValue<TItem extends object>(
  mapSort: DataViewsQuerySortMap<TItem>,
  field: DataViewsFieldId<TItem>,
): DataViewsQuerySortValue | undefined {
  if (!Object.prototype.hasOwnProperty.call(mapSort, field)) {
    return undefined;
  }

  return mapSort[field];
}

function mergeDataViewsFilterQueries<TItem extends object, TQuery extends object>(
  query: Record<string, unknown>,
  view: DataViewsView<TItem>,
  options: DataViewsQueryAdapterRuntimeOptions<TItem, TQuery>,
  context: DataViewsQueryAdapterMapContext<TItem>,
): void {
  if (options.mapFilter === undefined) {
    return;
  }

  for (const filter of view.filters ?? []) {
    mergeDataViewsQueryResult(query, options.mapFilter(filter, context));
  }
}

function mergeDataViewsQueryResult<TQuery extends object>(
  query: Record<string, unknown>,
  result: DataViewsQueryMapperResult<TQuery>,
): void {
  if (result === undefined || result === null) {
    return;
  }

  Object.assign(query, result);
}
