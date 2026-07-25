import fs from 'node:fs';
import path from 'node:path';

import { createReadlinePrompt } from '../cli/cli-prompt.js';
import {
  CommandRenderOptions,
  DiffLikeOptions,
  formatMigrationHelpText,
  parseMigrationArgs,
  parseNonNegativeInteger,
  parsePositiveInteger,
  WizardOptions,
} from './migration-command-surface.js';
import { formatRunScript } from '../shared/package-managers.js';
import {
	SNAPSHOT_DIR,
} from './migration-constants.js';
import { createMigrationDiff } from './migration-diff.js';
import { ensureEdgeFixtureFile } from './migration-fixtures.js';
import {
	regenerateGeneratedArtifacts,
} from './migration-generated-artifacts.js';
import {
  assertDistinctMigrationEdge,
  createMigrationPlanNextSteps,
  createMissingProjectSnapshotMessage,
  formatEdgeCommand,
  hasSnapshotForVersion,
  listPreviewableLegacyVersions,
  resolveLegacyVersions,
} from './migration-planning.js';
import {
  assertNoLegacySemverMigrationWorkspace,
  discoverMigrationInitLayout,
  ensureAdvancedMigrationProject,
  ensureMigrationDirectories,
  getProjectPaths,
  getRuleFilePath,
  getSnapshotBlockJsonPath,
  getSnapshotManifestPath,
  getSnapshotRoot,
  getSnapshotSavePath,
  loadMigrationProject,
  writeInitialMigrationScaffold,
  writeMigrationConfig,
} from './migration-project.js';
import {
  formatDiffReport,
  renderMigrationRuleFile,
} from './migration-render.js';
import {
  createMigrationRiskSummary,
  formatMigrationRiskSummary,
} from './migration-risk.js';
import {
  assertMigrationVersionLabel,
  compareMigrationVersionLabels,
  copyFile,
  detectPackageManagerId,
  isInteractiveTerminal,
  readJson,
  resolveTargetMigrationVersion,
  runProjectScriptIfPresent,
  sanitizeSaveSnapshotSource,
  sanitizeSnapshotBlockJson,
} from './migration-utils.js';
import {
  doctorProjectMigrations,
  fixturesProjectMigrations,
  fuzzProjectMigrations,
  verifyProjectMigrations,
} from './migration-maintenance.js';
import type {
  MigrationBlockConfig,
  JsonObject,
  ParsedMigrationArgs,
  RenderLine,
} from './migration-types.js';

type MigrationPlanBlockSummary = {
  blockName: string;
  diff: ReturnType<typeof createMigrationDiff>;
  riskSummary: ReturnType<typeof createMigrationRiskSummary>;
};

type MigrationPlanSummary = {
  availableLegacyVersions: string[];
  currentMigrationVersion: string;
  fromMigrationVersion: string;
  includedBlocks: string[];
  nextSteps: string[];
  skippedBlocks: string[];
  summaries: MigrationPlanBlockSummary[];
  targetMigrationVersion: string;
};
export { formatMigrationHelpText, parseMigrationArgs };

export { formatDiffReport };

/**
 * Dispatch a parsed migration command to the matching runtime workflow.
 *
 * Most commands execute synchronously and preserve direct throw semantics for
 * existing callers. The interactive `wizard` command returns a promise because
 * it waits for prompt selection before running the shared read-only planner.
 *
 * @param command Parsed migration command and flags.
 * @param cwd Project directory to operate on.
 * @param options Optional prompt/render hooks for testable and interactive execution.
 * @returns The command result, or a promise when the selected command is interactive.
 */
