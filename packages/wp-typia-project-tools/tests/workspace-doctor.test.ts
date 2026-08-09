import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  cleanupScaffoldTempRoot,
  createScaffoldTempRoot,
  entryPath,
  getCommandErrorMessage,
  linkWorkspaceNodeModules,
  parseJsonObjectFromOutput,
  runCapturedCli,
  runCli,
  scaffoldOfficialWorkspace,
  stripPhpFunction,
  workspaceTemplatePackageManifest,
} from './helpers/scaffold-test-harness.js';
import { scaffoldProject } from '../src/runtime/index.js';
import { getPackageVersions } from '../src/runtime/package-versions.js';
import {
  createDoctorRunSummary,
  getDoctorChecks,
  getDoctorExitFailureDetailLines,
  runAddPatternCommand,
} from '../src/runtime/cli-core.js';
import {
  getWorkspaceBlockSelectOptions,
  getWorkspaceBlockSelectOptionsAsync,
  parseWorkspaceInventorySource,
  readWorkspaceInventory,
  readWorkspaceInventoryAsync,
  updateWorkspaceInventorySource,
} from '../src/runtime/workspace-inventory.js';

describe('@wp-typia/project-tools workspace doctor', () => {
  const tempRoot = createScaffoldTempRoot('wp-typia-workspace-doctor-');
  const humanCliEnv = {
    ...process.env,
    AGENT: '',
    AMP_CURRENT_THREAD_ID: '',
    CLAUDECODE: '',
    CLAUDE_CODE: '',
    CODEX_CI: '',
    CODEX_SANDBOX: '',
    CODEX_THREAD_ID: '',
    CURSOR_AGENT: '',
    GEMINI_CLI: '',
    OPENCODE: '',
  } satisfies NodeJS.ProcessEnv;

  function getGeneratedBootstrapPath(projectDir: string): string {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'),
    ) as { name?: string };
    const packageBaseName =
      typeof packageJson.name === 'string'
        ? packageJson.name.split('/').pop()
        : path.basename(projectDir);

    return path.join(projectDir, `${packageBaseName ?? path.basename(projectDir)}.php`);
  }

  function replaceBootstrapHeader(
    projectDir: string,
    headerName: 'Requires at least' | 'Tested up to',
    value: string,
  ): void {
    const bootstrapPath = getGeneratedBootstrapPath(projectDir);
    const source = fs.readFileSync(bootstrapPath, 'utf8');
    const escapedHeaderName = headerName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const pattern = new RegExp(
      `(\\* ${escapedHeaderName}:\\s*)[^\\r\\n]*`,
      'u',
    );
    fs.writeFileSync(
      bootstrapPath,
      source.replace(pattern, `$1${value}`),
      'utf8',
    );
  }

  afterAll(() => {
    cleanupScaffoldTempRoot(tempRoot);
  });

test('doctor reports environment-only scope outside official workspace roots', async () => {
  const targetDir = path.join(tempRoot, 'doctor-environment-only');
  fs.mkdirSync(targetDir, { recursive: true });

  const checks = await getDoctorChecks(targetDir);
  const scopeCheck = checks.find((check) => check.label === 'Doctor scope');

  expect(scopeCheck?.status).toBe('pass');
  expect(scopeCheck?.detail).toContain('Scope: environment-only');
  expect(scopeCheck?.detail).toContain('only covered environment readiness');
  expect(scopeCheck?.detail).toContain('workspace root');
  expect(
    checks.some((check) => check.label === 'Workspace package metadata'),
  ).toBe(false);
});

test('doctor reports the managed WordPress ttsc lint integration', async () => {
  const targetDir = path.join(tempRoot, 'doctor-wordpress-ttsc-lint');
  await scaffoldOfficialWorkspace(targetDir);

  const currentChecks = await getDoctorChecks(targetDir);
  const currentLintCheck = currentChecks.find(
    (check) => check.label === 'WordPress ttsc lint',
  );

  expect(currentLintCheck?.status).toBe('pass');
  expect(currentLintCheck?.detail).toContain('lint.config.ts');

  const lintConfigPath = path.join(targetDir, 'lint.config.ts');
  const lintConfigSource = fs.readFileSync(lintConfigPath, 'utf8');
  const commonJsLintConfigPath = path.join(targetDir, 'lint.config.cjs');
  const commonJsLintConfigSource = lintConfigSource
    .replace("import type { ITtscLintConfig } from '@ttsc/lint';\n", '')
    .replace(
      "import { configs } from '@wp-typia/ttsc-lint-plugin-wp';",
      "const { configs } = require('@wp-typia/ttsc-lint-plugin-wp');",
    )
    .replace('export default', 'module.exports =')
    .replace('} satisfies ITtscLintConfig;', '};');
  fs.writeFileSync(commonJsLintConfigPath, commonJsLintConfigSource, 'utf8');
  fs.rmSync(lintConfigPath);
  fs.mkdirSync(lintConfigPath);
  const unreadableChecks = await getDoctorChecks(targetDir);
  const unreadableLintCheck = unreadableChecks.find(
    (check) => check.label === 'WordPress ttsc lint',
  );
  expect(unreadableLintCheck?.status).toBe('warn');
  expect(unreadableLintCheck?.detail).toContain(
    'unable to read lint.config.ts',
  );
  fs.rmdirSync(lintConfigPath);
  const commonJsChecks = await getDoctorChecks(targetDir);
  const commonJsLintCheck = commonJsChecks.find(
    (check) => check.label === 'WordPress ttsc lint',
  );
  expect(commonJsLintCheck?.status).toBe('pass');
  expect(commonJsLintCheck?.detail).toContain('lint.config.cjs');
  fs.rmSync(commonJsLintConfigPath);
  fs.writeFileSync(lintConfigPath, lintConfigSource, 'utf8');

  fs.writeFileSync(
    lintConfigPath,
    lintConfigSource.replace(
      /'wordpress\/i18n-text-domain': \[[\s\S]*?\n    \],/u,
      "'wordpress/i18n-text-domain': 'error',",
    ),
    'utf8',
  );
  const unboundRuleChecks = await getDoctorChecks(targetDir);
  const unboundRuleLintCheck = unboundRuleChecks.find(
    (check) => check.label === 'WordPress ttsc lint',
  );
  expect(unboundRuleLintCheck?.status).toBe('warn');
  expect(unboundRuleLintCheck?.detail).toContain(
    'does not enable the WordPress contributor and text-domain rule',
  );

  fs.writeFileSync(
    lintConfigPath,
    lintConfigSource.replace(
      /allowedTextDomain: '[^']*'/u,
      "allowedTextDomain: 'wrong-domain'",
    ),
    'utf8',
  );
  const wrongDomainChecks = await getDoctorChecks(targetDir);
  const wrongDomainLintCheck = wrongDomainChecks.find(
    (check) => check.label === 'WordPress ttsc lint',
  );
  expect(wrongDomainLintCheck?.status).toBe('warn');
  fs.writeFileSync(lintConfigPath, lintConfigSource, 'utf8');

  const packageJsonPath = path.join(targetDir, 'package.json');
  const packageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, 'utf8'),
  ) as {
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
  };
  const managedLint = packageJson.scripts.lint;
  const managedLintTs = packageJson.scripts['lint:ts'];
  const managedPostinstall = packageJson.scripts.postinstall;
  const managedTtscLint = packageJson.devDependencies['@ttsc/lint'];
  const managedContributor =
    packageJson.devDependencies['@wp-typia/ttsc-lint-plugin-wp'];
  packageJson.devDependencies['@ttsc/lint'] = '0.24.0';
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8',
  );
  const wrongLintVersionChecks = await getDoctorChecks(targetDir);
  const wrongLintVersionCheck = wrongLintVersionChecks.find(
    (check) => check.label === 'WordPress ttsc lint',
  );
  expect(wrongLintVersionCheck?.status).toBe('warn');
  expect(wrongLintVersionCheck?.detail).toContain(
    `@ttsc/lint dependency must be exactly ${managedTtscLint}`,
  );
  packageJson.devDependencies['@ttsc/lint'] = managedTtscLint;

  packageJson.devDependencies['@wp-typia/ttsc-lint-plugin-wp'] = '0.0.0';
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8',
  );
  const wrongContributorVersionChecks = await getDoctorChecks(targetDir);
  const wrongContributorVersionCheck = wrongContributorVersionChecks.find(
    (check) => check.label === 'WordPress ttsc lint',
  );
  expect(wrongContributorVersionCheck?.status).toBe('warn');
  expect(wrongContributorVersionCheck?.detail).toContain(
    `@wp-typia/ttsc-lint-plugin-wp dependency must be exactly ${managedContributor}`,
  );
  packageJson.devDependencies['@wp-typia/ttsc-lint-plugin-wp'] =
    managedContributor;

  const managedTtsc = packageJson.devDependencies.ttsc;
  const supportedTtscRange =
    getPackageVersions().ttscLintPluginWpTtscPeerRange;
  packageJson.devDependencies.ttsc = '0.22.0';
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8',
  );
  const unsupportedTtscChecks = await getDoctorChecks(targetDir);
  const unsupportedTtscCheck = unsupportedTtscChecks.find(
    (check) => check.label === 'WordPress ttsc lint',
  );
  expect(unsupportedTtscCheck?.status).toBe('warn');
  expect(unsupportedTtscCheck?.detail).toContain(
    `ttsc dependency must satisfy ${supportedTtscRange}`,
  );
  packageJson.devDependencies.ttsc = managedTtsc;

  packageJson.scripts.lint = 'npm run lint:ts:ci';
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8',
  );
  const subLaneChecks = await getDoctorChecks(targetDir);
  const subLaneLintCheck = subLaneChecks.find(
    (check) => check.label === 'WordPress ttsc lint',
  );
  expect(subLaneLintCheck?.status).toBe('warn');
  expect(subLaneLintCheck?.detail).toContain(
    'lint must include the lint:ts lane',
  );

  packageJson.scripts.lint = 'echo lint:ts';
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8',
  );
  const echoedLaneChecks = await getDoctorChecks(targetDir);
  const echoedLaneLintCheck = echoedLaneChecks.find(
    (check) => check.label === 'WordPress ttsc lint',
  );
  expect(echoedLaneLintCheck?.status).toBe('warn');
  expect(echoedLaneLintCheck?.detail).toContain(
    'lint must include the lint:ts lane',
  );

  packageJson.scripts.lint = 'npm --version run lint:ts';
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8',
  );
  const terminalAggregateChecks = await getDoctorChecks(targetDir);
  const terminalAggregateLintCheck = terminalAggregateChecks.find(
    (check) => check.label === 'WordPress ttsc lint',
  );
  expect(terminalAggregateLintCheck?.status).toBe('warn');
  expect(terminalAggregateLintCheck?.detail).toContain(
    'lint must include the lint:ts lane',
  );

  packageJson.scripts.lint = managedLint;
  packageJson.scripts['lint:ts'] = 'ttsc --noEmit --listFilesOnly';
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8',
  );
  const terminalTtscChecks = await getDoctorChecks(targetDir);
  const terminalTtscLintCheck = terminalTtscChecks.find(
    (check) => check.label === 'WordPress ttsc lint',
  );
  expect(terminalTtscLintCheck?.status).toBe('warn');
  expect(terminalTtscLintCheck?.detail).toContain(
    'lint:ts must invoke `ttsc --noEmit`',
  );

  packageJson.scripts['lint:ts'] = managedLintTs;
  packageJson.scripts.postinstall = 'echo apply-ttsc-lint-compat.mjs';
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8',
  );
  const missingHookChecks = await getDoctorChecks(targetDir);
  const missingHookLintCheck = missingHookChecks.find(
    (check) => check.label === 'WordPress ttsc lint',
  );
  expect(missingHookLintCheck?.status).toBe('warn');
  expect(missingHookLintCheck?.detail).toContain(
    'postinstall must invoke scripts/apply-ttsc-lint-compat.mjs',
  );

  packageJson.scripts.postinstall =
    'node --inspect scripts/apply-ttsc-lint-compat.mjs';
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8',
  );
  const nodeOptionHookChecks = await getDoctorChecks(targetDir);
  const nodeOptionHookLintCheck = nodeOptionHookChecks.find(
    (check) => check.label === 'WordPress ttsc lint',
  );
  expect(nodeOptionHookLintCheck?.status).toBe('pass');

  packageJson.scripts.postinstall =
    'node --check scripts/apply-ttsc-lint-compat.mjs';
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8',
  );
  const checkOnlyHookChecks = await getDoctorChecks(targetDir);
  const checkOnlyHookLintCheck = checkOnlyHookChecks.find(
    (check) => check.label === 'WordPress ttsc lint',
  );
  expect(checkOnlyHookLintCheck?.status).toBe('warn');
  expect(checkOnlyHookLintCheck?.detail).toContain(
    'postinstall must invoke scripts/apply-ttsc-lint-compat.mjs',
  );

  packageJson.scripts.postinstall = managedPostinstall;
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8',
  );
  const compatPath = path.join(
    targetDir,
    'scripts',
    'apply-ttsc-lint-compat.mjs',
  );
  const compatSource = fs.readFileSync(compatPath, 'utf8');
  fs.writeFileSync(compatPath, `${compatSource}\n// stale\n`, 'utf8');
  const staleCompatChecks = await getDoctorChecks(targetDir);
  const staleCompatLintCheck = staleCompatChecks.find(
    (check) => check.label === 'WordPress ttsc lint',
  );
  expect(staleCompatLintCheck?.status).toBe('warn');
  expect(staleCompatLintCheck?.detail).toContain(
    'missing or stale scripts/apply-ttsc-lint-compat.mjs',
  );
  fs.writeFileSync(compatPath, compatSource, 'utf8');

  const managedTypeScript = packageJson.devDependencies.typescript;
  delete packageJson.devDependencies.ttsc;
  delete packageJson.devDependencies.typescript;
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8',
  );
  const missingToolchainChecks = await getDoctorChecks(targetDir);
  const missingToolchainLintCheck = missingToolchainChecks.find(
    (check) => check.label === 'WordPress ttsc lint',
  );
  expect(missingToolchainLintCheck?.status).toBe('warn');
  expect(missingToolchainLintCheck?.detail).toContain(
    'missing ttsc dependency',
  );
  expect(missingToolchainLintCheck?.detail).toContain(
    'missing typescript dependency',
  );
  packageJson.devDependencies.ttsc = managedTtsc;
  packageJson.devDependencies.typescript = managedTypeScript;

  delete packageJson.devDependencies['@wp-typia/ttsc-lint-plugin-wp'];
  delete packageJson.scripts['lint:ts'];
  packageJson.scripts.lint = 'npm run lint:css';
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8',
  );
  fs.rmSync(lintConfigPath);

  const legacyChecks = await getDoctorChecks(targetDir);
  const legacyLintCheck = legacyChecks.find(
    (check) => check.label === 'WordPress ttsc lint',
  );

  expect(legacyLintCheck?.status).toBe('warn');
  expect(legacyLintCheck?.detail).toContain(
    'missing @wp-typia/ttsc-lint-plugin-wp dependency',
  );
  expect(legacyLintCheck?.detail).toContain('wp-typia init --apply');
});

