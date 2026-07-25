import type {
  DataFormConfig,
  DataFormConfigOptions,
  DataFormFieldInput,
  DataFormFieldLayout,
  DataFormPanelFieldSummary,
  DataViewsAction,
  DataViewsConfig,
  DataViewsField,
  DataViewsFieldValidationRules,
  DataViewsQueryAdapterOptions,
  DataViewsView,
  DefinedDataViews,
  DefineDataViewsInput,
  QueryAdapter,
} from '@wp-typia/dataviews';
import {
  createDataFormConfig,
  createDataViewsQueryAdapter,
  defineDataViews,
  toDataViewsQueryArgs,
} from '@wp-typia/dataviews';

interface Book {
  readonly createdAt: string;
  readonly id: number;
  readonly metadata: { readonly isbn: string };
  readonly published: boolean;
  readonly status: 'draft' | 'publish';
  readonly title: string;
  readonly views: number;
}

interface BookQuery {
  readonly order?: 'asc' | 'desc';
  readonly orderby?: 'date' | 'title' | 'views';
  readonly page?: number;
  readonly per_page?: number;
  readonly search?: string;
  readonly status?: readonly Book['status'][];
}

interface CompactBookQuery {
  readonly q?: string;
}

const fields = [
  {
    id: 'title',
    label: 'Title',
    type: 'text',
  },
  {
    enableSorting: true,
    id: 'views',
    label: 'Views',
    sort: (left, right, direction) =>
      direction === 'asc' ? left.views - right.views : right.views - left.views,
    type: 'integer',
  },
] as const satisfies readonly DataViewsField<Book>[];

const view = {
  fields: ['title', 'status'],
  filters: [
    { field: 'status', operator: 'isAny', value: ['draft', 'publish'] },
    { field: 'status', operator: 'isAll', value: ['publish'] },
    { field: 'views', operator: 'lessThanOrEqual', value: 500 },
  ],
  page: 1,
  perPage: 10,
  search: 'plugin',
  sort: { direction: 'desc', field: 'views' },
  titleField: 'title',
  type: 'table',
} as const satisfies DataViewsView<Book>;

const action = {
  callback: (items) => {
    items.map((item) => item.id);
  },
  id: 'archive',
  label: 'Archive',
  supportsBulk: true,
} satisfies DataViewsAction<Book>;

const config = {
  actions: [action],
  data: [],
  fields,
  onChangeSelection: (selection) => {
    selection.map((id) => id.toUpperCase());
  },
  selection: ['1'],
  view,
} satisfies DataViewsConfig<Book>;

const form = {
  fields: [{ id: 'title', label: 'Title' }],
} satisfies DataFormConfig<Book>;

const formOptions = {
  fields: [
    {
      children: [{ id: 'title' }],
      id: 'metadata',
      layout: { isOpened: false, summary: 'title', type: 'card' },
      label: 'Metadata',
    },
    'views',
  ],
  includeReadOnly: true,
} satisfies DataFormConfigOptions<Book>;

const titleValidation = {
  custom: (item, field) =>
    field.id === 'title' && item.title.length >= 3
      ? null
      : 'Title is too short.',
  maxLength: 120,
  minLength: 3,
  pattern: '^[A-Z]',
  required: true,
} satisfies DataViewsFieldValidationRules<Book, string>;

const regularLayout = {
  labelPosition: 'top',
  type: 'regular',
} satisfies DataFormFieldLayout<Book>;

const panelSummary = 'title' satisfies DataFormPanelFieldSummary<Book>;

const invalidPanelSummary = [
  // @ts-expect-error panel summaries do not support card-only visibility items.
  {
    id: 'title',
    visibility: 'always',
  },
] satisfies DataFormPanelFieldSummary<Book>;

const formFieldInputs = [
  'title',
  {
    id: 'views',
    layout: regularLayout,
  },
] satisfies readonly DataFormFieldInput<Book>[];

const bookViews = defineDataViews<Book>({
  defaultView: {
    filters: [
      { field: 'status', operator: 'isAny', value: ['draft', 'publish'] },
    ],
    sort: { direction: 'desc', field: 'views' },
    type: 'table',
  },
  fields: {
    createdAt: {
      format: { datetime: 'M j, Y g:i a' },
      schema: { format: 'date-time', type: 'string' },
    },
    published: { schema: { type: 'boolean' } },
    status: {
      elements: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'publish' },
      ],
      filterBy: { operators: ['isAny', 'isNone'] },
      schema: { enum: ['draft', 'publish'], type: 'string' },
    },
    title: {
      description: 'Book title',
      enableGlobalSearch: true,
      enableHiding: false,
      isValid: titleValidation,
      label: 'Title',
      schema: { maxLength: 160, minLength: 1, required: true, type: 'string' },
    },
    views: {
      enableSorting: true,
      schema: { maximum: 100_000, minimum: 0, type: 'integer' },
    },
  },
  idField: 'id',
  titleField: 'title',
}) satisfies DefinedDataViews<Book>;

