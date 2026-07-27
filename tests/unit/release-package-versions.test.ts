import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  collectReleasePackageVersions,
  renderReleasePackageVersionBlock,
} from '../../scripts/render-release-package-versions.mjs';
import { createTempDir, writeJsonFile } from '../helpers/file-fixtures';

let tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs) {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
  tempDirs = [];
});

function runGit(repoRoot: string, args: string[]): string {
  return execFileSync('git', args, {
		cwd: repoRoot,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
}

function createTempGitRepo(): string {
  const repoRoot = createTempDir('wp-typia-release-package-versions-');
  tempDirs.push(repoRoot);

  runGit(repoRoot, ['init']);
  runGit(repoRoot, ['config', 'user.name', 'Codex']);
  runGit(repoRoot, ['config', 'user.email', 'codex@example.com']);

  return repoRoot;
}

describe('render-release-package-versions', () => {
	test('collects only publishable package version changes relative to a base ref', () => {
		const repoRoot = createTempGitRepo();

		writeJsonFile(path.join(repoRoot, 'packages', 'public-alpha', 'package.json'), {
			name: '@wp-typia/public-alpha',
			version: '1.0.0',
		});
		writeJsonFile(path.join(repoRoot, 'packages', 'public-beta', 'package.json'), {
			name: '@wp-typia/public-beta',
			version: '2.0.0',
			description: 'baseline',
		});
		writeJsonFile(path.join(repoRoot, 'packages', 'private-helper', 'package.json'), {
			name: '@wp-typia/private-helper',
			private: true,
			version: '0.1.0',
		});

		runGit(repoRoot, ['add', '.']);
		runGit(repoRoot, ['commit', '-m', 'baseline']);

		writeJsonFile(path.join(repoRoot, 'packages', 'public-alpha', 'package.json'), {
			name: '@wp-typia/public-alpha',
			version: '1.1.0',
		});
		writeJsonFile(path.join(repoRoot, 'packages', 'public-beta', 'package.json'), {
			name: '@wp-typia/public-beta',
			version: '2.0.0',
			description: 'metadata-only change',
		});
		writeJsonFile(path.join(repoRoot, 'packages', 'private-helper', 'package.json'), {
			name: '@wp-typia/private-helper',
			private: true,
			version: '0.2.0',
		});

		expect(collectReleasePackageVersions({ repoRoot, baseRef: 'HEAD' })).toEqual([
			{
				packageDir: 'packages/public-alpha',
				packageName: '@wp-typia/public-alpha',
				previousVersion: '1.0.0',
				nextVersion: '1.1.0',
			},
		]);
	});

	test('renders previous-to-next versions and new package entries', () => {
		expect(
			renderReleasePackageVersionBlock([
				{
					packageDir: 'packages/public-alpha',
					packageName: '@wp-typia/public-alpha',
					previousVersion: '1.0.0',
					nextVersion: '1.1.0',
				},
				{
					packageDir: 'packages/public-gamma',
					packageName: '@wp-typia/public-gamma',
					previousVersion: null,
					nextVersion: '0.1.0',
				},
			]),
		).toBe(
			[
				'## Published package versions',
				'',
				'| Package | Version |',
				'| --- | --- |',
				'| `@wp-typia/public-alpha` | `1.0.0 -> 1.1.0` |',
				'| `@wp-typia/public-gamma` | `new at 0.1.0` |',
			].join('\n'),
		);
	});
});
