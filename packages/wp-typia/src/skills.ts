import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  COMMAND_OPTION_METADATA_BY_GROUP,
  type CommandOptionMetadataMap,
} from './command-option-metadata';
import { WP_TYPIA_COMMAND_REGISTRY } from './command-registry';

export type SkillAgent = {
  detectPath: string;
  globalSkillsDir: string;
  name: string;
  projectSkillsDir: string;
  universal: boolean;
};

export type SkillAgentSummary = {
  globalSkillsDir: string;
  name: string;
  projectSkillsDir: string;
  universal: boolean;
};

export type SkillCommandSummary = {
  description?: string;
  name: string;
  options: string[];
  subcommands: string[];
};

export type SkillsListResult = {
  agents: SkillAgentSummary[];
  commands: SkillCommandSummary[];
};

export type SkillInstall = {
  agent: string;
  mode: 'copy' | 'skipped' | 'symlink';
  path: string;
  reason?: string;
};

export type SkillsGitignoreUpdate = {
  entries: string[];
  path: string;
  updated: boolean;
};

export type SkillsSyncResult = {
  agents: SkillInstall[];
  gitignore?: SkillsGitignoreUpdate;
  paths: string[];
  updated: boolean;
};

type SkillRuntime = {
  dataHome: () => string;
  homeDir: () => string;
};

const defaultSkillRuntime: SkillRuntime = {
  dataHome: () =>
    process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
  homeDir: () => os.homedir(),
};
const GENERATED_SKILL_MARKER = '.wp-typia-skill.json';
const LOCAL_SKILL_GITIGNORE_ENTRY = '.agents/skills/wp-typia/';
const SKILL_FILE = 'SKILL.md';

function configHome(home: string): string {
  return process.env.XDG_CONFIG_HOME || path.join(home, '.config');
}

function codexHome(home: string): string {
  return process.env.CODEX_HOME?.trim() || path.join(home, '.codex');
}

function claudeHome(home: string): string {
  return process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(home, '.claude');
}

export function getBuiltinSkillAgents(
  runtime: SkillRuntime = defaultSkillRuntime,
): SkillAgent[] {
  const home = runtime.homeDir();
  const xdgConfigHome = configHome(home);
  const resolvedCodexHome = codexHome(home);
  const resolvedClaudeHome = claudeHome(home);

  return [
    {
      detectPath: path.join(xdgConfigHome, 'amp'),
      globalSkillsDir: path.join(xdgConfigHome, 'agents', 'skills'),
      name: 'Amp',
      projectSkillsDir: '.agents/skills',
      universal: true,
    },
    {
      detectPath: resolvedCodexHome,
      globalSkillsDir: path.join(resolvedCodexHome, 'skills'),
      name: 'Codex',
      projectSkillsDir: '.agents/skills',
      universal: true,
    },
    {
      detectPath: path.join(home, '.cursor'),
      globalSkillsDir: path.join(home, '.cursor', 'skills'),
      name: 'Cursor',
      projectSkillsDir: '.agents/skills',
      universal: true,
    },
    {
      detectPath: path.join(home, '.gemini'),
      globalSkillsDir: path.join(home, '.gemini', 'skills'),
      name: 'Gemini CLI',
      projectSkillsDir: '.agents/skills',
      universal: true,
    },
    {
      detectPath: path.join(xdgConfigHome, 'opencode'),
      globalSkillsDir: path.join(xdgConfigHome, 'opencode', 'skills'),
      name: 'OpenCode',
      projectSkillsDir: '.agents/skills',
      universal: true,
    },
    {
      detectPath: resolvedClaudeHome,
      globalSkillsDir: path.join(resolvedClaudeHome, 'skills'),
      name: 'Claude Code',
      projectSkillsDir: '.claude/skills',
      universal: false,
    },
    {
      detectPath: path.join(home, '.continue'),
      globalSkillsDir: path.join(home, '.continue', 'skills'),
      name: 'Continue',
      projectSkillsDir: '.continue/skills',
      universal: false,
    },
    {
      detectPath: path.join(home, '.codeium', 'windsurf'),
      globalSkillsDir: path.join(home, '.codeium', 'windsurf', 'skills'),
      name: 'Windsurf',
      projectSkillsDir: '.windsurf/skills',
      universal: false,
    },
  ];
}