export function runMigrationCommand(
	command: ParsedMigrationArgs,
	cwd: string,
	{ prompt, renderLine = console.log as RenderLine }: CommandRenderOptions = {},
) {
  switch (command.command) {
    case 'init':
      if (!command.flags.currentMigrationVersion) {
        throw new Error(
          '`migrate init` requires --current-migration-version <label>.',
        );
      }
      return initProjectMigrations(cwd, command.flags.currentMigrationVersion, {
        renderLine,
      });
    case 'snapshot':
      if (!command.flags.migrationVersion) {
        throw new Error(
          '`migrate snapshot` requires --migration-version <label>.',
        );
      }
      return snapshotProjectVersion(cwd, command.flags.migrationVersion, {
        renderLine,
      });
    case 'plan':
      if (!command.flags.fromMigrationVersion) {
        throw new Error(
          '`migrate plan` requires --from-migration-version <label>.',
        );
      }
      return planProjectMigrations(cwd, {
        fromMigrationVersion: command.flags.fromMigrationVersion,
        renderLine,
        toMigrationVersion: command.flags.toMigrationVersion ?? 'current',
      });
    case 'wizard':
      return wizardProjectMigrations(cwd, {
        prompt,
        renderLine,
      });
    case 'diff':
      if (!command.flags.fromMigrationVersion) {
        throw new Error(
          '`migrate diff` requires --from-migration-version <label>.',
        );
      }
      return diffProjectMigrations(cwd, {
        fromMigrationVersion: command.flags.fromMigrationVersion,
        renderLine,
        toMigrationVersion: command.flags.toMigrationVersion ?? 'current',
      });
    case 'scaffold':
      if (!command.flags.fromMigrationVersion) {
        throw new Error(
          '`migrate scaffold` requires --from-migration-version <label>.',
        );
      }
      return scaffoldProjectMigrations(cwd, {
        fromMigrationVersion: command.flags.fromMigrationVersion,
        renderLine,
        toMigrationVersion: command.flags.toMigrationVersion ?? 'current',
      });
    case 'verify':
      return verifyProjectMigrations(cwd, {
        all: command.flags.all,
        fromMigrationVersion: command.flags.fromMigrationVersion,
        renderLine,
      });
    case 'doctor':
      return doctorProjectMigrations(cwd, {
        all: command.flags.all,
        fromMigrationVersion: command.flags.fromMigrationVersion,
        renderLine,
      });
    case 'fixtures':
      return fixturesProjectMigrations(cwd, {
        all: command.flags.all,
        force: command.flags.force,
        fromMigrationVersion: command.flags.fromMigrationVersion,
        renderLine,
        toMigrationVersion: command.flags.toMigrationVersion ?? 'current',
      });
    case 'fuzz':
      return fuzzProjectMigrations(cwd, {
        all: command.flags.all,
        fromMigrationVersion: command.flags.fromMigrationVersion,
        iterations: parsePositiveInteger(command.flags.iterations, 'iterations') ?? 25,
        renderLine,
        seed: parseNonNegativeInteger(command.flags.seed, 'seed'),
      });
    default:
      throw new Error(formatMigrationHelpText());
  }
}

/**
 * Preview one migration edge without scaffolding rules, fixtures, or generated files.
 *
 * @param projectDir Absolute or relative project directory containing the migration workspace.
 * @param options Selected source/target versions plus optional line rendering overrides.
 * @returns A structured summary of the selected edge, included/skipped block targets, and next steps.
 */
