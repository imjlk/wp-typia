/** Declares whether a generated feature is optional or required at runtime. */
import { pickHigherVersionFloor } from '../shared/version-floor.js';

/** Declares whether a generated feature is optional or required at runtime. */
export type AiFeatureCapabilityMode = 'optional' | 'required';

/** Describes the minimum compatible platform versions for a feature. */
export interface AiFeatureCompatibilityFloor {
  /** Minimum supported PHP version, when a feature depends on PHP behavior. */
  php?: string;
  /** Minimum supported WordPress version, when a feature depends on core APIs. */
  wordpress?: string;
}

/** Identifies a concrete runtime signal that a feature depends on. */
export interface AiFeatureRuntimeGate {
  /** The kind of runtime dependency or capability being checked. */
  kind:
    | 'adapter'
    | 'php-function'
    | 'script-package'
    | 'wordpress-core-feature';
  /** The concrete symbol, package, or adapter name required at runtime. */
  value: string;
}

/** Defines a single AI-related feature that scaffold compatibility can target. */
export interface AiFeatureDefinition {
  /** Human-readable summary for docs, onboarding, and generated notices. */
  description: string;
  /** Stable machine-readable identifier used in capability selections. */
  id: string;
  /** Display label presented to maintainers and downstream tooling. */
  label: string;
  /** Optional minimum platform versions required by the feature. */
  minimumVersions?: AiFeatureCompatibilityFloor;
  /** Optional runtime gates that explain what the feature depends on. */
  runtimeGates?: readonly AiFeatureRuntimeGate[];
}

/** Selects a feature and whether it is required or merely optional. */
export interface AiFeatureCapabilitySelection {
  /** Feature identifier that must exist in the active registry. */
  featureId: string;
  /** Required selections take precedence over optional duplicates. */
  mode: AiFeatureCapabilityMode;
}

/** Feature definition resolved together with its selected mode. */
export interface ResolvedAiFeatureCapability extends AiFeatureDefinition {
  /** Final selected mode after duplicate feature ids are normalized. */
  mode: AiFeatureCapabilityMode;
}

/** Groups the normalized feature plan used by scaffold compatibility logic. */
export interface ResolvedAiFeatureCapabilityPlan {
  /** Highest required PHP and WordPress version floors across required features. */
  hardMinimums: AiFeatureCompatibilityFloor;
  /** Optional features that do not raise the minimum platform floor. */
  optionalFeatures: ResolvedAiFeatureCapability[];
  /** Required features that downstream projects must treat as mandatory. */
  requiredFeatures: ResolvedAiFeatureCapability[];
}

/** Canonical registry of AI-related features supported by wp-typia today. */
export const AI_FEATURE_DEFINITIONS = {
  wordpressAiClient: {
    description:
      'WordPress 7.0 AI Client surface used by AI-capable feature endpoints.',
    id: 'wordpress-ai-client',
    label: 'WordPress AI Client',
    minimumVersions: {
      wordpress: '7.0',
    },
    runtimeGates: [
      {
        kind: 'wordpress-core-feature',
        value: 'WordPress AI Client',
      },
    ],
  },
  wordpressCoreAbilities: {
    description:
      'Client-side ability discovery surface for editor and admin flows.',
    id: 'wordpress-core-abilities',
    label: '@wordpress/core-abilities',
    minimumVersions: {
      wordpress: '7.0',
    },
    runtimeGates: [
      {
        kind: 'script-package',
        value: '@wordpress/core-abilities',
      },
    ],
  },
  wordpressMcpPublicMetadata: {
    description:
      'Optional MCP exposure metadata consumed by a separate adapter path rather than core alone.',
    id: 'wordpress-mcp-public-metadata',
    label: 'MCP public metadata',
    runtimeGates: [
      {
        kind: 'adapter',
        value: 'MCP adapter',
      },
    ],
  },
  wordpressServerAbilities: {
    description:
      'Server-side ability registration and execution surface for WordPress-native abilities.',
    id: 'wordpress-server-abilities',
    label: 'WordPress Abilities API',
    minimumVersions: {
      wordpress: '6.9',
    },
    runtimeGates: [
      {
        kind: 'php-function',
        value: 'wp_register_ability',
      },
      {
        kind: 'php-function',
        value: 'wp_register_ability_category',
      },
    ],
  },
} as const satisfies Record<string, AiFeatureDefinition>;