export function detectSkillAgents(
  agents = getBuiltinSkillAgents(),
): SkillAgent[] {
  return agents.filter((agent) => fs.existsSync(agent.detectPath));
}

function summarizeAgent(agent: SkillAgent): SkillAgentSummary {
  return {
    globalSkillsDir: agent.globalSkillsDir,
    name: agent.name,
    projectSkillsDir: agent.projectSkillsDir,
    universal: agent.universal,
  };
}

function optionNamesForGroups(
  groupNames: readonly (keyof typeof COMMAND_OPTION_METADATA_BY_GROUP)[],
): string[] {
  const options = new Set<string>();
  for (const groupName of groupNames) {
    const metadata: CommandOptionMetadataMap =
      COMMAND_OPTION_METADATA_BY_GROUP[groupName];
    for (const [optionName, option] of Object.entries(metadata)) {
      if (!option.hidden) {
        options.add(optionName);
      }
    }
  }
  return [...options].sort();
}

export function getSkillCommandSummaries(): SkillCommandSummary[] {
  return WP_TYPIA_COMMAND_REGISTRY.map((command) => ({
    description: 'description' in command ? command.description : undefined,
    name: command.name,
    options: optionNamesForGroups(command.optionGroups),
    subcommands:
      'subcommands' in command ? [...(command.subcommands ?? [])] : [],
  }));
}

export function listSkills(): SkillsListResult {
  return {
    agents: detectSkillAgents().map(summarizeAgent),
    commands: getSkillCommandSummaries(),
  };
}

function renderFrontmatter(fields: Record<string, string>): string {
  return [
    '---',
    ...Object.entries(fields).map(([key, value]) =>
      key === 'name' && /^[a-z0-9][a-z0-9-]*$/u.test(value)
        ? `${key}: ${value}`
        : `${key}: ${JSON.stringify(value)}`,
    ),
    '---',
  ].join('\n');
}

export function generateSkillMarkdown(): string {
  const commands = getSkillCommandSummaries();
  const lines = [
    renderFrontmatter({
      description: 'wp-typia scaffolding and project workflow commands.',
      name: 'wp-typia',
    }),
    '',
    '# wp-typia',
    '',
    'Use `wp-typia` for WordPress block scaffolding, retrofit planning, generated-project sync, migrations, diagnostics, MCP metadata, shell completions, and skill installation.',
    '',
    '## Commands',
    '',
  ];

  for (const command of commands) {
    lines.push(
      `- \`wp-typia ${command.name}\`: ${command.description ?? command.name}`,
    );
    if (command.subcommands.length > 0) {
      lines.push(`  Subcommands: ${command.subcommands.join(', ')}`);
    }
    if (command.options.length > 0) {
      lines.push(
        `  Options: ${command.options.map((option) => `--${option}`).join(', ')}`,
      );
    }
  }

  lines.push(
    '',
    'Prefer `--format json` for automation and agent-readable diagnostics.',
    '',
  );

  return `${lines.join('\n')}\n`;
}

function stalenessCacheKey(
  name: string,
  isGlobal: boolean,
  cwd: string,
  canonicalBase: string,
): string {
  const scope = isGlobal
    ? `global:${path.resolve(canonicalBase)}`
    : `local:${path.resolve(cwd)}`;
  const scopeHash = createHash('sha256')
    .update(scope)
    .digest('hex')
    .slice(0, 8);
  return `${name}-${scopeHash}`;
}

function statePath(cacheKey: string, runtime: SkillRuntime): string {
  return path.join(runtime.dataHome(), 'wp-typia', `${cacheKey}-skills.json`);
}

function readState(
  cacheKey: string,
  runtime: SkillRuntime,
): { agentKey?: string; hash: string } | undefined {
  try {
    const state = JSON.parse(
      fs.readFileSync(statePath(cacheKey, runtime), 'utf8'),
    );
    if (typeof state?.hash !== 'string') {
      return undefined;
    }
    return {
      agentKey: typeof state.agentKey === 'string' ? state.agentKey : undefined,
      hash: state.hash,
    };
  } catch {
    return undefined;
  }
}

