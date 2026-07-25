import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  RANGE_POLICY,
  bumpVersion,
  specAllowsVersion,
} from '../../scripts/lib/runtime-package-policy.mjs';
import {
  collectPlannedRuntimePackages,
  validateRuntimePackageCoupling,
} from '../../scripts/validate-runtime-package-coupling.mjs';

let tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs) {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
  tempDirs = [];
});

function createRuntimeRepo() {
  const repoRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-runtime-coupling-'),
  );
  tempDirs.push(repoRoot);
  fs.mkdirSync(path.join(repoRoot, '.sampo', 'changesets'), {
    recursive: true,
  });

  const writePackage = (packageDir: string, manifest: Record<string, unknown>) => {
    const absolutePackageDir = path.join(repoRoot, packageDir);
    fs.mkdirSync(absolutePackageDir, { recursive: true });
    fs.writeFileSync(
      path.join(absolutePackageDir, 'package.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
  };

  writePackage('packages/wp-typia-api-client', {
    name: '@wp-typia/api-client',
    version: '0.4.2',
  });
  writePackage('packages/wp-typia-block-types', {
    name: '@wp-typia/block-types',
    version: '0.2.1',
  });
  writePackage('packages/wp-typia-block-runtime', {
    dependencies: {
      '@wp-typia/api-client': '^0.4.2',
    },
    name: '@wp-typia/block-runtime',
    version: '0.4.3',
  });
  writePackage('packages/wp-typia-rest', {
    dependencies: {
      '@wp-typia/api-client': 'workspace:*',
    },
    name: '@wp-typia/rest',
    prepack: 'node ./scripts/publish-manifest.mjs',
    scripts: {
      prepack: 'node ./scripts/publish-manifest.mjs',
    },
    version: '0.3.5',
  });
  fs.mkdirSync(path.join(repoRoot, 'packages', 'wp-typia-rest', 'scripts'), {
    recursive: true,
  });
  fs.writeFileSync(
		path.join(repoRoot, 'packages', 'wp-typia-rest', 'scripts', 'publish-manifest.mjs'),
		[
			"import fs from 'node:fs';",
			"const packageJsonPath = new URL('../package.json', import.meta.url);",
			"const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));",
			"packageJson.dependencies['@wp-typia/api-client'] = '^0.4.2';",
			"fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\\n`, 'utf8');",
		].join('\n'),
		'utf8',
	);
  writePackage('packages/wp-typia-project-tools', {
    dependencies: {
      '@wp-typia/api-client': '^0.4.2',
      '@wp-typia/block-runtime': '^0.4.3',
      '@wp-typia/block-types': '^0.2.1',
      '@wp-typia/rest': '^0.3.5',
    },
    name: '@wp-typia/project-tools',
    version: '0.15.4',
  });
  writePackage('packages/wp-typia', {
    dependencies: {
      '@wp-typia/api-client': '^0.4.2',
      '@wp-typia/project-tools': '0.15.4',
    },
    name: 'wp-typia',
    version: '0.15.5',
  });

  return repoRoot;
}

function writeChangeset(repoRoot: string, fileName: string, entries: string[]) {
  fs.writeFileSync(
    path.join(repoRoot, '.sampo', 'changesets', fileName),
    ['---', ...entries, '---', '', 'Test changeset.'].join('\n'),
    'utf8',
  );
}

describe('runtime-package-policy', () => {
  test('caret policy allows next patch but rejects next minor for 0.x versions', () => {
    expect(specAllowsVersion('^0.4.2', '0.4.3', RANGE_POLICY.caret)).toBe(true);
    expect(specAllowsVersion('^0.4.2', '0.5.0', RANGE_POLICY.caret)).toBe(false);
  });

  test('policy specs reject pre-release and build suffixes until semver-aware ordering is implemented', () => {
    expect(specAllowsVersion('^0.4.2-beta.1', '0.4.2', RANGE_POLICY.caret)).toBe(
      false,
    );
    expect(specAllowsVersion('0.15.4+build.1', '0.15.4', RANGE_POLICY.exact)).toBe(
      false,
    );
    expect(specAllowsVersion('^0.4.2', '0.4.3-beta.1', RANGE_POLICY.caret)).toBe(
      false,
    );
  });

  test('exact policy only allows the exact planned version', () => {
    expect(specAllowsVersion('0.15.4', '0.15.4', RANGE_POLICY.exact)).toBe(true);
    expect(specAllowsVersion('0.15.4', '0.15.5', RANGE_POLICY.exact)).toBe(
      false,
    );
  });

  test('bumpVersion increments the expected semver lane', () => {
    expect(bumpVersion('0.4.2', 'patch')).toBe('0.4.3');
    expect(bumpVersion('0.4.2', 'minor')).toBe('0.5.0');
    expect(bumpVersion('0.4.2', 'major')).toBe('1.0.0');
  });
});

describe('validate-runtime-package-coupling', () => {
	test('collectPlannedRuntimePackages keeps the highest pending release type', () => {
		const repoRoot = createRuntimeRepo();
		writeChangeset(repoRoot, 'api-client-patch.md', ['npm/@wp-typia/api-client: patch']);
		writeChangeset(repoRoot, 'api-client-minor.md', ['npm/@wp-typia/api-client: minor']);

		const planned = collectPlannedRuntimePackages(repoRoot);
		const apiClient = planned.find(
			(entry: (typeof planned)[number]) => entry.packageName === '@wp-typia/api-client',
		);

		expect(apiClient?.pendingReleaseType).toBe('minor');
		expect(apiClient?.plannedVersion).toBe('0.5.0');
	});

	test('passes when an api-client patch bump stays within current caret lanes', () => {
		const repoRoot = createRuntimeRepo();
		writeChangeset(repoRoot, 'api-client-patch.md', ['npm/@wp-typia/api-client: patch']);

		const result = validateRuntimePackageCoupling(repoRoot);

		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});

	test('fails when an api-client minor bump is not reflected in dependent ranges or release notes', () => {
		const repoRoot = createRuntimeRepo();
		writeChangeset(repoRoot, 'api-client-minor.md', ['npm/@wp-typia/api-client: minor']);

		const result = validateRuntimePackageCoupling(repoRoot);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			'@wp-typia/api-client is planned for 0.4.2 -> 0.5.0; @wp-typia/rest must also receive a pending changeset because its caret policy requires a dependency update.',
		);
		expect(result.errors).toContain(
			'@wp-typia/api-client is planned for 0.4.2 -> 0.5.0; @wp-typia/block-runtime must add a pending changeset and update dependencies.@wp-typia/api-client.',
		);
		expect(result.errors).toContain(
			'@wp-typia/api-client is planned for 0.4.2 -> 0.5.0; @wp-typia/project-tools must add a pending changeset and update dependencies.@wp-typia/api-client.',
		);
		expect(result.errors).toContain(
			'@wp-typia/api-client is planned for 0.4.2 -> 0.5.0; wp-typia must add a pending changeset and update dependencies.@wp-typia/api-client.',
		);
	});

	test('passes when an api-client minor bump is paired with dependent changesets and planned publish manifests', () => {
		const repoRoot = createRuntimeRepo();
		writeChangeset(repoRoot, 'api-client-minor.md', ['npm/@wp-typia/api-client: minor']);
		writeChangeset(repoRoot, 'block-runtime-patch.md', ['npm/@wp-typia/block-runtime: patch']);
		writeChangeset(repoRoot, 'rest-patch.md', ['npm/@wp-typia/rest: patch']);
		writeChangeset(repoRoot, 'project-tools-patch.md', ['npm/@wp-typia/project-tools: patch']);
		writeChangeset(repoRoot, 'wp-typia-patch.md', ['npm/wp-typia: patch']);

		const updateDependency = (
			packageDir: string,
			packageName: string,
			nextSpec: string,
		) => {
			const packageJsonPath = path.join(repoRoot, packageDir, 'package.json');
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
			packageJson.dependencies[packageName] = nextSpec;
			fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
		};

		updateDependency('packages/wp-typia-block-runtime', '@wp-typia/api-client', '^0.5.0');
		updateDependency('packages/wp-typia-project-tools', '@wp-typia/api-client', '^0.5.0');
		updateDependency('packages/wp-typia', '@wp-typia/api-client', '^0.5.0');

		const projectToolsPackageJsonPath = path.join(
			repoRoot,
			'packages',
			'wp-typia',
			'package.json',
		);
		const wpTypiaPackageJson = JSON.parse(
			fs.readFileSync(projectToolsPackageJsonPath, 'utf8'),
		);
		wpTypiaPackageJson.dependencies['@wp-typia/project-tools'] = '0.15.5';
		fs.writeFileSync(
			projectToolsPackageJsonPath,
			`${JSON.stringify(wpTypiaPackageJson, null, 2)}\n`,
			'utf8',
		);

		const result = validateRuntimePackageCoupling(repoRoot);

		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});

	test('fails when project-tools changes but wp-typia keeps a stale exact dependency without a changeset', () => {
		const repoRoot = createRuntimeRepo();
		writeChangeset(repoRoot, 'project-tools-patch.md', ['npm/@wp-typia/project-tools: patch']);

		const result = validateRuntimePackageCoupling(repoRoot);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			'@wp-typia/project-tools is planned for 0.15.4 -> 0.15.5; wp-typia must add a pending changeset and update dependencies.@wp-typia/project-tools.',
		);
	});

	test('allows an exact source pin to stay on the current version until release versioning runs', () => {
		const repoRoot = createRuntimeRepo();
		writeChangeset(repoRoot, 'project-tools-patch.md', ['npm/@wp-typia/project-tools: patch']);
		writeChangeset(repoRoot, 'wp-typia-patch.md', ['npm/wp-typia: patch']);

		const result = validateRuntimePackageCoupling(repoRoot);

		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});

	test('fails when a dependent has a changeset but keeps an exact dependency spec on the wrong source version', () => {
		const repoRoot = createRuntimeRepo();
		writeChangeset(repoRoot, 'project-tools-patch.md', ['npm/@wp-typia/project-tools: patch']);
		writeChangeset(repoRoot, 'wp-typia-patch.md', ['npm/wp-typia: patch']);

		const wpTypiaPackageJsonPath = path.join(
			repoRoot,
			'packages',
			'wp-typia',
			'package.json',
		);
		const wpTypiaPackageJson = JSON.parse(
			fs.readFileSync(wpTypiaPackageJsonPath, 'utf8'),
		);
		wpTypiaPackageJson.dependencies['@wp-typia/project-tools'] = '0.15.3';
		fs.writeFileSync(
			wpTypiaPackageJsonPath,
			`${JSON.stringify(wpTypiaPackageJson, null, 2)}\n`,
			'utf8',
		);

		const result = validateRuntimePackageCoupling(repoRoot);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			'wp-typia has a pending patch changeset, but dependencies.@wp-typia/project-tools="0.15.3" still does not allow planned @wp-typia/project-tools@0.15.5.',
		);
	});

	test('passes when source workspace protocol leaks are repaired in the packed rest manifest', () => {
		const repoRoot = createRuntimeRepo();

		const result = validateRuntimePackageCoupling(repoRoot);

		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});

	test('passes when project-tools uses sanctioned workspace protocol edges', () => {
		const repoRoot = createRuntimeRepo();
		const packageJsonPath = path.join(
			repoRoot,
			'packages',
			'wp-typia-project-tools',
			'package.json',
		);
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
		packageJson.dependencies['@wp-typia/block-runtime'] = 'workspace:*';
		packageJson.dependencies['@wp-typia/block-types'] = 'workspace:*';
		fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

		const result = validateRuntimePackageCoupling(repoRoot);

		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});

	test('fails when an unsanctioned runtime package keeps a workspace protocol dependency', () => {
		const repoRoot = createRuntimeRepo();
		const packageJsonPath = path.join(
			repoRoot,
			'packages',
			'wp-typia-block-runtime',
			'package.json',
		);
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
		packageJson.dependencies['@wp-typia/api-client'] = 'workspace:*';
		fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

		const result = validateRuntimePackageCoupling(repoRoot);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			'@wp-typia/block-runtime must use a caret dependency spec for @wp-typia/api-client, found "workspace:*".',
		);
	});

	test('fails when the sanctioned rest edge uses an unsupported workspace protocol variant', () => {
		const repoRoot = createRuntimeRepo();
		const packageJsonPath = path.join(repoRoot, 'packages', 'wp-typia-rest', 'package.json');
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
		packageJson.dependencies['@wp-typia/api-client'] = 'workspace:^';
		fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

		const result = validateRuntimePackageCoupling(repoRoot);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			'@wp-typia/rest must use a caret dependency spec for @wp-typia/api-client, found "workspace:^".',
		);
	});

	test('fails when a coupled dependency is also declared in peerDependencies', () => {
		const repoRoot = createRuntimeRepo();
		const packageJsonPath = path.join(
			repoRoot,
			'packages',
			'wp-typia-project-tools',
			'package.json',
		);
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
		packageJson.peerDependencies = {
			'@wp-typia/rest': '^0.3.5',
		};
		fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

		const result = validateRuntimePackageCoupling(repoRoot);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			'@wp-typia/project-tools must declare @wp-typia/rest only in dependencies, not peerDependencies (^0.3.5).',
		);
	});
});
