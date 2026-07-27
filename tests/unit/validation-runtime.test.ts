import { describe, expect, test } from 'bun:test';

import {
  createAttributeUpdater,
  createNestedAttributeUpdater,
  createScaffoldValidatorToolkit,
  formatValidationError,
  formatValidationErrors,
  mergeNestedAttributeUpdate,
  toNestedAttributePatch,
  toValidationResult,
  toValidationState,
  type ValidationResult,
} from '../../packages/wp-typia-block-runtime/src/validation';

describe('runtime validation helpers', () => {
	test('formatValidationError includes path, expectation, and received value type', () => {
		expect(
			formatValidationError({
				expected: 'string',
				path: 'attributes.content',
				value: 42,
			}),
		).toBe('attributes.content: string expected, got number');
	});

	test('formatValidationErrors formats multiple validation issues', () => {
		expect(
			formatValidationErrors([
				{
					expected: 'string',
					path: 'attributes.content',
					value: 42,
				},
				{
					expected: 'boolean',
					path: 'attributes.isVisible',
					value: 'yes',
				},
			]),
		).toEqual([
			'attributes.content: string expected, got number',
			'attributes.isVisible: boolean expected, got string',
		]);
	});

	test('toValidationResult normalizes raw typia output into typed validation errors', () => {
		const result = toValidationResult({
			errors: [
				{
					expected: 'string',
					path: 'attributes.content',
					value: 10,
				},
			],
			success: false,
		});

		expect(result).toEqual({
			data: undefined,
			errors: [
				{
					description: undefined,
					expected: 'string',
					path: 'attributes.content',
					value: 10,
				},
			],
			isValid: false,
		});
	});

	test('toValidationResult tolerates malformed typia-like payloads', () => {
		const nullResult = toValidationResult(null);
		const nullErrors = toValidationResult({
			errors: null,
			success: false,
		});
		const truthySuccess = toValidationResult({
			data: 'unexpected',
			success: 'yes',
		});
		const mixedErrors = toValidationResult({
			errors: [
				null,
				'boom',
				{
					value: 99,
				},
			],
			success: false,
		});

		expect(nullResult).toEqual({
			data: undefined,
			errors: [],
			isValid: false,
		});
		expect(nullErrors).toEqual({
			data: undefined,
			errors: [],
			isValid: false,
		});
		expect(truthySuccess).toEqual({
			data: undefined,
			errors: [],
			isValid: false,
		});
		expect(mixedErrors.errors).toEqual([
			{
				description: undefined,
				expected: 'unknown',
				path: '(root)',
				value: undefined,
			},
			{
				description: undefined,
				expected: 'unknown',
				path: '(root)',
				value: undefined,
			},
			{
				description: undefined,
				expected: 'unknown',
				path: '(root)',
				value: 99,
			},
		]);
	});

	test('toValidationState derives formatted messages from a validation result', () => {
		const state = toValidationState({
			data: undefined,
			errors: [
				{
					expected: 'string',
					path: '(root)',
					value: false,
				},
			],
			isValid: false,
		});

		expect(state.errorMessages).toEqual(['(root): string expected, got boolean']);
	});

	test('createAttributeUpdater applies valid patches', () => {
		const patches: Array<Partial<{ content: string; isVisible: boolean }>> = [];
		const updateAttribute = createAttributeUpdater(
			{ content: 'Hello', isVisible: true },
			(patch) => {
				patches.push(patch);
			},
			(value): ValidationResult<{ content: string; isVisible: boolean }> => ({
				data: value,
				errors: [],
				isValid: true,
			}),
		);

		expect(updateAttribute('content', 'Updated')).toBe(true);
		expect(patches).toEqual([{ content: 'Updated' }]);
	});

	test('createAttributeUpdater applies normalized validation data when provided', () => {
		const patches: Array<Partial<{ content: string; id: string }>> = [];
		const updateAttribute = createAttributeUpdater(
			{ content: 'Hello', id: '' },
			(patch) => {
				patches.push(patch);
			},
			(): ValidationResult<{ content: string; id: string }> => ({
				data: {
					content: 'Updated',
					id: 'generated-id',
				},
				errors: [],
				isValid: true,
			}),
		);

		expect(updateAttribute('content', 'Updated')).toBe(true);
		expect(patches).toEqual([
			{
				content: 'Updated',
				id: 'generated-id',
			},
		]);
	});

	test('createAttributeUpdater includes removed top-level attributes in the patch', () => {
		type Attributes = {
			content: string;
			note?: string;
		};

		const patches: Array<Partial<Attributes>> = [];
		const updateAttribute = createAttributeUpdater(
			{ content: 'Hello', note: 'stale' },
			(patch) => {
				patches.push(patch);
			},
			(): ValidationResult<Attributes> => ({
				data: {
					content: 'Updated',
				},
				errors: [],
				isValid: true,
			}),
		);

		expect(updateAttribute('content', 'Updated')).toBe(true);
		expect(patches).toEqual([
			{
				content: 'Updated',
				note: undefined,
			},
		]);
	});

	test('createAttributeUpdater blocks invalid patches and reports the validation result and key', () => {
		const patches: Array<Partial<{ content: string; isVisible: boolean }>> = [];
		const validationErrors: Array<ValidationResult<{ content: string; isVisible: boolean }>> = [];
		const validationKeys: Array<'content' | 'isVisible'> = [];
		const updateAttribute = createAttributeUpdater(
			{ content: 'Hello', isVisible: true },
			(patch) => {
				patches.push(patch);
			},
			(): ValidationResult<{ content: string; isVisible: boolean }> => ({
				errors: [
					{
						expected: 'string',
						path: 'content',
						value: 123,
					},
				],
				isValid: false,
			}),
			(validation, key) => {
				validationErrors.push(validation);
				validationKeys.push(key);
			},
		);

		expect(updateAttribute('content', 'Still invalid')).toBe(false);
		expect(patches).toEqual([]);
		expect(validationErrors).toHaveLength(1);
		expect(validationKeys).toEqual(['content']);
		expect(validationErrors[0]?.errors[0]?.path).toBe('content');
	});

	test('createAttributeUpdater handles invalid patches without an error callback', () => {
		const patches: Array<Partial<{ content: string; isVisible: boolean }>> = [];
		const updateAttribute = createAttributeUpdater(
			{ content: 'Hello', isVisible: true },
			(patch) => {
				patches.push(patch);
			},
			(): ValidationResult<{ content: string; isVisible: boolean }> => ({
				errors: [
					{
						expected: 'string',
						path: 'content',
						value: 123,
					},
				],
				isValid: false,
			}),
		);

		expect(updateAttribute('content', 'Still invalid')).toBe(false);
		expect(patches).toEqual([]);
	});

	test('toNestedAttributePatch creates a top-level patch for dotted paths without mutating the source object', () => {
		const attributes = {
			content: 'Hello',
			padding: {
				bottom: 4,
				left: 4,
				right: 4,
				top: 4,
			},
		};

		const patch = toNestedAttributePatch(attributes, 'padding.top', 12);

		expect(patch).toEqual({
			padding: {
				bottom: 4,
				left: 4,
				right: 4,
				top: 12,
			},
		});
		expect(attributes.padding.top).toBe(4);
	});

	test('mergeNestedAttributeUpdate applies dotted path updates to the next validation payload', () => {
		const attributes = {
			content: 'Hello',
			padding: {
				bottom: 4,
				left: 4,
				right: 4,
				top: 4,
			},
		};

		expect(mergeNestedAttributeUpdate(attributes, 'padding.left', 16)).toEqual({
			content: 'Hello',
			padding: {
				bottom: 4,
				left: 16,
				right: 4,
				top: 4,
			},
		});
	});

	test('createNestedAttributeUpdater applies valid dotted path patches', () => {
		const patches: Array<
			Partial<{
				content: string;
				padding: { bottom: number; left: number; right: number; top: number };
			}>
		> = [];
		const updateAttribute = createNestedAttributeUpdater(
			{
				content: 'Hello',
				padding: {
					bottom: 4,
					left: 4,
					right: 4,
					top: 4,
				},
			},
			(patch) => {
				patches.push(patch);
			},
			(value): ValidationResult<{
				content: string;
				padding: { bottom: number; left: number; right: number; top: number };
			}> => ({
				data: value,
				errors: [],
				isValid: true,
			}),
		);

		expect(updateAttribute('padding.top', 24)).toBe(true);
		expect(patches).toEqual([
			{
				padding: {
					bottom: 4,
					left: 4,
					right: 4,
					top: 24,
				},
			},
		]);
	});

	test('createNestedAttributeUpdater applies normalized validation data when provided', () => {
		const patches: Array<
			Partial<{
				resourceKey: string;
				padding: { bottom: number; left: number; right: number; top: number };
			}>
		> = [];
		const updateAttribute = createNestedAttributeUpdater(
			{
				resourceKey: '',
				padding: {
					bottom: 4,
					left: 4,
					right: 4,
					top: 4,
				},
			},
			(patch) => {
				patches.push(patch);
			},
			(): ValidationResult<{
				resourceKey: string;
				padding: { bottom: number; left: number; right: number; top: number };
			}> => ({
				data: {
					resourceKey: 'generated-resource-key',
					padding: {
						bottom: 4,
						left: 4,
						right: 4,
						top: 24,
					},
				},
				errors: [],
				isValid: true,
			}),
		);

		expect(updateAttribute('padding.top', 24)).toBe(true);
		expect(patches).toEqual([
			{
				resourceKey: 'generated-resource-key',
				padding: {
					bottom: 4,
					left: 4,
					right: 4,
					top: 24,
				},
			},
		]);
	});

	test('createNestedAttributeUpdater blocks invalid dotted path patches and reports the path', () => {
		const patches: Array<
			Partial<{
				content: string;
				padding: { bottom: number; left: number; right: number; top: number };
			}>
		> = [];
		const validationPaths: string[] = [];
		const updateAttribute = createNestedAttributeUpdater(
			{
				content: 'Hello',
				padding: {
					bottom: 4,
					left: 4,
					right: 4,
					top: 4,
				},
			},
			(patch) => {
				patches.push(patch);
			},
			(): ValidationResult<{
				content: string;
				padding: { bottom: number; left: number; right: number; top: number };
			}> => ({
				errors: [
					{
						expected: 'number',
						path: 'padding.top',
						value: -1,
					},
				],
				isValid: false,
			}),
			( validation, path ) => {
				validationPaths.push(path);
				expect(validation.errors[0]?.path).toBe('padding.top');
			},
		);

		expect(updateAttribute('padding.top', -1)).toBe(false);
		expect(patches).toEqual([]);
		expect(validationPaths).toEqual(['padding.top']);
	});

	test('createScaffoldValidatorToolkit default updater sanitizes live edits with finalize hooks', () => {
		type Attributes = {
			content: string;
			id: string;
		};

		const patches: Array<Partial<Attributes>> = [];
		const scaffoldValidators = createScaffoldValidatorToolkit<Attributes>({
			assert: (value): Attributes => {
				if (
					typeof value === 'object' &&
					value !== null &&
					typeof (value as Partial<Attributes>).content === 'string' &&
					(value as Partial<Attributes>).content!.length > 0 &&
					typeof (value as Partial<Attributes>).id === 'string' &&
					(value as Partial<Attributes>).id!.length > 0
				) {
					return value as Attributes;
				}

				throw new Error('invalid attributes');
			},
			clone: (value) => ({ ...value }),
			finalize: (value) => ({
				...value,
				id:
					typeof value.id === 'string' && value.id.length > 0
						? value.id
						: 'generated-id',
			}),
			is: (value): value is Attributes =>
				typeof value === 'object' &&
				value !== null &&
				typeof (value as Partial<Attributes>).content === 'string' &&
				typeof (value as Partial<Attributes>).id === 'string',
			manifest: {
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
							defaultValue: null,
							hasDefault: false,
						},
					},
					id: {
						ts: {
							items: null,
							kind: 'string',
							properties: null,
							required: true,
							union: null,
						},
						typia: {
							defaultValue: null,
							hasDefault: false,
						},
					},
				},
			},
			prune: (value) => value,
			random: () => ({
				content: 'random',
				id: 'random-id',
			}),
			validate: (value) => {
				const attributes = value as Partial<Attributes>;
				const isValid =
					typeof attributes.content === 'string' &&
					attributes.content.length > 0 &&
					typeof attributes.id === 'string' &&
					attributes.id.length > 0;

				return {
					data: isValid ? value : undefined,
					errors: isValid
						? []
						: [
								{
									expected: 'string',
									path: 'id',
									value: attributes.id,
								},
						  ],
					success: isValid,
				};
			},
		});

		const updateAttribute = scaffoldValidators.createAttributeUpdater(
			{ content: 'Hello', id: '' },
			(patch) => {
				patches.push(patch);
			},
		);

		expect(updateAttribute('content', 'Updated')).toBe(true);
		expect(patches).toEqual([
			{
				content: 'Updated',
				id: 'generated-id',
			},
		]);
	});

	test('createScaffoldValidatorToolkit rethrows unexpected finalize failures', () => {
		type Attributes = {
			content: string;
			id: string;
		};

		const scaffoldValidators = createScaffoldValidatorToolkit<Attributes>({
			assert: (value): Attributes => value as Attributes,
			clone: (value) => ({ ...value }),
			finalize: () => {
				throw new Error('finalize exploded');
			},
			is: (_value): _value is Attributes => true,
			manifest: {
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
							defaultValue: null,
							hasDefault: false,
						},
					},
					id: {
						ts: {
							items: null,
							kind: 'string',
							properties: null,
							required: true,
							union: null,
						},
						typia: {
							defaultValue: null,
							hasDefault: false,
						},
					},
				},
			},
			prune: (value) => value,
			random: () => ({
				content: 'random',
				id: 'random-id',
			}),
			validate: () => ({
				data: {
					content: 'Updated',
					id: 'generated-id',
				},
				errors: [],
				success: true,
			}),
		});

		const updateAttribute = scaffoldValidators.createAttributeUpdater(
			{ content: 'Hello', id: '' },
			() => {},
		);

		expect(() => updateAttribute('content', 'Updated')).toThrow('finalize exploded');
	});
});
