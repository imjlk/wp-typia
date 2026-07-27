import React, { useCallback, useEffect, useState } from 'react';

import type {
	EditorFieldDescriptor,
} from './editor.js';
import {
  getFieldValue,
  toBooleanValue,
  toNumberValue,
  toSelectOptions,
  toStringValue,
} from './inspector-runtime-model.js';
import type {
  FieldControlProps,
  FieldControlRenderContext,
  InspectorComponentMap,
  InspectorFromManifestProps,
  InspectorSelectOption,
  PanelBodyLikeProps,
  RangeControlLikeProps,
  SelectControlLikeProps,
  TextControlLikeProps,
  TextareaControlLikeProps,
  ToggleControlLikeProps,
} from './inspector-runtime-types.js';

type UnknownRecord = Record<string, unknown>;

function asComponent<TProps>(
	value: unknown,
): React.ElementType<TProps> | undefined {
  if (
		typeof value === 'function' ||
		(value !== null && typeof value === 'object')
	) {
    return value as React.ElementType<TProps>;
  }

  return undefined;
}

function FallbackPanelBody({ children }: PanelBodyLikeProps) {
  return <>{children}</>;
}

function getGlobalInspectorComponents(): InspectorComponentMap {
  const globalScope = globalThis as {
    window?: { wp?: { components?: UnknownRecord } };
    wp?: { components?: UnknownRecord };
  };
  const componentRegistry =
		globalScope.wp?.components ?? globalScope.window?.wp?.components ?? {};

  return {
    PanelBody: asComponent<PanelBodyLikeProps>(componentRegistry.PanelBody),
    RangeControl: asComponent<RangeControlLikeProps>(
      componentRegistry.RangeControl,
    ),
    SelectControl: asComponent<SelectControlLikeProps>(
      componentRegistry.SelectControl,
    ),
    TextControl: asComponent<TextControlLikeProps>(
      componentRegistry.TextControl,
    ),
    TextareaControl: asComponent<TextareaControlLikeProps>(
      componentRegistry.TextareaControl,
    ),
    ToggleControl: asComponent<ToggleControlLikeProps>(
      componentRegistry.ToggleControl,
    ),
  };
}

function resolveInspectorComponents(
	components?: InspectorComponentMap,
): InspectorComponentMap {
  return {
    ...getGlobalInspectorComponents(),
    ...(components ?? {}),
  };
}

function getFieldControlContext(
	field: EditorFieldDescriptor,
	props: Omit<FieldControlProps, 'components' | 'field'>,
	resolvedComponents: InspectorComponentMap,
): FieldControlRenderContext {
  return {
    components: resolvedComponents,
    field,
    help: props.help,
    label: props.label ?? field.label,
    max: props.max ?? field.maximum ?? undefined,
    min: props.min ?? field.minimum ?? undefined,
    onChange: props.onChange,
    options: props.options,
    step: props.step ?? field.step ?? undefined,
    value: props.value,
  };
}

function parseSelectValue(
	field: EditorFieldDescriptor,
	value: string,
	overrideOptions?: readonly InspectorSelectOption[],
): string | number | boolean {
  const matchedOption = field.options.find(
    (option) => String(option.value) === value,
  );
  if (matchedOption) {
    return matchedOption.value;
  }

  if (overrideOptions?.some((option) => option.value === value)) {
    return value;
  }

  return value;
}

function formatNumberDraft(value: unknown): string {
  return String(toNumberValue(value, 0));
}

