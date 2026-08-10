import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createTempDir,
  writeJsonFile,
  writeTextFile,
} from '../helpers/file-fixtures';

const PACKAGE_VERSIONS_SOURCE = fs.readFileSync(
  path.resolve(
    import.meta.dir,
    '../../packages/wp-typia-project-tools/src/runtime/package-versions.ts',
  ),
  'utf8',
);
const PACKAGE_VERSIONS_SHARED_SOURCE = fs.readFileSync(
  path.resolve(
    import.meta.dir,
    '../../packages/wp-typia-project-tools/src/runtime/shared/package-versions.ts',
  ),
  'utf8',
);
const FS_ASYNC_SOURCE = fs.readFileSync(
  path.resolve(
    import.meta.dir,
    '../../packages/wp-typia-project-tools/src/runtime/shared/fs-async.ts',
  ),
  'utf8',
);
const JSON_UTILS_SOURCE = fs.readFileSync(
  path.resolve(
    import.meta.dir,
    '../../packages/wp-typia-project-tools/src/runtime/shared/json-utils.ts',
  ),
  'utf8',
);

async function importPackageVersionsModule(options: {
  createPackageRoot: string;
  installedPackageManifests?: Record<string, unknown>;
}): Promise<{
  invalidatePackageVersionsCache(): void;
  getPackageVersions(): {
    apiClientPackageVersion: string;
    blockRuntimePackageVersion: string;
    blockTypesPackageVersion: string;
    projectToolsPackageVersion: string;
    restPackageVersion: string;
    ttscLintPackageVersion: string;
    ttscLintPluginWpPackageVersion: string;
    ttscLintPluginWpTtscPeerRange: string;
    ttscPackageVersion: string;
    tsxPackageVersion: string;
    typiaPackageVersion: string;
    ttscUnpluginPackageVersion: string;
    typiaUnpluginPackageVersion: string;
    typescriptPackageVersion: string;
    wpTypiaPackageExactVersion: string;
    wpTypiaPackageVersion: string;
  };
}> {
  const tempRoot = createTempDir('wp-typia-package-versions-');
  const runtimeDir = path.join(tempRoot, 'runtime');
  const runtimeSharedDir = path.join(runtimeDir, 'shared');
  const runtimeTemplatesDir = path.join(runtimeDir, 'templates');

  fs.mkdirSync(runtimeSharedDir, { recursive: true });
  fs.mkdirSync(runtimeTemplatesDir, { recursive: true });
  writeTextFile(
    path.join(runtimeDir, 'package-versions.ts'),
    PACKAGE_VERSIONS_SOURCE,
  );
  writeTextFile(
    path.join(runtimeSharedDir, 'package-versions.ts'),
    PACKAGE_VERSIONS_SHARED_SOURCE,
  );
  writeTextFile(path.join(runtimeSharedDir, 'fs-async.ts'), FS_ASYNC_SOURCE);
  writeTextFile(
    path.join(runtimeSharedDir, 'json-utils.ts'),
    JSON_UTILS_SOURCE,
  );
  writeTextFile(
    path.join(runtimeTemplatesDir, 'template-registry.js'),
    `export const PROJECT_TOOLS_PACKAGE_ROOT = ${JSON.stringify(options.createPackageRoot)};\n`,
  );

  for (const [packageName, manifest] of Object.entries(
    options.installedPackageManifests ?? {},
  )) {
    writeJsonFile(
      path.join(
        tempRoot,
        'node_modules',
        ...packageName.split('/'),
        'package.json',
      ),
      manifest,
    );
  }

  return import(
    `${pathToFileURL(path.join(runtimeDir, 'package-versions.ts')).href}?case=${Math.random()}`
  );
}

