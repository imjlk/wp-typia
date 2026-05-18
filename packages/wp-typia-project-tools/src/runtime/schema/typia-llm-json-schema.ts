import { cloneJsonValue } from '../shared/json-utils.js';
import type { JsonSchemaObject } from './schema-core.js';

/**
 * Clone a JSON-compatible value when the caller has provided one.
 *
 * @template T JSON-compatible value type.
 * @param value Optional value to clone with the shared JSON clone helper.
 * @returns A cloned value, or undefined when the input is undefined.
 */
export function cloneJsonValueIfDefined<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : cloneJsonValue(value);
}

/**
 * Check whether a candidate is a non-null JSON Schema object.
 *
 * @param value Candidate value to narrow.
 * @returns True when the value is an object and not an array.
 */
export function isJsonSchemaObject(value: unknown): value is JsonSchemaObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Narrow a `typia.llm` artifact field before applying JSON Schema mutations.
 *
 * @param value Candidate schema value emitted by `typia.llm`.
 * @param context Human-readable artifact path for diagnostics.
 * @returns The value narrowed to the shared JSON Schema object shape.
 */
export function assertJsonSchemaObject(
  value: unknown,
  context: string,
): JsonSchemaObject {
  if (isJsonSchemaObject(value)) {
    return value;
  }

  throw new Error(`${context} must be a JSON Schema object.`);
}
