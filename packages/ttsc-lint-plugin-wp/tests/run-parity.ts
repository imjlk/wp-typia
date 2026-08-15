import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';

import { ESLint } from 'eslint';

import {
  installPinnedGlobals,
  pinnedGlobalsRoot,
  verifyEmbeddedDomGlobals,
} from '../scripts/upstream-dom-globals';
import { installPinnedTarball } from '../scripts/pinned-tarball';

const require = createRequire(import.meta.url);
const installedTtscPackage = require('ttsc/package.json') as {
  version?: string;
};
const UPSTREAM_VERSION = '25.8.0';
const UPSTREAM_INTEGRITY =
  'sha512-QqYfiAVUYFLUhiLlVwB1MoGHcyNElwAPFeXnfZhYUPvFYOmQucsn4dxEGpl67PfcM2XWimni5z+mUquv4y1Mow==';
const UPSTREAM_TARBALL = `https://registry.npmjs.org/@wordpress/eslint-plugin/-/eslint-plugin-${UPSTREAM_VERSION}.tgz`;
const UPSTREAM_THEME_VERSION = '1.1.0';
const UPSTREAM_THEME_INTEGRITY =
  'sha512-SWEGYY/HnSzmKDJnDhWVfxUDyLlJkz9EtpfAWhgPcCLSaZVc/pp99Fxr+/ueB2mHlQ9gpaWCPAMBxq8knDCbXw==';
const UPSTREAM_THEME_TARBALL = `https://registry.npmjs.org/@wordpress/theme/-/theme-${UPSTREAM_THEME_VERSION}.tgz`;
const TTSC_CONSUMER_VERSION =
  process.env.TTSC_CONSUMER_VERSION ?? installedTtscPackage.version ?? '';
assert.match(
  TTSC_CONSUMER_VERSION,
  /^\d+\.\d+\.\d+$/u,
  'the parity consumer must resolve an exact ttsc version',
);
const NETWORK_TIMEOUT_MS = 60_000;
const PACKAGE_INSTALL_TIMEOUT_MS = 300_000;
const TTSC_PROCESS_TIMEOUT_MS = 300_000;
const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '../..');
const rootPackageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
) as { devDependencies?: { typescript?: string } };
const TYPESCRIPT_CONSUMER_VERSION =
  rootPackageJson.devDependencies?.typescript ?? '';
assert.match(
  TYPESCRIPT_CONSUMER_VERSION,
  /^7\.\d+\.\d+$/u,
  "the parity consumer must use the repository's exact TypeScript 7 version",
);
const sourceFixtureRoot = path.join(import.meta.dirname, 'fixtures/parity');
const fixtureSource = fs.readFileSync(
  path.join(sourceFixtureRoot, 'fixture.tsx'),
  'utf8',
);
// Script-variant sources exercise the no-i18n-in-save file-name checks; the
// paths must carry a directory prefix because the upstream rule matches
// `/save.*` and `/deprecated.*` suffixes.
const parityLintTargets = [
  { filePath: 'fixture.tsx', source: fixtureSource },
  {
    filePath: 'src/save.tsx',
    source: fs.readFileSync(
      path.join(sourceFixtureRoot, 'save-fixture.tsx'),
      'utf8',
    ),
  },
  {
    filePath: 'src/deprecated.tsx',
    source: fs.readFileSync(
      path.join(sourceFixtureRoot, 'deprecated-fixture.tsx'),
      'utf8',
    ),
  },
] as const;

