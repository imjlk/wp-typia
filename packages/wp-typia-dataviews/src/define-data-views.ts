import { createDataFormConfig } from "./data-form.js";
import { toDataViewsQueryArgs } from "./query-adapter.js";
import type {
  DataFormConfig,
  DataFormConfigOptions,
  DataViewsCompatibleFieldType,
  DataViewsConfig,
  DataViewsDefaultLayouts,
  DataViewsField,
  DataViewsFieldElement,
  DataViewsFieldElementValue,
  DataViewsFieldId,
  DataViewsFieldSchemaMetadata,
  DataViewsFieldType,
  DataViewsFieldValidationRules,
  DataViewsItemIdField,
  DataViewsQueryAdapterArguments,
  DataViewsQueryArgs,
  DataViewsResolvedField,
  DataViewsScalar,
  DataViewsView,
  DefinedDataViews,
  DefinedDataViewsFieldMap,
  DefinedDataViewsQueryAdapterArguments,
  DefineDataViewsFieldDefinition,
  DefineDataViewsFields,
  DefineDataViewsInput,
} from "./types.js";

type MutableDataViewsFieldValidationRules<TItem extends object, TValue> = {
  -readonly [TKey in keyof DataViewsFieldValidationRules<TItem, TValue>]?: DataViewsFieldValidationRules<
    TItem,
    TValue
  >[TKey];
};

export function defineDataViews<TItem extends object>(
  definition: DefineDataViewsInput<TItem>,
): DefinedDataViews<TItem> {
  const fields = normalizeDefineDataViewsFields(definition.fields);
  const fieldMap = Object.fromEntries(
    fields.map((field) => [field.id, field]),
  ) as DefinedDataViewsFieldMap<TItem>;
  const defaultView = normalizeDefineDataViewsDefaultView(definition, fields);
  const defaultGetItemId = definition.getItemId ?? createGetItemId(definition.idField);
  const toQueryArgs = <TQuery extends object = DataViewsQueryArgs>(
    view: DataViewsView<TItem>,
    ...args: DefinedDataViewsQueryAdapterArguments<TItem, TQuery>
  ): Partial<TQuery> =>
    toDataViewsQueryArgs<TItem, TQuery>(
      view,
      ...([args[0], { fields }] as DataViewsQueryAdapterArguments<TItem, TQuery>),
    );
  const toFormConfig = (options?: DataFormConfigOptions<TItem>): DataFormConfig<TItem> =>
    createDataFormConfig(fields, options);

  return {
    actions: definition.actions,
    createConfig: (options): DataViewsConfig<TItem> => ({
      actions: options.actions ?? definition.actions,
      data: options.data,
      defaultLayouts: definition.defaultLayouts,
      fields,
      getItemId: options.getItemId ?? defaultGetItemId,
      getItemLevel: options.getItemLevel ?? definition.getItemLevel,
      isLoading: options.isLoading,
      onChangeSelection: options.onChangeSelection,
      onChangeView: options.onChangeView,
      paginationInfo: options.paginationInfo,
      search: options.search ?? definition.search,
      searchLabel: options.searchLabel ?? definition.searchLabel,
      selection: options.selection,
      view: options.view ?? defaultView,
    }),
    toQueryArgs,
    defaultLayouts: definition.defaultLayouts as DataViewsDefaultLayouts | undefined,
    defaultView,
    fieldMap,
    fields,
    getItemId: defaultGetItemId,
    getItemLevel: definition.getItemLevel,
    idField: definition.idField,
    search: definition.search,
    searchLabel: definition.searchLabel,
    titleField: definition.titleField,
    toFormConfig,
  };
}

function normalizeDefineDataViewsFields<TItem extends object>(
  fields: DefineDataViewsFields<TItem>,
): readonly DataViewsResolvedField<TItem>[] {
  return (
    Object.entries(fields) as Array<
      [
        DataViewsFieldId<TItem>,
        DefineDataViewsFieldDefinition<TItem, DataViewsFieldId<TItem>> | undefined,
      ]
    >
  )
    .filter(
      (entry): entry is [
        DataViewsFieldId<TItem>,
        DefineDataViewsFieldDefinition<TItem, DataViewsFieldId<TItem>>,
      ] => entry[1] !== undefined,
    )
    .map(([id, field]) => normalizeDefineDataViewsField(id, field));
}

function normalizeDefineDataViewsField<
  TItem extends object,
  TKey extends DataViewsFieldId<TItem>,
>(
  id: TKey,
  field: DefineDataViewsFieldDefinition<TItem, TKey>,
): DataViewsField<TItem, TItem[TKey]> {
  const { isValid, schema, ...fieldDefinition } = field;
  const label = fieldDefinition.label ?? formatDataViewsFieldLabel(id);
  const description = fieldDefinition.description ?? schema?.description;
  const type = normalizeDataViewsFieldType(fieldDefinition.type, schema);
  const elements = fieldDefinition.elements ?? normalizeDataViewsFieldElements(schema);
  const validation = normalizeDataViewsFieldValidation(isValid, schema);

  return {
    ...fieldDefinition,
    description,
    elements,
    id,
    ...(validation === undefined ? {} : { isValid: validation }),
    label,
    type,
  };
}

