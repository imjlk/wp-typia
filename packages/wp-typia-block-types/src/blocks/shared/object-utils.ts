export function isNonArrayObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isObjectRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (!isNonArrayObject(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}
