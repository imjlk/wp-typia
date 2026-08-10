import fs from 'node:fs';
import path from 'node:path';

import {
  checkExistingFiles,
  createDoctorCheck,
  isWorkspacePhpEntrypointManifestValid,
  resolveWorkspacePhpManifestModulePaths,
  resolveWorkspaceBootstrapPath,
  WORKSPACE_ABILITY_EDITOR_ASSET,
  WORKSPACE_ABILITY_EDITOR_SCRIPT,
  WORKSPACE_ABILITY_MANIFEST,
  workspaceBootstrapHasLiteralManifestInclude,
} from './cli-doctor-workspace-shared.js';
import { readJsonFileSync } from '../shared/json-utils.js';
import {
  escapeRegex,
  hasPhpFunctionLiteralDirectoryInclude,
} from '../shared/php-utils.js';

import type { DoctorCheck } from './cli-doctor.js';
import type { WorkspaceInventory } from '../workspace/workspace-inventory.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

function getWorkspaceAbilityRequiredFiles(
	ability: WorkspaceInventory['abilities'][number],
): string[] {
  return Array.from(
    new Set([
      ability.clientFile,
      ability.configFile,
      ability.dataFile,
      ability.inputSchemaFile,
      ability.outputSchemaFile,
      ability.phpFile,
      ability.typesFile,
    ]),
  );
}

function checkWorkspaceAbilityConfig(
	projectDir: string,
	ability: WorkspaceInventory['abilities'][number],
): DoctorCheck {
  const configPath = path.join(projectDir, ability.configFile);
  if (!fs.existsSync(configPath)) {
    return createDoctorCheck(
      `Ability config ${ability.slug}`,
      'fail',
      `Missing ${ability.configFile}`,
    );
  }

  try {
    const config = readJsonFileSync<{
			abilityId?: unknown;
			category?: { slug?: unknown };
		}>(configPath, {
      context: 'workspace ability config',
    });
    const abilityId =
			typeof config.abilityId === 'string' ? config.abilityId.trim() : '';
    const categorySlug =
			typeof config.category?.slug === 'string'
        ? config.category.slug.trim()
        : '';
    const hasValidAbilityId = /^[a-z0-9-]+\/[a-z0-9-]+$/u.test(abilityId);
    const hasValidCategorySlug = /^[a-z0-9-]+$/u.test(categorySlug);

    return createDoctorCheck(
      `Ability config ${ability.slug}`,
      hasValidAbilityId && hasValidCategorySlug ? 'pass' : 'fail',
      hasValidAbilityId && hasValidCategorySlug
        ? `Ability id ${abilityId} in category ${categorySlug} is valid`
        : 'Ability config must define a valid abilityId (`namespace/ability-name`) and category.slug.',
    );
  } catch (error) {
    return createDoctorCheck(
      `Ability config ${ability.slug}`,
      'fail',
      error instanceof Error ? error.message : String(error),
    );
  }
}

function checkWorkspaceAbilityBootstrap(
	projectDir: string,
	packageName: string,
	phpPrefix: string,
	abilities: WorkspaceInventory['abilities'],
): DoctorCheck {
  const bootstrapPath = resolveWorkspaceBootstrapPath(projectDir, packageName);
  if (!fs.existsSync(bootstrapPath)) {
    return createDoctorCheck(
      'Ability bootstrap',
      'fail',
      `Missing ${path.basename(bootstrapPath)}`,
    );
  }

  const source = fs.readFileSync(bootstrapPath, 'utf8');
  const loadFunctionName = `${phpPrefix}_load_workflow_abilities`;
  const enqueueFunctionName = `${phpPrefix}_enqueue_workflow_abilities`;
  const loadHook = `add_action( 'plugins_loaded', '${loadFunctionName}' );`;
  const adminEnqueueHook = `add_action( 'admin_enqueue_scripts', '${enqueueFunctionName}' );`;
  const editorEnqueueHook = `add_action( 'enqueue_block_editor_assets', '${enqueueFunctionName}' );`;
  const hasLoaderHook = source.includes(loadHook);
  const hasAdminEnqueueHook = source.includes(adminEnqueueHook);
  const hasEditorEnqueueHook = source.includes(editorEnqueueHook);
  const hasServerManifest = hasPhpFunctionLiteralDirectoryInclude(
    source,
    loadFunctionName,
    WORKSPACE_ABILITY_MANIFEST,
    { requirePhpOpenTag: true },
  );
  const expectedManifestTargets = resolveWorkspacePhpManifestModulePaths(
    WORKSPACE_ABILITY_MANIFEST,
    abilities.map((ability) => ability.phpFile),
  );
  const hasValidManifest = isWorkspacePhpEntrypointManifestValid(
    projectDir,
    WORKSPACE_ABILITY_MANIFEST,
    expectedManifestTargets ?? [],
  );
  const hasEditorScript = source.includes(WORKSPACE_ABILITY_EDITOR_SCRIPT);
  const hasEditorAsset = source.includes(WORKSPACE_ABILITY_EDITOR_ASSET);
  const hasScriptModuleEnqueue = source.includes('wp_enqueue_script_module');
  const hasValidBootstrap =
    hasLoaderHook &&
    hasAdminEnqueueHook &&
    hasEditorEnqueueHook &&
    hasServerManifest &&
    expectedManifestTargets !== null &&
    hasValidManifest &&
    hasEditorScript &&
    hasEditorAsset &&
    hasScriptModuleEnqueue;
  const bootstrapDetail = hasValidBootstrap
    ? 'Ability loader and admin/editor script-module bootstrap hooks are present'
    : 'Missing ability loader hook, stale ability PHP manifest, script-module enqueue, or build/abilities asset references';

  return createDoctorCheck(
    'Ability bootstrap',
    hasValidBootstrap ? 'pass' : 'fail',
    bootstrapDetail,
  );
}

