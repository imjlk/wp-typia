---
npm/@wp-typia/block-runtime: patch
---

Fixed: utility type edge cases for Record literal keys and type narrowing.

- `Record<'a' | 'b', V>` now produces concrete typed properties for each literal key instead of an empty permissive object. Non-literal keys (`Record<string, V>`) still produce an open object.
- `extractKeyLiterals` type narrowing fixed: the union branch no longer relies on `every()` + `flat()` which fails to narrow under strict mode.
