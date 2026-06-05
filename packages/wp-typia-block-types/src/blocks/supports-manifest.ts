import {
  createWordPressBlockApiCompatibilityManifest,
  type WordPressBlockApiCompatibilityFeature,
  type WordPressBlockApiCompatibilityManifest,
} from "./compatibility.js";
import {
  BLOCK_SUPPORT_FEATURES,
  SPACING_SUPPORT_KEYS,
  type BlockSupportFeature,
  type TypographySupportKey,
} from "./supports-features.js";
import {
  DEFINE_SUPPORTS_INLINE_OPTION_KEYS,
  resolveDefineSupportsSettings,
} from "./supports-settings.js";
import type { BlockSupportsInput, DefineSupportsOptions } from "./supports.js";
import {
  isNonArrayObject,
  isObjectRecord,
} from "./shared/object-utils.js";

const KNOWN_BLOCK_SUPPORT_FEATURES = new Set<string>(BLOCK_SUPPORT_FEATURES);
const COLOR_COMPATIBILITY_SUPPORT_KEYS = [
  "button",
  "enableContrastChecker",
  "heading",
] as const;
const TYPOGRAPHY_COMPATIBILITY_SUPPORT_KEYS = [
  "fontSize",
  "letterSpacing",
  "lineHeight",
  "textAlign",
  "textDecoration",
  "textTransform",
] as const satisfies readonly TypographySupportKey[];
const TOP_LEVEL_COMPATIBILITY_SUPPORT_KEYS = [
  "allowedBlocks",
  "background",
  "contentRole",
  "dimensions",
  "interactivity",
  "listView",
  "position",
  "renaming",
  "shadow",
  "splitting",
  "visibility",
] as const satisfies readonly BlockSupportFeature[];

function isEnabledSupportValue(value: unknown): boolean {
  return value !== false && value !== null && value !== undefined;
}

function isEnabledTopLevelSupportValue(value: unknown): boolean {
  if (!isObjectRecord(value)) {
    return isNonArrayObject(value) ? false : isEnabledSupportValue(value);
  }

  return Object.entries(value).some(
    ([key, nestedValue]) =>
      !key.startsWith("__experimental") &&
      isEnabledSupportValue(nestedValue),
  );
}

function hasEnabledNestedSupport(section: unknown, key: string): boolean {
  return isObjectRecord(section) && isEnabledSupportValue(section[key]);
}

function addCompatibilityFeature(
  features: WordPressBlockApiCompatibilityFeature[],
  seen: Set<string>,
  feature: string,
): void {
  const id = `blockSupports.${feature}`;

  if (seen.has(id)) {
    return;
  }

  seen.add(id);
  features.push({
    area: "blockSupports",
    feature,
  });
}

export function collectBlockSupportsCompatibilityFeatures(
  supports: BlockSupportsInput,
): readonly WordPressBlockApiCompatibilityFeature[] {
  const features: WordPressBlockApiCompatibilityFeature[] = [];
  const seen = new Set<string>();

  for (const key of TOP_LEVEL_COMPATIBILITY_SUPPORT_KEYS) {
    if (isEnabledTopLevelSupportValue(supports[key])) {
      addCompatibilityFeature(features, seen, key);
    }
  }

  const spacing = supports.spacing;
  for (const key of SPACING_SUPPORT_KEYS) {
    if (hasEnabledNestedSupport(spacing, key)) {
      addCompatibilityFeature(features, seen, `spacing.${key}`);
    }
  }

  const typography = supports.typography;
  for (const key of TYPOGRAPHY_COMPATIBILITY_SUPPORT_KEYS) {
    if (hasEnabledNestedSupport(typography, key)) {
      addCompatibilityFeature(features, seen, `typography.${key}`);
    }
  }

  const color = supports.color;
  if (isObjectRecord(color)) {
    for (const key of COLOR_COMPATIBILITY_SUPPORT_KEYS) {
      if (isEnabledSupportValue(color[key])) {
        addCompatibilityFeature(features, seen, `color.${key}`);
      }
    }
  }

  if (hasEnabledNestedSupport(supports.filter, "duotone")) {
    addCompatibilityFeature(features, seen, "filter.duotone");
  }

  for (const key of Object.keys(supports)) {
    if (
      !KNOWN_BLOCK_SUPPORT_FEATURES.has(key) &&
      !DEFINE_SUPPORTS_INLINE_OPTION_KEYS.has(key) &&
      isEnabledTopLevelSupportValue(supports[key])
    ) {
      addCompatibilityFeature(features, seen, key);
    }
  }

  return features;
}

export function createBlockSupportsCompatibilityManifest(
  supports: BlockSupportsInput,
  settings: DefineSupportsOptions = {},
): WordPressBlockApiCompatibilityManifest {
  const compatibilitySettings = resolveDefineSupportsSettings({}, settings);

  return createWordPressBlockApiCompatibilityManifest(
    collectBlockSupportsCompatibilityFeatures(supports),
    compatibilitySettings,
  );
}