function checkWorkspaceAbilityIndex(
	projectDir: string,
	abilities: WorkspaceInventory['abilities'],
): DoctorCheck {
  const indexRelativePath = [
		path.join('src', 'abilities', 'index.ts'),
		path.join('src', 'abilities', 'index.js'),
	].find((relativePath) => fs.existsSync(path.join(projectDir, relativePath)));

  if (!indexRelativePath) {
    return createDoctorCheck(
      'Abilities index',
      'fail',
      'Missing src/abilities/index.ts or src/abilities/index.js',
    );
  }

  const indexPath = path.join(projectDir, indexRelativePath);
  const source = fs.readFileSync(indexPath, 'utf8');
  const missingExports = abilities.filter((ability) => {
		const exportPattern = new RegExp(
			`^\\s*export\\s+(?:\\*\\s+from|\\{[^}]+\\}\\s+from)\\s+['"\`]\\./${escapeRegex(
				ability.slug,
			)}\\/client['"\`]`,
			'mu',
		);
		return !exportPattern.test(source);
	});

  return createDoctorCheck(
    'Abilities index',
    missingExports.length === 0 ? 'pass' : 'fail',
    missingExports.length === 0
      ? 'Ability client helpers are aggregated'
      : `Missing ability exports for: ${missingExports.map((entry) => entry.slug).join(', ')}`,
  );
}

/**
 * Collect ability workspace doctor checks while preserving existing row order.
 *
 * @param workspace Resolved workspace metadata and filesystem paths.
 * @param abilities Ability entries parsed from the workspace inventory.
 * @returns Ordered ability doctor checks.
 */
export function getWorkspaceAbilityDoctorChecks(
	workspace: WorkspaceProject,
	abilities: WorkspaceInventory['abilities'],
): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  const hasAbilityManifest = fs.existsSync(
    path.join(workspace.projectDir, WORKSPACE_ABILITY_MANIFEST.slice(1)),
  );
  const bootstrapReferencesAbilityManifest =
    workspaceBootstrapHasLiteralManifestInclude(
      workspace.projectDir,
      workspace.packageName,
      WORKSPACE_ABILITY_MANIFEST,
    );
  if (
    abilities.length > 0 ||
    hasAbilityManifest ||
    bootstrapReferencesAbilityManifest
  ) {
    checks.push(
      checkWorkspaceAbilityBootstrap(
        workspace.projectDir,
        workspace.packageName,
        workspace.workspace.phpPrefix,
        abilities,
      ),
    );
    if (abilities.length > 0) {
      checks.push(checkWorkspaceAbilityIndex(workspace.projectDir, abilities));
    }
  }
  for (const ability of abilities) {
    checks.push(checkWorkspaceAbilityConfig(workspace.projectDir, ability));
    checks.push(
      checkExistingFiles(
        workspace.projectDir,
        `Ability ${ability.slug}`,
        getWorkspaceAbilityRequiredFiles(ability),
      ),
    );
  }

  return checks;
}
