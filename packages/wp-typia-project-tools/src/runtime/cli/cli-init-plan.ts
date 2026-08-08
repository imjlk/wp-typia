import fs from 'node:fs';
import path from 'node:path';

import { analyzeSourceTypes } from '@wp-typia/block-runtime/metadata-parser';
import ts from '@typescript/typescript6';

import { discoverMigrationInitLayout } from '../migration/migration-project.js';
import type { MigrationBlockConfig } from '../migration/migration-types.js';
import {
  formatPackageExecCommand,
  formatRunScript,
  type PackageManagerId,
} from '../shared/package-managers.js';
import { getPackageVersions } from '../shared/package-versions.js';
import { toPascalCase } from '../shared/string-case.js';
import {
  buildDependencyChanges,
  buildOfficialWorkspaceLintScriptChanges,
  buildPackageManagerFieldChange,
  buildScriptChanges,
  getWpTypiaCliSpecifier,
  hasExistingWpTypiaProjectSurface,
  hasObsoleteTypiaUnpluginDependency,
  readProjectPackageJson,
  resolveInitPackageManager,
} from './cli-init-package-json.js';
import {
  findTtscLintConfigPath,
  hasCurrentTtscLintCompatFile,
  hasWordPressTtscLintConfig,
  resolveRetrofitTextDomain,
} from './cli-init-templates.js';
import { getYarnPnpNodeModulesConfig } from './cli-init-yarn.js';
import { collectRetrofitWebpackChanges } from './cli-init-webpack.js';
import {
  buildInitPlanChangeSummary,
  buildInitPlanNextSteps,
  buildRetrofitPlanSummary,
} from './cli-init-plan-presentation.js';
import {
  RETROFIT_APPLY_PREVIEW_NOTE,
  SUPPORTED_RETROFIT_LAYOUT_NOTE,
  type InitCommandMode,
  type InitFilePlan,
  type InitPlanLayoutKind,
  type InitPlanStatus,
  type RetrofitInitBlockTarget,
  type RetrofitInitPlan,
} from './cli-init-types.js';
import { tryResolveWorkspaceProject } from '../workspace/workspace-project.js';

const WORDPRESS_TTSC_LINT_CONFIG_PURPOSE =
  'Enable the partial WordPress ttsc preset and bind i18n diagnostics to the project text domain.';

function buildProjectOwnedLintConfigNote(configPath: string): string {
  return `Existing ${path.basename(configPath)} is project-owned and will not be overwritten. Extend it with @wp-typia/ttsc-lint-plugin-wp and the wordpress/i18n-text-domain rule before applying this plan.`;
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/gu, '/');
}

function buildGeneratedArtifactPaths(
	blockJsonFile: string,
	manifestFile: string,
): string[] {
  const manifestDir = path.dirname(manifestFile);
  const artifactPaths = [
    blockJsonFile,
    manifestFile,
    path.join(manifestDir, 'typia.schema.json'),
    path.join(manifestDir, 'typia-validator.php'),
    path.join(manifestDir, 'typia.openapi.json'),
  ];

  return Array.from(
    new Set(artifactPaths.map((filePath) => normalizeRelativePath(filePath))),
  );
}