const DEFAULT_AI_FEATURE_REGISTRY: Readonly<
  Record<string, AiFeatureDefinition>
> = Object.values(AI_FEATURE_DEFINITIONS).reduce<
  Record<string, AiFeatureDefinition>
>((accumulator, definition) => {
  accumulator[definition.id] = definition;
  return accumulator;
}, {});

function normalizeSelections(
  selections: readonly AiFeatureCapabilitySelection[],
): AiFeatureCapabilitySelection[] {
  const normalized = new Map<string, AiFeatureCapabilitySelection>();

  for (const selection of selections) {
    const current = normalized.get(selection.featureId);
    if (!current || selection.mode === 'required') {
      normalized.set(selection.featureId, selection);
    }
  }

  return [...normalized.values()];
}

function validateFeatureMinimumVersions(
  definition: AiFeatureDefinition,
): void {
  for (const [platform, value] of [
    ['wordpress', definition.minimumVersions?.wordpress],
    ['php', definition.minimumVersions?.php],
  ] as const) {
    if (value === undefined) {
      continue;
    }

    try {
      pickHigherVersionFloor(value, undefined);
    } catch (error) {
      throw new Error(
        [
          `Invalid ${platform} minimum version floor for AI feature "${definition.id}": "${value}".`,
          'Expected dotted numeric segments such as "6.7" or "8.1.2".',
        ].join(' '),
        { cause: error },
      );
    }
  }
}

/**
 * Resolves a normalized AI feature capability plan from a list of selections.
 *
 * Required selections win when the same feature id appears multiple times, and
 * the resulting hard minimum platform floor is computed from required features
 * only.
 *
 * @param selections Desired feature selections for a scaffold or projection.
 * @param registry Feature registry to resolve against. Defaults to the built-in registry.
 * @returns The normalized capability plan plus required version floors.
 * @throws When a selection references an unknown feature id.
 */
export function resolveAiFeatureCapabilityPlan(
  selections: readonly AiFeatureCapabilitySelection[],
  registry: Readonly<
    Record<string, AiFeatureDefinition>
  > = DEFAULT_AI_FEATURE_REGISTRY,
): ResolvedAiFeatureCapabilityPlan {
  const requiredFeatures: ResolvedAiFeatureCapability[] = [];
  const optionalFeatures: ResolvedAiFeatureCapability[] = [];
  let wordpress: string | undefined;
  let php: string | undefined;

  for (const selection of normalizeSelections(selections)) {
    const definition = registry[selection.featureId];
    if (!definition) {
      throw new Error(
        `Unknown AI feature capability "${selection.featureId}".`,
      );
    }
    validateFeatureMinimumVersions(definition);

    const resolvedDefinition = {
      ...definition,
      mode: selection.mode,
    } satisfies ResolvedAiFeatureCapability;

    if (selection.mode === 'required') {
      requiredFeatures.push(resolvedDefinition);
      wordpress = pickHigherVersionFloor(
        wordpress,
        definition.minimumVersions?.wordpress,
      );
      php = pickHigherVersionFloor(php, definition.minimumVersions?.php);
      continue;
    }

    optionalFeatures.push(resolvedDefinition);
  }

  return {
    hardMinimums: {
      ...(php ? { php } : {}),
      ...(wordpress ? { wordpress } : {}),
    },
    optionalFeatures,
    requiredFeatures,
  };
}
