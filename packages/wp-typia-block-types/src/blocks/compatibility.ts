export type WordPressVersion =
  | `${number}.${number}`
  | `${number}.${number}.${number}`;

export type WordPressBlockApiCompatibilityArea =
  | 'blockMetadata'
  | 'blockSupports'
  | 'blockVariations'
  | 'blockBindings';

export type WordPressBlockApiRuntime = 'block-json' | 'editor-js' | 'php';

export type WordPressBlockApiCompatibilityStatus =
  | 'supported'
  | 'unsupported'
  | 'unknown';

export type WordPressBlockApiCompatibilityDiagnosticSeverity =
  | 'error'
  | 'warning';

export type WordPressBlockApiCompatibilityAction =
  | 'generate'
  | 'guard'
  | 'skip'
  | 'pass-through';

export interface WordPressBlockApiCompatibilityEntry {
  readonly since: WordPressVersion;
  readonly label: string;
  readonly runtime: readonly WordPressBlockApiRuntime[];
  readonly source: keyof typeof WORDPRESS_BLOCK_API_COMPATIBILITY_SOURCES;
  readonly derivedAttributes?: readonly string[];
  readonly fallback?: string;
  readonly notes?: string;
}

export interface WordPressCompatibilitySettings {
  readonly minVersion?: WordPressVersion;
  readonly strict?: boolean;
  readonly allowUnknownFutureKeys?: boolean;
}

export interface WordPressBlockApiCompatibilityFeature {
  readonly area: WordPressBlockApiCompatibilityArea;
  readonly feature: string;
}

export interface WordPressBlockApiCompatibilityDiagnostic {
  readonly area: WordPressBlockApiCompatibilityArea;
  readonly code:
    | 'unsupported-wordpress-block-api-feature'
    | 'unknown-wordpress-block-api-feature';
  readonly feature: string;
  readonly message: string;
  readonly minVersion: WordPressVersion;
  readonly requiredVersion?: WordPressVersion;
  readonly severity: WordPressBlockApiCompatibilityDiagnosticSeverity;
}

export interface WordPressBlockApiCompatibilityEvaluation
  extends WordPressBlockApiCompatibilityFeature {
  readonly action: WordPressBlockApiCompatibilityAction;
  readonly entry?: WordPressBlockApiCompatibilityEntry | undefined;
  readonly diagnostic?: WordPressBlockApiCompatibilityDiagnostic | undefined;
  readonly minVersion: WordPressVersion;
  readonly status: WordPressBlockApiCompatibilityStatus;
}

export interface WordPressBlockApiCompatibilityManifest {
  readonly allowUnknownFutureKeys: boolean;
  readonly diagnostics: readonly WordPressBlockApiCompatibilityDiagnostic[];
  readonly evaluations: readonly WordPressBlockApiCompatibilityEvaluation[];
  readonly minVersion: WordPressVersion;
  readonly strict: boolean;
  readonly supported: readonly WordPressBlockApiCompatibilityEvaluation[];
  readonly unknown: readonly WordPressBlockApiCompatibilityEvaluation[];
  readonly unsupported: readonly WordPressBlockApiCompatibilityEvaluation[];
}

export const DEFAULT_WORDPRESS_COMPATIBILITY_MIN_VERSION = '6.7' as const;

export const WORDPRESS_VERSION_PATTERN = /^\d+\.\d+(?:\.\d+)?$/u;

export const WORDPRESS_BLOCK_API_COMPATIBILITY_SOURCES = {
  blockBindingsHandbook:
    'https://developer.wordpress.org/block-editor/reference-guides/block-api/block-bindings/',
  blockBindingsReference:
    'https://developer.wordpress.org/reference/functions/register_block_bindings_source/',
  blockBindingsSupportedAttributes:
    'https://developer.wordpress.org/reference/functions/get_block_bindings_supported_attributes/',
  blockMetadataReference:
    'https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/',
  blockSupportsHandbook:
    'https://developer.wordpress.org/block-editor/reference-guides/block-api/block-supports/',
  blockVariationsDevNote:
    'https://make.wordpress.org/core/2020/02/27/introduce-block-variations-api/',
  blockVariationsPhpDevNote:
    'https://make.wordpress.org/core/2024/02/29/performance-improvements-for-registering-block-variations-with-callbacks/',
  themeJsonStyleVersions:
    'https://developer.wordpress.org/block-editor/reference-guides/theme-json-reference/styles-versions/',
  wordpressBlocksPackage:
    'https://developer.wordpress.org/block-editor/reference-guides/packages/packages-blocks/',
} as const;

