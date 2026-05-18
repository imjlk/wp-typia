import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import semver from 'semver'
import { x as extractTarball } from 'tar'

import {
  createExternalTemplateTimeoutError,
  fetchWithExternalTemplateTimeout,
  getExternalTemplateMetadataMaxBytes,
  getExternalTemplateTarballMaxBytes,
  getExternalTemplateTimeoutMs,
  readBufferResponseWithLimit,
  readJsonResponseWithLimit,
} from './external-template-guards.js'
import {
  findReusableExternalTemplateSourceCache,
  isExternalTemplateCacheEnabled,
  resolveExternalTemplateSourceCache,
} from './template-source-cache.js'
import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from '../cli/cli-diagnostics.js'
import { pathExists } from '../shared/fs-async.js'
import { readJsonFile, readJsonFileSync } from '../shared/json-utils.js'
import {
  OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE,
  OFFICIAL_WORKSPACE_TEMPLATE_ALIAS,
  PROJECT_TOOLS_PACKAGE_ROOT,
  TEMPLATE_IDS,
} from './template-registry.js'
import { isPlainObject } from '../shared/object-utils.js'
import { createManagedTempRoot } from '../shared/temp-roots.js'
import type {
  GitHubTemplateLocator,
  NpmTemplateLocator,
  RemoteTemplateLocator,
  SeedSource,
} from './template-source-contracts.js'

const USER_FACING_TEMPLATE_IDS = [
  ...TEMPLATE_IDS,
  OFFICIAL_WORKSPACE_TEMPLATE_ALIAS,
] as const

const GITHUB_TEMPLATE_CACHE_REVISION_RACE_CODE =
  'github-template-cache-revision-race'

type GitHubTemplateCacheRevisionRaceError = Error & {
  code: typeof GITHUB_TEMPLATE_CACHE_REVISION_RACE_CODE
}

function createGitHubTemplateCacheRevisionRaceError(
  message: string,
): GitHubTemplateCacheRevisionRaceError {
  const error = new Error(message) as GitHubTemplateCacheRevisionRaceError
  error.code = GITHUB_TEMPLATE_CACHE_REVISION_RACE_CODE
  return error
}

function isGitHubTemplateCacheRevisionRaceError(
  error: unknown,
): error is GitHubTemplateCacheRevisionRaceError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code ===
      GITHUB_TEMPLATE_CACHE_REVISION_RACE_CODE
  )
}

function getUnknownNpmTemplateMessage(templateId: string): string {
  return [
    `Unknown template "${templateId}". Expected one of: ${USER_FACING_TEMPLATE_IDS.join(', ')}.`,
    'Run `wp-typia templates list` to inspect available templates.',
    'If you meant an npm template package, verify the package name and configured npm registry.',
  ].join(' ')
}

