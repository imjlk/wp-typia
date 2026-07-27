import {
  BLOCK_ALIGNMENTS,
  BLOCK_CONTENT_POSITIONS,
  BLOCK_VERTICAL_ALIGNMENTS,
  JUSTIFY_CONTENT_OPTIONS,
  TEXT_ALIGNMENTS,
  type BlockAlignment,
  type BlockContentPosition,
  type BlockVerticalAlignment,
  type JustifyContent,
  type TextAlignment,
} from '@wp-typia/block-types/block-editor/alignment';
import {
  CSS_NAMED_COLORS,
  type CssNamedColor,
  type DuotonePalette,
} from '@wp-typia/block-types/block-editor/color';
import {
  ASPECT_RATIOS,
  MIN_HEIGHT_KEYWORDS,
  type AspectRatio,
  type MinHeightKeyword,
  type MinHeightValue,
} from '@wp-typia/block-types/block-editor/dimensions';
import {
  FLEX_WRAP_OPTIONS,
  LAYOUT_TYPES,
  ORIENTATIONS,
  type FlexWrap,
  type LayoutType,
  type Orientation,
} from '@wp-typia/block-types/block-editor/layout';
import {
  SPACING_AXES,
  SPACING_DIMENSIONS,
  SPACING_SIDES,
  type SpacingAxis,
  type SpacingDimension,
  type SpacingSide,
} from '@wp-typia/block-types/block-editor/spacing';
import type {
  BlockStyleAttributes,
  BlockStyleColorValue,
} from '@wp-typia/block-types/block-editor/style-attributes';
import {
  FONT_STYLES,
  TEXT_DECORATIONS,
  TEXT_TRANSFORMS,
  WRITING_MODES,
  type FontStyle,
  type TextDecoration,
  type TextTransform,
  type WritingMode,
} from '@wp-typia/block-types/block-editor/typography';
import {
  WORDPRESS_BLOCK_API_COMPATIBILITY,
  createWordPressBlockApiCompatibilityManifest,
  type WordPressBlockBindingCompatibilityFeature,
  type WordPressBlockApiCompatibilityFeature,
  type WordPressBlockMetadataCompatibilityFeature,
  type WordPressBlockSupportCompatibilityFeature,
  type WordPressCompatibilitySettings,
  type WordPressVersion,
} from '@wp-typia/block-types/blocks/compatibility';
import {
  createEditorBindingSourceRegistrationSource,
  createPhpBindingSourceRegistrationSource,
  defineBindableAttributes,
  defineBindingSource,
  defineBlockMetadataBindings,
  defineTypedBlockMetadataBindings,
  getDefinedBindingSourceMetadata,
  getDefinedBindingSourceCompatibilityManifest,
  type Binding,
  type BindingSourceField,
  type BindingSourceRegistrationEntry,
  type BlockMetadataBindings,
  type CreateEditorBindingSourceRegistrationSourceOptions,
  type CreatePhpBindingSourceRegistrationSourceOptions,
  type TypedBlockMetadataBindings,
} from '@wp-typia/block-types/blocks/bindings';
import {
  BLOCK_VARIATION_SCOPES,
  registerScaffoldBlockType,
  type BlockAttributeSchema,
  type BlockConfiguration,
  type BlockEditProps,
  type BlockVariation,
  type BlockVariationScope,
  type RegisterBlockTypeResult,
} from '@wp-typia/block-types/blocks/registration';
import {
  BLOCK_SUPPORT_FEATURES,
  SPACING_SUPPORT_KEYS,
  TYPOGRAPHY_SUPPORT_KEYS,
  defineSupports,
  getDefinedSupportsCompatibilityManifest,
  type BlockSupportFeature,
  type BlockSupports,
  type SpacingSupportKey,
  type SupportAttributes,
  type TypographySupportKey,
} from '@wp-typia/block-types/blocks/supports';
import {
  createStaticBlockVariationRegistrationSource,
  defineVariation,
  defineVariations,
  getDefinedVariationsMetadata,
  type BlockVariationRegistrationEntry,
} from '@wp-typia/block-types/blocks/variations';

