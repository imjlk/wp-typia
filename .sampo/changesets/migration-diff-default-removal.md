---
npm/@wp-typia/block-runtime: minor
npm/@wp-typia/project-tools: minor
npm/wp-typia: minor
---

Added: migration diff detects default-value changes and classifies attribute removal in a dedicated risk bucket.

- `MigrationRiskSummary` now exposes a `removal` bucket separate from `additive`. Attribute drops (`drop` diff kind) are no longer folded into the additive risk category, so data-loss edges surface independently in risk summaries, generated registries, and the migration dashboard.
- `createMigrationDiff` now emits a `default-change` diff outcome when a manifest attribute's default value appears, disappears, or changes between versions. Previously default-value transitions were silently ignored during diff planning.
- The empty risk summary and risk summary formatter across `@wp-typia/block-runtime`, `@wp-typia/project-tools`, and generated-project templates (`helpers.ts`, `index.ts`, `report.ts`, `types.ts`) now include the `removal` bucket.
