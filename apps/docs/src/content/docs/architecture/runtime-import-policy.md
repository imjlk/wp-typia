---
title: 'Runtime Import Policy'
---

This document is the normative import policy for public `wp-typia` package
surfaces.

## Canonical package map

- `wp-typia`
  CLI only.
- `@wp-typia/api-client`
  Transport-neutral runtime surface.
- `@wp-typia/api-client/client-utils`
  Distinct low-level request/response helper surface.
- `@wp-typia/api-client/runtime-primitives`
  Distinct validation/runtime primitive helper surface.
- `@wp-typia/api-client/internal/runtime-primitives`
  Advanced/internal-by-name helper surface for adapter and runtime plumbing.
- `@wp-typia/rest`
  Canonical WordPress REST runtime surface.
- `@wp-typia/rest/client`
  Focused transport/runtime surface for validated fetch helpers, endpoint
  callers, route resolution, validation helpers, and named runtime errors.
- `@wp-typia/rest/http`
  Focused decoder surface for query/header/parameter decoders plus shared
  validation helper utilities.
- `@wp-typia/rest/react`
  React cache and hook surface.
- `@wp-typia/project-tools`
  Project orchestration and programmatic tooling.
- `@wp-typia/project-tools/schema-core`
  Project schema and OpenAPI helpers.
- `@wp-typia/project-tools/ai-artifacts`
  Opt-in WordPress AI artifact sync helpers.
- `@wp-typia/project-tools/typia-llm`
  Opt-in build-time `typia.llm` adapter emitter for downstream tool/function
  consumers.
- `@wp-typia/block-runtime`
  Generated-project block helper root.
- `@wp-typia/block-runtime/migration-types`
  Shared manifest and migration contract implementation owner.
- `@wp-typia/block-runtime/schema-core`
  Shared schema/OpenAPI implementation owner.
- `@wp-typia/block-runtime/typia-tags`
  Type-only Typia tag namespace for generated-project metadata tags.
- `@wp-typia/block-runtime/metadata-core`
  Metadata sync and endpoint manifest helpers.
- `@wp-typia/block-runtime/metadata-analysis`
  Advanced metadata analysis helper surface.
- `@wp-typia/block-runtime/metadata-model`
  Advanced metadata model helper surface.
- `@wp-typia/block-runtime/metadata-parser`
  Advanced TypeScript metadata parser helper surface.
- `@wp-typia/block-runtime/metadata-php-render`
  Advanced PHP validator rendering helper surface.
- `@wp-typia/block-runtime/metadata-projection`
  Advanced manifest and `block.json` projection helper surface.
- `@wp-typia/block-runtime/blocks`
- `@wp-typia/block-runtime/defaults`
- `@wp-typia/block-runtime/editor`
- `@wp-typia/block-runtime/identifiers`
- `@wp-typia/block-runtime/inspector`
- `@wp-typia/block-runtime/json-utils`
- `@wp-typia/block-runtime/validation`

## Generated-project support promise

Generated projects may rely on `@wp-typia/block-runtime/*` and
`@wp-typia/block-runtime/metadata-core` as supported public API.

That means:

- breaking removals are semver-significant
- breaking signature changes are semver-significant
- additive exports remain allowed

Recent internal refactors do not change that promise. Public facades such as
`@wp-typia/block-runtime/inspector`, `@wp-typia/block-runtime/metadata-core`,
`@wp-typia/block-runtime/schema-core`, `@wp-typia/project-tools` doctor
helpers, and the `wp-typia` runtime bridge now delegate to more focused modules
behind the scenes, but callers should continue importing only the documented
public package roots and subpaths.

Do not import split helper files such as inspector type/model/control modules,
metadata-core sync/client-render modules, schema-core document/projection
helpers, `@wp-typia/project-tools` domain folders, or CLI runtime-bridge helpers
directly. Those are implementation details behind the supported facades.

## Programmatic project tooling

Manual orchestration or repo tooling should use:

- `@wp-typia/project-tools`
- `@wp-typia/project-tools/schema-core`
- `@wp-typia/project-tools/ai-artifacts`
- `@wp-typia/project-tools/typia-llm`

Those imports cover scaffold, add-block, migrate, template, doctor, package
manager, starter manifest, schema/OpenAPI project helpers, the `BlockSpec` /
`BlockGeneratorService` generator boundary, the non-mutating
`inspectBlockGeneration(...)` tool contract, opt-in WordPress AI artifacts,
the build-time `typia.llm` adapter target, and the emitter-owned built-in
structural/source path where built-in templates no longer ship structural,
TS/TSX, style, or block-local `render.php` Mustache files.

Inside the package, `src/runtime/*.ts` stays as the compatibility facade layer
that backs documented subpaths such as `@wp-typia/project-tools/cli-add`.
Implementation modules live in focused internal folders: `add/`, `cli/`,
`doctor/`, `migration/`, `schema/`, `shared/`, `templates/`, and `workspace/`.
Those folders are ownership boundaries for maintainers, not supported import
paths for consumers.

For the architecture record behind that boundary, including the staged
non-mutating tool-facing contract and current phase map, see
[`docs/block-generator-architecture.md`](./block-generator-architecture.md).

For the public staged controller/tool payload contract itself, see
[`docs/block-generator-tool-contract.md`](./block-generator-tool-contract.md).

For the external layer package contract on top of the built-in shared scaffold
model, including the current CLI and programmatic composition path, see
[`docs/external-template-layer-composition.md`](./external-template-layer-composition.md).

`@wp-typia/block-runtime/schema-core` is public and stable, but it is the
implementation owner path rather than the preferred project-tooling import.
It now sits as a thin public facade above focused auth, document-generation,
and projection helpers without changing the supported import path.

## Error contract baseline

Validation failures should stay in result unions such as `ValidationResult<T>`
or `EndpointValidationResult<Req, Res>`.

Public runtime throws should prefer named contract errors:

- `WpTypiaContractError`
- `ApiClientConfigurationError`
- `RestConfigurationError`
- `RestRootResolutionError`
- `RestQueryHookUsageError`
- `WpTypiaValidationAssertionError`
- `RestValidationAssertionError`

Internal generator, parser, migration, and build invariants may still use
generic `Error` until there is a concrete downstream need for a typed public
catch contract.

## Out of scope

These areas are not covered by the generated-project compatibility promise:

- CLI implementation internals
- CLI command composition internals
- template rendering internals
- Mustache-vs-emitter implementation details below the current generator boundary
- project-scaffold orchestration internals
