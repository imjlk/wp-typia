---
npm/@wp-typia/block-types: minor
npm/@wp-typia/project-tools: patch
npm/wp-typia: patch
---

Mark the WordPress registration facade peers as optional and isolate its runtime and declaration entrypoint so installing the wp-typia CLI no longer downloads or loads the full WordPress editor dependency graph unless a generated project explicitly needs it. Registration-only exports are removed from the package root and `blocks` aggregate; import them from `@wp-typia/block-types/blocks/registration` instead. Retrofit `init` plans now add `@wordpress/blocks` and its WordPress block types directly so later `add variation` workflows retain their build contract.
