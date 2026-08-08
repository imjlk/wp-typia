import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  collectTypeScriptImportFiles,
  evaluateTypeScriptRuntimePackagePolicy,
  sourceImportsTypeScriptAtRuntime,
  TYPESCRIPT_COMPILER_API_PACKAGE,
  TYPESCRIPT_DEPENDENCY_POLICY,
} from '../../scripts/lib/typescript-runtime-policy.mjs';

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs) {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
  tempDirs.length = 0;
});

describe('typescript-runtime-policy', () => {
	test('detects shipped runtime source imports of the TypeScript 6 compatibility package', () => {
		const importFiles = collectTypeScriptImportFiles(
			'packages/wp-typia-block-runtime',
			['src'],
		);

		expect(importFiles).toContain('src/metadata-analysis.ts');
		expect(importFiles).toContain('src/metadata-parser.ts');
		expect(importFiles).toContain('src/metadata-parser-symbols.ts');
		expect(importFiles).toContain('src/metadata-parser-tags.ts');
	});

	test('audits the project-tools lint config parser as a TS6 runtime island', () => {
		const importFiles = collectTypeScriptImportFiles(
			'packages/wp-typia-project-tools',
			['src/runtime'],
		);

		expect(importFiles).toContain(
			'src/runtime/shared/ttsc-lint-config.ts',
		);
	});

	test('detects side-effect imports but ignores type-only TypeScript imports', () => {
		expect(
			sourceImportsTypeScriptAtRuntime(
				`import "${TYPESCRIPT_COMPILER_API_PACKAGE}";`,
			),
		).toBe(true);
		expect(
			sourceImportsTypeScriptAtRuntime(
				`import type { SourceFile } from "${TYPESCRIPT_COMPILER_API_PACKAGE}";`,
			),
		).toBe(false);
		expect(
			sourceImportsTypeScriptAtRuntime(
				`import { type SourceFile } from "${TYPESCRIPT_COMPILER_API_PACKAGE}";`,
			),
		).toBe(false);
		expect(
			sourceImportsTypeScriptAtRuntime(
				`export type { SourceFile } from "${TYPESCRIPT_COMPILER_API_PACKAGE}";`,
			),
		).toBe(false);
		expect(
			sourceImportsTypeScriptAtRuntime(
				`export { type SourceFile } from "${TYPESCRIPT_COMPILER_API_PACKAGE}";`,
			),
		).toBe(false);
		expect(
			sourceImportsTypeScriptAtRuntime(
				`import ts = require("${TYPESCRIPT_COMPILER_API_PACKAGE}");`,
			),
		).toBe(true);
		expect(
			sourceImportsTypeScriptAtRuntime(
				`import type ts = require("${TYPESCRIPT_COMPILER_API_PACKAGE}");`,
			),
		).toBe(false);
	});

	test('ignores declaration-file variants when walking runtime roots', () => {
		const tempDir = fs.mkdtempSync(
			path.join(os.tmpdir(), 'wp-typia-typescript-runtime-policy-'),
		);
		tempDirs.push(tempDir);
		fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
		fs.writeFileSync(
			path.join(tempDir, 'src', 'runtime.d.mts'),
			`import "${TYPESCRIPT_COMPILER_API_PACKAGE}";\n`,
			'utf8',
		);
		fs.writeFileSync(
			path.join(tempDir, 'src', 'runtime.d.cts'),
			`import type { SourceFile } from "${TYPESCRIPT_COMPILER_API_PACKAGE}";\n`,
			'utf8',
		);

		const importFiles = collectTypeScriptImportFiles(tempDir, ['src']);

		expect(importFiles).toEqual([]);
	});

	test('fails when a runtime-critical package keeps typescript only in devDependencies', () => {
		const policy = {
			packageDir: 'packages/example-runtime',
			packageName: '@example/runtime',
			reason: 'its shipped runtime uses the TypeScript compiler API',
			requiredTypeScriptImportFiles: ['src/runtime.ts'],
			runtimeSourceRoots: ['src'],
			typescriptPlacement: TYPESCRIPT_DEPENDENCY_POLICY.dependency,
		};

		const result = evaluateTypeScriptRuntimePackagePolicy(policy, {
			packedManifest: {
				devDependencies: {
					[TYPESCRIPT_COMPILER_API_PACKAGE]: '6.0.2',
				},
			},
			sourceManifest: {
				devDependencies: {
					[TYPESCRIPT_COMPILER_API_PACKAGE]: '6.0.2',
				},
			},
			typeScriptImportFiles: ['src/runtime.ts'],
		});

		expect(result.errors).toContain(
			'@example/runtime must keep @typescript/typescript6 in dependencies because its shipped runtime uses the TypeScript compiler API. Found devDependencies in source package.json.',
		);
		expect(result.errors).toContain(
			'Packed @example/runtime manifest must keep @typescript/typescript6 in dependencies because its shipped runtime uses the TypeScript compiler API. Found devDependencies.',
		);
	});

	test('fails when required runtime TypeScript import evidence is stale', () => {
		const policy = {
			packageDir: 'packages/example-runtime',
			packageName: '@example/runtime',
			reason: 'its shipped runtime uses the TypeScript compiler API',
			requiredTypeScriptImportFiles: ['src/runtime.ts', 'src/metadata.ts'],
			runtimeSourceRoots: ['src'],
			typescriptPlacement: TYPESCRIPT_DEPENDENCY_POLICY.dependency,
		};

		const result = evaluateTypeScriptRuntimePackagePolicy(policy, {
			packedManifest: {
				dependencies: {
					[TYPESCRIPT_COMPILER_API_PACKAGE]: '6.0.2',
				},
			},
			sourceManifest: {
				dependencies: {
					[TYPESCRIPT_COMPILER_API_PACKAGE]: '6.0.2',
				},
			},
			typeScriptImportFiles: ['src/runtime.ts'],
		});

		expect(result.errors).toContain(
			'@example/runtime audit is stale: expected shipped runtime sources to import @typescript/typescript6 from src/metadata.ts.',
		);
	});

	test('fails when audited runtime import files grow beyond the expected set', () => {
		const policy = {
			packageDir: 'packages/example-runtime',
			packageName: '@example/runtime',
			reason: 'its shipped runtime uses the TypeScript compiler API',
			requiredTypeScriptImportFiles: ['src/runtime.ts'],
			runtimeSourceRoots: ['src'],
			typescriptPlacement: TYPESCRIPT_DEPENDENCY_POLICY.dependency,
		};

		const result = evaluateTypeScriptRuntimePackagePolicy(policy, {
			packedManifest: {
				dependencies: {
					[TYPESCRIPT_COMPILER_API_PACKAGE]: '6.0.2',
				},
			},
			sourceManifest: {
				dependencies: {
					[TYPESCRIPT_COMPILER_API_PACKAGE]: '6.0.2',
				},
			},
			typeScriptImportFiles: ['src/extra-runtime.ts', 'src/runtime.ts'],
		});

		expect(result.errors).toContain(
			'@example/runtime audit is stale: found additional shipped runtime sources importing @typescript/typescript6 from src/extra-runtime.ts.',
		);
	});

	test('fails when a non-runtime package lists typescript in dependencies', () => {
		const policy = {
			packageDir: 'packages/example-cli',
			packageName: '@example/cli',
			reason:
				'the published package does not import the TypeScript compiler API in shipped runtime sources',
			requiredTypeScriptImportFiles: [],
			runtimeSourceRoots: ['src'],
			typescriptPlacement: TYPESCRIPT_DEPENDENCY_POLICY.nonRuntime,
		};

		const result = evaluateTypeScriptRuntimePackagePolicy(policy, {
			packedManifest: {
				dependencies: {
					[TYPESCRIPT_COMPILER_API_PACKAGE]: '6.0.2',
				},
			},
			sourceManifest: {
				dependencies: {
					[TYPESCRIPT_COMPILER_API_PACKAGE]: '6.0.2',
				},
			},
			typeScriptImportFiles: [],
		});

		expect(result.errors).toContain(
			'@example/cli must not list @typescript/typescript6 in dependencies because the published package does not import the TypeScript compiler API in shipped runtime sources.',
		);
		expect(result.errors).toContain(
			'Packed @example/cli manifest must not list @typescript/typescript6 in dependencies because the published package does not import the TypeScript compiler API in shipped runtime sources.',
		);
	});

	test('fails when a non-runtime package starts importing typescript in shipped sources', () => {
		const policy = {
			packageDir: 'packages/example-client',
			packageName: '@example/client',
			reason: 'the published package does not import the TypeScript compiler API in shipped runtime sources',
			requiredTypeScriptImportFiles: [],
			runtimeSourceRoots: ['src'],
			typescriptPlacement: TYPESCRIPT_DEPENDENCY_POLICY.nonRuntime,
		};

		const result = evaluateTypeScriptRuntimePackagePolicy(policy, {
			packedManifest: {},
			sourceManifest: {
				devDependencies: {
					typescript: '7.0.2',
				},
			},
			typeScriptImportFiles: ['src/index.ts'],
		});

		expect(result.errors).toContain(
			'@example/client must not import the TypeScript compiler API in shipped runtime sources; found src/index.ts.',
		);
	});
});
