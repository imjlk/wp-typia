import { describe, expect, test } from 'bun:test';

import * as apiClientRuntimePrimitives from '../../wp-typia-api-client/src/runtime-primitives';

import * as restRoot from '../src/index';
import * as restInternal from '../src/internal/runtime-primitives';

describe('@wp-typia/rest runtime primitive shims', () => {
	test('forwards shared helpers from api-client with matching behavior', () => {
		expect(typeof restInternal.isPlainObject).toBe('function');
		expect(restInternal.isPlainObject(Object.create(null))).toBe(true);
		expect(typeof restInternal.isFormDataLike).toBe('function');
		expect(restInternal.isFormDataLike(new FormData())).toBe(true);
		expect(
			restInternal.normalizeValidationError({
				expected: 'string',
				path: 'body.title',
				value: 7,
			}),
		).toEqual(
			apiClientRuntimePrimitives.normalizeValidationError({
				expected: 'string',
				path: 'body.title',
				value: 7,
			}),
		);
		expect(
			restInternal.toValidationResult({
				errors: [],
				success: true,
			}),
		).toEqual(
			apiClientRuntimePrimitives.toValidationResult({
				errors: [],
				success: true,
			}),
		);
		expect(
			restInternal.isValidationResult({
				errors: [],
				isValid: true,
			}),
		).toBe(
			apiClientRuntimePrimitives.isValidationResult({
				errors: [],
				isValid: true,
			}),
		);
	});

	test('keeps validation normalization and form-data detection aligned', () => {
		const rawError = {
			description: 'Bad title',
			expected: 'string',
			path: 'body.title',
			value: 7,
		};
		const formData = new FormData();

		expect(restInternal.normalizeValidationError(rawError)).toEqual(
			apiClientRuntimePrimitives.normalizeValidationError(rawError),
		);
		expect(
			restInternal.toValidationResult({
				errors: [rawError],
				success: false,
			}),
		).toEqual(
			apiClientRuntimePrimitives.toValidationResult({
				errors: [rawError],
				success: false,
			}),
		);
		expect(restInternal.isFormDataLike(formData)).toBe(true);
		expect(apiClientRuntimePrimitives.isFormDataLike(formData)).toBe(true);
	});

	test('keeps the rest root surface transport-oriented', () => {
		expect('isPlainObject' in restRoot).toBe(false);
		expect('isFormDataLike' in restRoot).toBe(false);
		expect('normalizeValidationError' in restRoot).toBe(true);
		expect('isValidationResult' in restRoot).toBe(true);
		expect('toValidationResult' in restRoot).toBe(true);
	});
});