test('doctor workspace-only policy treats environment failures as advisory', () => {
  const checks = [
    {
      detail: 'Not available',
      label: 'Bun',
      scope: 'environment' as const,
      status: 'fail' as const,
    },
    {
      detail: 'Workspace metadata is current',
      label: 'Workspace package metadata',
      scope: 'workspace' as const,
      status: 'pass' as const,
    },
  ];

  const strictSummary = createDoctorRunSummary(checks);
  expect(strictSummary.exitPolicy).toBe('strict');
  expect(strictSummary.exitCode).toBe(1);
  expect(strictSummary.exitFailureCount).toBe(1);
  expect(strictSummary.advisoryFailureCount).toBe(0);
  expect(getDoctorExitFailureDetailLines(checks)).toEqual([
    'Bun: Not available',
  ]);

  const workspaceOnlySummary = createDoctorRunSummary(checks, {
    exitPolicy: 'workspace-only',
  });
  expect(workspaceOnlySummary.exitPolicy).toBe('workspace-only');
  expect(workspaceOnlySummary.exitCode).toBe(0);
  expect(workspaceOnlySummary.exitFailureCount).toBe(0);
  expect(workspaceOnlySummary.advisoryFailureCount).toBe(1);
  expect(workspaceOnlySummary.advisoryFailures).toEqual([
    {
      label: 'Bun',
      scope: 'environment',
      severity: 'advisory',
    },
  ]);
  expect(
    getDoctorExitFailureDetailLines(checks, { exitPolicy: 'workspace-only' }),
  ).toEqual([]);
});

test('doctor reports invalid nearby workspace metadata before workspace checks', async () => {
  const targetDir = path.join(tempRoot, 'doctor-invalid-workspace-metadata');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(
    path.join(targetDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'invalid-workspace-metadata',
        private: true,
        wpTypia: {
          projectType: 'workspace',
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const checks = await getDoctorChecks(targetDir);
  const scopeCheck = checks.find((check) => check.label === 'Doctor scope');
  const metadataCheck = checks.find(
    (check) => check.label === 'Workspace package metadata',
  );

  expect(scopeCheck?.status).toBe('fail');
  expect(scopeCheck?.detail).toContain('Scope: blocked before workspace checks');
  expect(scopeCheck?.detail).toContain('workspace diagnostics could not continue');
  expect(scopeCheck?.detail).toContain('rerun `wp-typia doctor`');
  expect(metadataCheck?.status).toBe('fail');
  expect(metadataCheck?.detail).toContain(
    'Invalid wp-typia workspace metadata',
  );
});

test('doctor reports workspace discovery failures before workspace checks', async () => {
  const targetDir = path.join(tempRoot, 'doctor-workspace-discovery-failure');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'package.json'), '{\n', 'utf8');

  const checks = await getDoctorChecks(targetDir);
  const scopeCheck = checks.find((check) => check.label === 'Doctor scope');
  const metadataCheck = checks.find(
    (check) => check.label === 'Workspace package metadata',
  );

  expect(scopeCheck?.status).toBe('fail');
  expect(scopeCheck?.detail).toContain('Scope: blocked before workspace checks');
  expect(scopeCheck?.detail).toContain('workspace discovery could not continue');
  expect(scopeCheck?.detail).toContain('rerun `wp-typia doctor`');
  expect(metadataCheck?.status).toBe('fail');
  expect(metadataCheck?.detail).toContain(
    'Failed to parse workspace package manifest',
  );
});

test('doctor reports iframe/API v3 compatibility warnings without failing', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-iframe-compatibility-warnings',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace iframe compatibility warnings',
    slug: 'demo-workspace-iframe-compatibility-warnings',
    title: 'Demo Workspace Iframe Compatibility Warnings',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );

  const blockDir = path.join(targetDir, 'src', 'blocks', 'counter-card');
  const blockJsonPath = path.join(blockDir, 'block.json');
  const blockJson = JSON.parse(fs.readFileSync(blockJsonPath, 'utf8'));
  blockJson.apiVersion = 2;
  delete blockJson.style;
  delete blockJson.editorStyle;
  fs.writeFileSync(blockJsonPath, JSON.stringify(blockJson, null, 2), 'utf8');

  const editPath = path.join(blockDir, 'edit.tsx');
  fs.writeFileSync(
    editPath,
    `${fs
      .readFileSync(editPath, 'utf8')
      .replace(/\buseBlockProps\b/gu, 'usePlainBlockProps')}\nconst iframeLayout = { parent: [], top: 0 };\ndocument.body.classList.contains('wp-admin');\n`,
    'utf8',
  );
  const humanOutput = runCli('node', [entryPath, 'doctor', '--format', 'text'], {
    cwd: targetDir,
  });
  expect(humanOutput).toContain('WARN Block iframe API version counter-card');
  expect(humanOutput).toContain('WARN wp-typia doctor summary:');

  const doctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ code?: string; detail: string; label: string; status: string }>;
  }>(doctorOutput);
  const getCheck = (code: string) =>
    doctorChecks.checks.find((check) => check.code === code);

  expect(getCheck('wp-typia.workspace.block.iframe.api-version')?.status).toBe(
    'warn',
  );
  expect(getCheck('wp-typia.workspace.block.iframe.editor-styles')?.status).toBe(
    'warn',
  );
  expect(getCheck('wp-typia.workspace.block.iframe.editor-globals')?.detail).toContain(
    'edit.tsx',
  );
  expect(getCheck('wp-typia.workspace.block.iframe.editor-globals')?.detail).not.toContain(
    '(parent)',
  );
  expect(getCheck('wp-typia.workspace.block.iframe.editor-globals')?.detail).not.toContain(
    '(top)',
  );
  expect(getCheck('wp-typia.workspace.block.iframe.editor-globals')?.status).toBe(
    'warn',
  );
  expect(getCheck('wp-typia.workspace.block.iframe.block-props')?.detail).toContain(
    'Only save-facing',
  );
  expect(getCheck('wp-typia.workspace.block.iframe.block-props')?.status).toBe(
    'warn',
  );
}, 15_000);

test('doctor WordPress version checks stay opt-in and warn on target drift', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-wp-version-target-warning',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace WordPress version target warning',
    slug: 'demo-workspace-wp-version-target-warning',
    title: 'Demo Workspace WordPress Version Target Warning',
  });

  linkWorkspaceNodeModules(targetDir);
  replaceBootstrapHeader(targetDir, 'Tested up to', '6.9');

  const defaultDoctorOutput = runCli(
    'node',
    [entryPath, 'doctor', '--format', 'json'],
    {
      cwd: targetDir,
    },
  );
  const defaultDoctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ code?: string; label: string; status: string }>;
  }>(defaultDoctorOutput);
  expect(
    defaultDoctorChecks.checks.some((check) =>
      check.code?.startsWith('wp-typia.workspace.wordpress.'),
    ),
  ).toBe(false);

  const flaggedDoctorOutput = runCli(
    'node',
    [entryPath, 'doctor', '--wp-version-check', '--format', 'json'],
    {
      cwd: targetDir,
    },
  );
  const flaggedDoctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ code?: string; detail: string; label: string; status: string }>;
    summary: { exitCode: 0 | 1; warnings: number };
  }>(flaggedDoctorOutput);
  const testedTargetCheck = flaggedDoctorChecks.checks.find(
    (check) => check.code === 'wp-typia.workspace.wordpress.tested-target',
  );

  expect(flaggedDoctorChecks.summary.exitCode).toBe(0);
  expect(flaggedDoctorChecks.summary.warnings).toBeGreaterThan(0);
  expect(testedTargetCheck?.status).toBe('warn');
  expect(testedTargetCheck?.detail).toContain('Tested up to 6.9');
  expect(testedTargetCheck?.detail).toContain('WordPress target 7.0');
  expect(testedTargetCheck?.detail).toContain(
    'Update the plugin bootstrap `Tested up to` header',
  );
}, 15_000);

test('doctor WordPress version check fails when block feature floors exceed headers', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-wp-version-block-floor',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace WordPress version block floor',
    slug: 'demo-workspace-wp-version-block-floor',
    title: 'Demo Workspace WordPress Version Block Floor',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli('node', [entryPath, 'add', 'block', 'counter-card'], {
    cwd: targetDir,
  });

  const blockJsonPath = path.join(
    targetDir,
    'src',
    'blocks',
    'counter-card',
    'block.json',
  );
  const blockJson = JSON.parse(fs.readFileSync(blockJsonPath, 'utf8')) as {
    metadata?: Record<string, unknown>;
    supports?: Record<string, unknown>;
  };
  blockJson.metadata = {
    ...blockJson.metadata,
    bindings: {
      headline: {
        args: { key: '_demo_headline' },
        source: 'core/post-meta',
      },
    },
  };
  blockJson.supports = {
    ...blockJson.supports,
    interactivity: true,
    splitting: true,
  };
  fs.writeFileSync(blockJsonPath, JSON.stringify(blockJson, null, 2), 'utf8');
  replaceBootstrapHeader(targetDir, 'Requires at least', '6.4');

  const result = runCapturedCli(
    'node',
    [entryPath, 'doctor', '--wp-version-check', '--format', 'json'],
    {
      cwd: targetDir,
    },
  );
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ code?: string; detail: string; label: string; status: string }>;
    summary: { exitCode: 0 | 1; exitFailureCount: number };
  }>(result.stdout);
  const featureMinimumCheck = doctorChecks.checks.find(
    (check) => check.code === 'wp-typia.workspace.wordpress.feature-minimum',
  );

  expect(result.status).toBe(1);
  expect(doctorChecks.summary.exitCode).toBe(1);
  expect(doctorChecks.summary.exitFailureCount).toBeGreaterThan(0);
  expect(featureMinimumCheck?.status).toBe('fail');
  expect(featureMinimumCheck?.detail).toContain('Requires at least 6.4');
  expect(featureMinimumCheck?.detail).toContain('feature floor 6.5');
  expect(featureMinimumCheck?.detail).toContain(
    'Update the plugin bootstrap `Requires at least` header to 6.5',
  );
  expect(featureMinimumCheck?.detail).toContain('block metadata.bindings');
  expect(featureMinimumCheck?.detail).toContain('supports.interactivity');
  expect(featureMinimumCheck?.detail).toContain('supports.splitting');
}, 15_000);

