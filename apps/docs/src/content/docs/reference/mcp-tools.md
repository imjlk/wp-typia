---
title: MCP Tools
description: Built-in MCP tools exposed by wp-typia for AI agent discovery and execution.
---

## Overview

wp-typia exposes migration diagnostics as self-describing MCP (Model Context Protocol) tools. AI agents can discover and invoke these tools without memorizing CLI flags.

## Discovering tools

```bash
wp-typia mcp list
```

Lists all available tool groups, including the built-in `wp-typia` namespace and any external schema sources configured in `package.json`.

```bash
wp-typia mcp list --format json
```

Returns machine-readable JSON for agent consumption.

## Syncing tool schemas

```bash
wp-typia mcp sync
```

Generates TypeScript type definitions and a registry JSON from all tool groups (built-in + external) into `.wp-typia/mcp/`.

## Built-in tools

The `wp-typia` namespace exposes three migration tools:

### migration-diff

Shows the migration diff between two schema versions.

```bash
wp-typia mcp call \
  --tool migration-diff \
  --from-migration-version v1 \
  --to-migration-version v3
```

Returns auto/manual items, rename candidates, and risk summary as JSON.

### migration-plan

Previews the migration plan for a workspace.

```bash
wp-typia mcp call \
  --tool migration-plan \
  --from-migration-version v1
```

Lists which blocks need migration and their risk summaries.

### migration-scaffold

Scaffolds migration rule files for a specific version transition.

```bash
wp-typia mcp call \
  --tool migration-scaffold \
  --from-migration-version v1 \
  --to-migration-version v3
```

Generates rename maps, transform stubs, and verify/fuzz harnesses.

## External schema sources

Projects can define additional MCP tool groups via `package.json`:

```json
{
  "wp-typia": {
    "mcp": {
      "schemaSources": [
        {
          "namespace": "my-plugin",
          "path": "./mcp-tools.json"
        }
      ]
    }
  }
}
```

External groups that reuse the reserved `wp-typia` namespace are filtered out. Malformed external sources are skipped gracefully without affecting built-in tools.

## sync-typia-llm integration

Projects with a `sync-typia-llm` script in `package.json` will have it executed as part of the default `wp-typia sync` chain, ordered after `sync-rest` and before `sync-ai`. This allows generation of `*.llm.application.json` artifacts during sync.
