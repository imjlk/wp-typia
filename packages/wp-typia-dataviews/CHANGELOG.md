# @wp-typia/dataviews

## 0.2.1 — 2026-08-11

### Patch changes

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

## 0.2.0 — 2026-07-28

### Minor changes

- [fcbb14b0](https://github.com/imjlk/wp-typia/commit/fcbb14b01c68faf1c9e1b7144f356ff93fbb1897) Move the supported development and generated-project toolchain to Node.js 24,
  TypeScript 7, typia 13, and ttsc. Generated projects now declare Node.js 24
  or newer. — Thanks @imjlk!

## 0.1.2 — 2026-06-02

### Patch changes

- [25c7d51c](https://github.com/imjlk/wp-typia/commit/25c7d51c5ee424d7fa6dfee8b951d434719804d7) Enable the next package-level TypeScript strictness ratchet for the smaller runtime packages. — Thanks @imjlk!

## 0.1.1 — 2026-05-04

### Patch changes

- [af9c743](https://github.com/imjlk/wp-typia/commit/af9c743cc439a4c4c276efe788d71753d9560f3a) Include @wp-typia/dataviews in the automated npm OIDC publish workflow. — Thanks @imjlk!

