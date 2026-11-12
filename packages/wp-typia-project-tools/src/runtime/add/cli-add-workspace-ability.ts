import {
  assertAbilityDoesNotExist,
  assertValidAbilityCategorySlug,
  assertValidGeneratedPhpModuleSlug,
  normalizeBlockSlug,
  type RunAddAbilityCommandOptions,
} from './cli-add-shared.js';
import { scaffoldAbilityWorkspace } from './cli-add-workspace-ability-scaffold.js';
import { toAbilityCategorySlug } from './cli-add-workspace-ability-templates.js';
import { readWorkspaceInventoryAsync } from '../workspace/workspace-inventory.js';
import { resolveWorkspaceProject } from '../workspace/workspace-project.js';
import {
  REQUIRED_WORKSPACE_ABILITY_COMPATIBILITY,
  resolveScaffoldCompatibilityPolicy,
} from '../templates/scaffold-compatibility.js';

/**
 * Add one typed workflow ability scaffold to an official workspace project.
 *
 * @returns Generated ability metadata plus non-fatal scaffold warnings, such
 * as repaired malformed existing plugin header floor values.
 */
export async function runAddAbilityCommand({
	abilityName,
	categorySlug,
	cwd = process.cwd(),
	publicMcp = false,
}: RunAddAbilityCommandOptions): Promise<{
  abilitySlug: string;
  categorySlug: string;
  projectDir: string;
  publicMcp: boolean;
  warnings: string[];
}> {
  const workspace = resolveWorkspaceProject(cwd);
  const abilitySlug = assertValidGeneratedPhpModuleSlug(
    'Ability name',
    normalizeBlockSlug(abilityName),
    'wp-typia add ability <name>',
  );
  const resolvedCategorySlug =
		typeof categorySlug === 'string'
      ? assertValidAbilityCategorySlug(categorySlug)
      : undefined;

  const inventory = await readWorkspaceInventoryAsync(workspace.projectDir);
  assertAbilityDoesNotExist(workspace.projectDir, abilitySlug, inventory);

  const compatibilityPolicy = resolveScaffoldCompatibilityPolicy(
    REQUIRED_WORKSPACE_ABILITY_COMPATIBILITY,
  );
  const scaffoldResult = await scaffoldAbilityWorkspace({
    abilitySlug,
    ...(resolvedCategorySlug ? { categorySlug: resolvedCategorySlug } : {}),
    compatibilityPolicy,
    publicMcp,
    workspace,
  });

  return {
    abilitySlug,
    categorySlug:
			resolvedCategorySlug ??
			toAbilityCategorySlug(workspace.workspace.namespace),
    projectDir: workspace.projectDir,
    publicMcp,
    warnings: scaffoldResult.warnings,
  };
}
