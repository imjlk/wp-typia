import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { runSyncBlockMetadata } from '../../packages/wp-typia-block-runtime/src/metadata-core';
import { createTempFixture } from '../helpers/file-fixtures';
import { getExampleShowcaseFixtureRoot } from './helpers/example-showcase';

function createFixture(files: Record<string, string>) {
  return createTempFixture(files, {
    baseDir: getExampleShowcaseFixtureRoot('.tmp-sync-types-reporting-fixtures'),
    prefix: 'fixture-',
  });
}

function createTypecheckFixture(typesSource: string) {
  return createFixture({
    'block.json': JSON.stringify(
      { attributes: {}, example: { attributes: {} } },
      null,
      2,
    ),
    'src/types.ts': typesSource,
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          resolveJsonModule: true,
          strict: true,
          target: 'ES2022',
        },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    ),
  });
}

async function runFixture(
	projectRoot: string,
	sourceTypeName: string,
	executionOptions?: Parameters<typeof runSyncBlockMetadata>[1],
) {
  return runSyncBlockMetadata(
    {
      blockJsonFile: 'block.json',
      manifestFile: 'typia.manifest.json',
      projectRoot,
      sourceTypeName,
      typesFile: 'src/types.ts',
    },
    executionOptions,
  );
}

describe('sync-types reporting', () => {
	afterAll(() => {
		const baseDir = getExampleShowcaseFixtureRoot('.tmp-sync-types-reporting-fixtures');
		fs.rmSync(baseDir, { force: true, recursive: true });
	});

	test('reports success when syncBlockMetadata finishes without warnings', async () => {
		const fixtureDir = createTypecheckFixture(
			[
				'import { tags } from "typia";',
				'',
				'export interface BlockAttributes {',
				'  title: string & tags.Default<"Hello world">;',
				'  enabled: boolean & tags.Default<true>;',
				'}',
				'',
			].join('\n'),
		);

		const report = await runFixture(fixtureDir, 'BlockAttributes');

		expect(report.status).toBe('success');
		expect(report.failure).toBeNull();
		expect(report.attributeNames).toEqual(['title', 'enabled']);
		expect(report.lossyProjectionWarnings).toEqual([]);
		expect(report.phpGenerationWarnings).toEqual([]);
		expect(report.blockJsonPath).toBe(path.join(fixtureDir, 'block.json'));
		expect(report.manifestPath).toBe(path.join(fixtureDir, 'typia.manifest.json'));
		expect(report.phpValidatorPath).toBe(path.join(fixtureDir, 'typia-validator.php'));
		expect(report.strict).toBe(false);
		expect(report.failOnLossy).toBe(false);
		expect(report.failOnPhpWarnings).toBe(false);
	});

	test('reports stale generated artifacts in check mode without rewriting files', async () => {
		const fixtureDir = createTypecheckFixture(
			[
				'export interface BlockAttributes {',
				'  title: "Hello";',
				'}',
				'',
			].join('\n'),
		);

		const originalBlockJson = fs.readFileSync(path.join(fixtureDir, 'block.json'), 'utf8');
		const report = await runFixture(fixtureDir, 'BlockAttributes', {
			check: true,
		});

		expect(report.status).toBe('error');
		expect(report.failure?.code).toBe('stale-generated-artifact');
		expect(report.failure?.message).toContain(path.join(fixtureDir, 'block.json'));
		expect(report.failure?.message).toContain(path.join(fixtureDir, 'typia.manifest.json'));
		expect(fs.readFileSync(path.join(fixtureDir, 'block.json'), 'utf8')).toBe(originalBlockJson);
		expect(fs.existsSync(path.join(fixtureDir, 'typia.manifest.json'))).toBe(false);
	});

	test('passes check mode after generated artifacts are already current', async () => {
		const fixtureDir = createTypecheckFixture(
			[
				'export interface BlockAttributes {',
				'  title: string;',
				'}',
				'',
			].join('\n'),
		);

		const initialReport = await runFixture(fixtureDir, 'BlockAttributes');
		expect(initialReport.status).toBe('success');

		const checkReport = await runFixture(fixtureDir, 'BlockAttributes', {
			check: true,
		});

		expect(checkReport.status).toBe('success');
		expect(checkReport.failure).toBeNull();
	});

	test('reports warning status for lossy WordPress projections by default', async () => {
		const fixtureDir = createTypecheckFixture(
			[
				'export interface BlockAttributes {',
				'  seo: {',
				'    slug: string;',
				'  };',
				'}',
				'',
			].join('\n'),
		);

		const report = await runFixture(fixtureDir, 'BlockAttributes');

		expect(report.status).toBe('warning');
		expect(report.failure).toBeNull();
		expect(report.lossyProjectionWarnings).toContain('BlockAttributes.seo: properties');
		expect(report.phpGenerationWarnings).toEqual([]);
	});

	test('reports PHP validator coverage warnings without failing by default', async () => {
		const fixtureDir = createTypecheckFixture(
			[
				'import { tags } from "typia";',
				'',
				'export interface BlockAttributes {',
				'  endpoint: string & tags.Format<"hostname">;',
				'}',
				'',
			].join('\n'),
		);

		const report = await runFixture(fixtureDir, 'BlockAttributes');

		expect(report.status).toBe('warning');
		expect(report.failure).toBeNull();
		expect(report.phpGenerationWarnings).toContain(
			'endpoint: unsupported PHP validator format "hostname"',
		);
	});

	test('strict mode promotes all warnings to an error status', async () => {
		const fixtureDir = createTypecheckFixture(
			[
				'import { tags } from "typia";',
				'',
				'export interface BlockAttributes {',
				'  seo: {',
				'    slug: string & tags.MinLength<1>;',
				'  };',
				'  endpoint: string & tags.Format<"hostname">;',
				'}',
				'',
			].join('\n'),
		);

		const report = await runFixture(fixtureDir, 'BlockAttributes', {
			strict: true,
		});

		expect(report.status).toBe('error');
		expect(report.failure).toBeNull();
		expect(report.strict).toBe(true);
		expect(report.failOnLossy).toBe(true);
		expect(report.failOnPhpWarnings).toBe(true);
		expect(report.lossyProjectionWarnings.length).toBeGreaterThan(0);
		expect(report.phpGenerationWarnings.length).toBeGreaterThan(0);
	});

	test('failOnLossy only fails lossy projection warnings', async () => {
		const fixtureDir = createTypecheckFixture(
			[
				'export interface BlockAttributes {',
				'  items: Array<{',
				'    label: string;',
				'  }>;',
				'}',
				'',
			].join('\n'),
		);

		const report = await runFixture(fixtureDir, 'BlockAttributes', {
			failOnLossy: true,
		});

		expect(report.status).toBe('error');
		expect(report.failure).toBeNull();
		expect(report.failOnLossy).toBe(true);
		expect(report.failOnPhpWarnings).toBe(false);
		expect(report.lossyProjectionWarnings).toContain('BlockAttributes.items: items');
	});

	test('normalizes unsupported type nodes into structured failures', async () => {
		const fixtureDir = createTypecheckFixture(
			[
				'export interface BlockAttributes {',
				'  token: symbol;',
				'}',
				'',
			].join('\n'),
		);

		const report = await runFixture(fixtureDir, 'BlockAttributes');

		expect(report.status).toBe('error');
		expect(report.failure).toEqual({
			code: 'unsupported-type-node',
			message: 'Unsupported type node at BlockAttributes.token: symbol',
			name: 'Error',
		});
	});

	test('normalizes missing source types into structured failures', async () => {
		const fixtureDir = createTypecheckFixture(
			[
				'export interface DifferentAttributes {',
				'  title: string;',
				'}',
				'',
			].join('\n'),
		);

		const report = await runFixture(fixtureDir, 'BlockAttributes');

		expect(report.status).toBe('error');
		expect(report.failure?.code).toBe('invalid-source-type');
		expect(report.failure?.message).toContain(
			'Unable to find source type "BlockAttributes"',
		);
	});

	test('unrolls recursive types to the configured depth instead of failing', async () => {
		const fixtureDir = createTypecheckFixture(
			[
				'interface TreeNode {',
				'  next?: TreeNode;',
				'}',
				'',
				'export interface BlockAttributes {',
				'  tree: TreeNode;',
				'}',
				'',
			].join('\n'),
		);

		const report = await runFixture(fixtureDir, 'BlockAttributes');

		expect(report.status).not.toBe('error');
		expect(report.failure).toBeNull();
	});

	test('normalizes TypeScript diagnostics into structured failures', async () => {
		const fixtureDir = createTypecheckFixture(
			[
				'import type { MissingType } from "./missing";',
				'',
				'export interface BlockAttributes {',
				'  item: MissingType;',
				'}',
				'',
			].join('\n'),
		);

		const report = await runFixture(fixtureDir, 'BlockAttributes');

		expect(report.status).toBe('error');
		expect(report.failure?.code).toBe('typescript-diagnostic');
		expect(report.failure?.message).toContain("Cannot find module './missing'");
	});

	test('normalizes imported local TypeScript diagnostics into structured failures', async () => {
		const fixtureDir = createFixture({
			'block.json': JSON.stringify(
				{ attributes: {}, example: { attributes: {} } },
				null,
				2,
			),
			'src/helper.ts': [
				'import type { MissingType } from "./missing";',
				'',
				'export interface ImportedHelper {',
				'  item: MissingType;',
				'}',
				'',
			].join('\n'),
			'src/types.ts': [
				'import type { ImportedHelper } from "./helper";',
				'',
				'export interface BlockAttributes {',
				'  helper: ImportedHelper;',
				'}',
				'',
			].join('\n'),
			'tsconfig.json': JSON.stringify(
				{
					compilerOptions: {
						module: 'NodeNext',
						moduleResolution: 'NodeNext',
						resolveJsonModule: true,
						strict: true,
						target: 'ES2022',
					},
					include: ['src/**/*.ts'],
				},
				null,
				2,
			),
		});

		const report = await runFixture(fixtureDir, 'BlockAttributes');

		expect(report.status).toBe('error');
		expect(report.failure?.code).toBe('typescript-diagnostic');
		expect(report.failure?.message).toContain("Cannot find module './missing'");
	});
});
