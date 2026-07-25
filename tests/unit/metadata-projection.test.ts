import { describe, expect, test } from 'bun:test';

import {
  baseNode,
  defaultAttributeConstraints,
  type AttributeNode,
} from '../../packages/wp-typia-project-tools/src/runtime/metadata-model';
import {
  createBlockJsonAttribute,
  createExampleValue,
  createManifestAttribute,
  validateWordPressExtractionAttributes,
} from '../../packages/wp-typia-project-tools/src/runtime/metadata-projection';

function createNode(
	kind: AttributeNode['kind'],
	pathLabel: string,
	overrides: Omit<Partial<AttributeNode>, 'wp'> & {
		wp?: Partial<AttributeNode['wp']>;
	} = {},
): AttributeNode {
  const node = baseNode(kind, pathLabel);
  return {
    ...node,
    ...overrides,
    wp: {
      ...node.wp,
      ...(overrides.wp ?? {}),
    },
    union: overrides.union ?? null,
  };
}

describe('metadata-projection', () => {
	test('projects block.json attributes and records lossy projection warnings', () => {
		const warnings: string[] = [];
		const node = createNode('string', 'attributes.content', {
			constraints: {
				...defaultAttributeConstraints(),
				format: 'email',
			},
			defaultValue: 'Hello',
			enumValues: ['Hello', 'World'],
			wp: {
				selector: '.demo__content',
				source: 'text',
			},
		});

		expect(createBlockJsonAttribute(node, warnings)).toEqual({
			default: 'Hello',
			enum: ['Hello', 'World'],
			selector: '.demo__content',
			source: 'text',
			type: 'string',
		});
		expect(warnings).toEqual(['attributes.content: format']);
	});

	test('creates manifest attributes without sharing cloned default references', () => {
		const node = createNode('object', 'settings', {
			defaultValue: {
				enabled: true,
			},
			properties: {
				enabled: createNode('boolean', 'settings.enabled'),
			},
		});

		const manifest = createManifestAttribute(node);
		(manifest.typia.defaultValue as { enabled: boolean }).enabled = false;

		expect(node.defaultValue).toEqual({
			enabled: true,
		});
		expect(manifest.wp.type).toBe('object');
		expect(manifest.ts.properties?.enabled.ts.kind).toBe('boolean');
	});

	test('creates example values from uuid formats, enums, and discriminated unions', () => {
		const uuidNode = createNode('string', 'id', {
			constraints: {
				...defaultAttributeConstraints(),
				format: 'uuid',
			},
		});
		const enumNode = createNode('string', 'status', {
			enumValues: ['idle', 'done'],
		});
		const unionNode = createNode('union', 'body', {
			union: {
				branches: {
					email: createNode('object', 'body.email', {
						properties: {
							kind: createNode('string', 'body.email.kind', {
								enumValues: ['email'],
							}),
							to: createNode('string', 'body.email.to'),
						},
					}),
				},
				discriminator: 'kind',
			},
		});

		expect(createExampleValue(uuidNode, 'id')).toBe(
			'00000000-0000-4000-8000-000000000000',
		);
		expect(createExampleValue(enumNode, 'status')).toBe('idle');
		expect(createExampleValue(unionNode, 'body')).toEqual({
			kind: 'email',
			to: 'Example to',
		});
	});

	test('keeps fallback examples aligned with basic number, string, and array constraints', () => {
		const boundedString = createNode('string', 'slug', {
			constraints: {
				...defaultAttributeConstraints(),
				maxLength: 4,
				minLength: 4,
			},
		});
		const boundedNumber = createNode('number', 'count', {
			constraints: {
				...defaultAttributeConstraints(),
				maximum: 3,
			},
		});
		const boundedArray = createNode('array', 'items', {
			constraints: {
				...defaultAttributeConstraints(),
				minItems: 2,
			},
			items: createNode('string', 'items[]'),
		});

		expect(createExampleValue(boundedString, 'slug')).toBe('Exam');
		expect(createExampleValue(boundedNumber, 'count')).toBe(3);
		expect(createExampleValue(boundedArray, 'item')).toEqual([
			'Example item1',
			'Example item2',
		]);
	});

	test('rejects nested WordPress extraction tags', () => {
		expect(() =>
			validateWordPressExtractionAttributes({
				root: createNode('object', 'root', {
					properties: {
						content: createNode('string', 'root.content', {
							wp: {
								selector: '.demo__content',
								source: 'text',
							},
						}),
					},
				}),
			}),
		).toThrow(
			'WordPress extraction tags are only supported on top-level block attributes',
		);
	});
});
