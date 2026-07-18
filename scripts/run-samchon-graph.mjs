#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createSamchonGraphCliArgs,
  SAMCHON_GRAPH_POLICY,
} from './samchon-graph-policy.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const SAMCHON_GRAPH_REPO_ROOT = path.resolve(__dirname, '..');

export function resolveSamchonGraphBinary(repoRoot = SAMCHON_GRAPH_REPO_ROOT) {
  const packageRoot = path.join(
    repoRoot,
    'node_modules',
    ...SAMCHON_GRAPH_POLICY.packageName.split('/'),
  );
  const manifestPath = path.join(packageRoot, 'package.json');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `${SAMCHON_GRAPH_POLICY.packageName} is not installed. Run bun install first.`,
    );
  }

  const manifestSource = fs.readFileSync(manifestPath, 'utf8');
  let manifest;
  try {
    manifest = JSON.parse(manifestSource);
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    throw new Error(`Failed to parse ${manifestPath}${detail}`);
  }
  const binary =
    typeof manifest.bin === 'string'
      ? manifest.bin
      : manifest.bin?.[SAMCHON_GRAPH_POLICY.binaryName];

  if (typeof binary !== 'string' || binary.length === 0) {
    throw new Error(
      `${SAMCHON_GRAPH_POLICY.packageName} does not declare the ${SAMCHON_GRAPH_POLICY.binaryName} binary.`,
    );
  }

  const binaryPath = path.resolve(packageRoot, binary);
  if (!fs.existsSync(binaryPath)) {
    throw new Error(
      `${SAMCHON_GRAPH_POLICY.packageName} binary does not exist at ${binaryPath}. Run bun install again.`,
    );
  }

  return binaryPath;
}

export function runSamchonGraph(
  prefixArgs = [],
  repoRoot = SAMCHON_GRAPH_REPO_ROOT,
) {
  const binary = resolveSamchonGraphBinary(repoRoot);
  const child = spawn(
    process.execPath,
    [binary, ...createSamchonGraphCliArgs(prefixArgs)],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    },
  );

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  const onSigint = () => forwardSignal('SIGINT');
  const onSigterm = () => forwardSignal('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  const cleanup = () => {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  };

  child.once('error', (error) => {
    cleanup();
    console.error(`Failed to start ${SAMCHON_GRAPH_POLICY.packageName}:`);
    console.error(error);
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    cleanup();
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 1;
  });

  return child;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    runSamchonGraph(process.argv.slice(2));
  } catch (error) {
    console.error(`Failed to start ${SAMCHON_GRAPH_POLICY.packageName}:`);
    console.error(error);
    process.exitCode = 1;
  }
}
