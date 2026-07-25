import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { formatPackageExecCommand } from '../shared/package-managers.js';
import type { PackageManagerId } from '../shared/package-managers.js';
import {
  ensureMigrationDirectories,
  writeInitialMigrationScaffold,
  writeMigrationConfig,
} from '../migration/migration-project.js';
import { syncPersistenceRestArtifacts } from '../add/persistence-rest-artifacts.js';
import type { ScaffoldTemplateVariables } from './scaffold.js';
import { getPackageVersions } from '../shared/package-versions.js';
import {
  getStarterManifestFiles,
  stringifyStarterManifest,
} from './starter-manifests.js';
import {
  OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE,
  PROJECT_TOOLS_PACKAGE_ROOT,
} from './template-registry.js';
import type { BuiltInTemplateId } from './template-registry.js';
import { getScaffoldTemplateVariableGroups } from './scaffold-template-variable-groups.js';
import type { GeneratedPackageJson } from '../shared/package-json-types.js';
import { pathExists } from '../shared/fs-async.js';
import { readJsonFile, readJsonFileSync } from '../shared/json-utils.js';

const EPHEMERAL_NODE_MODULES_LINK_TYPE = process.platform === 'win32'
  ? 'junction'
  : 'dir';

/**
 * Ensures the scaffold target directory exists and is empty unless explicitly allowed.
 *
 * @param targetDir Absolute project directory that will receive scaffold output.
 * @param allowExisting Whether an existing non-empty directory should be accepted.
 * @returns A promise that resolves once the directory precondition is satisfied.
 */
export async function ensureScaffoldDirectory(
	targetDir: string,
	allowExisting = false,
): Promise<void> {
  await fsp.mkdir(targetDir, { recursive: true });

  if (allowExisting) {
    return;
  }

  const entries = await fsp.readdir(targetDir);
  if (entries.length > 0) {
    throw new Error(formatNonEmptyTargetDirectoryError(targetDir));
  }
}

function readGeneratedPackageJson(projectDir: string): GeneratedPackageJson | null {
  const packageJsonPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  return readJsonFileSync<GeneratedPackageJson>(packageJsonPath, {
    context: 'generated package manifest',
  });
}

/**
 * Format the actionable error message used when a scaffold target directory
 * already exists and is not empty.
 *
 * @param targetDir Absolute path to the target directory being evaluated.
 * @returns A human-readable error string with next-step guidance.
 */
export function formatNonEmptyTargetDirectoryError(targetDir: string): string {
  return `Target directory is not empty: ${targetDir}. Choose a new project directory, or empty this directory before rerunning the scaffold.`;
}

/**
 * Writes built-in starter manifest files into a scaffolded project.
 *
 * @param targetDir Absolute scaffold target directory.
 * @param templateId Built-in template id being scaffolded.
 * @param variables Resolved scaffold template variables.
 * @returns A promise that resolves after all starter manifests are written.
 */
export async function writeStarterManifestFiles(
	targetDir: string,
	templateId: string,
	variables: ScaffoldTemplateVariables,
): Promise<void> {
  const manifests = getStarterManifestFiles(templateId, variables);

  for (const { document, relativePath } of manifests) {
    const destinationPath = path.join(targetDir, relativePath);
    await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
    await fsp.writeFile(
      destinationPath,
      stringifyStarterManifest(document),
      'utf8',
    );
  }
}

/**
 * Seed REST-derived persistence artifacts into a newly scaffolded built-in
 * project before the first manual `sync-rest` run.
 *
 * @param targetDir Absolute scaffold target directory.
 * @param templateId Built-in template id being scaffolded.
 * @param variables Resolved scaffold template variables for the project.
 * @returns A promise that resolves after any required persistence artifacts are generated.
 */
export async function seedBuiltInPersistenceArtifacts(
	targetDir: string,
	templateId: BuiltInTemplateId,
	variables: ScaffoldTemplateVariables,
): Promise<void> {
  const compoundGroup = getScaffoldTemplateVariableGroups(variables).compound;
  const needsPersistenceArtifacts =
		templateId === 'persistence' ||
		(templateId === 'compound' &&
			compoundGroup.enabled &&
			compoundGroup.persistenceEnabled);

  if (!needsPersistenceArtifacts) {
    return;
  }

  await withEphemeralScaffoldNodeModules(targetDir, async () => {
		if (templateId === 'persistence') {
			await syncPersistenceRestArtifacts({
				apiTypesFile: path.join('src', 'api-types.ts'),
				outputDir: 'src',
				projectDir: targetDir,
				variables,
			});
			return;
		}

		await syncPersistenceRestArtifacts({
			apiTypesFile: path.join('src', 'blocks', variables.slugKebabCase, 'api-types.ts'),
			outputDir: path.join('src', 'blocks', variables.slugKebabCase),
			projectDir: targetDir,
			variables,
		});
	});
}

/**
 * Detects whether a scaffolded project declares the workspace project model.
 *
 * @param projectDir Absolute scaffold target directory.
 * @returns `true` when the project metadata identifies a workspace scaffold.
 */
