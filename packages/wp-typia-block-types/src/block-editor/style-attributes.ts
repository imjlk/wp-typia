import type { TextAlignment } from './alignment.js';
import type { CssColorValue } from './color.js';
import type {
  AspectRatio,
  MinHeightKeyword,
  MinHeightValue,
} from './dimensions.js';
import type { SpacingDimension } from './spacing.js';
import type {
  FontStyle,
  TextDecoration,
  TextTransform,
  WritingMode,
} from './typography.js';

export type PresetColorReference = `var:preset|color|${string}`;
export type PresetDuotoneReference = `var:preset|duotone|${string}`;
export type PresetGradientReference = `var:preset|gradient|${string}`;
export type PresetFontFamilyReference = `var:preset|font-family|${string}`;
export type PresetFontSizeReference = `var:preset|font-size|${string}`;

/**
 * Slug-like attributes that WordPress stores outside the `style` object when a
 * support value maps to a named preset instead of a literal CSS value.
 *
 * These stay intentionally broad and pipeline-compatible so generated metadata
 * can still flow through Typia's current source analysis. They currently carry
 * semantic intent without narrowing beyond `string`.
 */
export type BlockColorSlug = string;
export type BlockGradientSlug = string;
export type BlockFontFamilySlug = string;
export type BlockFontSizeSlug = string;

/**
 * Rich style-level color values that mirror the strings Gutenberg stores inside
 * the `style` attribute when a block uses color support.
 */
export type BlockStyleColorValue = CssColorValue | PresetColorReference;

/**
 * Practical gradient vocabulary for block support `style.color.gradient`.
 */
export type BlockStyleGradientValue =
  | `linear-gradient(${string})`
  | `radial-gradient(${string})`
  | `conic-gradient(${string})`
  | PresetGradientReference;

/**
 * Typography values stored under `style.typography.*`.
 *
 * These are DX-oriented string surfaces. When the values must round-trip
 * through Typia metadata generation, prefer explicit `string` constraints in
 * project-authored `types.ts`.
 */
export type BlockStyleFontSizeValue = string | PresetFontSizeReference;
export type BlockStyleFontFamilyValue = string | PresetFontFamilyReference;
export type BlockStyleSpacingValue = string | number;
export type BlockStyleBorderWidthValue = string | number;
export type BlockStyleBorderRadiusValue = string | number;
export type BlockShadowStyleAttributes = string;

export interface BlockLinkColorAttributes {
  readonly background?: BlockStyleColorValue;
  readonly text?: BlockStyleColorValue;
}

export interface BlockElementsStyleAttributes {
  readonly link?: {
    readonly color?: BlockLinkColorAttributes;
  };
}

export interface BlockColorStyleAttributes {
  readonly background?: BlockStyleColorValue;
  readonly duotone?:
    | string
    | PresetDuotoneReference
    | readonly [CssColorValue, CssColorValue];
  readonly gradient?: BlockStyleGradientValue;
  readonly text?: BlockStyleColorValue;
}

export interface BlockBorderStyleAttributes {
  readonly color?: BlockStyleColorValue;
  readonly radius?: BlockStyleBorderRadiusValue;
  readonly style?: string;
  readonly topLeftRadius?: BlockStyleBorderRadiusValue;
  readonly topRightRadius?: BlockStyleBorderRadiusValue;
  readonly bottomLeftRadius?: BlockStyleBorderRadiusValue;
  readonly bottomRightRadius?: BlockStyleBorderRadiusValue;
  readonly bottomWidth?: BlockStyleBorderWidthValue;
  readonly leftWidth?: BlockStyleBorderWidthValue;
  readonly rightWidth?: BlockStyleBorderWidthValue;
  readonly topWidth?: BlockStyleBorderWidthValue;
  readonly width?: BlockStyleBorderWidthValue;
}

export interface BlockDimensionsStyleAttributes {
  readonly aspectRatio?: AspectRatio;
  readonly minHeight?: MinHeightKeyword | MinHeightValue;
}

export interface BlockSpacingStyleAttributes {
  readonly blockGap?: BlockStyleSpacingValue;
  readonly margin?:
    | BlockStyleSpacingValue
    | Partial<Record<SpacingDimension, BlockStyleSpacingValue>>;
  readonly padding?:
    | BlockStyleSpacingValue
    | Partial<Record<SpacingDimension, BlockStyleSpacingValue>>;
}

export interface BlockTypographyStyleAttributes {
  readonly fontFamily?: BlockStyleFontFamilyValue;
  readonly fontSize?: BlockStyleFontSizeValue;
  readonly fontStyle?: FontStyle;
  readonly fontWeight?: string | number;
  readonly letterSpacing?: string;
  readonly lineHeight?: string | number;
  readonly textAlign?: TextAlignment;
  readonly textColumns?: number;
  readonly textDecoration?: TextDecoration;
  readonly textTransform?: TextTransform;
  readonly writingMode?: WritingMode;
}

export interface BlockPositionStyleAttributes {
  readonly bottom?: string;
  readonly left?: string;
  readonly right?: string;
  readonly top?: string;
  readonly type?: 'fixed' | 'sticky';
}

/**
 * WordPress-global-style-compatible `style` attribute shape for blocks that opt
 * into supports such as color, spacing, typography, border, or dimensions.
 */
export interface BlockStyleAttributes {
  readonly border?: BlockBorderStyleAttributes;
  readonly color?: BlockColorStyleAttributes;
  readonly dimensions?: BlockDimensionsStyleAttributes;
  readonly elements?: BlockElementsStyleAttributes;
  readonly position?: BlockPositionStyleAttributes;
  readonly shadow?: BlockShadowStyleAttributes;
  readonly spacing?: BlockSpacingStyleAttributes;
  readonly typography?: BlockTypographyStyleAttributes;
}

/**
 * Slug-based attributes plus the shared `style` object that WordPress injects
 * for color support.
 */
export interface BlockColorSupportAttributes {
  readonly backgroundColor?: BlockColorSlug;
  readonly gradient?: BlockGradientSlug;
  readonly style?: BlockStyleAttributes;
  readonly textColor?: BlockColorSlug;
}

/**
 * Slug-based typography attributes plus the shared `style` object used for
 * literal values.
 */
export interface BlockTypographySupportAttributes {
  readonly fontFamily?: BlockFontFamilySlug;
  readonly fontSize?: BlockFontSizeSlug;
  readonly style?: BlockStyleAttributes;
}

export interface BlockSpacingSupportAttributes {
  readonly style?: BlockStyleAttributes;
}

export interface BlockDimensionsSupportAttributes {
  readonly style?: BlockStyleAttributes;
}

export interface BlockBorderSupportAttributes {
  readonly borderColor?: string;
  readonly style?: BlockStyleAttributes;
}

export interface BlockStyleSupportAttributes
  extends
    BlockBorderSupportAttributes,
    BlockColorSupportAttributes,
    BlockDimensionsSupportAttributes,
    BlockSpacingSupportAttributes,
    BlockTypographySupportAttributes {}
