#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAMCHON_GRAPH_POLICY = Object.freeze({
  approvalMode: 'approve',
  args: Object.freeze([
    '-c',
    'repo_root=$(git rev-parse --show-toplevel) && cd "$repo_root" && exec "$repo_root/node_modules/.bin/samchon-graph" --mode static --language typescript --language php',
  ]),
  command: 'sh',
  configFile: '.codex/config.toml',
  languages: Object.freeze(['typescript', 'php']),
  packageName: '@samchon/graph',
  version: '0.1.0',
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');

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

  const serverHeader = '[mcp_servers.samchon-graph]';
  const serverStart = config.indexOf(serverHeader);
  const afterHeader =
    serverStart >= 0 ? config.slice(serverStart + serverHeader.length) : '';
  const nextTableOffset = afterHeader.search(/^\s*\[/m);
  const serverTable =
    nextTableOffset >= 0 ? afterHeader.slice(0, nextTableOffset) : afterHeader;

  if (!serverTable.includes(`command = "${SAMCHON_GRAPH_POLICY.command}"`)) {
    errors.push('samchon-graph must use the repository-root launcher.');
  }

  const argsBlock = serverTable.match(/^args\s*=\s*\[([\s\S]*?)^\]/m)?.[1];
  const args = argsBlock
    ? [...argsBlock.matchAll(/"(?:\\.|[^"\\])*"/g)].map((match) =>
        JSON.parse(match[0]),
      )
    : [];
  if (JSON.stringify(args) !== JSON.stringify(SAMCHON_GRAPH_POLICY.args)) {
    errors.push(
      'samchon-graph args must preserve the repository-root binary and TypeScript/PHP-only sequence.',
    );
  }

  if (
    !config.includes('[mcp_servers.samchon-graph.tools.inspect_code_graph]') ||
    !config.includes(`approval_mode = "${SAMCHON_GRAPH_POLICY.approvalMode}"`)
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
