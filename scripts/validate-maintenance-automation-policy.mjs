#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GUTENBERG_UPSTREAM_WATCH_POLICY } from './gutenberg-upstream-watch.mjs';

const GUTENBERG_UPSTREAM_REPO = `${GUTENBERG_UPSTREAM_WATCH_POLICY.upstream.owner}/${GUTENBERG_UPSTREAM_WATCH_POLICY.upstream.repo}`;
const GUTENBERG_WATCH_ISSUE_LABEL = `#${GUTENBERG_UPSTREAM_WATCH_POLICY.issueNumber}`;
const GUTENBERG_WATCH_ISSUE_SNIPPET = `issue \`${GUTENBERG_WATCH_ISSUE_LABEL}\``;

export const MAINTENANCE_AUTOMATION_POLICY = Object.freeze({
  dependabotEcosystems: Object.freeze(['github-actions', 'composer']),
  docsFile:
    'apps/docs/src/content/docs/maintainers/maintenance-automation-policy.md',
  docsRequiredSnippets: Object.freeze([
    'Dependabot updates',
    'github-actions',
    'composer',
    'release/sampo',
    'bun audit --audit-level high',
    'composer audit --locked',
    'scheduled/manual',
    '.github/workflows/dependency-audit.yml',
    '.github/workflows/gutenberg-upstream-watch.yml',
    '.github/workflows/test-matrix.yml',
    GUTENBERG_UPSTREAM_REPO,
    '@wordpress/blocks',
    '@wordpress/block-editor',
    '@wordpress/data',
    GUTENBERG_WATCH_ISSUE_SNIPPET,
  ]),
  releasePrAddPaths: Object.freeze([
    '.sampo/**',
    'composer.lock',
    'examples/**/CHANGELOG.md',
    'examples/**/package.json',
    'packages/**/CHANGELOG.md',
    'packages/**/package.json',
  ]),
  ciScript: 'node scripts/validate-maintenance-automation-policy.mjs',
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function readRelativeText(repoRoot, relativePath) {
  return readText(path.join(repoRoot, relativePath));
}

function lintJobBlock(workflowSource) {
  const lines = workflowSource.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => /^ {2}lint:\s*$/.test(line));

  if (startIndex < 0) {
    return '';
  }

  const blockLines = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > startIndex && /^ {2}[A-Za-z0-9_-]+:/.test(line)) {
      break;
    }
    blockLines.push(line);
  }

  return blockLines.join('\n');
}

function leadingSpaceCount(line) {
  return line.match(/^ */)?.[0].length ?? 0;
}

function workflowJobBlock(workflowSource, jobId) {
  const lines = workflowSource.split(/\r?\n/);
  const startIndex = lines.findIndex((line) =>
    new RegExp(`^ {2}${jobId}:\\s*$`).test(line),
  );

  if (startIndex < 0) {
    return '';
  }

  const blockLines = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > startIndex && /^ {2}[A-Za-z0-9_-]+:\s*$/.test(line)) {
      break;
    }
    blockLines.push(line);
  }

  return blockLines.join('\n');
}

function parseDependabotEcosystemLine(line) {
  const match = line.match(
    /^\s*-\s+package-ecosystem:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))\s*$/,
  );

  if (!match) {
    return null;
  }

  return match[1] ?? match[2] ?? match[3] ?? null;
}

function extractDependabotBlockAtIndex(lines, startIndex) {
  const baseIndent = leadingSpaceCount(lines[startIndex]);
  const blockLines = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      index > startIndex &&
      parseDependabotEcosystemLine(line) !== null &&
      leadingSpaceCount(line) === baseIndent
    ) {
      break;
    }
    if (
      index > startIndex &&
      line.trim() &&
      leadingSpaceCount(line) < baseIndent
    ) {
      break;
    }
    blockLines.push(line);
  }

  return blockLines.join('\n');
}

function extractDependabotUpdateBlocks(sourceText, ecosystem) {
  const lines = sourceText.split(/\r?\n/);
  const startIndexes = lines
    .map((line, index) =>
      parseDependabotEcosystemLine(line) === ecosystem ? index : -1,
    )
    .filter((index) => index >= 0);

  return startIndexes.map((startIndex) =>
    extractDependabotBlockAtIndex(lines, startIndex),
  );
}

