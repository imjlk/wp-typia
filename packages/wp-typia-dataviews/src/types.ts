/**
 * Stable wp-typia-owned DataViews layout identifiers.
 *
 * @remarks
 * These names mirror the WordPress DataViews layouts that generated admin
 * surfaces are expected to target first. Keeping the union local lets wp-typia
 * absorb upstream Gutenberg churn without making generated projects depend on
 * Gutenberg's internal TypeScript declarations as their public contract.
 */
export const DATAVIEWS_LAYOUT_TYPES = [
  "table",
  "grid",
  "list",
  "activity",
  "pickerTable",
  "pickerGrid",
] as const;

export type DataViewsLayoutType = (typeof DATAVIEWS_LAYOUT_TYPES)[number];

/**
 * Narrow field vocabulary used by wp-typia scaffold and adapter contracts.
 *
 * @remarks
 * This intentionally stays smaller than upstream DataViews. Project-specific
 * field behavior should be expressed through callbacks and adapter code instead
 * of leaking upstream component types into this package.
 */
export const DATAVIEWS_FIELD_TYPES = [
  "text",
  "integer",
  "number",
  "date",
  "datetime",
  "boolean",
  "email",
  "url",
  "media",
  "array",
  "object",
] as const;

export type DataViewsFieldType = (typeof DATAVIEWS_FIELD_TYPES)[number];

export const DATAVIEWS_SORT_DIRECTIONS = ["asc", "desc"] as const;

export type DataViewsSortDirection = (typeof DATAVIEWS_SORT_DIRECTIONS)[number];

export const DATAVIEWS_FILTER_OPERATORS = [
  "is",
  "isNot",
  "isAny",
  "isNone",
  "isAll",
  "contains",
  "notContains",
  "startsWith",
  "lessThan",
  "lessThanOrEqual",
  "greaterThan",
  "greaterThanOrEqual",
  "between",
  "on",
  "notOn",
  "before",
  "beforeInc",
  "after",
  "afterInc",
  "inThePast",
  "over",
] as const;

export type DataViewsFilterOperator = (typeof DATAVIEWS_FILTER_OPERATORS)[number];

export type DataViewsRecord = Record<string, unknown>;

export type DataViewsFieldId<TItem extends object = DataViewsRecord> = Extract<
  keyof TItem,
  string
>;

export type DataViewsScalar = boolean | number | string;

export type DataViewsItemIdValue = number | string;

export type DataViewsItemIdField<TItem extends object = DataViewsRecord> = {
  readonly [TKey in DataViewsFieldId<TItem>]-?: TItem[TKey] extends DataViewsItemIdValue
    ? TKey
    : never;
}[DataViewsFieldId<TItem>];

export type DataViewsFieldElementValue<TValue> =
  Extract<NonNullable<TValue>, DataViewsScalar> extends never
    ? DataViewsScalar
    : Extract<NonNullable<TValue>, DataViewsScalar>;

export type DataViewsWeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface DataViewsFieldFormat {
  readonly date?: string;
  readonly datetime?: string;
  readonly decimals?: number;
  readonly separatorDecimal?: string;
  readonly separatorThousand?: string;
  readonly weekStartsOn?: DataViewsWeekStart;
}

export type DataViewsFieldValidationCustomResult =
  | null
  | string
  | Promise<null | string>;

export type DataViewsFieldValidationCustom<
  TItem extends object = DataViewsRecord,
  TValue = unknown,
> = (
  item: TItem,
  field: DataViewsField<TItem, TValue>,
) => DataViewsFieldValidationCustomResult;

export interface DataViewsFieldValidationRules<
  TItem extends object = DataViewsRecord,
  TValue = unknown,
> {
  readonly custom?: DataViewsFieldValidationCustom<TItem, TValue>;
  readonly elements?: boolean;
  /** Resolved numeric maximum validation hint. */
  readonly max?: number;
  readonly maxLength?: number;
  /** Resolved numeric minimum validation hint. */
  readonly min?: number;
  readonly minLength?: number;
  readonly pattern?: string;
  readonly required?: boolean;
}

