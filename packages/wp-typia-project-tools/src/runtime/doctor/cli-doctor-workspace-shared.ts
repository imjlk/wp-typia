import fs from 'node:fs';
import path from 'node:path';

import {
  countPhpCodeIdentifiers,
  hasPhpVariableIncludeExpression,
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

const PHP_ENTRYPOINT_LITERAL_PATTERN =
  /\b(?:require|require_once|include|include_once)\s+__DIR__\s*\.\s*'\/([^']+)'\s*;/gu;
const PHP_ENTRYPOINT_INCLUDE_KEYWORDS = [
  'require',
  'require_once',
  'include',
  'include_once',
] as const;
const PHP_ENTRYPOINT_VARIABLE_INCLUDE_PATTERN =
  /\b(?:require|require_once|include|include_once)\s*(?:\(\s*)?\$/u;
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
    if (
      manifestStat.isSymbolicLink() ||
      !isPathInside(projectRealPath, fs.realpathSync(absoluteManifestPath))
    ) {
      return false;
    }
    const source = fs.readFileSync(absoluteManifestPath, 'utf8');
    if (
      PHP_ENTRYPOINT_VARIABLE_INCLUDE_PATTERN.test(source) ||
      hasPhpVariableIncludeExpression(source, { requirePhpOpenTag: true }) ||
      /\bglob\s*\(/u.test(source)
    ) {
      return false;
    }
    const literalTargetMatches = [
      ...source.matchAll(PHP_ENTRYPOINT_LITERAL_PATTERN),
    ].map((match) => match[1]);
    const includeStatementCount = countPhpCodeIdentifiers(
      source,
      PHP_ENTRYPOINT_INCLUDE_KEYWORDS,
      { requirePhpOpenTag: true },
    );
    const literalTargets = new Set(literalTargetMatches);
    const expectedTargets = new Set(expectedModulePaths);
    if (
      includeStatementCount !== literalTargetMatches.length ||
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
      return (
        !hasUnsafeModulePath(modulePath) &&
        fs.existsSync(targetPath) &&
        !fs.lstatSync(targetPath).isSymbolicLink() &&
        isPathInside(projectRealPath, fs.realpathSync(targetPath))
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
