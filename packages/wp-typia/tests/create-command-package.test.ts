import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runUtf8Command } from '../../../tests/helpers/process-utils';
import { createBlockExternalFixturePath } from '../../wp-typia-project-tools/tests/helpers/scaffold-test-harness.js';
import {
  entryPath,
  parseJsonObjectFromOutput,
  runCapturedCommand,
  runtimeEntrypoint,
  withoutAIAgentEnv,
  withoutLocalBunEnv,
} from './cli-package-test-helpers';

test('emits structured create completion output in portable CLI JSON mode', () => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-create-json-'),
  );

  try {
    const result = runCapturedCommand(
      process.execPath,
      [
        entryPath,
        'create',
        'demo-json',
        '--template',
        'basic',
        '--package-manager',
        'npm',
        '--yes',
        '--dry-run',
        '--no-install',
        '--format',
        'json',
      ],
      {
        cwd: tempRoot,
        env: withoutLocalBunEnv(),
      },
    );
    const parsed = parseJsonObjectFromOutput<{
      data?: {
        command?: string;
        completion?: {
          title?: string;
        };
        dryRun?: boolean;
        files?: string[];
        projectDir?: string;
        template?: string;
      };
      ok?: boolean;
    }>(result.stdout);
    const serialized = JSON.stringify(parsed);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(parsed.ok).toBe(true);
    expect(parsed.data?.command).toBe('create');
    expect(parsed.data?.dryRun).toBe(true);
    expect(parsed.data?.projectDir).toBe(
      path.join(fs.realpathSync(tempRoot), 'demo-json'),
    );
    expect(parsed.data?.template).toBe('basic');
    expect(parsed.data?.completion?.title).toContain('Dry run for Demo Json');
    expect(parsed.data).not.toHaveProperty('title');
    expect(parsed.data?.files).toContain('package.json');
    expect(parsed.data?.files).toContain('src/index.tsx');
    expect(serialized).not.toMatch(/[✅🧪⏳⚠]/u);
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
});

test('writes WordPress target plugin headers through the portable CLI bin', () => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-create-wp-target-'),
  );

  try {
    const wp70Result = runCapturedCommand(
      process.execPath,
      [
        entryPath,
        'create',
        'demo-wp70',
        '--template',
        'basic',
        '--package-manager',
        'npm',
        '--yes',
        '--no-install',
      ],
      {
        cwd: tempRoot,
        env: withoutLocalBunEnv(),
      },
    );
    const wp69Result = runCapturedCommand(
      process.execPath,
      [
        entryPath,
        'create',
        'demo-wp69',
        '--template',
        'basic',
        '--package-manager',
        'npm',
        '--yes',
        '--no-install',
        '--wp-version',
        '6.9',
      ],
      {
        cwd: tempRoot,
        env: withoutLocalBunEnv(),
      },
    );
    const wp70Bootstrap = fs.readFileSync(
      path.join(tempRoot, 'demo-wp70', 'demo-wp70.php'),
      'utf8',
    );
    const wp69Bootstrap = fs.readFileSync(
      path.join(tempRoot, 'demo-wp69', 'demo-wp69.php'),
      'utf8',
    );

    expect(wp70Result.status).toBe(0);
    expect(wp70Result.stderr).toBe('');
    expect(wp70Bootstrap).toContain('Requires at least: 6.7');
    expect(wp70Bootstrap).toMatch(/Tested up to:\s+7\.0/);
    expect(wp69Result.status).toBe(0);
    expect(wp69Result.stderr).toBe('');
    expect(wp69Bootstrap).toContain('Requires at least: 6.7');
    expect(wp69Bootstrap).toMatch(/Tested up to:\s+6\.9/);
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
}, 20_000);

test('honors NO_COLOR for ASCII-safe status markers through the portable CLI bin', () => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-no-color-markers-'),
  );

  try {
    const asciiOutput = runUtf8Command(
      process.execPath,
      [
        entryPath,
        'create',
        'demo-no-color',
        '--template',
        'basic',
        '--package-manager',
        'npm',
        '--yes',
        '--dry-run',
        '--no-install',
      ],
      {
        cwd: tempRoot,
        env: {
          ...withoutLocalBunEnv(),
          LANG: 'en_US.UTF-8',
          LC_ALL: 'en_US.UTF-8',
          NO_COLOR: '1',
        },
      },
    );
    const unicodeOutput = runUtf8Command(
      process.execPath,
      [
        entryPath,
        'create',
        'demo-unicode',
        '--template',
        'basic',
        '--package-manager',
        'npm',
        '--yes',
        '--dry-run',
        '--no-install',
      ],
      {
        cwd: tempRoot,
        env: {
          ...withoutLocalBunEnv(),
          LANG: 'en_US.UTF-8',
          LC_ALL: 'en_US.UTF-8',
          NO_COLOR: '1',
          WP_TYPIA_ASCII: '0',
        },
      },
    );

    expect(asciiOutput).toContain('[...]');
    expect(asciiOutput).toContain('[dry-run]');
    expect(asciiOutput).not.toContain('⏳');
    expect(asciiOutput).not.toContain('🧪');
    expect(unicodeOutput).toContain('⏳');
    expect(unicodeOutput).toContain('🧪');
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
});

