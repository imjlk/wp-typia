import { applyTemplateDefaultsFromManifest } from './defaults.js';
import type { ManifestDefaultsDocument } from './defaults.js';
import {
  isPlainObject as isRecord,
  normalizeValidationError as normalizeSharedValidationError,
  toValidationResult as toSharedValidationResult,
  type ValidationError as SharedValidationError,
  type ValidationLike as SharedValidationLike,
  type ValidationResult as SharedValidationResult,
} from '@wp-typia/api-client/runtime-primitives';

export type TypiaValidationError = SharedValidationError;

export type ValidationResult<T> = SharedValidationResult<T>;

export interface ValidationState<T> extends ValidationResult<T> {
  errorMessages: string[];
}

export interface ValidationHookBindings {
  useMemo: <S>(factory: () => S, deps: readonly unknown[]) => S;
}

export interface ScaffoldValidatorToolkitOptions<T extends object> {
  assert: (value: unknown) => T;
  clone: (value: T) => T;
  finalize?: (value: Partial<T>) => unknown;
  is: (value: unknown) => value is T;
  manifest: ManifestDefaultsDocument;
  onValidationError?: (result: ValidationResult<T>, key: keyof T) => void;
  prune: (value: T) => unknown;
  random: (...args: unknown[]) => T;
  validate: (value: unknown) => unknown;
}

