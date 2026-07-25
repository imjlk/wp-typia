/**
 * Create a deep clone of a JSON-serializable value.
 *
 * @remarks
 * Values that are not JSON-serializable, such as functions, `undefined`,
 * `BigInt`, class instances, and `Date` objects, are not preserved faithfully.
 *
 * @param value JSON-compatible data to clone.
 * @returns A deep-cloned copy created with `JSON.parse(JSON.stringify(...))`.
 * @category Utilities
 */
export function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