function validateDependabotConfig(sourceText, errors) {
  const configuredEcosystems = sourceText
    .split(/\r?\n/)
    .map((line) => parseDependabotEcosystemLine(line))
    .filter((value) => value !== null);

  for (const ecosystem of configuredEcosystems) {
    if (
      !MAINTENANCE_AUTOMATION_POLICY.dependabotEcosystems.includes(ecosystem)
    ) {
      errors.push(
        `.github/dependabot.yml must not widen automation beyond ${MAINTENANCE_AUTOMATION_POLICY.dependabotEcosystems.join(', ')}; found ${ecosystem}.`,
      );
    }
  }

  for (const ecosystem of MAINTENANCE_AUTOMATION_POLICY.dependabotEcosystems) {
    const blocks = extractDependabotUpdateBlocks(sourceText, ecosystem);

    if (blocks.length === 0) {
      errors.push(
        `.github/dependabot.yml must configure a ${ecosystem} update lane.`,
      );
      continue;
    }

    if (blocks.length > 1) {
      errors.push(
        `.github/dependabot.yml must configure exactly one ${ecosystem} update lane.`,
      );
    }

    for (const block of blocks) {
      if (!block.includes("target-branch: 'main'")) {
        errors.push(
          `.github/dependabot.yml must keep the ${ecosystem} lane targeting the main branch.`,
        );
      }

      if (!block.includes("interval: 'weekly'")) {
        errors.push(
          `.github/dependabot.yml must keep the ${ecosystem} lane on a weekly update cadence.`,
        );
      }
    }
  }
}

function validateDependencyAuditWorkflow(sourceText, errors) {
  for (const requiredSnippet of [
    'name: Dependency and Security Audit',
    'pull_request:\n    branches: [main]',
    'push:\n    branches: [main]',
    'schedule:',
    'workflow_dispatch:',
    'name: Composer Audit',
    'run: composer audit --locked',
    'name: Bun Audit',
    'run: bun audit --audit-level high',
  ]) {
    if (!sourceText.includes(requiredSnippet)) {
      errors.push(
        `.github/workflows/dependency-audit.yml must include ${JSON.stringify(requiredSnippet)}.`,
      );
    }
  }

  const bunAuditBlock = workflowJobBlock(sourceText, 'bun-audit');
  for (const requiredSnippet of [
    "if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'",
    'name: Bun Audit',
    'run: bun audit --audit-level high',
  ]) {
    if (!bunAuditBlock.includes(requiredSnippet)) {
      errors.push(
        '.github/workflows/dependency-audit.yml must keep Bun Audit gated to schedule/workflow_dispatch.',
      );
      break;
    }
  }

  const composerAuditBlock = workflowJobBlock(sourceText, 'composer-audit');
  if (composerAuditBlock.includes('if:')) {
    errors.push(
      '.github/workflows/dependency-audit.yml must keep Composer Audit ungated so it runs on pull_request and push events.',
    );
  }
}

function validateScheduledWorkflow(sourceText, errors) {
  if (!sourceText.includes('name: CodeQL Scan')) {
    errors.push(
      '.github/workflows/test-matrix.yml must keep the scheduled security job scoped to CodeQL.',
    );
  }

  if (sourceText.includes('Run Bun audit')) {
    errors.push(
      '.github/workflows/test-matrix.yml should not duplicate the Bun audit step now that dependency-audit.yml owns the fast audit lane.',
    );
  }
}

function extractYamlLiteralBlockValues(sourceText, key) {
  const lines = sourceText.split(/\r?\n/);
  const keyPattern = new RegExp(`^(\\s*)${key}:\\s*\\|\\s*$`);
  const startIndex = lines.findIndex((line) => keyPattern.test(line));
  if (startIndex < 0) {
    return [];
  }

  const keyIndent = leadingSpaceCount(lines[startIndex]);
  const values = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() !== '' && leadingSpaceCount(line) <= keyIndent) {
      break;
    }
    if (line.trim() !== '') {
      values.push(line.trim());
    }
  }

  return values;
}

function validateReleasePrWorkflow(sourceText, errors) {
  const releasePrJob = workflowJobBlock(sourceText, 'update-release-pr');
  const addPaths = new Set(
    extractYamlLiteralBlockValues(releasePrJob, 'add-paths'),
  );

  for (const requiredPath of MAINTENANCE_AUTOMATION_POLICY.releasePrAddPaths) {
    if (!addPaths.has(requiredPath)) {
      errors.push(
        `.github/workflows/release-pr.yml must stage ${JSON.stringify(requiredPath)} in the release PR add-paths block.`,
      );
    }
  }
}

