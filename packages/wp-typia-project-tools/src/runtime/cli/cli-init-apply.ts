import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from './cli-diagnostics.js';
import {
  rollbackWorkspaceMutation,
  snapshotWorkspaceFiles,
  type WorkspaceMutationSnapshot,
} from '../add/cli-add-shared.js';
import {
  buildNextProjectPackageJson,
  buildProjectPackageJsonSource,
  readProjectPackageJson,
} from './cli-init-package-json.js';
import { createRetrofitPlan, getInitPlan } from './cli-init-plan.js';
import {
  buildInitPlanNextSteps,
  hasTtscLintCompatPlanChanges,
} from './cli-init-plan-presentation.js';
import {
  buildOfficialWorkspaceLintFiles,
  buildRetrofitHelperFiles,
  findManagedLintConfigOutputConflict,
  findTtscLintConfigPath,
  hasPreviousManagedWordPressTtscLintConfig,
  hasWordPressTtscLintConfig,
  resolveRetrofitTextDomain,
} from './cli-init-templates.js';
import { getYarnPnpNodeModulesConfig } from './cli-init-yarn.js';
import {
  collectRetrofitWebpackChanges,
  type RetrofitWebpackChange,
} from './cli-init-webpack.js';
import {
  RETROFIT_APPLY_PREVIEW_NOTE,
  RETROFIT_ROLLBACK_NOTE,
  type ProjectPackageJson,
  type RetrofitInitPlan,
} from './cli-init-types.js';
import {
  collectWorkspaceScriptFilePaths,
  migrateHistoricalGeneratedExportNames,
} from '../add/cli-add-workspace-generated-exports.js';

async function createRetrofitMutationSnapshot(
	projectDir: string,
	filePaths: string[],
): Promise<WorkspaceMutationSnapshot> {
  const scriptsDir = path.join(projectDir, 'scripts');
  const scriptsDirExisted = fs.existsSync(scriptsDir);
  const fileSources = await snapshotWorkspaceFiles(filePaths);
  const targetPaths = fileSources
		.filter((entry) => entry.source === null)
		.map((entry) => entry.filePath);

  if (!scriptsDirExisted) {
    targetPaths.push(scriptsDir);
  }

  return {
    fileSources,
    snapshotDirs: [],
    targetPaths,
  };
}

async function writeRetrofitFiles(options: {
  helperFiles: Record<string, string>;
  packageJson: ProjectPackageJson;
  projectDir: string;
  removedFiles: string[];
  webpackChanges: RetrofitWebpackChange[];
  yarnPnpNodeModulesConfig: ReturnType<typeof getYarnPnpNodeModulesConfig>;
}): Promise<void> {
  const scriptsDir = path.join(options.projectDir, 'scripts');

  await fsp.mkdir(scriptsDir, { recursive: true });
  await fsp.writeFile(
    path.join(options.projectDir, 'package.json'),
    buildProjectPackageJsonSource(options.packageJson),
    'utf8',
  );

  for (const [relativePath, source] of Object.entries(options.helperFiles)) {
    await fsp.writeFile(
      path.join(options.projectDir, relativePath),
      source,
      'utf8',
    );
  }
  for (const relativePath of options.removedFiles) {
    await fsp.rm(path.join(options.projectDir, relativePath), { force: true });
  }
  for (const change of options.webpackChanges) {
    await fsp.writeFile(
      path.join(options.projectDir, change.path),
      change.source,
      'utf8',
    );
  }
  if (options.yarnPnpNodeModulesConfig) {
    await fsp.writeFile(
      options.yarnPnpNodeModulesConfig.path,
      options.yarnPnpNodeModulesConfig.source,
      'utf8',
    );
  }
}

function buildApplyFailureError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return createCliDiagnosticCodeError(
    CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
    `Unable to apply the retrofit init plan safely. The command restored the previous package.json/helper-file/package-manager snapshot. ${message}`,
    error instanceof Error ? { cause: error } : undefined,
  );
}

function toApplyNotes(previewNotes: readonly string[]): string[] {
  return Array.from(
		new Set([
			...previewNotes.filter(
				(note) =>
					note !== 'Preview only: `wp-typia init` does not write files yet.' &&
					note !== RETROFIT_APPLY_PREVIEW_NOTE,
			),
			RETROFIT_ROLLBACK_NOTE,
		]),
	);
}

function buildApplyNextSteps(
  previewPlan: RetrofitInitPlan,
): string[] {
  return buildInitPlanNextSteps({
    commandMode: 'apply',
    compatibilitySurfaceChanged: hasTtscLintCompatPlanChanges(previewPlan),
    dependencyChanges: previewPlan.packageChanges.addDevDependencies,
    hasPlannedChanges: true,
    layoutKind: previewPlan.detectedLayout.kind,
    packageManager: previewPlan.packageManager,
  });
}

/**
 * Apply the previewed retrofit init plan to disk.
 *
 * The command snapshots package.json, generated helper targets, and workspace
 * script consumers before writing, then rolls those files back automatically
 * if any write or historical-export migration fails.
 *
 * @param projectDir Project root that should receive the retrofit surface.
 * @param options Optional package-manager override used for emitted scripts and
 * follow-up guidance.
 * @returns The applied retrofit init plan describing the persisted changes.
 */
