import { afterAll, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { executeSyncCommand } from '../src/runtime-bridge-sync';

const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'wp-typia-sync-bridge-'),
);

function writeSyncFixture(options: {
  files?: string[];
  name: string;
  packageManager?: string | null;
  scripts: Record<string, string>;
  withInstallMarker?: boolean;
}) {
  const projectDir = path.join(tempRoot, options.name);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    JSON.stringify(
      {
        name: options.name,
        ...(options.packageManager === null
          ? {}
          : { packageManager: options.packageManager ?? 'npm@10.9.0' }),
        scripts: options.scripts,
      },
      null,
      2,
    ),
    'utf8',
  );
  if (options.withInstallMarker) {
    fs.mkdirSync(path.join(projectDir, 'node_modules'), {
      recursive: true,
    });
  }
  for (const file of options.files ?? []) {
    fs.writeFileSync(path.join(projectDir, file), '', 'utf8');
  }
  return projectDir;
}

afterAll(() => {
  fs.rmSync(tempRoot, { force: true, recursive: true });
});

test('sync fails early with install guidance when local dependencies are missing', async () => {
  const projectDir = writeSyncFixture({
    name: 'demo-sync-no-install',
    scripts: {
      sync: 'tsx scripts/sync-project.ts',
    },
  });

  const error = await executeSyncCommand({ cwd: projectDir }).catch(
    (thrown) => thrown,
  );

  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain('npm install');
  expect((error as Error).message).toContain('wp-typia sync');
  expect((error as Error).message).toContain('tsx');
});

test('malformed package JSON carries a stable invalid-argument code', async () => {
  const projectDir = path.join(tempRoot, 'demo-sync-invalid-package-json');
  const packageJsonPath = path.join(projectDir, 'package.json');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(packageJsonPath, '{\n', 'utf8');

  const error = await executeSyncCommand({ cwd: projectDir }).catch(
    (thrown) => thrown,
  );

  expect(error).toBeInstanceOf(Error);
  expect((error as { code?: string }).code).toBe('invalid-argument');
  expect((error as Error).message).toContain(`Unable to parse ${packageJsonPath}`);
});

test('dry-run sync previews commands without requiring installed dependencies', async () => {
  const projectDir = writeSyncFixture({
    name: 'demo-sync-dry-run-preview',
    scripts: {
      sync: 'tsx scripts/sync-project.ts',
    },
  });

  const result = await executeSyncCommand({
    check: true,
    cwd: projectDir,
    dryRun: true,
  });

  expect(result.dryRun).toBe(true);
  expect(result.executedCommands).toBeUndefined();
  expect(result.plannedCommands).toEqual([
    {
      args: ['run', 'sync', '--', '--check'],
      command: 'npm',
      displayCommand: 'npm run sync -- --check',
      scriptName: 'sync',
    },
  ]);
});

test('sync infers package manager from shared lockfile and PnP signals', async () => {
  const cases = [
    {
      command: 'yarn',
      displayCommand: 'yarn run sync --check',
      files: ['.pnp.cjs'],
      name: 'demo-sync-yarn-pnp',
      packageManager: 'yarn',
    },
    {
      command: 'npm',
      displayCommand: 'npm run sync -- --check',
      files: ['package-lock.json'],
      name: 'demo-sync-npm-lock',
      packageManager: 'npm',
    },
    {
      command: 'npm',
      displayCommand: 'npm run sync -- --check',
      files: ['npm-shrinkwrap.json'],
      name: 'demo-sync-npm-shrinkwrap',
      packageManager: 'npm',
    },
    {
      command: 'pnpm',
      displayCommand: 'pnpm run sync --check',
      files: ['pnpm-lock.yaml'],
      name: 'demo-sync-pnpm-lock',
      packageManager: 'pnpm',
    },
    {
      command: 'bun',
      displayCommand: 'bun run sync --check',
      files: ['bun.lockb'],
      name: 'demo-sync-bun-lock',
      packageManager: 'bun',
    },
    {
      command: 'npm',
      displayCommand: 'npm run sync -- --check',
      files: [],
      name: 'demo-sync-npm-fallback',
      packageManager: 'npm',
    },
  ] as const;

  for (const testCase of cases) {
    const projectDir = writeSyncFixture({
      files: [...testCase.files],
      name: testCase.name,
      packageManager: null,
      scripts: {
        sync: 'node scripts/record.mjs sync',
      },
    });
    const result = await executeSyncCommand({
      check: true,
      cwd: projectDir,
      dryRun: true,
    });

    expect(result.packageManager).toBe(testCase.packageManager);
    expect(result.plannedCommands[0]).toMatchObject({
      command: testCase.command,
      displayCommand: testCase.displayCommand,
      scriptName: 'sync',
    });
  }
});