export function planProjectMigrations(
	projectDir: string,
	{ fromMigrationVersion, renderLine = console.log as RenderLine, toMigrationVersion = 'current' }: DiffLikeOptions = {},
): MigrationPlanSummary {
  if (!fromMigrationVersion) {
    throw new Error(
      '`migrate plan` requires --from-migration-version <label>.',
    );
  }

  const state = loadMigrationProject(projectDir, { allowSyncTypes: false });
  const availableLegacyVersions = listPreviewableLegacyVersions(state).sort(compareMigrationVersionLabels).reverse();
  const targetMigrationVersion = resolveTargetMigrationVersion(
    state.config.currentMigrationVersion,
    toMigrationVersion,
  );
  assertDistinctMigrationEdge(
    'plan',
    fromMigrationVersion,
    targetMigrationVersion,
  );
  resolveLegacyVersions(state, {
    fromMigrationVersion,
    availableVersions: availableLegacyVersions,
  });

  const includedBlocks = state.blocks.filter((block) =>
    hasSnapshotForVersion(state, block, fromMigrationVersion),
  );
  if (includedBlocks.length === 0) {
    throw new Error(
      createMissingProjectSnapshotMessage(state, fromMigrationVersion),
    );
  }
  const skippedBlocks = state.blocks
		.filter((block) => !hasSnapshotForVersion(state, block, fromMigrationVersion))
		.map((block) => block.blockName);
  const summaries = includedBlocks.map((block) => {
    const diff = createMigrationDiff(
      state,
      block,
      fromMigrationVersion,
      targetMigrationVersion,
    );
    return {
      blockName: block.blockName,
      diff,
      riskSummary: createMigrationRiskSummary(diff),
    };
  });
  const nextSteps = createMigrationPlanNextSteps(
    fromMigrationVersion,
    targetMigrationVersion,
    state.config.currentMigrationVersion,
  );

  renderLine(
    `Current migration version: ${state.config.currentMigrationVersion}`,
  );
  renderLine(
    `Available legacy migration versions: ${availableLegacyVersions.length > 0 ? availableLegacyVersions.join(', ') : 'None configured'}`,
  );
  renderLine(
    `Selected migration edge: ${fromMigrationVersion} -> ${targetMigrationVersion}`,
  );
  renderLine(
    `Included block targets: ${includedBlocks.map((block) => block.blockName).join(', ')}`,
  );
  renderLine(
    `Skipped block targets: ${skippedBlocks.length > 0 ? skippedBlocks.join(', ') : 'None'}`,
  );

  for (const summary of summaries) {
    renderLine(`Block: ${summary.blockName}`);
    renderLine(formatDiffReport(summary.diff, { includeRiskSummary: false }));
    renderLine(
      `Risk summary: ${formatMigrationRiskSummary(summary.riskSummary)}`,
    );
  }

  renderLine('Next steps:');
  for (const command of nextSteps) {
    renderLine(`  ${command}`);
  }
  renderLine(
		`Optional after editing rules: ${formatEdgeCommand(
			'fixtures',
			fromMigrationVersion,
			targetMigrationVersion,
			state.config.currentMigrationVersion,
		)} --force`,
	);

  return {
    availableLegacyVersions,
    currentMigrationVersion: state.config.currentMigrationVersion,
    fromMigrationVersion,
    includedBlocks: includedBlocks.map((block) => block.blockName),
    nextSteps,
    skippedBlocks,
    summaries,
    targetMigrationVersion,
  };
}

/**
 * Interactively choose one legacy version to preview, then run the same read-only planner.
 *
 * @param projectDir Absolute or relative project directory containing the migration workspace.
 * @param options Interactive prompt and rendering settings. Throws when no TTY is available.
 * @returns The planned migration summary, or `{ cancelled: true }` when the user exits the wizard.
 */
export async function wizardProjectMigrations(
	projectDir: string,
	{
		isInteractive = isInteractiveTerminal(),
		prompt,
		renderLine = console.log as RenderLine,
	}: WizardOptions = {},
) {
  if (!isInteractive) {
    throw new Error(
			'`migrate wizard` requires an interactive terminal. ' +
				'Use `wp-typia migrate plan --from-migration-version <label>` for a read-only preview or run the direct migration commands with explicit flags.',
		);
  }

  const state = loadMigrationProject(projectDir, { allowSyncTypes: false });
  const availableLegacyVersions = listPreviewableLegacyVersions(state).sort(compareMigrationVersionLabels).reverse();
  if (availableLegacyVersions.length === 0) {
    throw new Error(
			'No legacy migration versions are configured yet. ' +
				'Capture an older schema release with `wp-typia migrate snapshot --migration-version <label>` first, then rerun `wp-typia migrate wizard`.',
		);
  }

  const activePrompt = prompt ?? createReadlinePrompt();
  const createdPrompt = !prompt;
  try {
    const selectedVersion = await activePrompt.select(
			'Choose a legacy version to preview',
			[
				...availableLegacyVersions.map((version) => ({
					hint: `Preview ${version} -> ${state.config.currentMigrationVersion}`,
					label: version,
					value: version,
				})),
				{
					hint: 'Exit without previewing a migration edge',
					label: 'Cancel',
					value: 'cancel',
				},
			],
			1,
		);

    if (selectedVersion === 'cancel') {
      renderLine('Cancelled migration planning.');
      return { cancelled: true as const };
    }

    return planProjectMigrations(projectDir, {
      fromMigrationVersion: selectedVersion,
      renderLine,
    });
  } finally {
    if (createdPrompt) {
      activePrompt.close();
    }
  }
}

