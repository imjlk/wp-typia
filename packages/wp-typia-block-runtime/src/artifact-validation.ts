import { isPlainObject } from './object-utils.js';

export function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }

  if (isPlainObject(value)) {
    return Object.values(value).every((entry) => isJsonValue(entry));
  }

  return false;
}

export function isNullableBoolean(value: unknown): value is boolean | null | undefined {
  return value === undefined || value === null || typeof value === 'boolean';
}

export function isNullableFiniteNumber(
  value: unknown,
): value is number | null | undefined {
  return value === undefined || value === null || (typeof value === 'number' && Number.isFinite(
    value,
  ));
}

export function isNullableJsonValue(value: unknown): boolean {
  return value === undefined || isJsonValue(value);
}

export function isNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

export function isRecordOf<TValue>(
  value: unknown,
  predicate: (entry: unknown) => entry is TValue,
): value is Record<string, TValue> {
  return (
    isPlainObject(value) &&
    Object.values(value).every((entry) => predicate(entry))
  );
}
