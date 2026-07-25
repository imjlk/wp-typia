import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
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
import { escapeRegExp } from './string-utils';
import { isSyncStackFrameLine } from './sync-output';

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
  onStderr?: SyncOutputWriter;
  onStdout?: SyncOutputWriter;
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
const CAPTURED_SYNC_DRIFT_LINE_LIMIT =
  CAPTURED_SYNC_DIAGNOSTIC_ITEM_LIMIT * 2;
const CAPTURED_SYNC_DIAGNOSTIC_LINE_MAX_BUFFER = 64 * 1024;
const CAPTURED_SYNC_DIAGNOSTIC_CONTEXT_LIMIT = 4;
const STREAMED_SYNC_OUTPUT_PATH_TOKEN_MAX_BUFFER = 64 * 1024;
const GENERATED_ARTIFACT_ISSUE_PATTERN = /^-\s+(.+)\s+\((missing|stale)\)$/u;
const GENERATED_ARTIFACT_CHECK_ISSUE_PATTERN =
  /^-\s+(.+)\s+\(((?:unreadable|inaccessible|invalid|malformed|parse error|permission denied)(?::\s*[^)]+)?)\)$/iu;
const GENERATED_ARTIFACT_INLINE_ISSUE_PATTERN =
  /Generated AI feature artifact is (missing|stale):\s+.+\s+\((.+)\)\.$/iu;
const GENERATED_ARTIFACT_DRIFT_CONTEXT_PATTERN =
  /(?:Generated (?:WordPress AI |typia\.llm )?artifacts are missing or stale:|Generated AI feature artifact is (?:missing|stale):)/iu;