function collectNamedSourceTypeCandidates(typesSource: string): string[] {
  const sourceFile = ts.createSourceFile(
    'types.ts',
    typesSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  return sourceFile.statements.flatMap((statement) => {
		if (
			ts.isInterfaceDeclaration(statement) ||
			ts.isTypeAliasDeclaration(statement)
		) {
			return [statement.name.text];
		}

		return [];
	});
}

function isObjectLikeSourceType(
	projectDir: string,
	typesFile: string,
	sourceTypeName: string,
): boolean {
  const analyzedTypes = analyzeSourceTypes(
    {
      projectRoot: projectDir,
      typesFile,
    },
    [sourceTypeName],
  );
  return analyzedTypes[sourceTypeName]?.kind === 'object';
}

function inferRetrofitAttributeTypeName(
	projectDir: string,
	block: MigrationBlockConfig,
): string {
  const typesPath = path.join(projectDir, block.typesFile);
  const typesSource = fs.readFileSync(typesPath, 'utf8');
  const blockNameSegments = block.blockName.split('/');
  const slug = blockNameSegments[blockNameSegments.length - 1] ?? block.key;
  const candidateNames = collectNamedSourceTypeCandidates(typesSource);
  const validCandidates = candidateNames.filter((candidateName) =>
    isObjectLikeSourceType(projectDir, block.typesFile, candidateName),
  );
  const preferredName = `${toPascalCase(slug)}Attributes`;

  if (validCandidates.includes(preferredName)) {
    return preferredName;
  }

  const attributeCandidates = validCandidates.filter((candidateName) =>
    candidateName.endsWith('Attributes'),
  );
  if (attributeCandidates.length === 1) {
    return attributeCandidates[0];
  }

  if (validCandidates.length === 1) {
    return validCandidates[0];
  }

  if (validCandidates.length === 0) {
    throw new Error(
      `Unable to infer an object-like source type from ${block.typesFile}. Add one interface or type alias such as ${preferredName} before rerunning \`wp-typia init\`.`,
    );
  }

  throw new Error(
    `Unable to infer a unique source type from ${block.typesFile}. Candidate object-like exports: ${validCandidates.join(', ')}. Rename one to ${preferredName} or leave a single object-like attributes type before rerunning \`wp-typia init\`.`,
  );
}

function buildRetrofitBlockTarget(
	projectDir: string,
	block: MigrationBlockConfig,
): RetrofitInitBlockTarget {
  const blockNameSegments = block.blockName.split('/');
  const slug = blockNameSegments[blockNameSegments.length - 1] ?? block.key;

  return {
    attributeTypeName: inferRetrofitAttributeTypeName(projectDir, block),
    blockJsonFile: block.blockJsonFile,
    blockName: block.blockName,
    manifestFile: block.manifestFile,
    saveFile: block.saveFile,
    slug,
    typesFile: block.typesFile,
  };
}

export function buildInitLayoutDetails(projectDir: string): {
  blockNames: string[];
  blockTargets: RetrofitInitBlockTarget[];
  description: string;
  generatedArtifacts: string[];
  kind: InitPlanLayoutKind;
  notes: string[];
} {
  try {
    const discoveredLayout = discoverMigrationInitLayout(projectDir);
    const discoveredBlocks =
			discoveredLayout.mode === 'multi'
        ? discoveredLayout.blocks
        : [discoveredLayout.block];
    let blockTargets: RetrofitInitBlockTarget[];
    try {
      blockTargets = discoveredBlocks.map((block) =>
        buildRetrofitBlockTarget(projectDir, block),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
				blockNames: discoveredBlocks.map((block) => block.blockName),
				blockTargets: [],
				description:
					'Detected supported block files, but could not infer retrofit block-config metadata automatically yet.',
				generatedArtifacts: [],
				kind: 'unsupported',
				notes: [message, SUPPORTED_RETROFIT_LAYOUT_NOTE],
			};
    }
    if (discoveredLayout.mode === 'multi') {
      return {
        blockNames: discoveredBlocks.map((block) => block.blockName),
        blockTargets,
        description: `Detected a supported multi-block retrofit candidate (${discoveredBlocks.length} targets).`,
        generatedArtifacts: discoveredBlocks.flatMap((block) =>
          buildGeneratedArtifactPaths(block.blockJsonFile, block.manifestFile),
        ),
        kind: 'multi-block',
        notes: [
          'Migration bootstrap can stay optional. Add it later with `wp-typia migrate init --current-migration-version v1` once the typed sync surface is in place.',
        ],
      };
    }

    return {
			blockNames: [discoveredLayout.block.blockName],
			blockTargets,
			description: 'Detected a supported single-block retrofit candidate.',
			generatedArtifacts: buildGeneratedArtifactPaths(
				discoveredLayout.block.blockJsonFile,
				discoveredLayout.block.manifestFile,
			),
			kind: 'single-block',
			notes:
				discoveredLayout.block.blockJsonFile === 'block.json'
					? [
							'Legacy root `block.json` layouts are still supported for retrofit planning, but newer scaffolds keep generated block metadata under `src/`.',
					  ]
					: [],
		};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      blockNames: [],
      blockTargets: [],
      description: 'No supported retrofit layout was auto-detected yet.',
      generatedArtifacts: [],
      kind: 'unsupported',
      notes: [message, SUPPORTED_RETROFIT_LAYOUT_NOTE],
    };
  }
}

