---
title: 'Architecture'
---

`wp-typia` is a WordPress block tooling monorepo rather than a single plugin or theme repository.

## Repository Layers

### 1. Product packages

- `packages/wp-typia`
  The canonical CLI package.
- `packages/wp-typia-project-tools`
  The canonical project orchestration package.
- `packages/create-workspace-template`
  The official empty workspace template package used by `wp-typia add block`.
- `packages/wp-typia-block-types`
  Shared WordPress semantic types for generated projects.
- `packages/wp-typia-rest`
  Shared TypeScript REST helpers for data-backed blocks.
- `packages/wp-typia-dataviews`
  Opt-in DataViews compatibility contracts for generated admin screens.

### 2. Reference app

- `examples/my-typia-block`
  The kitchen-sink reference block.
- `examples/persistence-examples`
  The persistence-policy reference plugin with two blocks.
- `examples/compound-patterns`
  The compound parent/child reference plugin.

This package is the place for:

- richer Typia usage
- interactivity and validation UX
- migration snapshots and admin tooling
- server rendering patterns
- E2E and fixture-backed behavior

### 3. Root orchestration

The root workspace owns:

- Bun install/build/test orchestration
- GitHub Actions workflows
- release metadata and publish scripts
- API/usage docs

Release publishing is intentionally package-only and rerun-safe. Example builds stay in CI/dev flows, while npm publish paths build only publishable workspaces and treat partially published reruns as a normal recovery path.

Example-specific root commands use the `examples:*` namespace so the boundary between product packages and the reference app stays explicit.

Maintainers: the completed Gunshi CLI migration record for `packages/wp-typia` lives in
[`docs/bunli-cli-migration.md`](../maintainers/bunli-cli-migration.md).

## Template Model

Built-in templates stay limited to:

- `basic`
- `interactivity`
- `persistence`
- `compound`

Inside `@wp-typia/project-tools`, built-in templates are composed from:

- a shared base layer for common project assets
- a persistence `core` layer for shared typed REST/interactivity wiring
- a persistence policy layer (`public` or `auth`)
- a compound `core` layer for multi-block parent/child scaffolds
- an optional compound persistence layer plus policy layer for parent-only persistence
- a template-specific overlay

This keeps public scaffold behavior stable while letting shared runtime/helper changes flow into the built-in templates.

The `persistence` template extends the same base with:

- typed REST contracts and client helpers
- schema sync outputs
- generated PHP route/storage files
- a selectable persistence mode (`post-meta` or `custom-table`)
- a selectable persistence policy (`authenticated` or `public`)

The `compound` template extends the same base with:

- a multi-block project layout under `src/blocks/*`
- a top-level parent block and a hidden implementation child block
- `InnerBlocks`-driven composition and default child seeding
- optional parent-only persistence when either `--data-storage` or `--persistence-policy` is supplied

Generated projects now treat `@wp-typia/block-runtime/*` as the maintained
runtime helper surface. Project orchestration lives in
`@wp-typia/project-tools`.

The repo increasingly keeps those public package roots and subpaths stable while
splitting implementation into focused internal modules. Recent examples include
the `@wp-typia/block-runtime/inspector` facade over its types/model/controls
modules, `@wp-typia/block-runtime/metadata-core` over artifact/client-render/sync
routines, `@wp-typia/block-runtime/schema-core` over auth/documents/projection,
`@wp-typia/project-tools` doctor orchestration over environment/workspace
helpers, and the `wp-typia` CLI runtime bridge over output/sync helpers.

That pattern is a maintainability and ownership improvement, not a signal that
consumers should start importing the newly split helper files directly.

Reusable third-party layer composition on top of this built-in shared model is
tracked separately in
[`docs/external-template-layer-composition.md`](../architecture/external-template-layer-composition.md).

## Intended Flow

1. Scaffold a block with `wp-typia create`
2. Or scaffold an empty workspace with `wp-typia create --template @wp-typia/create-workspace-template`
3. Grow that workspace with `wp-typia add block`
4. Author the schema in `src/types.ts`
5. Run `sync-types`
6. Build and validate the block
7. Use `persistence --persistence-policy public` for signed public writes
8. Use `persistence --persistence-policy authenticated` for logged-in writes
9. Use `compound` when you need a scaffolded parent/child `InnerBlocks` structure
10. Use the reference apps when you need kitchen-sink, policy-specific, or compound runtime patterns
