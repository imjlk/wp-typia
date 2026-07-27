import { describe, expect, test } from 'bun:test';

import type { BlockVariationDiagnostic } from '../src/blocks/variations';
import {
  createStaticBlockVariationRegistrationSource,
  defineVariation,
  defineVariations,
  getDefinedVariationBlockName,
  getDefinedVariationCompatibilityManifest,
  getDefinedVariationMetadata,
  getDefinedVariationsMetadata,
} from '../src/blocks/variations';

interface ParagraphAttributes {
  className?: string;
  content?: string;
}

interface HeadingAttributes {
  className?: string;
  level?: number;
}

interface TestimonialAttributes {
  className?: string;
  layout?: 'card' | 'quote';
}

describe('defineVariation', () => {
	test('returns registration-ready metadata and stores target details out of band', () => {
		const variation = defineVariation<ParagraphAttributes>('core/paragraph', {
			attributes: {
				className: 'is-style-balanced',
			},
			description: 'An opinionated paragraph style.',
			isActive: ['className'],
			name: 'example-balanced-paragraph',
			scope: ['inserter', 'transform'],
			title: 'Balanced Paragraph',
		});
		const manifest = getDefinedVariationCompatibilityManifest(variation);

		expect(variation).toEqual({
			attributes: {
				className: 'is-style-balanced',
			},
			description: 'An opinionated paragraph style.',
			isActive: ['className'],
			name: 'example-balanced-paragraph',
			scope: ['inserter', 'transform'],
			title: 'Balanced Paragraph',
		});
		expect(JSON.parse(JSON.stringify(variation))).toEqual(variation);
		expect(getDefinedVariationBlockName(variation)).toBe('core/paragraph');
		expect(getDefinedVariationMetadata(variation)?.diagnostics).toEqual([]);
		expect(manifest?.supported.map((feature) => feature.feature)).toEqual([
			'editorRegistration',
		]);
	});

	test('reports missing active detection unless explicitly disabled', () => {
		const diagnostics: BlockVariationDiagnostic[] = [];
		const variation = defineVariation<ParagraphAttributes>('core/paragraph', {
			allowMissingIsActive: true,
			attributes: {
				className: 'is-style-quiet',
			},
			name: 'example-quiet-paragraph',
			title: 'Quiet Paragraph',
		});

		defineVariation<ParagraphAttributes>(
			'core/paragraph',
			{
				attributes: {
					className: 'is-style-editorial',
				},
				name: 'example-editorial-paragraph',
				title: 'Editorial Paragraph',
			},
			{
				onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
			},
		);

		expect(getDefinedVariationMetadata(variation)?.diagnostics).toEqual([]);
		expect(diagnostics).toMatchObject([
			{
				code: 'missing-is-active',
				severity: 'warning',
				variationName: 'example-editorial-paragraph',
			},
		]);
	});

	test('warns when isActive references attributes not declared by the variation', () => {
		const diagnostics: BlockVariationDiagnostic[] = [];

		defineVariation<HeadingAttributes>(
			'core/heading',
			{
				attributes: {
					className: 'is-style-balanced-heading',
				},
				isActive: ['level'],
				name: 'example-balanced-heading',
				title: 'Balanced Heading',
			},
			{
				onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
			},
		);

		expect(diagnostics).toMatchObject([
			{
				attribute: 'level',
				code: 'unknown-is-active-attribute',
				severity: 'warning',
			},
		]);
	});

	test('reports authoring warnings through explicit loggers', () => {
		const logs: Array<{
			readonly diagnostic: BlockVariationDiagnostic;
			readonly message: string;
		}> = [];

		defineVariation<ParagraphAttributes>(
			'core/paragraph',
			{
				attributes: {
					className: 'is-style-editorial',
				},
				name: 'example-editorial-paragraph',
				title: 'Editorial Paragraph',
			},
			{
				logger: {
					warn: (message, diagnostic) => {
						logs.push({ diagnostic, message });
					},
				},
			},
		);

		expect(logs).toHaveLength(1);
		expect(logs[0]?.message).toContain('[wp-typia]');
		expect(logs[0]?.diagnostic).toMatchObject({
			code: 'missing-is-active',
			severity: 'warning',
			variationName: 'example-editorial-paragraph',
		});
	});

	test('throws in strict mode when editor registration is below the WordPress floor', () => {
		expect(() =>
			defineVariation<ParagraphAttributes>('core/paragraph', {
				attributes: {
					className: 'is-style-legacy',
				},
				isActive: ['className'],
				minWordPress: '5.3',
				name: 'example-legacy-paragraph',
				title: 'Legacy Paragraph',
			}),
		).toThrow('registerBlockVariation() editor registration requires WordPress 5.4+');
	});
});