const upstreamRoot = await prepareUpstreamPackage();
verifyEmbeddedDesignTokens(upstreamRoot, require);
verifyEmbeddedDomGlobals(packageRoot, pinnedGlobalsRoot(upstreamRoot));
const upstreamRules = {
  'components-no-missing-40px-size-prop': require(
    path.join(upstreamRoot, 'rules/components-no-missing-40px-size-prop.js'),
  ),
  'components-no-unsafe-button-disabled': require(
    path.join(upstreamRoot, 'rules/components-no-unsafe-button-disabled.js'),
  ),
  'data-no-store-string-literals': require(
    path.join(upstreamRoot, 'rules/data-no-store-string-literals.js'),
  ),
  'dependency-group': require(
    path.join(upstreamRoot, 'rules/dependency-group.js'),
  ),
  'i18n-ellipsis': require(path.join(upstreamRoot, 'rules/i18n-ellipsis.js')),
  'i18n-hyphenated-range': require(
    path.join(upstreamRoot, 'rules/i18n-hyphenated-range.js'),
  ),
  'i18n-no-collapsible-whitespace': require(
    path.join(upstreamRoot, 'rules/i18n-no-collapsible-whitespace.js'),
  ),
  'i18n-no-flanking-whitespace': require(
    path.join(upstreamRoot, 'rules/i18n-no-flanking-whitespace.js'),
  ),
  'i18n-no-placeholders-only': require(
    path.join(upstreamRoot, 'rules/i18n-no-placeholders-only.js'),
  ),
  'i18n-no-variables': require(
    path.join(upstreamRoot, 'rules/i18n-no-variables.js'),
  ),
  'i18n-text-domain': require(
    path.join(upstreamRoot, 'rules/i18n-text-domain.js'),
  ),
  'i18n-translator-comments': require(
    path.join(upstreamRoot, 'rules/i18n-translator-comments.js'),
  ),
  'no-unsafe-wp-apis': require(
    path.join(upstreamRoot, 'rules/no-unsafe-wp-apis.js'),
  ),
  'no-base-control-with-label-without-id': require(
    path.join(upstreamRoot, 'rules/no-base-control-with-label-without-id.js'),
  ),
  'no-dom-globals-in-constructor': require(
    path.join(upstreamRoot, 'rules/no-dom-globals-in-constructor.js'),
  ),
  'no-dom-globals-in-module-scope': require(
    path.join(upstreamRoot, 'rules/no-dom-globals-in-module-scope.js'),
  ),
  'no-dom-globals-in-react-cc-render': require(
    path.join(upstreamRoot, 'rules/no-dom-globals-in-react-cc-render.js'),
  ),
  'no-dom-globals-in-react-fc': require(
    path.join(upstreamRoot, 'rules/no-dom-globals-in-react-fc.js'),
  ),
  'no-ds-tokens': require(path.join(upstreamRoot, 'rules/no-ds-tokens.js')),
  'no-global-active-element': require(
    path.join(upstreamRoot, 'rules/no-global-active-element.js'),
  ),
  'no-global-get-selection': require(
    path.join(upstreamRoot, 'rules/no-global-get-selection.js'),
  ),
  'no-i18n-in-save': require(
    path.join(upstreamRoot, 'rules/no-i18n-in-save.js'),
  ),
  'no-non-module-stylesheet-imports': require(
    path.join(upstreamRoot, 'rules/no-non-module-stylesheet-imports.js'),
  ),
  'no-setting-ds-tokens': require(
    path.join(upstreamRoot, 'rules/no-setting-ds-tokens.js'),
  ),
  'no-unknown-ds-tokens': require(
    path.join(upstreamRoot, 'rules/no-unknown-ds-tokens.js'),
  ),
  'no-unmerged-classname': require(
    path.join(upstreamRoot, 'rules/no-unmerged-classname.js'),
  ),
  'no-unguarded-get-range-at': require(
    path.join(upstreamRoot, 'rules/no-unguarded-get-range-at.js'),
  ),
  'no-unsafe-render-order': require(
    path.join(upstreamRoot, 'rules/no-unsafe-render-order.js'),
  ),
  'no-wp-process-env': require(
    path.join(upstreamRoot, 'rules/no-wp-process-env.js'),
  ),
  'react-no-unsafe-timeout': require(
    path.join(upstreamRoot, 'rules/react-no-unsafe-timeout.js'),
  ),
  'use-import-as': require(path.join(upstreamRoot, 'rules/use-import-as.js')),
  'use-recommended-components': require(
    path.join(upstreamRoot, 'rules/use-recommended-components.js'),
  ),
  'no-unused-vars-before-return': require(
    path.join(upstreamRoot, 'rules/no-unused-vars-before-return.js'),
  ),
  'valid-sprintf': require(path.join(upstreamRoot, 'rules/valid-sprintf.js')),
  'wp-global-usage': require(
    path.join(upstreamRoot, 'rules/wp-global-usage.js'),
  ),
};

const eslint = createUpstreamEslint(false);
const expected = [];
for (const target of parityLintTargets) {
  const [eslintResult] = await eslint.lintText(target.source, {
    filePath: target.filePath,
  });
  assert.ok(eslintResult);
  expected.push(
    ...eslintResult.messages
      .filter(({ ruleId }) => ruleId?.startsWith('@wordpress/'))
      .map(({ column, line, message, ruleId }) => ({
        column,
        file: path.basename(target.filePath),
        line,
        message,
        ruleId,
      })),
  );
}
expected.sort(compareDiagnostic);

