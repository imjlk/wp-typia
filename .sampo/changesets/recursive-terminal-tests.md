---
npm/@wp-typia/block-runtime: patch
---

Added: PHP validator regression test for recursive type terminals.

- New test verifying that manifest projection and PHP generation warning collection handle recursive terminal nodes (empty objects) without errors.
- Documented known limitation: non-object recursive aliases produce object terminals instead of preserving the outer kind.
