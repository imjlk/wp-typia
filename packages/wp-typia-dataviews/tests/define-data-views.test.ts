import { describe, expect, test } from 'bun:test';

import { defineDataViews, type DataViewsView } from '../src/index.js';

interface Product {
  readonly createdAt: string;
  readonly featured: boolean;
  readonly homepage: string;
  readonly id: number;
  readonly metadata: { readonly sku: string };
  readonly price: number;
  readonly publishedOn: string;
  readonly status: 'draft' | 'publish';
  readonly title: string;
  readonly views: number;
}

const sampleProduct: Product = {
  createdAt: '2026-04-26T00:00:00Z',
  featured: true,
  homepage: 'https://example.com',
  id: 1,
  metadata: { sku: 'WP-TYPIA-1' },
  price: 19.99,
  publishedOn: '2026-04-26',
  status: 'publish',
  title: 'Typed block patterns',
  views: 42,
};

describe('defineDataViews', () => {
  test('supports empty and minimal field definitions', () => {
    const emptyViews = defineDataViews<Product>({
      defaultView: { type: 'table' },
      fields: {},
    });
    const minimalViews = defineDataViews<Product>({
      defaultView: { type: 'table' },
      fields: {
        title: {},
      },
    });

    expect(emptyViews.fields).toEqual([]);
    expect(emptyViews.defaultView).toEqual({
      fields: [],
      type: 'table',
    });
    expect(emptyViews.createConfig({ data: [] }).fields).toEqual([]);
    expect(emptyViews.getItemId).toBeUndefined();
    expect(minimalViews.fieldMap.title).toMatchObject({
      id: 'title',
      label: 'Title',
    });
    expect(minimalViews.fieldMap.title?.description).toBeUndefined();
    expect(minimalViews.fieldMap.title?.elements).toBeUndefined();
    expect(minimalViews.fieldMap.title?.type).toBeUndefined();
    expect(minimalViews.defaultView).toEqual({
      fields: ['title'],
      type: 'table',
    });
  });

  test('normalizes primitive schema metadata into DataViews field types', () => {
    const views = defineDataViews<Product>({
      defaultView: { type: 'table' },
      fields: {
        featured: { schema: { type: 'boolean' } },
        price: { schema: { type: 'number' } },
        title: { schema: { type: 'string' } },
        views: { schema: { type: 'integer' } },
      },
      idField: 'id',
      titleField: 'title',
    });

    expect(views.fields).toEqual([
      { id: 'featured', label: 'Featured', type: 'boolean' },
      { id: 'price', label: 'Price', type: 'number' },
      { id: 'title', label: 'Title', type: 'text' },
      { id: 'views', label: 'Views', type: 'integer' },
    ]);
    expect('isValid' in (views.fieldMap.featured ?? {})).toBe(false);
    expect(views.defaultView).toEqual({
      fields: ['featured', 'price', 'title', 'views'],
      titleField: 'title',
      type: 'table',
    });
    expect(views.createConfig({ data: [sampleProduct] }).getItemId?.(sampleProduct)).toBe(
      '1',
    );
  });

  test('normalizes enum metadata into typed field elements', () => {
    const views = defineDataViews<Product>({
      defaultView: { type: 'table' },
      fields: {
        status: {
          schema: {
            enum: ['draft', 'publish'],
            enumLabels: { publish: 'Published' },
            type: 'string',
          },
        },
      },
    });

    expect(views.fieldMap.status?.elements).toEqual([
      { label: 'Draft', value: 'draft' },
      { label: 'Published', value: 'publish' },
    ]);
  });

  test('normalizes schema-only fields with const elements and schema descriptions', () => {
    const views = defineDataViews<Product>({
      defaultView: { type: 'table' },
      fields: {
        status: {
          schema: {
            const: 'draft',
            description: 'Single supported status',
            type: 'string',
          },
        },
      },
    });

    expect(views.fieldMap.status).toMatchObject({
      description: 'Single supported status',
      elements: [{ label: 'Draft', value: 'draft' }],
      id: 'status',
      label: 'Status',
      type: 'text',
    });
    expect(views.fieldMap.status?.isValid).toEqual({ elements: true });
  });

  test('normalizes date-like and URL metadata while preserving field options', () => {
    const views = defineDataViews<Product>({
      defaultView: {
        filters: [
          { field: 'createdAt', operator: 'after', value: '2026-01-01' },
        ],
        sort: { direction: 'desc', field: 'createdAt' },
        type: 'table',
      },
      fields: {
        createdAt: {
          enableGlobalSearch: true,
          enableHiding: false,
          enableSorting: true,
          format: { datetime: 'M j, Y g:i a', weekStartsOn: 1 },
          label: 'Created',
          schema: {
            description: 'Creation time',
            format: 'date-time',
            type: 'string',
          },
        },
        homepage: {
          schema: { format: 'uri', type: 'string' },
        },
        publishedOn: {
          filterBy: { operators: ['on', 'beforeInc', 'afterInc'] },
          schema: { format: 'date', type: 'string' },
        },
      },
    });

    expect(views.fieldMap.createdAt).toMatchObject({
      description: 'Creation time',
      enableGlobalSearch: true,
      enableHiding: false,
      enableSorting: true,
      format: { datetime: 'M j, Y g:i a', weekStartsOn: 1 },
      id: 'createdAt',
      label: 'Created',
      type: 'datetime',
    });
    expect(views.fieldMap.homepage).toMatchObject({
      id: 'homepage',
      label: 'Homepage',
      type: 'url',
    });
    expect(views.fieldMap.publishedOn).toMatchObject({
      filterBy: { operators: ['on', 'beforeInc', 'afterInc'] },
      id: 'publishedOn',
      label: 'Published On',
      type: 'date',
    });
  });

  test('skips optional field entries explicitly set to undefined', () => {
    const views = defineDataViews<Product>({
      defaultView: { type: 'table' },
      fields: {
        title: undefined,
        views: { schema: { type: 'integer' } },
      },
    });

    expect(views.fields).toEqual([
      { id: 'views', label: 'Views', type: 'integer' },
    ]);
    expect(views.defaultView.fields).toEqual(['views']);
  });

  test('preserves object schema metadata when object is the only array type', () => {
    const views = defineDataViews<Product>({
      defaultView: { type: 'table' },
      fields: {
        metadata: { schema: { type: ['object'] } },
      },
    });

    expect(views.fieldMap.metadata).toMatchObject({
      id: 'metadata',
      label: 'Metadata',
      type: 'object',
    });
  });

  test('allows createConfig callers to override item identity callbacks', () => {
    const views = defineDataViews<Product>({
      defaultView: { type: 'table' },
      fields: {
        title: { schema: { type: 'string' } },
      },
      getItemLevel: (product) => product.views,
      idField: 'id',
    });
    const config = views.createConfig({
      data: [sampleProduct],
      getItemId: (product) => `product:${product.id}`,
      getItemLevel: () => 2,
    });

    expect(config.getItemId?.(sampleProduct)).toBe('product:1');
    expect(config.getItemLevel?.(sampleProduct)).toBe(2);
  });

  test('merges schema validation hints with explicit field validation overrides', () => {
    const customValidation = () => null;
    const views = defineDataViews<Product>({
      defaultView: { type: 'table' },
      fields: {
        title: {
          isValid: {
            custom: customValidation,
            maxLength: 80,
            minLength: 20,
            required: false,
          },
          schema: {
            maxLength: 120,
            minLength: 10,
            required: true,
            type: 'string',
          },
        },
      },
    });

    expect(views.fieldMap.title?.isValid).toEqual({
      custom: customValidation,
      maxLength: 80,
      minLength: 20,
      required: false,
    });
  });

  test('normalizes only declared default views and trusts runtime override views as-is', () => {
    const views = defineDataViews<Product>({
      defaultView: {
        sort: { direction: 'desc', field: 'views' },
        type: 'table',
      },
      fields: {
        title: { schema: { type: 'string' } },
        views: { schema: { type: 'integer' } },
      },
      titleField: 'title',
    });
    const runtimeViewOverride = { type: 'grid' } as DataViewsView<Product>;

    expect(views.defaultView).toEqual({
      fields: ['title', 'views'],
      sort: { direction: 'desc', field: 'views' },
      titleField: 'title',
      type: 'table',
    });
    expect(views.createConfig({ data: [sampleProduct], view: runtimeViewOverride }).view).toBe(
      runtimeViewOverride,
    );
  });

  test('guards unsafe idField values when runtime input bypasses the type contract', () => {
    const views = defineDataViews<Product>({
      defaultView: { type: 'table' },
      fields: {
        title: { schema: { type: 'string' } },
      },
      idField: 'metadata' as never,
    });

    expect(() => views.createConfig({ data: [sampleProduct] }).getItemId?.(sampleProduct)).toThrow(
      'idField "metadata" must resolve to a string or finite number',
    );
  });
});
