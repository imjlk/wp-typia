import type { WordPressCompatibilitySettings } from './compatibility.js';
import type { BlockAttributes } from './shared/block-attributes.js';
import type {
  BlockVariationDefinition,
  DefineVariationInlineOptions,
  DefineVariationOptions,
  StripDefineVariationOptions,
} from './variations.js';

const DEFINE_VARIATION_INLINE_OPTION_KEYS = new Set<string>([
  'allowMissingIsActive',
  'logger',
  'minVersion',
  'minWordPress',
  'onDiagnostic',
  'requireIsActive',
  'strict',
]);

export interface ResolvedDefineVariationSettings {
  readonly compatibility: WordPressCompatibilitySettings;
  readonly diagnostics: {
    readonly allowMissingIsActive: boolean;
    readonly requireIsActive: boolean;
    readonly strict: boolean;
  };
  readonly logger: DefineVariationOptions['logger'];
  readonly onDiagnostic: DefineVariationOptions['onDiagnostic'];
}

export function splitDefineVariationInput<
  TAttributes extends BlockAttributes,
  TVariation extends BlockVariationDefinition<TAttributes> &
    DefineVariationInlineOptions,
>(variation: TVariation): {
  inlineOptions: DefineVariationInlineOptions;
  variation: StripDefineVariationOptions<TVariation> &
    BlockVariationDefinition<TAttributes>;
} {
  const inlineOptions: DefineVariationInlineOptions = {};
  const normalizedVariation: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(variation)) {
    if (DEFINE_VARIATION_INLINE_OPTION_KEYS.has(key)) {
      Object.assign(inlineOptions, { [key]: value });
      continue;
    }

    normalizedVariation[key] = value;
  }

  return {
    inlineOptions,
    variation: normalizedVariation as StripDefineVariationOptions<TVariation> &
      BlockVariationDefinition<TAttributes>,
  };
}

export function resolveDefineVariationSettings(
  inlineOptions: DefineVariationInlineOptions,
  options: DefineVariationOptions,
): ResolvedDefineVariationSettings {
  const compatibility: WordPressCompatibilitySettings = {};
  const allowUnknownFutureKeys = options.allowUnknownFutureKeys;
  const minVersion =
    options.minVersion ??
    options.minWordPress ??
    inlineOptions.minVersion ??
    inlineOptions.minWordPress;
  const strict = options.strict ?? inlineOptions.strict ?? true;

  if (allowUnknownFutureKeys !== undefined) {
    Object.assign(compatibility, { allowUnknownFutureKeys });
  }
  if (minVersion !== undefined) {
    Object.assign(compatibility, { minVersion });
  }
  Object.assign(compatibility, { strict });

  return {
    compatibility,
    diagnostics: {
      allowMissingIsActive:
        options.allowMissingIsActive ?? inlineOptions.allowMissingIsActive ?? false,
      requireIsActive:
        options.requireIsActive ?? inlineOptions.requireIsActive ?? true,
      strict,
    },
    logger: options.logger ?? inlineOptions.logger,
    onDiagnostic: options.onDiagnostic ?? inlineOptions.onDiagnostic,
  };
}
