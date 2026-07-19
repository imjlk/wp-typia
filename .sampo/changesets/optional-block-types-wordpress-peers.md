---
npm/@wp-typia/block-types: patch
---

Mark the WordPress registration facade peers as optional and isolate their runtime entrypoint so installing the wp-typia CLI no longer downloads or loads the full WordPress editor dependency graph unless a generated project explicitly needs it.
