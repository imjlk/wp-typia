---
npm/@wp-typia/project-tools: patch
---

Fixed: typia.llm tool dispatch now resolves ability IDs when tool name and ability ID differ.

- The dispatch handler tries `wp_get_ability($tool_name)` directly first, then falls back to searching all abilities via `wp_get_abilities()` for one whose ID ends with `/$tool_name`, matching the `category/operationId` format used by the WordPress Abilities API.