function writeState(
  cacheKey: string,
  state: { agentKey: string; hash: string },
  runtime: SkillRuntime,
): void {
  const filePath = statePath(cacheKey, runtime);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({ ...state, at: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
}

function getAgentSkillDirs(
  agents: SkillAgent[],
  canonicalDir: string,
  skillName: string,
  isGlobal: boolean,
  cwd: string,
): string[] {
  return agents
    .map((agent) =>
      isGlobal
        ? path.join(agent.globalSkillsDir, skillName)
        : path.join(cwd, agent.projectSkillsDir, skillName),
    )
    .filter((target) => target !== canonicalDir);
}

function computeAgentKey(targets: string[]): string {
  return createHash('sha256')
    .update(JSON.stringify([...targets].sort()))
    .digest('hex')
    .slice(0, 16);
}

function skillTargetsAreCurrent(
  canonicalDir: string,
  agentDirs: string[],
  content: string,
): boolean {
  for (const targetDir of [canonicalDir, ...agentDirs]) {
    try {
      if (
        fs.readFileSync(path.join(targetDir, SKILL_FILE), 'utf8') !== content
      ) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

function skillFileMatches(targetDir: string, content: string): boolean {
  try {
    return (
      fs.readFileSync(path.join(targetDir, SKILL_FILE), 'utf8') === content
    );
  } catch {
    return false;
  }
}

function hasGeneratedSkillMarker(targetDir: string): boolean {
  try {
    const marker = JSON.parse(
      fs.readFileSync(path.join(targetDir, GENERATED_SKILL_MARKER), 'utf8'),
    );
    return marker?.tool === 'wp-typia' && marker?.skill === 'wp-typia';
  } catch {
    return false;
  }
}

function isEmptyDirectory(targetDir: string): boolean {
  try {
    const stat = fs.lstatSync(targetDir);
    return stat.isDirectory() && fs.readdirSync(targetDir).length === 0;
  } catch {
    return false;
  }
}

function skillTargetLooksGenerated(
  targetDir: string,
  content: string,
): boolean {
  try {
    const stat = fs.lstatSync(targetDir);
    if (stat.isSymbolicLink()) {
      return skillFileMatches(targetDir, content);
    }
    if (!stat.isDirectory() || !skillFileMatches(targetDir, content)) {
      return false;
    }

    const generatedEntries = new Set([GENERATED_SKILL_MARKER, SKILL_FILE]);
    return fs
      .readdirSync(targetDir)
      .every((entry) => generatedEntries.has(entry));
  } catch {
    return false;
  }
}

function canReplaceSkillTarget(
  targetDir: string,
  content: string,
  force: boolean,
): boolean {
  if (force) {
    return true;
  }

  try {
    fs.lstatSync(targetDir);
  } catch {
    return true;
  }

  return (
    hasGeneratedSkillMarker(targetDir) ||
    skillTargetLooksGenerated(targetDir, content) ||
    isEmptyDirectory(targetDir)
  );
}

function writeGeneratedSkillMarker(targetDir: string, hash: string): void {
  fs.writeFileSync(
    path.join(targetDir, GENERATED_SKILL_MARKER),
    `${JSON.stringify(
      {
        hash,
        skill: 'wp-typia',
        tool: 'wp-typia',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

function removeExisting(target: string): void {
  try {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(target);
      return;
    }
    fs.rmSync(target, { force: true, recursive: true });
  } catch {
    // Target does not exist.
  }
}

function resolveParent(dir: string): string {
  try {
    return fs.realpathSync(dir);
  } catch {
    const parent = path.dirname(dir);
    if (parent === dir) {
      return dir;
    }
    try {
      return path.join(fs.realpathSync(parent), path.relative(parent, dir));
    } catch {
      return dir;
    }
  }
}

function detectLineEnding(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

async function ensureLocalSkillsGitignore(
  cwd: string,
): Promise<SkillsGitignoreUpdate> {
  const gitignorePath = path.join(cwd, '.gitignore');
  const entries = [LOCAL_SKILL_GITIGNORE_ENTRY];
  let content = '';
  let exists = true;

  try {
    content = await fsp.readFile(gitignorePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    exists = false;
  }

  const lines = content.split(/\r?\n/u).map((line) => line.trim());
  const missingEntries = entries.filter((entry) => !lines.includes(entry));
  if (missingEntries.length === 0) {
    return { entries, path: gitignorePath, updated: false };
  }

  const lineEnding = exists ? detectLineEnding(content) : '\n';
  let nextContent = content;
  if (nextContent.length > 0 && !nextContent.endsWith('\n')) {
    nextContent += lineEnding;
  }
  nextContent += missingEntries.map((entry) => `${entry}${lineEnding}`).join('');

  await fsp.writeFile(gitignorePath, nextContent, 'utf8');

  return { entries, path: gitignorePath, updated: true };
}

export async function syncSkills(
  options: {
    cwd?: string;
    force?: boolean;
    global?: boolean;
    runtime?: SkillRuntime;
  } = {},
): Promise<SkillsSyncResult> {
  const runtime = options.runtime ?? defaultSkillRuntime;
  const cwd = options.cwd ?? process.cwd();
  const isGlobal = options.global ?? true;
  const skillName = 'wp-typia';
  const canonicalBase = path.join(
    isGlobal ? runtime.homeDir() : cwd,
    '.agents',
    'skills',
  );
  const canonicalDir = path.join(canonicalBase, skillName);
  const detectedAgents = detectSkillAgents(getBuiltinSkillAgents(runtime));
  const agentDirs = getAgentSkillDirs(
    detectedAgents,
    canonicalDir,
    skillName,
    isGlobal,
    cwd,
  );
  const agentKey = computeAgentKey(agentDirs);
  const content = generateSkillMarkdown();
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  const cacheKey = stalenessCacheKey(skillName, isGlobal, cwd, canonicalBase);
  const previousState = readState(cacheKey, runtime);
  const gitignore = isGlobal ? undefined : await ensureLocalSkillsGitignore(cwd);

  if (
    !options.force &&
    previousState?.hash === hash &&
    previousState.agentKey === agentKey &&
    skillTargetsAreCurrent(canonicalDir, agentDirs, content)
  ) {
    return {
      agents: [],
      gitignore,
      paths: [],
      updated: Boolean(gitignore?.updated),
    };
  }

  await fsp.mkdir(canonicalDir, { recursive: true });
  await fsp.writeFile(path.join(canonicalDir, SKILL_FILE), content, 'utf8');
  writeGeneratedSkillMarker(canonicalDir, hash);

  const installs: SkillInstall[] = [];
  for (const agent of detectedAgents) {
    const agentSkillsDir = isGlobal
      ? agent.globalSkillsDir
      : path.join(cwd, agent.projectSkillsDir);
    const agentDir = path.join(agentSkillsDir, skillName);
    if (agentDir === canonicalDir) {
      continue;
    }
    if (!canReplaceSkillTarget(agentDir, content, Boolean(options.force))) {
      installs.push({
        agent: agent.name,
        mode: 'skipped',
        path: agentDir,
        reason: 'existing skill is not managed by wp-typia',
      });
      continue;
    }

    try {
      removeExisting(agentDir);
      fs.mkdirSync(path.dirname(agentDir), { recursive: true });
      const relativeTarget = path.relative(
        resolveParent(path.dirname(agentDir)),
        resolveParent(canonicalDir),
      );
      fs.symlinkSync(relativeTarget, agentDir);
      installs.push({ agent: agent.name, mode: 'symlink', path: agentDir });
    } catch {
      fs.cpSync(canonicalDir, agentDir, { recursive: true });
      installs.push({ agent: agent.name, mode: 'copy', path: agentDir });
    }
  }

  writeState(cacheKey, { agentKey, hash }, runtime);

  return {
    agents: installs,
    gitignore,
    paths: [canonicalDir],
    updated: true,
  };
}
