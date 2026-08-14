import type {
  ITtscLintContributorRules,
  ITtscLintRuleOptionsMap,
  TtscLintRuleSetting,
} from '@ttsc/lint';

import type {
  I18nTextDomainOptions,
  NoUnsafeRenderOrderOptions,
  NoUnsafeWpApisOptions,
  NoUnusedVarsBeforeReturnOptions,
} from './types.js';

declare module '@ttsc/lint' {
  interface ITtscLintContributorRules {
    'wordpress/i18n-ellipsis'?: TtscLintRuleSetting;
    'wordpress/i18n-hyphenated-range'?: TtscLintRuleSetting;
    'wordpress/i18n-no-collapsible-whitespace'?: TtscLintRuleSetting;
    'wordpress/i18n-no-flanking-whitespace'?: TtscLintRuleSetting;
    'wordpress/i18n-no-placeholders-only'?: TtscLintRuleSetting;
    'wordpress/i18n-no-variables'?: TtscLintRuleSetting;
    'wordpress/i18n-translator-comments'?: TtscLintRuleSetting;
    'wordpress/no-base-control-with-label-without-id'?: TtscLintRuleSetting;
    'wordpress/no-dom-globals-in-constructor'?: TtscLintRuleSetting;
    'wordpress/no-dom-globals-in-module-scope'?: TtscLintRuleSetting;
    'wordpress/no-dom-globals-in-react-cc-render'?: TtscLintRuleSetting;
    'wordpress/no-dom-globals-in-react-fc'?: TtscLintRuleSetting;
    'wordpress/no-ds-tokens'?: TtscLintRuleSetting;
    'wordpress/no-global-active-element'?: TtscLintRuleSetting;
    'wordpress/no-global-get-selection'?: TtscLintRuleSetting;
    'wordpress/no-i18n-in-save'?: TtscLintRuleSetting;
    'wordpress/no-setting-ds-tokens'?: TtscLintRuleSetting;
    'wordpress/no-unguarded-get-range-at'?: TtscLintRuleSetting;
    'wordpress/no-unknown-ds-tokens'?: TtscLintRuleSetting;
    'wordpress/no-wp-process-env'?: TtscLintRuleSetting;
    'wordpress/react-no-unsafe-timeout'?: TtscLintRuleSetting;
    'wordpress/valid-sprintf'?: TtscLintRuleSetting;
    'wordpress/wp-global-usage'?: TtscLintRuleSetting;
  }

  interface ITtscLintRuleOptionsMap {
    'wordpress/i18n-text-domain': I18nTextDomainOptions;
    'wordpress/no-unsafe-render-order': NoUnsafeRenderOrderOptions;
    'wordpress/no-unsafe-wp-apis': NoUnsafeWpApisOptions;
    'wordpress/no-unused-vars-before-return': NoUnusedVarsBeforeReturnOptions;
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
export type {
  I18nTextDomainOptions,
  NoUnsafeRenderOrderOptions,
  NoUnsafeWpApisOptions,
  NoUnusedVarsBeforeReturnOptions,
} from './types.js';
