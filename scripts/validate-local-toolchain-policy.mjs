#!/usr/bin/env bun

import { TOML, YAML } from 'bun';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOCAL_TOOLCHAIN_POLICY = Object.freeze({
  ciWorkflowFile: '.github/workflows/ci.yml',
  configFile: 'mise.toml',
  minimumNodeMajor: 24,
  setupActionFile: '.github/actions/setup-bun-workspace/action.yml',
  workflowDirectory: '.github/workflows',
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

function readRequiredJson(repoRoot, relativePath, errors) {
  const source = readRequiredText(repoRoot, relativePath, errors);
  if (source === null) {
    return null;
  }

  try {
    const value = JSON.parse(source);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${relativePath} must contain a JSON object.`);
      return null;
    }
    return value;
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    errors.push(`${relativePath} must contain valid JSON${detail}`);
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

function addNodeMajorMatch(matches, major, valuePath) {
  if (
    !matches.some((entry) => entry.major === major && entry.path === valuePath)
  ) {
    matches.push({ major, path: valuePath });
  }
}

function collectNumericNodeMajors(value, nodeContext, pathSegments, matches) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectNumericNodeMajors(
        entry,
        nodeContext,
        [...pathSegments, String(index)],
        matches,
      );
    });
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      const normalizedKey = key.replace(/[^a-z0-9]/giu, '').toLowerCase();
      const keyDeclaresNodeVersion =
        normalizedKey === 'node' ||
        normalizedKey === 'nodeversion' ||
        normalizedKey.startsWith('nodebaseline');
      const keyNodeVersionMatch = normalizedKey.match(/node(\d{1,2})(?=\D|$)/u);
      const nextPath = [...pathSegments, key];

      if (keyNodeVersionMatch) {
        addNodeMajorMatch(
          matches,
          Number.parseInt(keyNodeVersionMatch[1], 10),
          nextPath.join('.'),
        );
      }

      collectNumericNodeMajors(
        entry,
        keyDeclaresNodeVersion ||
          (nodeContext &&
            (normalizedKey === 'default' || normalizedKey === 'options')),
        nextPath,
        matches,
      );
    }
    return;
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    return;
  }

  const source = String(value);
  const explicitNodePattern = /node(?:\.js)?[-_ ]?(\d{1,2})(?=\D|$)/giu;
  for (const match of source.matchAll(explicitNodePattern)) {
    addNodeMajorMatch(
      matches,
      Number.parseInt(match[1], 10),
      pathSegments.join('.'),
    );
  }

  if (!nodeContext) {
    return;
  }

  const versionPattern =
    /(?:^|[^0-9{])(\d{1,2})(?:\.\d+(?:\.\d+)?)?(?=$|[^0-9}])/gu;
  for (const match of source.matchAll(versionPattern)) {
    addNodeMajorMatch(
      matches,
      Number.parseInt(match[1], 10),
      pathSegments.join('.'),
    );
  }
}

function readYamlDocument(repoRoot, relativePath, errors) {
  const source = readRequiredText(repoRoot, relativePath, errors);
  if (source === null) {
    return null;
  }

  try {
    return YAML.parse(source);
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    errors.push(`${relativePath} must contain valid YAML${detail}`);
    return null;
  }
}

function validateNodeWorkflowBaselines(repoRoot, policy, errors) {
  const workflowDirectory = path.join(repoRoot, policy.workflowDirectory);
  let workflowFiles = [];

  try {
    workflowFiles = fs
      .readdirSync(workflowDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(?:ya?ml)$/iu.test(entry.name))
      .map((entry) => path.join(policy.workflowDirectory, entry.name));
  } catch (error) {
    const errorCode =
      error && typeof error === 'object' && 'code' in error ? error.code : null;
    const detail = typeof errorCode === 'string' ? ` (${errorCode})` : '';
    errors.push(`${policy.workflowDirectory} must be readable${detail}.`);
  }

  const relativeFiles = [...workflowFiles, policy.setupActionFile];
  for (const relativePath of relativeFiles) {
    const document = readYamlDocument(repoRoot, relativePath, errors);
    if (document === null) {
      continue;
    }

    const matches = [];
    collectNumericNodeMajors(document, false, [], matches);
    const invalidMatches = matches.filter(
      ({ major }) => major < policy.minimumNodeMajor,
    );
    for (const { major, path: valuePath } of invalidMatches) {
      errors.push(
        `${relativePath} must not configure Node ${major} at ${valuePath}; the minimum supported major is ${policy.minimumNodeMajor}.`,
      );
    }

    if (relativePath === policy.setupActionFile) {
      const defaultNodeVersion =
        document?.inputs?.['node-version']?.default ?? null;
      if (String(defaultNodeVersion) !== String(policy.minimumNodeMajor)) {
        errors.push(
          `${relativePath} must default inputs.node-version to ${JSON.stringify(String(policy.minimumNodeMajor))}, found ${JSON.stringify(defaultNodeVersion)}.`,
        );
      }
    }
  }
}

export function validateLocalToolchainPolicy(repoRoot = DEFAULT_REPO_ROOT) {
  const errors = [];
  const policy = LOCAL_TOOLCHAIN_POLICY;
  const packageJson = readRequiredJson(repoRoot, 'package.json', errors);
  if (packageJson !== null) {
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

  validateNodeWorkflowBaselines(repoRoot, policy, errors);

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
