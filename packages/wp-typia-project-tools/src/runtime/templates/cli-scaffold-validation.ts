import path from 'node:path';

import { parseAlternateRenderTargets } from '../add/alternate-render-targets.js';
import { parseCompoundInnerBlocksPreset } from '../add/compound-inner-blocks.js';
import { assertBuiltInTemplateVariantAllowed } from '../cli/cli-validation.js';
import {
  OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE,
  isBuiltInTemplateId,
} from './template-registry.js';

/**
 * Validate the project directory argument before template resolution.
 *
 * @param projectInput Raw project directory input from the CLI.
 * @throws Error when the input is empty or points at the current/parent directory.
 */
export function validateCreateProjectInput(projectInput: string) {
  const normalizedProjectInput = projectInput.trim();
  if (normalizedProjectInput.length === 0) {
    throw new Error(
      'Project directory is required. Usage: wp-typia create <project-dir> (or wp-typia <project-dir> when <project-dir> is the only positional argument).',
    );
  }

  const normalizedProjectPath =
		path.normalize(normalizedProjectInput).replace(/[\\/]+$/u, '') ||
		path.normalize(normalizedProjectInput);
  if (normalizedProjectPath === '.' || normalizedProjectPath === '..') {
    throw new Error(
      '`wp-typia create` requires a new project directory. Use an explicit child directory instead of `.` or `..`.',
    );
  }
}

/**
 * Collect warnings for project directory names that are awkward in shells.
 *
 * @param projectDir Absolute target project directory.
 * @returns User-facing warning messages for non-fatal directory concerns.
 */
export function collectProjectDirectoryWarnings(projectDir: string): string[] {
  const warnings: string[] = [];
  const projectName = path.basename(projectDir);
  if (/\s/u.test(projectName)) {
    warnings.push(
      `Project directory "${projectName}" contains spaces. The generated next-step commands will be quoted, but a simple kebab-case directory name is usually easier to use with shells and downstream tooling.`,
    );
  }

  const shellSensitiveCharacters = Array.from(
    new Set(projectName.match(/[^A-Za-z0-9._ -]/gu) ?? []),
  );
  if (shellSensitiveCharacters.length > 0) {
    warnings.push(
      `Project directory "${projectName}" contains shell-sensitive characters (${shellSensitiveCharacters.join(', ')}). Prefer letters, numbers, ".", "_" and "-" when possible.`,
    );
  }

  return warnings;
}

/**
 * Determine whether a template should resolve persistence-related options.
 *
 * @param templateId Resolved template id.
 * @param options Explicit persistence flags provided by the caller.
 * @returns True when persistence defaults or prompts should be applied.
 */
export function templateUsesPersistenceSettings(
	templateId: string,
	options: {
		dataStorageMode?: string;
		persistencePolicy?: string;
	},
): boolean {
  if (templateId === 'persistence') {
    return true;
  }

  if (templateId !== 'compound') {
    return false;
  }

  return Boolean(options.dataStorageMode || options.persistencePolicy);
}

function templateSupportsPersistenceFlags(templateId: string): boolean {
  return templateId === 'persistence' || templateId === 'compound';
}

function templateSupportsCompoundInnerBlocksPreset(templateId: string): boolean {
  return templateId === 'compound';
}

function createTemplateLabel(templateId: string): string {
  return templateId === OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE
    ? '`--template workspace`'
    : `"${templateId}"`;
}

/**
 * Collect warnings for flags that do not apply to the selected template.
 *
 * @param options Template id and raw CLI flags that may be ignored.
 * @returns User-facing warnings for non-fatal capability mismatches.
 */
export function collectTemplateCapabilityWarnings(options: {
  queryPostType?: string;
  templateId: string;
  withMigrationUi?: boolean;
}): string[] {
  const warnings: string[] = [];
  const trimmedQueryPostType = options.queryPostType?.trim();

  if (
		trimmedQueryPostType &&
		options.templateId !== 'query-loop' &&
		(isBuiltInTemplateId(options.templateId) ||
			options.templateId === OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE)
	) {
    warnings.push(
      `\`--query-post-type\` only applies to \`wp-typia create --template query-loop\`, which scaffolds a create-time \`core/query\` variation instead of a standalone block. ${createTemplateLabel(options.templateId)} will ignore "${trimmedQueryPostType}".`,
    );
  }

  if (
		options.withMigrationUi === true &&
		!isBuiltInTemplateId(options.templateId) &&
		options.templateId !== OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE
	) {
    warnings.push(
      `\`--with-migration-ui\` was ignored for ${createTemplateLabel(options.templateId)}. Migration UI currently scaffolds built-in templates and the official \`--template workspace\` flow; external templates still need to opt into that surface explicitly.`,
    );
  }

  return warnings;
}

