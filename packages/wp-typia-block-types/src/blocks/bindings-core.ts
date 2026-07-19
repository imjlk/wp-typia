import type { BlockAttributes } from "./shared/block-attributes.js";
import {
  type WordPressBlockApiCompatibilityDiagnostic,
  type WordPressBlockApiCompatibilityFeature,
  type WordPressBlockApiCompatibilityManifest,
  type WordPressCompatibilitySettings,
  type WordPressVersion,
} from "./compatibility.js";
import { type DiagnosticLogger } from "./shared/diagnostics.js";
import { isObjectRecord } from "./shared/object-utils.js";
import {
  createBindingSourceDiagnostics,
  handleBindingSourceDiagnostics,
} from "./bindings-diagnostics.js";
import {
  collectBindingSourceCompatibilityFeatures,
  createBindingCompatibilityManifest,
  createBindingSourceCompatibilityManifest,
} from "./bindings-manifest.js";
import {
  resolveDefineBindingSourceSettings,
  splitDefineBindingSourceInput,
} from "./bindings-settings.js";

export {
  collectBindingSourceCompatibilityFeatures,
  createBindingSourceCompatibilityManifest,
};

export type BindingSourceName = `${string}/${string}`;

export type BindingSourceArgs = Readonly<Record<string, unknown>>;

export type BindingFieldType =
  | "array"
  | "boolean"
  | "integer"
  | "number"
  | "object"
  | "string";

export interface BindingSourceField<
  TArgs extends BindingSourceArgs = BindingSourceArgs,
> {
  readonly args?: TArgs;
  readonly label: string;
  readonly name: string;
  readonly type?: BindingFieldType;
}

export type BlockBindingAttributeName<
  TAttributes extends BlockAttributes = BlockAttributes,
> = Extract<Exclude<keyof TAttributes, "metadata">, string>;

export interface BindingSourceBindableAttributes<
  TAttributes extends BlockAttributes = BlockAttributes,
  TBlockName extends string = string,
  TAttributesList extends readonly BlockBindingAttributeName<TAttributes>[] = readonly BlockBindingAttributeName<TAttributes>[],
> {
  readonly attributes: TAttributesList;
  readonly blockName: TBlockName;
}

export interface BindingSourceDefinition<
  TName extends string = string,
  TArgs extends BindingSourceArgs = BindingSourceArgs,
  TFields extends readonly BindingSourceField[] = readonly BindingSourceField[],
> {
  readonly args?: TArgs;
  readonly bindableAttributes?: readonly BindingSourceBindableAttributes[];
  readonly fields?: TFields;
  readonly getValueCallback?: string;
  readonly label?: string;
  readonly name: TName;
  readonly usesContext?: readonly string[];
}

export interface BindingSourceVersionGates {
  readonly editor?: WordPressVersion;
  readonly fieldsList?: WordPressVersion;
  readonly server?: WordPressVersion;
  readonly supportedAttributesFilter?: WordPressVersion;
}

export interface DefineBindingSourceInlineOptions {
  readonly allowUnknownFutureKeys?: boolean;
  readonly editor?: boolean;
  readonly fieldsList?: boolean;
  readonly logger?: DiagnosticLogger<BindingSourceDiagnostic>;
  readonly minVersion?: WordPressVersion;
  readonly minWordPress?: WordPressVersion | BindingSourceVersionGates;
  readonly minWordPressEditor?: WordPressVersion;
  readonly minWordPressFieldsList?: WordPressVersion;
  readonly minWordPressServer?: WordPressVersion;
  readonly minWordPressSupportedAttributesFilter?: WordPressVersion;
  readonly onDiagnostic?: (diagnostic: BindingSourceDiagnostic) => void;
  readonly server?: boolean;
  readonly strict?: boolean;
  readonly supportedAttributesFilter?: boolean;
}

export interface DefineBindingSourceOptions extends WordPressCompatibilitySettings {
  readonly editor?: boolean;
  readonly fieldsList?: boolean;
  readonly logger?: DiagnosticLogger<BindingSourceDiagnostic>;
  readonly minWordPress?: WordPressVersion | BindingSourceVersionGates;
  readonly minWordPressEditor?: WordPressVersion;
  readonly minWordPressFieldsList?: WordPressVersion;
  readonly minWordPressServer?: WordPressVersion;
  readonly minWordPressSupportedAttributesFilter?: WordPressVersion;
  readonly onDiagnostic?: (diagnostic: BindingSourceDiagnostic) => void;
  readonly server?: boolean;
  readonly supportedAttributesFilter?: boolean;
}

