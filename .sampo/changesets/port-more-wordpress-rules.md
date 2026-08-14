---
npm/@wp-typia/ttsc-lint-plugin-wp: minor
---

Port four more WordPress rules from `@wordpress/eslint-plugin` 25.8.0 as native `@ttsc/lint` contributors: `no-ds-tokens`, `no-i18n-in-save`, `react-no-unsafe-timeout`, and `wp-global-usage`.

`wp-global-usage` ports both diagnostics plus their autofixes (`globalThis.NAME` rewrites, including the `window.NAME` member fix); `no-ds-tokens` mirrors the upstream case-insensitive `--wpds-*` boundary regex that the token-validation rules intentionally keep case-sensitive. None of the four rules belongs to an upstream WordPress preset, so compiled presets are unchanged; WordPress-owned rule coverage moves from 23 to 27 contributors (8 unsupported remain).

The additional rules raise the contributor package's unpacked footprint budget from 360,000 to 385,000 bytes, following the documented-dataset budget pattern.
