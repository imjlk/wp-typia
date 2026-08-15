# @wp-typia/ttsc-lint-plugin-wp

WordPress-specific lint rules and preset compatibility for `@ttsc/lint`.

This package ports WordPress rules to native TypeScript-Go contributors and
maps the upstream `@wordpress/eslint-plugin` surface to rules already provided
by `@ttsc/lint`. It does not depend on `wp-typia`, `typia`, or
`@wp-typia/project-tools` at runtime.

## Install

```sh
npm install --save-dev \
  @wp-typia/ttsc-lint-plugin-wp \
  @ttsc/lint \
  ttsc \
  typescript
```

Add `lint.config.mts` in CommonJS projects so the ESM contributor is loaded
unambiguously (`lint.config.ts` also works in ESM projects):

```ts
import type { ITtscLintConfig } from '@ttsc/lint';
import { configs } from '@wp-typia/ttsc-lint-plugin-wp';

export default {
  ...configs.wpScriptsRecommended,
  rules: {
    'wordpress/i18n-text-domain': ['error', { allowedTextDomain: 'my-plugin' }],
  },
} satisfies ITtscLintConfig;
```

The compiled preset is a static package-owned `extends` chain. It folds
consecutive entries with the same file scope while retaining effective
upstream ordering, selectors, ignores, severities, and supported options
without loading ESLint in consumer projects. Unsupported and external-runner
rules are left out and remain visible in the compatibility manifest.

When the current `@ttsc/lint` baseline implements a rule but not an upstream
option payload, the compiled config keeps the severity and records the pair in
`compiledPresets.recommended.optionDowngrades`. Consumers never receive an
option tuple that the native host would silently ignore or reject.

Rules that the native engine exposes but cannot yet execute with equivalent
behavior are omitted and recorded in
`compiledPresets.recommended.behaviorDowngrades`. The current baseline omits
`no-shadow` because `@ttsc/lint` panics on catch clauses, and omits
`jsx-a11y/click-events-have-key-events` plus
`jsx-a11y/no-static-element-interactions` because imported WordPress
components are misclassified as native DOM elements. It also omits
`jsx-a11y/role-supports-aria-props` because the native baseline rejects valid
`aria-valuemin` usage on `role="progressbar"`. Each rule returns to the compiled
preset only after its engine or semantic parity regression passes.

Use `ttsc check --noEmit` as the combined TypeScript and lint gate, or `ttsc
fix` to apply available lint and format fixes. `ttsc` intentionally has no
lint-only command; consumers should expose the combined gate under a clear
script name such as `check:code` instead of retaining a misleading lint-only
alias.

For JavaScript and JSX coverage, set `allowJs: true` and include the relevant
`.js`, `.jsx`, `.cjs`, and `.mjs` paths in the TypeScript project used by the
command. Stylelint and non-code formatting remain separate concerns.

## Native rules

- `wordpress/components-no-missing-40px-size-prop`
- `wordpress/components-no-unsafe-button-disabled`
- `wordpress/data-no-store-string-literals`
- `wordpress/dependency-group`
- `wordpress/i18n-ellipsis`
- `wordpress/i18n-hyphenated-range`
- `wordpress/i18n-no-collapsible-whitespace`
- `wordpress/i18n-no-flanking-whitespace`
- `wordpress/i18n-no-placeholders-only`
- `wordpress/i18n-no-variables`
- `wordpress/i18n-text-domain`
- `wordpress/i18n-translator-comments`
- `wordpress/no-base-control-with-label-without-id`
- `wordpress/no-dom-globals-in-constructor`
- `wordpress/no-dom-globals-in-module-scope`
- `wordpress/no-dom-globals-in-react-cc-render`
- `wordpress/no-dom-globals-in-react-fc`
- `wordpress/no-ds-tokens`
- `wordpress/no-global-active-element`
- `wordpress/no-global-get-selection`
- `wordpress/no-i18n-in-save`
- `wordpress/no-non-module-stylesheet-imports`
- `wordpress/no-setting-ds-tokens`
- `wordpress/no-unguarded-get-range-at`
- `wordpress/no-unknown-ds-tokens`
- `wordpress/no-unmerged-classname`
- `wordpress/no-unsafe-render-order`
- `wordpress/no-unsafe-wp-apis`
- `wordpress/no-unused-vars-before-return`
- `wordpress/no-wp-process-env`
- `wordpress/react-no-unsafe-timeout`
- `wordpress/use-import-as`
- `wordpress/use-recommended-components`
- `wordpress/valid-sprintf`
- `wordpress/wp-global-usage`