const alignments = BLOCK_ALIGNMENTS satisfies readonly BlockAlignment[];
const contentPositions =
	BLOCK_CONTENT_POSITIONS satisfies readonly BlockContentPosition[];
const verticalAlignments =
	BLOCK_VERTICAL_ALIGNMENTS satisfies readonly BlockVerticalAlignment[];
const textAlignments = TEXT_ALIGNMENTS satisfies readonly TextAlignment[];
const justifyContentOptions =
	JUSTIFY_CONTENT_OPTIONS satisfies readonly JustifyContent[];
const namedColors = CSS_NAMED_COLORS satisfies readonly CssNamedColor[];
const aspectRatios = ASPECT_RATIOS satisfies readonly AspectRatio[];
const minHeightKeywords =
	MIN_HEIGHT_KEYWORDS satisfies readonly MinHeightKeyword[];
const layoutTypes = LAYOUT_TYPES satisfies readonly LayoutType[];
const flexWrapOptions = FLEX_WRAP_OPTIONS satisfies readonly FlexWrap[];
const orientations = ORIENTATIONS satisfies readonly Orientation[];
const spacingSides = SPACING_SIDES satisfies readonly SpacingSide[];
const spacingAxes = SPACING_AXES satisfies readonly SpacingAxis[];
const spacingDimensions =
	SPACING_DIMENSIONS satisfies readonly SpacingDimension[];
const textTransforms = TEXT_TRANSFORMS satisfies readonly TextTransform[];
const textDecorations = TEXT_DECORATIONS satisfies readonly TextDecoration[];
const fontStyles = FONT_STYLES satisfies readonly FontStyle[];
const writingModes = WRITING_MODES satisfies readonly WritingMode[];
const variationScopes =
	BLOCK_VARIATION_SCOPES satisfies readonly BlockVariationScope[];
const supportFeatures =
	BLOCK_SUPPORT_FEATURES satisfies readonly BlockSupportFeature[];
const spacingSupportKeys =
	SPACING_SUPPORT_KEYS satisfies readonly SpacingSupportKey[];
const typographySupportKeys =
	TYPOGRAPHY_SUPPORT_KEYS satisfies readonly TypographySupportKey[];
const compatibilityMinVersion: WordPressVersion = '6.7';
const compatibilitySettings: WordPressCompatibilitySettings = {
  allowUnknownFutureKeys: false,
  minVersion: compatibilityMinVersion,
  strict: true,
};
const compatibilityFeature: WordPressBlockApiCompatibilityFeature = {
  area: 'blockSupports',
  feature: 'allowedBlocks',
};
const supportCompatibilityFeature: WordPressBlockSupportCompatibilityFeature =
	'typography.textAlign';
const metadataCompatibilityFeature: WordPressBlockMetadataCompatibilityFeature =
	'blockHooks';
const bindingCompatibilityFeature: WordPressBlockBindingCompatibilityFeature =
	'editorFieldsList';
const compatibilityManifest = createWordPressBlockApiCompatibilityManifest(
  [compatibilityFeature],
  compatibilitySettings,
);
const supportsTextAlignSince =
	WORDPRESS_BLOCK_API_COMPATIBILITY.blockSupports['typography.textAlign'].since;
const proseSupports = defineSupports({
  minWordPress: '6.6',
  anchor: true,
  color: {
    background: true,
    text: true,
  },
  html: false,
  layout: {
    default: {
      type: 'constrained',
    },
  },
  spacing: {
    blockGap: true,
    margin: true,
    padding: true,
  },
  typography: {
    fontSize: true,
    letterSpacing: true,
    lineHeight: true,
    textAlign: ['left', 'center'],
  },
});
const proseSupportManifest =
	getDefinedSupportsCompatibilityManifest(proseSupports);
const alignSupports = defineSupports({
  align: ['wide', 'full'],
});
type AlignSupportAttributes = SupportAttributes<typeof alignSupports>;
const alignSupportHasAlign: 'align' extends keyof AlignSupportAttributes
	? true
	: never = true;
