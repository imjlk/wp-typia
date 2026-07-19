import { afterAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  cleanupScaffoldTempRoot,
  createScaffoldTempRoot,
} from './helpers/scaffold-test-harness.js';

function writeProjectToolsManifest(
  projectToolsRoot: string,
  options: {
    apiClientVersion: string;
    projectToolsVersion: string;
  },
): void {
  fs.writeFileSync(
    path.join(projectToolsRoot, 'package.json'),
    `${JSON.stringify(
      {
        dependencies: {
          '@wp-typia/api-client': options.apiClientVersion,
        },
        name: '@wp-typia/project-tools',
        version: options.projectToolsVersion,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

describe('package version cache invalidation', () => {
  const tempRoot = createScaffoldTempRoot('wp-typia-package-versions-');

  afterAll(() => {
    cleanupScaffoldTempRoot(tempRoot);
  });

  test('refreshes linked package metadata and exposes explicit cache clearing', () => {
    const linkedProjectToolsRoot = fs.mkdtempSync(
      path.join(tempRoot, 'linked-project-tools-'),
    );
    writeProjectToolsManifest(linkedProjectToolsRoot, {
      apiClientVersion: '^0.4.0',
      projectToolsVersion: '1.2.3',
    });

    const packageVersionsModuleUrl = pathToFileURL(
      path.join(import.meta.dir, '..', 'src', 'runtime', 'package-versions.ts'),
    ).href;
    const script = `
			import assert from "node:assert/strict";
			import fs from "node:fs";
			import path from "node:path";
			import {
				clearPackageVersionsCache,
				getPackageVersions,
				invalidatePackageVersionsCache,
			} from ${JSON.stringify(packageVersionsModuleUrl)};

			const projectToolsRoot = ${JSON.stringify(linkedProjectToolsRoot)};
			const first = getPackageVersions();
			const second = getPackageVersions();
			assert.equal(first, second);
			assert.equal(first.projectToolsPackageVersion, "^1.2.3");
			assert.equal(first.apiClientPackageVersion, "^0.4.0");

			fs.writeFileSync(
				path.join(projectToolsRoot, "package.json"),
				JSON.stringify(
					{
						dependencies: {
							"@wp-typia/api-client": "0.5.0"
						},
						name: "@wp-typia/project-tools",
						version: "1.2.4"
					},
					null,
					2
				) + "\\n",
				"utf8"
			);

			const refreshedByFingerprint = getPackageVersions();
			assert.notEqual(refreshedByFingerprint, first);
			assert.equal(refreshedByFingerprint.projectToolsPackageVersion, "^1.2.4");
			assert.equal(refreshedByFingerprint.apiClientPackageVersion, "^0.5.0");

			clearPackageVersionsCache();
			const refreshedByClear = getPackageVersions();
			assert.notEqual(refreshedByClear, refreshedByFingerprint);
			assert.equal(refreshedByClear.projectToolsPackageVersion, "^1.2.4");

			invalidatePackageVersionsCache();
			const refreshedByAlias = getPackageVersions();
			assert.notEqual(refreshedByAlias, refreshedByClear);
			assert.equal(refreshedByAlias.projectToolsPackageVersion, "^1.2.4");
		`;

    // The inline script imports TypeScript source, so keep the child process on Bun
    // even if this test is ever launched through a Node-based wrapper.
    const bunBinary =
      process.env.BUN_BINARY ??
      ('Bun' in globalThis ? process.execPath : 'bun');
    const result = spawnSync(bunBinary, ['--eval', script], {
      cwd: linkedProjectToolsRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WP_TYPIA_PROJECT_TOOLS_PACKAGE_ROOT: linkedProjectToolsRoot,
      },
    });

    if (result.status !== 0) {
      throw new Error(
        `package-versions cache script failed (status=${result.status}, error=${
          result.error?.message ?? 'none'
        }):\n${result.stderr}`,
      );
    }
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  test('reads package manifest metadata and contents through one file descriptor', () => {
    const packageVersionsSource = fs.readFileSync(
      path.join(
        import.meta.dir,
        '..',
        'src',
        'runtime',
        'shared',
        'package-versions.ts',
      ),
      'utf8',
    );

    expect(packageVersionsSource).toContain(
      "const fileDescriptor = fs.openSync(packageJsonPath, 'r')",
    );
    expect(packageVersionsSource).toContain('fs.fstatSync(fileDescriptor)');
    expect(packageVersionsSource).toContain(
      "fs.readFileSync(fileDescriptor, 'utf8')",
    );
    expect(packageVersionsSource).toContain('fs.closeSync(fileDescriptor)');
    expect(packageVersionsSource).not.toContain('fs.statSync(packageJsonPath)');
    expect(packageVersionsSource).not.toContain(
      "fs.readFileSync(packageJsonPath, 'utf8')",
    );
  });

  test('reports malformed package manifests with path-aware context', () => {
    const linkedProjectToolsRoot = fs.mkdtempSync(
      path.join(tempRoot, 'malformed-project-tools-'),
    );
    const packageJsonPath = path.join(linkedProjectToolsRoot, 'package.json');
    writeProjectToolsManifest(linkedProjectToolsRoot, {
      apiClientVersion: '^0.4.0',
      projectToolsVersion: '1.2.3',
    });

    const packageVersionsModuleUrl = pathToFileURL(
      path.join(import.meta.dir, '..', 'src', 'runtime', 'package-versions.ts'),
    ).href;
    const script = `
			import assert from "node:assert/strict";
			import fs from "node:fs";
			import { getPackageVersions } from ${JSON.stringify(packageVersionsModuleUrl)};

			const packageJsonPath = ${JSON.stringify(packageJsonPath)};
			fs.writeFileSync(packageJsonPath, "{", "utf8");

			assert.throws(
				() => getPackageVersions(),
				(error) => {
					assert(error instanceof Error);
					assert.match(error.message, /Failed to parse package version manifest at /);
					assert.ok(error.message.includes(packageJsonPath));
					return true;
				}
			);
		`;

    const bunBinary =
      process.env.BUN_BINARY ??
      ('Bun' in globalThis ? process.execPath : 'bun');
    const result = spawnSync(bunBinary, ['--eval', script], {
      cwd: linkedProjectToolsRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WP_TYPIA_PROJECT_TOOLS_PACKAGE_ROOT: linkedProjectToolsRoot,
      },
    });

    if (result.status !== 0) {
      throw new Error(
        `malformed package-versions script failed (status=${
          result.status
        }, error=${result.error?.message ?? 'none'}):\n${result.stderr}`,
      );
    }
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  test('centralizes managed workspace dependency fallback ranges', async () => {
    const packageVersionsModuleUrl = pathToFileURL(
      path.join(import.meta.dir, '..', 'src', 'runtime', 'package-versions.ts'),
    ).href;
    const {
      DEFAULT_WORDPRESS_ABILITIES_VERSION,
      DEFAULT_WORDPRESS_BLOCKS_VERSION,
      DEFAULT_WORDPRESS_CORE_ABILITIES_VERSION,
      DEFAULT_WORDPRESS_CORE_DATA_VERSION,
      DEFAULT_WORDPRESS_DATA_VERSION,
      DEFAULT_WORDPRESS_DATAVIEWS_VERSION,
      DEFAULT_WORDPRESS_ENV_VERSION,
      DEFAULT_WP_TYPIA_DATAVIEWS_VERSION,
    } = await import(packageVersionsModuleUrl);

    const abilityRuntimeSource = fs.readFileSync(
      path.join(
        import.meta.dir,
        '..',
        'src',
        'runtime',
        'add',
        'cli-add-workspace-ability.ts',
      ),
      'utf8',
    );
    const abilityScaffoldSource = fs.readFileSync(
      path.join(
        import.meta.dir,
        '..',
        'src',
        'runtime',
        'add',
        'cli-add-workspace-ability-scaffold.ts',
      ),
      'utf8',
    );
    const abilityAnchorsSource = fs.readFileSync(
      path.join(
        import.meta.dir,
        '..',
        'src',
        'runtime',
        'add',
        'cli-add-workspace-ability-anchors.ts',
      ),
      'utf8',
    );
    const adminViewRuntimeSource = fs.readFileSync(
      path.join(
        import.meta.dir,
        '..',
        'src',
        'runtime',
        'add',
        'cli-add-workspace-admin-view.ts',
      ),
      'utf8',
    );
    const adminViewScaffoldSource = fs.readFileSync(
      path.join(
        import.meta.dir,
        '..',
        'src',
        'runtime',
        'add',
        'cli-add-workspace-admin-view-scaffold.ts',
      ),
      'utf8',
    );
    const integrationEnvRuntimeSource = fs.readFileSync(
      path.join(
        import.meta.dir,
        '..',
        'src',
        'runtime',
        'add',
        'cli-add-workspace-integration-env.ts',
      ),
      'utf8',
    );
    const integrationEnvPackageJsonSource = fs.readFileSync(
      path.join(
        import.meta.dir,
        '..',
        'src',
        'runtime',
        'add',
        'cli-add-workspace-integration-env-package-json.ts',
      ),
      'utf8',
    );
    const localDevPresetsSource = fs.readFileSync(
      path.join(
        import.meta.dir,
        '..',
        'src',
        'runtime',
        'templates',
        'local-dev-presets.ts',
      ),
      'utf8',
    );
    const dataViewsPackageJson = JSON.parse(
      fs.readFileSync(
        path.join(
          import.meta.dir,
          '..',
          '..',
          'wp-typia-dataviews',
          'package.json',
        ),
        'utf8',
      ),
    ) as { version?: string };
    expect(typeof dataViewsPackageJson.version).toBe('string');
    if (typeof dataViewsPackageJson.version !== 'string') {
      throw new Error(
        'packages/wp-typia-dataviews/package.json is missing a string "version".',
      );
    }

    expect(DEFAULT_WORDPRESS_ABILITIES_VERSION).toBe('^0.10.0');
    expect(DEFAULT_WORDPRESS_BLOCKS_VERSION).toBe('~15.19.0');
    expect(DEFAULT_WORDPRESS_CORE_ABILITIES_VERSION).toBe('^0.9.0');
    expect(DEFAULT_WORDPRESS_CORE_DATA_VERSION).toBe('~7.46.0');
    expect(DEFAULT_WORDPRESS_DATA_VERSION).toBe('~10.46.0');
    expect(DEFAULT_WORDPRESS_DATAVIEWS_VERSION).toBe('~14.3.0');
    expect(DEFAULT_WORDPRESS_ENV_VERSION).toBe('^11.2.0');
    expect(DEFAULT_WP_TYPIA_DATAVIEWS_VERSION).toBe(
      `^${dataViewsPackageJson.version}`,
    );
    expect(abilityScaffoldSource).not.toContain(
      'const WP_ABILITIES_PACKAGE_VERSION',
    );
    expect(abilityScaffoldSource).not.toContain(
      'const WP_CORE_ABILITIES_PACKAGE_VERSION',
    );
    expect(adminViewScaffoldSource).not.toContain(
      'const DEFAULT_WP_TYPIA_DATAVIEWS_VERSION',
    );
    expect(adminViewScaffoldSource).not.toContain(
      'const DEFAULT_WORDPRESS_DATAVIEWS_VERSION',
    );
    expect(adminViewScaffoldSource).not.toContain(
      'const DEFAULT_WORDPRESS_CORE_DATA_VERSION',
    );
    expect(adminViewScaffoldSource).not.toContain(
      'const DEFAULT_WORDPRESS_DATA_VERSION',
    );
    expect(integrationEnvRuntimeSource).not.toContain(
      'const WP_ENV_PACKAGE_VERSION',
    );
    expect(integrationEnvRuntimeSource).not.toContain(
      'DEFAULT_WORDPRESS_ENV_VERSION',
    );
    expect(integrationEnvPackageJsonSource).toContain(
      'DEFAULT_WORDPRESS_ENV_VERSION',
    );
    expect(localDevPresetsSource).toContain('DEFAULT_WORDPRESS_ENV_VERSION');
    expect(localDevPresetsSource).not.toContain(
      '["@wordpress/env"] = "^11.2.0"',
    );
    expect(abilityRuntimeSource).not.toContain('../shared/package-versions.js');
    expect(abilityScaffoldSource).not.toContain(
      '../shared/package-versions.js',
    );
    expect(abilityAnchorsSource).toContain(
      '../shared/package-versions.js',
    );
    expect(adminViewScaffoldSource).toContain(
      "from '../shared/package-versions.js'",
    );
    expect(adminViewScaffoldSource).toContain(
      'resolveManagedPackageVersionRange',
    );
    expect(adminViewScaffoldSource).not.toContain(
      'function normalizeVersionRange(',
    );
    expect(adminViewScaffoldSource).not.toContain(
      'function readPackageManifest(',
    );
    expect(adminViewScaffoldSource).not.toContain(
      'function readPackageManifestVersion(',
    );
    expect(adminViewScaffoldSource).not.toContain(
      'function resolvePackageVersionRange(',
    );
    expect(adminViewRuntimeSource).not.toContain(
      'DEFAULT_WORDPRESS_DATAVIEWS_VERSION',
    );
  });
});