const { consumerRoot, fixtureRoot } = prepareConsumerProject();
const ttscBinary = path.join(consumerRoot, 'node_modules/.bin/ttsc');
const ttscEnv = {
  ...process.env,
  NO_COLOR: '1',
  TTSC_CACHE_DIR:
    process.env.TTSC_CACHE_DIR ??
    path.join(repoRoot, 'node_modules/.cache/ttsc'),
  TTSC_GO_CACHE_DIR:
    process.env.TTSC_GO_CACHE_DIR ??
    path.join(repoRoot, 'node_modules/.cache/ttsc/go-build'),
};
const ttscResult = spawnSync(
  ttscBinary,
  ['--noEmit', '--pretty', 'false', '--project', 'tsconfig.json'],
  {
    cwd: fixtureRoot,
    encoding: 'utf8',
    env: ttscEnv,
    timeout: TTSC_PROCESS_TIMEOUT_MS,
  },
);
assert.ifError(ttscResult.error);
const ttscOutput = `${ttscResult.stdout}${ttscResult.stderr}`;
assert.notEqual(
  ttscResult.status,
  0,
  'the parity fixture must emit diagnostics',
);
const actual = parseTtscDiagnostics(ttscOutput).sort(compareDiagnostic);

assert.ok(
  actual.length > 0,
  `ttsc emitted no parsed diagnostics:\n${ttscOutput}`,
);
assert.deepEqual(actual, expected, ttscOutput);

const [eslintFixResult] = await createUpstreamEslint(true).lintText(
  fixtureSource,
  { filePath: 'fixture.tsx' },
);
assert.ok(eslintFixResult);
const expectedFixedSource = eslintFixResult.output ?? fixtureSource;
const ttscFixResult = spawnSync(
  ttscBinary,
  ['fix', '--pretty', 'false', '--project', 'tsconfig.json'],
  {
    cwd: fixtureRoot,
    encoding: 'utf8',
    env: ttscEnv,
    timeout: TTSC_PROCESS_TIMEOUT_MS,
  },
);
assert.ifError(ttscFixResult.error);
assert.notEqual(
  ttscFixResult.status,
  0,
  'non-fixable parity diagnostics must remain after ttsc fix',
);
assert.equal(
  fs.readFileSync(path.join(fixtureRoot, 'fixture.tsx'), 'utf8'),
  expectedFixedSource,
  `${ttscFixResult.stdout}${ttscFixResult.stderr}`,
);
verifySafeI18nFixes(fixtureRoot, ttscBinary, ttscEnv);
verifyInvalidOptionsFailClosed(fixtureRoot, ttscBinary, ttscEnv);
verifyBehaviorDowngradesRemainRequired(fixtureRoot, ttscBinary, ttscEnv);
console.log(
  `Matched ${actual.length} diagnostics and autofixes against @wordpress/eslint-plugin ${UPSTREAM_VERSION} from a packed, unpatched ttsc ${TTSC_CONSUMER_VERSION} registry install.`,
);

function createUpstreamEslint(fix: boolean): ESLint {
  return new ESLint({
    fix,
    overrideConfigFile: true,
    overrideConfig: {
      files: ['**/*.tsx'],
      languageOptions: {
        ecmaVersion: 'latest',
        parserOptions: {
          ecmaFeatures: {
            jsx: true,
          },
        },
        sourceType: 'module',
      },
      plugins: {
        '@wordpress': { rules: upstreamRules },
      },
      rules: {
        '@wordpress/components-no-missing-40px-size-prop': [
          'error',
          { checkLocalImports: true },
        ],
        '@wordpress/components-no-unsafe-button-disabled': [
          'error',
          { checkLocalImports: true },
        ],
        '@wordpress/data-no-store-string-literals': 'error',
        '@wordpress/dependency-group': 'error',
        '@wordpress/i18n-ellipsis': 'error',
        '@wordpress/i18n-hyphenated-range': 'error',
        '@wordpress/i18n-no-collapsible-whitespace': 'error',
        '@wordpress/i18n-no-flanking-whitespace': 'error',
        '@wordpress/i18n-no-placeholders-only': 'error',
        '@wordpress/i18n-no-variables': 'error',
        '@wordpress/i18n-text-domain': [
          'error',
          { allowedTextDomain: 'my-plugin' },
        ],
        '@wordpress/i18n-translator-comments': 'error',
        '@wordpress/no-base-control-with-label-without-id': 'error',
        '@wordpress/no-dom-globals-in-constructor': 'error',
        '@wordpress/no-dom-globals-in-module-scope': 'error',
        '@wordpress/no-dom-globals-in-react-cc-render': 'error',
        '@wordpress/no-dom-globals-in-react-fc': 'error',
        '@wordpress/no-ds-tokens': 'error',
        '@wordpress/no-global-active-element': 'error',
        '@wordpress/no-global-get-selection': 'error',
        '@wordpress/no-i18n-in-save': 'error',
        '@wordpress/no-non-module-stylesheet-imports': 'error',
        '@wordpress/no-setting-ds-tokens': 'error',
        '@wordpress/no-unknown-ds-tokens': 'error',
        '@wordpress/no-unmerged-classname': 'error',
        '@wordpress/no-unguarded-get-range-at': 'error',
        '@wordpress/no-unsafe-render-order': [
          'error',
          { checkLocalImports: true },
        ],
        '@wordpress/no-unsafe-wp-apis': [
          'error',
          { '@wordpress/components': ['__unstableAllowed'] },
        ],
        '@wordpress/no-unused-vars-before-return': [
          'error',
          { excludePattern: '^ignore' },
        ],
        '@wordpress/no-wp-process-env': 'error',
        '@wordpress/react-no-unsafe-timeout': 'error',
        '@wordpress/use-import-as': [
          'error',
          { '@wordpress/components': { Button: 'RenamedButton' } },
        ],
        '@wordpress/use-recommended-components': 'error',
        '@wordpress/valid-sprintf': 'error',
        '@wordpress/wp-global-usage': 'error',
      },
    },
  });
}

