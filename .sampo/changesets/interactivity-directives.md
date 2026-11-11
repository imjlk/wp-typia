---
npm/@wp-typia/project-tools: patch
npm/wp-typia: patch
---

Show `data-wp-each`, `data-wp-init`, `data-wp-watch`, and `data-wp-run`
in the built-in interactivity block template. The list example keeps notes
in context and renders each one from a template through `context.item`.
Init, watch, and run use the documented zero-argument callback shapes, and
the run callback calls `useState` and `useEffect`.
