import fs from 'node:fs';
import path from 'node:path';

import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from './cli-diagnostics.js';
import {
  getPackageManager,
  PACKAGE_MANAGER_IDS,
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
  hasExactShellCommand,
  hasManagedSyncBeforeTtscCheckNoEmitCommand,
  hasTtscLintCompatPostinstallCommand,
  hasTtscCheckNoEmitCommand,
  hasTopLevelTerminatingShellCommand,
  isStandaloneTtscNoEmitLintCommand,
  normalizeManagedSyncCheckCommand,
  normalizePackageRunScriptCommands,
  prependManagedSyncBeforeTtscCheckNoEmitCommand,
  removeExactPackageRunScriptCommands,
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

export const TTSC_LINT_COMPAT_HELPER_PATH =
  'scripts/apply-ttsc-lint-compat.mjs';
export const TTSC_LINT_COMPAT_HELPER_COMMAND =
  `node ${TTSC_LINT_COMPAT_HELPER_PATH}`;

const BASE_RETROFIT_SCRIPTS = {
  postinstall: TTSC_LINT_COMPAT_HELPER_COMMAND,
  sync: 'ttsx scripts/sync-project.ts',
  'sync-types': 'ttsx scripts/sync-types-to-block-json.ts',
  'check:code': 'bun run sync --check && ttsc check --noEmit',
  check: 'bun run check:code',
} as const;
const LEGACY_RETROFIT_TYPECHECK = 'bun run sync --check && ttsc --noEmit';
const LEGACY_LINT_JS_COMMAND =
  'node scripts/run-wp-scripts-lint-js-compat.mjs';
const LEGACY_LINT_CSS_COMMAND =
  'wp-scripts lint-style --allow-empty-input';
const LEGACY_FORMAT_CHECK_COMMAND =
  'prettier --check --no-error-on-unmatched-pattern "*.{cjs,js,mjs}" "scripts/**/*.{cjs,js,mjs}"';
const LEGACY_LINT_SCRIPT_NAMES = [
  'lint:ts',
  'lint:js',
  'lint:css',
  'format:check',
] as const;
const MANAGED_LINT_SCRIPT_NAMES = [
  'lint',
  ...LEGACY_LINT_SCRIPT_NAMES,
] as const;
const SHELL_AND_SEPARATOR = ' && ';

function buildManagedCheckAggregate(
  laneNames: readonly string[],
  packageManager: PackageManagerId,
): string {
  return laneNames
    .map((name) =>
      transformPackageManagerText(`bun run ${name}`, packageManager),
    )
    .join(SHELL_AND_SEPARATOR);
}

function isManagedCheckCodeCommand(command: string | undefined): boolean {
  return PACKAGE_MANAGER_IDS.some(
    (packageManager) =>
      command ===
      transformPackageManagerText(
        BASE_RETROFIT_SCRIPTS['check:code'],
        packageManager,
      ),
  );
}

function isManagedCheckAggregateSubset(
  command: string | undefined,
  laneNames: readonly string[],
): boolean {
  if (!command) {
    return false;
  }
  const subsetCount = 1 << laneNames.length;
  return PACKAGE_MANAGER_IDS.some((packageManager) => {
    for (let mask = 1; mask < subsetCount; mask += 1) {
      const subset = laneNames.filter((_, index) => (mask & (1 << index)) !== 0);
      if (command === buildManagedCheckAggregate(subset, packageManager)) {
        return true;
      }
    }
    return false;
  });
}

function findReferencedManagedLintScripts(
  scripts: Readonly<Record<string, string>>,
  retainedManagedRoots: ReadonlyMap<string, string>,
): Set<string> {
  const managedNames = new Set<string>(MANAGED_LINT_SCRIPT_NAMES);
  const referenced = new Set<string>();
  const recordManagedReferences = (command: string): void => {
    for (const managedName of MANAGED_LINT_SCRIPT_NAMES) {
      if (hasPackageRunScriptInvocation(command, managedName)) {
        referenced.add(managedName);
      }
    }
  };

  for (const [scriptName, command] of Object.entries(scripts)) {
    if (managedNames.has(scriptName)) {
      continue;
    }
    recordManagedReferences(command);
  }
  for (const command of retainedManagedRoots.values()) {
    recordManagedReferences(command);
  }

  let discoveredReference = true;
  while (discoveredReference) {
    discoveredReference = false;
    for (const scriptName of Array.from(referenced)) {
      const command = scripts[scriptName];
      if (typeof command !== 'string') {
        continue;
      }
      for (const managedName of MANAGED_LINT_SCRIPT_NAMES) {
        if (
          !referenced.has(managedName) &&
          hasPackageRunScriptInvocation(command, managedName)
        ) {
          referenced.add(managedName);
          discoveredReference = true;
        }
      }
    }
  }

  return referenced;
}

function packageScriptTransitivelyInvokes(
  scripts: Readonly<Record<string, string>>,
  command: string,
  targetName: string,
  visited = new Set<string>(),
): boolean {
  if (hasPackageRunScriptInvocation(command, targetName)) {
    return true;
  }
  for (const [scriptName, scriptCommand] of Object.entries(scripts)) {
    if (
      visited.has(scriptName) ||
      !hasPackageRunScriptInvocation(command, scriptName)
    ) {
      continue;
    }
    visited.add(scriptName);
    if (
      packageScriptTransitivelyInvokes(
        scripts,
        scriptCommand,
        targetName,
        visited,
      )
    ) {
      return true;
    }
  }
  return false;
}

function isPackageScriptReferenced(
  scripts: Readonly<Record<string, string>>,
  referencedName: string,
): boolean {
  return Object.entries(scripts).some(
    ([scriptName, command]) =>
      scriptName !== referencedName &&
      hasPackageRunScriptInvocation(command, referencedName),
  );
}

function buildRequiredCheckCodeCommand(
  currentValue: string | undefined,
  packageManager: PackageManagerId,
): string {
  const syncCommand = transformPackageManagerText(
    'bun run sync --check',
    packageManager,
  );
  const ttscCommand = 'ttsc check --noEmit';
  const hasRequiredSequence =
    hasManagedSyncBeforeTtscCheckNoEmitCommand(currentValue);
  const hasTtscCommand = hasTtscCheckNoEmitCommand(currentValue);
  if (hasRequiredSequence) {
    return currentValue
      ? normalizeManagedSyncCheckCommand(currentValue, syncCommand)
      : `${syncCommand}${SHELL_AND_SEPARATOR}${ttscCommand}`;
  }
  if (hasTtscCommand) {
    return (
      prependManagedSyncBeforeTtscCheckNoEmitCommand(
        currentValue ?? '',
        syncCommand,
      ) ??
      prependRequiredCommands(currentValue, [
        `${syncCommand}${SHELL_AND_SEPARATOR}${ttscCommand}`,
      ])
    );
  }
  return prependRequiredCommands(currentValue, [
    `${syncCommand}${SHELL_AND_SEPARATOR}${ttscCommand}`,
  ]);
}

function shouldRemoveManagedLintScript(
  canRemoveManagedAliases: boolean,
  referencedManagedScripts: ReadonlySet<string>,
  scriptName: (typeof MANAGED_LINT_SCRIPT_NAMES)[number],
  recognizedManagedCommand: boolean,
): boolean {
  return (
    canRemoveManagedAliases &&
    !referencedManagedScripts.has(scriptName) &&
    recognizedManagedCommand
  );
}

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
  '@ttsc/unplugin',
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

function containsOnlyShellComments(command: string): boolean {
  return command.split(/\r?\n/u).every((line) => {
    const trimmed = line.trimStart();
    return trimmed.length === 0 || trimmed.startsWith('#');
  });
}

function hasTopLevelStatusOverridingOperator(command: string): boolean {
  let escaped = false;
  let quote: "'" | '"' | '`' | null = null;
  let groupingDepth = 0;
  for (let index = 0; index < command.length; index += 1) {
    const character = command.charAt(index);
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
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (
      character === '#' &&
      (index === 0 || /[\s;&|(){}]/u.test(command[index - 1]))
    ) {
      const lineEnd = command.indexOf('\n', index + 1);
      if (lineEnd === -1) {
        return false;
      }
      if (groupingDepth === 0) {
        return true;
      }
      index = lineEnd;
      continue;
    }
    // Parenthesis depth also covers $() command substitution and ((...))
    // arithmetic expansion. Backtick substitutions are handled as quotes.
    if (character === '(' || character === '{') {
      groupingDepth += 1;
      continue;
    }
    if (character === ')' || character === '}') {
      groupingDepth = Math.max(0, groupingDepth - 1);
      continue;
    }
    if (groupingDepth === 0) {
      if (character === '|' || character === ';' || character === '\n') {
        return true;
      }
      if (
        character === '&' &&
        command.charAt(index + 1) !== '&' &&
        command.charAt(index + 1) !== '>' &&
        command.charAt(index - 1) !== '&' &&
        command.charAt(index - 1) !== '>' &&
        command.charAt(index - 1) !== '<'
      ) {
        return true;
      }
    }
  }
  return false;
}

function prependRequiredCommands(
  currentValue: string | undefined,
  requiredCommands: readonly string[],
): string {
  const requiredValue = requiredCommands.join(SHELL_AND_SEPARATOR);
  if (typeof currentValue !== 'string' || currentValue.trim().length === 0) {
    return requiredValue;
  }
  if (requiredCommands.length === 0) {
    return currentValue;
  }
  const projectOwnedCommand = hasTopLevelStatusOverridingOperator(currentValue)
    ? `(${currentValue})`
    : currentValue;
  return containsOnlyShellComments(currentValue)
    ? `${requiredValue} ${currentValue.trimStart()}`
    : `${requiredValue}${SHELL_AND_SEPARATOR}${projectOwnedCommand}`;
}

function mergeLegacyCommandIntoCheckLane(
  scripts: Readonly<Record<string, string>>,
  currentValue: string | undefined,
  legacyCommand: string | undefined,
  destinationName: 'check:format' | 'check:style',
): string | undefined {
  if (!legacyCommand) {
    return currentValue;
  }
  if (
    packageScriptTransitivelyInvokes(scripts, legacyCommand, destinationName) ||
    packageScriptTransitivelyInvokes(scripts, legacyCommand, 'check')
  ) {
    return currentValue;
  }
  if (hasExactShellCommand(currentValue, legacyCommand)) {
    return currentValue;
  }
  return prependRequiredCommands(currentValue, [legacyCommand]);
}

function mergePostinstallCommand(
  currentValue: string | undefined,
  requiredCommand: string,
): string {
  if (typeof currentValue === 'string' && currentValue.trim().length > 0) {
    if (hasTtscLintCompatPostinstallCommand(currentValue)) {
      return currentValue;
    }
    if (hasTopLevelTerminatingShellCommand(currentValue)) {
      return prependRequiredCommands(currentValue, [requiredCommand]);
    }
    // Correctly parsing comments inside command substitutions requires a full
    // shell parser. Keep comment-only scripts intact after the managed hook;
    // otherwise insert the hook before the last recognized trailing comment.
    if (currentValue.includes('#')) {
      return containsOnlyShellComments(currentValue)
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
  const lintChanges = buildOfficialWorkspaceLintScriptChanges(
    packageJson,
    packageManager,
  );
  const syncChanges = Object.entries(BASE_RETROFIT_SCRIPTS)
    .filter(([name]) => name === 'sync' || name === 'sync-types')
    .flatMap(([name, commandSource]) =>
      buildOptionalScriptChange(
        name,
        scripts[name],
        transformPackageManagerText(commandSource, packageManager),
      ),
    );
  const changes = [
    ...lintChanges.filter((change) => change.name === 'postinstall'),
    ...syncChanges,
    ...lintChanges.filter((change) => change.name !== 'postinstall'),
  ];
  const legacyTypecheck = PACKAGE_MANAGER_IDS.map((candidatePackageManager) =>
    transformPackageManagerText(
      LEGACY_RETROFIT_TYPECHECK,
      candidatePackageManager,
    ),
  ).find(
    (candidateTypecheck) => scripts.typecheck === candidateTypecheck,
  );
  if (legacyTypecheck) {
    if (isPackageScriptReferenced(scripts, 'typecheck')) {
      changes.push({
        action: 'update',
        currentValue: legacyTypecheck,
        name: 'typecheck',
        requiredValue: transformPackageManagerText(
          'bun run check:code',
          packageManager,
        ),
      });
    } else {
      changes.push({
        action: 'remove',
        currentValue: legacyTypecheck,
        name: 'typecheck',
      });
    }
  }

  return changes;
}

/**
 * Add the combined TypeScript and lint gate to an existing official workspace.
 * Legacy managed lint aliases are removed, while unrelated project-owned
 * scripts remain untouched.
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
  const legacyStyleCommand = scripts['lint:css'];
  const legacyFormatCommand = scripts['format:check'];
  const hasManagedLegacyStyleCommand =
    legacyStyleCommand === LEGACY_LINT_CSS_COMMAND;
  const hasManagedLegacyFormatCommand =
    legacyFormatCommand === LEGACY_FORMAT_CHECK_COMMAND;
  const requiredCheckStyle = mergeLegacyCommandIntoCheckLane(
    scripts,
    scripts['check:style'],
    legacyStyleCommand,
    'check:style',
  );
  const requiredCheckFormat = mergeLegacyCommandIntoCheckLane(
    scripts,
    scripts['check:format'],
    legacyFormatCommand,
    'check:format',
  );
  const requiredCheckLanes = [
    'check:code',
    ...(requiredCheckStyle ? ['check:style'] : []),
    ...(requiredCheckFormat ? ['check:format'] : []),
  ];
  const checkLanes = requiredCheckLanes.map((name) => ({
    command: transformPackageManagerText(`bun run ${name}`, packageManager),
    name,
  }));
  const currentCheck = scripts.check;
  let repairedCurrentCheck = currentCheck;
  for (const [laneName, requiredValue] of [
    ['check:style', requiredCheckStyle],
    ['check:format', requiredCheckFormat],
  ] as const) {
    if (
      requiredValue === undefined &&
      repairedCurrentCheck &&
      hasPackageRunScriptInvocation(repairedCurrentCheck, laneName)
    ) {
      const withoutDanglingLane = removePackageRunScriptInvocations(
        repairedCurrentCheck,
        laneName,
      );
      if (withoutDanglingLane !== null) {
        repairedCurrentCheck = withoutDanglingLane;
      }
    }
  }
  if (repairedCurrentCheck) {
    repairedCurrentCheck = normalizePackageRunScriptCommands(
      repairedCurrentCheck,
      Object.fromEntries(
        checkLanes.map(({ command, name }) => [name, command]),
      ),
    );
  }
  const missingCheckCommands = checkLanes
    .filter(
      (lane) =>
        !hasPackageRunScriptCommand(repairedCurrentCheck, lane.name),
    )
    .map(({ command }) => command);
  const requiredCheck = isManagedCheckAggregateSubset(
    repairedCurrentCheck,
    requiredCheckLanes,
  )
    ? buildManagedCheckAggregate(requiredCheckLanes, packageManager)
    : prependRequiredCommands(repairedCurrentCheck, missingCheckCommands);
  const currentCheckCode = scripts['check:code'];
  let requiredCheckCode: string;
  if (isManagedCheckCodeCommand(currentCheckCode)) {
    requiredCheckCode = buildRequiredCheckCodeCommand(
      undefined,
      packageManager,
    );
  } else {
    requiredCheckCode = buildRequiredCheckCodeCommand(
      currentCheckCode,
      packageManager,
    );
  }
  const changes: InitScriptChange[] = [
    ...buildOptionalScriptChange(
      'postinstall',
      currentPostinstall,
      requiredPostinstall,
    ),
    ...buildOptionalScriptChange(
      'check:code',
      currentCheckCode,
      requiredCheckCode,
    ),
    ...(requiredCheckStyle === undefined
      ? []
      : buildOptionalScriptChange(
          'check:style',
          scripts['check:style'],
          requiredCheckStyle,
        )),
    ...(requiredCheckFormat === undefined
      ? []
      : buildOptionalScriptChange(
          'check:format',
          scripts['check:format'],
          requiredCheckFormat,
        )),
    ...buildOptionalScriptChange('check', currentCheck, requiredCheck),
  ];

  const legacyLint = scripts.lint;
  const hasManagedLintInvocation =
    typeof legacyLint === 'string' &&
    LEGACY_LINT_SCRIPT_NAMES.some((name) =>
      hasPackageRunScriptInvocation(legacyLint, name),
    );
  const hasRemovableManagedLintCommand =
    typeof legacyLint === 'string' &&
    LEGACY_LINT_SCRIPT_NAMES.some((name) =>
      hasPackageRunScriptCommand(legacyLint, name),
    );
  let canRemoveManagedAliases =
    !hasManagedLintInvocation || hasRemovableManagedLintCommand;
  const removableLegacyLintInvocations = new Set(
    LEGACY_LINT_SCRIPT_NAMES.filter((name) => {
      const command = scripts[name];
      if (command === undefined) {
        return true;
      }
      if (name === 'lint:ts') {
        return isStandaloneTtscNoEmitLintCommand(command);
      }
      if (name === 'lint:js') {
        return command === LEGACY_LINT_JS_COMMAND;
      }
      if (name === 'lint:css') {
        return hasManagedLegacyStyleCommand;
      }
      return hasManagedLegacyFormatCommand;
    }),
  );
  let remainingLegacyLint = legacyLint;
  if (
    typeof remainingLegacyLint === 'string' &&
    canRemoveManagedAliases &&
    hasRemovableManagedLintCommand
  ) {
    for (const name of removableLegacyLintInvocations) {
      if (!hasPackageRunScriptCommand(remainingLegacyLint, name)) {
        continue;
      }
      const next = removeExactPackageRunScriptCommands(
        remainingLegacyLint,
        name,
      );
      if (next === null) {
        canRemoveManagedAliases = false;
        break;
      }
      remainingLegacyLint = next;
    }
  }
  const retainedManagedRoots = new Map<string, string>(
    LEGACY_LINT_SCRIPT_NAMES.flatMap((name) => {
      const command = scripts[name];
      return command !== undefined &&
        !removableLegacyLintInvocations.has(name)
        ? [[name, command] as const]
        : [];
    }),
  );
  if (
    typeof legacyLint === 'string' &&
    typeof remainingLegacyLint === 'string' &&
    (!canRemoveManagedAliases ||
      !hasRemovableManagedLintCommand ||
      remainingLegacyLint !== '')
  ) {
    retainedManagedRoots.set(
      'lint',
      canRemoveManagedAliases && hasRemovableManagedLintCommand
        ? remainingLegacyLint
        : legacyLint,
    );
  }
  const referencedManagedScripts = findReferencedManagedLintScripts(
    scripts,
    retainedManagedRoots,
  );
  if (
    typeof legacyLint === 'string' &&
    typeof remainingLegacyLint === 'string' &&
    shouldRemoveManagedLintScript(
      canRemoveManagedAliases,
      referencedManagedScripts,
      'lint',
      hasRemovableManagedLintCommand,
    )
  ) {
    const remaining = remainingLegacyLint;
    if (canRemoveManagedAliases && remaining === '') {
      changes.push({
        action: 'remove',
        currentValue: legacyLint,
        name: 'lint',
      });
    } else if (canRemoveManagedAliases && remaining !== legacyLint) {
      changes.push({
        action: 'update',
        currentValue: legacyLint,
        name: 'lint',
        requiredValue: remaining,
      });
    }
  }
  if (
    shouldRemoveManagedLintScript(
      canRemoveManagedAliases,
      referencedManagedScripts,
      'lint:ts',
      isStandaloneTtscNoEmitLintCommand(scripts['lint:ts']),
    )
  ) {
    changes.push({
      action: 'remove',
      currentValue: scripts['lint:ts'],
      name: 'lint:ts',
    });
  }
  // Only delete the exact helper command that wp-typia owned. Variants may
  // contain project behavior and must remain under the project's control.
  if (
    shouldRemoveManagedLintScript(
      canRemoveManagedAliases,
      referencedManagedScripts,
      'lint:js',
      scripts['lint:js'] === LEGACY_LINT_JS_COMMAND,
    )
  ) {
    changes.push({
      action: 'remove',
      currentValue: scripts['lint:js'],
      name: 'lint:js',
    });
  }
  if (
    hasManagedLegacyStyleCommand &&
    shouldRemoveManagedLintScript(
      canRemoveManagedAliases,
      referencedManagedScripts,
      'lint:css',
      hasManagedLegacyStyleCommand,
    )
  ) {
    changes.push({
      action: 'remove',
      currentValue: legacyStyleCommand,
      name: 'lint:css',
    });
  }
  if (
    hasManagedLegacyFormatCommand &&
    shouldRemoveManagedLintScript(
      canRemoveManagedAliases,
      referencedManagedScripts,
      'format:check',
      hasManagedLegacyFormatCommand,
    )
  ) {
    changes.push({
      action: 'remove',
      currentValue: legacyFormatCommand,
      name: 'format:check',
    });
  }

  return changes;
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
    if (scriptChange.action === 'remove') {
      delete nextPackageJson.scripts[scriptChange.name];
    } else if (scriptChange.requiredValue !== undefined) {
      nextPackageJson.scripts[scriptChange.name] = scriptChange.requiredValue;
    }
  }

  return nextPackageJson;
}

export function buildProjectPackageJsonSource(
	packageJson: ProjectPackageJson,
  currentSource?: string,
): string {
  const indentation =
    currentSource?.match(/(?:^|\r?\n)([\t ]+)"/u)?.[1] ?? '  ';
  const lineEnding = currentSource?.includes('\r\n') ? '\r\n' : '\n';
  const source = JSON.stringify(packageJson, null, indentation);
  return `${source.split('\n').join(lineEnding)}${lineEnding}`;
}
