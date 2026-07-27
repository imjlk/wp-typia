import fs from 'node:fs';
import path from 'node:path';

import { REST_RESOURCE_NAMESPACE_PATTERN } from '../add/cli-add-shared.js';
import {
  checkExistingFiles,
  createDoctorCheck,
  resolveWorkspaceBootstrapPath,
  WORKSPACE_AI_FEATURE_GLOB,
} from './cli-doctor-workspace-shared.js';

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
  const hasServerGlob = source.includes(WORKSPACE_AI_FEATURE_GLOB);
  const hasRegisterHook = source.includes(registerHook);

  return createDoctorCheck(
    'AI feature bootstrap',
    hasServerGlob && hasRegisterHook ? 'pass' : 'fail',
    hasServerGlob && hasRegisterHook
      ? 'AI feature PHP loader hook is present'
      : 'Missing AI feature PHP require glob or init hook',
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

  if (aiFeatures.length > 0) {
    checks.push(
      checkWorkspaceAiFeatureBootstrap(
        workspace.projectDir,
        workspace.packageName,
        workspace.workspace.phpPrefix,
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
