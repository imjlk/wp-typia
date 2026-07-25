import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, '..');

function resolvePrettierBin() {
  const tryResolve = (candidate) => {
    try {
      return require.resolve(candidate);
    } catch {
      return null;
    }
  };

  for (const candidate of [
    'prettier/bin/prettier.cjs',
    'prettier/bin-prettier.js',
  ]) {
    const resolved = tryResolve(candidate);
    if (resolved) {
      return resolved;
    }
  }

  throw new Error(
    'Unable to resolve the Prettier CLI entrypoint for the configured formatter baseline.',
  );
}

const prettierBin = resolvePrettierBin();
const prettierMode = process.argv.includes('--write') ? '--write' : '--check';

const patterns = [
  'README.md',
  'CONTRIBUTING.md',
  'UPGRADE.md',
  'SECURITY.md',
  'apps/docs/src/content/docs/**/*.md',
  'apps/docs/package.json',
  'apps/docs/tsconfig.json',
  'apps/docs/astro.config.mjs',
  'examples/EXAMPLES.md',
  'packages/*/README.md',
  'package.json',
  'composer.json',
  'prettier.config.mjs',
  'eslint.config.mjs',
  'typedoc.public.json',
  'tsdoc.json',
  'tsconfig.json',
  'tsconfig.base.json',
  '.vscode/*.json',
  '.github/**/*.md',
  '.github/**/*.yml',
  '.sampo/changesets/*.md',
  'scripts/audit-public-docs.mjs',
  'scripts/check-repo-format.mjs',
  'scripts/validate-formatting-toolchain-policy.mjs',
];
execFileSync(
  process.execPath,
  [prettierBin, prettierMode, '--no-error-on-unmatched-pattern', ...patterns],
  {
    cwd: repoRoot,
    stdio: 'inherit',
  },
);
