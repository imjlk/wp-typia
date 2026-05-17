import type {
  BlockAlignment,
  BlockVerticalAlignment,
  JustifyContent,
  TextAlignment,
} from "../block-editor/alignment.js";
import type {
  BlockBorderSupportAttributes,
  BlockColorSupportAttributes,
  BlockDimensionsSupportAttributes,
  BlockSpacingSupportAttributes,
  BlockStyleAttributes,
  BlockTypographySupportAttributes,
} from "../block-editor/style-attributes.js";
import type { FlexWrap, LayoutType, Orientation } from "../block-editor/layout.js";
import type { SpacingAxis, SpacingDimension } from "../block-editor/spacing.js";
import {
  type WordPressBlockApiCompatibilityDiagnostic,
  type WordPressBlockApiCompatibilityManifest,
  type WordPressCompatibilitySettings,
  type WordPressVersion,
} from "./compatibility.js";
import { handleDefineSupportsDiagnostics } from "./supports-diagnostics.js";
import {
  BLOCK_SUPPORT_FEATURES,
  SPACING_SUPPORT_KEYS,
  TYPOGRAPHY_SUPPORT_KEYS,
  type BlockSupportFeature,
  type SpacingSupportKey,
  type TypographySupportKey,
} from "./supports-features.js";
import {
  collectBlockSupportsCompatibilityFeatures,
  createBlockSupportsCompatibilityManifest,
} from "./supports-manifest.js";
import {
  resolveDefineSupportsSettings,
  splitDefineSupportsInput,
} from "./supports-settings.js";
export {
  BLOCK_SUPPORT_FEATURES,
  SPACING_SUPPORT_KEYS,
  TYPOGRAPHY_SUPPORT_KEYS,
  collectBlockSupportsCompatibilityFeatures,
  createBlockSupportsCompatibilityManifest,
};
export type {
  BlockSupportFeature,
  SpacingSupportKey,
  TypographySupportKey,
};
import {
  type DiagnosticLogger,
} from "./shared/diagnostics.js";
import { isObjectRecord } from "./shared/object-utils.js";

type BlockSupportDefaultControls<TFeature extends string> = Readonly<
  Partial<Record<TFeature, boolean>> & Record<string, boolean | undefined>
>;

export type SkipSerialization<TFeature extends string> =
  | boolean
  | readonly TFeature[];

export interface BlockBorderSupport {
  readonly color?: boolean;
  readonly radius?: boolean;
  readonly style?: boolean;
  readonly width?: boolean;
  readonly __experimentalSkipSerialization?: SkipSerialization<
    'color' | 'radius' | 'style' | 'width'
  >;
  readonly __experimentalDefaultControls?: BlockSupportDefaultControls<
    'color' | 'radius' | 'style' | 'width'
  >;
}

export interface BlockBackgroundSupport {
  readonly backgroundImage?: boolean;
  readonly backgroundSize?: boolean;
}

export interface BlockColorSupport {
  readonly background?: boolean;
  /**
   * Dedicated button color support documented in the Block Supports reference
   * as stable since WordPress 6.5.
   */
  readonly button?: boolean;
  readonly enableAlpha?: boolean;
  readonly enableContrastChecker?: boolean;
  readonly gradients?: boolean;
  /**
   * Dedicated heading color support documented in the Block Supports reference
   * as stable since WordPress 6.5.
   */
  readonly heading?: boolean;
  readonly link?: boolean;
  readonly text?: boolean;
  readonly __experimentalSkipSerialization?: SkipSerialization<
    'background' | 'button' | 'gradients' | 'heading' | 'link' | 'text'
  >;
  readonly __experimentalDefaultControls?: BlockSupportDefaultControls<
    'background' | 'gradients' | 'link' | 'text'
  >;
}