function normalizeDefineDataViewsDefaultView<TItem extends object>(
  definition: DefineDataViewsInput<TItem>,
  fields: readonly DataViewsResolvedField<TItem>[],
): DataViewsView<TItem> {
  const defaults =
    definition.titleField === undefined
      ? { fields: fields.map((field) => field.id) }
      : { fields: fields.map((field) => field.id), titleField: definition.titleField };

  return {
    ...defaults,
    ...definition.defaultView,
  };
}

function normalizeDataViewsFieldType<TValue>(
  type: DataViewsCompatibleFieldType<TValue> | undefined,
  schema: DataViewsFieldSchemaMetadata<TValue> | undefined,
): DataViewsFieldType | undefined {
  if (type !== undefined) {
    return type;
  }

  if (schema?.format === "date-time" || schema?.format === "datetime") {
    return "datetime";
  }

  if (schema?.format === "date") {
    return "date";
  }

  if (schema?.format === "email") {
    return "email";
  }

  if (schema?.format === "uri" || schema?.format === "url") {
    return "url";
  }

  const schemaType = getFirstDataViewsSchemaType(schema?.type);

  return schemaType;
}

function normalizeDataViewsFieldElements<TValue>(
  schema: DataViewsFieldSchemaMetadata<TValue> | undefined,
): readonly DataViewsFieldElement<DataViewsFieldElementValue<TValue>>[] | undefined {
  const values = getDataViewsSchemaElementValues(schema);

  if (values.length === 0) {
    return undefined;
  }

  return values.map((value) => ({
    label: schema?.enumLabels?.[String(value)] ?? formatDataViewsElementLabel(value),
    value,
  }));
}

function getDataViewsSchemaElementValues<TValue>(
  schema: DataViewsFieldSchemaMetadata<TValue> | undefined,
): readonly DataViewsFieldElementValue<TValue>[] {
  if (schema?.enum !== undefined) {
    return schema.enum;
  }

  if (schema?.const !== undefined) {
    return [schema.const];
  }

  return [];
}

function normalizeDataViewsFieldValidation<TItem extends object, TValue>(
  fieldValidation: DataViewsFieldValidationRules<TItem, TValue> | undefined,
  schema: DataViewsFieldSchemaMetadata<TValue> | undefined,
): DataViewsFieldValidationRules<TItem, TValue> | undefined {
  const schemaValidation: MutableDataViewsFieldValidationRules<TItem, TValue> = {};

  if (schema?.enum !== undefined || schema?.const !== undefined) {
    schemaValidation.elements = true;
  }
  const max = schema?.max ?? schema?.maximum;
  if (max !== undefined) {
    schemaValidation.max = max;
  }
  if (schema?.maxLength !== undefined) {
    schemaValidation.maxLength = schema.maxLength;
  }
  const min = schema?.min ?? schema?.minimum;
  if (min !== undefined) {
    schemaValidation.min = min;
  }
  if (schema?.minLength !== undefined) {
    schemaValidation.minLength = schema.minLength;
  }
  if (schema?.pattern !== undefined) {
    schemaValidation.pattern = schema.pattern;
  }
  if (schema?.required !== undefined) {
    schemaValidation.required = schema.required;
  }

  const validation = {
    ...schemaValidation,
    ...fieldValidation,
  };

  return Object.values(validation).some((value) => value !== undefined)
    ? validation
    : undefined;
}

function getFirstDataViewsSchemaType(
  type: DataViewsFieldSchemaMetadata["type"] | undefined,
): DataViewsFieldType | undefined {
  const schemaType = Array.isArray(type)
    ? (type.find((candidate) => candidate !== "object") ?? type[0])
    : type;

  if (schemaType === "string") {
    return "text";
  }

  if (
    schemaType === "array" ||
    schemaType === "boolean" ||
    schemaType === "integer" ||
    schemaType === "number" ||
    schemaType === "object"
  ) {
    return schemaType;
  }

  return undefined;
}

function createGetItemId<TItem extends object>(
  idField: DataViewsItemIdField<TItem> | undefined,
): ((item: TItem) => string) | undefined {
  if (idField === undefined) {
    return undefined;
  }

  return (item) => {
    const idValue = item[idField];

    if (typeof idValue === "string") {
      return idValue;
    }

    if (typeof idValue === "number" && Number.isFinite(idValue)) {
      return String(idValue);
    }

    throw new TypeError(
      `defineDataViews idField "${idField}" must resolve to a string or finite number. Provide getItemId for custom item identity values.`,
    );
  };
}

function formatDataViewsFieldLabel(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDataViewsElementLabel(value: DataViewsScalar): string {
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }

  return formatDataViewsFieldLabel(String(value));
}
