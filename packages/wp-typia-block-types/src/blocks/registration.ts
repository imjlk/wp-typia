import { registerBlockType } from '@wordpress/blocks';
import type {
  Block as WordPressBlockInstance,
  BlockAttribute as WordPressBlockAttribute,
  BlockConfiguration as WordPressBlockConfiguration,
  BlockDeprecation as WordPressBlockDeprecation,
  BlockEditProps as WordPressBlockEditProps,
  BlockSaveProps as WordPressBlockSaveProps,
  BlockType as WordPressRegisteredBlockType,
  BlockVariation as WordPressBlockVariation,
  BlockVariationScope as WordPressBlockVariationScope,
} from '@wordpress/blocks';

/**
 * Local compatibility facade for the Gutenberg block registration surface.
 *
 * The public contract is owned by `@wp-typia/block-types`, while the current
 * v1 implementation intentionally adapts the upstream `@wordpress/blocks`
 * declarations behind this stable import path.
 */
export type BlockAttributes = Record<string, any>;

export type BlockAttribute<TValue = unknown> = Omit<
  WordPressBlockAttribute,
  'default' | 'query'
> & {
  default?: TValue;
  query?: Record<string, BlockAttribute>;
};

export type BlockAttributeSchema<
  TAttributes extends BlockAttributes = BlockAttributes,
> = {
  [K in keyof TAttributes]: BlockAttribute<
    TAttributes[K] extends Array<infer TItem> ? TItem : TAttributes[K]
  >;
};

export type BlockSaveProps<
  TAttributes extends BlockAttributes = BlockAttributes,
> = WordPressBlockSaveProps<TAttributes>;

export type BlockEditProps<
  TAttributes extends BlockAttributes = BlockAttributes,
> = WordPressBlockEditProps<TAttributes>;

export type BlockExampleInnerBlock<
  TAttributes extends BlockAttributes = BlockAttributes,
> = {
  attributes?: Partial<TAttributes> | Record<string, unknown>;
  innerBlocks?: BlockExampleInnerBlock[];
  name: string;
};

export type BlockExample<
  TAttributes extends BlockAttributes = BlockAttributes,
> = {
  attributes?: Partial<TAttributes>;
  innerBlocks?: BlockExampleInnerBlock[];
  viewportWidth?: number;
};

export type BlockConfiguration<
  TAttributes extends BlockAttributes = BlockAttributes,
> = Omit<WordPressBlockConfiguration<TAttributes>, 'attributes' | 'example'> & {
  attributes: BlockAttributeSchema<TAttributes>;
  example?: BlockExample<TAttributes>;
};

export type BlockDeprecation<
  TNewAttributes extends BlockAttributes = BlockAttributes,
  TOldAttributes extends BlockAttributes = BlockAttributes,
> = WordPressBlockDeprecation<TNewAttributes, TOldAttributes>;

export type BlockDeprecationList<
  TNewAttributes extends BlockAttributes = BlockAttributes,
  TOldAttributes extends BlockAttributes = BlockAttributes,
> = ReadonlyArray<BlockDeprecation<TNewAttributes, TOldAttributes>>;

export type BlockInstance<
  TAttributes extends BlockAttributes = BlockAttributes,
> = WordPressBlockInstance<TAttributes>;

export type BlockInnerTemplate = [
  name: string,
  attributes?: Partial<BlockAttributes>,
  innerBlocks?: BlockInnerTemplate[],
];

export type BlockTemplate = BlockInnerTemplate[];

export type BlockVariationScope = WordPressBlockVariationScope;

export const BLOCK_VARIATION_SCOPES = [
  'block',
  'inserter',
  'transform',
] as const satisfies readonly BlockVariationScope[];

export type BlockVariation<
  TAttributes extends BlockAttributes = BlockAttributes,
> = WordPressBlockVariation<TAttributes>;

export type RegisteredBlockType<
  TAttributes extends BlockAttributes = BlockAttributes,
> = WordPressRegisteredBlockType<TAttributes>;

export type RegisterBlockTypeResult<
  TAttributes extends BlockAttributes = BlockAttributes,
> = RegisteredBlockType<TAttributes> | undefined;

/**
 * Runtime shim for scaffolded registrations.
 *
 * Generated projects keep strong typing around scaffold metadata while
 * centralizing the compatibility cast required by the currently published
 * `@wordpress/blocks` registration surface.
 */
export function registerScaffoldBlockType<
  TAttributes extends BlockAttributes = BlockAttributes,
  TSettings extends object = object,
>(
  blockName: string,
  settings: TSettings,
): RegisterBlockTypeResult<TAttributes>;
export function registerScaffoldBlockType<
  TAttributes extends BlockAttributes = BlockAttributes,
  TSettings extends object = object,
>(
  blockName: string,
  settings: TSettings,
): RegisterBlockTypeResult<TAttributes> {
  return registerBlockType(
    blockName,
    settings as unknown as Partial<
      WordPressRegisteredBlockType<Record<string, unknown>>
    >,
  ) as RegisterBlockTypeResult<TAttributes>;
}
