import {
  buildTemplateVariablesFromBlockSpec,
  createBuiltInBlockSpec,
} from './block-generator-service.js';
import { getPackageVersions } from '../shared/package-versions.js';
import {
  buildBlockCssClassName,
  buildFrontendCssClassName,
  resolveScaffoldIdentifiers,
} from './scaffold-identifiers.js';
import type {
  FlatScaffoldTemplateVariables,
  ScaffoldAnswers,
  ScaffoldTemplateVariables,
} from './scaffold.js';
import {
  BUILTIN_BLOCK_METADATA_VERSION,
  COMPOUND_CHILD_BLOCK_METADATA_DEFAULTS,
  getBuiltInTemplateMetadataDefaults,
} from './template-defaults.js';
import {
  DEFAULT_COMPOUND_INNER_BLOCKS_PRESET_ID,
  getCompoundInnerBlocksPresetDefinition,
} from '../add/compound-inner-blocks.js';
import {
  getTemplateById,
  isBuiltInTemplateId,
} from './template-registry.js';
import {
  toPascalCase,
  toSnakeCase,
} from '../shared/string-case.js';
import { attachScaffoldTemplateVariableGroups } from "./scaffold-template-variable-groups.js";
import {
  createScaffoldCompatibilityBaseline,
  resolveScaffoldCompatibilityPolicy,
  type ScaffoldWordPressTargetVersion,
} from "./scaffold-compatibility.js";

export interface GetTemplateVariablesOptions {
  wpVersion?: ScaffoldWordPressTargetVersion;
}

/**
 * Build the normalized template variables used by scaffold rendering.
 *
 * @param templateId Selected scaffold template identifier.
 * @param answers Normalized scaffold answers collected from defaults, flags, and prompts.
 * @returns Template variables ready for file interpolation and generated artifacts.
 */
