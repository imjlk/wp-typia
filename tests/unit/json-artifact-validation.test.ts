import { describe, expect, test } from 'bun:test';

import {
  assertScaffoldBlockMetadata,
  isScaffoldBlockMetadata,
  parseScaffoldBlockMetadata,
} from '../../packages/wp-typia-block-runtime/src/blocks';
import {
  assertManifestDefaultsDocument,
  isManifestDefaultsDocument,
  parseManifestDefaultsDocument,
} from '../../packages/wp-typia-block-runtime/src/defaults';
import {
  assertManifestDocument,
  isManifestDocument,
  parseManifestDocument,
} from '../../packages/wp-typia-block-runtime/src/editor';

const baseManifestAttribute = {
  ts: {
    items: null,
    kind: 'string' as const,
    properties: null,
    required: true,
    union: null,
  },
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
    defaultValue: '',
    hasDefault: true,
  },
  wp: {
    defaultValue: '',
    enum: null,
    hasDefault: true,
    selector: null,
    source: 'html' as const,
    type: 'string',
  },
};

describe('JSON artifact validation helpers', () => {
	test('scaffold block metadata helpers accept metadata with a block name', () => {
		const metadata = {
			name: 'demo/block',
			title: 'Demo Block',
		};
		const assertedMetadata = assertScaffoldBlockMetadata( metadata );

		expect(isScaffoldBlockMetadata(metadata)).toBe(true);
		expect(assertedMetadata).toEqual(metadata);
		expect(
			parseScaffoldBlockMetadata<{ title: string }>(metadata).title,
		).toBe('Demo Block');
	});

	test('scaffold block metadata helpers reject nameless payloads', () => {
		expect(isScaffoldBlockMetadata({})).toBe(false);
		expect(() => assertScaffoldBlockMetadata({})).toThrow(
			'Scaffold block metadata must include a string name.',
		);
	});

	test('manifest document helpers validate generated typia.manifest.json payloads', () => {
		const manifest = {
			attributes: {
				content: baseManifestAttribute,
			},
			manifestVersion: 2,
			sourceType: 'typia',
		};
		const assertedManifest = assertManifestDocument( manifest );

		expect(isManifestDocument(manifest)).toBe(true);
		expect(assertedManifest).toEqual(manifest);
		expect(parseManifestDocument(manifest).attributes?.content.ts.kind).toBe(
			'string',
		);
	});

	test('manifest document helpers reject malformed attribute entries', () => {
		const invalidManifest = {
			attributes: {
				content: {
					ts: {
						kind: 'string',
					},
				},
			},
			manifestVersion: 2,
			sourceType: 'typia',
		};

		expect(isManifestDocument(invalidManifest)).toBe(false);
		expect(() => parseManifestDocument(invalidManifest)).toThrow(
			'Manifest document must contain an attributes record with scaffold editor metadata.',
		);
	});

	test('manifest defaults helpers validate generated default-manifest payloads', () => {
		const manifestDefaults = {
			attributes: {
				content: {
					ts: {
						items: null,
						kind: 'string' as const,
						properties: null,
						required: true,
						union: null,
					},
					typia: {
						defaultValue: '',
						hasDefault: true,
					},
				},
			},
		};
		const assertedManifestDefaults =
			assertManifestDefaultsDocument( manifestDefaults );

		expect(isManifestDefaultsDocument(manifestDefaults)).toBe(true);
		expect(assertedManifestDefaults).toEqual(manifestDefaults);
		expect(
			parseManifestDefaultsDocument(manifestDefaults).attributes.content.typia
				.hasDefault,
		).toBe(true);
	});

	test('manifest defaults helpers reject malformed defaults payloads', () => {
		const invalidManifestDefaults = {
			attributes: {
				content: {
					ts: {
						items: null,
						kind: 'string',
						properties: null,
						required: true,
						union: null,
					},
					typia: {
						hasDefault: true,
					},
				},
			},
		};

		expect(isManifestDefaultsDocument(invalidManifestDefaults)).toBe(false);
		expect(() => parseManifestDefaultsDocument(invalidManifestDefaults)).toThrow(
			'Manifest defaults document must contain an attributes record with scaffold default metadata.',
		);
	});
});
