import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';

import { ESLint } from 'eslint';

const UPSTREAM_VERSION = '25.8.0';
const UPSTREAM_INTEGRITY =
  'sha512-QqYfiAVUYFLUhiLlVwB1MoGHcyNElwAPFeXnfZhYUPvFYOmQucsn4dxEGpl67PfcM2XWimni5z+mUquv4y1Mow==';
const UPSTREAM_TARBALL = `https://registry.npmjs.org/@wordpress/eslint-plugin/-/eslint-plugin-${UPSTREAM_VERSION}.tgz`;
const TTSC_CONSUMER_VERSION = process.env.TTSC_CONSUMER_VERSION ?? '0.23.0';
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
  path.join(sourceFixtureRoot, 'fixture.ts'),
  'utf8',
);

const upstreamRoot = await prepareUpstreamPackage();
const require = createRequire(import.meta.url);
const upstreamRules = {
  'i18n-text-domain': require(
    path.join(upstreamRoot, 'rules/i18n-text-domain.js'),
  ),
  'no-unsafe-wp-apis': require(
    path.join(upstreamRoot, 'rules/no-unsafe-wp-apis.js'),
  ),
  'valid-sprintf': require(path.join(upstreamRoot, 'rules/valid-sprintf.js')),
};

const eslint = createUpstreamEslint(false);
const [eslintResult] = await eslint.lintText(fixtureSource, {
  filePath: 'fixture.ts',
});
assert.ok(eslintResult);
const expected = eslintResult.messages
  .filter(({ ruleId }) => ruleId?.startsWith('@wordpress/'))
  .map(({ line, message, ruleId }) => ({ line, message, ruleId }))
  .sort(compareDiagnostic);

const fixtureRoot = prepareConsumerProject();
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
  path.join(fixtureRoot, '../node_modules/.bin/ttsc'),
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
  { filePath: 'fixture.ts' },
);
assert.ok(eslintFixResult);
const expectedFixedSource = eslintFixResult.output ?? fixtureSource;
const ttscFixResult = spawnSync(
  path.join(fixtureRoot, '../node_modules/.bin/ttsc'),
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
  fs.readFileSync(path.join(fixtureRoot, 'fixture.ts'), 'utf8'),
  expectedFixedSource,
  `${ttscFixResult.stdout}${ttscFixResult.stderr}`,
);
console.log(
  `Matched ${actual.length} diagnostics and autofixes against @wordpress/eslint-plugin ${UPSTREAM_VERSION} from a packed, unpatched ttsc ${TTSC_CONSUMER_VERSION} registry install.`,
);

function createUpstreamEslint(fix: boolean): ESLint {
  return new ESLint({
    fix,
    overrideConfigFile: true,
    overrideConfig: {
      files: ['**/*.ts'],
      languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      plugins: {
        '@wordpress': { rules: upstreamRules },
      },
      rules: {
        '@wordpress/i18n-text-domain': [
          'error',
          { allowedTextDomain: 'my-plugin' },
        ],
        '@wordpress/no-unsafe-wp-apis': [
          'error',
          { '@wordpress/components': ['__unstableAllowed'] },
        ],
        '@wordpress/valid-sprintf': 'error',
      },
    },
  });
}

function prepareConsumerProject(): string {
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
  fs.writeFileSync(path.join(fixtureRoot, 'fixture.ts'), fixtureSource);
  fs.copyFileSync(
    path.join(sourceFixtureRoot, 'wordpress-components.d.ts'),
    path.join(fixtureRoot, 'wordpress-components.d.ts'),
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
          plugins: [{ transform: '@ttsc/lint' }],
          skipLibCheck: true,
          target: 'ES2020',
          types: [],
        },
        files: ['./fixture.ts', './wordpress-components.d.ts'],
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
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'my-plugin' },
    ],
    'wordpress/no-unsafe-wp-apis': [
      'error',
      { '@wordpress/components': ['__unstableAllowed'] },
    ],
    'wordpress/valid-sprintf': 'error',
  },
};
`,
  );
  return fixtureRoot;
}

async function prepareUpstreamPackage(): Promise<string> {
  const cacheRoot = path.join(
    os.tmpdir(),
    `wp-typia-eslint-plugin-${UPSTREAM_VERSION}`,
  );
  const extractedRoot = path.join(cacheRoot, 'package');
  const packageJsonPath = path.join(extractedRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const metadata = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      version?: string;
    };
    if (metadata.version === UPSTREAM_VERSION) {
      return extractedRoot;
    }
  }

  fs.mkdirSync(cacheRoot, { recursive: true });
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
  const tarballPath = path.join(cacheRoot, 'package.tgz');
  fs.writeFileSync(tarballPath, tarball);
  execFileSync('tar', ['-xzf', tarballPath, '-C', cacheRoot], {
    timeout: NETWORK_TIMEOUT_MS,
  });
  return extractedRoot;
}

function parseTtscDiagnostics(output: string) {
  const diagnostics: Array<{
    line: number;
    message: string;
    ruleId: string | null;
  }> = [];
  const lines = output.replace(/\u001b\[[0-9;]*m/g, '').split(/\r?\n/);
  const pattern =
    /^fixture\.ts:(\d+):(\d+) - error TS\d+: \[wordpress\/([^\]]+)\] (.*)$/u;
  for (let index = 0; index < lines.length; index += 1) {
    const match = pattern.exec(lines[index] ?? '');
    if (!match) {
      continue;
    }
    const messageLines = [match[4] ?? ''];
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next] ?? '';
      if (line === '') {
        break;
      }
      messageLines.push(line);
    }
    diagnostics.push({
      line: Number(match[1]),
      message: messageLines.join('\n').trim(),
      ruleId: `@wordpress/${match[3]}`,
    });
  }
  return diagnostics;
}

function compareDiagnostic(
  left: { line: number; message: string; ruleId: string | null },
  right: { line: number; message: string; ruleId: string | null },
) {
  return (
    left.line - right.line ||
    (left.ruleId ?? '').localeCompare(right.ruleId ?? '') ||
    left.message.localeCompare(right.message)
  );
}
