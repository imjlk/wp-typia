import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  SAMCHON_GRAPH_POLICY,
  validateSamchonGraphConfig,
} from '../../scripts/validate-samchon-graph-config.mjs';

let tempDir = '';

afterEach(() => {
  if (tempDir) fs.rmSync(tempDir, { force: true, recursive: true });
  tempDir = '';
});

function createFixture(version: string = SAMCHON_GRAPH_POLICY.version) {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'samchon-graph-config-'));
  fs.mkdirSync(path.join(tempDir, '.codex'));
  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify({
      devDependencies: { [SAMCHON_GRAPH_POLICY.packageName]: version },
    }),
  );
  fs.writeFileSync(
    path.join(tempDir, SAMCHON_GRAPH_POLICY.configFile),
    `[mcp_servers.samchon-graph]\ncommand = "node"\nargs = ["scripts/run-samchon-graph.mjs"]\ncwd = ".."\nstartup_timeout_sec = 120.0\n\n[mcp_servers.samchon-graph.tools.inspect_code_graph]\napproval_mode = "approve"\n`,
  );
  return tempDir;
}

describe('samchon-graph project configuration', () => {
  test('accepts the pinned local binary and bounded language set', () => {
    expect(validateSamchonGraphConfig(createFixture())).toEqual({
      errors: [],
      valid: true,
    });
  });

  test('rejects dependency version drift', () => {
    const result = validateSamchonGraphConfig(createFixture('latest'));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('must remain pinned');
  });

  test('rejects a non-Node launcher command', () => {
    const root = createFixture();
    const configPath = path.join(root, SAMCHON_GRAPH_POLICY.configFile);
    fs.writeFileSync(
      configPath,
      fs
        .readFileSync(configPath, 'utf8')
        .replace('command = "node"', 'command = "sh"'),
    );
    const result = validateSamchonGraphConfig(root);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'samchon-graph must use the repository-root launcher.',
    );
  });

  test('rejects additional launcher arguments', () => {
    const root = createFixture();
    const configPath = path.join(root, SAMCHON_GRAPH_POLICY.configFile);
    fs.writeFileSync(
      configPath,
      fs
        .readFileSync(configPath, 'utf8')
        .replace(
          '"scripts/run-samchon-graph.mjs"]',
          '"scripts/run-samchon-graph.mjs", "--language", "javascript"]',
        ),
    );
    expect(validateSamchonGraphConfig(root).valid).toBe(false);
  });

  test('rejects a launcher outside the repository scripts', () => {
    const root = createFixture();
    const configPath = path.join(root, SAMCHON_GRAPH_POLICY.configFile);
    fs.writeFileSync(
      configPath,
      fs
        .readFileSync(configPath, 'utf8')
        .replace('scripts/run-samchon-graph.mjs', 'samchon-graph'),
    );
    expect(validateSamchonGraphConfig(root).valid).toBe(false);
  });

  test('rejects a launcher that leaves the graph working directory nested', () => {
    const root = createFixture();
    const configPath = path.join(root, SAMCHON_GRAPH_POLICY.configFile);
    fs.writeFileSync(
      configPath,
      fs.readFileSync(configPath, 'utf8').replace('cwd = ".."', 'cwd = "."'),
    );
    expect(validateSamchonGraphConfig(root).valid).toBe(false);
  });

  test('rejects startup timeout drift', () => {
    const root = createFixture();
    const configPath = path.join(root, SAMCHON_GRAPH_POLICY.configFile);
    fs.writeFileSync(
      configPath,
      fs
        .readFileSync(configPath, 'utf8')
        .replace('startup_timeout_sec = 120.0', 'startup_timeout_sec = 10.0'),
    );
    const result = validateSamchonGraphConfig(root);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'samchon-graph startup timeout must remain 120 seconds.',
    );
  });

  test('keeps static TypeScript and PHP launcher policy explicit', () => {
    expect(SAMCHON_GRAPH_POLICY.mode).toBe('static');
    expect(SAMCHON_GRAPH_POLICY.languages).toEqual(['typescript', 'php']);
  });

  test('accepts comments that mention the server table', () => {
    const root = createFixture();
    const configPath = path.join(root, SAMCHON_GRAPH_POLICY.configFile);
    const config = fs.readFileSync(configPath, 'utf8');
    fs.writeFileSync(
      configPath,
      `# [mcp_servers.samchon-graph]\n# command = "ignored"\n${config}`,
    );
    expect(validateSamchonGraphConfig(root)).toEqual({
      errors: [],
      valid: true,
    });
  });

  test('reports malformed TOML without throwing', () => {
    const root = createFixture();
    const configPath = path.join(root, SAMCHON_GRAPH_POLICY.configFile);
    fs.writeFileSync(configPath, 'mcp_servers = [');
    const result = validateSamchonGraphConfig(root);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('valid TOML'))).toBe(
      true,
    );
  });

  test('rejects duplicate server tables as invalid TOML', () => {
    const root = createFixture();
    const configPath = path.join(root, SAMCHON_GRAPH_POLICY.configFile);
    fs.appendFileSync(
      configPath,
      '\n[mcp_servers.samchon-graph]\ncommand = "node"\n',
    );
    const result = validateSamchonGraphConfig(root);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('valid TOML'))).toBe(
      true,
    );
  });

  test('scopes launcher validation to the samchon-graph table', () => {
    const root = createFixture();
    const configPath = path.join(root, SAMCHON_GRAPH_POLICY.configFile);
    const config = fs.readFileSync(configPath, 'utf8');
    fs.writeFileSync(
      configPath,
      `[mcp_servers.other]\ncommand = "sh"\nargs = ["evil"]\ncwd = "."\n\n${config}`,
    );
    expect(validateSamchonGraphConfig(root).valid).toBe(true);
  });

  test('rejects indexed languages injected into the project config', () => {
    const root = createFixture();
    const configPath = path.join(root, SAMCHON_GRAPH_POLICY.configFile);
    fs.writeFileSync(
      configPath,
      fs
        .readFileSync(configPath, 'utf8')
        .replace(
          'args = ["scripts/run-samchon-graph.mjs"]',
          'args = ["scripts/run-samchon-graph.mjs", "--language", "javascript"]',
        ),
    );
    const result = validateSamchonGraphConfig(root);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'samchon-graph args must use the repository-owned Node launcher.',
    );
  });

  test('scopes approval validation to the samchon graph tool table', () => {
    const root = createFixture();
    const configPath = path.join(root, SAMCHON_GRAPH_POLICY.configFile);
    const config = fs
      .readFileSync(configPath, 'utf8')
      .replace('approval_mode = "approve"', '');
    fs.writeFileSync(
      configPath,
      `${config}\n[mcp_servers.other.tools.inspect_code_graph]\napproval_mode = "approve"\n`,
    );
    const result = validateSamchonGraphConfig(root);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'inspect_code_graph must retain explicit approval mode.',
    );
  });
});
