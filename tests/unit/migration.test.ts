import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import { syncBlockMetadata } from '../../scripts/lib/typia-metadata-core';
import { createTempFixture } from '../helpers/file-fixtures';
import { getExampleShowcaseFixtureRoot } from './helpers/example-showcase';

function createFixture(files: Record<string, string>) {
  return createTempFixture(files, {
    baseDir: getExampleShowcaseFixtureRoot('.tmp-metadata-fixtures-errors'),
    prefix: 'fixture-',
  });
}

describe('Typia metadata generator failure modes', () => {
  afterAll(() => {
    const baseDir = getExampleShowcaseFixtureRoot('.tmp-metadata-fixtures-errors');
    fs.rmSync(baseDir, { force: true, recursive: true });
  });

  test('rejects external non-serializable types', async () => {
    const fixtureDir = createFixture({
      'block.json': JSON.stringify({ attributes: {} }, null, 2),
      'src/types.ts': `import { tags } from "typia";

export interface BlockAttributes {
  registry: Map<string, string>;
  title: string & tags.Default<"hello">;
}
`,
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          target: 'ES2022',
        },
        include: ['src/**/*.ts'],
      }, null, 2),
    });

    await expect(syncBlockMetadata({
      blockJsonFile: 'block.json',
      manifestFile: 'typia.manifest.json',
      projectRoot: fixtureDir,
      sourceTypeName: 'BlockAttributes',
      typesFile: 'src/types.ts',
    })).rejects.toThrow(/not supported/i);
  });

  test('unrolls recursive types instead of rejecting them', async () => {
    const fixtureDir = createFixture({
      'block.json': JSON.stringify({ attributes: {} }, null, 2),
      'src/types.ts': `export interface RecursiveNode {
  child?: RecursiveNode;
}

export interface BlockAttributes {
  tree: RecursiveNode;
}
`,
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          target: 'ES2022',
        },
        include: ['src/**/*.ts'],
      }, null, 2),
    });

    const result = await syncBlockMetadata({
      blockJsonFile: 'block.json',
      manifestFile: 'typia.manifest.json',
      projectRoot: fixtureDir,
      sourceTypeName: 'BlockAttributes',
      typesFile: 'src/types.ts',
    });

    expect(result.attributeNames).toContain('tree');
  });
});
