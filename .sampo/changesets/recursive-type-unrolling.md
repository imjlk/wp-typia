---
npm/@wp-typia/block-runtime: minor
---

Added: recursive type declarations are now unrolled to a bounded depth instead of throwing.

- The metadata parser previously threw `Recursive types are not supported` on any self-referential or mutually recursive type declaration. It now unrolls the type tree to a configurable maximum depth (default: 5) and emits a terminal empty-object leaf node at the depth limit.
- `analyzeSourceType`, `analyzeSourceTypes`, and `SyncBlockMetadataOptions` accept an optional `maxRecursiveDepth` parameter to override the default.
- All downstream consumers (manifest projection, PHP validator, JSON Schema, migration diff) handle the bounded finite tree transparently without changes.