export interface DataViewsFieldElement<TValue = DataViewsScalar> {
  readonly label: string;
  readonly value: TValue;
}

export interface DataViewsFieldFilter {
  readonly operators?: readonly DataViewsFilterOperator[];
}

export interface DataViewsFieldContext<
  TItem extends object = DataViewsRecord,
  TValue = unknown,
> {
  readonly field: DataViewsField<TItem, TValue>;
  readonly item: TItem;
}

export interface DataViewsFieldUpdateContext<
  TItem extends object = DataViewsRecord,
  TValue = unknown,
> extends DataViewsFieldContext<TItem, TValue> {
  readonly value: TValue;
}

/**
 * Field definition surface owned by wp-typia.
 *
 * @remarks
 * Rendering hooks return `unknown` instead of React nodes so this package does
 * not force React or Gutenberg declarations onto default scaffold consumers.
 */
export interface DataViewsField<
  TItem extends object = DataViewsRecord,
  TValue = unknown,
> {
  readonly description?: string | undefined;
  readonly elements?:
    | readonly DataViewsFieldElement<DataViewsFieldElementValue<TValue>>[]
    | undefined;
  readonly enableGlobalSearch?: boolean;
  readonly enableHiding?: boolean;
  readonly enableSorting?: boolean;
  readonly filterBy?: DataViewsFieldFilter;
  readonly format?: DataViewsFieldFormat;
  readonly getValue?: (context: DataViewsFieldContext<TItem, TValue>) => TValue;
  readonly getValueFormatted?: (context: DataViewsFieldContext<TItem, TValue>) => string;
  readonly header?: string;
  readonly id: DataViewsFieldId<TItem>;
  readonly isValid?: DataViewsFieldValidationRules<TItem, TValue>;
  readonly label: string;
  readonly placeholder?: string;
  readonly readOnly?: boolean;
  readonly render?: (context: DataViewsFieldContext<TItem, TValue>) => unknown;
  readonly setValue?: (context: DataViewsFieldUpdateContext<TItem, TValue>) => TItem;
  readonly sort?: (
    left: TItem,
    right: TItem,
    direction: DataViewsSortDirection,
  ) => number;
  readonly type?: DataViewsFieldType | undefined;
}

export interface DataViewsFilter<
  TItem extends object = DataViewsRecord,
  TValue = unknown,
> {
  readonly field: DataViewsFieldId<TItem>;
  readonly isLocked?: boolean;
  readonly operator: DataViewsFilterOperator;
  readonly value?: TValue;
}

export interface DataViewsSort<TItem extends object = DataViewsRecord> {
  readonly direction: DataViewsSortDirection;
  readonly field: DataViewsFieldId<TItem>;
}

export type DataViewsLayoutConfig = Readonly<Record<string, unknown>>;

export type DataViewsDefaultLayouts = Readonly<
  Partial<Record<DataViewsLayoutType, DataViewsLayoutConfig>>
>;

export interface DataViewsPaginationInfo {
  readonly totalItems: number;
  readonly totalPages: number;
}

/**
 * View state passed to DataViews and query adapters.
 */
export interface DataViewsView<TItem extends object = DataViewsRecord> {
  readonly descriptionField?: DataViewsFieldId<TItem>;
  readonly fields?: readonly DataViewsFieldId<TItem>[];
  readonly filters?: readonly DataViewsFilter<TItem>[];
  readonly groupBy?: {
    readonly direction?: DataViewsSortDirection;
    readonly field: DataViewsFieldId<TItem>;
    readonly showLabel?: boolean;
  };
  readonly infiniteScrollEnabled?: boolean;
  readonly layout?: DataViewsLayoutConfig;
  readonly mediaField?: DataViewsFieldId<TItem>;
  readonly page?: number;
  readonly perPage?: number;
  readonly search?: string;
  readonly showDescription?: boolean;
  readonly showLevels?: boolean;
  readonly showMedia?: boolean;
  readonly showTitle?: boolean;
  readonly sort?: DataViewsSort<TItem>;
  readonly startPosition?: number;
  readonly titleField?: DataViewsFieldId<TItem>;
  readonly type: DataViewsLayoutType;
}

