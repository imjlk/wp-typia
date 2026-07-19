import type { BlockAttributes } from "./shared/block-attributes.js";
import {
  type WordPressBlockApiCompatibilityDiagnostic,
  type WordPressBlockApiCompatibilityManifest,
  type WordPressCompatibilitySettings,
  type WordPressVersion,
} from "./compatibility.js";
import {
  type DiagnosticLogger,
} from "./shared/diagnostics.js";
import { isObjectRecord } from "./shared/object-utils.js";
import { normalizeStaticRegistrationValue } from "./shared/static-registration.js";
import {
  createCollectionDiagnostics,
  createVariationDiagnostics,
  handleVariationDiagnostics,
} from "./variations-diagnostics.js";
import {
  collectBlockVariationCompatibilityFeatures,
  createBlockVariationCompatibilityManifest,
  createBlockVariationCompatibilityManifestFromSettings,
} from "./variations-manifest.js";
import {
  resolveDefineVariationSettings,
  splitDefineVariationInput,
} from "./variations-settings.js";

export {
  collectBlockVariationCompatibilityFeatures,
  createBlockVariationCompatibilityManifest,
};

export type { BlockAttributes } from "./shared/block-attributes.js";

export type BlockVariationScope = "block" | "inserter" | "transform";

export const BLOCK_VARIATION_SCOPES = [
  "block",
  "inserter",
  "transform",
] as const satisfies readonly BlockVariationScope[];

export type BlockVariationAttributeMap<
  TAttributes extends BlockAttributes = BlockAttributes,
> = Partial<TAttributes> & BlockAttributes;

export type BlockVariationInnerBlockTemplate = readonly [
  name: string,
  attributes?: Readonly<BlockAttributes>,
  innerBlocks?: readonly BlockVariationInnerBlockTemplate[],
];

export type BlockVariationInnerBlocks =
  readonly BlockVariationInnerBlockTemplate[];

type RegistrationCompatibleBlockVariationInnerBlockTemplate = [
  name: string,
  attributes?: BlockAttributes,
  innerBlocks?: RegistrationCompatibleBlockVariationInnerBlockTemplate[],
];

type RegistrationCompatibleBlockVariationInnerBlocks =
  RegistrationCompatibleBlockVariationInnerBlockTemplate[];

type BlockVariationIsActiveCallback<
  TAttributes extends BlockAttributes = BlockAttributes,
> = (
  blockAttributes: Readonly<BlockVariationAttributeMap<TAttributes>>,
  variationAttributes: Readonly<BlockVariationAttributeMap<TAttributes>>,
) => boolean;

export type BlockVariationIsActive<
  TAttributes extends BlockAttributes = BlockAttributes,
> =
  | readonly Extract<keyof TAttributes, string>[]
  | BlockVariationIsActiveCallback<TAttributes>;

type RegistrationCompatibleBlockVariationIsActive<
  TAttributes extends BlockAttributes = BlockAttributes,
> =
  | Extract<keyof TAttributes, string>[]
  | BlockVariationIsActiveCallback<TAttributes>;

export interface BlockVariationExampleInnerBlock {
  readonly attributes: BlockAttributes;
  readonly innerBlocks?: readonly BlockVariationExampleInnerBlock[];
  readonly name: string;
  readonly [key: string]: unknown;
}

export interface BlockVariationExample<
  TAttributes extends BlockAttributes = BlockAttributes,
> {
  readonly attributes?: BlockVariationAttributeMap<TAttributes>;
  readonly innerBlocks?:
    | BlockVariationInnerBlocks
    | readonly BlockVariationExampleInnerBlock[];
  readonly viewportWidth?: number;
  readonly [key: string]: unknown;
}

/**
 * Opaque compatibility slot for exact icon and example types owned by the
 * optional WordPress peer. It intentionally resolves through the broad
 * `BlockAttributes` value type so the aggregate remains peer-free and
 * registration-assignable.
 */
type PeerBackedOpaqueVariationValue = BlockAttributes[string];

/**
 * Peer-free variation shape used by the aggregate authoring entrypoints.
 *
 * Registration-specific aliases continue to mirror `@wordpress/blocks` from
 * the explicit `blocks/registration` entrypoint. Variation authoring only
 * needs this serializable subset and therefore must not make that optional
 * peer part of its declaration graph.
 */
export interface BlockVariation<
  TAttributes extends BlockAttributes = BlockAttributes,
> {
  readonly attributes?: TAttributes;
  readonly category?: string;
  readonly description?: string;
  readonly example?: PeerBackedOpaqueVariationValue;
  readonly icon?: PeerBackedOpaqueVariationValue;
  readonly innerBlocks?: RegistrationCompatibleBlockVariationInnerBlocks;
  readonly isActive?: RegistrationCompatibleBlockVariationIsActive<TAttributes>;
  readonly isDefault?: boolean;
  readonly keywords?: string[];
  readonly name: string;
  readonly scope?: BlockVariationScope[];
  readonly title: string;
}

