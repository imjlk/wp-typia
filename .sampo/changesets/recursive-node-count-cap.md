---
npm/@wp-typia/block-runtime: patch
---

Fixed: total node count cap prevents exponential expansion from multi-branch recursive types.

- The parser now tracks total attribute nodes created during a single analysis run and emits a terminal leaf when the count exceeds 5000, preventing memory exhaustion from multi-branch recursive types like binary trees at high depth.
