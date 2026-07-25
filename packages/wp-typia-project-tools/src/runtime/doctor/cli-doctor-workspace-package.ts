import path from 'node:path';

import {
  createDoctorCheck,
  getWorkspaceBootstrapRelativePath,
} from './cli-doctor-workspace-shared.js';
import { pathExists } from '../shared/fs-async.js';
import { WORKSPACE_TEMPLATE_PACKAGE } from '../workspace/workspace-project.js';

import type { DoctorCheck } from './cli-doctor.js';
import type {
  WorkspacePackageJson,
  WorkspaceProject,
} from '../workspace/workspace-project.js';

/**
 * Snapshot of package-level filesystem doctor inputs prepared asynchronously.
 */
export interface WorkspacePackageDoctorSnapshot {
	/** Whether the expected workspace bootstrap PHP file exists. */
  bootstrapExists: boolean;
	/** Relative path to the expected workspace bootstrap PHP file. */
  bootstrapRelativePath: string;
	/** Whether the migration config file exists. */
  migrationConfigExists: boolean;
	/** Relative path to the migration config file. */
  migrationConfigRelativePath: string;
}

/**
 * Prepare package-level workspace doctor inputs without blocking the event loop.
 *
 * @param workspace Resolved workspace metadata and filesystem paths.
 * @param packageJson Parsed workspace package manifest.
 * @returns Snapshot values consumed by synchronous doctor row mappers.
 */
export async function prepareWorkspacePackageDoctorSnapshot(
	workspace: WorkspaceProject,
	packageJson: WorkspacePackageJson,
): Promise<WorkspacePackageDoctorSnapshot> {
  const packageName = packageJson.name;
  const bootstrapRelativePath = getWorkspaceBootstrapRelativePath(
    typeof packageName === 'string' && packageName.length > 0
      ? packageName
      : workspace.packageName,
  );
  const migrationConfigRelativePath = path.join(
    'src',
    'migrations',
    'config.ts',
  );
  const [bootstrapExists, migrationConfigExists] = await Promise.all([
    pathExists(path.join(workspace.projectDir, bootstrapRelativePath)),
    pathExists(path.join(workspace.projectDir, migrationConfigRelativePath)),
  ]);

  return {
    bootstrapExists,
    bootstrapRelativePath,
    migrationConfigExists,
    migrationConfigRelativePath,
  };
}

/**
 * Validate the package metadata that makes a project an official workspace.
 *
 * @param workspace Resolved workspace metadata and filesystem paths.
 * @param packageJson Parsed workspace package manifest.
 * @param snapshot Async filesystem snapshot for package-level doctor inputs.
 * @returns A `DoctorCheck` describing whether package metadata matches the workspace contract.
 */
export function getWorkspacePackageMetadataCheck(
	workspace: WorkspaceProject,
	packageJson: WorkspacePackageJson,
	snapshot: WorkspacePackageDoctorSnapshot,
): DoctorCheck {
  const issues: string[] = [];
  const packageName = packageJson.name;
  const wpTypia = packageJson.wpTypia;

  if (typeof packageName !== 'string' || packageName.length === 0) {
    issues.push(
      'package.json must define a string name for workspace bootstrap resolution',
    );
  }
  if (wpTypia?.projectType !== 'workspace') {
    issues.push('wpTypia.projectType must be "workspace"');
  }
  if (wpTypia?.templatePackage !== WORKSPACE_TEMPLATE_PACKAGE) {
    issues.push(
      `wpTypia.templatePackage must be "${WORKSPACE_TEMPLATE_PACKAGE}"`,
    );
  }
  if (wpTypia?.namespace !== workspace.workspace.namespace) {
    issues.push(
      `wpTypia.namespace must equal "${workspace.workspace.namespace}"`,
    );
  }
  if (wpTypia?.textDomain !== workspace.workspace.textDomain) {
    issues.push(
      `wpTypia.textDomain must equal "${workspace.workspace.textDomain}"`,
    );
  }
  if (wpTypia?.phpPrefix !== workspace.workspace.phpPrefix) {
    issues.push(
      `wpTypia.phpPrefix must equal "${workspace.workspace.phpPrefix}"`,
    );
  }
  if (!snapshot.bootstrapExists) {
    issues.push(`Missing bootstrap file ${snapshot.bootstrapRelativePath}`);
  }

  return createDoctorCheck(
    'Workspace package metadata',
    issues.length === 0 ? 'pass' : 'fail',
    issues.length === 0
      ? `package.json metadata aligns with ${workspace.packageName} and ${snapshot.bootstrapRelativePath}`
      : issues.join('; '),
  );
}

/**
 * Report whether a workspace configured for migrations exposes the expected doctor inputs.
 *
 * @param packageJson Parsed workspace package manifest.
 * @param snapshot Async filesystem snapshot for package-level doctor inputs.
 * @returns A migration hint row when the workspace uses migrations, otherwise `null`.
 */
export function getMigrationWorkspaceHintCheck(
	packageJson: WorkspacePackageJson,
	snapshot: WorkspacePackageDoctorSnapshot,
): DoctorCheck | null {
  const hasMigrationScript = typeof packageJson.scripts?.['migration:doctor'] === 'string';

  if (!hasMigrationScript && !snapshot.migrationConfigExists) {
    return null;
  }

  return createDoctorCheck(
    'Migration workspace',
    snapshot.migrationConfigExists ? 'pass' : 'fail',
    snapshot.migrationConfigExists
      ? 'Run `wp-typia migrate doctor --all` for migration target, snapshot, fixture, and generated artifact checks'
      : `Missing ${snapshot.migrationConfigRelativePath} for the configured migration workspace`,
  );
}
