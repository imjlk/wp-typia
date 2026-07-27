#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const LINT_CONFIG_FILES = [
  '.eslintrc.cjs',
  '.eslintrc.js',
  '.eslintrc.json',
  '.eslintrc.yaml',
  '.eslintrc.yml',
  'eslint.config.js',
  '.eslintrc',
];

export const DEFAULT_LINT_EXTENSIONS = 'js,jsx,cjs,mjs';
export const PRETTIER_RULE_OVERRIDE = ['--rule', 'prettier/prettier: off'];
export const TYPESCRIPT6_REGISTER_FILE = 'register-typescript6.cjs';

const LINT_OPTIONS_WITH_VALUES = new Set([
  '-c',
  '--cache-location',
  '--config',
  '--env',
  '--ext',
  '-f',
  '--fix-type',
  '--flag',
  '--format',
  '--global',
  '--ignore-path',
  '--ignore-pattern',
  '--max-warnings',
  '-o',
  '--output-file',
  '--parser',
  '--parser-options',
  '--plugin',
  '--report-unused-disable-directives-severity',
  '--resolve-plugins-relative-to',
  '--rule',
  '--stats',
]);

function hasArg(args, ...candidates) {
  return candidates.some((candidate) => args.includes(candidate));
}

export function hasExplicitLintTargets(args) {
  let afterOptionSeparator = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (afterOptionSeparator) {
      return true;
    }

    if (arg === '--') {
      afterOptionSeparator = true;
      continue;
    }

    if (!arg.startsWith('-')) {
      return true;
    }

    const [optionName] = arg.split('=', 1);
    if (!arg.includes('=') && LINT_OPTIONS_WITH_VALUES.has(optionName)) {
      index += 1;
    }
  }

  return false;
}

function hasProjectFile(projectDir, fileName) {
  return fs.existsSync(path.join(projectDir, fileName));
}

function hasPackageProp(projectRequire, propertyName) {
  try {
    const packageJson = projectRequire('./package.json');
    return Object.prototype.hasOwnProperty.call(packageJson, propertyName);
  } catch {
    return false;
  }
}

function hasPackageDependency(projectRequire, dependencyName) {
  try {
    const packageJson = projectRequire('./package.json');
    return ['dependencies', 'devDependencies'].some(
      (field) =>
        typeof packageJson[field]?.[dependencyName] === 'string',
    );
  } catch {
    return false;
  }
}

export function runWpScriptsLintJsCompat({
  args = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  const projectRequire = createRequire(path.join(cwd, 'package.json'));
  const hasLintConfig =
    hasArg(args, '-c', '--config') ||
    LINT_CONFIG_FILES.some((fileName) => hasProjectFile(cwd, fileName)) ||
    hasPackageProp(projectRequire, 'eslintConfig');

  const wpScriptsPackageJsonPath = projectRequire.resolve(
    '@wordpress/scripts/package.json',
  );
  const wpScriptsDir = path.dirname(wpScriptsPackageJsonPath);
  const eslintRequire = hasPackageDependency(projectRequire, 'eslint')
    ? projectRequire
    : createRequire(wpScriptsPackageJsonPath);
  const eslintPackageJsonPath = eslintRequire.resolve('eslint/package.json');
  const eslintPackageJson = JSON.parse(
    fs.readFileSync(eslintPackageJsonPath, 'utf8'),
  );
  const eslintDir = path.dirname(eslintPackageJsonPath);
  const eslintBinPath = path.join(
    eslintDir,
    typeof eslintPackageJson.bin === 'string'
      ? eslintPackageJson.bin
      : eslintPackageJson.bin.eslint,
  );
  const defaultConfigArgs = hasLintConfig
    ? []
    : [
        '--no-eslintrc',
        '--config',
        path.join(wpScriptsDir, 'config', '.eslintrc.js'),
      ];
  const defaultIgnoreArgs =
    hasArg(args, '--ignore-path') || hasProjectFile(cwd, '.eslintignore')
      ? []
      : ['--ignore-path', path.join(wpScriptsDir, 'config', '.eslintignore')];
  const defaultExtArgs = hasArg(args, '--ext')
    ? []
    : ['--ext', DEFAULT_LINT_EXTENSIONS];
  const defaultFilesArgs = hasExplicitLintTargets(args) ? [] : ['.'];
  const registerTypescript6Path = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    TYPESCRIPT6_REGISTER_FILE,
  );

  const result = spawnSync(
    process.execPath,
    [
      '--require',
      registerTypescript6Path,
      eslintBinPath,
      ...defaultConfigArgs,
      ...defaultIgnoreArgs,
      ...defaultExtArgs,
      ...args,
      ...PRETTIER_RULE_OVERRIDE,
      ...defaultFilesArgs,
    ],
    {
      env: {
        ...env,
        ESLINT_USE_FLAT_CONFIG: 'false',
      },
      stdio: 'inherit',
    },
  );

  return result.status ?? 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exit(runWpScriptsLintJsCompat());
}
