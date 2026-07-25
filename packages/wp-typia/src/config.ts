import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { isPlainObject as isRecord } from '@wp-typia/api-client/runtime-primitives';
import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from '@wp-typia/project-tools/cli-diagnostics';
import { z, type ZodIssue } from 'zod';

export const WP_TYPIA_CONFIG_SOURCES = [
  '~/.config/wp-typia/config.json',
  '.wp-typiarc',
  '.wp-typiarc.json',
] as const;
type JsonRecord = Record<string, unknown>;

const wordpressVersionSchema = z
	.string()
	.regex(
		/^\d+\.\d+(?:\.\d+)?$/u,
		'expected dotted numeric WordPress version such as "6.7" or "6.7.1"',
	);

const wpTypiaSchemaSourceSchema = z
	.object({
		namespace: z.string(),
		path: z.string(),
	})
	.strict();

const wordpressCompatibilityConfigSchema = z
	.object({
		minVersion: wordpressVersionSchema.optional(),
		testedVersions: z.array(wordpressVersionSchema).optional(),
	})
	.strict();

const blockApiCompatibilityConfigSchema = z
	.object({
		allowUnknownFutureKeys: z.boolean().optional(),
		strict: z.boolean().optional(),
	})
	.strict();

const createConfigSchema = z
	.object({
		'alternate-render-targets': z.string().optional(),
		'inner-blocks-preset': z.string().optional(),
		'data-storage': z.string().optional(),
		'dry-run': z.boolean().optional(),
		'external-layer-id': z.string().optional(),
		'external-layer-source': z.string().optional(),
		namespace: z.string().optional(),
		'no-install': z.boolean().optional(),
		'package-manager': z.string().optional(),
		'persistence-policy': z.string().optional(),
		'php-prefix': z.string().optional(),
		profile: z.string().optional(),
		'query-post-type': z.string().optional(),
		template: z.string().optional(),
		'text-domain': z.string().optional(),
		variant: z.string().optional(),
		'with-migration-ui': z.boolean().optional(),
		'with-test-preset': z.boolean().optional(),
		'with-wp-env': z.boolean().optional(),
		yes: z.boolean().optional(),
	})
	.strict();

const addBlockConfigSchema = z
	.object({
		'alternate-render-targets': z.string().optional(),
		'data-storage': z.string().optional(),
		'external-layer-id': z.string().optional(),
		'external-layer-source': z.string().optional(),
		'inner-blocks-preset': z.string().optional(),
		'persistence-policy': z.string().optional(),
		template: z.string().optional(),
	})
	.strict();

const addConfigSchema = z
	.object({
		block: addBlockConfigSchema.optional(),
	})
	.strict();

const mcpConfigSchema = z
	.object({
		schemaSources: z.array(wpTypiaSchemaSourceSchema).optional(),
	})
	.strict();

export const wpTypiaUserConfigSchema = z
	.object({
		add: addConfigSchema.optional(),
		compatibility: blockApiCompatibilityConfigSchema.optional(),
		create: createConfigSchema.optional(),
		mcp: mcpConfigSchema.optional(),
		wordpress: wordpressCompatibilityConfigSchema.optional(),
	})
	.strict();

export type WpTypiaSchemaSource = z.infer<typeof wpTypiaSchemaSourceSchema>;
export type WpTypiaUserConfig = z.infer<typeof wpTypiaUserConfigSchema>;
export interface WpTypiaWordPressCompatibilitySettings {
  allowUnknownFutureKeys?: boolean | undefined;
  minVersion?: string | undefined;
  strict?: boolean | undefined;
  testedVersions?: string[] | undefined;
}

function formatIssuePath(issuePath: ZodIssue['path']): string {
  if (issuePath.length === 0) {
    return 'config';
  }

  return issuePath
		.map((segment) => (typeof segment === 'number' ? `[${segment}]` : `.${String(segment)}`))
		.join('')
		.replace(/^\./u, '');
}

function formatConfigValidationIssue(issue: ZodIssue): string {
  const pathLabel = formatIssuePath(issue.path);
  if (issue.code === 'unrecognized_keys') {
    const keys = issue.keys.map((key) => `"${String(key)}"`).join(', ');
    const label = issue.keys.length === 1 ? 'unknown key' : 'unknown keys';
    return `${pathLabel}: ${label} ${keys}. Unknown keys are errors in wp-typia config.`;
  }

  return `${pathLabel}: ${issue.message}`;
}

