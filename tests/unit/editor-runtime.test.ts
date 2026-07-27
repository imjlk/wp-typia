import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  createEditorModel,
  describeEditorField,
  formatEditorFieldLabel,
  type ManifestAttribute,
  type ManifestDocument,
} from '../../packages/wp-typia-block-runtime/src/editor';

interface AttributeOverride {
  typia?: Partial<ManifestAttribute['typia']>;
  ts?: Partial<ManifestAttribute['ts']>;
  wp?: Partial<ManifestAttribute['wp']>;
}

function createAttribute(overrides: AttributeOverride): ManifestAttribute {
  return {
    typia: {
      constraints: {
        exclusiveMaximum: null,
        exclusiveMinimum: null,
        format: null,
        maxLength: null,
        maxItems: null,
        maximum: null,
        minLength: null,
        minItems: null,
        minimum: null,
        multipleOf: null,
        pattern: null,
        typeTag: null,
      },
      defaultValue: null,
      hasDefault: false,
      ...(overrides.typia ?? {}),
    },
    ts: {
      items: null,
      kind: 'string',
      required: false,
      union: null,
      ...(overrides.ts ?? {}),
    },
    wp: {
      defaultValue: null,
      enum: null,
      hasDefault: false,
      type: 'string',
      ...(overrides.wp ?? {}),
    },
  };
}

function getDescriptor(
  fields: ReturnType<typeof createEditorModel>,
  pathValue: string,
) {
  const field = fields.find((entry) => entry.path === pathValue);
  expect(field).toBeDefined();
  return field!;
}

