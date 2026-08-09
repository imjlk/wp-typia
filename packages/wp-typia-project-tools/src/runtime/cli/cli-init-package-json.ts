import fs from 'node:fs';
import path from 'node:path';

import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from './cli-diagnostics.js';
import {
  getPackageManager,
  transformPackageManagerText,
  type PackageManagerId,
} from '../shared/package-managers.js';
import {
  DEFAULT_WORDPRESS_BLOCKS_TYPES_VERSION,
  DEFAULT_WORDPRESS_BLOCKS_VERSION,
  getPackageVersions,
} from '../shared/package-versions.js';
import { readJsonFileSync } from '../shared/json-utils.js';
import {
  hasPackageRunScriptCommand,
  hasPackageRunScriptInvocation,
  hasTtscLintCompatPostinstallCommand,
  hasTtscNoEmitLintCommand,
  removePackageRunScriptInvocations,
} from '../shared/ttsc-lint-config.js';
import type {
  InitDependencyChange,
  InitPackageManagerFieldChange,
  InitScriptChange,
  ProjectPackageJson,
  RetrofitInitPlan,
} from './cli-init-types.js';
import { parseWorkspacePackageManagerId } from '../workspace/workspace-project.js';

const BASE_RETROFIT_SCRIPTS = {
  postinstall: 'node scripts/apply-ttsc-lint-compat.mjs',
  sync: 'ttsx scripts/sync-project.ts',
  'sync-types': 'ttsx scripts/sync-types-to-block-json.ts',
  typecheck: 'bun run sync --check && ttsc --noEmit',
} as const;

const BASE_RETROFIT_DEV_DEPENDENCIES = [
  '@ttsc/lint',
  '@ttsc/unplugin',
  '@types/wordpress__blocks',
  '@wordpress/blocks',
  '@wp-typia/block-runtime',
  '@wp-typia/block-types',
  '@wp-typia/ttsc-lint-plugin-wp',
  'ttsc',
  'typescript',
  'typia',
] as const;

const OFFICIAL_WORKSPACE_LINT_DEV_DEPENDENCIES = [
  '@ttsc/lint',
  '@wp-typia/ttsc-lint-plugin-wp',
  'ttsc',
  'typescript',
] as const satisfies readonly (typeof BASE_RETROFIT_DEV_DEPENDENCIES)[number][];

export function readProjectPackageJson(
	projectDir: string,
): ProjectPackageJson | null {
  const packageJsonPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    return readJsonFileSync<ProjectPackageJson>(packageJsonPath, {
      context: 'project package manifest',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      `Unable to parse ${packageJsonPath}: ${message}`,
      error instanceof Error ? { cause: error } : undefined,
    );
  }
}

