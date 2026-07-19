import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  CLI_DIAGNOSTIC_CODES,
  createCliCommandError,
  createCliDiagnosticCodeError,
} from '@wp-typia/project-tools/cli-diagnostics';
import {
  formatInstallCommand,
  formatRunScript,
  inferPackageManagerId,
  type PackageManagerId,
} from '@wp-typia/project-tools/package-managers';

type SyncScriptName = 'sync' | 'sync-ai' | 'sync-rest' | 'sync-types';
type SyncScriptKey = SyncScriptName | 'sync-wordpress-ai';
export type SyncExecutionTarget = 'ai' | 'default';

type SyncScriptDefinition = {
  command: string;
  scriptName: SyncScriptKey;
};

type SyncExecutionInput = {
  captureOutput?: boolean;
  check?: boolean;
  cwd: string;
  dryRun?: boolean;
  target?: SyncExecutionTarget;
};

type SyncProjectContext = {
  cwd: string;
  packageJsonPath: string;
  packageManager: PackageManagerId;
  scripts: Partial<Record<SyncScriptName, SyncScriptDefinition>>;
};

type SyncPackageJson = {
  packageManager?: string;
  scripts?: Record<string, unknown>;
};

export type SyncPlannedCommand = {
  args: string[];
  command: string;
  displayCommand: string;
  scriptName: SyncScriptKey;
};

export type SyncExecutedCommand = SyncPlannedCommand & {
  exitCode: number;
  stderr?: string;
  stdout?: string;
};

export type SyncExecutionResult = {
  check: boolean;
  dryRun: boolean;
  executedCommands?: SyncExecutedCommand[];
  packageJsonPath: string;
  packageManager: PackageManagerId;
  plannedCommands: SyncPlannedCommand[];
  projectDir: string;
  target: SyncExecutionTarget;
};

const SYNC_INSTALL_MARKERS = [
  'node_modules',
  '.pnp.cjs',
  '.pnp.loader.mjs',
] as const;
const LOCAL_SYNC_TOOL_PATTERN =
  /(^|[\s;&|()])(?:tsx|wp-scripts)(?=($|[\s;&|()]))/u;
const CAPTURED_SYNC_OUTPUT_MAX_BUFFER = 16 * 1024 * 1024;
const CAPTURED_SYNC_DIAGNOSTIC_ITEM_LIMIT = 20;
const GENERATED_ARTIFACT_ISSUE_PATTERN = /^-\s+(.+)\s+\((missing|stale)\)$/u;

type SyncArtifactIssue = {
  path: string;
  status: 'missing' | 'stale';
};

export function resolveSyncExecutionTarget(
  subcommand?: string,
): SyncExecutionTarget {
  if (!subcommand) {
    return 'default';
  }
  if (subcommand === 'ai') {
    return 'ai';
  }

  throw createCliDiagnosticCodeError(
    CLI_DIAGNOSTIC_CODES.INVALID_COMMAND,
    `Unknown sync subcommand "${subcommand}". Expected one of: "ai".`,
  );
}

function getSyncRootError(cwd: string): Error {
  return createCliDiagnosticCodeError(
    CLI_DIAGNOSTIC_CODES.OUTSIDE_PROJECT_ROOT,
    `No generated wp-typia project root was found at ${cwd}. Run \`wp-typia sync\` from a scaffolded project or official workspace root that already contains generated sync scripts. If you expected this directory to work, cd into the scaffold root first or rerun the scaffold before syncing.`,
  );
}

function readSyncPackageJson(packageJsonPath: string): SyncPackageJson {
  const source = fs.readFileSync(packageJsonPath, 'utf8');

  try {
    return JSON.parse(source) as SyncPackageJson;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      `Unable to parse ${packageJsonPath}: ${message}`,
      error instanceof Error ? { cause: error } : undefined,
    );
  }
}

