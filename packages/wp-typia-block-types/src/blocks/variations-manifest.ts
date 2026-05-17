import {
  createWordPressBlockApiCompatibilityManifest,
  type WordPressBlockApiCompatibilityFeature,
  type WordPressBlockApiCompatibilityManifest,
  type WordPressCompatibilitySettings,
} from "./compatibility.js";
import { resolveDefineVariationSettings } from "./variations-settings.js";
import type { DefineVariationOptions } from "./variations.js";

export function collectBlockVariationCompatibilityFeatures(): readonly WordPressBlockApiCompatibilityFeature[] {
  return [
    {
      area: "blockVariations",
      feature: "editorRegistration",
    },
  ];
}

export function createBlockVariationCompatibilityManifest(
  settings: DefineVariationOptions = {},
): WordPressBlockApiCompatibilityManifest {
  const resolved = resolveDefineVariationSettings({}, settings);

  return createBlockVariationCompatibilityManifestFromSettings(
    resolved.compatibility,
  );
}

export function createBlockVariationCompatibilityManifestFromSettings(
  settings: WordPressCompatibilitySettings,
): WordPressBlockApiCompatibilityManifest {
  return createWordPressBlockApiCompatibilityManifest(
    collectBlockVariationCompatibilityFeatures(),
    settings,
  );
}
