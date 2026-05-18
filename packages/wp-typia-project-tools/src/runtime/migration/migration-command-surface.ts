import type { ReadlinePrompt } from '../cli/cli-prompt.js'
import type { ParsedMigrationArgs, RenderLine } from './migration-types.js'

import { formatLegacyMigrationWorkspaceResetGuidance } from './migration-utils.js'

export type CommandRenderOptions = {
  prompt?: ReadlinePrompt
  renderLine?: RenderLine
}

export type DiffLikeOptions = {
  fromMigrationVersion?: string
  renderLine?: RenderLine
  toMigrationVersion?: string
}

export type VerifyOptions = {
  all?: boolean
  fromMigrationVersion?: string
  renderLine?: RenderLine
}

export type FixturesOptions = {
  all?: boolean
  confirmOverwrite?: ((message: string) => boolean) | undefined
  force?: boolean
  fromMigrationVersion?: string
  isInteractive?: boolean
  renderLine?: RenderLine
  toMigrationVersion?: string
}

export type FuzzOptions = {
  all?: boolean
  fromMigrationVersion?: string
  iterations?: number
  renderLine?: RenderLine
  seed?: number
}

export type WizardOptions = CommandRenderOptions & {
  isInteractive?: boolean
}

/**
 * Returns the formatted help text for migration CLI commands and flags.
 *
 * @returns Multi-line usage text for the `wp-typia migrate` command surface.
 */
export function formatMigrationHelpText(): string {
  return `Usage:
  wp-typia migrate init --current-migration-version <label>
  wp-typia migrate snapshot --migration-version <label>
  wp-typia migrate plan --from-migration-version <label> [--to-migration-version current]
  wp-typia migrate wizard
  wp-typia migrate diff --from-migration-version <label> [--to-migration-version current]
  wp-typia migrate scaffold --from-migration-version <label> [--to-migration-version current]
  wp-typia migrate verify [--from-migration-version <label>|--all]
  wp-typia migrate doctor [--from-migration-version <label>|--all]
  wp-typia migrate fixtures [--from-migration-version <label>|--all] [--to-migration-version current] [--force]
  wp-typia migrate fuzz [--from-migration-version <label>|--all] [--iterations <n>] [--seed <n>]

Notes:
  \`migrate init\` auto-detects supported single-block and \`src/blocks/*\` multi-block layouts.
  \`migrate init\` only retrofits migration support into projects that already match those layouts.
  A broader project-level \`wp-typia init\` path remains future work.
  Migration versions use strict schema labels like \`v1\`, \`v2\`, and \`v3\`.
  \`migrate wizard\` is TTY-only and helps you choose one legacy migration version to preview.
  \`migrate plan\` and \`migrate wizard\` are read-only previews; they do not scaffold rules or fixtures.
  --all runs across every configured legacy migration version and every configured block target.
  Existing fixture files are preserved and reported as skipped unless you pass \`--force\`.
  Use \`migrate fixtures --force\` as the explicit refresh path for generated fixture files.
  In TTY usage, \`migrate fixtures --force\` asks before overwriting existing fixture files.
  In non-interactive usage, \`migrate fixtures --force\` overwrites immediately for script compatibility.`
}

/**
 * Parses migration CLI arguments into a structured command payload.
 *
 * @param argv Command-line arguments that follow the `migrate` subcommand.
 * @returns Parsed migration command and normalized flags for runtime dispatch.
 * @throws Error When no arguments are provided, an unknown flag is encountered, or legacy semver flags are used.
 */