const alignWideOnlySupports = defineSupports({
  alignWide: true,
});
type AlignWideOnlySupportAttributes = SupportAttributes<
	typeof alignWideOnlySupports
>;
const alignWideDoesNotExposeAlign: 'align' extends keyof AlignWideOnlySupportAttributes
	? never
	: true = true;

type ExampleAttributes = SupportAttributes<typeof proseSupports> & {
  content: string;
};

type ProfileBindingArgs = {
  field: 'display_name' | 'image_url';
};

type ProfileCardAttributes = {
  displayName?: string;
  imageUrl?: string;
  metadata?: BlockMetadataBindings<{
    imageUrl: Binding<'example/profile-data', { field: 'image_url' }>;
  }>;
};

const profileBindableAttributes =
	defineBindableAttributes<ProfileCardAttributes>('example/profile-card', [
		'imageUrl',
	] as const);
const profileFields = [
  {
    args: {
      field: 'display_name',
    },
    label: 'Display name',
    name: 'display_name',
    type: 'string',
  },
  {
    args: {
      field: 'image_url',
    },
    label: 'Image URL',
    name: 'image_url',
    type: 'string',
  },
] as const satisfies readonly BindingSourceField<ProfileBindingArgs>[];
const profileDataSource = defineBindingSource({
  args: {
    field: 'display_name' as ProfileBindingArgs['field'],
  },
  bindableAttributes: [profileBindableAttributes],
  fields: profileFields,
  getValueCallback: 'example_get_profile_binding_value',
  label: 'Profile Data',
  minWordPress: {
    editor: '6.7',
    fieldsList: '6.9',
    server: '6.5',
    supportedAttributesFilter: '6.9',
  },
  name: 'example/profile-data',
  usesContext: ['postId'],
});
const profileSourceManifest =
	getDefinedBindingSourceCompatibilityManifest(profileDataSource);
const profileSourceMetadata = getDefinedBindingSourceMetadata(
  profileDataSource,
);
const profileMetadata = defineBlockMetadataBindings({
	imageUrl: {
		args: {
			field: 'image_url',
		},
		source: profileDataSource.name,
	} satisfies Binding<typeof profileDataSource, { field: 'image_url' }>,
});
const typedProfileMetadata =
	defineTypedBlockMetadataBindings<ProfileCardAttributes>({
		imageUrl: {
			args: {
				field: 'display_name',
			},
			source: profileDataSource.name,
		} satisfies Binding<typeof profileDataSource, { field: 'display_name' }>,
	});
const profileMetadataContract: TypedBlockMetadataBindings<
	ProfileCardAttributes,
	{
		imageUrl: Binding<typeof profileDataSource, { field: 'image_url' }>;
	}
> = profileMetadata;
const profilePhpRegistrationOptions = {
  textDomain: 'example',
} satisfies CreatePhpBindingSourceRegistrationSourceOptions;
const profileEditorRegistrationOptions = {
  importSource: '@wordpress/blocks',
} satisfies CreateEditorBindingSourceRegistrationSourceOptions;
const profilePhpRegistrationSource =
	createPhpBindingSourceRegistrationSource(
    profileDataSource,
    profilePhpRegistrationOptions,
  );
const profileEditorRegistrationSource =
	createEditorBindingSourceRegistrationSource(
    profileDataSource,
    profileEditorRegistrationOptions,
  );
const profileRegistrationEntry: BindingSourceRegistrationEntry = {
  metadata: profileSourceMetadata!,
  source: profileDataSource,
};

type ParagraphVariationAttributes = {
  className?: string;
  content?: string;
};
type HeadingVariationAttributes = {
  className?: string;
  level?: number;
};
type GalleryAttributes = {
  items: Array<{ label: string }>;
  tags: string[];
};
type AttributeLessAttributes = Record<never, never>;

const paragraphActiveMarkers = ['className'] as const;

const galleryAttributeSchema = {
  items: {
    default: [{ label: 'Featured' }],
    type: 'array',
  },
  tags: {
    default: ['featured'],
    type: 'array',
  },
} satisfies BlockAttributeSchema<GalleryAttributes>;