export interface BlockVariationDefinition<
  TAttributes extends BlockAttributes = BlockAttributes,
> extends Omit<
    BlockVariation<BlockVariationAttributeMap<TAttributes>>,
    "attributes" | "example" | "innerBlocks" | "isActive" | "scope"
  > {
  readonly attributes?: BlockVariationAttributeMap<TAttributes>;
  readonly example?: BlockVariationExample<TAttributes>;
  readonly innerBlocks?: BlockVariationInnerBlocks;
  readonly isActive?: BlockVariationIsActive<TAttributes>;
  readonly scope?: readonly BlockVariationScope[];
}

export interface DefineVariationInlineOptions {
  readonly allowMissingIsActive?: boolean;
  readonly logger?: DiagnosticLogger<BlockVariationDiagnostic>;
  readonly minVersion?: WordPressVersion;
  readonly minWordPress?: WordPressVersion;
  readonly onDiagnostic?: (diagnostic: BlockVariationDiagnostic) => void;
  readonly requireIsActive?: boolean;
  readonly strict?: boolean;
}

export interface DefineVariationOptions extends WordPressCompatibilitySettings {
  readonly allowMissingIsActive?: boolean;
  readonly logger?: DiagnosticLogger<BlockVariationDiagnostic>;
  readonly minWordPress?: WordPressVersion;
  readonly onDiagnostic?: (diagnostic: BlockVariationDiagnostic) => void;
  readonly requireIsActive?: boolean;
}

export type StripDefineVariationOptions<TVariation> = Omit<
  TVariation,
  keyof DefineVariationInlineOptions
>;

export const DEFINED_BLOCK_VARIATION_METADATA: unique symbol = Symbol.for(
  "@wp-typia/block-types/defined-variation",
) as never;

export const DEFINED_BLOCK_VARIATIONS_METADATA: unique symbol = Symbol.for(
  "@wp-typia/block-types/defined-variations",
) as never;

export type DefinedBlockVariationMetadataKey =
  typeof DEFINED_BLOCK_VARIATION_METADATA;

export type DefinedBlockVariationsMetadataKey =
  typeof DEFINED_BLOCK_VARIATIONS_METADATA;

export interface DefinedBlockVariationMetadata {
  readonly blockName: string;
  readonly diagnostics: readonly BlockVariationDiagnostic[];
  readonly manifest: WordPressBlockApiCompatibilityManifest;
}

export interface DefinedBlockVariationsMetadata {
  readonly diagnostics: readonly BlockVariationDiagnostic[];
  readonly entries: readonly BlockVariationRegistrationEntry[];
}

export type DefinedBlockVariation<
  TBlockName extends string = string,
  TAttributes extends BlockAttributes = BlockAttributes,
  TVariation extends BlockVariationDefinition<TAttributes> = BlockVariationDefinition<TAttributes>,
> = Readonly<StripDefineVariationOptions<TVariation>> & {
  readonly [DEFINED_BLOCK_VARIATION_METADATA]?: DefinedBlockVariationMetadata;
  readonly __wpTypiaVariationAttributes?: TAttributes;
  readonly __wpTypiaVariationTarget?: TBlockName;
};

export type DefinedBlockVariations<
  TVariations extends readonly DefinedBlockVariation[] = readonly DefinedBlockVariation[],
> = Readonly<TVariations> & {
  readonly [DEFINED_BLOCK_VARIATIONS_METADATA]?: DefinedBlockVariationsMetadata;
};

export type BlockVariationDiagnosticCode =
  | "duplicate-active-marker"
  | "duplicate-variation-name"
  | "missing-is-active"
  | "missing-stable-marker"
  | "unknown-is-active-attribute";

export interface BlockVariationAuthoringDiagnostic {
  readonly attribute?: string | undefined;
  readonly blockName: string;
  readonly code: BlockVariationDiagnosticCode;
  readonly message: string;
  readonly severity: "error" | "warning";
  readonly variationName: string;
}

export type BlockVariationDiagnostic =
  | BlockVariationAuthoringDiagnostic
  | WordPressBlockApiCompatibilityDiagnostic;

export interface BlockVariationRegistrationEntry {
  readonly blockName: string;
  readonly variation: Readonly<BlockVariationDefinition>;
}

export interface CreateBlockVariationRegistrationSourceOptions {
  readonly functionName?: string;
  readonly importSource?: string;
}

export function getDefinedVariationMetadata(
  variation: unknown,
): DefinedBlockVariationMetadata | undefined {
  return isObjectRecord(variation)
    ? (
        variation as {
          readonly [DEFINED_BLOCK_VARIATION_METADATA]?:
            | DefinedBlockVariationMetadata
            | undefined;
        }
      )[DEFINED_BLOCK_VARIATION_METADATA]
    : undefined;
}

