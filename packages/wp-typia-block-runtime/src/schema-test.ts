import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';

import type { ValidationError, ValidationResult } from '@wp-typia/api-client';

export type GeneratedSchemaDocument = Record<string, unknown>;

export interface GeneratedSchemaValidatorOptions {
	/** Human-readable contract name used in assertion failures. */
  schemaName?: string;
}

export type GeneratedSchemaRegistry = Readonly<
	Record<string, GeneratedSchemaDocument>
>;

export interface NamedGeneratedSchemaOptions
	extends GeneratedSchemaValidatorOptions {
	/** Registry keyed by TypeScript source type or another stable schema name. */
  schemas?: GeneratedSchemaRegistry;
}

interface ResolvedGeneratedSchema {
  schema: GeneratedSchemaDocument;
  schemaName: string;
}

const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;
const UINT32_MAX = 4_294_967_295;

let ajvInstance: Ajv2020 | null = null;
const validatorCache = new WeakMap<
	GeneratedSchemaDocument,
	ValidateFunction<unknown>
>();

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Error thrown by `assertResponseMatchesSchema()` when a payload does not match
 * a generated JSON Schema artifact.
 *
 * @category Validation
 */
export class SchemaResponseValidationError extends Error {
  readonly errors: ValidationError[];
  readonly schemaName: string;

  constructor(schemaName: string, errors: ValidationError[]) {
    const summary = errors
			.map((error) => {
				const description = error.description ?? error.expected;
				return `${error.path}: ${description}`;
			})
			.join('; ');

    super(
      `Response payload did not match generated schema "${schemaName}": ${summary}`,
    );
    this.name = 'SchemaResponseValidationError';
    this.errors = errors;
    this.schemaName = schemaName;
  }
}

function getAjv(): Ajv2020 {
  if (ajvInstance !== null) {
    return ajvInstance;
  }

  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
  });

  ajv.addKeyword({
		keyword: 'x-typeTag',
		schemaType: 'string',
		validate(typeTag: string, data: unknown): boolean {
			switch (typeTag) {
				case 'int32':
					return (
						isFiniteNumber(data) &&
						Number.isInteger(data) &&
						data >= INT32_MIN &&
						data <= INT32_MAX
					);
				case 'uint32':
					return (
						isFiniteNumber(data) &&
						Number.isInteger(data) &&
						data >= 0 &&
						data <= UINT32_MAX
					);
				case 'uint64':
					return (
						isFiniteNumber(data) &&
						Number.isInteger(data) &&
						data >= 0 &&
						data <= Number.MAX_SAFE_INTEGER
					);
				case 'float':
				case 'double':
					return isFiniteNumber(data);
				default:
					return false;
			}
		},
	});

  ajvInstance = ajv;
  return ajv;
}

function getSchemaTitle(schema: GeneratedSchemaDocument): string | undefined {
  return typeof schema.title === 'string' && schema.title.length > 0
    ? schema.title
    : undefined;
}

function resolveGeneratedSchema(
	schemaOrName: GeneratedSchemaDocument | string,
	options: NamedGeneratedSchemaOptions = {},
): ResolvedGeneratedSchema {
  if (typeof schemaOrName !== 'string') {
    return {
			schema: schemaOrName,
			schemaName:
				options.schemaName ?? getSchemaTitle(schemaOrName) ?? 'response',
		};
  }

  const schema = options.schemas?.[schemaOrName];
  if (!schema) {
    throw new Error(
      `Unable to find generated schema "${schemaOrName}". Pass it through the schemas option before asserting the response payload.`,
    );
  }

  return {
    schema,
    schemaName: options.schemaName ?? schemaOrName,
  };
}

function pointerSegmentToPath(segment: string): string {
  const value = segment.replace(/~1/gu, '/').replace(/~0/gu, '~');
  return /^\d+$/u.test(value) ? `[${value}]` : `.${value}`;
}

function jsonPointerToPath(pointer: string): string {
  if (pointer.length === 0) {
    return '$';
  }

  return `$${pointer
		.split('/')
		.slice(1)
		.map(pointerSegmentToPath)
		.join('')}`;
}