function templateSupportsAlternateRenderTargets(options: {
  alternateRenderTargets?: string;
  dataStorageMode?: string;
  persistencePolicy?: string;
  templateId: string;
}): boolean {
  if (!options.alternateRenderTargets) {
    return false;
  }

  if (options.templateId === 'persistence') {
    return true;
  }

  if (options.templateId !== 'compound') {
    return false;
  }

  return templateUsesPersistenceSettings(options.templateId, {
    dataStorageMode: options.dataStorageMode,
    persistencePolicy: options.persistencePolicy,
  });
}

/**
 * Validate create flags that depend on the selected template capability set.
 *
 * @param options Raw create flags plus the resolved template id.
 * @throws Error when a flag is unsupported for the selected template.
 */
export function validateCreateFlagContract(options: {
  alternateRenderTargets?: string;
  dataStorageMode?: string;
  innerBlocksPreset?: string;
  persistencePolicy?: string;
  templateId: string;
  variant?: string;
}) {
  const {
		alternateRenderTargets,
		dataStorageMode,
		innerBlocksPreset,
		persistencePolicy,
		templateId,
		variant,
	} = options;
  if (
		(dataStorageMode || persistencePolicy) &&
		!templateSupportsPersistenceFlags(templateId)
	) {
    throw new Error(
      '`--data-storage` and `--persistence-policy` are supported only for `wp-typia create --template persistence` or `--template compound`.',
    );
  }
  if (
		alternateRenderTargets &&
		!templateSupportsAlternateRenderTargets({
      alternateRenderTargets,
      dataStorageMode,
      persistencePolicy,
      templateId,
    })
	) {
    if (templateId === 'compound') {
      throw new Error(
        '`--alternate-render-targets` on `wp-typia create --template compound` requires the persistence-enabled server render path. Add `--data-storage <post-meta|custom-table>` or `--persistence-policy <authenticated|public>` first.',
      );
    }
    throw new Error(
      '`--alternate-render-targets` is supported only for `wp-typia create --template persistence` or persistence-enabled `--template compound` scaffolds.',
    );
  }
  parseAlternateRenderTargets(alternateRenderTargets);
  if (
		innerBlocksPreset &&
		!templateSupportsCompoundInnerBlocksPreset(templateId)
	) {
    throw new Error(
      '`--inner-blocks-preset` is supported only for `wp-typia create --template compound`.',
    );
  }
  parseCompoundInnerBlocksPreset(innerBlocksPreset);

  if (isBuiltInTemplateId(templateId)) {
    assertBuiltInTemplateVariantAllowed({
      templateId,
      variant,
    });
  }
}

function parseSelectableValue<T extends string>(
	label: string,
	value: string,
	isValue: (input: string) => input is T,
	allowedValues: readonly T[],
): T {
  if (isValue(value)) {
    return value;
  }

  throw new Error(
    `Unsupported ${label} "${value}". Expected one of: ${allowedValues.join(', ')}`,
  );
}

/**
 * Resolve an optional string selection from explicit input, prompts, or defaults.
 *
 * @param options Selection configuration including allowed values and prompt hooks.
 * @returns The resolved value, or undefined when resolution is disabled.
 * @throws Error when an explicit value is not in the allowed set.
 */
export async function resolveOptionalSelection<T extends string>({
	defaultValue,
	explicitValue,
	isInteractive,
	isValue,
	label,
	allowedValues,
	select,
	shouldResolve = true,
	yes,
}: {
  defaultValue: T;
  explicitValue?: string;
  isInteractive: boolean;
  isValue: (input: string) => input is T;
  label: string;
  allowedValues: readonly T[];
  select?: () => Promise<T>;
  shouldResolve?: boolean;
  yes: boolean;
}): Promise<T | undefined> {
  if (!shouldResolve) {
    return undefined;
  }

  if (explicitValue !== undefined) {
    return parseSelectableValue(label, explicitValue, isValue, allowedValues);
  }

  if (yes) {
    return defaultValue;
  }

  if (isInteractive && select) {
    return select();
  }

  return defaultValue;
}

/**
 * Resolve an optional boolean flag from explicit input, prompts, or defaults.
 *
 * @param options Boolean selection configuration and optional prompt hook.
 * @returns The resolved boolean value.
 */
export async function resolveOptionalBooleanFlag({
	defaultValue = false,
	disabled = false,
	explicitValue,
	isInteractive,
	select,
	yes,
}: {
  defaultValue?: boolean;
  disabled?: boolean;
  explicitValue?: boolean;
  isInteractive: boolean;
  select?: () => Promise<boolean>;
  yes: boolean;
}): Promise<boolean> {
  if (disabled) {
    return defaultValue;
  }

  if (typeof explicitValue === 'boolean') {
    return explicitValue;
  }

  if (yes) {
    return defaultValue;
  }

  if (isInteractive && select) {
    return select();
  }

  return defaultValue;
}
