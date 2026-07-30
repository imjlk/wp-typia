---
npm/@wp-typia/project-tools: patch
---

Fixed: three migration diff and dashboard gaps surfaced by Codex review on PR #1156.

- Composite attribute default changes (object, array, union) are now detected by `createMigrationDiff` and classified in the additive risk bucket. Previously the composite branches returned before the default-change check, hiding default transitions on nested attributes.
- Nested property removals inside retained objects are now tracked as `drop` outcomes in the removal risk bucket. Previously `compareObjectAttribute` only iterated new properties, so removed nested fields were silently discarded.
- The generated migration dashboard (`migration-dashboard.tsx`) now includes the `removal` bucket in `riskTotals`, `formatRiskSummaryLine`, and `collectStats`, so attribute drops surface in both per-result and aggregate views.
