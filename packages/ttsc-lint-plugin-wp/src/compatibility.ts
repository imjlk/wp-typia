import manifest from '../compatibility/upstream-25.8.0.json' with {
  type: 'json',
};

export type CompatibilityKind =
  | 'builtin'
  | 'contributor'
  | 'mapped'
  | 'runner'
  | 'unsupported';

export type CompatibilityRule =
  | {
      kind: Exclude<CompatibilityKind, 'unsupported'>;
      source: string;
      target: string;
    }
  | {
      kind: 'unsupported';
      source: string;
      target?: undefined;
    };

export interface CompiledPresetEntry {
  files?: readonly string[];
  ignores?: readonly string[];
  rules: Readonly<Record<string, unknown>>;
  sourceNames?: readonly string[];
}

export interface CompiledPreset {
  entries: readonly CompiledPresetEntry[];
  optionDowngrades: readonly {
    source: string;
    target: string;
  }[];
  runnerRules: readonly string[];
  sourceEntryCount: number;
  supportedRules: readonly string[];
  unsupportedRules: readonly string[];
}

export interface CompatibilityManifest {
  compatibility: readonly CompatibilityRule[];
  compiledPresets: Readonly<{
    recommended: CompiledPreset;
  }>;
  namespace: 'wordpress';
  presets: Readonly<
    Record<string, Readonly<Record<string, 'enabled' | 'mixed' | 'off'>>>
  >;
  schemaVersion: 2;
  ttscRange: '>=0.23.0 <0.26.0';
  upstream: {
    integrity: string;
    package: '@wordpress/eslint-plugin';
    version: '25.8.0';
  };
  wordpressRules: readonly CompatibilityRule[];
}

export const compatibilityManifest =
  manifest as unknown as CompatibilityManifest;
