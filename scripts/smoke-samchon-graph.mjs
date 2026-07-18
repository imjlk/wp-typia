#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SAMCHON_GRAPH_POLICY } from './samchon-graph-policy.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const launcherPath = path.join(repoRoot, SAMCHON_GRAPH_POLICY.args[0]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeFixture(fixtureRoot) {
  const sourceRoot = path.join(fixtureRoot, 'src');
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.writeFileSync(
    path.join(sourceRoot, 'indexed.ts'),
    'export function indexedTypeScriptEntry(): string {\n  return "typescript";\n}\n',
  );
  fs.writeFileSync(
    path.join(sourceRoot, 'indexed.php'),
    '<?php\nfunction indexed_php_entry(): string {\n  return "php";\n}\n',
  );
  fs.writeFileSync(
    path.join(sourceRoot, 'excluded.js'),
    'export function excludedJavaScriptEntry() {}\n',
  );
  fs.writeFileSync(
    path.join(sourceRoot, 'excluded.ts.mustache'),
    'export function excludedTypeScriptTemplate() {}\n',
  );
  fs.writeFileSync(
    path.join(sourceRoot, 'excluded.php.mustache'),
    '<?php function excluded_php_template(): void {}\n',
  );
}

function runSmoke() {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-samchon-graph-'),
  );

  try {
    writeFixture(fixtureRoot);
    const output = execFileSync(
      process.execPath,
      [launcherPath, 'dump', '--cwd', fixtureRoot, '--max-files', '20'],
      {
        // Prove the launcher does not depend on the invoking process's cwd.
        cwd: path.join(repoRoot, 'packages', 'wp-typia', 'src'),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      },
    );
    const dump = JSON.parse(output);
    const languages = [...dump.languages].sort();
    const expectedLanguages = [...SAMCHON_GRAPH_POLICY.languages].sort();
    const internalNodes = dump.nodes.filter((node) => node.external === false);
    const nodeNames = new Set(internalNodes.map((node) => node.name));

    assert(
      dump.indexer === SAMCHON_GRAPH_POLICY.mode,
      `Expected ${SAMCHON_GRAPH_POLICY.mode} graph indexing, received ${dump.indexer}.`,
    );
    assert(
      JSON.stringify(languages) === JSON.stringify(expectedLanguages),
      `Expected ${expectedLanguages.join(', ')} languages, received ${languages.join(', ')}.`,
    );
    assert(
      internalNodes.every((node) => expectedLanguages.includes(node.language)),
      'Graph dump contains a node outside the TypeScript/PHP policy.',
    );
    assert(
      nodeNames.has('indexedTypeScriptEntry'),
      'TypeScript fixture was not indexed.',
    );
    assert(nodeNames.has('indexed_php_entry'), 'PHP fixture was not indexed.');
    assert(
      !nodeNames.has('excludedJavaScriptEntry'),
      'JavaScript fixture must remain excluded.',
    );
    assert(
      internalNodes.every((node) => !node.file.endsWith('.mustache')),
      'Mustache templates must remain excluded.',
    );
  } finally {
    fs.rmSync(fixtureRoot, { force: true, recursive: true });
  }
}

runSmoke();
console.log('samchon-graph TypeScript/PHP smoke check passed.');