const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function getValueType(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function redactValidationErrors(
  errors: readonly TypiaValidationError[],
): Array<Pick<TypiaValidationError, 'description' | 'expected' | 'path'>> {
  return errors.map(({ description, expected, path }) => ({
    description,
    expected,
    path,
  }));
}

export function normalizeValidationError(error: unknown): TypiaValidationError {
  return normalizeSharedValidationError(error);
}

export function toValidationResult<T>(result: unknown): ValidationResult<T> {
  return toSharedValidationResult<T>(result as SharedValidationLike<T>);
}

export function formatValidationError(error: TypiaValidationError): string {
  return `${error.path}: ${error.expected} expected, got ${getValueType(error.value)}`;
}

export function formatValidationErrors(
  errors: readonly TypiaValidationError[],
): string[] {
  return errors.map(formatValidationError);
}

export function toValidationState<T>(
  result: ValidationResult<T>,
): ValidationState<T> {
  return {
    ...result,
    errorMessages: formatValidationErrors(result.errors),
  };
}

/**
 * Create a React-style hook that memoizes Typia validation results.
 *
 * @param bindings - Hook bindings supplied by the host runtime.
 * @returns A hook that validates one value and returns formatted error state.
 * @example
 * ```ts
 * const useTypiaValidation = createUseTypiaValidationHook({ useMemo });
 * ```
 * @category Scaffolding
 */
export function createUseTypiaValidationHook(bindings: ValidationHookBindings) {
  const { useMemo } = bindings;
  return function useTypiaValidation<T>(
    value: T,
    validator: (value: T) => ValidationResult<T>,
  ): ValidationState<T> {
    return useMemo(
      () => toValidationState(validator(value)),
      [value, validator],
    );
  };
}

/**
 * Create the validator toolkit used by generated scaffold runtimes.
 *
 * @remarks
 * The toolkit applies manifest defaults before validation and exposes safe
 * attribute updater helpers for editor integrations.
 *
 * @param options - Typia validators plus manifest-default metadata.
 * @returns Sanitizers, validators, and updater factories for scaffold attributes.
 * @example
 * ```ts
 * const toolkit = createScaffoldValidatorToolkit({
 *   assert,
 *   clone,
 *   is,
 *   manifest,
 *   prune,
 *   random,
 *   validate,
 * });
 * ```
 * @category Scaffolding
 */
export function createScaffoldValidatorToolkit<T extends object>(
  options: ScaffoldValidatorToolkitOptions<T>,
) {
  const {
    assert,
    clone,
    finalize,
    is,
    manifest,
    onValidationError = (validation, key) => {
    console.error(
      `Validation failed for ${String(key)}:`,
      redactValidationErrors(validation.errors),
    );
  },
    prune,
    random,
    validate,
  } = options;
  const validateAttributes = (value: unknown): ValidationResult<T> =>
    toValidationResult<T>(validate(value));

  const normalizeAttributes = (value: Partial<T>): unknown => {
    const normalized = applyTemplateDefaultsFromManifest<T>(manifest, value);

    return finalize ? finalize(normalized) : normalized;
  };

  const sanitizeAttributes = (value: Partial<T>): T =>
    assert(normalizeAttributes(value));

  const validateSanitizedAttributes = (value: T): ValidationResult<T> => {
    const normalized = normalizeAttributes(value);

    try {
      const data = assert(normalized);

      return {
        data,
        errors: [],
        isValid: true,
      };
    } catch {
      return validateAttributes(value);
    }
  };

  const createScaffoldAttributeUpdater = (
    attributes: T,
    setAttributes: (attrs: Partial<T>) => void,
    validator: (value: T) => ValidationResult<T> = validateSanitizedAttributes,
  ) =>
    createAttributeUpdater(
      attributes,
      setAttributes,
      validator,
      onValidationError,
    );

  return {
    createAttributeUpdater: createScaffoldAttributeUpdater,
    sanitizeAttributes,
    validateAttributes,
    validators: {
      assert,
      clone,
      is,
      prune,
      random,
      validate: validateAttributes,
    },
  };
}

function toChangedAttributePatch<T extends object>(
  attributes: T,
  nextAttributes: T,
): Partial<T> {
  const patch: Partial<T> = {};
  const keys = new Set<keyof T>([
    ...(Object.keys(attributes) as Array<keyof T>),
    ...(Object.keys(nextAttributes) as Array<keyof T>),
  ]);

  for (const key of keys) {
    if (!(key in nextAttributes)) {
      patch[key] = undefined as T[keyof T];
      continue;
    }
    if (!Object.is(attributes[key], nextAttributes[key])) {
      patch[key] = nextAttributes[key];
    }
  }

  return patch;
}

function mergeAttributeUpdate<T extends object, K extends keyof T>(
  attributes: T,
  key: K,
  value: T[K],
): T {
  return {
    ...attributes,
    [key]: value,
  } as T;
}

function getNestedPathSegments(path: string): string[] {
  const segments = path.split('.').filter(Boolean);

  if (segments.length === 0) {
    throw new Error(
      'Nested attribute paths must contain at least one segment.',
    );
  }

  if (segments.some((segment) => UNSAFE_PATH_SEGMENTS.has(segment))) {
    throw new Error(`Unsupported nested attribute path: ${path}`);
  }

  return segments;
}

function updateNestedRecord(
  current: Record<string, unknown> | undefined,
  segments: readonly string[],
  value: unknown,
): Record<string, unknown> {
  const [head, ...rest] = segments;
  if (typeof head !== 'string') {
    return current ?? {};
  }

  if (rest.length === 0) {
    return {
      ...(current ?? {}),
      [head]: value,
    };
  }

  const nextCurrent =
    current && isRecord(current[head])
      ? (current[head] as Record<string, unknown>)
      : undefined;

  return {
    ...(current ?? {}),
    [head]: updateNestedRecord(nextCurrent, rest, value),
  };
}

/**
 * Create a shallow attribute updater that validates before committing changes.
 *
 * @param attributes - Current attribute snapshot.
 * @param setAttributes - Setter used to apply validated patches.
 * @param validate - Validator used to check the next attribute state.
 * @param onValidationError - Optional callback for rejected updates.
 * @returns A keyed updater that returns `true` when the patch is accepted.
 * @example
 * ```ts
 * const update = createAttributeUpdater(attributes, setAttributes, validate);
 * ```
 * @category Scaffolding
 */
export function createAttributeUpdater<T extends object>(
  attributes: T,
  setAttributes: (attrs: Partial<T>) => void,
  validate: (value: T) => ValidationResult<T>,
  onValidationError?: (result: ValidationResult<T>, key: keyof T) => void,
) {
  return <K extends keyof T>(key: K, value: T[K]) => {
    const nextAttributes = mergeAttributeUpdate(attributes, key, value);
    const validation = validate(nextAttributes);

    if (validation.isValid) {
      const patch =
        validation.data && typeof validation.data === 'object'
          ? toChangedAttributePatch(attributes, validation.data)
          : (toAttributePatch<T, K>(key, value) as Partial<T>);

      setAttributes(patch);
      return true;
    }

    onValidationError?.(validation, key);
    return false;
  };
}

export function mergeNestedAttributeUpdate<T extends object>(
  attributes: T,
  path: string,
  value: unknown,
): T {
  return {
    ...attributes,
    ...toNestedAttributePatch(attributes, path, value),
  } as T;
}

export function toAttributePatch<T, K extends keyof T>(
  key: K,
  value: T[K],
): Pick<T, K> {
  return {
    [key]: value,
  } as Pick<T, K>;
}

export function toNestedAttributePatch<T extends object>(
  attributes: T,
  path: string,
  value: unknown,
): Partial<T> {
  const [root, ...rest] = getNestedPathSegments(path);

  if (rest.length === 0) {
    return toAttributePatch(root as keyof T, value as T[keyof T]) as Partial<T>;
  }

  const currentRoot = isRecord((attributes as Record<string, unknown>)[root])
    ? ((attributes as Record<string, unknown>)[root] as Record<string, unknown>)
    : undefined;

  return {
    [root]: updateNestedRecord(currentRoot, rest, value),
  } as Partial<T>;
}

/**
 * Create a nested attribute updater that validates dotted-path updates.
 *
 * @param attributes - Current attribute snapshot.
 * @param setAttributes - Setter used to apply validated patches.
 * @param validate - Validator used to check the next attribute state.
 * @param onValidationError - Optional callback for rejected nested updates.
 * @returns A path-based updater that returns `true` when the patch is accepted.
 * @example
 * ```ts
 * const updatePath = createNestedAttributeUpdater(attributes, setAttributes, validate);
 * ```
 * @category Scaffolding
 */
export function createNestedAttributeUpdater<T extends object>(
  attributes: T,
  setAttributes: (attrs: Partial<T>) => void,
  validate: (value: T) => ValidationResult<T>,
  onValidationError?: (result: ValidationResult<T>, path: string) => void,
) {
  return (path: string, value: unknown) => {
    const nextAttributes = mergeNestedAttributeUpdate(attributes, path, value);
    const validation = validate(nextAttributes);

    if (validation.isValid) {
      const patch =
        validation.data && typeof validation.data === 'object'
          ? toChangedAttributePatch(attributes, validation.data)
          : toNestedAttributePatch(attributes, path, value);

      setAttributes(patch);
      return true;
    }

    onValidationError?.(validation, path);
    return false;
  };
}