export interface DataViewsActionContext<TItem extends object = DataViewsRecord> {
  readonly view: DataViewsView<TItem>;
}

export interface DataViewsAction<TItem extends object = DataViewsRecord> {
  readonly callback: (
    items: readonly TItem[],
    context: DataViewsActionContext<TItem>,
  ) => Promise<void> | void;
  readonly context?: "item" | "bulk" | "both";
  readonly disabled?: boolean | ((item: TItem) => boolean);
  readonly hideModalHeader?: boolean;
  readonly icon?: unknown;
  readonly id: string;
  readonly isEligible?: (item: TItem) => boolean;
  readonly isPrimary?: boolean;
  readonly label: string;
  readonly modalHeader?: string;
  readonly modalSize?: "small" | "medium" | "large" | "fill";
  readonly supportsBulk?: boolean;
}

export type DataViewsResolvedField<TItem extends object = DataViewsRecord> = {
  readonly [TKey in DataViewsFieldId<TItem>]: DataViewsField<TItem, TItem[TKey]>;
}[DataViewsFieldId<TItem>];

export type DataViewsConfigField<TItem extends object = DataViewsRecord> =
  | DataViewsField<TItem>
  | DataViewsResolvedField<TItem>;

export interface DataViewsConfig<TItem extends object = DataViewsRecord> {
  readonly actions?: readonly DataViewsAction<TItem>[] | undefined;
  readonly data: readonly TItem[];
  readonly defaultLayouts?: DataViewsDefaultLayouts | undefined;
  readonly fields: readonly DataViewsConfigField<TItem>[];
  readonly getItemId?: ((item: TItem) => string) | undefined;
  readonly getItemLevel?: ((item: TItem) => number) | undefined;
  readonly isLoading?: boolean | undefined;
  readonly onChangeView?: ((view: DataViewsView<TItem>) => void) | undefined;
  readonly paginationInfo?: DataViewsPaginationInfo | undefined;
  readonly search?: boolean | undefined;
  readonly searchLabel?: string | undefined;
  readonly onChangeSelection?: ((selection: readonly string[]) => void) | undefined;
  readonly selection?: readonly string[] | undefined;
  readonly view: DataViewsView<TItem>;
}

export type DataFormFieldLayoutType = "regular" | "panel" | "card";

export type DataFormFieldLabelPosition = "none" | "side" | "top";

export interface DataFormFieldSummaryItem<
  TItem extends object = DataViewsRecord,
> {
  readonly id: DataViewsFieldId<TItem>;
  readonly visibility?: "always" | "when-collapsed";
}

export type DataFormFieldSummary<TItem extends object = DataViewsRecord> =
  | DataViewsFieldId<TItem>
  | readonly DataViewsFieldId<TItem>[]
  | readonly DataFormFieldSummaryItem<TItem>[];

export type DataFormPanelFieldSummary<TItem extends object = DataViewsRecord> =
  | DataViewsFieldId<TItem>
  | readonly DataViewsFieldId<TItem>[];

export interface DataFormRegularFieldLayout {
  readonly labelPosition?: DataFormFieldLabelPosition;
  readonly type: "regular";
}

export interface DataFormPanelFieldLayout<TItem extends object = DataViewsRecord> {
  readonly editVisibility?: "always" | "on-hover";
  readonly labelPosition?: DataFormFieldLabelPosition;
  readonly openAs?: "dropdown" | "modal";
  readonly summary?: DataFormPanelFieldSummary<TItem>;
  readonly type: "panel";
}

export interface DataFormCardFieldLayout<TItem extends object = DataViewsRecord> {
  readonly isOpened?: boolean;
  readonly summary?: DataFormFieldSummary<TItem>;
  readonly type: "card";
  readonly withHeader?: boolean;
}

export type DataFormFieldLayout<TItem extends object = DataViewsRecord> =
  | DataFormFieldLayoutType
  | DataFormRegularFieldLayout
  | DataFormPanelFieldLayout<TItem>
  | DataFormCardFieldLayout<TItem>;