function parseNumberDraft(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

interface NumberFieldControlProps {
  context: FieldControlRenderContext;
  onChange: (value: unknown) => void;
  TextControl: React.ElementType<TextControlLikeProps>;
  value: unknown;
}

function NumberFieldControl({
	context,
	onChange,
	value,
	TextControl,
}: NumberFieldControlProps) {
  const committedDraft = formatNumberDraft(value);
  const [draft, setDraft] = useState(committedDraft);

  useEffect(() => {
    setDraft(committedDraft);
  }, [committedDraft]);

  const commitDraft = useCallback(() => {
    const parsed = parseNumberDraft(draft);
    if (parsed === undefined) {
      setDraft(committedDraft);
      return;
    }

    onChange(parsed);
    setDraft(String(parsed));
  }, [committedDraft, draft, onChange]);

  return (
		<TextControl
			help={context.help}
			label={context.label}
			max={context.max}
			min={context.min}
			onBlur={commitDraft}
			onChange={setDraft}
			step={context.step}
			type="number"
			value={draft}
		/>
	);
}

/**
 * Render one manifest-derived editor field with pluggable inspector controls.
 *
 * @param props Field-control props including the descriptor, value, and optional custom renderers.
 * @returns A React element for the resolved field control, or `null` when no supported control is available.
 * @category React
 */
export function FieldControl(props: FieldControlProps) {
  const {
		components,
		field,
		help,
		label,
		max,
		min,
		onChange,
		options,
		render,
		renderUnsupported,
		step,
		value,
	} = props;
  const resolvedComponents = resolveInspectorComponents(components);
  const context = getFieldControlContext(
    field,
    {
      help,
      label,
      max,
      min,
      onChange,
      options,
      step,
      value,
    },
    resolvedComponents,
  );

  if (render) {
    return <>{render(context)}</>;
  }

  if (!field.supported) {
    return renderUnsupported ? <>{renderUnsupported(context)}</> : null;
  }

  switch (field.control) {
    case 'toggle': {
      const ToggleControl = resolvedComponents.ToggleControl;
      if (!ToggleControl) {
        return null;
      }

      return (
				<ToggleControl
					checked={toBooleanValue(value, false)}
					help={context.help}
					label={context.label}
					onChange={(nextValue) => {
						onChange(nextValue);
					}}
				/>
			);
    }
    case 'select': {
      const SelectControl = resolvedComponents.SelectControl;
      if (!SelectControl) {
        return null;
      }

      const selectOptions =
				context.options ?? toSelectOptions(field.options);

      return (
				<SelectControl
					help={context.help}
					label={context.label}
					onChange={(nextValue) => {
						onChange(parseSelectValue(field, nextValue, context.options));
					}}
					options={selectOptions}
					value={String(value ?? '')}
				/>
			);
    }
    case 'range': {
      const RangeControl = resolvedComponents.RangeControl;
      if (!RangeControl) {
        return null;
      }

      return (
				<RangeControl
					help={context.help}
					label={context.label}
					max={context.max}
					min={context.min}
					onChange={(nextValue) => {
						if (typeof nextValue === 'number' && Number.isFinite(nextValue)) {
							onChange(nextValue);
						}
					}}
					step={context.step}
					value={toNumberValue(value, 0)}
				/>
			);
    }
    case 'number': {
      const TextControl = resolvedComponents.TextControl;
      if (!TextControl) {
        return null;
      }

      return (
				<NumberFieldControl
					context={context}
					onChange={onChange}
					TextControl={TextControl}
					value={value}
				/>
			);
    }
    case 'textarea': {
      const TextareaControl = resolvedComponents.TextareaControl;
      if (!TextareaControl) {
        return null;
      }

      return (
				<TextareaControl
					help={context.help}
					label={context.label}
					onChange={(nextValue) => {
						onChange(nextValue);
					}}
					value={toStringValue(value, '')}
				/>
			);
    }
    case 'text': {
      const TextControl = resolvedComponents.TextControl;
      if (!TextControl) {
        return null;
      }

      return (
				<TextControl
					help={context.help}
					label={context.label}
					onChange={(nextValue) => {
						onChange(nextValue);
					}}
					value={toStringValue(value, '')}
				/>
			);
    }
    default:
      return renderUnsupported ? <>{renderUnsupported(context)}</> : null;
  }
}

/**
 * Render a manifest-driven inspector panel for a selected set of field paths.
 *
 * @param props Inspector configuration including the current attributes, field lookup helpers, and change handler.
 * @returns A panel element containing generated field controls for the requested paths.
 * @category React
 */
export function InspectorFromManifest<T extends object>(
	props: InspectorFromManifestProps<T>,
) {
  const {
		attributes,
		children,
		components,
		fieldLookup,
		fieldOverrides,
		initialOpen,
		onChange,
		paths,
		title,
	} = props;
  const resolvedComponents = resolveInspectorComponents(components);
  const PanelBody = resolvedComponents.PanelBody ?? FallbackPanelBody;
  const fieldControls = paths
		.map((path) => {
			const field = fieldLookup.getField(path);
			if (!field) {
				return null;
			}

			const overrides = fieldOverrides?.[path];

			return (
				<FieldControl
					key={path}
					components={resolvedComponents}
					field={field}
					help={overrides?.help}
					label={overrides?.label}
					max={overrides?.max}
					min={overrides?.min}
					onChange={(value) => {
						onChange(path, value);
					}}
					options={overrides?.options}
					render={overrides?.render}
					renderUnsupported={overrides?.renderUnsupported}
					step={overrides?.step}
					value={getFieldValue(field, attributes)}
				/>
			);
		})
		.filter(Boolean);

  return (
		<PanelBody initialOpen={initialOpen} title={title}>
			{fieldControls}
			{children}
		</PanelBody>
	);
}
