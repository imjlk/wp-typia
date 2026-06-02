# @wp-typia/block-runtime

## 0.7.1 — 2026-06-02

### Patch changes

- Updated dependencies: api-client (npm)@0.4.6

## 0.7.0 — 2026-05-15

### Minor changes

- [f585cbf4](https://github.com/imjlk/wp-typia/commit/f585cbf471450210faa420ccba5656bbbf6363d6) Add typed block nesting contracts that drive `block.json` `parent`, `ancestor`, and `allowedBlocks` metadata during sync, including unknown-reference diagnostics for generated workspaces. — Thanks @imjlk!
- [43b47672](https://github.com/imjlk/wp-typia/commit/43b476720172b572a36f4b15611ad9d57f260a18) Validate configured pattern files against typed block nesting contracts during
  sync, reporting relationship violations with pattern file and block path
  diagnostics while keeping unknown or unparseable pattern content as warnings. — Thanks @imjlk!
- [948c750d](https://github.com/imjlk/wp-typia/commit/948c750de7e298be94e29cd1eca5390623235e98) Generate typed `InnerBlocks` template constants from block nesting contracts and
  validate template tuples against declared `allowedBlocks`, `parent`, and
  `ancestor` relationships during sync. — Thanks @imjlk!

## 0.6.1 — 2026-05-13

### Patch changes

- [6d0ec1e1](https://github.com/imjlk/wp-typia/commit/6d0ec1e19f85b8629540341325391ef12e5ff9f9) Add first-class preserve-on-empty metadata for manual settings secrets, including
  Typia tags, OpenAPI schema extensions, CLI aliases, generated admin settings
  form behavior, and documentation. — Thanks @imjlk!

## 0.6.0 — 2026-05-12

### Minor changes

- [0c29c393](https://github.com/imjlk/wp-typia/commit/0c29c3931828cb547e47f35c717df39bf10025e7) Added `@wp-typia/block-runtime/schema-test` helpers for validating smoke and integration response payloads against generated JSON Schema contract artifacts with field-level failure paths. — Thanks @imjlk!
- [82450468](https://github.com/imjlk/wp-typia/commit/82450468cdd72f8d4a287821021b8c0f92173c80) Add first-class secret/write-only field metadata for settings-style REST contracts, including Typia tags, OpenAPI schema extensions, manual REST scaffold flags, and tests that keep raw secrets out of response contracts. — Thanks @imjlk!

## 0.5.1 — 2026-05-10

### Patch changes

- [f4d5058](https://github.com/imjlk/wp-typia/commit/f4d5058f996b4bbf350ff7e1d490d46a1c46f3bd) Add WordPress direct-access guards to generated PHP validator and migration registry artifacts. — Thanks @imjlk!

## 0.5.0 — 2026-04-20

### Minor changes

- [931c781](https://github.com/imjlk/wp-typia/commit/931c781816bed64d00eed424ba2778b563dab9bd) Add duplicate-safe persistent block identity helpers so structured document
  blocks can preserve stable logical ids across normal edits while repairing
  missing or duplicated ids inside the same document tree. — Thanks @imjlk!

## 0.4.10 — 2026-04-19

### Patch changes

- [460d86d](https://github.com/imjlk/wp-typia/commit/460d86d92fc0af94bbcb0542feb400236e9004ae) Remove the deprecated `@wp-typia/create` and `create-wp-typia` package shells from the repository, and update current docs plus publish automation to point directly at `wp-typia`, `@wp-typia/project-tools`, and `@wp-typia/block-runtime`. — Thanks @imjlk!

## 0.4.9 — 2026-04-18

### Patch changes

- [0e7cdac](https://github.com/imjlk/wp-typia/commit/0e7cdac97c8e0793a89aa8c8c812ef76046adab1) Split schema-core manifest and OpenAPI document builders into a focused runtime helper module without changing the public schema-core surface. — Thanks @imjlk!
- [4a29a43](https://github.com/imjlk/wp-typia/commit/4a29a43d79a5f5536389dcb2498f2ac8a328df02) Split `metadata-core` artifact sync routines and endpoint client rendering into focused helper modules without changing the public block-runtime API. — Thanks @imjlk!
- [2d60b6f](https://github.com/imjlk/wp-typia/commit/2d60b6f742b1aaf24cb370f6d3c41282aa3a6a55) Split schema-core and metadata-parser helper clusters into dedicated internal modules while preserving the published block-runtime API surface. — Thanks @imjlk!
- [97997da](https://github.com/imjlk/wp-typia/commit/97997da4b027dfddf25f251fb84bdc5f8d8dcd5c) Split inspector runtime view-model and rendering helpers into focused modules while preserving the public inspector export surface. — Thanks @imjlk!
- [5b71cdc](https://github.com/imjlk/wp-typia/commit/5b71cdced704a0b1f2dcb030c4cf7a8c2c74481f) Refresh the hosted docs site, expand TypeDoc and TSDoc coverage for core plus advanced public surfaces, and document the latest public facade boundaries without changing runtime behavior. — Thanks @imjlk!
- Updated dependencies: api-client (npm)@0.4.5

## 0.4.8 — 2026-04-15

### Patch changes

- [58b9481](https://github.com/imjlk/wp-typia/commit/58b9481152c9171c47354942ef38367ea591ed84) Emit typed wrapper modules for generated `block.json` and `typia.manifest.json` artifacts so built-in scaffolds, migration UI, and reference examples consume `block-metadata.ts`, `manifest-document.ts`, and `manifest-defaults-document.ts` instead of local cast sites. — Thanks @imjlk!
- [9952e4f](https://github.com/imjlk/wp-typia/commit/9952e4f4669dbc6e859906807ef872f9306d3367) Export validated JSON artifact helpers for scaffold `block.json` and `typia.manifest.json` boundaries, and update generated projects, examples, migration UI, and CLI tooling to prefer those runtime validators over raw `as` casts. — Thanks @imjlk!
- [6f20191](https://github.com/imjlk/wp-typia/commit/6f201910690e05b1237dcf8fdf6b2ebb93f98fed) Tighten scaffold/runtime helper generics so registration metadata, nested migration path helpers, and external template render views preserve more caller type information while removing raw scaffold metadata casts from generated and example block registration code. — Thanks @imjlk!

## 0.4.7 — 2026-04-13

### Patch changes

- [6d4bee7](https://github.com/imjlk/wp-typia/commit/6d4bee76f55c1cab40d0d0b4f25a157e17aef7cb) Deduplicate the remaining shared manifest and migration contract types behind
  `@wp-typia/block-runtime/migration-types`, centralize the official workspace
  template package constant, and align built-in scaffold `Edit` emitters on the
  shared `BlockEditProps` typing convention. — Thanks @imjlk!
- Updated dependencies: api-client (npm)@0.4.4

## 0.4.6 — 2026-04-12

### Patch changes

- Updated dependencies: api-client (npm)@0.4.3

## 0.4.5 — 2026-04-12

### Patch changes

- [e9901fa](https://github.com/imjlk/wp-typia/commit/e9901fa3c6b461b7b4c112cba20cc4e5e3654a99) Deduplicate schema-core behind the block-runtime implementation owner while keeping the project-tools import path stable, run project-tools regression tests on pull requests while keeping coverage uploads on main, and refresh workflow actions to reduce wall-clock time and remove Node 20 runtime warnings. — Thanks @imjlk!

## 0.4.4 — 2026-04-11

### Patch changes

- [f3ad2ae](https://github.com/imjlk/wp-typia/commit/f3ad2ae8a94f5db626e080c9972e4749e03a1927) Align persistence and compound scaffold validator and inspector conventions, including generated storage-mode labels and compound add-child validator wiring. — Thanks @imjlk!

## 0.4.3 — 2026-04-10

### Patch changes

- [4a02664](https://github.com/imjlk/wp-typia/commit/4a026642692b6b101d454bd14c70d0b5c28b900e) Fix generated-project Typia/Webpack compatibility by moving generic Typia
  factory calls out of the shared validator helper, adding a fail-fast supported
  toolchain guard around the Webpack integration, and covering the path with
  generated-project build smoke tests. — Thanks @imjlk!

## 0.4.2 — 2026-04-09

### Minor changes

- [e20511a](https://github.com/imjlk/wp-typia/commit/e20511af33a65a9a78cde9b015dac8ec1e9ad4f5) Standardize generated block ids, scoped client ids, persistence resource keys,

### Patch changes

- [ab7d1c9](https://github.com/imjlk/wp-typia/commit/ab7d1c9afaf4039b5053991ca9fe88cabcd46a13) Publish shared API client utilities and runtime primitives from `@wp-typia/api-client`, reuse them across rest and runtime packages, and align active package Bun minimums with `1.3.11`. — Thanks @imjlk!
- [0cc5a61](https://github.com/imjlk/wp-typia/commit/0cc5a61bb50bc0fd871645b6dad29b01bb66950b) Make block metadata helpers live in `@wp-typia/block-runtime` as the single source of truth and have `@wp-typia/project-tools` re-export the identical runtime modules instead of carrying duplicate copies. — Thanks @imjlk!
- Updated dependencies: api-client (npm)@0.4.2

## 0.3.0 — 2026-04-07

### Minor changes

- [5a8e531](https://github.com/imjlk/wp-typia/commit/5a8e531c09c3d95a9ac2cabb07487a83c9b0e3c3) Graduate generated-project runtime imports to `@wp-typia/block-runtime`, add
  supported `@wp-typia/block-runtime/blocks` and
  `@wp-typia/block-runtime/metadata-core` surfaces, and update scaffolded
  templates/examples to use them as the normative generated-project runtime and
  sync packages while keeping `@wp-typia/create` as the CLI package plus
  compatibility facade.
  
  Tighten the basic scaffold WordPress baseline by restoring a real
  `editorStyle` asset, renaming the legacy `version` attribute to
  `schemaVersion`, keeping `save.tsx` serialization stable when visibility is
  toggled, bumping generated plugin PHP minimums to 8.0, and changing the
  default scaffold namespace fallback from `create-block` to the normalized
  project slug. — Thanks @imjlk!
- [6937278](https://github.com/imjlk/wp-typia/commit/6937278f24003d31091953eed86433414b3ed42d) Add optional `check` verification mode to `@wp-typia/block-runtime/metadata-core`
  sync helpers so generated projects and repo examples can verify committed
  artifacts without rewriting them. Scaffolded `build` and `typecheck` scripts now
  fail on stale generated metadata instead of silently mutating tracked files,
  while `start`, `dev`, and explicit `sync-*` commands remain refresh-oriented. — Thanks @imjlk!

## 0.2.3 — 2026-04-06

### Patch changes

- Updated dependencies: create (npm)@0.10.1

## 0.2.2 — 2026-04-05

### Patch changes

- Updated dependencies: create (npm)@0.10.0

## 0.2.1 — 2026-04-05

### Patch changes

- Updated dependencies: create (npm)@0.9.0

## 0.2.0 — 2026-04-05

### Minor changes

- [58a8c97](https://github.com/imjlk/wp-typia/commit/58a8c97a52107eb16148a5fd5e3da2ab5a612fba) Add a new manifest-driven `runtime/inspector` surface for generated projects,
  including `useEditorFields`, `useTypedAttributeUpdater`, `FieldControl`, and
  `InspectorFromManifest`, and mirror that subpath through
  `@wp-typia/block-runtime/inspector`. — Thanks @imjlk!

### Patch changes

- Updated dependencies: create@0.8.0

## 0.1.2 — 2026-04-03

### Patch changes

- Updated dependencies: create@0.7.0

## 0.1.1 — 2026-04-02

### Patch changes

- [c8c5429](https://github.com/imjlk/wp-typia/commit/c8c54298019cd1a61a8cfe95001c38efc39eaef5) Add the first `@wp-typia/block-runtime` facade package as the prototype graduation path for block runtime helpers. — Thanks @imjlk!
- Updated dependencies: create@0.6.0