export const WORDPRESS_BLOCK_API_COMPATIBILITY = {
  blockMetadata: {
    blockHooks: {
      label: 'blockHooks metadata',
      runtime: ['block-json', 'php'],
      since: '6.4',
      source: 'blockMetadataReference',
    },
  },
  blockBindings: {
    'metadata.bindings': {
      derivedAttributes: ['metadata'],
      label: 'block metadata.bindings',
      runtime: ['block-json', 'php'],
      since: '6.5',
      source: 'blockBindingsHandbook',
    },
    editorRegistration: {
      fallback: 'Keep server-side registration only.',
      label: 'registerBlockBindingsSource() editor registration',
      runtime: ['editor-js'],
      since: '6.7',
      source: 'wordpressBlocksPackage',
    },
    editorFieldsList: {
      fallback:
        'Register the source without getFieldsList() or keep a custom editor UI.',
      label: 'registerBlockBindingsSource() getFieldsList()',
      runtime: ['editor-js'],
      since: '6.9',
      source: 'blockBindingsHandbook',
    },
    editorSourceLookup: {
      label: 'getBlockBindingsSource() and getBlockBindingsSources()',
      runtime: ['editor-js'],
      since: '6.7',
      source: 'wordpressBlocksPackage',
    },
    serverRegistration: {
      label: 'register_block_bindings_source()',
      runtime: ['php'],
      since: '6.5',
      source: 'blockBindingsReference',
    },
    supportedAttributesFilter: {
      fallback: 'Keep the core supported-attributes list or guard the filter.',
      label: 'block_bindings_supported_attributes filters',
      runtime: ['php'],
      since: '6.9',
      source: 'blockBindingsSupportedAttributes',
    },
  },
  blockSupports: {
    allowedBlocks: {
      derivedAttributes: ['allowedBlocks'],
      fallback: 'Pass allowedBlocks directly to useInnerBlocksProps() in custom editor code.',
      label: 'supports.allowedBlocks',
      runtime: ['block-json', 'editor-js'],
      since: '6.9',
      source: 'blockSupportsHandbook',
    },
    background: {
      derivedAttributes: ['style'],
      label: 'supports.background',
      runtime: ['block-json', 'editor-js'],
      since: '6.5',
      source: 'blockSupportsHandbook',
    },
    'color.button': {
      derivedAttributes: ['style'],
      label: 'supports.color.button',
      runtime: ['block-json', 'editor-js'],
      since: '6.5',
      source: 'blockSupportsHandbook',
    },
    'color.enableContrastChecker': {
      label: 'supports.color.enableContrastChecker',
      runtime: ['block-json', 'editor-js'],
      since: '6.5',
      source: 'blockSupportsHandbook',
    },
    'color.heading': {
      derivedAttributes: ['style'],
      label: 'supports.color.heading',
      runtime: ['block-json', 'editor-js'],
      since: '6.5',
      source: 'blockSupportsHandbook',
    },
    contentRole: {
      label: 'supports.contentRole',
      runtime: ['block-json', 'editor-js'],
      since: '6.9',
      source: 'blockSupportsHandbook',
    },
    dimensions: {
      derivedAttributes: ['style'],
      label: 'supports.dimensions',
      runtime: ['block-json', 'editor-js'],
      since: '6.2',
      source: 'blockSupportsHandbook',
    },
    'filter.duotone': {
      derivedAttributes: ['style'],
      label: 'supports.filter.duotone',
      runtime: ['block-json', 'editor-js'],
      since: '5.9',
      source: 'themeJsonStyleVersions',
    },
    interactivity: {
      label: 'supports.interactivity',
      runtime: ['block-json', 'editor-js'],
      since: '6.5',
      source: 'blockSupportsHandbook',
    },
    listView: {
      label: 'supports.listView',
      runtime: ['block-json', 'editor-js'],
      since: '7.0',
      source: 'blockSupportsHandbook',
    },
    position: {
      derivedAttributes: ['style'],
      label: 'supports.position',
      runtime: ['block-json', 'editor-js'],
      since: '6.2',
      source: 'blockSupportsHandbook',
    },
    renaming: {
      label: 'supports.renaming',
      runtime: ['block-json', 'editor-js'],
      since: '6.5',
      source: 'blockSupportsHandbook',
    },
    shadow: {
      derivedAttributes: ['style'],
      label: 'supports.shadow',
      runtime: ['block-json', 'editor-js'],
      since: '6.5',
      source: 'blockSupportsHandbook',
    },
    splitting: {
      label: 'supports.splitting',
      runtime: ['block-json', 'editor-js'],
      since: '6.5',
      source: 'blockSupportsHandbook',
    },
    'spacing.blockGap': {
      derivedAttributes: ['style'],
      label: 'supports.spacing.blockGap',
      runtime: ['block-json', 'editor-js'],
      since: '5.9',
      source: 'themeJsonStyleVersions',
    },
    'spacing.margin': {
      derivedAttributes: ['style'],
      label: 'supports.spacing.margin',
      runtime: ['block-json', 'editor-js'],
      since: '5.9',
      source: 'themeJsonStyleVersions',
    },
    'spacing.padding': {
      derivedAttributes: ['style'],
      label: 'supports.spacing.padding',
      runtime: ['block-json', 'editor-js'],
      since: '5.9',
      source: 'themeJsonStyleVersions',
    },
    'typography.fontSize': {
      derivedAttributes: ['fontSize', 'style'],
      label: 'supports.typography.fontSize',
      runtime: ['block-json', 'editor-js'],
      since: '5.8',
      source: 'themeJsonStyleVersions',
    },
    'typography.letterSpacing': {
      derivedAttributes: ['style'],
      label: 'supports.typography.letterSpacing',
      runtime: ['block-json', 'editor-js'],
      since: '5.9',
      source: 'themeJsonStyleVersions',
    },
    'typography.lineHeight': {
      derivedAttributes: ['style'],
      label: 'supports.typography.lineHeight',
      runtime: ['block-json', 'editor-js'],
      since: '5.8',
      source: 'themeJsonStyleVersions',
    },
    'typography.textAlign': {
      derivedAttributes: ['style'],
      label: 'supports.typography.textAlign',
      runtime: ['block-json', 'editor-js'],
      since: '6.6',
      source: 'blockSupportsHandbook',
    },
    'typography.textDecoration': {
      derivedAttributes: ['style'],
      label: 'supports.typography.textDecoration',
      runtime: ['block-json', 'editor-js'],
      since: '5.9',
      source: 'themeJsonStyleVersions',
    },
    'typography.textTransform': {
      derivedAttributes: ['style'],
      label: 'supports.typography.textTransform',
      runtime: ['block-json', 'editor-js'],
      since: '5.9',
      source: 'themeJsonStyleVersions',
    },
    visibility: {
      fallback: 'Keep the default block options menu behavior.',
      label: 'supports.visibility',
      runtime: ['block-json', 'editor-js'],
      since: '6.9',
      source: 'blockSupportsHandbook',
    },
  },
  blockVariations: {
    editorRegistration: {
      label: 'registerBlockVariation() editor registration',
      runtime: ['editor-js'],
      since: '5.4',
      source: 'blockVariationsDevNote',
    },
    phpVariationCallback: {
      fallback: 'Build static variations or register them in editor JavaScript.',
      label: 'WP_Block_Type variation_callback',
      runtime: ['php'],
      since: '6.5',
      source: 'blockVariationsPhpDevNote',
    },
    phpVariationsFilter: {
      fallback: 'Use JavaScript registration or guard the PHP filter path.',
      label: 'get_block_type_variations filter',
      runtime: ['php'],
      since: '6.5',
      source: 'blockVariationsPhpDevNote',
    },
    registrationMetadata: {
      label: 'block registration variations metadata',
      runtime: ['editor-js'],
      since: '5.4',
      source: 'blockVariationsDevNote',
    },
    registrationBlockJsonMetadata: {
      label: 'block.json variations metadata',
      runtime: ['block-json'],
      since: '5.9',
      source: 'blockMetadataReference',
    },
    registrationMetadataFile: {
      fallback: 'Use inline block.json variations or register variations in editor JavaScript.',
      label: 'block.json variations file metadata',
      runtime: ['block-json', 'php'],
      since: '6.7',
      source: 'blockMetadataReference',
    },
  },
} as const satisfies Record<
  WordPressBlockApiCompatibilityArea,
  Record<string, WordPressBlockApiCompatibilityEntry>