describe('runtime editor helpers', () => {
  test('formatEditorFieldLabel formats dotted and camelCase paths', () => {
    expect(formatEditorFieldLabel('padding.top')).toBe('Padding Top');
    expect(formatEditorFieldLabel('textColor')).toBe('Text Color');
    expect(formatEditorFieldLabel('uniqueId')).toBe('Unique ID');
  });

  test('describeEditorField respects manual path overrides', () => {
    const field = describeEditorField(
      'linkTarget',
      createAttribute({
        ts: {
          items: null,
          kind: 'union',
          properties: null,
          required: false,
          union: {
            branches: {},
            discriminator: 'kind',
          },
        },
      }),
      {
        manual: ['linkTarget'],
      },
    );

    expect(field.supported).toBe(false);
    expect(field.reason).toContain('manual');
  });

  test('describeEditorField preserves legacy create compat semantics for manual enum fields', () => {
    const field = describeEditorField(
      'alignment',
      createAttribute({
        ts: {
          items: null,
          kind: 'string',
          required: false,
          union: null,
        },
        wp: {
          enum: ['left', 'center', 'right'],
          hasDefault: true,
          type: 'string',
        },
      }),
      {
        manual: ['alignment'],
      },
    );

    expect(field.control).toBe('unsupported');
    expect(field.options).toEqual([]);
  });

  test('createEditorModel infers controls and flattens nested object leaves', () => {
    const manifest: ManifestDocument = {
      attributes: {
        content: createAttribute({
          typia: {
            constraints: {
              exclusiveMaximum: null,
              exclusiveMinimum: null,
              format: null,
              maxLength: 5000,
              maxItems: null,
              maximum: null,
              minLength: 0,
              minItems: null,
              minimum: null,
              multipleOf: null,
              pattern: null,
              typeTag: null,
            },
            defaultValue: '',
            hasDefault: true,
          },
          ts: {
            items: null,
            kind: 'string',
            required: true,
            union: null,
          },
        }),
        isVisible: createAttribute({
          typia: {
            defaultValue: true,
            hasDefault: true,
          },
          ts: {
            items: null,
            kind: 'boolean',
            required: false,
            union: null,
          },
          wp: {
            defaultValue: true,
            enum: null,
            hasDefault: true,
            type: 'boolean',
          },
        }),
        alignment: createAttribute({
          typia: {
            constraints: {
              exclusiveMaximum: null,
              exclusiveMinimum: null,
              format: null,
              maxLength: null,
              maxItems: null,
              maximum: null,
              minLength: null,
              minItems: null,
              minimum: null,
              multipleOf: null,
              pattern: null,
              typeTag: null,
            },
            defaultValue: 'left',
            hasDefault: true,
          },
          wp: {
            defaultValue: 'left',
            enum: ['left', 'center', 'right'],
            hasDefault: true,
            type: 'string',
          },
        }),
        opacity: createAttribute({
          typia: {
            constraints: {
              exclusiveMaximum: null,
              exclusiveMinimum: null,
              format: null,
              maxLength: null,
              maxItems: null,
              maximum: 1,
              minLength: null,
              minItems: null,
              minimum: 0,
              multipleOf: 0.25,
              pattern: null,
              typeTag: null,
            },
            defaultValue: 0.5,
            hasDefault: true,
          },
          ts: {
            items: null,
            kind: 'number',
            required: false,
            union: null,
          },
          wp: {
            defaultValue: 0.5,
            enum: null,
            hasDefault: true,
            type: 'number',
          },
        }),
        borderRadius: createAttribute({
          typia: {
            constraints: {
              exclusiveMaximum: null,
              exclusiveMinimum: null,
              format: null,
              maxLength: null,
              maxItems: null,
              maximum: null,
              minLength: null,
              minItems: null,
              minimum: 0,
              multipleOf: null,
              pattern: null,
              typeTag: 'uint32',
            },
            defaultValue: 0,
            hasDefault: true,
          },
          ts: {
            items: null,
            kind: 'number',
            required: false,
            union: null,
          },
          wp: {
            defaultValue: 0,
            enum: null,
            hasDefault: true,
            type: 'number',
          },
        }),
        padding: createAttribute({
          ts: {
            items: null,
            kind: 'object',
            properties: {
              top: createAttribute({
                typia: {
                  constraints: {
                    exclusiveMaximum: null,
                    exclusiveMinimum: null,
                    format: null,
                    maxLength: null,
                    maxItems: null,
                    maximum: null,
                    minLength: null,
                    minItems: null,
                    minimum: 0,
                    multipleOf: null,
                    pattern: null,
                    typeTag: 'uint32',
                  },
                  defaultValue: 0,
                  hasDefault: true,
                },
                ts: {
                  items: null,
                  kind: 'number',
                  required: true,
                  union: null,
                },
                wp: {
                  defaultValue: 0,
                  enum: null,
                  hasDefault: true,
                  type: 'number',
                },
              }),
            },
            required: false,
            union: null,
          },
        }),
        linkTarget: createAttribute({
          ts: {
            items: null,
            kind: 'union',
            required: false,
            union: {
              branches: {},
              discriminator: 'kind',
            },
          },
        }),
        slides: createAttribute({
          ts: {
            items: createAttribute({
              ts: {
                items: null,
                kind: 'string',
                required: true,
                union: null,
              },
            }),
            kind: 'array',
            properties: null,
            required: false,
            union: null,
          },
        }),
      },
      manifestVersion: 2,
      sourceType: 'SyntheticAttributes',
    };

    const fields = createEditorModel(manifest, {
      preferTextarea: ['content'],
    });

    expect(getDescriptor(fields, 'content').control).toBe('textarea');
    expect(getDescriptor(fields, 'isVisible').control).toBe('toggle');
    expect(getDescriptor(fields, 'alignment').control).toBe('select');
    expect(getDescriptor(fields, 'opacity').control).toBe('range');
    expect(getDescriptor(fields, 'opacity').step).toBe(0.25);
    expect(getDescriptor(fields, 'borderRadius').control).toBe('number');
    expect(getDescriptor(fields, 'borderRadius').step).toBe(1);
    expect(getDescriptor(fields, 'padding.top').control).toBe('number');
    expect(getDescriptor(fields, 'linkTarget').supported).toBe(false);
    expect(getDescriptor(fields, 'slides').supported).toBe(false);
  });

  test('createEditorModel keeps object paths marked manual as a single descriptor', () => {
    const manifest: ManifestDocument = {
      attributes: {
        animation: createAttribute({
          ts: {
            items: null,
            kind: 'object',
            properties: {
              duration: createAttribute({
                ts: {
                  items: null,
                  kind: 'number',
                  required: false,
                  union: null,
                },
                wp: {
                  type: 'number',
                },
              }),
            },
            required: false,
            union: null,
          },
          wp: {
            type: 'object',
          },
        }),
      },
      manifestVersion: 2,
      sourceType: 'SyntheticAttributes',
    };

    const fields = createEditorModel(manifest, {
      manual: ['animation'],
    });

    expect(fields).toHaveLength(1);
    expect(fields[0]?.path).toBe('animation');
    expect(fields[0]?.supported).toBe(false);
    expect(fields[0]?.reason).toContain('manual');
  });

  test('example manifest produces editor descriptors for the showcase controls', () => {
    const exampleManifest = JSON.parse(
      fs.readFileSync(
        path.join(
          import.meta.dir,
          '../../examples/my-typia-block/typia.manifest.json',
        ),
        'utf8',
      ),
    ) as ManifestDocument;
    const fields = createEditorModel(exampleManifest, {
      hidden: ['id', 'version'],
      manual: ['animation', 'className', 'content', 'linkTarget'],
    });

    expect(getDescriptor(fields, 'alignment').control).toBe('select');
    expect(getDescriptor(fields, 'fontSize').control).toBe('select');
    expect(getDescriptor(fields, 'isVisible').control).toBe('toggle');
    expect(getDescriptor(fields, 'padding.top').control).toBe('number');
    expect(getDescriptor(fields, 'borderRadius').minimum).toBe(0);
    expect(getDescriptor(fields, 'linkTarget').supported).toBe(false);
    expect(fields.some((field) => field.path === 'id')).toBe(false);
  });
});
