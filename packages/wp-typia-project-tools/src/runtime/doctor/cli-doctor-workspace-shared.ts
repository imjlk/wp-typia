import fs from 'node:fs';
import path from 'node:path';

import {
  collectPhpLiteralDirectoryIncludePaths,
  hasPhpLiteralDirectoryInclude,
} from '../shared/php-utils.js';
import { WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS } from '../workspace/workspace-php-entrypoint-manifests.js';

import type { DoctorCheck } from './cli-doctor.js';

/** Literal manifest path for generated binding-source PHP entrypoints. */
export const WORKSPACE_BINDING_SERVER_MANIFEST =
  `/${WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.bindingSources}`;
/** Literal manifest path for generated block server PHP entrypoints. */
export const WORKSPACE_BLOCK_SERVER_MANIFEST =
  `/${WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.blockServers}`;
/** Literal manifest path for generated pattern PHP entrypoints. */
export const WORKSPACE_PATTERN_MANIFEST =
  `/${WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.patterns}`;
/** Relative path to the generated binding editor bundle. */
export const WORKSPACE_BINDING_EDITOR_SCRIPT = 'build/bindings/index.js';
/** Relative path to the generated binding asset manifest. */
export const WORKSPACE_BINDING_EDITOR_ASSET = 'build/bindings/index.asset.php';
/** Literal manifest path for generated REST resource PHP entrypoints. */
export const WORKSPACE_REST_RESOURCE_MANIFEST =
  `/${WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.restResources}`;
/** Literal manifest path for generated post-meta PHP entrypoints. */
export const WORKSPACE_POST_META_MANIFEST =
  `/${WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.postMeta}`;
/** Literal manifest path for generated ability PHP entrypoints. */
export const WORKSPACE_ABILITY_MANIFEST =
  `/${WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.abilities}`;
/** Relative path to the generated ability editor bundle. */
export const WORKSPACE_ABILITY_EDITOR_SCRIPT = 'build/abilities/index.js';
/** Relative path to the generated ability asset manifest. */
export const WORKSPACE_ABILITY_EDITOR_ASSET = 'build/abilities/index.asset.php';
/** Literal manifest path for generated AI feature PHP entrypoints. */
export const WORKSPACE_AI_FEATURE_MANIFEST =
  `/${WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.aiFeatures}`;
/** Literal manifest path for generated admin view PHP entrypoints. */
export const WORKSPACE_ADMIN_VIEW_MANIFEST =
  `/${WORKSPACE_PHP_ENTRYPOINT_MANIFEST_PATHS.adminViews}`;

/** Check whether the workspace bootstrap executes one literal manifest include. */
export function workspaceBootstrapHasLiteralManifestInclude(
  projectDir: string,
  packageName: string,
  manifestPath: string,
): boolean {
  const bootstrapPath = resolveWorkspaceBootstrapPath(projectDir, packageName);
  if (!fs.existsSync(bootstrapPath)) {
    return false;
  }
  return hasPhpLiteralDirectoryInclude(
    fs.readFileSync(bootstrapPath, 'utf8'),
    manifestPath,
    { requirePhpOpenTag: true },
  );
}
/** Relative path to the generated admin view editor bundle. */
export const WORKSPACE_ADMIN_VIEW_SCRIPT = 'build/admin-views/index.js';
/** Relative path to the generated admin view asset manifest. */
export const WORKSPACE_ADMIN_VIEW_ASSET = 'build/admin-views/index.asset.php';
/** Relative path to the generated admin view stylesheet. */
export const WORKSPACE_ADMIN_VIEW_STYLE = 'build/admin-views/style-index.css';
/** Relative path to the generated editor plugin bundle. */
export const WORKSPACE_EDITOR_PLUGIN_EDITOR_SCRIPT = 'build/editor-plugins/index.js';
/** Relative path to the generated editor plugin asset manifest. */
export const WORKSPACE_EDITOR_PLUGIN_EDITOR_ASSET = 'build/editor-plugins/index.asset.php';
/** Relative path to the generated editor plugin stylesheet. */
export const WORKSPACE_EDITOR_PLUGIN_EDITOR_STYLE = 'build/editor-plugins/style-index.css';
/** Canonical generated artifact filenames expected in each workspace block directory. */
export const WORKSPACE_GENERATED_BLOCK_ARTIFACTS = [
  'block.json',
  'typia.manifest.json',
  'typia.schema.json',
  'typia-validator.php',
  'typia.openapi.json',
] as const;
/** Pattern for full block names in `namespace/slug` format. */
export const WORKSPACE_FULL_BLOCK_NAME_PATTERN = /^[a-z0-9-]+\/[a-z0-9-]+$/u;

