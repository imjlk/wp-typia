import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

import {
  applyGeneratedProjectDxPackageJson,
  applyLocalDevPresetFiles,
  getPrimaryDevelopmentScript,
} from '../../packages/wp-typia-project-tools/src/runtime/local-dev-presets';
import {
  createTempDir,
  writeJsonFile,
  writeTextFile,
} from '../helpers/file-fixtures';
import { createTestScaffoldTemplateVariables } from '../helpers/scaffold-template-variables';

function readProjectPackageJson(projectDir: string) {
  return JSON.parse(
    fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'),
  ) as {
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
}

describe('local development preset helpers', () => {
	test('copies wp-env and test preset files and appends gitignore entries idempotently', async () => {
		const projectDir = createTempDir('wp-typia-local-dev-presets-');

		writeTextFile(path.join(projectDir, '.gitignore'), 'node_modules');

		await applyLocalDevPresetFiles({
			projectDir,
			variables: createTestScaffoldTemplateVariables(),
			withTestPreset: true,
			withWpEnv: true,
		});
		await applyLocalDevPresetFiles({
			projectDir,
			variables: createTestScaffoldTemplateVariables(),
			withTestPreset: true,
			withWpEnv: true,
		});

		expect(fs.existsSync(path.join(projectDir, '.wp-env.json'))).toBe(true);
		expect(fs.existsSync(path.join(projectDir, '.wp-env.test.json'))).toBe(true);
		expect(fs.existsSync(path.join(projectDir, 'playwright.config.ts'))).toBe(true);
		expect(fs.existsSync(path.join(projectDir, 'scripts', 'wait-for-wp-env.mjs'))).toBe(true);
		expect(fs.existsSync(path.join(projectDir, 'scripts', 'wp-env-utils.cjs'))).toBe(true);
		expect(
			fs.readFileSync(
				path.join(projectDir, 'scripts', 'wait-for-wp-env.mjs'),
				'utf8',
			),
		).toContain('--title=demo-block');

		const gitignore = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf8');
		expect(gitignore).toContain('playwright-report/');
		expect(gitignore).toContain('test-results/');
		expect(gitignore.match(/playwright-report\//g)?.length ?? 0).toBe(1);
		expect(gitignore.match(/test-results\//g)?.length ?? 0).toBe(1);
	});

	test('adds watch scripts and preset dependencies for compound persistence scaffolds', async () => {
		const projectDir = createTempDir('wp-typia-local-dev-package-json-');

		writeJsonFile(path.join(projectDir, 'package.json'), {
			name: 'demo-block',
			scripts: {
				build: 'wp-scripts build',
			},
		});

		await applyGeneratedProjectDxPackageJson({
			compoundPersistenceEnabled: true,
			packageManager: 'npm',
			projectDir,
			templateId: 'compound',
			withTestPreset: true,
			withWpEnv: true,
		});

		const packageJson = readProjectPackageJson(projectDir);

		expect(packageJson.scripts?.build).toBe('wp-scripts build');
		expect(packageJson.scripts?.['start:editor']).toBe(
			'wp-scripts start --experimental-modules',
		);
		expect(packageJson.scripts?.['watch:sync-types']).toBe(
			'chokidar "src/blocks/**/types.ts" "scripts/block-config.ts" --debounce 200 -c "npm run sync-types"',
		);
		expect(packageJson.scripts?.['watch:sync-rest']).toBe(
			'chokidar "src/blocks/**/api-types.ts" "scripts/block-config.ts" --debounce 200 -c "npm run sync-rest"',
		);
		expect(packageJson.scripts?.dev).toContain('sync-types,sync-rest,editor');
		expect(packageJson.scripts?.dev).toContain('"npm run watch:sync-rest"');
		expect(packageJson.scripts?.['wp-env:start']).toBe('wp-env start');
		expect(packageJson.scripts?.['wp-env:start:test']).toBe(
			'wp-env start --config=.wp-env.test.json',
		);
		expect(packageJson.scripts?.['test:e2e']).toBe(
			'npm run wp-env:start:test && npm run wp-env:wait:test && playwright test',
		);
		expect(packageJson.devDependencies).toEqual(
			expect.objectContaining({
				'@playwright/test': '^1.54.2',
				'@wordpress/env': '^11.2.0',
				'chokidar-cli': '^3.0.0',
				concurrently: '^9.0.1',
			}),
		);
	});

	test('omits persistence-specific scripts for non-persistence scaffolds', async () => {
		const projectDir = createTempDir('wp-typia-local-dev-basic-');

		writeJsonFile(path.join(projectDir, 'package.json'), {
			name: 'demo-block',
		});

		await applyGeneratedProjectDxPackageJson({
			compoundPersistenceEnabled: false,
			packageManager: 'bun',
			projectDir,
			templateId: 'basic',
			withTestPreset: false,
			withWpEnv: false,
		});

		const packageJson = readProjectPackageJson(projectDir);

		expect(packageJson.scripts?.['watch:sync-types']).toBe(
			'chokidar "src/types.ts" --debounce 200 -c "bun run sync-types"',
		);
		expect(packageJson.scripts?.['watch:sync-rest']).toBeUndefined();
		expect(packageJson.scripts?.dev).toContain('"bun run watch:sync-types"');
		expect(packageJson.devDependencies).toEqual(
			expect.objectContaining({
				'chokidar-cli': '^3.0.0',
				concurrently: '^9.0.1',
			}),
		);
		expect(packageJson.devDependencies?.['@wordpress/env']).toBeUndefined();
		expect(packageJson.devDependencies?.['@playwright/test']).toBeUndefined();
	});

	test('returns dev for built-in templates and start for non-built-in template ids', () => {
		expect(getPrimaryDevelopmentScript('basic')).toBe('dev');
		expect(getPrimaryDevelopmentScript('interactivity')).toBe('dev');
		expect(getPrimaryDevelopmentScript('persistence')).toBe('dev');
		expect(getPrimaryDevelopmentScript('compound')).toBe('dev');
		expect(getPrimaryDevelopmentScript('github:owner/repo/template')).toBe('start');
		expect(getPrimaryDevelopmentScript('owner/repo/template')).toBe('start');
	});
});
