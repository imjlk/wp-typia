---
npm/@wp-typia/ttsc-lint-plugin-wp: minor
---

Added: port five WordPress runtime safety rules to native TypeScript-Go
contributors and map the upstream React Hooks rules to their `@ttsc/lint`
counterparts. The compiled WordPress recommended preset now preserves test-file
overrides and records the unsupported WordPress-specific dependency-hook option
as an explicit downgrade.
