---
npm/@wp-typia/ttsc-lint-plugin-wp: minor
---

Complete WordPress-owned rule parity: port the remaining eight rules from `@wordpress/eslint-plugin` 25.8.0 as native `@ttsc/lint` contributors — `components-no-missing-40px-size-prop`, `components-no-unsafe-button-disabled`, `data-no-store-string-literals`, `dependency-group`, `no-non-module-stylesheet-imports`, `no-unmerged-classname`, `use-import-as`, and `use-recommended-components`.

All 35 WordPress-owned rules now have native contributors; the unsupported classification is empty. Highlights: the two `components-*` rules port the `checkLocalImports` option with kebab-to-Pascal inference for relative default imports; `use-recommended-components` embeds the upstream `@wordpress/ui` allowlist and 29-entry denylist with the shared `unlock( privateApis )` analysis; `dependency-group` ports both grouping modes with their docblock fixes; `data-no-store-string-literals` ports the import-reference and callback-parameter reference collection across direct, callback, and `controls.*` call shapes.

None of the rules belongs to an upstream preset, so compiled presets are unchanged. The eight additional rule sources raise the contributor package's installed footprint
budget from 360,000 bytes / 40 files to 430,000 bytes / 48 files, following the
established documented-dataset budget pattern. The parity harness now matches 152
diagnostics and autofixes on ttsc 0.23.0 and 0.26.2 across three fixture files.
