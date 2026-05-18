#!/usr/bin/env node

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const cliEntrypoint = path.join(packageRoot, 'dist', 'cli.js');
const buildScriptEntrypoint = path.join(packageRoot, 'scripts', 'build-runtime.ts');
const sourceProjectToolsPackageRoot = path.resolve(
  packageRoot,
  '..',
  'wp-typia-project-tools',
);
const sourceCheckoutRoot = path.resolve(packageRoot, '..', '..');
const sourceProjectToolsPackageManifest = path.join(
  sourceProjectToolsPackageRoot,
  'package.json',
);
const sourceProjectToolsRuntimeProbe = path.join(
  sourceProjectToolsPackageRoot,
  'dist',
  'runtime',
  'cli-diagnostics.js',
);
const sourceProjectToolsBuildCommand =
  'bun run --filter @wp-typia/project-tools build';

function normalizeTopLevelHelpArgv(argv) {
  const [firstArg, secondArg, ...rest] = argv;
  if (
    (firstArg === '--help' || firstArg === '-h') &&
    typeof secondArg === 'string' &&
    secondArg.length > 0 &&
    !secondArg.startsWith('-')
  ) {
    return [secondArg, firstArg, ...rest];
  }

  return argv;
}

function canAutobuildSourceCheckout() {
  return fs.existsSync(buildScriptEntrypoint);
}

function isWorkingBunBinary() {
  const bunCheck = spawnSync(process.env.BUN_BIN || 'bun', ['--version'], {
    env: process.env,
    stdio: 'ignore',
  });

  return !bunCheck.error && bunCheck.status === 0;
}

function runBun(args, options) {
  return spawnSync(process.env.BUN_BIN || 'bun', args, {
    cwd: packageRoot,
    env: process.env,
    stdio: 'inherit',
    ...options,
  });
}

function hasMissingSourceProjectToolsRuntime() {
  return (
    canAutobuildSourceCheckout() &&
    fs.existsSync(path.join(sourceCheckoutRoot, 'package.json')) &&
    fs.existsSync(sourceProjectToolsPackageManifest) &&
    !fs.existsSync(sourceProjectToolsRuntimeProbe)
  );
}

function ensureSourceProjectToolsRuntime() {
  if (!hasMissingSourceProjectToolsRuntime()) {
    return true;
  }

  const relativeProbe = path.relative(
    sourceCheckoutRoot,
    sourceProjectToolsRuntimeProbe,
  );

  console.error(
    `wp-typia source checkout is missing @wp-typia/project-tools build artifacts (${relativeProbe}).`,
  );

  if (!isWorkingBunBinary()) {
    console.error(
      `Error: wp-typia cannot rebuild @wp-typia/project-tools because no working Bun binary was found. Run \`${sourceProjectToolsBuildCommand}\` from the repository root after installing Bun, then rerun wp-typia.`,
    );
    process.exit(1);
  }

  console.error(
    `Running \`${sourceProjectToolsBuildCommand}\` from ${sourceCheckoutRoot} before rebuilding the CLI runtime...`,
  );

  const buildResult = runBun(
    ['run', '--filter', '@wp-typia/project-tools', 'build'],
    {
      cwd: sourceCheckoutRoot,
    },
  );

  if (buildResult.status !== 0) {
    console.error(
      `Error: @wp-typia/project-tools build failed. Run \`${sourceProjectToolsBuildCommand}\` from the repository root, then rerun wp-typia.`,
    );
    process.exit(buildResult.status ?? 1);
  }

  return fs.existsSync(sourceProjectToolsRuntimeProbe);
}

function ensureBuiltRuntime() {
  if (!ensureSourceProjectToolsRuntime()) {
    return false;
  }

  if (fs.existsSync(cliEntrypoint)) {
    return true;
  }

  if (!canAutobuildSourceCheckout() || !isWorkingBunBinary()) {
    return false;
  }

  const buildResult = runBun(['run', 'build']);
  if (buildResult.status !== 0) {
    process.exit(buildResult.status ?? 1);
  }

  return fs.existsSync(cliEntrypoint);
}

const argv = normalizeTopLevelHelpArgv(process.argv.slice(2));

if (!ensureBuiltRuntime()) {
  console.error(
    'Error: wp-typia could not locate its CLI runtime. Reinstall the published package, or run `bun run build` when using a source checkout.',
  );
  process.exit(1);
}

const cliModule = await import(pathToFileURL(cliEntrypoint).href);
await cliModule.runGunshiCliEntrypoint(argv);
