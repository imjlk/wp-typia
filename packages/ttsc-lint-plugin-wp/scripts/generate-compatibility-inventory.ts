import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { format, resolveConfig } from 'prettier';

import type {
  CompatibilityRule,
  CompiledPreset,
  CompiledPresetEntry,
} from '../src/compatibility.js';

const UPSTREAM_PACKAGE = '@wordpress/eslint-plugin';
const UPSTREAM_VERSION = '25.8.0';
// Registry tarball SRI. The parity harness verifies it before extraction; this
// generator receives an expanded package directory and verifies name/version.
const UPSTREAM_INTEGRITY =
  'sha512-QqYfiAVUYFLUhiLlVwB1MoGHcyNElwAPFeXnfZhYUPvFYOmQucsn4dxEGpl67PfcM2XWimni5z+mUquv4y1Mow==';
const TTSC_BASELINE = '0.23.0';
const TTSC_NEXT_UNSUPPORTED = '0.27.0';
const IMPLEMENTED_RULES = new Map<string, string>();
const registerImplementedRule = (name: string): void => {
  IMPLEMENTED_RULES.set(`@wordpress/${name}`, `wordpress/${name}`);
};
registerImplementedRule('i18n-ellipsis');
registerImplementedRule('i18n-hyphenated-range');
registerImplementedRule('i18n-no-collapsible-whitespace');
registerImplementedRule('i18n-no-flanking-whitespace');
registerImplementedRule('i18n-no-placeholders-only');
registerImplementedRule('i18n-no-variables');
registerImplementedRule('i18n-text-domain');
registerImplementedRule('i18n-translator-comments');
registerImplementedRule('no-base-control-with-label-without-id');
registerImplementedRule('no-global-active-element');
registerImplementedRule('no-global-get-selection');
registerImplementedRule('no-setting-ds-tokens');
registerImplementedRule('no-unguarded-get-range-at');
registerImplementedRule('no-unknown-ds-tokens');
registerImplementedRule('no-unsafe-render-order');
registerImplementedRule('no-unsafe-wp-apis');
registerImplementedRule('no-unused-vars-before-return');
registerImplementedRule('no-wp-process-env');
registerImplementedRule('valid-sprintf');

// WordPress presets use the react-hooks namespace while @ttsc/lint exposes
// the equivalent native rules under react.
const RULE_ALIASES = new Map<string, string>([
  ['react-hooks/exhaustive-deps', 'react/exhaustive-deps'],
  ['react-hooks/rules-of-hooks', 'react/rules-of-hooks'],
]);
// These @ttsc/lint implementations accept only a severity. Upstream option
// payloads are removed explicitly and recorded in optionDowngrades.
const SEVERITY_ONLY_TRANSLATIONS = new Set([
  'camelcase',
  'curly',
  'jsx-a11y/control-has-associated-label',
  'jsx-a11y/interactive-supports-focus',
  'jsx-a11y/label-has-associated-control',
  'jsx-a11y/no-interactive-element-to-noninteractive-role',
  'jsx-a11y/no-noninteractive-element-interactions',
  'jsx-a11y/no-noninteractive-element-to-interactive-role',
  'jsx-a11y/no-noninteractive-tabindex',
  'no-cond-assign',
  'react/exhaustive-deps',
]);
const COMPILED_BEHAVIOR_DOWNGRADES = new Map<
  string,
  'engine-failure' | 'semantic-mismatch'
>([
  ['no-shadow', 'engine-failure'],
  ['jsx-a11y/click-events-have-key-events', 'semantic-mismatch'],
  ['jsx-a11y/no-static-element-interactions', 'semantic-mismatch'],
  ['jsx-a11y/role-supports-aria-props', 'semantic-mismatch'],
]);

