# @wp-typia/ttsc-lint-plugin-wp

## 0.4.0 — 2026-08-14

### Minor changes

- [9891bc70](https://github.com/imjlk/wp-typia/commit/9891bc7068569482cdd00f2d47beb2f597767a80) Port four more WordPress rules from `@wordpress/eslint-plugin` 25.8.0 as native `@ttsc/lint` contributors: `no-ds-tokens`, `no-i18n-in-save`, `react-no-unsafe-timeout`, and `wp-global-usage`.
  
  `wp-global-usage` ports both diagnostics plus their autofixes (`globalThis.NAME` rewrites, including the `window.NAME` member fix); `no-ds-tokens` mirrors the upstream case-insensitive `--wpds-*` boundary regex that the token-validation rules intentionally keep case-sensitive. None of the four rules belongs to an upstream WordPress preset, so compiled presets are unchanged; WordPress-owned rule coverage moves from 23 to 27 contributors (8 unsupported remain).
  
  The additional rules raise the contributor package's unpacked footprint budget from 360,000 to 385,000 bytes, following the documented-dataset budget pattern. — Thanks @imjlk!

## 0.3.0 — 2026-08-14

### Minor changes

- [57bf88e0](https://github.com/imjlk/wp-typia/commit/57bf88e017f072aa1531df06e0af39f9233b5d10) Port the four SSR-safety DOM globals rules from `@wordpress/eslint-plugin` 25.8.0 to native `@ttsc/lint` contributors: `no-dom-globals-in-constructor`, `no-dom-globals-in-module-scope`, `no-dom-globals-in-react-cc-render`, and `no-dom-globals-in-react-fc`.
  
  The rules embed the browser-minus-node global list from `globals` 16.5.0, the pinned revision matching the upstream plugin's `globals@^16.0.0` dependency, and the parity oracle now installs that same revision so the DOM-only global set cannot drift between engines. The upstream rules belong to no WordPress preset, so compiled presets are unchanged; enable the rules individually for SSR safety. WordPress-owned rule coverage moves from 19 to 23 contributors. The embedded global list raises the contributor package's unpacked footprint budget from 275,000 to 360,000 bytes, mirroring the documented-dataset budget pattern used by the Design System token rules. — Thanks @imjlk!

## 0.2.0 — 2026-08-11

### Minor changes

- [47bcc15f](https://github.com/imjlk/wp-typia/commit/47bcc15f755c9b57705fb9299b61898979e28bde) Added: port five WordPress runtime safety rules to native TypeScript-Go
  contributors and map the upstream React Hooks rules to their `@ttsc/lint`
  counterparts. The compiled WordPress recommended preset now preserves test-file
  overrides and records the unsupported WordPress-specific dependency-hook option
  as an explicit downgrade. — Thanks @imjlk!
- [383d8d13](https://github.com/imjlk/wp-typia/commit/383d8d13393927a53f319c0a29c39c364464aab9) Added: complete native contributor coverage for all 19 WordPress-owned rules
  enabled by the upstream recommended preset. The new rules protect Design
  System token usage, semantic render ordering, and expensive initializers before
  early returns, with pinned ESLint parity and typed rule options.
  Generated persistence templates now defer client-state initialization until
  after their early-return guards and pass the completed preset unchanged. — Thanks @imjlk!
- [e3a7bd29](https://github.com/imjlk/wp-typia/commit/e3a7bd290c0b27c3e095736d7aaa39c6b8451c35) Added: compile the supported portion of the ordered WordPress ESLint recommended
  preset into a static ttsc config chain that preserves file scopes, ignores,
  severities, and supported rule options without a consumer runtime dependency on
  ESLint. Unsupported option payloads retain their severity and are recorded as
  option downgrades in the compatibility manifest. — Thanks @imjlk!
- [c275a84e](https://github.com/imjlk/wp-typia/commit/c275a84ee7d8a975715e216c7d76740862de3f03) Changed: make `ttsc check --noEmit` the generated WordPress code-quality gate
  for TypeScript and JavaScript, backed by the compiled WordPress Scripts preset.
  Scaffolds and retrofit plans now expose explicit `check:code` and `check`
  scripts without lint-only aliases, preserve existing project-owned aggregate
  checks, use ESM-safe lint configuration files, and remove the legacy WordPress
  ESLint and TypeScript 6 compatibility stack from consumer projects. Updated the
  ttsc toolchain to 0.26.2 and retained the exact mapped-type formatting repair
  until an unpatched upstream release passes the regression. The compiled preset
  also publishes explicit behavior downgrades for one native engine failure and
  three JSX semantic mismatches instead of enabling unsafe rules, covering two
  component-classification false positives and valid progressbar ARIA values.
  Generated checks keep ttsc formatting write-only, retain Prettier for
  JavaScript and non-code formatting, and let `ttsc check` own TypeScript,
  JavaScript, and WordPress lint diagnostics. — Thanks @imjlk!
- [98cd4ae0](https://github.com/imjlk/wp-typia/commit/98cd4ae056d2240d27d807ad25d5a6334d0aa8f3) Added: port the seven remaining WordPress internationalization rules to native
  TypeScript-Go contributors, including diagnostics, safe fixes, translator
  comment validation, and full parity for the WordPress-owned `i18n` preset.
  Generated block placeholders now use a Unicode ellipsis so new projects satisfy
  that preset without a follow-up lint fix. — Thanks @imjlk!

## 0.1.1 — 2026-08-08

### Patch changes

- [18bb0794](https://github.com/imjlk/wp-typia/commit/18bb07946096c463f08fab39d16001fe8c311796) Fixed: harden the initial WordPress ttsc lint contributor after its 0.1.0 seed publish.
  
  - Invalid rule options now fail closed instead of silently disabling WordPress diagnostics.
  - The upstream parity harness verifies cached tarball integrity before executing the pinned WordPress rule oracle.
  - Contextual translation helpers and consecutive diagnostic parsing have additional parity coverage. — Thanks @imjlk!

