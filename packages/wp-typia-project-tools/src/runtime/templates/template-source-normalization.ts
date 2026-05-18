/// <reference path="./external-template-modules.d.ts" />

import path from 'node:path'

import { loadExternalTemplateLayerManifest } from './template-layers.js'
import { getPackageVersions } from '../shared/package-versions.js'
import { findExternalTemplateEntry } from './template-source-external.js'
import { getTemplateProjectTypeAsync } from './template-source-remote.js'
import { pathExists } from '../shared/fs-async.js'
export { renderCreateBlockExternalTemplate } from './template-source-external.js'
export {
  getTemplateProjectType,
  getTemplateProjectTypeAsync,
  getDefaultCategory,
  getDefaultCategoryAsync,
  normalizeCreateBlockSubset,
  normalizeWpTypiaTemplateSeed,
} from './template-source-remote.js'
import type {
  TemplateSourceFormat,
  TemplateVariableContext,
} from './template-source-contracts.js'

export function getTemplateVariableContext(variables: {
  [key: string]: string
}): TemplateVariableContext {
  const {
    apiClientPackageVersion,
    blockRuntimePackageVersion,
    blockTypesPackageVersion,
    projectToolsPackageVersion,
    restPackageVersion,
    wpTypiaPackageVersion,
  } = getPackageVersions()
  return {
    ...variables,
    apiClientPackageVersion:
      variables.apiClientPackageVersion ?? apiClientPackageVersion,
    blockRuntimePackageVersion:
      variables.blockRuntimePackageVersion ?? blockRuntimePackageVersion,
    blockTypesPackageVersion:
      variables.blockTypesPackageVersion ?? blockTypesPackageVersion,
    projectToolsPackageVersion:
      variables.projectToolsPackageVersion ?? projectToolsPackageVersion,
    wpTypiaPackageVersion:
      variables.wpTypiaPackageVersion ?? wpTypiaPackageVersion,
    description: variables.description,
    keyword: variables.keyword,
    namespace: variables.namespace,
    pascalCase: variables.pascalCase,
    phpPrefix: variables.phpPrefix,
    restPackageVersion: variables.restPackageVersion ?? restPackageVersion,
    slug: variables.slug,
    textDomain: variables.textDomain,
    title: variables.title,
  }
}

export async function detectTemplateSourceFormat(
  sourceDir: string,
): Promise<TemplateSourceFormat> {
  if (await pathExists(path.join(sourceDir, 'package.json.mustache'))) {
    return 'wp-typia'
  }

  if (await loadExternalTemplateLayerManifest(sourceDir)) {
    throw new Error(
      `Template source at ${sourceDir} is an external layer package. External layers currently compose only through built-in scaffolds via the runtime API, not as standalone template ids.`,
    )
  }

  if (await findExternalTemplateEntry(sourceDir)) {
    return 'create-block-external'
  }

  if ((await getTemplateProjectTypeAsync(sourceDir)) !== null) {
    return 'wp-typia'
  }

  const sourceRoot = await pathExists(path.join(sourceDir, 'src'))
    ? path.join(sourceDir, 'src')
    : sourceDir
  const blockJsonCandidates = [
    path.join(sourceDir, 'block.json'),
    path.join(sourceRoot, 'block.json'),
  ]
  const hasBlockJson = (
    await Promise.all(blockJsonCandidates.map((candidate) => pathExists(candidate)))
  ).some(Boolean)
  const hasIndexFile = (
    await Promise.all(
      ['index.js', 'index.jsx', 'index.ts', 'index.tsx'].map((filename) =>
        pathExists(path.join(sourceRoot, filename)),
      ),
    )
  ).some(Boolean)
  const hasEditFile = (
    await Promise.all(
      ['edit.js', 'edit.jsx', 'edit.ts', 'edit.tsx'].map((filename) =>
        pathExists(path.join(sourceRoot, filename)),
      ),
    )
  ).some(Boolean)
  const hasSaveFile = (
    await Promise.all(
      ['save.js', 'save.jsx', 'save.ts', 'save.tsx'].map((filename) =>
        pathExists(path.join(sourceRoot, filename)),
      ),
    )
  ).some(Boolean)

  if (hasBlockJson && hasIndexFile && hasEditFile && hasSaveFile) {
    return 'create-block-subset'
  }

  throw new Error(
    `Unsupported template source at ${sourceDir}. Expected a wp-typia template directory, an official create-block external template config, or a create-block subset with block.json and src/index/edit/save files.`,
  )
}
