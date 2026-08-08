import fs from 'node:fs';
import path from 'node:path';

import {
  parsePackageManagerField,
  type PackageManagerId,
} from '../shared/package-managers.js';
import { readJsonFileSync } from '../shared/json-utils.js';

export const WORKSPACE_TEMPLATE_PACKAGE = '@wp-typia/create-workspace-template';

export interface WorkspacePackageJson {
  author?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  name?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  wpTypia?: {
    namespace?: string;
    phpPrefix?: string;
    projectType?: string;
    templatePackage?: string;
    textDomain?: string;
  };
}

export interface WorkspaceProject {
  author: string;
  packageManager: PackageManagerId;
  packageName: string;
  projectDir: string;
  workspace: Required<NonNullable<WorkspacePackageJson['wpTypia']>>;
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Parse a workspace package manifest from a project directory or `package.json` path.
 *
 * @param projectDirOrManifestPath Absolute or relative project directory, or a direct
 * path to `package.json`.
 * @returns The parsed workspace package manifest.
 * @throws {Error} When the manifest cannot be parsed.
 */
export function parseWorkspacePackageJson(projectDirOrManifestPath: string): WorkspacePackageJson {
  const packageJsonPath =
		path.basename(projectDirOrManifestPath) === 'package.json'
      ? projectDirOrManifestPath
      : path.join(projectDirOrManifestPath, 'package.json');

  return readJsonFileSync<WorkspacePackageJson>(packageJsonPath, {
    context: 'workspace package manifest',
  });
}

function getWorkspaceMetadataIssues(packageJson: WorkspacePackageJson): string[] {
  if (!packageJson.wpTypia) {
    return [];
  }

  const issues: string[] = [];

  if (packageJson.wpTypia.projectType !== 'workspace') {
    issues.push('wpTypia.projectType must be "workspace"');
  }
  if (packageJson.wpTypia.templatePackage !== WORKSPACE_TEMPLATE_PACKAGE) {
    issues.push(
      `wpTypia.templatePackage must be "${WORKSPACE_TEMPLATE_PACKAGE}"`,
    );
  }
  if (!hasNonEmptyString(packageJson.wpTypia.namespace)) {
    issues.push('wpTypia.namespace must be a non-empty string');
  }
  if (!hasNonEmptyString(packageJson.wpTypia.textDomain)) {
    issues.push('wpTypia.textDomain must be a non-empty string');
  }
  if (!hasNonEmptyString(packageJson.wpTypia.phpPrefix)) {
    issues.push('wpTypia.phpPrefix must be a non-empty string');
  }

  return issues;
}

/**
 * Explain why a nearby wp-typia workspace cannot be resolved from `startDir`.
 *
 * @param startDir Directory to begin walking upward from.
 * @returns A human-readable validation error when a candidate workspace package
 * manifest is found but its `wpTypia` metadata is invalid, or `null` when no
 * invalid workspace candidate is discovered.
 * @throws {Error} When a discovered `package.json` cannot be parsed.
 */
export function getInvalidWorkspaceProjectReason(startDir: string): string | null {
  let currentDir = path.resolve(startDir);

  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = parseWorkspacePackageJson(packageJsonPath);
      const issues = getWorkspaceMetadataIssues(packageJson);
      if (issues.length > 0) {
        return `Invalid wp-typia workspace metadata at ${packageJsonPath}: ${issues.join('; ')}`;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return null;
}

/**
 * Parse a package-manager identifier from a `packageManager` field.
 *
 * @param packageManagerField Raw package-manager field such as `bun@1.3.11`.
 * @returns A normalized `PackageManagerId`, defaulting to `"npm"` when the
 * field is missing or unsupported.
 */
export function parseWorkspacePackageManagerId(
	packageManagerField: string | undefined,
): PackageManagerId {
  return parsePackageManagerField(packageManagerField) ?? 'npm';
}

/**
 * Try to resolve the nearest official wp-typia workspace from `startDir`.
 *
 * @param startDir Directory to begin walking upward from.
 * @returns The resolved `WorkspaceProject`, or `null` when no
 * `WORKSPACE_TEMPLATE_PACKAGE` workspace is found.
 * @throws {Error} When a discovered `package.json` cannot be parsed.
 */
export function tryResolveWorkspaceProject(startDir: string): WorkspaceProject | null {
  let currentDir = path.resolve(startDir);

  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = parseWorkspacePackageJson(packageJsonPath);

      if (
				packageJson.wpTypia?.projectType === 'workspace' &&
				packageJson.wpTypia?.templatePackage === WORKSPACE_TEMPLATE_PACKAGE &&
				hasNonEmptyString(packageJson.wpTypia.namespace) &&
				hasNonEmptyString(packageJson.wpTypia.textDomain) &&
				hasNonEmptyString(packageJson.wpTypia.phpPrefix)
			) {
        return {
					author: typeof packageJson.author === 'string' ? packageJson.author : 'Your Name',
					packageManager: parseWorkspacePackageManagerId(packageJson.packageManager),
					packageName:
						typeof packageJson.name === 'string'
							? packageJson.name
							: path.basename(currentDir),
					projectDir: currentDir,
					workspace: {
						namespace: packageJson.wpTypia.namespace,
						phpPrefix: packageJson.wpTypia.phpPrefix,
						projectType: 'workspace',
						templatePackage: WORKSPACE_TEMPLATE_PACKAGE,
						textDomain: packageJson.wpTypia.textDomain,
					},
				};
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return null;
}

/**
 * Resolve the nearest official wp-typia workspace from `startDir`.
 *
 * @param startDir Directory to begin walking upward from.
 * @returns The resolved `WorkspaceProject`.
 * @throws {Error} When no `WORKSPACE_TEMPLATE_PACKAGE` workspace can be found.
 */
export function resolveWorkspaceProject(startDir: string): WorkspaceProject {
  const workspace = tryResolveWorkspaceProject(startDir);
  if (workspace) {
    return workspace;
  }

  throw new Error(
    `This command must run inside an official wp-typia workspace. Create one with \`wp-typia create my-plugin --template workspace\` first (the short alias for \`${WORKSPACE_TEMPLATE_PACKAGE}\`).`,
  );
}
