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
    `[mcp_servers.samchon-graph]\ncommand = "sh"\nargs = [\n  "-c",\n  "repo_root=$(git rev-parse --show-toplevel) && exec \\"$repo_root/node_modules/.bin/samchon-graph\\" --language typescript --language php",\n]\n\n[mcp_servers.samchon-graph.tools.inspect_code_graph]\napproval_mode = "approve"\n`,
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

  test('rejects a missing shell command flag', () => {
    const root = createFixture();
    const configPath = path.join(root, SAMCHON_GRAPH_POLICY.configFile);
    fs.writeFileSync(
      configPath,
      fs.readFileSync(configPath, 'utf8').replace('  "-c",\n', ''),
    );
    const result = validateSamchonGraphConfig(root);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'samchon-graph args must preserve the repository-root binary and TypeScript/PHP-only sequence.',
    );
  });

  test('rejects launcher argument reordering', () => {
    const root = createFixture();
    const configPath = path.join(root, SAMCHON_GRAPH_POLICY.configFile);
    fs.writeFileSync(
      configPath,
      fs
        .readFileSync(configPath, 'utf8')
        .replace('  "-c",\n  "repo_root=', '  "repo_root=')
        .replace(' --language php",', ' --language php",\n  "-c",'),
    );
    expect(validateSamchonGraphConfig(root).valid).toBe(false);
  });

  test('rejects a launcher that bypasses the repository root install', () => {
    const root = createFixture();
    const configPath = path.join(root, SAMCHON_GRAPH_POLICY.configFile);
    fs.writeFileSync(
      configPath,
      fs
        .readFileSync(configPath, 'utf8')
        .replace('$repo_root/node_modules/.bin/samchon-graph', 'samchon-graph'),
    );
    expect(validateSamchonGraphConfig(root).valid).toBe(false);
  });

  test('rejects additional indexed languages', () => {
    const root = createFixture();
    const configPath = path.join(root, SAMCHON_GRAPH_POLICY.configFile);
    fs.writeFileSync(
      configPath,
      fs
        .readFileSync(configPath, 'utf8')
        .replace('\n]\n', '\n  "--language", "javascript",\n]\n'),
    );
    const result = validateSamchonGraphConfig(root);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'samchon-graph args must preserve the repository-root binary and TypeScript/PHP-only sequence.',
    );
  });
});
