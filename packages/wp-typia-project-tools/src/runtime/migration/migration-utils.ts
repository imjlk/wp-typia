import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import {
  formatRunScript,
  inferPackageManagerId,
  parsePackageManagerField,
  type PackageManagerId,
} from '../shared/package-managers.js';
import type {
  JsonValue,
  ManifestAttribute,
  JsonObject,
} from './migration-types.js';
import { isPlainObject, type UnknownRecord } from '../shared/object-utils.js';
import { readJsonFileSync } from '../shared/json-utils.js';
export { cloneJsonValue } from '../shared/json-utils.js';

const MIGRATION_VERSION_LABEL_PATTERN = /^v([1-9]\d*)$/;
const LEGACY_SEMVER_MIGRATION_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export function getValueAtPath<TRecord extends UnknownRecord>(
  input: TRecord,
  pathLabel: string,
): unknown {
  return String(pathLabel)
    .split('.')
    .reduce<unknown>(
      (value, segment) => (isPlainObject(value) ? value[segment] : undefined),
      input,
    );
}

export function setValueAtPath<TRecord extends UnknownRecord>(
  input: TRecord,
  pathLabel: string,
  value: unknown,
): TRecord {
  const segments = String(pathLabel).split('.');
  let target: UnknownRecord = input;
  while (segments.length > 1) {
    const segment = segments.shift();
    if (!segment) {
      continue;
    }
    if (!isPlainObject(target[segment])) {
      target[segment] = {};
    }
    target = target[segment] as UnknownRecord;
  }
  target[segments[0]!] = value;
  return input;
}

export function deleteValueAtPath<TRecord extends UnknownRecord>(
  input: TRecord,
  pathLabel: string,
): TRecord {
  const segments = String(pathLabel).split('.');
  let target: UnknownRecord = input;
  while (segments.length > 1) {
    const segment = segments.shift();
    if (!segment || !isPlainObject(target[segment])) {
      return input;
    }
    target = target[segment] as UnknownRecord;
  }
  delete target[segments[0]!];
  return input;
}

export function createFixtureScalarValue(pathLabel: string): JsonValue {
  const normalized = String(pathLabel).toLowerCase();
  if (normalized.includes('id')) {
    return '00000000-0000-4000-8000-000000000000';
  }
  if (normalized.includes('count') || normalized.includes('number')) {
    return 1;
  }
  if (normalized.includes('visible') || normalized.startsWith('is')) {
    return true;
  }
  return `legacy:${pathLabel}`;
}

export function createTransformFixtureValue(
  attribute: ManifestAttribute | null | undefined,
  pathLabel: string,
): JsonValue {
  switch (attribute?.ts?.kind) {
    case 'number':
      return '42';
    case 'boolean':
      return '1';
    case 'union':
      return { kind: 'unknown' };
    default:
      return createFixtureScalarValue(pathLabel);
  }
}

export function readJson<T = unknown>(filePath: string): T {
  return readJsonFileSync<T>(filePath, {
    context: 'migration JSON file',
  });
}

