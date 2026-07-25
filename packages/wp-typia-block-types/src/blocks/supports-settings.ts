import type { WordPressCompatibilitySettings } from './compatibility.js';
import type {
  BlockSupportsInput,
  DefineSupportsInlineOptions,
  DefineSupportsOptions,
  StripDefineSupportsOptions,
} from './supports.js';

export const DEFINE_SUPPORTS_INLINE_OPTION_KEYS = new Set<string>([
  'allowUnknownFutureKeys',
  'logger',
  'minVersion',
  'minWordPress',
  'onDiagnostic',
  'strict',
]);

export function splitDefineSupportsInput<TSupports extends BlockSupportsInput>(
  supports: TSupports & DefineSupportsInlineOptions,
): {
  inlineOptions: DefineSupportsInlineOptions;
  supports: StripDefineSupportsOptions<TSupports> & BlockSupportsInput;
} {
  const normalizedSupports: Record<string, unknown> = {};
  const inlineOptions: DefineSupportsInlineOptions = {};

  for (const [key, value] of Object.entries(supports)) {
    if (DEFINE_SUPPORTS_INLINE_OPTION_KEYS.has(key)) {
      Object.assign(inlineOptions, { [key]: value });
      continue;
    }

    normalizedSupports[key] = value;
  }

  return {
    inlineOptions,
    supports: normalizedSupports as StripDefineSupportsOptions<TSupports> &
      BlockSupportsInput,
  };
}

export function resolveDefineSupportsSettings(
  inlineOptions: DefineSupportsInlineOptions,
  options: DefineSupportsOptions,
): WordPressCompatibilitySettings {
  const settings: WordPressCompatibilitySettings = {};
  const allowUnknownFutureKeys =
    options.allowUnknownFutureKeys ?? inlineOptions.allowUnknownFutureKeys;
  const minVersion =
    options.minVersion ??
    options.minWordPress ??
    inlineOptions.minVersion ??
    inlineOptions.minWordPress;
  const strict = options.strict ?? inlineOptions.strict;

  if (allowUnknownFutureKeys !== undefined) {
    Object.assign(settings, { allowUnknownFutureKeys });
  }
  if (minVersion !== undefined) {
    Object.assign(settings, { minVersion });
  }
  if (strict !== undefined) {
    Object.assign(settings, { strict });
  }

  return settings;
}