function readOptionalDistString(
  dist: Record<string, unknown>,
  key: string,
): string | null {
  const value = dist[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function normalizeNpmRegistryCacheKey(registryBase: string): string {
  try {
    const url = new URL(registryBase)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/u, '')
  } catch {
    return registryBase
  }
}

async function downloadNpmTemplateTarball(
  locator: NpmTemplateLocator,
  resolvedVersion: string,
  tarballUrl: string,
  unpackDir: string,
): Promise<void> {
  const tarballResponse = await fetchWithExternalTemplateTimeout(tarballUrl, {
    label: `downloading npm template tarball for ${locator.raw}@${resolvedVersion}`,
  })
  if (!tarballResponse.ok) {
    throw new Error(
      `Failed to download npm template tarball for ${locator.raw}: ${tarballResponse.status}`,
    )
  }

  const tarballPath = path.join(path.dirname(unpackDir), 'template.tgz')
  await fsp.mkdir(unpackDir, { recursive: true })
  await fsp.writeFile(
    tarballPath,
    await readBufferResponseWithLimit(tarballResponse, {
      label: `npm template tarball for ${locator.raw}@${resolvedVersion}`,
      maxBytes: getExternalTemplateTarballMaxBytes(),
    }),
  )
  await extractTarball({
    cwd: unpackDir,
    file: tarballPath,
    strip: 1,
  })
  await fsp.rm(tarballPath, { force: true })
  await assertNoSymlinks(unpackDir)
}

function selectRegistryVersion(
  metadata: Record<string, unknown>,
  locator: NpmTemplateLocator,
): string {
  const distTags = isPlainObject(metadata['dist-tags'])
    ? metadata['dist-tags']
    : {}
  const versions = isPlainObject(metadata.versions) ? metadata.versions : {}
  const versionKeys = Object.keys(versions)

  if (locator.type === 'version') {
    if (!versions[locator.fetchSpec]) {
      throw new Error(`npm template package version not found: ${locator.raw}`)
    }
    return locator.fetchSpec
  }

  if (locator.type === 'tag') {
    const taggedVersion = distTags[locator.fetchSpec]
    if (typeof taggedVersion !== 'string') {
      throw new Error(`npm template package tag not found: ${locator.raw}`)
    }
    return taggedVersion
  }

  const range = locator.fetchSpec.trim().length > 0 ? locator.fetchSpec : '*'
  const matchedVersion = semver.maxSatisfying(versionKeys, range)
  if (matchedVersion) {
    return matchedVersion
  }

  if (locator.fetchSpec.trim().length > 0) {
    throw new Error(
      `Unable to resolve npm template version for ${locator.raw}. Requested "${locator.fetchSpec}" but available versions are: ${versionKeys.join(', ') || '(none)'}.`,
    )
  }

  const latestVersion = distTags.latest
  if (typeof latestVersion === 'string' && versions[latestVersion]) {
    return latestVersion
  }

  throw new Error(
    `Unable to resolve a published npm template version for ${locator.raw}.`,
  )
}

async function fetchNpmTemplateSource(
  locator: NpmTemplateLocator,
): Promise<SeedSource> {
  const registryBase = (
    process.env.NPM_CONFIG_REGISTRY ?? 'https://registry.npmjs.org'
  ).replace(/\/$/, '')
  const metadataLabel = `fetching npm template metadata for ${locator.raw}`
  const metadataResponse = await fetchWithExternalTemplateTimeout(
    `${registryBase}/${encodeURIComponent(locator.name)}`,
    {
      label: metadataLabel,
    },
  )
  if (!metadataResponse.ok) {
    if (metadataResponse.status === 404) {
      throw createCliDiagnosticCodeError(
        CLI_DIAGNOSTIC_CODES.UNKNOWN_TEMPLATE,
        getUnknownNpmTemplateMessage(locator.raw),
      )
    }
    throw new Error(
      `Failed to fetch npm template metadata for ${locator.raw}: ${metadataResponse.status}`,
    )
  }

  const metadata = await readJsonResponseWithLimit(metadataResponse, {
    label: `npm template metadata for ${locator.raw}`,
    maxBytes: getExternalTemplateMetadataMaxBytes(),
  })
  const resolvedVersion = selectRegistryVersion(metadata, locator)
  const versions = isPlainObject(metadata.versions) ? metadata.versions : {}
  const versionMetadata = versions[resolvedVersion]
  if (!isPlainObject(versionMetadata) || !isPlainObject(versionMetadata.dist)) {
    throw new Error(
      `npm template metadata is missing dist information for ${locator.raw}@${resolvedVersion}.`,
    )
  }

  const tarballUrl = versionMetadata.dist.tarball
  if (typeof tarballUrl !== 'string' || tarballUrl.length === 0) {
    throw new Error(
      `npm template metadata is missing tarball URL for ${locator.raw}@${resolvedVersion}.`,
    )
  }

  const tarballIntegrity = readOptionalDistString(
    versionMetadata.dist,
    'integrity',
  )
  const tarballShasum = readOptionalDistString(versionMetadata.dist, 'shasum')
  if (tarballIntegrity || tarballShasum) {
    const registryCacheKey = normalizeNpmRegistryCacheKey(registryBase)
    const cachedSource = await resolveExternalTemplateSourceCache(
      {
        keyParts: [
          'npm',
          registryCacheKey,
          locator.name,
          locator.raw,
          resolvedVersion,
          tarballIntegrity ?? '',
          tarballShasum ?? '',
        ],
        metadata: {
          integrity: tarballIntegrity,
          package: locator.name,
          raw: locator.raw,
          registry: registryBase,
          shasum: tarballShasum,
          tarball: tarballUrl,
          version: resolvedVersion,
        },
        namespace: 'npm',
      },
      (unpackDir) =>
        downloadNpmTemplateTarball(
          locator,
          resolvedVersion,
          tarballUrl,
          unpackDir,
        ),
    )
    if (cachedSource) {
      await assertNoSymlinks(cachedSource.sourceDir)
      return {
        blockDir: cachedSource.sourceDir,
        rootDir: cachedSource.sourceDir,
      }
    }
  }

  const { path: tempRoot, cleanup } = await createManagedTempRoot(
    'wp-typia-template-source-',
  )

  try {
    const unpackDir = path.join(tempRoot, 'source')
    await downloadNpmTemplateTarball(
      locator,
      resolvedVersion,
      tarballUrl,
      unpackDir,
    )

    return {
      blockDir: unpackDir,
      cleanup,
      rootDir: unpackDir,
    }
  } catch (error) {
    await cleanup()
    throw error
  }
}

/**
 * Resolve a locally installed npm template package from the caller workspace.
 *
 * Bare package ids are preferred here so monorepo and offline workflows can
 * use an already-installed template without forcing a registry fetch. This
 * path intentionally keeps Node's synchronous `require.resolve` semantics
 * because the module resolver itself has no async equivalent.
 */
function resolveInstalledNpmTemplateSource(
  locator: NpmTemplateLocator,
  cwd: string,
): SeedSource | null {
  if (locator.rawSpec !== '' && locator.rawSpec !== '*') {
    return null
  }

  const workspacePackagesRoot = path.resolve(PROJECT_TOOLS_PACKAGE_ROOT, '..')
  if (fs.existsSync(workspacePackagesRoot)) {
    for (const entry of fs.readdirSync(workspacePackagesRoot, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) {
        continue
      }

      const packageDir = path.join(workspacePackagesRoot, entry.name)
      const packageJsonPath = path.join(packageDir, 'package.json')
      if (!fs.existsSync(packageJsonPath)) {
        continue
      }

      const manifest = readJsonFileSync<{ name?: string }>(packageJsonPath, {
        context: 'workspace template package manifest',
      })
      if (manifest.name === locator.name) {
        return {
          blockDir: packageDir,
          rootDir: packageDir,
        }
      }
    }
  }

  const workspaceRequire = createRequire(
    path.join(path.resolve(cwd), '__wp_typia_template_resolver__.cjs'),
  )
  try {
    const packageJsonPath = fs.realpathSync(
      workspaceRequire.resolve(`${locator.name}/package.json`),
    )
    const sourceDir = path.dirname(packageJsonPath)
    return {
      blockDir: sourceDir,
      rootDir: sourceDir,
    }
  } catch (error) {
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : ''
    if (
      errorCode === 'MODULE_NOT_FOUND' ||
      errorCode === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
    ) {
      for (const basePath of workspaceRequire.resolve.paths(locator.name) ??
        []) {
        const packageJsonPath = path.join(
          basePath,
          locator.name,
          'package.json',
        )
        if (!fs.existsSync(packageJsonPath)) {
          continue
        }
        const sourceDir = path.dirname(fs.realpathSync(packageJsonPath))
        return {
          blockDir: sourceDir,
          rootDir: sourceDir,
        }
      }
      return null
    }
    throw error
  }
}

/**
 * Synchronously identify the bundled workspace template seed.
 *
 * This remains sync-only for compatibility callers. Async template resolution
 * paths should use `isOfficialWorkspaceTemplateSeedAsync()`.
 */
export function isOfficialWorkspaceTemplateSeed(seed: SeedSource): boolean {
  const packageJsonPath = path.join(seed.rootDir, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    return false
  }

  try {
    const packageJson = readJsonFileSync<{ name?: string }>(packageJsonPath, {
      context: 'workspace template seed manifest',
    })
    return packageJson.name === OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE
  } catch {
    return false
  }
}

/**
 * Asynchronously identify the bundled workspace template seed.
 *
 * @param seed Seed source to inspect.
 * @returns Whether the seed resolves to the official workspace template package.
 */
export async function isOfficialWorkspaceTemplateSeedAsync(
  seed: SeedSource,
): Promise<boolean> {
  const packageJsonPath = path.join(seed.rootDir, 'package.json')
  if (!(await pathExists(packageJsonPath))) {
    return false
  }

  try {
    const packageJson = await readJsonFile<{ name?: string }>(
      packageJsonPath,
      {
        context: 'workspace template seed manifest',
      },
    )
    return packageJson.name === OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE
  } catch {
    return false
  }
}

export async function assertNoSymlinks(sourceDir: string): Promise<void> {
  const stats = await fsp.lstat(sourceDir)
  if (stats.isSymbolicLink()) {
    throw new Error(
      `Template sources may not include symbolic links: ${sourceDir}`,
    )
  }

  if (!stats.isDirectory()) {
    return
  }

  for (const entry of await fsp.readdir(sourceDir)) {
    await assertNoSymlinks(path.join(sourceDir, entry))
  }
}

function runGitTemplateCommand(
  args: readonly string[],
  label: string,
  options: { captureOutput?: boolean } = {},
): ReturnType<typeof spawnSync> {
  const timeoutMs = getExternalTemplateTimeoutMs()
  const result = options.captureOutput
    ? spawnSync('git', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs,
      })
    : spawnSync('git', args, {
        stdio: 'ignore',
        timeout: timeoutMs,
      })
  if (result.error) {
    const errorCode =
      typeof result.error === 'object' &&
      result.error !== null &&
      'code' in result.error
        ? String((result.error as { code: unknown }).code)
        : ''
    if (errorCode === 'ETIMEDOUT') {
      throw createExternalTemplateTimeoutError(label, timeoutMs)
    }
    throw result.error
  }
  if (result.signal === 'SIGTERM' || result.signal === 'SIGKILL') {
    throw createExternalTemplateTimeoutError(label, timeoutMs)
  }

  return result
}