export interface DataFormField<TItem extends object = DataViewsRecord> {
  readonly children?: readonly DataFormField<TItem>[] | undefined;
  readonly description?: string | undefined;
  readonly id: DataViewsFieldId<TItem>;
  readonly label?: string | undefined;
  readonly layout?: DataFormFieldLayout<TItem> | undefined;
}

export interface DataFormConfig<TItem extends object = DataViewsRecord> {
  readonly fields: readonly DataFormField<TItem>[];
  readonly validation?: Partial<Record<DataViewsFieldId<TItem>, string>>;
}

export type DataFormFieldInput<TItem extends object = DataViewsRecord> =
  | DataViewsFieldId<TItem>
  | DataFormField<TItem>;

export interface DataFormConfigOptions<TItem extends object = DataViewsRecord> {
  readonly fields?: readonly DataFormFieldInput<TItem>[];
  readonly includeReadOnly?: boolean;
  readonly layout?: DataFormFieldLayout<TItem>;
}

export interface QueryAdapterContext<TItem extends object = DataViewsRecord> {
  readonly fields: readonly DataViewsConfigField<TItem>[];
}

export type QueryAdapter<
  TItem extends object = DataViewsRecord,
  TQuery = Record<string, unknown>,
> = (view: DataViewsView<TItem>, context: QueryAdapterContext<TItem>) => TQuery;

export type DataViewsQueryArgs = Record<string, unknown>;

export type DataViewsQueryParamName<TQuery extends object = DataViewsQueryArgs> = Extract<
  keyof TQuery,
  string
>;

type DataViewsQueryDefaultParamName = "page" | "per_page" | "search";

type DataViewsQueryParamOption<TQuery extends object> =
  | DataViewsQueryParamName<TQuery>
  | false;

type DataViewsQueryDefaultParamOption<
  TQuery extends object,
  TDefaultParam extends string,
  TOptionName extends string,
> = TDefaultParam extends DataViewsQueryParamName<TQuery>
  ? { readonly [TKey in TOptionName]?: DataViewsQueryParamOption<TQuery> }
  : { readonly [TKey in TOptionName]: DataViewsQueryParamOption<TQuery> };

type DataViewsQueryDefaultParamOptions<TQuery extends object> =
  DataViewsQueryDefaultParamOption<TQuery, "page", "pageParam"> &
    DataViewsQueryDefaultParamOption<TQuery, "per_page", "perPageParam"> &
    DataViewsQueryDefaultParamOption<TQuery, "search", "searchParam">;

type DataViewsQueryDefaultSortParamOptions<TQuery extends object> =
  DataViewsQueryDefaultParamOption<TQuery, "orderby", "orderByParam"> &
    DataViewsQueryDefaultParamOption<TQuery, "order", "orderParam">;

type DataViewsQueryMissingDefaultParamNames<TQuery extends object> = Exclude<
  DataViewsQueryDefaultParamName,
  DataViewsQueryParamName<TQuery>
>;

export type DataViewsQuerySortValue = boolean | number | string;

export type DataViewsQuerySortMap<TItem extends object = DataViewsRecord> = Readonly<
  Partial<Record<DataViewsFieldId<TItem>, DataViewsQuerySortValue>>
>;

export interface DataViewsQueryAdapterMapContext<
  TItem extends object = DataViewsRecord,
> extends QueryAdapterContext<TItem> {
  readonly view: DataViewsView<TItem>;
}

export type DataViewsQueryMapperResult<TQuery extends object = DataViewsQueryArgs> =
  | Partial<TQuery>
  | null
  | undefined;

export type DataViewsQuerySortMapper<
  TItem extends object = DataViewsRecord,
  TQuery extends object = DataViewsQueryArgs,
> = (
  sort: DataViewsSort<TItem>,
  context: DataViewsQueryAdapterMapContext<TItem>,
) => DataViewsQueryMapperResult<TQuery>;

export type DataViewsQueryFilterMapper<
  TItem extends object = DataViewsRecord,
  TQuery extends object = DataViewsQueryArgs,
> = (
  filter: DataViewsFilter<TItem>,
  context: DataViewsQueryAdapterMapContext<TItem>,
) => DataViewsQueryMapperResult<TQuery>;

