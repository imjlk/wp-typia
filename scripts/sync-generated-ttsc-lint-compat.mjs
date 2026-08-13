#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FORMATTING_TOOLCHAIN_POLICY } from './validate-formatting-toolchain-policy.mjs';

const arguments_ = process.argv.slice(2);
const write = arguments_.includes('--write');
const repoArgumentIndex = arguments_.indexOf('--repo');
const repoPathArgument =
  repoArgumentIndex === -1 ? null : arguments_[repoArgumentIndex + 1];
if (
  repoArgumentIndex !== -1 &&
  (repoPathArgument === undefined || repoPathArgument.startsWith('--'))
) {
  throw new Error('--repo requires a directory path.');
}
const knownArgumentIndexes = new Set([
  ...arguments_.flatMap((argument, index) =>
    argument === '--write' ? [index] : [],
  ),
  ...(repoArgumentIndex === -1
    ? []
    : [repoArgumentIndex, repoArgumentIndex + 1]),
]);
const unknownArguments = arguments_.filter(
  (_argument, index) => !knownArgumentIndexes.has(index),
);
if (unknownArguments.length > 0) {
  throw new Error(`Unknown arguments: ${unknownArguments.join(', ')}`);
}
const defaultRepoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repoRoot =
  repoPathArgument === null ? defaultRepoRoot : path.resolve(repoPathArgument);

const policy = FORMATTING_TOOLCHAIN_POLICY;
const canonicalRelativePath = path.join(
  policy.generatedTtscLintCompatCanonicalTemplateRoot,
  policy.generatedTtscLintCompatTemplatePath,
);
const canonicalPath = path.join(repoRoot, canonicalRelativePath);
if (!fs.existsSync(canonicalPath)) {
  throw new Error(
    `Canonical @ttsc/lint compatibility hook not found at ${canonicalRelativePath}.`,
  );
}
const canonicalSource = fs.readFileSync(canonicalPath, 'utf8');
const driftedPaths = [];

for (const templateRoot of policy.generatedTtscLintCompatTemplateRoots) {
  const relativePath = path.join(
    templateRoot,
    policy.generatedTtscLintCompatTemplatePath,
  );
  if (relativePath === canonicalRelativePath) {
    continue;
  }
  const targetPath = path.join(repoRoot, relativePath);
  const targetSource = fs.existsSync(targetPath)
    ? fs.readFileSync(targetPath, 'utf8')
    : null;
  // Compare raw contents intentionally. Repository formatting requires LF, so
  // accepting a CRLF copy here would weaken the byte-identical sync contract.
  if (targetSource === canonicalSource) {
    continue;
  }
  driftedPaths.push(relativePath);
  if (write) {
    const temporaryPath = `${targetPath}.wp-typia-${process.pid}.tmp`;
    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(temporaryPath, canonicalSource);
      fs.renameSync(temporaryPath, targetPath);
    } catch (error) {
      try {
        fs.rmSync(temporaryPath, { force: true });
      } catch {
        // Preserve the primary filesystem failure and its recovery guidance.
      }
      throw new Error(
        `Failed to sync ${relativePath}. Re-run "bun run ttsc-lint-compat:sync" after correcting the filesystem error.`,
        { cause: error },
      );
    }
  }
}

if (driftedPaths.length === 0) {
  process.stdout.write(
    'Generated @ttsc/lint compatibility hooks are synced.\n',
  );
} else if (write) {
  process.stdout.write(
    `Synced ${driftedPaths.length} generated @ttsc/lint compatibility hook(s).\n`,
  );
} else {
  process.stderr.write(
    `Generated @ttsc/lint compatibility hooks differ from ${canonicalRelativePath}:\n`,
  );
  for (const relativePath of driftedPaths) {
    process.stderr.write(`- ${relativePath}\n`);
  }
  process.exitCode = 1;
}