function getGitHubTemplateRepositoryUrl(locator: GitHubTemplateLocator): string {
  return `https://github.com/${locator.owner}/${locator.repo}.git`
}

async function resolveGitHubTemplateDirectory(
  checkoutDir: string,
  locator: GitHubTemplateLocator,
): Promise<string> {
  const sourceDir = path.resolve(checkoutDir, locator.sourcePath)
  const relativeSourceDir = path.relative(checkoutDir, sourceDir)
  if (relativeSourceDir.startsWith('..') || path.isAbsolute(relativeSourceDir)) {
    throw new Error('GitHub template path must stay within the cloned repository.')
  }
  if (!(await pathExists(sourceDir))) {
    throw new Error(`GitHub template path does not exist: ${locator.sourcePath}`)
  }
  return sourceDir
}

function cloneGitHubTemplateSource(
  locator: GitHubTemplateLocator,
  checkoutDir: string,
): void {
  const args = ['clone', '--depth', '1']
  if (locator.ref) {
    args.push('--branch', locator.ref)
  }
  args.push(getGitHubTemplateRepositoryUrl(locator), checkoutDir)
  const cloneResult = runGitTemplateCommand(
    args,
    `cloning GitHub template ${locator.owner}/${locator.repo}`,
  )
  if (cloneResult.status !== 0) {
    throw new Error(
      `Failed to clone GitHub template source ${locator.owner}/${locator.repo}.`,
    )
  }
}

