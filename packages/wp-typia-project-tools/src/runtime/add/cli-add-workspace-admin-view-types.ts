import type { WorkspaceRestResourceInventoryEntry } from '../workspace/workspace-inventory.js';

export const ADMIN_VIEW_REST_SOURCE_KIND = 'rest-resource';
export const ADMIN_VIEW_CORE_DATA_SOURCE_KIND = 'core-data';
export const ADMIN_VIEW_CORE_DATA_ENTITY_KIND_IDS = [
  'postType',
  'taxonomy',
] as const;
export const ADMIN_VIEW_CORE_DATA_ENTITY_SEGMENT_PATTERN =
  /^[A-Za-z][A-Za-z0-9_-]*$/u;
export const ADMIN_VIEW_CORE_DATA_ENTITY_NAME_PATTERN =
  /^[a-z0-9][a-z0-9_-]*$/u;
export const ADMIN_VIEW_SOURCE_USAGE =
  'wp-typia add admin-view <name> --source <rest-resource:slug|core-data:kind/name>';
export const ADMIN_VIEWS_SCRIPT = 'build/admin-views/index.js';
export const ADMIN_VIEWS_ASSET = 'build/admin-views/index.asset.php';
export const ADMIN_VIEWS_STYLE = 'build/admin-views/style-index.css';
export const ADMIN_VIEWS_STYLE_RTL = 'build/admin-views/style-index-rtl.css';
const ADMIN_VIEW_MANUAL_REST_ROUTE_PARAMETER_PATTERN =
  /(?:^|[^\\])\(/u;

export interface AdminViewRestResourceSource {
  kind: typeof ADMIN_VIEW_REST_SOURCE_KIND;
  slug: string;
}

export type AdminViewCoreDataEntityKind =
  (typeof ADMIN_VIEW_CORE_DATA_ENTITY_KIND_IDS)[number];

export interface AdminViewCoreDataSource {
  entityKind: AdminViewCoreDataEntityKind;
  entityName: string;
  kind: typeof ADMIN_VIEW_CORE_DATA_SOURCE_KIND;
}

export type AdminViewSource =
  | AdminViewCoreDataSource
  | AdminViewRestResourceSource;

export type AdminViewRestResource = WorkspaceRestResourceInventoryEntry;

/**
 * Manual REST resource metadata required to scaffold a typed admin settings
 * screen. The type narrows a workspace REST inventory entry to manual
 * contracts that expose request body, query, and response type names.
 */
export type AdminViewManualSettingsRestResource = AdminViewRestResource & {
  bodyTypeName: string;
  mode: 'manual';
  queryTypeName: string;
  responseTypeName: string;
};

export function isAdminViewCoreDataSource(
  source: AdminViewSource | undefined,
): source is AdminViewCoreDataSource {
  return source?.kind === ADMIN_VIEW_CORE_DATA_SOURCE_KIND;
}

export function isAdminViewRestResourceSource(
  source: AdminViewSource | undefined,
): source is AdminViewRestResourceSource {
  return source?.kind === ADMIN_VIEW_REST_SOURCE_KIND;
}

/**
 * Return whether a REST inventory entry has the manual contract shape required
 * by generated settings screens.
 */
export function isAdminViewManualSettingsRestResource(
  restResource: AdminViewRestResource | undefined,
): restResource is AdminViewManualSettingsRestResource {
  return (
    restResource?.mode === 'manual' &&
    typeof restResource.bodyTypeName === 'string' &&
    restResource.bodyTypeName.trim().length > 0 &&
    typeof restResource.queryTypeName === 'string' &&
    restResource.queryTypeName.trim().length > 0 &&
    typeof restResource.responseTypeName === 'string' &&
    restResource.responseTypeName.trim().length > 0
  );
}

/**
 * Return whether a REST inventory entry uses route regex groups that a
 * generated singleton settings screen cannot satisfy with path input.
 */
export function hasAdminViewManualSettingsRouteParameters(
  restResource: AdminViewRestResource | undefined,
): boolean {
  return [restResource?.pathPattern, restResource?.routePattern].some(
    (pattern) =>
      typeof pattern === 'string' &&
      ADMIN_VIEW_MANUAL_REST_ROUTE_PARAMETER_PATTERN.test(pattern),
  );
}

export function formatAdminViewSourceLocator(source: AdminViewSource): string {
  if (isAdminViewCoreDataSource(source)) {
    return `${source.kind}:${source.entityKind}/${source.entityName}`;
  }

  return `${source.kind}:${source.slug}`;
}