export function parseMigrationArgs(argv: string[]): ParsedMigrationArgs {
  const parsed: ParsedMigrationArgs = {
    command: undefined,
    flags: {
      all: false,
      currentMigrationVersion: undefined,
      force: false,
      fromMigrationVersion: undefined,
      iterations: undefined,
      migrationVersion: undefined,
      seed: undefined,
      toMigrationVersion: 'current',
    },
  }

  if (argv.length === 0) {
    throw new Error(formatMigrationHelpText())
  }

  parsed.command = argv[0]

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--') continue
    if (arg === '--all') {
      parsed.flags.all = true
      continue
    }
    if (arg === '--force') {
      parsed.flags.force = true
      continue
    }
    if (arg === '--current-migration-version') {
      parsed.flags.currentMigrationVersion = next
      index += 1
      continue
    }
    if (arg.startsWith('--current-migration-version=')) {
      parsed.flags.currentMigrationVersion = arg.split('=', 2)[1]
      continue
    }
    if (arg === '--from-migration-version') {
      parsed.flags.fromMigrationVersion = next
      index += 1
      continue
    }
    if (arg.startsWith('--from-migration-version=')) {
      parsed.flags.fromMigrationVersion = arg.split('=', 2)[1]
      continue
    }
    if (arg === '--iterations') {
      parsed.flags.iterations = next
      index += 1
      continue
    }
    if (arg.startsWith('--iterations=')) {
      parsed.flags.iterations = arg.split('=', 2)[1]
      continue
    }
    if (arg === '--seed') {
      parsed.flags.seed = next
      index += 1
      continue
    }
    if (arg.startsWith('--seed=')) {
      parsed.flags.seed = arg.split('=', 2)[1]
      continue
    }
    if (arg === '--to-migration-version') {
      parsed.flags.toMigrationVersion = next
      index += 1
      continue
    }
    if (arg.startsWith('--to-migration-version=')) {
      parsed.flags.toMigrationVersion = arg.split('=', 2)[1]
      continue
    }
    if (arg === '--migration-version') {
      parsed.flags.migrationVersion = next
      index += 1
      continue
    }
    if (arg.startsWith('--migration-version=')) {
      parsed.flags.migrationVersion = arg.split('=', 2)[1]
      continue
    }

    if (
      arg === '--current-version' ||
      arg.startsWith('--current-version=') ||
      arg === '--version' ||
      arg.startsWith('--version=') ||
      arg === '--from' ||
      arg.startsWith('--from=') ||
      arg === '--to' ||
      arg.startsWith('--to=')
    ) {
      throwLegacyMigrationFlagError(arg)
    }

    throw new Error(`Unknown migration flag: ${arg}`)
  }

  return parsed
}

/**
 * Parse an optional positive integer flag value.
 *
 * @param value Raw CLI flag value, or `undefined` when the flag was omitted.
 * @param label Human-readable flag label used in validation error messages.
 * @returns The parsed integer when provided, otherwise `undefined`.
 * @throws Error When the value is not a base-10 integer greater than zero.
 */
export function parsePositiveInteger(
  value: string | undefined,
  label: string,
): number | undefined {
  if (!value) {
    return undefined
  }

  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}. Expected a positive integer.`)
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${value}. Expected a positive integer.`)
  }

  return parsed
}

/**
 * Parse an optional non-negative integer flag value.
 *
 * @param value Raw CLI flag value, or `undefined` when the flag was omitted.
 * @param label Human-readable flag label used in validation error messages.
 * @returns The parsed integer when provided, otherwise `undefined`.
 * @throws Error When the value is not a base-10 integer greater than or equal to zero.
 */
export function parseNonNegativeInteger(
  value: string | undefined,
  label: string,
): number | undefined {
  if (!value) {
    return undefined
  }

  if (!/^\d+$/.test(value)) {
    throw new Error(
      `Invalid ${label}: ${value}. Expected a non-negative integer.`,
    )
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      `Invalid ${label}: ${value}. Expected a non-negative integer.`,
    )
  }

  return parsed
}

function throwLegacyMigrationFlagError(flag: string): never {
  const replacement =
    flag.startsWith('--current-version')
      ? '--current-migration-version'
      : flag.startsWith('--version')
        ? '--migration-version'
        : flag.startsWith('--from')
          ? '--from-migration-version'
          : '--to-migration-version'
  throw new Error(
    `Legacy migration flag \`${flag}\` is no longer supported. Use \`${replacement}\` with schema labels like \`v1\` and \`v2\` instead. ` +
      formatLegacyMigrationWorkspaceResetGuidance(),
  )
}
