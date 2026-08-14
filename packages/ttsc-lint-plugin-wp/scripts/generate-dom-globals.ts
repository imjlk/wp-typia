/**
 * Regenerates `rules/dom_globals_data.go` from the pinned `globals` revision
 * that `@wordpress/eslint-plugin` 25.8.0 declares. The browser-minus-node
 * set matches the upstream `isDOMGlobal(name)` helper exactly.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DOM_GLOBALS_VERSION,
  installPinnedGlobals,
  loadPinnedDomGlobals,
  pinnedGlobalsRoot,
  readEmbeddedDomGlobalsData,
} from './upstream-dom-globals';

const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '../..');
// Persistent tarball cache keeps regeneration working offline after the
// first download; only the extracted package root is throwaway.
const cacheRoot = path.join(
  repoRoot,
  'node_modules/.cache',
  `wp-typia-globals-${DOM_GLOBALS_VERSION}`,
);
const stagingRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), `wp-typia-globals-${DOM_GLOBALS_VERSION}-`),
);

try {
  await installPinnedGlobals(cacheRoot, stagingRoot);
  const { domOnlyNames } = loadPinnedDomGlobals(pinnedGlobalsRoot(stagingRoot));
  assert.ok(
    domOnlyNames.length > 0,
    'No DOM-only globals found; the pinned globals package may have changed structure',
  );

  const lines = [
    '// Code generated from globals@' +
      DOM_GLOBALS_VERSION +
      ' (browser globals that are absent from the node environment); DO NOT EDIT.',
    '// Regenerate with: bun scripts/generate-dom-globals.ts',
    '// The pinned revision must match the oracle dependency of',
    '// @wordpress/eslint-plugin 25.8.0 (globals@^16.0.0); see',
    '// scripts/upstream-dom-globals.ts and tests/run-parity.ts.',
    'package wordpress',
    '',
    '// domGlobalNames mirrors the upstream isDOMGlobal helper, which reports a',
    '// name when it is a `globals` browser key and not a node key.',
    'var domGlobalNames = map[string]bool{',
  ];
  // gofmt aligns map values in one padded column; emitting that layout
  // keeps the file stable under Go tooling.
  const keyWidth = Math.max(
    ...domOnlyNames.map((name) => JSON.stringify(name).length),
  );
  for (const name of domOnlyNames) {
    lines.push(`\t${(JSON.stringify(name) + ':').padEnd(keyWidth + 2)}true,`);
  }
  lines.push('}');
  lines.push('');

  const outputPath = path.join(packageRoot, 'rules', 'dom_globals_data.go');
  fs.writeFileSync(outputPath, `${lines.join('\n')}`, 'utf8');
  // Round-trip through the parity parser so generation fails fast if the
  // emitted layout ever stops matching readEmbeddedDomGlobalsData.
  const embedded = readEmbeddedDomGlobalsData(packageRoot);
  assert.deepEqual(
    embedded,
    { names: domOnlyNames, version: DOM_GLOBALS_VERSION },
    'the generated data file did not round-trip through the parity parser',
  );
  console.log(
    `Wrote ${path.relative(packageRoot, outputPath)} with ${domOnlyNames.length} DOM globals from globals@${DOM_GLOBALS_VERSION}.`,
  );
} finally {
  fs.rmSync(stagingRoot, { force: true, recursive: true });
}
