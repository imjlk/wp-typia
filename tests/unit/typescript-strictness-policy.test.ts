import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { validateTypeScriptStrictnessPolicy } from '../../scripts/validate-typescript-strictness-policy.mjs';

let tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createStrictnessRepo() {
  const repoRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-ts-strictness-'),
  );
  tempDirs.push(repoRoot);

  writeJson(path.join(repoRoot, 'tsconfig.base.json'), {
    compilerOptions: {
      strict: true,
      noImplicitOverride: true,
      noFallthroughCasesInSwitch: true,
      useUnknownInCatchVariables: true,
    },
  });
  writeJson(path.join(repoRoot, 'tsconfig.json'), {
    extends: './tsconfig.base.json',
    compilerOptions: {
      noEmit: true,
    },
  });
  writeJson(path.join(repoRoot, 'packages/wp-typia-api-client/tsconfig.json'), {
    extends: '../../tsconfig.json',
    compilerOptions: {
      baseUrl: '.',
    },
  });
  writeJson(
    path.join(repoRoot, 'packages/wp-typia-api-client/tsconfig.build.json'),
    {
      extends: './tsconfig.json',
      compilerOptions: {
        noEmit: false,
      },
    },
  );
  writeJson(
    path.join(repoRoot, 'packages/wp-typia-api-client/config/tsconfig.json'),
    {
      extends: '../tsconfig.json',
    },
  );
  writeJson(path.join(repoRoot, 'examples/my-typia-block/tsconfig.json'), {
    extends: '../../tsconfig.json',
    include: ['src/**/*'],
  });

  return repoRoot;
}

function createTestPolicy(
	exceptions: Record<string, Record<string, boolean>> = {},
) {
  return {
    baseline: {
      noFallthroughCasesInSwitch: true,
      noImplicitOverride: true,
      strict: true,
      useUnknownInCatchVariables: true,
    },
    deferredFlags: [
      'exactOptionalPropertyTypes',
      'noImplicitReturns',
      'noPropertyAccessFromIndexSignature',
      'noUncheckedIndexedAccess',
    ],
    exceptions,
  };
}

describe('validateTypeScriptStrictnessPolicy', () => {
	test('passes when the repo inherits the staged baseline from tsconfig.base.json', () => {
		const repoRoot = createStrictnessRepo();

		expect(validateTypeScriptStrictnessPolicy(repoRoot, createTestPolicy())).toEqual({
			errors: [],
			valid: true,
		});
	});

	test('fails when tsconfig.base.json drifts from the adopted baseline', () => {
		const repoRoot = createStrictnessRepo();
		const basePath = path.join(repoRoot, 'tsconfig.base.json');
		const baseConfig = JSON.parse(fs.readFileSync(basePath, 'utf8'));
		delete baseConfig.compilerOptions.noImplicitOverride;
		writeJson(basePath, baseConfig);

		const result = validateTypeScriptStrictnessPolicy(repoRoot, createTestPolicy());

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			'tsconfig.base.json must declare compilerOptions.noImplicitOverride=true.',
		);
	});

	test('fails when a package redundantly overrides an adopted baseline flag', () => {
		const repoRoot = createStrictnessRepo();
		const packagePath = path.join(repoRoot, 'packages/wp-typia-api-client/tsconfig.json');
		const packageConfig = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
		packageConfig.compilerOptions.strict = true;
		writeJson(packagePath, packageConfig);

		const result = validateTypeScriptStrictnessPolicy(repoRoot, createTestPolicy());

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			'packages/wp-typia-api-client/tsconfig.json should inherit compilerOptions.strict=true from tsconfig.base.json instead of overriding it locally.',
		);
	});

	test('fails when a package tsconfig no longer inherits from the repo baseline', () => {
		const repoRoot = createStrictnessRepo();
		const packagePath = path.join(repoRoot, 'packages/wp-typia-api-client/tsconfig.json');
		const packageConfig = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
		delete packageConfig.extends;
		writeJson(packagePath, packageConfig);

		const result = validateTypeScriptStrictnessPolicy(repoRoot, createTestPolicy());

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			'packages/wp-typia-api-client/tsconfig.json must inherit from tsconfig.base.json through a repo-local extends chain so the shared strictness baseline cannot be bypassed.',
		);
	});

	test('fails when a nested package tsconfig overrides an adopted baseline flag', () => {
		const repoRoot = createStrictnessRepo();
		const nestedPath = path.join(
			repoRoot,
			'packages/wp-typia-api-client/config/tsconfig.json',
		);
		const nestedConfig = JSON.parse(fs.readFileSync(nestedPath, 'utf8'));
		nestedConfig.compilerOptions = {
			...nestedConfig.compilerOptions,
			strict: true,
		};
		writeJson(nestedPath, nestedConfig);

		const result = validateTypeScriptStrictnessPolicy(repoRoot, createTestPolicy());

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			'packages/wp-typia-api-client/config/tsconfig.json should inherit compilerOptions.strict=true from tsconfig.base.json instead of overriding it locally.',
		);
	});

	test('fails when a package opts into a deferred strictness flag without an explicit exception', () => {
		const repoRoot = createStrictnessRepo();
		const packagePath = path.join(repoRoot, 'examples/my-typia-block/tsconfig.json');
		const packageConfig = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
		packageConfig.compilerOptions = {
			...packageConfig.compilerOptions,
			noUncheckedIndexedAccess: true,
		};
		writeJson(packagePath, packageConfig);

		const result = validateTypeScriptStrictnessPolicy(repoRoot, createTestPolicy());

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			'examples/my-typia-block/tsconfig.json must not opt into compilerOptions.noUncheckedIndexedAccess ad hoc; add an explicit strictness policy exception first.',
		);
	});

	test('accepts a deferred flag when the override is declared as an explicit exception', () => {
		const repoRoot = createStrictnessRepo();
		const packagePath = path.join(repoRoot, 'examples/my-typia-block/tsconfig.json');
		const packageConfig = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
		packageConfig.compilerOptions = {
			...packageConfig.compilerOptions,
			noUncheckedIndexedAccess: true,
		};
		writeJson(packagePath, packageConfig);

		const result = validateTypeScriptStrictnessPolicy(
			repoRoot,
			createTestPolicy({
				'examples/my-typia-block/tsconfig.json': {
					noUncheckedIndexedAccess: true,
				},
			}),
		);

		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});

	test('accepts multiple deferred flags when the overrides are declared explicitly', () => {
		const repoRoot = createStrictnessRepo();
		const packagePath = path.join(repoRoot, 'examples/my-typia-block/tsconfig.json');
		const packageConfig = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
		packageConfig.compilerOptions = {
			...packageConfig.compilerOptions,
			exactOptionalPropertyTypes: true,
			noUncheckedIndexedAccess: true,
		};
		writeJson(packagePath, packageConfig);

		const result = validateTypeScriptStrictnessPolicy(
			repoRoot,
			createTestPolicy({
				'examples/my-typia-block/tsconfig.json': {
					exactOptionalPropertyTypes: true,
					noUncheckedIndexedAccess: true,
				},
			}),
		);

		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});

	test('fails when a strictness exception is declared but not consumed', () => {
		const repoRoot = createStrictnessRepo();

		const result = validateTypeScriptStrictnessPolicy(
			repoRoot,
			createTestPolicy({
				'examples/my-typia-block/tsconfig.json': {
					noUncheckedIndexedAccess: true,
				},
			}),
		);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			'examples/my-typia-block/tsconfig.json declares a stale strictness exception for compilerOptions.noUncheckedIndexedAccess; remove the exception or restore the override.',
		);
	});
});
