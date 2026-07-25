/**
 * Compatibility policy helpers for generated scaffold outputs.
 *
 * The policy keeps plugin headers, runtime gates, and workspace inventory
 * metadata aligned when optional or required AI-capable features are added.
 */
import {
  AI_FEATURE_DEFINITIONS,
  type AiFeatureCapabilitySelection,
  type AiFeatureCompatibilityFloor,
  type ResolvedAiFeatureCapability,
  type ResolvedAiFeatureCapabilityPlan,
  resolveAiFeatureCapabilityPlan,
} from '../add/ai-feature-capability.js';
import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from '../cli/cli-diagnostics.js';
import {
  parseVersionFloorParts,
  pickHigherVersionFloor,
} from '../shared/version-floor.js';

/**
 * WordPress plugin header version floors emitted by scaffold templates.
 */
export interface ScaffoldPluginHeaderCompatibility {
  requiresAtLeast: string;
  requiresPhp: string;
  testedUpTo: string;
}

/**
 * Resolved compatibility policy for a set of scaffold feature capabilities.
 */
export interface ScaffoldCompatibilityPolicy {
  capabilityPlan: ResolvedAiFeatureCapabilityPlan;
  pluginHeader: ScaffoldPluginHeaderCompatibility;
}

/**
 * Supported WordPress target versions for generated scaffold plugin headers.
 */
export const SCAFFOLD_WORDPRESS_TARGET_VERSIONS = ['6.9', '7.0'] as const;

/**
 * String literal union for scaffold WordPress targets, currently `6.9` or `7.0`.
 */
export type ScaffoldWordPressTargetVersion =
  (typeof SCAFFOLD_WORDPRESS_TARGET_VERSIONS)[number];

/**
 * Default WordPress target version used when create callers omit `--wp-version`.
 */
export const DEFAULT_SCAFFOLD_WORDPRESS_TARGET_VERSION: ScaffoldWordPressTargetVersion =
  '7.0';

/**
 * Serializable compatibility metadata stored in generated workspace inventory.
 */
export interface ScaffoldCompatibilityConfig {
  hardMinimums: AiFeatureCompatibilityFloor;
  mode: 'baseline' | 'optional' | 'required';
  optionalFeatureIds: string[];
  optionalFeatures: string[];
  requiredFeatureIds: string[];
  requiredFeatures: string[];
  runtimeGates: string[];
}

/**
 * Optional hooks for surfacing user-authored compatibility header repairs.
 */
export interface UpdatePluginHeaderCompatibilityOptions {
  /**
   * Receives warnings when a malformed existing plugin header value is
   * replaced by the resolved policy floor.
   */
  onWarning?: (warning: string) => void;
}

/**
 * Baseline headers used by scaffold output before optional features are added.
 */
export const DEFAULT_SCAFFOLD_COMPATIBILITY: ScaffoldPluginHeaderCompatibility =
  {
    requiresAtLeast: '6.7',
    requiresPhp: '8.0',
    testedUpTo: '6.9',
  };

/**
 * Return whether a string is one of the supported scaffold WordPress targets.
 */
export function isScaffoldWordPressTargetVersion(
  value: string,
): value is ScaffoldWordPressTargetVersion {
  return (SCAFFOLD_WORDPRESS_TARGET_VERSIONS as readonly string[]).includes(
    value,
  );
}

/**
 * Resolve CLI input into a supported scaffold WordPress target version.
 *
 * Empty input falls back to the default `7.0` target.
 */
export function resolveScaffoldWordPressTargetVersion(
  value?: string,
): ScaffoldWordPressTargetVersion {
  if (value === undefined || value.trim().length === 0) {
    return DEFAULT_SCAFFOLD_WORDPRESS_TARGET_VERSION;
  }

  const normalized = value.trim();
  if (isScaffoldWordPressTargetVersion(normalized)) {
    return normalized;
  }

  throw createCliDiagnosticCodeError(
    CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
    `Unsupported --wp-version "${value}". Expected one of: ${SCAFFOLD_WORDPRESS_TARGET_VERSIONS.join(', ')}.`,
  );
}

/**
 * Build scaffold header compatibility for the selected WordPress target.
 *
 * The selected target controls `Tested up to`; hard minimums remain tied to the
 * compatibility policy floor.
 */