test('doctor WordPress version check covers shared block API feature floors', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-wp-version-shared-block-floors',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace WordPress version shared block floors',
    slug: 'demo-workspace-wp-version-shared-block-floors',
    title: 'Demo Workspace WordPress Version Shared Block Floors',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli('node', [entryPath, 'add', 'block', 'feature-card'], {
    cwd: targetDir,
  });

  const blockJsonPath = path.join(
    targetDir,
    'src',
    'blocks',
    'feature-card',
    'block.json',
  );
  const blockJson = JSON.parse(fs.readFileSync(blockJsonPath, 'utf8')) as {
    supports?: Record<string, unknown>;
  };
  blockJson.supports = {
    ...blockJson.supports,
    allowedBlocks: true,
    contentRole: true,
    visibility: true,
  };
  fs.writeFileSync(blockJsonPath, JSON.stringify(blockJson, null, 2), 'utf8');
  replaceBootstrapHeader(targetDir, 'Requires at least', '6.8');

  const sixNineResult = runCapturedCli(
    'node',
    [entryPath, 'doctor', '--wp-version-check', '--format', 'json'],
    {
      cwd: targetDir,
    },
  );
  const sixNineChecks = parseJsonObjectFromOutput<{
    checks: Array<{ code?: string; detail: string; label: string; status: string }>;
  }>(sixNineResult.stdout);
  const sixNineFeatureMinimumCheck = sixNineChecks.checks.find(
    (check) => check.code === 'wp-typia.workspace.wordpress.feature-minimum',
  );

  expect(sixNineResult.status).toBe(1);
  expect(sixNineFeatureMinimumCheck?.status).toBe('fail');
  expect(sixNineFeatureMinimumCheck?.detail).toContain('feature floor 6.9');
  expect(sixNineFeatureMinimumCheck?.detail).toContain('supports.allowedBlocks');
  expect(sixNineFeatureMinimumCheck?.detail).toContain('supports.contentRole');
  expect(sixNineFeatureMinimumCheck?.detail).toContain('supports.visibility');

  blockJson.supports = {
    ...blockJson.supports,
    listView: true,
  };
  fs.writeFileSync(blockJsonPath, JSON.stringify(blockJson, null, 2), 'utf8');
  replaceBootstrapHeader(targetDir, 'Requires at least', '6.9');

  const sevenResult = runCapturedCli(
    'node',
    [entryPath, 'doctor', '--wp-version-check', '--format', 'json'],
    {
      cwd: targetDir,
    },
  );
  const sevenChecks = parseJsonObjectFromOutput<{
    checks: Array<{ code?: string; detail: string; label: string; status: string }>;
  }>(sevenResult.stdout);
  const sevenFeatureMinimumCheck = sevenChecks.checks.find(
    (check) => check.code === 'wp-typia.workspace.wordpress.feature-minimum',
  );

  expect(sevenResult.status).toBe(1);
  expect(sevenFeatureMinimumCheck?.status).toBe('fail');
  expect(sevenFeatureMinimumCheck?.detail).toContain('feature floor 7.0');
  expect(sevenFeatureMinimumCheck?.detail).toContain('supports.listView');
}, 20_000);

test('doctor WordPress version check covers block variation metadata floors', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-wp-version-variation-floor',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace WordPress version variation floor',
    slug: 'demo-workspace-wp-version-variation-floor',
    title: 'Demo Workspace WordPress Version Variation Floor',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli('node', [entryPath, 'add', 'block', 'feature-card'], {
    cwd: targetDir,
  });

  const blockJsonPath = path.join(
    targetDir,
    'src',
    'blocks',
    'feature-card',
    'block.json',
  );
  const blockJson = JSON.parse(fs.readFileSync(blockJsonPath, 'utf8')) as {
    supports?: Record<string, unknown>;
    variations?: unknown;
  };
  blockJson.supports = {};

  blockJson.variations = [];
  fs.writeFileSync(blockJsonPath, JSON.stringify(blockJson, null, 2), 'utf8');
  replaceBootstrapHeader(targetDir, 'Requires at least', '5.8');

  const emptyArrayResult = runCapturedCli(
    'node',
    [entryPath, 'doctor', '--wp-version-check', '--format', 'json'],
    {
      cwd: targetDir,
    },
  );
  const emptyArrayChecks = parseJsonObjectFromOutput<{
    checks: Array<{ code?: string; status: string }>;
  }>(emptyArrayResult.stdout);

  expect(emptyArrayResult.status).toBe(0);
  expect(
    emptyArrayChecks.checks.find(
      (check) => check.code === 'wp-typia.workspace.wordpress.feature-minimum',
    )?.status,
  ).toBe('pass');

  blockJson.variations = '';
  fs.writeFileSync(blockJsonPath, JSON.stringify(blockJson, null, 2), 'utf8');

  const emptyStringResult = runCapturedCli(
    'node',
    [entryPath, 'doctor', '--wp-version-check', '--format', 'json'],
    {
      cwd: targetDir,
    },
  );
  const emptyStringChecks = parseJsonObjectFromOutput<{
    checks: Array<{ code?: string; status: string }>;
  }>(emptyStringResult.stdout);

  expect(emptyStringResult.status).toBe(0);
  expect(
    emptyStringChecks.checks.find(
      (check) => check.code === 'wp-typia.workspace.wordpress.feature-minimum',
    )?.status,
  ).toBe('pass');

  blockJson.variations = [
    {
      attributes: { className: 'is-style-featured' },
      name: 'featured',
      title: 'Featured',
    },
  ];
  fs.writeFileSync(blockJsonPath, JSON.stringify(blockJson, null, 2), 'utf8');
  replaceBootstrapHeader(targetDir, 'Requires at least', '5.8');

  const result = runCapturedCli(
    'node',
    [entryPath, 'doctor', '--wp-version-check', '--format', 'json'],
    {
      cwd: targetDir,
    },
  );
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ code?: string; detail: string; label: string; status: string }>;
  }>(result.stdout);
  const featureMinimumCheck = doctorChecks.checks.find(
    (check) => check.code === 'wp-typia.workspace.wordpress.feature-minimum',
  );

  expect(result.status).toBe(1);
  expect(featureMinimumCheck?.status).toBe('fail');
  expect(featureMinimumCheck?.detail).toContain('feature floor 5.9');
  expect(featureMinimumCheck?.detail).toContain(
    'block.json variations metadata',
  );

  blockJson.variations = 'file:./variations.php';
  fs.writeFileSync(blockJsonPath, JSON.stringify(blockJson, null, 2), 'utf8');
  replaceBootstrapHeader(targetDir, 'Requires at least', '6.6');

  const fileResult = runCapturedCli(
    'node',
    [entryPath, 'doctor', '--wp-version-check', '--format', 'json'],
    {
      cwd: targetDir,
    },
  );
  const fileChecks = parseJsonObjectFromOutput<{
    checks: Array<{ code?: string; detail: string; label: string; status: string }>;
  }>(fileResult.stdout);
  const fileFeatureMinimumCheck = fileChecks.checks.find(
    (check) => check.code === 'wp-typia.workspace.wordpress.feature-minimum',
  );

  expect(fileResult.status).toBe(1);
  expect(fileFeatureMinimumCheck?.status).toBe('fail');
  expect(fileFeatureMinimumCheck?.detail).toContain('feature floor 6.7');
  expect(fileFeatureMinimumCheck?.detail).toContain(
    'block.json variations file metadata',
  );
}, 20_000);

test('doctor WordPress version check covers generated variation registration floors', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-wp-version-generated-variation-floor',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace WordPress version generated variation floor',
    slug: 'demo-workspace-wp-version-generated-variation-floor',
    title: 'Demo Workspace WordPress Version Generated Variation Floor',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli('node', [entryPath, 'add', 'block', 'feature-card'], {
    cwd: targetDir,
  });
  runCli(
    'node',
    [entryPath, 'add', 'variation', 'featured', '--block', 'feature-card'],
    {
      cwd: targetDir,
    },
  );
  replaceBootstrapHeader(targetDir, 'Requires at least', '5.3');

  const result = runCapturedCli(
    'node',
    [entryPath, 'doctor', '--wp-version-check', '--format', 'json'],
    {
      cwd: targetDir,
    },
  );
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ code?: string; detail: string; label: string; status: string }>;
  }>(result.stdout);
  const featureMinimumCheck = doctorChecks.checks.find(
    (check) => check.code === 'wp-typia.workspace.wordpress.feature-minimum',
  );

  expect(result.status).toBe(1);
  expect(featureMinimumCheck?.status).toBe('fail');
  expect(featureMinimumCheck?.detail).toContain('feature floor 5.4');
  expect(featureMinimumCheck?.detail).toContain(
    'registerBlockVariation() editor registration',
  );
}, 30_000);

test('doctor WordPress version check covers generated core variation registration floors', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-wp-version-generated-core-variation-floor',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace WordPress version generated core variation floor',
    slug: 'demo-workspace-wp-version-generated-core-variation-floor',
    title: 'Demo Workspace WordPress Version Generated Core Variation Floor',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli(
    'node',
    [entryPath, 'add', 'core-variation', 'core/group', 'section-hero'],
    {
      cwd: targetDir,
    },
  );
  const registryPath = path.join(
    targetDir,
    'src',
    'editor-plugins',
    'core-variations',
    'index.ts',
  );
  const originalRegistrySource = fs.readFileSync(registryPath, 'utf8');
  const formattedRegistrySource = originalRegistrySource.replace(
    /^import\s+\{\s*([^}]+?)\s*\}\s+from\s+(['"]\.\/[^'"]+\/[^'"]+\/[^'"]+['"]);?$/mu,
    (_, imports: string, specifier: string) =>
      `import {\n\t${imports.trim()},\n} from ${specifier};`,
  );
  expect(formattedRegistrySource).not.toBe(originalRegistrySource);
  fs.writeFileSync(registryPath, formattedRegistrySource, 'utf8');
  replaceBootstrapHeader(targetDir, 'Requires at least', '5.3');

  const result = runCapturedCli(
    'node',
    [entryPath, 'doctor', '--wp-version-check', '--format', 'json'],
    {
      cwd: targetDir,
    },
  );
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ code?: string; detail: string; label: string; status: string }>;
  }>(result.stdout);
  const featureMinimumCheck = doctorChecks.checks.find(
    (check) => check.code === 'wp-typia.workspace.wordpress.feature-minimum',
  );

  expect(result.status).toBe(1);
  expect(featureMinimumCheck?.status).toBe('fail');
  expect(featureMinimumCheck?.detail).toContain('feature floor 5.4');
  expect(featureMinimumCheck?.detail).toContain('Core variations editor plugin');
  expect(featureMinimumCheck?.detail).toContain(
    'registerBlockVariation() editor registration',
  );
}, 30_000);

