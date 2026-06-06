---
npm/@wp-typia/project-tools: patch
npm/wp-typia: patch
---

Fixed `doctor --wp-version-check` feature-floor detection so generated core
variations and binding source APIs are recognized from executable registrations
instead of comments, string literals, or stray TypeScript files.
