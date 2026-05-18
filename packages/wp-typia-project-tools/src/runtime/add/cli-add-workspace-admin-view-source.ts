import { assertValidGeneratedSlug } from './cli-add-shared.js';
import {
  ADMIN_VIEW_CORE_DATA_ENTITY_KIND_IDS,
  ADMIN_VIEW_CORE_DATA_ENTITY_NAME_PATTERN,
  ADMIN_VIEW_CORE_DATA_ENTITY_SEGMENT_PATTERN,
  ADMIN_VIEW_CORE_DATA_SOURCE_KIND,
  ADMIN_VIEW_REST_SOURCE_KIND,
  ADMIN_VIEW_SOURCE_USAGE,
  hasAdminViewManualSettingsRouteParameters,
  isAdminViewCoreDataSource,
  isAdminViewManualSettingsRestResource,
  isAdminViewRestResourceSource,
  type AdminViewCoreDataEntityKind,
  type AdminViewRestResource,
  type AdminViewSource,
} from './cli-add-workspace-admin-view-types.js';

/**
 * Assert that admin-view package dependencies are available before file writes.
 *
 * This is a no-op while `@wp-typia/dataviews` is publicly available on npm.
 * The exported seam is retained so future availability checks can stay
 * centralized ahead of scaffold mutations.
 */
export function assertAdminViewPackageAvailability(): void {
  return;
}

function assertValidCoreDataEntitySegment(
  label: string,
  value: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(
      `${label} is required. Use \`${ADMIN_VIEW_SOURCE_USAGE}\`.`,
    );
  }
  if (!ADMIN_VIEW_CORE_DATA_ENTITY_SEGMENT_PATTERN.test(trimmed)) {
    throw new Error(
      `${label} must start with a letter and contain only letters, numbers, underscores, or hyphens.`,
    );
  }

  return trimmed;
}

function assertValidCoreDataEntityName(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(
      `Admin view source entity name is required. Use \`${ADMIN_VIEW_SOURCE_USAGE}\`.`,
    );
  }
  if (!ADMIN_VIEW_CORE_DATA_ENTITY_NAME_PATTERN.test(normalized)) {
    throw new Error(
      'Admin view source entity name must start with a lowercase letter or number and contain only lowercase letters, numbers, underscores, or hyphens.',
    );
  }

  return normalized;
}

function assertValidCoreDataEntityKind(
  value: string,
): AdminViewCoreDataEntityKind {
  const normalized = assertValidCoreDataEntitySegment(
    'Admin view source entity kind',
    value,
  );
  if (
    !(ADMIN_VIEW_CORE_DATA_ENTITY_KIND_IDS as readonly string[]).includes(
      normalized,
    )
  ) {
    throw new Error(
      `Admin view core-data sources currently support only: ${ADMIN_VIEW_CORE_DATA_ENTITY_KIND_IDS.join(', ')}.`,
    );
  }

  return normalized as AdminViewCoreDataEntityKind;
}

export function parseAdminViewSource(
  source?: string,
): AdminViewSource | undefined {
  const trimmed = source?.trim();
  if (!trimmed) {
    return undefined;
  }

  const separatorIndex = trimmed.indexOf(':');
  const kind =
    separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex);
  const locator =
    separatorIndex === -1 ? '' : trimmed.slice(separatorIndex + 1);
  if (!locator) {
    throw new Error(
      'Admin view source must use `rest-resource:<slug>` or `core-data:<kind>/<name>`.',
    );
  }

  if (kind === ADMIN_VIEW_REST_SOURCE_KIND) {
    return {
      kind,
      slug: assertValidGeneratedSlug(
        'Admin view source slug',
        locator,
        ADMIN_VIEW_SOURCE_USAGE,
      ),
    };
  }

  if (kind === ADMIN_VIEW_CORE_DATA_SOURCE_KIND) {
    const [entityKind, entityName, extra] = locator.split('/');
    if (!entityKind || !entityName || extra !== undefined) {
      throw new Error(
        'Admin view core-data sources must use `core-data:<kind>/<name>`, for example `core-data:postType/post`.',
      );
    }

    return {
      entityKind: assertValidCoreDataEntityKind(entityKind),
      entityName: assertValidCoreDataEntityName(entityName),
      kind,
    };
  }

  throw new Error(
    'Admin view source must use `rest-resource:<slug>` or `core-data:<kind>/<name>`.',
  );
}

export function resolveRestResourceSource(
  restResources: AdminViewRestResource[],
  source: AdminViewSource | undefined,
): AdminViewRestResource | undefined {
  if (!isAdminViewRestResourceSource(source)) {
    return undefined;
  }

  const restResource = restResources.find(
    (entry) => entry.slug === source.slug,
  );
  if (!restResource) {
    throw new Error(
      `Unknown REST resource source "${source.slug}". Choose one of: ${
        restResources.map((entry) => entry.slug).join(', ') || '<none>'
      }.`,
    );
  }
  if (isAdminViewManualSettingsRestResource(restResource)) {
    if (hasAdminViewManualSettingsRouteParameters(restResource)) {
      throw new Error(
        `REST resource source "${source.slug}" uses route parameters or regex groups and cannot scaffold a singleton admin settings form. Use a manual REST contract without path parameters or build a custom admin UI.`,
      );
    }

    return restResource;
  }
  if (restResource.mode === 'manual') {
    throw new Error(
      `REST resource source "${source.slug}" must define a request body type before it can scaffold an admin settings form.`,
    );
  }
  if (!restResource.methods.includes('list')) {
    throw new Error(
      `REST resource source "${source.slug}" must include the list method for DataViews pagination or be a manual settings contract with a body type.`,
    );
  }

  return restResource;
}

export function resolveAdminViewCoreDataSource(
  source: AdminViewSource | undefined,
) {
  return isAdminViewCoreDataSource(source) ? source : undefined;
}