test('doctor WordPress version check ignores stray core variation TypeScript files', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-wp-version-stray-core-variation-file',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace WordPress version stray core variation file',
    slug: 'demo-workspace-wp-version-stray-core-variation-file',
    title: 'Demo Workspace WordPress Version Stray Core Variation File',
  });

  linkWorkspaceNodeModules(targetDir);
  const strayCoreVariationDir = path.join(
    targetDir,
    'src',
    'editor-plugins',
    'core-variations',
    'core',
    'group',
  );
  fs.mkdirSync(strayCoreVariationDir, { recursive: true });
  fs.writeFileSync(
    path.join(strayCoreVariationDir, 'notes.ts'),
    [
      '// This file documents a planned core variation.',
      "export const planned = 'registerBlockVariation(core/group, demo)';",
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(
      targetDir,
      'src',
      'editor-plugins',
      'core-variations',
      'index.ts',
    ),
    [
      "import { planned } from './core/group/notes';",
      "import { registerBlockVariation } from '@wordpress/blocks';",
      '',
      'export function registerWorkspaceCoreVariations() {',
      "\tregisterBlockVariation('core/group', planned);",
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  replaceBootstrapHeader(targetDir, 'Requires at least', '5.3');

  const result = runCapturedCli(
    'node',
    [entryPath, 'doctor', '--wp-version-check', '--format', 'json'],
    {
      cwd: targetDir,
    },
  );
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ code?: string; detail: string; label: string; status: string }>;
  }>(result.stdout);
  const featureMinimumCheck = doctorChecks.checks.find(
    (check) => check.code === 'wp-typia.workspace.wordpress.feature-minimum',
  );

  expect(result.status).toBe(0);
  expect(featureMinimumCheck?.status).toBe('pass');
  expect(featureMinimumCheck?.detail).not.toContain(
    'Core variations editor plugin',
  );
}, 30_000);

test('doctor WordPress version check reads ability inventory compatibility floors', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-wp-version-ability-floor',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace WordPress version ability floor',
    slug: 'demo-workspace-wp-version-ability-floor',
    title: 'Demo Workspace WordPress Version Ability Floor',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli('node', [entryPath, 'add', 'ability', 'summarize-post'], {
    cwd: targetDir,
  });
  replaceBootstrapHeader(targetDir, 'Requires at least', '6.9');

  const result = runCapturedCli(
    'node',
    [entryPath, 'doctor', '--wp-version-check', '--format', 'json'],
    {
      cwd: targetDir,
    },
  );
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ code?: string; detail: string; label: string; status: string }>;
  }>(result.stdout);
  const featureMinimumCheck = doctorChecks.checks.find(
    (check) => check.code === 'wp-typia.workspace.wordpress.feature-minimum',
  );

  expect(result.status).toBe(1);
  expect(featureMinimumCheck?.status).toBe('fail');
  expect(featureMinimumCheck?.detail).toContain('Requires at least 6.9');
  expect(featureMinimumCheck?.detail).toContain('feature floor 7.0');
  expect(featureMinimumCheck?.detail).toContain(
    'Ability summarize-post compatibility metadata',
  );
}, 20_000);

test('doctor WordPress version check covers binding source API floors', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-wp-version-binding-floor',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace WordPress version binding floor',
    slug: 'demo-workspace-wp-version-binding-floor',
    title: 'Demo Workspace WordPress Version Binding Floor',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );
  runCli(
    'node',
    [
      entryPath,
      'add',
      'binding-source',
      'hero-data',
      '--block',
      'counter-card',
      '--attribute',
      'headline',
    ],
    {
      cwd: targetDir,
    },
  );
  const inventory = readWorkspaceInventory(targetDir);
  const bindingSource = inventory.bindingSources.find(
    (entry) => entry.slug === 'hero-data',
  );
  if (!bindingSource) {
    throw new Error('Expected hero-data binding source in workspace inventory');
  }
  const bindingEditorFilePath = path.join(targetDir, bindingSource.editorFile);
  const bindingServerFilePath = path.join(targetDir, bindingSource.serverFile);
  const originalBindingServerSource = fs.readFileSync(
    bindingServerFilePath,
    'utf8',
  );
  const rewrittenBindingServerSource = originalBindingServerSource.replace(
    /add_filter\(\n\t\t('block_bindings_supported_attributes_[^']+'),/u,
    '$hook = $1;\n\tadd_filter(\n\t\t$hook,',
  );
  expect(rewrittenBindingServerSource).not.toBe(originalBindingServerSource);
  fs.writeFileSync(bindingServerFilePath, rewrittenBindingServerSource, 'utf8');

  const originalBindingEditorSource = fs.readFileSync(
    bindingEditorFilePath,
    'utf8',
  );
  const getFieldsListMethodBlockPattern =
    /  getFieldsList\(\) \{\n[\s\S]*?\n  \},\n  getValues/u;
  replaceBootstrapHeader(targetDir, 'Requires at least', '6.8');

  for (const [label, transformSource] of [
    [
      'arrow property',
      (source: string) =>
        source.replace('getFieldsList() {', 'getFieldsList: () => {'),
    ],
    [
      'function property',
      (source: string) =>
        source.replace('getFieldsList() {', 'getFieldsList: function () {'),
    ],
    [
      'typed method',
      (source: string) =>
        source.replace('getFieldsList() {', 'getFieldsList(): BindingField[] {'),
    ],
    [
      'object return type method',
      (source: string) =>
        source.replace(
          'getFieldsList() {',
          'getFieldsList(): Array<{ label: string; type: string }> {',
        ),
    ],
    [
      'async quoted method',
      (source: string) =>
        source.replace('getFieldsList() {', 'async "getFieldsList"() {'),
    ],
    [
      'quoted property',
      (source: string) =>
        source.replace(
          getFieldsListMethodBlockPattern,
          '  "getFieldsList": () => [],\n  getValues',
        ),
    ],
    [
      'shorthand property',
      (source: string) =>
        source
          .replace(
            'function resolveBindingSourceValue',
            'const getFieldsList = () => [];\n\nfunction resolveBindingSourceValue',
          )
          .replace(getFieldsListMethodBlockPattern, '  getFieldsList,\n  getValues'),
    ],
    [
      'function reference property',
      (source: string) =>
        source
          .replace(
            'function resolveBindingSourceValue',
            'const buildFieldsList = () => [];\n\nfunction resolveBindingSourceValue',
          )
          .replace(
            getFieldsListMethodBlockPattern,
            '  getFieldsList: buildFieldsList,\n  getValues',
          ),
    ],
    [
      'variable source object',
      (source: string) =>
        source
          .replace(
            'registerBlockBindingsSource({',
            'const bindingSourceRegistration = {',
          )
          .replace(
            /\n\}\);\s*$/u,
            '\n};\n\nregisterBlockBindingsSource(bindingSourceRegistration);\n',
          ),
    ],
    [
      'variable source object with type assertion',
      (source: string) =>
        source
          .replace(
            'registerBlockBindingsSource({',
            'const bindingSourceRegistration = {',
          )
          .replace(
            /\n\}\);\s*$/u,
            '\n};\n\nregisterBlockBindingsSource(bindingSourceRegistration as unknown);\n',
          ),
    ],
    [
      'inner satisfies expression',
      (source: string) =>
        source.replace(
          'registerBlockBindingsSource({',
          'const metadata = {};\n\nregisterBlockBindingsSource({\n  meta: metadata satisfies Record<string, unknown>,',
        ),
    ],
  ] satisfies Array<[string, (source: string) => string]>) {
    const rewrittenBindingEditorSource = transformSource(
      originalBindingEditorSource,
    );
    expect(rewrittenBindingEditorSource).not.toBe(originalBindingEditorSource);
    fs.writeFileSync(
      bindingEditorFilePath,
      rewrittenBindingEditorSource,
      'utf8',
    );

    const result = runCapturedCli(
      'node',
      [entryPath, 'doctor', '--wp-version-check', '--format', 'json'],
      {
        cwd: targetDir,
      },
    );
    const doctorChecks = parseJsonObjectFromOutput<{
      checks: Array<{
        code?: string;
        detail: string;
        label: string;
        status: string;
      }>;
    }>(result.stdout);
    const featureMinimumCheck = doctorChecks.checks.find(
      (check) => check.code === 'wp-typia.workspace.wordpress.feature-minimum',
    );

    expect(result.status).toBe(1);
    expect(featureMinimumCheck?.status).toBe('fail');
    expect(featureMinimumCheck?.detail).toContain('feature floor 6.9');
    if (
      !featureMinimumCheck?.detail.includes(
        'registerBlockBindingsSource() getFieldsList()',
      )
    ) {
      throw new Error(
        `${label} did not report getFieldsList(): ${featureMinimumCheck?.detail ?? '<missing check>'}`,
      );
    }
    expect(featureMinimumCheck?.detail).toContain(
      'registerBlockBindingsSource() getFieldsList()',
    );
    expect(featureMinimumCheck?.detail).toContain(
      'block_bindings_supported_attributes filters',
    );
  }

  const sourceWithoutRuntimeGetFieldsList = originalBindingEditorSource.replace(
    getFieldsListMethodBlockPattern,
    '  getValues',
  );
  expect(sourceWithoutRuntimeGetFieldsList).not.toBe(
    originalBindingEditorSource,
  );
  fs.writeFileSync(
    bindingEditorFilePath,
    `${sourceWithoutRuntimeGetFieldsList}
registerBlockBindingsSource( {} satisfies { getFieldsList: () => string[] } );
`,
    'utf8',
  );
  const typeOnlyResult = runCapturedCli(
    'node',
    [entryPath, 'doctor', '--wp-version-check', '--format', 'json'],
    {
      cwd: targetDir,
    },
  );
  const typeOnlyDoctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{
      code?: string;
      detail: string;
      label: string;
      status: string;
    }>;
  }>(typeOnlyResult.stdout);
  const typeOnlyFeatureMinimumCheck = typeOnlyDoctorChecks.checks.find(
    (check) => check.code === 'wp-typia.workspace.wordpress.feature-minimum',
  );

  expect(typeOnlyResult.status).toBe(1);
  expect(typeOnlyFeatureMinimumCheck?.status).toBe('fail');
  expect(typeOnlyFeatureMinimumCheck?.detail).toContain('feature floor 6.9');
  expect(typeOnlyFeatureMinimumCheck?.detail).not.toContain(
    'registerBlockBindingsSource() getFieldsList()',
  );
  expect(typeOnlyFeatureMinimumCheck?.detail).toContain(
    'block_bindings_supported_attributes filters',
  );

  fs.writeFileSync(
    bindingEditorFilePath,
    `${sourceWithoutRuntimeGetFieldsList}
if ( true ) {
\tconst bindingSourceRegistration = {
\t\tgetFieldsList() {
\t\t\treturn [];
\t\t},
\t};
}

registerBlockBindingsSource( bindingSourceRegistration );
`,
    'utf8',
  );
  const shadowedVariableResult = runCapturedCli(
    'node',
    [entryPath, 'doctor', '--wp-version-check', '--format', 'json'],
    {
      cwd: targetDir,
    },
  );
  const shadowedVariableDoctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{
      code?: string;
      detail: string;
      label: string;
      status: string;
    }>;
  }>(shadowedVariableResult.stdout);
  const shadowedVariableFeatureMinimumCheck =
    shadowedVariableDoctorChecks.checks.find(
      (check) => check.code === 'wp-typia.workspace.wordpress.feature-minimum',
    );

  expect(shadowedVariableResult.status).toBe(1);
  expect(shadowedVariableFeatureMinimumCheck?.status).toBe('fail');
  expect(shadowedVariableFeatureMinimumCheck?.detail).toContain(
    'feature floor 6.9',
  );
  expect(shadowedVariableFeatureMinimumCheck?.detail).not.toContain(
    'registerBlockBindingsSource() getFieldsList()',
  );
  expect(shadowedVariableFeatureMinimumCheck?.detail).toContain(
    'block_bindings_supported_attributes filters',
  );
}, 20_000);

test('doctor accepts workspaces that keep binding registries in src/bindings/index.js', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-binding-source-index-js',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace binding index js',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-binding-source-index-js',
      textDomain: 'demo-space',
      title: 'Demo Workspace Binding Source Index Js',
    },
  });

  linkWorkspaceNodeModules(targetDir);
  runCli('node', [entryPath, 'add', 'binding-source', 'hero-data'], {
    cwd: targetDir,
  });

  const bindingsTsPath = path.join(targetDir, 'src', 'bindings', 'index.ts');
  const bindingsJsPath = path.join(targetDir, 'src', 'bindings', 'index.js');
  fs.renameSync(bindingsTsPath, bindingsJsPath);

  const doctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doctorOutput);

  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Binding sources index',
    )?.status,
  ).toBe('pass');
}, 15_000);

