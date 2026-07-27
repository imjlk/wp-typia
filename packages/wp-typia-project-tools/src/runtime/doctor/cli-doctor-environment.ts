import { execFileSync } from 'node:child_process';
import {
  access,
  constants as fsConstants,
  rm,
  writeFile,
} from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  getBuiltInTemplateLayerDirs,
  isOmittableBuiltInTemplateLayerDir,
} from '../templates/template-builtins.js';
import { createDoctorCheck } from './cli-doctor-workspace-shared.js';
import {
  isBuiltInTemplateId,
  listTemplates,
} from '../templates/template-registry.js';

import type { DoctorCheck } from './cli-doctor.js';

function readCommandVersion(command: string, args: string[] = [
  '--version',
]): string | null {
  try {
    return execFileSync(command, args, {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
  } catch {
    return null;
  }
}

function compareMajorVersion(actualVersion: string, minimumMajor: number): boolean {
  const parsed = Number.parseInt(
    actualVersion.replace(/^v/, '').split('.')[0] ?? '',
    10,
  );
  return Number.isFinite(parsed) && parsed >= minimumMajor;
}

async function checkWritableDirectory(directory: string): Promise<boolean> {
  try {
    await access(directory, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function checkTempDirectory(): Promise<boolean> {
  const tempFile = path.join(os.tmpdir(), `wp-typia-${Date.now()}.tmp`);
  try {
    await writeFile(tempFile, 'ok', 'utf8');
    await rm(tempFile, { force: true });
    return true;
  } catch {
    return false;
  }
}

function getTemplateDoctorChecks(): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  for (const template of listTemplates()) {
    if (!isBuiltInTemplateId(template.id)) {
      const templateDirExists = fs.existsSync(template.templateDir);
      const hasAssets =
				templateDirExists &&
				fs.existsSync(path.join(template.templateDir, 'package.json.mustache'));
      checks.push({
        status: !templateDirExists || hasAssets ? 'pass' : 'fail',
        label: `Template ${template.id}`,
        detail: !templateDirExists
          ? 'External template metadata only; local overlay package is not installed.'
          : hasAssets
            ? template.templateDir
            : 'Missing core template assets',
      });
      continue;
    }

    const builtInTemplateId = template.id;
    const layerDirs =
			builtInTemplateId === 'persistence'
				? Array.from(
						new Set([
							...getBuiltInTemplateLayerDirs(builtInTemplateId, { persistencePolicy: 'authenticated' }),
							...getBuiltInTemplateLayerDirs(builtInTemplateId, { persistencePolicy: 'public' }),
						]),
					)
				: builtInTemplateId === 'compound'
					? Array.from(
							new Set([
								...getBuiltInTemplateLayerDirs(builtInTemplateId),
								...getBuiltInTemplateLayerDirs(builtInTemplateId, {
									persistenceEnabled: true,
									persistencePolicy: 'authenticated',
								}),
								...getBuiltInTemplateLayerDirs(builtInTemplateId, {
									persistenceEnabled: true,
									persistencePolicy: 'public',
								}),
							]),
					)
					: getBuiltInTemplateLayerDirs(builtInTemplateId);
    const missingRequiredLayer = layerDirs.some(
			(layerDir) =>
				!fs.existsSync(layerDir) &&
				!isOmittableBuiltInTemplateLayerDir(builtInTemplateId, layerDir),
		);
    const existingLayerDirs = layerDirs.filter((layerDir) =>
      fs.existsSync(layerDir),
    );
    const hasAssets =
			!missingRequiredLayer &&
			existingLayerDirs.some((layerDir) =>
        fs.existsSync(path.join(layerDir, 'package.json.mustache')),
      ) &&
			existingLayerDirs.some((layerDir) =>
        fs.existsSync(path.join(layerDir, 'src')),
      );
    checks.push({
      status: hasAssets ? 'pass' : 'fail',
      label: `Template ${template.id}`,
      detail: hasAssets
        ? existingLayerDirs.join(' + ')
        : 'Missing core template assets',
    });
  }

  return checks;
}

/**
 * Collect environment-scoped doctor checks for the current working directory.
 *
 * The returned rows cover Bun/Node/git availability, writability of the
 * current working directory and OS temp directory, and built-in or external
 * template asset integrity in display order.
 *
 * @param cwd Working directory validated for writability.
 * @returns Ordered environment check rows ready for CLI rendering.
 */
export async function getEnvironmentDoctorChecks(cwd: string): Promise<DoctorCheck[]> {
  const bunVersion = readCommandVersion('bun');
  const nodeVersion = readCommandVersion('node');
  const gitVersion = readCommandVersion('git');
  const cwdWritable = await checkWritableDirectory(cwd);
  const tempWritable = await checkTempDirectory();

  return [
    createDoctorCheck(
      'Bun',
      bunVersion && compareMajorVersion(bunVersion, 1) ? 'pass' : 'fail',
      bunVersion ? `Detected ${bunVersion}` : 'Not available',
    ),
    createDoctorCheck(
      'Node',
      nodeVersion && compareMajorVersion(nodeVersion, 24) ? 'pass' : 'fail',
      nodeVersion ? `Detected ${nodeVersion}` : 'Not available',
    ),
    createDoctorCheck(
      'git',
      gitVersion ? 'pass' : 'fail',
      gitVersion ?? 'Not available',
    ),
    createDoctorCheck(
      'Current directory',
      cwdWritable ? 'pass' : 'fail',
      cwdWritable ? 'Writable' : 'Not writable',
    ),
    createDoctorCheck(
      'Temp directory',
      tempWritable ? 'pass' : 'fail',
      tempWritable ? 'Writable' : 'Not writable',
    ),
    ...getTemplateDoctorChecks(),
  ];
}
