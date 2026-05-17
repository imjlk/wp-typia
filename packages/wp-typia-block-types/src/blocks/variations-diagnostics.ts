import { getDiagnosticSeverity, handleDiagnostics } from "./shared/diagnostics.js";
import { isObjectRecord } from "./shared/object-utils.js";
import type { BlockAttributes } from "./registration.js";
import type {
  BlockVariationAuthoringDiagnostic,
  BlockVariationDefinition,
  BlockVariationDiagnostic,
  BlockVariationRegistrationEntry,
  DefineVariationOptions,
} from "./variations.js";
import type { ResolvedDefineVariationSettings } from "./variations-settings.js";

const STABLE_VARIATION_MARKER_ATTRIBUTES = [
  "className",
  "namespace",
  "wpTypiaVariation",
] as const;

function hasStableMarkerAttribute<TAttributes extends BlockAttributes>(
  attributes: BlockVariationDefinition<TAttributes>["attributes"],
): boolean {
  if (!isObjectRecord(attributes)) {
    return false;
  }

  return STABLE_VARIATION_MARKER_ATTRIBUTES.some((key) => key in attributes);
}

function stringifyActiveMarkerValue(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function createActiveMarker(
  entry: BlockVariationRegistrationEntry,
): string | undefined {
  const isActive = entry.variation.isActive;

  if (!Array.isArray(isActive) || isActive.length === 0) {
    return undefined;
  }

  const attributes = isObjectRecord(entry.variation.attributes)
    ? entry.variation.attributes
    : {};

  return [...isActive]
    .sort()
    .map((attribute) => {
      const value = attribute in attributes ? attributes[attribute] : "";

      return `${attribute}=${stringifyActiveMarkerValue(value)}`;
    })
    .join("|");
}

export function createVariationDiagnostics<
  TAttributes extends BlockAttributes,
>(
  blockName: string,
  variation: BlockVariationDefinition<TAttributes>,
  options: ResolvedDefineVariationSettings["diagnostics"],
): readonly BlockVariationAuthoringDiagnostic[] {
  const diagnostics: BlockVariationAuthoringDiagnostic[] = [];
  const variationName = variation.name;
  const attributes = variation.attributes;
  const isActive = variation.isActive;

  if (
    options.requireIsActive &&
    !options.allowMissingIsActive &&
    !variation.isDefault &&
    isActive === undefined
  ) {
    diagnostics.push({
      blockName,
      code: "missing-is-active",
      message: `Block variation "${variationName}" for "${blockName}" does not declare isActive; add an active discriminator or set allowMissingIsActive.`,
      severity: "warning",
      variationName,
    });
  }

  if (
    options.requireIsActive &&
    !options.allowMissingIsActive &&
    !variation.isDefault &&
    isActive === undefined &&
    !hasStableMarkerAttribute(attributes)
  ) {
    diagnostics.push({
      blockName,
      code: "missing-stable-marker",
      message: `Block variation "${variationName}" for "${blockName}" has no stable marker attribute such as className, namespace, or wpTypiaVariation.`,
      severity: "warning",
      variationName,
    });
  }

  if (Array.isArray(isActive)) {
    for (const attribute of isActive) {
      if (!isObjectRecord(attributes) || !(attribute in attributes)) {
        diagnostics.push({
          attribute,
          blockName,
          code: "unknown-is-active-attribute",
          message: `Block variation "${variationName}" for "${blockName}" uses isActive attribute "${attribute}" that is not present in its attributes.`,
          severity: "warning",
          variationName,
        });
      }
    }
  }

  return diagnostics;
}

export function createCollectionDiagnostics(
  entries: readonly BlockVariationRegistrationEntry[],
  strict: boolean,
): readonly BlockVariationAuthoringDiagnostic[] {
  const diagnostics: BlockVariationAuthoringDiagnostic[] = [];
  const seenNames = new Map<string, BlockVariationRegistrationEntry>();
  const seenActiveMarkers = new Map<string, BlockVariationRegistrationEntry>();

  for (const entry of entries) {
    const nameKey = `${entry.blockName}:${entry.variation.name}`;
    const activeMarker = createActiveMarker(entry);

    if (seenNames.has(nameKey)) {
      diagnostics.push({
        blockName: entry.blockName,
        code: "duplicate-variation-name",
        message: `Duplicate block variation name "${entry.variation.name}" for "${entry.blockName}".`,
        severity: getDiagnosticSeverity(strict),
        variationName: entry.variation.name,
      });
    }
    seenNames.set(nameKey, entry);

    if (activeMarker && activeMarker.length > 0) {
      const markerKey = `${entry.blockName}:${activeMarker}`;
      const existing = seenActiveMarkers.get(markerKey);

      if (existing) {
        diagnostics.push({
          blockName: entry.blockName,
          code: "duplicate-active-marker",
          message: `Block variations "${existing.variation.name}" and "${entry.variation.name}" for "${entry.blockName}" share the same isActive discriminator "${activeMarker}".`,
          severity: "warning",
          variationName: entry.variation.name,
        });
      }
      seenActiveMarkers.set(markerKey, entry);
    }
  }

  return diagnostics;
}

export function handleVariationDiagnostics(
  diagnostics: readonly BlockVariationDiagnostic[],
  onDiagnostic: DefineVariationOptions["onDiagnostic"],
  logger: DefineVariationOptions["logger"],
): void {
  handleDiagnostics(diagnostics, onDiagnostic, {
    failureHeading: "WordPress block variation check failed:",
    logger,
  });
}
