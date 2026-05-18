import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { createMigrationDiff } from './migration-diff.js'
import {
  ensureEdgeFixtureFile,
} from './migration-fixtures.js'
import {
  collectFixtureTargets,
  formatScaffoldCommand,
  getSelectedEntriesByBlock,
  isLegacySingleBlockProject,
  resolveLegacyVersions,
} from './migration-planning.js'
import {
  assertRuleHasNoTodos,
  getGeneratedDirForBlock,
  loadMigrationProject,
} from './migration-project.js'
import {
  getLocalTsxBinary,
  isInteractiveTerminal,
  resolveTargetMigrationVersion,
} from './migration-utils.js'
import type {
  FixturesOptions,
  FuzzOptions,
} from './migration-command-surface.js'

/**
 * Generate or refresh migration fixtures for one or more legacy edges.
 *
 * @param projectDir Absolute or relative project directory containing the migration workspace.
 * @param options Fixture generation scope and refresh options.
 * @returns Generated and skipped legacy versions.
 */
export function fixturesProjectMigrations(
  projectDir: string,
  {
    all = false,
    confirmOverwrite,
    force = false,
    fromMigrationVersion,
    isInteractive = isInteractiveTerminal(),
    renderLine = console.log,
    toMigrationVersion = 'current',
  }: FixturesOptions = {},
) {
  const state = loadMigrationProject(projectDir)
  const targetMigrationVersion = resolveTargetMigrationVersion(
    state.config.currentMigrationVersion,
    toMigrationVersion,
  )
  const targetVersions = resolveLegacyVersions(state, { all, fromMigrationVersion })

  if (targetVersions.length === 0) {
    renderLine('No legacy migration versions configured for fixture generation.')
    return { generatedVersions: [], skippedVersions: [] }
  }

  const generatedVersions: string[] = []
  const skippedVersions: string[] = []
  const fixtureTargets = collectFixtureTargets(
    state,
    targetVersions,
    targetMigrationVersion,
  )

  if (force) {
    const overwriteTargets = fixtureTargets.filter(({ fixturePath }) =>
      fs.existsSync(fixturePath),
    )
    if (isInteractive && overwriteTargets.length > 0) {
      const confirmed =
        confirmOverwrite?.(
          `About to overwrite ${overwriteTargets.length} existing migration fixture file(s). Continue?`,
        ) ??
        promptForConfirmation(
          `About to overwrite ${overwriteTargets.length} existing migration fixture file(s). Continue?`,
        )

      if (!confirmed) {
        renderLine(
          `Cancelled fixture refresh. Kept ${overwriteTargets.length} existing fixture file(s).`,
        )
        return {
          generatedVersions,
          skippedVersions: overwriteTargets.map(({ scopedLabel }) => scopedLabel),
        }
      }
    }
  }

  for (const { block, fixturePath, scopedLabel, version } of fixtureTargets) {
    const existed = fs.existsSync(fixturePath)
    const diff = createMigrationDiff(state, block, version, targetMigrationVersion)
    const result = ensureEdgeFixtureFile(
      projectDir,
      block,
      version,
      targetMigrationVersion,
      diff,
      { force },
    )
    if (result.written) {
      generatedVersions.push(scopedLabel)
      renderLine(
        `${existed ? 'Refreshed' : 'Generated'} fixture ${path.relative(projectDir, fixturePath)}`,
      )
    } else {
      skippedVersions.push(scopedLabel)
      renderLine(
        `Preserved existing fixture ${path.relative(projectDir, fixturePath)} (use --force to refresh)`,
      )
    }
  }

  return {
    generatedVersions,
    skippedVersions,
  }
}

/**
 * Run seeded migration fuzz verification against generated fuzz artifacts.
 *
 * @param projectDir Absolute or relative project directory containing the migration workspace.
 * @param options Fuzz scope, iteration count, seed, and console rendering options.
 * @returns Fuzzed legacy versions and the effective seed.
 */
export function fuzzProjectMigrations(
  projectDir: string,
  {
    all = false,
    fromMigrationVersion,
    iterations = 25,
    renderLine = console.log,
    seed,
  }: FuzzOptions = {},
) {
  const state = loadMigrationProject(projectDir)
  const targetVersions = resolveLegacyVersions(state, { all, fromMigrationVersion })
  const blockEntries = getSelectedEntriesByBlock(state, targetVersions, 'fuzz')
  const legacySingleBlock = isLegacySingleBlockProject(state)
  if (targetVersions.length === 0) {
    renderLine('No legacy migration versions configured for fuzzing.')
    return { fuzzedVersions: [], seed }
  }

  const tsxBinary = getLocalTsxBinary(projectDir)
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
    const fuzzScriptPath = path.join(
      getGeneratedDirForBlock(state.paths, block),
      'fuzz.ts',
    )
    if (!fs.existsSync(fuzzScriptPath)) {
      const selectedVersionsForBlock = entries.map((entry) => entry.fromVersion)
      throw new Error(
        `Generated fuzz script is missing for ${block.blockName} (${selectedVersionsForBlock.join(', ')}). ` +
          `Run \`${formatScaffoldCommand(selectedVersionsForBlock)}\` first, then \`wp-typia migrate doctor --all\` if the workspace should already be scaffolded.`,
      )
    }
    const selectedVersionsForBlock = entries.map((entry) => entry.fromVersion)
    const args = [
      fuzzScriptPath,
      ...(all ? ['--all'] : ['--from-migration-version', selectedVersionsForBlock[0]]),
      '--iterations',
      String(iterations),
      ...(seed === undefined ? [] : ['--seed', String(seed)]),
    ]
    execFileSync(tsxBinary, args, {
      cwd: projectDir,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    })
    renderLine(
      legacySingleBlock
        ? `Fuzzed migrations for ${selectedVersionsForBlock.join(', ')}`
        : `Fuzzed ${block.blockName} migrations for ${selectedVersionsForBlock.join(', ')}`,
    )
  }

  return { fuzzedVersions: targetVersions, seed }
}

function promptForConfirmation(message: string): boolean {
  process.stdout.write(`${message} [y/N]: `)

  const buffer = Buffer.alloc(1)
  let answer = ''

  while (true) {
    const bytesRead = fs.readSync(process.stdin.fd, buffer, 0, 1, null)
    if (bytesRead === 0) {
      break
    }

    const char = buffer.toString('utf8', 0, bytesRead)
    if (char === '\n' || char === '\r') {
      break
    }

    answer += char
  }

  const normalized = answer.trim().toLowerCase()
  return normalized === 'y' || normalized === 'yes'
}
