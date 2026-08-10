---
npm/@wp-typia/ttsc-lint-plugin-wp: minor
npm/@wp-typia/create-workspace-template: minor
npm/@wp-typia/project-tools: minor
npm/wp-typia: minor
npm/@wp-typia/api-client: patch
npm/@wp-typia/block-runtime: patch
npm/@wp-typia/block-types: patch
npm/@wp-typia/dataviews: patch
npm/@wp-typia/rest: patch
---

Changed: make `ttsc check --noEmit` the generated WordPress code-quality gate
for TypeScript and JavaScript, backed by the compiled WordPress Scripts preset.
Scaffolds and retrofit plans now expose explicit `check:code` and `check`
scripts without lint-only aliases, preserve existing project-owned aggregate
checks, use ESM-safe lint configuration files, and remove the legacy WordPress
ESLint and TypeScript 6 compatibility stack from consumer projects. Updated the
ttsc toolchain to 0.26.1 and retained the exact mapped-type formatting repair
until an unpatched upstream release passes the regression. The compiled preset
also publishes explicit behavior downgrades for one native engine failure and
three JSX semantic mismatches instead of enabling unsafe rules, covering two
component-classification false positives and valid progressbar ARIA values.
Generated checks keep ttsc formatting write-only, retain Prettier for
JavaScript and non-code formatting, and let `ttsc check` own TypeScript,
JavaScript, and WordPress lint diagnostics.
