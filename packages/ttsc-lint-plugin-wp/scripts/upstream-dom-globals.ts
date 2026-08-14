/**
 * Shared helpers for pinning and reading the `globals` package revision used
 * by the WordPress DOM-globals rules.
 *
 * `@wordpress/eslint-plugin` 25.8.0 declares `globals: ^16.0.0`, while the
 * repository's own transitive `globals` copy resolves through ESLint at a
 * different major. The parity oracle (which requires the upstream rule from
 * the extracted plugin directory) and the generated Go data file must both
 * resolve this pinned revision, otherwise the browser-minus-node DOM global
 * set drifts between the oracle and the contributor.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { installPinnedTarball } from './pinned-tarball';

export const DOM_GLOBALS_PACKAGE = 'globals';
export const DOM_GLOBALS_VERSION = '16.5.0';
export const DOM_GLOBALS_TARBALL = `https://registry.npmjs.org/globals/-/globals-${DOM_GLOBALS_VERSION}.tgz`;
export const DOM_GLOBALS_INTEGRITY =
  'sha512-c/c15i26VrJ4IRt5Z89DnIzCGDn9EcebibhAOjw5ibqEHsE1wLUgkPn9RDmNcUKyU87GeaL633nyJ+pplFR2ZQ==';
export const DOM_GLOBALS_DATA_RELATIVE_PATH = 'rules/dom_globals_data.go';

interface GlobalsData {
  browser?: Record<string, unknown>;
  node?: Record<string, unknown>;
}

export interface EmbeddedDomGlobalsData {
  names: string[];
  version: string;
}

/** Resolves where the pinned `globals` package installs for an oracle root. */
export function pinnedGlobalsRoot(upstreamRoot: string): string {
  return path.join(upstreamRoot, 'node_modules', DOM_GLOBALS_PACKAGE);
}

/**
 * Extracts the pinned `globals` tarball into `upstreamRoot/node_modules` so
 * `require('globals')` from the upstream plugin rules resolves the pinned
 * revision before any repository copy.
 */
export async function installPinnedGlobals(
  cacheRoot: string,
  upstreamRoot: string,
  options: { networkTimeoutMs?: number } = {},
): Promise<void> {
  await installPinnedTarball({
    label: `${DOM_GLOBALS_PACKAGE} ${DOM_GLOBALS_VERSION}`,
    url: DOM_GLOBALS_TARBALL,
    integrity: DOM_GLOBALS_INTEGRITY,
    cachePath: path.join(cacheRoot, `globals-${DOM_GLOBALS_VERSION}.tgz`),
    stagingParent: cacheRoot,
    stagingPrefix: `.wp-typia-globals-${DOM_GLOBALS_VERSION}-`,
    destination: pinnedGlobalsRoot(upstreamRoot),
    verify: verifyInstalledGlobals,
    networkTimeoutMs: options.networkTimeoutMs,
  });
}

function verifyInstalledGlobals(globalsRoot: string): void {
  const metadata = JSON.parse(
    fs.readFileSync(path.join(globalsRoot, 'package.json'), 'utf8'),
  ) as { name?: string; version?: string };
  assert.equal(metadata.name, DOM_GLOBALS_PACKAGE);
  assert.equal(metadata.version, DOM_GLOBALS_VERSION);
}

/**
 * Loads the pinned `globals` data from an installed package root and returns
 * the sorted browser-minus-node global set that the upstream
 * `isDOMGlobal(name)` helper computes with ECMAScript `in` checks.
 */
export function loadPinnedDomGlobals(
  globalsRoot: string,
): { domOnlyNames: string[] } {
  const data = JSON.parse(
    fs.readFileSync(path.join(globalsRoot, 'globals.json'), 'utf8'),
  ) as GlobalsData;
  assert.ok(data.browser, `${globalsRoot}/globals.json has no browser set`);
  const nodeGlobals = data.node;
  assert.ok(nodeGlobals, `${globalsRoot}/globals.json has no node set`);
  const domOnlyNames = Object.keys(data.browser)
    .filter((name) => !(name in nodeGlobals))
    .sort();
  return { domOnlyNames };
}

/** Parses the generated `rules/dom_globals_data.go` manifest. */
export function readEmbeddedDomGlobalsData(
  packageRoot: string,
): EmbeddedDomGlobalsData {
  const dataPath = path.resolve(packageRoot, DOM_GLOBALS_DATA_RELATIVE_PATH);
  const source = fs.readFileSync(dataPath, 'utf8');
  const versionMatch = /globals@(\d+\.\d+\.\d+)/u.exec(source);
  assert.ok(
    versionMatch,
    `${dataPath} must pin the globals version in its header`,
  );
  const names = [
    ...source.matchAll(/^\t"((?:[^"\\]|\\.)*)"\s*:\s+true,\r?$/gmu),
  ].map((match) => JSON.parse(`"${match[1]}"`) as string);
  assert.ok(
    names.length > 0,
    `${dataPath} must embed a non-empty DOM globals list`,
  );
  return { names, version: versionMatch[1] };
}

/** Verifies the embedded Go data matches the pinned oracle revision. */
export function verifyEmbeddedDomGlobals(
  packageRoot: string,
  globalsRoot: string,
): void {
  const embedded = readEmbeddedDomGlobalsData(packageRoot);
  assert.equal(
    embedded.version,
    DOM_GLOBALS_VERSION,
    'rules/dom_globals_data.go is pinned to a different globals revision; regenerate it with bun scripts/generate-dom-globals.ts',
  );
  const { domOnlyNames } = loadPinnedDomGlobals(globalsRoot);
  assert.deepEqual(
    embedded.names,
    domOnlyNames,
    'rules/dom_globals_data.go is out of sync with the pinned globals revision; regenerate it with bun scripts/generate-dom-globals.ts',
  );
}
