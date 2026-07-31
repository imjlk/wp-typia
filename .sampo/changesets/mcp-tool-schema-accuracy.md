---
npm/wp-typia: patch
---

Fixed: MCP built-in tool schema accuracy and namespace collision prevention.

- `migration-plan` now requires `from-migration-version` (matching the underlying CLI behavior) and exposes `to-migration-version`.
- Removed unsupported `block-key` from all tool schemas (the CLI uses `--block` not `--block-key`).
- External MCP groups that reuse the reserved `wp-typia` namespace are filtered out to prevent duplicate namespace collisions during sync.