function prepareConsumerProject(): {
  consumerRoot: string;
  fixtureRoot: string;
} {
  const packRoot = path.join(
    repoRoot,
    'node_modules/.cache/ttsc-lint-plugin-wp-pack',
  );
  const consumerRoot = path.join(
    repoRoot,
    'node_modules/.cache/ttsc-lint-plugin-wp-consumer',
  );
  fs.mkdirSync(packRoot, { recursive: true });
  const packOutput = execFileSync(
    'npm',
    ['pack', '--json', '--pack-destination', packRoot],
    { cwd: packageRoot, encoding: 'utf8', timeout: NETWORK_TIMEOUT_MS },
  );
  const [packMetadata] = JSON.parse(packOutput) as Array<{
    filename?: string;
    integrity?: string;
  }>;
  assert.ok(packMetadata?.filename);
  assert.ok(packMetadata.integrity);
  const tarballPath = path.join(packRoot, packMetadata.filename);
  const installKey = [
    packMetadata.integrity,
    `@ttsc/lint@${TTSC_CONSUMER_VERSION}`,
    `ttsc@${TTSC_CONSUMER_VERSION}`,
    `typescript@${TYPESCRIPT_CONSUMER_VERSION}`,
  ].join('\n');
  const markerPath = path.join(consumerRoot, '.install-key');
  const installedKey = fs.existsSync(markerPath)
    ? fs.readFileSync(markerPath, 'utf8')
    : '';
  if (installedKey !== installKey) {
    fs.rmSync(consumerRoot, { force: true, recursive: true });
    fs.mkdirSync(consumerRoot, { recursive: true });
    fs.writeFileSync(
      path.join(consumerRoot, 'package.json'),
      `${JSON.stringify(
        {
          dependencies: {
            '@ttsc/lint': TTSC_CONSUMER_VERSION,
            '@wp-typia/ttsc-lint-plugin-wp': `file:${tarballPath}`,
            ttsc: TTSC_CONSUMER_VERSION,
            typescript: TYPESCRIPT_CONSUMER_VERSION,
          },
          private: true,
          type: 'module',
        },
        null,
        2,
      )}\n`,
    );
    execFileSync(
      'npm',
      ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
      {
        cwd: consumerRoot,
        stdio: 'pipe',
        timeout: PACKAGE_INSTALL_TIMEOUT_MS,
      },
    );
    fs.writeFileSync(markerPath, installKey);
  }

  const consumerLintRoot = path.dirname(
    require.resolve('@ttsc/lint/package.json', { paths: [consumerRoot] }),
  );
  assert.notEqual(
    fs.realpathSync(consumerLintRoot),
    fs.realpathSync(path.join(repoRoot, 'node_modules/@ttsc/lint')),
    'consumer smoke must not inherit the Bun-patched root @ttsc/lint',
  );

  const fixtureRoot = path.join(consumerRoot, 'fixture');
  fs.mkdirSync(fixtureRoot, { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, 'fixture.tsx'), fixtureSource);
  fs.copyFileSync(
    path.join(sourceFixtureRoot, 'wordpress-components.d.ts'),
    path.join(fixtureRoot, 'wordpress-components.d.ts'),
  );
  fs.copyFileSync(
    path.join(sourceFixtureRoot, 'local-ui.js'),
    path.join(fixtureRoot, 'local-ui.js'),
  );
  fs.copyFileSync(
    path.join(sourceFixtureRoot, 'save-fixture.tsx'),
    path.join(fixtureRoot, 'save.tsx'),
  );
  fs.copyFileSync(
    path.join(sourceFixtureRoot, 'deprecated-fixture.tsx'),
    path.join(fixtureRoot, 'deprecated.tsx'),
  );
  fs.copyFileSync(
    path.join(sourceFixtureRoot, 'button.js'),
    path.join(fixtureRoot, 'button.js'),
  );
  fs.copyFileSync(
    path.join(sourceFixtureRoot, 'icon-button.js'),
    path.join(fixtureRoot, 'icon-button.js'),
  );
  fs.writeFileSync(
    path.join(fixtureRoot, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          noEmit: true,
          noImplicitAny: false,
          allowJs: true,
          jsx: 'preserve',
          plugins: [{ transform: '@ttsc/lint' }],
          skipLibCheck: true,
          target: 'ES2020',
          types: [],
        },
        files: [
          './fixture.tsx',
          './local-ui.js',
          './wordpress-components.d.ts',
          './save.tsx',
          './deprecated.tsx',
          './button.js',
          './icon-button.js',
        ],
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(fixtureRoot, 'lint.config.mjs'),
    `import plugin from '@wp-typia/ttsc-lint-plugin-wp';

export default {
  plugins: { wordpress: plugin },
  rules: {
    'wordpress/components-no-missing-40px-size-prop': [
      'error',
      { checkLocalImports: true },
    ],
    'wordpress/components-no-unsafe-button-disabled': [
      'error',
      { checkLocalImports: true },
    ],
    'wordpress/data-no-store-string-literals': 'error',
    'wordpress/dependency-group': 'error',
    'wordpress/i18n-ellipsis': 'error',
    'wordpress/i18n-hyphenated-range': 'error',
    'wordpress/i18n-no-collapsible-whitespace': 'error',
    'wordpress/i18n-no-flanking-whitespace': 'error',
    'wordpress/i18n-no-placeholders-only': 'error',
    'wordpress/i18n-no-variables': 'error',
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'my-plugin' },
    ],
    'wordpress/i18n-translator-comments': 'error',
    'wordpress/no-base-control-with-label-without-id': 'error',
    'wordpress/no-dom-globals-in-constructor': 'error',
    'wordpress/no-dom-globals-in-module-scope': 'error',
    'wordpress/no-dom-globals-in-react-cc-render': 'error',
    'wordpress/no-dom-globals-in-react-fc': 'error',
    'wordpress/no-ds-tokens': 'error',
    'wordpress/no-global-active-element': 'error',
    'wordpress/no-global-get-selection': 'error',
    'wordpress/no-i18n-in-save': 'error',
    'wordpress/no-non-module-stylesheet-imports': 'error',
    'wordpress/no-setting-ds-tokens': 'error',
    'wordpress/no-unknown-ds-tokens': 'error',
    'wordpress/no-unmerged-classname': 'error',
    'wordpress/no-unguarded-get-range-at': 'error',
    'wordpress/no-unsafe-render-order': [
      'error',
      { checkLocalImports: true },
    ],
    'wordpress/no-unsafe-wp-apis': [
      'error',
      { '@wordpress/components': ['__unstableAllowed'] },
    ],
    'wordpress/no-unused-vars-before-return': [
      'error',
      { excludePattern: '^ignore' },
    ],
    'wordpress/no-wp-process-env': 'error',
    'wordpress/react-no-unsafe-timeout': 'error',
    'wordpress/use-import-as': [
      'error',
      { '@wordpress/components': { Button: 'RenamedButton' } },
    ],
    'wordpress/use-recommended-components': 'error',
    'wordpress/valid-sprintf': 'error',
    'wordpress/wp-global-usage': 'error',
  },
};
`,
  );
  return { consumerRoot, fixtureRoot };
}

