import path from 'node:path'

import npa from 'npm-package-arg'

import {
  BUILTIN_TEMPLATE_IDS,
  isBuiltInTemplateId,
} from './template-registry.js'
import {
  getRemovedBuiltInTemplateMessage,
  isRemovedBuiltInTemplateId,
} from './template-defaults.js'
import type {
  GitHubTemplateLocator,
  NpmTemplateLocator,
  RemoteTemplateLocator,
} from './template-source-contracts.js'

function isTemplatePathLocator(templateId: string): boolean {
  return (
    path.isAbsolute(templateId) ||
    templateId.startsWith('./') ||
    templateId.startsWith('../')
  )
}

export function parseGitHubTemplateLocator(
  templateId: string,
): GitHubTemplateLocator | null {
  if (!templateId.startsWith('github:')) {
    return null
  }

  const [locatorBody, refSegment] = templateId
    .slice('github:'.length)
    .split('#', 2)
  const segments = locatorBody.split('/').filter(Boolean)
  if (segments.length < 3) {
    throw new Error(
      `GitHub template locators must look like github:owner/repo/path[#ref]. Received: ${templateId}`,
    )
  }

  const [owner, repo, ...sourcePathSegments] = segments
  return {
    owner,
    repo,
    ref: refSegment ?? null,
    sourcePath: sourcePathSegments.join('/'),
  }
}

export function parseNpmTemplateLocator(
  templateId: string,
): NpmTemplateLocator | null {
  if (
    isBuiltInTemplateId(templateId) ||
    isTemplatePathLocator(templateId) ||
    templateId.startsWith('github:')
  ) {
    return null
  }

  try {
    const parsed = npa(templateId)
    if (!parsed.registry || !parsed.name) {
      return null
    }
    const parsedWithRawSpec = parsed as unknown as { rawSpec?: unknown }
    const rawSpec =
      typeof parsedWithRawSpec.rawSpec === 'string'
        ? parsedWithRawSpec.rawSpec
        : ''

    return {
      fetchSpec: typeof parsed.fetchSpec === 'string' ? parsed.fetchSpec : '',
      name: parsed.name,
      raw: templateId,
      rawSpec,
      type: parsed.type,
    }
  } catch {
    return null
  }
}

export function parseTemplateLocator(
  templateId: string,
): RemoteTemplateLocator {
  if (isRemovedBuiltInTemplateId(templateId)) {
    throw new Error(getRemovedBuiltInTemplateMessage(templateId))
  }

  const githubLocator = parseGitHubTemplateLocator(templateId)
  if (githubLocator) {
    return { kind: 'github', locator: githubLocator }
  }

  if (isTemplatePathLocator(templateId)) {
    return { kind: 'path', templatePath: templateId }
  }

  const npmLocator = parseNpmTemplateLocator(templateId)
  if (npmLocator) {
    return { kind: 'npm', locator: npmLocator }
  }

  throw new Error(
    `Unknown template "${templateId}". Expected one of: ${BUILTIN_TEMPLATE_IDS.join(', ')}, a local path, github:owner/repo/path[#ref], or an npm package spec.`,
  )
}
