import {
  OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE,
  isBuiltInTemplateId,
} from './template-registry.js'
import { resolveBuiltInTemplateSource } from './template-builtins.js'
import type {
  ResolvedTemplateSource,
  SeedSource,
} from './template-source-contracts.js'
import {
  parseTemplateLocator,
} from './template-source-locators.js'
import {
  detectTemplateSourceFormat,
  getTemplateProjectTypeAsync,
  getDefaultCategoryAsync,
  getTemplateVariableContext,
  normalizeCreateBlockSubset,
  normalizeWpTypiaTemplateSeed,
  renderCreateBlockExternalTemplate,
} from './template-source-normalization.js'
import {
  isOfficialWorkspaceTemplateSeedAsync,
  resolveTemplateSeed,
} from './template-source-seeds.js'
import {
  assertBuiltInTemplateVariantAllowed,
} from '../cli/cli-validation.js'
import type { ScaffoldTemplateVariables } from './scaffold.js'
import { getScaffoldTemplateVariableGroups } from './scaffold-template-variable-groups.js'

export type {
  GitHubTemplateLocator,
  NpmTemplateLocator,
  RemoteTemplateLocator,
  ResolvedTemplateSource,
  TemplateSourceFormat,
  TemplateVariableContext,
} from './template-source-contracts.js'
export {
  parseGitHubTemplateLocator,
  parseNpmTemplateLocator,
  parseTemplateLocator,
} from './template-source-locators.js'
export { resolveTemplateSeed } from './template-source-seeds.js'

export async function resolveTemplateSource(
  templateId: string,
  cwd: string,
  variables: ScaffoldTemplateVariables,
  variant?: string,
): Promise<ResolvedTemplateSource> {
  if (isBuiltInTemplateId(templateId)) {
    const variableGroups = getScaffoldTemplateVariableGroups(variables)
    assertBuiltInTemplateVariantAllowed({
      templateId,
      variant,
    })
    return resolveBuiltInTemplateSource(templateId, {
      persistenceEnabled:
        variableGroups.compound.enabled &&
        variableGroups.compound.persistenceEnabled,
      persistencePolicy:
        variableGroups.persistence.enabled &&
        variableGroups.persistence.policy === 'public'
          ? 'public'
          : 'authenticated',
    })
  }

  const locator = parseTemplateLocator(templateId)
  const context = getTemplateVariableContext(variables)
  const seed = await resolveTemplateSeed(locator, cwd)
  const isOfficialWorkspaceTemplate =
    templateId === OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE ||
    (await isOfficialWorkspaceTemplateSeedAsync(seed))
  let normalizedSeed: SeedSource | null = null

  try {
    const format = await detectTemplateSourceFormat(seed.blockDir)
    if (format === 'wp-typia') {
      if (variant) {
        throw new Error(
          `--variant is only supported for official external template configs. Received variant "${variant}" for "${templateId}".`,
        )
      }
      normalizedSeed = await normalizeWpTypiaTemplateSeed(seed)
      const supportsMigrationUi =
        (await getTemplateProjectTypeAsync(seed.blockDir)) === 'workspace'
      return {
        id: templateId,
        defaultCategory: await getDefaultCategoryAsync(seed.blockDir),
        description: 'A remote wp-typia template source',
        features: ['Remote source', 'wp-typia format'],
        format,
        isOfficialWorkspaceTemplate,
        supportsMigrationUi,
        templateDir: normalizedSeed.blockDir,
        cleanup: normalizedSeed.cleanup,
      }
    }

    normalizedSeed =
      format === 'create-block-external'
        ? await renderCreateBlockExternalTemplate(
            seed.blockDir,
            context,
            variant,
          )
        : variant
          ? (() => {
              throw new Error(
                `--variant is only supported for official external template configs. Received variant "${variant}" for "${templateId}".`,
              )
            })()
          : seed

    if (format === 'create-block-external') {
      const renderedFormat =
        normalizedSeed.formatHint ??
        (await detectTemplateSourceFormat(normalizedSeed.blockDir))
      if (renderedFormat === 'wp-typia') {
        const normalized = await normalizeWpTypiaTemplateSeed(normalizedSeed)
        try {
          const [projectType, defaultCategory] = await Promise.all([
            getTemplateProjectTypeAsync(normalizedSeed.blockDir),
            getDefaultCategoryAsync(normalizedSeed.blockDir),
          ])
          const supportsMigrationUi = projectType === 'workspace'
          return {
            cleanup: async () => {
              await normalized.cleanup?.()
              await seed.cleanup?.()
            },
            defaultCategory,
            description:
              'A wp-typia scaffold normalized from an official external template config',
            features: [
              'Remote source',
              'official external template',
              'wp-typia format',
              ...(supportsMigrationUi ? ['workspace-capable scaffold'] : []),
            ],
            format,
            id: 'remote:create-block-external',
            isOfficialWorkspaceTemplate,
            selectedVariant: normalizedSeed.selectedVariant ?? null,
            supportsMigrationUi,
            templateDir: normalized.blockDir,
            warnings: normalizedSeed.warnings ?? [],
          }
        } catch (error) {
          await normalized.cleanup?.()
          throw error
        }
      }

      const normalized = await normalizeCreateBlockSubset(
        normalizedSeed,
        context,
      )
      return {
        ...normalized,
        cleanup: async () => {
          await normalized.cleanup?.()
          await seed.cleanup?.()
        },
        description:
          'A wp-typia scaffold normalized from an official create-block external template',
        features: [
          'Remote source',
          'official external template',
          'Typia metadata pipeline',
        ],
        format,
        id: 'remote:create-block-external',
        isOfficialWorkspaceTemplate,
        selectedVariant: normalizedSeed.selectedVariant ?? null,
        warnings: normalizedSeed.warnings ?? [],
      }
    }

    const normalized = await normalizeCreateBlockSubset(
      normalizedSeed,
      context,
    )
    return {
      ...normalized,
      isOfficialWorkspaceTemplate,
    }
  } catch (error) {
    if (normalizedSeed?.cleanup && normalizedSeed !== seed) {
      await normalizedSeed.cleanup()
    }
    if (seed.cleanup) {
      await seed.cleanup()
    }
    throw error
  }
}