/**
 * Initializes migration scaffolding for a detected single-block or multi-block project layout.
 *
 * @param projectDir Absolute or relative project directory containing the migration workspace.
 * @param currentMigrationVersion Initial migration version label to seed, such as `v1`.
 * @param options Console rendering options used to report retrofit detection and initialization output.
 * @returns The loaded migration project state after the config, snapshots, and generated files are written.
 * @throws Error When the project layout is unsupported or the migration version label is invalid.
 */
export function initProjectMigrations(
	projectDir: string,
	currentMigrationVersion: string,
	{ renderLine = console.log as RenderLine }: CommandRenderOptions = {},
) {
  assertMigrationVersionLabel(
    currentMigrationVersion,
    'current migration version',
  );
  assertNoLegacySemverMigrationWorkspace(projectDir);
  const discoveredLayout = discoverMigrationInitLayout(projectDir);
  const configuredBlocks = discoveredLayout.mode === 'multi'
    ? discoveredLayout.blocks
    : undefined;
  ensureAdvancedMigrationProject(projectDir, configuredBlocks);
  ensureMigrationDirectories(projectDir, configuredBlocks);
  writeMigrationConfig(projectDir, {
		blockName:
			discoveredLayout.mode === 'single'
				? discoveredLayout.block.blockName
				: undefined,
		blocks: configuredBlocks,
		currentMigrationVersion,
		snapshotDir: SNAPSHOT_DIR.replace(/\\/g, '/'),
		supportedMigrationVersions: [currentMigrationVersion],
	});

  writeInitialMigrationScaffold(
    projectDir,
    currentMigrationVersion,
    configuredBlocks,
  );
  snapshotProjectVersion(projectDir, currentMigrationVersion, {
    renderLine,
    skipConfigUpdate: true,
  });
  regenerateGeneratedArtifacts(projectDir);

  if (discoveredLayout.mode === 'multi') {
    renderLine(
      `Detected multi-block migration retrofit (${discoveredLayout.blocks.length} targets): ${discoveredLayout.blocks.map((block) => block.blockName).join(', ')}`,
    );
  } else {
    renderLine(
      `Detected single-block migration retrofit: ${discoveredLayout.block.blockName}`,
    );
  }
  renderLine('Wrote src/migrations/config.ts');
  renderLine(
		`Initialized migrations for ${
			discoveredLayout.mode === 'multi'
				? discoveredLayout.blocks.map((block) => block.blockName).join(', ')
				: discoveredLayout.block.blockName
		} at migration version ${currentMigrationVersion}`,
	);
  return loadMigrationProject(projectDir);
}

/**
 * Captures the current project state as a named migration snapshot and refreshes generated artifacts.
 *
 * @param projectDir Absolute or relative project directory containing the migration workspace.
 * @param migrationVersion Migration version label to snapshot, such as `v2`.
 * @param options Console rendering options and snapshot side-effect flags.
 * @returns The loaded migration project state after the snapshot files and registry outputs are refreshed.
 * @throws Error When the label is invalid, the project is not migration-capable, or `sync-types` fails.
 */