function readGitHubTemplateHeadRevision(checkoutDir: string): string | null {
  const result = runGitTemplateCommand(
    ['-C', checkoutDir, 'rev-parse', 'HEAD'],
    'reading GitHub template checkout revision',
    { captureOutput: true },
  )
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return null
  }

  const revision = result.stdout.trim().split(/\s+/u)[0]
  return /^[0-9a-f]{40}$/iu.test(revision) ? revision.toLowerCase() : null
}

function pinGitHubTemplateCacheRevision(
  locator: GitHubTemplateLocator,
  checkoutDir: string,
  cacheRevision: string,
): void {
  const normalizedCacheRevision = cacheRevision.toLowerCase()
  if (readGitHubTemplateHeadRevision(checkoutDir) === normalizedCacheRevision) {
    return
  }

  const fetchResult = runGitTemplateCommand(
    ['-C', checkoutDir, 'fetch', '--depth', '1', 'origin', cacheRevision],
    `fetching GitHub template revision ${locator.owner}/${locator.repo}`,
  )
  if (fetchResult.status !== 0) {
    throw createGitHubTemplateCacheRevisionRaceError(
      `Failed to fetch GitHub template revision ${cacheRevision} for ${locator.owner}/${locator.repo}.`,
    )
  }

  const checkoutResult = runGitTemplateCommand(
    ['-C', checkoutDir, 'checkout', '--detach', cacheRevision],
    `checking out GitHub template revision ${locator.owner}/${locator.repo}`,
  )
  if (checkoutResult.status !== 0) {
    throw createGitHubTemplateCacheRevisionRaceError(
      `Failed to check out GitHub template revision ${cacheRevision} for ${locator.owner}/${locator.repo}.`,
    )
  }

  if (readGitHubTemplateHeadRevision(checkoutDir) !== normalizedCacheRevision) {
    throw createGitHubTemplateCacheRevisionRaceError(
      `GitHub template checkout did not match resolved revision ${cacheRevision} for ${locator.owner}/${locator.repo}.`,
    )
  }
}

