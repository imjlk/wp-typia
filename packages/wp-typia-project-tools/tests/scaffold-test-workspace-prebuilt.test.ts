import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const helperUrl = pathToFileURL(
  path.join(import.meta.dir, 'helpers', 'scaffold-test-workspace.ts'),
).href;

function createFakeWorkspacePackage() {
  const packageRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-prebuilt-package-'),
  );
  fs.writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({
      name: '@wp-typia/prebuilt-fixture',
      private: true,
      scripts: {
        build: 'bun build-runtime.mjs',
      },
    }),
  );
  fs.writeFileSync(
		path.join(packageRoot, 'build-runtime.mjs'),
		`import fs from "node:fs";
import path from "node:path";

fs.mkdirSync(path.join(import.meta.dir, "dist"), { recursive: true });
fs.writeFileSync(path.join(import.meta.dir, "dist", "index.js"), "export {};\\n");
fs.writeFileSync(path.join(import.meta.dir, "BUILD_RAN"), "1\\n");
`,
	);
  return packageRoot;
}

function runEnsureWorkspacePackageBuilt(
	packageRoot: string,
	requirePrebuilt: boolean,
) {
  const env = { ...process.env };
  if (requirePrebuilt) {
    env.WP_TYPIA_PROJECT_TOOLS_REQUIRE_PREBUILT = '1';
  } else {
    delete env.WP_TYPIA_PROJECT_TOOLS_REQUIRE_PREBUILT;
  }

  const source = `const { ensureWorkspacePackageBuilt } = await import(${JSON.stringify(
		helperUrl,
	)});
ensureWorkspacePackageBuilt("@wp-typia/dataviews", ${JSON.stringify(packageRoot)});`;

  return spawnSync(process.execPath, ['--eval', source], {
    encoding: 'utf8',
    env,
  });
}

describe('project-tools prebuilt workspace guard', () => {
  const testRoots: string[] = [];

  afterEach(() => {
    for (const testRoot of testRoots.splice(0)) {
      fs.rmSync(testRoot, { force: true, recursive: true });
    }
  });

  test('fails before invoking a lazy build when prebuilt packages are required', () => {
    const packageRoot = createFakeWorkspacePackage();
    testRoots.push(packageRoot);

    const result = runEnsureWorkspacePackageBuilt(packageRoot, true);
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain(
      'Expected prebuilt workspace package "@wp-typia/dataviews"',
    );
    expect(output).toContain(path.join(packageRoot, 'dist'));
    expect(fs.existsSync(path.join(packageRoot, 'BUILD_RAN'))).toBe(false);
  });

  test('accepts an existing dist without invoking the package build', () => {
    const packageRoot = createFakeWorkspacePackage();
    testRoots.push(packageRoot);
    fs.mkdirSync(path.join(packageRoot, 'dist'));

    const result = runEnsureWorkspacePackageBuilt(packageRoot, true);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(packageRoot, 'BUILD_RAN'))).toBe(false);
  });

  test('preserves the local lazy-build fallback outside run-only CI', () => {
    const packageRoot = createFakeWorkspacePackage();
    testRoots.push(packageRoot);

    const result = runEnsureWorkspacePackageBuilt(packageRoot, false);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(packageRoot, 'BUILD_RAN'))).toBe(true);
    expect(fs.existsSync(path.join(packageRoot, 'dist', 'index.js'))).toBe(true);
  });
});
