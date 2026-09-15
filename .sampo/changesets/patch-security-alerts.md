---
npm/@wp-typia/block-runtime: patch
npm/@wp-typia/block-types: patch
npm/@wp-typia/project-tools: patch
npm/wp-typia: patch
---

Fix six high-severity CodeQL security alerts and a pre-existing `@wp-typia/block-types` build failure.

Four ReDoS regex patterns (import matching in `cli-add-workspace-rest-sync-script-shared.ts` and `cli-add-workspace-ai-sync-rest-anchors.ts`, timeout and unknown-template matchers in `cli-diagnostics.ts`, path validation in `cli-scaffold-output.ts`) are rewritten to eliminate nested quantifiers with overlapping match domains — the import patterns now match one line per iteration, the timeout alternation uses a bounded character class, and the path validator treats `/` as a pure delimiter. A shared `isSafeSchemaKey` guard protects the JSON Schema constraint assignments against `__proto__`, `constructor`, and `prototype` keys.

The `registerScaffoldBlockType` cast in `@wp-typia/block-types` now uses the actual `registerBlockType` parameter type instead of `Partial<BlockType>`, which no longer satisfies the `@wordpress/blocks` 15.27 `SettingsBlockConfiguration` signature under `exactOptionalPropertyTypes: true`.