export async function applyInitPlan(
	projectDir: string,
	options: {
		packageManager?: string;
	} = {},
): Promise<RetrofitInitPlan> {
  const previewPlan = getInitPlan(projectDir, options);

  if (previewPlan.detectedLayout.kind === 'unsupported') {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      '`wp-typia init --apply` requires a supported retrofit layout. Run `wp-typia init` first to inspect the preview plan and any blocking notes.',
    );
  }

  const currentPackageJson = readProjectPackageJson(previewPlan.projectDir);
  const expectedTextDomain = resolveRetrofitTextDomain({
    blockTargets: previewPlan.blockTargets,
    packageJson: currentPackageJson,
    projectDir: previewPlan.projectDir,
  });
  const existingLintConfigPath = findTtscLintConfigPath(previewPlan.projectDir);
  const previousManagedLintConfig =
    hasPreviousManagedWordPressTtscLintConfig(
      existingLintConfigPath,
      expectedTextDomain,
    );
  const managedLintConfigOutputConflict =
    findManagedLintConfigOutputConflict(
      previewPlan.projectDir,
      existingLintConfigPath,
      previousManagedLintConfig,
    );
  if (managedLintConfigOutputConflict) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      `\`wp-typia init --apply\` preserves the existing ${path.basename(managedLintConfigOutputConflict)} because it conflicts with the destination required to migrate ${path.basename(existingLintConfigPath ?? '')}. Reconcile the two lint configs, then rerun the command.`,
    );
  }
  if (
    existingLintConfigPath &&
    !hasWordPressTtscLintConfig(existingLintConfigPath, expectedTextDomain) &&
    !previousManagedLintConfig
  ) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      '`wp-typia init --apply` preserves an existing ttsc lint config. Extend that config with @wp-typia/ttsc-lint-plugin-wp and the wordpress/i18n-text-domain rule, then rerun the command.',
    );
  }

  if (previewPlan.status === 'already-initialized') {
    return createRetrofitPlan({
      ...previewPlan,
      commandMode: 'apply',
      nextSteps: previewPlan.nextSteps,
      notes: toApplyNotes(previewPlan.notes),
      status: 'already-initialized',
    });
  }

  const nextPackageJson = buildNextProjectPackageJson({
    packageChanges: previewPlan.packageChanges,
    packageJson: currentPackageJson,
    packageManager: previewPlan.packageManager,
    projectName: previewPlan.projectName,
    removeTypiaUnplugin:
      previewPlan.detectedLayout.kind !== 'official-workspace',
  });
  const helperFiles =
    previewPlan.detectedLayout.kind === 'official-workspace' ||
    previewPlan.detectedLayout.kind === 'generated-project'
      ? buildOfficialWorkspaceLintFiles({
          projectDir: previewPlan.projectDir,
          textDomain: expectedTextDomain,
        })
      : buildRetrofitHelperFiles(previewPlan.blockTargets, {
          projectDir: previewPlan.projectDir,
          textDomain: expectedTextDomain,
        });
  const webpackChanges =
    previewPlan.detectedLayout.kind === 'official-workspace'
      ? []
      : collectRetrofitWebpackChanges(previewPlan.projectDir);
  const yarnPnpNodeModulesConfig = getYarnPnpNodeModulesConfig(
    previewPlan.projectDir,
    previewPlan.packageManager,
    previewPlan.packageChanges.packageManagerField?.requiredValue,
  );
  const removedFiles = previewPlan.plannedFiles
		.filter((file) => file.action === 'remove')
		.map((file) => file.path);
  const historicalMigrationFilePaths =
    previewPlan.detectedLayout.kind === 'official-workspace'
      ? await collectWorkspaceScriptFilePaths(previewPlan.projectDir)
      : [];
  const filePaths = [
		path.join(previewPlan.projectDir, 'package.json'),
		...Object.keys(helperFiles).map((relativePath) =>
			path.join(previewPlan.projectDir, relativePath),
		),
		...webpackChanges.map((change) =>
			path.join(previewPlan.projectDir, change.path),
		),
		...removedFiles.map((relativePath) =>
			path.join(previewPlan.projectDir, relativePath),
		),
		...(yarnPnpNodeModulesConfig ? [yarnPnpNodeModulesConfig.path] : []),
		...historicalMigrationFilePaths,
	];
  const mutationSnapshot = await createRetrofitMutationSnapshot(
    previewPlan.projectDir,
    filePaths,
  );

  try {
    await writeRetrofitFiles({
      helperFiles,
      packageJson: nextPackageJson,
      projectDir: previewPlan.projectDir,
      removedFiles,
      webpackChanges,
      yarnPnpNodeModulesConfig,
    });
    if (previewPlan.detectedLayout.kind === 'official-workspace') {
      await migrateHistoricalGeneratedExportNames(previewPlan.projectDir);
    }
  } catch (error) {
    await rollbackWorkspaceMutation(mutationSnapshot);
    throw buildApplyFailureError(error);
  }

  return createRetrofitPlan({
    ...previewPlan,
    commandMode: 'apply',
    nextSteps: buildApplyNextSteps(previewPlan),
    notes: toApplyNotes(previewPlan.notes),
    status: 'applied',
  });
}