export interface DataViewsQueryAdapterBaseOptions<
  TItem extends object = DataViewsRecord,
  TQuery extends object = DataViewsQueryArgs,
> {
  readonly mapFilter?: DataViewsQueryFilterMapper<TItem, TQuery>;
  readonly orderByParam?: DataViewsQueryParamOption<TQuery>;
  readonly orderParam?: DataViewsQueryParamOption<TQuery>;
  readonly pageParam?: DataViewsQueryParamOption<TQuery>;
  readonly perPageParam?: DataViewsQueryParamOption<TQuery>;
  readonly searchParam?: DataViewsQueryParamOption<TQuery>;
}

type DataViewsQueryAdapterSortOptions<
  TItem extends object = DataViewsRecord,
  TQuery extends object = DataViewsQueryArgs,
> =
  | { readonly mapSort?: DataViewsQuerySortMapper<TItem, TQuery> }
  | ({
      readonly mapSort: DataViewsQuerySortMap<TItem>;
    } & DataViewsQueryDefaultSortParamOptions<TQuery>);

export type DataViewsQueryAdapterRuntimeOptions<
  TItem extends object = DataViewsRecord,
  TQuery extends object = DataViewsQueryArgs,
> = DataViewsQueryAdapterBaseOptions<TItem, TQuery> & {
  readonly mapSort?: DataViewsQuerySortMap<TItem> | DataViewsQuerySortMapper<TItem, TQuery>;
};

export type DataViewsQueryAdapterOptions<
  TItem extends object = DataViewsRecord,
  TQuery extends object = DataViewsQueryArgs,
> = DataViewsQueryAdapterBaseOptions<TItem, TQuery> &
  DataViewsQueryDefaultParamOptions<TQuery> &
  DataViewsQueryAdapterSortOptions<TItem, TQuery>;

export type DataViewsQueryAdapterArguments<
  TItem extends object = DataViewsRecord,
  TQuery extends object = DataViewsQueryArgs,
> = [DataViewsQueryMissingDefaultParamNames<TQuery>] extends [never]
  ? [
      options?: DataViewsQueryAdapterOptions<TItem, TQuery>,
      context?: QueryAdapterContext<TItem>,
    ]
  : [
      options: DataViewsQueryAdapterOptions<TItem, TQuery>,
      context?: QueryAdapterContext<TItem>,
    ];

export type DataViewsQueryAdapterFactoryArguments<
  TItem extends object = DataViewsRecord,
  TQuery extends object = DataViewsQueryArgs,
> = [DataViewsQueryMissingDefaultParamNames<TQuery>] extends [never]
  ? [options?: DataViewsQueryAdapterOptions<TItem, TQuery>]
  : [options: DataViewsQueryAdapterOptions<TItem, TQuery>];

export type DefinedDataViewsQueryAdapterArguments<
  TItem extends object = DataViewsRecord,
  TQuery extends object = DataViewsQueryArgs,
> = DataViewsQueryAdapterFactoryArguments<TItem, TQuery>;

export type DataViewsCompatibleFieldType<TValue> =
  NonNullable<TValue> extends boolean
    ? "boolean"
    : NonNullable<TValue> extends number
      ? "integer" | "number"
      : NonNullable<TValue> extends string
        ? "date" | "datetime" | "email" | "text" | "url"
        : NonNullable<TValue> extends readonly unknown[]
          ? "array"
          : NonNullable<TValue> extends object
            ? "media" | "object"
            : DataViewsFieldType;

export type DataViewsFieldSchemaType =
  | "array"
  | "boolean"
  | "integer"
  | "number"
  | "object"
  | "string";

export type DataViewsFieldSchemaFormat =
  | "date"
  | "date-time"
  | "datetime"
  | "email"
  | "uri"
  | "url"
  | (string & {});