function resolveSyncProjectContext(cwd: string): SyncProjectContext {
  const packageJsonPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw getSyncRootError(cwd);
  }

  const packageJson = readSyncPackageJson(packageJsonPath);
  const scripts = packageJson.scripts ?? {};
  const syncScripts = {
    sync:
      typeof scripts.sync === 'string'
        ? {
            command: scripts.sync,
            scriptName: 'sync',
          }
        : undefined,
    'sync-ai':
      typeof scripts['sync-ai'] === 'string'
        ? {
            command: scripts['sync-ai'],
            scriptName: 'sync-ai',
          }
        : typeof scripts['sync-wordpress-ai'] === 'string'
          ? {
              command: scripts['sync-wordpress-ai'] as string,
              scriptName: 'sync-wordpress-ai',
            }
          : undefined,
    'sync-rest':
      typeof scripts['sync-rest'] === 'string'
        ? {
            command: scripts['sync-rest'],
            scriptName: 'sync-rest',
          }
        : undefined,
    'sync-types':
      typeof scripts['sync-types'] === 'string'
        ? {
            command: scripts['sync-types'],
            scriptName: 'sync-types',
          }
        : undefined,
  } satisfies SyncProjectContext['scripts'];

  return {
    cwd,
    packageJsonPath,
    packageManager: inferPackageManagerId(cwd, packageJson.packageManager),
    scripts: syncScripts,
  };
}

function findInstalledDependencyMarkerDir(projectDir: string): string | null {
  let currentDir = path.resolve(projectDir);

  while (true) {
    if (
      SYNC_INSTALL_MARKERS.some((marker) =>
        fs.existsSync(path.join(currentDir, marker)),
      )
    ) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

function scriptsLikelyNeedInstalledDependencies(
  project: SyncProjectContext,
  target: SyncExecutionTarget,
): boolean {
  const candidateScripts =
    target === 'ai'
      ? [project.scripts['sync-ai']]
      : project.scripts.sync
        ? [project.scripts.sync]
        : [
            project.scripts['sync-types'],
            project.scripts['sync-rest'],
            project.scripts['sync-ai'],
          ];

  return candidateScripts.some(
    (script): script is SyncScriptDefinition =>
      script !== undefined && LOCAL_SYNC_TOOL_PATTERN.test(script.command),
  );
}

function assertSyncDependenciesInstalled(
  project: SyncProjectContext,
  target: SyncExecutionTarget,
): void {
  if (!scriptsLikelyNeedInstalledDependencies(project, target)) {
    return;
  }
  const markerDir = findInstalledDependencyMarkerDir(project.cwd);
  if (markerDir) {
    return;
  }

  throw createCliDiagnosticCodeError(
    CLI_DIAGNOSTIC_CODES.DEPENDENCIES_NOT_INSTALLED,
    `Project dependencies have not been installed yet. Run \`${formatInstallCommand(project.packageManager)}\` from the project root before \`wp-typia sync\`. The generated sync scripts rely on local tools such as \`tsx\`.`,
  );
}

function getPackageManagerRunInvocation(
  packageManager: PackageManagerId,
  scriptName: string,
  extraArgs: string[],
): { args: string[]; command: string } {
  switch (packageManager) {
    case 'bun':
      return { args: ['run', scriptName, ...extraArgs], command: 'bun' };
    case 'npm':
      return {
        args: [
          'run',
          scriptName,
          ...(extraArgs.length > 0 ? ['--', ...extraArgs] : []),
        ],
        command: 'npm',
      };
    case 'pnpm':
      return { args: ['run', scriptName, ...extraArgs], command: 'pnpm' };
    case 'yarn':
      return { args: ['run', scriptName, ...extraArgs], command: 'yarn' };
  }
}

function createSyncPlannedCommand(
  project: SyncProjectContext,
  scriptName: SyncScriptName,
  extraArgs: string[],
): SyncPlannedCommand | null {
  const script = project.scripts[scriptName];
  if (!script) {
    return null;
  }

  const invocation = getPackageManagerRunInvocation(
    project.packageManager,
    script.scriptName,
    extraArgs,
  );

  return {
    args: invocation.args,
    command: invocation.command,
    displayCommand: formatRunScript(
      project.packageManager,
      script.scriptName,
      extraArgs.join(' '),
    ),
    scriptName: script.scriptName,
  };
}

function buildSyncPlannedCommands(
  project: SyncProjectContext,
  extraArgs: string[],
  target: SyncExecutionTarget,
): SyncPlannedCommand[] {
  if (target === 'ai') {
    const syncAiCommand = createSyncPlannedCommand(
      project,
      'sync-ai',
      extraArgs,
    );
    if (!syncAiCommand) {
      throw createCliDiagnosticCodeError(
        CLI_DIAGNOSTIC_CODES.CONFIGURATION_MISSING,
        `Expected ${project.packageJsonPath} to define a \`sync-ai\` script for \`wp-typia sync ai\`.`,
      );
    }

    return [syncAiCommand];
  }

  if (project.scripts.sync) {
    return [createSyncPlannedCommand(project, 'sync', extraArgs)!];
  }

  const syncTypesCommand = createSyncPlannedCommand(
    project,
    'sync-types',
    extraArgs,
  );
  if (!syncTypesCommand) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.CONFIGURATION_MISSING,
      `Expected ${project.packageJsonPath} to define either a \`sync\` or \`sync-types\` script.`,
    );
  }

  const plannedCommands = [syncTypesCommand];
  const syncRestCommand = createSyncPlannedCommand(
    project,
    'sync-rest',
    extraArgs,
  );
  if (syncRestCommand) {
    plannedCommands.push(syncRestCommand);
  }
  const syncAiCommand = createSyncPlannedCommand(project, 'sync-ai', extraArgs);
  if (syncAiCommand) {
    plannedCommands.push(syncAiCommand);
  }

  return plannedCommands;
}

