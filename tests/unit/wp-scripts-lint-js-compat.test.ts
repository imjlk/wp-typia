import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  DEFAULT_LINT_EXTENSIONS,
  LINT_CONFIG_FILES,
  TYPESCRIPT6_REGISTER_FILE,
  hasExplicitLintTargets,
} from '../../scripts/run-wp-scripts-lint-js-compat.mjs';

describe('run-wp-scripts-lint-js-compat', () => {
  test('tracks supported project config filenames for the wp-scripts compat lane', () => {
    expect(LINT_CONFIG_FILES).toContain('.eslintrc.cjs');
    expect(DEFAULT_LINT_EXTENSIONS).toBe('js,jsx,cjs,mjs');
    expect(TYPESCRIPT6_REGISTER_FILE).toBe('register-typescript6.cjs');
  });

  test('preloads the TypeScript 6 compatibility island', () => {
    const repoRoot = path.resolve(import.meta.dir, '../..');
    const result = spawnSync(
      'node',
      [
        '--require',
        path.join(repoRoot, 'scripts', TYPESCRIPT6_REGISTER_FILE),
        '-e',
        "process.stdout.write(String(require.resolve('typescript') === require.resolve('@typescript/typescript6')))",
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('true');
  });

  test('treats bare positional args as explicit lint targets', () => {
    expect(hasExplicitLintTargets(['src/index.ts'])).toBe(true);
    expect(hasExplicitLintTargets(['--max-warnings', '0', 'src/index.ts'])).toBe(
      true,
    );
    expect(hasExplicitLintTargets(['--', 'src/index.ts'])).toBe(true);
  });

  test('ignores option values when deciding whether to append the default target', () => {
    expect(hasExplicitLintTargets([])).toBe(false);
    expect(hasExplicitLintTargets(['--max-warnings', '0'])).toBe(false);
    expect(hasExplicitLintTargets(['--cache-location', '.cache/eslint'])).toBe(
      false,
    );
    expect(
      hasExplicitLintTargets(['--cache-location=.cache/eslint']),
    ).toBe(false);
  });
});
