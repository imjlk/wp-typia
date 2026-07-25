import { afterAll, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  cleanupScaffoldTempRoot,
  createScaffoldTempRoot,
} from './helpers/scaffold-test-harness.js';
import {
  DEFAULT_SCAFFOLD_REPOSITORY_REFERENCE,
  replaceRepositoryReferencePlaceholders,
  resolveScaffoldRepositoryReference,
} from '../src/runtime/scaffold-repository-reference.js';

const tempRoot = createScaffoldTempRoot(
  'wp-typia-scaffold-repository-reference-',
);

afterAll(() => {
  cleanupScaffoldTempRoot(tempRoot);
});

test('resolveScaffoldRepositoryReference reads GitHub repository metadata from package manifests', () => {
	const manifestPath = path.join(tempRoot, 'fork-package.json');
	fs.writeFileSync(
		manifestPath,
		JSON.stringify({
			repository: {
				type: 'git',
				url: 'git+https://github.com/fork-owner/fork-typia.git',
			},
		}),
		'utf8',
	);

	expect(
		resolveScaffoldRepositoryReference({
			manifestPaths: [manifestPath],
		}),
	).toBe('fork-owner/fork-typia');
});

test('resolveScaffoldRepositoryReference falls back to the upstream default when manifests do not define a GitHub repository', () => {
	const manifestPath = path.join(tempRoot, 'invalid-package.json');
	fs.writeFileSync(
		manifestPath,
		JSON.stringify({
			repository: {
				type: 'git',
				url: 'https://example.com/not-github.git',
			},
		}),
		'utf8',
	);

	expect(
		resolveScaffoldRepositoryReference({
			manifestPaths: [manifestPath],
		}),
	).toBe(DEFAULT_SCAFFOLD_REPOSITORY_REFERENCE);
});

test('resolveScaffoldRepositoryReference prefers the first manifest path that yields a GitHub repository', () => {
	const upstreamManifestPath = path.join(tempRoot, 'upstream-package.json');
	const forkManifestPath = path.join(tempRoot, 'fork-priority-package.json');
	fs.writeFileSync(
		upstreamManifestPath,
		JSON.stringify({
			repository: {
				type: 'git',
				url: 'git+https://github.com/upstream/wp-typia.git',
			},
		}),
		'utf8',
	);
	fs.writeFileSync(
		forkManifestPath,
		JSON.stringify({
			repository: {
				type: 'git',
				url: 'git+https://github.com/fork-owner/fork-typia.git',
			},
		}),
		'utf8',
	);

	expect(
		resolveScaffoldRepositoryReference({
			manifestPaths: [forkManifestPath, upstreamManifestPath],
		}),
	).toBe('fork-owner/fork-typia');
});

test('resolveScaffoldRepositoryReference parses npm github shorthands', () => {
	const manifestPath = path.join(tempRoot, 'github-shorthand-package.json');
	fs.writeFileSync(
		manifestPath,
		JSON.stringify({
			repository: 'github:fork-owner/fork-typia#main',
		}),
		'utf8',
	);

	expect(
		resolveScaffoldRepositoryReference({
			manifestPaths: [manifestPath],
		}),
	).toBe('fork-owner/fork-typia');
});

test('resolveScaffoldRepositoryReference ignores non-github hosts that merely contain github.com', () => {
	const manifestPath = path.join(tempRoot, 'not-github-host-package.json');
	fs.writeFileSync(
		manifestPath,
		JSON.stringify({
			repository: {
				type: 'git',
				url: 'https://notgithub.com/fork-owner/fork-typia.git',
			},
		}),
		'utf8',
	);

	expect(
		resolveScaffoldRepositoryReference({
			manifestPaths: [manifestPath],
		}),
	).toBe(DEFAULT_SCAFFOLD_REPOSITORY_REFERENCE);
});

test('replaceRepositoryReferencePlaceholders rewrites both legacy scaffold repository placeholders', () => {
	const source = [
		'https://github.com/yourusername/wp-typia-boilerplate/issues',
		'CLI: yourusername/wp-typia',
	].join('\n');

	expect(
		replaceRepositoryReferencePlaceholders(
			source,
			'fork-owner/fork-typia',
		),
	).toBe(
		[
			'https://github.com/fork-owner/fork-typia/issues',
			'CLI: fork-owner/fork-typia',
		].join('\n'),
	);
});