function normalizeSyncArtifactPath(
  projectDir: string,
  artifactPath: string,
): string {
  const absolutePath = path.isAbsolute(artifactPath)
    ? artifactPath
    : path.resolve(projectDir, artifactPath);
  const projectRoots = [path.resolve(projectDir)];
  try {
    projectRoots.push(fs.realpathSync(projectDir));
  } catch {
    // The sync preflight already validated the project root. Keep the lexical
    // root as a fallback if the directory changes during child execution.
  }

  for (const projectRoot of new Set(projectRoots)) {
    const relativePath = path.relative(projectRoot, absolutePath);
    if (
      relativePath.length > 0 &&
      relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath)
    ) {
      return relativePath.split(path.sep).join('/');
    }
  }

  return path.basename(absolutePath) || '<outside-project>';
}

function collectSyncArtifactIssues(
  projectDir: string,
  stdout: string | undefined,
  stderr: string | undefined,
): SyncArtifactIssue[] {
  const issues: SyncArtifactIssue[] = [];
  const seen = new Set<string>();

  for (const line of `${stderr ?? ''}\n${stdout ?? ''}`.split(/\r?\n/u)) {
    const match = GENERATED_ARTIFACT_ISSUE_PATTERN.exec(line.trim());
    if (!match) {
      continue;
    }

    const [, rawPath, status] = match;
    if (!rawPath || (status !== 'missing' && status !== 'stale')) {
      continue;
    }

    const issue = {
      path: normalizeSyncArtifactPath(projectDir, rawPath),
      status,
    } satisfies SyncArtifactIssue;
    const key = `${issue.status}:${issue.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      issues.push(issue);
      if (issues.length >= CAPTURED_SYNC_DIAGNOSTIC_ITEM_LIMIT) {
        break;
      }
    }
  }

  return issues;
}

function collectSyncFailureOutputLines(
  stdout: string | undefined,
  stderr: string | undefined,
): string[] {
  const lines = `${stderr ?? ''}\n${stdout ?? ''}`
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith('>'))
    .filter((line) => !/^npm\s+(?:error|warn)\b/iu.test(line))
    .filter((line) => !/^at\s+/u.test(line))
    .filter((line) => !/^Error:\s+Sync script failed:/u.test(line))
    .filter((line) => !/^❌\s+Project sync failed:/u.test(line))
    .map((line) => line.replace(/^❌\s+/u, ''));

  return Array.from(new Set(lines)).slice(
    0,
    CAPTURED_SYNC_DIAGNOSTIC_ITEM_LIMIT,
  );
}

function createSyncExecutionError(
  project: SyncProjectContext,
  plannedCommand: SyncPlannedCommand,
  result: ReturnType<typeof spawnSync>,
  stdout: string | undefined,
  stderr: string | undefined,
): Error {
  const exitCode = result.status ?? 1;
  const artifacts = collectSyncArtifactIssues(project.cwd, stdout, stderr);
  const commandDetail = `\`${plannedCommand.displayCommand}\` failed with exit code ${exitCode}.`;

  if (artifacts.length > 0) {
    const applyCommand = formatRunScript(
      project.packageManager,
      plannedCommand.scriptName,
    );
    return createCliCommandError({
      code: CLI_DIAGNOSTIC_CODES.GENERATED_ARTIFACT_DRIFT,
      command: 'sync',
      data: {
        artifacts,
        command: plannedCommand.displayCommand,
        exitCode,
      },
      detailLines: [
        commandDetail,
        ...artifacts.map(
          (artifact) =>
            `${artifact.status === 'missing' ? 'Missing' : 'Stale'} generated artifact: ${artifact.path}.`,
        ),
        `Run \`${applyCommand}\` to regenerate the artifacts, then rerun \`${plannedCommand.displayCommand}\`.`,
      ],
      error: result.error,
      summary: 'Generated artifacts are missing or stale.',
    });
  }

  const outputLines = collectSyncFailureOutputLines(stdout, stderr);
  return createCliCommandError({
    code: CLI_DIAGNOSTIC_CODES.COMMAND_EXECUTION,
    command: 'sync',
    data: {
      command: plannedCommand.displayCommand,
      exitCode,
      ...(result.signal ? { signal: result.signal } : {}),
    },
    detailLines: [
      commandDetail,
      ...outputLines,
      ...(outputLines.length === 0 && result.error
        ? [result.error.message]
        : []),
    ],
    error: result.error,
    summary: 'A generated project sync command failed.',
  });
}

function runProjectScript(
  project: SyncProjectContext,
  plannedCommand: SyncPlannedCommand,
  options: {
    captureOutput: boolean;
  },
): SyncExecutedCommand {
  const result = spawnSync(plannedCommand.command, plannedCommand.args, {
    cwd: project.cwd,
    encoding: options.captureOutput ? 'utf8' : undefined,
    ...(options.captureOutput
      ? { maxBuffer: CAPTURED_SYNC_OUTPUT_MAX_BUFFER }
      : {}),
    shell: process.platform === 'win32',
    stdio: options.captureOutput ? 'pipe' : 'inherit',
  });
  const stderr =
    options.captureOutput && typeof result.stderr === 'string'
      ? result.stderr
      : undefined;
  const stdout =
    options.captureOutput && typeof result.stdout === 'string'
      ? result.stdout
      : undefined;

  if (result.error || result.status !== 0) {
    throw createSyncExecutionError(
      project,
      plannedCommand,
      result,
      stdout,
      stderr,
    );
  }

  return {
    ...plannedCommand,
    exitCode: result.status ?? 0,
    ...(stderr !== undefined ? { stderr } : {}),
    ...(stdout !== undefined ? { stdout } : {}),
  };
}

/**
 * Executes the generated-project sync flow through the local project scripts.
 *
 * @param options Sync execution options including cwd, optional `--check`, and
 * optional `--dry-run` preview mode.
 * @returns A promise that resolves with the planned sync commands and any
 * executed command output metadata.
 */
export async function executeSyncCommand({
  captureOutput = false,
  check = false,
  cwd,
  dryRun = false,
  target = 'default',
}: SyncExecutionInput): Promise<SyncExecutionResult> {
  const project = resolveSyncProjectContext(cwd);
  const extraArgs = check ? ['--check'] : [];
  const plannedCommands = buildSyncPlannedCommands(project, extraArgs, target);
  const result: SyncExecutionResult = {
    check,
    dryRun,
    packageJsonPath: project.packageJsonPath,
    packageManager: project.packageManager,
    plannedCommands,
    projectDir: project.cwd,
    target,
  };

  if (dryRun) {
    return result;
  }

  assertSyncDependenciesInstalled(project, target);
  result.executedCommands = plannedCommands.map((plannedCommand) =>
    runProjectScript(project, plannedCommand, {
      captureOutput,
    }),
  );
  return result;
}