export type StripDefineBindingSourceOptions<TSource> = Omit<
  TSource,
  keyof DefineBindingSourceInlineOptions
>;

export const DEFINED_BLOCK_BINDING_SOURCE_METADATA: unique symbol = Symbol.for(
  "@wp-typia/block-types/defined-binding-source",
) as never;

export type DefinedBlockBindingSourceMetadataKey =
  typeof DEFINED_BLOCK_BINDING_SOURCE_METADATA;

export interface DefinedBlockBindingSourceMetadata {
  readonly diagnostics: readonly BindingSourceDiagnostic[];
  readonly features: readonly WordPressBlockApiCompatibilityFeature[];
  readonly manifest: WordPressBlockApiCompatibilityManifest;
}

export type DefinedBindingSource<
  TName extends string = string,
  TArgs extends BindingSourceArgs = BindingSourceArgs,
  TFields extends readonly BindingSourceField[] = readonly BindingSourceField[],
  TSource extends BindingSourceDefinition = BindingSourceDefinition,
> = Readonly<StripDefineBindingSourceOptions<TSource>> & {
  readonly [DEFINED_BLOCK_BINDING_SOURCE_METADATA]?:
    | DefinedBlockBindingSourceMetadata
    | undefined;
  readonly __wpTypiaBindingSourceArgs?: TArgs;
  readonly __wpTypiaBindingSourceFields?: TFields;
  readonly name: TName;
};

export interface BlockBinding<
  TSourceName extends string = string,
  TArgs extends BindingSourceArgs = BindingSourceArgs,
> {
  readonly args?: TArgs;
  readonly source: TSourceName;
}

type BindingSourceInferredArgs<TSource> = TSource extends {
  readonly __wpTypiaBindingSourceArgs?: infer TArgs extends BindingSourceArgs;
}
  ? TArgs
  : BindingSourceArgs;

export type Binding<
  TSource extends DefinedBindingSource | string,
  TArgs extends BindingSourceArgs = BindingSourceInferredArgs<TSource>,
> = TSource extends DefinedBindingSource<infer TName, infer TSourceArgs>
  ? TArgs extends TSourceArgs
    ? BlockBinding<TName, TArgs>
    : never
  : TSource extends string
    ? BlockBinding<TSource, TArgs>
    : never;

export type BlockBindingMap<
  TAttributes extends BlockAttributes = BlockAttributes,
> = Readonly<
  Partial<Record<BlockBindingAttributeName<TAttributes>, BlockBinding>>
>;

export interface BlockMetadataBindings<
  TBindings extends Readonly<
    Record<string, BlockBinding | undefined>
  > = Readonly<Record<string, BlockBinding>>,
> {
  readonly bindings?: TBindings;
}

export type TypedBlockMetadataBindings<
  TAttributes extends BlockAttributes,
  TBindings extends BlockBindingMap<TAttributes> = BlockBindingMap<TAttributes>,
> = BlockMetadataBindings<TBindings>;

export type BindingSourceDiagnosticCode =
  | "duplicate-bindable-attribute"
  | "duplicate-field-name"
  | "fields-list-requires-editor"
  | "invalid-bindable-attribute"
  | "invalid-block-name"
  | "invalid-field-name"
  | "invalid-source-name"
  | "missing-php-callback";

export interface BindingSourceAuthoringDiagnostic {
  readonly attribute?: string | undefined;
  readonly blockName?: string | undefined;
  readonly code: BindingSourceDiagnosticCode;
  readonly fieldName?: string | undefined;
  readonly message: string;
  readonly severity: "error" | "warning";
  readonly sourceName: string;
}

export type BindingSourceDiagnostic =
  | BindingSourceAuthoringDiagnostic
  | WordPressBlockApiCompatibilityDiagnostic;

export interface BindingSourceRegistrationEntry {
  readonly metadata: DefinedBlockBindingSourceMetadata;
  readonly source: DefinedBindingSource;
}

