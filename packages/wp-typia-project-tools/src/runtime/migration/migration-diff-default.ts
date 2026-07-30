import {
  getManifestDefaultValue,
  hasManifestDefault,
} from './migration-manifest.js';
import type { ManifestAttribute } from './migration-types.js';

/**
 * Compare two JSON-serializable default values for deep equality.
 *
 * Uses order-independent comparison so that object-key reordering between
 * manifest snapshots does not falsely produce a default-change outcome.
 * Arrays are compared element-wise in order, matching how the runtime
 * coercion layer materializes defaults.
 */
function areDefaultValuesEqual(
  oldValue: unknown,
  newValue: unknown,
): boolean {
  if (oldValue === newValue) {
    return true;
  }
  if (typeof oldValue !== typeof newValue) {
    return false;
  }
  if (Array.isArray(oldValue) && Array.isArray(newValue)) {
    return (
      oldValue.length === newValue.length &&
      oldValue.every((value, index) =>
        areDefaultValuesEqual(value, newValue[index]),
      )
    );
  }
  if (
    typeof oldValue === 'object' &&
    oldValue !== null &&
    typeof newValue === 'object' &&
    newValue !== null &&
    !Array.isArray(newValue)
  ) {
    const oldKeys = Object.keys(oldValue as Record<string, unknown>);
    const newKeys = Object.keys(newValue as Record<string, unknown>);
    return (
      oldKeys.length === newKeys.length &&
      oldKeys.every(
        (key) =>
          key in (newValue as Record<string, unknown>) &&
          areDefaultValuesEqual(
            (oldValue as Record<string, unknown>)[key],
            (newValue as Record<string, unknown>)[key],
          ),
      )
    );
  }
  return false;
}

/**
 * Detect whether a default value changed between two manifest attribute snapshots.
 *
 * A change in `hasDefault` (a default appearing or disappearing) or a change in
 * the projected default value itself both count as default changes. Attributes
 * without defaults on either side are considered unchanged.
 *
 * @param oldAttribute Legacy manifest attribute snapshot.
 * @param newAttribute Current manifest attribute snapshot.
 * @returns True when the default value differs between the two snapshots.
 */
export function hasDefaultChange(
  oldAttribute: ManifestAttribute,
  newAttribute: ManifestAttribute,
): boolean {
  const oldHasDefault = hasManifestDefault(oldAttribute);
  const newHasDefault = hasManifestDefault(newAttribute);

  if (!oldHasDefault && !newHasDefault) {
    return false;
  }
  if (oldHasDefault !== newHasDefault) {
    return true;
  }

  return !areDefaultValuesEqual(
    getManifestDefaultValue(oldAttribute),
    getManifestDefaultValue(newAttribute),
  );
}

/**
 * Describe a default value change for diff output.
 *
 * @param oldAttribute Legacy manifest attribute snapshot.
 * @param newAttribute Current manifest attribute snapshot.
 * @returns A human-readable description of the default value transition.
 */
export function describeDefaultChange(
  oldAttribute: ManifestAttribute,
  newAttribute: ManifestAttribute,
): string {
  const oldHasDefault = hasManifestDefault(oldAttribute);
  const newHasDefault = hasManifestDefault(newAttribute);

  if (!oldHasDefault && newHasDefault) {
    return `default added: ${JSON.stringify(getManifestDefaultValue(newAttribute))}`;
  }
  if (oldHasDefault && !newHasDefault) {
    return `default removed: ${JSON.stringify(getManifestDefaultValue(oldAttribute))}`;
  }
  if (!oldHasDefault && !newHasDefault) {
    return 'default unchanged';
  }

  return `default ${JSON.stringify(getManifestDefaultValue(oldAttribute))} -> ${JSON.stringify(getManifestDefaultValue(newAttribute))}`;
}
