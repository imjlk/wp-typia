---
npm/wp-typia: minor
---

Added: wp-typia migration tools are now exposed as built-in MCP tools for AI agent discovery.

- A built-in `wp-typia` MCP tool group is now included alongside external schema sources in `wp-typia mcp list` and `wp-typia mcp sync`. It exposes `migration-diff`, `migration-plan`, and `migration-scaffold` as self-describing MCP tools with input schemas, so AI agents can discover and invoke migration diagnostics without memorizing CLI flags.
- This enables the agent loop: an AI agent inspects migration diffs via MCP, writes migration rules, and scaffolds verify/fuzz harnesses — all through the MCP tool interface.
