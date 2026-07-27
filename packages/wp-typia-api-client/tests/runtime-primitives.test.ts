import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import * as apiClient from '../src/index';
import * as publicRuntimePrimitives from '../src/runtime-primitives';
import {
  isPlainObject,
  normalizeValidationError,
  toValidationResult,
} from '../src/internal/runtime-primitives';

describe('@wp-typia/api-client internal runtime primitives', () => {
	test('publishes the internal helper subpath without widening the root surface', () => {
		const packageJson = JSON.parse(
			readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
		) as {
			exports?: Record<string, unknown>;
		};

		expect(packageJson.exports?.['./internal/runtime-primitives']).toEqual({
			default: './dist/internal/runtime-primitives.js',
			import: './dist/internal/runtime-primitives.js',
			types: './dist/internal/runtime-primitives.d.ts',
		});
		expect(packageJson.exports?.['./runtime-primitives']).toEqual({
			default: './dist/runtime-primitives.js',
			import: './dist/runtime-primitives.js',
			types: './dist/runtime-primitives.d.ts',
		});
		expect('isPlainObject' in apiClient).toBe(false);
		expect('isFormDataLike' in apiClient).toBe(false);
		expect('normalizePath' in apiClient).toBe(false);
		expect('normalizeExpected' in apiClient).toBe(false);
		expect('normalizeValidationError' in apiClient).toBe(true);
		expect('toValidationResult' in apiClient).toBe(true);
	});

	test('uses prototype-aware plain-object semantics', () => {
		class DemoRecord {
			value = true;
		}

		expect(isPlainObject({ nested: { value: true } })).toBe(true);
		expect(isPlainObject(Object.create(null))).toBe(true);
		expect(isPlainObject([])).toBe(false);
		expect(isPlainObject(null)).toBe(false);
		expect(isPlainObject('demo')).toBe(false);
		expect(isPlainObject(3)).toBe(false);
		expect(isPlainObject(new Date())).toBe(false);
		expect(isPlainObject(new Map())).toBe(false);
		expect(isPlainObject(new DemoRecord())).toBe(false);
		expect(typeof publicRuntimePrimitives.isPlainObject).toBe('function');
		expect(publicRuntimePrimitives.isPlainObject(Object.create(null))).toBe(true);
	});

	test('normalizes validation-like payloads through the shared helper owner', () => {
		expect(
			normalizeValidationError({
				value: 99,
			}),
		).toEqual({
			description: undefined,
			expected: 'unknown',
			path: '(root)',
			value: 99,
		});

		expect(
			toValidationResult({
				errors: [
					null,
					{
						expected: 'string',
						path: 'body.title',
						value: 7,
					},
				],
				success: false,
			}),
		).toEqual({
			data: undefined,
			errors: [
				{
					description: undefined,
					expected: 'unknown',
					path: '(root)',
					value: undefined,
				},
				{
					description: undefined,
					expected: 'string',
					path: 'body.title',
					value: 7,
				},
			],
			isValid: false,
		});
	});

	test('tolerates malformed typia-like payloads without throwing', () => {
		expect(toValidationResult(null)).toEqual({
			data: undefined,
			errors: [],
			isValid: false,
		});
		expect(
			toValidationResult({
				data: 'unexpected',
				success: 'yes',
			}),
		).toEqual({
			data: undefined,
			errors: [],
			isValid: false,
		});
	});
});
