---
npm/wp-typia: patch
---

Fixed: MCP external schema source failures no longer discard valid groups.

- `loadMcpToolGroups` now uses `Promise.allSettled` instead of `Promise.all`, so one malformed external schema source does not discard all other valid external groups.
