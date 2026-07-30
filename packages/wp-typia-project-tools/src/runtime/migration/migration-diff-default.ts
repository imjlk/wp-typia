import {
  getManifestDefaultValue,
  hasManifestDefault,
} from './migration-manifest.js';
import type { ManifestAttribute } from './migration-types.js';

/**
 * Compare two JSON-serializable default values for equality. Default values are
 * projected from the manifest, so structural deep equality via JSON stringification
 * is sufficient and mirrors how the runtime coercion layer materializes defaults.
 */
function areDefaultValuesEqual(
  oldValue: unknown,
  newValue: unknown,
): boolean {
  return JSON.stringify(oldValue) === JSON.stringify(newValue);
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

  return `default ${JSON.stringify(getManifestDefaultValue(oldAttribute))} -> ${JSON.stringify(getManifestDefaultValue(newAttribute))}`;
}