test('sync can capture executed script output for structured callers', async () => {
  const projectDir = writeSyncFixture({
    name: 'demo-sync-capture-output',
    scripts: {
      sync: 'node scripts/record.mjs sync',
    },
    withInstallMarker: true,
  });
  const scriptsDir = path.join(projectDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(scriptsDir, 'record.mjs'),
    [
      'const [, , label] = process.argv;',
      'console.log(`ran:${label}`);',
      'console.error(`stderr:${label}`);',
    ].join('\n'),
    'utf8',
  );

  const result = await executeSyncCommand({
    captureOutput: true,
    cwd: projectDir,
  });

  expect(result.executedCommands).toHaveLength(1);
  expect(result.executedCommands?.[0]).toMatchObject({
    args: ['run', 'sync'],
    command: 'npm',
    displayCommand: 'npm run sync',
    exitCode: 0,
    scriptName: 'sync',
    stderr: 'stderr:sync\n',
  });
  expect(result.executedCommands?.[0]?.stdout).toContain('ran:sync\n');
});

test('text sync streams output beyond the diagnostic capture limit', async () => {
  const projectDir = writeSyncFixture({
    name: 'demo-sync-stream-large-output',
    scripts: {
      sync: 'node scripts/large-output.mjs',
    },
    withInstallMarker: true,
  });
  const scriptsDir = path.join(projectDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(scriptsDir, 'large-output.mjs'),
    [
      'process.stdout.write("x".repeat(17 * 1024 * 1024));',
      'process.stderr.write("y".repeat(17 * 1024 * 1024));',
    ].join('\n'),
    'utf8',
  );
  let streamedStderrBytes = 0;
  let streamedBytes = 0;

  const result = await executeSyncCommand({
    captureOutput: true,
    cwd: projectDir,
    onStderr: (chunk) => {
      streamedStderrBytes += Buffer.byteLength(chunk);
    },
    onStdout: (chunk) => {
      streamedBytes += Buffer.byteLength(chunk);
    },
  });

  expect(result.executedCommands?.[0]?.exitCode).toBe(0);
  expect(streamedBytes).toBeGreaterThan(16 * 1024 * 1024);
  expect(streamedStderrBytes).toBeGreaterThan(16 * 1024 * 1024);
  expect(
    Buffer.byteLength(result.executedCommands?.[0]?.stderr ?? ''),
  ).toBeLessThanOrEqual(16 * 1024 * 1024);
  expect(
    Buffer.byteLength(result.executedCommands?.[0]?.stdout ?? ''),
  ).toBeLessThanOrEqual(16 * 1024 * 1024);
});

test('text sync preserves UTF-8 characters split across output chunks', async () => {
  const projectDir = writeSyncFixture({
    name: 'demo-sync-stream-split-utf8',
    scripts: {
      sync: 'node scripts/split-utf8.mjs',
    },
    withInstallMarker: true,
  });
  const scriptsDir = path.join(projectDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(scriptsDir, 'split-utf8.mjs'),
    [
      "const stdout = Buffer.from('한글🙂');",
      "const stderr = Buffer.from('진단✅');",
      'process.stdout.write(stdout.subarray(0, 1));',
      'process.stderr.write(stderr.subarray(0, 2));',
      'await new Promise((resolve) => setTimeout(resolve, 25));',
      'process.stdout.write(stdout.subarray(1));',
      'process.stderr.write(stderr.subarray(2));',
    ].join('\n'),
    'utf8',
  );
  let streamedStderr = '';
  let streamedStdout = '';

  await executeSyncCommand({
    captureOutput: true,
    cwd: projectDir,
    onStderr: (chunk) => {
      streamedStderr += chunk;
    },
    onStdout: (chunk) => {
      streamedStdout += chunk;
    },
  });

  expect(streamedStdout).toContain('한글🙂');
  expect(streamedStderr).toContain('진단✅');
  expect(streamedStdout).not.toContain('�');
  expect(streamedStderr).not.toContain('�');
});