function getGitHubTemplateRevisionPatterns(
  locator: GitHubTemplateLocator,
): string[] {
  const ref = locator.ref ?? 'HEAD'
  if (!locator.ref) {
    return [ref]
  }
  if (ref.startsWith('refs/')) {
    return [ref, `${ref}^{}`]
  }
  return [ref, `refs/heads/${ref}`, `refs/tags/${ref}`, `refs/tags/${ref}^{}`]
}

type GitHubTemplateResolvedRevision = {
  resolvedRef: string
  revision: string
}

type GitHubTemplateCacheRevisionResolution = {
  lookupUnavailable: boolean
  revision: string | null
}

function pickGitHubTemplateCacheRevision(
  locator: GitHubTemplateLocator,
  revisions: readonly GitHubTemplateResolvedRevision[],
): string | null {
  const ref = locator.ref ?? 'HEAD'
  if (!locator.ref) {
    return revisions[0]?.revision ?? null
  }
  if (!ref.startsWith('refs/')) {
    const branchRevision = revisions.find(
      (entry) => entry.resolvedRef === `refs/heads/${ref}`,
    )
    if (branchRevision) {
      return branchRevision.revision
    }

    const peeledTagRevision = revisions.find(
      (entry) => entry.resolvedRef === `refs/tags/${ref}^{}`,
    )
    if (peeledTagRevision) {
      return peeledTagRevision.revision
    }

    const tagRevision = revisions.find(
      (entry) => entry.resolvedRef === `refs/tags/${ref}`,
    )
    if (tagRevision) {
      return tagRevision.revision
    }
  }
  if (ref.startsWith('refs/tags/')) {
    const peeledRevision = revisions.find(
      (entry) => entry.resolvedRef === `${ref}^{}`,
    )
    if (peeledRevision) {
      return peeledRevision.revision
    }
  }

  const exactRevision = revisions.find((entry) => entry.resolvedRef === ref)
  return (exactRevision ?? revisions[0])?.revision ?? null
}

/**
 * Resolves a GitHub template ref to a stable revision for cache keying.
 *
 * @param locator GitHub template locator containing owner, repo, and optional ref.
 * @returns Revision lookup result, including whether `git ls-remote` was unavailable.
 */
function resolveGitHubTemplateCacheRevision(
  locator: GitHubTemplateLocator,
): GitHubTemplateCacheRevisionResolution {
  const result = runGitTemplateCommand(
    [
      'ls-remote',
      getGitHubTemplateRepositoryUrl(locator),
      ...getGitHubTemplateRevisionPatterns(locator),
    ],
    `checking GitHub template revision ${locator.owner}/${locator.repo}`,
    { captureOutput: true },
  )
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return {
      lookupUnavailable: true,
      revision: null,
    }
  }

  const revisions = result.stdout
    .split('\n')
    .map((line) => {
      const [revision, resolvedRef] = line.trim().split(/\s+/u)
      if (!/^[0-9a-f]{40}$/iu.test(revision) || !resolvedRef) {
        return null
      }
      return {
        resolvedRef,
        revision: revision.toLowerCase(),
      }
    })
    .filter(
      (entry): entry is GitHubTemplateResolvedRevision => entry !== null,
    )

  return {
    lookupUnavailable: false,
    revision: pickGitHubTemplateCacheRevision(locator, revisions),
  }
}

function getGitHubTemplateCacheMetadata(
  locator: GitHubTemplateLocator,
  revision?: string,
): Record<string, string | null> {
  return {
    ...(revision ? { revision } : {}),
    owner: locator.owner,
    ref: locator.ref,
    repo: locator.repo,
    sourcePath: locator.sourcePath,
  }
}

