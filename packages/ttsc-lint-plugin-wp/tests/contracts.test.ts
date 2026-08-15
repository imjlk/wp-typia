import type { ITtscLintConfig } from '@ttsc/lint';
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

import plugin, {
  compatibilityManifest,
  configs,
  presetCompatibility,
  ruleNames,
} from '../src/index.js';

describe('@wp-typia/ttsc-lint-plugin-wp contracts', () => {
  test('exports an absolute contributor source with no private Go module', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(import.meta.dirname, '../package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      version: string;
    };
    expect(plugin.meta).toMatchObject({
      name: '@wp-typia/ttsc-lint-plugin-wp',
      namespace: 'wordpress',
    });
    expect(plugin.rules).toEqual(ruleNames);
    expect(plugin.meta?.version).toBe(packageJson.version);
    expect(packageJson.dependencies).toBeUndefined();
    expect(packageJson.peerDependencies).toEqual({
      '@ttsc/lint': compatibilityManifest.ttscRange,
      ttsc: compatibilityManifest.ttscRange,
    });
    expect(fs.statSync(plugin.source).isDirectory()).toBe(true);
    expect(fs.existsSync(`${plugin.source}/go.mod`)).toBe(false);
  });

  test('keeps preset coverage explicit', () => {
    expect(Object.keys(configs)).toEqual([
      'custom',
      'i18n',
      'recommended',
      'wpScriptsRecommended',
    ]);
    expect(Object.values(presetCompatibility)).toEqual([
      {
        coverage: 'partial',
        upstream: '@wordpress/eslint-plugin/custom',
      },
      {
        coverage: 'full',
        upstream: '@wordpress/eslint-plugin/i18n',
      },
      {
        coverage: 'partial',
        upstream: '@wordpress/eslint-plugin/recommended',
      },
      {
        coverage: 'partial',
        upstream: '@wordpress/eslint-plugin/recommended',
      },
    ]);
    expect(configs.wpScriptsRecommended.plugins).toEqual({ wordpress: plugin });
    expect(fs.existsSync(configs.wpScriptsRecommended.extends)).toBe(true);
    expect(
      configs.recommended.rules['wordpress/no-unused-vars-before-return'],
    ).toEqual(['error', { excludePattern: '^use' }]);
  });

  test('publishes an immutable upstream inventory baseline', () => {
    expect(compatibilityManifest.schemaVersion).toBe(2);
    expect(compatibilityManifest.upstream).toEqual({
      integrity:
        'sha512-QqYfiAVUYFLUhiLlVwB1MoGHcyNElwAPFeXnfZhYUPvFYOmQucsn4dxEGpl67PfcM2XWimni5z+mUquv4y1Mow==',
      package: '@wordpress/eslint-plugin',
      version: '25.8.0',
    });
    expect(compatibilityManifest.wordpressRules).toHaveLength(35);
    expect(
      compatibilityManifest.wordpressRules.filter(
        ({ kind }) => kind === 'contributor',
      ),
    ).toHaveLength(35);
    expect(
      compatibilityManifest.compiledPresets.recommended.supportedRules,
    ).toHaveLength(109);
    expect(
      compatibilityManifest.compiledPresets.recommended.unsupportedRules,
    ).toHaveLength(80);
    expect(
      compatibilityManifest.compiledPresets.recommended.optionDowngrades,
    ).toHaveLength(11);
    expect(
      compatibilityManifest.compiledPresets.recommended.behaviorDowngrades,
    ).toHaveLength(4);
    expect(
      compatibilityManifest.compiledPresets.recommended.sourceEntryCount,
    ).toBe(17);
    expect(
      compatibilityManifest.compiledPresets.recommended.unsupportedRules.filter(
        (name) => name.startsWith('@wordpress/'),
      ),
    ).toEqual([]);
    expect(
      compatibilityManifest.compatibility.find(
        ({ source }) => source === 'react-hooks/exhaustive-deps',
      ),
    ).toEqual({
      kind: 'mapped',
      source: 'react-hooks/exhaustive-deps',
      target: 'react/exhaustive-deps',
    });
    expect(
      compatibilityManifest.compatibility.find(
        ({ source }) => source === 'react-hooks/rules-of-hooks',
      ),
    ).toEqual({
      kind: 'mapped',
      source: 'react-hooks/rules-of-hooks',
      target: 'react/rules-of-hooks',
    });
  });
});

const typedConfig = {
  plugins: { wordpress: plugin },
  rules: {
    'wordpress/i18n-ellipsis': 'error',
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: ['my-plugin'] },
    ],
    'wordpress/no-unsafe-wp-apis': [
      'warning',
      { '@wordpress/components': ['__unstableAllowed'] },
    ],
    'wordpress/no-unsafe-render-order': ['error', { checkLocalImports: true }],
    'wordpress/no-unused-vars-before-return': [
      'error',
      { excludePattern: '^use' },
    ],
    'wordpress/valid-sprintf': 'error',
  },
} satisfies ITtscLintConfig;

void typedConfig;

const invalidTextDomainConfig = {
  rules: {
    'wordpress/i18n-text-domain': [
      'error',
      {
        // @ts-expect-error -- contributor augmentation rejects non-string domains.
        allowedTextDomain: 42,
      },
    ],
  },
} satisfies ITtscLintConfig;

void invalidTextDomainConfig;

const invalidOptionlessConfig = {
  rules: {
    // @ts-expect-error -- optionless contributor rules reject payloads.
    'wordpress/i18n-ellipsis': ['error', { replacement: '...' }],
  },
} satisfies ITtscLintConfig;

void invalidOptionlessConfig;
