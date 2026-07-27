import { afterAll, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { syncBlockMetadata } from '../../scripts/lib/typia-metadata-core';
import { createTempFixture, hasPhpBinary } from '../helpers/file-fixtures';
import { getExampleShowcaseFixtureRoot } from './helpers/example-showcase';

function createFixture(files: Record<string, string>) {
  return createTempFixture(files, {
    baseDir: getExampleShowcaseFixtureRoot('.tmp-metadata-fixtures'),
    prefix: 'fixture-',
  });
}

function escapePhpSingleQuotedString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildPhpValidatorRequireSource(phpValidatorPath: string): string {
  return [
    "if (!defined('ABSPATH')) { define('ABSPATH', '/tmp/wp-typia-test/'); }",
    `$validator = require '${escapePhpSingleQuotedString(phpValidatorPath)}';`,
  ].join(' ');
}

describe('Typia metadata generator', () => {
  afterAll(() => {
    const baseDir = getExampleShowcaseFixtureRoot('.tmp-metadata-fixtures');
    fs.rmSync(baseDir, { force: true, recursive: true });
  });

  test('preserves imported nested constraints in typia.manifest while keeping block.json minimal', async () => {
    const fixtureDir = createFixture({
      'block.json': JSON.stringify(
        { attributes: {}, example: { attributes: {} } },
        null,
        2,
      ),
      'src/shared.ts': `import { tags } from "typia";

export interface SeoSettings {
  slug: string & tags.Pattern<"^[a-z0-9-]+$">;
  canonicalUrl?: string & tags.Format<"uri">;
}
`,
      'src/types.ts': `import { tags } from "typia";
import type { SeoSettings } from "./shared";

export interface BlockAttributes {
  variant: ("hero" | "inline") & tags.Default<"hero">;
  seo: SeoSettings;
  items: Array<{
    label: string & tags.MinLength<1>;
  }>;
}
`,
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

    const result = await syncBlockMetadata({
      blockJsonFile: 'block.json',
      manifestFile: 'typia.manifest.json',
      projectRoot: fixtureDir,
      sourceTypeName: 'BlockAttributes',
      typesFile: 'src/types.ts',
    });

    const blockJson = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'block.json'), 'utf8'),
    );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'typia.manifest.json'), 'utf8'),
    );

    expect(blockJson.attributes.variant.enum).toEqual(['hero', 'inline']);
    expect(blockJson.attributes.seo).toEqual({
      type: 'object',
    });
    expect(blockJson.attributes.items).toEqual({
      type: 'array',
    });

    expect(manifest.attributes.seo.ts.kind).toBe('object');
    expect(
      manifest.attributes.seo.ts.properties.slug.typia.constraints.pattern,
    ).toBe('^[a-z0-9-]+$');
    expect(
      manifest.attributes.seo.ts.properties.canonicalUrl.typia.constraints
        .format,
    ).toBe('uri');
    expect(
      manifest.attributes.items.ts.items.ts.properties.label.typia.constraints
        .minLength,
    ).toBe(1);
    expect(result.lossyProjectionWarnings).toContain(
      'BlockAttributes.items: items',
    );
    expect(result.lossyProjectionWarnings).toContain(
      'BlockAttributes.seo: properties',
    );
  });

  test('projects source and selector tags into block.json and typia.manifest.json', async () => {
    const fixtureDir = createFixture({
      'block.json': JSON.stringify(
        { attributes: {}, example: { attributes: {} } },
        null,
        2,
      ),
      'src/types.ts': `import { tags } from "typia";

export interface BlockAttributes {
  htmlContent: string & tags.Source<"html"> & tags.Selector<".wp-block-demo__html">;
  textContent: string & tags.Source<"text"> & tags.Selector<".wp-block-demo__text">;
  richContent: string & tags.Source<"rich-text"> & tags.Selector<".wp-block-demo__rich">;
}
`,
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

    const result = await syncBlockMetadata({
      blockJsonFile: 'block.json',
      manifestFile: 'typia.manifest.json',
      projectRoot: fixtureDir,
      sourceTypeName: 'BlockAttributes',
      typesFile: 'src/types.ts',
    });

    const blockJson = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'block.json'), 'utf8'),
    );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'typia.manifest.json'), 'utf8'),
    );

    expect(blockJson.attributes.htmlContent).toEqual({
      selector: '.wp-block-demo__html',
      source: 'html',
      type: 'string',
    });
    expect(blockJson.attributes.textContent).toEqual({
      selector: '.wp-block-demo__text',
      source: 'text',
      type: 'string',
    });
    expect(blockJson.attributes.richContent).toEqual({
      selector: '.wp-block-demo__rich',
      source: 'rich-text',
      type: 'string',
    });

    expect(manifest.attributes.htmlContent.wp.source).toBe('html');
    expect(manifest.attributes.htmlContent.wp.selector).toBe(
      '.wp-block-demo__html',
    );
    expect(manifest.attributes.textContent.wp.source).toBe('text');
    expect(manifest.attributes.textContent.wp.selector).toBe(
      '.wp-block-demo__text',
    );
    expect(manifest.attributes.richContent.wp.source).toBe('rich-text');
    expect(manifest.attributes.richContent.wp.selector).toBe(
      '.wp-block-demo__rich',
    );
    expect(result.lossyProjectionWarnings).toEqual([]);
  });

  test('rejects selector tags without a matching source tag', async () => {
    const fixtureDir = createFixture({
      'block.json': JSON.stringify(
        { attributes: {}, example: { attributes: {} } },
        null,
        2,
      ),
      'src/types.ts': `import { tags } from "typia";

export interface BlockAttributes {
  content: string & tags.Selector<".wp-block-demo__content">;
}
`,
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

    await expect(
      syncBlockMetadata({
        blockJsonFile: 'block.json',
        manifestFile: 'typia.manifest.json',
        projectRoot: fixtureDir,
        sourceTypeName: 'BlockAttributes',
        typesFile: 'src/types.ts',
      }),
    ).rejects.toThrow(
      'WordPress extraction tags require both Source and Selector at BlockAttributes.content',
    );
  });

  test('rejects source tags without a matching selector tag', async () => {
    const fixtureDir = createFixture({
      'block.json': JSON.stringify(
        { attributes: {}, example: { attributes: {} } },
        null,
        2,
      ),
      'src/types.ts': `import { tags } from "typia";

export interface BlockAttributes {
  content: string & tags.Source<"html">;
}
`,
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

    await expect(
      syncBlockMetadata({
        blockJsonFile: 'block.json',
        manifestFile: 'typia.manifest.json',
        projectRoot: fixtureDir,
        sourceTypeName: 'BlockAttributes',
        typesFile: 'src/types.ts',
      }),
    ).rejects.toThrow(
      'WordPress extraction tags require both Source and Selector at BlockAttributes.content',
    );
  });

  test('rejects unsupported source literals', async () => {
    const fixtureDir = createFixture({
      'block.json': JSON.stringify(
        { attributes: {}, example: { attributes: {} } },
        null,
        2,
      ),
      'src/types.ts': `import { tags } from "typia";

export interface BlockAttributes {
  content: string & tags.Source<"attribute"> & tags.Selector<".wp-block-demo__content">;
}
`,
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

    await expect(
      syncBlockMetadata({
        blockJsonFile: 'block.json',
        manifestFile: 'typia.manifest.json',
        projectRoot: fixtureDir,
        sourceTypeName: 'BlockAttributes',
        typesFile: 'src/types.ts',
      }),
    ).rejects.toThrow(
      /Type '"attribute"' does not satisfy the constraint '(?:WpTypiaSourceValue|"html" \| "text" \| "rich-text")'\./u,
    );
  });

  test('rejects source and selector tags on non-string attributes', async () => {
    const fixtureDir = createFixture({
      'block.json': JSON.stringify(
        { attributes: {}, example: { attributes: {} } },
        null,
        2,
      ),
      'src/types.ts': `import { tags } from "typia";

export interface BlockAttributes {
  count: number & tags.Source<"text"> & tags.Selector<".wp-block-demo__count">;
}
`,
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

    await expect(
      syncBlockMetadata({
        blockJsonFile: 'block.json',
        manifestFile: 'typia.manifest.json',
        projectRoot: fixtureDir,
        sourceTypeName: 'BlockAttributes',
        typesFile: 'src/types.ts',
      }),
    ).rejects.toThrow(
      'WordPress extraction tags are only supported on string attributes at BlockAttributes.count',
    );
  });

  test('rejects source and selector tags on nested properties', async () => {
    const fixtureDir = createFixture({
      'block.json': JSON.stringify(
        { attributes: {}, example: { attributes: {} } },
        null,
        2,
      ),
      'src/types.ts': `import { tags } from "typia";

export interface BlockAttributes {
  content: {
    text: string & tags.Source<"text"> & tags.Selector<".wp-block-demo__content">;
  };
}
`,
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

    await expect(
      syncBlockMetadata({
        blockJsonFile: 'block.json',
        manifestFile: 'typia.manifest.json',
        projectRoot: fixtureDir,
        sourceTypeName: 'BlockAttributes',
        typesFile: 'src/types.ts',
      }),
    ).rejects.toThrow(
      'WordPress extraction tags are only supported on top-level block attributes at BlockAttributes.content.text',
    );
  });

  test('supports imported aliases from @wp-typia/block-types inside types.ts', async () => {
    const blockTypesSourceDir = path.resolve(
      import.meta.dir,
      '../../packages/wp-typia-block-types/src',
    );
    const fixtureDir = createFixture({
      'block.json': JSON.stringify(
        { attributes: {}, example: { attributes: {} } },
        null,
        2,
      ),
      'src/types.ts': `import type { TextAlignment } from "@wp-typia/block-types/block-editor/alignment";
import { tags } from "typia";

export interface BlockAttributes {
  alignment?: TextAlignment & tags.Default<"left">;
}
`,
      'tsconfig.json': JSON.stringify(
        {
          compilerOptions: {
            baseUrl: '.',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            paths: {
              '@wp-typia/block-types': [`${blockTypesSourceDir}/index.ts`],
              '@wp-typia/block-types/*': [`${blockTypesSourceDir}/*`],
            },
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

    await syncBlockMetadata({
      blockJsonFile: 'block.json',
      manifestFile: 'typia.manifest.json',
      projectRoot: fixtureDir,
      sourceTypeName: 'BlockAttributes',
      typesFile: 'src/types.ts',
    });

    const blockJson = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'block.json'), 'utf8'),
    );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'typia.manifest.json'), 'utf8'),
    );

    expect(blockJson.attributes.alignment.enum).toEqual([
      'left',
      'center',
      'right',
      'justify',
    ]);
    expect(blockJson.attributes.alignment.default).toBe('left');
    expect(manifest.attributes.alignment.typia.hasDefault).toBe(true);
    expect(manifest.attributes.alignment.typia.defaultValue).toBe('left');
  });

  test('supports pipeline-compatible aliases from @wp-typia/block-types inside types.ts', async () => {
    const blockTypesSourceDir = path.resolve(
      import.meta.dir,
      '../../packages/wp-typia-block-types/src',
    );
    const fixtureDir = createFixture({
      'block.json': JSON.stringify(
        { attributes: {}, example: { attributes: {} } },
        null,
        2,
      ),
      'src/types.ts': `import type { CssNamedColor } from "@wp-typia/block-types/block-editor/color";
import type { MinHeightKeyword } from "@wp-typia/block-types/block-editor/dimensions";
import { tags } from "typia";

export interface BlockAttributes {
  textColor?: CssNamedColor & tags.Default<"transparent">;
  minHeight?: MinHeightKeyword & tags.Default<"auto">;
}
`,
      'tsconfig.json': JSON.stringify(
        {
          compilerOptions: {
            baseUrl: '.',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            paths: {
              '@wp-typia/block-types': [`${blockTypesSourceDir}/index.ts`],
              '@wp-typia/block-types/*': [`${blockTypesSourceDir}/*`],
            },
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

    await syncBlockMetadata({
      blockJsonFile: 'block.json',
      manifestFile: 'typia.manifest.json',
      projectRoot: fixtureDir,
      sourceTypeName: 'BlockAttributes',
      typesFile: 'src/types.ts',
    });

    const blockJson = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'block.json'), 'utf8'),
    );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'typia.manifest.json'), 'utf8'),
    );

    expect(blockJson.attributes.textColor.enum).toEqual([
      'transparent',
      'currentColor',
      'inherit',
      'initial',
      'unset',
    ]);
    expect(blockJson.attributes.textColor.default).toBe('transparent');
    expect(blockJson.attributes.minHeight.enum).toEqual([
      'auto',
      'inherit',
      'initial',
      'unset',
    ]);
    expect(blockJson.attributes.minHeight.default).toBe('auto');
    expect(manifest.attributes.textColor.typia.defaultValue).toBe(
      'transparent',
    );
    expect(manifest.attributes.minHeight.typia.defaultValue).toBe('auto');
  });

  test('supports indexed access into imported block support attributes without parsing unrelated nested style types', async () => {
    const blockTypesSourceDir = path.resolve(
      import.meta.dir,
      '../../packages/wp-typia-block-types/src',
    );
    const fixtureDir = createFixture({
      'block.json': JSON.stringify(
        { attributes: {}, example: { attributes: {} } },
        null,
        2,
      ),
      'src/types.ts': `import type { BlockTypographySupportAttributes } from "@wp-typia/block-types/block-editor/style-attributes";
import { tags } from "typia";

export interface BlockAttributes {
  fontSize?: BlockTypographySupportAttributes["fontSize"] & tags.Default<"medium">;
}
`,
      'tsconfig.json': JSON.stringify(
        {
          compilerOptions: {
            baseUrl: '.',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            paths: {
              '@wp-typia/block-types': [`${blockTypesSourceDir}/index.ts`],
              '@wp-typia/block-types/*': [`${blockTypesSourceDir}/*`],
            },
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

    await syncBlockMetadata({
      blockJsonFile: 'block.json',
      manifestFile: 'typia.manifest.json',
      projectRoot: fixtureDir,
      sourceTypeName: 'BlockAttributes',
      typesFile: 'src/types.ts',
    });

    const blockJson = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'block.json'), 'utf8'),
    );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'typia.manifest.json'), 'utf8'),
    );

    expect(blockJson.attributes.fontSize.type).toBe('string');
    expect(blockJson.attributes.fontSize.default).toBe('medium');
    expect(manifest.attributes.fontSize.wp.defaultValue).toBe('medium');
    expect(manifest.attributes.fontSize.wp.hasDefault).toBe(true);
  });

  test('supports primitive-compatible intersections for imported block support attribute aliases', async () => {
    const blockTypesSourceDir = path.resolve(
      import.meta.dir,
      '../../packages/wp-typia-block-types/src',
    );
    const fixtureDir = createFixture({
      'block.json': JSON.stringify(
        { attributes: {}, example: { attributes: {} } },
        null,
        2,
      ),
      'src/types.ts': `import type { CssNamedColor } from "@wp-typia/block-types/block-editor/color";
import type { BlockColorSupportAttributes } from "@wp-typia/block-types/block-editor/style-attributes";
import { tags } from "typia";

export interface BlockAttributes {
  textColor?: BlockColorSupportAttributes["textColor"] & CssNamedColor & tags.Default<"transparent">;
}
`,
      'tsconfig.json': JSON.stringify(
        {
          compilerOptions: {
            baseUrl: '.',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            paths: {
              '@wp-typia/block-types': [`${blockTypesSourceDir}/index.ts`],
              '@wp-typia/block-types/*': [`${blockTypesSourceDir}/*`],
            },
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

    await syncBlockMetadata({
      blockJsonFile: 'block.json',
      manifestFile: 'typia.manifest.json',
      projectRoot: fixtureDir,
      sourceTypeName: 'BlockAttributes',
      typesFile: 'src/types.ts',
    });

    const blockJson = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'block.json'), 'utf8'),
    );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'typia.manifest.json'), 'utf8'),
    );

    expect(blockJson.attributes.textColor.enum).toEqual([
      'transparent',
      'currentColor',
      'inherit',
      'initial',
      'unset',
    ]);
    expect(blockJson.attributes.textColor.default).toBe('transparent');
    expect(manifest.attributes.textColor.wp.enum).toEqual([
      'transparent',
      'currentColor',
      'inherit',
      'initial',
      'unset',
    ]);
    expect(manifest.attributes.textColor.typia.defaultValue).toBe(
      'transparent',
    );
  });

  test('generated php validator distinguishes arrays from objects for nested safe-subset attributes', async () => {
    if (!hasPhpBinary()) {
      return;
    }

    const fixtureDir = createFixture({
      'block.json': JSON.stringify(
        {
          attributes: {},
          example: { attributes: {} },
          name: 'create-block/php-validator',
        },
        null,
        2,
      ),
      'src/types.ts': `export interface BlockAttributes {
  seo: {
    slug: string;
  };
  items: Array<{
    label: string;
  }>;
}
`,
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

    await syncBlockMetadata({
      blockJsonFile: 'block.json',
      manifestFile: 'typia.manifest.json',
      projectRoot: fixtureDir,
      sourceTypeName: 'BlockAttributes',
      typesFile: 'src/types.ts',
    });

    const phpValidatorPath = path.join(fixtureDir, 'typia-validator.php');
    execFileSync('php', ['-l', phpValidatorPath], { stdio: 'ignore' });

    const invalidArrayPayload = JSON.stringify({
      items: { label: 'wrong-shape' },
      seo: { slug: 'valid' },
    })
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");
    const invalidObjectPayload = JSON.stringify({
      items: [{ label: 'valid' }],
      seo: [{ slug: 'wrong-shape' }],
    })
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");

    const arrayResult = JSON.parse(
      execFileSync(
        'php',
        [
          '-r',
          `${buildPhpValidatorRequireSource(phpValidatorPath)} $payload = json_decode('${invalidArrayPayload}', true); echo json_encode($validator->validate($payload), JSON_UNESCAPED_SLASHES);`,
        ],
        { encoding: 'utf8' },
      ),
    );
    const objectResult = JSON.parse(
      execFileSync(
        'php',
        [
          '-r',
          `${buildPhpValidatorRequireSource(phpValidatorPath)} $payload = json_decode('${invalidObjectPayload}', true); echo json_encode($validator->validate($payload), JSON_UNESCAPED_SLASHES);`,
        ],
        { encoding: 'utf8' },
      ),
    );

    expect(arrayResult.valid).toBe(false);
    expect(arrayResult.errors).toContain('items must be array');
    expect(objectResult.valid).toBe(false);
    expect(objectResult.errors).toContain('seo must be object');
  });

  test('manifest v2 schema distinguishes explicit null defaults from missing defaults', () => {
    const withoutDefault = {
      typia: {
        constraints: {},
        defaultValue: null,
        hasDefault: false,
      },
      ts: {
        items: null,
        kind: 'string',
        properties: null,
        required: false,
        union: null,
      },
      wp: {
        defaultValue: null,
        enum: null,
        hasDefault: false,
        type: 'string',
      },
    };
    const withExplicitNullDefault = {
      ...withoutDefault,
      typia: {
        ...withoutDefault.typia,
        hasDefault: true,
      },
      wp: {
        ...withoutDefault.wp,
        hasDefault: true,
      },
    };

    expect(withoutDefault.typia.hasDefault).toBe(false);
    expect(withoutDefault.typia.defaultValue).toBeNull();
    expect(withExplicitNullDefault.typia.hasDefault).toBe(true);
    expect(withExplicitNullDefault.typia.defaultValue).toBeNull();
  });

  test('emits discriminated union metadata and validates union branches in php', async () => {
    if (!hasPhpBinary()) {
      return;
    }

    const fixtureDir = createFixture({
      'block.json': JSON.stringify(
        { attributes: {}, example: { attributes: {} } },
        null,
        2,
      ),
      'src/types.ts': `export type LinkTarget =
  | { kind: "post"; postId: number }
  | { kind: "url"; href: string };

export interface BlockAttributes {
  link: LinkTarget;
}
`,
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

    await syncBlockMetadata({
      blockJsonFile: 'block.json',
      manifestFile: 'typia.manifest.json',
      projectRoot: fixtureDir,
      sourceTypeName: 'BlockAttributes',
      typesFile: 'src/types.ts',
    });

    const blockJson = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'block.json'), 'utf8'),
    );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'typia.manifest.json'), 'utf8'),
    );
    const phpValidatorPath = path.join(fixtureDir, 'typia-validator.php');

    expect(blockJson.attributes.link).toEqual({ type: 'object' });
    expect(manifest.attributes.link.ts.kind).toBe('union');
    expect(manifest.attributes.link.ts.union.discriminator).toBe('kind');
    expect(Object.keys(manifest.attributes.link.ts.union.branches)).toEqual([
      'post',
      'url',
    ]);

    const validResult = JSON.parse(
      execFileSync(
        'php',
        [
          '-r',
          `${buildPhpValidatorRequireSource(phpValidatorPath)} echo json_encode($validator->validate(["link" => ["kind" => "post", "postId" => 12]]), JSON_UNESCAPED_SLASHES);`,
        ],
        { encoding: 'utf8' },
      ),
    );
    const invalidResult = JSON.parse(
      execFileSync(
        'php',
        [
          '-r',
          `${buildPhpValidatorRequireSource(phpValidatorPath)} echo json_encode($validator->validate(["link" => ["kind" => "missing", "href" => "https://example.com"]]), JSON_UNESCAPED_SLASHES);`,
        ],
        { encoding: 'utf8' },
      ),
    );

    expect(validResult.valid).toBe(true);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors).toContain(
      'link.kind must be one of post, url',
    );
  });

  test('emits additive numeric and array constraints in manifest v2', async () => {
    const fixtureDir = createFixture({
      'block.json': JSON.stringify(
        { attributes: {}, example: { attributes: {} } },
        null,
        2,
      ),
      'src/types.ts': `import { tags } from "typia";

export interface BlockAttributes {
  opacity: number & tags.ExclusiveMinimum<0> & tags.ExclusiveMaximum<1> & tags.MultipleOf<0.25>;
  slides: Array<string> & tags.MinItems<1> & tags.MaxItems<4>;
}
`,
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

    const result = await syncBlockMetadata({
      blockJsonFile: 'block.json',
      manifestFile: 'typia.manifest.json',
      projectRoot: fixtureDir,
      sourceTypeName: 'BlockAttributes',
      typesFile: 'src/types.ts',
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'typia.manifest.json'), 'utf8'),
    );

    expect(manifest.attributes.opacity.typia.constraints.exclusiveMinimum).toBe(
      0,
    );
    expect(manifest.attributes.opacity.typia.constraints.exclusiveMaximum).toBe(
      1,
    );
    expect(manifest.attributes.opacity.typia.constraints.multipleOf).toBe(0.25);
    expect(manifest.attributes.slides.typia.constraints.minItems).toBe(1);
    expect(manifest.attributes.slides.typia.constraints.maxItems).toBe(4);
    expect(result.lossyProjectionWarnings).toContain(
      'BlockAttributes.opacity: exclusiveMaximum, exclusiveMinimum, multipleOf',
    );
    expect(result.lossyProjectionWarnings).toContain(
      'BlockAttributes.slides: maxItems, minItems, items',
    );
  });

  test('generated php validator supports additional formats, type tags, and array constraints', async () => {
    if (!hasPhpBinary()) {
      return;
    }

    const fixtureDir = createFixture({
      'block.json': JSON.stringify(
        { attributes: {}, example: { attributes: {} } },
        null,
        2,
      ),
      'src/types.ts': `import { tags } from "typia";

export interface BlockAttributes {
  contactEmail: string & tags.Format<"email">;
  website: string & tags.Format<"url">;
  publishedAt: string & tags.Format<"date-time">;
  score: number & tags.Type<"int32"> & tags.ExclusiveMinimum<-1> & tags.ExclusiveMaximum<101> & tags.MultipleOf<5>;
  slides: Array<string> & tags.MinItems<1> & tags.MaxItems<2>;
}
`,
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

    const result = await syncBlockMetadata({
      blockJsonFile: 'block.json',
      manifestFile: 'typia.manifest.json',
      projectRoot: fixtureDir,
      sourceTypeName: 'BlockAttributes',
      typesFile: 'src/types.ts',
    });

    expect(result.phpGenerationWarnings).toEqual([]);

    const phpValidatorPath = path.join(fixtureDir, 'typia-validator.php');
    execFileSync('php', ['-l', phpValidatorPath], { stdio: 'ignore' });

    const invalidPayload = JSON.stringify({
      contactEmail: 'not-an-email',
      website: 'notaurl',
      publishedAt: '2026/03/29 09:00:00',
      score: 102,
      slides: [],
    })
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");

    const invalidResult = JSON.parse(
      execFileSync(
        'php',
        [
          '-r',
          `${buildPhpValidatorRequireSource(phpValidatorPath)} $payload = json_decode('${invalidPayload}', true); echo json_encode($validator->validate($payload), JSON_UNESCAPED_SLASHES);`,
        ],
        { encoding: 'utf8' },
      ),
    );

    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors).toContain(
      'contactEmail must match format email',
    );
    expect(invalidResult.errors).toContain('website must match format url');
    expect(invalidResult.errors).toContain(
      'publishedAt must match format date-time',
    );
    expect(invalidResult.errors).toContain('score must be < 101');
    expect(invalidResult.errors).toContain('slides must have at least 1 items');
  });
});
