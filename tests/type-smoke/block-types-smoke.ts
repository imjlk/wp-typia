import type {
  BlockAlignment,
  BlockContentPosition,
  BlockVerticalAlignment,
  TextAlignment,
} from '@wp-typia/block-types/block-editor/alignment';
import type {
  CssColorValue,
  CssNamedColor,
  DuotonePalette,
} from '@wp-typia/block-types/block-editor/color';
import type {
  AspectRatio,
  MinHeightKeyword,
  MinHeightValue,
} from '@wp-typia/block-types/block-editor/dimensions';
import type { LayoutType } from '@wp-typia/block-types/block-editor/layout';
import type { SpacingDimension } from '@wp-typia/block-types/block-editor/spacing';
import type {
  BlockColorSupportAttributes,
  BlockShadowStyleAttributes,
  BlockStyleAttributes,
  BlockStyleSupportAttributes,
  PresetDuotoneReference,
} from '@wp-typia/block-types/block-editor/style-attributes';
import type { TextTransform } from '@wp-typia/block-types/block-editor/typography';
import type {
  BlockConfiguration,
  BlockDeprecationList,
  BlockEditProps,
  BlockInstance,
  BlockSaveProps,
  BlockTemplate,
  BlockVariation,
  RegisterBlockTypeResult,
} from '@wp-typia/block-types/blocks/registration';
import { registerScaffoldBlockType } from '@wp-typia/block-types/blocks/registration';
import type { BlockVariation as AggregateBlockVariation } from '@wp-typia/block-types/blocks';
import { registerBlockVariation } from '@wordpress/blocks';
import {
  createWordPressBlockApiCompatibilityManifest,
  type WordPressBlockApiCompatibilityFeature,
  type WordPressVersion,
} from '@wp-typia/block-types/blocks/compatibility';
import {
  createEditorBindingSourceRegistrationSource,
  createPhpBindingSourceRegistrationSource,
  defineBindableAttributes,
  defineBindingSource,
  defineTypedBlockMetadataBindings,
} from '@wp-typia/block-types/blocks/bindings';
import type {
  Binding,
  BindingSourceDiagnostic,
  BindingSourceRegistrationEntry,
  TypedBlockMetadataBindings,
} from '@wp-typia/block-types/blocks/bindings';
import {
  defineSupports,
  getDefinedSupportsCompatibilityManifest,
} from '@wp-typia/block-types/blocks/supports';
import type {
  BlockSupports,
  SpacingSize,
  SupportAttributes,
  TypographySupportKey,
} from '@wp-typia/block-types/blocks/supports';
import {
  createStaticBlockVariationRegistrationSource,
  defineVariation,
  defineVariations,
  getDefinedVariationsMetadata,
} from '@wp-typia/block-types/blocks/variations';
import type {
  BlockVariationDiagnostic,
  BlockVariationRegistrationEntry,
} from '@wp-typia/block-types/blocks/variations';

const aspectRatio: AspectRatio = '16/9';
const blockAlignment: BlockAlignment = 'wide';
const contentPosition: BlockContentPosition = 'center right';
const layoutType: LayoutType = 'flex';
const minHeightKeyword: MinHeightKeyword = 'auto';
const minHeight: MinHeightValue = '320px';
const presetDuotone: PresetDuotoneReference =
  'var:preset|duotone|high-contrast';
const shadowValue: BlockShadowStyleAttributes =
  '0 10px 30px rgba(0, 0, 0, 0.2)';