function verifySafeI18nFixes(
  fixtureRoot: string,
  ttscBinary: string,
  env: NodeJS.ProcessEnv,
): void {
  const source = `const value = 'two';
const __ = (text = '') => text;
__(\`Choose 2-4 items\`);
__(\`Choose \${value} from 2-4 items\`);
__('State-of-the-art pages 1-5 and 10-15');
__('1' + '-2');
__(' hello ' + 'world ');
__(" It's okay ");
`;
  const expected = `const value = 'two';
const __ = (text = '') => text;
__(\`Choose 2–4 items\`);
__(\`Choose \${value} from 2–4 items\`);
__('State-of-the-art pages 1–5 and 10–15');
__('1' + '-2');
__('hello ' + 'world');
__('It\\'s okay');
`;
  const fixturePath = path.join(fixtureRoot, 'fixture.tsx');
  const configPath = path.join(fixtureRoot, 'lint.config.mjs');
  const savedConfig = fs.readFileSync(configPath, 'utf8');
  try {
    fs.writeFileSync(fixturePath, source);
    fs.writeFileSync(
      configPath,
      `import plugin from '@wp-typia/ttsc-lint-plugin-wp';

export default {
  plugins: { wordpress: plugin },
  rules: {
    'wordpress/i18n-hyphenated-range': 'error',
    'wordpress/i18n-no-flanking-whitespace': 'error',
  },
};
`,
    );
    const result = spawnSync(
      ttscBinary,
      ['fix', '--pretty', 'false', '--project', 'tsconfig.json'],
      {
        cwd: fixtureRoot,
        encoding: 'utf8',
        env,
        timeout: TTSC_PROCESS_TIMEOUT_MS,
      },
    );
    assert.ifError(result.error);
    assert.notEqual(result.status, 0, 'cross-boundary ranges are not fixable');
    assert.match(
      `${result.stdout}${result.stderr}`,
      /\[wordpress\/i18n-hyphenated-range\]/u,
    );
    assert.equal(
      fs.readFileSync(fixturePath, 'utf8'),
      expected,
      'safe fixes must preserve template boundaries, non-range hyphens, join spacing, and quotes',
    );
  } finally {
    fs.writeFileSync(fixturePath, fixtureSource);
    fs.writeFileSync(configPath, savedConfig);
  }
}

