import { describe, expect, test } from 'bun:test';

import {
  createDataFormConfig,
  defineDataViews,
  type DataFormField,
  type DataViewsField,
} from '../src/index.js';

interface Product {
  readonly id: number;
  readonly price: number;
  readonly sku: string;
  readonly status: 'draft' | 'publish';
  readonly summary: string;
  readonly title: string;
}

describe('DataForm helpers', () => {
  test('generates single-record form config from normalized fields', () => {
    const views = defineDataViews<Product>({
      defaultView: { type: 'table' },
      fields: {
        id: { readOnly: true, schema: { type: 'integer' } },
        price: { description: 'Retail price', schema: { type: 'number' } },
        title: { label: 'Product title', schema: { type: 'string' } },
      },
      idField: 'id',
    });

    expect(views.toFormConfig()).toEqual({
      fields: [
        {
          children: undefined,
          description: 'Retail price',
          id: 'price',
          label: 'Price',
          layout: undefined,
        },
        {
          children: undefined,
          description: undefined,
          id: 'title',
          label: 'Product title',
          layout: undefined,
        },
      ],
    });
  });

  test('supports custom field order, nested fields, read-only inclusion, and layouts', () => {
    const views = defineDataViews<Product>({
      defaultView: { type: 'table' },
      fields: {
        id: { readOnly: true, schema: { type: 'integer' } },
        price: { schema: { type: 'number' } },
        sku: { schema: { type: 'string' } },
        title: { schema: { type: 'string' } },
      },
    });
    const defaultLayout = { isOpened: true, summary: ['title', 'sku'], type: 'card' } as const;
    const identityLayout = { summary: 'title', type: 'panel' } as const;
    const identityCard = {
      children: [{ id: 'title' }, { id: 'sku', label: 'Stock keeping unit' }],
      id: 'id',
      label: 'Identity',
      layout: identityLayout,
    } satisfies DataFormField<Product>;

    expect(
      views.toFormConfig({
        fields: [identityCard, 'price'],
        includeReadOnly: true,
        layout: defaultLayout,
      }),
    ).toEqual({
      fields: [
        {
          children: [
            {
              children: undefined,
              description: undefined,
              id: 'title',
              label: 'Title',
              layout: defaultLayout,
            },
            {
              children: undefined,
              description: undefined,
              id: 'sku',
              label: 'Stock keeping unit',
              layout: defaultLayout,
            },
          ],
          description: undefined,
          id: 'id',
          label: 'Identity',
          layout: identityLayout,
        },
        {
          children: undefined,
          description: undefined,
          id: 'price',
          label: 'Price',
          layout: defaultLayout,
        },
      ],
    });
    expect(views.toFormConfig({ fields: ['id', 'price'] }).fields.map((field) => field.id)).toEqual([
      'price',
    ]);
    expect(views.toFormConfig({ includeReadOnly: false }).fields.map((field) => field.id)).toEqual([
      'price',
      'sku',
      'title',
    ]);
    expect(views.toFormConfig({ includeReadOnly: true }).fields.map((field) => field.id)).toEqual([
      'id',
      'price',
      'sku',
      'title',
    ]);

    const nestedFilteredForm = views.toFormConfig({
      fields: [{ children: [{ id: 'id' }, { id: 'sku' }], id: 'title' }],
    });
    expect(nestedFilteredForm.fields[0]?.children?.map((field) => field.id)).toEqual(['sku']);
  });

  test('maps schema metadata into DataForm validation hints', () => {
    const customSummaryValidation = (
      item: Product,
      field: DataViewsField<Product, string>,
    ) => (item.summary.length > 0 && field.id === 'summary' ? null : 'Summary is required.');
    const views = defineDataViews<Product>({
      defaultView: { type: 'table' },
      fields: {
        price: {
          schema: { max: 750, maximum: 999, min: 5, minimum: 0, type: 'number' },
        },
        sku: {
          schema: { maxLength: 32, pattern: '^[A-Z0-9-]+$', required: true, type: 'string' },
        },
        status: {
          schema: { enum: ['draft', 'publish'], type: 'string' },
        },
        summary: {
          isValid: { custom: customSummaryValidation, minLength: 20 },
          schema: { maxLength: 200, minLength: 10, type: 'string' },
        },
      },
    });

    expect(views.fieldMap.price?.isValid).toEqual({ max: 750, min: 5 });
    expect(views.fieldMap.sku?.isValid).toEqual({
      maxLength: 32,
      pattern: '^[A-Z0-9-]+$',
      required: true,
    });
    expect(views.fieldMap.status?.isValid).toEqual({ elements: true });
    expect(views.fieldMap.summary?.isValid).toEqual({
      custom: customSummaryValidation,
      maxLength: 200,
      minLength: 20,
    });
  });

  test('creates standalone form configs from DataViews fields', () => {
    const form = createDataFormConfig<Product>(
      [
        { id: 'title', label: 'Title', type: 'text' },
        { description: 'Internal SKU', id: 'sku', label: 'SKU', type: 'text' },
      ],
      {
        fields: ['sku'],
        layout: { labelPosition: 'side', type: 'regular' },
      },
    );

    expect(form).toEqual({
      fields: [
        {
          children: undefined,
          description: 'Internal SKU',
          id: 'sku',
          label: 'SKU',
          layout: { labelPosition: 'side', type: 'regular' },
        },
      ],
    });
  });

  test('keeps group-only fields while filtering read-only children during normalization', () => {
    const views = defineDataViews<Product>({
      defaultView: { type: 'table' },
      fields: {
        id: { readOnly: true, schema: { type: 'integer' } },
        sku: { schema: { type: 'string' } },
        title: { schema: { type: 'string' } },
      },
    });
    const form = views.toFormConfig({
      fields: [
        {
          children: ['id', 'sku', 'title'] as unknown as DataFormField<Product>[],
          id: 'identity' as never,
          label: 'Identity',
        } as unknown as DataFormField<Product>,
      ],
    });

    expect(form.fields).toHaveLength(1);
    expect(form.fields[0]?.id as unknown as string).toBe('identity');
    expect(form.fields[0]?.label).toBe('Identity');
    expect(form.fields[0]?.children?.map((field) => field.id)).toEqual([
      'sku',
      'title',
    ]);
    expect(form.fields[0]?.children?.map((field) => field.label)).toEqual([
      'Sku',
      'Title',
    ]);
  });
});
