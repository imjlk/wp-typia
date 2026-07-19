import { afterAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  createDoctorRunSummary,
  getDoctorChecks,
} from '../src/runtime/cli-core.js';
import { formatDoctorCheckLine } from '../src/runtime/cli-diagnostics.js';
import {
  STANDALONE_DOCTOR_CODES,
  tryResolveStandaloneScaffoldProject,
} from '../src/runtime/doctor/cli-doctor-standalone.js';
import { scaffoldProject } from '../src/runtime/index.js';
import {
  cleanupScaffoldTempRoot,
  createScaffoldTempRoot,
  linkWorkspaceNodeModules,
  runGeneratedScript,
} from './helpers/scaffold-test-harness.js';

import type { DoctorCheck } from '../src/runtime/cli-doctor.js';

describe('@wp-typia/project-tools standalone doctor', () => {
  const tempRoot = createScaffoldTempRoot('wp-typia-standalone-doctor-');

  afterAll(() => {
    cleanupScaffoldTempRoot(tempRoot);
  });

  async function scaffoldBasic(targetDir: string): Promise<void> {
    await scaffoldProject({
      projectDir: targetDir,
      templateId: 'basic',
      packageManager: 'npm',
      noInstall: true,
      answers: {
        author: 'Test Runner',
        description: 'Standalone doctor fixture',
        namespace: 'doctor-demo',
        slug: path.basename(targetDir),
        title: 'Standalone Doctor Fixture',
      },
    });
  }

  async function scaffoldPersistence(targetDir: string): Promise<void> {
    await scaffoldProject({
      projectDir: targetDir,
      templateId: 'persistence',
      dataStorageMode: 'post-meta',
      packageManager: 'npm',
      noInstall: true,
      persistencePolicy: 'authenticated',
      answers: {
        author: 'Test Runner',
        dataStorageMode: 'post-meta',
        description: 'Standalone doctor persistence fixture',
        namespace: 'doctor-demo',
        persistencePolicy: 'authenticated',
        slug: path.basename(targetDir),
        title: 'Standalone Doctor Persistence Fixture',
      },
    });
  }

  function getCheck(
    checks: DoctorCheck[],
    code: string,
  ): DoctorCheck | undefined {
    return checks.find((check) => check.code === code);
  }

  test('recognizes a fresh standalone scaffold before dependencies are installed', async () => {
    const targetDir = path.join(tempRoot, 'fresh-standalone');
    await scaffoldBasic(targetDir);

    const checks = await getDoctorChecks(path.join(targetDir, 'src'));
    const scopeCheck = checks.find((check) => check.label === 'Doctor scope');
    const dependenciesCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.DEPENDENCIES,
    );
    const artifactsCheck = getCheck(checks, STANDALONE_DOCTOR_CODES.ARTIFACTS);

    expect(scopeCheck?.status).toBe('pass');
    expect(scopeCheck?.detail).toContain(
      'Scope: standalone scaffold diagnostics',
    );
    expect(scopeCheck?.detail).not.toContain('environment-only');
    expect(formatDoctorCheckLine(scopeCheck as DoctorCheck)).toContain(
      'PASS Doctor scope:',
    );
    expect(getCheck(checks, STANDALONE_DOCTOR_CODES.PACKAGE)?.status).toBe(
      'pass',
    );
    expect(getCheck(checks, STANDALONE_DOCTOR_CODES.BOOTSTRAP)?.status).toBe(
      'pass',
    );
    expect(
      getCheck(checks, STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT)?.status,
    ).toBe('pass');
    expect(dependenciesCheck?.status).toBe('fail');
    expect(dependenciesCheck?.detail).toContain('npm install --no-audit');
    expect(dependenciesCheck?.detail).not.toContain(targetDir);
    expect(
      artifactsCheck?.status === 'fail' || artifactsCheck?.status === 'warn',
    ).toBe(true);
    expect(createDoctorRunSummary(checks).exitCode).toBe(1);
  });

  test('does not classify generated compound scaffolds as single-block projects', async () => {
    const targetDir = path.join(tempRoot, 'compound-project');
    await scaffoldProject({
      projectDir: targetDir,
      templateId: 'compound',
      packageManager: 'npm',
      noInstall: true,
      answers: {
        author: 'Test Runner',
        description: 'Compound doctor fixture',
        namespace: 'doctor-demo',
        slug: 'compound-project',
        title: 'Compound Doctor Fixture',
      },
    });

    const checks = await getDoctorChecks(path.join(targetDir, 'src'));
    const scopeCheck = checks.find((check) => check.label === 'Doctor scope');

    expect(tryResolveStandaloneScaffoldProject(targetDir)).toBeNull();
    expect(scopeCheck?.detail).toContain('Scope: environment-only');
    expect(
      checks.some((check) => check.code?.startsWith('wp-typia.standalone.')),
    ).toBe(false);
  });

  test('does not accept dependencies resolved only from an ancestor', async () => {
    const ancestorDir = path.join(tempRoot, 'ancestor-dependencies');
    const targetDir = path.join(ancestorDir, 'standalone-project');
    await scaffoldBasic(targetDir);
    fs.symlinkSync(
      path.resolve(import.meta.dir, '..', 'node_modules'),
      path.join(ancestorDir, 'node_modules'),
      'dir',
    );

    const checks = await getDoctorChecks(targetDir);
    const dependenciesCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.DEPENDENCIES,
    );

    expect(dependenciesCheck?.status).toBe('fail');
    expect(dependenciesCheck?.detail).toContain('@wp-typia/block-runtime');
    expect(dependenciesCheck?.detail).toContain('typescript');
  });

  test('rejects ancestor resolutions hidden by incomplete local package stubs', async () => {
    const ancestorDir = path.join(tempRoot, 'ancestor-stub-dependencies');
    const targetDir = path.join(ancestorDir, 'standalone-project');
    await scaffoldBasic(targetDir);
    fs.symlinkSync(
      path.resolve(import.meta.dir, '..', 'node_modules'),
      path.join(ancestorDir, 'node_modules'),
      'dir',
    );
    const localTypeScriptDir = path.join(
      targetDir,
      'node_modules',
      'typescript',
    );
    fs.mkdirSync(localTypeScriptDir, { recursive: true });
    fs.writeFileSync(
      path.join(localTypeScriptDir, 'README.md'),
      'incomplete local package stub\n',
    );
    const resolvedTypeScript = createRequire(
      path.join(targetDir, 'package.json'),
    ).resolve('typescript');

    expect(
      path.relative(localTypeScriptDir, resolvedTypeScript).startsWith('..'),
    ).toBe(true);

    const checks = await getDoctorChecks(targetDir);
    const dependenciesCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.DEPENDENCIES,
    );

    expect(dependenciesCheck?.status).toBe('fail');
    expect(dependenciesCheck?.detail).toContain('typescript');
  });

  test('accepts project-owned dependencies resolved through active Yarn PnP', async () => {
    const ancestorDir = path.join(tempRoot, 'pnp-dependencies');
    const targetDir = path.join(ancestorDir, 'standalone-project');
    await scaffoldBasic(targetDir);
    linkWorkspaceNodeModules(targetDir);
    fs.renameSync(
      path.join(targetDir, 'node_modules'),
      path.join(ancestorDir, 'node_modules'),
    );
    const projectRequire = createRequire(path.join(targetDir, 'package.json'));
    const requiredPackages = [
      ['@wp-typia/block-runtime', '@wp-typia/block-runtime/metadata-core'],
      ['@wp-typia/block-types', '@wp-typia/block-types'],
      ['typia', 'typia'],
      ['typescript', 'typescript'],
      ['tsx', 'tsx/cli'],
      ['@wordpress/scripts', '@wordpress/scripts/bin/wp-scripts.js'],
      ['@typia/unplugin', '@typia/unplugin/webpack'],
    ] as const;
    const resolvedPackages = requiredPackages.map(
      ([packageName, resolutionSpecifier]) => [
        projectRequire.resolve(resolutionSpecifier),
        packageName === 'tsx' ? 'tsx-alias-target' : packageName,
      ],
    );
    const pnpApiDir = path.join(targetDir, 'node_modules', 'pnpapi');
    fs.mkdirSync(pnpApiDir, { recursive: true });
    fs.writeFileSync(
      path.join(pnpApiDir, 'package.json'),
      JSON.stringify({ main: 'index.cjs', name: 'pnpapi' }),
    );
    const serializedPackages = JSON.stringify(resolvedPackages);
    const serializedDependencies = JSON.stringify(
      requiredPackages.map(([packageName]) => [
        packageName,
        packageName === 'tsx'
          ? ['tsx-alias-target', 'fixture-reference']
          : 'fixture-reference',
      ]),
    );
    fs.writeFileSync(
      path.join(pnpApiDir, 'index.cjs'),
      [
        "const path = require('node:path');",
        `const projectManifest = ${JSON.stringify(path.join(targetDir, 'package.json'))};`,
        `const resolvedPackages = new Map(${serializedPackages}.map(([resolvedPath, packageName]) => [path.resolve(resolvedPath), packageName]));`,
        `const packageDependencies = new Map(${serializedDependencies});`,
        'exports.findPackageLocator = (location) => {',
        "  if (path.resolve(location) === path.resolve(projectManifest)) return { name: 'standalone-project', reference: 'workspace-reference' };",
        '  const packageName = resolvedPackages.get(path.resolve(location));',
        "  return packageName ? { name: packageName, reference: 'fixture-reference' } : null;",
        '};',
        'exports.getLocator = (name, referencish) =>',
        '  Array.isArray(referencish)',
        '    ? { name: referencish[0], reference: referencish[1] }',
        '    : { name, reference: referencish };',
        'exports.getPackageInformation = (locator) =>',
        "  locator.reference === 'workspace-reference' ? { packageDependencies } : null;",
        '',
      ].join('\n'),
    );
    fs.writeFileSync(path.join(targetDir, '.pnp.cjs'), 'module.exports = {};\n');

    const pnpDescriptor = Object.getOwnPropertyDescriptor(
      process.versions,
      'pnp',
    );
    Object.defineProperty(process.versions, 'pnp', {
      configurable: true,
      value: 3,
    });
    try {
      const checks = await getDoctorChecks(targetDir);
      expect(
        getCheck(checks, STANDALONE_DOCTOR_CODES.DEPENDENCIES)?.status,
      ).toBe('pass');
    } finally {
      if (pnpDescriptor) {
        Object.defineProperty(process.versions, 'pnp', pnpDescriptor);
      } else {
        delete process.versions.pnp;
      }
    }
  }, 20_000);

  test('requires installed script runners from the standalone project', async () => {
    const targetDir = path.join(tempRoot, 'missing-script-runners');
    await scaffoldBasic(targetDir);
    runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts');
    fs.rmSync(path.join(targetDir, 'node_modules', 'tsx'), {
      force: true,
      recursive: true,
    });
    fs.rmSync(
      path.join(targetDir, 'node_modules', '@wordpress', 'scripts'),
      { force: true, recursive: true },
    );

    const checks = await getDoctorChecks(targetDir);
    const dependenciesCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.DEPENDENCIES,
    );

    expect(dependenciesCheck?.status).toBe('fail');
    expect(dependenciesCheck?.detail).toContain('tsx');
    expect(dependenciesCheck?.detail).toContain('@wordpress/scripts');
    expect(getCheck(checks, STANDALONE_DOCTOR_CODES.ARTIFACTS)?.status).toBe(
      'warn',
    );
  }, 20_000);

  test('requires the installed Typia webpack plugin from the standalone project', async () => {
    const targetDir = path.join(tempRoot, 'missing-typia-webpack-plugin');
    await scaffoldBasic(targetDir);
    runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts');
    fs.rmSync(path.join(targetDir, 'node_modules', '@typia', 'unplugin'), {
      force: true,
      recursive: true,
    });

    const checks = await getDoctorChecks(targetDir);
    const dependenciesCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.DEPENDENCIES,
    );

    expect(dependenciesCheck?.status).toBe('fail');
    expect(dependenciesCheck?.detail).toContain('@typia/unplugin/webpack');
  }, 20_000);

  test('requires the metadata-core runtime subpath used by sync', async () => {
    const targetDir = path.join(tempRoot, 'missing-runtime-subpath');
    await scaffoldBasic(targetDir);
    runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts');
    const runtimeDir = path.join(
      targetDir,
      'node_modules',
      '@wp-typia',
      'block-runtime',
    );
    fs.rmSync(runtimeDir, { force: true, recursive: true });
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(
      path.join(runtimeDir, 'package.json'),
      JSON.stringify({ main: 'index.js', name: '@wp-typia/block-runtime' }),
    );
    fs.writeFileSync(path.join(runtimeDir, 'index.js'), 'export {};\n');

    const checks = await getDoctorChecks(targetDir);
    const dependenciesCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.DEPENDENCIES,
    );

    expect(dependenciesCheck?.status).toBe('fail');
    expect(dependenciesCheck?.detail).toContain(
      '@wp-typia/block-runtime/metadata-core',
    );
    expect(getCheck(checks, STANDALONE_DOCTOR_CODES.ARTIFACTS)?.status).toBe(
      'warn',
    );
  }, 20_000);

  test('requires persistence REST declarations and project-local runtime subpaths', async () => {
    const declarationsTarget = path.join(tempRoot, 'missing-rest-declarations');
    await scaffoldPersistence(declarationsTarget);
    const packageJsonPath = path.join(declarationsTarget, 'package.json');
    const packageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, 'utf8'),
    ) as {
      devDependencies: Record<string, string>;
    };
    delete packageJson.devDependencies['@wp-typia/rest'];
    delete packageJson.devDependencies['@wp-typia/api-client'];
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    const declarationChecks = await getDoctorChecks(declarationsTarget);
    const packageCheck = getCheck(
      declarationChecks,
      STANDALONE_DOCTOR_CODES.PACKAGE,
    );
    expect(packageCheck?.status).toBe('fail');
    expect(packageCheck?.detail).toContain('must declare @wp-typia/rest');
    expect(packageCheck?.detail).toContain('must declare @wp-typia/api-client');

    const installationTarget = path.join(tempRoot, 'missing-rest-installation');
    await scaffoldPersistence(installationTarget);
    linkWorkspaceNodeModules(installationTarget);
    fs.rmSync(
      path.join(installationTarget, 'node_modules', '@wp-typia', 'rest'),
      { force: true, recursive: true },
    );
    fs.rmSync(
      path.join(installationTarget, 'node_modules', '@wp-typia', 'api-client'),
      { force: true, recursive: true },
    );

    const installationChecks = await getDoctorChecks(installationTarget);
    const dependenciesCheck = getCheck(
      installationChecks,
      STANDALONE_DOCTOR_CODES.DEPENDENCIES,
    );
    expect(dependenciesCheck?.status).toBe('fail');
    expect(dependenciesCheck?.detail).toContain('@wp-typia/rest');
    expect(dependenciesCheck?.detail).toContain('@wp-typia/rest/react');
    expect(dependenciesCheck?.detail).toContain('@wp-typia/api-client');
  }, 30_000);

  test('rejects package scripts that bypass generated sync helpers', async () => {
    const targetDir = path.join(tempRoot, 'damaged-package-scripts');
    await scaffoldBasic(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    packageJson.scripts.sync = 'node -e "process.exit(0)"';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    const checks = await getDoctorChecks(targetDir);
    const packageCheck = getCheck(checks, STANDALONE_DOCTOR_CODES.PACKAGE);

    expect(packageCheck?.status).toBe('fail');
    expect(packageCheck?.detail).toContain(
      'sync script must invoke `tsx scripts/sync-project.ts`',
    );
  });

  test('rejects package scripts that only echo canonical command text', async () => {
    const targetDir = path.join(tempRoot, 'echoed-package-scripts');
    await scaffoldBasic(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    packageJson.scripts.sync = "echo 'tsx scripts/sync-project.ts'";
    packageJson.scripts.build =
      "echo 'npm run sync -- --check' && wp-scripts build --experimental-modules";
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    const checks = await getDoctorChecks(targetDir);
    const packageCheck = getCheck(checks, STANDALONE_DOCTOR_CODES.PACKAGE);

    expect(packageCheck?.status).toBe('fail');
    expect(packageCheck?.detail).toContain(
      'sync script must invoke `tsx scripts/sync-project.ts`',
    );
    expect(packageCheck?.detail).toContain(
      'build script must invoke `npm run sync -- --check`',
    );
  });

  test('rejects canonical commands hidden inside shell comments', async () => {
    const targetDir = path.join(tempRoot, 'commented-package-scripts');
    await scaffoldBasic(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    packageJson.scripts.sync =
      'echo disabled # && tsx scripts/sync-project.ts';
    packageJson.scripts['sync-types'] =
      'echo disabled\n# | tsx scripts/sync-types-to-block-json.ts';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    const checks = await getDoctorChecks(targetDir);
    const packageCheck = getCheck(checks, STANDALONE_DOCTOR_CODES.PACKAGE);

    expect(packageCheck?.status).toBe('fail');
    expect(packageCheck?.detail).toContain(
      'sync script must invoke `tsx scripts/sync-project.ts`',
    );
    expect(packageCheck?.detail).toContain(
      'sync-types script must invoke `tsx scripts/sync-types-to-block-json.ts`',
    );
  });

  test('accepts canonical package commands after shell control operators', async () => {
    const targetDir = path.join(tempRoot, 'background-package-scripts');
    await scaffoldBasic(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    packageJson.scripts.sync =
      "# generated wrapper follows\nprintf 'running standalone sync\\n' & tsx scripts/sync-project.ts";
    packageJson.scripts['sync-types'] =
      "printf 'metadata\\n' | tsx scripts/sync-types-to-block-json.ts";
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    const checks = await getDoctorChecks(targetDir);
    const packageCheck = getCheck(checks, STANDALONE_DOCTOR_CODES.PACKAGE);

    expect(packageCheck?.status).toBe('pass');
  });

  test('requires build sync checks in the same preceding && command list', async () => {
    const targetDir = path.join(tempRoot, 'ordered-package-scripts');
    await scaffoldBasic(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, 'utf8'),
    ) as {
      scripts: Record<string, string>;
    };
    const invalidBuildScripts = [
      'wp-scripts build --experimental-modules && npm run sync -- --check',
      'npm run sync -- --check ; wp-scripts build --experimental-modules',
      'npm run sync -- --check & wp-scripts build --experimental-modules',
      'npm run sync -- --check || wp-scripts build --experimental-modules',
      'npm run sync -- --check | wp-scripts build --experimental-modules',
      'wp-scripts build --experimental-modules && npm run sync -- --check && wp-scripts build --experimental-modules',
    ];
    for (const buildScript of invalidBuildScripts) {
      packageJson.scripts.build = buildScript;
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      const packageCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.PACKAGE,
      );
      expect(packageCheck?.status).toBe('fail');
      expect(packageCheck?.detail).toContain('same && command list');
    }

    packageJson.scripts.build =
      'echo ready && npm run sync -- --check && wp-scripts build --experimental-modules';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    expect(
      getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.PACKAGE,
      )?.status,
    ).toBe('pass');
  });

  test('reports non-string packageManager metadata without throwing', async () => {
    const targetDir = path.join(tempRoot, 'invalid-package-manager');
    await scaffoldBasic(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, 'utf8'),
    ) as {
      packageManager?: unknown;
    };
    for (const packageManager of [{ name: 'npm' }, 123, null]) {
      packageJson.packageManager = packageManager;
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      const checks = await getDoctorChecks(targetDir);
      const packageCheck = getCheck(checks, STANDALONE_DOCTOR_CODES.PACKAGE);
      expect(packageCheck?.status).toBe('fail');
      expect(packageCheck?.detail).toContain(
        'packageManager must be a string when defined',
      );
      expect(checks.length).toBeGreaterThan(1);
    }
  });

  test('does not claim standalone scope from one incidental dependency and file', async () => {
    const targetDir = path.join(tempRoot, 'incidental-signals');
    fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, 'package.json'),
      JSON.stringify({
        devDependencies: { '@wp-typia/block-runtime': '^0.1.0' },
        name: 'incidental-signals',
      }),
    );
    fs.writeFileSync(path.join(targetDir, 'src', 'types.ts'), 'export {};\n');

    const checks = await getDoctorChecks(targetDir);
    const scopeCheck = checks.find((check) => check.label === 'Doctor scope');

    expect(scopeCheck?.status).toBe('pass');
    expect(scopeCheck?.detail).toContain('Scope: environment-only');
    expect(
      checks.some((check) => check.code?.startsWith('wp-typia.standalone.')),
    ).toBe(false);
  });

  test('stops standalone discovery at the nearest package boundary', async () => {
    const standaloneDir = path.join(tempRoot, 'ancestor-standalone');
    const nestedProjectDir = path.join(standaloneDir, 'nested-project');
    await scaffoldBasic(standaloneDir);
    fs.mkdirSync(path.join(nestedProjectDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(nestedProjectDir, 'package.json'),
      JSON.stringify({ name: 'nested-project', private: true }),
    );

    const checks = await getDoctorChecks(path.join(nestedProjectDir, 'src'));
    const scopeCheck = checks.find((check) => check.label === 'Doctor scope');

    expect(scopeCheck?.detail).toContain('Scope: environment-only');
    expect(
      checks.some((check) => check.code?.startsWith('wp-typia.standalone.')),
    ).toBe(false);
  });

  test('prefers a standalone boundary over malformed ancestor metadata', async () => {
    const ancestorDir = path.join(tempRoot, 'malformed-ancestor');
    const targetDir = path.join(ancestorDir, 'standalone-project');
    await scaffoldBasic(targetDir);
    fs.writeFileSync(path.join(ancestorDir, 'package.json'), '{ not valid json');

    const checks = await getDoctorChecks(path.join(targetDir, 'src'));
    const scopeCheck = checks.find((check) => check.label === 'Doctor scope');

    expect(scopeCheck?.status).toBe('pass');
    expect(scopeCheck?.detail).toContain('Scope: standalone scaffold diagnostics');
    expect(
      checks.some((check) => check.label === 'Workspace package metadata'),
    ).toBe(false);
  });

  test('handles a malformed package boundary without throwing', async () => {
    const targetDir = path.join(tempRoot, 'malformed-manifest');
    fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'package.json'), '{ not valid json');

    const checks = await getDoctorChecks(path.join(targetDir, 'src'));
    const scopeCheck = checks.find((check) => check.label === 'Doctor scope');

    expect(() => tryResolveStandaloneScaffoldProject(targetDir)).toThrow(
      'standalone scaffold package manifest',
    );
    expect(scopeCheck?.status).toBe('fail');
    expect(scopeCheck?.detail).toContain(
      'Scope: blocked before workspace checks',
    );
    expect(
      checks.some((check) => check.code?.startsWith('wp-typia.standalone.')),
    ).toBe(false);
  });

  test('rejects standalone sync paths outside the project root', async () => {
    const targetDir = path.join(tempRoot, 'unsafe-sync-path');
    await scaffoldBasic(targetDir);
    const syncScriptPath = path.join(
      targetDir,
      'scripts',
      'sync-types-to-block-json.ts',
    );
    const syncScript = fs.readFileSync(syncScriptPath, 'utf8');
    fs.writeFileSync(
      syncScriptPath,
      syncScript.replace(
        /blockJsonFile:\s*['"][^'"]+['"]/u,
        "blockJsonFile: '../../../etc/passwd'",
      ),
    );

    const checks = await getDoctorChecks(targetDir);
    const sourceLayoutCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );

    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'references a path outside the project root: ../../../etc/passwd',
    );
    expect(getCheck(checks, STANDALONE_DOCTOR_CODES.ARTIFACTS)?.status).toBe(
      'fail',
    );
  });

  test('rejects spread and computed standalone sync configuration', async () => {
    const targetDir = path.join(tempRoot, 'dynamic-sync-config');
    await scaffoldBasic(targetDir);
    const syncScriptPath = path.join(
      targetDir,
      'scripts',
      'sync-types-to-block-json.ts',
    );
    fs.writeFileSync(
      syncScriptPath,
      [
        "import { runSyncBlockMetadata } from '@wp-typia/block-runtime/metadata-core';",
        "const paths = { blockJsonFile: 'src/block.json' };",
        'runSyncBlockMetadata({',
        '  ...paths,',
        "  ['sourceTypeName']: 'DynamicSyncConfigAttributes',",
        "  typesFile: 'src/types.ts',",
        '});',
        '',
      ].join('\n'),
    );

    const checks = await getDoctorChecks(targetDir);
    const sourceLayoutCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );

    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'spread, shorthand, and computed properties are not supported',
    );
    expect(getCheck(checks, STANDALONE_DOCTOR_CODES.ARTIFACTS)?.status).toBe(
      'fail',
    );
  });

  test('rejects sync helpers with TypeScript syntax errors', async () => {
    const targetDir = path.join(tempRoot, 'invalid-sync-syntax');
    await scaffoldBasic(targetDir);
    const syncScriptPath = path.join(
      targetDir,
      'scripts',
      'sync-types-to-block-json.ts',
    );
    fs.appendFileSync(syncScriptPath, '\nconst broken = ;\n');

    const checks = await getDoctorChecks(targetDir);
    const sourceLayoutCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );

    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'contains TypeScript syntax errors',
    );
    expect(getCheck(checks, STANDALONE_DOCTOR_CODES.ARTIFACTS)?.status).toBe(
      'fail',
    );
  });

  test('rejects locally declared canonical sync lookalikes', async () => {
    const targetDir = path.join(tempRoot, 'local-sync-lookalike');
    await scaffoldBasic(targetDir);
    const syncScriptPath = path.join(
      targetDir,
      'scripts',
      'sync-types-to-block-json.ts',
    );
    fs.writeFileSync(
      syncScriptPath,
      [
        'function runSyncBlockMetadata(_options: unknown): void {}',
        'runSyncBlockMetadata({',
        "  blockJsonFile: 'src/block.json',",
        "  sourceTypeName: 'LocalSyncLookalikeAttributes',",
        "  typesFile: 'src/types.ts',",
        '});',
        '',
      ].join('\n'),
    );

    const checks = await getDoctorChecks(targetDir);
    const sourceLayoutCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );

    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must import and call runSyncBlockMetadata()',
    );
  });

  test('rejects shadowed canonical sync import bindings', async () => {
    const targetDir = path.join(tempRoot, 'shadowed-sync-binding');
    await scaffoldBasic(targetDir);
    const syncScriptPath = path.join(
      targetDir,
      'scripts',
      'sync-types-to-block-json.ts',
    );
    fs.appendFileSync(
      syncScriptPath,
      [
        '',
        'function shadowSync(runSyncBlockMetadata: (options: unknown) => unknown) {',
        '  return runSyncBlockMetadata({});',
        '}',
        '',
      ].join('\n'),
    );

    const checks = await getDoctorChecks(targetDir);
    const sourceLayoutCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );

    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must not shadow its canonical runSyncBlockMetadata() import binding',
    );
  });

  test('rejects zero-argument canonical sync calls without throwing', async () => {
    const targetDir = path.join(tempRoot, 'empty-sync-call');
    await scaffoldBasic(targetDir);
    fs.writeFileSync(
      path.join(targetDir, 'scripts', 'sync-types-to-block-json.ts'),
      [
        "import { runSyncBlockMetadata } from '@wp-typia/block-runtime/metadata-core';",
        'runSyncBlockMetadata();',
        '',
      ].join('\n'),
    );

    const checks = await getDoctorChecks(targetDir);
    const sourceLayoutCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );

    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain('with a static options object');
  });

  test('reports an unreadable sync helper without leaking the project path', async () => {
    const targetDir = path.join(tempRoot, 'missing-sync-helper');
    await scaffoldBasic(targetDir);
    fs.rmSync(
      path.join(targetDir, 'scripts', 'sync-types-to-block-json.ts'),
    );

    const checks = await getDoctorChecks(targetDir);
    const sourceLayoutCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );

    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'Unable to read generated helper scripts/sync-types-to-block-json.ts',
    );
    expect(sourceLayoutCheck?.detail).not.toContain(targetDir);
  });

  test('rejects a sync-project wrapper that no longer delegates to sync-types', async () => {
    const targetDir = path.join(tempRoot, 'detached-sync-project');
    await scaffoldBasic(targetDir);
    const syncProjectPath = path.join(
      targetDir,
      'scripts',
      'sync-project.ts',
    );
    const source = fs
      .readFileSync(syncProjectPath, 'utf8')
      .replace(/\n\s*runSyncScript\( syncTypesScriptPath, options \);/u, '');
    fs.writeFileSync(syncProjectPath, source);

    const checks = await getDoctorChecks(targetDir);
    const sourceLayoutCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );

    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must delegate to scripts/sync-types-to-block-json.ts',
    );
  });

  test('rejects a sync-project runner that drops --check forwarding', async () => {
    const targetDir = path.join(tempRoot, 'sync-project-without-check');
    await scaffoldBasic(targetDir);
    const syncProjectPath = path.join(
      targetDir,
      'scripts',
      'sync-project.ts',
    );
    const source = fs
      .readFileSync(syncProjectPath, 'utf8')
      .replace(
        /\n\s*if \( options\.check \) \{\s*args\.push\( '--check' \);\s*\}/u,
        '',
      );
    fs.writeFileSync(syncProjectPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must forward --check through the canonical tsx runner',
    );
  });

  test('rejects sync-project delegations hidden in dead branches', async () => {
    const targetDir = path.join(tempRoot, 'dead-sync-project-delegation');
    await scaffoldBasic(targetDir);
    const syncProjectPath = path.join(targetDir, 'scripts', 'sync-project.ts');
    const source = fs
      .readFileSync(syncProjectPath, 'utf8')
      .replace(
        '\trunSyncScript( syncTypesScriptPath, options );',
        [
          '\tif ( false ) {',
          '\t\trunSyncScript( syncTypesScriptPath, options );',
          '\t}',
        ].join('\n'),
      );
    fs.writeFileSync(syncProjectPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must delegate to scripts/sync-types-to-block-json.ts',
    );
  });

  test('rejects a persistence sync wrapper that no longer delegates to REST sync', async () => {
    const targetDir = path.join(tempRoot, 'detached-rest-sync-project');
    await scaffoldPersistence(targetDir);
    const syncProjectPath = path.join(targetDir, 'scripts', 'sync-project.ts');
    const source = fs
      .readFileSync(syncProjectPath, 'utf8')
      .replace(/\n\s*runSyncScript\( syncRestScriptPath, options \);/u, '');
    fs.writeFileSync(syncProjectPath, source);

    const checks = await getDoctorChecks(targetDir);
    const sourceLayoutCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );

    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must delegate to scripts/sync-rest-contracts.ts',
    );
  });

  test('keeps missing persistence REST helpers and dependencies actionable', async () => {
    const targetDir = path.join(tempRoot, 'missing-persistence-rest-helper');
    await scaffoldPersistence(targetDir);
    fs.rmSync(path.join(targetDir, 'scripts', 'sync-rest-contracts.ts'));
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, 'utf8'),
    ) as {
      devDependencies: Record<string, string>;
    };
    delete packageJson.devDependencies['@wp-typia/rest'];
    delete packageJson.devDependencies['@wp-typia/api-client'];
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    const checks = await getDoctorChecks(targetDir);
    const sourceLayoutCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    const packageCheck = getCheck(checks, STANDALONE_DOCTOR_CODES.PACKAGE);
    const dependenciesCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.DEPENDENCIES,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'Missing generated helper scripts/sync-rest-contracts.ts',
    );
    expect(packageCheck?.detail).toContain('must declare @wp-typia/rest');
    expect(packageCheck?.detail).toContain('must declare @wp-typia/api-client');
    expect(dependenciesCheck?.detail).toContain('@wp-typia/rest');
    expect(dependenciesCheck?.detail).toContain('@wp-typia/api-client');
  });

  test('rejects REST helpers that stop calling canonical sync routines', async () => {
    const targetDir = path.join(tempRoot, 'detached-rest-sync-helper');
    await scaffoldPersistence(targetDir);
    const syncRestPath = path.join(
      targetDir,
      'scripts',
      'sync-rest-contracts.ts',
    );
    const source = fs
      .readFileSync(syncRestPath, 'utf8')
      .replace('await syncEndpointClient(', 'await detachedEndpointClient(');
    fs.writeFileSync(syncRestPath, source);

    const checks = await getDoctorChecks(targetDir);
    const sourceLayoutCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );

    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must call syncTypeSchemas(), syncRestOpenApi(), and syncEndpointClient()',
    );
  });

  test('rejects zero-argument REST sync calls in main', async () => {
    const targetDir = path.join(tempRoot, 'zero-argument-rest-sync');
    await scaffoldPersistence(targetDir);
    const syncRestPath = path.join(
      targetDir,
      'scripts',
      'sync-rest-contracts.ts',
    );
    const source = fs.readFileSync(syncRestPath, 'utf8');
    const callStart = source.indexOf('\tawait syncEndpointClient( {');
    const callEndMarker = '\n\t} );';
    const callEnd = source.indexOf(callEndMarker, callStart);
    expect(callStart).toBeGreaterThan(-1);
    expect(callEnd).toBeGreaterThan(callStart);
    fs.writeFileSync(
      syncRestPath,
      `${source.slice(0, callStart)}\tawait syncEndpointClient();${source.slice(
        callEnd + callEndMarker.length,
      )}`,
    );

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must call syncTypeSchemas(), syncRestOpenApi(), and syncEndpointClient()',
    );
  });

  test('rejects duplicate canonical REST schema sync loops', async () => {
    const targetDir = path.join(tempRoot, 'duplicate-rest-schema-loop');
    await scaffoldPersistence(targetDir);
    const syncRestPath = path.join(
      targetDir,
      'scripts',
      'sync-rest-contracts.ts',
    );
    const source = fs.readFileSync(syncRestPath, 'utf8');
    const loopStart = source.indexOf(
      '\tfor ( const [ baseName, contract ] of Object.entries( REST_ENDPOINT_MANIFEST.contracts ) ) {',
    );
    const openApiStart = source.indexOf('\n\n\tawait syncRestOpenApi(', loopStart);
    expect(loopStart).toBeGreaterThan(-1);
    expect(openApiStart).toBeGreaterThan(loopStart);
    const schemaLoop = source.slice(loopStart, openApiStart);
    fs.writeFileSync(
      syncRestPath,
      `${source.slice(0, openApiStart)}\n\n${schemaLoop}${source.slice(openApiStart)}`,
    );

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must call syncTypeSchemas(), syncRestOpenApi(), and syncEndpointClient()',
    );
  });

  test('rejects canonical REST calls that exist only in an unused function', async () => {
    const targetDir = path.join(tempRoot, 'dead-rest-sync-call');
    await scaffoldPersistence(targetDir);
    const syncRestPath = path.join(
      targetDir,
      'scripts',
      'sync-rest-contracts.ts',
    );
    const original = fs.readFileSync(syncRestPath, 'utf8');
    const detachedMain = original.replace(
      'await syncEndpointClient(',
      'await detachedEndpointClient(',
    );
    const unusedCall = [
      '',
      'async function unusedRestSync(options: { check: boolean }) {',
      '\tawait syncEndpointClient( {',
      "\t\tclientFile: 'src/api-client.ts',",
      '\t\tmanifest: REST_ENDPOINT_MANIFEST,',
      "\t\ttypesFile: 'src/api-types.ts',",
      '\t}, {',
      '\t\tcheck: options.check,',
      '\t} );',
      '}',
      '',
    ].join('\n');
    fs.writeFileSync(
      syncRestPath,
      detachedMain.replace(
        'async function main()',
        `${unusedCall}async function main()`,
      ),
    );

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must call syncTypeSchemas(), syncRestOpenApi(), and syncEndpointClient()',
    );
  });

  test('rejects REST sync calls with noncanonical check values or ordering', async () => {
    const checkTarget = path.join(tempRoot, 'wrong-rest-check-value');
    await scaffoldPersistence(checkTarget);
    const checkPath = path.join(
      checkTarget,
      'scripts',
      'sync-rest-contracts.ts',
    );
    fs.writeFileSync(
      checkPath,
      fs
        .readFileSync(checkPath, 'utf8')
        .replace('check: options.check', 'check: false'),
    );
    expect(
      getCheck(
        await getDoctorChecks(checkTarget),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      )?.status,
    ).toBe('fail');

    const orderTarget = path.join(tempRoot, 'wrong-rest-call-order');
    await scaffoldPersistence(orderTarget);
    const orderPath = path.join(
      orderTarget,
      'scripts',
      'sync-rest-contracts.ts',
    );
    const source = fs.readFileSync(orderPath, 'utf8');
    const openApiStart = source.indexOf('\tawait syncRestOpenApi( {');
    const clientStart = source.indexOf('\tawait syncEndpointClient( {');
    const callEndMarker = '\n\t} );';
    const clientEnd =
      source.indexOf(callEndMarker, clientStart) + callEndMarker.length;
    expect(openApiStart).toBeGreaterThan(-1);
    expect(clientStart).toBeGreaterThan(openApiStart);
    expect(clientEnd).toBeGreaterThan(clientStart);
    const openApiCall = source.slice(openApiStart, clientStart);
    const clientCall = source.slice(clientStart, clientEnd);
    fs.writeFileSync(
      orderPath,
      `${source.slice(0, openApiStart)}${clientCall}\n\n${openApiCall.trimEnd()}${source.slice(
        clientEnd,
      )}`,
    );
    expect(
      getCheck(
        await getDoctorChecks(orderTarget),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      )?.status,
    ).toBe('fail');
  });

  test('rejects shadowed endpoint-manifest imports', async () => {
    const targetDir = path.join(tempRoot, 'shadowed-rest-manifest');
    await scaffoldPersistence(targetDir);
    const syncRestPath = path.join(
      targetDir,
      'scripts',
      'sync-rest-contracts.ts',
    );
    const source = fs.readFileSync(syncRestPath, 'utf8').replace(
      'function parseCliOptions',
      'const defineEndpointManifest = <T>(value: T): T => value;\n\nfunction parseCliOptions',
    );
    fs.writeFileSync(syncRestPath, source);

    const checks = await getDoctorChecks(targetDir);
    const sourceLayoutCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );

    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must not shadow its canonical defineEndpointManifest() import binding',
    );
  });

  test('rejects package names that could escape the bootstrap path', async () => {
    const targetDir = path.join(tempRoot, 'unsafe-package-name');
    await scaffoldBasic(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      name: string;
    };
    packageJson.name = String.raw`safe\..\..\sensitive`;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    const checks = await getDoctorChecks(targetDir);
    const bootstrapCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );

    expect(getCheck(checks, STANDALONE_DOCTOR_CODES.PACKAGE)?.status).toBe(
      'fail',
    );
    expect(bootstrapCheck?.status).toBe('fail');
    expect(bootstrapCheck?.detail).toContain(
      'cannot derive a safe project-local plugin bootstrap path',
    );
  });

  test('rejects Plugin Name text outside the leading PHP header comment', async () => {
    const targetDir = path.join(tempRoot, 'misplaced-plugin-header');
    await scaffoldBasic(targetDir);
    fs.writeFileSync(
      path.join(targetDir, 'misplaced-plugin-header.php'),
      "<?php\n$label = 'Plugin Name: Not a plugin header';\n",
    );

    const checks = await getDoctorChecks(targetDir);
    const bootstrapCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );

    expect(bootstrapCheck?.status).toBe('fail');
    expect(bootstrapCheck?.detail).toContain('missing a Plugin Name header');
  });

  test('rejects registration calls outside PHP code regions', async () => {
    const targetDir = path.join(tempRoot, 'registration-outside-php');
    await scaffoldBasic(targetDir);
    const bootstrapPath = path.join(targetDir, 'registration-outside-php.php');
    const bootstrap = fs
      .readFileSync(bootstrapPath, 'utf8')
      .replace(/^<\?php\s*/u, '');
    fs.writeFileSync(bootstrapPath, bootstrap);

    const checks = await getDoctorChecks(targetDir);
    const bootstrapCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );

    expect(bootstrapCheck?.status).toBe('fail');
    expect(bootstrapCheck?.detail).toContain(
      'does not call register_block_type()',
    );
    expect(bootstrapCheck?.detail).toContain(
      'does not hook block registration to init',
    );
  });

  test('rejects Plugin Name fields split across header lines', async () => {
    const targetDir = path.join(tempRoot, 'split-plugin-header');
    await scaffoldBasic(targetDir);
    const bootstrapPath = path.join(targetDir, 'split-plugin-header.php');
    const bootstrap = fs
      .readFileSync(bootstrapPath, 'utf8')
      .replace(
        /Plugin Name:[^\r\n]*/u,
        'Plugin Name:\n * Split Header Fixture',
      );
    fs.writeFileSync(bootstrapPath, bootstrap);

    const checks = await getDoctorChecks(targetDir);
    const bootstrapCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );

    expect(bootstrapCheck?.status).toBe('fail');
    expect(bootstrapCheck?.detail).toContain('missing a Plugin Name header');
  });

  test('measures the WordPress plugin header window in UTF-8 bytes', async () => {
    const targetDir = path.join(tempRoot, 'multibyte-plugin-header');
    await scaffoldBasic(targetDir);
    const bootstrapPath = path.join(targetDir, 'multibyte-plugin-header.php');
    const bootstrap = fs
      .readFileSync(bootstrapPath, 'utf8')
      .replace(
        /([\t ]*\*[\t ]*)Plugin Name:/u,
        `$1${'가'.repeat(2800)}\n$1Plugin Name:`,
      );
    const headerOffset = bootstrap.indexOf('Plugin Name:');
    expect(Buffer.byteLength(bootstrap.slice(0, headerOffset), 'utf8')).toBeGreaterThan(
      8 * 1024,
    );
    expect(headerOffset).toBeLessThan(8 * 1024);
    fs.writeFileSync(bootstrapPath, bootstrap);

    const checks = await getDoctorChecks(targetDir);
    const bootstrapCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );

    expect(bootstrapCheck?.status).toBe('fail');
    expect(bootstrapCheck?.detail).toContain('missing a Plugin Name header');
  });

  test('accepts WordPress-recognized Plugin Name lines later in the header region', async () => {
    const targetDir = path.join(tempRoot, 'later-plugin-header');
    await scaffoldBasic(targetDir);
    const bootstrapPath = path.join(targetDir, 'later-plugin-header.php');
    const bootstrap = fs
      .readFileSync(bootstrapPath, 'utf8')
      .replace(/^[\t ]*\*[\t ]*Plugin Name:[^\r\n]*(?:\r?\n)?/mu, '')
      .replace(/\*\//u, '*/\n// Plugin Name: Later Header Fixture');
    fs.writeFileSync(bootstrapPath, bootstrap);

    const checks = await getDoctorChecks(targetDir);
    const bootstrapCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );

    expect(bootstrapCheck?.status).toBe('pass');
  });

  test('accepts WordPress-recognized bare Plugin Name lines in header comments', async () => {
    const targetDir = path.join(tempRoot, 'bare-plugin-header');
    await scaffoldBasic(targetDir);
    const bootstrapPath = path.join(targetDir, 'bare-plugin-header.php');
    const bootstrap = fs
      .readFileSync(bootstrapPath, 'utf8')
      .replace(
        /^[\t ]*\*[\t ]*Plugin Name:[^\r\n]*/mu,
        'Plugin Name: Bare Header Fixture',
      );
    expect(bootstrap).toContain('\nPlugin Name: Bare Header Fixture\n');
    expect(bootstrap).not.toContain('* Plugin Name:');
    fs.writeFileSync(bootstrapPath, bootstrap);

    const checks = await getDoctorChecks(targetDir);
    const bootstrapCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );

    expect(bootstrapCheck?.status).toBe('pass');
  });

  test('accepts customized registration function prefixes', async () => {
    const targetDir = path.join(tempRoot, 'custom-registration-callback');
    await scaffoldBasic(targetDir);
    const bootstrapPath = path.join(
      targetDir,
      'custom-registration-callback.php',
    );
    const bootstrap = fs
      .readFileSync(bootstrapPath, 'utf8')
      .replace(
        /custom_registration_callback_register_block/gu,
        'custom_bootstrap_register_block',
      );
    expect(bootstrap).toContain('custom_bootstrap_register_block');
    expect(bootstrap).not.toContain(
      'custom_registration_callback_register_block',
    );
    fs.writeFileSync(bootstrapPath, bootstrap);

    const checks = await getDoctorChecks(targetDir);
    const bootstrapCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );

    expect(bootstrapCheck?.status).toBe('pass');
  });

  test('ties the init hook callback to the function that registers the block', async () => {
    const targetDir = path.join(tempRoot, 'detached-registration-callback');
    await scaffoldBasic(targetDir);
    const bootstrapPath = path.join(
      targetDir,
      'detached-registration-callback.php',
    );
    const bootstrap = fs
      .readFileSync(bootstrapPath, 'utf8')
      .replace(
        '\tregister_block_type( $build_dir );',
        '\t$registration_was_detached = true;',
      )
      .replace(
        /\nadd_action\( 'init'/u,
        [
          '',
          'function unrelated_register_block() {',
          "\tregister_block_type( __DIR__ . '/build' );",
          '}',
          '',
          "add_action( 'init'",
        ].join('\n'),
      );
    fs.writeFileSync(bootstrapPath, bootstrap);

    const bootstrapCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );
    expect(bootstrapCheck?.status).toBe('fail');
    expect(bootstrapCheck?.detail).toContain(
      'does not hook block registration to init',
    );
    expect(bootstrapCheck?.detail).not.toContain(
      'does not call register_block_type()',
    );
  });

  test('rejects bootstrap init hook text inside PHP strings', async () => {
    const targetDir = path.join(tempRoot, 'string-init-registration');
    await scaffoldBasic(targetDir);
    const bootstrapPath = path.join(
      targetDir,
      'string-init-registration.php',
    );
    const bootstrap = fs.readFileSync(bootstrapPath, 'utf8').replace(
      /\s*add_action\( 'init', '[A-Za-z_][A-Za-z0-9_]*_register_block' \);/u,
      "\n$hook_example = \"add_action( 'init', 'example_register_block' );\";",
    );
    fs.writeFileSync(bootstrapPath, bootstrap);

    const checks = await getDoctorChecks(targetDir);
    const bootstrapCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );

    expect(bootstrapCheck?.status).toBe('fail');
    expect(bootstrapCheck?.detail).toContain(
      'does not hook block registration to init',
    );
  });

  test('rejects bootstrap registration text inside PHP strings', async () => {
    const targetDir = path.join(tempRoot, 'missing-block-registration');
    await scaffoldBasic(targetDir);
    const bootstrapPath = path.join(
      targetDir,
      'missing-block-registration.php',
    );
    const bootstrap = fs.readFileSync(bootstrapPath, 'utf8');
    fs.writeFileSync(
      bootstrapPath,
      bootstrap.replace(
        /\s*register_block_type\( \$build_dir \);/u,
        "\n\t$message = 'register_block_type( $build_dir );';",
      ),
    );

    const checks = await getDoctorChecks(targetDir);
    const bootstrapCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );

    expect(bootstrapCheck?.status).toBe('fail');
    expect(bootstrapCheck?.detail).toContain(
      'does not call register_block_type()',
    );
  });

  test('runs freshness checks through the project-local metadata runtime', async () => {
    const targetDir = path.join(tempRoot, 'project-local-sync-runtime');
    await scaffoldBasic(targetDir);
    runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts');
    const runtimeDir = path.join(
      targetDir,
      'node_modules',
      '@wp-typia',
      'block-runtime',
    );
    fs.rmSync(runtimeDir, { force: true, recursive: true });
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(
      path.join(runtimeDir, 'package.json'),
      JSON.stringify({
        exports: { './metadata-core': './metadata-core.js' },
        name: '@wp-typia/block-runtime',
        type: 'module',
      }),
    );
    fs.writeFileSync(
      path.join(runtimeDir, 'metadata-core.js'),
      [
        'let resolvedByDoctor = false;',
        'export async function runSyncBlockMetadata() {',
        '  return {',
        '    attributeNames: [],',
        '    blockJsonPath: null,',
        '    failure: { code: "unknown-internal-error", message: resolvedByDoctor ? "project-local-runtime-sentinel" : "project-local-resolver-was-not-called", name: "Error" },',
        '    failOnLossy: false,',
        '    failOnPhpWarnings: false,',
        '    jsonSchemaPath: null,',
        '    lossyProjectionWarnings: [],',
        '    manifestPath: null,',
        '    openApiPath: null,',
        '    phpGenerationWarnings: [],',
        '    phpValidatorPath: null,',
        '    status: "error",',
        '    strict: false,',
        '  };',
        '}',
        'export function resolveSyncBlockMetadataPaths(options) {',
        '  resolvedByDoctor = true;',
        '  return {',
        '    blockJsonPath: options.blockJsonFile,',
        '    jsonSchemaPath: null,',
        '    manifestPath: "src/typia.manifest.json",',
        '    openApiPath: null,',
        '    phpValidatorPath: "src/typia-validator.php",',
        '  };',
        '}',
        'export async function syncEndpointClient() {}',
        'export async function syncRestOpenApi() {}',
        'export async function syncTypeSchemas() {}',
        '',
      ].join('\n'),
    );

    const checks = await getDoctorChecks(targetDir);
    const artifactsCheck = getCheck(checks, STANDALONE_DOCTOR_CODES.ARTIFACTS);

    expect(getCheck(checks, STANDALONE_DOCTOR_CODES.DEPENDENCIES)?.status).toBe(
      'pass',
    );
    expect(artifactsCheck?.status).toBe('fail');
    expect(artifactsCheck?.detail).toContain('project-local-runtime-sentinel');
    expect(artifactsCheck?.detail).not.toContain(
      'project-local-resolver-was-not-called',
    );
  }, 20_000);

  test('reports stale persistence REST artifacts', async () => {
    const targetDir = path.join(tempRoot, 'stale-persistence-rest');
    await scaffoldPersistence(targetDir);
    runGeneratedScript(targetDir, 'scripts/sync-project.ts');
    const apiTypesPath = path.join(targetDir, 'src', 'api-types.ts');
    const apiTypes = fs.readFileSync(apiTypesPath, 'utf8');
    const changedApiTypes = apiTypes.replace(
      'tags.MaxLength< 100 >',
      'tags.MaxLength< 101 >',
    );
    expect(changedApiTypes).not.toBe(apiTypes);
    fs.writeFileSync(apiTypesPath, changedApiTypes);

    const checks = await getDoctorChecks(targetDir);
    const artifactsCheck = getCheck(checks, STANDALONE_DOCTOR_CODES.ARTIFACTS);

    expect(artifactsCheck?.status).toBe('fail');
    expect(artifactsCheck?.detail).toContain('Canonical REST sync check failed');
    expect(artifactsCheck?.detail).toContain('api-schemas');
    expect(artifactsCheck?.detail).not.toContain(targetDir);
  }, 60_000);

  test('reports canonical generated-artifact drift without leaking temp paths', async () => {
    const targetDir = path.join(tempRoot, 'stale-standalone');
    await scaffoldBasic(targetDir);
    runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts');

    const blockJsonPath = path.join(targetDir, 'src', 'block.json');
    const blockJson = JSON.parse(fs.readFileSync(blockJsonPath, 'utf8')) as {
      attributes?: Record<string, unknown>;
    };
    blockJson.attributes = {};
    fs.writeFileSync(
      blockJsonPath,
      JSON.stringify(blockJson, null, '\t'),
      'utf8',
    );

    const checks = await getDoctorChecks(targetDir);
    const artifactsCheck = getCheck(checks, STANDALONE_DOCTOR_CODES.ARTIFACTS);

    expect(artifactsCheck?.status).toBe('fail');
    expect(artifactsCheck?.detail).toContain('stale-generated-artifact');
    expect(artifactsCheck?.detail).toContain('./src/block.json (stale)');
    expect(artifactsCheck?.detail).toContain('npm run sync');
    expect(artifactsCheck?.detail).not.toContain(targetDir);
    expect(createDoctorRunSummary(checks).exitCode).toBe(1);
  }, 20_000);

  test('keeps damaged standalone layouts in project scope with actionable failures', async () => {
    const targetDir = path.join(tempRoot, 'damaged-standalone');
    await scaffoldBasic(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      devDependencies: Record<string, string>;
    };
    delete packageJson.devDependencies['@wp-typia/block-runtime'];
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    fs.rmSync(path.join(targetDir, 'src', 'index.tsx'));
    fs.rmSync(path.join(targetDir, 'src', 'types.ts'));
    fs.rmSync(path.join(targetDir, 'damaged-standalone.php'));

    const checks = await getDoctorChecks(targetDir);
    const scopeCheck = checks.find((check) => check.label === 'Doctor scope');
    const sourceLayoutCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    const bootstrapCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );
    const packageCheck = getCheck(checks, STANDALONE_DOCTOR_CODES.PACKAGE);

    expect(scopeCheck?.detail).toContain('Scope: standalone scaffold diagnostics');
    expect(scopeCheck?.detail).not.toContain('environment-only');
    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain('src/index.tsx');
    expect(sourceLayoutCheck?.detail).toContain('src/types.ts');
    expect(bootstrapCheck?.status).toBe('fail');
    expect(bootstrapCheck?.detail).toContain('damaged-standalone.php');
    expect(packageCheck?.status).toBe('fail');
    expect(packageCheck?.detail).toContain('@wp-typia/block-runtime');
    expect(createDoctorRunSummary(checks).exitCode).toBe(1);
  });

  test('passes synchronized standalone package, bootstrap, and artifact checks', async () => {
    const targetDir = path.join(tempRoot, 'synchronized-standalone');
    await scaffoldBasic(targetDir);
    runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts');

    const checks = await getDoctorChecks(targetDir);
    const standaloneChecks = checks.filter((check) =>
      check.code?.startsWith('wp-typia.standalone.'),
    );
    const artifactsCheck = getCheck(checks, STANDALONE_DOCTOR_CODES.ARTIFACTS);
    const serialized = JSON.parse(JSON.stringify({ checks })) as {
      checks: DoctorCheck[];
    };

    expect(standaloneChecks).toHaveLength(5);
    expect(standaloneChecks.every((check) => check.status !== 'fail')).toBe(
      true,
    );
    expect(artifactsCheck?.status).toBe('pass');
    expect(artifactsCheck?.detail).toContain('Canonical artifacts are current');
    expect(formatDoctorCheckLine(artifactsCheck as DoctorCheck)).toMatch(
      /^PASS Standalone generated artifacts:/u,
    );
    expect(
      serialized.checks.find(
        (check) => check.code === STANDALONE_DOCTOR_CODES.ARTIFACTS,
      )?.detail,
    ).toContain('src/typia-validator.php');
    expect(createDoctorRunSummary(checks).exitCode).toBe(0);
  }, 20_000);
});
