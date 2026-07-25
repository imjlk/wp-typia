import { isObjectRecord } from './object-utils.js';

export interface NormalizeStaticRegistrationValueOptions {
  readonly description: string;
}

export function normalizeStaticRegistrationValue(
  value: unknown,
  path: string,
  options: NormalizeStaticRegistrationValueOptions,
): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return value;
  }
  if (typeof value === 'function') {
    throw new Error(
      `Cannot generate static ${options.description} registration code for function value at ${path}.`,
    );
  }
  if (typeof value === 'bigint' || typeof value === 'symbol') {
    throw new Error(
      `Cannot generate static ${options.description} registration code for ${typeof value} value at ${path}.`,
    );
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      normalizeStaticRegistrationValue(entry, `${path}[${index}]`, options),
    );
  }
  if (isObjectRecord(value)) {
    const normalized: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      const nextValue = normalizeStaticRegistrationValue(
        nestedValue,
        `${path}.${key}`,
        options,
      );

      if (nextValue !== undefined) {
        normalized[key] = nextValue;
      }
    }

    return normalized;
  }

  throw new Error(
    `Cannot generate static ${options.description} registration code for unsupported value at ${path}.`,
  );
}
