import {
  DEFAULT_WORDPRESS_COMPATIBILITY_MIN_VERSION,
  evaluateWordPressBlockApiCompatibility,
  type WordPressBlockApiCompatibilityFeature,
  type WordPressBlockApiCompatibilityManifest,
  type WordPressCompatibilitySettings,
  type WordPressVersion,
} from "./compatibility.js";
import type {
  BindingSourceVersionGates,
  DefineBindingSourceOptions,
} from "./bindings-core.js";
import { resolveDefineBindingSourceSettings } from "./bindings-settings.js";

export interface BindingSourceCompatibilityFeatureSettings {
  readonly editor?: boolean;
  readonly fieldsList?: boolean;
  readonly metadata?: boolean;
  readonly server?: boolean;
  readonly supportedAttributesFilter?: boolean;
}

function getFeatureMinVersion(
  feature: WordPressBlockApiCompatibilityFeature,
  fallback: WordPressVersion,
  gates: BindingSourceVersionGates,
): WordPressVersion {
  if (feature.area !== "blockBindings") {
    return fallback;
  }

  switch (feature.feature) {
    case "metadata.bindings":
    case "serverRegistration":
      return gates.server ?? fallback;
    case "editorFieldsList":
      return gates.fieldsList ?? fallback;
    case "editorRegistration":
    case "editorSourceLookup":
      return gates.editor ?? fallback;
    case "supportedAttributesFilter":
      return gates.supportedAttributesFilter ?? gates.fieldsList ?? fallback;
    default:
      return fallback;
  }
}

export function createBindingCompatibilityManifest(
  features: readonly WordPressBlockApiCompatibilityFeature[],
  settings: WordPressCompatibilitySettings,
  gates: BindingSourceVersionGates,
): WordPressBlockApiCompatibilityManifest {
  const fallback =
    settings.minVersion ?? DEFAULT_WORDPRESS_COMPATIBILITY_MIN_VERSION;
  const strict = settings.strict ?? true;
  const allowUnknownFutureKeys = settings.allowUnknownFutureKeys ?? false;
  const evaluations = features.map((feature) =>
    evaluateWordPressBlockApiCompatibility(feature, {
      allowUnknownFutureKeys,
      minVersion: getFeatureMinVersion(feature, fallback, gates),
      strict,
    }),
  );
  const diagnostics = evaluations.flatMap((evaluation) =>
    evaluation.diagnostic ? [evaluation.diagnostic] : [],
  );

  return {
    allowUnknownFutureKeys,
    diagnostics,
    evaluations,
    minVersion: fallback,
    strict,
    supported: evaluations.filter(
      (evaluation) => evaluation.status === "supported",
    ),
    unknown: evaluations.filter((evaluation) => evaluation.status === "unknown"),
    unsupported: evaluations.filter(
      (evaluation) => evaluation.status === "unsupported",
    ),
  };
}

export function collectBindingSourceCompatibilityFeatures(
  settings: BindingSourceCompatibilityFeatureSettings = {},
): readonly WordPressBlockApiCompatibilityFeature[] {
  const features: WordPressBlockApiCompatibilityFeature[] = [];

  if (settings.metadata ?? true) {
    features.push({
      area: "blockBindings",
      feature: "metadata.bindings",
    });
  }
  if (settings.server ?? true) {
    features.push({
      area: "blockBindings",
      feature: "serverRegistration",
    });
  }
  if (settings.editor ?? true) {
    features.push({
      area: "blockBindings",
      feature: "editorRegistration",
    });
  }
  if (settings.fieldsList ?? false) {
    features.push({
      area: "blockBindings",
      feature: "editorFieldsList",
    });
  }
  if (settings.supportedAttributesFilter ?? false) {
    features.push({
      area: "blockBindings",
      feature: "supportedAttributesFilter",
    });
  }

  return features;
}

export function createBindingSourceCompatibilityManifest(
  settings: DefineBindingSourceOptions = {},
): WordPressBlockApiCompatibilityManifest {
  const resolved = resolveDefineBindingSourceSettings({}, settings, {
    name: "wp-typia/binding-source",
  });

  return createBindingCompatibilityManifest(
    collectBindingSourceCompatibilityFeatures(resolved.features),
    resolved.compatibility,
    resolved.gates,
  );
}
