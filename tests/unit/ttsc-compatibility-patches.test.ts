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
const GENERATED_TTSC_LINT_COMPAT_TEMPLATE = path.join(
  repoRoot,
  'packages',
  'wp-typia-project-tools',
  'templates',
  '_shared',
  'base',
  'scripts',
  'apply-ttsc-lint-compat.mjs.mustache',
);
const PATCHED_TTSC_LINT_PARENT_GUARD = `    switch node.Parent.Kind {
    case shimast.KindClassDeclaration,
      shimast.KindClassExpression,
      shimast.KindInterfaceDeclaration,
      shimast.KindTypeAliasDeclaration,
      shimast.KindJSTypeAliasDeclaration,
      shimast.KindJSDocTemplateTag:
      // These declaration kinds own an actual type-parameter list.
    default:
      if node.Parent.FunctionLikeData() == nil {
        // Type parameters used by mapped and infer types are represented by
        // the same node kind, but their parents do not expose
        // TypeParameterList and the TypeScript-Go shim panics when asked.
        return
      }
    }
`;
const UNPATCHED_TTSC_LINT_BUFFER_TARGET = `    for (const entry of fs.readdirSync(location, {
      encoding: "buffer",
      withFileTypes: true,
    })) {
      let target = Buffer.alloc(0);
      if (entry.isSymbolicLink()) {
        try {
          target = fs.readlinkSync(`;
const PATCHED_TTSC_LINT_BUFFER_TARGET = `    for (const entry of fs.readdirSync(location, {
      encoding: "buffer",
      withFileTypes: true,
    })) {
      let target: Buffer = Buffer.alloc(0);
      if (entry.isSymbolicLink()) {
        try {
          target = fs.readlinkSync(`;
const UNPATCHED_TTSC_LINT_WINDOWS_BUFFER_TARGET = `  if (process.platform === "win32") {
    for (const entry of fs.readdirSync(location, { withFileTypes: true })) {
      let target = Buffer.alloc(0);`;