const GENERIC_ABSOLUTE_PATH_SUFFIX_PATTERN =
  /(?:^|[\s("'`=:\[\]{},;])((?:\/(?!\/)|[A-Za-z]:[\\/]|\\\\)(?:(?!\s+(?:-\s|:\s|(?:error|warning|note):\s)|\?[ \t]*$)[^\r\n"'`<>])*)$/iu;
const GENERIC_ABSOLUTE_PATH_PARTIAL_PREFIX_PATTERN =
  /(?:^|[\s("'`=:\[\]{},;])([A-Za-z](?::[\\/]?)?|\\{1,2})$/u;
const GENERIC_ABSOLUTE_PATH_TERMINATOR_PATTERN =
  /(?:\s+(?:-\s|:\s|(?:error|warning|note):\s)|\?(?=[ \t]*(?:$|[\r\n]))|[\r\n"'`<>])/iu;
const POSIX_ABSOLUTE_PATH_PATTERN =
  /(^|[\s("'`=:\[\]{},;])\/(?!\/)[^\r\n"'`<>]*?(?=\s+(?:-\s|:\s|(?:error|warning|note):\s)|\?(?=[ \t]*(?:$|[\r\n]))|[\r\n"'`<>]|$)/giu;
const UNC_ABSOLUTE_PATH_PATTERN =
  /(^|[\s("'`=:\[\]{},;])\\\\[^\\/\r\n"'`<>]+[\\/][^\r\n"'`<>]*?(?=\s+(?:-\s|:\s|(?:error|warning|note):\s)|\?(?=[ \t]*(?:$|[\r\n]))|[\r\n"'`<>]|$)/giu;
const WINDOWS_ABSOLUTE_PATH_PATTERN =
  /\b[A-Za-z]:[\\/][^\r\n"'`<>]*?(?=\s+(?:-\s|:\s|(?:error|warning|note):\s)|\?(?=[ \t]*(?:$|[\r\n]))|[\r\n"'`<>]|$)/giu;

type SyncArtifactIssue = {
  path: string;
  status: 'missing' | 'stale';
};

type SyncArtifactCheckIssue = {
  detail: string;
  path: string;
};

type SyncProcessResult = {
  error?: Error;
  signal: NodeJS.Signals | null;
  status: number | null;
};

function matchGeneratedArtifactCheckIssue(
  line: string,
): RegExpExecArray | undefined {
  const match = GENERATED_ARTIFACT_CHECK_ISSUE_PATTERN.exec(line);
  const artifactPath = match?.[1]?.trim();
  if (
    !artifactPath ||
    !(
      /^(?:\.{0,2}[\\/]|[A-Za-z]:[\\/]|\\\\)/u.test(artifactPath) ||
      /(?:^|[\\/])[^\\/\s()]+\.[A-Za-z][A-Za-z0-9]{0,11}$/u.test(artifactPath)
    )
  ) {
    return undefined;
  }
  return match ?? undefined;
}

type SyncOutputRedactionPatterns = {
  pathPrefixes: RegExp[];
  projectRoots: RegExp[];
};

type SyncFailureOutputSelection = {
  stderr: boolean;
  stdout: boolean;
};

type SyncOutputWriter = (chunk: string) => PromiseLike<void> | void;

class BoundedSyncOutputCapture {
  private readonly chunks: Buffer[] = [];
  private readonly diagnosticDecoder = new StringDecoder('utf8');
  private readonly diagnosticContextLines: string[] = [];
  private readonly diagnosticContextSet = new Set<string>();
  private readonly diagnosticIssueLines: string[] = [];
  private readonly diagnosticIssueSet = new Set<string>();
  private diagnosticPending = '';
  private diagnosticsFinalized = false;
  private diagnosticDriftLinesRemaining = 0;
  private size = 0;

  append(chunk: Buffer): void {
    this.appendDiagnosticText(this.diagnosticDecoder.write(chunk), false);
    this.chunks.push(chunk);
    this.size += chunk.byteLength;

    while (this.size > CAPTURED_SYNC_OUTPUT_MAX_BUFFER) {
      const first = this.chunks[0];
      if (!first) {
        break;
      }
      const overflow = this.size - CAPTURED_SYNC_OUTPUT_MAX_BUFFER;
      if (first.byteLength <= overflow) {
        this.chunks.shift();
        this.size -= first.byteLength;
        continue;
      }
      this.chunks[0] = Buffer.from(first.subarray(overflow));
      this.size -= overflow;
    }
  }

  toString(includePreservedDiagnostics = false): string | undefined {
    if (!this.diagnosticsFinalized) {
      this.appendDiagnosticText(this.diagnosticDecoder.end(), true);
      this.diagnosticsFinalized = true;
    }
    const tail =
      this.size > 0
        ? Buffer.concat(this.chunks, this.size).toString('utf8')
        : undefined;
    const diagnosticLines = [
      ...this.diagnosticContextLines,
      ...this.diagnosticIssueLines,
    ];
    if (!includePreservedDiagnostics || diagnosticLines.length === 0) {
      return tail;
    }
    const preservedDiagnostics = diagnosticLines.join('\n');
    return tail ? `${tail}\n${preservedDiagnostics}` : preservedDiagnostics;
  }

  private appendDiagnosticText(text: string, final: boolean): void {
    this.diagnosticPending += text;
    let newlineIndex = this.diagnosticPending.indexOf('\n');
    while (newlineIndex >= 0) {
      this.recordDiagnosticLine(this.diagnosticPending.slice(0, newlineIndex));
      this.diagnosticPending = this.diagnosticPending.slice(newlineIndex + 1);
      newlineIndex = this.diagnosticPending.indexOf('\n');
    }
    if (final) {
      this.recordDiagnosticLine(this.diagnosticPending);
      this.diagnosticPending = '';
    } else if (
      this.diagnosticPending.length > CAPTURED_SYNC_DIAGNOSTIC_LINE_MAX_BUFFER
    ) {
      this.diagnosticPending = this.diagnosticPending.slice(
        -CAPTURED_SYNC_DIAGNOSTIC_LINE_MAX_BUFFER,
      );
    }
  }

  private recordDiagnosticLine(line: string): void {
    const trimmedLine = line.replace(/\r$/u, '').trim();
    const isInlineIssue =
      GENERATED_ARTIFACT_INLINE_ISSUE_PATTERN.test(trimmedLine);
    const isDriftContext =
      !isInlineIssue &&
      GENERATED_ARTIFACT_DRIFT_CONTEXT_PATTERN.test(trimmedLine);
    if (isDriftContext) {
      this.diagnosticDriftLinesRemaining = CAPTURED_SYNC_DRIFT_LINE_LIMIT;
    }
    if (
      isDriftContext &&
      this.diagnosticContextLines.length <
        CAPTURED_SYNC_DIAGNOSTIC_CONTEXT_LIMIT &&
      !this.diagnosticContextSet.has(trimmedLine)
    ) {
      this.diagnosticContextSet.add(trimmedLine);
      this.diagnosticContextLines.push(trimmedLine);
    }
    if (
      (isInlineIssue ||
        (this.diagnosticDriftLinesRemaining > 0 &&
          (GENERATED_ARTIFACT_ISSUE_PATTERN.test(trimmedLine) ||
            matchGeneratedArtifactCheckIssue(trimmedLine)))) &&
      this.diagnosticIssueLines.length < CAPTURED_SYNC_DIAGNOSTIC_ITEM_LIMIT &&
      !this.diagnosticIssueSet.has(trimmedLine)
    ) {
      this.diagnosticIssueSet.add(trimmedLine);
      this.diagnosticIssueLines.push(trimmedLine);
    }
    if (
      trimmedLine.length > 0 &&
      !isDriftContext &&
      this.diagnosticDriftLinesRemaining > 0
    ) {
      this.diagnosticDriftLinesRemaining -= 1;
    }
  }
}

class SanitizedSyncOutputStream {
  private readonly decoder = new StringDecoder('utf8');
  private readonly maxRootLength: number;
  private readonly patterns: SyncOutputRedactionPatterns;
  private readonly rootPrefixes: Set<string>;
  private redactingAbsolutePathTail = false;
  private pending = '';

  constructor(
    projectRoots: string[],
    private readonly write: SyncOutputWriter,
  ) {
    this.maxRootLength = Math.max(
      0,
      ...projectRoots.map((projectRoot) => projectRoot.length),
    );
    this.patterns = createSyncOutputPatterns(projectRoots);
    this.rootPrefixes = createSyncOutputRootPrefixes(projectRoots);
  }

  append(chunk: Buffer): PromiseLike<void> | void {
    const decoded = this.decoder.write(chunk);
    if (this.redactingAbsolutePathTail) {
      const terminatorIndex = decoded.search(
        GENERIC_ABSOLUTE_PATH_TERMINATOR_PATTERN,
      );
      if (terminatorIndex === -1) {
        return;
      }
      this.redactingAbsolutePathTail = false;
      this.pending += decoded.slice(terminatorIndex);
    } else {
      this.pending += decoded;
    }
    const genericPathLength = getGenericAbsolutePathSuffixLength(this.pending);
    if (genericPathLength > STREAMED_SYNC_OUTPUT_PATH_TOKEN_MAX_BUFFER) {
      const writeResult = this.write(
        sanitizeSyncOutputWithPatterns(this.pending, this.patterns),
      );
      this.pending = '';
      this.redactingAbsolutePathTail = true;
      return writeResult;
    }
    const retainedLength = getSyncOutputRetainedSuffixLength(
      this.pending,
      this.maxRootLength,
      this.rootPrefixes,
    );
    const emitLength = this.pending.length - retainedLength;
    if (emitLength === 0) {
      return;
    }

    const writeResult = this.write(
      sanitizeSyncOutputWithPatterns(
        this.pending.slice(0, emitLength),
        this.patterns,
      ),
    );
    this.pending = this.pending.slice(emitLength);
    return writeResult;
  }

  flush(): PromiseLike<void> | void {
    const decoded = this.decoder.end();
    if (this.redactingAbsolutePathTail) {
      const terminatorIndex = decoded.search(
        GENERIC_ABSOLUTE_PATH_TERMINATOR_PATTERN,
      );
      if (terminatorIndex !== -1) {
        this.pending += decoded.slice(terminatorIndex);
      }
      this.redactingAbsolutePathTail = false;
    } else {
      this.pending += decoded;
    }
    if (this.pending.length === 0) {
      return;
    }
    const writeResult = this.write(
      sanitizeSyncOutputWithPatterns(this.pending, this.patterns),
    );
    this.pending = '';
    return writeResult;
  }
}

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
  projectRoots: string[],
  artifactPath: string,
): string {
  const absolutePath = path.isAbsolute(artifactPath)
    ? artifactPath
    : path.resolve(projectDir, artifactPath);

  for (const projectRoot of projectRoots) {
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

function resolveSyncProjectRoots(projectDir: string): string[] {
  const projectRoots = [path.resolve(projectDir)];
  try {
    projectRoots.push(fs.realpathSync(projectDir));
  } catch {
    // The sync preflight already validated the project root. Keep the lexical
    // root as a fallback if the directory changes during child execution.
  }

  // Replace longer roots first so a shorter lexical prefix cannot leave a
  // resolved-path suffix visible in user-facing diagnostics.
  return Array.from(new Set(projectRoots)).sort(
    (left, right) => right.length - left.length,
  );
}

function collectSyncArtifactIssues(
  projectDir: string,
  projectRoots: string[],
  stdout: string | undefined,
  stderr: string | undefined,
): SyncArtifactIssue[] {
  const issues: SyncArtifactIssue[] = [];
  const seen = new Set<string>();
  let driftLinesRemaining = 0;

  for (const line of iterateSyncOutputLines(stdout, stderr)) {
    const trimmedLine = line.trim();
    const isDriftContext =
      GENERATED_ARTIFACT_DRIFT_CONTEXT_PATTERN.test(trimmedLine);
    if (isDriftContext) {
      driftLinesRemaining = CAPTURED_SYNC_DRIFT_LINE_LIMIT;
    }
    const listMatch =
      driftLinesRemaining > 0
        ? GENERATED_ARTIFACT_ISSUE_PATTERN.exec(trimmedLine)
        : null;
    const inlineMatch = GENERATED_ARTIFACT_INLINE_ISSUE_PATTERN.exec(
      trimmedLine,
    );
    const rawPath = listMatch?.[1] ?? inlineMatch?.[2];
    const status = listMatch?.[2] ?? inlineMatch?.[1];
    if (
      trimmedLine.length > 0 &&
      !isDriftContext &&
      driftLinesRemaining > 0
    ) {
      driftLinesRemaining -= 1;
    }
    if (!rawPath || (status !== 'missing' && status !== 'stale')) {
      continue;
    }

    const issue = {
      path: normalizeSyncArtifactPath(projectDir, projectRoots, rawPath),
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

function* iterateSyncOutputLines(
  stdout: string | undefined,
  stderr: string | undefined,
): Generator<string> {
  yield* `${stderr ?? ''}\n${stdout ?? ''}`.split(/\r?\n/u);
}

function collectSyncArtifactCheckIssues(
  projectDir: string,
  projectRoots: string[],
  stdout: string | undefined,
  stderr: string | undefined,
): SyncArtifactCheckIssue[] {
  const issues: SyncArtifactCheckIssue[] = [];
  const seen = new Set<string>();
  let driftLinesRemaining = 0;

  for (const line of iterateSyncOutputLines(stdout, stderr)) {
    const trimmedLine = line.trim();
    if (GENERATED_ARTIFACT_DRIFT_CONTEXT_PATTERN.test(trimmedLine)) {
      driftLinesRemaining = CAPTURED_SYNC_DRIFT_LINE_LIMIT;
      continue;
    }
    if (trimmedLine.length === 0 || driftLinesRemaining === 0) {
      continue;
    }
    driftLinesRemaining -= 1;
    const match = matchGeneratedArtifactCheckIssue(trimmedLine);
    if (!match || GENERATED_ARTIFACT_ISSUE_PATTERN.test(trimmedLine)) {
      continue;
    }
    const rawPath = match[1];
    const rawDetail = match[2];
    if (!rawPath || !rawDetail) {
      continue;
    }

    const issue = {
      detail: sanitizeSyncOutputLine(rawDetail, projectRoots),
      path: normalizeSyncArtifactPath(projectDir, projectRoots, rawPath),
    } satisfies SyncArtifactCheckIssue;
    const key = `${issue.path}:${issue.detail}`;
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

function createSyncOutputPatterns(
  projectRoots: string[],
): SyncOutputRedactionPatterns {
  const sources = [...projectRoots]
    .sort((left, right) => right.length - left.length)
    .map((projectRoot) =>
      projectRoot
        .split(/[\\/]/u)
        .map(escapeRegExp)
        .join(String.raw`[\\/]`),
    );
  return {
    pathPrefixes: sources.map((source) => new RegExp(source, 'giu')),
    projectRoots: sources.map(
      (source) => new RegExp(`${source}(?=$|[\\\\/])`, 'giu'),
    ),
  };
}

function normalizeSyncOutputPath(value: string): string {
  return value.replace(/\\/gu, '/').toLowerCase();
}

function createSyncOutputRootPrefixes(projectRoots: string[]): Set<string> {
  const prefixes = new Set<string>();
  for (const projectRoot of projectRoots) {
    const normalizedRoot = normalizeSyncOutputPath(projectRoot);
    for (let length = 1; length <= normalizedRoot.length; length += 1) {
      prefixes.add(normalizedRoot.slice(0, length));
    }
  }
  return prefixes;
}

function getSyncOutputRetainedSuffixLength(
  output: string,
  maxRootLength: number,
  rootPrefixes: Set<string>,
): number {
  const genericPathLength = getGenericAbsolutePathSuffixLength(output);
  const maxLength = Math.min(output.length, maxRootLength);
  for (let length = maxLength; length > 0; length -= 1) {
    const suffix = normalizeSyncOutputPath(output.slice(-length));
    if (rootPrefixes.has(suffix)) {
      return Math.max(length, genericPathLength);
    }
  }
  return genericPathLength;
}

function getGenericAbsolutePathSuffixLength(output: string): number {
  const absolutePathMatch = GENERIC_ABSOLUTE_PATH_SUFFIX_PATTERN.exec(output);
  const partialPrefixMatch = GENERIC_ABSOLUTE_PATH_PARTIAL_PREFIX_PATTERN.exec(
    output,
  );
  return Math.max(
    absolutePathMatch?.[1]?.length ?? 0,
    partialPrefixMatch?.[1]?.length ?? 0,
  );
}

function sanitizeSyncOutputWithPatterns(
  line: string,
  patterns: SyncOutputRedactionPatterns,
): string {
  const projectRedacted = patterns.projectRoots.reduce(
    (sanitized, pattern) => sanitized.replace(pattern, '<project-root>'),
    line,
  );
  const prefixRedacted = patterns.pathPrefixes.reduce(
    (sanitized, pattern) =>
      sanitized.replace(pattern, '<redacted-path-prefix>'),
    projectRedacted,
  );
  return prefixRedacted
    .replace(WINDOWS_ABSOLUTE_PATH_PATTERN, '<redacted-path>')
    .replace(
      UNC_ABSOLUTE_PATH_PATTERN,
      (_match, prefix: string) => `${prefix}<redacted-path>`,
    )
    .replace(
      POSIX_ABSOLUTE_PATH_PATTERN,
      (_match, prefix: string) => `${prefix}<redacted-path>`,
    );
}

function sanitizeSyncOutputLine(line: string, projectRoots: string[]): string {
  return sanitizeSyncOutputWithPatterns(
    line,
    createSyncOutputPatterns(projectRoots),
  );
}

function collectSyncFailureOutputLines(
  projectRoots: string[],
  stdout: string | undefined,
  stderr: string | undefined,
): string[] {
  const lines = `${stderr ?? ''}\n${stdout ?? ''}`
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith('>'))
    .filter((line) => !/^npm\s+(?:error|warn)\b/iu.test(line))
    .filter((line) => !isSyncStackFrameLine(line))
    .filter((line) => !/^Error:\s+Sync script failed:/u.test(line))
    .filter((line) => !/^❌\s+Project sync failed:/u.test(line))
    .map((line) => line.replace(/^❌\s+/u, ''))
    .map((line) => sanitizeSyncOutputLine(line, projectRoots));

  return Array.from(new Set(lines)).slice(
    0,
    CAPTURED_SYNC_DIAGNOSTIC_ITEM_LIMIT,
  );
}

function createSyncExecutionError(
  project: SyncProjectContext,
  plannedCommand: SyncPlannedCommand,
  result: SyncProcessResult,
  stdout: string | undefined,
  stderr: string | undefined,
  failureOutput: SyncFailureOutputSelection,
): Error {
  const projectRoots = resolveSyncProjectRoots(project.cwd);
  const artifacts = collectSyncArtifactIssues(
    project.cwd,
    projectRoots,
    stdout,
    stderr,
  );
  const artifactCheckIssues = collectSyncArtifactCheckIssues(
    project.cwd,
    projectRoots,
    stdout,
    stderr,
  );
  let commandDetail: string;
  const spawnErrorCode = (result.error as NodeJS.ErrnoException | undefined)
    ?.code;
  if (result.error) {
    const rawMessage = result.error.message.replace(/[.\s]+$/u, '');
    const message = sanitizeSyncOutputLine(rawMessage, projectRoots);
    commandDetail = `\`${plannedCommand.displayCommand}\` failed to start: ${message}.`;
  } else if (result.status !== null) {
    commandDetail = `\`${plannedCommand.displayCommand}\` failed with exit code ${result.status}.`;
  } else if (result.signal) {
    commandDetail = `\`${plannedCommand.displayCommand}\` was terminated by signal ${result.signal}.`;
  } else {
    commandDetail = `\`${plannedCommand.displayCommand}\` failed before reporting an exit code.`;
  }
  let processData: Record<string, number | string> = {};
  if (result.error) {
    const spawnError =
      typeof spawnErrorCode === 'string' ? spawnErrorCode : result.error.name;
    processData = { spawnError };
  } else {
    processData = {
      ...(result.status !== null ? { exitCode: result.status } : {}),
      ...(result.signal ? { signal: result.signal } : {}),
    };
  }

  if (
    (artifacts.length > 0 || artifactCheckIssues.length > 0) &&
    GENERATED_ARTIFACT_DRIFT_CONTEXT_PATTERN.test(
      `${stderr ?? ''}\n${stdout ?? ''}`,
    )
  ) {
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
        ...processData,
      },
      detailLines: [
        commandDetail,
        ...artifacts.map(
          (artifact) =>
            `${artifact.status === 'missing' ? 'Missing' : 'Stale'} generated artifact: ${artifact.path}.`,
        ),
        ...artifactCheckIssues.map(
          (issue) =>
            `Generated artifact check issue: ${issue.path} (${issue.detail}).`,
        ),
        `Run \`${applyCommand}\` to regenerate the artifacts, then rerun \`${plannedCommand.displayCommand}\`.`,
      ],
      error: result.error,
      summary: 'Generated artifacts are missing or stale.',
    });
  }

  const outputLines = collectSyncFailureOutputLines(
    projectRoots,
    failureOutput.stdout ? stdout : undefined,
    failureOutput.stderr ? stderr : undefined,
  );
  return createCliCommandError({
    code: CLI_DIAGNOSTIC_CODES.COMMAND_EXECUTION,
    command: 'sync',
    data: {
      command: plannedCommand.displayCommand,
      ...processData,
    },
    detailLines: [commandDetail, ...outputLines],
    error: result.error,
    summary: 'A generated project sync command failed.',
  });
}

async function runProjectScript(
  project: SyncProjectContext,
  plannedCommand: SyncPlannedCommand,
  options: {
    captureOutput: boolean;
    onStderr?: SyncOutputWriter;
    onStdout?: SyncOutputWriter;
  },
): Promise<SyncExecutedCommand> {
  const pipeStderr = options.captureOutput || options.onStderr !== undefined;
  const pipeStdout = options.captureOutput || options.onStdout !== undefined;
  const stderrCapture = new BoundedSyncOutputCapture();
  const stdoutCapture = new BoundedSyncOutputCapture();
  const projectRoots = resolveSyncProjectRoots(project.cwd);
  const stdoutStream = options.onStdout
    ? new SanitizedSyncOutputStream(projectRoots, options.onStdout)
    : undefined;
  const stderrStream = options.onStderr
    ? new SanitizedSyncOutputStream(projectRoots, options.onStderr)
    : undefined;
  const hideCapturedPrompts =
    options.captureOutput &&
    options.onStdout === undefined &&
    options.onStderr === undefined;
  const child = spawn(plannedCommand.command, plannedCommand.args, {
    cwd: project.cwd,
    shell: process.platform === 'win32',
    stdio:
      pipeStdout || pipeStderr
        ? [
            hideCapturedPrompts ? 'ignore' : 'inherit',
            pipeStdout ? 'pipe' : 'inherit',
            pipeStderr ? 'pipe' : 'inherit',
          ]
        : 'inherit',
  });
  let spawnError: Error | undefined;
  const pendingOutputWrites = new Set<Promise<void>>();
  const recordOutputError = (error: unknown) => {
    spawnError ??= error instanceof Error ? error : new Error(String(error));
  };
  const trackOutputWrite = (
    stream: NonNullable<typeof child.stdout>,
    writeResult: PromiseLike<void> | void,
  ) => {
    if (!writeResult) {
      return;
    }
    stream.pause();
    const trackedWrite = Promise.resolve(writeResult)
      .catch(recordOutputError)
      .finally(() => {
        pendingOutputWrites.delete(trackedWrite);
        stream.resume();
      });
    pendingOutputWrites.add(trackedWrite);
  };

  child.stdout?.on('data', (chunk: Buffer) => {
    if (options.captureOutput) {
      stdoutCapture.append(chunk);
    }
    try {
      trackOutputWrite(child.stdout!, stdoutStream?.append(chunk));
    } catch (error) {
      recordOutputError(error);
    }
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    if (options.captureOutput) {
      stderrCapture.append(chunk);
    }
    try {
      trackOutputWrite(child.stderr!, stderrStream?.append(chunk));
    } catch (error) {
      recordOutputError(error);
    }
  });
  child.once('error', (error) => {
    spawnError ??= error;
  });
  // Readable stream failures must feed the command diagnostic instead of
  // becoming uncaught async exceptions outside the sync error boundary.
  child.stdout?.once('error', (error) => {
    spawnError ??= error;
  });
  child.stderr?.once('error', (error) => {
    spawnError ??= error;
  });

  const closeResult = await new Promise<
    Pick<SyncProcessResult, 'signal' | 'status'>
  >((resolve) => {
    child.once('close', (status, signal) => {
      resolve({
        signal,
        status,
      });
    });
  });
  await Promise.all(pendingOutputWrites);
  try {
    await Promise.all([
      Promise.resolve(stderrStream?.flush()),
      Promise.resolve(stdoutStream?.flush()),
    ]);
  } catch (error) {
    recordOutputError(error);
  }
  const failed = spawnError !== undefined || closeResult.status !== 0;
  const stderr = options.captureOutput
    ? stderrCapture.toString(failed)
    : undefined;
  const stdout = options.captureOutput
    ? stdoutCapture.toString(failed)
    : undefined;
  const result: SyncProcessResult = {
    ...closeResult,
    ...(spawnError ? { error: spawnError } : {}),
  };

  if (result.error || result.status !== 0) {
    throw createSyncExecutionError(
      project,
      plannedCommand,
      result,
      stdout,
      stderr,
      {
        stderr: options.onStderr === undefined,
        stdout: options.onStdout === undefined,
      },
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
  onStderr,
  onStdout,
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
  // Keep legacy split sync plans ordered because later scripts can consume
  // generated type and REST artifacts produced by earlier commands.
  result.executedCommands = [];
  for (const plannedCommand of plannedCommands) {
    result.executedCommands.push(
      await runProjectScript(project, plannedCommand, {
        captureOutput,
        onStderr,
        onStdout,
      }),
    );
  }
  return result;
}