function buildPlannedFiles(
	projectDir: string,
	layoutKind: InitPlanLayoutKind,
): InitFilePlan[] {
  if (layoutKind === 'unsupported') {
    return [];
  }

  const ttscLintPackageVersion = getPackageVersions().ttscLintPackageVersion;

  return [
		buildTtscLintCompatFilePlan(
			projectDir,
			`Apply the exact @ttsc/lint ${ttscLintPackageVersion} mapped/infer compatibility fix after dependency installation.`,
		),
		...buildWordPressLintConfigFilePlans(
			findTtscLintConfigPath(projectDir),
			WORDPRESS_TTSC_LINT_CONFIG_PURPOSE,
		),
		{
			action: fs.existsSync(path.join(projectDir, 'scripts', 'block-config.ts'))
				? 'update'
				: 'add',
			path: 'scripts/block-config.ts',
			purpose:
				'Declare the current retrofit block targets so sync-types can regenerate metadata from the existing TypeScript source of truth.',
		},
		{
			action: fs.existsSync(
				path.join(projectDir, 'scripts', 'sync-types-to-block-json.ts'),
			)
				? 'update'
				: 'add',
			path: 'scripts/sync-types-to-block-json.ts',
			purpose:
				'Generate block.json and Typia metadata artifacts from the current TypeScript source of truth.',
		},
		{
			action: fs.existsSync(path.join(projectDir, 'scripts', 'sync-project.ts'))
				? 'update'
				: 'add',
			path: 'scripts/sync-project.ts',
			purpose:
				'Provide one shared sync entrypoint that can grow into sync-rest or workspace-aware refresh steps later.',
		},
	];
}

function buildTtscLintCompatFilePlan(
  projectDir: string,
  purpose: string,
): InitFilePlan {
  return {
    action: fs.existsSync(
      path.join(projectDir, 'scripts', 'apply-ttsc-lint-compat.mjs'),
    )
      ? 'update'
      : 'add',
    path: 'scripts/apply-ttsc-lint-compat.mjs',
    purpose,
  };
}

function buildWordPressLintConfigFilePlans(
  lintConfigPath: string | null,
  purpose: string,
): InitFilePlan[] {
  return lintConfigPath
    ? []
    : [{ action: 'add', path: 'lint.config.ts', purpose }];
}

function buildOfficialWorkspaceLintFilePlans(
  projectDir: string,
  lintConfigPath: string | null,
): InitFilePlan[] {
  return [
    ...(hasCurrentTtscLintCompatFile(projectDir)
      ? []
      : [
          buildTtscLintCompatFilePlan(
            projectDir,
            'Keep the exact generated-project @ttsc/lint compatibility fix aligned with the managed toolchain.',
          ),
        ]),
    ...buildWordPressLintConfigFilePlans(
      lintConfigPath,
      WORDPRESS_TTSC_LINT_CONFIG_PURPOSE,
    ),
  ];
}

export function createRetrofitPlan(options: {
  commandMode: InitCommandMode;
  detectedLayout: {
    blockNames: string[];
    description: string;
    kind: InitPlanLayoutKind;
  };
  blockTargets: RetrofitInitBlockTarget[];
  generatedArtifacts: string[];
  nextSteps?: string[];
  notes: string[];
  packageChanges: RetrofitInitPlan['packageChanges'];
  packageManager: PackageManagerId;
  plannedFiles: InitFilePlan[];
  projectDir: string;
  projectName: string;
  status: InitPlanStatus;
}): RetrofitInitPlan {
  const includeGeneratedArtifacts = options.commandMode === 'preview-only';
  const plannedChanges = buildInitPlanChangeSummary(
    {
      generatedArtifacts: options.generatedArtifacts,
      packageChanges: options.packageChanges,
      plannedFiles: options.plannedFiles,
    },
    {
      includeGeneratedArtifacts,
    },
  );

  return {
		blockTargets: options.blockTargets,
		commandMode: options.commandMode,
		detectedLayout: options.detectedLayout,
		generatedArtifacts: options.generatedArtifacts,
		nextSteps:
			options.nextSteps ??
			buildInitPlanNextSteps({
				commandMode: options.commandMode,
				dependencyChangeCount: options.packageChanges.addDevDependencies.length,
				hasPlannedChanges: plannedChanges.length > 0,
				layoutKind: options.detectedLayout.kind,
				packageManager: options.packageManager,
			}),
		notes: options.notes,
		packageChanges: options.packageChanges,
		plannedFiles: options.plannedFiles,
		packageManager: options.packageManager,
		projectDir: options.projectDir,
		projectName: options.projectName,
		status: options.status,
		summary: buildRetrofitPlanSummary({
			commandMode: options.commandMode,
			status: options.status,
		}),
	};
}

