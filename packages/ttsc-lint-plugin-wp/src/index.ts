import type {
  ITtscLintContributorRules,
  ITtscLintRuleOptionsMap,
  TtscLintRuleSetting,
} from '@ttsc/lint';

import type { I18nTextDomainOptions, NoUnsafeWpApisOptions } from './types.js';

declare module '@ttsc/lint' {
  interface ITtscLintContributorRules {
    'wordpress/valid-sprintf'?: TtscLintRuleSetting;
  }

  interface ITtscLintRuleOptionsMap {
    'wordpress/i18n-text-domain': I18nTextDomainOptions;
    'wordpress/no-unsafe-wp-apis': NoUnsafeWpApisOptions;
  }
}

// Keep these imports live in generated declarations so module augmentation is
// retained by package consumers under isolatedModules.
export type { ITtscLintContributorRules, ITtscLintRuleOptionsMap };
export {
  compatibilityManifest,
  type CompiledPreset,
  type CompiledPresetEntry,
  type CompatibilityKind,
  type CompatibilityManifest,
  type CompatibilityRule,
} from './compatibility.js';
export { configs, presetCompatibility } from './configs.js';
export { default, plugin, ruleNames } from './plugin.js';
export type { I18nTextDomainOptions, NoUnsafeWpApisOptions } from './types.js';
