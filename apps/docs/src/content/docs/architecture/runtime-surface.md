---
title: 'Runtime Surface Audit'
---

This document is descriptive, not normative. For support guarantees, see
[`docs/runtime-import-policy.md`](./runtime-import-policy.md).

## Current exported surfaces

- `wp-typia`
  CLI package and Bunli command tree.
- `@wp-typia/api-client`
- `@wp-typia/api-client/client-utils`
- `@wp-typia/api-client/runtime-primitives`
- `@wp-typia/api-client/internal/runtime-primitives`
- `@wp-typia/rest`
- `@wp-typia/rest/client`
- `@wp-typia/rest/http`
- `@wp-typia/rest/react`
- `@wp-typia/project-tools`
  Project orchestration helpers used by the CLI and programmatic tooling,
  including the additive `BlockSpec` / `BlockGeneratorService` boundary, the
  non-mutating `inspectBlockGeneration(...)` tool contract, and emitter
  ownership for built-in structural files, TS/TSX scaffold bodies, and built-in
  style/PHP source assets.
- `@wp-typia/project-tools/schema-core`
  Schema and OpenAPI helpers for project-level documents.
- `@wp-typia/project-tools/ai-artifacts`
  Opt-in WordPress AI artifact sync helpers.
- `@wp-typia/project-tools/typia-llm`
  Opt-in build-time `typia.llm` adapter emitter for downstream tool/function
  consumers.
- `@wp-typia/block-runtime`
  Generated-project helper root.
- `@wp-typia/block-runtime/migration-types`
- `@wp-typia/block-runtime/schema-core`
- `@wp-typia/block-runtime/typia-tags`
- `@wp-typia/block-runtime/metadata-core`
- `@wp-typia/block-runtime/metadata-analysis`
- `@wp-typia/block-runtime/metadata-model`
- `@wp-typia/block-runtime/metadata-parser`
- `@wp-typia/block-runtime/metadata-php-render`
- `@wp-typia/block-runtime/metadata-projection`
- `@wp-typia/block-runtime/blocks`
- `@wp-typia/block-runtime/defaults`
- `@wp-typia/block-runtime/editor`
- `@wp-typia/block-runtime/identifiers`
- `@wp-typia/block-runtime/inspector`
- `@wp-typia/block-runtime/json-utils`
- `@wp-typia/block-runtime/validation`

## Classification

### Stable public

- `wp-typia`
- `@wp-typia/api-client`
- `@wp-typia/api-client/client-utils`
- `@wp-typia/api-client/runtime-primitives`
- `@wp-typia/rest`
- `@wp-typia/rest/client`
- `@wp-typia/rest/http`
- `@wp-typia/rest/react`
- `@wp-typia/project-tools`
- `@wp-typia/project-tools/schema-core`
- `@wp-typia/project-tools/ai-artifacts`
- `@wp-typia/project-tools/typia-llm`
- `@wp-typia/block-runtime/migration-types`
- `@wp-typia/block-runtime/schema-core`
- `@wp-typia/block-runtime/typia-tags`
- `@wp-typia/block-runtime/metadata-core`
- `@wp-typia/block-runtime/blocks`
- `@wp-typia/block-runtime/defaults`
- `@wp-typia/block-runtime/editor`
- `@wp-typia/block-runtime/identifiers`
- `@wp-typia/block-runtime/inspector`
- `@wp-typia/block-runtime/json-utils`
- `@wp-typia/block-runtime/validation`

### Advanced or internal-by-name public

- `@wp-typia/api-client/internal/runtime-primitives`
- `@wp-typia/block-runtime/metadata-analysis`
- `@wp-typia/block-runtime/metadata-model`
- `@wp-typia/block-runtime/metadata-parser`
- `@wp-typia/block-runtime/metadata-php-render`
- `@wp-typia/block-runtime/metadata-projection`

## Ownership notes

- `@wp-typia/api-client` owns the transport-neutral endpoint contract, runtime
  validation primitives, and the shared public runtime error base
  (`WpTypiaContractError`, `WpTypiaValidationAssertionError`).
- `@wp-typia/rest` owns WordPress-specific route discovery, `apiFetch`
  integration, decoder helpers, and the React cache/hook layer. The root
  surface is the canonical convenience entry, `./client` is the focused
  transport/runtime entry, `./http` is the focused decoder entry, and `./react`
  owns hooks.
- `wp-typia` owns the CLI, help, TUI, completions, skills, MCP, and bin entry.
- `wp-typia` keeps its public CLI flow stable while the internal runtime bridge
  now delegates focused output and sync helpers behind the facade. That split is
  an implementation detail, not a new CLI surface area.
- `@wp-typia/project-tools` owns scaffold, add-block, migrate, template,
  doctor, package-manager, starter-manifest, the typed generator boundary, the
  opt-in WordPress AI and `typia.llm` adapter emitters, the built-in
  structural/code emitters, the non-mutating
  `inspectBlockGeneration(...)` tool contract, and the preferred schema project
  imports.
  Its source-level `src/runtime/*.ts` files remain stable compatibility
  facades, while implementation ownership now sits behind focused internal
  folders: `add/`, `cli/`, `doctor/`, `migration/`, `schema/`, `shared/`,
  `templates/`, and `workspace/`.
  Built-in templates no longer ship structural, TS/TSX, style, or block-local
  `render.php` Mustache files for those generated artifacts. The higher-level
  generator architecture record lives in
  [`docs/block-generator-architecture.md`](./block-generator-architecture.md).
  The public non-mutating controller contract lives in
  [`docs/block-generator-tool-contract.md`](./block-generator-tool-contract.md).
  External template-layer composition now exists as a built-in generator option
  for both CLI and programmatic callers (`externalLayerSource` and optional
  `externalLayerId`), while the layer contract record lives in
  [`docs/external-template-layer-composition.md`](./external-template-layer-composition.md).
  The public `doctor` flow now delegates environment and workspace checks to
  focused helper modules without changing the supported orchestration imports.
- `@wp-typia/block-runtime/*` owns generated-project runtime helpers directly,
  including the canonical `schema-core` implementation and shared
  manifest/migration contract types. JSON artifact boundaries should prefer the
  validated helpers `parseScaffoldBlockMetadata(...)`,
  `parseManifestDocument(...)`, and `parseManifestDefaultsDocument(...)`
  instead of raw `as` casts on imported `block.json` and
  `typia.manifest.json`.
  Recent splits keep the public facade imports stable while moving inspector
  types/model/controls, metadata-core artifact/client-render/sync-routines, and
  schema-core auth/document/projection helpers into focused internal modules for
  maintainability.
