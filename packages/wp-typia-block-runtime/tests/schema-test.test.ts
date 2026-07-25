import { describe, expect, test } from 'bun:test';

import {
  SchemaResponseValidationError,
  assertResponseMatchesSchema,
  createGeneratedSchemaValidator,
  createResponseSchemaValidator,
  validateResponseMatchesSchema,
  type GeneratedSchemaDocument,
} from '../src/schema-test.js';

interface ExternalRetrieveResponse {
  count: number;
  items: string[];
  status: 'ok';
}

interface MetricResponse {
  ratio: number;
  velocity: number;
}

const externalRetrieveResponseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  additionalProperties: false,
  properties: {
    count: {
      type: 'integer',
      'x-typeTag': 'uint32',
    },
    items: {
      items: {
        type: 'string',
      },
      type: 'array',
    },
    status: {
      enum: ['ok'],
      type: 'string',
    },
  },
  required: ['count', 'items', 'status'],
  title: 'ExternalRetrieveResponse',
  type: 'object',
} satisfies GeneratedSchemaDocument;

const metricResponseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  additionalProperties: false,
  properties: {
    ratio: {
      type: 'number',
      'x-typeTag': 'double',
    },
    velocity: {
      type: 'number',
      'x-typeTag': 'float',
    },
  },
  required: ['ratio', 'velocity'],
  title: 'MetricResponse',
  type: 'object',
} satisfies GeneratedSchemaDocument;

describe('@wp-typia/block-runtime/schema-test', () => {
	test('validates generated response schemas through reusable validators', () => {
		const validate =
			createResponseSchemaValidator<ExternalRetrieveResponse>(
				externalRetrieveResponseSchema,
			);

		const valid = validate({
			count: 2,
			items: ['first', 'second'],
			status: 'ok',
		});
		expect(valid).toEqual({
			data: {
				count: 2,
				items: ['first', 'second'],
				status: 'ok',
			},
			errors: [],
			isValid: true,
		});

		const invalid = validate({
			count: -1,
			items: ['first', 2],
			status: 'ok',
			unexpected: true,
		});
		expect(invalid.isValid).toBe(false);
		expect(invalid.errors.map((error) => error.path)).toEqual([
			'$.unexpected',
			'$.count',
			'$.items[1]',
		]);
		expect(invalid.errors.map((error) => error.expected)).toEqual([
			'additionalProperties',
			'x-typeTag',
			'type',
		]);
	});

	test('accepts floating-point type tags for generated response schemas', () => {
		const validate =
			createResponseSchemaValidator<MetricResponse>(metricResponseSchema);

		const valid = validate({
			ratio: 0.125,
			velocity: -12.5,
		});
		expect(valid).toEqual({
			data: {
				ratio: 0.125,
				velocity: -12.5,
			},
			errors: [],
			isValid: true,
		});

		const invalid = validate({
			ratio: Number.POSITIVE_INFINITY,
			velocity: 'fast',
		});
		expect(invalid.isValid).toBe(false);
		expect(invalid.errors.map((error) => error.path)).toEqual([
			'$.ratio',
			'$.velocity',
			'$.velocity',
		]);
	});

	test('validates named generated schemas from a registry', () => {
		const valid = validateResponseMatchesSchema<ExternalRetrieveResponse>(
			'ExternalRetrieveResponse',
			{
				count: 1,
				items: [],
				status: 'ok',
			},
			{
				schemas: {
					ExternalRetrieveResponse: externalRetrieveResponseSchema,
				},
			},
		);

		expect(valid.isValid).toBe(true);

		expect(() =>
			validateResponseMatchesSchema('MissingResponse', {}, {
				schemas: {
					ExternalRetrieveResponse: externalRetrieveResponseSchema,
				},
			}),
		).toThrow(
			'Unable to find generated schema "MissingResponse". Pass it through the schemas option before asserting the response payload.',
		);
	});

	test('asserts response schemas with field-level failure paths', () => {
		const response = assertResponseMatchesSchema<ExternalRetrieveResponse>(
			externalRetrieveResponseSchema,
			{
				count: 3,
				items: ['first'],
				status: 'ok',
			},
		);

		expect(response.count).toBe(3);

		expect(() =>
			assertResponseMatchesSchema(
				'ExternalRetrieveResponse',
				{
					count: '3',
					items: [],
				},
				{
					schemas: {
						ExternalRetrieveResponse: externalRetrieveResponseSchema,
					},
				},
			),
		).toThrow(SchemaResponseValidationError);

		try {
			assertResponseMatchesSchema(
				'ExternalRetrieveResponse',
				{
					count: '3',
					items: [],
				},
				{
					schemas: {
						ExternalRetrieveResponse: externalRetrieveResponseSchema,
					},
				},
			);
		} catch (error) {
			expect(error).toBeInstanceOf(SchemaResponseValidationError);
			expect((error as SchemaResponseValidationError).schemaName).toBe(
				'ExternalRetrieveResponse',
			);
			expect((error as SchemaResponseValidationError).errors).toMatchObject([
				{
					expected: 'required',
					path: '$.status',
				},
				{
					expected: 'type',
					path: '$.count',
				},
				{
					expected: 'x-typeTag',
					path: '$.count',
				},
			]);
			expect((error as Error).message).toContain(
				'generated schema "ExternalRetrieveResponse"',
			);
		}
	});

	test('exposes a generic schema validator for non-response contract payloads', () => {
		const validate =
			createGeneratedSchemaValidator<ExternalRetrieveResponse>(
				externalRetrieveResponseSchema,
			);

		expect(
			validate({
				count: 0,
				items: [],
				status: 'ok',
			}).isValid,
		).toBe(true);
	});
});