export function getDefinedVariationBlockName(
  variation: unknown,
): string | undefined {
  return getDefinedVariationMetadata(variation)?.blockName;
}

export function getDefinedVariationCompatibilityManifest(
  variation: unknown,
): WordPressBlockApiCompatibilityManifest | undefined {
  return getDefinedVariationMetadata(variation)?.manifest;
}

export function getDefinedVariationsMetadata(
  variations: unknown,
): DefinedBlockVariationsMetadata | undefined {
  return Array.isArray(variations)
    ? (
        variations as {
          readonly [DEFINED_BLOCK_VARIATIONS_METADATA]?:
            | DefinedBlockVariationsMetadata
            | undefined;
        }
      )[DEFINED_BLOCK_VARIATIONS_METADATA]
    : undefined;
}

export function defineVariation<
  TAttributes extends BlockAttributes = BlockAttributes,
  const TBlockName extends string = string,
  const TVariation extends BlockVariationDefinition<TAttributes> &
    DefineVariationInlineOptions = BlockVariationDefinition<TAttributes> &
    DefineVariationInlineOptions,
>(
  blockName: TBlockName,
  variation: TVariation,
  options: DefineVariationOptions = {},
): DefinedBlockVariation<TBlockName, TAttributes, TVariation> {
  const { inlineOptions, variation: normalizedVariation } =
    splitDefineVariationInput<TAttributes, TVariation>(variation);
  const resolved = resolveDefineVariationSettings(inlineOptions, options);
  const manifest = createBlockVariationCompatibilityManifestFromSettings(
    resolved.compatibility,
  );
  const diagnostics = [
    ...manifest.diagnostics,
    ...createVariationDiagnostics(
      blockName,
      normalizedVariation,
      resolved.diagnostics,
    ),
  ];

  handleVariationDiagnostics(diagnostics, resolved.onDiagnostic, resolved.logger);

  Object.defineProperty(normalizedVariation, DEFINED_BLOCK_VARIATION_METADATA, {
    configurable: false,
    enumerable: false,
    value: {
      blockName,
      diagnostics,
      manifest,
    } satisfies DefinedBlockVariationMetadata,
    writable: false,
  });

  return normalizedVariation as DefinedBlockVariation<
    TBlockName,
    TAttributes,
    TVariation
  >;
}

export function createBlockVariationRegistrationPlan(
  variations: readonly DefinedBlockVariation[],
): readonly BlockVariationRegistrationEntry[] {
  return variations.map((variation) => {
    const metadata = getDefinedVariationMetadata(variation);

    if (!metadata) {
      throw new Error(
        `Block variation "${variation.name}" was not created by defineVariation().`,
      );
    }

    return {
      blockName: metadata.blockName,
      variation,
    };
  });
}

export function defineVariations<
  const TVariations extends readonly DefinedBlockVariation[],
>(
  variations: TVariations,
  options: DefineVariationOptions = {},
): DefinedBlockVariations<TVariations> {
  const entries = createBlockVariationRegistrationPlan(variations);
  const strict = options.strict ?? true;
  const variationDiagnostics = entries.flatMap(
    (entry) => getDefinedVariationMetadata(entry.variation)?.diagnostics ?? [],
  );
  const collectionDiagnostics = createCollectionDiagnostics(entries, strict);
  const diagnostics = [
    ...variationDiagnostics,
    ...collectionDiagnostics,
  ];

  handleVariationDiagnostics(
    collectionDiagnostics,
    options.onDiagnostic,
    options.logger,
  );

  const normalizedVariations = [...variations] as unknown as DefinedBlockVariations<
    TVariations
  >;

  Object.defineProperty(
    normalizedVariations,
    DEFINED_BLOCK_VARIATIONS_METADATA,
    {
      configurable: false,
      enumerable: false,
      value: {
        diagnostics,
        entries,
      } satisfies DefinedBlockVariationsMetadata,
      writable: false,
    },
  );

  return normalizedVariations;
}

export function createStaticBlockVariationRegistrationSource(
  variations: readonly DefinedBlockVariation[],
  options: CreateBlockVariationRegistrationSourceOptions = {},
): string {
  const importSource = options.importSource ?? "@wordpress/blocks";
  const functionName = options.functionName ?? "registerWpTypiaBlockVariations";
  const entries = createBlockVariationRegistrationPlan(variations).map(
    (entry, index) =>
      normalizeStaticRegistrationValue(entry, `variations[${index}]`, {
        description: "variation",
      }),
  );
  const serializedEntries = JSON.stringify(entries, null, 2);

  return [
    `import { registerBlockVariation } from ${JSON.stringify(importSource)};`,
    "",
    `const variations = ${serializedEntries};`,
    "",
    `export function ${functionName}() {`,
    "  for (const { blockName, variation } of variations) {",
    "    registerBlockVariation(blockName, variation);",
    "  }",
    "}",
    "",
  ].join("\n");
}
