import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { scaffoldProject } from '../src/runtime/index.js';
import { getPackageManager } from '../src/runtime/package-managers.js';
import {
  apiClientPackageVersion,
  blockTypesPackageVersion,
  cleanupScaffoldTempRoot,
  createScaffoldTempRoot,
  normalizedBlockRuntimePackageVersion,
  restPackageVersion,
} from './helpers/scaffold-test-harness.js';

describe('@wp-typia/project-tools scaffold toolchain policy', () => {
	const tempRoot = createScaffoldTempRoot('wp-typia-scaffold-toolchain-policy-');

	afterAll(() => {
		cleanupScaffoldTempRoot(tempRoot);
	});

	test('npm scaffolds omit packageManager and Node helper version files', async () => {
		const targetDir = path.join(tempRoot, 'demo-toolchain-npm');

		await scaffoldProject({
			projectDir: targetDir,
			templateId: 'basic',
			packageManager: 'npm',
			noInstall: true,
			answers: {
				author: 'Test Runner',
				description: 'Toolchain policy npm scaffold',
				namespace: 'demo-space',
				slug: 'demo-toolchain-npm',
				title: 'Demo Toolchain Npm',
			},
		});

		const packageJson = JSON.parse(
			fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'),
		) as {
			devDependencies: Record<string, string>;
			engines?: Record<string, string>;
			packageManager?: string;
		};

		expect(packageJson.packageManager).toBeUndefined();
		expect(packageJson.engines).toBeUndefined();
		expect(fs.existsSync(path.join(targetDir, '.nvmrc'))).toBe(false);
		expect(fs.existsSync(path.join(targetDir, '.node-version'))).toBe(false);
		expect(packageJson.devDependencies['@wp-typia/block-runtime']).toBe(
			normalizedBlockRuntimePackageVersion,
		);
		expect(packageJson.devDependencies['@wp-typia/block-types']).toBe(
			blockTypesPackageVersion,
		);
		expect(packageJson.devDependencies['@wp-typia/block-runtime']).toMatch(/^\^/);
		expect(packageJson.devDependencies['@wp-typia/block-types']).toMatch(/^\^/);
	});

	test('non-npm scaffolds keep the exact packageManager selector but still use ranged wp-typia deps', async () => {
		const targetDir = path.join(tempRoot, 'demo-toolchain-bun');

		await scaffoldProject({
			projectDir: targetDir,
			templateId: 'persistence',
			packageManager: 'bun',
			noInstall: true,
			answers: {
				author: 'Test Runner',
				dataStorageMode: 'custom-table',
				description: 'Toolchain policy bun scaffold',
				namespace: 'demo-space',
				persistencePolicy: 'authenticated',
				slug: 'demo-toolchain-bun',
				title: 'Demo Toolchain Bun',
			},
		});

		const packageJson = JSON.parse(
			fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'),
		) as {
			devDependencies: Record<string, string>;
			engines?: Record<string, string>;
			packageManager?: string;
		};

		expect(packageJson.packageManager).toBe(
			getPackageManager('bun').packageManagerField,
		);
		expect(packageJson.engines).toBeUndefined();
		expect(fs.existsSync(path.join(targetDir, '.nvmrc'))).toBe(false);
		expect(fs.existsSync(path.join(targetDir, '.node-version'))).toBe(false);
		expect(packageJson.devDependencies['@wp-typia/api-client']).toBe(
			apiClientPackageVersion,
		);
		expect(packageJson.devDependencies['@wp-typia/rest']).toBe(
			restPackageVersion,
		);
		expect(packageJson.devDependencies['@wp-typia/api-client']).toMatch(/^\^/);
		expect(packageJson.devDependencies['@wp-typia/rest']).toMatch(/^\^/);
	});
});