const configInput = {
  defaultView: { type: 'table' },
  fields: {
    title: { schema: { type: 'string' } },
  },
} satisfies DefineDataViewsInput<Book>;

const adapter: QueryAdapter<Book, { page?: number; per_page?: number; search?: string }> = (
  currentView,
) => {
  const query: { page?: number; per_page?: number; search?: string } = {};

  if (currentView.page !== undefined) {
    query.page = currentView.page;
  }
  if (currentView.perPage !== undefined) {
    query.per_page = currentView.perPage;
  }
  if (currentView.search !== undefined) {
    query.search = currentView.search;
  }

  return query;
};

const queryOptions = {
  mapFilter: (filter) => {
    if (filter.field === 'status' && filter.operator === 'isAny') {
      return { status: filter.value as readonly Book['status'][] };
    }

    return undefined;
  },
  mapSort: {
    createdAt: 'date',
    title: 'title',
    views: 'views',
  },
} satisfies DataViewsQueryAdapterOptions<Book, BookQuery>;

const reusableQueryAdapter = createDataViewsQueryAdapter<Book, BookQuery>(
  queryOptions,
);
const queryArgs = toDataViewsQueryArgs<Book, BookQuery>(view, queryOptions);
const definedQueryArgs = bookViews.toQueryArgs<BookQuery>(view, queryOptions);
const standaloneFormConfig = createDataFormConfig<Book>(fields, {
  fields: formFieldInputs,
  layout: regularLayout,
});
const definedFormConfig = bookViews.toFormConfig(formOptions);

const compactQueryOptions = {
  pageParam: false,
  perPageParam: false,
  searchParam: 'q',
} satisfies DataViewsQueryAdapterOptions<Book, CompactBookQuery>;

const compactReusableQueryAdapter = createDataViewsQueryAdapter<Book, CompactBookQuery>(
  compactQueryOptions,
);
const compactQueryArgs = toDataViewsQueryArgs<Book, CompactBookQuery>(
  view,
  compactQueryOptions,
);
const definedCompactQueryArgs = bookViews.toQueryArgs<CompactBookQuery>(
  view,
  compactQueryOptions,
);

// @ts-expect-error strict query types must disable or remap default query params.
toDataViewsQueryArgs<Book, CompactBookQuery>(view);

// @ts-expect-error strict query adapter factories must disable or remap default query params.
createDataViewsQueryAdapter<Book, CompactBookQuery>();

// @ts-expect-error defined helpers must disable or remap default query params.
bookViews.toQueryArgs<CompactBookQuery>(view);

const invalidCompactSortQueryOptions = {
  mapSort: {
    views: 'views',
  },
  pageParam: false,
  perPageParam: false,
  searchParam: 'q',
  // @ts-expect-error static sort maps must disable or remap default sort params.
} satisfies DataViewsQueryAdapterOptions<Book, CompactBookQuery>;

const invalidQueryOptions = {
  mapSort: {
    // @ts-expect-error mapSort fields must be keys of Book.
    missing: 'missing',
  },
} satisfies DataViewsQueryAdapterOptions<Book, BookQuery>;

const invalidQueryParamOptions = {
  // @ts-expect-error pageParam must be a BookQuery key or false.
  pageParam: 'paged',
} satisfies DataViewsQueryAdapterOptions<Book, BookQuery>;

// @ts-expect-error wp-typia owns the initial supported layout union.
const unsupportedView = { type: 'calendar' } satisfies DataViewsView<Book>;

defineDataViews<Book>({
  defaultView: { type: 'table' },
  fields: {
    // @ts-expect-error field ids must be keys of Book.
    missing: { label: 'Missing' },
  },
});

defineDataViews<Book>({
  defaultView: { type: 'table' },
  fields: {},
  // @ts-expect-error idField must be a key of Book.
  idField: 'missing',
});

defineDataViews<Book>({
  defaultView: { type: 'table' },
  fields: {},
  // @ts-expect-error idField must reference a string or number field.
  idField: 'metadata',
});

defineDataViews<Book>({
  defaultView: { type: 'table' },
  fields: {
    status: {
      elements: [
        // @ts-expect-error element values must match the field value type.
        { label: 'Private', value: 'private' },
      ],
    },
  },
});

const invalidSortView = {
  // @ts-expect-error sort fields must be keys of Book.
  sort: { direction: 'asc', field: 'missing' },
  type: 'table',
} satisfies DataViewsView<Book>;

void config;
void configInput;
void compactQueryArgs;
void compactReusableQueryAdapter(view, { fields });
void definedCompactQueryArgs;
void definedFormConfig;
void standaloneFormConfig;
void form;
void formOptions;
void panelSummary;
void regularLayout;
void invalidCompactSortQueryOptions;
void invalidPanelSummary;
void adapter(view, { fields });
void bookViews.createConfig({ data: [] });
void definedQueryArgs;
void invalidQueryOptions;
void invalidQueryParamOptions;
void invalidSortView;
void queryArgs;
void reusableQueryAdapter(view, { fields });
void unsupportedView;