test('binding source workflow preserves an existing src/bindings/index.js registry', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-binding-source-existing-js-index',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace binding existing js index',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-binding-source-existing-js-index',
      textDomain: 'demo-space',
      title: 'Demo Workspace Binding Existing Js Index',
    },
  });

  linkWorkspaceNodeModules(targetDir);
  runCli('node', [entryPath, 'add', 'binding-source', 'hero-data'], {
    cwd: targetDir,
  });

  const bindingsTsPath = path.join(targetDir, 'src', 'bindings', 'index.ts');
  const bindingsJsPath = path.join(targetDir, 'src', 'bindings', 'index.js');
  fs.renameSync(bindingsTsPath, bindingsJsPath);

  runCli('node', [entryPath, 'add', 'binding-source', 'news-data'], {
    cwd: targetDir,
  });

  expect(fs.existsSync(bindingsTsPath)).toBe(false);
  expect(fs.existsSync(bindingsJsPath)).toBe(true);
  const bindingsIndexSource = fs.readFileSync(bindingsJsPath, 'utf8');
  expect(bindingsIndexSource).toContain("import './hero-data/editor';");
  expect(bindingsIndexSource).toContain("import './news-data/editor';");
}, 15_000);

test('doctor fails when a binding source target attribute drifts from block metadata', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-binding-source-target-drift',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace binding source target drift',
    slug: 'demo-workspace-binding-source-target-drift',
    title: 'Demo Workspace Binding Source Target Drift',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );
  runCli(
    'node',
    [
      entryPath,
      'add',
      'binding-source',
      'hero-data',
      '--block',
      'counter-card',
      '--attribute',
      'headline',
    ],
    {
      cwd: targetDir,
    },
  );

  const blockJsonPath = path.join(
    targetDir,
    'src',
    'blocks',
    'counter-card',
    'block.json',
  );
  const blockJson = JSON.parse(fs.readFileSync(blockJsonPath, 'utf8'));
  delete blockJson.attributes.headline;
  fs.writeFileSync(blockJsonPath, JSON.stringify(blockJson, null, 2), 'utf8');

  const checks = await getDoctorChecks(targetDir);
  const bindingTargetCheck = checks.find(
    (check) => check.label === 'Binding target hero-data',
  );

  expect(bindingTargetCheck?.status).toBe('fail');
  expect(bindingTargetCheck?.detail).toContain(
    'must declare attribute "headline"',
  );
}, 15_000);

test('doctor accepts workspaces that keep editor plugin registries in src/editor-plugins/index.js', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-editor-plugin-index-js',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace editor plugin index js',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-editor-plugin-index-js',
      textDomain: 'demo-space',
      title: 'Demo Workspace Editor Plugin Index Js',
    },
  });

  linkWorkspaceNodeModules(targetDir);
  runCli(
    'node',
    [entryPath, 'add', 'editor-plugin', 'document-tools'],
    {
      cwd: targetDir,
    },
  );

  const editorPluginsTsPath = path.join(
    targetDir,
    'src',
    'editor-plugins',
    'index.ts',
  );
  const editorPluginsJsPath = path.join(
    targetDir,
    'src',
    'editor-plugins',
    'index.js',
  );
  fs.renameSync(editorPluginsTsPath, editorPluginsJsPath);

  const doctorOutput = runCli('node', [entryPath, 'doctor', '--format', 'json'], {
    cwd: targetDir,
  });
  const doctorChecks = parseJsonObjectFromOutput<{
    checks: Array<{ detail: string; label: string; status: string }>;
  }>(doctorOutput);

  expect(
    doctorChecks.checks.find(
      (check) => check.label === 'Editor plugins index',
    )?.status,
  ).toBe('pass');
}, 15_000);

test('binding source workflow repairs missing bootstrap functions even when hooks remain', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-binding-source-bootstrap-repair',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace binding bootstrap repair',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-binding-source-bootstrap-repair',
      textDomain: 'demo-space',
      title: 'Demo Workspace Binding Bootstrap Repair',
    },
  });

  linkWorkspaceNodeModules(targetDir);
  runCli('node', [entryPath, 'add', 'binding-source', 'hero-data'], {
    cwd: targetDir,
  });

  const bootstrapPath = path.join(
    targetDir,
    'demo-workspace-binding-source-bootstrap-repair.php',
  );
  const brokenBootstrap = `${stripPhpFunction(
    stripPhpFunction(
      fs.readFileSync(bootstrapPath, 'utf8'),
      'demo_space_register_binding_sources',
    ),
    'demo_space_enqueue_binding_sources_editor',
  ).trimEnd()}\n?>\n`;
  fs.writeFileSync(bootstrapPath, brokenBootstrap, 'utf8');

  runCli('node', [entryPath, 'add', 'binding-source', 'news-data'], {
    cwd: targetDir,
  });

  const repairedBootstrap = fs.readFileSync(bootstrapPath, 'utf8');
  expect(
    repairedBootstrap.match(
      /function\s+demo_space_register_binding_sources\s*\(/gu,
    )?.length,
  ).toBe(1);
  expect(
    repairedBootstrap.match(
      /function\s+demo_space_enqueue_binding_sources_editor\s*\(/gu,
    )?.length,
  ).toBe(1);
  expect(
    repairedBootstrap.match(
      /add_action\( 'init', 'demo_space_register_binding_sources', 20 \);/gu,
    )?.length,
  ).toBe(1);
  expect(
    repairedBootstrap.match(
      /add_action\( 'enqueue_block_editor_assets', 'demo_space_enqueue_binding_sources_editor' \);/gu,
    )?.length,
  ).toBe(1);
  expect(repairedBootstrap.trimEnd().endsWith('?>')).toBe(true);
  expect(
    repairedBootstrap.slice(repairedBootstrap.lastIndexOf('?>') + 2).trim(),
  ).toBe('');
  expect(repairedBootstrap).toContain('src/bindings/*/server.php');
  expect(repairedBootstrap).toContain('build/bindings/index.js');
}, 15_000);

test('workspace inventory repair creates every descriptor-backed section', () => {
  const repairedSource = updateWorkspaceInventorySource(`export interface WorkspaceBlockConfig {
\tslug: string;
\ttypesFile: string;
}

export const BLOCKS: WorkspaceBlockConfig[] = [
\t// wp-typia add block entries
];
`);
  const expectedSections = [
    {
      constName: 'VARIATIONS',
      interfaceName: 'WorkspaceVariationConfig',
      marker: '\t// wp-typia add variation entries',
    },
    {
      constName: 'BLOCK_STYLES',
      interfaceName: 'WorkspaceBlockStyleConfig',
      marker: '\t// wp-typia add style entries',
    },
    {
      constName: 'BLOCK_TRANSFORMS',
      interfaceName: 'WorkspaceBlockTransformConfig',
      marker: '\t// wp-typia add transform entries',
    },
    {
      constName: 'PATTERNS',
      interfaceName: 'WorkspacePatternConfig',
      marker: '\t// wp-typia add pattern entries',
    },
    {
      constName: 'BINDING_SOURCES',
      interfaceName: 'WorkspaceBindingSourceConfig',
      marker: '\t// wp-typia add binding-source entries',
    },
    {
      constName: 'CONTRACTS',
      interfaceName: 'WorkspaceContractConfig',
      marker: '\t// wp-typia add contract entries',
    },
    {
      constName: 'REST_RESOURCES',
      interfaceName: 'WorkspaceRestResourceConfig',
      marker: '\t// wp-typia add rest-resource entries',
    },
    {
      constName: 'POST_META',
      interfaceName: 'WorkspacePostMetaConfig',
      marker: '\t// wp-typia add post-meta entries',
    },
    {
      constName: 'ABILITIES',
      interfaceName: 'WorkspaceAbilityConfig',
      marker: '\t// wp-typia add ability entries',
    },
    {
      constName: 'AI_FEATURES',
      interfaceName: 'WorkspaceAiFeatureConfig',
      marker: '\t// wp-typia add ai-feature entries',
    },
    {
      constName: 'ADMIN_VIEWS',
      interfaceName: 'WorkspaceAdminViewConfig',
      marker: '\t// wp-typia add admin-view entries',
    },
    {
      constName: 'EDITOR_PLUGINS',
      interfaceName: 'WorkspaceEditorPluginConfig',
      marker: '\t// wp-typia add editor-plugin entries',
    },
  ];

  let previousSectionIndex = -1;
  for (const { constName, interfaceName, marker } of expectedSections) {
    const interfacePattern = new RegExp(
      `export (?:interface|type) ${interfaceName}\\b`,
      'gu',
    );
    const constPattern = new RegExp(`export const ${constName}\\b`, 'gu');
    expect(repairedSource.match(interfacePattern)?.length).toBe(1);
    expect(repairedSource.match(constPattern)?.length).toBe(1);
    expect(repairedSource).toContain(marker);

    const sectionIndex = repairedSource.search(interfacePattern);
    expect(sectionIndex).toBeGreaterThan(previousSectionIndex);
    expect(repairedSource.indexOf(`export const ${constName}`)).toBeGreaterThan(
      sectionIndex,
    );
    previousSectionIndex = sectionIndex;
  }
});

test('workspace inventory section descriptors support optional interface and const halves', () => {
  const runtimeDir = path.join(
    import.meta.dir,
    '..',
    'src',
    'runtime',
    'workspace',
  );
  const barrelSource = fs.readFileSync(
    path.join(runtimeDir, 'workspace-inventory.ts'),
    'utf8',
  );
  const parserSource = fs.readFileSync(
    path.join(runtimeDir, 'workspace-inventory-parser.ts'),
    'utf8',
  );
  const parserEntriesSource = fs.readFileSync(
    path.join(runtimeDir, 'workspace-inventory-parser-entries.ts'),
    'utf8',
  );
  const parserValidationSource = fs.readFileSync(
    path.join(runtimeDir, 'workspace-inventory-parser-validation.ts'),
    'utf8',
  );
  const sectionDescriptorSource = fs.readFileSync(
    path.join(runtimeDir, 'workspace-inventory-section-descriptors.ts'),
    'utf8',
  );
  const mutationsSource = fs.readFileSync(
    path.join(runtimeDir, 'workspace-inventory-mutations.ts'),
    'utf8',
  );
  const templatesSource = fs.readFileSync(
    path.join(runtimeDir, 'workspace-inventory-templates.ts'),
    'utf8',
  );

  expect(barrelSource).toContain("from './workspace-inventory-parser.js'");
  expect(barrelSource).toContain("from './workspace-inventory-mutations.js'");
  expect(templatesSource).toContain('export const VARIATIONS_INTERFACE_SECTION');
  expect(sectionDescriptorSource).toContain(
    'export const INVENTORY_SECTIONS: readonly InventorySectionDescriptor[]',
  );
  expect(parserValidationSource).toContain('append?: {');
  expect(parserValidationSource).toContain('interface?: {');
  expect(parserValidationSource).toContain('parse?: {');
  expect(parserValidationSource).toContain('value?: {');
  expect(parserSource).toContain(
    "from './workspace-inventory-section-descriptors.js'",
  );
  expect(parserSource).toMatch(
    /export\s*\{\s*BLOCK_INVENTORY_SECTION,\s*INVENTORY_SECTIONS,\s*\}\s*from\s*'\.\/workspace-inventory-section-descriptors\.js';/u,
  );
  expect(parserEntriesSource).toContain('export function parseInventorySection');
  expect(parserValidationSource).toContain(
    'export function defineInventoryEntryParser',
  );
  expect(parserValidationSource).toContain(
    'export function assertParsedInventoryEntry',
  );
  expect(parserSource).toContain('parseInventorySection(sourceFile, section)');
  expect(mutationsSource).toContain(
    "from './workspace-inventory-section-descriptors.js'",
  );
  expect(parserSource).not.toContain('function parseVariationEntries');
  expect(parserSource).not.toContain('function parseRestResourceEntries');
  expect(mutationsSource).not.toContain(
    'appendEntriesAtMarker(nextSource, VARIATION_CONFIG_ENTRY_MARKER',
  );
  expect(mutationsSource).not.toContain(
    'if (!/export\\s+interface\\s+WorkspaceVariationConfig\\b/u.test(nextSource))',
  );
});