interface FlatConfigEntry {
  files?: readonly string[];
  ignores?: readonly string[];
  name?: string;
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
for (const [source, target] of RULE_ALIASES) {
  if (!builtinRules.has(target)) {
    throw new Error(
      `Compatibility alias ${source} requires missing @ttsc/lint rule ${target}.`,
    );
  }
}

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
          .sort(([left], [right]) => compareCodeUnits(left, right))
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
const compatibilityBySource = new Map(
  compatibility.map((entry) => [entry.source, entry]),
);
const compiledRecommended = compilePreset(
  plugin.configs.recommended ?? [],
  compatibilityBySource,
);

const manifest = {
  schemaVersion: 2,
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
  compiledPresets: {
    recommended: compiledRecommended,
  },
};

const outputPath = path.resolve(
  import.meta.dirname,
  `../compatibility/upstream-${UPSTREAM_VERSION}.json`,
);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
await writeCompiledPreset(
  path.resolve(import.meta.dirname, '../configs/wp-scripts-recommended'),
  compiledRecommended.entries,
);
console.log(`Wrote ${path.relative(process.cwd(), outputPath)}.`);

function compilePreset(
  entries: readonly FlatConfigEntry[],
  compatibilityBySource: ReadonlyMap<string, CompatibilityRule>,
): CompiledPreset {
  const runnerRules = new Set<string>();
  const supportedRules = new Set<string>();
  const unsupportedRules = new Set<string>();
  const optionDowngrades = new Map<string, string>();
  const behaviorDowngrades = new Map<
    string,
    {
      reason: 'engine-failure' | 'semantic-mismatch';
      target: string;
    }
  >();
  const compiledEntries: CompiledPresetEntry[] = [];

  for (const entry of entries) {
    const translatedRules = new Map<string, unknown>();
    for (const [source, setting] of Object.entries(entry.rules ?? {})) {
      const ruleCompatibility = compatibilityBySource.get(source);
      if (!ruleCompatibility) {
        throw new Error(`Missing compatibility classification for ${source}.`);
      }
      if (ruleCompatibility.kind === 'unsupported') {
        if (!isOff(setting)) unsupportedRules.add(source);
        continue;
      }
      if (ruleCompatibility.kind === 'runner') {
        if (!isOff(setting)) runnerRules.add(source);
        continue;
      }
      const behaviorDowngrade = COMPILED_BEHAVIOR_DOWNGRADES.get(source);
      if (behaviorDowngrade) {
        if (!isOff(setting)) {
          unsupportedRules.add(source);
          behaviorDowngrades.set(source, {
            reason: behaviorDowngrade,
            target: ruleCompatibility.target,
          });
        }
        continue;
      }
      const normalizedSetting = normalizeSeverity(setting);
      if (
        Array.isArray(normalizedSetting) &&
        normalizedSetting.length > 1 &&
        SEVERITY_ONLY_TRANSLATIONS.has(ruleCompatibility.target)
      ) {
        translatedRules.set(ruleCompatibility.target, normalizedSetting[0]);
        optionDowngrades.set(source, ruleCompatibility.target);
      } else {
        translatedRules.set(ruleCompatibility.target, normalizedSetting);
      }
      if (!isOff(setting)) supportedRules.add(source);
    }

    const rules = Object.fromEntries(
      [...translatedRules.entries()].sort(([left], [right]) =>
        compareCodeUnits(left, right),
      ),
    );
    if (Object.keys(rules).length === 0 && !entry.ignores?.length) continue;
    appendCompiledEntry(compiledEntries, {
      ...(entry.files?.length ? { files: [...entry.files] } : {}),
      ...(entry.ignores?.length ? { ignores: [...entry.ignores] } : {}),
      rules,
      ...(entry.name ? { sourceNames: [entry.name] } : {}),
    });
  }

  return {
    behaviorDowngrades: [...behaviorDowngrades]
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([source, value]) => ({ source, ...value })),
    entries: compiledEntries,
    optionDowngrades: [...optionDowngrades]
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([source, target]) => ({ source, target })),
    runnerRules: [...runnerRules].sort(),
    sourceEntryCount: entries.length,
    supportedRules: [...supportedRules].sort(),
    unsupportedRules: [...unsupportedRules].sort(),
  };
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function appendCompiledEntry(
  entries: CompiledPresetEntry[],
  next: CompiledPresetEntry,
): void {
  const previous = entries[entries.length - 1];
  if (
    previous &&
    !previous.ignores?.length &&
    !next.ignores?.length &&
    patternListsEqual(previous.files, next.files)
  ) {
    const sourceNames = [
      ...(previous.sourceNames ?? []),
      ...(next.sourceNames ?? []),
    ];
    entries[entries.length - 1] = {
      ...(next.files ? { files: next.files } : {}),
      rules: {
        ...previous.rules,
        ...next.rules,
      },
      ...(sourceNames.length ? { sourceNames } : {}),
    };
    return;
  }
  entries.push(next);
}

function patternListsEqual(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return (
    left.length === right.length &&
    left.every((pattern, index) => pattern === right[index])
  );
}