export interface BlockDimensionsSupport {
  readonly aspectRatio?: boolean;
  readonly height?: boolean;
  readonly minHeight?: boolean;
  readonly width?: boolean;
  readonly __experimentalSkipSerialization?: SkipSerialization<
    'aspectRatio' | 'height' | 'minHeight' | 'width'
  >;
  readonly __experimentalDefaultControls?: BlockSupportDefaultControls<
    'aspectRatio' | 'height' | 'minHeight' | 'width'
  >;
}

export interface BlockFilterSupport {
  readonly duotone?: boolean;
}

export interface BlockInteractivitySupport {
  readonly clientNavigation?: boolean;
  readonly interactive?: boolean;
}

export interface BlockLayoutDefault {
  readonly columnCount?: number;
  readonly columnGap?: string;
  readonly contentSize?: string;
  readonly allowInheriting?: boolean;
  readonly allowSizingOnChildren?: boolean;
  readonly flexWrap?: FlexWrap;
  readonly justifyContent?: JustifyContent;
  readonly minimumColumnWidth?: string;
  readonly orientation?: Orientation;
  readonly rowGap?: string;
  readonly type?: LayoutType;
  readonly verticalAlignment?: BlockVerticalAlignment;
  readonly wideSize?: string;
}

export interface BlockLayoutSupport {
  readonly allowCustomContentAndWideSize?: boolean;
  readonly allowEditing?: boolean;
  readonly allowInheriting?: boolean;
  readonly allowJustification?: boolean;
  readonly allowOrientation?: boolean;
  readonly allowSizingOnChildren?: boolean;
  readonly allowSwitching?: boolean;
  readonly allowVerticalAlignment?: boolean;
  readonly allowWrap?: boolean;
  readonly default?: BlockLayoutDefault;
}

export interface BlockLightboxSupport {
  readonly allowEditing?: boolean;
  readonly enabled?: boolean;
}

export interface BlockPositionSupport {
  readonly fixed?: boolean;
  readonly sticky?: boolean;
  readonly __experimentalDefaultControls?: BlockSupportDefaultControls<
    'fixed' | 'sticky'
  >;
}

export interface BlockShadowSupport {
  readonly __experimentalDefaultControls?: BlockSupportDefaultControls<'shadow'>;
}

export interface SpacingSize {
  readonly name: string;
  readonly size: string;
  readonly slug: string;
}

export interface BlockSpacingSupport {
  readonly blockGap?: boolean | readonly SpacingAxis[];
  readonly margin?: boolean | readonly SpacingDimension[];
  readonly padding?: boolean | readonly SpacingDimension[];
  readonly spacingSizes?: readonly SpacingSize[];
  readonly units?: readonly string[];
  readonly __experimentalSkipSerialization?: SkipSerialization<SpacingSupportKey>;
  readonly __experimentalDefaultControls?: BlockSupportDefaultControls<SpacingSupportKey>;
}

export interface BlockTypographySupport {
  readonly dropCap?: boolean;
  readonly fontFamily?: boolean;
  readonly fontSize?: boolean;
  readonly fontStyle?: boolean;
  readonly fontWeight?: boolean;
  readonly letterSpacing?: boolean;
  readonly lineHeight?: boolean;
  readonly textAlign?: boolean | readonly TextAlignment[];
  readonly textColumns?: boolean;
  readonly textDecoration?: boolean;
  readonly textTransform?: boolean;
  readonly writingMode?: boolean;
  readonly __experimentalSkipSerialization?: SkipSerialization<TypographySupportKey>;
  readonly __experimentalDefaultControls?: BlockSupportDefaultControls<TypographySupportKey>;
}

/**
 * Practical WP 6.9+ block support surface for block.json metadata and
 * registration helpers.
 *
 * This intentionally models the common public subtrees instead of mirroring
 * every Gutenberg-internal experimental flag.
 */
