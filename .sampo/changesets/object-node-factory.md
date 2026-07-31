---
npm/@wp-typia/block-runtime: patch
---

Refactored: eliminate 11 duplicate `wp: {...}` object literals in metadata parser.

- All attribute node construction in `metadata-parser.ts` now uses `baseNode(kind, pathLabel)` + spread overrides instead of repeating the full `wp`, `constraints`, `enumValues`, `union` boilerplate.
- Removed unused `defaultAttributeConstraints` import from the parser.
- Renamed local `baseNode` variable in `parseInterfaceDeclaration` to `extendedNode` to avoid shadowing the imported `baseNode` function.