const spacingDimension: SpacingDimension = 'bottom';
const spacingSize: SpacingSize = {
  name: 'XL',
  size: '2rem',
  slug: 'xl',
};
const supportKey: TypographySupportKey = 'dropCap';
const minWordPressVersion: WordPressVersion = '6.7';
const compatibilityFeatures: WordPressBlockApiCompatibilityFeature[] = [
  {
    area: 'blockSupports',
    feature: 'typography.textAlign',
  },
  {
    area: 'blockBindings',
    feature: 'serverRegistration',
  },
];
const compatibilityManifest = createWordPressBlockApiCompatibilityManifest(
  compatibilityFeatures,
  {
    minVersion: minWordPressVersion,
  },
);
const blockSupports: BlockSupports = {
  align: ['wide', 'full'],
  allowedBlocks: true,
  background: {
    backgroundImage: true,
    backgroundSize: true,
  },
  border: {
    color: true,
    radius: true,
    __experimentalSkipSerialization: ['radius', 'width'],
  },
  color: {
    background: true,
    enableAlpha: true,
    gradients: true,
    link: true,
    text: true,
    __experimentalSkipSerialization: ['background', 'text'],
  },
  dimensions: {
    aspectRatio: true,
    minHeight: true,
    __experimentalSkipSerialization: ['minHeight'],
  },
  interactivity: {
    clientNavigation: true,
    interactive: true,
  },
  js: true,
  layout: {
    allowSwitching: true,
    allowVerticalAlignment: true,
    allowWrap: true,
    default: {
      type: 'flex',
      flexWrap: 'nowrap',
      contentSize: '720px',
      wideSize: '1200px',
      verticalAlignment: 'center',
      minimumColumnWidth: '16rem',
      columnCount: 3,
      columnGap: '2rem',
      rowGap: '1.5rem',
    },
  },
  locking: true,
  spacing: {
    blockGap: ['horizontal', 'vertical'],
    margin: ['top', 'bottom'],
    padding: ['top', 'bottom', 'left', 'right', 'horizontal'],
    spacingSizes: [spacingSize],
    units: ['px', 'rem', 'em'],
    __experimentalSkipSerialization: ['margin', 'padding'],
  },
  typography: {
    dropCap: true,
    fontFamily: true,
    fontSize: true,
    textAlign: ['left', 'justify'],
    textTransform: true,
    __experimentalSkipSerialization: true,
  },
  visibility: true,
};
const typedSupports = defineSupports({
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
const typedSupportManifest = getDefinedSupportsCompatibilityManifest(
  typedSupports,
);
const derivedSupportAttrs: SupportAttributes<typeof typedSupports> = {
  backgroundColor: 'primary',
  fontSize: 'large',
  layout: {
    type: 'constrained',
  },
  style: {
    color: {
      text: 'var(--wp--preset--color--primary)',
    },
    spacing: {
      blockGap: '1rem',
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
const textAlignment: TextAlignment = 'justify';
const textTransform: TextTransform = 'capitalize';
const blockVerticalAlignment: BlockVerticalAlignment = 'top';
const namedColor: CssNamedColor = 'transparent';
const textColor: CssColorValue = 'var(--wp--preset--color--primary)';
const supportStyleAttributes: BlockStyleSupportAttributes = {
  backgroundColor: 'primary',
  fontSize: 'large',
  style: {
    border: {
      bottomWidth: '1px',
      leftWidth: '2px',
      radius: '12px',
      rightWidth: '2px',
      topWidth: '3px',
    },
    color: {
      duotone: ['#111111', 'rgba(255, 255, 255, 0.95)'],
      text: 'var(--wp--preset--color--primary)',
      gradient: 'var:preset|gradient|sunset',
    },
    shadow: shadowValue,
    spacing: {
      padding: {
        top: '1rem',
        horizontal: '2rem',
      },
    },
    typography: {
      fontSize: 'var:preset|font-size|large',
      textTransform: 'uppercase',
    },
  },
  textColor: 'foreground',
};
const styleBag: BlockStyleAttributes = {
  color: {
    background: 'var(--wp--preset--color--secondary)',
    duotone: presetDuotone,
    text: 'var(--wp--preset--color--primary)',
  },
  dimensions: {
    aspectRatio: '16/9',
    minHeight: '320px',
  },
  shadow: shadowValue,
};
const colorSupportAttrs: BlockColorSupportAttributes = {
  style: styleBag,
  textColor: 'primary',
};
const duotonePalette: DuotonePalette = {
  colors: ['#111111', 'rgba(255, 255, 255, 0.95)'],
  name: 'High contrast',
  slug: 'high-contrast',
};
interface DemoRegistrationAttributes {
  content?: string;
  isVisible?: boolean;
}
interface DemoProfileAttributes {
  displayName?: string;
  imageUrl?: string;
}

const DemoEdit = (_props: BlockEditProps<DemoRegistrationAttributes>) => null;
const DemoSave = (_props: BlockSaveProps<DemoRegistrationAttributes>) => null;
const deprecatedEntries: BlockDeprecationList<DemoRegistrationAttributes> = [];
const blockTemplate: BlockTemplate = [
  ['demo/smoke-item', { content: 'First item' }],
];
const variation = {
  attributes: { isVisible: true },
  description: 'Registration facade smoke variation',
  innerBlocks: blockTemplate,
  name: 'smoke-variation',
  scope: ['inserter'],
  title: 'Smoke Variation',
} satisfies BlockVariation<DemoRegistrationAttributes>;
const aggregateVariation: AggregateBlockVariation<DemoRegistrationAttributes> =
  variation;
void registerBlockVariation('wp-typia/smoke', aggregateVariation);
const typedParagraphVariation = defineVariation<DemoRegistrationAttributes>(
  'core/paragraph',
  {
    attributes: {
      content: 'Typed paragraph',
      isVisible: true,
    },
    isActive: ['isVisible'],
    name: 'typed-paragraph',
    scope: ['inserter', 'transform'],
    title: 'Typed Paragraph',
  },
);
const typedGroupVariation = defineVariation('core/group', {
  attributes: {
    className: 'is-style-smoke-group',
  },
  innerBlocks: [
    ['core/heading', { level: 2, placeholder: 'Title' }],
    ['core/paragraph', { placeholder: 'Write...' }],
  ],
  isActive: ['className'],
  name: 'typed-group',
  scope: ['inserter'],
  title: 'Typed Group',
});
const typedVariations = defineVariations([
  typedParagraphVariation,
  typedGroupVariation,
] as const);
const typedVariationEntries = getDefinedVariationsMetadata(typedVariations)
  ?.entries;
const typedVariationEntry: BlockVariationRegistrationEntry | undefined =
  typedVariationEntries?.[0];
const typedVariationSource =
  createStaticBlockVariationRegistrationSource(typedVariations);
const variationDiagnostic: BlockVariationDiagnostic | undefined = undefined;
const profileBindableAttributes =
  defineBindableAttributes<DemoProfileAttributes>('demo/profile-card', [
    'imageUrl',
  ] as const);
const profileBindingSource = defineBindingSource({
  args: {
    field: 'display_name' as 'display_name' | 'image_url',
  },
  bindableAttributes: [profileBindableAttributes],
  fields: [
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
  ],
  getValueCallback: 'demo_get_profile_binding_value',
  label: 'Profile Data',
  minWordPress: {
    editor: '6.7',
    fieldsList: '6.9',
    server: '6.5',
    supportedAttributesFilter: '6.9',
  },
  name: 'demo/profile-data',
  usesContext: ['postId'],
});
const profileBindings = defineTypedBlockMetadataBindings<DemoProfileAttributes>({
  imageUrl: {
    args: {
      field: 'image_url',
    },
    source: profileBindingSource.name,
  } satisfies Binding<typeof profileBindingSource, { field: 'image_url' }>,
});
const profileBindingsContract: TypedBlockMetadataBindings<DemoProfileAttributes> =
  profileBindings;
const profilePhpSource =
  createPhpBindingSourceRegistrationSource(profileBindingSource);
const profileEditorSource =
  createEditorBindingSourceRegistrationSource(profileBindingSource);
const profileBindingDiagnostic: BindingSourceDiagnostic | undefined = undefined;
const profileRegistrationEntry: BindingSourceRegistrationEntry | undefined =
  undefined;
const parsedBlock: BlockInstance<DemoRegistrationAttributes> = {
  attributes: { content: 'hello', isVisible: true },
  clientId: 'demo-client-id',
  innerBlocks: [],
  isValid: true,
  name: 'demo/smoke',
};
const blockConfiguration = {
  attributes: {
    content: {
      default: '',
      type: 'string',
    },
    isVisible: {
      default: true,
      type: 'boolean',
    },
  },
  category: 'widgets',
  edit: DemoEdit,
  example: {
    attributes: {
      content: 'Demo content',
    },
    innerBlocks: [
      {
        attributes: {
          content: 'Nested content',
        },
        name: 'demo/smoke-item',
      },
    ],
  },
  save: DemoSave,
  title: 'Demo Smoke Block',
} satisfies BlockConfiguration<DemoRegistrationAttributes>;
const registeredBlock: RegisterBlockTypeResult<DemoRegistrationAttributes> =
  registerScaffoldBlockType<DemoRegistrationAttributes>(
    'demo/smoke',
    blockConfiguration,
  );

void aspectRatio;
void blockAlignment;
void blockConfiguration;
void blockSupports;
void compatibilityManifest;
void contentPosition;
void colorSupportAttrs;
void deprecatedEntries;
void DemoEdit;
void DemoSave;
void duotonePalette;
void layoutType;
void minHeightKeyword;
void minHeight;
void namedColor;
void parsedBlock;
void presetDuotone;
void registeredBlock;
void shadowValue;
void spacingDimension;
void spacingSize;
void styleBag;
void supportStyleAttributes;
void typedSupports;
void typedSupportManifest;
void derivedSupportAttrs;
void supportKey;
void textAlignment;
void textColor;
void textTransform;
void variation;
void typedParagraphVariation;
void typedGroupVariation;
void typedVariations;
void typedVariationEntries;
void typedVariationEntry;
void typedVariationSource;
void variationDiagnostic;
void profileBindableAttributes;
void profileBindingSource;
void profileBindings;
void profileBindingsContract;
void profilePhpSource;
void profileEditorSource;
void profileBindingDiagnostic;
void profileRegistrationEntry;
void blockVerticalAlignment;
