---
npm/@wp-typia/project-tools: minor
---

Added: typia.llm tool endpoint is now generated during AI feature scaffolding.

- `scaffoldAiFeatureWorkspace` now writes the typia.llm tool endpoint PHP file (`inc/<slug>-llm-tools.php`) alongside the existing AI feature PHP, so the endpoint is available immediately after scaffolding.
- Fixed the dispatch handler to use `$ability->execute()` (the correct WordPress Abilities API method) instead of the non-existent `wp_execute_ability()` function.
