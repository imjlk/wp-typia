import fs from 'node:fs';
import path from 'node:path';

import {
  hasAdminViewManualSettingsRouteParameters,
  isAdminViewManualSettingsRestResource,
} from '../add/cli-add-workspace-admin-view-types.js';
import {
  checkExistingFiles,
  createDoctorCheck,
  resolveWorkspaceBootstrapPath,
  WORKSPACE_ADMIN_VIEW_ASSET,
  WORKSPACE_ADMIN_VIEW_GLOB,
  WORKSPACE_ADMIN_VIEW_SCRIPT,
  WORKSPACE_ADMIN_VIEW_STYLE,
} from './cli-doctor-workspace-shared.js';
import { escapeRegex } from '../shared/php-utils.js';

import type { DoctorCheck } from './cli-doctor.js';
import type { WorkspaceInventory } from '../workspace/workspace-inventory.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

function getWorkspaceAdminViewRequiredFiles(
	adminView: WorkspaceInventory['adminViews'][number],
): string[] {
  const adminViewDir = path.join('src', 'admin-views', adminView.slug);

  return Array.from(
    new Set([
      adminView.file,
      adminView.phpFile,
      path.join(adminViewDir, 'Screen.tsx'),
      path.join(adminViewDir, 'config.ts'),
      path.join(adminViewDir, 'data.ts'),
      path.join(adminViewDir, 'style.scss'),
      path.join(adminViewDir, 'types.ts'),
    ]),
  );
}

function checkWorkspaceAdminViewConfig(
	adminView: WorkspaceInventory['adminViews'][number],
	inventory: WorkspaceInventory,
): DoctorCheck {
  if (adminView.source === undefined) {
    return createDoctorCheck(
      `Admin view config ${adminView.slug}`,
      'pass',
      'Admin view uses a replaceable local fetcher',
    );
  }

  const source = adminView.source.trim();
  const restSourceMatch = /^rest-resource:([a-z][a-z0-9-]*)$/u.exec(source);
  const coreDataSourceMatch =
		/^core-data:(postType|taxonomy)\/([a-z0-9][a-z0-9_-]*)$/u.exec(source);
  const restResourceSlug = restSourceMatch?.[1];
  const restResource = restResourceSlug
    ? inventory.restResources.find((entry) => entry.slug === restResourceSlug)
    : undefined;
  const isListCapableRestResource = Boolean(
    restResource?.methods.includes('list'),
  );
  const isManualSettingsRestResource =
		isAdminViewManualSettingsRestResource(restResource);
  const hasManualSettingsRouteParameters =
		isManualSettingsRestResource &&
		hasAdminViewManualSettingsRouteParameters(restResource);
  const isValid =
		isListCapableRestResource ||
		(isManualSettingsRestResource && !hasManualSettingsRouteParameters) ||
		Boolean(coreDataSourceMatch);
  const failDetail = hasManualSettingsRouteParameters
    ? `Admin view source ${source} uses route parameters or regex groups and cannot scaffold a singleton settings form`
    : 'Admin view source must use rest-resource:<slug> with a list-capable REST resource, a manual settings contract with a body type, or core-data:<postType|taxonomy>/<name>';

  return createDoctorCheck(
		`Admin view config ${adminView.slug}`,
		isValid ? 'pass' : 'fail',
		isValid
			? `Admin view source ${source} is ${
					isManualSettingsRestResource
						? 'settings-form capable'
						: coreDataSourceMatch
							? 'core-data capable'
							: 'list-capable'
				}`
			: failDetail,
	);
}

function checkWorkspaceAdminViewBootstrap(
	projectDir: string,
	packageName: string,
	phpPrefix: string,
): DoctorCheck {
  const bootstrapPath = resolveWorkspaceBootstrapPath(projectDir, packageName);
  if (!fs.existsSync(bootstrapPath)) {
    return createDoctorCheck(
      'Admin view bootstrap',
      'fail',
      `Missing ${path.basename(bootstrapPath)}`,
    );
  }

  const source = fs.readFileSync(bootstrapPath, 'utf8');
  const loadFunctionName = `${phpPrefix}_load_admin_views`;
  const loadHook = `add_action( 'plugins_loaded', '${loadFunctionName}' );`;
  const hasLoaderHook = source.includes(loadHook);
  const hasServerGlob = source.includes(WORKSPACE_ADMIN_VIEW_GLOB);

  return createDoctorCheck(
    'Admin view bootstrap',
    hasLoaderHook && hasServerGlob ? 'pass' : 'fail',
    hasLoaderHook && hasServerGlob
      ? 'Admin view PHP loader hook is present'
      : 'Missing admin view PHP require glob or plugins_loaded hook',
  );
}

