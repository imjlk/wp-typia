import fs from 'node:fs';
import path from 'node:path';

import { REST_RESOURCE_NAMESPACE_PATTERN } from '../add/cli-add-shared.js';
import {
  checkExistingFiles,
  createDoctorCheck,
  isWorkspacePhpEntrypointManifestValid,
  resolveWorkspacePhpManifestModulePaths,
  resolveWorkspaceBootstrapPath,
  WORKSPACE_AI_FEATURE_MANIFEST,
  workspaceBootstrapHasLiteralManifestInclude,
} from './cli-doctor-workspace-shared.js';
import { hasPhpFunctionLiteralDirectoryInclude } from '../shared/php-utils.js';

import type { DoctorCheck } from './cli-doctor.js';
import type { WorkspaceInventory } from '../workspace/workspace-inventory.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

function getWorkspaceAiFeatureRequiredFiles(
	aiFeature: WorkspaceInventory['aiFeatures'][number],
): string[] {
  return Array.from(
    new Set([
      aiFeature.aiSchemaFile,
      aiFeature.apiFile,
      path.join(
        path.dirname(aiFeature.typesFile),
        'api-schemas',
        'feature-request.schema.json',
      ),
      path.join(
        path.dirname(aiFeature.typesFile),
        'api-schemas',
        'feature-response.schema.json',
      ),
      path.join(
        path.dirname(aiFeature.typesFile),
        'api-schemas',
        'feature-result.schema.json',
      ),
      aiFeature.clientFile,
      aiFeature.dataFile,
      aiFeature.openApiFile,
      aiFeature.phpFile,
      aiFeature.typesFile,
      aiFeature.validatorsFile,
    ]),
  );
}

function checkWorkspaceAiFeatureConfig(
	aiFeature: WorkspaceInventory['aiFeatures'][number],
): DoctorCheck {
  const hasNamespace = REST_RESOURCE_NAMESPACE_PATTERN.test(
    aiFeature.namespace,
  );

  return createDoctorCheck(
    `AI feature config ${aiFeature.slug}`,
    hasNamespace ? 'pass' : 'fail',
    hasNamespace
      ? `AI feature namespace ${aiFeature.namespace} is valid`
      : 'AI feature namespace is invalid',
  );
}

function checkWorkspaceAiFeatureBootstrap(
	projectDir: string,
	packageName: string,
	phpPrefix: string,
	aiFeatures: WorkspaceInventory['aiFeatures'],
): DoctorCheck {
  const bootstrapPath = resolveWorkspaceBootstrapPath(projectDir, packageName);
  if (!fs.existsSync(bootstrapPath)) {
    return createDoctorCheck(
      'AI feature bootstrap',
      'fail',
      `Missing ${path.basename(bootstrapPath)}`,
    );
  }

  const source = fs.readFileSync(bootstrapPath, 'utf8');
  const registerFunctionName = `${phpPrefix}_register_ai_features`;
  const registerHook = `add_action( 'init', '${registerFunctionName}', 20 );`;
  const hasServerManifest = hasPhpFunctionLiteralDirectoryInclude(
    source,
    registerFunctionName,
    WORKSPACE_AI_FEATURE_MANIFEST,
    { requirePhpOpenTag: true },
  );
  const expectedManifestTargets = resolveWorkspacePhpManifestModulePaths(
    WORKSPACE_AI_FEATURE_MANIFEST,
    aiFeatures.map((aiFeature) => aiFeature.phpFile),
  );
  const hasValidManifest = isWorkspacePhpEntrypointManifestValid(
    projectDir,
    WORKSPACE_AI_FEATURE_MANIFEST,
    expectedManifestTargets ?? [],
  );
  const hasRegisterHook = source.includes(registerHook);
  const hasValidBootstrap =
    hasServerManifest &&
    expectedManifestTargets !== null &&
    hasValidManifest &&
    hasRegisterHook;

  return createDoctorCheck(
    'AI feature bootstrap',
    hasValidBootstrap ? 'pass' : 'fail',
    hasValidBootstrap
      ? 'AI feature PHP manifest hook is present'
      : 'Missing or stale AI feature PHP manifest or init hook',
  );
}

/**
 * Collect AI feature workspace doctor checks while preserving existing row order.
 *
 * @param workspace Resolved workspace metadata and filesystem paths.
 * @param aiFeatures AI feature entries parsed from the workspace inventory.
 * @returns Ordered AI feature doctor checks.
 */
export function getWorkspaceAiFeatureDoctorChecks(
	workspace: WorkspaceProject,
	aiFeatures: WorkspaceInventory['aiFeatures'],
): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  const hasAiFeatureManifest = fs.existsSync(
    path.join(workspace.projectDir, WORKSPACE_AI_FEATURE_MANIFEST.slice(1)),
  );
  const bootstrapReferencesAiFeatureManifest =
    workspaceBootstrapHasLiteralManifestInclude(
      workspace.projectDir,
      workspace.packageName,
      WORKSPACE_AI_FEATURE_MANIFEST,
    );
  if (
    aiFeatures.length > 0 ||
    hasAiFeatureManifest ||
    bootstrapReferencesAiFeatureManifest
  ) {
    checks.push(
      checkWorkspaceAiFeatureBootstrap(
        workspace.projectDir,
        workspace.packageName,
        workspace.workspace.phpPrefix,
        aiFeatures,
      ),
    );
  }
  for (const aiFeature of aiFeatures) {
    checks.push(checkWorkspaceAiFeatureConfig(aiFeature));
    checks.push(
      checkExistingFiles(
        workspace.projectDir,
        `AI feature ${aiFeature.slug}`,
        getWorkspaceAiFeatureRequiredFiles(aiFeature),
      ),
    );
  }

  return checks;
}
