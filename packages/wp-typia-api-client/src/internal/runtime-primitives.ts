import type { IValidation } from "@typia/interface";

/**
 * Describe one normalized validation failure.
 *
 * @category Types
 */
export interface ValidationError {
	description?: string | undefined;
	expected: string;
	path: string;
	value: unknown;
}

/**
 * Represent the shared success/error shape used by internal validation helpers.
 *
 * @category Types
 */
export interface ValidationResult<T> {
	data?: T | undefined;
	errors: ValidationError[];
	isValid: boolean;
}

/**
 * Accept either Typia validation output or a compatible validation-like shape.
 *
 * @category Types
 */
export type ValidationLike<T> =
	| IValidation<T>
	| {
			data?: unknown;
			errors?: unknown;
			success?: unknown;
	  };

/**
 * Describe one untrusted validation error payload before normalization.
 *
 * @category Types
 */
export interface RawValidationError {
	description?: string;
	expected?: string;
	path?: string;
	value?: unknown;
}

/**
 * Check whether a value is a plain object record.
 *
 * @param value Value to test before reading validation fields from it.
 * @returns `true` when the value uses the default object prototype or no prototype.
 * @category Utilities
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

/**
 * Check whether a value behaves like a browser `FormData` instance.
 *
 * @param value Value to test before transport serialization.
 * @returns `true` when the current runtime exposes `FormData` and the value is an instance of it.
 * @category Utilities
 */
export function isFormDataLike(value: unknown): value is FormData {
	return typeof FormData !== "undefined" && value instanceof FormData;
}

/**
 * Normalize a validation path into a user-facing label.
 *
 * @param path Raw path value from an untrusted validation payload.
 * @returns A non-empty path label, falling back to `"(root)"` when missing.
 * @category Validation
 */
export function normalizePath(path: unknown): string {
	return typeof path === "string" && path.length > 0 ? path : "(root)";
}

/**
 * Normalize the expected-type label from a validation payload.
 *
 * @param expected Raw expectation value from a validation payload.
 * @returns A non-empty expectation string, falling back to `"unknown"` when missing.
 * @category Validation
 */
export function normalizeExpected(expected: unknown): string {
	return typeof expected === "string" && expected.length > 0
		? expected
		: "unknown";
}

/**
 * Convert one unknown validation error into the shared normalized shape.
 *
 * @param error Raw validation error payload from Typia or a transport adapter.
 * @returns A normalized validation error with stable `path`, `expected`, and `value` fields.
 * @category Validation
 */
export function normalizeValidationError(error: unknown): ValidationError {
	const raw = isPlainObject(error) ? (error as RawValidationError) : {};

	return {
		description:
			typeof raw.description === "string" ? raw.description : undefined,
		expected: normalizeExpected(raw.expected),
		path: normalizePath(raw.path),
		value: Object.prototype.hasOwnProperty.call(raw, "value")
			? raw.value
			: undefined,
	};
}

/**
 * Check whether a value already matches the shared validation result shape.
 *
 * @param value Raw result value to inspect before normalization.
 * @returns `true` when the value exposes `isValid` and an `errors` array.
 * @category Validation
 */
export function isValidationResult<T>(
	value: unknown
): value is ValidationResult<T> {
	return (
		isPlainObject(value) &&
		typeof value.isValid === "boolean" &&
		Array.isArray(value.errors)
	);
}

/**
 * Normalize unknown validation output into the shared internal result shape.
 *
 * @param result Raw result returned from Typia or a compatible validation adapter.
 * @returns A normalized validation result that callers can inspect without adapter-specific branches.
 * @category Validation
 */
export function toValidationResult<T>(result: unknown): ValidationResult<T> {
	const rawResult = isPlainObject(result)
		? (result as {
				data?: unknown;
				errors?: unknown;
				success?: unknown;
			})
		: {};

	if (isValidationResult<T>(result)) {
		return result;
	}

	if (rawResult.success === true) {
		return {
			data: rawResult.data as T | undefined,
			errors: [],
			isValid: true,
		};
	}

	return {
		data: undefined,
		errors: Array.isArray(rawResult.errors)
			? rawResult.errors.map(normalizeValidationError)
			: [],
		isValid: false,
	};
}
