import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import type { CompatibilityRule } from '../src/compatibility.js';

const UPSTREAM_PACKAGE = '@wordpress/eslint-plugin';
const UPSTREAM_VERSION = '25.8.0';
// Registry tarball SRI. The parity harness verifies it before extraction; this
// generator receives an expanded package directory and verifies name/version.
const UPSTREAM_INTEGRITY =
  'sha512-QqYfiAVUYFLUhiLlVwB1MoGHcyNElwAPFeXnfZhYUPvFYOmQucsn4dxEGpl67PfcM2XWimni5z+mUquv4y1Mow==';
const TTSC_BASELINE = '0.23.0';
const TTSC_NEXT_UNSUPPORTED = '0.26.0';
const IMPLEMENTED_RULES = new Map([
  ['@wordpress/i18n-text-domain', 'wordpress/i18n-text-domain'],
  ['@wordpress/no-unsafe-wp-apis', 'wordpress/no-unsafe-wp-apis'],
  ['@wordpress/valid-sprintf', 'wordpress/valid-sprintf'],
]);

interface FlatConfigEntry {
  rules?: Readonly<Record<string, unknown>>;
}

interface WordPressEslintPlugin {
  configs: Readonly<Record<string, readonly FlatConfigEntry[]>>;
  rules: Readonly<Record<string, unknown>>;
}

const packageRoot = process.env.WP_ESLINT_PLUGIN_DIR;
if (!packageRoot) {
  throw new Error(
    'Set WP_ESLINT_PLUGIN_DIR to an installed @wordpress/eslint-plugin 25.8.0 directory.',
  );
}

const packageJson = JSON.parse(
  fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
) as { name?: string; version?: string };
if (
  packageJson.name !== UPSTREAM_PACKAGE ||
  packageJson.version !== UPSTREAM_VERSION
) {
  throw new Error(
    `Expected ${UPSTREAM_PACKAGE}@${UPSTREAM_VERSION}, found ${String(packageJson.name)}@${String(packageJson.version)}.`,
  );
}

const require = createRequire(import.meta.url);
const plugin = require(packageRoot) as WordPressEslintPlugin;
const ttscLintPackageJsonPath = require.resolve('@ttsc/lint/package.json');
const ttscLintRoot = path.dirname(ttscLintPackageJsonPath);
const ttscLintPackageJson = JSON.parse(
  fs.readFileSync(ttscLintPackageJsonPath, 'utf8'),
) as { version?: string };
if (ttscLintPackageJson.version !== TTSC_BASELINE) {
  throw new Error(
    `Compatibility generation must use the minimum @ttsc/lint ${TTSC_BASELINE} baseline, found ${String(ttscLintPackageJson.version)}.`,
  );
}
const ruleCodes = JSON.parse(
  fs.readFileSync(path.join(ttscLintRoot, 'linthost/rule_codes.json'), 'utf8'),
) as Record<string, number>;
const builtinRules = new Set(Object.keys(ruleCodes));

const wordpressRules = Object.keys(plugin.rules)
  .sort()
  .map((name) => classifyRule(`@wordpress/${name}`, builtinRules));

const presetNames = Object.keys(plugin.configs).sort();
const presetRuleStates = Object.fromEntries(
  presetNames.map((presetName) => {
    const states = new Map<string, Set<'enabled' | 'off'>>();
    for (const entry of plugin.configs[presetName] ?? []) {
      for (const [ruleName, setting] of Object.entries(entry.rules ?? {})) {
        const state = isOff(setting) ? 'off' : 'enabled';
        const existing = states.get(ruleName) ?? new Set();
        existing.add(state);
        states.set(ruleName, existing);
      }
    }
    return [
      presetName,
      Object.fromEntries(
        [...states.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([name, statesForRule]) => [
            name,
            statesForRule.size > 1
              ? 'mixed'
              : ([...statesForRule][0] ?? 'off'),
          ]),
      ),
    ];
  }),
);

const allPresetRuleNames = new Set<string>();
for (const rules of Object.values(presetRuleStates)) {
  for (const ruleName of Object.keys(rules)) {
    allPresetRuleNames.add(ruleName);
  }
}

const compatibility = [...allPresetRuleNames]
  .sort()
  .map((source) => classifyRule(source, builtinRules));

const manifest = {
  schemaVersion: 1,
  upstream: {
    integrity: UPSTREAM_INTEGRITY,
    package: UPSTREAM_PACKAGE,
    version: UPSTREAM_VERSION,
  },
  namespace: 'wordpress',
  ttscRange: `>=${TTSC_BASELINE} <${TTSC_NEXT_UNSUPPORTED}`,
  wordpressRules,
  presets: presetRuleStates,
  compatibility,
};

const outputPath = path.resolve(
  import.meta.dirname,
  `../compatibility/upstream-${UPSTREAM_VERSION}.json`,
);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${path.relative(process.cwd(), outputPath)}.`);

function isOff(setting: unknown): boolean {
  if (Array.isArray(setting)) {
    return setting[0] === 'off' || setting[0] === 0;
  }
  return setting === 'off' || setting === 0;
}

function classifyRule(
  source: string,
  builtinRules: ReadonlySet<string>,
): CompatibilityRule {
  const contributorTarget = IMPLEMENTED_RULES.get(source);
  if (contributorTarget) {
    return { kind: 'contributor', source, target: contributorTarget };
  }
  if (source.startsWith('@wordpress/')) {
    return { kind: 'unsupported', source };
  }
  if (source === 'prettier/prettier') {
    return { kind: 'runner', source, target: 'ttsc format' };
  }
  if (builtinRules.has(source)) {
    return { kind: 'builtin', source, target: source };
  }
  if (source.startsWith('@typescript-eslint/')) {
    const target = `typescript/${source.slice('@typescript-eslint/'.length)}`;
    if (builtinRules.has(target)) {
      return { kind: 'mapped', source, target };
    }
  }
  return { kind: 'unsupported', source };
}