export function getTemplateVariables(
  templateId: string,
  answers: ScaffoldAnswers,
  options: GetTemplateVariablesOptions = {},
): ScaffoldTemplateVariables {
  if (isBuiltInTemplateId(templateId)) {
    return buildTemplateVariablesFromBlockSpec(
      createBuiltInBlockSpec({
        answers,
        dataStorageMode: answers.dataStorageMode,
        persistencePolicy: answers.persistencePolicy,
        templateId,
        wpVersion: options.wpVersion,
      }),
    );
  }

  const {
    apiClientPackageVersion,
    blockRuntimePackageVersion,
    blockTypesPackageVersion,
    projectToolsPackageVersion,
    restPackageVersion,
    wpTypiaPackageVersion,
  } = getPackageVersions();
  const template = isBuiltInTemplateId(templateId) ? getTemplateById(templateId) : null;
  const metadataDefaults = isBuiltInTemplateId(templateId)
    ? getBuiltInTemplateMetadataDefaults(templateId)
    : null;
  const identifiers = resolveScaffoldIdentifiers({
    namespace: answers.namespace,
    phpPrefix: answers.phpPrefix,
    slug: answers.slug,
    textDomain: answers.textDomain,
  });
  const slug = identifiers.slug;
  const slugSnakeCase = toSnakeCase(slug);
  const pascalCase = toPascalCase(slug);
  const title = answers.title.trim();
  const namespace = identifiers.namespace;
  const description = answers.description.trim();
  const textDomain = identifiers.textDomain;
  const phpPrefix = identifiers.phpPrefix;
  const phpPrefixUpper = phpPrefix.toUpperCase();
  const compoundChildTitle = `${title} Item`;
  const cssClassName = buildBlockCssClassName(namespace, slug);
  const compoundChildCssClassName = buildBlockCssClassName(namespace, `${slug}-item`);
  const compoundInnerBlocksPreset =
    answers.compoundInnerBlocksPreset ?? DEFAULT_COMPOUND_INNER_BLOCKS_PRESET_ID;
  const compoundInnerBlocksPresetDefinition =
    getCompoundInnerBlocksPresetDefinition(compoundInnerBlocksPreset);
  const compoundPersistenceEnabled =
    templateId === 'persistence'
      ? true
      : templateId === 'compound'
        ? Boolean(answers.dataStorageMode || answers.persistencePolicy)
        : false;
  const dataStorageMode =
    templateId === 'persistence' || compoundPersistenceEnabled
      ? answers.dataStorageMode ?? 'custom-table'
      : 'custom-table';
  const persistencePolicy =
    templateId === 'persistence' || compoundPersistenceEnabled
      ? answers.persistencePolicy ?? 'authenticated'
      : 'authenticated';
  const compatibility = resolveScaffoldCompatibilityPolicy([], {
    baseline: createScaffoldCompatibilityBaseline(options.wpVersion),
  });

  const flatVariables: FlatScaffoldTemplateVariables = {
    alternateRenderTargetsCsv: '',
    alternateRenderTargetsJson: '[]',
    apiClientPackageVersion,
    author: answers.author.trim(),
    blockRuntimePackageVersion,
    blockMetadataVersion: BUILTIN_BLOCK_METADATA_VERSION,
    blockTypesPackageVersion,
    category: metadataDefaults?.category ?? template?.defaultCategory ?? 'widgets',
    icon: metadataDefaults?.icon ?? 'smiley',
    compoundChildTitle,
    compoundChildCategory: COMPOUND_CHILD_BLOCK_METADATA_DEFAULTS.category,
    compoundChildCssClassName,
    compoundChildIcon: COMPOUND_CHILD_BLOCK_METADATA_DEFAULTS.icon,
    compoundChildTitleJson: JSON.stringify(compoundChildTitle),
    compoundPersistenceEnabled: compoundPersistenceEnabled ? 'true' : 'false',
    compoundInnerBlocksDirectInsert: compoundInnerBlocksPresetDefinition.directInsert
      ? 'true'
      : 'false',
    compoundInnerBlocksOrientation:
      compoundInnerBlocksPresetDefinition.orientation ?? '',
    compoundInnerBlocksOrientationExpression:
      compoundInnerBlocksPresetDefinition.orientation
        ? `'${compoundInnerBlocksPresetDefinition.orientation}'`
        : 'undefined',
    compoundInnerBlocksPreset,
    compoundInnerBlocksPresetDescription:
      compoundInnerBlocksPresetDefinition.description,
    compoundInnerBlocksPresetLabel: compoundInnerBlocksPresetDefinition.label,
    compoundInnerBlocksTemplateLockExpression:
      compoundInnerBlocksPresetDefinition.templateLock === false
        ? 'false'
        : `'${compoundInnerBlocksPresetDefinition.templateLock}'`,
    hasAlternateEmailRenderTarget: 'false',
    hasAlternateMjmlRenderTarget: 'false',
    hasAlternatePlainTextRenderTarget: 'false',
    hasAlternateRenderTargets: 'false',
    projectToolsPackageVersion,
    wpTypiaPackageVersion,
    requiresAtLeast: compatibility.pluginHeader.requiresAtLeast,
    requiresPhp: compatibility.pluginHeader.requiresPhp,
    cssClassName,
    dataStorageMode,
    dashCase: slug,
    description,
    descriptionJson: JSON.stringify(description),
    frontendCssClassName: buildFrontendCssClassName(cssClassName),
    queryAllowedControlsJson: JSON.stringify([], null, 2),
    queryPostType: answers.queryPostType?.trim() || 'post',
    queryPostTypeJson: JSON.stringify(answers.queryPostType?.trim() || 'post'),
    queryVariationNamespace: `${namespace}/${slug}`,
    queryVariationNamespaceJson: JSON.stringify(`${namespace}/${slug}`),
    isAuthenticatedPersistencePolicy:
      persistencePolicy === 'authenticated' ? 'true' : 'false',
    isPublicPersistencePolicy: persistencePolicy === 'public' ? 'true' : 'false',
    bootstrapCredentialDeclarations:
      persistencePolicy === 'public'
        ? "publicWriteExpiresAt?: number & tags.Type< 'uint32' >;\n\tpublicWriteToken?: string & tags.MinLength< 1 > & tags.MaxLength< 512 >;"
        : "restNonce?: string & tags.MinLength< 1 > & tags.MaxLength< 128 >;",
    persistencePolicyDescriptionJson: JSON.stringify(
      persistencePolicy === 'authenticated'
        ? 'Writes require a logged-in user and a valid REST nonce.'
        : 'Anonymous writes use signed short-lived public tokens, per-request ids, and coarse rate limiting.',
    ),
    keyword: slug.replace(/-/g, ' '),
    namespace,
    needsMigration: '{{needsMigration}}',
    pascalCase,
    phpPrefix,
    phpPrefixUpper,
    restPackageVersion,
    testedUpTo: compatibility.pluginHeader.testedUpTo,
    publicWriteRequestIdDeclaration:
      persistencePolicy === 'public'
        ? "publicWriteRequestId: string & tags.MinLength< 1 > & tags.MaxLength< 128 >;"
        : "publicWriteRequestId?: string & tags.MinLength< 1 > & tags.MaxLength< 128 >;",
    restWriteAuthIntent:
      persistencePolicy === 'public'
        ? 'public-write-protected'
        : 'authenticated',
    restWriteAuthMechanism:
      persistencePolicy === 'public' ? 'public-signed-token' : 'rest-nonce',
    restWriteAuthMode:
      persistencePolicy === 'public' ? 'public-signed-token' : 'authenticated-rest-nonce',
    slug,
    slugCamelCase: pascalCase.charAt(0).toLowerCase() + pascalCase.slice(1),
    slugKebabCase: slug,
    slugSnakeCase,
    textDomain,
    textdomain: textDomain,
    title,
    titleJson: JSON.stringify(title),
    titleCase: pascalCase,
    persistencePolicy,
  };

  return attachScaffoldTemplateVariableGroups(flatVariables, {
    alternateRenderTargets: {
      csv: '',
      enabled: false,
      hasEmail: false,
      hasMjml: false,
      hasPlainText: false,
      json: '[]',
      targets: [],
    },
    compound: {
      enabled: false,
      persistenceEnabled: false,
    },
    persistence: {
      enabled: false,
      scope: 'none',
    },
    queryLoop: {
      enabled: false,
    },
    shared: {
      author: answers.author.trim(),
      blockMetadataVersion: BUILTIN_BLOCK_METADATA_VERSION,
      category: metadataDefaults?.category ?? template?.defaultCategory ?? 'widgets',
      compatibility: compatibility.pluginHeader,
      cssClassName,
      description,
      descriptionJson: JSON.stringify(description),
      frontendCssClassName: buildFrontendCssClassName(cssClassName),
      icon: metadataDefaults?.icon ?? 'smiley',
      keyword: slug.replace(/-/g, ' '),
      namespace,
      pascalCase,
      phpPrefix,
      phpPrefixUpper,
      slug,
      slugCamelCase: pascalCase.charAt(0).toLowerCase() + pascalCase.slice(1),
      slugKebabCase: slug,
      slugSnakeCase,
      textDomain,
      title,
      titleCase: pascalCase,
      titleJson: JSON.stringify(title),
      versions: {
        apiClient: apiClientPackageVersion,
        blockRuntime: blockRuntimePackageVersion,
        blockTypes: blockTypesPackageVersion,
        projectTools: projectToolsPackageVersion,
        rest: restPackageVersion,
      },
    },
    template: {
      description: template?.description ?? 'External scaffold template variables',
    },
    templateFamily: 'external',
  });
}
