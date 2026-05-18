/**
 * Marks behavioral flags that shape how an ability should be exposed to
 * WordPress-native AI and workflow consumers.
 */
export interface AbilityAnnotationSpec {
  /** Indicates that invoking the ability mutates persisted state. */
  destructive?: boolean;
  /** Indicates that repeated invocations with the same input are safe. */
  idempotent?: boolean;
  /** Indicates that the ability only reads data and does not mutate state. */
  readonly?: boolean;
}

/**
 * Describes a shared category bucket that multiple projected abilities can
 * reference.
 */
export interface AbilityCategorySpec {
  /** Stable category identifier written into the generated abilities document. */
  id: string;
  /** Human-readable label presented by downstream discovery surfaces. */
  label: string;
}

/**
 * Defines optional metadata that an adapter can use when exposing abilities to
 * MCP-aware consumers.
 */
export interface AbilityMcpProjectionSpec {
  /** Marks an ability as safe to expose through an opt-in public MCP adapter. */
  public?: boolean;
}

/**
 * Carries WordPress-specific metadata that should survive ability projection
 * without taking ownership away from the endpoint manifest.
 */
export interface AbilityMetaSpec {
  /** Allows forward-compatible metadata keys owned by the ability layer. */
  [key: string]: unknown;
  /** Namespaces optional MCP adapter hints away from core WordPress metadata. */
  mcp?: AbilityMcpProjectionSpec;
}

/**
 * Describes WordPress-owned metadata that merges with an endpoint manifest when
 * building projected ability artifacts.
 */
export interface AbilitySpec {
  /** Behavioral annotations that describe how the ability should be treated. */
  annotations?: AbilityAnnotationSpec;
  /** Category identifier that must resolve inside the shared catalog map. */
  categoryId: string;
  /** PHP callback that executes the ability on the server. */
  executeCallback: string;
  /** Human-readable label shown to downstream discovery clients. */
  label: string;
  /** Optional WordPress-owned metadata preserved in the projected document. */
  meta?: AbilityMetaSpec;
  /** PHP callback that gates access before execution. */
  permissionCallback: string;
  /** Controls whether the projected ability stays visible to REST discovery. */
  showInRest?: boolean;
}

/**
 * Groups all WordPress-owned ability specs and category definitions for a
 * projection unit.
 */
export interface AbilitySpecCatalog {
  /** Ability definitions keyed by the endpoint operationId they augment. */
  abilities: Record<string, AbilitySpec>;
  /** Shared category definitions keyed by category id. */
  categories: Record<string, AbilityCategorySpec>;
}

/**
 * Documents which fields remain owned by AbilitySpec metadata versus the
 * endpoint manifest when the two surfaces are merged.
 */
export const ABILITY_SPEC_MERGE_BOUNDARY = {
  /** Property paths that must come from the AbilitySpec layer. */
  abilitySpecOwns: [
    'categoryId',
    'category.label',
    'label',
    'executeCallback',
    'permissionCallback',
    'annotations.readonly',
    'annotations.destructive',
    'annotations.idempotent',
    'meta.mcp.public',
    'showInRest',
  ],
  endpointManifestOwns: [
    'operationId',
    'method',
    'path',
    'summary',
    'queryContract',
    'bodyContract',
    'responseContract',
    'auth',
    'authMode',
    'wordpressAuth',
  ],
} as const;

/**
 * Resolves and validates the category referenced by an AbilitySpec.
 *
 * @param abilitySpec Ability definition that references a shared category id.
 * @param categories Available category map for the current projection scope.
 * @param operationId Endpoint identifier used in validation errors.
 * @returns The resolved category definition.
 * @throws When the category id is missing from the catalog.
 * @throws When the resolved category definition reports a different id.
 */
export function resolveAbilityCategorySpec(
  abilitySpec: AbilitySpec,
  categories: Record<string, AbilityCategorySpec>,
  operationId: string,
): AbilityCategorySpec {
  const category = categories[abilitySpec.categoryId];
  if (!category) {
    throw new Error(
      `Operation "${operationId}" references unknown AbilitySpec category "${abilitySpec.categoryId}".`,
    );
  }

  if (category.id !== abilitySpec.categoryId) {
    throw new Error(
      `AbilitySpec category "${abilitySpec.categoryId}" resolves to category id "${category.id}".`,
    );
  }

  return category;
}