>;

export type WordPressBlockSupportCompatibilityFeature =
  keyof typeof WORDPRESS_BLOCK_API_COMPATIBILITY.blockSupports;

export type WordPressBlockMetadataCompatibilityFeature =
  keyof typeof WORDPRESS_BLOCK_API_COMPATIBILITY.blockMetadata;

export type WordPressBlockVariationCompatibilityFeature =
  keyof typeof WORDPRESS_BLOCK_API_COMPATIBILITY.blockVariations;

export type WordPressBlockBindingCompatibilityFeature =
  keyof typeof WORDPRESS_BLOCK_API_COMPATIBILITY.blockBindings;

function normalizeCompatibilitySettings(
  settings: WordPressCompatibilitySettings,
): Required<WordPressCompatibilitySettings> {
  return {
    allowUnknownFutureKeys: settings.allowUnknownFutureKeys ?? false,
    minVersion: settings.minVersion ?? DEFAULT_WORDPRESS_COMPATIBILITY_MIN_VERSION,
    strict: settings.strict ?? true,
  };
}

export function assertWordPressVersion(
  value: string,
): asserts value is WordPressVersion {
  if (!WORDPRESS_VERSION_PATTERN.test(value)) {
    throw new Error(
      `Invalid WordPress version "${value}". Expected dotted numeric version such as "6.7" or "6.7.1".`,
    );
  }
}

