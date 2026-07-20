#!/usr/bin/env bun

import { TOML } from 'bun';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOCAL_TOOLCHAIN_POLICY = Object.freeze({
  ciWorkflowFile: '.github/workflows/ci.yml',
  configFile: 'mise.toml',
  docs: Object.freeze({
    'CONTRIBUTING.md': Object.freeze([
      'mise install',
      'mise exec -- bun install --frozen-lockfile',
    ]),
    'README.md': Object.freeze([
      'mise install',
      'mise exec -- bun install --frozen-lockfile',
    ]),
  }),
  packageManager: 'bun@1.3.11',
  validateScript: 'bun scripts/validate-local-toolchain-policy.mjs',
  ciVersions: Object.freeze({
    bun: '1.3.11',
    node: '24',
    php: '8.1',
  }),
  miseVersions: Object.freeze({
    bun: '1.3.11',
    node: '24',
  }),
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');

function readText(repoRoot, relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(repoRoot, relativePath) {
  return JSON.parse(readText(repoRoot, relativePath));
}

function readRequiredText(repoRoot, relativePath, errors) {
  const filePath = path.join(repoRoot, relativePath);
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    const errorCode =
      error && typeof error === 'object' && 'code' in error ? error.code : null;
    if (errorCode === 'ENOENT') {
      errors.push(`${relativePath} must exist.`);
    } else {
      const detail = typeof errorCode === 'string' ? ` (${errorCode})` : '';
      errors.push(`${relativePath} must be readable${detail}.`);
    }
    return null;
  }
}

function readWorkflowEnv(workflowSource, variableName) {
  const match = workflowSource.match(
    new RegExp(
      `^ {2}${variableName}:\\s*(?:'([^']+)'|"([^"]+)"|([^\\s#]+))\\s*$`,
      'm',
    ),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

export function validateLocalToolchainPolicy(repoRoot = DEFAULT_REPO_ROOT) {
  const errors = [];
  const policy = LOCAL_TOOLCHAIN_POLICY;
  const packageJson = readJson(repoRoot, 'package.json');
  const scripts = packageJson.scripts ?? {};

  if (packageJson.packageManager !== policy.packageManager) {
    errors.push(
      `package.json must declare packageManager=${JSON.stringify(policy.packageManager)}, found ${JSON.stringify(packageJson.packageManager ?? null)}.`,
    );
  }

  if (scripts['toolchain-policy:validate'] !== policy.validateScript) {
    errors.push(
      `package.json must keep scripts["toolchain-policy:validate"]=${JSON.stringify(policy.validateScript)}, found ${JSON.stringify(scripts['toolchain-policy:validate'] ?? null)}.`,
    );
  }

  const ciLocal =
    typeof scripts['ci:local'] === 'string' ? scripts['ci:local'] : '';
  if (!ciLocal.includes('bun run toolchain-policy:validate')) {
    errors.push(
      'package.json must include "bun run toolchain-policy:validate" in scripts["ci:local"].',
    );
  }

  const configPath = path.join(repoRoot, policy.configFile);
  if (!fs.existsSync(configPath)) {
    errors.push(`${policy.configFile} must exist.`);
  } else {
    try {
      const config = TOML.parse(fs.readFileSync(configPath, 'utf8'));
      const tools = config.tools ?? {};

      for (const [toolName, expectedVersion] of Object.entries(
        policy.miseVersions,
      )) {
        if (tools[toolName] !== expectedVersion) {
          errors.push(
            `${policy.configFile} must declare tools.${toolName}=${JSON.stringify(expectedVersion)}, found ${JSON.stringify(tools[toolName] ?? null)}.`,
          );
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : '';
      errors.push(`${policy.configFile} must contain valid TOML${detail}`);
    }
  }

  const workflowSource = readRequiredText(
    repoRoot,
    policy.ciWorkflowFile,
    errors,
  );
  if (workflowSource !== null) {
    for (const [toolName, variableName] of [
      ['bun', 'BUN_VERSION'],
      ['node', 'NODE_VERSION'],
      ['php', 'PHP_VERSION'],
    ]) {
      const expectedVersion = policy.ciVersions[toolName];
      const actualVersion = readWorkflowEnv(workflowSource, variableName);
      if (actualVersion !== expectedVersion) {
        errors.push(
          `${policy.ciWorkflowFile} must declare ${variableName}=${JSON.stringify(expectedVersion)}, found ${JSON.stringify(actualVersion)}.`,
        );
      }
    }

    if (!workflowSource.includes('run: bun run toolchain-policy:validate')) {
      errors.push(
        `${policy.ciWorkflowFile} must run bun run toolchain-policy:validate.`,
      );
    }
  }

  for (const [relativePath, requiredSnippets] of Object.entries(policy.docs)) {
    const source = readRequiredText(repoRoot, relativePath, errors);
    if (source === null) {
      continue;
    }
    for (const snippet of requiredSnippets) {
      if (!source.includes(snippet)) {
        errors.push(
          `${relativePath} must document ${JSON.stringify(snippet)}.`,
        );
      }
    }
  }

  return {
    errors,
    valid: errors.length === 0,
  };
}

export function runCli({
  cwd = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const result = validateLocalToolchainPolicy(cwd);

  if (!result.valid) {
    stderr.write('Invalid local toolchain policy detected:\n');
    for (const error of result.errors) {
      stderr.write(`- ${error}\n`);
    }
    return 1;
  }

  stdout.write('Validated local mise and CI toolchain policy.\n');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exitCode = runCli();
}
