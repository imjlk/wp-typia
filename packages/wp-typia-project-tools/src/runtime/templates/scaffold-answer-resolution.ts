import { execSync } from 'node:child_process';
import {
  PACKAGE_MANAGER_IDS,
  getPackageManager,
} from '../shared/package-managers.js';
import type { PackageManagerId } from '../shared/package-managers.js';
import {
  normalizeBlockSlug,
  resolveScaffoldIdentifiers,
  validateBlockSlug,
  validateNamespace,
} from './scaffold-identifiers.js';
import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from '../cli/cli-diagnostics.js';
import { getTemplateById, isBuiltInTemplateId } from './template-registry.js';
import {
  CREATE_TEMPLATE_SELECTION_HINT,
  validateExplicitCreateTemplateId,
} from './create-template-validation.js';
import { toSnakeCase, toTitleCase } from '../shared/string-case.js';
import type {
  CollectScaffoldAnswersOptions,
  ResolvePackageManagerOptions,
  ResolveTemplateOptions,
  ScaffoldAnswers,
} from './scaffold.js';

const QUERY_POST_TYPE_RULE =
  'Use lowercase, 1-20 chars, and only a-z, 0-9, "_" or "-".';

/**
 * Detect the current author name from local Git config.
 *
 * @returns The configured Git author name, or `"Your Name"` when unavailable.
 */
export function detectAuthor(): string {
  try {
    return (
      execSync('git config user.name', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || 'Your Name'
    );
  } catch {
    return 'Your Name';
  }
}

/**
 * Compute the default scaffold answers for one project and template pair.
 *
 * @param projectName User-supplied project directory or block name seed.
 * @param templateId Selected scaffold template identifier.
 * @returns Normalized default answers for scaffold prompts and non-interactive flows.
 */
export function getDefaultAnswers(
  projectName: string,
  templateId: string,
): ScaffoldAnswers {
  const template = isBuiltInTemplateId(templateId)
    ? getTemplateById(templateId)
    : null;
  const slugDefault = normalizeBlockSlug(projectName) || 'my-wp-typia-block';
  return {
    author: detectAuthor(),
    dataStorageMode: templateId === 'persistence' ? 'custom-table' : undefined,
    description: template?.description ?? 'A WordPress block scaffolded from a remote template',
    namespace: slugDefault,
    persistencePolicy: templateId === 'persistence'
      ? 'authenticated'
      : undefined,
    phpPrefix: toSnakeCase(slugDefault),
    queryPostType: templateId === 'query-loop' ? 'post' : undefined,
    slug: slugDefault,
    textDomain: slugDefault,
    title: toTitleCase(slugDefault),
  };
}

function validateQueryPostType(value: string): true | string {
  const rawValue = value.trim();
  const normalizedValue = rawValue.toLowerCase();
  if (normalizedValue.length === 0) {
    return 'Query post type is required.';
  }

  if (!/^[a-z0-9_-]{1,20}$/u.test(normalizedValue)) {
    return rawValue === normalizedValue
      ? `Query post type "${rawValue}" is invalid. ${QUERY_POST_TYPE_RULE}`
      : `Query post type "${rawValue}" normalizes to "${normalizedValue}", which is invalid. ${QUERY_POST_TYPE_RULE}`;
  }

  return true;
}

function normalizeQueryPostType(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const validationResult = validateQueryPostType(value);
  if (validationResult !== true) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      validationResult,
    );
  }

  return value.trim().toLowerCase();
}

/**
 * Resolve the scaffold template id from flags, defaults, and interactive selection.
 *
 * @param options Template resolution options for interactive and non-interactive flows.
 * @returns The normalized template identifier to scaffold.
 */
export async function resolveTemplateId({
  templateId,
  yes = false,
  isInteractive = false,
  selectTemplate,
}: ResolveTemplateOptions): Promise<string> {
  if (templateId) {
    return validateExplicitCreateTemplateId(templateId);
  }

  if (yes) {
    return 'basic';
  }

  if (!isInteractive || !selectTemplate) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
      `Template is required in non-interactive mode. Use ${CREATE_TEMPLATE_SELECTION_HINT}.`,
    );
  }

  return validateExplicitCreateTemplateId(await selectTemplate());
}

/**
 * Resolve the package manager id from flags, defaults, and interactive selection.
 *
 * @param options Package manager resolution options for interactive and non-interactive flows.
 * @returns The normalized package manager id.
 */
export async function resolvePackageManagerId({
  packageManager,
  yes = false,
  isInteractive = false,
  selectPackageManager,
}: ResolvePackageManagerOptions): Promise<PackageManagerId> {
  if (packageManager) {
    return getPackageManager(packageManager).id;
  }

  if (yes) {
    return 'npm';
  }

  if (!isInteractive || !selectPackageManager) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
      `Package manager is required in non-interactive mode. Use --package-manager <${PACKAGE_MANAGER_IDS.join('|')}>.`,
    );
  }

  return selectPackageManager();
}

/**
 * Collect scaffold answers from defaults, CLI overrides, and optional prompts.
 *
 * @param options Answer collection inputs including prompt callbacks and explicit overrides.
 * @returns The normalized scaffold answers used for rendering and file generation.
 */
export async function collectScaffoldAnswers({
  projectName,
  templateId,
  yes = false,
  dataStorageMode,
  namespace,
  persistencePolicy,
  phpPrefix,
  promptText,
  queryPostType,
  textDomain,
}: CollectScaffoldAnswersOptions): Promise<ScaffoldAnswers> {
  const defaults = getDefaultAnswers(projectName, templateId);

  if (yes || (!isBuiltInTemplateId(templateId) && !promptText)) {
    const identifiers = resolveScaffoldIdentifiers({
      namespace: namespace ?? defaults.namespace,
      phpPrefix,
      slug: defaults.slug,
      textDomain,
    });
    return {
      ...defaults,
      dataStorageMode: dataStorageMode ?? defaults.dataStorageMode,
      namespace: identifiers.namespace,
      persistencePolicy: persistencePolicy ?? defaults.persistencePolicy,
      phpPrefix: identifiers.phpPrefix,
      queryPostType: normalizeQueryPostType(
        queryPostType ?? defaults.queryPostType,
      ),
      textDomain: identifiers.textDomain,
    };
  }

  if (!promptText) {
    throw new Error('Interactive answers require a promptText callback.');
  }

  const identifiers = resolveScaffoldIdentifiers({
    namespace:
      namespace ?? (await promptText('Namespace', defaults.namespace, validateNamespace)),
    phpPrefix,
    slug: await promptText('Block slug', defaults.slug, validateBlockSlug),
    textDomain,
  });

  return {
    author: await promptText('Author', defaults.author),
    dataStorageMode: dataStorageMode ?? defaults.dataStorageMode,
    description: await promptText('Description', defaults.description),
    namespace: identifiers.namespace,
    persistencePolicy: persistencePolicy ?? defaults.persistencePolicy,
    phpPrefix: identifiers.phpPrefix,
    queryPostType:
      templateId === 'query-loop'
        ? normalizeQueryPostType(
            await promptText(
              'Query post type',
              queryPostType ?? defaults.queryPostType ?? 'post',
              validateQueryPostType,
            ),
          )
        : normalizeQueryPostType(queryPostType ?? defaults.queryPostType),
    slug: identifiers.slug,
    textDomain: identifiers.textDomain,
    title: await promptText('Block title', toTitleCase(identifiers.slug)),
  };
}