async function prepareUpstreamPackage(): Promise<string> {
  const cacheParent = path.join(repoRoot, 'node_modules/.cache');
  const cacheRoot = path.join(
    cacheParent,
    `wp-typia-eslint-plugin-${UPSTREAM_VERSION}`,
  );
  fs.mkdirSync(cacheParent, { recursive: true });
  if (fs.existsSync(cacheRoot)) {
    const extractedRoot = validateUpstreamCache(cacheRoot);
    await prepareUpstreamTheme(cacheRoot, extractedRoot);
    await installPinnedGlobals(cacheRoot, extractedRoot, {
      networkTimeoutMs: NETWORK_TIMEOUT_MS,
    });
    return extractedRoot;
  }

  const stagingRoot = fs.mkdtempSync(
    path.join(cacheParent, `.wp-typia-eslint-plugin-${UPSTREAM_VERSION}-`),
  );
  const response = await fetch(UPSTREAM_TARBALL, {
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  });
  assert.equal(response.ok, true, `Unable to download ${UPSTREAM_TARBALL}`);
  const tarball = Buffer.from(await response.arrayBuffer());
  const integrity = `sha512-${crypto.createHash('sha512').update(tarball).digest('base64')}`;
  assert.equal(
    integrity,
    UPSTREAM_INTEGRITY,
    `@wordpress/eslint-plugin ${UPSTREAM_VERSION} tarball integrity mismatch`,
  );
  const tarballPath = path.join(stagingRoot, 'package.tgz');
  fs.writeFileSync(tarballPath, tarball);
  execFileSync('tar', ['-xzf', tarballPath, '-C', stagingRoot], {
    timeout: NETWORK_TIMEOUT_MS,
  });
  validateUpstreamCache(stagingRoot);

  try {
    fs.renameSync(stagingRoot, cacheRoot);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST' && code !== 'ENOTEMPTY') {
      throw error;
    }
  } finally {
    if (fs.existsSync(stagingRoot)) {
      fs.rmSync(stagingRoot, { force: true, recursive: true });
    }
  }
  const extractedRoot = validateUpstreamCache(cacheRoot);
  await prepareUpstreamTheme(cacheRoot, extractedRoot);
  await installPinnedGlobals(cacheRoot, extractedRoot, {
    networkTimeoutMs: NETWORK_TIMEOUT_MS,
  });
  return extractedRoot;
}

async function prepareUpstreamTheme(
  cacheRoot: string,
  upstreamRoot: string,
): Promise<void> {
  await installPinnedTarball({
    label: `@wordpress/theme ${UPSTREAM_THEME_VERSION}`,
    url: UPSTREAM_THEME_TARBALL,
    integrity: UPSTREAM_THEME_INTEGRITY,
    cachePath: path.join(cacheRoot, `theme-${UPSTREAM_THEME_VERSION}.tgz`),
    stagingParent: cacheRoot,
    stagingPrefix: `.wp-typia-theme-${UPSTREAM_THEME_VERSION}-`,
    destination: path.join(upstreamRoot, 'node_modules/@wordpress/theme'),
    verify: verifyUpstreamTheme,
    networkTimeoutMs: NETWORK_TIMEOUT_MS,
  });
}

function verifyUpstreamTheme(themeRoot: string): void {
  const metadata = JSON.parse(
    fs.readFileSync(path.join(themeRoot, 'package.json'), 'utf8'),
  ) as { name?: string; version?: string };
  assert.equal(metadata.name, '@wordpress/theme');
  assert.equal(metadata.version, UPSTREAM_THEME_VERSION);
}