function inferInitPackageManager(
	projectDir: string,
	packageJson: ProjectPackageJson | null,
): PackageManagerId {
  if (packageJson?.packageManager) {
    return parseWorkspacePackageManagerId(packageJson.packageManager);
  }

  if (
		fs.existsSync(path.join(projectDir, 'bun.lock')) ||
		fs.existsSync(path.join(projectDir, 'bun.lockb'))
	) {
    return 'bun';
  }
  if (fs.existsSync(path.join(projectDir, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (
		fs.existsSync(path.join(projectDir, 'yarn.lock')) ||
		fs.existsSync(path.join(projectDir, '.yarnrc.yml'))
	) {
    return 'yarn';
  }

  return 'npm';
}

export function resolveInitPackageManager(
	projectDir: string,
	packageJson: ProjectPackageJson | null,
	override?: string,
): PackageManagerId {
  if (!override) {
    return inferInitPackageManager(projectDir, packageJson);
  }

  if (
		override !== 'bun' &&
		override !== 'npm' &&
		override !== 'pnpm' &&
		override !== 'yarn'
	) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      `Unknown package manager "${override}". Expected one of: bun, npm, pnpm, yarn.`,
    );
  }

  return override;
}

export function getWpTypiaCliSpecifier(): string {
  const versions = getPackageVersions();
  return versions.wpTypiaPackageExactVersion === '0.0.0'
    ? 'wp-typia'
    : `wp-typia@${versions.wpTypiaPackageExactVersion}`;
}

function buildRequiredDevDependencyMap(): Record<string, string> {
  const versions = getPackageVersions();
  return {
    '@ttsc/lint': versions.ttscLintPackageVersion,
    '@ttsc/unplugin': versions.ttscUnpluginPackageVersion,
    '@types/wordpress__blocks': DEFAULT_WORDPRESS_BLOCKS_TYPES_VERSION,
    '@wordpress/blocks': DEFAULT_WORDPRESS_BLOCKS_VERSION,
    '@wp-typia/block-runtime': versions.blockRuntimePackageVersion,
    '@wp-typia/block-types': versions.blockTypesPackageVersion,
    '@wp-typia/ttsc-lint-plugin-wp':
      versions.ttscLintPluginWpPackageVersion,
    ttsc: versions.ttscPackageVersion,
    typescript: versions.typescriptPackageVersion,
    typia: versions.typiaPackageVersion,
  };
}

function getExistingDependencyVersion(
	packageJson: ProjectPackageJson | null,
	name: string,
): string | undefined {
  return packageJson?.devDependencies?.[name] ?? packageJson?.dependencies?.[name];
}

export function hasObsoleteTypiaUnpluginDependency(
	packageJson: ProjectPackageJson | null,
): boolean {
  return (
		getExistingDependencyVersion(packageJson, '@typia/unplugin') !== undefined
  );
}

function buildDependencyChangesForNames(
	packageJson: ProjectPackageJson | null,
  names: readonly (typeof BASE_RETROFIT_DEV_DEPENDENCIES)[number][],
): InitDependencyChange[] {
  const requiredDependencies = buildRequiredDevDependencyMap();
  return names.flatMap((name) => {
		const requiredValue = requiredDependencies[name];
		const currentValue = getExistingDependencyVersion(packageJson, name);

		if (currentValue === requiredValue) {
			return [];
		}

		return [
			{
				action: currentValue ? 'update' : 'add',
				...(currentValue ? { currentValue } : {}),
				name,
				requiredValue,
			} satisfies InitDependencyChange,
		];
	});
}

export function buildDependencyChanges(
	packageJson: ProjectPackageJson | null,
): InitDependencyChange[] {
  return buildDependencyChangesForNames(
    packageJson,
    BASE_RETROFIT_DEV_DEPENDENCIES,
  );
}

/** Build only dependencies owned by official-workspace lint adoption. */
export function buildOfficialWorkspaceLintDependencyChanges(
  packageJson: ProjectPackageJson | null,
): InitDependencyChange[] {
  return buildDependencyChangesForNames(
    packageJson,
    OFFICIAL_WORKSPACE_LINT_DEV_DEPENDENCIES,
  );
}

function buildOptionalScriptChange(
  name: string,
  currentValue: string | undefined,
  requiredValue: string,
): InitScriptChange[] {
  if (currentValue === requiredValue) {
    return [];
  }

  return [
    {
      action: typeof currentValue === 'string' ? 'update' : 'add',
      ...(typeof currentValue === 'string' ? { currentValue } : {}),
      name,
      requiredValue,
    },
  ];
}

function mergePostinstallCommand(
  currentValue: string | undefined,
  requiredCommand: string,
): string {
  if (typeof currentValue === 'string' && currentValue.trim().length > 0) {
    if (hasTtscLintCompatPostinstallCommand(currentValue)) {
      return currentValue;
    }
    // Correctly parsing comments inside command substitutions requires a full
    // shell parser. Keep comment-only scripts intact after the managed hook;
    // otherwise insert the hook before the last recognized trailing comment.
    if (currentValue.includes('#')) {
      const containsOnlyComments = currentValue
        .split(/\r?\n/u)
        .every((line) => {
          const trimmed = line.trimStart();
          return trimmed.length === 0 || trimmed.startsWith('#');
        });
      return containsOnlyComments
        ? `${requiredCommand} ${currentValue.trimStart()}`
        : insertCommandBeforeTrailingShellComment(
            currentValue,
            requiredCommand,
          );
    }
    return `${currentValue} && ${requiredCommand}`;
  }
  return requiredCommand;
}

function getShellCommentIndex(line: string): number | null {
  let escaped = false;
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const character = line.charAt(index);
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
    } else if (
      character === '#' &&
      (index === 0 || /[\s;&|()]/u.test(line[index - 1] ?? ''))
    ) {
      return index;
    }
  }
  return null;
}

function countBackslashesBefore(source: string, index: number): number {
  let count = 0;
  for (
    let cursor = index - 1;
    source.charAt(cursor) === '\\';
    cursor -= 1
  ) {
    count += 1;
  }
  return count;
}

