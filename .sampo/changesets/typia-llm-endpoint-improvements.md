---
npm/@wp-typia/project-tools: patch
---

Fixed: typia.llm tool endpoint PHP template improvements.

- REST routes now include the feature slug (`/llm-tools/<slug>`) to prevent collisions when a workspace has multiple AI features.
- WP_Error status codes from ability execution are preserved instead of always returning 500.
- Empty typia.llm artifacts (no functions) return 404 with a clear message.
- Text domain is escaped via `quotePhpString` in generated PHP string literals.
