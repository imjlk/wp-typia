import path from 'node:path';

import semver from 'semver';

import {
  createDoctorCheck,
  getWorkspaceBootstrapRelativePath,
} from './cli-doctor-workspace-shared.js';
import { pathExists, readOptionalUtf8File } from '../shared/fs-async.js';
import {
  getTtscLintCompatSource,
} from '../cli/cli-init-templates.js';
import {
  hasPackageRunScriptCommand,
  hasTtscLintCompatPostinstallCommand,
  hasTtscNoEmitLintCommand,
  hasWordPressTtscLintConfigSource,
  TTSC_LINT_CONFIG_FILENAMES,
} from '../shared/ttsc-lint-config.js';
import { getPackageVersions } from '../shared/package-versions.js';
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
	/** First discovered ttsc lint config path, when present. */
  ttscLintConfigRelativePath: string | null;
	/** Read failure for the discovered ttsc lint config, when present. */
  ttscLintConfigReadError: string | null;
	/** Source of the discovered ttsc lint config, when readable. */
  ttscLintConfigSource: string | null;
	/** Whether the managed ttsc lint compatibility helper is current. */
  ttscLintCompatCurrent: boolean;
}

async function readWorkspaceTtscLintCompatCurrent(
  projectDir: string,
): Promise<boolean> {
  try {
    const source = await readOptionalUtf8File(
      path.join(projectDir, 'scripts', 'apply-ttsc-lint-compat.mjs'),
    );
    const normalizeLineEndings = (value: string) =>
      value.replace(/\r\n/gu, '\n');
    return Boolean(
      source !== null &&
        normalizeLineEndings(source) ===
          normalizeLineEndings(getTtscLintCompatSource()),
    );
  } catch {
    return false;
  }
}

async function readWorkspaceTtscLintConfig(projectDir: string): Promise<{
  readError: string | null;
  relativePath: string | null;
  source: string | null;
}> {
  for (const relativePath of TTSC_LINT_CONFIG_FILENAMES) {
    const configPath = path.join(projectDir, relativePath);
    try {
      const source = await readOptionalUtf8File(configPath);
      if (source !== null) {
        return { readError: null, relativePath, source };
      }
    } catch (error) {
      // The first existing filename is authoritative by discovery precedence;
      // never hide its read failure behind a lower-precedence config.
      return {
        readError: error instanceof Error ? error.message : String(error),
        relativePath,
        source: null,
      };
    }
  }

  return {
    readError: null,
    relativePath: null,
    source: null,
  };
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
  const [
    bootstrapExists,
    migrationConfigExists,
    ttscLintCompatCurrent,
    ttscLintConfig,
  ] =
    await Promise.all([
      pathExists(path.join(workspace.projectDir, bootstrapRelativePath)),
      pathExists(path.join(workspace.projectDir, migrationConfigRelativePath)),
      readWorkspaceTtscLintCompatCurrent(workspace.projectDir),
      readWorkspaceTtscLintConfig(workspace.projectDir),
    ]);

  return {
    bootstrapExists,
    bootstrapRelativePath,
    migrationConfigExists,
    migrationConfigRelativePath,
    ttscLintConfigRelativePath: ttscLintConfig.relativePath,
    ttscLintConfigReadError: ttscLintConfig.readError,
    ttscLintConfigSource: ttscLintConfig.source,
    ttscLintCompatCurrent,
  };
}

/** Report whether an official workspace has adopted the managed lint lane. */
export function getWorkspaceTtscLintCheck(
  packageJson: WorkspacePackageJson,
  snapshot: WorkspacePackageDoctorSnapshot,
): DoctorCheck {
  const issues: string[] = [];
  const dependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };
  const packageVersions = getPackageVersions();
  const requiredTtscLintVersion = packageVersions.ttscLintPackageVersion;
  const requiredContributorVersion =
    packageVersions.ttscLintPluginWpPackageVersion;
  const supportedTtscRange = packageVersions.ttscLintPluginWpTtscPeerRange;
  if (typeof dependencies['@ttsc/lint'] !== 'string') {
    issues.push('missing @ttsc/lint dependency');
  } else if (dependencies['@ttsc/lint'] !== requiredTtscLintVersion) {
    issues.push(
      `@ttsc/lint dependency must be exactly ${requiredTtscLintVersion}`,
    );
  }
  if (typeof dependencies['@wp-typia/ttsc-lint-plugin-wp'] !== 'string') {
    issues.push('missing @wp-typia/ttsc-lint-plugin-wp dependency');
  } else if (
    dependencies['@wp-typia/ttsc-lint-plugin-wp'] !==
    requiredContributorVersion
  ) {
    issues.push(
      `@wp-typia/ttsc-lint-plugin-wp dependency must be exactly ${requiredContributorVersion}`,
    );
  }
  if (typeof dependencies.ttsc !== 'string') {
    issues.push('missing ttsc dependency');
  } else {
    let supported = false;
    try {
      supported = semver.subset(dependencies.ttsc, supportedTtscRange);
    } catch {
      // Invalid ranges cannot satisfy the managed contributor contract.
    }
    if (!supported) {
      issues.push(`ttsc dependency must satisfy ${supportedTtscRange}`);
    }
  }
  if (typeof dependencies.typescript !== 'string') {
    issues.push('missing typescript dependency');
  }
  if (snapshot.ttscLintConfigReadError) {
    issues.push(
      `unable to read ${snapshot.ttscLintConfigRelativePath}: ${snapshot.ttscLintConfigReadError}`,
    );
  } else if (!snapshot.ttscLintConfigSource) {
    issues.push('missing ttsc lint config');
  } else if (
    !hasWordPressTtscLintConfigSource(
      snapshot.ttscLintConfigSource,
      packageJson.wpTypia?.textDomain ?? '',
      snapshot.ttscLintConfigRelativePath ?? undefined,
    )
  ) {
    issues.push(
      `${snapshot.ttscLintConfigRelativePath} does not enable the WordPress contributor and text-domain rule`,
    );
  }
  if (!hasTtscNoEmitLintCommand(packageJson.scripts?.['lint:ts'])) {
    issues.push('lint:ts must invoke `ttsc --noEmit`');
  }
  if (!hasPackageRunScriptCommand(packageJson.scripts?.lint, 'lint:ts')) {
    issues.push('lint must include the lint:ts lane');
  }
  if (!snapshot.ttscLintCompatCurrent) {
    issues.push('missing or stale scripts/apply-ttsc-lint-compat.mjs');
  }
  if (
    !hasTtscLintCompatPostinstallCommand(packageJson.scripts?.postinstall)
  ) {
    issues.push('postinstall must invoke scripts/apply-ttsc-lint-compat.mjs');
  }

  return createDoctorCheck(
    'WordPress ttsc lint',
    issues.length === 0 ? 'pass' : 'warn',
    issues.length === 0
      ? `${snapshot.ttscLintConfigRelativePath} enables the WordPress contributor while JavaScript lint remains a separate lane`
      : `${issues.join('; ')}. Preview the non-destructive upgrade with \`wp-typia init\`, then apply it with \`wp-typia init --apply\`.`,
  );
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
