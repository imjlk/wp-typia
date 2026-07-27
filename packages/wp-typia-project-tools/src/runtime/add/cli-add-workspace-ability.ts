import {
  assertAbilityDoesNotExist,
  assertValidGeneratedSlug,
  normalizeBlockSlug,
  type RunAddAbilityCommandOptions,
} from './cli-add-shared.js';
import { scaffoldAbilityWorkspace } from './cli-add-workspace-ability-scaffold.js';
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
	cwd = process.cwd(),
}: RunAddAbilityCommandOptions): Promise<{
  abilitySlug: string;
  projectDir: string;
  warnings: string[];
}> {
  const workspace = resolveWorkspaceProject(cwd);
  const abilitySlug = assertValidGeneratedSlug(
    'Ability name',
    normalizeBlockSlug(abilityName),
    'wp-typia add ability <name>',
  );

  const inventory = await readWorkspaceInventoryAsync(workspace.projectDir);
  assertAbilityDoesNotExist(workspace.projectDir, abilitySlug, inventory);

  const compatibilityPolicy = resolveScaffoldCompatibilityPolicy(
    REQUIRED_WORKSPACE_ABILITY_COMPATIBILITY,
  );
  const scaffoldResult = await scaffoldAbilityWorkspace({
    abilitySlug,
    compatibilityPolicy,
    workspace,
  });

  return {
    abilitySlug,
    projectDir: workspace.projectDir,
    warnings: scaffoldResult.warnings,
  };
}