async function reuseGitHubTemplateCacheByMetadata(
  locator: GitHubTemplateLocator,
): Promise<SeedSource | null> {
  const cachedSource = await findReusableExternalTemplateSourceCache({
    metadata: getGitHubTemplateCacheMetadata(locator),
    namespace: 'github',
  })
  if (!cachedSource) {
    return null
  }

  const sourceDir = await resolveGitHubTemplateDirectory(
    cachedSource.sourceDir,
    locator,
  )
  await assertNoSymlinks(sourceDir)
  return {
    blockDir: sourceDir,
    rootDir: sourceDir,
  }
}

async function resolveGitHubTemplateSource(
  locator: GitHubTemplateLocator,
): Promise<SeedSource> {
  const cacheEnabled = isExternalTemplateCacheEnabled()
  let cacheRevisionLookupUnavailable = false
  let cacheRevision: string | null = null
  if (cacheEnabled) {
    try {
      const resolvedRevision = resolveGitHubTemplateCacheRevision(locator)
      cacheRevision = resolvedRevision.revision
      cacheRevisionLookupUnavailable = resolvedRevision.lookupUnavailable
    } catch {
      cacheRevision = null
      cacheRevisionLookupUnavailable = true
    }
  }
  if (cacheEnabled && !cacheRevision && cacheRevisionLookupUnavailable) {
    const cachedSource = await reuseGitHubTemplateCacheByMetadata(locator)
    if (cachedSource) {
      return cachedSource
    }
  }
  if (cacheRevision) {
    const resolvedCacheRevision = cacheRevision
    try {
      const cachedSource = await resolveExternalTemplateSourceCache(
        {
          keyParts: [
            'github',
            locator.owner,
            locator.repo,
            locator.sourcePath,
            locator.ref ?? '',
            resolvedCacheRevision,
          ],
          metadata: getGitHubTemplateCacheMetadata(
            locator,
            resolvedCacheRevision,
          ),
          namespace: 'github',
        },
        async (checkoutDir) => {
          cloneGitHubTemplateSource(locator, checkoutDir)
          const sourceDir = await resolveGitHubTemplateDirectory(checkoutDir, locator)
          await assertNoSymlinks(sourceDir)
          pinGitHubTemplateCacheRevision(
            locator,
            checkoutDir,
            resolvedCacheRevision,
          )
        },
      )
      if (cachedSource) {
        const sourceDir = await resolveGitHubTemplateDirectory(
          cachedSource.sourceDir,
          locator,
        )
        await assertNoSymlinks(sourceDir)
        return {
          blockDir: sourceDir,
          rootDir: sourceDir,
        }
      }
    } catch (error) {
      if (!isGitHubTemplateCacheRevisionRaceError(error)) {
        throw error
      }
      // Fall back to the existing uncached clone path if revision pinning races.
    }
  }

  const { path: remoteRoot, cleanup } = await createManagedTempRoot(
    'wp-typia-template-source-',
  )
  const checkoutDir = path.join(remoteRoot, 'source')

  try {
    cloneGitHubTemplateSource(locator, checkoutDir)
    const sourceDir = await resolveGitHubTemplateDirectory(checkoutDir, locator)
    await assertNoSymlinks(sourceDir)

    return {
      blockDir: sourceDir,
      cleanup,
      rootDir: sourceDir,
    }
  } catch (error) {
    await cleanup()
    throw error
  }
}

/**
 * Resolves a template locator into a local seed source directory.
 *
 * @param locator Remote template locator describing a local path, GitHub source, or npm package.
 * @param cwd Current working directory used to resolve local template paths.
 * @returns A local seed source containing the resolved root and block directory, plus optional cleanup.
 * @throws When the locator is invalid, the source cannot be fetched, or filesystem validation fails.
 */
export async function resolveTemplateSeed(
  locator: RemoteTemplateLocator,
  cwd: string,
): Promise<SeedSource> {
  if (locator.kind === 'path') {
    const sourceDir = path.resolve(cwd, locator.templatePath)
    if (!(await pathExists(sourceDir))) {
      throw new Error(`Template path does not exist: ${sourceDir}`)
    }
    await assertNoSymlinks(sourceDir)
    return {
      blockDir: sourceDir,
      rootDir: sourceDir,
    }
  }

  if (locator.kind === 'github') {
    return resolveGitHubTemplateSource(locator.locator)
  }

  const installedSource = resolveInstalledNpmTemplateSource(
    locator.locator,
    cwd,
  )
  if (installedSource) {
    await assertNoSymlinks(installedSource.blockDir)
    return installedSource
  }

  return fetchNpmTemplateSource(locator.locator)
}
