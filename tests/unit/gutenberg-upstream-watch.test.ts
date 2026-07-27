import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildSearchQuery,
  collectLocalDependencyPins,
  evaluateBlocksVersionDrift,
  extractDependencySpec,
  parseArgs,
  renderWatchReport,
} from '../../scripts/gutenberg-upstream-watch.mjs';

let tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}

describe('gutenberg-upstream-watch helpers', () => {
	test('buildSearchQuery scopes searches to Gutenberg, type area, and lookback date', () => {
		const query = buildSearchQuery(
			{
				issueTerms: ['"@wordpress/blocks"', 'registerBlockType'],
			},
			'pr',
			'2026-04-01',
		);

		expect(query).toContain('repo:WordPress/gutenberg');
		expect(query).toContain('is:pr');
		expect(query).toContain('updated:>=2026-04-01');
		expect(query).toContain('"@wordpress/blocks" OR registerBlockType');
	});

	test('extractDependencySpec reads package pins from package.json-like text', () => {
		expect(
			extractDependencySpec(
				'{ "@wordpress/blocks": "^15.2.0", "@wordpress/data": "^12.0.0" }',
				'@wordpress/blocks',
			),
		).toBe('^15.2.0');
		expect(extractDependencySpec('{ "name": "demo" }', '@wordpress/blocks')).toBeNull();
	});

	test('collectLocalDependencyPins gathers dependency specs from tracked files', () => {
		const repoRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), 'wp-typia-gutenberg-watch-'),
		);
		tempDirs.push(repoRoot);

		writeText(
			path.join(repoRoot, 'templates/a/package.json.mustache'),
			'{ "@wordpress/blocks": "^15.2.0" }\n',
		);
		writeText(
			path.join(repoRoot, 'templates/b/package.json.mustache'),
			'{ "@wordpress/blocks": "^15.3.0" }\n',
		);

		expect(
			collectLocalDependencyPins(repoRoot, '@wordpress/blocks', [
				'templates/a/package.json.mustache',
				'templates/b/package.json.mustache',
				'templates/missing/package.json.mustache',
			]),
		).toEqual([
			{ path: 'templates/a/package.json.mustache', spec: '^15.2.0' },
			{ path: 'templates/b/package.json.mustache', spec: '^15.3.0' },
		]);
	});

	test('evaluateBlocksVersionDrift compares the canonical local spec against Gutenberg trunk', () => {
		expect(evaluateBlocksVersionDrift('^15.2.0', '15.2.0')).toEqual({
			expectedSpec: '^15.2.0',
			hasDrift: false,
			localSpec: '^15.2.0',
			upstreamVersion: '15.2.0',
		});

		expect(evaluateBlocksVersionDrift('^15.2.0', '15.3.0').hasDrift).toBe(true);
	});

	test('parseArgs clamps max-results to the GitHub Search per_page limit', () => {
		expect(parseArgs(['--max-results', '250']).maxResultsPerQuery).toBe(100);
	});

	test('renderWatchReport includes version drift, tracked areas, and follow-up guidance', () => {
		const markdown = renderWatchReport({
			areaActivity: [
				{
					id: 'blocks-registration',
					issues: [],
					pullRequests: [
						{
							number: 76312,
							state: 'closed',
							title: 'Tighten Gutenberg block typing',
							updatedAt: '2026-04-14T10:00:00Z',
							url: 'https://github.com/WordPress/gutenberg/pull/76312',
						},
					],
					title: 'Block registration types',
				},
			],
			blocksVersionDrift: evaluateBlocksVersionDrift('^15.2.0', '15.3.0'),
			cadence: 'weekly',
			generatedAt: '2026-04-15T00:00:00.000Z',
			issueNumber: 283,
			localBlockEditorPinsSummary: {
				allAligned: true,
				uniqueSpecs: ['^15.2.0'],
			},
			localBlocksBaseline: {
				owner: 'scripts/validate-package-manifest-policy.mjs',
				spec: '^15.2.0',
			},
			localBlocksPinsSummary: {
				allAligned: true,
				uniqueSpecs: ['^15.2.0'],
			},
			lookbackDays: 14,
			sinceDate: '2026-04-01',
			upstreamPackageVersions: [
				{
					name: '@wordpress/blocks',
					path: 'packages/blocks/package.json',
					version: '15.3.0',
				},
				{
					name: '@wordpress/block-editor',
					path: 'packages/block-editor/package.json',
					version: '15.3.0',
				},
				{
					name: '@wordpress/data',
					path: 'packages/data/package.json',
					version: '13.0.0',
				},
			],
		});

		expect(markdown).toContain('# Gutenberg Upstream TypeScript Watch');
		expect(markdown).toContain('Version drift detected');
		expect(markdown).toContain('Block registration types');
		expect(markdown).toContain('Tighten Gutenberg block typing');
		expect(markdown).toContain('Follow-up path');
		expect(markdown).toContain('issue #283');
	});
});