export function createScaffoldCompatibilityBaseline(
  wpVersion?: ScaffoldWordPressTargetVersion,
): ScaffoldPluginHeaderCompatibility {
  const testedUpTo = wpVersion ?? DEFAULT_SCAFFOLD_WORDPRESS_TARGET_VERSION;

  return {
    ...DEFAULT_SCAFFOLD_COMPATIBILITY,
    testedUpTo,
  };
}

/**
 * Optional WordPress AI Client surface used by server-only AI feature scaffold.
 */
export const OPTIONAL_WORDPRESS_AI_CLIENT_COMPATIBILITY: readonly AiFeatureCapabilitySelection[] =
  [
    {
      featureId: AI_FEATURE_DEFINITIONS.wordpressAiClient.id,
      mode: 'optional',
    },
  ];

/**
 * Required Abilities API surface used by typed workflow ability scaffold.
 */
export const REQUIRED_WORKSPACE_ABILITY_COMPATIBILITY: readonly AiFeatureCapabilitySelection[] =
  [
    {
      featureId: AI_FEATURE_DEFINITIONS.wordpressServerAbilities.id,
      mode: 'required',
    },
    {
      featureId: AI_FEATURE_DEFINITIONS.wordpressCoreAbilities.id,
      mode: 'required',
    },
  ];

function pickHigherScaffoldVersionFloor(
  current: string,
  candidate: string | undefined,
): string {
  return pickHigherVersionFloor(current, candidate) ?? current;
}

function pickHigherHeaderVersionFloor(
  policyValue: string,
  currentValue: string,
  {
    headerName,
    onWarning,
  }: {
    headerName: string;
    onWarning?: (warning: string) => void;
  },
): string {
  const normalizedCurrentValue = currentValue.trim();
  if (!normalizedCurrentValue) {
    return policyValue;
  }

  try {
    return pickHigherScaffoldVersionFloor(policyValue, normalizedCurrentValue);
  } catch (error) {
    const warning = [
      `Invalid plugin header version floor for ${headerName}: "${normalizedCurrentValue}".`,
      'Expected dotted numeric segments such as "6.7" or "8.1.2".',
      `Replacing it with compatibility policy value "${policyValue}".`,
    ].join(' ');

    if (!onWarning) {
      throw new Error(warning, { cause: error });
    }

    onWarning(warning);
    return policyValue;
  }
}

function assertPolicyVersionFloor(headerName: string, value: string): void {
  try {
    parseVersionFloorParts(value);
  } catch (error) {
    throw new Error(
      [
        `Invalid scaffold compatibility policy floor for ${headerName}: "${value}".`,
        'Expected dotted numeric segments such as "6.7" or "8.1.2".',
      ].join(' '),
      { cause: error },
    );
  }
}

function assertPluginHeaderPolicyVersionFloors(
  pluginHeader: ScaffoldPluginHeaderCompatibility,
): void {
  assertPolicyVersionFloor('Requires at least', pluginHeader.requiresAtLeast);
  assertPolicyVersionFloor('Tested up to', pluginHeader.testedUpTo);
  assertPolicyVersionFloor('Requires PHP', pluginHeader.requiresPhp);
}

function formatRuntimeGate(feature: ResolvedAiFeatureCapability): string[] {
  return (feature.runtimeGates ?? []).map(
    (gate) => `${feature.label}: ${gate.kind} ${gate.value}`,
  );
}

function getPolicyMode(
  capabilityPlan: ResolvedAiFeatureCapabilityPlan,
): ScaffoldCompatibilityConfig['mode'] {
  if (capabilityPlan.requiredFeatures.length > 0) {
    return 'required';
  }
  if (capabilityPlan.optionalFeatures.length > 0) {
    return 'optional';
  }
  return 'baseline';
}

/**
 * Resolve plugin header floors and capability gates for scaffold selections.
 */