export function isWorkspaceProject(projectDir: string): boolean {
  return readGeneratedPackageJson(
    projectDir,
  )?.wpTypia?.projectType === 'workspace';
}

/**
 * Detects whether a scaffolded project is the official workspace template.
 *
 * @param projectDir Absolute scaffold target directory.
 * @returns `true` when the project metadata identifies the official workspace template.
 */
export function isOfficialWorkspaceProject(projectDir: string): boolean {
  const packageJson = readGeneratedPackageJson(projectDir);
  return (
		packageJson?.wpTypia?.projectType === 'workspace' &&
		packageJson.wpTypia?.templatePackage === OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE
	);
}

/**
 * Adds migration scripts and starter workspace files to the official workspace template.
 *
 * @param projectDir Absolute scaffold target directory.
 * @param packageManager Package manager used for generated script commands.
 * @returns A promise that resolves after scripts and migration starter files are written.
 */
export async function applyWorkspaceMigrationCapability(
	projectDir: string,
	packageManager: PackageManagerId,
): Promise<void> {
  const packageJsonPath = path.join(projectDir, 'package.json');
  const packageJson = await readJsonFile<GeneratedPackageJson>(
    packageJsonPath,
    {
      context: 'workspace package manifest',
    },
  );
  const wpTypiaPackageVersion = getPackageVersions().wpTypiaPackageVersion;
  const canonicalCliSpecifier =
		wpTypiaPackageVersion === '^0.0.0'
      ? 'wp-typia'
      : `wp-typia@${wpTypiaPackageVersion.replace(/^[~^]/u, '')}`;
  const migrationCli = (args: string) =>
		formatPackageExecCommand(
      packageManager,
      canonicalCliSpecifier,
      `migrate ${args}`,
    );

  packageJson.scripts = {
    ...(packageJson.scripts ?? {}),
    'migration:init': migrationCli('init --current-migration-version v1'),
    'migration:snapshot': migrationCli('snapshot'),
    'migration:diff': migrationCli('diff'),
    'migration:scaffold': migrationCli('scaffold'),
    'migration:doctor': migrationCli('doctor --all'),
    'migration:fixtures': migrationCli('fixtures --all'),
    'migration:verify': migrationCli('verify --all'),
    'migration:fuzz': migrationCli('fuzz --all'),
  };

  await fsp.writeFile(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, '\t')}\n`,
    'utf8',
  );

  writeMigrationConfig(projectDir, {
    blocks: [],
    currentMigrationVersion: 'v1',
    snapshotDir: 'src/migrations/versions',
    supportedMigrationVersions: ['v1'],
  });
  ensureMigrationDirectories(projectDir, []);
  writeInitialMigrationScaffold(projectDir, 'v1', []);
}

/**
 * Locate a node_modules directory containing `typia` relative to the project
 * tools package root.
 *
 * Search order:
 * 1. `PROJECT_TOOLS_PACKAGE_ROOT/node_modules`
 * 2. The monorepo root resolved from `PROJECT_TOOLS_PACKAGE_ROOT`
 * 3. The monorepo root `node_modules`
 *
 * @returns The first matching path, or `null` when no candidate contains `typia`.
 */
async function resolveScaffoldGeneratorNodeModulesPath(): Promise<string | null> {
  const candidates = [
    path.join(PROJECT_TOOLS_PACKAGE_ROOT, 'node_modules'),
    path.resolve(PROJECT_TOOLS_PACKAGE_ROOT, '..', '..'),
    path.resolve(PROJECT_TOOLS_PACKAGE_ROOT, '..', '..', 'node_modules'),
  ];

  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, 'typia', 'package.json'))) {
      return candidate;
    }
  }

  return null;
}

/**
 * Temporarily symlink a scaffold generator node_modules directory into the
 * target project while running an async callback.
 *
 * The helper resolves the source path via `resolveScaffoldGeneratorNodeModulesPath()`
 * and uses `EPHEMERAL_NODE_MODULES_LINK_TYPE` for the symlink. The temporary
 * link is removed in the `finally` block so cleanup still happens if the
 * callback throws.
 *
 * @param targetDir Absolute scaffold target directory.
 * @param callback Async work that requires a resolvable `node_modules`.
 * @returns A promise that resolves after the callback and cleanup complete.
 */
async function withEphemeralScaffoldNodeModules(
	targetDir: string,
	callback: () => Promise<void>,
): Promise<void> {
  const targetNodeModulesPath = path.join(targetDir, 'node_modules');
  if (await pathExists(targetNodeModulesPath)) {
    await callback();
    return;
  }

  const sourceNodeModulesPath = await resolveScaffoldGeneratorNodeModulesPath();
  if (!sourceNodeModulesPath) {
    throw new Error(
      'Unable to resolve a node_modules directory with typia for scaffold-time REST artifact generation.',
    );
  }

  await fsp.symlink(
    sourceNodeModulesPath,
    targetNodeModulesPath,
    EPHEMERAL_NODE_MODULES_LINK_TYPE,
  );

  try {
    await callback();
  } finally {
    await fsp.rm(targetNodeModulesPath, { force: true, recursive: true });
  }
}