function appendPropertyPath(path: string, property: unknown): string {
  if (typeof property !== 'string' || property.length === 0) {
    return path;
  }

  return /^\d+$/u.test(property)
    ? `${path}[${property}]`
    : `${path}.${property}`;
}

function normalizeAjvPath(error: ErrorObject): string {
  const path = jsonPointerToPath(error.instancePath);

  if (
		error.keyword === 'required' &&
		typeof error.params.missingProperty === 'string'
	) {
    return appendPropertyPath(path, error.params.missingProperty);
  }

  if (
		error.keyword === 'additionalProperties' &&
		typeof error.params.additionalProperty === 'string'
	) {
    return appendPropertyPath(path, error.params.additionalProperty);
  }

  return path;
}

function normalizeAjvError(error: ErrorObject): ValidationError {
  return {
    description: error.message,
    expected: error.keyword,
    path: normalizeAjvPath(error),
    value: error.params,
  };
}

function getValidator<T>(
	schema: GeneratedSchemaDocument,
): ValidateFunction<T> {
  const cached = validatorCache.get(schema);
  if (cached) {
    return cached as ValidateFunction<T>;
  }

  const validator = getAjv().compile<T>(schema);
  validatorCache.set(schema, validator as ValidateFunction<unknown>);
  return validator;
}

/**
 * Create a reusable validator for one generated JSON Schema document.
 *
 * @param schema Generated `*.schema.json` document.
 * @returns A shared `ValidationResult`-shaped validator suitable for smoke tests.
 * @category Validation
 */
export function createGeneratedSchemaValidator<T = unknown>(
	schema: GeneratedSchemaDocument,
	_options: GeneratedSchemaValidatorOptions = {},
): (payload: unknown) => ValidationResult<T> {
  const validator = getValidator<T>(schema);

  return (payload: unknown): ValidationResult<T> => {
    if (validator(payload)) {
      return {
        data: payload as T,
        errors: [],
        isValid: true,
      };
    }

    return {
      data: undefined,
      errors: (validator.errors ?? []).map(normalizeAjvError),
      isValid: false,
    };
  };
}

/**
 * Create a reusable response validator for one generated JSON Schema document.
 *
 * @param schema Generated response `*.schema.json` document.
 * @returns A shared `ValidationResult`-shaped validator suitable for smoke tests.
 * @category Validation
 */
export function createResponseSchemaValidator<T = unknown>(
	schema: GeneratedSchemaDocument,
	options: GeneratedSchemaValidatorOptions = {},
): (payload: unknown) => ValidationResult<T> {
  return createGeneratedSchemaValidator<T>(schema, options);
}

/**
 * Validate a response payload against a generated schema document or named
 * schema registry entry.
 *
 * @param schemaOrName Generated schema document, or a schema name present in `options.schemas`.
 * @param payload Untrusted response payload to validate.
 * @param options Optional schema registry and display name.
 * @returns Shared validation result with field-level paths such as `$.count`.
 * @category Validation
 */
export function validateResponseMatchesSchema<T = unknown>(
	schemaOrName: GeneratedSchemaDocument | string,
	payload: unknown,
	options: NamedGeneratedSchemaOptions = {},
): ValidationResult<T> {
  const { schema } = resolveGeneratedSchema(schemaOrName, options);
  return createResponseSchemaValidator<T>(schema, options)(payload);
}

/**
 * Assert that a response payload matches a generated schema document or named
 * schema registry entry.
 *
 * @param schemaOrName Generated schema document, or a schema name present in `options.schemas`.
 * @param payload Untrusted response payload to validate.
 * @param options Optional schema registry and display name.
 * @returns The validated payload typed as `T`.
 * @throws {SchemaResponseValidationError} When validation fails.
 * @category Validation
 */
export function assertResponseMatchesSchema<T = unknown>(
	schemaOrName: GeneratedSchemaDocument | string,
	payload: unknown,
	options: NamedGeneratedSchemaOptions = {},
): T {
  const { schema, schemaName } = resolveGeneratedSchema(schemaOrName, options);
  const validation = createResponseSchemaValidator<T>(schema, {
		schemaName,
	})(payload);

  if (!validation.isValid) {
    throw new SchemaResponseValidationError(schemaName, validation.errors);
  }

  return validation.data as T;
}