export function snapshotProjectVersion(
	projectDir: string,
	migrationVersion: string,
	{
		renderLine = console.log as RenderLine,
		skipConfigUpdate = false,
		skipSyncTypes = false,
	}: CommandRenderOptions & { skipConfigUpdate?: boolean; skipSyncTypes?: boolean } = {},
) {
  ensureAdvancedMigrationProject(projectDir);
  assertMigrationVersionLabel(migrationVersion, 'migration version');
  if (!skipSyncTypes) {
    try {
      runProjectScriptIfPresent(projectDir, 'sync-types');
    } catch (error) {
      const syncTypesCommand = formatRunScript(
        detectPackageManagerId(projectDir),
        'sync-types',
      );
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
				`Could not capture migration snapshot ${migrationVersion} because \`${syncTypesCommand}\` failed first. ` +
					`Install project dependencies if needed, rerun \`${syncTypesCommand}\` in the project root to inspect the underlying error, ` +
					`then retry \`wp-typia migrate snapshot --migration-version ${migrationVersion}\`.\n` +
					`Original error: ${reason}`,
			);
    }
  }

  const state = loadMigrationProject(projectDir, {
    allowMissingConfig: skipConfigUpdate,
  });
  for (const block of state.blocks) {
    const snapshotRoot = getSnapshotRoot(projectDir, block, migrationVersion);
    fs.mkdirSync(snapshotRoot, { recursive: true });

    fs.writeFileSync(
			getSnapshotBlockJsonPath(projectDir, block, migrationVersion),
			`${JSON.stringify(
				sanitizeSnapshotBlockJson(readJson<JsonObject>(path.join(projectDir, block.blockJsonFile))),
				null,
				'\t',
			)}\n`,
			'utf8',
		);
    copyFile(
      path.join(projectDir, block.manifestFile),
      getSnapshotManifestPath(projectDir, block, migrationVersion),
    );
    fs.writeFileSync(
      getSnapshotSavePath(projectDir, block, migrationVersion),
      sanitizeSaveSnapshotSource(
        fs.readFileSync(path.join(projectDir, block.saveFile), 'utf8'),
      ),
      'utf8',
    );
  }

  if (!skipConfigUpdate) {
    const nextSupported = [
			...new Set([...state.config.supportedMigrationVersions, migrationVersion]),
		].sort(compareMigrationVersionLabels);
    writeMigrationConfig(projectDir, {
      ...state.config,
      currentMigrationVersion: migrationVersion,
      supportedMigrationVersions: nextSupported,
    });
  }

  regenerateGeneratedArtifacts(projectDir);
  renderLine(`Snapshot stored for migration version ${migrationVersion}`);
  return loadMigrationProject(projectDir);
}

/**
 * Computes and renders migration diffs for a selected legacy-to-target edge.
 *
 * @param projectDir Absolute or relative project directory containing the migration workspace.
 * @param options Selected source and target migration versions plus optional line rendering overrides.
 * @returns A single diff for single-block workspaces, or an array of per-block diffs for multi-block workspaces.
 * @throws Error When `fromMigrationVersion` is missing or no eligible snapshots exist for the selected edge.
 */
export function diffProjectMigrations(
	projectDir: string,
	{
		fromMigrationVersion,
		toMigrationVersion = 'current',
		renderLine = console.log as RenderLine,
	}: DiffLikeOptions = {},
) {
  if (!fromMigrationVersion) {
    throw new Error(
      '`migrate diff` requires --from-migration-version <label>.',
    );
  }
  const state = loadMigrationProject(projectDir);
  const targetMigrationVersion = resolveTargetMigrationVersion(
    state.config.currentMigrationVersion,
    toMigrationVersion,
  );
  assertDistinctMigrationEdge(
    'diff',
    fromMigrationVersion,
    targetMigrationVersion,
  );
  const diffs = state.blocks
		.filter((block) => hasSnapshotForVersion(state, block, fromMigrationVersion))
		.map((block) => ({
			block,
			diff: createMigrationDiff(state, block, fromMigrationVersion, targetMigrationVersion),
		}));

  if (diffs.length === 0) {
    throw new Error(
      createMissingProjectSnapshotMessage(state, fromMigrationVersion),
    );
  }

  for (const { block, diff } of diffs) {
    renderLine(`Block: ${block.blockName}`);
    renderLine(formatDiffReport(diff));
  }

  return diffs.length === 1 ? diffs[0].diff : diffs;
}

/**
 * Scaffolds migration rule and fixture files for a selected legacy-to-target edge.
 *
 * @param projectDir Absolute or relative project directory containing the migration workspace.
 * @param options Selected source and target migration versions plus optional line rendering overrides.
 * @returns A single scaffold result for single-block workspaces, or a grouped result for multi-block workspaces.
 * @throws Error When `fromMigrationVersion` is missing or no eligible snapshots exist for the selected edge.
 */
