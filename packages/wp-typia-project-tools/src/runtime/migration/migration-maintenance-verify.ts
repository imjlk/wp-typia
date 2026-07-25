import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import {
  ROOT_PHP_MIGRATION_REGISTRY,
} from './migration-constants.js'
import { createMigrationDiff } from './migration-diff.js'
import {
  createEdgeFixtureDocument,
} from './migration-fixtures.js'
import {
  collectGeneratedMigrationEntries,
} from './migration-generated-artifacts.js'
import {
  formatScaffoldCommand,
  getSelectedEntriesByBlock,
  hasSnapshotForVersion,
  isLegacySingleBlockProject,
  isSnapshotOptionalForBlockVersion,
  resolveLegacyVersions,
} from './migration-planning.js'
import {
  assertRuleHasNoTodos,
  getFixtureFilePath,
  getGeneratedDirForBlock,
  getRuleFilePath,
  getSnapshotBlockJsonPath,
  getSnapshotManifestPath,
  getSnapshotRoot,
  getSnapshotSavePath,
  loadMigrationProject,
  readRuleMetadata,
} from './migration-project.js'
import {
  renderFuzzFile,
  renderGeneratedDeprecatedFile,
  renderGeneratedMigrationIndexFile,
  renderMigrationRegistryFile,
  renderPhpMigrationRegistryFile,
  renderVerifyFile,
} from './migration-render.js'
import {
  createMigrationRiskSummary,
  formatMigrationRiskSummary,
} from './migration-risk.js'
import {
  getLocalTtsxBinary,
  readJson,
} from './migration-utils.js'
import { readWorkspaceInventory } from '../workspace/workspace-inventory.js'
import {
  getInvalidWorkspaceProjectReason,
  tryResolveWorkspaceProject,
} from '../workspace/workspace-project.js'
import type { VerifyOptions } from './migration-command-surface.js'
import type { MigrationProjectState } from './migration-types.js'

/**
 * Run deterministic migration verification against generated fixtures.
 *
 * @param projectDir Absolute or relative project directory containing the migration workspace.
 * @param options Verification scope and console rendering options.
 * @returns Verified legacy versions.
 */
export function verifyProjectMigrations(
  projectDir: string,
  {
    all = false,
    fromMigrationVersion,
    renderLine = console.log,
  }: VerifyOptions = {},
) {
  const state = loadMigrationProject(projectDir)
  const targetVersions = resolveLegacyVersions(state, { all, fromMigrationVersion })
  const blockEntries = getSelectedEntriesByBlock(state, targetVersions, 'verify')
  const legacySingleBlock = isLegacySingleBlockProject(state)

  if (targetVersions.length === 0) {
    renderLine('No legacy migration versions configured for verification.')
    return { verifiedVersions: [] }
  }

  const ttsxBinary = getLocalTtsxBinary(projectDir)
  for (const [blockKey, entries] of Object.entries(blockEntries)) {
    const block = state.blocks.find((entry) => entry.key === blockKey)
    if (!block || entries.length === 0) {
      continue
    }
    for (const entry of entries) {
      assertRuleHasNoTodos(
        projectDir,
        block,
        entry.fromVersion,
        state.config.currentMigrationVersion,
      )
    }
    const verifyScriptPath = path.join(
      getGeneratedDirForBlock(state.paths, block),
      'verify.ts',
    )
    if (!fs.existsSync(verifyScriptPath)) {
      const selectedVersionsForBlock = entries.map((entry) => entry.fromVersion)
      throw new Error(
        `Generated verify script is missing for ${block.blockName} (${selectedVersionsForBlock.join(', ')}). ` +
          `Run \`${formatScaffoldCommand(selectedVersionsForBlock)}\` first, then \`wp-typia migrate doctor --all\` if the workspace should already be scaffolded.`,
      )
    }

    const selectedVersionsForBlock = entries.map((entry) => entry.fromVersion)
    const filteredArgs = all
      ? ['--all']
      : ['--from-migration-version', selectedVersionsForBlock[0]]
    execFileSync(ttsxBinary, [verifyScriptPath, ...filteredArgs], {
      cwd: projectDir,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    })
    renderLine(
      legacySingleBlock
        ? `Verified migrations for ${selectedVersionsForBlock.join(', ')}`
        : `Verified ${block.blockName} migrations for ${selectedVersionsForBlock.join(', ')}`,
    )
  }

  return { verifiedVersions: targetVersions }
}

