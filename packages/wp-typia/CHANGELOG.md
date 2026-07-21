# wp-typia

## 0.24.15 — 2026-07-21

### Patch changes

- [c502291c](https://github.com/imjlk/wp-typia/commit/c502291cc63e5cbd48c200e5a7c59b995fc53177) Expose the global output format flag in CLI help and document its agent-aware JSON default alongside the human-readable text default for other environments. — Thanks @imjlk!
- [2d0a2b16](https://github.com/imjlk/wp-typia/commit/2d0a2b1653fe1a9faf61c7440f565cb2824fd91e) Restore runtime source maps and remove temporary pack backups after local publish dry runs finish. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.24.13

## 0.24.14 — 2026-07-20

### Patch changes

- [bb6ed414](https://github.com/imjlk/wp-typia/commit/bb6ed414ecbd4bee31a427f1143d33d736b0b6c3) Diagnose type-derived standalone block scaffolds with static package, bootstrap, source-layout, generated-artifact, and REST contract checks. Export the canonical block metadata artifact-path resolver for project-tools and reject malformed or unsafe standalone sync configurations without executing project code. — Thanks @imjlk!
- [bb6ed414](https://github.com/imjlk/wp-typia/commit/bb6ed414ecbd4bee31a427f1143d33d736b0b6c3) Keep fresh built-in scaffolds sync-clean by seeding canonical compiler-derived block metadata, validation, schema, OpenAPI, PHP, and persistence artifacts after scaffold transforms and before dependency installation. Align generated project manifests, runtime identifiers, development startup sync, and package smoke coverage with the same artifact contracts. — Thanks @imjlk!
- [2de33f08](https://github.com/imjlk/wp-typia/commit/2de33f08733041335970c40d6a4cada0896daf1e) Keep structured template discovery output portable by replacing installation-local template directory paths with stable built-in ids and official npm package source metadata. — Thanks @imjlk!
- [b5278399](https://github.com/imjlk/wp-typia/commit/b52783990671e2591dc4a640290579c2ed86c4e1) Mark the WordPress registration facade peers as optional and isolate its runtime and declaration entrypoint so installing the wp-typia CLI no longer downloads or loads the full WordPress editor dependency graph unless a generated project explicitly needs it. Registration-only exports are removed from the package root and `blocks` aggregate; import them from `@wp-typia/block-types/blocks/registration` instead. Retrofit `init` plans now add `@wordpress/blocks` and its WordPress block types directly so later `add variation` workflows retain their build contract. — Thanks @imjlk!
- [7d6dbbbd](https://github.com/imjlk/wp-typia/commit/7d6dbbbd8cbfc8bf8732f18f263e677bdc0c3cec) Expose stable generated-artifact drift codes and sanitized, structured sync failure details while preserving streaming text output and reporting signal termination without an invented exit code. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.24.12

## 0.24.13 — 2026-06-07

### Patch changes

- [e417b430](https://github.com/imjlk/wp-typia/commit/e417b43006654872a8282999060451fe1d0fc2c0) Polish CLI help and doctor diagnostics with template defaults, AI-agent JSON
  mode notices, and actionable WordPress version-check guidance. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.24.11

## 0.24.12 — 2026-06-06

### Patch changes

- [bc6415d6](https://github.com/imjlk/wp-typia/commit/bc6415d6bde77c18a56f529afe52334861a86212) Fixed `doctor --wp-version-check` feature-floor detection so generated core
  variations and binding source APIs are recognized from executable registrations
  instead of comments, string literals, or stray TypeScript files. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.24.10

## 0.24.11 — 2026-06-06

### Patch changes

- [df97d9c4](https://github.com/imjlk/wp-typia/commit/df97d9c47a43cd48e459616b7f7a4d52630f190a) Cover block variation metadata and generated variation registrations in
  `doctor --wp-version-check` by deriving floors from the shared WordPress block
  API compatibility matrix. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.24.9

## 0.24.10 — 2026-06-05

### Patch changes

- [6f96809d](https://github.com/imjlk/wp-typia/commit/6f96809d13d2faf4faa68558de6cfbeb75cb9e4b) Expand `doctor --wp-version-check` coverage to reuse the shared WordPress block API compatibility matrix for block supports, metadata, and generated binding source feature floors. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.24.8

## 0.24.9 — 2026-06-05

### Patch changes

- [8f34ff4d](https://github.com/imjlk/wp-typia/commit/8f34ff4da23994d9dfb424fd685a05cdfa99e332) Add `wp-typia doctor --wp-version-check` to validate generated WordPress feature floors against plugin bootstrap headers. — Thanks @imjlk!
- [9430c8d6](https://github.com/imjlk/wp-typia/commit/9430c8d6ca890b768cb792bfe2a757573011a93c) Target WordPress 7.0 scaffold headers by default and add `create --wp-version 6.9` for legacy scaffold output. — Thanks @imjlk!
- [25b6d073](https://github.com/imjlk/wp-typia/commit/25b6d0735bd3e60b588791dc8c5f2c8cde88ab7f) Preserve generated ability and AI feature compatibility metadata in workspace inventory and verify `wp-typia add ability` passes WordPress 7 doctor checks. — Thanks @imjlk!
- [c0b4432c](https://github.com/imjlk/wp-typia/commit/c0b4432c2f0c993584e4491f7df583cb8f647486) Polish interactive add prompts and expose legacy pattern tag warnings in structured CLI output. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.24.7

## 0.24.8 — 2026-06-04

### Patch changes

- [c358987e](https://github.com/imjlk/wp-typia/commit/c358987e09cc2d3d487950621132384a112c7aa4) Suggest close command names for unknown `wp-typia help <target>` requests. — Thanks @imjlk!
- [bc4a041d](https://github.com/imjlk/wp-typia/commit/bc4a041d79b23221166e57efdab525c327d08c72) Prompt for required add fields when interactive `wp-typia add` users select kinds such as style, variation, transform, hooked-block, core-variation, or post-meta. — Thanks @imjlk!

## 0.24.7 — 2026-06-04

### Patch changes

- [054d769e](https://github.com/imjlk/wp-typia/commit/054d769efa49976efa9c8a0cdb2c377ce4ecbb1c) Prompt for an add kind when `wp-typia add` runs in an interactive terminal without a kind argument. — Thanks @imjlk!
- [c7a94624](https://github.com/imjlk/wp-typia/commit/c7a946245d0143c7c280315a11768c02a4d4e3a1) Ignore generated local universal skills when running `wp-typia skills sync --local`. — Thanks @imjlk!
- [addbff55](https://github.com/imjlk/wp-typia/commit/addbff5536a42bc9a74a715ab6df0b0e7788932e) Document local skills sync gitignore handling in CLI help and reference docs. — Thanks @imjlk!
- [2659cfa6](https://github.com/imjlk/wp-typia/commit/2659cfa6506d5d5b308d20318a7400d286f8781e) Clarify add flag help, warn on legacy `--tag`, and make unknown help targets more actionable. — Thanks @imjlk!
- [8a1abfcb](https://github.com/imjlk/wp-typia/commit/8a1abfcb6766369bb4322f525fdc78d49d7cfbf4) Support boolean-only short flag clusters while rejecting clusters that include value-taking short flags. — Thanks @imjlk!

## 0.24.6 — 2026-06-03

### Patch changes

- [bc07995b](https://github.com/imjlk/wp-typia/commit/bc07995b0b9d957e5f35d144c4c8c7e2004fe414) Add focused short flags for common `wp-typia add` options and make `--tags` the documented pattern tag flag while preserving `--tag` as a legacy parser alias. — Thanks @imjlk!
- [9c97d933](https://github.com/imjlk/wp-typia/commit/9c97d933e38a17d38baf6bcffba9307afa769650) Align the managed `@wp-typia/dataviews` fallback range with the published package version. — Thanks @imjlk!
- [22bf6035](https://github.com/imjlk/wp-typia/commit/22bf60358dc969e7afd72c632eebb0a47174182c) Route the legacy `wp-typia completions <shell>` alias through the same Gunshi completion output as `wp-typia complete <shell>`. — Thanks @imjlk!
- [49dae4e6](https://github.com/imjlk/wp-typia/commit/49dae4e613d64647a5fde81a92d50619093e1614) Reject likely top-level command typos before treating them as positional create aliases, while preserving intentional `wp-typia <project-dir>` usage. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.24.6

## 0.24.5 — 2026-06-02

### Patch changes

- [ab140e2b](https://github.com/imjlk/wp-typia/commit/ab140e2bf6d394331f65a861937c55b3b9d096b6) Migrate the wp-typia CLI runtime from Bunli/OpenTUI to a Node-first Gunshi entrypoint while keeping Bun as the development and build toolchain, and align block registration facade types with current WordPress block declarations. — Thanks @imjlk!
- [5b8f9ae6](https://github.com/imjlk/wp-typia/commit/5b8f9ae63ec8baab9b24f2b166343d401e400a26) Keep the CLI release lane aligned with the planned project-tools runtime domain refactor patch. — Thanks @imjlk!
- Updated dependencies: api-client (npm)@0.4.6, project-tools (npm)@0.24.5

## 0.24.4 — 2026-05-17

### Patch changes

- [89cd7ae1](https://github.com/imjlk/wp-typia/commit/89cd7ae11bf0b55c88b9beccbb3f881bcc49383a) Clarify positional core-variation target diagnostics while preserving flag-style block validation messages. — Thanks @imjlk!
- [2cd9ccf7](https://github.com/imjlk/wp-typia/commit/2cd9ccf7d25754ead6ef86dcd3264a891aa4d98d) Show resolved pattern catalog metadata and normalization notes in add-pattern dry-run output. — Thanks @imjlk!
- [19e77fc9](https://github.com/imjlk/wp-typia/commit/19e77fc9cb44f417ac443685d035320de135380a) Preserve repeatable add option arrays when requested and validate interactive add flow select fields with enum-backed schemas. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.24.4

## 0.24.3 — 2026-05-17

### Patch changes

- [e3b205b7](https://github.com/imjlk/wp-typia/commit/e3b205b7b0f185848e7ace4f2928970665045b75) Expose optional pattern catalog tags and thumbnail fields in the interactive add flow. — Thanks @imjlk!
- [cd5ce7c4](https://github.com/imjlk/wp-typia/commit/cd5ce7c4e2a6b2288f4fa9d721165f86e1938c6a) Split interactive add flow field rendering into focused add-kind field groups. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.24.3

## 0.24.2 — 2026-05-17

### Patch changes

- [223b823d](https://github.com/imjlk/wp-typia/commit/223b823de94dba18e7fcd514995192e7b3aca9a2) Clarify missing-name diagnostics for incomplete positional core-variation add usage. — Thanks @imjlk!
- [1cc39128](https://github.com/imjlk/wp-typia/commit/1cc39128569b20fda0ec3b7cfc2296cc2034a6f1) Expose key pattern catalog metadata fields in the interactive add pattern flow. — Thanks @imjlk!
- [e8b28778](https://github.com/imjlk/wp-typia/commit/e8b28778a77d6d31070600d26b142a580879aad2) Tighten pattern scaffold flag normalization, validation, and docs. — Thanks @imjlk!
- [da0d3a08](https://github.com/imjlk/wp-typia/commit/da0d3a0860ebf05e6c2822db3b1c843073dfbb5e) Share CLI option argv walking and guard add option schema drift. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.24.2

## 0.24.1 — 2026-05-16

### Patch changes

- [679f2dfe](https://github.com/imjlk/wp-typia/commit/679f2dfeda4f2dec0199a46e7bc288f430d58c7b) Keep the CLI release lane aligned with the planned `@wp-typia/project-tools`
  patch for the shared AI REST nonce source emitter. — Thanks @imjlk!
- [b9e4cc55](https://github.com/imjlk/wp-typia/commit/b9e4cc5568286b52095c832cd891db592b14feea) Expose `--catalog-title` for pattern scaffolds so CLI-created catalog entries
  can set the same human-readable title metadata already supported by the runtime. — Thanks @imjlk!
- [b325c227](https://github.com/imjlk/wp-typia/commit/b325c2271feccce57f61051542318aaaafff264a) Support repeatable `--tag` and `--tags` flags for pattern scaffolds while
  preserving existing comma-separated tag input and normalized manifest output. — Thanks @imjlk!
- [4c4fa603](https://github.com/imjlk/wp-typia/commit/4c4fa60326ad8f128b6e52e028e60aff22af592c) Warn when `wp-typia add core-variation` targets an unknown `core/*` block while
  preserving third-party namespaces and future core-block compatibility. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.24.1

## 0.24.0 — 2026-05-15

### Minor changes

- [beff17c5](https://github.com/imjlk/wp-typia/commit/beff17c5276280958daad45133a5e8e4b4057c8c) Validate pattern catalog section role markers against serialized pattern
  content, including configurable wrapper conventions, missing or mismatched
  section-scoped markers, unknown roles, and optional duplicate-role warnings for
  full patterns. — Thanks @imjlk!
- [fe793744](https://github.com/imjlk/wp-typia/commit/fe793744e01c4251b229ba19dd24662cb8317b3d) Add a shared WordPress block API compatibility matrix for Supports, Variations, and Bindings, plus project config fields for minimum WordPress version and strict compatibility diagnostics. — Thanks @imjlk!
- [f2c7b166](https://github.com/imjlk/wp-typia/commit/f2c7b1661d0ef4a8ce63641e194e95dfe319e077) Add `wp-typia add core-variation` for editor-side variation scaffolds targeting
  existing core or third-party blocks without generating custom block manifests or
  Typia artifacts. — Thanks @imjlk!
- [4567d5ba](https://github.com/imjlk/wp-typia/commit/4567d5ba68b27433d7792311ccb6dfa7cb657633) Add post-meta-backed binding-source scaffolds that read typed post-meta schemas, emit PHP/editor preview resolvers, validate top-level meta paths, and expose the new `--from-post-meta`/`--post-meta` CLI options. — Thanks @imjlk!
- [c0a34be4](https://github.com/imjlk/wp-typia/commit/c0a34be4ed0418dedd5c0e3302bc4989c9c31e3a) Add typed pattern catalog metadata for workspace pattern scaffolds, including
  section-scoped pattern entries, catalog validation for duplicate slugs and
  missing content files, and CLI flags for scope, section role, tags, and
  thumbnail metadata. — Thanks @imjlk!

### Patch changes

- [5767c20a](https://github.com/imjlk/wp-typia/commit/5767c20a975c5953a0d6458efb8d0e823010aa97) Split AI feature sync-rest anchor patching into a focused runtime module while
  preserving compatibility exports and generated workspace patch behavior. — Thanks @imjlk!
- [c7888135](https://github.com/imjlk/wp-typia/commit/c7888135d6fe949037acf44067e9e0a33a70b37a) Split the generated AI feature sync script source emitter into a focused runtime
  module while preserving compatibility exports and generated output. — Thanks @imjlk!
- [7186dc89](https://github.com/imjlk/wp-typia/commit/7186dc89fa4b0eed155817def3f8b81a3f3df921) Split Typia LLM runtime rendering, sync, projection, and OpenAPI constraint helpers into focused modules. — Thanks @imjlk!
- [7e47b274](https://github.com/imjlk/wp-typia/commit/7e47b2744776ed8d93cddf4f57cde9d2ebfce64c) Split compound and persistence non-TypeScript scaffold templates into focused runtime modules without changing generated output. — Thanks @imjlk!
- [5b967cd6](https://github.com/imjlk/wp-typia/commit/5b967cd6c575a98b1ca95ebd704f027cc579e1ff) Split REST sync-rest anchor patching into contract, resource, and shared helper modules while preserving compatibility exports. — Thanks @imjlk!
- [d2833763](https://github.com/imjlk/wp-typia/commit/d283376311817b55d150568e5be84f6b729167f9) Split binding-source workspace runtime source emitters and bootstrap/registry anchors into focused helper modules. — Thanks @imjlk!
- [7aa67d66](https://github.com/imjlk/wp-typia/commit/7aa67d66f85d76cb55c192ccf14abc954cbe4532) Split remaining workspace add variation, style, transform, and hooked-block scaffold flows into focused modules. — Thanks @imjlk!
- [4f5c83c7](https://github.com/imjlk/wp-typia/commit/4f5c83c7d985c1b260820d1e9895f9db5bbb8d35) Deduplicate REST sync anchor import replacement and no-resource guard builders while preserving contract and REST resource scaffold behavior. — Thanks @imjlk!
- [76557c0f](https://github.com/imjlk/wp-typia/commit/76557c0fcb99626b3fb581321126ba85e7886735) Split the generated REST schema helper PHP template emitter from REST resource PHP template generation while preserving compatibility exports. — Thanks @imjlk!
- [56d1eae0](https://github.com/imjlk/wp-typia/commit/56d1eae07d0edc5f187e600ab0d6298500552478) Split workspace asset add workflows into focused pattern, binding-source, and editor-plugin runtime modules. — Thanks @imjlk!
- [d443fffd](https://github.com/imjlk/wp-typia/commit/d443fffda3ffac3bf1b77c121928d9c2dab08edf) Split pattern workspace add helpers into focused runtime modules without changing generated output. — Thanks @imjlk!
- [afe3e49a](https://github.com/imjlk/wp-typia/commit/afe3e49ae7f2581fbc94263eec52232a959e31b4) Split integration environment workspace add helpers into focused runtime modules without changing generated output. — Thanks @imjlk!
- [40aa1ec4](https://github.com/imjlk/wp-typia/commit/40aa1ec457af1f3c68eece155472259d37e36675) Split REST workspace bootstrap anchor patching from sync-rest script patching while preserving compatibility exports. — Thanks @imjlk!
- [fa79c9d4](https://github.com/imjlk/wp-typia/commit/fa79c9d40e41c86d381facecac20b1cf973900c5) Split ability workspace scaffold anchor and registry helpers into focused runtime modules without changing generated output. — Thanks @imjlk!
- [b9b3faae](https://github.com/imjlk/wp-typia/commit/b9b3faae19ba329a79cf613e7650512d1f14838d) Split editor-plugin workspace runtime source emitters and bootstrap/registry anchors into focused helper modules. — Thanks @imjlk!
- [a057cd7c](https://github.com/imjlk/wp-typia/commit/a057cd7c5a5018a44ac4414d3ee2aad36830a039) Split generated REST resource PHP routing and controller template helpers from
  the main REST resource PHP template entrypoint while preserving generated
  output compatibility. — Thanks Junglei Kim!
- [5363a883](https://github.com/imjlk/wp-typia/commit/5363a8836ee5fab78475af208104b31450a827ae) Share the generated REST nonce helper source across manual contract and REST resource emitters while preserving scaffolded API output. — Thanks Junglei Kim!
- [eb2c073f](https://github.com/imjlk/wp-typia/commit/eb2c073fe1a4b6032e54b458409db85efebc18d6) Split REST workspace source emitters into generated-resource and manual-contract modules while keeping the compatibility facade stable. — Thanks Junglei Kim!
- [64367bb9](https://github.com/imjlk/wp-typia/commit/64367bb9d2f4bfd40ae79eae3311337c8b8f28b3) Align default doctor output rendering with the shared line-printer convention. — Thanks Junglei Kim!
- [adaefd50](https://github.com/imjlk/wp-typia/commit/adaefd50a29c8f6786a9750a76ad416585030eda) Split built-in block non-TypeScript artifact templates into focused family modules. — Thanks Junglei Kim!
- [a4e61656](https://github.com/imjlk/wp-typia/commit/a4e61656d39974aec1c7305ee2eae2d1c4c479ce) Centralize the generated `@wordpress/env` dependency fallback range through the shared package version module. — Thanks Junglei Kim!
- [9f8f6c9c](https://github.com/imjlk/wp-typia/commit/9f8f6c9c094a8882aa1d63dcd763117a061d6019) Normalize manual REST `secretPreserveOnEmpty` CLI values before invoking project-tools runtime APIs. — Thanks Junglei Kim!
- Updated dependencies: project-tools (npm)@0.24.0

## 0.23.1 — 2026-05-13

### Patch changes

- [57306069](https://github.com/imjlk/wp-typia/commit/5730606918c4f79483e2cad5034d7077a75464da) Route interactive prompt rendering and validation feedback through injectable line printers so tests and callers can capture output without monkeypatching global console methods. — Thanks @imjlk!
- [0f94f80e](https://github.com/imjlk/wp-typia/commit/0f94f80eee74ec0ae20c70827fabdfe0a2caf9ac) Use the shared dashed-or-camel string flag reader for rest-resource add-kind options. — Thanks @imjlk!
- [22a4f4dd](https://github.com/imjlk/wp-typia/commit/22a4f4dd0ad45da0b978d430f7299dc97b96868d) Clarify manual REST secret-field prerequisites in add help and CLI reference docs. — Thanks @imjlk!
- [e0d8082f](https://github.com/imjlk/wp-typia/commit/e0d8082f86566b1a8e2c25a145ec666e1a44862e) Add path-aware safe JSON parse/read helpers for project-tools runtime JSON file readers. — Thanks @imjlk!
- [fa781368](https://github.com/imjlk/wp-typia/commit/fa78136887cebe293e1ef6c2e33f313856794ef4) Add `wp-typia doctor --workspace-only` with JSON exit-policy summaries so CI can treat environment/runtime failures as advisory while preserving strict doctor behavior by default. — Thanks @imjlk!
- [56de24a6](https://github.com/imjlk/wp-typia/commit/56de24a68cb2f9d7006b092af69a227b9a84b082) Split rest-resource usage guidance into generated and manual mode lines for add-kind help and missing-name diagnostics. — Thanks @imjlk!
- [9883a187](https://github.com/imjlk/wp-typia/commit/9883a187c19f2b7b5cca7101dcf0e2c996e4e3ce) Support provider-style manual REST route contracts with route-pattern aliases,
  declared controller/permission owner metadata, and path parameter starter query
  types. — Thanks @imjlk!
- [8937cfd4](https://github.com/imjlk/wp-typia/commit/8937cfd489f5f904c0271d484e45d4351ef1f59a) Split workspace REST resource scaffolding into focused generated-mode, manual-mode, PHP template, and shared type modules while preserving existing add rest-resource behavior. — Thanks @imjlk!
- [f54b7db5](https://github.com/imjlk/wp-typia/commit/f54b7db54560ff6f4eba1b1ad9235efa1c178dcb) Document the diagnostic fallback classifier as a compatibility shim for message-based runtime validation errors. — Thanks @imjlk!
- [6d0ec1e1](https://github.com/imjlk/wp-typia/commit/6d0ec1e19f85b8629540341325391ef12e5ff9f9) Add first-class preserve-on-empty metadata for manual settings secrets, including
  Typia tags, OpenAPI schema extensions, CLI aliases, generated admin settings
  form behavior, and documentation. — Thanks @imjlk!
- [16882dab](https://github.com/imjlk/wp-typia/commit/16882dabd032ba40cd9a9e81690f86fbe1beed8f) Split Node fallback version, templates, doctor, and entrypoint error handling into focused modules. — Thanks @imjlk!
- [621a0257](https://github.com/imjlk/wp-typia/commit/621a0257801085f7d93e57bd46bba14ac44694e0) Split admin-view template emitters into focused default, REST, core-data, settings, and shared modules while keeping the existing public template import path compatible. — Thanks @imjlk!
- [e946efaf](https://github.com/imjlk/wp-typia/commit/e946efaff8af434a18b7663d51c6b8ccc00db1da) Add a `plugin-qa` workspace create profile plus `add integration-env --release-zip` scripts for wp-env smoke checks and plugin zip packaging. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.23.1

## 0.23.0 — 2026-05-12

### Minor changes

- [efdc8784](https://github.com/imjlk/wp-typia/commit/efdc878408cca0fe0494a619da9faba7f7600252) Add typed admin settings screen scaffolds for manual REST contracts, including generated React form state, API/client integration, secret-field metadata propagation, and docs that distinguish generated settings screens from DataViews and custom admin UI. — Thanks @imjlk!
- [bcfdba8b](https://github.com/imjlk/wp-typia/commit/bcfdba8b9ce1c0bac6bbeba1a8e122bdf94f71a2) Added `wp-typia add contract <name> [--type <ExportedTypeName>]` for standalone TypeScript wire contracts, including JSON Schema artifact generation, workspace inventory registration, and `sync-rest` / `sync --check` drift checks without generating PHP route glue. — Thanks @imjlk!
- [3cebc2c8](https://github.com/imjlk/wp-typia/commit/3cebc2c889371245c413d20b13435c93b8f9443a) Added an opt-in `wp-typia add integration-env <name>` workspace workflow that can generate local smoke-test starters, `.env.example`, optional `@wordpress/env` setup, and an optional docker-compose service scaffold. — Thanks @imjlk!
- [10a835ad](https://github.com/imjlk/wp-typia/commit/10a835add0580c3f3964386c84f652500b2f0cfe) Add generated REST resource escape hatches for custom item route patterns, permission callbacks, and controller class wrappers while keeping generated schemas, OpenAPI, clients, and workspace inventory aligned. — Thanks @imjlk!
- [82450468](https://github.com/imjlk/wp-typia/commit/82450468cdd72f8d4a287821021b8c0f92173c80) Add first-class secret/write-only field metadata for settings-style REST contracts, including Typia tags, OpenAPI schema extensions, manual REST scaffold flags, and tests that keep raw secrets out of response contracts. — Thanks @imjlk!
- [81c2f5c3](https://github.com/imjlk/wp-typia/commit/81c2f5c3e1ee76575c09fa82eaa93b524bb73675) Add `wp-typia add post-meta` for typed WordPress post meta contracts, including TypeScript shape scaffolding, generated schema sync, `register_post_meta()` PHP glue, workspace inventory, doctor coverage, and CLI/TUI/docs wiring. — Thanks @imjlk!
- [bb7aa2e9](https://github.com/imjlk/wp-typia/commit/bb7aa2e9b100b431d208095dec697e980127ed73) Add manual REST contract scaffolding through `wp-typia add rest-resource --manual` so projects can track external WordPress REST routes with generated TypeScript contracts, validators, schemas, OpenAPI, clients, and drift checks without generating PHP route files. — Thanks @imjlk!

### Patch changes

- [57ea28e4](https://github.com/imjlk/wp-typia/commit/57ea28e4ead58bcc1842d2c266ae3981899c0591) Share the CLI regular expression escaping helper across runtime output and marker formatting. — Thanks @imjlk!
- [80f41876](https://github.com/imjlk/wp-typia/commit/80f418763379ef6e5ffd6e2b1ff2cab55358d5fc) Route add-kind warning output through the explicit warning printer for every shared execution plan. — Thanks @imjlk!
- [c26a0ae0](https://github.com/imjlk/wp-typia/commit/c26a0ae0b14ac00d1fab4286a6f208be02f13968) Route migrate command human output through injected line printers instead of bridge-level console output. — Thanks @imjlk!
- [83cd24e8](https://github.com/imjlk/wp-typia/commit/83cd24e8c9ede0b536ac14e67a320311dcf449f0) Route Node fallback no-command failures through the shared CLI diagnostic flow while preserving human-readable help output. — Thanks @imjlk!
- [a555728d](https://github.com/imjlk/wp-typia/commit/a555728d3b6dcf7099dc78f7f2836fe2598d8d5d) Pass explicit output adapters from Bunli command handlers into supported runtime bridges. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.23.0

## 0.22.10 — 2026-05-10

### Patch changes

- [8149293](https://github.com/imjlk/wp-typia/commit/8149293f42754b9dfe71154673ac80c45f816d20) Clarify why no-command Node fallback help exits with a non-zero status. — Thanks @imjlk!
- [e437ad1](https://github.com/imjlk/wp-typia/commit/e437ad1bca60901b244636e17c3631201c94e63d) Split runtime completion payload builders into command-focused modules while preserving the existing runtime-bridge-output facade. — Thanks @imjlk!
- [6b56ee8](https://github.com/imjlk/wp-typia/commit/6b56ee832e6dc1a372d314021e6289be3775b4a6) Report dry-run install marker setup failures when symlink, hard-link, and copy fallbacks all fail. — Thanks @imjlk!
- [9540f25](https://github.com/imjlk/wp-typia/commit/9540f258d6ed641b331332681f8c2dcc6d47b6c6) Split CLI runtime bridge command execution into focused command modules while preserving the existing runtime-bridge public facade. — Thanks @imjlk!
- [50f8aa0](https://github.com/imjlk/wp-typia/commit/50f8aa0087d27a515ef3c796276976507387f696) Expand add-block template typo suggestions so near-miss ids like `interactiv` point users to the intended built-in template. — Thanks @imjlk!
- [e03d463](https://github.com/imjlk/wp-typia/commit/e03d4630aba274a273b907f2bd012458cd347fa2) Single-source add-kind missing-name messages so direct validation and execution-plan validation stay aligned. — Thanks @imjlk!
- [aa95e61](https://github.com/imjlk/wp-typia/commit/aa95e61b3b0b6d4674896c42d8205bdfda1b6219) Pass the pattern add-kind warning printer through its execution plan so warning output uses the expected channel. — Thanks @imjlk!
- [cb14db1](https://github.com/imjlk/wp-typia/commit/cb14db1c5a8dc976c7297216e021296d64d4873f) Normalize recognizable create completion package-manager metadata before formatting follow-up commands. — Thanks @imjlk!
- [5d02abf](https://github.com/imjlk/wp-typia/commit/5d02abf4e378b9d76ef53b3d5225bf4781a05291) Move add-kind list and usage formatting helpers into the add-kind id leaf module to avoid registry coupling from shared CLI diagnostics. — Thanks @imjlk!
- [4caa131](https://github.com/imjlk/wp-typia/commit/4caa1311c99d57530cd8e3dba514c79349693130) Route MCP command human output through injectable PrintLine helpers instead of direct console logging. — Thanks @imjlk!
- [947b1f2](https://github.com/imjlk/wp-typia/commit/947b1f29ccb31d2d7ecd6a0d13bfd8fd2ac5b774) Route Node fallback completion warnings through an explicit warning printer while preserving normal stdout output. — Thanks @imjlk!
- [8eda4de](https://github.com/imjlk/wp-typia/commit/8eda4de5277ae039c32e059014b727bc92bd7be6) Split shared CLI command option metadata into command-focused modules while keeping parser and routing aggregation behavior centralized. — Thanks @imjlk!
- [f0e8487](https://github.com/imjlk/wp-typia/commit/f0e8487c827c1a3a1e6ca4a6f3d0aec147506201) Classify malformed `package.json` parse failures in `wp-typia sync` with a stable invalid-argument diagnostic. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.22.10

## 0.22.9 — 2026-05-08

### Patch changes

- [3c8fbb6](https://github.com/imjlk/wp-typia/commit/3c8fbb64f27579e82e384ed9e621d52580a9a4a0) Add async workspace block select option APIs and use them from interactive add flows. — Thanks @imjlk!
- [48a2f9e](https://github.com/imjlk/wp-typia/commit/48a2f9e99af606a4cb7150c893b9294af1744917) Split create and add package-level CLI tests into command-family files with shared helpers. — Thanks @imjlk!
- [2f06395](https://github.com/imjlk/wp-typia/commit/2f0639505f1def124fe6753b14357abb9dfc68d7) Share the CLI printBlock helper between runtime bridge and Node fallback help output. — Thanks @imjlk!
- [ea7489e](https://github.com/imjlk/wp-typia/commit/ea7489eb183f06e51397f3bbee89bfc839b984b4) Align add missing-kind help output between Bunli bridge and Node fallback paths. — Thanks @imjlk!
- [063e4f3](https://github.com/imjlk/wp-typia/commit/063e4f3a6d8d75ba6f9e84838e263717b1d8bfd1) Centralize shared CLI missing-argument messages across Bunli and Node fallback paths. — Thanks @imjlk!
- [0f2c930](https://github.com/imjlk/wp-typia/commit/0f2c930cd2352e8b490df582cb154371c37af99d) Split add-kind registry entries into focused per-kind modules while preserving the public aggregation point. — Thanks @imjlk!
- [2b61ed5](https://github.com/imjlk/wp-typia/commit/2b61ed5ed01250ca4ce1ee2ac364a1d882d72510) Share close-id template suggestions across create and add-block validation paths. — Thanks @imjlk!
- [21b3221](https://github.com/imjlk/wp-typia/commit/21b322179a51df252fdc568d61be4c2555815337) Tag remaining CLI-layer artifact, sync execution, and standalone target failures with stable diagnostic codes. — Thanks @imjlk!
- [76d703e](https://github.com/imjlk/wp-typia/commit/76d703edfa5fa4dc106d66a71770a81eae7dc461) Guard create completion package-manager formatting before building next-step commands. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.22.9

## 0.22.8 — 2026-05-06

### Patch changes

- [ca8c31f](https://github.com/imjlk/wp-typia/commit/ca8c31f3e998da8d4a919dc1c4a7464ddfbcb45b) Tag scaffold identifier and MCP schema validation failures with stable CLI diagnostic codes. — Thanks @imjlk!
- [5b9d23b](https://github.com/imjlk/wp-typia/commit/5b9d23b73d4daa503ed13e4f1b083508bba7b976) Split Node fallback add/create dispatchers and help rendering into focused modules. — Thanks @imjlk!
- [5c793a8](https://github.com/imjlk/wp-typia/commit/5c793a8c8ce05d8cc69066d906eb346141d198c0) Validate explicit create template ids before entering the full scaffold flow. — Thanks @imjlk!
- [24c81ed](https://github.com/imjlk/wp-typia/commit/24c81edc4c0125f79c6d52582a1e817ef21c2705) Tag positional alias command-contract validation failures with stable diagnostic codes. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.22.8

## 0.22.7 — 2026-05-05

### Patch changes

- [9bcd217](https://github.com/imjlk/wp-typia/commit/9bcd21709a5f488a6695723997c010f4ac455f9a) Single-source the create progress payload type across runtime bridge modules. — Thanks @imjlk!
- [721da32](https://github.com/imjlk/wp-typia/commit/721da328c5d980376d011bcade086a383d5f1a38) Derive the public wp-typia user config types from the Zod validation schema. — Thanks @imjlk!
- [a63a6c2](https://github.com/imjlk/wp-typia/commit/a63a6c207951eea9a269b833ef631ffa62310197) Prune stale routing metadata generator temp directories before creating a new temp workspace. — Thanks @imjlk!
- [b4991e6](https://github.com/imjlk/wp-typia/commit/b4991e66701565e8ec7d3f155ec93597d6298010) Keep the managed @wp-typia/dataviews fallback range aligned with the released package version. — Thanks @imjlk!
- [eeef40f](https://github.com/imjlk/wp-typia/commit/eeef40f241a4ab4f6c542904c2ad593e787388d7) Improve source checkout bootstrap guidance when local project-tools build artifacts are missing. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.22.7

## 0.22.6 — 2026-05-04

### Patch changes

- [ea8c59e](https://github.com/imjlk/wp-typia/commit/ea8c59eceb6058d145422eaf9f841f8d978b2af8) Surface malformed scaffold compatibility version floors instead of silently falling back, including CLI warnings for repaired plugin headers. — Thanks @imjlk!
- [75d4947](https://github.com/imjlk/wp-typia/commit/75d494760caff76a0b661a183f5a1427265bf2b2) Ignore PHP string and heredoc braces when repairing generated workspace bootstrap functions. — Thanks @imjlk!
- [21a1e53](https://github.com/imjlk/wp-typia/commit/21a1e53e075a09edb5eb9573361675408c117a68) Emit diagnostic-coded CLI option parsing errors and preserve command context for structured Node fallback failures. — Thanks @imjlk!
- [102e43d](https://github.com/imjlk/wp-typia/commit/102e43d5eb4914737efd2a7c95fdccc7dd3527c6) Use `npm install --no-audit` for first-run scaffold installs and document npm audit/peer-warning guidance for generated projects. — Thanks @imjlk!
- [a50975e](https://github.com/imjlk/wp-typia/commit/a50975e07be2658ccd66248fb2983aa4d9782fc3) Keep acronym runs together when deriving kebab-case generated identifiers. — Thanks @imjlk!
- [72d575f](https://github.com/imjlk/wp-typia/commit/72d575f75f808547e68649353399f3be09976ddd) Validate loaded wp-typia config files with a strict runtime schema and report clear diagnostics for unknown keys or invalid value types. — Thanks @imjlk!
- [de42ed0](https://github.com/imjlk/wp-typia/commit/de42ed0c00a1912bbc3be43aedca3130758043c1) Normalize `--format text` through the Node fallback CLI before command dispatch. — Thanks @imjlk!
- [a7d744e](https://github.com/imjlk/wp-typia/commit/a7d744e98d988096a356d38092bddf23d3eb4838) Single-source add kind ids through project-tools metadata so CLI routing and runtime add helpers cannot drift. — Thanks @imjlk!
- [bd56023](https://github.com/imjlk/wp-typia/commit/bd56023d047524df8f48ab7888ca3bdd34755447) Keep routing metadata generation working when wp-typia is installed with packaged project-tools files instead of monorepo source files. — Thanks @imjlk!
- [47352a6](https://github.com/imjlk/wp-typia/commit/47352a6ad026e1a6dd77f364442f9f48b0eff755) Enable public npm admin-view scaffolds now that @wp-typia/dataviews is published. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.22.6

## 0.22.5 — 2026-05-02

### Patch changes

- [571d389](https://github.com/imjlk/wp-typia/commit/571d3892cdaf467aa6b063b2585a0be2a24c9de3) Share CLI entrypoint command resolution between output-format validation and diagnostic output. — Thanks @imjlk!
- [60edac6](https://github.com/imjlk/wp-typia/commit/60edac6d036437285b3e4f89413bcd9c46f451f6) Advertise `--format text` for human-readable CLI output while preserving the legacy `toon` alias. — Thanks @imjlk!
- [a94457d](https://github.com/imjlk/wp-typia/commit/a94457ded5a069ce8d247d55afc61ede7b1cab97) Expand Node fallback CLI core coverage for dispatch, format, config, and stderr handling. — Thanks @imjlk!
- [d5269be](https://github.com/imjlk/wp-typia/commit/d5269be6a7d9a0e6b523baea3a9aac7464ec1f1d) Consolidate Node fallback command help rendering around shared command metadata. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.22.5

## 0.22.4 — 2026-05-02

### Patch changes

- [9a3efd8](https://github.com/imjlk/wp-typia/commit/9a3efd88d6c7ab5243e755afd34cfc35a7b35e8b) Add focused CLI core tests for Node fallback routing, command registry metadata,
  configuration merging and overrides, and structured diagnostic output. — Thanks @imjlk!
- [0341072](https://github.com/imjlk/wp-typia/commit/03410725096cb1023849b8a4b0db659ce63d0bc8) Document and test that generated server-only AI feature PHP avoids WordPress
  script-module enqueue APIs, keeping older WordPress sites from loading an
  unguarded script-module call. Keep the CLI package in the same release lane as
  its exact `@wp-typia/project-tools` dependency. — Thanks @imjlk!
- [c04dcc7](https://github.com/imjlk/wp-typia/commit/c04dcc71d3ac825a47d10fce7065976958110a7f) Centralize CLI package-manager inference so completion guidance and sync flows
  share support for packageManager fields, Bun/pnpm/Yarn/npm lockfiles, Yarn PnP
  markers, npm shrinkwrap files, and npm fallback behavior. — Thanks @imjlk!
- [e052c02](https://github.com/imjlk/wp-typia/commit/e052c0242be10df83cb4531c68f8c65aaf2b12a5) Split shared add runtime helpers into focused type, validation, filesystem,
  collision, block JSON, and help modules while keeping the compatibility barrel.
  Also deduplicate the CLI line-printer type used by add and runtime bridge flows. — Thanks @imjlk!
- [bb23621](https://github.com/imjlk/wp-typia/commit/bb23621265f012b6ed575a6a5d3c4c9d363c0720) Validate `wp-typia add block --template` ids through the shared add-block template runtime guard before preparing execution. — Thanks @imjlk!
- [df3e974](https://github.com/imjlk/wp-typia/commit/df3e9747ba47c31476e45f7e66581f0b5222d4ac) Validate CLI `--format` values before command execution so typoed formats fail
  clearly with the supported `json` and `toon` values instead of silently falling
  back to human-readable output. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.22.4

## 0.22.3 — 2026-05-01

### Patch changes

- [59e7c6d](https://github.com/imjlk/wp-typia/commit/59e7c6dfdda035f10b1bcd092b20f690c98aa319) Replace generated interactivity `CallableFunction` aliases with explicit
  callable signatures so scaffolded stores stay lint-friendly without weakening
  the typed directive and action helpers. — Thanks @imjlk!
- [34f9ec9](https://github.com/imjlk/wp-typia/commit/34f9ec9b86005ad77ab8d72b83f9643724c2368f) Return a non-zero exit code when `wp-typia` is invoked without a command while
  still printing the Node fallback help output, and keep explicit help/version
  requests successful. — Thanks @imjlk!
- [feb835a](https://github.com/imjlk/wp-typia/commit/feb835a4532ce110d99303203b6f702db3a42a54) Consolidate residual add-command helper duplication by sharing strict versus
  loose CLI string flag readers, external-layer prompt hints, and scaffold
  collision checks while preserving existing diagnostics and add workflow
  behavior. — Thanks @imjlk!
- [73af96c](https://github.com/imjlk/wp-typia/commit/73af96cb78b9229789e49648832f4d904f915785) Refactor the workspace doctor into focused package, block, binding, and feature modules while preserving the existing `wp-typia doctor` output and adding direct coverage for the extracted binding diagnostics. — Thanks @imjlk!
- [61e4d76](https://github.com/imjlk/wp-typia/commit/61e4d762fd1d882b2ef26c9655d43b2865e535de) Modularize the workspace `add ability` and `add ai-feature` scaffolds into
  thin entry points plus focused template and workspace-mutation helpers while
  keeping representative generated output and integration behavior stable. — Thanks @imjlk!
- [9ef4b67](https://github.com/imjlk/wp-typia/commit/9ef4b67c20671d735fbf82e464ce0d05d45ed39b) Normalize `wp-typia --help <bun-only-command>` so it no longer falls into
  low-level Bunli validation errors and instead matches the existing command-help
  or Bun-runtime guidance flow. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.22.3

## 0.22.2 — 2026-05-01

### Patch changes

- [f77d10f](https://github.com/imjlk/wp-typia/commit/f77d10f443493724f116a6db9f6bfc51e052671f) Keep the exact `@wp-typia/project-tools` release lane aligned with the patch planned for generated AI feature support metadata helpers. — Thanks @imjlk!
- [9ae7955](https://github.com/imjlk/wp-typia/commit/9ae79554b180c1c7cc82ba8f981097b406807c1e) Keep the exact `@wp-typia/project-tools` release lane aligned with the patch planned for the OpenAPI-backed `typia.llm` constraint restoration helpers. — Thanks @imjlk!
- [31be7b9](https://github.com/imjlk/wp-typia/commit/31be7b9aac44bd8f39bff85bd5d45b40f133b083) Keep the exact `@wp-typia/project-tools` release lane aligned with the patch planned for scaffolded AI feature customization hooks. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.22.2

## 0.22.1 — 2026-04-30

### Patch changes

- [2147363](https://github.com/imjlk/wp-typia/commit/2147363cac6323a11a0779dd5ade2b1e85d0be0e) Route `wp-typia mcp --output-dir` through shared command option metadata so
  routing metadata, argv walking, and Bun runtime help stay aligned. — Thanks @imjlk!
- [f2254a9](https://github.com/imjlk/wp-typia/commit/f2254a9ab36fb43c2e97c50875ee4eddc5448131) Derive the `wp-typia add` command tree subcommands from shared add-kind ids so
  CLI metadata, help, and routing consumers stay aligned when new add kinds are
  added. — Thanks @imjlk!
- [d331ad4](https://github.com/imjlk/wp-typia/commit/d331ad48e1d0f5f96c649390a87b18c248612377) Harden the interactivity block scaffold by replacing loose `Function` typings
  with safer callable signatures, and add regression coverage for workspace
  interactivity helpers plus add-kind execution-plan compatibility. — Thanks @imjlk!
- [90ed375](https://github.com/imjlk/wp-typia/commit/90ed3751d27739b7780b480b04664c6b44475f7a) Standardize JSON CLI diagnostics so success payloads stay on stdout, error
  payloads go to stderr, and completion-oriented success payloads use one
  canonical nested completion shape. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.22.1

## 0.22.0 — 2026-04-30

### Minor changes

- [51ffdd4](https://github.com/imjlk/wp-typia/commit/51ffdd42d3e722fa2454e32f873b60409e007f2e) Generate typed Interactivity API helper scaffolds for action, callback, state,
  context, and negate directive paths, and wire the interactivity template to
  share those helpers across edit, save, and runtime store files. — Thanks @imjlk!

### Patch changes

- [81dd6a1](https://github.com/imjlk/wp-typia/commit/81dd6a1bb8382a7c340118dba679a402438f5ada) Strengthen add-kind registry type coverage so each add kind's
  `prepareExecution()` result stays compile-time compatible with its
  corresponding `getValues(result)` contract as the registry grows. — Thanks @imjlk!
- [5a3fe52](https://github.com/imjlk/wp-typia/commit/5a3fe52e6074932ffd15c3d978d67d606b39d955) Add opt-in core-data admin-view sources for post types and taxonomies, including
  CLI validation, generated screen/data scaffolds, and conditional WordPress data
  package wiring. — Thanks @imjlk!
- [99db45f](https://github.com/imjlk/wp-typia/commit/99db45fa5b5b15803d1e4c9dccfda2197e1804a0) Centralize runtime version-floor parsing and comparison helpers shared by
  scaffold compatibility and AI feature capability planning, and add edge-case
  coverage for empty, duplicate, and mixed AI capability selections. — Thanks @imjlk!
- [3cf71b3](https://github.com/imjlk/wp-typia/commit/3cf71b3a24c1b49f483e183ac0e096da69f266cd) Gate `wp-typia add admin-view` in public installs until
  `@wp-typia/dataviews` is published to npm, while preserving an internal test
  override for monorepo validation. — Thanks @imjlk!
- [54632a0](https://github.com/imjlk/wp-typia/commit/54632a06e24a33e81efaf87acd655fe994cafb94) Centralize managed WordPress dependency fallback ranges for ability and
  admin-view scaffolds in `package-versions.ts` so add-command defaults do not
  drift across runtime modules. — Thanks @imjlk!
- [40b5ce3](https://github.com/imjlk/wp-typia/commit/40b5ce3d8ea74bf0c2268a92fb952620c32246f3) Normalize `wp-typia init --format json` and `wp-typia init --apply --format json`
  to the standard `{ ok: true, data: ... }` CLI success envelope while keeping
  the detailed retrofit plan nested under `data.plan`. — Thanks @imjlk!
- [14a172b](https://github.com/imjlk/wp-typia/commit/14a172bcc47d0aba37f4752fb15d8c7dbf1d8fcb) Route interactive `wp-typia create`, `add`, and `migrate` invocations back
  through the Bunli/OpenTUI runtime when Bun and a TTY are available, while
  preserving Node fallback behavior for CI, JSON, help, and Bun-free runs. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.22.0

## 0.21.0 — 2026-04-29

### Minor changes

- [fe04635](https://github.com/imjlk/wp-typia/commit/fe046350f7cd80f3590d1ea8bf5b3c55750ec655) Unify add-kind metadata and execution behind a single registry, restore the canonical add-kind ordering, and clarify interactive block-template selection while keeping non-interactive add flows defaulted to `basic`. — Thanks @imjlk!
- [e8e3b8a](https://github.com/imjlk/wp-typia/commit/e8e3b8acd03902626260c2189948d99876df5d17) Elevate binding-source scaffolds with optional end-to-end block target wiring, including typed attribute updates, supported-attributes doctor checks, and CLI/docs coverage. — Thanks @imjlk!
- [eaac994](https://github.com/imjlk/wp-typia/commit/eaac994a143dc2d4d20b51fe18dc6ced029ab95a) Add non-failing `wp-typia doctor` warnings for workspace block iframe/API v3
  readiness, including block metadata, stylesheet registration, global DOM access,
  and wrapper-props checks with machine-readable diagnostic codes. — Thanks @imjlk!
- [7fe9336](https://github.com/imjlk/wp-typia/commit/7fe93360fa7cc5dc03a6c2e24d5e8fda4b502a9b) Add first-class `wp-typia add style` and `wp-typia add transform` workspace
  scaffolds, including workspace inventory sections, block entrypoint wiring,
  doctor coverage, CLI/TUI metadata, generated-project build coverage, and docs. — Thanks @imjlk!
- [b5e2652](https://github.com/imjlk/wp-typia/commit/b5e265284d79c4362c25015a02650f369b8fb0ed) Add `wp-typia init --apply` for existing projects so the CLI can write the planned retrofit package.json updates and helper scripts with rollback-on-failure protection, package-manager-aware next steps, and shared init option metadata across the Bunli and Node fallback runtimes. — Thanks @imjlk!

### Patch changes

- [d8f7756](https://github.com/imjlk/wp-typia/commit/d8f77564ed297609db783d7c21c42fa175da82ae) Made editor-plugin scaffolding slot-aware with canonical `sidebar` and `document-setting-panel` surfaces, while preserving `PluginSidebar` as a legacy alias. — Thanks @imjlk!
- [fab19de](https://github.com/imjlk/wp-typia/commit/fab19dee0a47c70afa749831dfc382490b6f1deb) Honor `NO_COLOR` as an ASCII-safe CLI output marker signal while documenting `WP_TYPIA_ASCII` precedence. — Thanks @imjlk!
- [c832b13](https://github.com/imjlk/wp-typia/commit/c832b13b9a6dce4e06f2f5dddeebe06d0ed82412) Tagged high-frequency CLI validation failures with explicit diagnostic codes so structured JSON errors rely less on message regex inference. — Thanks @imjlk!
- [d0a0f0c](https://github.com/imjlk/wp-typia/commit/d0a0f0c609122099194b7fef120d444dbbf8e7a1) Document the supported CLI diagnostic code contract, export recovery metadata
  for machine-readable integrations, and tighten representative structured failure
  coverage across create, add, sync, init, and doctor flows. — Thanks @imjlk!
- [96d7195](https://github.com/imjlk/wp-typia/commit/96d7195dddb211da9e77a264384463b48c8dfcb6) Added command-specific `doctor --help` coverage and documented the supported CLI command surface. — Thanks @imjlk!
- [b7d7fc1](https://github.com/imjlk/wp-typia/commit/b7d7fc17cf633c1678381a6ed408e42c3ec408de) Added an opt-in DataViews admin view scaffold with REST resource source wiring and CLI metadata. — Thanks @imjlk!
- [023c1fd](https://github.com/imjlk/wp-typia/commit/023c1fd14b605615c389e06906068f1fa39b8d5f) Emit `ok: true` structured JSON success payloads for `wp-typia create --format json` and `wp-typia add --format json`. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.21.0

## 0.20.5 — 2026-04-26

### Patch changes

- [4fe96e4](https://github.com/imjlk/wp-typia/commit/4fe96e440da1bde7772d382b667834c53f2a657c) Fixed invalid create/add template ids to return user-facing unknown-template diagnostics instead of leaking internal prompt callback errors. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.20.2

## 0.20.4 — 2026-04-25

### Patch changes

- [17f7000](https://github.com/imjlk/wp-typia/commit/17f7000ef89f826949924812c73ddb40d3a20f53) Updated the bundled CLI dependency on `@wp-typia/project-tools` to the planned 0.20.1 patch release. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.20.1

## 0.20.3 — 2026-04-24

### Patch changes

- [4775d32](https://github.com/imjlk/wp-typia/commit/4775d32ccd1b13da2bc6dddfe8d0902bb2cdb08b) Added a CLI release entry for the planned `@wp-typia/project-tools` 0.20.0 dependency update. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.20.0

## 0.20.2 — 2026-04-23

### Patch changes

- [fbf4476](https://github.com/imjlk/wp-typia/commit/fbf4476011ebd95b21ca29af0cf964adc26da611) Added: retrofit init planning and external template safety guards — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.19.3

## 0.20.1 — 2026-04-23

### Patch changes

- [f215f32](https://github.com/imjlk/wp-typia/commit/f215f3266fb781178cd0203bb380b6669de8550e) Keep wp-typia's runtime coupling lane aligned with the @wp-typia/project-tools REST helper refactor release. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.19.2

## 0.20.0 — 2026-04-22

### Minor changes

- [d5c5362](https://github.com/imjlk/wp-typia/commit/d5c536289cd391310bf7089a58de384948baf643) Add standalone `wp-typia` release assets and installers. GitHub Releases can now publish platform-specific standalone archives together with `install-wp-typia.sh` / `install-wp-typia.ps1`, and the installed CLI can resolve packaged scaffold/template support assets without requiring Bun to be preinstalled on the target machine. — Thanks @imjlk!

### Patch changes

- [b3f5346](https://github.com/imjlk/wp-typia/commit/b3f5346c22b0b1b9380db4498b51e8692880204b) Added stable machine-readable CLI error codes for structured `--format json` failures across the Node fallback and Bun runtime command surfaces. — Thanks @imjlk!
- [df4669e](https://github.com/imjlk/wp-typia/commit/df4669ea52c2641e6244eaeff7595665a269af44) Refactored the `wp-typia` CLI to derive more parser behavior, create/add/migrate initial values, and add-subcommand execution flow from shared command metadata primitives so new command-surface changes require fewer parallel edits. — Thanks @imjlk!
- [cccdd76](https://github.com/imjlk/wp-typia/commit/cccdd760553bcbb96c87b350d6814ef8778e91c1) Improved doctor scope messaging, add completion guidance, sync and dry-run help text, and missing bundled-artifact diagnostics across standalone CLI flows. — Thanks @imjlk!
- [1d1dd6e](https://github.com/imjlk/wp-typia/commit/1d1dd6ea664ec5ff7c6da65d8699ab76b8359317) Hardened interactive runtime detection, fallback cleanup behavior, and temporary wp-typia workspace lifecycle handling. — Thanks @imjlk!
- [cc55b61](https://github.com/imjlk/wp-typia/commit/cc55b61a42a02ee02020b337e10dd70d80c5caa0) Made external-template trust more explicit during scaffolding and surfaced clearer diagnostics when remote template package metadata is malformed. — Thanks @imjlk!
- [9866ae9](https://github.com/imjlk/wp-typia/commit/9866ae9fbfcea874ef948917ab4d8677521b7e0b) Treat `wp-typia add` without a subcommand kind as a real CLI error. The command now still prints add help text for interactive users, but exits non-zero so shells, CI, and wrappers can distinguish malformed invocations from successful add workflows. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.19.1

## 0.19.0 — 2026-04-21

### Minor changes

- [bd575b8](https://github.com/imjlk/wp-typia/commit/bd575b866ac7f7860ef2e25ab3a7663fc0e4a9d0) Add alternate render target scaffold support for persistence-capable dynamic blocks. `wp-typia create` and `wp-typia add block` now accept `--alternate-render-targets <email,mjml,plain-text>` for persistence scaffolds and persistence-enabled compound scaffolds, emitting shared `render-targets.php` helpers plus per-target render entry files alongside the default web render boundary. — Thanks @imjlk!

### Patch changes

- [0938059](https://github.com/imjlk/wp-typia/commit/0938059eba177cb446bd05554ba5cd0ed1a1b5b8) Unify high-frequency create/add validation paths around shared helpers so built-in `--variant` errors, `externalLayerId` composition rules, and local `--external-layer-source` path failures surface the same messages across CLI entry points. Query Loop post-type validation now mentions the original offending input, and `wp-typia add block` explains when a provided name normalizes to an empty slug instead of falling back to a generic required-field error. — Thanks @imjlk!
- [0559810](https://github.com/imjlk/wp-typia/commit/055981091f996d6693dcce323e191e1f879ae127) Improve create/add/sync CLI ergonomics for preview-first and no-install workflows. `wp-typia create --dry-run` now defaults non-interactive answers without requiring an extra `--yes`, `wp-typia sync` fails early with install guidance when local dependencies like `tsx` are missing, and `wp-typia add ... --dry-run` can preview planned workspace file updates without mutating the real workspace. — Thanks @imjlk!
- [6bcd154](https://github.com/imjlk/wp-typia/commit/6bcd1540a2e18f51e9b63f7c57f71fe2c4f33471) Trim the published `wp-typia` CLI tarball so Bunli/OpenTUI runtime assets stay under `dist-bunli/.bunli/` and repo-only build inputs like `bunli.config.ts` no longer ship to npm. — Thanks @imjlk!
- [d2d0cd6](https://github.com/imjlk/wp-typia/commit/d2d0cd61b22cf4f6086609d342d9cd9beec189f4) Polish scaffold onboarding so create-time output and generated READMEs make `wp-typia doctor` easier to discover, keep sync notes shorter, and favor the default workspace quick-start path over more specialized first-run examples. — Thanks @imjlk!
- [849c750](https://github.com/imjlk/wp-typia/commit/849c7502911954796dc1e8ae13c6369de658313b) Expose hook-friendly InnerBlocks option helpers for generated compound containers.
  
  Generated compound parents and container children now export reusable `get*InnerBlocksPropsOptions()` helpers so projects can move to `useInnerBlocksProps` without manually reconstructing preset-driven `template`, `defaultBlock`, `templateLock`, `orientation`, `directInsert`, or `renderAppender` settings. — Thanks @imjlk!
- [da4ea2c](https://github.com/imjlk/wp-typia/commit/da4ea2c40e34548c8931a48b47cf886fb76d014e) Clarify compound nested block ownership so static child constraints stay metadata-owned.
  
  Generated compound parent and nested child editors now rely on `block.json` for static `allowedBlocks`, `parent`, and `ancestor` relationships, while `children.ts` stays focused on editor-only preset behavior such as `template`, `defaultBlock`, `orientation`, `templateLock`, and `directInsert`. — Thanks @imjlk!
- [a22b87f](https://github.com/imjlk/wp-typia/commit/a22b87fc13bd4d882502b04dc591cc61d2146c58) Align Bunli command metadata with the Node fallback help and parser surfaces so `wp-typia --help`, command-specific fallback help, and end-user runtime guidance stay consistent as CLI flags evolve. — Thanks @imjlk!
- [b94f058](https://github.com/imjlk/wp-typia/commit/b94f058f79a967a31052d2c33a45b201a340d28e) Clarify template capability boundaries across create/add/help/onboarding flows. Query Loop discovery now explains that it is a create-time `core/query` variation scaffold rather than an `add block` family, explicit but inapplicable flags like `--with-migration-ui` and `--query-post-type` now surface visible warnings, and workspace guidance more consistently points users at the short `--template workspace` alias. — Thanks @imjlk!
- [b177c6b](https://github.com/imjlk/wp-typia/commit/b177c6b429753e7c05714efcdc0d66be980cb1f0) Validate compound child graphs before generated nested child scaffolds write files.
  
  Generated compound child add-flow scripts can now preview the resulting nested hierarchy with `--dry-run`, emit planned writes before mutating files, and fail early when existing or requested ancestor graphs are structurally invalid. — Thanks @imjlk!
- [4eb3ad0](https://github.com/imjlk/wp-typia/commit/4eb3ad064d6fa18839b7692bcb8ff6ac04e49091) Add compound scaffold InnerBlocks presets for richer nested authoring flows.
  
  Compound create and workspace add flows now accept `--inner-blocks-preset <freeform|ordered|horizontal|locked-structure>`, generated compound container code exposes preset-backed `orientation`, `templateLock`, `defaultBlock`, and `directInsert` behavior, and scaffolded READMEs explain which nested constraints stay metadata-owned versus runtime-owned. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.19.0

## 0.18.0 — 2026-04-20

### Minor changes

- [677c81d](https://github.com/imjlk/wp-typia/commit/677c81d9c59e870c7ae47de01d357b6f6158e362) Expand official external template config support so variants can render richer `wp-typia` plugin and workspace scaffolds through `pluginTemplatesPath`, including workspace migration capability for rendered templates that declare `wpTypia.projectType: "workspace"`. — Thanks @imjlk!
- [79e43bd](https://github.com/imjlk/wp-typia/commit/79e43bd23a146e2aef4fdf2ebcb995ad3dad5a79) Add first-class `wp-typia add editor-plugin <name> [--slot <PluginSidebar>]` workspace scaffolding, including workspace inventory support, editor build/bootstrap wiring, doctor coverage, and generated-project smoke validation. — Thanks @imjlk!

### Patch changes

- [a896210](https://github.com/imjlk/wp-typia/commit/a8962106791c5586e0438128045f7dad5fdc12c5) Keep Linux reference-project migration smoke runs from flattening Bunli runtime asset names by anchoring the full-runtime build root to the execution cwd that owns the installed package graph. — Thanks @imjlk!
- [b356b7a](https://github.com/imjlk/wp-typia/commit/b356b7abaabb995a86467fa6299edb796720a196) Add a non-mutating `wp-typia create --dry-run` plan mode that previews resolved scaffold settings and planned file output without writing to the requested target directory, with matching fallback CLI and alternate-buffer create flow support. — Thanks @imjlk!
- [aaa235e](https://github.com/imjlk/wp-typia/commit/aaa235e1e6b80001145f2332730fc86f57503735) Align scaffolded project conventions by treating `dev` as the primary generated entrypoint across first-party templates, clarifying that Query Loop scaffolds intentionally skip manual sync scripts, omitting the generated `packageManager` field for npm-based scaffolds, and removing the unused Query Loop `validator-toolkit.ts` placeholder. — Thanks @imjlk!
- [72e2ab1](https://github.com/imjlk/wp-typia/commit/72e2ab1b87c1f225b2542e9337077316a1dcf666) Keep the published `wp-typia` Bunli runtime compatible with Node fallback and generated project smoke flows by avoiding Bun chunk-name collisions during linked-runtime rebuilds without forcing the full CLI into a single-file bundle. — Thanks @imjlk!
- [3730b51](https://github.com/imjlk/wp-typia/commit/3730b516083defed2a07d4d72307a4d3f8e1a60a) Make the Node fallback CLI print a normal human-readable `--version` line by default, add earlier create/add preflight diagnostics for mistyped built-in templates and non-empty target directories, and fail `wp-typia add block` with install guidance before workspace dependency resolution errors. — Thanks @imjlk!
- [991ef3c](https://github.com/imjlk/wp-typia/commit/991ef3c20c6b8d1767309bb0432d3ac07baf76b2) Keep the split `wp-typia` Bunli runtime compatible with Linux reference-project migration smoke runs by using collision-safe asset names for the full runtime rebuild without regressing local help and skills command loading. — Thanks @imjlk!
- [938b9b0](https://github.com/imjlk/wp-typia/commit/938b9b08560640f76fd78e5966c9b6982c6a7fed) Add user-visible progress reporting for longer `wp-typia create` scaffold phases so fallback CLI runs and alternate-buffer create flows more clearly show template resolution, file generation, artifact seeding, finalization, and dependency installation work while scaffolding is in progress. — Thanks @imjlk!
- [5293151](https://github.com/imjlk/wp-typia/commit/529315196a151b54ddac2beb9157ec5fca1a42b5) Avoid split-chunk output collisions when rebuilding the linked Bunli runtime
  from generated example projects such as `my-typia-block`. — Thanks @imjlk!
- [fcec7f1](https://github.com/imjlk/wp-typia/commit/fcec7f1fd2dbb5716af706fb624621f73bfc9dfa) Improve human-readable `templates list` and `templates inspect` output with clearer flag capability hints, workspace alias discoverability, and logical layer summaries that do not expose raw internal template paths by default. — Thanks @imjlk!
- [65b8eb2](https://github.com/imjlk/wp-typia/commit/65b8eb2cf876eb73c8200da4fbcfd9fc30d2b5e0) Add the first-class `wp-typia add rest-resource <name>` workspace workflow so official workspace plugins can scaffold plugin-level typed REST resources with generated TypeScript contracts, validators, endpoint clients, React data hooks, PHP route starters, `sync-rest` inventory support, and matching add/doctor/help surfaces.
  
  Teach `@wp-typia/rest` endpoint execution to honor `requestLocation: "query-and-body"` so generated update clients can split query parameters and JSON bodies correctly. — Thanks @imjlk!
- [661c398](https://github.com/imjlk/wp-typia/commit/661c398f31a80293557bf6d1727c28abdb1b591d) Keep the repo-owned Bunli runtime split for canonical CLI startup paths while
  using a single-file rebuild mode for linked installed-package copies inside
  generated project smoke runs. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.18.0

## 0.17.0 — 2026-04-19

### Minor changes

- [51d5fb2](https://github.com/imjlk/wp-typia/commit/51d5fb26ef18ead7f60d37a4f8189a57d4a15134) Add the built-in `query-loop` scaffold family so `wp-typia create --template query-loop`
  can generate a usable `core/query` variation with namespace-based identity,
  default query attributes, allowed controls, and inline starter layout. — Thanks @imjlk!
- [3e79eff](https://github.com/imjlk/wp-typia/commit/3e79eff8bd9ae3b2d5cc6785cdb00c4dc2ea6d33) Add Query Loop custom query extension seams so `wp-typia create --template query-loop`
  now seeds a dedicated `src/query-extension.ts` authoring surface for variation-
  specific query params and optional editor hook registration. — Thanks @imjlk!
- [7a2df54](https://github.com/imjlk/wp-typia/commit/7a2df54455e4e485983a02fd726f210e3bbfb965) Add Query Loop runtime parity scaffolds so `wp-typia create --template query-loop`
  now seeds `inc/query-runtime.php` hooks for frontend query mapping and editor
  preview parity alongside the variation's custom query marker. — Thanks @imjlk!
- [4a9a930](https://github.com/imjlk/wp-typia/commit/4a9a9300eef404ff03e726635bdb4a1963c0c690) Add connected Query Loop layout preset scaffolds so `wp-typia create --template query-loop`
  now seeds pattern-backed grid and list layouts alongside the inline variation fallback. — Thanks @imjlk!

### Patch changes

- Updated dependencies: project-tools (npm)@0.17.0

## 0.16.15 — 2026-04-19

### Patch changes

- [86f9e0a](https://github.com/imjlk/wp-typia/commit/86f9e0abbfa0a84c7122e35781bb30d7e3d86122) Improve the Node-side fallback prompt UX for `wp-typia` by making numbered selections easier to reuse, redrawing choices on demand, and documenting the lighter readline prompt model relative to the Bun/OpenTUI path. — Thanks @imjlk!
- [460d86d](https://github.com/imjlk/wp-typia/commit/460d86d92fc0af94bbcb0542feb400236e9004ae) Remove the deprecated `@wp-typia/create` and `create-wp-typia` package shells from the repository, and update current docs plus publish automation to point directly at `wp-typia`, `@wp-typia/project-tools`, and `@wp-typia/block-runtime`. — Thanks @imjlk!
- [64e52b7](https://github.com/imjlk/wp-typia/commit/64e52b7e2d2b456cfd0816716b0807f93832dbaf) Split generated project smoke assertions, scaffold runtime helpers, and first-party form helpers into focused modules while keeping the existing CLI and TUI behavior stable. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.16.14

## 0.16.14 — 2026-04-19

### Patch changes

- [0653d2e](https://github.com/imjlk/wp-typia/commit/0653d2e2ce7828e289df1910ffb2818e0a61c4c0) Split scaffold onboarding into clearer quick-start, advanced sync, and first-commit guidance across the CLI completion output and generated README content. — Thanks @imjlk!
- [78a342f](https://github.com/imjlk/wp-typia/commit/78a342f00a0545d07274681f5f13be976153f986) Clarify `wp-typia doctor` output outside official workspace roots by surfacing an explicit doctor scope row, environment-only rerun guidance, and earlier invalid-workspace messaging. — Thanks @imjlk!
- [911e98b](https://github.com/imjlk/wp-typia/commit/911e98b47dfc3406940f4e000f806cb28d9d7b77) Tighten `wp-typia create` flag handling by defaulting `--yes` scaffolds to npm, rejecting persistence-only flags on non-persistence built-in templates, and surfacing built-in `--variant` misuse earlier. — Thanks @imjlk!
- [e80744c](https://github.com/imjlk/wp-typia/commit/e80744c5c193390986fec44d2061600aeb48c1a8) Wrap human-readable `wp-typia` CLI diagnostic and doctor output more readably in narrow terminals without changing structured output. — Thanks @imjlk!
- [26c9ab7](https://github.com/imjlk/wp-typia/commit/26c9ab77d6b97754998c6f9d8f524d08abf4d24d) Harden `wp-typia create` project-directory handling by warning on awkward names, rejecting `.` and `..`, and limiting the positional shortcut to unambiguous local paths. — Thanks @imjlk!
- [8e25875](https://github.com/imjlk/wp-typia/commit/8e25875979b27da9c46a5e4357217ea93919b505) Promote the published `wp-typia` CLI to a built `dist-bunli` runtime so the Node bin no longer shells out to Bun. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.16.13

## 0.16.13 — 2026-04-18

### Patch changes

- [86bd02b](https://github.com/imjlk/wp-typia/commit/86bd02bc489e121a03fc8b9b31b2f3fc8375067c) Keep the published wp-typia release lane aligned with the project-tools migration runtime refactor patch release. — Thanks @imjlk!
- [1206a2d](https://github.com/imjlk/wp-typia/commit/1206a2de2d7c74dc3aa365a13477da68a3e6d1a0) Updated `wp-typia` to consume the next `@wp-typia/project-tools` patch release so
  runtime package coupling stays aligned when the built-in code template refactor
  ships. — Thanks @imjlk!
- [7d3a039](https://github.com/imjlk/wp-typia/commit/7d3a039f36f4d65bb587ca527c90a26b0e0e492b) Split runtime bridge output and sync helpers into focused modules without changing the public bridge surface. — Thanks @imjlk!
- [5b71cdc](https://github.com/imjlk/wp-typia/commit/5b71cdced704a0b1f2dcb030c4cf7a8c2c74481f) Refresh the hosted docs site, expand TypeDoc and TSDoc coverage for core plus advanced public surfaces, and document the latest public facade boundaries without changing runtime behavior. — Thanks @imjlk!
- Updated dependencies: api-client (npm)@0.4.5, project-tools (npm)@0.16.12

## 0.16.12 — 2026-04-16

### Patch changes

- [bee3c9e](https://github.com/imjlk/wp-typia/commit/bee3c9e35e9d35e32513b172c228a4cc9a424b07) Upgraded the repo-owned lint stack to `eslint` 9 with `@typescript-eslint` 8,
  added root `lint:fix` and `format:write` scripts, and documented the
  maintainer autofix flow alongside the formatter/lint baseline validator. — Thanks @imjlk!
- [b9b57de](https://github.com/imjlk/wp-typia/commit/b9b57de84fad43525094bea76641164fc58fa0c2) Added the missing root `LICENSE` file and tightened the positional
  `wp-typia <project-dir>` alias so typo-like invocations with extra positional
  arguments fail with explicit guidance instead of silently scaffolding a new
  project. — Thanks @imjlk!
- [850ea02](https://github.com/imjlk/wp-typia/commit/850ea02e85bc1bb1d8736964988e5d5925648c36) Reduced example maintenance drift by switching the repo-local `my-typia-block`
  reference app to the workspace `wp-typia` CLI instead of a hardcoded published
  version, and by giving `api-contract-adapter-poc` explicit `lint` / `format`
  scripts that now participate in the shared examples maintenance workflow. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.16.11

## 0.16.11 — 2026-04-15

### Patch changes

- [1c9916a](https://github.com/imjlk/wp-typia/commit/1c9916aa50c7e80590b35a7691b9f5fc0537ea60) Fixed published scaffold outputs so generated basic, persistence, and compound block registration files no longer rely on `registerBlockType<T>()` generic calls that break against the current published `@wordpress/blocks` type surface. Hardened the packed publish-install smoke to verify wrapper exports and to typecheck generated basic and compound scaffolds, including the compound `add-compound-child` path, against packed local release tarballs before publish. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.16.10

## 0.16.10 — 2026-04-15

### Patch changes

- [58b9481](https://github.com/imjlk/wp-typia/commit/58b9481152c9171c47354942ef38367ea591ed84) Emit typed wrapper modules for generated `block.json` and `typia.manifest.json` artifacts so built-in scaffolds, migration UI, and reference examples consume `block-metadata.ts`, `manifest-document.ts`, and `manifest-defaults-document.ts` instead of local cast sites. — Thanks @imjlk!
- [0eefbc4](https://github.com/imjlk/wp-typia/commit/0eefbc4fc8459c18bc34cd0cf86911703e5fc76c) Keep migration registry generation validating the current manifest even when retrofitted projects import a local `manifest-document.ts` wrapper, so malformed or stale wrappers still fail fast during migration setup. — Thanks @imjlk!
- [a9803c7](https://github.com/imjlk/wp-typia/commit/a9803c7c7e1adb82eeb9ede485b1ccce9c8e2849) Upgrade official workspace binding-source scaffolds from placeholder-only files to a field-keyed starter contract with named PHP helpers, matching editor starter values, and clearer generated guidance. — Thanks @imjlk!
- [eb0cbda](https://github.com/imjlk/wp-typia/commit/eb0cbdaf7980a89cac6a62bce0575a505972457e) Harden template rendering internals by removing global Mustache escape mutation, centralizing template traversal behind explicit rendering semantics, and stabilizing block-generation fingerprints with deterministic JSON serialization. — Thanks @imjlk!
- [9952e4f](https://github.com/imjlk/wp-typia/commit/9952e4f4669dbc6e859906807ef872f9306d3367) Export validated JSON artifact helpers for scaffold `block.json` and `typia.manifest.json` boundaries, and update generated projects, examples, migration UI, and CLI tooling to prefer those runtime validators over raw `as` casts. — Thanks @imjlk!
- [058d7ee](https://github.com/imjlk/wp-typia/commit/058d7eeff79891e1b778716b5d24ea5100d89f46) Parameterize scaffold repository placeholder rewrites so generated projects can inherit a fork-aware `owner/repo` reference from runtime package metadata or an explicit `repositoryReference` override instead of hardcoding `imjlk/wp-typia`. — Thanks @imjlk!
- [717eb42](https://github.com/imjlk/wp-typia/commit/717eb42f0cd57549b244c3593d531edad3481f05) Unify human-readable CLI diagnostics across create, add, migrate, and doctor. — Thanks @imjlk!
- [63657e2](https://github.com/imjlk/wp-typia/commit/63657e2182b5754aff7d40fc6218a247567c48a7) Own the generated block registration TypeScript surface in `@wp-typia/block-types`, and update scaffolds and reference examples to prefer the local registration facade over direct `@wordpress/blocks` type imports. — Thanks @imjlk!
- [86f0808](https://github.com/imjlk/wp-typia/commit/86f08083ccb0b6a6299c62404bb2d3cd5dc71572) Expose built-in external template layer composition through the canonical `wp-typia create` and `wp-typia add block` CLI flags, including explicit layer id selection for multi-layer packages. — Thanks @imjlk!
- [6643974](https://github.com/imjlk/wp-typia/commit/664397436a16292a1430e31d0f22969291033ef4) Move built-in TS and TSX emitter bodies into a dedicated template module with readable multi-line source, and derive block artifact metadata from a shared declarative attribute spec so scaffold definitions stay easier to review and extend without changing emitted output. — Thanks @imjlk!
- [188bbc7](https://github.com/imjlk/wp-typia/commit/188bbc771f881046613e72eed334bd24741359da) Add interactive external layer selection for built-in create and add-block CLI flows when a package exposes multiple public layer roots, while keeping non-interactive and programmatic calls explicit. — Thanks @imjlk!
- [6f20191](https://github.com/imjlk/wp-typia/commit/6f201910690e05b1237dcf8fdf6b2ebb93f98fed) Tighten scaffold/runtime helper generics so registration metadata, nested migration path helpers, and external template render views preserve more caller type information while removing raw scaffold metadata casts from generated and example block registration code. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.16.9

## 0.16.9 — 2026-04-13

### Patch changes

- [198021b](https://github.com/imjlk/wp-typia/commit/198021b27c78065c3c82ac3523e909eacd3f80d1) Add a public non-mutating block generator inspection contract around `BlockGeneratorService`. — Thanks @imjlk!
- [a620f1a](https://github.com/imjlk/wp-typia/commit/a620f1a1470ffd028b5e2efe81ae85a5d01411fe) Implement external template-layer composition manifests and `extends` resolution on top of the built-in shared scaffold model.
  
  Programmatic built-in scaffold flows can now accept an external layer package through `externalLayerSource` and optional `externalLayerId`, while preserving built-in emitter ownership and explicit protected-path conflict errors. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.16.8

## 0.16.8 — 2026-04-13

### Patch changes

- [a9e4a8d](https://github.com/imjlk/wp-typia/commit/a9e4a8dfb9c67fdb0b53e754dfa0bcb87794ca8a) Split the `cli-add` implementation into focused runtime modules and replace the
  readline prompt retry recursion with iterative control flow so repeated invalid
  input stays stable during long-running interactive CLI sessions. — Thanks @imjlk!
- [e58b434](https://github.com/imjlk/wp-typia/commit/e58b434bee5b5149aa3b1593f6884d06c38ed957) Refresh the repository formatting/toolchain baseline by adopting Prettier 3 in
  the root policy layer, making `format:check` a first-class CI gate, and aligning
  built-in scaffold package manifests on the same formatter version so generated
  projects no longer carry stale Prettier 2.x pins. — Thanks @imjlk!
- [6d4bee7](https://github.com/imjlk/wp-typia/commit/6d4bee76f55c1cab40d0d0b4f25a157e17aef7cb) Deduplicate the remaining shared manifest and migration contract types behind
  `@wp-typia/block-runtime/migration-types`, centralize the official workspace
  template package constant, and align built-in scaffold `Edit` emitters on the
  shared `BlockEditProps` typing convention. — Thanks @imjlk!
- Updated dependencies: api-client (npm)@0.4.4, project-tools (npm)@0.16.7

## 0.16.7 — 2026-04-12

### Patch changes

- Updated dependencies: api-client (npm)@0.4.3, project-tools (npm)@0.16.6

## 0.16.6 — 2026-04-12

### Patch changes

- [7b9a136](https://github.com/imjlk/wp-typia/commit/7b9a136394233b8f894ad4155b8d4ed4de636cc3) Make built-in scaffold styles and block-local render.php emitter-owned, remove the remaining built-in non-TS Mustache sources, and document the narrowed Mustache ownership split. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.16.5

## 0.16.5 — 2026-04-12

### Patch changes

- [1bcbaad](https://github.com/imjlk/wp-typia/commit/1bcbaadde08c1f9b38cf0fc0770dfd4c1c4a794f) Trim the default interactivity scaffold down to the runtime surface it actually uses by removing dead context fields, unbound actions, unused editor attributes like `uniqueId` and `autoPlayInterval`, and the unused `interactiveMode: "auto"` scaffold option. — Thanks @imjlk!
- [d963e91](https://github.com/imjlk/wp-typia/commit/d963e91309f8a0f07192508b67271cfb98fb232e) Add a Phase 1 typed block generation boundary to `@wp-typia/project-tools` via `BlockSpec` and `BlockGeneratorService`, while keeping built-in scaffold file bodies on their current Mustache rendering path. — Thanks @imjlk!
- [9d60ecf](https://github.com/imjlk/wp-typia/commit/9d60ecf03431b281fb804d48b753ab5b5641051f) Remove built-in scaffold `types.ts.mustache` and `block.json.mustache` files now that structural artifacts are emitter-owned, keep the generator contract documented as “template bodies from Mustache, structural files from emitters”, and add guard tests so built-in template trees cannot regress back to shipping stale structural Mustache sources. — Thanks @imjlk!
- [f31b84b](https://github.com/imjlk/wp-typia/commit/f31b84be3bb4eea2583a610e4c96039f62fa290e) Move built-in scaffold `types.ts` and `block.json` generation onto the typed Phase 2 emitter path behind `BlockGeneratorService`, reuse the same structural artifact model for starter manifests, and document the new ownership split where structural files are emitter-owned while the remaining built-in scaffold files still come from Mustache templates. — Thanks @imjlk!
- [4ed3170](https://github.com/imjlk/wp-typia/commit/4ed31709b87ecc0f3fb7bd1524d40700cac44c82) Make built-in scaffold TS/TSX bodies emitter-owned alongside structural files, remove stale built-in TS/TSX Mustache sources, and document the narrowed Mustache ownership split. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.16.4

## 0.16.4 — 2026-04-12

### Patch changes

- [93576a1](https://github.com/imjlk/wp-typia/commit/93576a118a3dfa355391eefea05b95e3337b153a) Fix generated interactivity scaffolds so their WordPress Interactivity context is typed through explicit `getContext<T>()` imports, and restore GitHub Pages publishing by deploying a real static docs site artifact from CI. — Thanks @imjlk!
- [5ff0a04](https://github.com/imjlk/wp-typia/commit/5ff0a04584f9433e89e4fc227523105980e3ac9e) Keep successful first-party TUI workflows open long enough to review their completion output in-buffer, with shared completion surfaces for `create`, `add`, and `migrate` before exit. — Thanks @imjlk!
- [9a9ca7c](https://github.com/imjlk/wp-typia/commit/9a9ca7cfc29dda649a7c63dcbc9d91034963d60e) Fix first-party TUI submit rendering so create/add/migrate replace stale form content with a shared submitting surface, and restore GitHub Pages deploys by pinning the documentation artifact upload action to a real `actions/upload-pages-artifact` release tag. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.16.3

## 0.16.3 — 2026-04-12

### Patch changes

- [e9901fa](https://github.com/imjlk/wp-typia/commit/e9901fa3c6b461b7b4c112cba20cc4e5e3654a99) Deduplicate schema-core behind the block-runtime implementation owner while keeping the project-tools import path stable, run project-tools regression tests on pull requests while keeping coverage uploads on main, and refresh workflow actions to reduce wall-clock time and remove Node 20 runtime warnings. — Thanks @imjlk!
- [18b51b2](https://github.com/imjlk/wp-typia/commit/18b51b2d450c36b7943cb83ac6f33682d645d7cf) Fix the published CLI create flow so it no longer eagerly loads project-tools runtime modules that drag in TypeScript during startup, and align the CLI React dependency range with Bunli's current React peer floor to avoid duplicate-React crashes in interactive `wp-typia create`. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.16.2

## 0.16.2 — 2026-04-11

### Patch changes

- [3dd1c99](https://github.com/imjlk/wp-typia/commit/3dd1c99df1aa69cd11563861adf9b75f5ec5be71) Fix generated interactivity scaffolds to emit valid `data-wp-class--is-active` directives for animation state toggling. — Thanks @imjlk!
- [548c95b](https://github.com/imjlk/wp-typia/commit/548c95b07b97b8e4264af94651c5d9dea9974c8b) Fix `wp-typia create --template workspace` to normalize the shorthand alias before npm template resolution. — Thanks @imjlk!
- [f3ad2ae](https://github.com/imjlk/wp-typia/commit/f3ad2ae8a94f5db626e080c9972e4749e03a1927) Align persistence and compound scaffold validator and inspector conventions, including generated storage-mode labels and compound add-child validator wiring. — Thanks @imjlk!
- [024bab0](https://github.com/imjlk/wp-typia/commit/024bab003d1e20a2248c08ffe772cf7875ae0acb) Fix persistence scaffold regressions in authenticated bootstrap typing and generated PHP storage-mode handling. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.16.1

## 0.16.1 — 2026-04-11

### Patch changes

- [7c8a2ef](https://github.com/imjlk/wp-typia/commit/7c8a2efac24f97abb92b9d20b73366c2a4bc6f17) Fixed alternate-buffer TUI lifecycle handling so interactive create/add/migrate flows exit cleanly on submit, cancel, quit, lazy-load failure, and runtime command failure. — Thanks @imjlk!

## 0.16.0 — 2026-04-10

### Minor changes

- [1470cc5](https://github.com/imjlk/wp-typia/commit/1470cc5ed02064e616292faa1e38765ce80b7da0) Add a unified `sync` entrypoint for generated projects and the `wp-typia sync`
  CLI, and make `sync-rest` fail fast when type-derived metadata artifacts are
  stale or missing. — Thanks @imjlk!

### Patch changes

- Updated dependencies: project-tools (npm)@0.16.0

## 0.15.5 — 2026-04-10

### Patch changes

- [c935242](https://github.com/imjlk/wp-typia/commit/c9352422b12ad7168425125c39932381a57e56dc) Avoid duplicating existing `typia` imports when `wp-typia add block --template compound`
  repairs legacy compound validator files inside older workspaces. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.15.4

## 0.15.4 — 2026-04-10

### Patch changes

- [4a02664](https://github.com/imjlk/wp-typia/commit/4a026642692b6b101d454bd14c70d0b5c28b900e) Fix generated-project Typia/Webpack compatibility by moving generic Typia
  factory calls out of the shared validator helper, adding a fail-fast supported
  toolchain guard around the Webpack integration, and covering the path with
  generated-project build smoke tests. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.15.3

## 0.15.3 — 2026-04-10

### Patch changes

- [d4ec944](https://github.com/imjlk/wp-typia/commit/d4ec94407e77933245dba1017f753b7eda5ed353) Add repository upgrade and security docs, GitHub issue/PR templates, and link
  the new meta guidance from the published `wp-typia` README. — Thanks @imjlk!

## 0.15.2 — 2026-04-09

### Patch changes

- [ab7d1c9](https://github.com/imjlk/wp-typia/commit/ab7d1c9afaf4039b5053991ca9fe88cabcd46a13) Publish shared API client utilities and runtime primitives from `@wp-typia/api-client`, reuse them across rest and runtime packages, and align active package Bun minimums with `1.3.11`. — Thanks @imjlk!
- Updated dependencies: api-client (npm)@0.4.2, project-tools (npm)@0.15.2

## 0.15.1 — 2026-04-09

### Patch changes

- [70137df](https://github.com/imjlk/wp-typia/commit/70137df4e131872e1d01b2d883e9fc890a42a673) Fix scaffold DX regressions by seeding persistence REST artifacts during create, restoring interactivity editor styles, exposing the official workspace template in `templates`, and making compound child scaffolds read live parent metadata. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.15.1

## 0.15.0 — 2026-04-09

### Minor changes

- [e4610ff](https://github.com/imjlk/wp-typia/commit/e4610ffe8201d47f2de6c03a41a89fb4c63fcebc) Add dedicated static-safe `/bootstrap` endpoints for persistence scaffolds and align generated runtime flow around fresh session-only write access hydration. — Thanks @imjlk!

### Patch changes

- Updated dependencies: project-tools (npm)@0.15.0

## 0.14.0 — 2026-04-09

### Minor changes

- [6c0af4a](https://github.com/imjlk/wp-typia/commit/6c0af4af622d18435ef4a03d3a1c4928d6c55db6) Add a generated `src/transport.ts` seam for persistence scaffolds so editor and frontend runtime calls can be redirected to contract-compatible proxies or BFFs without rewriting generated API glue. — Thanks @imjlk!

### Patch changes

- Updated dependencies: project-tools (npm)@0.14.0

## 0.13.4 — 2026-04-09

### Patch changes

- [fb2f09a](https://github.com/imjlk/wp-typia/commit/fb2f09ad62cf8c789f22111db110ea9dffef2504) Polish the basic scaffold and CLI regression surface by adding a static `render.php` placeholder to the basic template, avoiding duplicate wrapper CSS class segments when the namespace matches the slug, and locking `wp-typia --version` behavior with an explicit regression test. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.13.4

## 0.13.3 — 2026-04-09

### Patch changes

- Updated dependencies: project-tools (npm)@0.13.3

## 0.13.2 — 2026-04-09

### Patch changes

- Updated dependencies: project-tools (npm)@0.13.2

## 0.13.1 — 2026-04-09

### Patch changes

- Updated dependencies: project-tools (npm)@0.13.1

## 0.13.0 — 2026-04-08

### Minor changes

- [ebdb173](https://github.com/imjlk/wp-typia/commit/ebdb1739010f335b14d8be1ace016920193278a1) Add the first-class `wp-typia add hooked-block <block-slug> --anchor <anchor-block-name> --position <before|after|firstChild|lastChild>` workflow with `block.json` `blockHooks` patching, root doctor validation, generated-project smoke coverage, and updated CLI/workspace docs. — Thanks @imjlk!
- [1d12a52](https://github.com/imjlk/wp-typia/commit/1d12a52efc0f7215b130257cfe1f010a963cf232) Add the first-class `wp-typia add binding-source <name>` workspace workflow with
  inventory entries, shared PHP/editor bootstrap wiring, workspace doctor checks,
  and generated-project smoke coverage for binding-source builds. — Thanks @imjlk!

### Patch changes

- Updated dependencies: project-tools (npm)@0.13.0

## 0.12.0 — 2026-04-08

### Minor changes

- [d04adea](https://github.com/imjlk/wp-typia/commit/d04adeac260748549ccc33d51d59aa6db902b5cf) Promote `wp-typia` to the canonical CLI package, remove the published CLI/bin
  surface from `@wp-typia/create`, archive `create-wp-typia`, and update docs,
  generated migration pinning, and publish wiring to follow the new package
  identity. — Thanks @imjlk!
- [99bd9dc](https://github.com/imjlk/wp-typia/commit/99bd9dcb4f5a61fa8af8baf861e85bde5c8b8b2a) Polish workspace-aware diagnostics by extending root `wp-typia doctor` with
  workspace package metadata, block convention, generated artifact, and collection
  import checks, while keeping deep migration validation under
  `wp-typia migrate doctor --all` with explicit workspace target-alignment
  verification. — Thanks @imjlk!
- [efc4da6](https://github.com/imjlk/wp-typia/commit/efc4da6375383fa87f753296259d23e86bbfb6b5) Add explicit `wp-typia create` and `wp-typia add` command groups, ship the first official empty workspace template package, and enable `wp-typia add block` for built-in block families inside workspace projects. — Thanks @imjlk!
- [76351a1](https://github.com/imjlk/wp-typia/commit/76351a1c0cc9ea247473d080cf39723687078270) Add first-class workspace variation and pattern workflows, extend `wp-typia doctor`
  with lightweight workspace-aware diagnostics, and update the official workspace
  template to track `BLOCKS`, `VARIATIONS`, and `PATTERNS` through a single
  inventory. — Thanks @imjlk!

### Patch changes

- [9f38901](https://github.com/imjlk/wp-typia/commit/9f389017463f3b566e59095f45f8c9ddfdcd1067) Split project orchestration out of `@wp-typia/create` into the new
  `@wp-typia/project-tools` package, rewire `wp-typia` to consume the new
  programmatic surface, and retire `@wp-typia/create` to a deprecated legacy
  package shell. — Thanks @imjlk!
- Updated dependencies: project-tools (npm)@0.12.0

