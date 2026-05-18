import { isPlainObject as isSharedPlainObject } from '@wp-typia/api-client/runtime-primitives';

/**
 * Generic record type used for JSON-like plain-object inspection.
 */
export type UnknownRecord<TValue = unknown> = Record<string, TValue>;

/**
 * Delegate plain-object detection to the shared runtime primitive owner.
 *
 * @param value Runtime value to inspect.
 * @returns `true` when the value is a non-null plain object with an
 * `Object.prototype` or `null` prototype.
 */
export function isPlainObject(value: unknown): value is UnknownRecord {
  return isSharedPlainObject(value);
}

function toStableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => toStableJsonValue(entry));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) =>
          left < right ? -1 : left > right ? 1 : 0,
        )
        .map((key) => [key, toStableJsonValue(value[key])]),
    );
  }

  return value;
}

/**
 * Serialize JSON-like values with deterministic plain-object key ordering.
 *
 * Arrays preserve their declared order, while plain objects are normalized by
 * sorting keys recursively before calling `JSON.stringify`.
 */
export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(toStableJsonValue(value));
}
