import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { pathExists } from '../shared/fs-async.js';
import {
  assertContractDoesNotExist,
  assertValidGeneratedSlug,
  assertValidTypeScriptIdentifier,
  normalizeBlockSlug,
  type RunAddContractCommandOptions,
} from './cli-add-shared.js';
import { executeWorkspaceMutationPlan } from './cli-add-workspace-mutation.js';
import {
	ensureContractSyncScriptAnchors,
} from './cli-add-workspace-rest-contract-sync-anchors.js';
import {
  buildContractConfigEntry,
  buildContractTypesSource,
} from './cli-add-workspace-contract-source-emitters.js';
import { syncStandaloneContractArtifacts } from './contract-artifacts.js';
import { toPascalCase } from '../shared/string-case.js';
import {
  appendWorkspaceInventoryEntries,
  readWorkspaceInventoryAsync,
} from '../workspace/workspace-inventory.js';
import { resolveWorkspaceProject } from '../workspace/workspace-project.js';

const ADD_CONTRACT_USAGE =
	'wp-typia add contract <name> [--type <ExportedTypeName>]';

/**
 * Scaffold a standalone TypeScript wire contract and synchronize its JSON
 * Schema artifact without generating PHP route glue.
 *
 * @param options Command options for the standalone contract workflow.
 * @returns Resolved scaffold metadata for the created contract.
 */
export async function runAddContractCommand({
	contractName,
	cwd = process.cwd(),
	typeName,
}: RunAddContractCommandOptions): Promise<{
  contractSlug: string;
  projectDir: string;
  schemaFile: string;
  sourceTypeName: string;
  typesFile: string;
}> {
  const workspace = resolveWorkspaceProject(cwd);
  const contractSlug = assertValidGeneratedSlug(
    'Contract name',
    normalizeBlockSlug(contractName),
    ADD_CONTRACT_USAGE,
  );
  const sourceTypeName = assertValidTypeScriptIdentifier(
    'Contract type',
    typeName ?? toPascalCase(contractSlug),
    ADD_CONTRACT_USAGE,
  );

  const inventory = await readWorkspaceInventoryAsync(workspace.projectDir);
  assertContractDoesNotExist(workspace.projectDir, contractSlug, inventory);

  const blockConfigPath = path.join(
    workspace.projectDir,
    'scripts',
    'block-config.ts',
  );
  const syncRestScriptPath = path.join(
    workspace.projectDir,
    'scripts',
    'sync-rest-contracts.ts',
  );
  const contractDir = path.join(workspace.projectDir, 'src', 'contracts');
  const typesFile = `src/contracts/${contractSlug}.ts`;
  const schemaFile = `src/contracts/${contractSlug}.schema.json`;
  const typesFilePath = path.join(workspace.projectDir, typesFile);
  const schemaFilePath = path.join(workspace.projectDir, schemaFile);
  const contractDirExisted = await pathExists(contractDir);

  return executeWorkspaceMutationPlan({
		filePaths: [blockConfigPath, syncRestScriptPath],
		targetPaths: [
			typesFilePath,
			schemaFilePath,
			...(contractDirExisted ? [] : [contractDir]),
		],
		run: async () => {
			await fsp.mkdir(contractDir, { recursive: true });
			await ensureContractSyncScriptAnchors(workspace);
			await fsp.writeFile(
				typesFilePath,
				buildContractTypesSource(contractSlug, sourceTypeName),
				'utf8',
			);
			await syncStandaloneContractArtifacts({
				projectDir: workspace.projectDir,
				schemaFile,
				sourceTypeName,
				typesFile,
			});
			await appendWorkspaceInventoryEntries(workspace.projectDir, {
				contractEntries: [
					buildContractConfigEntry(contractSlug, sourceTypeName),
				],
			});

			return {
				contractSlug,
				projectDir: workspace.projectDir,
				schemaFile,
				sourceTypeName,
				typesFile,
			};
		},
	});
}