const SAFE_PHP_ENTRYPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/u;

function hasUnsafeModulePath(modulePath: string): boolean {
  const segments = modulePath.split('/');
  return segments.some(
    (segment) =>
      segment === '' ||
      segment === '.' ||
      segment === '..' ||
      !SAFE_PHP_ENTRYPOINT_SEGMENT_PATTERN.test(segment),
  );
}

/** Resolve project-relative inventory files to canonical manifest targets. */
export function resolveWorkspacePhpManifestModulePaths(
  manifestPath: string,
  projectRelativePaths: readonly string[],
): string[] | null {
  const manifestRelativePath = manifestPath.startsWith('/')
    ? manifestPath.slice(1)
    : manifestPath;
  const manifestDirectory = path.posix.dirname(manifestRelativePath);
  const modulePaths: string[] = [];
  for (const configuredPath of projectRelativePaths) {
    const normalizedPath = configuredPath.replace(/\\/gu, '/');
    if (
      path.posix.isAbsolute(normalizedPath) ||
      path.posix.normalize(normalizedPath) !== normalizedPath
    ) {
      return null;
    }
    const modulePath = path.posix.relative(manifestDirectory, normalizedPath);
    if (
      hasUnsafeModulePath(modulePath) ||
      path.posix.join(manifestDirectory, modulePath) !== normalizedPath
    ) {
      return null;
    }
    modulePaths.push(modulePath);
  }
  return modulePaths;
}

function isPathInside(parentPath: string, candidatePath: string): boolean {
  const relativePath = path.normalize(
    path.relative(path.resolve(parentPath), path.resolve(candidatePath)),
  );
  const firstSegment = relativePath.split(path.sep)[0];
  return (
    relativePath !== '' &&
    relativePath !== '.' &&
    firstSegment !== '..' &&
    !path.isAbsolute(relativePath)
  );
}

/**
 * Validate a generated PHP entrypoint manifest and its literal local targets.
 */