test('workspace inventory mutation appends entries through section descriptors', () => {
  const updatedSource = updateWorkspaceInventorySource(
    `export interface WorkspaceBlockConfig {
\tslug: string;
\ttypesFile: string;
}

export const BLOCKS: WorkspaceBlockConfig[] = [
\t// wp-typia add block entries
];
`,
    {
      adminViewEntries: [
        '\t{ file: "src/admin-views/reports/index.tsx", phpFile: "inc/admin-views/reports.php", slug: "reports" },',
      ],
      blockEntries: [
        '\t{ slug: "alert-card", typesFile: "src/blocks/alert-card/types.ts" },',
        '\t{ slug: "price-$&-card", typesFile: "src/blocks/price-$&-card/types.ts" },',
      ],
      blockStyleEntries: [
        '\t{ block: "alert-card", file: "src/blocks/alert-card/styles/outline.ts", slug: "outline" },',
      ],
      editorPluginEntries: [
        '\t{ file: "src/editor-plugins/seo-panel/index.tsx", slug: "seo-panel", slot: "PluginDocumentSettingPanel" },',
      ],
    },
  );

  expect(updatedSource).toContain(
    '\t{ slug: "alert-card", typesFile: "src/blocks/alert-card/types.ts" },\n\t{ slug: "price-$&-card", typesFile: "src/blocks/price-$&-card/types.ts" },\n\t// wp-typia add block entries',
  );
  expect(updatedSource).toContain(
    '\t{ slug: "price-$&-card", typesFile: "src/blocks/price-$&-card/types.ts" },',
  );
  expect(updatedSource).toContain(
    '\t{ block: "alert-card", file: "src/blocks/alert-card/styles/outline.ts", slug: "outline" },\n\t// wp-typia add style entries',
  );
  expect(updatedSource).toContain(
    '\t{ file: "src/admin-views/reports/index.tsx", phpFile: "inc/admin-views/reports.php", slug: "reports" },\n\t// wp-typia add admin-view entries',
  );
  expect(updatedSource).toContain(
    '\t{ file: "src/editor-plugins/seo-panel/index.tsx", slug: "seo-panel", slot: "PluginDocumentSettingPanel" },\n\t// wp-typia add editor-plugin entries',
  );
});

test('workspace inventory parser covers every descriptor-backed section', () => {
  const inventory = parseWorkspaceInventorySource(`
export const BLOCKS = [
  { slug: "counter-card", typesFile: "src/blocks/counter-card/types.ts" },
];
export const VARIATIONS = [
  { block: "counter-card", file: "src/blocks/counter-card/variations/hero-card.ts", slug: "hero-card" },
];
export const BLOCK_STYLES = [
  { block: "counter-card", file: "src/blocks/counter-card/styles/outline.ts", slug: "outline" },
];
export const BLOCK_TRANSFORMS = [
  { block: "counter-card", file: "src/blocks/counter-card/transforms/card.ts", from: "core/paragraph", slug: "paragraph-card", to: "demo/counter-card" },
];
export const PATTERNS = [
  { contentFile: "src/patterns/full/hero-layout.php", file: "src/patterns/full/hero-layout.php", scope: "full", slug: "hero-layout", tags: ["hero"], title: "Hero Layout" },
];
export const BINDING_SOURCES = [
  { attribute: "content", block: "counter-card", editorFile: "src/bindings/hero-data/editor.ts", serverFile: "src/bindings/hero-data/server.php", slug: "hero-data" },
];
export const CONTRACTS = [
  { schemaFile: "src/contracts/external-response.schema.json", slug: "external-response", sourceTypeName: "ExternalResponse", typesFile: "src/contracts/external-response.ts" },
];
export const REST_RESOURCES = [
  { apiFile: "src/rest/products/api.ts", clientFile: "src/rest/products/client.ts", dataFile: "src/rest/products/data.ts", methods: [ "list", "read" ], namespace: "demo-space/v1", openApiFile: "src/rest/products/openapi.json", phpFile: "inc/rest/products.php", slug: "products", typesFile: "src/rest/products/types.ts", validatorsFile: "src/rest/products/validators.ts" },
];
export const POST_META = [
  { metaKey: "_demo_space_integration_state", phpFile: "inc/post-meta/integration-state.php", postType: "post", schemaFile: "src/post-meta/integration-state/meta.schema.json", showInRest: true, slug: "integration-state", sourceTypeName: "IntegrationStateMeta", typesFile: "src/post-meta/integration-state/types.ts" },
];
export const ABILITIES = [
  { clientFile: "src/abilities/review-workflow/client.ts", configFile: "src/abilities/review-workflow/config.ts", dataFile: "src/abilities/review-workflow/data.ts", inputSchemaFile: "src/abilities/review-workflow/input.schema.json", inputTypeName: "ReviewInput", outputSchemaFile: "src/abilities/review-workflow/output.schema.json", outputTypeName: "ReviewOutput", phpFile: "inc/abilities/review-workflow.php", slug: "review-workflow", typesFile: "src/abilities/review-workflow/types.ts" },
];
export const AI_FEATURES = [
  { aiSchemaFile: "src/ai-features/brief-suggestions/ai.schema.json", apiFile: "src/ai-features/brief-suggestions/api.ts", clientFile: "src/ai-features/brief-suggestions/client.ts", dataFile: "src/ai-features/brief-suggestions/data.ts", namespace: "demo-space/v1", openApiFile: "src/ai-features/brief-suggestions/openapi.json", phpFile: "inc/ai-features/brief-suggestions.php", slug: "brief-suggestions", typesFile: "src/ai-features/brief-suggestions/types.ts", validatorsFile: "src/ai-features/brief-suggestions/validators.ts" },
];
export const ADMIN_VIEWS = [
  { file: "src/admin-views/products/index.tsx", phpFile: "inc/admin-views/products.php", slug: "products", source: "rest-resource:products" },
];
export const EDITOR_PLUGINS = [
  { file: "src/editor-plugins/seo-panel/index.tsx", slug: "seo-panel", slot: "PluginDocumentSettingPanel" },
];
`);

  expect(inventory.blocks[0]).toMatchObject({
    slug: 'counter-card',
    typesFile: 'src/blocks/counter-card/types.ts',
  });
  expect(inventory.variations[0]).toMatchObject({
    block: 'counter-card',
    slug: 'hero-card',
  });
  expect(inventory.blockStyles[0]).toMatchObject({
    block: 'counter-card',
    slug: 'outline',
  });
  expect(inventory.blockTransforms[0]).toMatchObject({
    from: 'core/paragraph',
    slug: 'paragraph-card',
    to: 'demo/counter-card',
  });
  expect(inventory.patterns[0]).toMatchObject({ slug: 'hero-layout' });
  expect(inventory.bindingSources[0]).toMatchObject({
    attribute: 'content',
    block: 'counter-card',
    slug: 'hero-data',
  });
  expect(inventory.contracts[0]).toMatchObject({
    schemaFile: 'src/contracts/external-response.schema.json',
    slug: 'external-response',
    sourceTypeName: 'ExternalResponse',
  });
  expect(inventory.restResources[0]).toMatchObject({
    methods: ['list', 'read'],
    namespace: 'demo-space/v1',
    slug: 'products',
  });
  expect(inventory.postMeta[0]).toMatchObject({
    metaKey: '_demo_space_integration_state',
    postType: 'post',
    showInRest: true,
    slug: 'integration-state',
  });
  expect(inventory.abilities[0]).toMatchObject({
    inputTypeName: 'ReviewInput',
    outputTypeName: 'ReviewOutput',
    slug: 'review-workflow',
  });
  expect(inventory.aiFeatures[0]).toMatchObject({
    aiSchemaFile: 'src/ai-features/brief-suggestions/ai.schema.json',
    slug: 'brief-suggestions',
  });
  expect(inventory.adminViews[0]).toMatchObject({
    slug: 'products',
    source: 'rest-resource:products',
  });
  expect(inventory.editorPlugins[0]).toMatchObject({
    slot: 'PluginDocumentSettingPanel',
    slug: 'seo-panel',
  });
  expect({
    hasAbilitiesSection: inventory.hasAbilitiesSection,
    hasAdminViewsSection: inventory.hasAdminViewsSection,
    hasAiFeaturesSection: inventory.hasAiFeaturesSection,
    hasBindingSourcesSection: inventory.hasBindingSourcesSection,
    hasBlockStylesSection: inventory.hasBlockStylesSection,
    hasBlockTransformsSection: inventory.hasBlockTransformsSection,
    hasContractsSection: inventory.hasContractsSection,
    hasEditorPluginsSection: inventory.hasEditorPluginsSection,
    hasPatternsSection: inventory.hasPatternsSection,
    hasPostMetaSection: inventory.hasPostMetaSection,
    hasRestResourcesSection: inventory.hasRestResourcesSection,
    hasVariationsSection: inventory.hasVariationsSection,
  }).toEqual({
    hasAbilitiesSection: true,
    hasAdminViewsSection: true,
    hasAiFeaturesSection: true,
    hasBindingSourcesSection: true,
    hasBlockStylesSection: true,
    hasBlockTransformsSection: true,
    hasContractsSection: true,
    hasEditorPluginsSection: true,
    hasPatternsSection: true,
    hasPostMetaSection: true,
    hasRestResourcesSection: true,
    hasVariationsSection: true,
  });
});

test('workspace inventory parser keeps descriptor validation messages clear', () => {
  expect(() =>
    parseWorkspaceInventorySource('export const BLOCKS = {} as never;'),
  ).toThrow('scripts/block-config.ts must export a BLOCKS array.');

  expect(() =>
    parseWorkspaceInventorySource(`
export const BLOCKS = [
  { slug: "counter-card" },
];
`),
  ).toThrow(
    'BLOCKS[0] is missing required "typesFile" in scripts/block-config.ts.',
  );

  expect(() =>
    parseWorkspaceInventorySource(`
export const BLOCKS = [
  {},
];
`),
  ).toThrow(
    'BLOCKS[0] is missing required fields "slug", "typesFile" in scripts/block-config.ts.',
  );

  expect(() =>
    parseWorkspaceInventorySource(`
export const BLOCKS = [
  { slug: "counter-card", typesFile: "src/blocks/counter-card/types.ts" },
];
export const BLOCK_STYLES = [ false ];
`),
  ).toThrow(
    'BLOCK_STYLES[0] must be an object literal in scripts/block-config.ts.',
  );

  expect(() =>
    parseWorkspaceInventorySource(`
export const BLOCKS = [
  { slug: "counter-card", typesFile: "src/blocks/counter-card/types.ts" },
];
export const REST_RESOURCES = [
  { apiFile: "src/rest/products/api.ts", clientFile: "src/rest/products/client.ts", dataFile: "src/rest/products/data.ts", methods: [ "list", "publish" ], namespace: "demo-space/v1", openApiFile: "src/rest/products/openapi.json", phpFile: "inc/rest/products.php", slug: "products", typesFile: "src/rest/products/types.ts", validatorsFile: "src/rest/products/validators.ts" },
];
`),
  ).toThrow('REST_RESOURCES[0].methods includes unsupported values: publish.');

  expect(() =>
    parseWorkspaceInventorySource(`
export const BLOCKS = [
  { slug: "counter-card", typesFile: "src/blocks/counter-card/types.ts" },
];
export const ABILITIES = [
  {
    clientFile: "src/abilities/review-workflow/client.ts",
    compatibility: {
      hardMinimums: { wordpress: "7.x" },
      mode: "required",
      optionalFeatureIds: [],
      optionalFeatures: [],
      requiredFeatureIds: [],
      requiredFeatures: [],
      runtimeGates: [],
    },
    configFile: "src/abilities/review-workflow/config.ts",
    dataFile: "src/abilities/review-workflow/data.ts",
    inputSchemaFile: "src/abilities/review-workflow/input.schema.json",
    inputTypeName: "ReviewInput",
    outputSchemaFile: "src/abilities/review-workflow/output.schema.json",
    outputTypeName: "ReviewOutput",
    phpFile: "inc/abilities/review-workflow.php",
    slug: "review-workflow",
    typesFile: "src/abilities/review-workflow/types.ts",
  },
];
`),
  ).toThrow(
    'ABILITIES[0].compatibility.hardMinimums.wordpress must be a dotted numeric version such as "6.7" or "8.1.2" in scripts/block-config.ts.',
  );
});