test('sync execution failures carry a stable command-execution code', async () => {
  const projectDir = writeSyncFixture({
    name: 'demo-sync-failure-code',
    scripts: {
      sync: 'node scripts/fail.mjs',
    },
    withInstallMarker: true,
  });
  const scriptsDir = path.join(projectDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(scriptsDir, 'fail.mjs'),
    ['console.error("sync failed intentionally");', 'process.exit(42);'].join(
      '\n',
    ),
    'utf8',
  );

  const error = await executeSyncCommand({
    captureOutput: true,
    cwd: projectDir,
  }).catch((thrown) => thrown);

  expect(error).toBeInstanceOf(Error);
  expect((error as { code?: string }).code).toBe('command-execution');
  expect((error as Error).message).toContain('npm run sync');
  expect((error as { detailLines?: string[] }).detailLines).toContain(
    'sync failed intentionally',
  );
  expect((error as { data?: Record<string, unknown> }).data).toEqual({
    command: 'npm run sync',
    exitCode: 42,
  });
});

test('sync check exposes generated artifact drift with project-relative paths', async () => {
  const projectDir = writeSyncFixture({
    name: 'demo-sync-artifact-drift',
    scripts: {
      sync: 'node scripts/drift.mjs',
    },
    withInstallMarker: true,
  });
  const scriptsDir = path.join(projectDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(scriptsDir, 'drift.mjs'),
    [
      "import path from 'node:path';",
      "console.error('❌ Type sync failed: Generated artifacts are missing or stale:');",
      "console.error(`- ${path.join(process.cwd(), 'src', 'block.json')} (stale)`);",
      "console.error(`- ${path.join(process.cwd(), 'src', 'typia-validator.php')} (missing)`);",
      "console.error(`- ${path.join(process.cwd(), '..', 'private-schema.php')} (stale)`);",
      "console.error('❌ Project sync failed: Error: Sync script failed: scripts/sync-types-to-block-json.ts');",
      "console.error('    at runSyncScript (sync-project.ts:78:9)');",
      'process.exit(1);',
    ].join('\n'),
    'utf8',
  );

  const error = await executeSyncCommand({
    captureOutput: true,
    check: true,
    cwd: projectDir,
  }).catch((thrown) => thrown);

  expect(error).toBeInstanceOf(Error);
  expect((error as { code?: string }).code).toBe('generated-artifact-drift');
  expect((error as { detailLines?: string[] }).detailLines).toEqual([
    '`npm run sync -- --check` failed with exit code 1.',
    'Stale generated artifact: src/block.json.',
    'Missing generated artifact: src/typia-validator.php.',
    'Stale generated artifact: private-schema.php.',
    'Run `npm run sync` to regenerate the artifacts, then rerun `npm run sync -- --check`.',
  ]);
  expect((error as { data?: Record<string, unknown> }).data).toEqual({
    artifacts: [
      { path: 'src/block.json', status: 'stale' },
      { path: 'src/typia-validator.php', status: 'missing' },
      { path: 'private-schema.php', status: 'stale' },
    ],
    command: 'npm run sync -- --check',
    exitCode: 1,
  });
  expect((error as Error).message).not.toContain(projectDir);
  expect((error as Error).message).not.toContain(path.dirname(projectDir));
  expect((error as Error).message).not.toContain('at runSyncScript');
});

test('signaled artifact drift reports the signal without inventing an exit code', async () => {
  if (process.platform === 'win32') {
    return;
  }

  const projectDir = writeSyncFixture({
    name: 'demo-sync-signaled-artifact-drift',
    scripts: {
      sync: 'node scripts/signaled-drift.mjs',
    },
    withInstallMarker: true,
  });
  const scriptsDir = path.join(projectDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(scriptsDir, 'signaled-drift.mjs'),
    [
      "console.error('- src/block.json (stale)');",
      "process.kill(process.ppid, 'SIGTERM');",
      'setTimeout(() => process.exit(0), 25);',
    ].join('\n'),
    'utf8',
  );

  const error = await executeSyncCommand({
    captureOutput: true,
    check: true,
    cwd: projectDir,
  }).catch((thrown) => thrown);

  expect((error as { code?: string }).code).toBe('generated-artifact-drift');
  expect((error as { detailLines?: string[] }).detailLines?.[0]).toBe(
    '`npm run sync -- --check` was terminated by signal SIGTERM.',
  );
  expect((error as { data?: Record<string, unknown> }).data).toEqual({
    artifacts: [{ path: 'src/block.json', status: 'stale' }],
    command: 'npm run sync -- --check',
    signal: 'SIGTERM',
  });
});

