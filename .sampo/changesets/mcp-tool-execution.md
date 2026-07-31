---
npm/wp-typia: minor
---

Added: `wp-typia mcp call` subcommand for executing built-in MCP tools.

- AI agents can now invoke migration tools via `wp-typia mcp call --tool migration-diff --from-migration-version v1` instead of only discovering schemas.
- The call handler delegates to the existing CLI migration runtime via subprocess, returning JSON results.
- Supports `migration-diff`, `migration-plan`, and `migration-scaffold` tools.
