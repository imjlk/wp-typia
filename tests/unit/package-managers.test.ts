import { describe, expect, test } from 'bun:test';

import {
  PACKAGE_MANAGER_IDS,
  PACKAGE_MANAGERS,
  formatPackageExecCommand,
  formatInstallCommand,
  formatRunScript,
  getPackageManager,
  getPackageManagerSelectOptions,
  transformPackageManagerText,
  type PackageManagerId,
} from '../../packages/wp-typia-project-tools/src/runtime/package-managers';

describe('package manager runtime helpers', () => {
	test('returns stable definitions and select options for every supported package manager', () => {
		expect(PACKAGE_MANAGER_IDS).toEqual(['bun', 'npm', 'pnpm', 'yarn']);
		expect(Object.keys(PACKAGE_MANAGERS)).toEqual(PACKAGE_MANAGER_IDS);
		expect(getPackageManagerSelectOptions()).toEqual([
			{ hint: 'bun install', label: 'Bun', value: 'bun' },
			{ hint: 'npm install --no-audit', label: 'npm', value: 'npm' },
			{ hint: 'pnpm install', label: 'pnpm', value: 'pnpm' },
			{ hint: 'yarn install', label: 'Yarn', value: 'yarn' },
		]);
	});

	test('throws a helpful error for unknown package managers', () => {
		expect(() => getPackageManager('pip')).toThrow(
			'Unknown package manager "pip". Expected one of: bun, npm, pnpm, yarn',
		);
	});

	test('formats run and install commands per package manager', () => {
		const expectations: Record<PackageManagerId, { install: string; run: string; runWithArgs: string }> = {
			bun: {
				install: 'bun install',
				run: 'bun run sync-types',
				runWithArgs: 'bun run sync-types --strict --report json',
			},
			npm: {
				install: 'npm install --no-audit',
				run: 'npm run sync-types',
				runWithArgs: 'npm run sync-types -- --strict --report json',
			},
			pnpm: {
				install: 'pnpm install',
				run: 'pnpm run sync-types',
				runWithArgs: 'pnpm run sync-types --strict --report json',
			},
			yarn: {
				install: 'yarn install',
				run: 'yarn run sync-types',
				runWithArgs: 'yarn run sync-types --strict --report json',
			},
		};

		for (const managerId of PACKAGE_MANAGER_IDS) {
			expect(formatInstallCommand(managerId)).toBe(expectations[managerId].install);
			expect(formatRunScript(managerId, 'sync-types')).toBe(expectations[managerId].run);
			expect(
				formatRunScript(managerId, 'sync-types', '--strict --report json'),
			).toBe(expectations[managerId].runWithArgs);
		}
	});

	test('formats one-off package execution commands per package manager', () => {
		expect(formatPackageExecCommand('bun', 'wp-typia@0.10.1', 'migrate init')).toBe(
			'bunx wp-typia@0.10.1 migrate init',
		);
		expect(formatPackageExecCommand('npm', 'wp-typia@0.10.1', 'migrate init')).toBe(
			'npx --yes wp-typia@0.10.1 migrate init',
		);
		expect(formatPackageExecCommand('pnpm', 'wp-typia@0.10.1', 'migrate init')).toBe(
			'pnpm dlx wp-typia@0.10.1 migrate init',
		);
		expect(formatPackageExecCommand('yarn', 'wp-typia@0.10.1', 'migrate init')).toBe(
			'yarn dlx wp-typia@0.10.1 migrate init',
		);
	});

	test('transforms bun-oriented install and run text without touching embedded substrings', () => {
		const content = [
			'bun install&&bun run sync-types --strict||bun add -d @types/node;',
			'`bun run lint`, bun install --frozen-lockfile.',
			'postbun run should stay untouched.',
		].join(' ');

		expect(transformPackageManagerText(content, 'npm')).toBe(
			[
				'npm install --no-audit && npm run sync-types -- --strict || npm install --save-dev @types/node;',
				'`npm run lint`, npm ci.',
				'postbun run should stay untouched.',
			].join(' '),
		);
	});

	test('keeps bun text stable when no transformation is required', () => {
		const content = 'bun install && bun run build && bun add -d prettier';

		expect(transformPackageManagerText(content, 'bun')).toBe(content);
	});
});
