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

Add a config such as `lint.config.ts`:

```ts
import type { ITtscLintConfig } from '@ttsc/lint';
import wordpress, { configs } from '@wp-typia/ttsc-lint-plugin-wp';

export default {
  ...configs.recommended,
  plugins: { wordpress },
  rules: {
    ...configs.recommended.rules,
    'wordpress/i18n-text-domain': ['error', { allowedTextDomain: 'my-plugin' }],
  },
} satisfies ITtscLintConfig;
```

Use `ttsc check` for TypeScript and lint diagnostics, or `ttsc fix` to apply
available lint and format fixes. Upstream does not currently expose a lint-only
CLI, so replacing the `wp-scripts lint-js` command itself remains a later
compatibility layer.

## Rules in 0.1.0

- `wordpress/i18n-text-domain`
- `wordpress/no-unsafe-wp-apis`
- `wordpress/valid-sprintf`

`i18n-text-domain` accepts the upstream `allowedTextDomain` string or string
array. `no-unsafe-wp-apis` accepts a map from an `@wordpress/*` package to the
unstable or experimental named imports allowed from that package.

## Presets and compatibility

The exported `configs.custom`, `configs.i18n`, and `configs.recommended`
objects enable the native rules currently implemented by this package. They
are intentionally partial in 0.1.0; `presetCompatibility` labels that status
explicitly rather than silently claiming complete WordPress coverage.

The published `compatibility.json` export inventories the 35 WordPress-owned
rules and every rule enabled or disabled across the 13 upstream presets in
`@wordpress/eslint-plugin` 25.8.0. Each rule is classified as:

- `builtin`: the same rule exists in `@ttsc/lint`;
- `mapped`: a namespace translation reaches an `@ttsc/lint` rule;
- `contributor`: this package provides a native Go rule;
- `runner`: an external command such as `ttsc format` owns the behavior;
- `unsupported`: parity work remains.

```ts
import { compatibilityManifest } from '@wp-typia/ttsc-lint-plugin-wp';
```

The manifest pins the upstream package version and npm integrity. Parity tests
download that exact tarball, verify its SHA-512 integrity, run the real ESLint
rules as the oracle, and compare their diagnostics with a linked `ttsc`
contributor host.

## Contributor boundary

The package ships Go rule sources under `rules/` without a contributor-owned
`go.mod`. `@ttsc/lint` copies and links those sources into its own host module,
which is the upstream contributor contract. The `wordpress` namespace and Go
package name must remain aligned.

Rules are based on behavior from `@wordpress/eslint-plugin` 25.8.0 and are
distributed under `GPL-2.0-or-later`. WordPress and the WordPress logos are
trademarks of the WordPress Foundation; this compatibility package is not an
official WordPress Foundation package.
