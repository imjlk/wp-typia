import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'bun:test';

import { CLI_DIAGNOSTIC_CODES } from '@wp-typia/project-tools/cli-diagnostics';

import { detectAIAgents } from '../src/ai-agent-detection';
import {
  prefersStructuredCliArgv,
  prefersStructuredCliOutput,
} from '../src/cli-diagnostic-output';
import { renderCompletionScript } from '../src/completions';
import { loadMcpToolGroups, syncMcpSchemas } from '../src/mcp';
import { getSkillCommandSummaries, syncSkills } from '../src/skills';

const AI_ENV_KEYS = [
  'AGENT',
  'AMP_CURRENT_THREAD_ID',
  'CLAUDE_CODE',
  'CLAUDECODE',
  'CODEX_CI',
  'CODEX_SANDBOX',
  'CODEX_THREAD_ID',
  'CURSOR_AGENT',
  'GEMINI_CLI',
  'OPENCODE',
] as const;

function withProcessEnv<T>(
  overrides: Partial<NodeJS.ProcessEnv>,
  callback: () => T,
): T {
  const keys = new Set([...AI_ENV_KEYS, ...Object.keys(overrides)]);
  const previous = new Map<string, string | undefined>();

  for (const key of keys) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }

  try {
    return callback();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

describe('Gunshi public CLI surfaces', () => {
  test('detects supported AI-agent environments and structured-output defaults', () => {
    expect(detectAIAgents({ CODEX_THREAD_ID: 'thread-1' }).aiAgents).toEqual([
      'codex',
    ]);
    expect(detectAIAgents({ AGENT: 'amp' }).aiAgents).toEqual(['amp']);
    expect(detectAIAgents({ OPENCODE: '1' }).aiAgents).toEqual(['opencode']);
    expect(
      detectAIAgents({
        CLAUDE_CODE: '1',
        CURSOR_AGENT: '1',
        GEMINI_CLI: '1',
      }).aiAgents,
    ).toEqual(['claude', 'cursor', 'gemini']);

    withProcessEnv({ CODEX_SANDBOX: 'read-write' }, () => {
      expect(prefersStructuredCliArgv(['doctor'])).toBe(true);
      expect(prefersStructuredCliArgv(['doctor', '--format', 'text'])).toBe(
        false,
      );
      expect(prefersStructuredCliArgv(['doctor', '--format=json'])).toBe(true);
    });

    withProcessEnv({}, () => {
      expect(prefersStructuredCliArgv(['doctor'])).toBe(false);
      expect(
        prefersStructuredCliOutput({
          context: { store: { isAIAgent: true } },
          output: () => undefined,
        }),
      ).toBe(true);
    });
  });

  test('renders first-party shell completion scripts for public aliases', () => {
    const bash = renderCompletionScript('bash');
    const zsh = renderCompletionScript('zsh');
    const fish = renderCompletionScript('fish');

    expect(bash).toContain('# bash completion for wp-typia');
    expect(bash).toContain('wp-typia complete -- bash');
    expect(zsh).toContain('#compdef wp-typia');
    expect(fish).toContain('complete -c wp-typia');
    expect(fish).toContain('-a "skills"');
  });

  test('derives skill command metadata and syncs compact SKILL.md files', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-typia-skills-'));
    const home = path.join(tempRoot, 'home');
    const cwd = path.join(tempRoot, 'project');
    const dataHome = path.join(tempRoot, 'data');

    try {
      fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
      fs.mkdirSync(cwd, { recursive: true });

      const commands = getSkillCommandSummaries();
      expect(
        commands.find((command) => command.name === 'skills'),
      ).toMatchObject({
        options: ['force', 'global', 'local'],
        subcommands: ['list', 'sync'],
      });
      expect(commands.find((command) => command.name === 'mcp')).toMatchObject({
        subcommands: ['list', 'sync'],
      });
      expect(commands.find((command) => command.name === 'add')?.options).toContain(
        'tags',
      );
      expect(
        commands.find((command) => command.name === 'add')?.options,
      ).not.toContain('tag');

      const result = await withProcessEnv(
        {
          CODEX_HOME: path.join(home, '.codex'),
          XDG_CONFIG_HOME: path.join(home, '.config'),
          XDG_DATA_HOME: dataHome,
        },
        () =>
          syncSkills({
            cwd,
            global: true,
            runtime: {
              dataHome: () => dataHome,
              homeDir: () => home,
            },
          }),
      );

      const canonicalSkill = path.join(
        home,
        '.agents',
        'skills',
        'wp-typia',
        'SKILL.md',
      );
      const codexSkill = path.join(home, '.codex', 'skills', 'wp-typia');

      expect(result.updated).toBe(true);
      expect(result.paths).toContain(path.dirname(canonicalSkill));
      expect(fs.readFileSync(canonicalSkill, 'utf8')).toContain(
        '`wp-typia skills`',
      );
      expect(fs.existsSync(codexSkill)).toBe(true);
      expect(result.agents).toContainEqual(
        expect.objectContaining({
          agent: 'Codex',
          path: codexSkill,
        }),
      );

      fs.rmSync(codexSkill, { force: true, recursive: true });
      const resync = await withProcessEnv(
        {
          CODEX_HOME: path.join(home, '.codex'),
          XDG_CONFIG_HOME: path.join(home, '.config'),
          XDG_DATA_HOME: dataHome,
        },
        () =>
          syncSkills({
            cwd,
            global: true,
            runtime: {
              dataHome: () => dataHome,
              homeDir: () => home,
            },
          }),
      );

      expect(resync.updated).toBe(true);
      expect(fs.existsSync(path.join(codexSkill, 'SKILL.md'))).toBe(true);

      fs.rmSync(codexSkill, { force: true, recursive: true });
      fs.mkdirSync(codexSkill, { recursive: true });
      fs.writeFileSync(path.join(codexSkill, 'SKILL.md'), '# Custom skill\n');
      const preserved = await withProcessEnv(
        {
          CODEX_HOME: path.join(home, '.codex'),
          XDG_CONFIG_HOME: path.join(home, '.config'),
          XDG_DATA_HOME: dataHome,
        },
        () =>
          syncSkills({
            cwd,
            global: true,
            runtime: {
              dataHome: () => dataHome,
              homeDir: () => home,
            },
          }),
      );

      expect(preserved.agents).toContainEqual(
        expect.objectContaining({
          agent: 'Codex',
          mode: 'skipped',
          path: codexSkill,
          reason: expect.stringContaining('not managed by wp-typia'),
        }),
      );
      expect(fs.readFileSync(path.join(codexSkill, 'SKILL.md'), 'utf8')).toBe(
        '# Custom skill\n',
      );

      const generatedSkill = fs.readFileSync(canonicalSkill, 'utf8');
      fs.writeFileSync(path.join(codexSkill, 'SKILL.md'), generatedSkill);
      fs.writeFileSync(path.join(codexSkill, 'NOTES.md'), 'keep me\n');
      const extraFileDataHome = path.join(tempRoot, 'data-extra-file');
      const preservedExtraFile = await withProcessEnv(
        {
          CODEX_HOME: path.join(home, '.codex'),
          XDG_CONFIG_HOME: path.join(home, '.config'),
          XDG_DATA_HOME: extraFileDataHome,
        },
        () =>
          syncSkills({
            cwd,
            global: true,
            runtime: {
              dataHome: () => extraFileDataHome,
              homeDir: () => home,
            },
          }),
      );

      expect(preservedExtraFile.agents).toContainEqual(
        expect.objectContaining({
          agent: 'Codex',
          mode: 'skipped',
          path: codexSkill,
        }),
      );
      expect(fs.readFileSync(path.join(codexSkill, 'NOTES.md'), 'utf8')).toBe(
        'keep me\n',
      );
    } finally {
      fs.rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  test('syncs MCP schemas to the new default directory and custom output directory', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-typia-mcp-'));
    const schemaPath = path.join(tempRoot, 'tools.json');

    try {
      writeJson(schemaPath, [
        {
          description: 'Create a typed block scaffold.',
          inputSchema: {
            properties: {
              blockName: {
                description: '[-b] Block name.',
                type: 'string',
              },
              count: {
                default: 1,
                minimum: 1,
                type: 'integer',
              },
              enabled: {
                minimum: 1,
                type: 'boolean',
              },
              severity: {
                enum: [1],
                maximum: 5,
                minimum: 1,
                type: 'integer',
              },
            },
            required: ['blockName'],
            type: 'object',
          },
          name: 'CreateBlock',
        },
      ]);

      const defaultSync = await syncMcpSchemas(tempRoot, [
        { namespace: 'wp', path: schemaPath },
      ]);
      const customDir = path.join(tempRoot, '.cache', 'mcp');
      const customSync = await syncMcpSchemas(
        tempRoot,
        [{ namespace: 'wp', path: schemaPath }],
        customDir,
      );
      const registry = JSON.parse(
        fs.readFileSync(
          path.join(defaultSync.outputDir, 'registry.json'),
          'utf8',
        ),
      ) as Array<{
        namespace: string;
        tools: Array<{ name: string; options: Record<string, unknown> }>;
      }>;
      const generated = fs.readFileSync(
        path.join(defaultSync.outputDir, 'mcp-wp.gen.ts'),
        'utf8',
      );

      expect(defaultSync.outputDir).toBe(
        path.join(tempRoot, '.wp-typia', 'mcp'),
      );
      expect(defaultSync.commandCount).toBe(1);
      expect(customSync.outputDir).toBe(customDir);
      expect(
        fs.existsSync(path.join(defaultSync.outputDir, 'mcp-index.gen.ts')),
      ).toBe(true);
      expect(registry[0]?.namespace).toBe('wp');
      expect(registry[0]?.tools[0]?.name).toBe('wp:create-block');
      expect(registry[0]?.tools[0]?.options).toHaveProperty('block-name');
      expect(generated).toContain("import { z } from 'zod';");
      expect(generated).toContain(
        "'count': z.coerce.number().int().min(1).default(1),",
      );
      expect(generated).toContain("'enabled': z.boolean().optional(),");
      expect(generated).toContain("'severity': z.literal(1).optional(),");
      expect(generated).not.toContain('z.union([z.literal(1)])');
      expect(generated).not.toContain('z.boolean().min(');
      expect(generated).not.toContain('z.literal(1).min(');
      expect(generated).not.toContain('@bunli');
    } finally {
      fs.rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  test('syncs MCP schemas with path-like namespaces and multiline descriptions', async () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-mcp-safe-'),
    );
    const schemaPath = path.join(tempRoot, 'tools.json');

    try {
      writeJson(schemaPath, [
        {
          description: 'Create a typed block scaffold.\nGenerated by docs.',
          name: 'CreateBlock',
        },
      ]);

      const result = await syncMcpSchemas(tempRoot, [
        { namespace: 'my-plugin/v1', path: schemaPath },
      ]);
      const generatedFile = fs
        .readdirSync(result.outputDir)
        .find((file) => /^mcp-my-plugin-v1-[a-z0-9]+\.gen\.ts$/u.test(file));

      expect(generatedFile).toBeDefined();
      if (!generatedFile) {
        throw new Error(
          'Expected syncMcpSchemas to generate a safe namespace file.',
        );
      }
      expect(fs.existsSync(path.join(result.outputDir, 'mcp-my-plugin'))).toBe(
        false,
      );

      const generated = fs.readFileSync(
        path.join(result.outputDir, generatedFile),
        'utf8',
      );
      const index = fs.readFileSync(
        path.join(result.outputDir, 'mcp-index.gen.ts'),
        'utf8',
      );

      expect(generated).toContain('// Create a typed block scaffold.');
      expect(generated).toContain('// Generated by docs.');
      expect(generated).toContain('export const MyPluginV1CreateBlockSchema');
      expect(index).toContain(
        `export * from './${generatedFile.replace(/\.ts$/u, '.js')}';`,
      );
    } finally {
      fs.rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  test('syncs MCP schemas with digit-starting tool identifiers', async () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-mcp-digit-'),
    );
    const schemaPath = path.join(tempRoot, 'tools.json');

    try {
      writeJson(schemaPath, {
        namespace: '123-mcp',
        tools: [
          {
            description: 'Export a numbered tool.',
            name: '123-export',
          },
        ],
      });

      const result = await syncMcpSchemas(tempRoot, [
        { namespace: 'wp', path: schemaPath },
      ]);
      const generated = fs.readFileSync(
        path.join(result.outputDir, 'mcp-123-mcp.gen.ts'),
        'utf8',
      );

      expect(generated).toContain('export const Mcp123Mcp123ExportSchema');
      expect(generated).toContain('export type Mcp123Mcp123ExportFlags');
      expect(generated).not.toContain('export const 123Mcp123ExportSchema');
    } finally {
      fs.rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  test('rejects malformed MCP schema sources with diagnostic codes', async () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-mcp-invalid-'),
    );
    const malformedJsonPath = path.join(tempRoot, 'malformed.json');
    const invalidShapePath = path.join(tempRoot, 'invalid-shape.json');

    try {
      fs.writeFileSync(malformedJsonPath, '{ nope', 'utf8');
      writeJson(invalidShapePath, [{ name: 1 }]);

      await expect(
        loadMcpToolGroups(tempRoot, [
          { namespace: 'bad', path: malformedJsonPath },
        ]),
      ).rejects.toMatchObject({
        code: CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      });
      await expect(
        loadMcpToolGroups(tempRoot, [
          { namespace: 'bad', path: invalidShapePath },
        ]),
      ).rejects.toMatchObject({
        code: CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      });
    } finally {
      fs.rmSync(tempRoot, { force: true, recursive: true });
    }
  });
});