function validateUpstreamCache(cacheRoot: string): string {
  const tarballPath = path.join(cacheRoot, 'package.tgz');
  assert.ok(
    fs.existsSync(tarballPath),
    `Missing cached upstream tarball at ${tarballPath}`,
  );
  const tarball = fs.readFileSync(tarballPath);
  const integrity = `sha512-${crypto.createHash('sha512').update(tarball).digest('base64')}`;
  assert.equal(
    integrity,
    UPSTREAM_INTEGRITY,
    `Cached @wordpress/eslint-plugin ${UPSTREAM_VERSION} tarball integrity mismatch`,
  );
  const extractedRoot = path.join(cacheRoot, 'package');
  const packageJsonPath = path.join(extractedRoot, 'package.json');
  const metadata = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    name?: string;
    version?: string;
  };
  assert.equal(metadata.name, '@wordpress/eslint-plugin');
  assert.equal(metadata.version, UPSTREAM_VERSION);
  return extractedRoot;
}

function verifyEmbeddedDesignTokens(
  upstreamRoot: string,
  require: NodeJS.Require,
): void {
  const modulePath = require.resolve('@wordpress/theme/design-tokens.js', {
    paths: [upstreamRoot],
  });
  const tokenModule = require(modulePath) as
    | { default?: readonly string[] }
    | readonly string[];
  const upstreamTokens =
    (tokenModule as { default?: readonly string[] }).default ??
    (tokenModule as readonly string[]);
  assert.ok(Array.isArray(upstreamTokens));

  const contributorSource = fs.readFileSync(
    path.join(packageRoot, 'rules/ds_token_rules.go'),
    'utf8',
  );
  const match = /const knownWpdsTokenList = `\n([\s\S]*?)\n`/u.exec(
    contributorSource,
  );
  assert.ok(
    match?.[1],
    'Could not extract knownWpdsTokenList from ds_token_rules.go.',
  );
  assert.deepEqual(
    match[1].split('\n'),
    upstreamTokens,
    'embedded Design System tokens must match @wordpress/theme from the pinned ESLint oracle',
  );
}

function verifyInvalidOptionsFailClosed(
  fixtureRoot: string,
  ttscBinary: string,
  env: NodeJS.ProcessEnv,
): void {
  const configPath = path.join(fixtureRoot, 'lint.config.mjs');
  const validConfig = fs.readFileSync(configPath, 'utf8');
  try {
    fs.writeFileSync(
      configPath,
      `import plugin from '@wp-typia/ttsc-lint-plugin-wp';

export default {
  plugins: { wordpress: plugin },
  rules: {
    'wordpress/components-no-missing-40px-size-prop': [
      'error',
      { checkLocalImports: 'yes' },
    ],
    'wordpress/components-no-unsafe-button-disabled': [
      'error',
      { checkLocalImports: 'yes' },
    ],
    'wordpress/dependency-group': ['error', 'sometimes'],
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 42 },
    ],
    'wordpress/no-unsafe-wp-apis': ['error', 'invalid'],
    'wordpress/no-unsafe-render-order': [
      'error',
      { checkLocalImports: 'yes' },
    ],
    'wordpress/no-unused-vars-before-return': [
      'error',
      { excludePattern: '[' },
    ],
    'wordpress/use-import-as': ['error', 42],
  },
};
`,
    );
    const result = spawnSync(
      ttscBinary,
      ['--noEmit', '--pretty', 'false', '--project', 'tsconfig.json'],
      {
        cwd: fixtureRoot,
        encoding: 'utf8',
        env,
        timeout: TTSC_PROCESS_TIMEOUT_MS,
      },
    );
    assert.ifError(result.error);
    assert.notEqual(
      result.status,
      null,
      'invalid-options ttsc process was killed by a signal',
    );
    const output = `${result.stdout}${result.stderr}`;
    assert.notEqual(result.status, 0, 'invalid options must fail closed');
    assert.match(
      output,
      /\[wordpress\/components-no-missing-40px-size-prop\] Invalid wordpress\/components-no-missing-40px-size-prop options/u,
    );
    assert.match(
      output,
      /\[wordpress\/components-no-unsafe-button-disabled\] Invalid wordpress\/components-no-unsafe-button-disabled options/u,
    );
    assert.match(
      output,
      /\[wordpress\/dependency-group\] Invalid wordpress\/dependency-group options/u,
    );
    assert.match(
      output,
      /\[wordpress\/i18n-text-domain\] Invalid wordpress\/i18n-text-domain options/u,
    );
    assert.match(
      output,
      /\[wordpress\/use-import-as\] Invalid wordpress\/use-import-as options/u,
    );
    assert.match(
      output,
      /\[wordpress\/no-unsafe-wp-apis\] Usage of `__experimentalBlocked`/u,
    );
    assert.match(
      output,
      /\[wordpress\/no-unsafe-render-order\] Invalid wordpress\/no-unsafe-render-order options/u,
    );
    assert.match(
      output,
      /\[wordpress\/no-unused-vars-before-return\] Invalid wordpress\/no-unused-vars-before-return options/u,
    );
  } finally {
    fs.writeFileSync(configPath, validConfig);
  }
}