export interface BlockSupports {
  readonly align?: boolean | readonly BlockAlignment[];
  readonly alignWide?: boolean;
  readonly allowedBlocks?: boolean;
  readonly anchor?: boolean;
  readonly ariaLabel?: boolean;
  readonly autoRegister?: boolean;
  readonly background?: boolean | BlockBackgroundSupport;
  readonly border?: boolean | BlockBorderSupport;
  readonly className?: boolean;
  readonly color?: boolean | BlockColorSupport;
  readonly contentRole?: boolean;
  readonly customClassName?: boolean;
  readonly dimensions?: boolean | BlockDimensionsSupport;
  readonly filter?: boolean | BlockFilterSupport;
  readonly html?: boolean;
  readonly inserter?: boolean;
  readonly interactivity?: boolean | BlockInteractivitySupport;
  readonly js?: boolean;
  readonly layout?: boolean | BlockLayoutSupport;
  readonly lightbox?: boolean | BlockLightboxSupport;
  readonly listView?: boolean;
  readonly lock?: boolean;
  readonly locking?: boolean;
  readonly multiple?: boolean;
  readonly position?: boolean | BlockPositionSupport;
  readonly renaming?: boolean;
  readonly reusable?: boolean;
  readonly shadow?: boolean | BlockShadowSupport;
  readonly spacing?: boolean | BlockSpacingSupport;
  readonly splitting?: boolean;
  readonly typography?: boolean | BlockTypographySupport;
  readonly visibility?: boolean;
}

export type BlockSupportsInput = BlockSupports & Readonly<Record<string, unknown>>;

export interface BlockAlignSupportAttributes {
  readonly align?: BlockAlignment;
}

export interface BlockAllowedBlocksSupportAttributes {
  readonly allowedBlocks?: readonly string[];
}

export interface BlockLayoutSupportAttributes {
  readonly layout?: BlockLayoutDefault;
}

export interface BlockStyleAttributeSupportAttributes {
  readonly style?: BlockStyleAttributes;
}

type SupportTruthy<TValue> = [TValue] extends [false | null | undefined]
  ? false
  : true;

type HasSupport<TSupports, TKey extends PropertyKey> = TKey extends keyof TSupports
  ? SupportTruthy<TSupports[TKey]>
  : false;

type HasNestedSupport<
  TSupports,
  TSection extends keyof BlockSupports,
  TKey extends PropertyKey,
> = TSection extends keyof TSupports
  ? TSupports[TSection] extends true
    ? true
    : TSupports[TSection] extends Readonly<Record<TKey, infer TValue>>
      ? SupportTruthy<TValue>
      : false
  : false;

type IfSupport<TCondition, TAttributes> = TCondition extends true
  ? TAttributes
  : {};

export interface DefineSupportsInlineOptions {
  readonly allowUnknownFutureKeys?: boolean;
  readonly logger?: DiagnosticLogger<WordPressBlockApiCompatibilityDiagnostic>;
  readonly minVersion?: WordPressVersion;
  readonly minWordPress?: WordPressVersion;
  readonly onDiagnostic?: (diagnostic: WordPressBlockApiCompatibilityDiagnostic) => void;
  readonly strict?: boolean;
}

export interface DefineSupportsOptions extends WordPressCompatibilitySettings {
  readonly logger?: DiagnosticLogger<WordPressBlockApiCompatibilityDiagnostic>;
  readonly minWordPress?: WordPressVersion;
  readonly onDiagnostic?: (diagnostic: WordPressBlockApiCompatibilityDiagnostic) => void;
}

export type StripDefineSupportsOptions<TSupports> = Omit<
  TSupports,
  keyof DefineSupportsInlineOptions
>;

export const DEFINED_BLOCK_SUPPORTS_METADATA: unique symbol = Symbol.for(
  "@wp-typia/block-types/defined-supports",
) as never;

export type DefinedBlockSupportsMetadataKey =
  typeof DEFINED_BLOCK_SUPPORTS_METADATA;

