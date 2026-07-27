import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { syncTypeSchemas } from '@wp-typia/block-runtime/metadata-core';

import {
	appendWorkspaceInventoryEntries,
} from '../workspace/workspace-inventory.js';
import {
  ensureAbilityBootstrapAnchors,
  ensureAbilityBuildScriptAnchors,
  ensureAbilityPackageScripts,
  ensureAbilitySyncProjectAnchors,
  ensureAbilityWebpackAnchors,
} from './cli-add-workspace-ability-anchors.js';
import {
  resolveAbilityRegistryPath,
  writeAbilityRegistry,
} from './cli-add-workspace-ability-registry.js';
import {
  buildAbilityClientSource,
  buildAbilityConfigEntry,
  buildAbilityConfigSource,
  buildAbilityDataSource,
  buildAbilityPhpSource,
  buildAbilitySyncScriptSource,
  buildAbilityTypesSource,
} from './cli-add-workspace-ability-templates.js';
import type { ScaffoldAbilityWorkspaceOptions } from './cli-add-workspace-ability-types.js';
import { getWorkspaceBootstrapPath, patchFile } from './cli-add-shared.js';
import {
	executeWorkspaceMutationPlan,
} from './cli-add-workspace-mutation.js';
import {
	updatePluginHeaderCompatibility,
} from '../templates/scaffold-compatibility.js';
import { toPascalCase } from '../shared/string-case.js';

/**
 * Write generated workflow ability sources and patch shared workspace anchors.
 */
export async function scaffoldAbilityWorkspace({
	abilitySlug,
	compatibilityPolicy,
	workspace,
}: ScaffoldAbilityWorkspaceOptions): Promise<{
  warnings: string[];
}> {
  const compatibilityWarnings: string[] = [];
  const blockConfigPath = path.join(
    workspace.projectDir,
    'scripts',
    'block-config.ts',
  );
  const bootstrapPath = getWorkspaceBootstrapPath(workspace);
  const buildScriptPath = path.join(
    workspace.projectDir,
    'scripts',
    'build-workspace.mjs',
  );
  const packageJsonPath = path.join(workspace.projectDir, 'package.json');
  const syncAbilitiesScriptPath = path.join(
    workspace.projectDir,
    'scripts',
    'sync-abilities.ts',
  );
  const syncProjectScriptPath = path.join(
    workspace.projectDir,
    'scripts',
    'sync-project.ts',
  );
  const webpackConfigPath = path.join(
    workspace.projectDir,
    'webpack.config.js',
  );
  const abilitiesIndexPath = await resolveAbilityRegistryPath(
    workspace.projectDir,
  );
  const abilityDir = path.join(
    workspace.projectDir,
    'src',
    'abilities',
    abilitySlug,
  );
  const configFilePath = path.join(abilityDir, 'ability.config.json');
  const typesFilePath = path.join(abilityDir, 'types.ts');
  const dataFilePath = path.join(abilityDir, 'data.ts');
  const clientFilePath = path.join(abilityDir, 'client.ts');
  const phpFilePath = path.join(
    workspace.projectDir,
    'inc',
    'abilities',
    `${abilitySlug}.php`,
  );
  await executeWorkspaceMutationPlan({
		filePaths: [
			blockConfigPath,
			bootstrapPath,
			buildScriptPath,
			packageJsonPath,
			syncAbilitiesScriptPath,
			syncProjectScriptPath,
			webpackConfigPath,
			abilitiesIndexPath,
		],
		targetPaths: [abilityDir, phpFilePath, syncAbilitiesScriptPath],
		run: async () => {
			await fsp.mkdir(abilityDir, { recursive: true });
			await fsp.mkdir(path.dirname(phpFilePath), { recursive: true });
			await ensureAbilityBootstrapAnchors(workspace);
			await patchFile(bootstrapPath, (source) =>
				updatePluginHeaderCompatibility(source, compatibilityPolicy, {
					onWarning: (warning) => {
						compatibilityWarnings.push(warning);
					},
				}),
			);
			await ensureAbilityPackageScripts(workspace);
			await ensureAbilitySyncProjectAnchors(workspace);
			await ensureAbilityBuildScriptAnchors(workspace);
			await ensureAbilityWebpackAnchors(workspace);
			await fsp.writeFile(syncAbilitiesScriptPath, buildAbilitySyncScriptSource(), 'utf8');
			await fsp.writeFile(
				configFilePath,
				buildAbilityConfigSource(abilitySlug, workspace.workspace.namespace),
				'utf8',
			);
			await fsp.writeFile(typesFilePath, buildAbilityTypesSource(abilitySlug), 'utf8');
			await fsp.writeFile(dataFilePath, buildAbilityDataSource(abilitySlug), 'utf8');
			await fsp.writeFile(clientFilePath, buildAbilityClientSource(abilitySlug), 'utf8');
			await fsp.writeFile(
				phpFilePath,
				buildAbilityPhpSource(abilitySlug, workspace),
				'utf8',
			);

			const pascalCase = toPascalCase(abilitySlug);
			await syncTypeSchemas({
				jsonSchemaFile: `src/abilities/${abilitySlug}/input.schema.json`,
				projectRoot: workspace.projectDir,
				sourceTypeName: `${pascalCase}AbilityInput`,
				typesFile: `src/abilities/${abilitySlug}/types.ts`,
			});
			await syncTypeSchemas({
				jsonSchemaFile: `src/abilities/${abilitySlug}/output.schema.json`,
				projectRoot: workspace.projectDir,
				sourceTypeName: `${pascalCase}AbilityOutput`,
				typesFile: `src/abilities/${abilitySlug}/types.ts`,
			});
			await writeAbilityRegistry(workspace.projectDir, abilitySlug);
			await appendWorkspaceInventoryEntries(workspace.projectDir, {
				abilityEntries: [
					buildAbilityConfigEntry(abilitySlug, compatibilityPolicy),
				],
			});
		},
	});

  return {
    warnings: compatibilityWarnings,
  };
}