function verifyBehaviorDowngradesRemainRequired(
  fixtureRoot: string,
  ttscBinary: string,
  env: NodeJS.ProcessEnv,
): void {
  const fixturePath = path.join(fixtureRoot, 'fixture.tsx');
  const configPath = path.join(fixtureRoot, 'lint.config.mjs');
  const validFixture = fs.readFileSync(fixturePath, 'utf8');
  const validConfig = fs.readFileSync(configPath, 'utf8');
  try {
    fs.writeFileSync(
      fixturePath,
      `import { Link } from '@wordpress/ui';

const error = 'outer';
try {
  throw new Error('inner');
} catch (error) {
  console.log(error);
}
console.log(error);

export const View = () => (
  <>
    <Link onClick={() => undefined}>Open</Link>
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} />
  </>
);
`,
    );
    fs.writeFileSync(
      configPath,
      `export default {
  rules: {
    'jsx-a11y/click-events-have-key-events': 'error',
    'jsx-a11y/no-static-element-interactions': 'error',
    'jsx-a11y/role-supports-aria-props': 'error',
    'no-shadow': 'error',
  },
};
`,
    );
    const result = spawnSync(
      ttscBinary,
      ['--noEmit', '--pretty', 'false', '--project', 'tsconfig.json'],
      {
        cwd: fixtureRoot,
        encoding: 'utf8',
        env,
        timeout: TTSC_PROCESS_TIMEOUT_MS,
      },
    );
    assert.ifError(result.error);
    assert.notEqual(
      result.status,
      null,
      'behavior-downgrade ttsc process was killed by a signal',
    );
    const output = `${result.stdout}${result.stderr}`;
    assert.notEqual(
      result.status,
      0,
      'documented behavior downgrades must remain observable until removed',
    );
    for (const expectedFailure of [
      'Rule "no-shadow" panicked',
      '[jsx-a11y/click-events-have-key-events]',
      '[jsx-a11y/no-static-element-interactions]',
      '[jsx-a11y/role-supports-aria-props]',
    ]) {
      assert.match(
        output,
        new RegExp(escapeRegExp(expectedFailure), 'u'),
        `Remove or update the corresponding behavior downgrade when ${expectedFailure} no longer reproduces.\n${output}`,
      );
    }
  } finally {
    fs.writeFileSync(fixturePath, validFixture);
    fs.writeFileSync(configPath, validConfig);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function parseTtscDiagnostics(output: string) {
  const diagnostics: Array<{
    column: number;
    file: string;
    line: number;
    message: string;
    ruleId: string | null;
  }> = [];
  const lines = output.replace(/\u001b\[[0-9;]*m/g, '').split(/\r?\n/);
  const pattern =
    /^([\w.@/-]+\.tsx):(\d+):(\d+) - error TS\d+: \[wordpress\/([^\]]+)\] (.*)$/u;
  for (let index = 0; index < lines.length; index += 1) {
    const match = pattern.exec(lines[index] ?? '');
    if (!match) {
      continue;
    }
    const messageLines = [match[5] ?? ''];
    let next = index + 1;
    for (; next < lines.length; next += 1) {
      const line = lines[next] ?? '';
      if (line === '' || pattern.test(line)) {
        break;
      }
      messageLines.push(line);
    }
    index = next - 1;
    diagnostics.push({
      column: Number(match[3]),
      file: path.basename(match[1] ?? ''),
      line: Number(match[2]),
      message: messageLines.join('\n').trim(),
      ruleId: `@wordpress/${match[4]}`,
    });
  }
  return diagnostics;
}

function compareDiagnostic(
  left: {
    column: number;
    file?: string;
    line: number;
    message: string;
    ruleId: string | null;
  },
  right: {
    column: number;
    file?: string;
    line: number;
    message: string;
    ruleId: string | null;
  },
) {
  return (
    (left.file ?? '').localeCompare(right.file ?? '') ||
    left.line - right.line ||
    left.column - right.column ||
    (left.ruleId ?? '').localeCompare(right.ruleId ?? '') ||
    left.message.localeCompare(right.message)
  );
}