export function compareWordPressVersions(left: string, right: string): number {
  assertWordPressVersion(left);
  assertWordPressVersion(right);

  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10));
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10));
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

export function isWordPressVersionAtLeast(
  version: string,
  minimum: string,
): boolean {
  return compareWordPressVersions(version, minimum) >= 0;
}

export function getWordPressBlockApiCompatibilityEntry(
  area: WordPressBlockApiCompatibilityArea,
  feature: string,
): WordPressBlockApiCompatibilityEntry | undefined {
  return (
    WORDPRESS_BLOCK_API_COMPATIBILITY[area] as Record<
      string,
      WordPressBlockApiCompatibilityEntry | undefined
    >
  )[feature];
}

export function evaluateWordPressBlockApiCompatibility(
  feature: WordPressBlockApiCompatibilityFeature,
  settings: WordPressCompatibilitySettings = {},
): WordPressBlockApiCompatibilityEvaluation {
  const resolved = normalizeCompatibilitySettings(settings);
  const entry = getWordPressBlockApiCompatibilityEntry(
    feature.area,
    feature.feature,
  );
  const severity: WordPressBlockApiCompatibilityDiagnosticSeverity =
    resolved.strict ? 'error' : 'warning';

  if (!entry) {
    const diagnostic: WordPressBlockApiCompatibilityDiagnostic | undefined =
      resolved.allowUnknownFutureKeys
        ? undefined
        : {
            area: feature.area,
            code: 'unknown-wordpress-block-api-feature',
            feature: feature.feature,
            message: `Unknown WordPress block API feature "${feature.area}.${feature.feature}".`,
            minVersion: resolved.minVersion,
            severity,
          };

    return {
      ...feature,
      action: resolved.allowUnknownFutureKeys ? 'pass-through' : 'guard',
      diagnostic,
      minVersion: resolved.minVersion,
      status: 'unknown',
    };
  }

  if (isWordPressVersionAtLeast(resolved.minVersion, entry.since)) {
    return {
      ...feature,
      action: 'generate',
      entry,
      minVersion: resolved.minVersion,
      status: 'supported',
    };
  }

  const diagnostic: WordPressBlockApiCompatibilityDiagnostic = {
    area: feature.area,
    code: 'unsupported-wordpress-block-api-feature',
    feature: feature.feature,
    message: `${entry.label} requires WordPress ${entry.since}+ but the configured minimum is ${resolved.minVersion}.`,
    minVersion: resolved.minVersion,
    requiredVersion: entry.since,
    severity,
  };

  return {
    ...feature,
    action: resolved.strict ? 'skip' : 'guard',
    diagnostic,
    entry,
    minVersion: resolved.minVersion,
    status: 'unsupported',
  };
}

export function createWordPressBlockApiCompatibilityManifest(
  features: readonly WordPressBlockApiCompatibilityFeature[],
  settings: WordPressCompatibilitySettings = {},
): WordPressBlockApiCompatibilityManifest {
  const resolved = normalizeCompatibilitySettings(settings);
  const evaluations = features.map((feature) =>
    evaluateWordPressBlockApiCompatibility(feature, resolved),
  );
  const diagnostics = evaluations.flatMap((evaluation) =>
    evaluation.diagnostic ? [evaluation.diagnostic] : [],
  );

  return {
    allowUnknownFutureKeys: resolved.allowUnknownFutureKeys,
    diagnostics,
    evaluations,
    minVersion: resolved.minVersion,
    strict: resolved.strict,
    supported: evaluations.filter(
      (evaluation) => evaluation.status === 'supported',
    ),
    unknown: evaluations.filter((evaluation) => evaluation.status === 'unknown'),
    unsupported: evaluations.filter(
      (evaluation) => evaluation.status === 'unsupported',
    ),
  };
}
