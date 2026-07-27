import { describe, expect, test } from 'bun:test';

import {
  createDataViewsQueryAdapter,
  defineDataViews,
  toDataViewsQueryArgs,
  type DataViewsRecord,
  type DataViewsView,
} from '../src/index.js';

interface Product {
  readonly createdAt: string;
  readonly featured: boolean;
  readonly id: number;
  readonly status: 'draft' | 'publish';
  readonly title: string;
  readonly views: number;
}

interface WordPressProductQuery {
  readonly max_views?: number;
  readonly order?: 'asc' | 'desc';
  readonly orderby?: 'date' | 'title' | 'views';
  readonly page?: number;
  readonly per_page?: number;
  readonly search?: string;
  readonly status?: readonly Product['status'][];
}

interface CompactProductQuery {
  readonly pageNo?: number;
  readonly q?: string;
}

const productView = {
  filters: [
    { field: 'status', operator: 'isAny', value: ['draft', 'publish'] },
    { field: 'views', operator: 'lessThanOrEqual', value: 500 },
    { field: 'featured', operator: 'is', value: true },
  ],
  page: 2,
  perPage: 20,
  search: 'typed blocks',
  sort: { direction: 'desc', field: 'createdAt' },
  type: 'table',
} as const satisfies DataViewsView<Product>;

describe('DataViews query adapters', () => {
  test('maps pagination, search, sort, and supported filters into WordPress REST args', () => {
    const query = toDataViewsQueryArgs<Product, WordPressProductQuery>(productView, {
      mapFilter: (filter) => {
        if (filter.field === 'status' && filter.operator === 'isAny') {
          return { status: filter.value as readonly Product['status'][] };
        }

        if (filter.field === 'views' && filter.operator === 'lessThanOrEqual') {
          return { max_views: filter.value as number };
        }

        return undefined;
      },
      mapSort: {
        createdAt: 'date',
        title: 'title',
        views: 'views',
      },
    });

    expect(query).toEqual({
      max_views: 500,
      order: 'desc',
      orderby: 'date',
      page: 2,
      per_page: 20,
      search: 'typed blocks',
      status: ['draft', 'publish'],
    });
  });

  test('leaves filters and unmapped sort fields as explicit no-ops', () => {
    const query = toDataViewsQueryArgs<Product, WordPressProductQuery>(
      {
        ...productView,
        filters: [{ field: 'featured', operator: 'is', value: true }],
        sort: { direction: 'asc', field: 'featured' },
      },
      {
        mapFilter: () => undefined,
        mapSort: {
          createdAt: 'date',
        },
      },
    );

    expect(query).toEqual({
      page: 2,
      per_page: 20,
      search: 'typed blocks',
    });
  });

  test('supports custom sort mapper functions and disabled default param names', () => {
    const query = toDataViewsQueryArgs<Product, WordPressProductQuery>(productView, {
      mapSort: (sort) => ({ order: sort.direction, orderby: 'date' }),
      pageParam: false,
      perPageParam: false,
      searchParam: false,
    });

    expect(query).toEqual({
      order: 'desc',
      orderby: 'date',
    });
  });

  test('keeps missing view data and later filter mappings as runtime no-ops or overrides', () => {
    const query = toDataViewsQueryArgs<
      Product,
      { readonly status?: Product['status']; readonly title?: string }
    >(
      {
        filters: [
          { field: 'status', operator: 'is', value: 'draft' },
          { field: 'status', operator: 'is', value: 'publish' },
          { field: 'title', operator: 'is', value: 'Typed block patterns' },
        ],
        type: 'table',
      },
      {
        mapFilter: (filter) => {
          if (filter.field === 'status' && filter.operator === 'is') {
            return { status: filter.value as Product['status'] };
          }

          return filter.field === 'title'
            ? { title: filter.value as string }
            : null;
        },
        pageParam: false,
        perPageParam: false,
        searchParam: false,
      },
    );

    expect(query).toEqual({
      status: 'publish',
      title: 'Typed block patterns',
    });
  });

  test('treats orderByParam false as static sort map suppression', () => {
    const query = toDataViewsQueryArgs<Product, WordPressProductQuery>(productView, {
      mapSort: {
        createdAt: 'date',
      },
      orderByParam: false,
      pageParam: false,
      perPageParam: false,
      searchParam: false,
    });

    expect(query).toEqual({});
  });

  test('ignores inherited keys when static sort maps do not own the field', () => {
    const query = toDataViewsQueryArgs<DataViewsRecord, WordPressProductQuery>(
      {
        sort: { direction: 'asc', field: 'toString' },
        type: 'table',
      },
      {
        mapSort: {
          createdAt: 'date',
        },
      },
    );

    expect(query).toEqual({});
  });

  test('creates reusable QueryAdapter functions with field context', () => {
    const adapter = createDataViewsQueryAdapter<Product, WordPressProductQuery>({
      mapFilter: (filter, context) => {
        const hasField = context.fields.some((field) => field.id === filter.field);

        if (hasField && filter.field === 'status' && filter.operator === 'isAny') {
          return { status: filter.value as readonly Product['status'][] };
        }

        return undefined;
      },
    });

    expect(
      adapter(productView, {
        fields: [
          { id: 'status', label: 'Status', type: 'text' },
          { id: 'title', label: 'Title', type: 'text' },
        ],
      }),
    ).toEqual({
      page: 2,
      per_page: 20,
      search: 'typed blocks',
      status: ['draft', 'publish'],
    });
  });

  test('requires explicit default param remapping for compact query shapes', () => {
    const query = toDataViewsQueryArgs<Product, CompactProductQuery>(productView, {
      pageParam: 'pageNo',
      perPageParam: false,
      searchParam: 'q',
    });

    expect(query).toEqual({
      pageNo: 2,
      q: 'typed blocks',
    });
  });

  test('returns an empty query when the view has no mapped runtime state', () => {
    expect(
      toDataViewsQueryArgs<Product, CompactProductQuery>(
        { type: 'table' },
        {
          pageParam: false,
          perPageParam: false,
          searchParam: false,
        },
      ),
    ).toEqual({});
  });

  test('exposes toQueryArgs from defineDataViews with normalized fields context', () => {
    const productViews = defineDataViews<Product>({
      defaultView: productView,
      fields: {
        status: { schema: { enum: ['draft', 'publish'], type: 'string' } },
        title: { schema: { type: 'string' } },
      },
      idField: 'id',
    });

    const query = productViews.toQueryArgs<WordPressProductQuery>(productView, {
      mapFilter: (filter, context) => {
        const statusField = context.fields.find((field) => field.id === 'status');

        if (statusField !== undefined && filter.field === 'status') {
          return { status: filter.value as readonly Product['status'][] };
        }

        return undefined;
      },
    });

    expect(query).toEqual({
      page: 2,
      per_page: 20,
      search: 'typed blocks',
      status: ['draft', 'publish'],
    });
  });
});
