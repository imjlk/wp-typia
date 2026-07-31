---
npm/wp-typia: minor
---

Added: `wp-typia sync` now recognizes and dispatches a `sync-typia-llm` script.

- Projects that define a `sync-typia-llm` script in `package.json` will have it executed as part of the default sync chain, ordered after `sync-rest` and before `sync-ai`. This allows projects to generate `*.llm.application.json` artifacts during sync.
