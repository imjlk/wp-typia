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

  async function scaffoldInteractivity(targetDir: string): Promise<void> {
    await scaffoldProject({
      projectDir: targetDir,
      templateId: 'interactivity',
      packageManager: 'npm',
      noInstall: true,
      answers: {
        author: 'Test Runner',
        description: 'Standalone doctor interactivity fixture',
        namespace: 'doctor-demo',
        slug: path.basename(targetDir),
        title: 'Standalone Doctor Interactivity Fixture',
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

  test('requires the standalone WordPress lint declaration and config contract', async () => {
    const targetDir = path.join(tempRoot, 'standalone-lint-contract');
    await scaffoldBasic(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const originalPackageJsonSource = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(originalPackageJsonSource) as {
      devDependencies: Record<string, string>;
    };
    delete packageJson.devDependencies['@wp-typia/ttsc-lint-plugin-wp'];
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    const missingDeclarationCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.PACKAGE,
    );
    expect(missingDeclarationCheck?.status).toBe('fail');
    expect(missingDeclarationCheck?.detail).toContain(
      'must declare @wp-typia/ttsc-lint-plugin-wp',
    );

    fs.writeFileSync(packageJsonPath, originalPackageJsonSource);
    const wrongContributorPackageJson = JSON.parse(
      originalPackageJsonSource,
    ) as {
      devDependencies: Record<string, string>;
    };
    const managedContributorVersion =
      wrongContributorPackageJson.devDependencies[
        '@wp-typia/ttsc-lint-plugin-wp'
      ];
    wrongContributorPackageJson.devDependencies[
      '@wp-typia/ttsc-lint-plugin-wp'
    ] = '0.0.0';
    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify(wrongContributorPackageJson, null, 2),
    );
    const wrongContributorVersionCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.PACKAGE,
    );
    expect(wrongContributorVersionCheck?.status).toBe('fail');
    expect(wrongContributorVersionCheck?.detail).toContain(
      `@wp-typia/ttsc-lint-plugin-wp dependency must be exactly ${managedContributorVersion}`,
    );

    fs.writeFileSync(packageJsonPath, originalPackageJsonSource);
    const wrongToolchainPackageJson = JSON.parse(
      originalPackageJsonSource,
    ) as {
      devDependencies: Record<string, string>;
    };
    const managedLintVersion =
      wrongToolchainPackageJson.devDependencies['@ttsc/lint'];
    wrongToolchainPackageJson.devDependencies['@ttsc/lint'] = '0.22.0';
    wrongToolchainPackageJson.devDependencies.ttsc = '0.22.0';
    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify(wrongToolchainPackageJson, null, 2),
    );
    const wrongToolchainVersionCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.PACKAGE,
    );
    expect(wrongToolchainVersionCheck?.status).toBe('fail');
    expect(wrongToolchainVersionCheck?.detail).toContain(
      '@ttsc/lint dependency must be exactly',
    );
    expect(wrongToolchainVersionCheck?.detail).toContain(
      'ttsc dependency must satisfy',
    );

    wrongToolchainPackageJson.devDependencies['@ttsc/lint'] =
      managedLintVersion;
    wrongToolchainPackageJson.devDependencies.ttsc = '>=1 <1';
    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify(wrongToolchainPackageJson, null, 2),
    );
    const emptyToolchainRangeCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.PACKAGE,
    );
    expect(emptyToolchainRangeCheck?.status).toBe('fail');
    expect(emptyToolchainRangeCheck?.detail).toContain(
      'ttsc dependency must satisfy',
    );

    fs.writeFileSync(packageJsonPath, originalPackageJsonSource);
    const executionPackageJson = JSON.parse(originalPackageJsonSource) as {
      scripts: Record<string, string>;
    };
    delete executionPackageJson.scripts['check:code'];
    delete executionPackageJson.scripts.check;
    executionPackageJson.scripts.postinstall =
      'node --check scripts/apply-ttsc-lint-compat.mjs';
    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify(executionPackageJson, null, 2),
    );
    const compatPath = path.join(
      targetDir,
      'scripts',
      'apply-ttsc-lint-compat.mjs',
    );
    const compatSource = fs.readFileSync(compatPath, 'utf8');
    fs.rmSync(compatPath);
    const missingExecutionCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.PACKAGE,
    );
    expect(missingExecutionCheck?.status).toBe('fail');
    expect(missingExecutionCheck?.detail).toContain(
      'package.json check:code must invoke `ttsc check --noEmit`',
    );
    expect(missingExecutionCheck?.detail).toContain(
      'package.json check must include the check:code lane',
    );
    expect(missingExecutionCheck?.detail).toContain(
      'missing or stale scripts/apply-ttsc-lint-compat.mjs',
    );
    expect(missingExecutionCheck?.detail).toContain(
      'postinstall must invoke scripts/apply-ttsc-lint-compat.mjs',
    );

    executionPackageJson.scripts['check:code'] =
      'npx --version ttsc check --noEmit';
    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify(executionPackageJson, null, 2),
    );
    fs.writeFileSync(compatPath, compatSource);
    const terminalRunnerCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.PACKAGE,
    );
    expect(terminalRunnerCheck?.status).toBe('fail');
    expect(terminalRunnerCheck?.detail).toContain(
      'package.json check:code must invoke `ttsc check --noEmit`',
    );
    fs.writeFileSync(packageJsonPath, originalPackageJsonSource);
    fs.writeFileSync(compatPath, compatSource);

    const lintConfigPath = path.join(targetDir, 'lint.config.mts');
    const originalLintConfigSource = fs.readFileSync(lintConfigPath, 'utf8');
    fs.writeFileSync(
      lintConfigPath,
      originalLintConfigSource.replace(
        "allowedTextDomain: 'standalone-lint-contract'",
        "allowedTextDomain: 'wrong-domain'",
      ),
    );
    const wrongDomainCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.PACKAGE,
    );
    expect(wrongDomainCheck?.status).toBe('fail');
    expect(wrongDomainCheck?.detail).toContain(
      'bind wordpress/i18n-text-domain to "standalone-lint-contract"',
    );

    fs.rmSync(lintConfigPath);
    const missingConfigCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.PACKAGE,
    );
    expect(missingConfigCheck?.status).toBe('fail');
    expect(missingConfigCheck?.detail).toContain('missing ttsc lint config');
  });

  test('requires each scaffold family source surface', async () => {
    const fixtures = [
      {
        files: ['src/validator-toolkit.ts', 'src/style.scss'],
        name: 'basic-source-surface',
        scaffold: scaffoldBasic,
      },
      {
        files: ['src/interactivity-store.ts'],
        name: 'interactivity-source-surface',
        scaffold: scaffoldInteractivity,
      },
      {
        files: [
          'src/api.ts',
          'src/data.ts',
          'src/transport.ts',
          'inc/rest-auth.php',
        ],
        name: 'persistence-source-surface',
        scaffold: scaffoldPersistence,
      },
    ] as const;

    for (const fixture of fixtures) {
      const targetDir = path.join(tempRoot, fixture.name);
      await fixture.scaffold(targetDir);
      expect(
        getCheck(
          await getDoctorChecks(targetDir),
          STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
        )?.status,
      ).toBe('pass');
      for (const relativePath of fixture.files) {
        const filePath = path.join(targetDir, relativePath);
        const source = fs.readFileSync(filePath);
        fs.rmSync(filePath);

        const sourceLayoutCheck = getCheck(
          await getDoctorChecks(targetDir),
          STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
        );
        expect(sourceLayoutCheck?.status).toBe('fail');
        expect(sourceLayoutCheck?.detail).toContain(relativePath);

        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, source);
      }
    }
  }, 30_000);

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

  test(
    'accepts dependencies hoisted by a declaring ancestor workspace',
    async () => {
      const ancestorDir = path.join(tempRoot, 'workspace-dependencies');
      const targetDir = path.join(ancestorDir, 'standalone-project');
      await scaffoldBasic(targetDir);
      fs.writeFileSync(
        path.join(ancestorDir, 'package.json'),
        `${JSON.stringify(
          {
            private: true,
            workspaces: ['standalone-project'],
          },
          null,
          2,
        )}\n`,
      );
      linkWorkspaceNodeModules(targetDir);
      fs.renameSync(
        path.join(targetDir, 'node_modules'),
        path.join(ancestorDir, 'node_modules'),
      );

      const dependenciesCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.DEPENDENCIES,
      );

      expect(dependenciesCheck?.status).toBe('pass');
    },
    15_000,
  );

  test(
    'accepts dependencies hoisted by a pnpm workspace declaration',
    async () => {
      const ancestorDir = path.join(tempRoot, 'pnpm-workspace-dependencies');
      const targetDir = path.join(ancestorDir, 'standalone-project');
      await scaffoldBasic(targetDir);
      fs.writeFileSync(
        path.join(ancestorDir, 'package.json'),
        '{"private":true}\n',
      );
      fs.writeFileSync(
        path.join(ancestorDir, 'pnpm-workspace.yaml'),
        'packages: ["unused # literal", "standalone-project"] # fixture\n',
      );
      linkWorkspaceNodeModules(targetDir);
      fs.renameSync(
        path.join(targetDir, 'node_modules'),
        path.join(ancestorDir, 'node_modules'),
      );

      const dependenciesCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.DEPENDENCIES,
      );

      expect(dependenciesCheck?.status).toBe('pass');
    },
    15_000,
  );

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
      ['ttsc', 'ttsc/package.json'],
      ['@ttsc/lint', '@ttsc/lint/package.json'],
      [
        '@wp-typia/ttsc-lint-plugin-wp',
        '@wp-typia/ttsc-lint-plugin-wp/package.json',
      ],
      ['@wordpress/block-editor', '@wordpress/block-editor/package.json'],
      ['@wordpress/blocks', '@wordpress/blocks/package.json'],
      ['@wordpress/components', '@wordpress/components/package.json'],
      ['@wordpress/element', '@wordpress/element/package.json'],
      ['@wordpress/i18n', '@wordpress/i18n/package.json'],
      ['@wordpress/scripts', '@wordpress/scripts/bin/wp-scripts.js'],
      ['@ttsc/unplugin', '@ttsc/unplugin/webpack'],
    ] as const;
    const resolvedPackages = requiredPackages.map(
      ([packageName, resolutionSpecifier]) => [
        projectRequire.resolve(resolutionSpecifier),
        packageName,
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
        'fixture-reference',
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
    fs.rmSync(path.join(targetDir, 'node_modules', 'ttsc'), {
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
    expect(dependenciesCheck?.detail).toContain('ttsc/ttsx');
    expect(dependenciesCheck?.detail).toContain('@wordpress/scripts');
    expect(getCheck(checks, STANDALONE_DOCTOR_CODES.ARTIFACTS)?.status).toBe(
      'warn',
    );
  }, 20_000);

  test('requires the installed WordPress ttsc lint contributor', async () => {
    const targetDir = path.join(tempRoot, 'missing-wordpress-lint-contributor');
    await scaffoldBasic(targetDir);
    linkWorkspaceNodeModules(targetDir);
    fs.rmSync(
      path.join(
        targetDir,
        'node_modules',
        '@wp-typia',
        'ttsc-lint-plugin-wp',
      ),
      { force: true, recursive: true },
    );

    const dependenciesCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.DEPENDENCIES,
    );
    expect(dependenciesCheck?.status).toBe('fail');
    expect(dependenciesCheck?.detail).toContain(
      '@wp-typia/ttsc-lint-plugin-wp',
    );
  }, 20_000);

  test('requires the installed Typia webpack plugin from the standalone project', async () => {
    const targetDir = path.join(tempRoot, 'missing-typia-webpack-plugin');
    await scaffoldBasic(targetDir);
    runGeneratedScript(targetDir, 'scripts/sync-types-to-block-json.ts');
    fs.rmSync(path.join(targetDir, 'node_modules', '@ttsc', 'unplugin'), {
      force: true,
      recursive: true,
    });

    const checks = await getDoctorChecks(targetDir);
    const dependenciesCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.DEPENDENCIES,
    );

    expect(dependenciesCheck?.status).toBe('fail');
    expect(dependenciesCheck?.detail).toContain('@ttsc/unplugin/webpack');
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

  test('requires WordPress runtime dependencies used by standalone scaffolds', async () => {
    const basicTarget = path.join(tempRoot, 'missing-wordpress-declarations');
    await scaffoldBasic(basicTarget);
    const basicPackagePath = path.join(basicTarget, 'package.json');
    const basicPackage = JSON.parse(
      fs.readFileSync(basicPackagePath, 'utf8'),
    ) as { dependencies: Record<string, string> };
    delete basicPackage.dependencies['@wordpress/blocks'];
    delete basicPackage.dependencies['@wordpress/element'];
    fs.writeFileSync(basicPackagePath, JSON.stringify(basicPackage, null, 2));

    const basicPackageCheck = getCheck(
      await getDoctorChecks(basicTarget),
      STANDALONE_DOCTOR_CODES.PACKAGE,
    );
    expect(basicPackageCheck?.status).toBe('fail');
    expect(basicPackageCheck?.detail).toContain(
      'must declare @wordpress/blocks',
    );
    expect(basicPackageCheck?.detail).toContain(
      'must declare @wordpress/element',
    );

    const persistenceTarget = path.join(
      tempRoot,
      'missing-persistence-wordpress-declarations',
    );
    await scaffoldPersistence(persistenceTarget);
    const persistencePackagePath = path.join(
      persistenceTarget,
      'package.json',
    );
    const persistencePackage = JSON.parse(
      fs.readFileSync(persistencePackagePath, 'utf8'),
    ) as { dependencies: Record<string, string> };
    for (const packageName of [
      '@wordpress/api-fetch',
      '@wordpress/data',
      '@wordpress/interactivity',
    ]) {
      delete persistencePackage.dependencies[packageName];
    }
    fs.writeFileSync(
      persistencePackagePath,
      JSON.stringify(persistencePackage, null, 2),
    );

    const persistencePackageCheck = getCheck(
      await getDoctorChecks(persistenceTarget),
      STANDALONE_DOCTOR_CODES.PACKAGE,
    );
    expect(persistencePackageCheck?.status).toBe('fail');
    expect(persistencePackageCheck?.detail).toContain(
      'must declare @wordpress/api-fetch',
    );
    expect(persistencePackageCheck?.detail).toContain(
      'must declare @wordpress/data',
    );
    expect(persistencePackageCheck?.detail).toContain(
      'must declare @wordpress/interactivity',
    );

    const installationTarget = path.join(
      tempRoot,
      'missing-wordpress-installation',
    );
    await scaffoldBasic(installationTarget);
    linkWorkspaceNodeModules(installationTarget);
    fs.rmSync(
      path.join(
        installationTarget,
        'node_modules',
        '@wordpress',
        'element',
      ),
      { force: true, recursive: true },
    );

    const dependenciesCheck = getCheck(
      await getDoctorChecks(installationTarget),
      STANDALONE_DOCTOR_CODES.DEPENDENCIES,
    );
    expect(dependenciesCheck?.status).toBe('fail');
    expect(dependenciesCheck?.detail).toContain('@wordpress/element');
  }, 30_000);

  test('requires the persistence sync-rest package script', async () => {
    const targetDir = path.join(tempRoot, 'persistence-sync-rest-script');
    await scaffoldPersistence(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const originalPackageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, 'utf8'),
    ) as { scripts: Record<string, string> };
    const originalChecks = await getDoctorChecks(targetDir);
    expect(
      getCheck(originalChecks, STANDALONE_DOCTOR_CODES.PACKAGE)?.status,
    ).toBe('pass');
    expect(
      getCheck(originalChecks, STANDALONE_DOCTOR_CODES.BOOTSTRAP)?.status,
    ).toBe('pass');
    expect(
      getCheck(originalChecks, STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT)?.status,
    ).toBe('pass');
    const cases = [
      {
        expected: 'must define the sync-rest script',
        script: undefined,
      },
      {
        expected:
          'sync-rest script must invoke `ttsx scripts/sync-rest-contracts.ts`',
        script: 'node -e "process.exit(0)"',
      },
      {
        expected:
          'sync-rest script must propagate failures from `ttsx scripts/sync-rest-contracts.ts`',
        script: 'ttsx scripts/sync-rest-contracts.ts || true',
      },
    ] as const;

    for (const fixture of cases) {
      const packageJson = {
        ...originalPackageJson,
        scripts: { ...originalPackageJson.scripts },
      };
      if (fixture.script === undefined) {
        delete packageJson.scripts['sync-rest'];
      } else {
        packageJson.scripts['sync-rest'] = fixture.script;
      }
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

      const packageCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.PACKAGE,
      );
      expect(packageCheck?.status).toBe('fail');
      expect(packageCheck?.detail).toContain(fixture.expected);
    }
  }, 20_000);

  test('requires start to sync before launching wp-scripts', async () => {
    const targetDir = path.join(tempRoot, 'damaged-start-script');
    await scaffoldBasic(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const originalPackageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, 'utf8'),
    ) as { scripts: Record<string, string> };
    const cases = [
      {
        expected: 'must define the start script',
        script: undefined,
      },
      {
        expected: 'start script must invoke `npm run sync`',
        script: 'wp-scripts start --experimental-modules',
      },
      {
        expected:
          'start script must run `npm run sync` before `wp-scripts start` in the same && command list',
        script: 'wp-scripts start --experimental-modules && npm run sync',
      },
      {
        expected:
          'start script must propagate failures from `npm run sync`',
        script:
          'npm run sync || true && wp-scripts start --experimental-modules',
      },
    ] as const;

    for (const fixture of cases) {
      const packageJson = {
        ...originalPackageJson,
        scripts: { ...originalPackageJson.scripts },
      };
      if (fixture.script === undefined) {
        delete packageJson.scripts.start;
      } else {
        packageJson.scripts.start = fixture.script;
      }
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

      const packageCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.PACKAGE,
      );
      expect(packageCheck?.status).toBe('fail');
      expect(packageCheck?.detail).toContain(fixture.expected);
    }
  }, 20_000);

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
      'sync script must invoke `ttsx scripts/sync-project.ts`',
    );
  });

  test('rejects package sync commands after changing directories', async () => {
    const targetDir = path.join(tempRoot, 'directory-changing-sync');
    await scaffoldBasic(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    const invalidScripts = [
      'cd other && ttsx scripts/sync-project.ts',
      "'cd' other && ttsx scripts/sync-project.ts",
      String.raw`c\d other && ttsx scripts/sync-project.ts`,
      'EMPTY= cd other && ttsx scripts/sync-project.ts',
      '{ cd other; }; ttsx scripts/sync-project.ts',
      'CMD=cd && $CMD other && ttsx scripts/sync-project.ts',
      '$(printf cd) other && ttsx scripts/sync-project.ts',
      'command -p cd other && ttsx scripts/sync-project.ts',
      "eval 'cd other' && ttsx scripts/sync-project.ts",
      `CMD='cd other'; eval "$CMD" && ttsx scripts/sync-project.ts`,
      'enter() { cd other; }; enter && ttsx scripts/sync-project.ts',
      "eval 'command cd other' && ttsx scripts/sync-project.ts",
      "eval 'enter() { cd other; }; enter' && ttsx scripts/sync-project.ts",
    ];
    for (const script of invalidScripts) {
      packageJson.scripts.sync = script;
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

      const packageCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.PACKAGE,
      );

      expect(packageCheck?.status).toBe('fail');
      expect(packageCheck?.detail).toContain(
        'sync script must invoke `ttsx scripts/sync-project.ts`',
      );
    }
  }, 15_000);

  test('allows non-directory eval setup before generated sync helpers', async () => {
    const targetDir = path.join(tempRoot, 'eval-environment-sync');
    await scaffoldBasic(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    packageJson.scripts.sync =
      "eval 'FOO=bar' && ttsx scripts/sync-project.ts";
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    const packageCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.PACKAGE,
    );

    expect(packageCheck?.status).toBe('pass');
  });

  test('rejects check-only generated sync package scripts', async () => {
    const cases = [
      {
        command: 'ttsx scripts/sync-project.ts',
        name: 'sync',
        scaffold: scaffoldBasic,
      },
      {
        command: 'ttsx scripts/sync-types-to-block-json.ts',
        name: 'sync-types',
        scaffold: scaffoldBasic,
      },
      {
        command: 'ttsx scripts/sync-rest-contracts.ts',
        name: 'sync-rest',
        scaffold: scaffoldPersistence,
      },
    ] as const;
    for (const fixture of cases) {
      const targetDir = path.join(
        tempRoot,
        `check-only-package-${fixture.name}`,
      );
      await fixture.scaffold(targetDir);
      const packageJsonPath = path.join(targetDir, 'package.json');
      const packageJson = JSON.parse(
        fs.readFileSync(packageJsonPath, 'utf8'),
      ) as { scripts: Record<string, string> };
      packageJson.scripts[fixture.name] += ' --check';
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

      const packageCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.PACKAGE,
      );
      expect(packageCheck?.status).toBe('fail');
      expect(packageCheck?.detail).toContain(
        `${fixture.name} script must invoke \`${fixture.command}\``,
      );
    }
  }, 20_000);

  test('rejects package scripts that only echo canonical command text', async () => {
    const targetDir = path.join(tempRoot, 'echoed-package-scripts');
    await scaffoldBasic(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    packageJson.scripts.sync = "echo 'ttsx scripts/sync-project.ts'";
    packageJson.scripts.build =
      "echo 'npm run sync -- --check' && wp-scripts build --experimental-modules";
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    const checks = await getDoctorChecks(targetDir);
    const packageCheck = getCheck(checks, STANDALONE_DOCTOR_CODES.PACKAGE);

    expect(packageCheck?.status).toBe('fail');
    expect(packageCheck?.detail).toContain(
      'sync script must invoke `ttsx scripts/sync-project.ts`',
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
      'echo disabled # && ttsx scripts/sync-project.ts';
    packageJson.scripts['sync-types'] =
      'echo disabled\n# | ttsx scripts/sync-types-to-block-json.ts';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    const checks = await getDoctorChecks(targetDir);
    const packageCheck = getCheck(checks, STANDALONE_DOCTOR_CODES.PACKAGE);

    expect(packageCheck?.status).toBe('fail');
    expect(packageCheck?.detail).toContain(
      'sync script must invoke `ttsx scripts/sync-project.ts`',
    );
    expect(packageCheck?.detail).toContain(
      'sync-types script must invoke `ttsx scripts/sync-types-to-block-json.ts`',
    );
  });

  test('rejects package scripts that mask generated sync failures', async () => {
    const targetDir = path.join(tempRoot, 'masked-package-sync');
    await scaffoldBasic(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    packageJson.scripts.sync += ' || true';
    packageJson.scripts['sync-types'] += ' &';
    packageJson.scripts.build += ' || true';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    const packageCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.PACKAGE,
    );

    expect(packageCheck?.status).toBe('fail');
    expect(packageCheck?.detail).toContain(
      'sync script must propagate failures from `ttsx scripts/sync-project.ts`',
    );
    expect(packageCheck?.detail).toContain(
      'sync-types script must propagate failures from `ttsx scripts/sync-types-to-block-json.ts`',
    );
    expect(packageCheck?.detail).toContain(
      'build script must propagate failures from `npm run sync -- --check`',
    );
  });

  test('accepts package sync scripts guarded by a failing shell exit', async () => {
    const targetDir = path.join(tempRoot, 'failing-exit-package-sync');
    await scaffoldPersistence(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    for (const scriptName of ['sync', 'sync-types', 'sync-rest']) {
      packageJson.scripts[scriptName] += ' || exit 1';
    }
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    const packageCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.PACKAGE,
    );

    expect(packageCheck?.status).toBe('pass');
  });

  test('rejects package sync scripts guarded by a successful shell exit', async () => {
    const targetDir = path.join(tempRoot, 'successful-exit-package-sync');
    await scaffoldBasic(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    packageJson.scripts.sync += ' || exit 0';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    const packageCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.PACKAGE,
    );

    expect(packageCheck?.status).toBe('fail');
    expect(packageCheck?.detail).toContain(
      'sync script must propagate failures from `ttsx scripts/sync-project.ts`',
    );
  });

  test('rejects canonical package commands behind a constant-false guard', async () => {
    const targetDir = path.join(tempRoot, 'unreachable-package-sync');
    await scaffoldBasic(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    packageJson.scripts.sync =
      'false && ttsx scripts/sync-project.ts';
    packageJson.scripts.build =
      'false && npm run sync -- --check && wp-scripts build --experimental-modules';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    const packageCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.PACKAGE,
    );

    expect(packageCheck?.status).toBe('fail');
    expect(packageCheck?.detail).toContain(
      'sync script must invoke `ttsx scripts/sync-project.ts`',
    );
    expect(packageCheck?.detail).toContain(
      'build script must invoke `npm run sync -- --check`',
    );
  });

  test('rejects canonical package commands after a successful shell exit', async () => {
    const targetDir = path.join(tempRoot, 'exited-package-sync');
    await scaffoldBasic(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    packageJson.scripts.sync =
      'exit 0; ttsx scripts/sync-project.ts';
    packageJson.scripts.build =
      'exit 0; npm run sync -- --check && wp-scripts build --experimental-modules';
    packageJson.scripts['check:code'] =
      'exit 0; npm run sync -- --check && ttsc check --noEmit';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    const packageCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.PACKAGE,
    );

    expect(packageCheck?.status).toBe('fail');
    for (const scriptName of ['sync', 'build', 'check:code']) {
      expect(packageCheck?.detail).toContain(
        `${scriptName} script must invoke`,
      );
    }
  });

  test('handles many unreachable shell exits without recursive expansion', async () => {
    const targetDir = path.join(tempRoot, 'many-unreachable-shell-exits');
    await scaffoldBasic(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    const skippedExits = Array.from(
      { length: 64 },
      () => 'false && exit 0',
    ).join('; ');
    packageJson.scripts.sync =
      `${skippedExits}; ttsx scripts/sync-project.ts`;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    const packageCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.PACKAGE,
    );

    expect(packageCheck?.status).toBe('pass');
  });

  test('accepts canonical package commands after shell control operators', async () => {
    const targetDir = path.join(tempRoot, 'background-package-scripts');
    await scaffoldBasic(targetDir);
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    packageJson.scripts.sync =
      "# generated wrapper follows\nprintf 'running standalone sync\\n' & ttsx scripts/sync-project.ts";
    packageJson.scripts['sync-types'] =
      "printf 'metadata\\n' | ttsx scripts/sync-types-to-block-json.ts";
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

  test('requires canonical standalone block artifact paths', async () => {
    const mutations = [
      ['blockJsonFile', 'src/block.json', 'src/other-block.json'],
      ['manifestFile', 'src/typia.manifest.json', 'src/other.manifest.json'],
    ] as const;
    for (const [propertyName, canonicalPath, damagedPath] of mutations) {
      const targetDir = path.join(
        tempRoot,
        `noncanonical-${propertyName}`,
      );
      await scaffoldBasic(targetDir);
      const syncScriptPath = path.join(
        targetDir,
        'scripts',
        'sync-types-to-block-json.ts',
      );
      const original = fs.readFileSync(syncScriptPath, 'utf8');
      const source = original.replace(
        `${propertyName}: '${canonicalPath}'`,
        `${propertyName}: '${damagedPath}'`,
      );
      expect(source).not.toBe(original);
      fs.writeFileSync(syncScriptPath, source);

      const checks = await getDoctorChecks(targetDir);
      const sourceLayoutCheck = getCheck(
        checks,
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
      expect(sourceLayoutCheck?.detail).toContain(
        'must use canonical src/block.json and src/typia.manifest.json artifact paths',
      );
      expect(getCheck(checks, STANDALONE_DOCTOR_CODES.ARTIFACTS)?.status).toBe(
        'fail',
      );
    }
  });

  test('rejects standalone sync helpers that override projectRoot', async () => {
    const targetDir = path.join(tempRoot, 'overridden-sync-project-root');
    await scaffoldBasic(targetDir);
    const syncScriptPath = path.join(
      targetDir,
      'scripts',
      'sync-types-to-block-json.ts',
    );
    const original = fs.readFileSync(syncScriptPath, 'utf8');
    const source = original.replace(
      "blockJsonFile: 'src/block.json',",
      "projectRoot: '..',\n      blockJsonFile: 'src/block.json',",
    );
    expect(source).not.toBe(original);
    fs.writeFileSync(syncScriptPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );

    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must not override projectRoot',
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
    const original = fs.readFileSync(syncScriptPath, 'utf8');
    const source = original
      .replace(
        "      blockJsonFile: 'src/block.json',",
        "      ...{ blockJsonFile: 'src/block.json' },",
      )
      .replace('      sourceTypeName:', "      ['sourceTypeName']:");
    expect(source).not.toBe(original);
    fs.writeFileSync(syncScriptPath, source);

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

  test('rejects non-literal optional standalone sync artifact paths', async () => {
    const configuredValues = {
      jsonSchemaFile: "'src/typia.schema.json'",
      manifestFile: "'src/typia.manifest.json'",
      openApiFile: "'src/typia.openapi.json'",
    } as const;
    const propertyNames = [
      'jsonSchemaFile',
      'manifestFile',
      'openApiFile',
      'phpValidatorFile',
    ] as const;

    for (const [index, propertyName] of propertyNames.entries()) {
      const targetDir = path.join(
        tempRoot,
        `non-literal-optional-artifact-${index}`,
      );
      await scaffoldPersistence(targetDir);
      const syncScriptPath = path.join(
        targetDir,
        'scripts',
        'sync-types-to-block-json.ts',
      );
      const original = fs.readFileSync(syncScriptPath, 'utf8');
      const source =
        propertyName === 'phpValidatorFile'
          ? original.replace(
              'sourceTypeName:',
              'phpValidatorFile: process.env.WP_TYPIA_ARTIFACT_PATH,\n\t\tsourceTypeName:',
            )
          : original.replace(
              `${propertyName}: ${configuredValues[propertyName]},`,
              `${propertyName}: process.env.WP_TYPIA_ARTIFACT_PATH,`,
            );
      expect(source).not.toBe(original);
      fs.writeFileSync(syncScriptPath, source);

      const checks = await getDoctorChecks(targetDir);
      const sourceLayoutCheck = getCheck(
        checks,
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
      expect(sourceLayoutCheck?.detail).toContain(
        `optional artifact path ${propertyName} as a static string value`,
      );
      expect(getCheck(checks, STANDALONE_DOCTOR_CODES.ARTIFACTS)?.status).toBe(
        'fail',
      );
    }
  }, 30_000);

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

  test('rejects the legacy metadata sync API behind a canonical alias', async () => {
    const targetDir = path.join(tempRoot, 'legacy-sync-binding');
    await scaffoldBasic(targetDir);
    const syncScriptPath = path.join(
      targetDir,
      'scripts',
      'sync-types-to-block-json.ts',
    );
    const original = fs.readFileSync(syncScriptPath, 'utf8');
    const source = original.replace(
      'import { runSyncBlockMetadata }',
      'import { syncBlockMetadata as runSyncBlockMetadata }',
    );
    expect(source).not.toBe(original);
    fs.writeFileSync(syncScriptPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
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

  test('rejects canonical sync calls that exist only in an unused function', async () => {
    const targetDir = path.join(tempRoot, 'dead-type-sync-call');
    await scaffoldBasic(targetDir);
    const syncScriptPath = path.join(
      targetDir,
      'scripts',
      'sync-types-to-block-json.ts',
    );
    const original = fs.readFileSync(syncScriptPath, 'utf8');
    const detachedMain = original.replace(
      'const report = await runSyncBlockMetadata(',
      'const report = await detachedSyncBlockMetadata(',
    );
    expect(detachedMain).not.toBe(original);
    const unusedCall = [
      'async function unusedTypeSync(options: { check: boolean }) {',
      '  const report = await runSyncBlockMetadata({',
      "    blockJsonFile: 'src/block.json',",
      "    manifestFile: 'src/typia.manifest.json',",
      "    sourceTypeName: 'DeadTypeSyncAttributes',",
      "    typesFile: 'src/types.ts',",
      '  }, {',
      '    check: options.check,',
      '  });',
      '  return report;',
      '}',
      '',
    ].join('\n');
    fs.writeFileSync(
      syncScriptPath,
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
      'must import and call runSyncBlockMetadata()',
    );
  });

  test('rejects sync-types helpers that stop forwarding --check', async () => {
    const targetDir = path.join(tempRoot, 'sync-types-without-check');
    await scaffoldBasic(targetDir);
    const syncScriptPath = path.join(
      targetDir,
      'scripts',
      'sync-types-to-block-json.ts',
    );
    const original = fs.readFileSync(syncScriptPath, 'utf8');
    const source = original.replace('check: options.check', 'check: false');
    expect(source).not.toBe(original);
    fs.writeFileSync(syncScriptPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must import and call runSyncBlockMetadata()',
    );
  });

  test('rejects sync-types warning policies that doctor cannot replay', async () => {
    const strictGuard = [
      "    if (argument === '--strict') {",
      '      options.strict = true;',
      '      continue;',
      '    }',
    ].join('\n');
    const lossyGuard = [
      "    if (argument === '--fail-on-lossy') {",
      '      options.failOnLossy = true;',
      '      continue;',
      '    }',
    ].join('\n');
    const checkGuard = [
      "    if (argument === '--check') {",
      '      options.check = true;',
      '      continue;',
      '    }',
    ].join('\n');
    const mutations = [
      ['strict-execution', 'strict: options.strict', 'strict: true'],
      [
        'unexpected-execution',
        'strict: options.strict,',
        'strict: options.strict,\n    failOnPhpWarnings: true,',
      ],
      ['strict-default', 'strict: false,', 'strict: true,'],
      [
        'lossy-parser',
        'options.failOnLossy = true;',
        'options.failOnLossy = false;',
      ],
      [
        'unreachable-warning-flags',
        [strictGuard, lossyGuard, checkGuard].join('\n\n'),
        [checkGuard, '    continue;', strictGuard, lossyGuard].join(
          '\n\n',
        ),
      ],
      [
        'skipped-strict-guard',
        strictGuard,
        [
          "    if (argument === '--strict') { continue; }",
          strictGuard,
        ].join('\n'),
      ],
      [
        'throw-before-strict-guard',
        strictGuard,
        ["    throw new Error('stop');", strictGuard].join('\n'),
      ],
    ] as const;
    for (const [name, canonicalSource, damagedSource] of mutations) {
      const targetDir = path.join(tempRoot, `sync-warning-policy-${name}`);
      await scaffoldBasic(targetDir);
      const syncScriptPath = path.join(
        targetDir,
        'scripts',
        'sync-types-to-block-json.ts',
      );
      const original = fs.readFileSync(syncScriptPath, 'utf8');
      const source = original.replace(canonicalSource, damagedSource);
      expect(source).not.toBe(original);
      fs.writeFileSync(syncScriptPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
    }
  }, 20_000);

  test('requires sync-types error reports to set a failing exit code', async () => {
    const mutations = [
      [
        'wrong-status',
        "if (report.status === 'error') {\n    process.exitCode = 1;",
        "if (report.status === 'success') {\n    process.exitCode = 1;",
      ],
      [
        'zero-exit-code',
        "if (report.status === 'error') {\n    process.exitCode = 1;",
        "if (report.status === 'error') {\n    process.exitCode = 0;",
      ],
      [
        'overridden-exit-code',
        "  if (report.status === 'error') {\n    process.exitCode = 1;\n  }\n}",
        "  if (report.status === 'error') {\n    process.exitCode = 1;\n  }\n  process.exitCode = 0;\n}",
      ],
      [
        'return-after-guard',
        "  if (report.status === 'error') {\n    process.exitCode = 1;\n  }\n}",
        "  if (report.status === 'error') {\n    process.exitCode = 1;\n  }\n  return;\n}",
      ],
      [
        'mutated-report-status',
        "  if (report.status === 'error') {\n    process.exitCode = 1;",
        "  report.status = 'success';\n\n  if (report.status === 'error') {\n    process.exitCode = 1;",
      ],
    ] as const;
    for (const [name, canonicalSource, damagedSource] of mutations) {
      const targetDir = path.join(tempRoot, `sync-report-exit-${name}`);
      await scaffoldBasic(targetDir);
      const syncScriptPath = path.join(
        targetDir,
        'scripts',
        'sync-types-to-block-json.ts',
      );
      const original = fs.readFileSync(syncScriptPath, 'utf8');
      const source = original.replace(canonicalSource, damagedSource);
      expect(source).not.toBe(original);
      fs.writeFileSync(syncScriptPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
    }
  }, 20_000);

  test('rejects missing or side-effectful metadata report handling', async () => {
    const mutations = [
      [
        'missing-rendering',
        [
          "  if (options.report === 'json') {",
          '    process.stdout.write(`${JSON.stringify(report, null, 2)}\\n`);',
          '  } else {',
          '    printHumanReport(options, report);',
          '  }',
          '',
        ].join('\n'),
        '',
      ],
      [
        'extra-statement',
        "  if (options.report === 'json') {",
        [
          "  process.getBuiltinModule('node:fs').writeFileSync('src/block.json', '{}');",
          "  if (options.report === 'json') {",
        ].join('\n'),
      ],
      [
        'report-helper',
        "    console.error('❌ Type sync failed:', report.failure.message);",
        [
          "    process.getBuiltinModule('node:fs').writeFileSync('src/block.json', '{}');",
          "    console.error('❌ Type sync failed:', report.failure.message);",
        ].join('\n'),
      ],
    ] as const;
    for (const [name, canonicalSource, damagedSource] of mutations) {
      const targetDir = path.join(tempRoot, `sync-report-side-effect-${name}`);
      await scaffoldBasic(targetDir);
      const syncScriptPath = path.join(
        targetDir,
        'scripts',
        'sync-types-to-block-json.ts',
      );
      const original = fs.readFileSync(syncScriptPath, 'utf8');
      const source = original.replace(canonicalSource, damagedSource);
      expect(source).not.toBe(original);
      fs.writeFileSync(syncScriptPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
    }
  }, 20_000);

  test('rejects top-level execution before generated helper main calls', async () => {
    const cases = [
      {
        name: 'sync-types-exit',
        prefix: 'process.exit(0);',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-types-to-block-json.ts'),
      },
      {
        name: 'sync-project-throw',
        prefix: "throw new Error('stop');",
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
      },
      {
        name: 'sync-project-double-main',
        prefix: 'main();',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
      },
      {
        name: 'sync-rest-exit',
        prefix: 'process.exit(0);',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
      },
      {
        name: 'sync-rest-double-main',
        prefix: 'main();',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
      },
      {
        name: 'sync-types-side-effect',
        prefix:
          "process.getBuiltinModule('node:fs').writeFileSync('src/unchecked.txt', 'x');",
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-types-to-block-json.ts'),
      },
      {
        name: 'sync-project-side-effect',
        prefix:
          "process.getBuiltinModule('node:fs').writeFileSync('src/unchecked.txt', 'x');",
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
      },
      {
        name: 'sync-rest-side-effect',
        prefix:
          "process.getBuiltinModule('node:fs').writeFileSync('src/unchecked.txt', 'x');",
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
      },
      {
        name: 'sync-types-side-effectful-constant',
        prefix:
          "const hidden = process.getBuiltinModule('node:fs').writeFileSync('src/unchecked.txt', 'x');",
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-types-to-block-json.ts'),
      },
      {
        name: 'sync-types-class-static-block',
        prefix:
          "class Hidden { static { process.getBuiltinModule('node:fs').writeFileSync('src/unchecked.txt', 'x'); } }",
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-types-to-block-json.ts'),
      },
      {
        name: 'sync-types-side-effect-import',
        prefix: "import './unchecked-side-effect.js';",
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-types-to-block-json.ts'),
      },
      {
        name: 'sync-project-shadowed-error',
        prefix: [
          'function Error( message: string ) {',
          "\tprocess.chdir( '..' );",
          '\treturn new globalThis.Error( message );',
          '}',
        ].join('\n'),
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
      },
      {
        name: 'sync-rest-shadowed-object',
        prefix: 'function Object() {}',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
      },
    ] as const;
    for (const fixture of cases) {
      const targetDir = path.join(tempRoot, fixture.name);
      await fixture.scaffold(targetDir);
      const scriptPath = path.join(targetDir, fixture.script);
      const original = fs.readFileSync(scriptPath, 'utf8');
      const source = original.replace(
        /main\(\)\.catch/u,
        `${fixture.prefix}\n\nmain().catch`,
      );
      expect(source).not.toBe(original);
      fs.writeFileSync(scriptPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
    }
  }, 60_000);

  test('rejects noncanonical generated helper function signatures', async () => {
    const cases = [
      {
        canonical: 'async function main()',
        damaged: "async function main( hidden = process.chdir( '..' ) )",
        name: 'sync-types-main-default',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-types-to-block-json.ts'),
      },
      {
        canonical: 'async function main()',
        damaged: 'async function* main()',
        name: 'sync-project-generator-main',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
      },
      {
        canonical: 'async function main()',
        damaged: "async function main( hidden = process.chdir( '..' ) )",
        name: 'sync-rest-main-default',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
      },
      {
        canonical: 'function parseCliOptions',
        damaged: 'async function parseCliOptions',
        name: 'sync-types-async-parser',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-types-to-block-json.ts'),
      },
      {
        canonical: 'function parseCliOptions',
        damaged: 'async function parseCliOptions',
        name: 'sync-project-async-parser',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
      },
      {
        canonical: 'function parseCliOptions',
        damaged: 'function* parseCliOptions',
        name: 'sync-rest-generator-parser',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
      },
      {
        canonical:
          'function runSyncScript(scriptPath: string, options: SyncCliOptions)',
        damaged:
          'function* runSyncScript(scriptPath: string, options: SyncCliOptions)',
        name: 'sync-project-generator-runner',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
      },
      {
        canonical:
          'function runSyncScript(scriptPath: string, options: SyncCliOptions)',
        damaged:
          'function runSyncScript(scriptPath: string, ...options: SyncCliOptions[])',
        name: 'sync-project-rest-runner-parameter',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
      },
      {
        canonical: 'async function assertTypeArtifactsCurrent()',
        damaged: 'async function* assertTypeArtifactsCurrent()',
        name: 'sync-rest-generator-preflight',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
      },
    ] as const;
    for (const fixture of cases) {
      const targetDir = path.join(tempRoot, fixture.name);
      await fixture.scaffold(targetDir);
      const scriptPath = path.join(targetDir, fixture.script);
      const original = fs.readFileSync(scriptPath, 'utf8');
      const source = original.replace(fixture.canonical, fixture.damaged);
      expect(source).not.toBe(original);
      fs.writeFileSync(scriptPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
    }
  }, 40_000);

  test('rejects trailing work after the REST main failure boundary', async () => {
    const targetDir = path.join(tempRoot, 'sync-rest-after-main');
    await scaffoldPersistence(targetDir);
    const syncRestPath = path.join(
      targetDir,
      'scripts',
      'sync-rest-contracts.ts',
    );
    fs.appendFileSync(syncRestPath, '\nprocess.exit(0);\n');

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
  });

  test('rejects a successful process exit before the catch failure exit', async () => {
    const targetDir = path.join(tempRoot, 'sync-catch-early-success');
    await scaffoldBasic(targetDir);
    const syncScriptPath = path.join(
      targetDir,
      'scripts',
      'sync-types-to-block-json.ts',
    );
    const original = fs.readFileSync(syncScriptPath, 'utf8');
    const source = original.replace(
      "console.error('❌ Type sync failed:', error);",
      "console.error('❌ Type sync failed:', error);\n  process.exit(0);",
    );
    expect(source).not.toBe(original);
    fs.writeFileSync(syncScriptPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
  });

  test('rejects sync-types helpers that stop parsing the process --check flag', async () => {
    const mutations = [
      ['argv', 'process.argv.slice(2)', '[]'],
      ['assignment', 'options.check = true', 'options.check = false'],
      [
        'unreachable',
        'for (let index = 0; index < argv.length; index += 1) {',
        'for (let index = 0; index < argv.length; index += 1) {\n    break;',
      ],
      [
        'nested-unreachable',
        'for (let index = 0; index < argv.length; index += 1) {',
        'for (let index = 0; index < argv.length; index += 1) {\n    if ( true ) { break; }',
      ],
      [
        'prior-flag-break',
        'options.strict = true;\n      continue;',
        'options.strict = true;\n      break;',
      ],
      [
        'computed-check-accessor',
        'check: false,',
        [
          'check: false,',
          '    set [String("check")](_value: boolean) {},',
          '    get [String("check")]() { return false; },',
        ].join('\n'),
      ],
    ] as const;
    for (const [name, canonicalSource, damagedSource] of mutations) {
      const targetDir = path.join(tempRoot, `sync-types-parser-${name}`);
      await scaffoldBasic(targetDir);
      const syncScriptPath = path.join(
        targetDir,
        'scripts',
        'sync-types-to-block-json.ts',
      );
      const original = fs.readFileSync(syncScriptPath, 'utf8');
      const source = original.replace(canonicalSource, damagedSource);
      expect(source).not.toBe(original);
      fs.writeFileSync(syncScriptPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
    }
  }, 20_000);

  test('requires the canonical sync-types report parser branch', async () => {
    const reportGuard = [
      "    if (argument === '--report') {",
      '      const reportMode = argv[index + 1];',
      "      if (reportMode !== 'json') {",
      "        throw new Error('The `--report` flag currently supports only `json`.');",
      '      }',
      '      options.report = reportMode;',
      '      index += 1;',
      '      continue;',
      '    }',
      '',
    ].join('\n');
    const mutations = [
      ['default', "report: 'human',", "report: 'json',"],
      ['guard', reportGuard, ''],
    ] as const;
    for (const [name, canonicalSource, damagedSource] of mutations) {
      const targetDir = path.join(tempRoot, `sync-report-parser-${name}`);
      await scaffoldBasic(targetDir);
      const syncScriptPath = path.join(
        targetDir,
        'scripts',
        'sync-types-to-block-json.ts',
      );
      const original = fs.readFileSync(syncScriptPath, 'utf8');
      const source = original.replace(canonicalSource, damagedSource);
      expect(source).not.toBe(original);
      fs.writeFileSync(syncScriptPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
    }
  });

  test('allows type-only process imports in standalone sync helpers', async () => {
    const cases = [
      {
        name: 'sync-types',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-types-to-block-json.ts'),
      },
      {
        name: 'sync-project',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
      },
      {
        name: 'sync-rest',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
      },
    ] as const;
    for (const fixture of cases) {
      const targetDir = path.join(
        tempRoot,
        `type-only-process-${fixture.name}`,
      );
      await fixture.scaffold(targetDir);
      const scriptPath = path.join(targetDir, fixture.script);
      const original = fs.readFileSync(scriptPath, 'utf8');
      const source =
        "import type * as process from 'node:process';\n\n" + original;
      expect(source).not.toBe(original);
      fs.writeFileSync(scriptPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('pass');
    }
  }, 20_000);

  test('rejects type-only imports for executable sync bindings', async () => {
    const cases = [
      {
        name: 'metadata-runner',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-types-to-block-json.ts'),
        canonical: 'import { runSyncBlockMetadata }',
        damaged: 'import { type runSyncBlockMetadata }',
      },
      {
        name: 'spawn-runner',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
        canonical: 'import { spawnSync }',
        damaged: 'import { type spawnSync }',
      },
      {
        name: 'fs-default',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
        canonical: "import fs from 'node:fs';",
        damaged: "import type fs from 'node:fs';",
      },
      {
        name: 'rest-runner',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
        canonical: '  syncEndpointClient,',
        damaged: '  type syncEndpointClient,',
      },
    ] as const;
    for (const fixture of cases) {
      const targetDir = path.join(
        tempRoot,
        `type-only-runtime-${fixture.name}`,
      );
      await fixture.scaffold(targetDir);
      const scriptPath = path.join(targetDir, fixture.script);
      const original = fs.readFileSync(scriptPath, 'utf8');
      const source = original.replace(fixture.canonical, fixture.damaged);
      expect(source).not.toBe(original);
      fs.writeFileSync(scriptPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
    }
  }, 30_000);

  test('rejects extra load-time imports from generated helper runtimes', async () => {
    const cases = [
      {
        canonical: 'import { runSyncBlockMetadata }',
        damaged: 'import { missingExport, runSyncBlockMetadata }',
        name: 'sync-types',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-types-to-block-json.ts'),
      },
      {
        canonical: 'import { spawnSync }',
        damaged: 'import { missingExport, spawnSync }',
        name: 'sync-project',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
      },
      {
        canonical: '  defineEndpointManifest,',
        damaged: '  defineEndpointManifest,\n  missingExport,',
        name: 'sync-rest',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
      },
      {
        canonical: '/* eslint-disable no-console */',
        damaged: [
          '/* eslint-disable no-console */',
          "import missingDefault from '@wp-typia/block-runtime/metadata-core';",
        ].join('\n'),
        name: 'sync-rest-default',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
      },
    ] as const;
    for (const fixture of cases) {
      const targetDir = path.join(tempRoot, `extra-runtime-${fixture.name}`);
      await fixture.scaffold(targetDir);
      const scriptPath = path.join(targetDir, fixture.script);
      const original = fs.readFileSync(scriptPath, 'utf8');
      const source = original.replace(fixture.canonical, fixture.damaged);
      expect(source).not.toBe(original);
      fs.writeFileSync(scriptPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
    }
  }, 30_000);

  test('allows nested loop completions that preserve parser flow', async () => {
    const targetDir = path.join(tempRoot, 'nested-local-completions');
    await scaffoldBasic(targetDir);
    const syncTypesPath = path.join(
      targetDir,
      'scripts',
      'sync-types-to-block-json.ts',
    );
    const syncTypes = fs.readFileSync(syncTypesPath, 'utf8');
    const syncTypesWithNestedLoop = syncTypes.replace(
      "    if (argument === '--check') {",
      [
        '    breakLoop: for (const item of []) {',
        '      if (!item) break breakLoop;',
        '    }',
        '    continueLoop: for (const item of []) {',
        '      if (!item) continue continueLoop;',
        '    }',
        '',
        "    if (argument === '--check') {",
      ].join('\n'),
    );
    expect(syncTypesWithNestedLoop).not.toBe(syncTypes);
    fs.writeFileSync(syncTypesPath, syncTypesWithNestedLoop);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('pass');

    const persistenceDir = path.join(
      tempRoot,
      'nested-local-completions-rest',
    );
    await scaffoldPersistence(persistenceDir);
    const syncRestPath = path.join(
      persistenceDir,
      'scripts',
      'sync-rest-contracts.ts',
    );
    const syncRest = fs.readFileSync(syncRestPath, 'utf8');
    const syncRestWithNestedLoops = syncRest.replace(
      "    if (argument === '--check') {",
      [
        '    breakLoop: for (const item of []) {',
        '      if (!item) break breakLoop;',
        '    }',
        '    continueLoop: for (const item of []) {',
        '      if (!item) continue continueLoop;',
        '    }',
        '',
        "    if (argument === '--check') {",
      ].join('\n'),
    );
    expect(syncRestWithNestedLoops).not.toBe(syncRest);
    fs.writeFileSync(syncRestPath, syncRestWithNestedLoops);

    const restSourceLayoutCheck = getCheck(
      await getDoctorChecks(persistenceDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(restSourceLayoutCheck?.status).toBe('pass');
  }, 20_000);

  test('rejects executable specifier-level type imports in sync helpers', async () => {
    const targetDir = path.join(tempRoot, 'specifier-type-import');
    await scaffoldBasic(targetDir);
    const syncTypesPath = path.join(
      targetDir,
      'scripts',
      'sync-types-to-block-json.ts',
    );
    const original = fs.readFileSync(syncTypesPath, 'utf8');
    fs.writeFileSync(
      syncTypesPath,
      "import { type Hidden } from './unchecked-side-effect.js';\n" +
        original,
    );

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
  });

  test('rejects noncanonical generated main catch handlers', async () => {
    const cases = [
      {
        canonical: 'main().catch((error) => {',
        damaged: 'main().catch(function* (error) {',
        name: 'sync-project-generator-catch',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
      },
      {
        canonical: "  console.error('❌ Project sync failed:', error);",
        damaged: [
          "  process.getBuiltinModule('node:fs').writeFileSync('src/unchecked.txt', 'x');",
          "  console.error('❌ Project sync failed:', error);",
        ].join('\n'),
        name: 'sync-project-side-effect-catch',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
      },
      {
        canonical: "  console.error('❌ REST contract sync failed:', error);",
        damaged: [
          "  process.getBuiltinModule('node:fs').writeFileSync('src/unchecked.txt', 'x');",
          "  console.error('❌ REST contract sync failed:', error);",
        ].join('\n'),
        name: 'sync-rest-side-effect-catch',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
      },
    ] as const;
    for (const fixture of cases) {
      const targetDir = path.join(tempRoot, fixture.name);
      await fixture.scaffold(targetDir);
      const scriptPath = path.join(targetDir, fixture.script);
      const original = fs.readFileSync(scriptPath, 'utf8');
      const source = original.replace(fixture.canonical, fixture.damaged);
      expect(source).not.toBe(original);
      fs.writeFileSync(scriptPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
    }
  }, 30_000);

  test('rejects parser accessors that neutralize --check assignments', async () => {
    const cases = [
      {
        insertionLine: '  for (const argument of argv) {',
        name: 'sync-project-parser-accessor',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
        statementIndentation: '    ',
      },
      {
        insertionLine: '  for (const argument of argv) {',
        name: 'sync-rest-parser-accessor',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
        statementIndentation: '    ',
      },
      {
        insertionLine: '    const argument = argv[index];',
        name: 'sync-types-parser-accessor',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-types-to-block-json.ts'),
        statementIndentation: '    ',
      },
    ] as const;
    for (const fixture of cases) {
      const targetDir = path.join(tempRoot, fixture.name);
      await fixture.scaffold(targetDir);
      const scriptPath = path.join(targetDir, fixture.script);
      const original = fs.readFileSync(scriptPath, 'utf8');
      const indentation = fixture.statementIndentation;
      const source = original.replace(
        fixture.insertionLine,
        [
          fixture.insertionLine,
          `${indentation}Object.defineProperty( options, 'check', {`,
          `${indentation}\tget: () => false,`,
          `${indentation}\tset: () => {},`,
          `${indentation}} );`,
        ].join('\n'),
      );
      expect(source).not.toBe(original);
      fs.writeFileSync(scriptPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
    }
  }, 20_000);

  test('rejects unrelated runtime effects in generated option parsers', async () => {
    const cases = [
      {
        guard: "    if (argument === '--check') {",
        name: 'sync-project-parser-chdir',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
        statement: "    process.chdir('..');",
      },
      {
        guard: "    if (argument === '--check') {",
        name: 'sync-rest-parser-write',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
        statement:
          "    process.getBuiltinModule('node:fs').writeFileSync('src/unchecked.txt', 'x');",
      },
      {
        guard: "    if (argument === '--check') {",
        name: 'sync-types-parser-eval',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-types-to-block-json.ts'),
        statement: '    eval( \'process.chdir("..")\' );',
      },
      {
        guard: "    if (argument === '--check') {",
        name: 'sync-project-parser-for-of-write',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
        statement: "    for (process.env.PWNED of ['1']) {}",
      },
      {
        guard: "    if (argument === '--check') {",
        name: 'sync-rest-parser-infinite-loop',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
        statement: '    while (true) {}',
      },
      {
        guard: "    if (argument === '--check') {",
        name: 'sync-project-parser-array-spread',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
        statement: '    const spread = [...(options as never[])];',
      },
      {
        guard: "    if (argument === '--check') {",
        name: 'sync-rest-parser-object-spread',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
        statement: '    const spread = { ...options };',
      },
    ] as const;
    for (const fixture of cases) {
      const targetDir = path.join(tempRoot, fixture.name);
      await fixture.scaffold(targetDir);
      const scriptPath = path.join(targetDir, fixture.script);
      const original = fs.readFileSync(scriptPath, 'utf8');
      const source = original.replace(
        fixture.guard,
        `${fixture.statement}\n${fixture.guard}`,
      );
      expect(source).not.toBe(original);
      fs.writeFileSync(scriptPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
    }
  }, 30_000);

  test('requires generated parsers to reject unknown flags', async () => {
    const cases = [
      {
        name: 'sync-project',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
        unknownFlagThrow:
          '    throw new Error(`Unknown sync flag: ${argument}`);',
      },
      {
        name: 'sync-rest',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
        unknownFlagThrow:
          '    throw new Error(`Unknown sync-rest flag: ${argument}`);',
      },
    ] as const;
    for (const fixture of cases) {
      const targetDir = path.join(
        tempRoot,
        `${fixture.name}-parser-without-unknown-throw`,
      );
      await fixture.scaffold(targetDir);
      const scriptPath = path.join(targetDir, fixture.script);
      const original = fs.readFileSync(scriptPath, 'utf8');
      const source = original.replace(fixture.unknownFlagThrow, '');
      expect(source).not.toBe(original);
      fs.writeFileSync(scriptPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
    }
  }, 20_000);

  test('handles static wrappers around generated parser errors', async () => {
    const targetDir = path.join(tempRoot, 'wrapped-parser-error');
    await scaffoldBasic(targetDir);
    const syncProjectPath = path.join(
      targetDir,
      'scripts',
      'sync-project.ts',
    );
    const original = fs.readFileSync(syncProjectPath, 'utf8');
    const canonicalThrow =
      '    throw new Error(`Unknown sync flag: ${argument}`);';
    const source = original.replace(
      canonicalThrow,
      '    throw (new Error(`Unknown sync flag: ${argument}`));',
    );
    expect(source).not.toBe(original);
    fs.writeFileSync(syncProjectPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('pass');
  });

  test('rejects extra outer-loop continues after canonical parser guards', async () => {
    for (const fixture of [
      {
        name: 'sync-project',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
      },
      {
        name: 'sync-rest',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
      },
    ] as const) {
      const targetDir = path.join(
        tempRoot,
        `${fixture.name}-parser-extra-continue`,
      );
      await fixture.scaffold(targetDir);
      const scriptPath = path.join(targetDir, fixture.script);
      const original = fs.readFileSync(scriptPath, 'utf8');
      const checkGuard = [
        "    if (argument === '--check') {",
        '      options.check = true;',
        '      continue;',
        '    }',
      ].join('\n');
      const source = original.replace(
        checkGuard,
        [
          checkGuard,
          '',
          "    if (argument !== '--check') continue;",
        ].join('\n'),
      );
      expect(source).not.toBe(original);
      fs.writeFileSync(scriptPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
    }
  }, 20_000);

  test('rejects abrupt completion before generated --check parser guards', async () => {
    const cases = [
      {
        completion: "throw new Error( 'stop' );",
        name: 'sync-project-parser-throw',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
      },
      {
        completion: 'process.exit( 0 );',
        name: 'sync-project-parser-exit',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
      },
      {
        completion: "throw new Error( 'stop' );",
        name: 'sync-rest-parser-throw',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
      },
      {
        completion: 'process.exit( 0 );',
        name: 'sync-rest-parser-exit',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
      },
    ] as const;
    for (const fixture of cases) {
      const targetDir = path.join(tempRoot, fixture.name);
      await fixture.scaffold(targetDir);
      const scriptPath = path.join(targetDir, fixture.script);
      const original = fs.readFileSync(scriptPath, 'utf8');
      const source = original.replace(
        /(\n[ \t]*if \(argument === '--check'\) \{)/u,
        `\n    ${fixture.completion}$1`,
      );
      expect(source).not.toBe(original);
      fs.writeFileSync(scriptPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
    }
  }, 30_000);

  test('rejects mutable for-of bindings in standalone parsers', async () => {
    const cases = [
      {
        name: 'sync-project',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
      },
      {
        name: 'sync-rest',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
      },
    ] as const;
    for (const fixture of cases) {
      const targetDir = path.join(
        tempRoot,
        `mutable-parser-binding-${fixture.name}`,
      );
      await fixture.scaffold(targetDir);
      const scriptPath = path.join(targetDir, fixture.script);
      const original = fs.readFileSync(scriptPath, 'utf8');
      const source = original.replace(
        'for (const argument of argv) {',
        "for (let argument of argv) {\n    argument = '';",
      );
      expect(source).not.toBe(original);
      fs.writeFileSync(scriptPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
    }
  }, 20_000);

  test('rejects sync-types calls hidden after conditional early returns', async () => {
    const targetDir = path.join(tempRoot, 'sync-types-after-return');
    await scaffoldBasic(targetDir);
    const syncScriptPath = path.join(
      targetDir,
      'scripts',
      'sync-types-to-block-json.ts',
    );
    const original = fs.readFileSync(syncScriptPath, 'utf8');
    const source = original.replace(
      'const report = await runSyncBlockMetadata(',
      'if ( true ) { return; }\n\tconst report = await runSyncBlockMetadata(',
    );
    expect(source).not.toBe(original);
    fs.writeFileSync(syncScriptPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
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
      .replace(/\n\s*runSyncScript\(syncTypesScriptPath, options\);/u, '');
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

  test('rejects extra sync-project work after type delegation', async () => {
    const targetDir = path.join(tempRoot, 'sync-project-post-delegation');
    await scaffoldBasic(targetDir);
    const syncProjectPath = path.join(
      targetDir,
      'scripts',
      'sync-project.ts',
    );
    const original = fs.readFileSync(syncProjectPath, 'utf8');
    const source = original.replace(
      '  runSyncScript(syncTypesScriptPath, options);',
      [
        '  runSyncScript(syncTypesScriptPath, options);',
        "  fs.writeFileSync(path.join(process.cwd(), 'src', 'block.json'), '{}');",
      ].join('\n'),
    );
    expect(source).not.toBe(original);
    fs.writeFileSync(syncProjectPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must keep only the canonical optional REST delegation and completion report after type sync',
    );
  });

  test('rejects check-mode mutations before generated sync work', async () => {
    const cases = [
      {
        name: 'sync-project',
        optionsLine: '  const options = parseCliOptions(process.argv.slice(2));',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-project.ts'),
      },
      {
        name: 'sync-rest',
        optionsLine: '  const options = parseCliOptions(process.argv.slice(2));',
        scaffold: scaffoldPersistence,
        script: path.join('scripts', 'sync-rest-contracts.ts'),
      },
      {
        name: 'sync-types',
        optionsLine: '  const options = parseCliOptions(process.argv.slice(2));',
        scaffold: scaffoldBasic,
        script: path.join('scripts', 'sync-types-to-block-json.ts'),
      },
    ] as const;
    for (const fixture of cases) {
      const indentation = fixture.optionsLine.match(/^\s*/u)?.[0] ?? '';
      const mutations = [
        {
          name: 'next-statement',
          replacement: `${fixture.optionsLine}\n${indentation}options.check = false;`,
        },
        {
          name: 'same-declaration',
          replacement: fixture.optionsLine.replace(
            /;$/u,
            ', hidden = ( options.check = false );',
          ),
        },
      ];
      for (const mutation of mutations) {
        const targetDir = path.join(
          tempRoot,
          `${fixture.name}-check-mode-${mutation.name}`,
        );
        await fixture.scaffold(targetDir);
        const scriptPath = path.join(targetDir, fixture.script);
        const original = fs.readFileSync(scriptPath, 'utf8');
        const source = original.replace(
          fixture.optionsLine,
          mutation.replacement,
        );
        expect(source).not.toBe(original);
        fs.writeFileSync(scriptPath, source);

        const sourceLayoutCheck = getCheck(
          await getDoctorChecks(targetDir),
          STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
        );
        expect(sourceLayoutCheck?.status).toBe('fail');
      }
    }
  }, 30_000);

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
        /\n\s*if \(options\.check\) \{\s*args\.push\('--check'\);\s*\}/u,
        '',
      );
    fs.writeFileSync(syncProjectPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must forward --check through the canonical ttsx runner',
    );
  });

  test('rejects a sync-project runner that stops propagating child failures', async () => {
    const mutations = [
      ['error', 'if (result.error)', 'if (false)'],
      ['status', 'if (result.status !== 0)', 'if (false)'],
      [
        'error-success-exit',
        'if (result.error) {',
        'if (result.error) {\n    process.exit(0);',
      ],
      [
        'status-success-exit',
        'if (result.status !== 0) {',
        'if (result.status !== 0) {\n    process.exit(0);',
      ],
      [
        'error-side-effect',
        'if (result.error) {',
        [
          'if (result.error) {',
          "    fs.writeFileSync('src/unchecked.txt', 'x');",
        ].join('\n'),
      ],
      [
        'status-side-effectful-throw',
        'throw new Error(`Sync script failed: ${scriptPath}`);',
        [
          'throw (',
          "      fs.writeFileSync('src/unchecked.txt', 'x'),",
          '      new Error(`Sync script failed: ${scriptPath}`)',
          '    );',
        ].join('\n'),
      ],
    ] as const;
    for (const [name, originalGuard, damagedGuard] of mutations) {
      const targetDir = path.join(tempRoot, `sync-project-${name}-ignored`);
      await scaffoldBasic(targetDir);
      const syncProjectPath = path.join(
        targetDir,
        'scripts',
        'sync-project.ts',
      );
      const original = fs.readFileSync(syncProjectPath, 'utf8');
      const source = original.replace(originalGuard, damagedGuard);
      expect(source).not.toBe(original);
      fs.writeFileSync(syncProjectPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
      expect(sourceLayoutCheck?.detail).toContain(
        'must forward --check through the canonical ttsx runner',
      );
    }
  }, 20_000);

  test('rejects noncanonical sync-project spawn options', async () => {
    const targetDir = path.join(tempRoot, 'sync-project-spawn-options');
    await scaffoldBasic(targetDir);
    const syncProjectPath = path.join(
      targetDir,
      'scripts',
      'sync-project.ts',
    );
    const original = fs.readFileSync(syncProjectPath, 'utf8');
    const mutations = [
      ['cwd: process.cwd(),', "cwd: '..',"],
      ['env: getSyncScriptEnv(),', 'env: process.env,'],
      ["shell: process.platform === 'win32',", 'shell: true,'],
      ["stdio: 'inherit',", "stdio: 'ignore',"],
    ] as const;
    for (const [canonicalSource, damagedSource] of mutations) {
      const source = original.replace(canonicalSource, damagedSource);
      expect(source).not.toBe(original);
      fs.writeFileSync(syncProjectPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
      expect(sourceLayoutCheck?.detail).toContain(
        'must forward --check through the canonical ttsx runner',
      );
    }
  }, 20_000);

  test('rejects noncanonical sync-project environment helpers', async () => {
    const targetDir = path.join(tempRoot, 'sync-project-environment-helper');
    await scaffoldBasic(targetDir);
    const syncProjectPath = path.join(
      targetDir,
      'scripts',
      'sync-project.ts',
    );
    const original = fs.readFileSync(syncProjectPath, 'utf8');
    const mutations = [
      ["'node_modules', '.bin'", "'vendor', 'bin'"],
      ['process.env.PATH ??', 'process.env.WP_TYPIA_PATH ??'],
      ['...process.env,', 'PATH: inheritedPath,'],
      ['delete env[key];', 'continue;'],
      ['env.PATH = nextPath;', 'env.PATH = inheritedPath;'],
      ['return env;', 'return {};'],
    ] as const;

    for (const [canonicalSource, damagedSource] of mutations) {
      const source = original.replace(canonicalSource, damagedSource);
      expect(source).not.toBe(original);
      fs.writeFileSync(syncProjectPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
      expect(sourceLayoutCheck?.detail).toContain(
        'must forward --check through the canonical ttsx runner',
      );
    }
  }, 20_000);

  test('rejects sync-project runner declarations with mutation side effects', async () => {
    const targetDir = path.join(tempRoot, 'sync-project-runner-mutations');
    await scaffoldBasic(targetDir);
    const syncProjectPath = path.join(
      targetDir,
      'scripts',
      'sync-project.ts',
    );
    const original = fs.readFileSync(syncProjectPath, 'utf8');
    const mutations = [
      [
        'const args = [scriptPath];',
        'const args = [scriptPath], ignoredArgs = [];',
      ],
      [
        '  });',
        '  }), ignored = (result.status = 0);',
      ],
    ] as const;
    for (const [canonicalSource, damagedSource] of mutations) {
      const source = original.replace(canonicalSource, damagedSource);
      expect(source).not.toBe(original);
      fs.writeFileSync(syncProjectPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
      expect(sourceLayoutCheck?.detail).toContain(
        'must forward --check through the canonical ttsx runner',
      );
    }
  }, 20_000);

  test('rejects trailing work after the sync-project runner status guard', async () => {
    const targetDir = path.join(tempRoot, 'sync-project-runner-tail');
    await scaffoldBasic(targetDir);
    const syncProjectPath = path.join(
      targetDir,
      'scripts',
      'sync-project.ts',
    );
    const original = fs.readFileSync(syncProjectPath, 'utf8');
    const canonicalTail = [
      '  if (result.status !== 0) {',
      '    throw new Error(`Sync script failed: ${scriptPath}`);',
      '  }',
      '}',
      '',
      'async function main()',
    ].join('\n');
    const damagedTail = [
      '  if (result.status !== 0) {',
      '    throw new Error(`Sync script failed: ${scriptPath}`);',
      '  }',
      "  fs.writeFileSync('src/unchecked.txt', 'x');",
      '}',
      '',
      'async function main()',
    ].join('\n');
    const source = original.replace(canonicalTail, damagedTail);
    expect(source).not.toBe(original);
    fs.writeFileSync(syncProjectPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
  });

  test('rejects unreachable sync-project failure throws', async () => {
    const targetDir = path.join(tempRoot, 'sync-project-unreachable-throw');
    await scaffoldBasic(targetDir);
    const syncProjectPath = path.join(targetDir, 'scripts', 'sync-project.ts');
    const original = fs.readFileSync(syncProjectPath, 'utf8');
    const source = original.replace(
      '    throw result.error;',
      '    if (true) { return; }\n\n    throw result.error;',
    );
    expect(source).not.toBe(original);
    fs.writeFileSync(syncProjectPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must forward --check through the canonical ttsx runner',
    );
  });

  test('rejects sync-project delegations hidden in dead branches', async () => {
    const targetDir = path.join(tempRoot, 'dead-sync-project-delegation');
    await scaffoldBasic(targetDir);
    const syncProjectPath = path.join(targetDir, 'scripts', 'sync-project.ts');
    const source = fs
      .readFileSync(syncProjectPath, 'utf8')
      .replace(
        '  runSyncScript(syncTypesScriptPath, options);',
        [
          '  if (false) {',
          '    runSyncScript(syncTypesScriptPath, options);',
          '  }',
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
      .replace(/\n\s*runSyncScript\(syncRestScriptPath, options\);/u, '');
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

  test('rejects side effects after the canonical REST client sync', async () => {
    const targetDir = path.join(tempRoot, 'rest-post-sync-side-effect');
    await scaffoldPersistence(targetDir);
    const syncRestPath = path.join(
      targetDir,
      'scripts',
      'sync-rest-contracts.ts',
    );
    const original = fs.readFileSync(syncRestPath, 'utf8');
    const source = original.replace(
      '\n  console.log(',
      [
        '',
        "  process.getBuiltinModule('node:fs').rmSync('src/api-client.ts');",
        '',
        '  console.log(',
      ].join('\n'),
    );
    expect(source).not.toBe(original);
    fs.writeFileSync(syncRestPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must call syncTypeSchemas(), syncRestOpenApi(), and syncEndpointClient()',
    );
  });

  test('rejects REST helpers that skip the type-artifact preflight', async () => {
    const targetDir = path.join(tempRoot, 'rest-without-type-preflight');
    await scaffoldPersistence(targetDir);
    const syncRestPath = path.join(
      targetDir,
      'scripts',
      'sync-rest-contracts.ts',
    );
    const original = fs.readFileSync(syncRestPath, 'utf8');
    const source = original.replace(
      'await assertTypeArtifactsCurrent();',
      'await detachedTypeArtifactsCurrent();',
    );
    expect(source).not.toBe(original);
    fs.writeFileSync(syncRestPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must call syncTypeSchemas(), syncRestOpenApi(), and syncEndpointClient()',
    );
  });

  test('rejects REST helpers with a disabled type-artifact preflight', async () => {
    const mutations = [
      ['write-mode', 'check: true', 'check: false'],
      ['ignored-failure', 'if (report.failure)', 'if (false)'],
      [
        'side-effect-before-throw',
        'if (report.failure) {\n    throw new Error(',
        [
          'if (report.failure) {',
          "    process.getBuiltinModule('node:fs').writeFileSync('src/unchecked.txt', 'x');",
          '    throw new Error(',
        ].join('\n'),
      ],
      [
        'side-effectful-throw-message',
        '${report.failure.message}`',
        "${process.chdir('..')}`",
      ],
    ] as const;
    for (const [name, canonicalSource, damagedSource] of mutations) {
      const targetDir = path.join(tempRoot, `rest-preflight-${name}`);
      await scaffoldPersistence(targetDir);
      const syncRestPath = path.join(
        targetDir,
        'scripts',
        'sync-rest-contracts.ts',
      );
      const original = fs.readFileSync(syncRestPath, 'utf8');
      const source = original.replace(canonicalSource, damagedSource);
      expect(source).not.toBe(original);
      fs.writeFileSync(syncRestPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
    }
  }, 20_000);

  test('rejects REST preflights for a different standalone source type', async () => {
    const targetDir = path.join(tempRoot, 'rest-preflight-source-type');
    await scaffoldPersistence(targetDir);
    const syncTypesSource = fs.readFileSync(
      path.join(targetDir, 'scripts', 'sync-types-to-block-json.ts'),
      'utf8',
    );
    const sourceTypeMatch = syncTypesSource.match(
      /sourceTypeName:\s*'([^']+)'/u,
    );
    expect(sourceTypeMatch?.[1]).toBeTruthy();

    const syncRestPath = path.join(
      targetDir,
      'scripts',
      'sync-rest-contracts.ts',
    );
    const original = fs.readFileSync(syncRestPath, 'utf8');
    const source = original.replace(
      `sourceTypeName: '${sourceTypeMatch?.[1]}',`,
      "sourceTypeName: 'DetachedAttributes',",
    );
    expect(source).not.toBe(original);
    fs.writeFileSync(syncRestPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must call syncTypeSchemas(), syncRestOpenApi(), and syncEndpointClient()',
    );
  }, 20_000);

  test('does not misreport REST calls when sync-types parsing fails first', async () => {
    const targetDir = path.join(tempRoot, 'rest-after-invalid-sync-types');
    await scaffoldPersistence(targetDir);
    const syncTypesPath = path.join(
      targetDir,
      'scripts',
      'sync-types-to-block-json.ts',
    );
    const original = fs.readFileSync(syncTypesPath, 'utf8');
    const source = original.replace(
      'sourceTypeName:',
      'detachedSourceTypeName:',
    );
    expect(source).not.toBe(original);
    fs.writeFileSync(syncTypesPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must define static blockJsonFile, sourceTypeName, and typesFile values',
    );
    expect(sourceLayoutCheck?.detail).not.toContain(
      'must call syncTypeSchemas(), syncRestOpenApi(), and syncEndpointClient()',
    );
  });

  test('rejects REST helpers that stop parsing the process --check flag', async () => {
    const mutations = [
      ['argv', 'process.argv.slice(2)', '[]'],
      ['assignment', 'options.check = true', 'options.check = false'],
      [
        'unreachable',
        'for (const argument of argv) {',
        'for (const argument of argv) {\n    break;',
      ],
      [
        'nested-unreachable',
        'for (const argument of argv) {',
        'for (const argument of argv) {\n    if (true) { break; }',
      ],
      [
        'early-return',
        'for (const argument of argv) {',
        'for (const argument of argv) {\n    if (true) { return options; }',
      ],
    ] as const;
    for (const [name, canonicalSource, damagedSource] of mutations) {
      const targetDir = path.join(tempRoot, `rest-parser-${name}`);
      await scaffoldPersistence(targetDir);
      const syncRestPath = path.join(
        targetDir,
        'scripts',
        'sync-rest-contracts.ts',
      );
      const original = fs.readFileSync(syncRestPath, 'utf8');
      const source = original.replace(canonicalSource, damagedSource);
      expect(source).not.toBe(original);
      fs.writeFileSync(syncRestPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
    }
  }, 60_000);

  test('rejects REST helpers that swallow top-level failures', async () => {
    const targetDir = path.join(tempRoot, 'rest-without-failure-exit');
    await scaffoldPersistence(targetDir);
    const syncRestPath = path.join(
      targetDir,
      'scripts',
      'sync-rest-contracts.ts',
    );
    const original = fs.readFileSync(syncRestPath, 'utf8');
    const source = original.replace('process.exit(1);', 'return;');
    expect(source).not.toBe(original);
    fs.writeFileSync(syncRestPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must call syncTypeSchemas(), syncRestOpenApi(), and syncEndpointClient()',
    );
  });

  test('rejects REST sync calls after an earlier process exit', async () => {
    const targetDir = path.join(tempRoot, 'rest-sync-after-process-exit');
    await scaffoldPersistence(targetDir);
    const syncRestPath = path.join(
      targetDir,
      'scripts',
      'sync-rest-contracts.ts',
    );
    const original = fs.readFileSync(syncRestPath, 'utf8');
    const source = original.replace(
      '  await assertTypeArtifactsCurrent();',
      '  process.exit(0);\n  await assertTypeArtifactsCurrent();',
    );
    expect(source).not.toBe(original);
    fs.writeFileSync(syncRestPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
    expect(sourceLayoutCheck?.detail).toContain(
      'must call syncTypeSchemas(), syncRestOpenApi(), and syncEndpointClient()',
    );
  });

  test.each([
    ['parenthesized', '( process.exit )( 0 );'],
    ['computed', "process[ 'exit' ]( 0 );"],
  ] as const)(
    'rejects REST sync calls after an earlier %s process exit',
    async (name, exitStatement) => {
      const targetDir = path.join(tempRoot, `rest-sync-after-${name}-exit`);
      await scaffoldPersistence(targetDir);
      const syncRestPath = path.join(
        targetDir,
        'scripts',
        'sync-rest-contracts.ts',
      );
      const original = fs.readFileSync(syncRestPath, 'utf8');
      const source = original.replace(
        '  await assertTypeArtifactsCurrent();',
        `  ${exitStatement}\n  await assertTypeArtifactsCurrent();`,
      );
      expect(source).not.toBe(original);
      fs.writeFileSync(syncRestPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
      expect(sourceLayoutCheck?.detail).toContain(
        'must call syncTypeSchemas(), syncRestOpenApi(), and syncEndpointClient()',
      );
    },
  );

  test('rejects unreachable or shadowed REST failure exits', async () => {
    const mutations = [
      [
        'unreachable',
        "console.error('❌ REST contract sync failed:', error);",
        "console.error('❌ REST contract sync failed:', error);\n  if (true) { return; }",
      ],
      [
        'terminated',
        'process.exit(1);',
        'process.exit(0);\n  process.exit(1);',
      ],
      ['shadowed', '/* eslint-disable no-console */', "import process from 'node:process';"],
    ] as const;
    for (const [name, canonicalSource, damagedSource] of mutations) {
      const targetDir = path.join(tempRoot, `rest-failure-exit-${name}`);
      await scaffoldPersistence(targetDir);
      const syncRestPath = path.join(
        targetDir,
        'scripts',
        'sync-rest-contracts.ts',
      );
      const original = fs.readFileSync(syncRestPath, 'utf8');
      const source = original.replace(canonicalSource, damagedSource);
      expect(source).not.toBe(original);
      fs.writeFileSync(syncRestPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
    }
  }, 20_000);

  test('rejects zero-argument REST sync calls in main', async () => {
    const targetDir = path.join(tempRoot, 'zero-argument-rest-sync');
    await scaffoldPersistence(targetDir);
    const syncRestPath = path.join(
      targetDir,
      'scripts',
      'sync-rest-contracts.ts',
    );
    const source = fs.readFileSync(syncRestPath, 'utf8');
    const callStart = source.indexOf('  await syncEndpointClient(');
    const callEndMarker = '\n  );';
    const callEnd = source.indexOf(callEndMarker, callStart);
    expect(callStart).toBeGreaterThan(-1);
    expect(callEnd).toBeGreaterThan(callStart);
    fs.writeFileSync(
      syncRestPath,
      `${source.slice(0, callStart)}  await syncEndpointClient();${source.slice(
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

  test('rejects REST sync calls that override the replay project root', async () => {
    const mutations = [
      [
        'schemas',
        'await syncTypeSchemas(\n      {\n        jsonSchemaFile:',
        "await syncTypeSchemas(\n      {\n        projectRoot: 'detached-root',\n        jsonSchemaFile:",
      ],
      [
        'openapi',
        'await syncRestOpenApi(\n    {\n      manifest:',
        "await syncRestOpenApi(\n    {\n      projectRoot: 'detached-root',\n      manifest:",
      ],
      [
        'client',
        'await syncEndpointClient(\n    {\n      clientFile:',
        "await syncEndpointClient(\n    {\n      projectRoot: 'detached-root',\n      clientFile:",
      ],
    ] as const;
    for (const [name, canonicalSource, damagedSource] of mutations) {
      const targetDir = path.join(tempRoot, `rest-project-root-${name}`);
      await scaffoldPersistence(targetDir);
      const syncRestPath = path.join(
        targetDir,
        'scripts',
        'sync-rest-contracts.ts',
      );
      const original = fs.readFileSync(syncRestPath, 'utf8');
      const source = original.replace(canonicalSource, damagedSource);
      expect(source).not.toBe(original);
      fs.writeFileSync(syncRestPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
      expect(sourceLayoutCheck?.detail).toContain(
        'must call syncTypeSchemas(), syncRestOpenApi(), and syncEndpointClient()',
      );
    }
  }, 30_000);

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
      '  for (const [baseName, contract] of Object.entries(\n    REST_ENDPOINT_MANIFEST.contracts,\n  )) {',
    );
    const openApiStart = source.indexOf(
      '\n\n  await syncRestOpenApi(',
      loopStart,
    );
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
    const openApiStart = source.indexOf('  await syncRestOpenApi(');
    const clientStart = source.indexOf('  await syncEndpointClient(');
    const callEndMarker = '\n  );';
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
  }, 10_000);

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

  test('rejects malformed static endpoint manifest entries without throwing', async () => {
    for (const [name, entry] of [
      ['empty-object', '{}'],
      ['null', 'null'],
      ['path-only', "{ path: '/invalid' }"],
      [
        'invalid-method',
        "{ auth: 'public', method: 'TRACE', operationId: 'invalidMethod', path: '/invalid', responseContract: 'state-response', tags: [ 'Invalid' ] }",
      ],
      [
        'invalid-tag',
        "{ auth: 'public', method: 'GET', operationId: 'invalidTag', path: '/invalid', responseContract: 'state-response', tags: [ 1 ] }",
      ],
      [
        'invalid-auth',
        "{ auth: 'bogus', method: 'GET', operationId: 'invalidAuth', path: '/invalid', responseContract: 'state-response', tags: [ 'Invalid' ] }",
      ],
    ] as const) {
      const targetDir = path.join(tempRoot, `rest-manifest-entry-${name}`);
      await scaffoldPersistence(targetDir);
      const syncRestPath = path.join(
        targetDir,
        'scripts',
        'sync-rest-contracts.ts',
      );
      const original = fs.readFileSync(syncRestPath, 'utf8');
      const source = original.replace(
        '  endpoints: [',
        `  endpoints: [\n    ${entry},`,
      );
      expect(source).not.toBe(original);
      fs.writeFileSync(syncRestPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
      expect(sourceLayoutCheck?.detail).toContain(
        'must define a static endpoint manifest through defineEndpointManifest()',
      );
    }
  }, 35_000);

  test('rejects semantically inconsistent static endpoint manifests', async () => {
    const mutations = [
      {
        mutate(source: string): string {
          return source.replace(
            "responseContract: 'state-response'",
            "responseContract: 'missing-response'",
          );
        },
        name: 'missing-contract',
      },
      {
        mutate(source: string): string {
          return source.replace(
            /operationId:\s*'[^']+'/u,
            "operationId: '123-invalid'",
          );
        },
        name: 'invalid-operation-id',
      },
      {
        mutate(source: string): string {
          return source.replace(
            /operationId:\s*'[^']+'/u,
            "operationId: 'callEndpoint'",
          );
        },
        name: 'emitted-operation-id-collision',
      },
      {
        mutate(source: string): string {
          const operationIds = [
            ...source.matchAll(/operationId:\s*'([^']+)'/gu),
          ].map((match) => match[1]);
          expect(operationIds.length).toBeGreaterThan(1);
          return source.replace(
            `operationId: '${operationIds[1]}'`,
            `operationId: '${operationIds[0]}'`,
          );
        },
        name: 'duplicate-operation-id',
      },
      {
        mutate(source: string): string {
          const operationIds = [
            ...source.matchAll(/operationId:\s*'([^']+)'/gu),
          ].map((match) => match[1]);
          expect(operationIds.length).toBeGreaterThan(1);
          return source
            .replace(
              `operationId: '${operationIds[0]}'`,
              "operationId: 'readState'",
            )
            .replace(
              `operationId: '${operationIds[1]}'`,
              "operationId: 'readStateEndpoint'",
            );
        },
        name: 'cross-operation-id-collision',
      },
      {
        mutate(source: string): string {
          return source.split("'bootstrap-query'").join("'stateQuery'");
        },
        name: 'normalized-contract-collision',
      },
      {
        mutate(source: string): string {
          return source.split("'bootstrap-query'").join("'state-query-'");
        },
        name: 'trailing-contract-collision',
      },
      {
        mutate(source: string): string {
          return source.replace(
            '  endpoints: [',
            [
              '  endpoints: [',
              '    {',
              "      auth: 'public',",
              "      method: 'GET',",
              "      operationId: 'unboundPathCapture',",
              "      path: '/invalid/(?P<id>[^/]+)',",
              "      responseContract: 'state-response',",
              "      tags: ['Invalid'],",
              '    },',
            ].join('\n'),
          );
        },
        name: 'unbound-path-capture',
      },
      {
        mutate(source: string): string {
          return source.replace(
            "      auth: 'public',",
            [
              "      auth: 'public',",
              "      authMode: 'authenticated-rest-nonce',",
            ].join('\n'),
          );
        },
        name: 'conflicting-auth',
      },
    ] as const;
    for (const [mutationIndex, mutation] of mutations.entries()) {
      const targetDir = path.join(
        tempRoot,
        `rest-semantic-${mutationIndex}-${mutation.name.slice(0, 12)}`,
      );
      await scaffoldPersistence(targetDir);
      const syncRestPath = path.join(
        targetDir,
        'scripts',
        'sync-rest-contracts.ts',
      );
      const original = fs.readFileSync(syncRestPath, 'utf8');
      const source = mutation.mutate(original);
      expect(source).not.toBe(original);
      fs.writeFileSync(syncRestPath, source);

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
      expect(sourceLayoutCheck?.detail).toContain(
        'must define a static endpoint manifest through defineEndpointManifest()',
      );
    }
  }, 35_000);

  test('accepts legacy authMode semantics when auth is absent', async () => {
    const targetDir = path.join(tempRoot, 'rest-manifest-legacy-auth-mode');
    await scaffoldPersistence(targetDir);
    const syncRestPath = path.join(
      targetDir,
      'scripts',
      'sync-rest-contracts.ts',
    );
    const original = fs.readFileSync(syncRestPath, 'utf8');
    const source = original.replace(
      "      auth: 'public',",
      [
        "      authMode: 'public-signed-token',",
        '      wordpressAuth: {',
        "        mechanism: 'public-signed-token',",
        "        publicTokenField: 'customToken',",
        '      },',
      ].join('\n'),
    );
    expect(source).not.toBe(original);
    fs.writeFileSync(syncRestPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('pass');
  });

  test('treats unterminated named-capture text as a literal endpoint path', async () => {
    const targetDir = path.join(tempRoot, 'rest-literal-capture-text');
    await scaffoldPersistence(targetDir);
    const syncRestPath = path.join(
      targetDir,
      'scripts',
      'sync-rest-contracts.ts',
    );
    const original = fs.readFileSync(syncRestPath, 'utf8');
    const source = original.replace(
      '  endpoints: [',
      [
        '  endpoints: [',
        '    {',
        "      auth: 'public',",
        "      method: 'GET',",
        "      operationId: 'literalCaptureText',",
        "      path: '/literal/(?P<id>',",
        "      responseContract: 'state-response',",
        "      tags: ['Literal'],",
        '    },',
      ].join('\n'),
    );
    expect(source).not.toBe(original);
    fs.writeFileSync(syncRestPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('pass');
  });

  test('rejects malformed static endpoint manifest info', async () => {
    const targetDir = path.join(tempRoot, 'rest-manifest-info');
    await scaffoldPersistence(targetDir);
    const syncRestPath = path.join(
      targetDir,
      'scripts',
      'sync-rest-contracts.ts',
    );
    const original = fs.readFileSync(syncRestPath, 'utf8');
    const source = original.replace(
      "    version: '1.0.0',",
      '    version: 1,',
    );
    expect(source).not.toBe(original);
    fs.writeFileSync(syncRestPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
  });

  test('rejects side effects attached to the REST manifest declaration', async () => {
    const targetDir = path.join(tempRoot, 'rest-manifest-side-effect');
    await scaffoldPersistence(targetDir);
    const syncRestPath = path.join(
      targetDir,
      'scripts',
      'sync-rest-contracts.ts',
    );
    const original = fs.readFileSync(syncRestPath, 'utf8');
    const source = original.replace(
      'const REST_ENDPOINT_MANIFEST = defineEndpointManifest({',
      [
        "const leaked = process.getBuiltinModule('node:fs').writeFileSync('src/unchecked.txt', 'x'),",
        '  REST_ENDPOINT_MANIFEST = defineEndpointManifest({',
      ].join('\n'),
    );
    expect(source).not.toBe(original);
    fs.writeFileSync(syncRestPath, source);

    const sourceLayoutCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    expect(sourceLayoutCheck?.status).toBe('fail');
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

  test('requires a direct build-directory registration in the init callback', async () => {
    const mutations = [
      ['missing-argument', 'register_block_type( $build_dir );', 'register_block_type();'],
      [
        'missing-assignment',
        /\s*\$build_dir\s*=\s*[A-Za-z_][A-Za-z0-9_]*_get_build_dir\(\);/u,
        '',
      ],
      [
        'reassigned-path',
        'register_block_type( $build_dir );',
        "$build_dir = __DIR__ . '/other';\n\tregister_block_type( $build_dir );",
      ],
      [
        'compound-reassigned-path',
        'register_block_type( $build_dir );',
        "$build_dir .= '/other';\n\tregister_block_type( $build_dir );",
      ],
      [
        'wrong-getter-root',
        "__DIR__ . '/build',",
        "__DIR__ . '/other',",
      ],
      [
        'wrong-argument',
        'register_block_type( $build_dir );',
        '$other_dir = $build_dir;\n\tregister_block_type( $other_dir );',
      ],
      [
        'nested-helper',
        'register_block_type( $build_dir );',
        [
          'function nested_register_block() {',
          '\t\tregister_block_type( $build_dir );',
          '\t}',
        ].join('\n'),
      ],
      [
        'by-reference-nested-helper',
        'register_block_type( $build_dir );',
        [
          'function &nested_register_block() {',
          '\t\tregister_block_type( $build_dir );',
          '\t}',
        ].join('\n'),
      ],
      [
        'anonymous-helper',
        'register_block_type( $build_dir );',
        [
          '$helper = function () use ( $build_dir ) {',
          '\t\tregister_block_type( $build_dir );',
          '\t};',
        ].join('\n'),
      ],
      [
        'arrow-helper',
        'register_block_type( $build_dir );',
        '$helper = fn () => register_block_type( $build_dir );',
      ],
    ] as const;
    for (const [name, canonicalSource, damagedSource] of mutations) {
      const targetDir = path.join(tempRoot, `registration-${name}`);
      await scaffoldBasic(targetDir);
      const bootstrapPath = path.join(
        targetDir,
        `registration-${name}.php`,
      );
      const original = fs.readFileSync(bootstrapPath, 'utf8');
      const source = original.replace(canonicalSource, damagedSource);
      expect(source).not.toBe(original);
      fs.writeFileSync(bootstrapPath, source);

      const bootstrapCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.BOOTSTRAP,
      );
      expect(bootstrapCheck?.status).toBe('fail');
      expect(bootstrapCheck?.detail).toContain(
        'does not hook block registration to init',
      );
    }
  }, 30_000);

  test.each([
    [
      'getter-other',
      'return $candidate;',
      "return __DIR__ . '/other';",
    ],
    [
      'getter-unreachable',
      '\t$candidates = array(',
      [
        "\t$unused_build_dir = __DIR__ . '/build';",
        "\treturn __DIR__ . '/other';",
        '',
        '\t$candidates = array(',
      ].join('\n'),
    ],
    [
      'candidate-reassigned',
      'return $candidate;',
      "$candidate = __DIR__ . '/other';\n\t\t\treturn $candidate;",
    ],
    [
      'candidate-compound-reassigned',
      'return $candidate;',
      "$candidate .= '/other';\n\t\t\treturn $candidate;",
    ],
    [
      'candidates-reassigned',
      '\t);\n\n\tforeach ( $candidates as $candidate ) {',
      [
        '\t);',
        "\t$candidates = array( __DIR__ . '/other' );",
        '',
        '\tforeach ( $candidates as $candidate ) {',
      ].join('\n'),
    ],
    [
      'after-return',
      'register_block_type( $build_dir );',
      'return;\n\n\tregister_block_type( $build_dir );',
    ],
    [
      'after-exit',
      'register_block_type( $build_dir );',
      'exit( 0 );\n\n\tregister_block_type( $build_dir );',
    ],
  ] as const)(
    'rejects damaged build-directory flow: %s',
    async (name, canonicalSource, damagedSource) => {
      const targetDir = path.join(
        tempRoot,
        `damaged-build-flow-${name}`,
      );
      await scaffoldBasic(targetDir);
      const bootstrapPath = path.join(
        targetDir,
        `${path.basename(targetDir)}.php`,
      );
      const original = fs.readFileSync(bootstrapPath, 'utf8');
      const source = original.replace(canonicalSource, damagedSource);
      expect(source).not.toBe(original);
      fs.writeFileSync(bootstrapPath, source);

      const bootstrapCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.BOOTSTRAP,
      );
      expect(bootstrapCheck?.status).toBe('fail');
      expect(bootstrapCheck?.detail).toContain(
        'does not hook block registration to init',
      );
    },
  );

  test('accepts mixed PHP and HTML before init callback registration', async () => {
    const targetDir = path.join(tempRoot, 'mixed-php-html-registration');
    await scaffoldBasic(targetDir);
    const bootstrapPath = path.join(
      targetDir,
      'mixed-php-html-registration.php',
    );
    const original = fs.readFileSync(bootstrapPath, 'utf8');
    const source = original.replace(
      /(function\s+[A-Za-z_][A-Za-z0-9_]*_register_block\s*\(\s*\)\s*\{\n)/u,
      '$1?>\n<div>}</div>\n<?php\n',
    );
    expect(source).not.toBe(original);
    fs.writeFileSync(bootstrapPath, source);

    const bootstrapCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );
    expect(bootstrapCheck?.status).toBe('pass');
  });

  test('requires persistence REST route registration on rest_api_init', async () => {
    const mutations = [
      [
        'missing-hook',
        /\s*add_action\( 'rest_api_init', '[A-Za-z_][A-Za-z0-9_]*_register_routes' \);/u,
        '',
        'does not hook REST route registration to rest_api_init',
      ],
      [
        'missing-route-call',
        /\bregister_rest_route\s*\(/gu,
        'disabled_register_rest_route(',
        'does not call register_rest_route()',
      ],
      [
        'unreachable-route-call',
        /function ([A-Za-z_][A-Za-z0-9_]*_register_routes)\(\) \{/u,
        'function $1() {\n\treturn;',
        'does not hook REST route registration to rest_api_init',
      ],
      [
        'arrow-route-call',
        /\bregister_rest_route\s*\(/gu,
        '$unused = fn /* gap */ () : bool => register_rest_route(',
        'does not hook REST route registration to rest_api_init',
      ],
    ] as const;
    for (const [name, canonicalSource, damagedSource, expected] of mutations) {
      const targetDir = path.join(tempRoot, `rest-bootstrap-${name}`);
      await scaffoldPersistence(targetDir);
      const bootstrapPath = path.join(targetDir, `${path.basename(targetDir)}.php`);
      const original = fs.readFileSync(bootstrapPath, 'utf8');
      const source = original.replace(canonicalSource, damagedSource);
      expect(source).not.toBe(original);
      fs.writeFileSync(bootstrapPath, source);

      const bootstrapCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.BOOTSTRAP,
      );
      expect(bootstrapCheck?.status).toBe('fail');
      expect(bootstrapCheck?.detail).toContain(expected);
    }
  }, 20_000);

  test('accepts direct REST registrations after an unrelated arrow expression', async () => {
    const targetDir = path.join(tempRoot, 'rest-bootstrap-prior-arrow');
    await scaffoldPersistence(targetDir);
    const bootstrapPath = path.join(
      targetDir,
      'rest-bootstrap-prior-arrow.php',
    );
    const original = fs.readFileSync(bootstrapPath, 'utf8');
    const source = original.replace(
      /(function [A-Za-z_][A-Za-z0-9_]*_register_routes\(\) \{\n)/u,
      '$1\t$unused = fn /* gap */ () : bool => true;\n',
    );
    expect(source).not.toBe(original);
    fs.writeFileSync(bootstrapPath, source);

    const bootstrapCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );
    expect(bootstrapCheck?.status).toBe('pass');
  });

  test('requires every generated REST endpoint in the bootstrap callback', async () => {
    const targetDir = path.join(tempRoot, 'rest-bootstrap-route-drift');
    await scaffoldPersistence(targetDir);
    const bootstrapPath = path.join(
      targetDir,
      'rest-bootstrap-route-drift.php',
    );
    const original = fs.readFileSync(bootstrapPath, 'utf8');
    const source = original.replace(
      /(register_rest_route\(\s*)'[^']+',\s*'[^']+',/u,
      "$1'demo/v1',\n\t\t'/noop',",
    );
    expect(source).not.toBe(original);
    fs.writeFileSync(bootstrapPath, source);

    const bootstrapCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );
    expect(bootstrapCheck?.status).toBe('fail');
    expect(bootstrapCheck?.detail).toContain(
      'does not hook REST route registration to rest_api_init',
    );
  });

  test('requires every generated REST method for shared endpoint paths', async () => {
    const targetDir = path.join(tempRoot, 'rest-bootstrap-method-drift');
    await scaffoldPersistence(targetDir);
    const bootstrapPath = path.join(
      targetDir,
      'rest-bootstrap-method-drift.php',
    );
    const original = fs.readFileSync(bootstrapPath, 'utf8');
    const source = original.replace(
      /\n\s*array\(\n\s*'methods'\s*=>\s*WP_REST_Server::CREATABLE,[\s\S]*?\n\s*\),/u,
      '',
    );
    expect(source).not.toBe(original);
    expect(source).toContain('WP_REST_Server::READABLE');
    expect(source).not.toContain('WP_REST_Server::CREATABLE');
    fs.writeFileSync(bootstrapPath, source);

    const bootstrapCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );
    expect(bootstrapCheck?.status).toBe('fail');
    expect(bootstrapCheck?.detail).toContain(
      'does not hook REST route registration to rest_api_init',
    );

    const sourceWithTrailingMethodLookalike = source.replace(
      /(\n\}\n\nfunction [A-Za-z_][A-Za-z0-9_]*_register_block\(\))/u,
      '\n\t$unused_method = WP_REST_Server::CREATABLE;$1',
    );
    expect(sourceWithTrailingMethodLookalike).not.toBe(source);
    fs.writeFileSync(bootstrapPath, sourceWithTrailingMethodLookalike);
    const trailingLookalikeCheck = getCheck(
      await getDoctorChecks(targetDir),
      STANDALONE_DOCTOR_CODES.BOOTSTRAP,
    );
    expect(trailingLookalikeCheck?.status).toBe('fail');
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

  test('requires defineEndpointManifest from the project-local REST runtime', async () => {
    const targetDir = path.join(tempRoot, 'missing-rest-manifest-runtime');
    await scaffoldPersistence(targetDir);
    runGeneratedScript(targetDir, 'scripts/sync-project.ts');
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
        'export function resolveSyncBlockMetadataPaths(options) {',
        '  return {',
        '    blockJsonPath: options.blockJsonFile,',
        '    jsonSchemaPath: options.jsonSchemaFile ?? null,',
        '    manifestPath: options.manifestFile,',
        '    openApiPath: options.openApiFile ?? null,',
        '    phpValidatorPath: options.phpValidatorFile ?? "src/typia-validator.php",',
        '  };',
        '}',
        'export async function runSyncBlockMetadata() { return {}; }',
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
    expect(artifactsCheck?.detail).toContain(
      'does not export defineEndpointManifest()',
    );
  }, 30_000);

  test('rechecks canonical persistence block schema artifacts', async () => {
    const targetDir = path.join(
      tempRoot,
      'missing-persistence-block-schema-artifacts',
    );
    await scaffoldPersistence(targetDir);
    runGeneratedScript(targetDir, 'scripts/sync-project.ts');
    const syncTypesPath = path.join(
      targetDir,
      'scripts',
      'sync-types-to-block-json.ts',
    );
    const original = fs.readFileSync(syncTypesPath, 'utf8');
    const source = original
      .replace(
        /^\s*jsonSchemaFile:\s*['"]src\/typia\.schema\.json['"],\r?\n/mu,
        '',
      )
      .replace(
        /^\s*openApiFile:\s*['"]src\/typia\.openapi\.json['"],\r?\n/mu,
        '',
      );
    expect(source).not.toBe(original);
    fs.writeFileSync(syncTypesPath, source);
    fs.rmSync(path.join(targetDir, 'src', 'typia.schema.json'));
    fs.rmSync(path.join(targetDir, 'src', 'typia.openapi.json'));

    const checks = await getDoctorChecks(targetDir);
    const sourceLayoutCheck = getCheck(
      checks,
      STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
    );
    const artifactsCheck = getCheck(checks, STANDALONE_DOCTOR_CODES.ARTIFACTS);

    expect(sourceLayoutCheck?.status).toBe('pass');
    expect(artifactsCheck?.status).toBe('fail');
    expect(artifactsCheck?.detail).toContain(
      './src/typia.schema.json (missing)',
    );
    expect(artifactsCheck?.detail).toContain(
      './src/typia.openapi.json (missing)',
    );
    expect(artifactsCheck?.detail).not.toContain(targetDir);
  }, 60_000);

  test('reports stale persistence REST artifacts', async () => {
    const targetDir = path.join(tempRoot, 'stale-persistence-rest');
    await scaffoldPersistence(targetDir);
    runGeneratedScript(targetDir, 'scripts/sync-project.ts');
    const apiTypesPath = path.join(targetDir, 'src', 'api-types.ts');
    const apiTypes = fs.readFileSync(apiTypesPath, 'utf8');
    const changedApiTypes = apiTypes.replace(
      'tags.MaxLength<100>',
      'tags.MaxLength<101>',
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

  test('requires editor and validator modules used by the standalone entrypoint', async () => {
    for (const relativePath of ['src/edit.tsx', 'src/validators.ts']) {
      const targetDir = path.join(
        tempRoot,
        `missing-${path.basename(relativePath)}`,
      );
      await scaffoldBasic(targetDir);
      fs.rmSync(path.join(targetDir, relativePath));

      const sourceLayoutCheck = getCheck(
        await getDoctorChecks(targetDir),
        STANDALONE_DOCTOR_CODES.SOURCE_LAYOUT,
      );
      expect(sourceLayoutCheck?.status).toBe('fail');
      expect(sourceLayoutCheck?.detail).toContain(relativePath);
    }
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
