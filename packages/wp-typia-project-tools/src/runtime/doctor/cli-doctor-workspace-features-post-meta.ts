import fs from 'node:fs';
import path from 'node:path';

import { assertValidPostMetaPostType } from '../add/cli-add-shared.js';
import {
  checkExistingFiles,
  createDoctorCheck,
  isWorkspacePhpEntrypointManifestValid,
  resolveWorkspaceBootstrapPath,
  WORKSPACE_POST_META_MANIFEST,
  workspaceBootstrapHasLiteralManifestInclude,
} from './cli-doctor-workspace-shared.js';
import { hasPhpLiteralDirectoryInclude } from '../shared/php-utils.js';

import type { DoctorCheck } from './cli-doctor.js';
import type { WorkspaceInventory } from '../workspace/workspace-inventory.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

function getWorkspacePostMetaRequiredFiles(
	postMeta: WorkspaceInventory['postMeta'][number],
): string[] {
  return Array.from(
    new Set([postMeta.phpFile, postMeta.schemaFile, postMeta.typesFile]),
  );
}

function checkWorkspacePostMetaConfig(
	postMeta: WorkspaceInventory['postMeta'][number],
): DoctorCheck {
  let hasPostType = false;
  try {
    hasPostType = assertValidPostMetaPostType(
      postMeta.postType,
    ) === postMeta.postType;
  } catch {
    hasPostType = false;
  }
  const hasMetaKey =
		typeof postMeta.metaKey === 'string' &&
		postMeta.metaKey.trim().length > 0 &&
		!/\s/u.test(postMeta.metaKey);
  const hasRestExposure = typeof postMeta.showInRest === 'boolean';

  return createDoctorCheck(
    `Post meta config ${postMeta.slug}`,
    hasPostType && hasMetaKey && hasRestExposure ? 'pass' : 'fail',
    hasPostType && hasMetaKey && hasRestExposure
      ? `Post meta ${postMeta.metaKey} targets ${postMeta.postType}`
      : 'Post meta postType, metaKey, or showInRest configuration is invalid',
  );
}

function checkWorkspacePostMetaBootstrap(
	projectDir: string,
	packageName: string,
	phpPrefix: string,
	postMetaEntries: WorkspaceInventory['postMeta'],
): DoctorCheck {
  const bootstrapPath = resolveWorkspaceBootstrapPath(projectDir, packageName);
  if (!fs.existsSync(bootstrapPath)) {
    return createDoctorCheck(
      'Post meta bootstrap',
      'fail',
      `Missing ${path.basename(bootstrapPath)}`,
    );
  }

  const source = fs.readFileSync(bootstrapPath, 'utf8');
  const registerFunctionName = `${phpPrefix}_register_post_meta_contracts`;
  const registerHook = `add_action( 'init', '${registerFunctionName}', 20 );`;
  const hasServerManifest = hasPhpLiteralDirectoryInclude(
    source,
    WORKSPACE_POST_META_MANIFEST,
    { requirePhpOpenTag: true },
  );
  const hasValidManifest = isWorkspacePhpEntrypointManifestValid(
    projectDir,
    WORKSPACE_POST_META_MANIFEST,
    postMetaEntries.map((postMeta) => path.basename(postMeta.phpFile)),
  );
  const hasRegisterHook = source.includes(registerHook);

  return createDoctorCheck(
    'Post meta bootstrap',
    hasServerManifest && hasValidManifest && hasRegisterHook ? 'pass' : 'fail',
    hasServerManifest && hasValidManifest && hasRegisterHook
      ? 'Post meta PHP manifest hook is present'
      : 'Missing or stale post meta PHP manifest or init hook',
  );
}

function checkWorkspacePostMetaPhp(
	projectDir: string,
	postMeta: WorkspaceInventory['postMeta'][number],
): DoctorCheck {
  const phpPath = path.join(projectDir, postMeta.phpFile);
  if (!fs.existsSync(phpPath)) {
    return createDoctorCheck(
      `Post meta PHP ${postMeta.slug}`,
      'fail',
      `Missing ${postMeta.phpFile}`,
    );
  }

  const source = fs.readFileSync(phpPath, 'utf8');
  const hasRegisterPostMeta = source.includes('register_post_meta');
  const hasPostType = source.includes(postMeta.postType);
  const hasMetaKey = source.includes(postMeta.metaKey);
  const hasSchemaFile = source.includes(postMeta.schemaFile);
  const hasRestExposure = source.includes("'show_in_rest'");

  return createDoctorCheck(
    `Post meta PHP ${postMeta.slug}`,
    hasRegisterPostMeta && hasPostType && hasMetaKey && hasSchemaFile && hasRestExposure
      ? 'pass'
      : 'fail',
    hasRegisterPostMeta && hasPostType && hasMetaKey && hasSchemaFile && hasRestExposure
      ? 'Post meta registration, schema path, and REST exposure flag are wired'
      : 'Missing register_post_meta, post type, meta key, schema path, or show_in_rest wiring',
  );
}

/**
 * Collect post meta workspace doctor checks while preserving existing row order.
 *
 * @param workspace Resolved workspace metadata and filesystem paths.
 * @param postMetaEntries Post meta entries parsed from the workspace inventory.
 * @returns Ordered post meta doctor checks.
 */
export function getWorkspacePostMetaDoctorChecks(
	workspace: WorkspaceProject,
	postMetaEntries: WorkspaceInventory['postMeta'],
): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  const hasPostMetaManifest = fs.existsSync(
    path.join(workspace.projectDir, WORKSPACE_POST_META_MANIFEST.slice(1)),
  );
  const bootstrapReferencesPostMetaManifest =
    workspaceBootstrapHasLiteralManifestInclude(
      workspace.projectDir,
      workspace.packageName,
      WORKSPACE_POST_META_MANIFEST,
    );
  if (
    postMetaEntries.length > 0 ||
    hasPostMetaManifest ||
    bootstrapReferencesPostMetaManifest
  ) {
    checks.push(
      checkWorkspacePostMetaBootstrap(
        workspace.projectDir,
        workspace.packageName,
        workspace.workspace.phpPrefix,
        postMetaEntries,
      ),
    );
  }
  for (const postMeta of postMetaEntries) {
    checks.push(checkWorkspacePostMetaConfig(postMeta));
    checks.push(
      checkExistingFiles(
        workspace.projectDir,
        `Post meta ${postMeta.slug}`,
        getWorkspacePostMetaRequiredFiles(postMeta),
      ),
    );
    checks.push(checkWorkspacePostMetaPhp(workspace.projectDir, postMeta));
  }

  return checks;
}
