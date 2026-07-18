#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SAMCHON_GRAPH_POLICY } from './samchon-graph-policy.mjs';

export { SAMCHON_GRAPH_POLICY } from './samchon-graph-policy.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');

function extractTomlTable(source, tableName) {
  const header = `[${tableName}]`;
  const start = source.indexOf(header);
  const afterHeader = start >= 0 ? source.slice(start + header.length) : '';
  const nextTableOffset = afterHeader.search(/^\s*\[/m);
  return nextTableOffset >= 0
    ? afterHeader.slice(0, nextTableOffset)
    : afterHeader;
}

export function validateSamchonGraphConfig(repoRoot = DEFAULT_REPO_ROOT) {
  const errors = [];
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
  );
  const config = fs.readFileSync(
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

  const serverTable = extractTomlTable(config, 'mcp_servers.samchon-graph');

  if (!serverTable.includes(`command = "${SAMCHON_GRAPH_POLICY.command}"`)) {
    errors.push('samchon-graph must use the repository-root launcher.');
  }

  const argsBlock = serverTable.match(/^args\s*=\s*(\[[\s\S]*?\])/m)?.[1];
  const args = argsBlock
    ? [...argsBlock.matchAll(/"(?:\\.|[^"\\])*"/g)].map((match) =>
        JSON.parse(match[0]),
      )
    : [];
  if (JSON.stringify(args) !== JSON.stringify(SAMCHON_GRAPH_POLICY.args)) {
    errors.push(
      'samchon-graph args must use the repository-owned Node launcher.',
    );
  }

  if (!serverTable.includes(`cwd = "${SAMCHON_GRAPH_POLICY.cwd}"`)) {
    errors.push('samchon-graph must start from the repository root.');
  }

  const toolTable = extractTomlTable(
    config,
    'mcp_servers.samchon-graph.tools.inspect_code_graph',
  );
  if (
    !toolTable.includes(
      `approval_mode = "${SAMCHON_GRAPH_POLICY.approvalMode}"`,
    )
  ) {
    errors.push('inspect_code_graph must retain explicit approval mode.');
  }

  return { errors, valid: errors.length === 0 };
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
