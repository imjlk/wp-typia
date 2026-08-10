import assert from 'node:assert/strict';

import { compatibilityManifest, ruleNames } from '../src/index.js';

const compatibilityBySource = new Map(
  compatibilityManifest.compatibility.map((entry) => [entry.source, entry]),
);

assert.equal(compatibilityManifest.schemaVersion, 2);
assert.equal(compatibilityManifest.namespace, 'wordpress');
assert.equal(compatibilityManifest.ttscRange, '>=0.23.0 <0.26.0');
assert.equal(compatibilityManifest.wordpressRules.length, 35);
assert.ok(compatibilityManifest.compiledPresets.recommended.entries.length > 0);
assert.equal(
  compatibilityManifest.compiledPresets.recommended.sourceEntryCount,
  17,
);
assert.equal(
  compatibilityManifest.compiledPresets.recommended.optionDowngrades.length,
  12,
);
assert.deepEqual(
  compatibilityManifest.compiledPresets.recommended.runnerRules,
  ['prettier/prettier'],
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
assert.equal(contributorRules.length, 19);
assert.deepEqual(
  compatibilityManifest.compiledPresets.recommended.unsupportedRules.filter(
    (name) => name.startsWith('@wordpress/'),
  ),
  [],
);
assert.deepEqual(
  contributorRules
    .map(({ target }) => target?.replace('wordpress/', ''))
    .sort(),
  [...ruleNames].sort(),
);

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
