# Upgrade Guide

Use this document for high-signal `wp-typia` upgrade notes that are easy to miss
if you only skim package changelogs.

## What this guide covers

- command or package role changes that affect maintainer workflows
- scaffold/runtime defaults that may change how generated projects are operated
- deprecations that need a migration step

It does not replace per-package `CHANGELOG.md` files.

## Recent upgrade checkpoints

### Node.js 24, TypeScript 7, typia 13, and ttsc are now the baseline

Published packages and newly generated projects now require Node.js 24 or
newer. Upgrade local development, CI, and deployment runtimes before updating
the package family.

Generated TypeScript workflows now use `ttsc` and `ttsx`:

- replace direct `tsc`, `tspc`, and `ts-patch` build or typecheck commands with
  `ttsc`
- replace transform-dependent `tsx` commands with `ttsx`
- upgrade `typia` to 13.x and use `@ttsc/unplugin` for Webpack integration
- remove `@typia/unplugin`, `ts-patch`, and other superseded transformer wiring

TypeScript 7 does not expose the JavaScript Compiler API. Custom tooling that
imports `typescript` at runtime should use the isolated
`@typescript/typescript6` compatibility package instead.

### CLI shape moved to explicit `create` and `add` commands

Recent releases standardized the CLI around explicit top-level verbs:

- `wp-typia create <project-dir>`
- `wp-typia add <kind> ...`
- `wp-typia migrate <subcommand>`

Compatibility aliases still exist in some places, but maintainers should update
docs, shell scripts, and CI examples to use the explicit command group shape.

### Workspace flow is now an official external template

Multi-block plugin workflows now live behind the official external workspace
template package instead of the built-in template list:

- `@wp-typia/create-workspace-template`

Use that template when you want a plugin workspace that can grow via:

- `wp-typia add block`
- `wp-typia add variation`
- `wp-typia add pattern`
- `wp-typia add binding-source`
- `wp-typia add hooked-block`

If you only need a single block scaffold, stay on the built-in templates.

### Canonical runtime/import surfaces were narrowed

The current package-role split is:

- `wp-typia` owns the CLI
- `@wp-typia/project-tools` owns programmatic scaffold/migrate/doctor helpers
- `@wp-typia/block-runtime/*` owns generated-project runtime helpers

Generated projects and examples should import runtime helpers from
`@wp-typia/block-runtime/*`, not local copied helpers or deprecated compatibility
paths.

### Removed package shells should not be used for new installs

These historical package names are no longer kept in-repo and should not be
used for new installs:

- `@wp-typia/create`
- `create-wp-typia`

Use these packages instead:

- `wp-typia`
- `@wp-typia/create-workspace-template` for empty workspaces

## Upgrade checklist

When upgrading maintainers or generated project docs, verify:

1. CLI examples use `wp-typia create`, `add`, and `migrate`.
2. Multi-block plugin guidance points to the workspace template package.
3. Runtime helper imports use `@wp-typia/block-runtime/*`.
4. Removed package shells are not suggested for new installs.
5. Local, CI, and deployment runtimes use Node.js 24 or newer.
6. Generated TypeScript commands use `ttsc`/`ttsx` with typia 13.
7. Release/process changes still match [`CONTRIBUTING.md`](./CONTRIBUTING.md).