The two `components-*` rules accept the upstream `checkLocalImports` boolean
to also track relative default imports. `i18n-text-domain` accepts the upstream
`allowedTextDomain` string or string
array. `no-unsafe-wp-apis` accepts a map from an `@wordpress/*` package to the
unstable or experimental named imports allowed from that package.
`no-unsafe-render-order` accepts `checkLocalImports` to include tracked
components imported from relative paths. `no-unused-vars-before-return`
accepts an `excludePattern` for call names that should not be treated as
expensive initializers. The pattern uses Go RE2 syntax; JavaScript-only
lookaheads, lookbehinds, and backreferences are not supported.

The `no-dom-globals-*` rules embed the browser-minus-node global list from
`globals` 16.5.0, the revision satisfying the `globals@^16.0.0` dependency that
`@wordpress/eslint-plugin` 25.8.0 declares. The parity harness installs the
same pinned revision for its ESLint oracle and verifies the generated Go data
remains byte-equivalent, so the repository's own transitive `globals` copy can
never skew which identifiers the two engines treat as DOM-only globals. The
upstream rules are not part of any WordPress preset, so the compiled presets
are unchanged; enable the rules individually when SSR safety is required.

The Design System token rules embed the 167-token list from
`@wordpress/theme` 1.1.0 used by the pinned ESLint oracle. The parity harness
verifies that the embedded ordered list remains exactly equivalent while the
published contributor retains no runtime dependency on the theme package.

The upstream `react-hooks/rules-of-hooks` and
`react-hooks/exhaustive-deps` identifiers map to the native
`react/rules-of-hooks` and `react/exhaustive-deps` rules. The WordPress
`additionalHooks` option for `useSelect` and `useSuspenseSelect` is recorded as
an option downgrade because the current native rule accepts severity only;
standard React dependency hooks remain enabled.

## Presets and compatibility

The exported `configs.custom`, `configs.i18n`, and `configs.recommended`
objects enable the native rules currently implemented by this package.
`configs.i18n` has full parity with the WordPress-owned rules in the upstream
`i18n` preset. All 19 WordPress-owned rules enabled by the upstream
`recommended` preset now have native contributors. The broader `custom` and
`recommended` preset labels remain partial because they also contain scoped
overrides and generic ecosystem rules; `presetCompatibility` does not claim
that those wider contracts are complete.

`configs.wpScriptsRecommended` compiles the supported portion of the full
upstream `recommended` entry chain. It is also marked partial until every
error-level rule has a documented contributor, builtin, compiler, formatter,
or intentional replacement.

The published `compatibility.json` export inventories the 35 WordPress-owned
rules and every rule enabled or disabled across the 13 upstream presets in
`@wordpress/eslint-plugin` 25.8.0. Each rule is classified as:

- `builtin`: the same rule exists in `@ttsc/lint`;
- `mapped`: a namespace translation reaches an `@ttsc/lint` rule;
- `contributor`: this package provides a native Go rule;
- `runner`: an external formatter such as Prettier owns the behavior;
- `unsupported`: parity work remains.

The compiled preset records formatter-classified rules in `runnerRules`.
Nine stylistic rules (`semi`, `quotes`, `indent`, `comma-dangle`,
`object-curly-spacing`, `arrow-parens`, `no-trailing-spaces`,
`no-multiple-empty-lines`, and `eol-last`) are runner-classified because
`ttsc format` provably normalizes each concern. The parity harness
re-verifies every claim on each run — a formatter regression fails the
build instead of silently invalidating the classification. Rules the
formatter leaves untouched (such as `key-spacing`, `space-infix-ops`, and
`brace-style`, which normalizes only on newer ttsc releases) deliberately
stay `unsupported`. Correctness rules like `no-undef` stay unsupported too:
the TypeScript checker reports them only for TypeScript files, and the
upstream preset also applies them to unchecked JavaScript.

```ts
import { compatibilityManifest } from '@wp-typia/ttsc-lint-plugin-wp';
```

The manifest pins the upstream package version and npm integrity. Parity tests
download that exact tarball plus its pinned `@wordpress/theme` token source,
verify both SHA-512 integrities, run the real ESLint rules as the oracle, and
compare their diagnostics with a linked `ttsc` contributor host. Unsafe
upstream fix behavior is intentionally not reproduced: native fixes preserve
template delimiters, non-range hyphens, concatenation separators, and quote
escaping. Dedicated regressions pin those safety guarantees.

## Contributor boundary

The package ships Go rule sources under `rules/` without a contributor-owned
`go.mod`. `@ttsc/lint` copies and links those sources into its own host module,
which is the upstream contributor contract. The `wordpress` namespace and Go
package name must remain aligned.

Rules are based on behavior from `@wordpress/eslint-plugin` 25.8.0 and are
distributed under `GPL-2.0-or-later`. WordPress and the WordPress logos are
trademarks of the WordPress Foundation; this compatibility package is not an
official WordPress Foundation package.
