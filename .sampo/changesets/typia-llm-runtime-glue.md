---
npm/@wp-typia/project-tools: minor
---

Added: generated PHP REST endpoint that exposes typia.llm function-calling tool schemas to WordPress AI consumers at runtime.

- New `buildTypiaLlmToolEndpointPhpSource` template generates a PHP module that loads the pre-compiled `*.llm.application.json` artifact (no typia runtime dependency) and serves it via a read-only `/llm-tools` REST route.
- A `/llm-tools/dispatch` route maps incoming AI tool-calls to registered WordPress abilities via `wp_get_ability` / `wp_execute_ability`, reusing the existing permission and execution pipeline instead of duplicating handler logic.
- This closes the gap between typia.llm build-time artifact generation and WordPress runtime consumption (diagnosed as C1).
