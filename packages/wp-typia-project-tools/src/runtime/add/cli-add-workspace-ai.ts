import {
  assertAiFeatureDoesNotExist,
  assertValidGeneratedPhpModuleSlug,
  normalizeBlockSlug,
  resolveRestResourceNamespace,
  type RunAddAiFeatureCommandOptions,
} from './cli-add-shared.js';
import { scaffoldAiFeatureWorkspace } from './cli-add-workspace-ai-scaffold.js';
import { readWorkspaceInventoryAsync } from '../workspace/workspace-inventory.js';
import { resolveWorkspaceProject } from '../workspace/workspace-project.js';
import {
  OPTIONAL_WORDPRESS_AI_CLIENT_COMPATIBILITY,
  resolveScaffoldCompatibilityPolicy,
} from '../templates/scaffold-compatibility.js';

/**
 * Scaffold a workspace-level server-only AI feature endpoint and synchronize
 * its typed REST plus AI-schema artifacts.
 *
 * @param options Command options for the AI feature scaffold workflow.
 * @returns Resolved scaffold metadata for the created AI feature.
 */
export async function runAddAiFeatureCommand({
	aiFeatureName,
	cwd = process.cwd(),
	namespace,
}: RunAddAiFeatureCommandOptions): Promise<{
  aiFeatureSlug: string;
  namespace: string;
  projectDir: string;
  warnings: string[];
}> {
  const workspace = resolveWorkspaceProject(cwd);
  const aiFeatureSlug = assertValidGeneratedPhpModuleSlug(
    'AI feature name',
    normalizeBlockSlug(aiFeatureName),
    'wp-typia add ai-feature <name> [--namespace <vendor/v1>]',
  );
  const resolvedNamespace = resolveRestResourceNamespace(
    workspace.workspace.namespace,
    namespace,
  );
  const compatibilityPolicy = resolveScaffoldCompatibilityPolicy(
    OPTIONAL_WORDPRESS_AI_CLIENT_COMPATIBILITY,
  );

  const inventory = await readWorkspaceInventoryAsync(workspace.projectDir);
  assertAiFeatureDoesNotExist(workspace.projectDir, aiFeatureSlug, inventory);

  const scaffoldResult = await scaffoldAiFeatureWorkspace({
    aiFeatureSlug,
    compatibilityPolicy,
    namespace: resolvedNamespace,
    workspace,
  });

  return {
    aiFeatureSlug,
    namespace: resolvedNamespace,
    projectDir: workspace.projectDir,
    warnings: scaffoldResult.warnings,
  };
}