const paragraphVariation = defineVariation<ParagraphVariationAttributes>(
  'core/paragraph',
  {
    attributes: {
      className: 'is-style-balanced',
    },
    example: {
      innerBlocks: [
        {
          attributes: {
            content: 'Child preview content',
          },
          name: 'core/paragraph',
        },
      ],
      viewportWidth: 640,
    },
    isActive: paragraphActiveMarkers,
    name: 'example-balanced-paragraph',
    scope: ['inserter', 'transform'],
    title: 'Balanced Paragraph',
  },
);
const headingVariation = defineVariation<HeadingVariationAttributes>(
  'core/heading',
  {
    attributes: {
      className: 'is-style-balanced-heading',
      level: 2,
    },
    isActive: ['className', 'level'],
    name: 'example-balanced-heading',
    scope: ['inserter', 'transform'],
    title: 'Balanced Heading',
  },
);
const proseGroupVariation = defineVariation('core/group', {
  attributes: {
    className: 'is-style-prose-group',
  },
  innerBlocks: [
    ['core/heading', { level: 2, placeholder: 'Title' }],
    ['core/paragraph', { placeholder: 'Write...' }],
  ],
  isActive: ['className'],
  name: 'example-prose-group',
  scope: ['inserter'],
  title: 'Prose Group',
});
const blockVariations = defineVariations([
	paragraphVariation,
	headingVariation,
	proseGroupVariation,
] as const);
const variationEntries = getDefinedVariationsMetadata(blockVariations)?.entries;
const variationRegistrationEntry: BlockVariationRegistrationEntry =
	variationEntries?.[0] ?? {
    blockName: 'core/paragraph',
    variation: paragraphVariation,
  };
const variationRegistrationSource =
	createStaticBlockVariationRegistrationSource(blockVariations);

declare const configuration: BlockConfiguration<ExampleAttributes>;
declare const editProps: BlockEditProps<ExampleAttributes>;
declare const variation: BlockVariation<ExampleAttributes>;

const registrationResult: RegisterBlockTypeResult<ExampleAttributes> =
	registerScaffoldBlockType<ExampleAttributes>(
    'wp-typia/example-block',
    configuration,
  );
const attributeLessConfiguration = {
  category: 'widgets',
  title: 'Attribute-less block',
} satisfies BlockConfiguration<AttributeLessAttributes>;
const _attributeLessRegistrationResult: RegisterBlockTypeResult<AttributeLessAttributes> =
	registerScaffoldBlockType<AttributeLessAttributes>(
    'wp-typia/attribute-less-block',
    attributeLessConfiguration,
  );

const content = editProps.attributes.content;
const maybeVariationTitle = variation.title;
const validColorValue: BlockStyleColorValue = 'var:preset|color|primary';
const validMinHeightValue: MinHeightValue = 'clamp(2rem, 10vh, 6rem)';
const duotonePalette: DuotonePalette = {
  colors: ['transparent', 'currentColor'],
  name: 'Neutral',
  slug: 'neutral',
};

const styleAttributes: BlockStyleAttributes = {
  color: {
    text: validColorValue,
  },
  dimensions: {
    minHeight: 'auto',
  },
  spacing: {
    padding: {
      top: '1rem',
      bottom: '2rem',
    },
  },
  typography: {
    textAlign: 'center',
    textDecoration: 'underline',
  },
};
const derivedSupportAttributes: SupportAttributes<typeof proseSupports> = {
  backgroundColor: 'primary',
  fontSize: 'large',
  layout: {
    type: 'constrained',
  },
  style: {
    color: {
      text: 'var:preset|color|primary',
    },
    spacing: {
      margin: '1rem',
      padding: {
        top: '1rem',
      },
    },
    typography: {
      letterSpacing: '0.02em',
      lineHeight: 1.5,
      textAlign: 'center',
    },
  },
  textColor: 'foreground',
};

const supports: BlockSupports = {
  allowedBlocks: true,
  color: {
    button: true,
    gradients: true,
    text: true,
  },
  layout: {
    default: {
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      orientation: 'horizontal',
      type: 'flex',
    },
  },
  spacing: {
    padding: ['top', 'bottom'],
    units: ['px', 'rem'],
  },
  typography: {
    dropCap: true,
    textAlign: ['left', 'center'],
  },
  visibility: true,
};

