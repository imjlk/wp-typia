---
title: 'Gunshi-native Dispatch Migration RFC'
description: 'Future migration gates for moving wp-typia command dispatch into Gunshi.'
---

This RFC records the safe path for any future migration from the current split
runtime boundary to Gunshi-native command dispatch. It is intentionally not an
implementation plan for an immediate all-command rewrite.

## Status

- Status: proposed
- Scope: maintainer architecture and migration gates
- Public behavior impact: none
- Release impact: none until a later PR changes command execution behavior

## Current Boundary

`wp-typia` now runs through the Node-first CLI runtime. The published entrypoint
is `runGunshiCli()`, but the command surface is not fully Gunshi-native today.

Gunshi currently owns:

- Node shell completion integration for `wp-typia complete <shell>`
- the legacy `wp-typia completions <shell>` alias, normalized onto the same
  completion path
- dynamic completion requests that arrive through `wp-typia complete -- ...`

The registry/custom dispatcher currently owns:

- top-level command normalization
- positional `create` alias handling
- global and command option parsing
- config override loading
- AI-agent structured-output defaults
- help output
- structured and human-readable diagnostics
- command execution for `create`, `init`, `sync`, `add`, `migrate`,
  `templates`, `doctor`, `mcp`, and `skills`

This split is the maintained production boundary. New behavior should continue
to use the registry/custom dispatcher unless it is specifically part of shell
completion integration.

## Migration Gates

A Gunshi-native dispatch migration may start only after these gates are met:

- The dispatch parity harness stays green for every public command, supported
  alias, and structured-output default.
- Option metadata has a single owner, or there is an adapter that proves Gunshi
  and the registry cannot diverge on flags, defaults, repeatable options, and
  short aliases.
- Help output parity is covered for top-level help, command help, subcommand
  help, short aliases, and unknown help targets.
- A structured diagnostic adapter preserves the current `--format json`
  contract, including top-level parser failures before command execution.
- AI-agent detection still defaults agent runs toward structured output unless
  `--format text` is explicit.
- Completion parity remains covered for `complete <shell>`,
  `completions <shell>`, and `complete -- ...`.
- Published install smoke passes under Node without requiring Bun on `PATH`.

## Suggested Migration Shape

Prefer command-by-command opt-in over a broad parser replacement.

1. Add Gunshi adapters that consume the existing command registry and option
   metadata without duplicating flag definitions.
2. Start with read-only commands whose outputs are already covered by parity
   tests, such as `version`, `help`, or `templates list`.
3. Keep mutation-heavy commands on the registry/custom dispatcher until create,
   add, sync, migrate, MCP, and skills JSON/text parity is fully covered.
4. Add release smoke for each command before switching its dispatch owner.
5. Remove custom dispatch code only after all public commands have passed
   parity under the Gunshi-native path and a release candidate has completed
   published install smoke.

## Non-goals

- No immediate all-command Gunshi-native rewrite.
- No public command, flag, completion, MCP, skills, or shell execution behavior
  change in this RFC.
- No Bun removal from the repository development, build, or test toolchain.
- No rollback to Bunli or OpenTUI command surfaces.

## Test Anchor

The current boundary is codified by
`packages/wp-typia/tests/gunshi-dispatch-parity.test.ts`. Treat that test as a
contract: if a future PR intentionally changes dispatch ownership, update the
test and explain the new ownership boundary in the PR.
