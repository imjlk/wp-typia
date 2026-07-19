---
npm/@wp-typia/block-types: major
---

Mark the WordPress registration facade peers as optional and isolate its runtime and declaration entrypoint so installing the wp-typia CLI no longer downloads or loads the full WordPress editor dependency graph unless a generated project explicitly needs it. Registration-only exports are removed from the package root and `blocks` aggregate; import them from `@wp-typia/block-types/blocks/registration` instead.
