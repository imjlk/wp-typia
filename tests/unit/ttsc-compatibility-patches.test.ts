import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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
const TTSC_LINT_BUFFER_TARGET_PATTERN =
  /let target(?:: [^=\r\n]+)? = Buffer\.alloc\(0\);(?=\r?\n\s*if \(entry\.isSymbolicLink\(\)\))/gu;
const PATCHED_TTSC_LINT_BUFFER_TARGET_PATTERN =
  /let target: Buffer = Buffer\.alloc\(0\);(?=\r?\n\s*if \(entry\.isSymbolicLink\(\)\))/gu;
const UNPATCHED_TTSC_LINT_BUFFER_TARGET_PATTERN =
  /let target = Buffer\.alloc\(0\);(?=\r?\n\s*if \(entry\.isSymbolicLink\(\)\))/gu;
const LEGACY_JSDOC_TTSC_LINT_BUFFER_TARGET =
  '/** @type {Buffer} */ let target = Buffer.alloc(0);';
let tempDirs: string[] = [];

function rewriteTtscLintBufferTargets(
  source: string,
  targetSource: string,
  functionNames = ['directoryDigest', 'configDirectoryDigest'],
  scopeMarker?: string,
): string {
  let normalized = source;
  const searchStart =
    scopeMarker === undefined ? 0 : normalized.indexOf(scopeMarker);
  expect(searchStart).not.toBe(-1);
  for (const functionName of functionNames) {
    const functionStart = normalized.indexOf(
      `function ${functionName}(`,
      searchStart,
    );
    const functionEnd = normalized.indexOf(
      `function ${functionName}Record(`,
      functionStart,
    );
    if (functionStart === -1 || functionEnd === -1) {
      throw new Error(`Unable to locate ${functionName} compatibility scope.`);
    }
    let functionSource = normalized.slice(functionStart, functionEnd);
    const targetCount =
      functionSource.match(TTSC_LINT_BUFFER_TARGET_PATTERN)?.length ?? 0;
    if (targetCount !== 2) {
      throw new Error(
        `Expected two compatibility targets in ${functionName}, found ${targetCount}.`,
      );
    }
    functionSource = functionSource.replace(
      TTSC_LINT_BUFFER_TARGET_PATTERN,
      targetSource,
    );
    normalized = `${normalized.slice(
      0,
      functionStart,
    )}${functionSource}${normalized.slice(functionEnd)}`;
  }
  return normalized;
}

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
        '@ttsc/lint': '0.26.2',
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
    const cachedPatchedIndexSource = rewriteTtscLintBufferTargets(
      patchedIndexSource,
      'let target: Buffer<ArrayBufferLike<ArrayBuffer>> = Buffer.alloc(0);',
    );
    writeText(lintIndexPath, cachedPatchedIndexSource);
    const lintRuntimePath = path.join(
      scopedTtscDir,
      'lint',
      'lib',
      'index.js',
    );
    const patchedRuntimeSource = fs.readFileSync(lintRuntimePath, 'utf8');
    expect(
      patchedRuntimeSource.match(PATCHED_TTSC_LINT_BUFFER_TARGET_PATTERN)
        ?.length ?? 0,
    ).toBe(2);
    writeText(
      lintRuntimePath,
      rewriteTtscLintBufferTargets(
        patchedRuntimeSource,
        LEGACY_JSDOC_TTSC_LINT_BUFFER_TARGET,
        ['directoryDigest'],
      ),
    );
    const lintHostConfigPath = path.join(
      scopedTtscDir,
      'lint',
      'linthost',
      'config.go',
    );
    const patchedLintHostConfigSource = fs.readFileSync(
      lintHostConfigPath,
      'utf8',
    );
    const typeScriptLoaderMarker = 'func typeScriptConfigLoaderSource(';
    expect(
      patchedLintHostConfigSource
        .slice(patchedLintHostConfigSource.indexOf(typeScriptLoaderMarker))
        .match(PATCHED_TTSC_LINT_BUFFER_TARGET_PATTERN)?.length ?? 0,
    ).toBe(2);
    writeText(
      lintHostConfigPath,
      rewriteTtscLintBufferTargets(
        patchedLintHostConfigSource,
        'let target = Buffer.alloc(0);',
        ['directoryDigest'],
        typeScriptLoaderMarker,
      ),
    );
    writeJson(path.join(projectDir, 'package.json'), {
      devDependencies: {
        '@ttsc/lint': '0.26.2',
        ttsc: '0.26.2',
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

    const staleTemporaryPath = `${lintIndexPath}.wp-typia-12345.tmp`;
    const freshTemporaryPath = `${lintIndexPath}.wp-typia-67890.tmp`;
    writeText(staleTemporaryPath, 'stale');
    writeText(freshTemporaryPath, 'fresh');
    const staleTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(staleTemporaryPath, staleTime, staleTime);
    fs.chmodSync(lintRuntimePath, 0o764);
    const runtimeMode = fs.statSync(lintRuntimePath).mode % 0o1000;

    const patchResult = spawnSync(
      'node',
      [
        '--input-type=module',
        '--eval',
        `process.umask(0o077); await import(${JSON.stringify(pathToFileURL(compatScriptPath).href)});`,
      ],
      {
        cwd: projectDir,
        encoding: 'utf8',
      },
    );
    expect(patchResult.error).toBeUndefined();
    expect(
      patchResult.status,
      `${patchResult.stdout ?? ''}${patchResult.stderr ?? ''}`,
    ).toBe(0);
    expect(fs.existsSync(staleTemporaryPath)).toBe(false);
    expect(fs.existsSync(freshTemporaryPath)).toBe(true);
    expect(fs.readFileSync(lintRulePath, 'utf8')).toContain(
      'Mapped and infer type parameters do not expose TypeParameterList.',
    );
    const repairedIndexSource = fs.readFileSync(lintIndexPath, 'utf8');
    expect(
      repairedIndexSource.match(PATCHED_TTSC_LINT_BUFFER_TARGET_PATTERN)
        ?.length ?? 0,
    ).toBe(4);
    expect(
      repairedIndexSource.match(UNPATCHED_TTSC_LINT_BUFFER_TARGET_PATTERN)
        ?.length ?? 0,
    ).toBe(0);
    const repairedRuntimeSource = fs.readFileSync(lintRuntimePath, 'utf8');
    expect(
      repairedRuntimeSource.match(PATCHED_TTSC_LINT_BUFFER_TARGET_PATTERN)
        ?.length ?? 0,
    ).toBe(2);
    expect(
      repairedRuntimeSource.match(UNPATCHED_TTSC_LINT_BUFFER_TARGET_PATTERN)
        ?.length ?? 0,
    ).toBe(0);
    expect(repairedRuntimeSource).not.toContain(
      LEGACY_JSDOC_TTSC_LINT_BUFFER_TARGET,
    );
    expect(fs.statSync(lintRuntimePath).mode % 0o1000).toBe(runtimeMode);
    const runtimeSyntaxResult = spawnSync('node', ['--check', lintRuntimePath]);
    expect(runtimeSyntaxResult.error).toBeUndefined();
    expect(runtimeSyntaxResult.status).toBe(0);
    const repairedLintHostConfigSource = fs.readFileSync(
      lintHostConfigPath,
      'utf8',
    );
    const repairedTypeScriptLoaderSource = repairedLintHostConfigSource.slice(
      repairedLintHostConfigSource.indexOf(typeScriptLoaderMarker),
    );
    expect(
      repairedTypeScriptLoaderSource.match(
        PATCHED_TTSC_LINT_BUFFER_TARGET_PATTERN,
      )?.length ?? 0,
    ).toBe(2);
    expect(
      repairedTypeScriptLoaderSource.match(
        UNPATCHED_TTSC_LINT_BUFFER_TARGET_PATTERN,
      )?.length ?? 0,
    ).toBe(0);
    const repeatedStaleTemporaryPath = `${lintIndexPath}.wp-typia-24680.tmp`;
    writeText(repeatedStaleTemporaryPath, 'stale after repair');
    fs.utimesSync(repeatedStaleTemporaryPath, staleTime, staleTime);
    const repeatedPatchResult = spawnSync('node', [compatScriptPath], {
      cwd: projectDir,
      encoding: 'utf8',
    });
    expect(repeatedPatchResult.error).toBeUndefined();
    expect(
      repeatedPatchResult.status,
      `${repeatedPatchResult.stdout ?? ''}${repeatedPatchResult.stderr ?? ''}`,
    ).toBe(0);
    expect(fs.existsSync(repeatedStaleTemporaryPath)).toBe(false);

    const result = runTtsc(projectDir, [
      '--project',
      'tsconfig.json',
      '--noEmit',
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status, result.output).toBe(0);
    expect(result.output.toLowerCase()).not.toContain('panic');
  }, TTSC_PROCESS_TIMEOUT_MS);

  test('skips the generated compatibility hook when production installs omit lint tooling', () => {
    const projectDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-generated-lint-production-'),
    );
    tempDirs.push(projectDir);
    writeJson(path.join(projectDir, 'package.json'), {
      private: true,
      type: 'module',
    });
    const compatScriptPath = path.join(
      projectDir,
      'scripts',
      'apply-ttsc-lint-compat.mjs',
    );
    writeText(
      compatScriptPath,
      fs.readFileSync(GENERATED_TTSC_LINT_COMPAT_TEMPLATE, 'utf8'),
    );

    const result = spawnSync('node', [compatScriptPath], {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      '@ttsc/lint is not installed; skipping development-only compatibility repairs.',
    );
  });

  test('fails closed on unexpected lint sources before writing partial repairs', () => {
    const projectDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-generated-lint-unexpected-'),
    );
    tempDirs.push(projectDir);
    const lintPackageRoot = path.join(
      projectDir,
      'node_modules',
      '@ttsc',
      'lint',
    );
    fs.mkdirSync(path.dirname(lintPackageRoot), { recursive: true });
    fs.cpSync(
      fs.realpathSync(path.join(repoRoot, 'node_modules', '@ttsc', 'lint')),
      lintPackageRoot,
      { recursive: true },
    );
    writeJson(path.join(projectDir, 'package.json'), {
      private: true,
      type: 'module',
    });
    const compatScriptPath = path.join(
      projectDir,
      'scripts',
      'apply-ttsc-lint-compat.mjs',
    );
    writeText(
      compatScriptPath,
      fs.readFileSync(GENERATED_TTSC_LINT_COMPAT_TEMPLATE, 'utf8'),
    );
    const lintIndexPath = path.join(lintPackageRoot, 'src', 'index.ts');
    const originalIndexSource = fs.readFileSync(lintIndexPath, 'utf8');
    const presentTarget = [
      'let target: Buffer<ArrayBufferLike<ArrayBuffer>> = Buffer.alloc(0);',
      'let target: Buffer = Buffer.alloc(0);',
      'let target = Buffer.alloc(0);',
    ].find((candidate) => originalIndexSource.includes(candidate));
    expect(
      presentTarget,
      'expected a recognized Buffer target declaration in @ttsc/lint src/index.ts',
    ).toBeDefined();
    const unexpectedIndexSource = originalIndexSource.replace(
      presentTarget!,
      'let target: Uint8Array = Buffer.alloc(0);',
    );
    expect(unexpectedIndexSource).not.toBe(originalIndexSource);
    writeText(lintIndexPath, unexpectedIndexSource);
    const unchangedRepairSources = [
      path.join(lintPackageRoot, 'linthost', 'rules_format_trailing_comma.go'),
      path.join(lintPackageRoot, 'lib', 'index.js'),
      path.join(lintPackageRoot, 'linthost', 'config.go'),
    ].map((sourcePath) => ({
      source: fs.readFileSync(sourcePath, 'utf8'),
      sourcePath,
    }));

    const result = spawnSync('node', [compatScriptPath], {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Failed to apply the @ttsc/lint compatibility repairs.',
    );
    expect(result.stderr).toContain(
      "unexpected type annotation 'Uint8Array'",
    );
    expect(result.stderr).toContain(
      "Re-run the project's package-manager install command",
    );
    expect(fs.readFileSync(lintIndexPath, 'utf8')).toBe(unexpectedIndexSource);
    for (const { source, sourcePath } of unchangedRepairSources) {
      expect(fs.readFileSync(sourcePath, 'utf8')).toBe(source);
    }
  });

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