void alignments;
void contentPositions;
void verticalAlignments;
void textAlignments;
void justifyContentOptions;
void namedColors;
void aspectRatios;
void minHeightKeywords;
void layoutTypes;
void flexWrapOptions;
void orientations;
void spacingSides;
void spacingAxes;
void spacingDimensions;
void textTransforms;
void textDecorations;
void fontStyles;
void writingModes;
void variationScopes;
void supportFeatures;
void spacingSupportKeys;
void typographySupportKeys;
void compatibilityManifest;
void supportCompatibilityFeature;
void metadataCompatibilityFeature;
void bindingCompatibilityFeature;
void supportsTextAlignSince;
void proseSupports;
void proseSupportManifest;
void alignSupports;
void alignSupportHasAlign;
void alignWideOnlySupports;
void alignWideDoesNotExposeAlign;
void profileBindableAttributes;
void profileFields;
void profileDataSource;
void profileSourceManifest;
void profileSourceMetadata;
void profileMetadata;
void typedProfileMetadata;
void profileMetadataContract;
void profilePhpRegistrationSource;
void profileEditorRegistrationSource;
void profileRegistrationEntry;
void galleryAttributeSchema;
void paragraphVariation;
void headingVariation;
void proseGroupVariation;
void blockVariations;
void variationEntries;
void variationRegistrationEntry;
void variationRegistrationSource;
void registrationResult;
void _attributeLessRegistrationResult;
void content;
void maybeVariationTitle;
void styleAttributes;
void derivedSupportAttributes;
void supports;
void duotonePalette;
void validMinHeightValue;

// @ts-expect-error BlockAlignment should stay narrower than text alignment.
const invalidBlockAlignment: BlockAlignment = 'justify';

// @ts-expect-error CssNamedColor intentionally excludes arbitrary CSS values.
const invalidNamedColor: CssNamedColor = '#ffffff';

// @ts-expect-error Block variation scopes should stay within the published tuple.
const invalidVariationScope: BlockVariationScope = 'toolbar';

// @ts-expect-error Typography textAlign should only accept text alignment values.
const invalidTextAlignments = ['wide'] satisfies readonly TextAlignment[];

const invalidVariationActiveAttribute = defineVariation<HeadingVariationAttributes>(
	'core/heading',
	{
		attributes: {
			level: 2,
		},
		// @ts-expect-error Variation isActive should reference typed variation attributes.
		isActive: ['missing'],
		name: 'invalid-heading-variation',
		title: 'Invalid Heading Variation',
	},
);

const invalidTitlelessVariation = defineVariation<ParagraphVariationAttributes>(
	'core/paragraph',
	// @ts-expect-error WordPress variation registration requires a title.
	{
		attributes: {
			className: 'is-style-titleless',
		},
		name: 'invalid-titleless-variation',
	},
);

// @ts-expect-error Binding args must match the source args declared by defineBindingSource().
const invalidProfileBinding: Binding<typeof profileDataSource, { field: 'missing' }> = {
  args: {
    field: 'missing',
  },
  source: profileDataSource.name,
};

const invalidBindableAttributes =
	defineBindableAttributes<ProfileCardAttributes>('example/profile-card', [
		// @ts-expect-error Bindable attributes must reference typed block attributes.
		'missing',
	] as const);

const invalidTypedProfileMetadata =
	defineTypedBlockMetadataBindings<ProfileCardAttributes>({
		// @ts-expect-error metadata.bindings keys must reference typed block attributes.
		missing: {
			args: {
				field: 'image_url',
			},
			source: profileDataSource.name,
		},
	});

void invalidBlockAlignment;
void invalidNamedColor;
void invalidVariationScope;
void invalidTextAlignments;
void invalidVariationActiveAttribute;
void invalidTitlelessVariation;
void invalidProfileBinding;
void invalidBindableAttributes;
void invalidTypedProfileMetadata;