async function writeCompiledPreset(
  outputDir: string,
  entries: readonly CompiledPresetEntry[],
): Promise<void> {
  if (entries.length === 0) {
    throw new Error('Compiled preset must contain at least one entry.');
  }
  const modules = entries.map((entry, index) => {
    const fileName = `${String(index).padStart(2, '0')}.mjs`;
    const outputPath = path.join(outputDir, fileName);
    const config = {
      ...(entry.files ? { files: entry.files } : {}),
      ...(entry.ignores ? { ignores: entry.ignores } : {}),
      rules: entry.rules,
    };
    const serialized = JSON.stringify(config, null, 2);
    const provenance = entry.sourceNames?.length
      ? `// Merged upstream entries; named subset: ${entry.sourceNames.join(', ')}\n`
      : '';
    const previousFileName =
      index > 0 ? `${String(index - 1).padStart(2, '0')}.mjs` : undefined;
    const source = previousFileName
      ? `${provenance}import { fileURLToPath } from 'node:url';\n\nconst config = ${serialized};\n\nexport default {\n  ...config,\n  extends: fileURLToPath(new URL('./${previousFileName}', import.meta.url)),\n};\n`
      : `${provenance}export default ${serialized};\n`;
    return { fileName, outputPath, source };
  });

  const lastModule = modules[modules.length - 1];
  if (!lastModule) throw new Error('Compiled preset generation failed.');
  const formattedModules = await Promise.all(
    modules.map(async ({ outputPath, source }) => ({
      outputPath,
      source: await formatGeneratedModule(source, outputPath),
    })),
  );
  const indexPath = path.join(outputDir, 'index.mjs');
  const formattedIndex = await formatGeneratedModule(
    `import { fileURLToPath } from 'node:url';\n\nexport default {\n  extends: fileURLToPath(new URL('./${lastModule.fileName}', import.meta.url)),\n};\n`,
    indexPath,
  );

  replaceDirectory(
    outputDir,
    [
      ...formattedModules.map(({ outputPath, source }) => ({
        fileName: path.basename(outputPath),
        source,
      })),
      { fileName: path.basename(indexPath), source: formattedIndex },
    ],
  );
}

function replaceDirectory(
  outputDir: string,
  files: readonly { fileName: string; source: string }[],
): void {
  const parentDir = path.dirname(outputDir);
  const tempDir = fs.mkdtempSync(
    path.join(parentDir, `.${path.basename(outputDir)}-`),
  );
  const previousDir = `${tempDir}.previous`;
  let installed = false;

  try {
    for (const { fileName, source } of files) {
      fs.writeFileSync(path.join(tempDir, fileName), source);
    }

    const hadPrevious = fs.existsSync(outputDir);
    if (hadPrevious) fs.renameSync(outputDir, previousDir);
    try {
      fs.renameSync(tempDir, outputDir);
      installed = true;
    } catch (error) {
      if (hadPrevious) {
        try {
          fs.renameSync(previousDir, outputDir);
        } catch (rollbackError) {
          throw new Error(
            `Failed to install ${outputDir} and restore its backup at ${previousDir}. Install error: ${String(error)}. Rollback error: ${String(rollbackError)}.`,
          );
        }
      }
      throw error;
    }
    if (hadPrevious) {
      try {
        fs.rmSync(previousDir, { force: true, recursive: true });
      } catch (error) {
        console.warn(
          `Generated preset installed, but failed to remove ${previousDir}: ${String(error)}`,
        );
      }
    }
  } finally {
    if (!installed) fs.rmSync(tempDir, { force: true, recursive: true });
  }
}

function normalizeSeverity(setting: unknown): unknown {
  if (Array.isArray(setting)) {
    return [normalizeSeverityValue(setting[0]), ...setting.slice(1)];
  }
  return normalizeSeverityValue(setting);
}

function normalizeSeverityValue(value: unknown): unknown {
  if (value === 0) return 'off';
  if (value === 1) return 'warn';
  if (value === 2) return 'error';
  return value;
}

async function formatGeneratedModule(
  source: string,
  outputPath: string,
): Promise<string> {
  const resolvedConfig = (await resolveConfig(outputPath)) ?? {};
  return format(source, {
    ...resolvedConfig,
    filepath: outputPath,
  });
}

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
  const aliasTarget = RULE_ALIASES.get(source);
  if (aliasTarget) {
    return { kind: 'mapped', source, target: aliasTarget };
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