describe('defineVariations', () => {
	test('collects multiple core block variations and generates static registration code', () => {
		const paragraphVariation = defineVariation<ParagraphAttributes>('core/paragraph', {
			attributes: {
				className: 'is-style-balanced',
			},
			isActive: ['className'],
			name: 'example-balanced-paragraph',
			scope: ['inserter', 'transform'],
			title: 'Balanced Paragraph',
		});
		const headingVariation = defineVariation<HeadingAttributes>('core/heading', {
			attributes: {
				className: 'is-style-balanced-heading',
				level: 2,
			},
			isActive: ['className', 'level'],
			name: 'example-balanced-heading',
			scope: ['inserter', 'transform'],
			title: 'Balanced Heading',
		});
		const groupVariation = defineVariation('core/group', {
			attributes: {
				className: 'is-style-prose-group',
			},
			innerBlocks: [
				['core/heading', { level: 2, placeholder: 'Title' }],
				['core/paragraph', { placeholder: 'Write...' }],
			],
			isActive: ['className'],
			name: 'example-prose-group',
			scope: ['inserter', 'transform'],
			title: 'Prose Group',
		});
		const queryVariation = defineVariation('core/query', {
			attributes: {
				namespace: 'example/books-query',
				query: {
					postType: 'book',
				},
			},
			innerBlocks: [
				['core/post-template', {}, [['core/post-title'], ['core/post-excerpt']]],
			],
			isActive: ['namespace'],
			name: 'example-books-query',
			scope: ['inserter'],
			title: 'Books Query',
		});
		const testimonialVariation = defineVariation<TestimonialAttributes>(
			'acme/testimonial',
			{
				attributes: {
					className: 'is-style-featured-testimonial',
					layout: 'card',
				},
				isActive: ['className', 'layout'],
				name: 'acme-featured-testimonial',
				scope: ['inserter'],
				title: 'Featured Testimonial',
			},
		);
		const variations = defineVariations([
			paragraphVariation,
			headingVariation,
			groupVariation,
			queryVariation,
			testimonialVariation,
		] as const);
		const source = createStaticBlockVariationRegistrationSource(variations);

		expect(getDefinedVariationsMetadata(variations)?.entries).toMatchObject([
			{
				blockName: 'core/paragraph',
				variation: {
					name: 'example-balanced-paragraph',
				},
			},
			{
				blockName: 'core/heading',
				variation: {
					name: 'example-balanced-heading',
				},
			},
			{
				blockName: 'core/group',
				variation: {
					name: 'example-prose-group',
				},
			},
			{
				blockName: 'core/query',
				variation: {
					name: 'example-books-query',
				},
			},
			{
				blockName: 'acme/testimonial',
				variation: {
					name: 'acme-featured-testimonial',
				},
			},
		]);
		expect(source).toContain(
			'import { registerBlockVariation } from "@wordpress/blocks";',
		);
		expect(source).toContain('"blockName": "core/query"');
		expect(source).toContain('"blockName": "acme/testimonial"');
		expect(source).toContain('"name": "example-books-query"');
		expect(source).toContain('registerBlockVariation(blockName, variation);');
	});

	test('detects duplicate variation names and overlapping active discriminators', () => {
		const first = defineVariation<ParagraphAttributes>('core/paragraph', {
			attributes: {
				className: 'is-style-first',
			},
			isActive: ['className'],
			name: 'example-duplicate',
			title: 'First',
		});
		const duplicateName = defineVariation<ParagraphAttributes>('core/paragraph', {
			attributes: {
				className: 'is-style-second',
			},
			isActive: ['className'],
			name: 'example-duplicate',
			title: 'Second',
		});
		const distinctMarker = defineVariation<ParagraphAttributes>('core/paragraph', {
			attributes: {
				className: 'is-style-third',
			},
			isActive: ['className'],
			name: 'example-third',
			title: 'Third',
		});
		const duplicateMarker = defineVariation<ParagraphAttributes>('core/paragraph', {
			attributes: {
				className: 'is-style-first',
			},
			isActive: ['className'],
			name: 'example-first-copy',
			title: 'First Copy',
		});
		const diagnostics: BlockVariationDiagnostic[] = [];
		const distinctDiagnostics: BlockVariationDiagnostic[] = [];

		expect(() => defineVariations([first, duplicateName] as const)).toThrow(
			'Duplicate block variation name "example-duplicate"',
		);
		defineVariations([first, distinctMarker] as const, {
			onDiagnostic: (diagnostic) => distinctDiagnostics.push(diagnostic),
		});
		defineVariations([first, duplicateMarker] as const, {
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
		});

		expect(distinctDiagnostics).toEqual([]);
		expect(diagnostics).toMatchObject([
			{
				code: 'duplicate-active-marker',
				severity: 'warning',
				variationName: 'example-first-copy',
			},
		]);
	});

	test('stores per-variation diagnostics without re-emitting them from collections', () => {
		const variationDiagnostics: BlockVariationDiagnostic[] = [];
		const collectionDiagnostics: BlockVariationDiagnostic[] = [];
		const variation = defineVariation<ParagraphAttributes>(
			'core/paragraph',
			{
				attributes: {
					className: 'is-style-passive',
				},
				name: 'example-passive-paragraph',
				title: 'Passive Paragraph',
			},
			{
				onDiagnostic: (diagnostic) => variationDiagnostics.push(diagnostic),
			},
		);
		const variations = defineVariations([variation] as const, {
			onDiagnostic: (diagnostic) => collectionDiagnostics.push(diagnostic),
		});

		expect(variationDiagnostics).toMatchObject([
			{
				code: 'missing-is-active',
				variationName: 'example-passive-paragraph',
			},
		]);
		expect(collectionDiagnostics).toEqual([]);
		expect(getDefinedVariationsMetadata(variations)?.diagnostics).toMatchObject([
			{
				code: 'missing-is-active',
				variationName: 'example-passive-paragraph',
			},
		]);
	});

	test('rejects function-based isActive when generating static registration source', () => {
		const variation = defineVariation<ParagraphAttributes>('core/paragraph', {
			attributes: {
				className: 'is-style-dynamic',
			},
			isActive: (attributes) => attributes.className === 'is-style-dynamic',
			name: 'example-dynamic-paragraph',
			title: 'Dynamic Paragraph',
		});

		expect(() => createStaticBlockVariationRegistrationSource([variation])).toThrow(
			'function value',
		);
	});
});