export interface DefinedBlockSupportsMetadata {
  readonly diagnostics: readonly WordPressBlockApiCompatibilityDiagnostic[];
  readonly manifest: WordPressBlockApiCompatibilityManifest;
}

export type DefinedBlockSupports<TSupports extends BlockSupportsInput = BlockSupportsInput> =
  Readonly<StripDefineSupportsOptions<TSupports>> & {
    readonly [DEFINED_BLOCK_SUPPORTS_METADATA]?: DefinedBlockSupportsMetadata;
  };

export type SupportAttributes<TSupports> =
  TSupports extends DefinedBlockSupports<infer TDefinedSupports>
    ? SupportAttributesFromBlockSupports<
        StripDefineSupportsOptions<TDefinedSupports>
      >
    : TSupports extends BlockSupportsInput
      ? SupportAttributesFromBlockSupports<StripDefineSupportsOptions<TSupports>>
      : {};

export type SupportAttributesFromBlockSupports<TSupports> =
  IfSupport<
    HasSupport<TSupports, "align">,
    BlockAlignSupportAttributes
  > &
    IfSupport<
      HasSupport<TSupports, "allowedBlocks">,
      BlockAllowedBlocksSupportAttributes
    > &
    IfSupport<HasSupport<TSupports, "layout">, BlockLayoutSupportAttributes> &
    IfSupport<HasSupport<TSupports, "color">, BlockColorSupportAttributes> &
    IfSupport<
      HasSupport<TSupports, "typography">,
      BlockTypographySupportAttributes
    > &
    IfSupport<HasSupport<TSupports, "spacing">, BlockSpacingSupportAttributes> &
    IfSupport<
      HasSupport<TSupports, "dimensions">,
      BlockDimensionsSupportAttributes
    > &
    IfSupport<HasSupport<TSupports, "border">, BlockBorderSupportAttributes> &
    IfSupport<
      HasSupport<TSupports, "background">,
      BlockStyleAttributeSupportAttributes
    > &
    IfSupport<
      HasNestedSupport<TSupports, "filter", "duotone">,
      BlockStyleAttributeSupportAttributes
    > &
    IfSupport<
      HasSupport<TSupports, "position">,
      BlockStyleAttributeSupportAttributes
    > &
    IfSupport<
      HasSupport<TSupports, "shadow">,
      BlockStyleAttributeSupportAttributes
    >;

export function getDefinedSupportsCompatibilityManifest(
  supports: unknown,
): WordPressBlockApiCompatibilityManifest | undefined {
  return isObjectRecord(supports)
    ? (
        supports as {
          readonly [DEFINED_BLOCK_SUPPORTS_METADATA]?:
            | DefinedBlockSupportsMetadata
            | undefined;
        }
      )[DEFINED_BLOCK_SUPPORTS_METADATA]?.manifest
    : undefined;
}

export function defineSupports<
  const TSupports extends BlockSupportsInput & DefineSupportsInlineOptions,
>(
  supports: TSupports,
  options: DefineSupportsOptions = {},
): DefinedBlockSupports<TSupports> {
  const { inlineOptions, supports: normalizedSupports } =
    splitDefineSupportsInput(supports);
  const settings = resolveDefineSupportsSettings(inlineOptions, options);
  const manifest = createBlockSupportsCompatibilityManifest(
    normalizedSupports,
    settings,
  );

  handleDefineSupportsDiagnostics(
    manifest.diagnostics,
    options.onDiagnostic ?? inlineOptions.onDiagnostic,
    options.logger ?? inlineOptions.logger,
  );

  Object.defineProperty(normalizedSupports, DEFINED_BLOCK_SUPPORTS_METADATA, {
    configurable: false,
    enumerable: false,
    value: {
      diagnostics: manifest.diagnostics,
      manifest,
    } satisfies DefinedBlockSupportsMetadata,
    writable: false,
  });

  return normalizedSupports as DefinedBlockSupports<TSupports>;
}