export function isWorkspacePhpEntrypointManifestValid(
  projectDir: string,
  manifestPath: string,
  expectedModulePaths: readonly string[],
): boolean {
  try {
    const manifestRelativePath = manifestPath.startsWith('/')
      ? manifestPath.slice(1)
      : manifestPath;
    if (hasUnsafeModulePath(manifestRelativePath)) {
      return false;
    }
    const absoluteManifestPath = path.join(projectDir, manifestRelativePath);
    if (!fs.existsSync(absoluteManifestPath)) {
      return false;
    }
    const projectRealPath = fs.realpathSync(projectDir);
    const manifestStat = fs.lstatSync(absoluteManifestPath);
    const manifestRealPath = fs.realpathSync(absoluteManifestPath);
    const expectedManifestRealPath = path.resolve(
      projectRealPath,
      manifestRelativePath,
    );
    if (
      manifestStat.isSymbolicLink() ||
      !manifestStat.isFile() ||
      manifestRealPath !== expectedManifestRealPath ||
      !isPathInside(projectRealPath, manifestRealPath)
    ) {
      return false;
    }
    const source = fs.readFileSync(absoluteManifestPath, 'utf8');
    if (/\bglob\s*\(/iu.test(source)) {
      return false;
    }
    const literalIncludePaths = collectPhpLiteralDirectoryIncludePaths(source, {
      requirePhpOpenTag: true,
    });
    if (literalIncludePaths === null) {
      return false;
    }
    const literalTargetMatches = literalIncludePaths.map((literalPath) =>
      literalPath.startsWith('/') ? literalPath.slice(1) : '',
    );
    const literalTargets = new Set(literalTargetMatches);
    const expectedTargets = new Set(expectedModulePaths);
    if (
      literalTargetMatches.some((modulePath) => modulePath.length === 0) ||
      literalTargetMatches.length !== expectedTargets.size ||
      expectedModulePaths.some(
        (modulePath) =>
          hasUnsafeModulePath(modulePath) || !literalTargets.has(modulePath),
      ) ||
      [...literalTargets].some((modulePath) => !expectedTargets.has(modulePath))
    ) {
      return false;
    }
    const manifestDirectory = path.dirname(absoluteManifestPath);
    return [...literalTargets].every((modulePath) => {
      const targetPath = path.join(manifestDirectory, modulePath);
      if (hasUnsafeModulePath(modulePath) || !fs.existsSync(targetPath)) {
        return false;
      }
      const targetStat = fs.lstatSync(targetPath);
      const targetRealPath = fs.realpathSync(targetPath);
      return (
        !targetStat.isSymbolicLink() &&
        targetStat.isFile() &&
        targetRealPath === path.resolve(
          path.dirname(expectedManifestRealPath),
          modulePath,
        ) &&
        isPathInside(projectRealPath, targetRealPath)
      );
    });
  } catch {
    return false;
  }
}

/**
 * Create a doctor result row with an optional stable diagnostic code.
 *
 * @param label Human-readable doctor row label.
 * @param status Pass, warn, or fail status for the row.
 * @param detail Detailed remediation or success text for CLI output.
 * @param code Optional stable machine-readable diagnostic code.
 * @returns A normalized `DoctorCheck` object for CLI rendering.
 */
export function createDoctorCheck(
	label: string,
	status: DoctorCheck['status'],
	detail: string,
	code?: string,
): DoctorCheck {
  return code ? { code, detail, label, status } : { detail, label, status };
}

/**
 * Create the standard workspace-doctor scope row.
 *
 * @param status Pass or fail scope status for the doctor run.
 * @param detail Scope summary describing what diagnostics ran.
 * @returns A `DoctorCheck` row labelled `Doctor scope`.
 */
export function createDoctorScopeCheck(
	status: DoctorCheck['status'],
	detail: string,
): DoctorCheck {
  return createDoctorCheck('Doctor scope', status, detail);
}

/**
 * Resolve the expected workspace bootstrap file from a package name.
 *
 * @param packageName Package name used to derive the plugin bootstrap basename.
 * @returns Relative PHP bootstrap filename for the workspace root.
 */
export function getWorkspaceBootstrapRelativePath(packageName: string): string {
  return `${packageName.split('/').pop() ?? packageName}.php`;
}

/**
 * Resolve the expected workspace bootstrap file inside a project root.
 *
 * @param projectDir Absolute workspace root directory.
 * @param packageName Package name used to derive the plugin bootstrap basename.
 * @returns Absolute PHP bootstrap file path for the workspace root.
 */
export function resolveWorkspaceBootstrapPath(
	projectDir: string,
	packageName: string,
): string {
  return path.join(projectDir, getWorkspaceBootstrapRelativePath(packageName));
}

/**
 * Verify that every referenced relative file exists inside a workspace.
 *
 * @param projectDir Absolute workspace root directory.
 * @param label Doctor row label for the file set being checked.
 * @param filePaths Relative file paths to validate.
 * @returns A passing or failing `DoctorCheck` describing any missing files.
 */
export function checkExistingFiles(
	projectDir: string,
	label: string,
	filePaths: Array<string | undefined>,
): DoctorCheck {
	// Workspace category collectors remain synchronous pure mappers after the
	// async inventory snapshot is loaded, so these small existence probes stay
	// sync to preserve their current non-Promise APIs and output ordering.
  const missing = filePaths
		.filter((filePath): filePath is string => typeof filePath === 'string')
		.filter((filePath) => !fs.existsSync(path.join(projectDir, filePath)));
  return createDoctorCheck(
    label,
    missing.length === 0 ? 'pass' : 'fail',
    missing.length === 0
      ? 'All referenced files exist'
      : `Missing: ${missing.join(', ')}`,
  );
}