function stripTrailingIncompleteShellOperators(source: string): string {
  let result = source.trimEnd();
  while (result.length > 0) {
    let operatorLength = 0;
    if (
      (result.endsWith('&&') || result.endsWith('||')) &&
      countBackslashesBefore(result, result.length - 2) % 2 === 0
    ) {
      operatorLength = 2;
    } else if (
      (result.endsWith('|') || result.endsWith(';')) &&
      countBackslashesBefore(result, result.length - 1) % 2 === 0
    ) {
      operatorLength = 1;
    }
    if (operatorLength === 0) {
      return result;
    }
    result = result.slice(0, -operatorLength).trimEnd();
  }
  return result;
}

function insertCommandBeforeTrailingShellComment(
  currentValue: string,
  requiredCommand: string,
): string {
  const lines = currentValue.split(/(\r?\n)/u);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] ?? '';
    if (/^\r?\n$/u.test(line)) {
      continue;
    }
    const commentIndex = getShellCommentIndex(line);
    let commandSource = stripTrailingIncompleteShellOperators(
      commentIndex === null ? line : line.slice(0, commentIndex),
    );
    const trailingBackslashCount = countBackslashesBefore(
      commandSource,
      commandSource.length,
    );
    if (trailingBackslashCount % 2 === 1) {
      commandSource = stripTrailingIncompleteShellOperators(
        commandSource.slice(0, -1),
      );
    }
    if (commandSource.length === 0) {
      continue;
    }
    const commentSource =
      commentIndex === null ? '' : line.slice(commentIndex);
    const endsWithBackgroundOperator =
      commandSource.endsWith('&') &&
      countBackslashesBefore(commandSource, commandSource.length - 1) % 2 ===
        0;
    const separator = endsWithBackgroundOperator ? ' ' : ' && ';
    lines[index] = `${commandSource}${separator}${requiredCommand}${
      commentSource ? ` ${commentSource}` : ''
    }`;
    return lines.join('');
  }
  return `${requiredCommand} ${currentValue.trimStart()}`;
}

export function buildScriptChanges(
	packageJson: ProjectPackageJson | null,
	packageManager: PackageManagerId,
): InitScriptChange[] {
  const scripts = packageJson?.scripts ?? {};

  return Object.entries(BASE_RETROFIT_SCRIPTS).flatMap(
		([name, commandSource]) => {
			const command = transformPackageManagerText(
				commandSource,
				packageManager,
			);
			const currentValue = scripts[name];
			let requiredValue = command;
			if (name === 'postinstall') {
				requiredValue = mergePostinstallCommand(currentValue, command);
			}
			return buildOptionalScriptChange(name, currentValue, requiredValue);
		},
	);
}

/**
 * Add the TypeScript lint lane to an existing official workspace without
 * enabling the incomplete WordPress JavaScript replacement prematurely.
 *
 * Existing aggregate lint commands are preserved after the new `lint:ts`
 * prerequisite, so projects that intentionally run only style lint (or retain
 * a separate JavaScript lane) keep that behavior until upstream exposes a
 * lint-only `ttsc` command.
 */
export function buildOfficialWorkspaceLintScriptChanges(
  packageJson: ProjectPackageJson | null,
  packageManager: PackageManagerId,
): InitScriptChange[] {
  const scripts = packageJson?.scripts ?? {};
  const postinstallCommand = transformPackageManagerText(
    BASE_RETROFIT_SCRIPTS.postinstall,
    packageManager,
  );
  const currentPostinstall = scripts.postinstall;
  const requiredPostinstall = mergePostinstallCommand(
    currentPostinstall,
    postinstallCommand,
  );
  const lintTsCommand = 'ttsc --noEmit';
  const lintTsRun = transformPackageManagerText(
    'bun run lint:ts',
    packageManager,
  );
  const currentLintTs = scripts['lint:ts'];
  const lintTsSatisfied = hasTtscNoEmitLintCommand(currentLintTs);
  const currentLint = scripts.lint;
  let requiredLint = lintTsRun;
  if (typeof currentLint === 'string' && currentLint.trim().length > 0) {
    const includesLintTs = hasPackageRunScriptCommand(currentLint, 'lint:ts');
    if (includesLintTs) {
      requiredLint = currentLint;
    } else if (hasPackageRunScriptInvocation(currentLint, 'lint:ts')) {
      const retainedLint = removePackageRunScriptInvocations(
        currentLint,
        'lint:ts',
      );
      if (retainedLint === null) {
        requiredLint = `${lintTsRun} && ${currentLint}`;
      } else if (retainedLint) {
        requiredLint = `${lintTsRun} && ${retainedLint}`;
      } else {
        requiredLint = lintTsRun;
      }
    } else {
      requiredLint = `${lintTsRun} && ${currentLint}`;
    }
  }

  return [
    ...buildOptionalScriptChange(
      'postinstall',
      currentPostinstall,
      requiredPostinstall,
    ),
    ...(lintTsSatisfied
      ? []
      : buildOptionalScriptChange('lint:ts', currentLintTs, lintTsCommand)),
    ...buildOptionalScriptChange('lint', currentLint, requiredLint),
  ];
}

