#!/usr/bin/env bun

import { TOML } from 'bun';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SAMCHON_GRAPH_POLICY } from './samchon-graph-policy.mjs';

export { SAMCHON_GRAPH_POLICY } from './samchon-graph-policy.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');

function isTable(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validationResult(errors) {
  return { errors, valid: errors.length === 0 };
}

export function validateSamchonGraphConfig(repoRoot = DEFAULT_REPO_ROOT) {
  const errors = [];
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
  );
  const configSource = fs.readFileSync(
    path.join(repoRoot, SAMCHON_GRAPH_POLICY.configFile),
    'utf8',
  );

  if (
    packageJson.devDependencies?.[SAMCHON_GRAPH_POLICY.packageName] !==
    SAMCHON_GRAPH_POLICY.version
  ) {
    errors.push(
      `${SAMCHON_GRAPH_POLICY.packageName} must remain pinned to ${SAMCHON_GRAPH_POLICY.version}.`,
    );
  }

  let config;
  try {
    config = TOML.parse(configSource);
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    errors.push(
      `samchon-graph project configuration must be valid TOML${detail}`,
    );
    return validationResult(errors);
  }

  const mcpServers = isTable(config.mcp_servers) ? config.mcp_servers : {};
  const server = isTable(mcpServers['samchon-graph'])
    ? mcpServers['samchon-graph']
    : null;

  if (!server) {
    errors.push('samchon-graph MCP server table is required.');
  } else {
    if (server.command !== SAMCHON_GRAPH_POLICY.command) {
      errors.push('samchon-graph must use the repository-root launcher.');
    }

    if (
      !Array.isArray(server.args) ||
      JSON.stringify(server.args) !== JSON.stringify(SAMCHON_GRAPH_POLICY.args)
    ) {
      errors.push(
        'samchon-graph args must use the repository-owned Node launcher.',
      );
    }

    if (server.cwd !== SAMCHON_GRAPH_POLICY.cwd) {
      errors.push('samchon-graph must start from the repository root.');
    }

    if (server.startup_timeout_sec !== SAMCHON_GRAPH_POLICY.startupTimeoutSec) {
      errors.push(
        `samchon-graph startup timeout must remain ${SAMCHON_GRAPH_POLICY.startupTimeoutSec} seconds.`,
      );
    }

    const tools = isTable(server.tools) ? server.tools : {};
    const inspectCodeGraph = isTable(tools.inspect_code_graph)
      ? tools.inspect_code_graph
      : null;
    if (
      !inspectCodeGraph ||
      inspectCodeGraph.approval_mode !== SAMCHON_GRAPH_POLICY.approvalMode
    ) {
      errors.push('inspect_code_graph must retain explicit approval mode.');
    }
  }

  return validationResult(errors);
}

function main() {
  const result = validateSamchonGraphConfig();
  if (!result.valid) {
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('samchon-graph project configuration is valid.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
