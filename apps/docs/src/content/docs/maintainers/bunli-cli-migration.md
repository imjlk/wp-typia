---
title: '`wp-typia` Gunshi Runtime Contract'
---

This note records the implemented ownership boundary after the Gunshi migration
and the project-tools split.

## Current state

- `packages/wp-typia` owns the published CLI package, top-level command
  taxonomy, help surface, Gunshi integration, command dispatch facade, and
  `bin/wp-typia.js`.
- The authored runtime lives in `packages/wp-typia/src/gunshi-cli.ts` and
  `packages/wp-typia/src/node-cli.ts`, and is compiled into
  `packages/wp-typia/dist/cli.js` for the published package.
- `runGunshiCli()` is the published entrypoint wrapper. It applies standalone
  support setup and routes Node `wp-typia complete <shell>` requests through the
  Gunshi completion plugin.
- General command dispatch is still owned by `runNodeCli()`, the shared command
  registry, and the custom dispatchers. That path owns global flag parsing,
  config defaults, AI-agent structured-output defaults, shared diagnostics, and
  the public command handlers for `create`, `init`, `sync`, `add`, `migrate`,
  `templates`, `doctor`, `mcp`, `skills`, and the legacy `completions` alias.
- This is the current maintained boundary after the migration, not a temporary
  compatibility lane. Future parser work should document any change that moves
  general command dispatch away from the registry/custom dispatcher layer.
- `packages/wp-typia/bin/wp-typia.js` must launch built artifacts only:
  `dist/cli.js` plus the generated `bin/` routing helpers. It must not shell
  out to source TypeScript.
- Bun remains the maintainer build and test toolchain, but Node is the
  canonical npm runtime for the published CLI.
- Standalone GitHub Release assets are a separate distribution lane: platform
  binaries, checksum manifests, and install scripts are published for users who
  want a direct binary installation path.

Canonical usage remains:

- `npx wp-typia create <project-dir>`
- `bunx wp-typia create <project-dir>`
- `wp-typia <project-dir>` as the compatibility alias when `<project-dir>` is the only positional argument
- `wp-typia migrate <subcommand>`

Published runtime support model:

- `npx wp-typia`, `bunx wp-typia`, and direct Node execution should target the
  built `dist` artifact rather than source TypeScript.
- Portable Node support is guaranteed for `--version`, `--help`, `create`,
  `init`, `add`, `migrate`, `doctor`, `sync`, `templates`, `mcp`, `skills`,
  `complete`, and `completions`.
- The portable CLI should preserve stable machine-readable `error.code`
  identifiers whenever `--format json` is requested, so automation can branch
  on failure categories without parsing the human-readable message body.
- Standalone release assets should compile from the same authored CLI entry and
  generated routing metadata, but they are a distinct build lane from the npm
  package runtime and are published through a dedicated release-asset workflow,
  not npm tarballs.
- Install scripts should target those standalone release assets directly:
  `install-wp-typia.sh` for macOS/Linux and `install-wp-typia.ps1` for Windows.

## Structured CLI diagnostic contract

When `wp-typia` runs with `--format json`, failure payloads should treat
`error.code` as the stable machine-readable branching key.

Structured context that automation may also inspect:

- `error.command`
- `error.kind`
- `error.tag`

The human-facing fields are intentionally not the compatibility surface:

- `error.message`
- `error.summary`
- `error.detailLines`

Those text fields should stay readable and actionable for humans, but
automation should branch on the structured identifiers above instead of parsing
English prose.

Current stable `error.code` vocabulary:

- `command-execution`
- `configuration-missing`
- `dependencies-not-installed`
- `doctor-check-failed`
- `invalid-argument`
- `invalid-command`
- `missing-argument`
- `missing-build-artifact`
- `outside-project-root`
- `template-source-timeout`
- `template-source-too-large`
- `unknown-template`
- `unsupported-command`

That same JSON contract should apply both to command-handler failures and to
top-level parse/normalization failures that happen before command dispatch, as
long as the caller explicitly requested `--format json`.

New user-facing CLI failures should own their diagnostic code at the throw site
by using `createCliDiagnosticCodeError(code, message)` in shared runtime code or
`createCliCommandError({ code, ... })` at command boundaries. Regex-based
`inferCliDiagnosticCode()` classification is retained only as a compatibility
fallback for legacy or third-party errors.

Treat every regex in `inferCliDiagnosticCode()` as coupled to the exact
project-tools runtime validation message it matches. Rewording one of those
messages can silently change, downgrade, or remove the diagnostic code returned
to JSON consumers. When adding a new user-facing runtime validation failure, use
a diagnostic-coded error at the throw site instead of extending the fallback
classifier, unless the failure truly comes from legacy or untyped code that
cannot carry a code yet.

Shorthand references like `npx wp-typia` and `bunx wp-typia` should still map
to the canonical `create` surface in docs and review notes.

## Portable CLI prompt model

- OpenTUI rendering has been removed from the published CLI.
- Any remaining prompts should stay readline-based and intentionally light, but
  must not feel like a bare escape hatch.
- The portable prompt contract is:
  - render numbered options with explicit defaults
  - accept option numbers, labels, and raw values
  - support `?`, `help`, and `list` to redraw the current option set
  - retry validation inline with direct guidance instead of dropping the user
    back into an opaque loop
- Business logic, defaults, and validation rules should stay shared through
  `@wp-typia/project-tools`; only prompt presentation should differ.

## Non-negotiable ownership boundary

- `wp-typia` must remain the only CLI-owning package.
- `@wp-typia/project-tools` must remain non-CLI.
- `@wp-typia/project-tools` must not gain a `bin` entry.
- `@wp-typia/project-tools` must not expose a second top-level CLI parser.

`@wp-typia/project-tools` is the runtime library behind:

- create execution
- add-block execution
- template inspection
- migrate execution
- doctor checks
- schema/OpenAPI project helpers

## Removed TUI contract

- Published CLI commands must not depend on Bunli `render`,
  `bufferMode: "alternate"`, or OpenTUI lifecycle helpers.
- Flag-driven text and JSON flows are the supported user-facing surfaces.

## Canonical CLI command surface

The command surface below is registry-owned today. Gunshi owns the Node
completion integration for `complete`; `completions` remains supported as the
legacy alias through the shared dispatcher.

- `create`
- `init`
- `sync`
- `add`
- `migrate`
- `templates`
- `doctor`
- `mcp`
- `skills`
- `complete`
- `completions`

Compatibility alias:

- `wp-typia <project-dir>` remains supported as a compatibility alias to
  `wp-typia create <project-dir>` when `<project-dir>` is the only positional
  argument.

Breaking change:

- `wp-typia migrations` is removed. Use `wp-typia migrate` instead.