const PATCHED_TTSC_LINT_WINDOWS_BUFFER_TARGET = `  if (process.platform === "win32") {
    for (const entry of fs.readdirSync(location, { withFileTypes: true })) {
      let target: Buffer = Buffer.alloc(0);`;
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
        '@ttsc/lint': '0.26.1',
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

  test('repairs a root-patch-free generated consumer before ttsc runs', () => {
    const projectDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-generated-lint-compat-'),
    );
    tempDirs.push(projectDir);
    const nodeModulesDir = path.join(projectDir, 'node_modules');
    const scopedTtscDir = path.join(nodeModulesDir, '@ttsc');
    fs.mkdirSync(scopedTtscDir, { recursive: true });
    fs.cpSync(
      fs.realpathSync(path.join(repoRoot, 'node_modules', '@ttsc', 'lint')),
      path.join(scopedTtscDir, 'lint'),
      { recursive: true },
    );
    fs.symlinkSync(
      path.join(repoRoot, 'node_modules', 'ttsc'),
      path.join(nodeModulesDir, 'ttsc'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    fs.symlinkSync(
      path.join(repoRoot, 'node_modules', 'typescript'),
      path.join(nodeModulesDir, 'typescript'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const lintRulePath = path.join(
      scopedTtscDir,
      'lint',
      'linthost',
      'rules_format_trailing_comma.go',
    );
    const patchedRuleSource = fs.readFileSync(lintRulePath, 'utf8');
    expect(patchedRuleSource).toContain(PATCHED_TTSC_LINT_PARENT_GUARD);
    writeText(
      lintRulePath,
      patchedRuleSource.replace(PATCHED_TTSC_LINT_PARENT_GUARD, ''),
    );
    const lintIndexPath = path.join(scopedTtscDir, 'lint', 'src', 'index.ts');
    const patchedIndexSource = fs.readFileSync(lintIndexPath, 'utf8');
    expect(
      patchedIndexSource.split(PATCHED_TTSC_LINT_BUFFER_TARGET).length - 1,
    ).toBe(2);
    expect(
      patchedIndexSource.split(PATCHED_TTSC_LINT_WINDOWS_BUFFER_TARGET)
        .length - 1,
    ).toBe(2);
    writeText(
      lintIndexPath,
      patchedIndexSource
        .split(PATCHED_TTSC_LINT_BUFFER_TARGET)
        .join(UNPATCHED_TTSC_LINT_BUFFER_TARGET)
        .split(PATCHED_TTSC_LINT_WINDOWS_BUFFER_TARGET)
        .join(UNPATCHED_TTSC_LINT_WINDOWS_BUFFER_TARGET),
    );
    writeJson(path.join(projectDir, 'package.json'), {
      devDependencies: {
        '@ttsc/lint': '0.26.1',
        ttsc: '0.26.1',
        typescript: '7.0.2',
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
    const compatScriptPath = path.join(
      projectDir,
      'scripts',
      'apply-ttsc-lint-compat.mjs',
    );
    writeText(
      compatScriptPath,
      fs.readFileSync(GENERATED_TTSC_LINT_COMPAT_TEMPLATE, 'utf8'),
    );

    const patchResult = spawnSync('node', [compatScriptPath], {
      cwd: projectDir,
      encoding: 'utf8',
    });
    expect(patchResult.error).toBeUndefined();
    expect(
      patchResult.status,
      `${patchResult.stdout ?? ''}${patchResult.stderr ?? ''}`,
    ).toBe(0);
    expect(fs.readFileSync(lintRulePath, 'utf8')).toContain(
      'Mapped and infer type parameters do not expose TypeParameterList.',
    );
    const repairedIndexSource = fs.readFileSync(lintIndexPath, 'utf8');
    expect(
      repairedIndexSource.split(PATCHED_TTSC_LINT_BUFFER_TARGET).length - 1,
    ).toBe(2);
    expect(
      repairedIndexSource.split(PATCHED_TTSC_LINT_WINDOWS_BUFFER_TARGET)
        .length - 1,
    ).toBe(2);
    expect(repairedIndexSource).not.toContain(
      UNPATCHED_TTSC_LINT_BUFFER_TARGET,
    );
    expect(repairedIndexSource).not.toContain(
      UNPATCHED_TTSC_LINT_WINDOWS_BUFFER_TARGET,
    );
    const repeatedPatchResult = spawnSync('node', [compatScriptPath], {
      cwd: projectDir,
      encoding: 'utf8',
    });
    expect(repeatedPatchResult.error).toBeUndefined();
    expect(
      repeatedPatchResult.status,
      `${repeatedPatchResult.stdout ?? ''}${repeatedPatchResult.stderr ?? ''}`,
    ).toBe(0);

    const result = runTtsc(projectDir, [
      '--project',
      'tsconfig.json',
      '--noEmit',
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status, result.output).toBe(0);
    expect(result.output.toLowerCase()).not.toContain('panic');
  }, TTSC_PROCESS_TIMEOUT_MS);

  test('keeps every generated ttsc lint compatibility hook identical', () => {
    const canonicalSource = fs.readFileSync(
      GENERATED_TTSC_LINT_COMPAT_TEMPLATE,
      'utf8',
    );
    for (const templatePath of [
      path.join(
        repoRoot,
        'packages',
        'create-workspace-template',
        'scripts',
        'apply-ttsc-lint-compat.mjs.mustache',
      ),
      path.join(
        repoRoot,
        'packages',
        'wp-typia-project-tools',
        'tests',
        'fixtures',
        'create-block-external',
        'plugin-templates',
        'scripts',
        'apply-ttsc-lint-compat.mjs.mustache',
      ),
    ]) {
      expect(fs.readFileSync(templatePath, 'utf8')).toBe(canonicalSource);
    }
  });
});