test('requires a project directory for the explicit create command', () => {
  expect(() => runUtf8Command('node', [entryPath, 'create'])).toThrow(
    '`wp-typia create` requires <project-dir>.',
  );
  expect(() =>
    runUtf8Command('node', [entryPath, 'create', '--dry-run']),
  ).toThrow(/`--dry-run` still needs a logical project directory name/);
});

test('surfaces external template timeout codes in structured create failures', () => {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-create-timeout-template-'),
  );
  const targetDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-create-timeout-output-'),
  );
  fs.rmSync(targetDir, { force: true, recursive: true });
  fs.cpSync(createBlockExternalFixturePath, fixtureRoot, { recursive: true });
  fs.rmSync(path.join(fixtureRoot, 'index.cjs'));
  fs.writeFileSync(
    path.join(fixtureRoot, 'index.mjs'),
    [
      'await new Promise((resolve) => setTimeout(resolve, 200));',
      'export default {',
      '  blockTemplatesPath: "block-templates",',
      '  assetsPath: "assets",',
      '};',
      '',
    ].join('\n'),
    'utf8',
  );

  const previousTimeout = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_TIMEOUT_MS;
  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_TIMEOUT_MS = '25';

  try {
    const result = runCapturedCommand(
      process.execPath,
      [
        entryPath,
        'create',
        targetDir,
        '--template',
        fixtureRoot,
        '--package-manager',
        'npm',
        '--yes',
        '--no-install',
        '--format',
        'json',
      ],
      {
        env: {
          ...withoutLocalBunEnv(),
          WP_TYPIA_EXTERNAL_TEMPLATE_TIMEOUT_MS: '25',
        },
      },
    );
    const parsed = parseJsonObjectFromOutput<{
      error?: { code?: string; message?: string };
      ok?: boolean;
    }>(result.stderr);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.code).toBe('template-source-timeout');
    expect(parsed.error?.message).toContain(
      'Timed out while loading external template config',
    );
  } finally {
    if (previousTimeout === undefined) {
      delete process.env.WP_TYPIA_EXTERNAL_TEMPLATE_TIMEOUT_MS;
    } else {
      process.env.WP_TYPIA_EXTERNAL_TEMPLATE_TIMEOUT_MS = previousTimeout;
    }
    fs.rmSync(fixtureRoot, { force: true, recursive: true });
    fs.rmSync(targetDir, { force: true, recursive: true });
  }
});

