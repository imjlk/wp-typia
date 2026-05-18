import type {
  DataFormConfig,
  DataFormConfigOptions,
  DataFormField,
  DataFormFieldInput,
  DataFormFieldLayout,
  DataViewsConfigField,
  DataViewsFieldId,
  DataViewsRecord,
} from "./types.js";

export function createDataFormConfig<TItem extends object = DataViewsRecord>(
  fields: readonly DataViewsConfigField<TItem>[],
  options: DataFormConfigOptions<TItem> = {},
): DataFormConfig<TItem> {
  const fieldMap = createDataViewsConfigFieldMap(fields);
  const formFields = normalizeDataFormFields(
    options.fields ?? fields,
    fieldMap,
    options.layout,
    options.includeReadOnly === true,
  );

  return {
    fields: formFields,
  };
}

function createDataViewsConfigFieldMap<TItem extends object>(
  fields: readonly DataViewsConfigField<TItem>[],
): ReadonlyMap<DataViewsFieldId<TItem>, DataViewsConfigField<TItem>> {
  return new Map(fields.map((field) => [field.id, field]));
}

function normalizeDataFormFields<TItem extends object>(
  fields: readonly (DataFormFieldInput<TItem> | DataViewsConfigField<TItem>)[],
  fieldMap: ReadonlyMap<DataViewsFieldId<TItem>, DataViewsConfigField<TItem>>,
  layout: DataFormFieldLayout<TItem> | undefined,
  includeReadOnly: boolean,
): readonly DataFormField<TItem>[] {
  const normalizedFields: DataFormField<TItem>[] = [];

  for (const field of fields) {
    const normalizedField = normalizeDataFormField(field, fieldMap, layout, includeReadOnly);

    if (normalizedField !== undefined) {
      normalizedFields.push(normalizedField);
    }
  }

  return normalizedFields;
}

function normalizeDataFormField<TItem extends object>(
  field: DataFormFieldInput<TItem> | DataViewsConfigField<TItem>,
  fieldMap: ReadonlyMap<DataViewsFieldId<TItem>, DataViewsConfigField<TItem>>,
  layout: DataFormFieldLayout<TItem> | undefined,
  includeReadOnly: boolean,
): DataFormField<TItem> | undefined {
  if (typeof field === "string") {
    return normalizeDataFormFieldObject({ id: field }, fieldMap, layout, includeReadOnly);
  }

  return normalizeDataFormFieldObject(field, fieldMap, layout, includeReadOnly);
}

function normalizeDataFormFieldObject<TItem extends object>(
  field: Partial<DataFormField<TItem>> & Pick<DataFormField<TItem>, "id">,
  fieldMap: ReadonlyMap<DataViewsFieldId<TItem>, DataViewsConfigField<TItem>>,
  layout: DataFormFieldLayout<TItem> | undefined,
  includeReadOnly: boolean,
): DataFormField<TItem> | undefined {
  const sourceField = fieldMap.get(field.id);
  const resolvedLayout = field.layout ?? layout;

  // DataForm supports group-only fields whose ids are not DataViews fields.
  if (sourceField?.readOnly === true && !includeReadOnly) {
    return undefined;
  }

  return {
    children:
      field.children === undefined
        ? undefined
        : normalizeDataFormFields(field.children, fieldMap, layout, includeReadOnly),
    description: field.description ?? sourceField?.description,
    id: field.id,
    label: field.label ?? sourceField?.label,
    layout: resolvedLayout,
  };
}
