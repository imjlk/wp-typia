import { afterAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  inferPackageManagerId,
  parsePackageManagerField,
} from '../src/runtime/package-managers.js';
import { detectPackageManagerId } from '../src/runtime/migration-utils.js';

const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'wp-typia-package-managers-'),
);

function writeProjectFixture(options: {
  files?: string[];
  name: string;
  packageManager?: string;
}): string {
  const projectDir = path.join(tempRoot, options.name);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
		path.join(projectDir, 'package.json'),
		`${JSON.stringify(
			{
				name: options.name,
				...(options.packageManager
					? { packageManager: options.packageManager }
					: {}),
			},
			null,
			2,
		)}\n`,
		'utf8',
	);
  for (const file of options.files ?? []) {
    fs.writeFileSync(path.join(projectDir, file), '', 'utf8');
  }
  return projectDir;
}

afterAll(() => {
  fs.rmSync(tempRoot, { force: true, recursive: true });
});

describe('package manager inference', () => {
	test('parses supported packageManager fields', () => {
		expect(parsePackageManagerField('bun@1.3.11')).toBe('bun');
		expect(parsePackageManagerField('npm@11.6.1')).toBe('npm');
		expect(parsePackageManagerField('pnpm@8.3.1')).toBe('pnpm');
		expect(parsePackageManagerField('yarn@3.2.4')).toBe('yarn');
		expect(parsePackageManagerField('deno@2.0.0')).toBeNull();
		expect(parsePackageManagerField(undefined)).toBeNull();
	});

	test('prefers the packageManager field over lockfile signals', () => {
		const projectDir = writeProjectFixture({
			files: ['pnpm-lock.yaml'],
			name: 'field-wins',
			packageManager: 'bun@1.3.11',
		});

		expect(inferPackageManagerId(projectDir)).toBe('bun');
	});

	test('detects Yarn PnP markers as Yarn', () => {
		const cjsProjectDir = writeProjectFixture({
			files: ['.pnp.cjs'],
			name: 'yarn-pnp-cjs',
		});
		const loaderProjectDir = writeProjectFixture({
			files: ['.pnp.loader.mjs'],
			name: 'yarn-pnp-loader',
		});

		expect(inferPackageManagerId(cjsProjectDir)).toBe('yarn');
		expect(inferPackageManagerId(loaderProjectDir)).toBe('yarn');
	});

	test('detects npm lockfiles as npm', () => {
		const lockProjectDir = writeProjectFixture({
			files: ['package-lock.json'],
			name: 'npm-lock',
		});
		const shrinkwrapProjectDir = writeProjectFixture({
			files: ['npm-shrinkwrap.json'],
			name: 'npm-shrinkwrap',
		});

		expect(inferPackageManagerId(lockProjectDir)).toBe('npm');
		expect(inferPackageManagerId(shrinkwrapProjectDir)).toBe('npm');
	});

	test('detects bun, pnpm, and yarn lockfile signals', () => {
		expect(
			inferPackageManagerId(
				writeProjectFixture({ files: ['bun.lock'], name: 'bun-lock' }),
			),
		).toBe('bun');
		expect(
			inferPackageManagerId(
				writeProjectFixture({
					files: ['pnpm-lock.yaml'],
					name: 'pnpm-lock',
				}),
			),
		).toBe('pnpm');
		expect(
			inferPackageManagerId(
				writeProjectFixture({ files: ['yarn.lock'], name: 'yarn-lock' }),
			),
		).toBe('yarn');
	});

	test('falls back to npm when no package-manager signal exists', () => {
		const projectDir = writeProjectFixture({ name: 'fallback-npm' });

		expect(inferPackageManagerId(projectDir)).toBe('npm');
	});

	test('keeps migration helper fallback aligned with shared inference', () => {
		const npmProjectDir = writeProjectFixture({
			files: ['package-lock.json'],
			name: 'migration-npm-lock',
		});
		const pnpProjectDir = writeProjectFixture({
			files: ['.pnp.cjs'],
			name: 'migration-yarn-pnp',
		});

		expect(detectPackageManagerId(npmProjectDir)).toBe('npm');
		expect(detectPackageManagerId(pnpProjectDir)).toBe('yarn');
	});
});
