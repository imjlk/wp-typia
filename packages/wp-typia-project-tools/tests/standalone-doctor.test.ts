import { afterAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
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