test('async workspace inventory reader matches the sync compatibility reader', async () => {
  const projectDir = path.join(tempRoot, 'workspace-inventory-async-reader');
  const scriptsDir = path.join(projectDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(scriptsDir, 'block-config.ts'),
    `export const BLOCKS = [
\t{
\t\tslug: "counter-card",
\t\ttypesFile: "src/blocks/counter-card/types.ts",
\t},
];
`,
    'utf8',
  );

  await expect(readWorkspaceInventoryAsync(projectDir)).resolves.toEqual(
    readWorkspaceInventory(projectDir),
  );
  await expect(getWorkspaceBlockSelectOptionsAsync(projectDir)).resolves.toEqual([
    {
      description: 'src/blocks/counter-card/types.ts',
      name: 'counter-card',
      value: 'counter-card',
    },
  ]);
  await expect(getWorkspaceBlockSelectOptionsAsync(projectDir)).resolves.toEqual(
    getWorkspaceBlockSelectOptions(projectDir),
  );
});

test('workspace inventory repair avoids duplicating existing section constants', () => {
  const repairedSource = updateWorkspaceInventorySource(
    `export const VARIATIONS: WorkspaceVariationConfig[] = [
\t// wp-typia add variation entries
];

export interface WorkspacePatternConfig {
\tfile: string;
\tslug: string;
}

export const BINDING_SOURCES: WorkspaceBindingSourceConfig[] = [
\t// wp-typia add binding-source entries
];

export interface WorkspaceRestResourceConfig {
\tapiFile: string;
\tclientFile: string;
\tdataFile: string;
\tmethods: string[];
\tnamespace: string;
\topenApiFile: string;
\tphpFile: string;
\tslug: string;
\ttypesFile: string;
\tvalidatorsFile: string;
}

export const REST_RESOURCES: WorkspaceRestResourceConfig[] = [
\t// wp-typia add rest-resource entries
];

export interface WorkspaceAbilityConfig {
\tclientFile: string;
\tconfigFile: string;
\tdataFile: string;
\tinputSchemaFile: string;
\tinputTypeName: string;
\toutputSchemaFile: string;
\toutputTypeName: string;
\tphpFile: string;
\tslug: string;
\ttypesFile: string;
}

export const ABILITIES: WorkspaceAbilityConfig[] = [
\t// wp-typia add ability entries
];

export interface WorkspaceAiFeatureConfig {
\taiSchemaFile: string;
\tapiFile: string;
\tclientFile: string;
\tdataFile: string;
\tnamespace: string;
\topenApiFile: string;
\tphpFile: string;
\tslug: string;
\ttypesFile: string;
\tvalidatorsFile: string;
}

export const AI_FEATURES: WorkspaceAiFeatureConfig[] = [
\t// wp-typia add ai-feature entries
];

export interface WorkspaceEditorPluginConfig {
\tfile: string;
\tslug: string;
\tslot: string;
}

export const EDITOR_PLUGINS: WorkspaceEditorPluginConfig[] = [
\t// wp-typia add editor-plugin entries
];
`,
    {
      patternEntries: [
        '\t{ contentFile: "src/patterns/full/hero.php", file: "src/patterns/full/hero.php", scope: "full", slug: "hero", tags: [], title: "Hero" },',
      ],
      variationEntries: [
        '\t{ block: "counter-card", file: "src/blocks/counter-card/variations/hero.ts", slug: "hero" },',
      ],
      bindingSourceEntries: [
        '\t{ editorFile: "src/bindings/hero/editor.ts", serverFile: "src/bindings/hero/server.php", slug: "hero" },',
      ],
      restResourceEntries: [
        '\t{ apiFile: "src/rest/hero/api.ts", clientFile: "src/rest/hero/api-client.ts", dataFile: "src/rest/hero/data.ts", methods: [ "list", "read" ], namespace: "demo-space/v1", openApiFile: "src/rest/hero/api.openapi.json", phpFile: "inc/rest/hero.php", slug: "hero", typesFile: "src/rest/hero/api-types.ts", validatorsFile: "src/rest/hero/api-validators.ts" },',
      ],
      abilityEntries: [
        '\t{ clientFile: "src/abilities/review-workflow/client.ts", configFile: "src/abilities/review-workflow/ability.config.json", dataFile: "src/abilities/review-workflow/data.ts", inputSchemaFile: "src/abilities/review-workflow/input.schema.json", inputTypeName: "ReviewWorkflowAbilityInput", outputSchemaFile: "src/abilities/review-workflow/output.schema.json", outputTypeName: "ReviewWorkflowAbilityOutput", phpFile: "inc/abilities/review-workflow.php", slug: "review-workflow", typesFile: "src/abilities/review-workflow/types.ts" },',
      ],
      aiFeatureEntries: [
        '\t{ aiSchemaFile: "src/ai-features/hero/ai-schemas/feature-result.ai.schema.json", apiFile: "src/ai-features/hero/api.ts", clientFile: "src/ai-features/hero/api-client.ts", dataFile: "src/ai-features/hero/data.ts", namespace: "demo-space/v1", openApiFile: "src/ai-features/hero/api.openapi.json", phpFile: "inc/ai-features/hero.php", slug: "hero", typesFile: "src/ai-features/hero/api-types.ts", validatorsFile: "src/ai-features/hero/api-validators.ts" },',
      ],
      editorPluginEntries: [
        '\t{ file: "src/editor-plugins/document-tools/index.tsx", slug: "document-tools", slot: "PluginSidebar" },',
      ],
    },
  );

  expect(repairedSource.match(/export const VARIATIONS\b/gu)?.length).toBe(1);
  expect(repairedSource.match(/export const PATTERNS\b/gu)?.length).toBe(1);
  expect(
    repairedSource.match(/export const BINDING_SOURCES\b/gu)?.length,
  ).toBe(1);
  expect(
    repairedSource.match(/export const REST_RESOURCES\b/gu)?.length,
  ).toBe(1);
  expect(repairedSource.match(/export const ABILITIES\b/gu)?.length).toBe(1);
  expect(repairedSource.match(/export const AI_FEATURES\b/gu)?.length).toBe(1);
  expect(
    repairedSource.match(/export const EDITOR_PLUGINS\b/gu)?.length,
  ).toBe(1);
  expect(repairedSource).toContain(
    'export interface WorkspaceVariationConfig',
  );
  expect(repairedSource).toContain('export interface WorkspacePatternConfig');
  expect(repairedSource).toContain(
    'export interface WorkspaceBindingSourceConfig',
  );
  expect(repairedSource).toContain(
    'export interface WorkspaceRestResourceConfig',
  );
  expect(repairedSource).toContain('export interface WorkspaceAbilityConfig');
  expect(repairedSource).toContain(
    'export interface WorkspaceAiFeatureConfig',
  );
  expect(repairedSource).toContain(
    'export interface WorkspaceEditorPluginConfig',
  );
  expect(repairedSource).toContain('slug: "hero"');
  expect(repairedSource).toContain('slug: "document-tools"');
});

test('workspace inventory repair inserts compatibility fields in CRLF inventory interfaces', () => {
  const source = `export interface WorkspaceAbilityConfig {
\tclientFile: string;
\tconfigFile: string;
\tdataFile: string;
\tslug: string;
}

export interface WorkspaceAiFeatureConfig {
\taiSchemaFile: string;
\tapiFile: string;
\tclientFile: string;
\tdataFile: string;
\tslug: string;
}
`.replace(/\n/gu, '\r\n');

  const repairedSource = updateWorkspaceInventorySource(source);

  expect(repairedSource).toContain(
    '\tclientFile: string;\r\n\tcompatibility?: {\r\n\t\thardMinimums:',
  );
  expect(repairedSource).toContain('\t};\r\n\tconfigFile: string;');
  expect(repairedSource).toContain('\t};\r\n\tdataFile: string;');
});

test('workspace inventory repair does not duplicate spaced compatibility fields', () => {
  const repairedSource = updateWorkspaceInventorySource(`
export interface WorkspaceAbilityConfig {
  clientFile: string;
  compatibility: {
    hardMinimums: {
      php?: string;
      wordpress?: string;
    };
    mode: 'baseline' | 'optional' | 'required';
    optionalFeatureIds: string[];
    optionalFeatures: string[];
    requiredFeatureIds: string[];
    requiredFeatures: string[];
    runtimeGates: string[];
  };
  configFile: string;
  slug: string;
}

export interface WorkspaceAiFeatureConfig {
  aiSchemaFile: string;
  clientFile: string;
  compatibility?: {
    hardMinimums: {
      php?: string;
      wordpress?: string;
    };
    mode: 'baseline' | 'optional' | 'required';
    optionalFeatureIds: string[];
    optionalFeatures: string[];
    requiredFeatureIds: string[];
    requiredFeatures: string[];
    runtimeGates: string[];
  };
  dataFile: string;
  slug: string;
}
`);

  expect(repairedSource.match(/^[ \t]*compatibility\??:/gmu)?.length).toBe(2);
  expect(
    repairedSource.match(/\boptionalFeatureIds:\s*string\[\];/gu)?.length,
  ).toBe(2);
  expect(
    repairedSource.match(/\brequiredFeatureIds:\s*string\[\];/gu)?.length,
  ).toBe(2);
});

test('workspace inventory repair replaces legacy spaced compatibility blocks without truncating nested fields', () => {
  const repairedSource = updateWorkspaceInventorySource(`
export interface WorkspaceAbilityConfig {
  clientFile: string;
  compatibility: {
    hardMinimums: {
      php?: string;
      wordpress?: string;
    };
    mode: 'baseline' | 'optional' | 'required';
    optionalFeatures: string[];
    requiredFeatures: string[];
    runtimeGates: string[];
  };
  configFile: string;
  slug: string;
}

export interface WorkspaceAiFeatureConfig {
  aiSchemaFile: string;
  clientFile: string;
  compatibility?: {
    hardMinimums: {
      php?: string;
      wordpress?: string;
    };
    mode: 'baseline' | 'optional' | 'required';
    optionalFeatures: string[];
    requiredFeatures: string[];
    runtimeGates: string[];
  };
  dataFile: string;
  slug: string;
}
`);

  expect(repairedSource.match(/^[ \t]*compatibility\??:/gmu)?.length).toBe(2);
  expect(
    repairedSource.match(/\boptionalFeatureIds:\s*string\[\];/gu)?.length,
  ).toBe(2);
  expect(
    repairedSource.match(/\brequiredFeatureIds:\s*string\[\];/gu)?.length,
  ).toBe(2);
  expect(repairedSource).toContain('  };\n  configFile: string;');
  expect(repairedSource).toContain('  };\n  dataFile: string;');
});

test('doctor passes on a healthy multi-block workspace', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-doctor-multi-block');

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace doctor multi block',
    slug: 'demo-workspace-doctor-multi-block',
    title: 'Demo Workspace Doctor Multi Block',
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );
  runCli(
    'node',
    [entryPath, 'add', 'block', 'author-bio', '--template', 'interactivity'],
    {
      cwd: targetDir,
    },
  );

  const checks = await getDoctorChecks(targetDir);

  expect(
    checks.find((check) => check.label === 'Workspace inventory')?.status,
  ).toBe('pass');
  expect(
    checks.find((check) => check.label === 'Workspace package metadata')
      ?.status,
  ).toBe('pass');
  expect(
    checks.find((check) => check.label === 'Block counter-card')?.status,
  ).toBe('pass');
  expect(
    checks.find((check) => check.label === 'Block metadata counter-card')
      ?.status,
  ).toBe('pass');
  expect(
    checks.find((check) => check.label === 'Block collection counter-card')
      ?.status,
  ).toBe('pass');
  expect(
    checks.find((check) => check.label === 'Block author-bio')?.status,
  ).toBe('pass');
  expect(
    checks.find((check) => check.label === 'Block metadata author-bio')
      ?.status,
  ).toBe('pass');
  expect(
    checks.find((check) => check.label === 'Block collection author-bio')
      ?.status,
  ).toBe('pass');
}, 20_000);

