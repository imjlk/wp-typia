import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { compatibilityManifest, configs } from '../src/index.js';

interface LoadedConfig {
  extends?: string;
  files?: readonly string[];
  ignores?: readonly string[];
  rules?: Readonly<Record<string, unknown>>;
}

describe('compiled WordPress presets', () => {
  test('preserves supported recommended entries in declaration order', async () => {
    const actual = await loadConfigChain(
      configs.wpScriptsRecommended.extends,
    );
    const expected = compatibilityManifest.compiledPresets.recommended.entries.map(
      ({ files, ignores, rules }) => ({
        ...(files ? { files } : {}),
        ...(ignores ? { ignores } : {}),
        rules,
      }),
    );

    expect(actual).toEqual(expected);
  });

  test('retains mapped rule identifiers and exposes option downgrades', async () => {
    const entries = await loadConfigChain(
      configs.wpScriptsRecommended.extends,
    );
    const rules = Object.assign({}, ...entries.map(({ rules }) => rules));

    expect(rules['jsx-a11y/interactive-supports-focus']).toBe('error');
    expect(
      compatibilityManifest.compiledPresets.recommended.optionDowngrades,
    ).toContainEqual({
      source: 'jsx-a11y/interactive-supports-focus',
      target: 'jsx-a11y/interactive-supports-focus',
    });
    expect(rules['typescript/method-signature-style']).toBe('error');
    expect(rules['wordpress/i18n-text-domain']).toBe('error');
    expect(rules['wordpress/no-unsafe-wp-apis']).toBe('error');
    expect(rules['wordpress/valid-sprintf']).toBe('error');
    expect(rules['prettier/prettier']).toBeUndefined();
  });

  test('retains upstream entry names when adjacent scopes are folded', () => {
    const [globalEntry, typescriptEntry] =
      compatibilityManifest.compiledPresets.recommended.entries;

    expect(globalEntry?.sourceNames).toEqual([
      'jsx-a11y/recommended',
      'jsdoc/flat/recommended',
    ]);
    expect(typescriptEntry?.sourceNames).toEqual([
      'typescript-eslint/eslint-recommended',
    ]);
    expect(
      fs.readFileSync(
        path.resolve(
          import.meta.dirname,
          '../configs/wp-scripts-recommended/00.mjs',
        ),
        'utf8',
      ),
    ).toStartWith(
      '// Upstream entries: jsx-a11y/recommended, jsdoc/flat/recommended\n',
    );
  });

  test(
    'loads and reports through the published ttsc config contract',
    () => {
      const fixtureRoot = path.join(
        import.meta.dirname,
        'fixtures',
        'compiled-preset',
      );
      const ttscBinary = path.resolve(
        import.meta.dirname,
        '../../../node_modules/.bin/ttsc',
      );
      const result = spawnSync(
        ttscBinary,
        ['check', '--noEmit', '--pretty', 'false', '--project', 'tsconfig.json'],
        {
          cwd: fixtureRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            NO_COLOR: '1',
          },
          timeout: 300_000,
        },
      );

      expect(result.error).toBeUndefined();
      expect(`${result.stdout}${result.stderr}`).toContain(
        '[no-var] Unexpected var, use let or const instead.',
      );
      expect(result.status).toBe(2);
    },
    300_000,
  );
});

async function loadConfigChain(configPath: string): Promise<LoadedConfig[]> {
  const config = await importConfig(configPath);
  const inherited = config.extends ? await loadConfigChain(config.extends) : [];
  const { extends: _extends, ...entry } = config;
  if (
    !entry.files &&
    !entry.ignores &&
    Object.keys(entry.rules ?? {}).length === 0
  ) {
    return inherited;
  }
  return [...inherited, entry];
}

async function importConfig(configPath: string): Promise<LoadedConfig> {
  const resolvedPath = path.resolve(configPath);
  const module = (await import(pathToFileURL(resolvedPath).href)) as {
    default?: LoadedConfig;
  };
  if (!module.default) {
    throw new Error(`Missing default export from ${resolvedPath}.`);
  }
  return module.default;
}