export interface DataViewsFieldSchemaMetadata<TValue = DataViewsScalar> {
  readonly const?: DataViewsFieldElementValue<TValue>;
  readonly description?: string;
  readonly enum?: readonly DataViewsFieldElementValue<TValue>[];
  readonly enumLabels?: Readonly<Record<string, string>>;
  readonly format?: DataViewsFieldSchemaFormat;
  /** Preferred numeric maximum; takes precedence over `maximum` when both are present. */
  readonly max?: number;
  readonly maxLength?: number;
  /** JSON Schema numeric maximum used when `max` is not present. */
  readonly maximum?: number;
  /** Preferred numeric minimum; takes precedence over `minimum` when both are present. */
  readonly min?: number;
  readonly minLength?: number;
  /** JSON Schema numeric minimum used when `min` is not present. */
  readonly minimum?: number;
  readonly pattern?: string;
  readonly required?: boolean;
  readonly type?: DataViewsFieldSchemaType | readonly DataViewsFieldSchemaType[];
}

export interface DefineDataViewsFieldDefinition<
  TItem extends object,
  TKey extends DataViewsFieldId<TItem>,
> extends Omit<DataViewsField<TItem, TItem[TKey]>, "elements" | "id" | "label" | "type"> {
  readonly elements?: readonly DataViewsFieldElement<DataViewsFieldElementValue<TItem[TKey]>>[];
  readonly label?: string;
  readonly schema?: DataViewsFieldSchemaMetadata<TItem[TKey]>;
  readonly type?: DataViewsCompatibleFieldType<TItem[TKey]>;
}

export type DefineDataViewsFields<TItem extends object> = {
  readonly [TKey in DataViewsFieldId<TItem>]?: DefineDataViewsFieldDefinition<TItem, TKey>;
};

export interface DefineDataViewsInput<TItem extends object> {
  readonly actions?: readonly DataViewsAction<TItem>[];
  readonly defaultLayouts?: DataViewsDefaultLayouts;
  readonly defaultView: DataViewsView<TItem>;
  readonly fields: DefineDataViewsFields<TItem>;
  readonly getItemId?: (item: TItem) => string;
  readonly getItemLevel?: (item: TItem) => number;
  readonly idField?: DataViewsItemIdField<TItem>;
  readonly search?: boolean;
  readonly searchLabel?: string;
  readonly titleField?: DataViewsFieldId<TItem>;
}

export interface DefineDataViewsConfigOptions<TItem extends object> {
  readonly actions?: readonly DataViewsAction<TItem>[];
  readonly data: readonly TItem[];
  readonly getItemId?: (item: TItem) => string;
  readonly getItemLevel?: (item: TItem) => number;
  readonly isLoading?: boolean;
  readonly onChangeSelection?: (selection: readonly string[]) => void;
  readonly onChangeView?: (view: DataViewsView<TItem>) => void;
  readonly paginationInfo?: DataViewsPaginationInfo;
  readonly search?: boolean;
  readonly searchLabel?: string;
  readonly selection?: readonly string[];
  readonly view?: DataViewsView<TItem>;
}

export type DefinedDataViewsFieldMap<TItem extends object> = Readonly<
  Partial<Record<DataViewsFieldId<TItem>, DataViewsResolvedField<TItem>>>
>;

export interface DefinedDataViews<TItem extends object> {
  readonly actions?: readonly DataViewsAction<TItem>[] | undefined;
  readonly defaultLayouts?: DataViewsDefaultLayouts | undefined;
  readonly defaultView: DataViewsView<TItem>;
  readonly fieldMap: DefinedDataViewsFieldMap<TItem>;
  readonly fields: readonly DataViewsResolvedField<TItem>[];
  readonly getItemId?: ((item: TItem) => string) | undefined;
  readonly getItemLevel?: ((item: TItem) => number) | undefined;
  readonly idField?: DataViewsItemIdField<TItem> | undefined;
  readonly search?: boolean | undefined;
  readonly searchLabel?: string | undefined;
  readonly titleField?: DataViewsFieldId<TItem> | undefined;
  readonly createConfig: (options: DefineDataViewsConfigOptions<TItem>) => DataViewsConfig<TItem>;
  readonly toFormConfig: (options?: DataFormConfigOptions<TItem>) => DataFormConfig<TItem>;
  readonly toQueryArgs: <TQuery extends object = DataViewsQueryArgs>(
    view: DataViewsView<TItem>,
    ...args: DefinedDataViewsQueryAdapterArguments<TItem, TQuery>
  ) => Partial<TQuery>;
}
