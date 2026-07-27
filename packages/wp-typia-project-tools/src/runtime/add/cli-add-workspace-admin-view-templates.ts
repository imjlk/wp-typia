import {
  buildCoreDataAdminViewConfigSource,
  buildCoreDataAdminViewTypesSource,
  buildCoreDataAdminViewDataSource,
  buildCoreDataAdminViewScreenSource,
} from './cli-add-workspace-admin-view-templates-core-data.js';
import {
  buildAdminViewScreenSource as buildDefaultAdminViewScreenSource,
  buildDefaultAdminViewConfigSource,
  buildDefaultAdminViewDataSource,
  buildDefaultAdminViewTypesSource,
} from './cli-add-workspace-admin-view-templates-default.js';
import {
  buildRestAdminViewConfigSource,
  buildRestAdminViewDataSource,
  buildRestAdminViewTypesSource,
} from './cli-add-workspace-admin-view-templates-rest.js';
import {
  buildAdminViewConfigEntry,
  buildAdminViewEntrySource,
  buildAdminViewPhpSource as buildSharedAdminViewPhpSource,
  buildAdminViewRegistrySource,
  buildAdminViewStyleSource,
} from './cli-add-workspace-admin-view-templates-shared.js';
import {
  buildRestSettingsAdminViewConfigSource,
  buildRestSettingsAdminViewDataSource,
  buildRestSettingsAdminViewScreenSource,
  buildRestSettingsAdminViewTypesSource,
} from './cli-add-workspace-admin-view-templates-settings.js';
import {
  isAdminViewCoreDataSource,
  type AdminViewCoreDataSource,
  type AdminViewRestResource,
  type AdminViewSource,
} from './cli-add-workspace-admin-view-types.js';
import { type WorkspaceProject } from '../workspace/workspace-project.js';

export {
  buildAdminViewConfigEntry,
  buildAdminViewEntrySource,
  buildAdminViewRegistrySource,
  buildAdminViewStyleSource,
  buildCoreDataAdminViewConfigSource,
  buildCoreDataAdminViewDataSource,
  buildCoreDataAdminViewScreenSource,
  buildCoreDataAdminViewTypesSource,
  buildDefaultAdminViewConfigSource,
  buildDefaultAdminViewDataSource,
  buildDefaultAdminViewScreenSource,
  buildDefaultAdminViewTypesSource,
  buildRestAdminViewConfigSource,
  buildRestAdminViewDataSource,
  buildRestAdminViewTypesSource,
  buildRestSettingsAdminViewConfigSource,
  buildRestSettingsAdminViewDataSource,
  buildRestSettingsAdminViewScreenSource,
  buildRestSettingsAdminViewTypesSource,
};

/**
 * Build the generated admin-view item and dataset types for the selected source.
 */
export function buildAdminViewTypesSource(
  adminViewSlug: string,
  restResource: AdminViewRestResource | undefined,
  coreDataSource: AdminViewCoreDataSource | undefined,
): string {
  if (restResource) {
    return buildRestAdminViewTypesSource(adminViewSlug, restResource);
  }

  if (coreDataSource) {
    return buildCoreDataAdminViewTypesSource(adminViewSlug, coreDataSource);
  }

  return buildDefaultAdminViewTypesSource(adminViewSlug);
}

/**
 * Build the generated DataViews config source for an admin-view scaffold.
 */
export function buildAdminViewConfigSource(
  adminViewSlug: string,
  textDomain: string,
  source: AdminViewSource | undefined,
  restResource: AdminViewRestResource | undefined,
): string {
  if (restResource) {
    return buildRestAdminViewConfigSource(adminViewSlug, textDomain);
  }

  if (isAdminViewCoreDataSource(source)) {
    return buildCoreDataAdminViewConfigSource(
      adminViewSlug,
      textDomain,
      source,
    );
  }

  return buildDefaultAdminViewConfigSource(adminViewSlug, textDomain);
}

/**
 * Delegates default admin-view screen generation to buildDefaultAdminViewScreenSource.
 *
 * @param adminViewSlug - Slug for the generated admin view.
 * @param textDomain - WordPress i18n text domain for generated labels.
 * @returns Generated TSX source for the default admin-view screen.
 */
export function buildAdminViewScreenSource(
  adminViewSlug: string,
  textDomain: string,
): string {
  return buildDefaultAdminViewScreenSource(adminViewSlug, textDomain);
}

/**
 * Delegates admin-view PHP registration generation to buildSharedAdminViewPhpSource.
 *
 * @param adminViewSlug - Slug for the generated admin view.
 * @param workspace - Workspace project metadata for PHP prefixes and paths.
 * @returns Generated PHP source for registering and enqueueing the admin view.
 */
export function buildAdminViewPhpSource(
  adminViewSlug: string,
  workspace: WorkspaceProject,
): string {
  return buildSharedAdminViewPhpSource(adminViewSlug, workspace);
}