export function getDefinedBindingSourceMetadata(
  source: unknown,
): DefinedBlockBindingSourceMetadata | undefined {
  return isObjectRecord(source)
    ? (
        source as {
          readonly [DEFINED_BLOCK_BINDING_SOURCE_METADATA]?:
            | DefinedBlockBindingSourceMetadata
            | undefined;
        }
      )[DEFINED_BLOCK_BINDING_SOURCE_METADATA]
    : undefined;
}

export function getDefinedBindingSourceCompatibilityManifest(
  source: unknown,
): WordPressBlockApiCompatibilityManifest | undefined {
  return getDefinedBindingSourceMetadata(source)?.manifest;
}

export function defineBindingSource<
  const TSource extends BindingSourceDefinition &
    DefineBindingSourceInlineOptions,
>(
  source: TSource,
  options: DefineBindingSourceOptions = {},
): DefinedBindingSource<
  Extract<TSource["name"], string>,
  TSource extends { readonly args: infer TArgs extends BindingSourceArgs }
    ? TArgs
    : BindingSourceArgs,
  TSource extends { readonly fields: infer TFields extends readonly BindingSourceField[] }
    ? TFields
    : readonly BindingSourceField[],
  TSource
> {
  const { inlineOptions, source: normalizedSource } =
    splitDefineBindingSourceInput(source);
  const resolved = resolveDefineBindingSourceSettings(
    inlineOptions,
    options,
    normalizedSource,
  );
  const features = collectBindingSourceCompatibilityFeatures(resolved.features);
  const manifest = createBindingCompatibilityManifest(
    features,
    resolved.compatibility,
    resolved.gates,
  );
  const diagnostics = [
    ...manifest.diagnostics,
    ...createBindingSourceDiagnostics(normalizedSource, {
      editor: resolved.features.editor,
      fieldsList: resolved.features.fieldsList,
      server: resolved.features.server,
      strict: resolved.strict,
    }),
  ];

  handleBindingSourceDiagnostics(
    diagnostics,
    resolved.onDiagnostic,
    resolved.logger,
  );

  Object.defineProperty(
    normalizedSource,
    DEFINED_BLOCK_BINDING_SOURCE_METADATA,
    {
      configurable: false,
      enumerable: false,
      value: {
        diagnostics,
        features,
        manifest,
      } satisfies DefinedBlockBindingSourceMetadata,
      writable: false,
    },
  );

  return normalizedSource as DefinedBindingSource<
    Extract<TSource["name"], string>,
    TSource extends { readonly args: infer TArgs extends BindingSourceArgs }
      ? TArgs
      : BindingSourceArgs,
    TSource extends { readonly fields: infer TFields extends readonly BindingSourceField[] }
      ? TFields
      : readonly BindingSourceField[],
    TSource
  >;
}

export function defineBindableAttributes<
  TAttributes extends BlockAttributes = BlockAttributes,
  const TBlockName extends string = string,
  const TAttributesList extends readonly BlockBindingAttributeName<TAttributes>[] = readonly BlockBindingAttributeName<TAttributes>[],
>(
  blockName: TBlockName,
  attributes: TAttributesList,
): BindingSourceBindableAttributes<TAttributes, TBlockName, TAttributesList> {
  return {
    attributes,
    blockName,
  };
}

export function defineBlockMetadataBindings<
  const TBindings extends Readonly<Record<string, BlockBinding | undefined>>,
>(bindings: TBindings): BlockMetadataBindings<TBindings> {
  return { bindings };
}

export function defineTypedBlockMetadataBindings<
  TAttributes extends BlockAttributes,
  const TBindings extends BlockBindingMap<TAttributes> = BlockBindingMap<TAttributes>,
>(bindings: TBindings): TypedBlockMetadataBindings<TAttributes, TBindings> {
  return { bindings };
}

export function createBindingSourceRegistrationPlan(
  sources: readonly DefinedBindingSource[],
): readonly BindingSourceRegistrationEntry[] {
  return sources.map((source) => {
    const metadata = getDefinedBindingSourceMetadata(source);

    if (!metadata) {
      throw new Error(
        `Block binding source "${source.name}" was not created by defineBindingSource().`,
      );
    }

    return {
      metadata,
      source,
    };
  });
}