describe('package version helpers', () => {
	test('prefers the workspace create package manifest over installed package manifests', async () => {
		const createPackageRoot = createTempDir('wp-typia-create-manifest-');

		writeJsonFile(path.join(createPackageRoot, 'package.json'), {
			dependencies: {
				'@wp-typia/api-client': '~1.2.3',
				'@wp-typia/block-types': '2.3.4',
				'@wp-typia/rest': '^3.4.5',
			},
			version: '4.5.6',
		});
		writeJsonFile(path.join(createPackageRoot, '..', 'wp-typia-block-runtime', 'package.json'), {
			version: '7.8.9',
		});

		const module = await importPackageVersionsModule({
			createPackageRoot,
			installedPackageManifests: {
				'@wp-typia/api-client': { version: '9.9.9' },
				'@wp-typia/block-types': { version: '9.9.9' },
				'@wp-typia/project-tools': { version: '9.9.9' },
				'@wp-typia/rest': { version: '9.9.9' },
			},
		});

		expect(module.getPackageVersions()).toEqual({
			apiClientPackageVersion: '~1.2.3',
			blockRuntimePackageVersion: '^7.8.9',
			blockTypesPackageVersion: '^2.3.4',
			projectToolsPackageVersion: '^4.5.6',
			restPackageVersion: '^3.4.5',
			ttscLintPackageVersion: '0.26.1',
			ttscLintPluginWpPackageVersion: '^0.2.0',
			ttscLintPluginWpTtscPeerRange: '>=0.23.0 <0.27.0',
			ttscPackageVersion: '^0.26.1',
			tsxPackageVersion: '^0.26.1',
			typiaPackageVersion: '^13.2.0',
			ttscUnpluginPackageVersion: '^0.26.1',
			typiaUnpluginPackageVersion: '^0.26.1',
			typescriptPackageVersion: '^7.0.2',
			wpTypiaPackageExactVersion: '0.0.0',
			wpTypiaPackageVersion: '^0.0.0',
		});
	});

	test('falls back to the sibling block-runtime manifest when the source dependency uses workspace protocol', async () => {
		const createPackageRoot = createTempDir('wp-typia-workspace-protocol-root-');

		writeJsonFile(path.join(createPackageRoot, 'package.json'), {
			dependencies: {
				'@wp-typia/api-client': '~1.2.3',
				'@wp-typia/block-runtime': 'workspace:*',
				'@wp-typia/block-types': '2.3.4',
				'@wp-typia/rest': '^3.4.5',
			},
			version: '4.5.6',
		});
		writeJsonFile(path.join(createPackageRoot, '..', 'wp-typia-block-runtime', 'package.json'), {
			version: '7.8.9',
		});

		const module = await importPackageVersionsModule({
			createPackageRoot,
		});

		expect(module.getPackageVersions()).toEqual({
			apiClientPackageVersion: '~1.2.3',
			blockRuntimePackageVersion: '^7.8.9',
			blockTypesPackageVersion: '^2.3.4',
			projectToolsPackageVersion: '^4.5.6',
			restPackageVersion: '^3.4.5',
			ttscLintPackageVersion: '0.26.1',
			ttscLintPluginWpPackageVersion: '^0.2.0',
			ttscLintPluginWpTtscPeerRange: '>=0.23.0 <0.27.0',
			ttscPackageVersion: '^0.26.1',
			tsxPackageVersion: '^0.26.1',
			typiaPackageVersion: '^13.2.0',
			ttscUnpluginPackageVersion: '^0.26.1',
			typiaUnpluginPackageVersion: '^0.26.1',
			typescriptPackageVersion: '^7.0.2',
			wpTypiaPackageExactVersion: '0.0.0',
			wpTypiaPackageVersion: '^0.0.0',
		});
	});

	test('keeps the exact ttsc lint fallback when the monorepo uses workspace protocol', async () => {
		const monorepoRoot = createTempDir('wp-typia-workspace-lint-root-');
		const createPackageRoot = path.join(
			monorepoRoot,
			'packages',
			'wp-typia-project-tools',
		);

		writeJsonFile(path.join(monorepoRoot, 'package.json'), {
			devDependencies: {
				'@ttsc/lint': 'workspace:*',
			},
		});
		writeJsonFile(path.join(createPackageRoot, 'package.json'), {
			version: '4.5.6',
		});

		const module = await importPackageVersionsModule({
			createPackageRoot,
		});

		expect(module.getPackageVersions().ttscLintPackageVersion).toBe(
			'0.26.1',
		);
	});

	test('falls back to installed runtime manifests while keeping the managed lint contributor canonical', async () => {
		const createPackageRoot = path.join(
			createTempDir('wp-typia-missing-create-root-'),
			'missing-create-root',
		);
		const module = await importPackageVersionsModule({
			createPackageRoot,
			installedPackageManifests: {
				'@wp-typia/api-client': { version: '0.2.0' },
				'@wp-typia/block-types': { version: '0.3.0' },
				'@wp-typia/project-tools': {
					dependencies: {
						'@wp-typia/api-client': '0.2.0',
						'@wp-typia/block-types': '0.3.0',
						'@wp-typia/rest': '~0.4.0',
					},
					version: '0.8.0',
				},
				'@wp-typia/block-runtime': { version: '0.9.0' },
				'@wp-typia/rest': { version: '0.4.0' },
				'@wp-typia/ttsc-lint-plugin-wp': {
					peerDependencies: { ttsc: '>=0.23.0 <0.24.0' },
					version: '0.2.0',
				},
				'wp-typia': { version: '0.8.0' },
			},
		});

		expect(module.getPackageVersions()).toEqual({
			apiClientPackageVersion: '^0.2.0',
			blockRuntimePackageVersion: '^0.9.0',
			blockTypesPackageVersion: '^0.3.0',
			projectToolsPackageVersion: '^0.8.0',
			restPackageVersion: '~0.4.0',
			ttscLintPackageVersion: '0.26.1',
			ttscLintPluginWpPackageVersion: '^0.2.0',
			ttscLintPluginWpTtscPeerRange: '>=0.23.0 <0.27.0',
			ttscPackageVersion: '^0.26.1',
			tsxPackageVersion: '^0.26.1',
			typiaPackageVersion: '^13.2.0',
			ttscUnpluginPackageVersion: '^0.26.1',
			typiaUnpluginPackageVersion: '^0.26.1',
			typescriptPackageVersion: '^7.0.2',
			wpTypiaPackageExactVersion: '0.8.0',
			wpTypiaPackageVersion: '^0.8.0',
		});
	});

	test('keeps the TS7 toolchain baseline when an older generated project is installed', async () => {
		const createPackageRoot = path.join(
			createTempDir('wp-typia-legacy-toolchain-root-'),
			'missing-create-root',
		);
		const module = await importPackageVersionsModule({
			createPackageRoot,
			installedPackageManifests: {
				'@ttsc/lint': { version: '0.22.0' },
				'@ttsc/unplugin': { version: '0.22.0' },
				ttsc: { version: '0.22.0' },
				typescript: { version: '6.0.2' },
				typia: { version: '12.2.0' },
			},
		});

		const versions = module.getPackageVersions();
		expect(versions.ttscLintPackageVersion).toBe('0.26.1');
		expect(versions.ttscPackageVersion).toBe('^0.26.1');
		expect(versions.ttscUnpluginPackageVersion).toBe('^0.26.1');
		expect(versions.typescriptPackageVersion).toBe('^7.0.2');
		expect(versions.typiaPackageVersion).toBe('^13.2.0');
	});

	test('prefers the installed wp-typia manifest when it differs from the create package version', async () => {
		const createPackageRoot = path.join(
			createTempDir('wp-typia-installed-cli-root-'),
			'missing-create-root',
		);
		const module = await importPackageVersionsModule({
			createPackageRoot,
			installedPackageManifests: {
				'@wp-typia/project-tools': {
					dependencies: {
						'@wp-typia/api-client': '0.4.0',
						'@wp-typia/block-runtime': '0.3.0',
						'@wp-typia/block-types': '0.2.0',
						'@wp-typia/rest': '0.3.1',
					},
					version: '1.0.0',
				},
				'wp-typia': { version: '0.12.0' },
			},
		});

		expect(module.getPackageVersions().wpTypiaPackageVersion).toBe('^0.12.0');
		expect(module.getPackageVersions().wpTypiaPackageExactVersion).toBe('0.12.0');
		expect(module.getPackageVersions().projectToolsPackageVersion).toBe('^1.0.0');
	});

	test('leaves wp-typia unresolved when only the packaged create manifest is available', async () => {
		const createPackageRoot = createTempDir('wp-typia-packaged-create-root-');

		writeJsonFile(path.join(createPackageRoot, 'package.json'), {
			dependencies: {
				'@wp-typia/api-client': '^0.4.0',
				'@wp-typia/block-runtime': '^0.3.0',
				'@wp-typia/block-types': '^0.2.0',
				'@wp-typia/rest': '^0.3.1',
			},
			version: '0.11.0',
		});

		const module = await importPackageVersionsModule({
			createPackageRoot,
		});

		expect(module.getPackageVersions()).toEqual({
			apiClientPackageVersion: '^0.4.0',
			blockRuntimePackageVersion: '^0.3.0',
			blockTypesPackageVersion: '^0.2.0',
			projectToolsPackageVersion: '^0.11.0',
			restPackageVersion: '^0.3.1',
			ttscLintPackageVersion: '0.26.1',
			ttscLintPluginWpPackageVersion: '^0.2.0',
			ttscLintPluginWpTtscPeerRange: '>=0.23.0 <0.27.0',
			ttscPackageVersion: '^0.26.1',
			tsxPackageVersion: '^0.26.1',
			typiaPackageVersion: '^13.2.0',
			ttscUnpluginPackageVersion: '^0.26.1',
			typiaUnpluginPackageVersion: '^0.26.1',
			typescriptPackageVersion: '^7.0.2',
			wpTypiaPackageExactVersion: '0.0.0',
			wpTypiaPackageVersion: '^0.0.0',
		});
	});

	test('keeps canonical toolchain defaults while caching missing package metadata', async () => {
		const createPackageRoot = path.join(
			createTempDir('wp-typia-empty-create-root-'),
			'empty-create-root',
		);
		const module = await importPackageVersionsModule({
			createPackageRoot,
		});

		const firstResult = module.getPackageVersions();
		const secondResult = module.getPackageVersions();

		expect(firstResult).toEqual({
			apiClientPackageVersion: '^0.0.0',
			blockRuntimePackageVersion: '^0.0.0',
			blockTypesPackageVersion: '^0.0.0',
			projectToolsPackageVersion: '^0.0.0',
			restPackageVersion: '^0.0.0',
			ttscLintPackageVersion: '0.26.1',
			ttscLintPluginWpPackageVersion: '^0.2.0',
			ttscLintPluginWpTtscPeerRange: '>=0.23.0 <0.27.0',
			ttscPackageVersion: '^0.26.1',
			tsxPackageVersion: '^0.26.1',
			typiaPackageVersion: '^13.2.0',
			ttscUnpluginPackageVersion: '^0.26.1',
			typiaUnpluginPackageVersion: '^0.26.1',
			typescriptPackageVersion: '^7.0.2',
			wpTypiaPackageExactVersion: '0.0.0',
			wpTypiaPackageVersion: '^0.0.0',
		});
		expect(secondResult).toBe(firstResult);
	});

	test('recomputes cached versions when the workspace manifest changes', async () => {
		const createPackageRoot = createTempDir('wp-typia-refreshable-create-root-');

		writeJsonFile(path.join(createPackageRoot, 'package.json'), {
			dependencies: {
				'@wp-typia/api-client': '~1.2.3',
				'@wp-typia/block-types': '2.3.4',
				'@wp-typia/rest': '^3.4.5',
			},
			version: '4.5.6',
		});
		writeJsonFile(path.join(createPackageRoot, '..', 'wp-typia-block-runtime', 'package.json'), {
			version: '7.8.9',
		});

		const module = await importPackageVersionsModule({
			createPackageRoot,
		});

		const firstResult = module.getPackageVersions();
		writeJsonFile(path.join(createPackageRoot, 'package.json'), {
			dependencies: {
				'@wp-typia/api-client': '^12.34.56',
				'@wp-typia/block-types': '2.3.4',
				'@wp-typia/rest': '^30.40.50',
			},
			version: '11.22.33',
		});

		const secondResult = module.getPackageVersions();

		expect(firstResult).not.toBe(secondResult);
		expect(secondResult).toEqual({
			apiClientPackageVersion: '^12.34.56',
			blockRuntimePackageVersion: '^7.8.9',
			blockTypesPackageVersion: '^2.3.4',
			projectToolsPackageVersion: '^11.22.33',
			restPackageVersion: '^30.40.50',
			ttscLintPackageVersion: '0.26.1',
			ttscLintPluginWpPackageVersion: '^0.2.0',
			ttscLintPluginWpTtscPeerRange: '>=0.23.0 <0.27.0',
			ttscPackageVersion: '^0.26.1',
			tsxPackageVersion: '^0.26.1',
			typiaPackageVersion: '^13.2.0',
			ttscUnpluginPackageVersion: '^0.26.1',
			typiaUnpluginPackageVersion: '^0.26.1',
			typescriptPackageVersion: '^7.0.2',
			wpTypiaPackageExactVersion: '0.0.0',
			wpTypiaPackageVersion: '^0.0.0',
		});
	});

	test('manual invalidation drops the cached object identity even when manifests stay the same', async () => {
		const createPackageRoot = createTempDir('wp-typia-manual-cache-reset-');

		writeJsonFile(path.join(createPackageRoot, 'package.json'), {
			dependencies: {
				'@wp-typia/api-client': '^0.4.0',
				'@wp-typia/block-runtime': '^0.3.0',
				'@wp-typia/block-types': '^0.2.0',
				'@wp-typia/rest': '^0.3.1',
			},
			version: '0.11.0',
		});

		const module = await importPackageVersionsModule({
			createPackageRoot,
		});

		const firstResult = module.getPackageVersions();
		module.invalidatePackageVersionsCache();
		const secondResult = module.getPackageVersions();

		expect(secondResult).toEqual(firstResult);
		expect(secondResult).not.toBe(firstResult);
	});
});
