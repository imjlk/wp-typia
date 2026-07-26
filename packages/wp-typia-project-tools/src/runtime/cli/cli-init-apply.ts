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
import { buildRetrofitHelperFiles } from './cli-init-templates.js';
import {
  collectRetrofitWebpackChanges,
  type RetrofitWebpackChange,
} from './cli-init-webpack.js';
import {
  RETROFIT_APPLY_PREVIEW_NOTE,
  RETROFIT_ROLLBACK_NOTE,
  type ProjectPackageJson,
  type RetrofitInitBlockTarget,
  type RetrofitInitPlan,
} from './cli-init-types.js';

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
  blockTargets: RetrofitInitBlockTarget[];
  packageJson: ProjectPackageJson;
  projectDir: string;
  webpackChanges: RetrofitWebpackChange[];
}): Promise<void> {
  const helperFiles = buildRetrofitHelperFiles(options.blockTargets);
  const scriptsDir = path.join(options.projectDir, 'scripts');

  await fsp.mkdir(scriptsDir, { recursive: true });
  await fsp.writeFile(
    path.join(options.projectDir, 'package.json'),
    buildProjectPackageJsonSource(options.packageJson),
    'utf8',
  );

  for (const [relativePath, source] of Object.entries(helperFiles)) {
    await fsp.writeFile(
      path.join(options.projectDir, relativePath),
      source,
      'utf8',
    );
  }
  for (const change of options.webpackChanges) {
    await fsp.writeFile(
      path.join(options.projectDir, change.path),
      change.source,
      'utf8',
    );
  }
}

function buildApplyFailureError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return createCliDiagnosticCodeError(
    CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
    `Unable to apply the retrofit init plan safely. The command restored the previous package.json/helper-file snapshot. ${message}`,
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

/**
 * Apply the previewed retrofit init plan to disk.
 *
 * The command snapshots package.json and generated helper targets before
 * writing, then rolls those files back automatically if any write fails.
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

  if (previewPlan.status === 'already-initialized') {
    return createRetrofitPlan({
      ...previewPlan,
      commandMode: 'apply',
      notes: toApplyNotes(previewPlan.notes),
      status: 'already-initialized',
    });
  }

  const nextPackageJson = buildNextProjectPackageJson({
    packageChanges: previewPlan.packageChanges,
    packageJson: readProjectPackageJson(previewPlan.projectDir),
    packageManager: previewPlan.packageManager,
    projectName: previewPlan.projectName,
  });
  const helperFiles = buildRetrofitHelperFiles(previewPlan.blockTargets);
  const webpackChanges = collectRetrofitWebpackChanges(previewPlan.projectDir);
  const filePaths = [
		path.join(previewPlan.projectDir, 'package.json'),
		...Object.keys(helperFiles).map((relativePath) =>
			path.join(previewPlan.projectDir, relativePath),
		),
		...webpackChanges.map((change) =>
			path.join(previewPlan.projectDir, change.path),
		),
	];
  const mutationSnapshot = await createRetrofitMutationSnapshot(
    previewPlan.projectDir,
    filePaths,
  );

  try {
    await writeRetrofitFiles({
      blockTargets: previewPlan.blockTargets,
      packageJson: nextPackageJson,
      projectDir: previewPlan.projectDir,
      webpackChanges,
    });
  } catch (error) {
    await rollbackWorkspaceMutation(mutationSnapshot);
    throw buildApplyFailureError(error);
  }

  return createRetrofitPlan({
    ...previewPlan,
    commandMode: 'apply',
    notes: toApplyNotes(previewPlan.notes),
    status: 'applied',
  });
}