export function scaffoldProjectMigrations(
	projectDir: string,
	{
		fromMigrationVersion,
		toMigrationVersion = 'current',
		renderLine = console.log as RenderLine,
	}: DiffLikeOptions = {},
) {
  if (!fromMigrationVersion) {
    throw new Error(
      '`migrate scaffold` requires --from-migration-version <label>.',
    );
  }

  ensureMigrationDirectories(projectDir);
  const state = loadMigrationProject(projectDir);
  const targetMigrationVersion = resolveTargetMigrationVersion(
    state.config.currentMigrationVersion,
    toMigrationVersion,
  );
  assertDistinctMigrationEdge(
    'scaffold',
    fromMigrationVersion,
    targetMigrationVersion,
  );
  const paths = getProjectPaths(projectDir);
  const scaffolded: Array<{ blockName: string; diff: ReturnType<typeof createMigrationDiff>; rulePath: string }> =
		[];
  let eligibleBlocks = 0;

  for (const block of state.blocks) {
    if (!hasSnapshotForVersion(state, block, fromMigrationVersion)) {
      renderLine(
        `Skipped ${block.blockName}: no snapshot for ${fromMigrationVersion}`,
      );
      continue;
    }
    eligibleBlocks += 1;
    const diff = createMigrationDiff(
      state,
      block,
      fromMigrationVersion,
      targetMigrationVersion,
    );
    const rulePath = getRuleFilePath(
      paths,
      block,
      fromMigrationVersion,
      targetMigrationVersion,
    );

    if (!fs.existsSync(rulePath)) {
      fs.mkdirSync(path.dirname(rulePath), { recursive: true });
      fs.writeFileSync(
        rulePath,
        renderMigrationRuleFile({
          block,
          currentAttributes: block.currentManifest.attributes ?? {},
          currentTypeName: block.currentManifest.sourceType,
          diff,
          fromVersion: fromMigrationVersion,
          projectDir,
          rulePath,
          targetVersion: targetMigrationVersion,
        }),
        'utf8',
      );
    }

    ensureEdgeFixtureFile(
      projectDir,
      block,
      fromMigrationVersion,
      targetMigrationVersion,
      diff,
    );
    scaffolded.push({ blockName: block.blockName, diff, rulePath });
  }
  regenerateGeneratedArtifacts(projectDir);

  for (const entry of scaffolded) {
    renderLine(`Block: ${entry.blockName}`);
    renderLine(formatDiffReport(entry.diff));
    renderLine(`Scaffolded ${path.relative(projectDir, entry.rulePath)}`);
  }

  if (eligibleBlocks === 0) {
    throw new Error(
      createMissingProjectSnapshotMessage(state, fromMigrationVersion),
    );
  }

  return scaffolded.length === 1 ? scaffolded[0] : { scaffolded };
}
export {
  doctorProjectMigrations,
  fixturesProjectMigrations,
  fuzzProjectMigrations,
  verifyProjectMigrations,
};

/**
 * Initialize migration scaffolding for one or more block targets.
 *
 * Writes the migration config, creates the initial scaffold files, snapshots
 * the current project state, and regenerates generated migration artifacts.
 *
 * @param projectDir Absolute or relative project directory containing the migration workspace.
 * @param currentMigrationVersion Initial migration version label to seed into the migration config.
 * @param blocks Block targets to register for migration-aware scaffolding.
 * @param options Console rendering options for initialization output.
 * @returns The loaded migration project state after initialization completes.
 */
export function seedProjectMigrations(
	projectDir: string,
	currentMigrationVersion: string,
	blocks: MigrationBlockConfig[],
	{ renderLine = console.log as RenderLine }: CommandRenderOptions = {},
) {
  ensureAdvancedMigrationProject(projectDir, blocks);
  assertMigrationVersionLabel(
    currentMigrationVersion,
    'current migration version',
  );
  ensureMigrationDirectories(projectDir, blocks);
  writeMigrationConfig(projectDir, {
    blocks,
    currentMigrationVersion,
    snapshotDir: SNAPSHOT_DIR.replace(/\\/g, '/'),
    supportedMigrationVersions: [currentMigrationVersion],
  });
  writeInitialMigrationScaffold(projectDir, currentMigrationVersion, blocks);
  snapshotProjectVersion(projectDir, currentMigrationVersion, {
    renderLine,
    skipConfigUpdate: true,
    skipSyncTypes: true,
  });
  regenerateGeneratedArtifacts(projectDir);
  renderLine(
    `Initialized migrations for ${blocks.map((block) => block.blockName).join(', ')} at migration version ${currentMigrationVersion}`,
  );
  return loadMigrationProject(projectDir);
}