export function validateWpTypiaUserConfig(
	value: unknown,
	source: string,
): WpTypiaUserConfig {
  const result = wpTypiaUserConfigSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  const issueLines = result.error.issues.map(formatConfigValidationIssue);
  throw createCliDiagnosticCodeError(
		CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
		[
			`Invalid wp-typia config at ${source}.`,
			...issueLines.map((line) => `- ${line}`),
		].join('\n'),
	);
}

function deepMerge<T extends JsonRecord>(base: T, incoming: JsonRecord): T {
  const merged: JsonRecord = { ...base };

  for (const [key, value] of Object.entries(incoming)) {
    if (Array.isArray(value)) {
      merged[key] = value.slice();
      continue;
    }
    if (isRecord(value) && isRecord(merged[key])) {
      merged[key] = deepMerge(merged[key] as JsonRecord, value);
      continue;
    }
    merged[key] = value;
  }

  return merged as T;
}

async function readJsonFile(filePath: string): Promise<unknown | undefined> {
  let source: string;
  try {
    source = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
      return undefined;
    }
    throw error;
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      `Unable to parse ${filePath}: ${message}`,
      error instanceof Error ? { cause: error } : undefined,
    );
  }
}

async function readWpTypiaConfigFile(filePath: string): Promise<WpTypiaUserConfig | null> {
  const parsed = await readJsonFile(filePath);
  return parsed === undefined
    ? null
    : validateWpTypiaUserConfig(parsed, filePath);
}

function resolveConfigPath(cwd: string, source: string): string {
  if (source.startsWith('~/')) {
    return path.join(os.homedir(), source.slice(2));
  }
  return path.resolve(cwd, source);
}

export function mergeWpTypiaUserConfig(
	base: WpTypiaUserConfig,
	incoming: WpTypiaUserConfig,
): WpTypiaUserConfig {
  return deepMerge(
    base as JsonRecord,
    incoming as JsonRecord,
  ) as WpTypiaUserConfig;
}

export async function loadWpTypiaUserConfigFromSource(
	cwd: string,
	source: string,
): Promise<WpTypiaUserConfig> {
  const config = await readWpTypiaConfigFile(resolveConfigPath(cwd, source));
  return config ?? {};
}

export async function loadWpTypiaUserConfig(cwd: string): Promise<WpTypiaUserConfig> {
  let merged: JsonRecord = {};

  for (const source of WP_TYPIA_CONFIG_SOURCES) {
    const configPath = resolveConfigPath(cwd, source);
    const config = await readWpTypiaConfigFile(configPath);
    if (config) {
      merged = deepMerge(merged, config as JsonRecord);
    }
  }

  const packageJsonPath = path.join(cwd, 'package.json');
  const packageJson = await readJsonFile(packageJsonPath);
  if (isRecord(packageJson) && 'wp-typia' in packageJson) {
    const packageConfig = validateWpTypiaUserConfig(
      packageJson['wp-typia'],
      `${packageJsonPath}#wp-typia`,
    );
    merged = deepMerge(merged, packageConfig as JsonRecord);
  }

  return merged as WpTypiaUserConfig;
}

export function getCreateDefaults(config: WpTypiaUserConfig): NonNullable<WpTypiaUserConfig['create']> {
  return config.create ?? {};
}

export function getAddBlockDefaults(
	config: WpTypiaUserConfig,
): NonNullable<NonNullable<WpTypiaUserConfig['add']>['block']> {
  return config.add?.block ?? {};
}

export function getMcpSchemaSources(config: WpTypiaUserConfig): WpTypiaSchemaSource[] {
  return config.mcp?.schemaSources ?? [];
}

export function getWordPressCompatibilitySettings(
	config: WpTypiaUserConfig,
): WpTypiaWordPressCompatibilitySettings {
  return {
    allowUnknownFutureKeys: config.compatibility?.allowUnknownFutureKeys,
    minVersion: config.wordpress?.minVersion,
    strict: config.compatibility?.strict,
    testedVersions: config.wordpress?.testedVersions,
  };
}
