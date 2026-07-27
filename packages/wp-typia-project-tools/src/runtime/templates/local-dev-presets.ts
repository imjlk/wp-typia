/**
 * Helpers for the generated-project local development experience.
 *
 * These utilities apply optional preset files and watch-oriented package
 * scripts after a scaffold has been rendered.
 */
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

import {
  formatRunScript,
  type PackageManagerId,
} from '../shared/package-managers.js';
import { DEFAULT_WORDPRESS_ENV_VERSION } from '../shared/package-versions.js';
import { readJsonFile } from '../shared/json-utils.js';
import {
  OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE,
  SHARED_TEST_PRESET_TEMPLATE_ROOT,
  SHARED_WP_ENV_PRESET_TEMPLATE_ROOT,
} from './template-registry.js';
import { copyInterpolatedDirectory } from './template-render.js';
import type { ScaffoldTemplateVariables } from './scaffold.js';

interface PackageJsonShape {
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

interface LocalDevPresetOptions {
  compoundPersistenceEnabled?: boolean;
  packageManager: PackageManagerId;
  projectDir: string;
  templateId: string;
  variables: ScaffoldTemplateVariables;
  withTestPreset?: boolean;
  withWpEnv?: boolean;
}

function templateHasPersistenceSync(
	templateId: string,
	compoundPersistenceEnabled: boolean,
): boolean {
  return templateId === 'persistence' || (templateId === 'compound' && compoundPersistenceEnabled);
}

function templateSupportsGeneratedSyncWatchers(templateId: string): boolean {
  return (
		templateId === 'basic' ||
		templateId === 'interactivity' ||
		templateId === 'persistence' ||
		templateId === 'compound'
	);
}

function templateUsesDevAsPrimaryEntrypoint(templateId: string): boolean {
  return (
		templateSupportsGeneratedSyncWatchers(templateId) ||
		templateId === 'query-loop' ||
		templateId === OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE
	);
}

function getWatchSyncTypesScript(
	packageManager: PackageManagerId,
	templateId: string,
): string {
  if (templateId === 'compound') {
    return `chokidar "src/blocks/**/types.ts" "scripts/block-config.ts" --debounce 200 -c "${formatRunScript(packageManager, 'sync-types')}"`;
  }

  return `chokidar "src/types.ts" --debounce 200 -c "${formatRunScript(packageManager, 'sync-types')}"`;
}

function getWatchSyncRestScript(
	packageManager: PackageManagerId,
	templateId: string,
): string {
  if (templateId === 'compound') {
    return `chokidar "src/blocks/**/api-types.ts" "scripts/block-config.ts" --debounce 200 -c "${formatRunScript(packageManager, 'sync-rest')}"`;
  }

  return `chokidar "src/api-types.ts" --debounce 200 -c "${formatRunScript(packageManager, 'sync-rest')}"`;
}

function getDevScript(
	packageManager: PackageManagerId,
	compoundPersistenceEnabled: boolean,
	templateId: string,
): string {
  const syncProcesses = [
    `"${formatRunScript(packageManager, 'watch:sync-types')}"`,
  ];
  const names = ['sync-types'];
  const colors = ['yellow'];

  if (templateHasPersistenceSync(templateId, compoundPersistenceEnabled)) {
    syncProcesses.push(
      `"${formatRunScript(packageManager, 'watch:sync-rest')}"`,
    );
    names.push('sync-rest');
    colors.push('magenta');
  }

  syncProcesses.push(`"${formatRunScript(packageManager, 'start:editor')}"`);
  names.push('editor');
  colors.push('blue');

  return `${formatRunScript(packageManager, 'sync')} && concurrently -k -n ${names.join(',')} -c ${colors.join(',')} ${syncProcesses.join(' ')}`;
}

async function mutatePackageJson(
	projectDir: string,
	mutate: (packageJson: PackageJsonShape) => void,
): Promise<void> {
  const packageJsonPath = path.join(projectDir, 'package.json');
  const packageJson = await readJsonFile<PackageJsonShape>(packageJsonPath, {
    context: 'local dev package manifest',
  });

  mutate(packageJson);

  await fsp.writeFile(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, '\t')}\n`,
    'utf8',
  );
}

async function appendGitignoreLines(projectDir: string, lines: string[]): Promise<void> {
  if (lines.length === 0) {
    return;
  }

  const gitignorePath = path.join(projectDir, '.gitignore');
  const current = fs.existsSync(gitignorePath)
    ? await fsp.readFile(gitignorePath, 'utf8')
    : '';
  const missingLines = lines.filter(
    (line) => !current.includes(`${line}\n`) && !current.endsWith(line),
  );

  if (missingLines.length === 0) {
    return;
  }

  const suffix = current.endsWith('\n') ? '' : '\n';
  await fsp.writeFile(
    gitignorePath,
    `${current}${suffix}${missingLines.join('\n')}\n`,
    'utf8',
  );
}

/**
 * Copies opt-in local development preset files into a generated project.
 */
export async function applyLocalDevPresetFiles({
	projectDir,
	variables,
	withTestPreset = false,
	withWpEnv = false,
}: Pick<LocalDevPresetOptions, 'projectDir' | 'variables' | 'withTestPreset' | 'withWpEnv'>): Promise<void> {
  if (withWpEnv) {
    await copyInterpolatedDirectory(
      SHARED_WP_ENV_PRESET_TEMPLATE_ROOT,
      projectDir,
      variables,
    );
  }

  if (withTestPreset) {
    await copyInterpolatedDirectory(
      SHARED_TEST_PRESET_TEMPLATE_ROOT,
      projectDir,
      variables,
    );
    await appendGitignoreLines(projectDir, [
      'playwright-report/',
      'test-results/',
    ]);
  }
}

/**
 * Adds generated-project watch scripts and preset-specific dependencies to
 * `package.json`.
 */
export async function applyGeneratedProjectDxPackageJson({
	compoundPersistenceEnabled = false,
	packageManager,
	projectDir,
	templateId,
	withTestPreset = false,
	withWpEnv = false,
}: Omit<LocalDevPresetOptions, 'variables'>): Promise<void> {
  const hasPersistenceSync = templateHasPersistenceSync(
    templateId,
    compoundPersistenceEnabled,
  );
  const supportsGeneratedSyncWatchers = templateSupportsGeneratedSyncWatchers(
    templateId,
  );

  await mutatePackageJson(projectDir, (packageJson) => {
		packageJson.devDependencies = {
			...(packageJson.devDependencies ?? {}),
			...(supportsGeneratedSyncWatchers
				? {
						'chokidar-cli': '^3.0.0',
						concurrently: '^9.0.1',
				  }
				: {}),
		};

		if (withWpEnv || withTestPreset) {
			packageJson.devDependencies['@wordpress/env'] = DEFAULT_WORDPRESS_ENV_VERSION;
		}

		if (withTestPreset) {
			packageJson.devDependencies['@playwright/test'] = '^1.54.2';
		}

		const scripts = {
			...(packageJson.scripts ?? {}),
		};
		if (supportsGeneratedSyncWatchers) {
			scripts['start:editor'] = 'wp-scripts start --experimental-modules';
			scripts['watch:sync-types'] = getWatchSyncTypesScript(
				packageManager,
				templateId,
			);
		}

		if (hasPersistenceSync) {
			scripts['watch:sync-rest'] = getWatchSyncRestScript(packageManager, templateId);
		}

		if (supportsGeneratedSyncWatchers) {
			scripts.dev = getDevScript(packageManager, compoundPersistenceEnabled, templateId);
		}

		if (withWpEnv) {
			scripts['wp-env:start'] = 'wp-env start';
			scripts['wp-env:stop'] = 'wp-env stop';
			scripts['wp-env:reset'] = 'wp-env destroy all && wp-env start';
		}

		if (withTestPreset) {
			scripts['wp-env:start:test'] = 'wp-env start --config=.wp-env.test.json';
			scripts['wp-env:stop:test'] = 'wp-env stop --config=.wp-env.test.json';
			scripts['wp-env:reset:test'] =
				'wp-env destroy all --config=.wp-env.test.json && wp-env start --config=.wp-env.test.json';
			scripts['wp-env:wait:test'] =
				'node scripts/wait-for-wp-env.mjs http://localhost:8889 180000 .wp-env.test.json';
			scripts['test:e2e'] = `${formatRunScript(packageManager, 'wp-env:start:test')} && ${formatRunScript(packageManager, 'wp-env:wait:test')} && playwright test`;
		}

		packageJson.scripts = scripts;
	});
}

/**
 * Returns the recommended first-run development command for the given
 * scaffolded template.
 */
export function getPrimaryDevelopmentScript(
	templateId: string,
): 'dev' | 'start' {
  return templateUsesDevAsPrimaryEntrypoint(templateId) ? 'dev' : 'start';
}
