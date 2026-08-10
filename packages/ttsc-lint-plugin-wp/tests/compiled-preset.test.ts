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
    expect(rules['wordpress/i18n-ellipsis']).toBe('error');
    expect(rules['wordpress/i18n-hyphenated-range']).toBe('error');
    expect(rules['wordpress/i18n-no-collapsible-whitespace']).toBe('error');
    expect(rules['wordpress/i18n-no-flanking-whitespace']).toBe('error');
    expect(rules['wordpress/i18n-no-placeholders-only']).toBe('error');
    expect(rules['wordpress/i18n-no-variables']).toBe('error');
    expect(rules['wordpress/i18n-text-domain']).toBe('error');
    expect(rules['wordpress/i18n-translator-comments']).toBe('error');
    expect(
      rules['wordpress/no-base-control-with-label-without-id'],
    ).toBe('error');
    expect(rules['wordpress/no-unguarded-get-range-at']).toBe('error');
    expect(rules['wordpress/no-setting-ds-tokens']).toBe('error');
    expect(rules['wordpress/no-unknown-ds-tokens']).toBe('error');
    expect(rules['wordpress/no-unsafe-render-order']).toBe('error');
    expect(rules['wordpress/no-unsafe-wp-apis']).toBe('error');
    expect(rules['wordpress/no-unused-vars-before-return']).toEqual([
      'error',
      { excludePattern: '^use' },
    ]);
    expect(rules['wordpress/no-wp-process-env']).toBe('error');
    expect(rules['wordpress/valid-sprintf']).toBe('error');
    expect(rules['react/exhaustive-deps']).toBe('warn');
    expect(rules['react/rules-of-hooks']).toBe('error');
    expect(rules['no-shadow']).toBeUndefined();
    expect(rules['jsx-a11y/click-events-have-key-events']).toBeUndefined();
    expect(rules['jsx-a11y/no-static-element-interactions']).toBeUndefined();
    expect(rules['jsx-a11y/role-supports-aria-props']).toBeUndefined();
    expect(
      compatibilityManifest.compiledPresets.recommended.behaviorDowngrades,
    ).toEqual([
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
    ]);
    expect(
      compatibilityManifest.compiledPresets.recommended.optionDowngrades,
    ).toContainEqual({
      source: 'react-hooks/exhaustive-deps',
      target: 'react/exhaustive-deps',
    });
    expect(entries[0]?.rules?.['wordpress/no-global-active-element']).toBe(
      'error',
    );
    expect(entries[0]?.rules?.['wordpress/no-global-get-selection']).toBe(
      'error',
    );
    expect(entries[1]?.rules?.['wordpress/no-global-active-element']).toBe(
      'off',
    );
    expect(entries[1]?.rules?.['wordpress/no-global-get-selection']).toBe(
      'off',
    );
    expect(rules['prettier/prettier']).toBeUndefined();
  });

  test('retains upstream entry names and scoped overrides', () => {
    const [accessibilityEntry, testEntry, globalEntry, typescriptEntry] =
      compatibilityManifest.compiledPresets.recommended.entries;

    expect(accessibilityEntry?.sourceNames).toEqual([
      'jsx-a11y/recommended',
    ]);
    expect(testEntry?.files).toEqual(['**/*.test.js', '**/test/*.js']);
    expect(globalEntry?.sourceNames).toEqual([
      'jsdoc/flat/recommended',
    ]);
    expect(typescriptEntry?.sourceNames).toEqual([
      'typescript-eslint/eslint-recommended',
    ]);
    expect(
      fs.readFileSync(
        path.resolve(
          import.meta.dirname,
          '../configs/wp-scripts-recommended/02.mjs',
        ),
        'utf8',
      ),
    ).toStartWith(
      '// Merged upstream entries; named subset: jsdoc/flat/recommended\n',
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
      expect(`${result.stdout}${result.stderr}`).toContain('fixture.js');
      expect(`${result.stdout}${result.stderr}`).toContain(
        '[wordpress/no-wp-process-env] `IS_WORDPRESS_CORE` should not be accessed from process.env.',
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