test('doctor accepts flat-only legacy pattern loaders for flat catalog files', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-doctor-flat-patterns');

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace doctor flat patterns',
    slug: 'demo-workspace-doctor-flat-patterns',
    title: 'Demo Workspace Doctor Flat Patterns',
  });

  linkWorkspaceNodeModules(targetDir);
  await runAddPatternCommand({
    contentFile: 'src/patterns/hero-layout.php',
    cwd: targetDir,
    patternName: 'hero-layout',
  });

  const bootstrapPath = path.join(
    targetDir,
    'demo-workspace-doctor-flat-patterns.php',
  );
  const nestedPatternLoader = [
    '\t$pattern_modules = array_merge(',
    "\t\tglob( __DIR__ . '/src/patterns/*.php' ) ?: array(),",
    "\t\tglob( __DIR__ . '/src/patterns/*/*.php' ) ?: array()",
    '\t);',
  ].join('\n');
  const flatPatternLoader =
    "\t$pattern_modules = glob( __DIR__ . '/src/patterns/*.php' ) ?: array();";
  fs.writeFileSync(
    bootstrapPath,
    fs.readFileSync(bootstrapPath, 'utf8').replace(
      nestedPatternLoader,
      flatPatternLoader,
    ),
    'utf8',
  );

  const checks = await getDoctorChecks(targetDir);

  expect(
    checks.find((check) => check.label === 'Pattern bootstrap')?.status,
  ).toBe('pass');
  expect(
    checks.find((check) => check.label === 'Pattern catalog')?.status,
  ).toBe('pass');
  expect(
    checks.find((check) => check.label === 'Pattern hero-layout')?.status,
  ).toBe('pass');
}, 20_000);

test('doctor fails when block.json names drift from workspace conventions', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-doctor-block-name-drift',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace doctor block name drift',
    slug: 'demo-workspace-doctor-block-name-drift',
    title: 'Demo Workspace Doctor Block Name Drift',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );

  const blockJsonPath = path.join(
    targetDir,
    'src',
    'blocks',
    'counter-card',
    'block.json',
  );
  const blockJson = JSON.parse(fs.readFileSync(blockJsonPath, 'utf8'));
  blockJson.name = 'demo-space/counter-card-renamed';
  fs.writeFileSync(blockJsonPath, JSON.stringify(blockJson, null, 2), 'utf8');

  const checks = await getDoctorChecks(targetDir);
  const metadataCheck = checks.find(
    (check) => check.label === 'Block metadata counter-card',
  );

  expect(metadataCheck?.status).toBe('fail');
  expect(metadataCheck?.detail).toContain(
    'block.json name must equal "demo-space/counter-card"',
  );
}, 20_000);

test('doctor fails when block.json textdomains drift from workspace conventions', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-doctor-textdomain-drift',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace doctor textdomain drift',
    slug: 'demo-workspace-doctor-textdomain-drift',
    title: 'Demo Workspace Doctor Textdomain Drift',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );

  const blockJsonPath = path.join(
    targetDir,
    'src',
    'blocks',
    'counter-card',
    'block.json',
  );
  const blockJson = JSON.parse(fs.readFileSync(blockJsonPath, 'utf8'));
  blockJson.textdomain = 'other-space';
  fs.writeFileSync(blockJsonPath, JSON.stringify(blockJson, null, 2), 'utf8');

  const checks = await getDoctorChecks(targetDir);
  const metadataCheck = checks.find(
    (check) => check.label === 'Block metadata counter-card',
  );

  expect(metadataCheck?.status).toBe('fail');
  expect(metadataCheck?.detail).toContain(
    'block.json textdomain must equal "demo-space"',
  );
}, 20_000);

test('doctor fails when generated block artifacts are missing', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-doctor-artifact-drift',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace doctor artifact drift',
    slug: 'demo-workspace-doctor-artifact-drift',
    title: 'Demo Workspace Doctor Artifact Drift',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );

  fs.rmSync(
    path.join(
      targetDir,
      'src',
      'blocks',
      'counter-card',
      'typia-validator.php',
    ),
  );

  const checks = await getDoctorChecks(targetDir);
  const blockCheck = checks.find(
    (check) => check.label === 'Block counter-card',
  );

  expect(blockCheck?.status).toBe('fail');
  expect(blockCheck?.detail).toContain('typia-validator.php');
}, 20_000);

test('doctor fails when block entrypoints lose the shared collection import', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-doctor-collection-drift',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace doctor collection drift',
    slug: 'demo-workspace-doctor-collection-drift',
    title: 'Demo Workspace Doctor Collection Drift',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );

  const blockEntryPath = path.join(
    targetDir,
    'src',
    'blocks',
    'counter-card',
    'index.tsx',
  );
  const entrySource = fs.readFileSync(blockEntryPath, 'utf8');
  fs.writeFileSync(
    blockEntryPath,
    entrySource.replace("import '../../collection';\n", ''),
    'utf8',
  );

  const checks = await getDoctorChecks(targetDir);
  const collectionCheck = checks.find(
    (check) => check.label === 'Block collection counter-card',
  );

  expect(collectionCheck?.status).toBe('fail');
  expect(collectionCheck?.detail).toContain('shared collection import');
}, 20_000);

test('doctor accepts equivalent shared collection import formatting', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-doctor-collection-formatting',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace doctor collection formatting',
    slug: 'demo-workspace-doctor-collection-formatting',
    title: 'Demo Workspace Doctor Collection Formatting',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );

  const blockEntryPath = path.join(
    targetDir,
    'src',
    'blocks',
    'counter-card',
    'index.tsx',
  );
  const entrySource = fs.readFileSync(blockEntryPath, 'utf8');
  fs.writeFileSync(
    blockEntryPath,
    entrySource.replace(
      "import '../../collection';",
      'import "../../collection"',
    ),
    'utf8',
  );

  const checks = await getDoctorChecks(targetDir);
  const collectionCheck = checks.find(
    (check) => check.label === 'Block collection counter-card',
  );

  expect(collectionCheck?.status).toBe('pass');
}, 20_000);

test('doctor fails when block.json blockHooks use malformed metadata', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-doctor-hooked-block-drift',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace doctor hooked block drift',
    slug: 'demo-workspace-doctor-hooked-block-drift',
    title: 'Demo Workspace Doctor Hooked Block Drift',
  });

  linkWorkspaceNodeModules(targetDir);
  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );

  const blockJsonPath = path.join(
    targetDir,
    'src',
    'blocks',
    'counter-card',
    'block.json',
  );
  const blockJson = JSON.parse(fs.readFileSync(blockJsonPath, 'utf8'));
  blockJson.blockHooks = {
    'demo-space/counter-card': 'after',
  };
  fs.writeFileSync(blockJsonPath, JSON.stringify(blockJson, null, 2), 'utf8');

  const checks = await getDoctorChecks(targetDir);
  const blockHooksCheck = checks.find(
    (check) => check.label === 'Block hooks counter-card',
  );

  expect(blockHooksCheck?.status).toBe('fail');
  expect(blockHooksCheck?.detail).toContain(
    'demo-space/counter-card => after',
  );
}, 20_000);

test('doctor fails when workspace package metadata becomes invalid', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-doctor-invalid-metadata',
  );

  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Demo workspace doctor invalid metadata',
    slug: 'demo-workspace-doctor-invalid-metadata',
    title: 'Demo Workspace Doctor Invalid Metadata',
  });

  linkWorkspaceNodeModules(targetDir);

  const packageJsonPath = path.join(targetDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.wpTypia.namespace = '   ';
  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify(packageJson, null, 2),
    'utf8',
  );

  const checks = await getDoctorChecks(targetDir);
  const metadataCheck = checks.find(
    (check) => check.label === 'Workspace package metadata',
  );

  expect(metadataCheck?.status).toBe('fail');
  expect(metadataCheck?.detail).toContain(
    'wpTypia.namespace must be a non-empty string',
  );
}, 20_000);

test('doctor fails on missing variation and pattern inventory files', async () => {
  const targetDir = path.join(tempRoot, 'demo-workspace-doctor-drift');

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace doctor drift',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-doctor-drift',
      textDomain: 'demo-space',
      title: 'Demo Workspace Doctor Drift',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  runCli(
    'node',
    [entryPath, 'add', 'block', 'counter-card', '--template', 'basic'],
    {
      cwd: targetDir,
    },
  );
  runCli(
    'node',
    [entryPath, 'add', 'variation', 'hero-card', '--block', 'counter-card'],
    { cwd: targetDir },
  );
  runCli('node', [entryPath, 'add', 'pattern', 'hero-layout'], {
    cwd: targetDir,
  });

  fs.rmSync(
    path.join(
      targetDir,
      'src',
      'blocks',
      'counter-card',
      'variations',
      'hero-card.ts',
    ),
  );
  fs.rmSync(
    path.join(targetDir, 'src', 'patterns', 'full', 'hero-layout.php'),
  );

  const errorMessage = getCommandErrorMessage(() =>
    runCli('node', [entryPath, 'doctor'], {
      cwd: targetDir,
      env: humanCliEnv,
    }),
  );

  expect(errorMessage).toContain('Summary: One or more doctor checks failed.');
  expect(errorMessage).toContain('Variation counter-card/hero-card');
  expect(errorMessage).toContain('Pattern catalog');
  expect(errorMessage).toContain('Pattern hero-layout');
}, 15_000);

test('doctor fails when workspace inventory entries are malformed', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-doctor-invalid-inventory',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace invalid inventory',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-doctor-invalid-inventory',
      textDomain: 'demo-space',
      title: 'Demo Workspace Invalid Inventory',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  const blockConfigPath = path.join(targetDir, 'scripts', 'block-config.ts');
  const blockConfigSource = fs.readFileSync(blockConfigPath, 'utf8');
  fs.writeFileSync(
    blockConfigPath,
    blockConfigSource.replace(
      '// wp-typia add pattern entries',
      `\t{\n\t\tcontentFile: "../broken.php",\n\t\tslug: "broken-pattern",\n\t},\n\t// wp-typia add pattern entries`,
    ),
    'utf8',
  );

  const errorMessage = getCommandErrorMessage(() =>
    runCli('node', [entryPath, 'doctor'], {
      cwd: targetDir,
      env: humanCliEnv,
    }),
  );

  expect(errorMessage).toContain('Pattern catalog');
  expect(errorMessage).toContain('invalid-pattern-content-file');
});

test('doctor fails when workspace inventory exports use non-array initializers', async () => {
  const targetDir = path.join(
    tempRoot,
    'demo-workspace-doctor-invalid-export-shape',
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    answers: {
      author: 'Test Runner',
      description: 'Demo workspace invalid export shape',
      namespace: 'demo-space',
      phpPrefix: 'demo_space',
      slug: 'demo-workspace-doctor-invalid-export-shape',
      textDomain: 'demo-space',
      title: 'Demo Workspace Invalid Export Shape',
    },
  });

  linkWorkspaceNodeModules(targetDir);

  const blockConfigPath = path.join(targetDir, 'scripts', 'block-config.ts');
  const blockConfigSource = fs.readFileSync(blockConfigPath, 'utf8');
  fs.writeFileSync(
    blockConfigPath,
    blockConfigSource.replace(
      /export const VARIATIONS: WorkspaceVariationConfig\[\] = \[\r?\n[ \t]*\/\/ wp-typia add variation entries\r?\n\];/u,
      'export const VARIATIONS: WorkspaceVariationConfig[] = {} as never;',
    ),
    'utf8',
  );

  const errorMessage = getCommandErrorMessage(() =>
    runCli('node', [entryPath, 'doctor'], {
      cwd: targetDir,
      env: humanCliEnv,
    }),
  );

  expect(errorMessage).toContain('Workspace inventory');
  expect(errorMessage).toContain(
    'must export VARIATIONS as an array literal',
  );
});
});
