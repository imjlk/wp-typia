import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { compatibilityManifest, ruleNames } from '../src/index.js';

const require = createRequire(import.meta.url);
const baselinePackage = require('@ttsc/lint-baseline/package.json') as {
  version?: string;
};

const compatibilityBySource = new Map(
  compatibilityManifest.compatibility.map((entry) => [entry.source, entry]),
);

assert.equal(compatibilityManifest.schemaVersion, 2);
assert.equal(compatibilityManifest.namespace, 'wordpress');
assert.equal(compatibilityManifest.ttscRange, '>=0.23.0 <0.27.0');
assert.equal(baselinePackage.version, '0.23.0');
assert.equal(compatibilityManifest.wordpressRules.length, 35);
assert.ok(compatibilityManifest.compiledPresets.recommended.entries.length > 0);
assert.equal(
  compatibilityManifest.compiledPresets.recommended.sourceEntryCount,
  17,
);
assert.equal(
  compatibilityManifest.compiledPresets.recommended.optionDowngrades.length,
  11,
);
assert.deepEqual(
  compatibilityManifest.compiledPresets.recommended.behaviorDowngrades,
  [
    {
      reason: 'semantic-mismatch',
      source: 'jsx-a11y/click-events-have-key-events',
      target: 'jsx-a11y/click-events-have-key-events',
    },
    {
      reason: 'semantic-mismatch',
      source: 'jsx-a11y/no-static-element-interactions',
      target: 'jsx-a11y/no-static-element-interactions',
    },
    {
      reason: 'semantic-mismatch',
      source: 'jsx-a11y/role-supports-aria-props',
      target: 'jsx-a11y/role-supports-aria-props',
    },
    {
      reason: 'engine-failure',
      source: 'no-shadow',
      target: 'no-shadow',
    },
  ],
);
assert.deepEqual(
  compatibilityManifest.compiledPresets.recommended.runnerRules,
  [
    'arrow-parens',
    'comma-dangle',
    'eol-last',
    'indent',
    'no-multiple-empty-lines',
    'no-trailing-spaces',
    'object-curly-spacing',
    'prettier/prettier',
    'quotes',
    'semi',
  ],
);
assert.ok(
  compatibilityManifest.compiledPresets.recommended.supportedRules.length > 0,
);
assert.ok(
  compatibilityManifest.compiledPresets.recommended.unsupportedRules.length > 0,
);

const contributorRules = compatibilityManifest.wordpressRules.filter(
  ({ kind }) => kind === 'contributor',
);
assert.equal(contributorRules.length, 35);
assert.equal(
  compatibilityManifest.wordpressRules.filter(
    ({ kind }) => kind === 'unsupported',
  ).length,
  0,
);
assert.deepEqual(
  compatibilityManifest.compiledPresets.recommended.unsupportedRules.filter(
    (name) => name.startsWith('@wordpress/'),
  ),
  [],
);
// Every contributor rule must be reachable from either a WordPress-owned
// classification or a preset-mapped ecosystem source.
const contributorTargets = new Set(
  compatibilityManifest.compatibility
    .filter(({ kind }) => kind === 'contributor')
    .map(({ target }) => target?.replace('wordpress/', '')),
);
for (const { target } of contributorRules) {
  contributorTargets.add(target?.replace('wordpress/', ''));
}
assert.deepEqual([...contributorTargets].sort(), [...ruleNames].sort());

for (const [presetName, presetRules] of Object.entries(
  compatibilityManifest.presets,
)) {
  assert.ok(
    Object.keys(presetRules).length > 0,
    `${presetName} must inventory at least one rule`,
  );
  for (const ruleName of Object.keys(presetRules)) {
    assert.ok(
      compatibilityBySource.has(ruleName),
      `${presetName} references unclassified rule ${ruleName}`,
    );
  }
}

for (const entry of compatibilityManifest.compatibility) {
  if (entry.kind === 'unsupported') {
    assert.equal(entry.target, undefined);
  } else {
    assert.equal(typeof entry.target, 'string');
  }
}

console.log(
  `Validated ${compatibilityManifest.wordpressRules.length} WordPress rules, ${Object.keys(compatibilityManifest.presets).length} presets, and ${compatibilityManifest.compatibility.length} compatibility mappings.`,
);