function validateGutenbergWatchWorkflow(sourceText, errors) {
  for (const requiredSnippet of [
    'name: Gutenberg Upstream TypeScript Watch',
    'schedule:',
    'workflow_dispatch:',
    `WATCH_ISSUE_NUMBER: '${GUTENBERG_UPSTREAM_WATCH_POLICY.issueNumber}'`,
    'GUTENBERG_UPSTREAM_TOKEN',
    'permissions:',
    'issues: write',
    'node scripts/gutenberg-upstream-watch.mjs',
    'actions/upload-artifact@v7',
    `Update issue ${GUTENBERG_WATCH_ISSUE_LABEL}`,
    '<!-- gutenberg-upstream-watch -->',
    GUTENBERG_UPSTREAM_REPO,
    "comment.user?.login === 'github-actions[bot]'",
    'comment.body?.startsWith(marker)',
  ]) {
    if (!sourceText.includes(requiredSnippet)) {
      errors.push(
        `.github/workflows/gutenberg-upstream-watch.yml must include ${JSON.stringify(requiredSnippet)}.`,
      );
    }
  }
}

export function validateMaintenanceAutomationPolicy(
  repoRoot = DEFAULT_REPO_ROOT,
) {
  const errors = [];
  const packageJson = readJson(path.join(repoRoot, 'package.json'));
  const scripts = packageJson.scripts ?? {};

  if (
    scripts['maintenance-automation:validate'] !==
    MAINTENANCE_AUTOMATION_POLICY.ciScript
  ) {
    errors.push(
      `package.json must keep scripts["maintenance-automation:validate"]="${MAINTENANCE_AUTOMATION_POLICY.ciScript}", found ${JSON.stringify(scripts['maintenance-automation:validate'] ?? null)}.`,
    );
  }

  const ciLocal =
    typeof scripts['ci:local'] === 'string' ? scripts['ci:local'] : '';
  if (!ciLocal.includes('bun run maintenance-automation:validate')) {
    errors.push(
      'package.json must include "bun run maintenance-automation:validate" in scripts["ci:local"].',
    );
  }

  validateDependabotConfig(
    readRelativeText(repoRoot, '.github/dependabot.yml'),
    errors,
  );
  validateDependencyAuditWorkflow(
    readRelativeText(repoRoot, '.github/workflows/dependency-audit.yml'),
    errors,
  );
  validateScheduledWorkflow(
    readRelativeText(repoRoot, '.github/workflows/test-matrix.yml'),
    errors,
  );
  validateGutenbergWatchWorkflow(
    readRelativeText(
      repoRoot,
      '.github/workflows/gutenberg-upstream-watch.yml',
    ),
    errors,
  );
  validateReleasePrWorkflow(
    readRelativeText(repoRoot, '.github/workflows/release-pr.yml'),
    errors,
  );

  const ciLintBlock = lintJobBlock(
    readRelativeText(repoRoot, '.github/workflows/ci.yml'),
  );
  if (!ciLintBlock.includes('run: bun run maintenance-automation:validate')) {
    errors.push(
      '.github/workflows/ci.yml lint job must include "run: bun run maintenance-automation:validate".',
    );
  }

  const docsText = readRelativeText(
    repoRoot,
    MAINTENANCE_AUTOMATION_POLICY.docsFile,
  );
  for (const snippet of MAINTENANCE_AUTOMATION_POLICY.docsRequiredSnippets) {
    if (!docsText.includes(snippet)) {
      errors.push(
        `${MAINTENANCE_AUTOMATION_POLICY.docsFile} must mention ${JSON.stringify(snippet)}.`,
      );
    }
  }

  for (const [relativePath, requiredSnippets] of Object.entries({
    'README.md': [
      '[Maintenance Automation Policy](https://imjlk.github.io/wp-typia/maintainers/maintenance-automation-policy/)',
      'bun run maintenance-automation:validate',
    ],
    'CONTRIBUTING.md': [
      'bun run maintenance-automation:validate',
      '[`docs/maintenance-automation-policy.md`](https://imjlk.github.io/wp-typia/maintainers/maintenance-automation-policy/)',
      'Dependabot',
      'release/sampo',
    ],
  })) {
    const sourceText = readRelativeText(repoRoot, relativePath);
    for (const snippet of requiredSnippets) {
      if (!sourceText.includes(snippet)) {
        errors.push(`${relativePath} must mention ${JSON.stringify(snippet)}.`);
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
  const result = validateMaintenanceAutomationPolicy(cwd);

  if (!result.valid) {
    stderr.write('Invalid maintenance automation policy detected:\n');
    for (const error of result.errors) {
      stderr.write(`- ${error}\n`);
    }
    return 1;
  }

  stdout.write('Validated maintenance automation policy.\n');
  return 0;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (invokedPath === __filename) {
  process.exitCode = runCli();
}
