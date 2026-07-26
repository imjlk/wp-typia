import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dir, '..', '..');
const ttscLauncher = path.join(
  repoRoot,
  'node_modules',
  'ttsc',
  'lib',
  'launcher',
  'ttsc.js',
);
const ttscCacheDir = path.join(repoRoot, 'node_modules', '.cache', 'ttsc');
const TTSC_PROCESS_TIMEOUT_MS = 300_000;
let tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs) {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
  tempDirs = [];
});

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}

function createTtscFixture(prefix: string) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(projectDir);
  fs.symlinkSync(
    path.join(repoRoot, 'node_modules'),
    path.join(projectDir, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  return projectDir;
}

function runTtsc(projectDir: string, args: string[]) {
  const result = spawnSync('node', [ttscLauncher, ...args], {
    cwd: projectDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      TTSC_CACHE_DIR: process.env.TTSC_CACHE_DIR ?? ttscCacheDir,
    },
    timeout: TTSC_PROCESS_TIMEOUT_MS,
  });
  return {
    error: result.error,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    status: result.status,
  };
}

describe('ttsc compatibility patches', () => {
  test('forwards tsgo CLI options through the native typia transform host', () => {
    const projectDir = createTtscFixture('wp-typia-ttsc-typia-patch-');
    writeJson(path.join(projectDir, 'package.json'), {
      dependencies: {
        typia: '13.2.0',
      },
      private: true,
      type: 'module',
    });
    writeJson(path.join(projectDir, 'tsconfig.json'), {
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'bundler',
        outDir: 'dist',
        rootDir: 'src',
        skipLibCheck: true,
        strict: false,
        target: 'ES2020',
        types: [],
      },
      include: ['src/**/*.ts'],
    });
    const sourcePath = path.join(projectDir, 'src', 'index.ts');
    writeText(
      sourcePath,
      `import typia from 'typia';

export interface Payload {
  value: string;
}

export const isPayload = typia.createIs<Payload>();
`,
    );

    const emitResult = runTtsc(projectDir, [
      '--project',
      'tsconfig.json',
      '--strict',
    ]);
    expect(emitResult.error).toBeUndefined();
    expect(emitResult.status, emitResult.output).toBe(0);
    const emittedSource = fs.readFileSync(
      path.join(projectDir, 'dist', 'index.js'),
      'utf8',
    );
    expect(emittedSource).not.toContain('typia.createIs');

    writeText(
      sourcePath,
      `import typia from 'typia';

export interface Payload {
  value: string;
}

export const isPayload = typia.createIs<Payload>();
export function acceptsImplicitAny(value) {
  return isPayload(value);
}
`,
    );
    const strictResult = runTtsc(projectDir, [
      '--project',
      'tsconfig.json',
      '--strict',
      '--noEmit',
    ]);
    expect(strictResult.error).toBeUndefined();
    expect(strictResult.status).not.toBe(0);
    expect(strictResult.output).toContain('TS7006');
    expect(strictResult.output).toContain("implicitly has an 'any' type");
  }, TTSC_PROCESS_TIMEOUT_MS);

  test('formats mapped and infer type parameters without a lint host panic', () => {
    const projectDir = createTtscFixture('wp-typia-ttsc-lint-patch-');
    writeJson(path.join(projectDir, 'package.json'), {
      devDependencies: {
        '@ttsc/lint': '0.22.0',
      },
      private: true,
      type: 'module',
    });
    writeJson(path.join(projectDir, 'tsconfig.json'), {
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'bundler',
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        target: 'ES2020',
        types: [],
      },
      include: ['src/**/*.ts'],
    });
    writeText(
      path.join(projectDir, 'lint.config.ts'),
      `export default {
  format: {
    severity: 'error',
    trailingComma: 'all',
  },
};
`,
    );
    writeText(
      path.join(projectDir, 'src', 'index.ts'),
      `export type Mapped<Value> = {
  [Key in keyof Value]: Value[Key];
};

export type Inferred<Value> =
  Value extends Promise<infer Item> ? Item : never;
`,
    );

    const result = runTtsc(projectDir, [
      '--project',
      'tsconfig.json',
      '--noEmit',
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status, result.output).toBe(0);
    expect(result.output.toLowerCase()).not.toContain('panic');
  }, TTSC_PROCESS_TIMEOUT_MS);
});
