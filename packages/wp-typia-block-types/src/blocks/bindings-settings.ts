import type {
  WordPressCompatibilitySettings,
  WordPressVersion,
} from './compatibility.js';
import type {
  BindingSourceDefinition,
  BindingSourceVersionGates,
  DefineBindingSourceInlineOptions,
  DefineBindingSourceOptions,
  StripDefineBindingSourceOptions,
} from './bindings-core.js';
import { isObjectRecord } from './shared/object-utils.js';

export const DEFINE_BINDING_SOURCE_INLINE_OPTION_KEYS = new Set<string>([
  'allowUnknownFutureKeys',
  'editor',
  'fieldsList',
  'logger',
  'minVersion',
  'minWordPress',
  'minWordPressEditor',
  'minWordPressFieldsList',
  'minWordPressServer',
  'minWordPressSupportedAttributesFilter',
  'onDiagnostic',
  'server',
  'strict',
  'supportedAttributesFilter',
]);

export interface ResolvedDefineBindingSourceSettings {
  readonly compatibility: WordPressCompatibilitySettings;
  readonly features: {
    readonly editor: boolean;
    readonly fieldsList: boolean;
    readonly metadata: boolean;
    readonly server: boolean;
    readonly supportedAttributesFilter: boolean;
  };
  readonly gates: BindingSourceVersionGates;
  readonly logger: DefineBindingSourceOptions['logger'];
  readonly onDiagnostic: DefineBindingSourceOptions['onDiagnostic'];
  readonly strict: boolean;
}

export function isBindingSourceVersionGates(
  value: WordPressVersion | BindingSourceVersionGates | undefined,
): value is BindingSourceVersionGates {
  return isObjectRecord(value);
}

export function splitDefineBindingSourceInput<
  TSource extends BindingSourceDefinition & DefineBindingSourceInlineOptions,
>(source: TSource): {
  inlineOptions: DefineBindingSourceInlineOptions;
  source: StripDefineBindingSourceOptions<TSource> & BindingSourceDefinition;
} {
  const inlineOptions: DefineBindingSourceInlineOptions = {};
  const normalizedSource: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (DEFINE_BINDING_SOURCE_INLINE_OPTION_KEYS.has(key)) {
      Object.assign(inlineOptions, { [key]: value });
      continue;
    }

    normalizedSource[key] = value;
  }

  return {
    inlineOptions,
    source: normalizedSource as StripDefineBindingSourceOptions<TSource> &
      BindingSourceDefinition,
  };
}

export function resolveMinWordPress(
  inlineOptions: DefineBindingSourceInlineOptions,
  options: DefineBindingSourceOptions,
): {
  compatibility: WordPressCompatibilitySettings;
  gates: BindingSourceVersionGates;
} {
  const optionMinWordPress = options.minWordPress;
  const inlineMinWordPress = inlineOptions.minWordPress;
  const optionGates = isBindingSourceVersionGates(optionMinWordPress)
    ? optionMinWordPress
    : {};
  const inlineGates = isBindingSourceVersionGates(inlineMinWordPress)
    ? inlineMinWordPress
    : {};
  const minVersion =
    options.minVersion ??
    (typeof optionMinWordPress === 'string' ? optionMinWordPress : undefined) ??
    inlineOptions.minVersion ??
    (typeof inlineMinWordPress === 'string' ? inlineMinWordPress : undefined);
  const compatibility: WordPressCompatibilitySettings = {
    strict: options.strict ?? inlineOptions.strict ?? true,
  };

  if (options.allowUnknownFutureKeys ?? inlineOptions.allowUnknownFutureKeys) {
    Object.assign(compatibility, {
      allowUnknownFutureKeys:
        options.allowUnknownFutureKeys ?? inlineOptions.allowUnknownFutureKeys,
    });
  }
  if (minVersion !== undefined) {
    Object.assign(compatibility, { minVersion });
  }

  const gates: BindingSourceVersionGates = {};
  const editor =
    options.minWordPressEditor ??
    optionGates.editor ??
    inlineOptions.minWordPressEditor ??
    inlineGates.editor;
  const fieldsList =
    options.minWordPressFieldsList ??
    optionGates.fieldsList ??
    inlineOptions.minWordPressFieldsList ??
    inlineGates.fieldsList;
  const server =
    options.minWordPressServer ??
    optionGates.server ??
    inlineOptions.minWordPressServer ??
    inlineGates.server;
  const supportedAttributesFilter =
    options.minWordPressSupportedAttributesFilter ??
    optionGates.supportedAttributesFilter ??
    inlineOptions.minWordPressSupportedAttributesFilter ??
    inlineGates.supportedAttributesFilter;

  if (editor !== undefined) {
    Object.assign(gates, { editor });
  }
  if (fieldsList !== undefined) {
    Object.assign(gates, { fieldsList });
  }
  if (server !== undefined) {
    Object.assign(gates, { server });
  }
  if (supportedAttributesFilter !== undefined) {
    Object.assign(gates, { supportedAttributesFilter });
  }

  return {
    compatibility,
    gates,
  };
}

export function resolveDefineBindingSourceSettings(
  inlineOptions: DefineBindingSourceInlineOptions,
  options: DefineBindingSourceOptions,
  source: BindingSourceDefinition,
): ResolvedDefineBindingSourceSettings {
  const { compatibility, gates } = resolveMinWordPress(inlineOptions, options);
  const strict = compatibility.strict ?? true;
  const hasFields = (source.fields?.length ?? 0) > 0;
  const hasBindableAttributes = (source.bindableAttributes?.length ?? 0) > 0;

  return {
    compatibility,
    features: {
      editor: options.editor ?? inlineOptions.editor ?? true,
      fieldsList: options.fieldsList ?? inlineOptions.fieldsList ?? hasFields,
      metadata: true,
      server: options.server ?? inlineOptions.server ?? true,
      supportedAttributesFilter:
        options.supportedAttributesFilter ??
        inlineOptions.supportedAttributesFilter ??
        hasBindableAttributes,
    },
    gates,
    logger: options.logger ?? inlineOptions.logger,
    onDiagnostic: options.onDiagnostic ?? inlineOptions.onDiagnostic,
    strict,
  };
}