test('rejects typo-like positional alias invocations with extra arguments', () => {
  const result = runCapturedCommand('node', [entryPath, 'temlates', 'list'], {
    env: withoutAIAgentEnv(),
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    'The positional alias only accepts a single project directory.',
  );
  expect(result.stderr).toContain('`wp-typia create <project-dir>`');
  expect(result.stderr).toContain('check the command spelling');
  expect(result.stderr).toContain('`list`');
});

test('rejects single positional command typos with create alias guidance', () => {
  const result = runCapturedCommand('node', [entryPath, 'docotr'], {
    env: withoutAIAgentEnv(),
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Unknown top-level command "docotr".');
  expect(result.stderr).toContain('Did you mean "doctor"?');
  expect(result.stderr).toContain('wp-typia create docotr');
});

test('formats create failures with a shared non-interactive diagnostic block', () => {
  const result = runCapturedCommand('node', [entryPath, 'create'], {
    env: withoutAIAgentEnv(),
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Error: wp-typia create failed');
  expect(result.stderr).toContain(
    'Summary: Unable to complete the requested create workflow.',
  );
  expect(result.stderr).toContain('- `wp-typia create` requires <project-dir>.');
  expect(result.stderr).toContain(
    '`--dry-run` still needs a logical project directory name',
  );
});

test('emits a machine-readable missing-argument error code for create in portable CLI JSON mode', () => {
  const result = runCapturedCommand(
    process.execPath,
    [entryPath, 'create', '--format', 'json'],
    {
      env: withoutLocalBunEnv(),
    },
  );
  const parsed = parseJsonObjectFromOutput<{
    error?: { code?: string; command?: string; kind?: string };
    ok?: boolean;
  }>(result.stderr);

  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(parsed.ok).toBe(false);
  expect(parsed.error?.kind).toBe('command-execution');
  expect(parsed.error?.command).toBe('create');
  expect(parsed.error?.code).toBe('missing-argument');
});

test('emits a machine-readable invalid-argument error code for create variant failures', () => {
  const targetDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-create-invalid-variant-'),
  );
  fs.rmSync(targetDir, { force: true, recursive: true });

  try {
    const result = runCapturedCommand(
      process.execPath,
      [
        entryPath,
        'create',
        targetDir,
        '--template',
        'basic',
        '--variant',
        'hero',
        '--yes',
        '--no-install',
        '--format',
        'json',
      ],
      {
        env: withoutLocalBunEnv(),
      },
    );
    const parsed = parseJsonObjectFromOutput<{
      error?: { code?: string; command?: string; message?: string };
      ok?: boolean;
    }>(result.stderr);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.command).toBe('create');
    expect(parsed.error?.code).toBe('invalid-argument');
    expect(parsed.error?.message).toContain(
      '--variant is only supported for official external template configs',
    );
  } finally {
    fs.rmSync(targetDir, { force: true, recursive: true });
  }
});

test('emits a machine-readable invalid-argument error code for unsupported WordPress targets', () => {
  const targetDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-create-invalid-wp-target-'),
  );
  fs.rmSync(targetDir, { force: true, recursive: true });

  try {
    const result = runCapturedCommand(
      process.execPath,
      [
        entryPath,
        'create',
        targetDir,
        '--template',
        'basic',
        '--wp-version',
        '7.1',
        '--yes',
        '--no-install',
        '--format',
        'json',
      ],
      {
        env: withoutLocalBunEnv(),
      },
    );
    const parsed = parseJsonObjectFromOutput<{
      error?: { code?: string; command?: string; message?: string };
      ok?: boolean;
    }>(result.stderr);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.command).toBe('create');
    expect(parsed.error?.code).toBe('invalid-argument');
    expect(parsed.error?.message).toContain(
      'Unsupported --wp-version "7.1". Expected one of: 6.9, 7.0.',
    );
  } finally {
    fs.rmSync(targetDir, { force: true, recursive: true });
  }
});

test('emits a machine-readable unknown-template error code for removed built-in template ids', () => {
  const targetDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-create-removed-template-'),
  );
  fs.rmSync(targetDir, { force: true, recursive: true });

  try {
    const result = runCapturedCommand(
      process.execPath,
      [
        entryPath,
        'create',
        targetDir,
        '--template',
        'data',
        '--yes',
        '--no-install',
        '--format',
        'json',
      ],
      {
        env: withoutLocalBunEnv(),
      },
    );
    const parsed = parseJsonObjectFromOutput<{
      error?: { code?: string; command?: string; message?: string };
      ok?: boolean;
    }>(result.stderr);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.command).toBe('create');
    expect(parsed.error?.code).toBe('unknown-template');
    expect(parsed.error?.message).toContain(
      'Built-in template "data" was removed.',
    );
  } finally {
    fs.rmSync(targetDir, { force: true, recursive: true });
  }
});

test('emits a machine-readable missing-argument error code for create in Gunshi runtime JSON mode', () => {
  const result = runCapturedCommand(
    process.execPath,
    [runtimeEntrypoint, 'create', '--format', 'json'],
    {
      env: withoutAIAgentEnv(),
    },
  );
  const parsed = JSON.parse(result.stderr.trim()) as {
    error?: { code?: string; command?: string; kind?: string };
    ok?: boolean;
  };

  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(parsed.ok).toBe(false);
  expect(parsed.error?.kind).toBe('command-execution');
  expect(parsed.error?.command).toBe('create');
  expect(parsed.error?.code).toBe('missing-argument');
});

test('loads baseline create defaults from package.json#wp-typia in the portable CLI', () => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-node-config-defaults-'),
  );
  const targetDir = path.join(tempRoot, 'demo-config-defaults');

  try {
    fs.writeFileSync(
      path.join(tempRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: 'node-config-defaults',
          private: true,
          'wp-typia': {
            create: {
              'package-manager': 'npm',
              template: 'basic',
              yes: true,
              'no-install': true,
            },
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const result = runCapturedCommand(
      process.execPath,
      [entryPath, 'create', targetDir],
      {
        cwd: tempRoot,
        env: withoutLocalBunEnv(),
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(fs.existsSync(path.join(targetDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'src', 'block.json'))).toBe(true);
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
});
