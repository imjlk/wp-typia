---
npm/@wp-typia/project-tools: patch
---

Fixed: two migration diff edge cases that produced incorrect removal detection.

- Nested object-to-primitive type changes (e.g. `settings.mode: { value: string }` → `settings.mode: string`) no longer produce false `drop` outcomes for the old child leaf paths. The diff loop now checks whether the immediate parent path is retained as a non-object before classifying a leaf as a drop.
- Array item property removals (e.g. `Array<{ label; legacy }>` → `Array<{ label }>`) are now detected as `drop` outcomes. `flattenManifestAttribute` now descends into array item object properties, and `getAttributeByCurrentPath` resolves `[]` array item paths.
