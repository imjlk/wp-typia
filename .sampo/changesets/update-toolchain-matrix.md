---
npm/@wp-typia/ttsc-lint-plugin-wp: patch
npm/@wp-typia/create-workspace-template: minor
npm/@wp-typia/project-tools: minor
npm/wp-typia: minor
npm/@wp-typia/block-runtime: patch
npm/@wp-typia/block-types: patch
npm/@wp-typia/dataviews: patch
npm/@wp-typia/rest: patch
npm/@wp-typia/api-client: patch
---

Update the supported build toolchain to ttsc 0.30.4 and typia 14.0.6,
including generated projects and the WordPress lint contributor compatibility
range. Retain the version-pinned native compatibility repairs and their
regression coverage.

Generated and retrofitted projects now require typia 14. Its standalone CLI was
removed upstream; use the managed ttsc/ttsx commands and @ttsc/unplugin integration.