function recordWorkspaceMigrationTargetAlignment(
  projectDir: string,
  state: MigrationProjectState,
  recordCheck: (status: 'fail' | 'pass', label: string, detail: string) => void,
): void {
  // `migrate doctor` is still a synchronous maintenance command: it shares
  // sync migration project loading, generated artifact comparisons, and
  // execFileSync verification with the rest of migration maintenance.
  let invalidWorkspaceReason: string | null = null
  let workspace
  try {
    invalidWorkspaceReason = getInvalidWorkspaceProjectReason(projectDir)
    workspace = tryResolveWorkspaceProject(projectDir)
  } catch (error) {
    recordCheck(
      'fail',
      'Workspace migration targets',
      error instanceof Error ? error.message : String(error),
    )
    return
  }
  if (!workspace) {
    if (invalidWorkspaceReason) {
      recordCheck(
        'fail',
        'Workspace migration targets',
        invalidWorkspaceReason,
      )
    }
    return
  }

  try {
    // Maintenance verification is intentionally synchronous so it can compare
    // migration state against a single inventory snapshot.
    const inventory = readWorkspaceInventory(workspace.projectDir)
    const expectedTargets = inventory.blocks.map(
      (block) => `${workspace.workspace.namespace}/${block.slug}`,
    )
    const configuredTargets = state.blocks.map((block) => block.blockName)
    const expectedTargetSet = new Set(expectedTargets)
    const configuredTargetSet = new Set(configuredTargets)
    const missingTargets = expectedTargets.filter(
      (target) => !configuredTargetSet.has(target),
    )
    const staleTargets = configuredTargets.filter(
      (target) => !expectedTargetSet.has(target),
    )

    recordCheck(
      missingTargets.length === 0 && staleTargets.length === 0 ? 'pass' : 'fail',
      'Workspace migration targets',
      missingTargets.length === 0 && staleTargets.length === 0
        ? `${expectedTargets.length} workspace block target(s) align with migration config`
        : [
            missingTargets.length > 0
              ? `Missing from migration config: ${missingTargets.join(', ')}`
              : null,
            staleTargets.length > 0
              ? `Not present in scripts/block-config.ts: ${staleTargets.join(', ')}`
              : null,
          ]
            .filter((detail): detail is string => typeof detail === 'string')
            .join('; '),
    )
  } catch (error) {
    recordCheck(
      'fail',
      'Workspace migration targets',
      error instanceof Error ? error.message : String(error),
    )
  }
}

/**
 * Validate the migration workspace without mutating files.
 *
 * @param projectDir Absolute or relative project directory containing the migration workspace.
 * @param options Doctor scope and console rendering options.
 * @returns Structured doctor check results for the selected legacy versions.
 */