/**
 * Inspect one project directory and return the current retrofit init plan.
 *
 * @param projectDir Project root or nested path that should be analyzed.
 * @param options Optional package-manager override used for emitted scripts and
 * follow-up guidance.
 * @returns The preview-only retrofit init plan for the resolved project.
 */
export function getInitPlan(
	projectDir: string,
	options: {
		packageManager?: string;
	} = {},
): RetrofitInitPlan {
  const resolvedProjectDir = path.resolve(projectDir);
  const packageJson = readProjectPackageJson(resolvedProjectDir);
  const packageManager = resolveInitPackageManager(
    resolvedProjectDir,
    packageJson,
    options.packageManager,
  );
  const workspace = tryResolveWorkspaceProject(resolvedProjectDir);

  if (workspace) {
    const workspacePackageJson = readProjectPackageJson(workspace.projectDir);
    const workspacePackageManager = resolveInitPackageManager(
      workspace.projectDir,
      workspacePackageJson,
      options.packageManager,
    );
    const dependencyChanges = buildDependencyChanges(workspacePackageJson);
    const scriptChanges = [
      ...buildScriptChanges(workspacePackageJson, workspacePackageManager),
      ...buildOfficialWorkspaceLintScriptChanges(
        workspacePackageJson,
        workspacePackageManager,
      ),
    ];
    const packageManagerFieldChange = buildPackageManagerFieldChange(
      workspacePackageJson,
      workspacePackageManager,
      {
        persistExplicitOverride: typeof options.packageManager === 'string',
      },
    );
    const yarnPnpNodeModulesConfig = getYarnPnpNodeModulesConfig(
      workspace.projectDir,
      workspacePackageManager,
      packageManagerFieldChange?.requiredValue,
    );
    const existingLintConfigPath = findTtscLintConfigPath(workspace.projectDir);
    const wordpressLintIntegrated = hasWordPressTtscLintConfig(
      existingLintConfigPath,
      workspace.workspace.textDomain,
    );
    const rawPlannedFiles = buildOfficialWorkspaceLintFilePlans(
      workspace.projectDir,
      existingLintConfigPath,
    );
    if (yarnPnpNodeModulesConfig) {
      rawPlannedFiles.push(yarnPnpNodeModulesConfig.filePlan);
    }
    const status: InitPlanStatus =
      dependencyChanges.length === 0 &&
      scriptChanges.length === 0 &&
      packageManagerFieldChange === undefined &&
      yarnPnpNodeModulesConfig === undefined &&
      rawPlannedFiles.length === 0 &&
      wordpressLintIntegrated
        ? 'already-initialized'
        : 'preview';
    return createRetrofitPlan({
      blockTargets: [],
      commandMode: 'preview-only',
      detectedLayout: {
        blockNames: [],
        description:
          status === 'already-initialized'
            ? 'Official wp-typia workspace lint integration is current.'
            : 'Detected an official wp-typia workspace that can receive the managed WordPress ttsc lint integration.',
        kind: 'official-workspace',
      },
      generatedArtifacts: [],
      ...(status === 'already-initialized'
        ? {
            nextSteps: [
              'Use `wp-typia add <kind> <name>` to extend the official workspace instead of rerunning init.',
              formatRunScript(workspacePackageManager, 'sync'),
              formatPackageExecCommand(
                workspacePackageManager,
                getWpTypiaCliSpecifier(),
                'doctor',
              ),
            ],
          }
        : {}),
      notes: [
        ...(existingLintConfigPath && !wordpressLintIntegrated
          ? [
              buildProjectOwnedLintConfigNote(existingLintConfigPath),
            ]
          : []),
        'The TypeScript lane remains `ttsc --noEmit` until upstream exposes the lint-only command tracked by samchon/ttsc#1127. Existing JavaScript and style lint commands are preserved.',
      ],
      packageChanges: {
        addDevDependencies: dependencyChanges,
        ...(packageManagerFieldChange
          ? { packageManagerField: packageManagerFieldChange }
          : {}),
        scripts: scriptChanges,
      },
      packageManager: workspacePackageManager,
      plannedFiles: status === 'already-initialized' ? [] : rawPlannedFiles,
      projectDir: workspace.projectDir,
      projectName: workspace.packageName,
      status,
    });
  }

  const projectName =
		typeof packageJson?.name === 'string' && packageJson.name.length > 0
      ? packageJson.name
      : path.basename(resolvedProjectDir);
  const layout = buildInitLayoutDetails(resolvedProjectDir);
  const dependencyChanges = buildDependencyChanges(packageJson);
  const scriptChanges = buildScriptChanges(packageJson, packageManager);
  const obsoleteTypiaUnplugin =
		hasObsoleteTypiaUnpluginDependency(packageJson);
  const webpackChanges = collectRetrofitWebpackChanges(resolvedProjectDir);
  const packageManagerFieldChange = buildPackageManagerFieldChange(
    packageJson,
    packageManager,
    {
      persistExplicitOverride: typeof options.packageManager === 'string',
    },
  );
  const yarnPnpNodeModulesConfig = getYarnPnpNodeModulesConfig(
    resolvedProjectDir,
    packageManager,
    packageManagerFieldChange?.requiredValue,
  );
  const rawPlannedFiles: InitFilePlan[] =
		layout.kind === 'generated-project' || layout.kind === 'official-workspace'
      ? []
      : buildPlannedFiles(resolvedProjectDir, layout.kind);
  if (yarnPnpNodeModulesConfig) {
    rawPlannedFiles.push(yarnPnpNodeModulesConfig.filePlan);
  }
  rawPlannedFiles.push(
    ...webpackChanges.map((change) => ({
      action: 'update' as const,
      path: change.path,
      purpose:
        'Replace the obsolete @typia/unplugin Webpack loader with @ttsc/unplugin.',
    })),
  );
  const hasExistingSurface = hasExistingWpTypiaProjectSurface(
    resolvedProjectDir,
    packageJson,
  );
  const existingLintConfigPath = findTtscLintConfigPath(resolvedProjectDir);
  const expectedTextDomain = resolveRetrofitTextDomain({
    blockTargets: layout.blockTargets,
    packageJson,
    projectDir: resolvedProjectDir,
  });
  const wordpressLintIntegrated = hasWordPressTtscLintConfig(
    existingLintConfigPath,
    expectedTextDomain,
  );
  const status: InitPlanStatus =
		hasExistingSurface &&
		dependencyChanges.length === 0 &&
		scriptChanges.length === 0 &&
		!obsoleteTypiaUnplugin &&
		webpackChanges.length === 0 &&
		packageManagerFieldChange === undefined &&
		yarnPnpNodeModulesConfig === undefined &&
		wordpressLintIntegrated
			? 'already-initialized'
			: 'preview';
  const plannedFiles = status === 'already-initialized' ? [] : rawPlannedFiles;
  const detectedLayout =
		status === 'already-initialized' && hasExistingSurface
			? {
					blockNames: layout.blockNames,
					description:
						layout.kind === 'unsupported'
							? 'Already exposes the minimum wp-typia sync surface.'
							: `Already exposes the minimum wp-typia sync surface for ${layout.kind === 'multi-block' ? 'a multi-block project' : 'a single-block project'}.`,
					kind: 'generated-project' as const,
			  }
			: {
					blockNames: layout.blockNames,
					description: layout.description,
					kind: layout.kind,
			  };

  return createRetrofitPlan({
		blockTargets: layout.blockTargets,
		commandMode: 'preview-only',
		detectedLayout,
		generatedArtifacts:
			status === 'already-initialized' && detectedLayout.kind === 'generated-project'
				? []
				: layout.generatedArtifacts,
		notes: Array.from(
			new Set([
				'Preview only: `wp-typia init` does not write files yet.',
				RETROFIT_APPLY_PREVIEW_NOTE,
				...(obsoleteTypiaUnplugin
					? [
							'The obsolete `@typia/unplugin` dependency will be removed while `@ttsc/unplugin` is installed.',
					  ]
					: []),
				...(webpackChanges.length > 0
					? [
							'Webpack imports from `@typia/unplugin/webpack` will be migrated to `@ttsc/unplugin/webpack`.',
					  ]
					: []),
				...(existingLintConfigPath && !wordpressLintIntegrated
					? [
							buildProjectOwnedLintConfigNote(existingLintConfigPath),
					  ]
					: []),
				...layout.notes,
			]),
		),
		packageChanges: {
			addDevDependencies: dependencyChanges,
			...(packageManagerFieldChange
				? { packageManagerField: packageManagerFieldChange }
				: {}),
			scripts: scriptChanges,
		},
		packageManager,
		plannedFiles,
		projectDir: resolvedProjectDir,
		projectName,
		status,
	});
}
