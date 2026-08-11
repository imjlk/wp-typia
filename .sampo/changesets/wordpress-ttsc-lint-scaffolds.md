---
npm/@wp-typia/create-workspace-template: minor
npm/@wp-typia/project-tools: minor
npm/wp-typia: minor
---

Added: integrate the WordPress ttsc lint contributor into generated and existing projects.

- New scaffolds install `@wp-typia/ttsc-lint-plugin-wp` and bind its compiled WordPress Scripts recommended preset to the generated text domain.
- `wp-typia init --apply` can upgrade official workspaces and supported retrofit layouts without overwriting project-owned lint configs.
- Doctor reports the managed combined code gate and preserves project-owned checks during adoption.