function checkWorkspaceAdminViewIndex(
	projectDir: string,
	adminViews: WorkspaceInventory['adminViews'],
): DoctorCheck {
  const indexRelativePath = [
		path.join('src', 'admin-views', 'index.ts'),
		path.join('src', 'admin-views', 'index.js'),
	].find((relativePath) => fs.existsSync(path.join(projectDir, relativePath)));

  if (!indexRelativePath) {
    return createDoctorCheck(
      'Admin views index',
      'fail',
      'Missing src/admin-views/index.ts or src/admin-views/index.js',
    );
  }

  const indexPath = path.join(projectDir, indexRelativePath);
  const source = fs.readFileSync(indexPath, 'utf8');
  const missingImports = adminViews.filter((adminView) => {
    const importPattern = new RegExp(
      `['"\`]\\./${escapeRegex(adminView.slug)}(?:/[^'"\`]*)?['"\`]`,
      'u',
    );
    return !importPattern.test(source);
  });

  return createDoctorCheck(
		'Admin views index',
		missingImports.length === 0 ? 'pass' : 'fail',
		missingImports.length === 0
			? 'Admin view registrations are aggregated'
			: `Missing admin view imports for: ${missingImports
					.map((entry) => entry.slug)
					.join(', ')}`,
	);
}

function checkWorkspaceAdminViewPhp(
	projectDir: string,
	adminView: WorkspaceInventory['adminViews'][number],
): DoctorCheck {
  const phpPath = path.join(projectDir, adminView.phpFile);
  if (!fs.existsSync(phpPath)) {
    return createDoctorCheck(
      `Admin view PHP ${adminView.slug}`,
      'fail',
      `Missing ${adminView.phpFile}`,
    );
  }

  const source = fs.readFileSync(phpPath, 'utf8');
  const hasAdminMenu = source.includes('add_submenu_page');
  const hasAdminEnqueue = source.includes('admin_enqueue_scripts');
  const hasScript = source.includes(WORKSPACE_ADMIN_VIEW_SCRIPT);
  const hasAsset = source.includes(WORKSPACE_ADMIN_VIEW_ASSET);
  const hasStyle = source.includes(WORKSPACE_ADMIN_VIEW_STYLE);
  const hasComponentsStyleDependency = /['"]wp-components['"]/u.test(source);

  return createDoctorCheck(
		`Admin view PHP ${adminView.slug}`,
		hasAdminMenu &&
			hasAdminEnqueue &&
			hasScript &&
			hasAsset &&
			hasStyle &&
			hasComponentsStyleDependency
			? 'pass'
			: 'fail',
		hasAdminMenu &&
			hasAdminEnqueue &&
			hasScript &&
			hasAsset &&
			hasStyle &&
			hasComponentsStyleDependency
			? 'Admin menu, script, style, and wp-components style dependency are wired'
			: 'Missing admin menu, enqueue hook, build/admin-views asset reference, or wp-components style dependency',
	);
}

/**
 * Collect admin view workspace doctor checks while preserving existing row order.
 *
 * @param workspace Resolved workspace metadata and filesystem paths.
 * @param inventory Parsed workspace inventory from `scripts/block-config.ts`.
 * @returns Ordered admin view doctor checks.
 */
export function getWorkspaceAdminViewDoctorChecks(
	workspace: WorkspaceProject,
	inventory: WorkspaceInventory,
): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  if (inventory.adminViews.length > 0) {
    checks.push(
      checkWorkspaceAdminViewBootstrap(
        workspace.projectDir,
        workspace.packageName,
        workspace.workspace.phpPrefix,
      ),
    );
    checks.push(
      checkWorkspaceAdminViewIndex(workspace.projectDir, inventory.adminViews),
    );
  }
  for (const adminView of inventory.adminViews) {
    checks.push(checkWorkspaceAdminViewConfig(adminView, inventory));
    checks.push(
      checkExistingFiles(
        workspace.projectDir,
        `Admin view ${adminView.slug}`,
        getWorkspaceAdminViewRequiredFiles(adminView),
      ),
    );
    checks.push(checkWorkspaceAdminViewPhp(workspace.projectDir, adminView));
  }

  return checks;
}