export function doctorProjectMigrations(
  projectDir: string,
  {
    all = false,
    fromMigrationVersion,
    renderLine = console.log,
  }: VerifyOptions = {},
) {
  const checks: Array<{ detail: string; label: string; status: 'fail' | 'pass' }> = []
  const recordCheck = (
    status: 'fail' | 'pass',
    label: string,
    detail: string,
  ) => {
    checks.push({ detail, label, status })
    renderLine(`${status === 'pass' ? 'PASS' : 'FAIL'} ${label}: ${detail}`)
  }

  let state
  try {
    state = loadMigrationProject(projectDir)
    const legacySingleBlock = isLegacySingleBlockProject(state)
    recordCheck(
      'pass',
      'Migration config',
      legacySingleBlock
        ? `Loaded ${state.blocks[0]?.blockName} @ ${state.config.currentMigrationVersion}`
        : `Loaded ${state.blocks.length} block target(s) @ ${state.config.currentMigrationVersion}`,
    )
  } catch (error) {
    recordCheck(
      'fail',
      'Migration config',
      error instanceof Error ? error.message : String(error),
    )
    throw new Error('Migration doctor failed.')
  }

  const targetVersions = resolveLegacyVersions(state, { all, fromMigrationVersion })
  const legacySingleBlock = isLegacySingleBlockProject(state)
  const snapshotVersions = new Set(
    targetVersions.length > 0
      ? [state.config.currentMigrationVersion, ...targetVersions]
      : state.config.supportedMigrationVersions,
  )

  recordWorkspaceMigrationTargetAlignment(projectDir, state, recordCheck)

  for (const version of snapshotVersions) {
    for (const block of state.blocks) {
      const snapshotRoot = getSnapshotRoot(projectDir, block, version)
      const blockJsonPath = getSnapshotBlockJsonPath(projectDir, block, version)
      const manifestPath = getSnapshotManifestPath(projectDir, block, version)
      const savePath = getSnapshotSavePath(projectDir, block, version)
      const hasSnapshot = fs.existsSync(snapshotRoot)
      const snapshotIsOptional =
        !hasSnapshot && isSnapshotOptionalForBlockVersion(state, block, version)

      recordCheck(
        hasSnapshot || snapshotIsOptional ? 'pass' : 'fail',
        legacySingleBlock ? `Snapshot ${version}` : `Snapshot ${block.blockName} @ ${version}`,
        hasSnapshot
          ? path.relative(projectDir, snapshotRoot)
          : 'Not present for this version',
      )

      if (!hasSnapshot) {
        continue
      }

      for (const targetPath of [blockJsonPath, manifestPath, savePath]) {
        recordCheck(
          fs.existsSync(targetPath) ? 'pass' : 'fail',
          legacySingleBlock
            ? `Snapshot file ${version}`
            : `Snapshot file ${block.blockName} @ ${version}`,
          fs.existsSync(targetPath)
            ? path.relative(projectDir, targetPath)
            : `Missing ${path.relative(projectDir, targetPath)}`,
        )
      }
    }
  }

  try {
    const generatedEntries = collectGeneratedMigrationEntries(state)
    const expectedGeneratedFiles = new Map<string, string>()
    for (const block of state.blocks) {
      const blockGeneratedEntries = generatedEntries.filter(
        ({ entry }) => entry.block.key === block.key,
      )
      const entries = blockGeneratedEntries.map(({ entry }) => entry)
      const generatedDir = getGeneratedDirForBlock(state.paths, block)
      expectedGeneratedFiles.set(
        path.join(generatedDir, 'registry.ts'),
        renderMigrationRegistryFile(state, block.key, blockGeneratedEntries),
      )
      expectedGeneratedFiles.set(
        path.join(generatedDir, 'deprecated.ts'),
        renderGeneratedDeprecatedFile(state, block.key, entries),
      )
      expectedGeneratedFiles.set(
        path.join(generatedDir, 'verify.ts'),
        renderVerifyFile(state, block.key, entries),
      )
      expectedGeneratedFiles.set(
        path.join(generatedDir, 'fuzz.ts'),
        renderFuzzFile(state, block.key, blockGeneratedEntries),
      )
    }
    expectedGeneratedFiles.set(
      path.join(state.paths.generatedDir, 'index.ts'),
      renderGeneratedMigrationIndexFile(state, generatedEntries.map(({ entry }) => entry)),
    )
    expectedGeneratedFiles.set(
      path.join(projectDir, ROOT_PHP_MIGRATION_REGISTRY),
      renderPhpMigrationRegistryFile(
        state,
        generatedEntries.map(({ entry }) => entry),
      ),
    )

    for (const [filePath, expectedSource] of expectedGeneratedFiles) {
      const inSync =
        fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === expectedSource
      recordCheck(
        inSync ? 'pass' : 'fail',
        `Generated ${path.relative(projectDir, filePath)}`,
        inSync
          ? 'In sync'
          : 'Run `wp-typia migrate scaffold --from-migration-version <label>` or regenerate artifacts',
      )
    }
  } catch (error) {
    recordCheck(
      'fail',
      'Generated artifacts',
      error instanceof Error ? error.message : String(error),
    )
  }

  for (const version of targetVersions) {
    for (const block of state.blocks) {
      if (!hasSnapshotForVersion(state, block, version)) {
        recordCheck(
          'pass',
          `Snapshot coverage ${block.blockName} @ ${version}`,
          'Target not present for this version',
        )
        continue
      }
      const rulePath = getRuleFilePath(
        state.paths,
        block,
        version,
        state.config.currentMigrationVersion,
      )
      const fixturePath = getFixtureFilePath(
        state.paths,
        block,
        version,
        state.config.currentMigrationVersion,
      )

      recordCheck(
        fs.existsSync(rulePath) ? 'pass' : 'fail',
        legacySingleBlock ? `Rule ${version}` : `Rule ${block.blockName} @ ${version}`,
        fs.existsSync(rulePath)
          ? path.relative(projectDir, rulePath)
          : `Missing ${path.relative(projectDir, rulePath)}`,
      )
      recordCheck(
        fs.existsSync(fixturePath) ? 'pass' : 'fail',
        legacySingleBlock ? `Fixture ${version}` : `Fixture ${block.blockName} @ ${version}`,
        fs.existsSync(fixturePath)
          ? path.relative(projectDir, fixturePath)
          : `Missing ${path.relative(projectDir, fixturePath)}`,
      )

      if (!fs.existsSync(rulePath) || !fs.existsSync(fixturePath)) {
        continue
      }

      try {
        assertRuleHasNoTodos(
          projectDir,
          block,
          version,
          state.config.currentMigrationVersion,
        )
        recordCheck(
          'pass',
          legacySingleBlock
            ? `Rule TODOs ${version}`
            : `Rule TODOs ${block.blockName} @ ${version}`,
          'No TODO MIGRATION markers remain',
        )
      } catch (error) {
        recordCheck(
          'fail',
          legacySingleBlock
            ? `Rule TODOs ${version}`
            : `Rule TODOs ${block.blockName} @ ${version}`,
          error instanceof Error ? error.message : String(error),
        )
      }

      try {
        const ruleMetadata = readRuleMetadata(rulePath)
        recordCheck(
          ruleMetadata.unresolved.length === 0 ? 'pass' : 'fail',
          legacySingleBlock
            ? `Rule unresolved ${version}`
            : `Rule unresolved ${block.blockName} @ ${version}`,
          ruleMetadata.unresolved.length === 0
            ? 'No unresolved entries remain'
            : ruleMetadata.unresolved.join(', '),
        )
      } catch (error) {
        recordCheck(
          'fail',
          legacySingleBlock
            ? `Rule unresolved ${version}`
            : `Rule unresolved ${block.blockName} @ ${version}`,
          error instanceof Error ? error.message : String(error),
        )
      }

      try {
        const fixtureDocument = readJson<{ cases?: Array<{ name?: string }> }>(
          fixturePath,
        )
        recordCheck(
          Array.isArray(fixtureDocument.cases) && fixtureDocument.cases.length > 0
            ? 'pass'
            : 'fail',
          legacySingleBlock
            ? `Fixture parse ${version}`
            : `Fixture parse ${block.blockName} @ ${version}`,
          Array.isArray(fixtureDocument.cases) && fixtureDocument.cases.length > 0
            ? `${fixtureDocument.cases.length} case(s)`
            : 'Fixture document has no cases',
        )

        const diff = createMigrationDiff(
          state,
          block,
          version,
          state.config.currentMigrationVersion,
        )
        const expectedFixture = createEdgeFixtureDocument(
          projectDir,
          block,
          version,
          state.config.currentMigrationVersion,
          diff,
        )
        const actualCaseNames = new Set(
          (fixtureDocument.cases ?? []).map((fixtureCase) => fixtureCase.name),
        )
        const missingCases = expectedFixture.cases
          .map((fixtureCase) => fixtureCase.name)
          .filter((name) => !actualCaseNames.has(name))
        recordCheck(
          missingCases.length === 0 ? 'pass' : 'fail',
          legacySingleBlock
            ? `Fixture coverage ${version}`
            : `Fixture coverage ${block.blockName} @ ${version}`,
          missingCases.length === 0
            ? 'All expected fixture cases are present'
            : `Missing ${missingCases.join(', ')}`,
        )

        recordCheck(
          'pass',
          legacySingleBlock
            ? `Risk summary ${version}`
            : `Risk summary ${block.blockName} @ ${version}`,
          formatMigrationRiskSummary(createMigrationRiskSummary(diff)),
        )
      } catch (error) {
        recordCheck(
          'fail',
          legacySingleBlock
            ? `Fixture parse ${version}`
            : `Fixture parse ${block.blockName} @ ${version}`,
          error instanceof Error ? error.message : String(error),
        )
      }
    }
  }

  const failedChecks = checks.filter((check) => check.status === 'fail')
  renderLine(
    `${failedChecks.length === 0 ? 'PASS' : 'FAIL'} Migration doctor summary: ${checks.length - failedChecks.length}/${checks.length} checks passed`,
  )

  if (failedChecks.length > 0) {
    throw new Error('Migration doctor failed.')
  }

  return {
    checkedVersions: targetVersions,
    checks,
  }
}