export function buildPackageManagerFieldChange(
	packageJson: ProjectPackageJson | null,
	packageManager: PackageManagerId,
	options: {
		persistExplicitOverride?: boolean;
	} = {},
): InitPackageManagerFieldChange | undefined {
  if (!options.persistExplicitOverride && packageManager === 'npm') {
    return undefined;
  }

  const requiredValue = getPackageManager(packageManager).packageManagerField;
  const currentValue = packageJson?.packageManager;
  if (currentValue === requiredValue) {
    return undefined;
  }

  return {
    action: typeof currentValue === 'string' ? 'update' : 'add',
    ...(typeof currentValue === 'string' ? { currentValue } : {}),
    requiredValue,
  };
}

export function hasExistingWpTypiaProjectSurface(
	projectDir: string,
	packageJson: ProjectPackageJson | null,
): boolean {
  const scripts = packageJson?.scripts ?? {};
  const hasSyncSurface =
		typeof scripts.sync === 'string' || typeof scripts['sync-types'] === 'string';
  const hasHelperFiles = [
		path.join('scripts', 'block-config.ts'),
		path.join('scripts', 'sync-project.ts'),
		path.join('scripts', 'sync-types-to-block-json.ts'),
	].every((relativePath) => fs.existsSync(path.join(projectDir, relativePath)));
  const hasRuntimeDeps =
		typeof getExistingDependencyVersion(
      packageJson,
      '@wp-typia/block-runtime',
    ) ===
			'string' &&
		typeof getExistingDependencyVersion(
      packageJson,
      '@wp-typia/block-types',
    ) ===
			'string';

  return hasSyncSurface && hasHelperFiles && hasRuntimeDeps;
}

function setDependencyVersion(
	packageJson: ProjectPackageJson,
	name: string,
	requiredValue: string,
): void {
  if (packageJson.devDependencies?.[name] !== undefined) {
    packageJson.devDependencies[name] = requiredValue;
    return;
  }
  if (packageJson.dependencies?.[name] !== undefined) {
    packageJson.dependencies[name] = requiredValue;
    return;
  }

  packageJson.devDependencies ??= {};
  packageJson.devDependencies[name] = requiredValue;
}

function removeDependency(
	packageJson: ProjectPackageJson,
	name: string,
): void {
  delete packageJson.devDependencies?.[name];
  delete packageJson.dependencies?.[name];
}

export function buildNextProjectPackageJson(options: {
  packageChanges: RetrofitInitPlan['packageChanges'];
  packageJson: ProjectPackageJson | null;
  packageManager: PackageManagerId;
  projectName: string;
  removeTypiaUnplugin?: boolean;
}): ProjectPackageJson {
  const nextPackageJson: ProjectPackageJson = options.packageJson
    ? JSON.parse(JSON.stringify(options.packageJson))
    : {
        name: options.projectName,
        private: true,
      };

  nextPackageJson.devDependencies ??= {};
  nextPackageJson.scripts ??= {};

  for (const dependencyChange of options.packageChanges.addDevDependencies) {
    setDependencyVersion(
      nextPackageJson,
      dependencyChange.name,
      dependencyChange.requiredValue,
    );
  }
  if (options.removeTypiaUnplugin !== false) {
    removeDependency(nextPackageJson, '@typia/unplugin');
  }

  if (options.packageChanges.packageManagerField) {
    nextPackageJson.packageManager =
			options.packageChanges.packageManagerField.requiredValue;
  } else if (
		!nextPackageJson.packageManager &&
		options.packageManager !== 'npm'
	) {
    nextPackageJson.packageManager =
			getPackageManager(options.packageManager).packageManagerField;
  }

  for (const scriptChange of options.packageChanges.scripts) {
    nextPackageJson.scripts[scriptChange.name] = scriptChange.requiredValue;
  }

  return nextPackageJson;
}

export function buildProjectPackageJsonSource(
	packageJson: ProjectPackageJson,
): string {
  return `${JSON.stringify(packageJson, null, 2)}\n`;
}
