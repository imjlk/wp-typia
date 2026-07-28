# @wp-typia/rest

## 0.4.0 — 2026-07-28

### Minor changes

- [fcbb14b0](https://github.com/imjlk/wp-typia/commit/fcbb14b01c68faf1c9e1b7144f356ff93fbb1897) Move the supported development and generated-project toolchain to Node.js 24,
  TypeScript 7, typia 13, and ttsc. Generated projects now declare Node.js 24
  or newer. — Thanks @imjlk!

### Patch changes

- Updated dependencies: api-client (npm)@0.5.0

## 0.3.14 — 2026-06-02

### Patch changes

- [25c7d51c](https://github.com/imjlk/wp-typia/commit/25c7d51c5ee424d7fa6dfee8b951d434719804d7) Enable the next package-level TypeScript strictness ratchet for the smaller runtime packages. — Thanks @imjlk!
- Updated dependencies: api-client (npm)@0.4.6

## 0.3.13 — 2026-05-02

### Patch changes

- [bb23621](https://github.com/imjlk/wp-typia/commit/bb23621265f012b6ed575a6a5d3c4c9d363c0720) Ensure React query cache invalidation uses monotonic cache revisions so same-millisecond invalidations refetch reliably without skewing stale-time timestamps. — Thanks @imjlk!

## 0.3.12 — 2026-04-30

### Patch changes

- [4f36355](https://github.com/imjlk/wp-typia/commit/4f363553d4a1749d11d8da497cca61224efe9bf0) Add resource-level REST facades to `@wp-typia/rest` so existing endpoint
  contracts can be grouped behind typed list/read/create/update/delete helpers,
  including optional list-query bridges and matching React resource hooks. — Thanks @imjlk!

## 0.3.11 — 2026-04-20

### Patch changes

- [65b8eb2](https://github.com/imjlk/wp-typia/commit/65b8eb2cf876eb73c8200da4fbcfd9fc30d2b5e0) Add the first-class `wp-typia add rest-resource <name>` workspace workflow so official workspace plugins can scaffold plugin-level typed REST resources with generated TypeScript contracts, validators, endpoint clients, React data hooks, PHP route starters, `sync-rest` inventory support, and matching add/doctor/help surfaces.
  
  Teach `@wp-typia/rest` endpoint execution to honor `requestLocation: "query-and-body"` so generated update clients can split query parameters and JSON bodies correctly. — Thanks @imjlk!

## 0.3.10 — 2026-04-19

### Patch changes

- [460d86d](https://github.com/imjlk/wp-typia/commit/460d86d92fc0af94bbcb0542feb400236e9004ae) Remove the deprecated `@wp-typia/create` and `create-wp-typia` package shells from the repository, and update current docs plus publish automation to point directly at `wp-typia`, `@wp-typia/project-tools`, and `@wp-typia/block-runtime`. — Thanks @imjlk!
- [cb60cfc](https://github.com/imjlk/wp-typia/commit/cb60cfc6c4fb742ceb4c5235a0c9a0a59e153d02) Split the `@wp-typia/rest` React client cache-key, cache-state, and utility helpers into focused modules while keeping the public `react-client` surface stable. — Thanks @imjlk!

## 0.3.9 — 2026-04-18

### Patch changes

- [5b71cdc](https://github.com/imjlk/wp-typia/commit/5b71cdced704a0b1f2dcb030c4cf7a8c2c74481f) Refresh the hosted docs site, expand TypeDoc and TSDoc coverage for core plus advanced public surfaces, and document the latest public facade boundaries without changing runtime behavior. — Thanks @imjlk!
- Updated dependencies: api-client (npm)@0.4.5

## 0.3.8 — 2026-04-16

### Patch changes

- [86c1537](https://github.com/imjlk/wp-typia/commit/86c1537ea68c32973f92e296d0518bfcd286d6cd) Clarify the focused `@wp-typia/rest/client` and `@wp-typia/rest/http`
  subpath surfaces, route those exports to their dedicated build outputs, and
  isolate the remaining generic fallback casts inside the React cache helpers. — Thanks @imjlk!

## 0.3.7 — 2026-04-13

### Patch changes

- [663872b](https://github.com/imjlk/wp-typia/commit/663872b51f25f5ddccec3cafb776450abfeca7f9) Clarify the public runtime error contract and `@wp-typia/rest` export semantics
  by documenting validation-vs-throw behavior, introducing named configuration and
  assertion errors for the runtime client packages, and explicitly documenting
  that `./client` and `./http` remain compatibility aliases in the current major
  line instead of introducing a breaking export split. — Thanks @imjlk!
- Updated dependencies: api-client (npm)@0.4.4

## 0.3.6 — 2026-04-12

### Patch changes

- [e962f79](https://github.com/imjlk/wp-typia/commit/e962f7932927998191a8fcae2a41dd2f69447cff) Fix request validation failure paths so `callEndpoint()` and the React REST
  helpers preserve an honest request-vs-response validation contract instead of
  casting request failures to response validation results. — Thanks @imjlk!
- Updated dependencies: api-client (npm)@0.4.3

## 0.3.5 — 2026-04-09

### Patch changes

- [ab7d1c9](https://github.com/imjlk/wp-typia/commit/ab7d1c9afaf4039b5053991ca9fe88cabcd46a13) Publish shared API client utilities and runtime primitives from `@wp-typia/api-client`, reuse them across rest and runtime packages, and align active package Bun minimums with `1.3.11`. — Thanks @imjlk!
- Updated dependencies: api-client (npm)@0.4.2

## 0.3.4 — 2026-04-09

### Patch changes

- [a451f32](https://github.com/imjlk/wp-typia/commit/a451f327279e717c4bd98eb4c400e9d88c42017a) Prevent the `@wp-typia/rest` postpack restore step from reverting the manifest before npm registry metadata is finalized during publish, while still restoring after the publish wrapper completes. — Thanks @imjlk!

## 0.3.3 — 2026-04-09

### Patch changes

- [896bc10](https://github.com/imjlk/wp-typia/commit/896bc10908c0f32951998a538434ce64d24113c0) Ensure npm publish rewrites `@wp-typia/rest` workspace protocol dependencies before the registry captures package metadata, so published installs resolve `@wp-typia/api-client` through a semver range instead of `workspace:*`. — Thanks @imjlk!

## 0.3.2 — 2026-04-09

### Patch changes

- [66b9ccc](https://github.com/imjlk/wp-typia/commit/66b9cccd918a50326adcf0b1f7eb693e0144e2ad) Fix the published `@wp-typia/rest` manifest so workspace protocol dependencies are rewritten to npm-safe version ranges during pack/publish, and add CI validation for tarball-based install smoke coverage. — Thanks @imjlk!

## 0.3.1 — 2026-04-07

### Patch changes

- [9f9e6dd](https://github.com/imjlk/wp-typia/commit/9f9e6ddb0bdd041a678ecce381ff82db8a0123e8) Consolidate the shared validation/object/form-data runtime helpers used by
  `@wp-typia/api-client` and `@wp-typia/rest` under one maintained internal
  implementation owned by `@wp-typia/api-client`, while keeping the existing root
  public APIs unchanged. — Thanks @imjlk!
- Updated dependencies: api-client (npm)@0.4.0

## 0.3.0 — 2026-04-05

### Minor changes

- [b6decd0](https://github.com/imjlk/wp-typia/commit/b6decd0aa905fac2e12dc739c4c5e43159501f9d) Add a React/data helper layer at `@wp-typia/rest/react` with query and mutation
  hooks, then wire persistence examples and generated persistence scaffolds to
  emit `src/data.ts` wrappers on top of the existing WordPress REST helpers. — Thanks @imjlk!

## 0.2.0 — 2026-03-31

### Minor changes

- [602c85c](https://github.com/imjlk/wp-typia/commit/602c85cf60c09b329836625b4a22b491961f297c) Add the built-in `data` template, introduce the `@wp-typia/rest` package for typed WordPress REST helpers, and extend the Typia sync pipeline with optional JSON Schema and OpenAPI outputs for block and API contracts. — Thanks @imjlk!