export function resolveScaffoldCompatibilityPolicy(
  selections: readonly AiFeatureCapabilitySelection[],
  {
    baseline = DEFAULT_SCAFFOLD_COMPATIBILITY,
  }: {
    baseline?: ScaffoldPluginHeaderCompatibility;
  } = {},
): ScaffoldCompatibilityPolicy {
  const capabilityPlan = resolveAiFeatureCapabilityPlan(selections);
  const requiresAtLeast = pickHigherScaffoldVersionFloor(
    baseline.requiresAtLeast,
    capabilityPlan.hardMinimums.wordpress,
  );
  const requiresPhp = pickHigherScaffoldVersionFloor(
    baseline.requiresPhp,
    capabilityPlan.hardMinimums.php,
  );
  const testedUpTo = pickHigherScaffoldVersionFloor(
    baseline.testedUpTo,
    requiresAtLeast,
  );

  return {
    capabilityPlan,
    pluginHeader: {
      requiresAtLeast,
      requiresPhp,
      testedUpTo,
    },
  };
}

/**
 * Convert a resolved policy into workspace-inventory-safe JSON metadata.
 */
export function createScaffoldCompatibilityConfig(
  policy: ScaffoldCompatibilityPolicy,
): ScaffoldCompatibilityConfig {
  const { capabilityPlan } = policy;

  return {
    hardMinimums: capabilityPlan.hardMinimums,
    mode: getPolicyMode(capabilityPlan),
    optionalFeatureIds: capabilityPlan.optionalFeatures.map(
      (feature) => feature.id,
    ),
    optionalFeatures: capabilityPlan.optionalFeatures.map(
      (feature) => feature.label,
    ),
    requiredFeatureIds: capabilityPlan.requiredFeatures.map(
      (feature) => feature.id,
    ),
    requiredFeatures: capabilityPlan.requiredFeatures.map(
      (feature) => feature.label,
    ),
    runtimeGates: [
      ...capabilityPlan.requiredFeatures.flatMap(formatRuntimeGate),
      ...capabilityPlan.optionalFeatures.flatMap(formatRuntimeGate),
    ],
  };
}

/**
 * Render compatibility metadata as formatted TypeScript object literal JSON.
 */
export function renderScaffoldCompatibilityConfig(
  policy: ScaffoldCompatibilityPolicy,
  indent = '\t\t',
): string {
  const config = createScaffoldCompatibilityConfig(policy);

  return JSON.stringify(config, null, '\t')
    .split('\n')
    .map((line, index) => (index === 0 ? line : `${indent}${line}`))
    .join('\n');
}

function replacePluginHeaderVersionFloor(
  source: string,
  pattern: RegExp,
  policyValue: string,
  headerName: string,
  options: UpdatePluginHeaderCompatibilityOptions,
): string {
  return source.replace(
    pattern,
    (_match, prefix: string, currentValue: string, lineEnding: string) => {
      const versionPrefix = prefix.endsWith(':') ? `${prefix} ` : prefix;
      return `${versionPrefix}${pickHigherHeaderVersionFloor(
        policyValue,
        currentValue,
        {
          headerName,
          onWarning: options.onWarning,
        },
      )}${lineEnding}`;
    },
  );
}

/**
 * Patch a generated plugin bootstrap header without lowering custom floors.
 *
 * Preserves the original header line endings while replacing empty version
 * strings with policy values. Malformed user-authored values are reported
 * through `options.onWarning`; without a warning handler they throw instead of
 * falling back silently.
 */
export function updatePluginHeaderCompatibility(
  source: string,
  policy: ScaffoldCompatibilityPolicy,
  options: UpdatePluginHeaderCompatibilityOptions = {},
): string {
  const { pluginHeader } = policy;
  assertPluginHeaderPolicyVersionFloors(pluginHeader);

  const nextSource = replacePluginHeaderVersionFloor(
    source,
    /(\* Requires at least:[^\S\r\n]*)([^\r\n]*)(\r?)/u,
    pluginHeader.requiresAtLeast,
    'Requires at least',
    options,
  );
  const nextSourceWithTestedUpTo = replacePluginHeaderVersionFloor(
    nextSource,
    /(\* Tested up to:[^\S\r\n]*)([^\r\n]*)(\r?)/u,
    pluginHeader.testedUpTo,
    'Tested up to',
    options,
  );
  return replacePluginHeaderVersionFloor(
    nextSourceWithTestedUpTo,
    /(\* Requires PHP:[^\S\r\n]*)([^\r\n]*)(\r?)/u,
    pluginHeader.requiresPhp,
    'Requires PHP',
    options,
  );
}
