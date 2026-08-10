import {
  assertAdminViewDoesNotExist,
  assertValidGeneratedPhpModuleSlug,
  normalizeBlockSlug,
  type RunAddAdminViewCommandOptions,
} from './cli-add-shared.js';
import {
  assertAdminViewPackageAvailability,
  parseAdminViewSource,
  resolveAdminViewCoreDataSource,
  resolveRestResourceSource,
} from './cli-add-workspace-admin-view-source.js';
import { scaffoldAdminViewWorkspace } from './cli-add-workspace-admin-view-scaffold.js';
import { formatAdminViewSourceLocator } from './cli-add-workspace-admin-view-types.js';
import { readWorkspaceInventoryAsync } from '../workspace/workspace-inventory.js';
import { resolveWorkspaceProject } from '../workspace/workspace-project.js';

const ADD_ADMIN_VIEW_USAGE =
  'wp-typia add admin-view <name> [--source <rest-resource:slug|core-data:kind/name>]';

/**
 * Add one DataViews-powered WordPress admin screen scaffold to an official
 * workspace project.
 */
export async function runAddAdminViewCommand({
  adminViewName,
  cwd = process.cwd(),
  source,
}: RunAddAdminViewCommandOptions): Promise<{
  adminViewSlug: string;
  projectDir: string;
  source?: string;
}> {
  const workspace = resolveWorkspaceProject(cwd);
  assertAdminViewPackageAvailability();
  const adminViewSlug = assertValidGeneratedPhpModuleSlug(
    'Admin view name',
    normalizeBlockSlug(adminViewName),
    ADD_ADMIN_VIEW_USAGE,
  );
  const parsedSource = parseAdminViewSource(source);
  const inventory = await readWorkspaceInventoryAsync(workspace.projectDir);
  const restResource = resolveRestResourceSource(
    inventory.restResources,
    parsedSource,
  );
  const coreDataSource = resolveAdminViewCoreDataSource(parsedSource);
  assertAdminViewDoesNotExist(workspace.projectDir, adminViewSlug, inventory);

  await scaffoldAdminViewWorkspace({
    adminViewSlug,
    coreDataSource,
    parsedSource,
    restResource,
    workspace,
  });

  return {
    adminViewSlug,
    projectDir: workspace.projectDir,
    source: parsedSource
      ? formatAdminViewSourceLocator(parsedSource)
      : undefined,
  };
}