test('sync drift diagnostics cap the structured artifact list', async () => {
  const projectDir = writeSyncFixture({
    name: 'demo-sync-artifact-limit',
    scripts: {
      sync: 'node scripts/drift-limit.mjs',
    },
    withInstallMarker: true,
  });
  const scriptsDir = path.join(projectDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(scriptsDir, 'drift-limit.mjs'),
    [
      "import path from 'node:path';",
      "for (let index = 0; index < 25; index += 1) {",
      "  console.error(`- ${path.join(process.cwd(), 'src', `artifact-${index}.php`)} (stale)`);",
      '}',
      'process.exit(1);',
    ].join('\n'),
    'utf8',
  );

  const error = await executeSyncCommand({
    captureOutput: true,
    check: true,
    cwd: projectDir,
  }).catch((thrown) => thrown);
  const artifacts = (
    error as {
      data?: { artifacts?: Array<{ path: string; status: string }> };
    }
  ).data?.artifacts;

  expect((error as { code?: string }).code).toBe('generated-artifact-drift');
  expect(artifacts).toHaveLength(20);
  expect(artifacts?.[19]).toEqual({
    path: 'src/artifact-19.php',
    status: 'stale',
  });
});

test('legacy split sync plans include sync-ai after sync-rest when the project opts in', async () => {
  const projectDir = writeSyncFixture({
    name: 'demo-sync-with-ai',
    scripts: {
      'sync-ai': 'node scripts/record.mjs sync-ai',
      'sync-rest': 'node scripts/record.mjs sync-rest',
      'sync-types': 'node scripts/record.mjs sync-types',
    },
  });

  const result = await executeSyncCommand({
    check: true,
    cwd: projectDir,
    dryRun: true,
  });

  expect(result.target).toBe('default');
  expect(result.plannedCommands).toEqual([
    {
      args: ['run', 'sync-types', '--', '--check'],
      command: 'npm',
      displayCommand: 'npm run sync-types -- --check',
      scriptName: 'sync-types',
    },
    {
      args: ['run', 'sync-rest', '--', '--check'],
      command: 'npm',
      displayCommand: 'npm run sync-rest -- --check',
      scriptName: 'sync-rest',
    },
    {
      args: ['run', 'sync-ai', '--', '--check'],
      command: 'npm',
      displayCommand: 'npm run sync-ai -- --check',
      scriptName: 'sync-ai',
    },
  ]);
});

test('sync ai targets the dedicated sync-ai script only', async () => {
  const projectDir = writeSyncFixture({
    name: 'demo-sync-ai-only',
    scripts: {
      sync: 'node scripts/record.mjs sync',
      'sync-ai': 'node scripts/record.mjs sync-ai',
    },
    withInstallMarker: true,
  });
  const scriptsDir = path.join(projectDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(scriptsDir, 'record.mjs'),
    ['const [, , label] = process.argv;', 'console.log(`ran:${label}`);'].join(
      '\n',
    ),
    'utf8',
  );

  const result = await executeSyncCommand({
    captureOutput: true,
    check: true,
    cwd: projectDir,
    target: 'ai',
  });

  expect(result.target).toBe('ai');
  expect(result.executedCommands).toHaveLength(1);
  expect(result.executedCommands?.[0]).toMatchObject({
    args: ['run', 'sync-ai', '--', '--check'],
    command: 'npm',
    displayCommand: 'npm run sync-ai -- --check',
    scriptName: 'sync-ai',
  });
  expect(result.executedCommands?.[0]?.stdout).toContain('ran:sync-ai\n');
});

test('sync ai preserves the legacy sync-wordpress-ai script key when needed', async () => {
  const projectDir = writeSyncFixture({
    name: 'demo-sync-ai-legacy-only',
    scripts: {
      'sync-wordpress-ai': 'node scripts/record.mjs sync-wordpress-ai',
    },
    withInstallMarker: true,
  });
  const scriptsDir = path.join(projectDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(scriptsDir, 'record.mjs'),
    ['const [, , label] = process.argv;', 'console.log(`ran:${label}`);'].join(
      '\n',
    ),
    'utf8',
  );

  const result = await executeSyncCommand({
    captureOutput: true,
    check: true,
    cwd: projectDir,
    target: 'ai',
  });

  expect(result.target).toBe('ai');
  expect(result.executedCommands).toHaveLength(1);
  expect(result.executedCommands?.[0]).toMatchObject({
    args: ['run', 'sync-wordpress-ai', '--', '--check'],
    command: 'npm',
    displayCommand: 'npm run sync-wordpress-ai -- --check',
    scriptName: 'sync-wordpress-ai',
  });
  expect(result.executedCommands?.[0]?.stdout).toContain(
    'ran:sync-wordpress-ai\n',
  );
});