export function renderPhpValue(value: unknown, indentLevel: number): string {
  const indent = '\t'.repeat(indentLevel);
  const nestedIndent = '\t'.repeat(indentLevel + 1);

  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    const items = value.map(
      (item) => `${nestedIndent}${renderPhpValue(item, indentLevel + 1)}`,
    );
    return `[\n${items.join(',\n')}\n${indent}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return '[]';
    }
    const items = entries.map(
      ([key, item]) =>
        `${nestedIndent}'${String(key).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' => ${renderPhpValue(item, indentLevel + 1)}`,
    );
    return `[\n${items.join(',\n')}\n${indent}]`;
  }

  throw new Error(
    `Unable to encode PHP migration registry value for ${String(value)}`,
  );
}

export function copyFile(sourcePath: string, targetPath: string): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

export function sanitizeSaveSnapshotSource(source: string): string {
  return source
    .replace(/^import\s+\{[^}]+\}\s+from\s+['"]\.\/types['"];?\n?/gm, '')
    .replace(/^interface\s+SaveProps\s*\{[\s\S]*?\}\n?/m, '')
    .replace(/: SaveProps/g, ': { attributes: any }')
    .replace(/attributes:\s*[A-Za-z0-9_<>{}\[\]|&,\s]+;/g, 'attributes: any;')
    .replace(
      /\(\{\s*attributes\s*\}:\s*\{\s*attributes:\s*any\s*\}\)/g,
      '({ attributes }: { attributes: any })',
    )
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
    .concat('\n');
}

export function sanitizeSnapshotBlockJson(blockJson: JsonObject): JsonObject {
  const snapshot = { ...blockJson };
  for (const key of [
    'editorScript',
    'script',
    'scriptModule',
    'viewScript',
    'viewScriptModule',
    'style',
    'editorStyle',
    'render',
  ]) {
    delete snapshot[key];
  }
  return snapshot;
}

export function runProjectScriptIfPresent(
  projectDir: string,
  scriptName: string,
): void {
  const packageJson = readJson<{
    packageManager?: string;
    scripts?: Record<string, string>;
  }>(path.join(projectDir, 'package.json'));
  if (!packageJson.scripts?.[scriptName]) {
    return;
  }

  const packageManagerId = detectPackageManagerId(projectDir);
  execSync(formatRunScript(packageManagerId, scriptName), {
    cwd: projectDir,
    stdio: 'inherit',
  });
}

export function detectPackageManagerId(
  projectDir: string,
): PackageManagerId {
  const packageJson = readJson<{ packageManager?: string }>(
    path.join(projectDir, 'package.json'),
  );
  return (
    parsePackageManagerField(packageJson.packageManager) ??
    inferPackageManagerId(projectDir)
  );
}

export function getLocalTtsxBinary(projectDir: string): string {
  const filename = process.platform === 'win32' ? 'ttsx.cmd' : 'ttsx';
  const binaryPath = path.join(projectDir, 'node_modules', '.bin', filename);

  if (!fs.existsSync(binaryPath)) {
    throw new Error(
      'Local ttsx binary was not found. Install project dependencies before running migration verification.',
    );
  }

  return binaryPath;
}

/**
 * Returns whether isInteractiveTerminal() is running with both stdin and stdout
 * attached to a TTY so CLI and migration flows can safely prompt the user.
 */
export function isInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * Resolves the `current` sentinel to the current migration version label.
 *
 * @param currentMigrationVersion Current migration version label for the workspace.
 * @param value Requested target value, which may be `current`.
 * @returns The concrete migration version label that should be used.
 */
export function resolveTargetMigrationVersion(
  currentMigrationVersion: string,
  value: string,
): string {
  return value === 'current' ? currentMigrationVersion : value;
}

/**
 * Returns whether a value matches the canonical `vN` migration label format.
 *
 * @param value Candidate migration version label.
 * @returns `true` when the value is a valid `vN` label with `N >= 1`.
 */
export function isMigrationVersionLabel(value: string): boolean {
  return MIGRATION_VERSION_LABEL_PATTERN.test(value);
}

/**
 * Returns whether a value looks like a legacy semver-based migration label.
 *
 * @param value Candidate migration version label.
 * @returns `true` when the value matches the legacy `x.y.z` semver pattern.
 */
export function isLegacySemverMigrationVersion(value: string): boolean {
  return LEGACY_SEMVER_MIGRATION_VERSION_PATTERN.test(value);
}

/**
 * Throws when a migration version label does not match the canonical `vN` format.
 *
 * @param value Candidate migration version label.
 * @param label Human-readable label used in the thrown error message.
 * @returns Nothing.
 * @throws Error When the provided value is not a valid `vN` migration label.
 */
export function assertMigrationVersionLabel(
  value: string,
  label: string,
): void {
  if (!isMigrationVersionLabel(value)) {
    throw new Error(`Invalid ${label}: ${value}. Expected vN with N >= 1.`);
  }
}

function parseMigrationVersionNumber(value: string): number {
  const match = value.match(MIGRATION_VERSION_LABEL_PATTERN);
  if (!match) {
    throw new Error(
      `Invalid migration version label: ${value}. Expected vN with N >= 1.`,
    );
  }
  return Number.parseInt(match[1], 10);
}

/**
 * Compares two migration version labels by their numeric suffix.
 *
 * @param left Left migration version label.
 * @param right Right migration version label.
 * @returns A negative number when `left < right`, zero when equal, and a positive number when `left > right`.
 */
export function compareMigrationVersionLabels(
  left: string,
  right: string,
): number {
  return parseMigrationVersionNumber(left) - parseMigrationVersionNumber(right);
}

/**
 * Formats the reset guidance shown when a legacy semver migration workspace is detected.
 *
 * @param reason Optional leading reason that explains what legacy pattern was found.
 * @returns A user-facing guidance string that explains how to reset to `v1` labels.
 */
export function formatLegacyMigrationWorkspaceResetGuidance(
  reason?: string,
): string {
  return [
    reason ? `${reason} ` : '',
    'Back up `src/migrations/` if needed, remove or reset the existing migration workspace, ',
    'then rerun `wp-typia migrate init --current-migration-version v1`.',
  ].join('');
}

export function escapeForCode(value: unknown): string {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function renderObjectKey(key: string): string {
  const value = String(key);
  return /^[$A-Z_a-z][$\w]*$/u.test(value)
    ? value
    : `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
