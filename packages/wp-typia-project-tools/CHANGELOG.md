# @wp-typia/project-tools

## 0.24.5 — 2026-06-02

### Patch changes

- [ab140e2b](https://github.com/imjlk/wp-typia/commit/ab140e2bf6d394331f65a861937c55b3b9d096b6) Pin generated WordPress dependency ranges to React 18-compatible Gutenberg package lines so npm installs do not float to React 19-only releases unexpectedly. — Thanks @imjlk!
- [5b8f9ae6](https://github.com/imjlk/wp-typia/commit/5b8f9ae63ec8baab9b24f2b166343d401e400a26) Refactor internal project-tools runtime modules into focused domain folders while preserving the existing public facade import paths. — Thanks @imjlk!
- Updated dependencies: api-client (npm)@0.4.6, block-runtime (npm)@0.7.1, block-types (npm)@0.3.3, rest (npm)@0.3.14

## 0.24.4 — 2026-05-17

### Patch changes

- [89cd7ae1](https://github.com/imjlk/wp-typia/commit/89cd7ae11bf0b55c88b9beccbb3f881bcc49383a) Clarify positional core-variation target diagnostics while preserving flag-style block validation messages. — Thanks @imjlk!

## 0.24.3 — 2026-05-17

### Patch changes

- [27b24b58](https://github.com/imjlk/wp-typia/commit/27b24b582e2b8d9a4a5fa874dc65a7aba99bab93) Split create scaffold CLI orchestration into focused file, emission, output, and validation helpers. — Thanks @imjlk!

## 0.24.2 — 2026-05-17

### Patch changes

- [e8b28778](https://github.com/imjlk/wp-typia/commit/e8b28778a77d6d31070600d26b142a580879aad2) Tighten pattern scaffold flag normalization, validation, and docs. — Thanks @imjlk!
- Updated dependencies: block-types (npm)@0.3.2

## 0.24.1 — 2026-05-16

### Patch changes

- [b9e4cc55](https://github.com/imjlk/wp-typia/commit/b9e4cc5568286b52095c832cd891db592b14feea) Expose `--catalog-title` for pattern scaffolds so CLI-created catalog entries
  can set the same human-readable title metadata already supported by the runtime. — Thanks @imjlk!
- [b325c227](https://github.com/imjlk/wp-typia/commit/b325c2271feccce57f61051542318aaaafff264a) Support repeatable `--tag` and `--tags` flags for pattern scaffolds while
  preserving existing comma-separated tag input and normalized manifest output. — Thanks @imjlk!
- [f364d965](https://github.com/imjlk/wp-typia/commit/f364d9655a9586e5294ac9ae4042b6c6c1f513ae) Route remaining runtime package-version and template-cache marker JSON parsing
  through shared JSON utilities while preserving cache fallback behavior. — Thanks @imjlk!
- [679f2dfe](https://github.com/imjlk/wp-typia/commit/679f2dfeda4f2dec0199a46e7bc288f430d58c7b) Reuse the shared REST nonce helper source emitter in generated AI feature API
  sources so REST and AI nonce resolution behavior cannot drift. — Thanks @imjlk!
- [b9661f80](https://github.com/imjlk/wp-typia/commit/b9661f80f4951840f3e5bc18a10e8302df306510) Split pattern catalog section-role marker extraction and content validation into
  a focused runtime module while keeping the public pattern catalog API stable. — Thanks @imjlk!
- [4c4fa603](https://github.com/imjlk/wp-typia/commit/4c4fa60326ad8f128b6e52e028e60aff22af592c) Warn when `wp-typia add core-variation` targets an unknown `core/*` block while
  preserving third-party namespaces and future core-block compatibility. — Thanks @imjlk!
- Updated dependencies: block-types (npm)@0.3.1

## 0.24.0 — 2026-05-15

### Minor changes

- [beff17c5](https://github.com/imjlk/wp-typia/commit/beff17c5276280958daad45133a5e8e4b4057c8c) Validate pattern catalog section role markers against serialized pattern
  content, including configurable wrapper conventions, missing or mismatched
  section-scoped markers, unknown roles, and optional duplicate-role warnings for
  full patterns. — Thanks @imjlk!
- [f2c7b166](https://github.com/imjlk/wp-typia/commit/f2c7b1661d0ef4a8ce63641e194e95dfe319e077) Add `wp-typia add core-variation` for editor-side variation scaffolds targeting
  existing core or third-party blocks without generating custom block manifests or
  Typia artifacts. — Thanks @imjlk!
- [f585cbf4](https://github.com/imjlk/wp-typia/commit/f585cbf471450210faa420ccba5656bbbf6363d6) Add typed block nesting contracts that drive `block.json` `parent`, `ancestor`, and `allowedBlocks` metadata during sync, including unknown-reference diagnostics for generated workspaces. — Thanks @imjlk!
- [4567d5ba](https://github.com/imjlk/wp-typia/commit/4567d5ba68b27433d7792311ccb6dfa7cb657633) Add post-meta-backed binding-source scaffolds that read typed post-meta schemas, emit PHP/editor preview resolvers, validate top-level meta paths, and expose the new `--from-post-meta`/`--post-meta` CLI options. — Thanks @imjlk!
- [43b47672](https://github.com/imjlk/wp-typia/commit/43b476720172b572a36f4b15611ad9d57f260a18) Validate configured pattern files against typed block nesting contracts during
  sync, reporting relationship violations with pattern file and block path
  diagnostics while keeping unknown or unparseable pattern content as warnings. — Thanks @imjlk!
- [c0a34be4](https://github.com/imjlk/wp-typia/commit/c0a34be4ed0418dedd5c0e3302bc4989c9c31e3a) Add typed pattern catalog metadata for workspace pattern scaffolds, including
  section-scoped pattern entries, catalog validation for duplicate slugs and
  missing content files, and CLI flags for scope, section role, tags, and
  thumbnail metadata. — Thanks @imjlk!
- [948c750d](https://github.com/imjlk/wp-typia/commit/948c750de7e298be94e29cd1eca5390623235e98) Generate typed `InnerBlocks` template constants from block nesting contracts and
  validate template tuples against declared `allowedBlocks`, `parent`, and
  `ancestor` relationships during sync. — Thanks @imjlk!

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
- [fe793744](https://github.com/imjlk/wp-typia/commit/fe793744e01c4251b229ba19dd24662cb8317b3d) Add a shared WordPress block API compatibility matrix for Supports, Variations, and Bindings, plus project config fields for minimum WordPress version and strict compatibility diagnostics. — Thanks @imjlk!
- [76557c0f](https://github.com/imjlk/wp-typia/commit/76557c0fcb99626b3fb581321126ba85e7886735) Split the generated REST schema helper PHP template emitter from REST resource PHP template generation while preserving compatibility exports. — Thanks @imjlk!
- [56d1eae0](https://github.com/imjlk/wp-typia/commit/56d1eae07d0edc5f187e600ab0d6298500552478) Split workspace asset add workflows into focused pattern, binding-source, and editor-plugin runtime modules. — Thanks @imjlk!
- [d443fffd](https://github.com/imjlk/wp-typia/commit/d443fffda3ffac3bf1b77c121928d9c2dab08edf) Split pattern workspace add helpers into focused runtime modules without changing generated output. — Thanks @imjlk!
- [afe3e49a](https://github.com/imjlk/wp-typia/commit/afe3e49ae7f2581fbc94263eec52232a959e31b4) Split integration environment workspace add helpers into focused runtime modules without changing generated output. — Thanks @imjlk!
- [40aa1ec4](https://github.com/imjlk/wp-typia/commit/40aa1ec457af1f3c68eece155472259d37e36675) Split REST workspace bootstrap anchor patching from sync-rest script patching while preserving compatibility exports. — Thanks @imjlk!
- [fa79c9d4](https://github.com/imjlk/wp-typia/commit/fa79c9d40e41c86d381facecac20b1cf973900c5) Split ability workspace scaffold anchor and registry helpers into focused runtime modules without changing generated output. — Thanks @imjlk!
- [b9b3faae](https://github.com/imjlk/wp-typia/commit/b9b3faae19ba329a79cf613e7650512d1f14838d) Split editor-plugin workspace runtime source emitters and bootstrap/registry anchors into focused helper modules. — Thanks @imjlk!
- [a057cd7c](https://github.com/imjlk/wp-typia/commit/a057cd7c5a5018a44ac4414d3ee2aad36830a039) Split generated REST resource PHP routing and controller template helpers from
  the main REST resource PHP template entrypoint while preserving generated
  output compatibility. — Thanks @imjlk!
- [5363a883](https://github.com/imjlk/wp-typia/commit/5363a8836ee5fab78475af208104b31450a827ae) Share the generated REST nonce helper source across manual contract and REST resource emitters while preserving scaffolded API output. — Thanks Junglei Kim!
- [eb2c073f](https://github.com/imjlk/wp-typia/commit/eb2c073fe1a4b6032e54b458409db85efebc18d6) Split REST workspace source emitters into generated-resource and manual-contract modules while keeping the compatibility facade stable. — Thanks Junglei Kim!
- [64367bb9](https://github.com/imjlk/wp-typia/commit/64367bb9d2f4bfd40ae79eae3311337c8b8f28b3) Align default doctor output rendering with the shared line-printer convention. — Thanks Junglei Kim!
- [adaefd50](https://github.com/imjlk/wp-typia/commit/adaefd50a29c8f6786a9750a76ad416585030eda) Split built-in block non-TypeScript artifact templates into focused family modules. — Thanks Junglei Kim!
- [a4e61656](https://github.com/imjlk/wp-typia/commit/a4e61656d39974aec1c7305ee2eae2d1c4c479ce) Centralize the generated `@wordpress/env` dependency fallback range through the shared package version module. — Thanks Junglei Kim!
- [9f8f6c9c](https://github.com/imjlk/wp-typia/commit/9f8f6c9c094a8882aa1d63dcd763117a061d6019) Normalize manual REST `secretPreserveOnEmpty` CLI values before invoking project-tools runtime APIs. — Thanks Junglei Kim!
- Updated dependencies: block-runtime (npm)@0.7.0, block-types (npm)@0.3.0

## 0.23.1 — 2026-05-13

### Patch changes

- [57306069](https://github.com/imjlk/wp-typia/commit/5730606918c4f79483e2cad5034d7077a75464da) Route interactive prompt rendering and validation feedback through injectable line printers so tests and callers can capture output without monkeypatching global console methods. — Thanks @imjlk!
- [2767962d](https://github.com/imjlk/wp-typia/commit/2767962d2831f3d124a71b0d65fb994d15cfca05) Split workspace block and feature doctor checks into focused category modules while preserving doctor output order. — Thanks @imjlk!
- [8374ec1a](https://github.com/imjlk/wp-typia/commit/8374ec1adc458943c5433ec79de4d24147234cfa) Split workspace inventory parser descriptors, entry parsing, and validation helpers into focused runtime modules. — Thanks @imjlk!
- [e0d8082f](https://github.com/imjlk/wp-typia/commit/e0d8082f86566b1a8e2c25a145ec666e1a44862e) Add path-aware safe JSON parse/read helpers for project-tools runtime JSON file readers. — Thanks @imjlk!
- [c12a3597](https://github.com/imjlk/wp-typia/commit/c12a3597f6458f6545a180fde49aac28e5e3e559) Add shared workspace PHP helpers for loading, WordPress-sanitizing, and validating generated REST schemas from packaged or source schema files. — Thanks @imjlk!
- [171982fa](https://github.com/imjlk/wp-typia/commit/171982fa5828e07d830917e7f5388a6ed8cd23e6) Add local `wp-typia` CLI scripts to official workspace scaffolds and document package-manager-specific `doctor`, `sync`, and `add` commands for generated and existing workspaces. — Thanks @imjlk!
- [fa781368](https://github.com/imjlk/wp-typia/commit/fa78136887cebe293e1ef6c2e33f313856794ef4) Add `wp-typia doctor --workspace-only` with JSON exit-policy summaries so CI can treat environment/runtime failures as advisory while preserving strict doctor behavior by default. — Thanks @imjlk!
- [9883a187](https://github.com/imjlk/wp-typia/commit/9883a187c19f2b7b5cca7101dcf0e2c996e4e3ce) Support provider-style manual REST route contracts with route-pattern aliases,
  declared controller/permission owner metadata, and path parameter starter query
  types. — Thanks @imjlk!
- [7addacae](https://github.com/imjlk/wp-typia/commit/7addacae6f2789caaa2f1ecb164ff96cb8291fe2) Document why process-exit temp-root cleanup intentionally ignores removal failures. — Thanks @imjlk!
- [8937cfd4](https://github.com/imjlk/wp-typia/commit/8937cfd489f5f904c0271d484e45d4351ef1f59a) Split workspace REST resource scaffolding into focused generated-mode, manual-mode, PHP template, and shared type modules while preserving existing add rest-resource behavior. — Thanks @imjlk!
- [c8734da3](https://github.com/imjlk/wp-typia/commit/c8734da33cfd6b2694c7d80d1892681cca38736a) Package generated REST JSON schemas into `inc/rest-schemas` for workspace release zips and add release-check scripts that fail when packaged runtime schemas are missing or stale. — Thanks @imjlk!
- [f54b7db5](https://github.com/imjlk/wp-typia/commit/f54b7db54560ff6f4eba1b1ad9235efa1c178dcb) Document the diagnostic fallback classifier as a compatibility shim for message-based runtime validation errors. — Thanks @imjlk!
- [6d0ec1e1](https://github.com/imjlk/wp-typia/commit/6d0ec1e19f85b8629540341325391ef12e5ff9f9) Add first-class preserve-on-empty metadata for manual settings secrets, including
  Typia tags, OpenAPI schema extensions, CLI aliases, generated admin settings
  form behavior, and documentation. — Thanks @imjlk!
- [621a0257](https://github.com/imjlk/wp-typia/commit/621a0257801085f7d93e57bd46bba14ac44694e0) Split admin-view template emitters into focused default, REST, core-data, settings, and shared modules while keeping the existing public template import path compatible. — Thanks @imjlk!
- [e946efaf](https://github.com/imjlk/wp-typia/commit/e946efaff8af434a18b7663d51c6b8ccc00db1da) Add a `plugin-qa` workspace create profile plus `add integration-env --release-zip` scripts for wp-env smoke checks and plugin zip packaging. — Thanks @imjlk!
- Updated dependencies: block-runtime (npm)@0.6.1

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

- [7bc6301e](https://github.com/imjlk/wp-typia/commit/7bc6301e304f4510ff81411bf16d8221866eb476) Rename the template renderer's synchronous path existence helper to `pathExistsSync` to avoid confusion with the canonical async helper. — Thanks @imjlk!
- [683a1317](https://github.com/imjlk/wp-typia/commit/683a131786bc9105081b9bc89e2365afec0efd8c) Route the generated init sync helper through a shared file-not-found error helper instead of an inline ENOENT code check. — Thanks @imjlk!
- [39e95cf0](https://github.com/imjlk/wp-typia/commit/39e95cf0d7a21f705b8fafb02c3686e9decac56c) Route environment doctor checks through the shared doctor check helper to keep diagnostic row metadata consistent. — Thanks @imjlk!
- [9ad7db20](https://github.com/imjlk/wp-typia/commit/9ad7db20521d3e9de0c9272d66be8f16a4548be5) Document async replacements and no-removal-scheduled guidance for deprecated synchronous inventory and template-source helpers. — Thanks @imjlk!
- [c8c93068](https://github.com/imjlk/wp-typia/commit/c8c93068cbf17f19cc0a33563d3595c4f59fc00a) Split external template cache marker parsing and serialization into a focused runtime helper module. — Thanks @imjlk!
- [3d1a3b63](https://github.com/imjlk/wp-typia/commit/3d1a3b6336e31d2412d2ec69eb3f9e937fc949fe) Move package-level workspace doctor filesystem probes behind an async snapshot while documenting the remaining synchronous doctor categories. — Thanks @imjlk!
- Updated dependencies: block-runtime (npm)@0.6.0

## 0.22.10 — 2026-05-10

### Patch changes

- [f4d5058](https://github.com/imjlk/wp-typia/commit/f4d5058f996b4bbf350ff7e1d490d46a1c46f3bd) Add WordPress direct-access guards to generated PHP validator and migration registry artifacts. — Thanks @imjlk!
- [50f8aa0](https://github.com/imjlk/wp-typia/commit/50f8aa0087d27a515ef3c796276976507387f696) Expand add-block template typo suggestions so near-miss ids like `interactiv` point users to the intended built-in template. — Thanks @imjlk!
- [9bb82db](https://github.com/imjlk/wp-typia/commit/9bb82db50f6b069029130e997f7777c476770eb8) Clarify doctor async/sync boundaries while moving workspace doctor inventory reads onto the async inventory API. — Thanks @imjlk!
- [df92774](https://github.com/imjlk/wp-typia/commit/df92774cdc59b3b17d307d5b485b0779a528bb84) Split workspace inventory types, templates, parser, read helpers, and mutation helpers into focused runtime modules while preserving the public barrel. — Thanks @imjlk!
- [88a9fea](https://github.com/imjlk/wp-typia/commit/88a9feac128434dfdc2bb514e2a3a17b517aeab2) Consolidate optional file reads and Node error-code handling through shared runtime filesystem helpers. — Thanks @imjlk!
- Updated dependencies: block-runtime (npm)@0.5.1

## 0.22.9 — 2026-05-08

### Patch changes

- [3c8fbb6](https://github.com/imjlk/wp-typia/commit/3c8fbb64f27579e82e384ed9e621d52580a9a4a0) Add async workspace block select option APIs and use them from interactive add flows. — Thanks @imjlk!
- [2b61ed5](https://github.com/imjlk/wp-typia/commit/2b61ed5ed01250ca4ce1ee2ac364a1d882d72510) Share close-id template suggestions across create and add-block validation paths. — Thanks @imjlk!
- [a027b9f](https://github.com/imjlk/wp-typia/commit/a027b9f556e4d48213bc306cf9ad877f41820224) Remove synchronous filesystem probes from async template-source and scaffold paths. — Thanks @imjlk!
- [fadd8ec](https://github.com/imjlk/wp-typia/commit/fadd8ecee5bbe7a09af34f2226f794b11a5640d5) Validate descriptor-parsed workspace inventory entries before returning typed results. — Thanks @imjlk!

## 0.22.8 — 2026-05-06

### Patch changes

- [0a1c9e1](https://github.com/imjlk/wp-typia/commit/0a1c9e1efd8412e1eb3cd081c8b088bf01f25e94) Use typed scaffold variable groups for boolean scaffold decisions and assert generated identifier safety at built-in template render boundaries. — Thanks @imjlk!
- [b518f20](https://github.com/imjlk/wp-typia/commit/b518f205d271f68cee14075c7a6b06cc26e17548) Use crypto-backed randomness for external template cache staging directory names. — Thanks @imjlk!
- [1131748](https://github.com/imjlk/wp-typia/commit/1131748865c7a9632ff89ffcbeb0058bf46782cb) Keep double-quoted PHP interpolation blocks in string scan mode. — Thanks @imjlk!
- [2a0f819](https://github.com/imjlk/wp-typia/commit/2a0f819d565d9c66088e0f6a081f37384384fd98) Read workspace inventory asynchronously in add workflow hot paths. — Thanks @imjlk!
- [ca8c31f](https://github.com/imjlk/wp-typia/commit/ca8c31f3e998da8d4a919dc1c4a7464ddfbcb45b) Tag scaffold identifier and MCP schema validation failures with stable CLI diagnostic codes. — Thanks @imjlk!
- [369fb19](https://github.com/imjlk/wp-typia/commit/369fb1914c3162209d19077b3eb88cee2141397c) Split external template cache policy helpers into a focused runtime module. — Thanks @imjlk!
- [adf8ddb](https://github.com/imjlk/wp-typia/commit/adf8ddb9ae5fd430478ced0e1bcf7fcb5b8626b2) Consolidate runtime filesystem, property-name, and block target helpers. — Thanks @imjlk!
- [3e5c11c](https://github.com/imjlk/wp-typia/commit/3e5c11c31e57ce7c3a64fbc9111a73754af20af1) Read package manifest cache metadata and contents through one file descriptor. — Thanks @imjlk!
- [5c793a8](https://github.com/imjlk/wp-typia/commit/5c793a8c8ce05d8cc69066d906eb346141d198c0) Validate explicit create template ids before entering the full scaffold flow. — Thanks @imjlk!
- [e0dcddd](https://github.com/imjlk/wp-typia/commit/e0dcdddbbcd77504e2730eeea86741f81d3a0a64) Improve WordPress acronym slug normalization for selected lowercase slug suffixes. — Thanks @imjlk!

## 0.22.7 — 2026-05-05

### Patch changes

- [b4991e6](https://github.com/imjlk/wp-typia/commit/b4991e66701565e8ec7d3f155ec93597d6298010) Keep the managed @wp-typia/dataviews fallback range aligned with the released package version. — Thanks @imjlk!
- [98f9df7](https://github.com/imjlk/wp-typia/commit/98f9df7a32564e2e9efcdf487d032fe39256b3de) Reduce synchronous filesystem probes in async add workspace and block JSON helpers. — Thanks @imjlk!
- [c3e7614](https://github.com/imjlk/wp-typia/commit/c3e7614022a3bca38158a1abaa1a4d506ceaea08) Split retrofit init plan presentation helpers out of the main planning module. — Thanks @imjlk!
- [94d388b](https://github.com/imjlk/wp-typia/commit/94d388bfd4793729af4c262e96ddf222612215ac) Share PHP scanner state transitions between function range and call helpers. — Thanks @imjlk!

## 0.22.6 — 2026-05-04

### Patch changes

- [39ccb03](https://github.com/imjlk/wp-typia/commit/39ccb038e7614e3fbeb797f379a17f25ac5daa32) Split retrofit init planning, package mutations, apply orchestration, and helper script templates into focused runtime modules without changing init behavior. — Thanks @imjlk!
- [ea8c59e](https://github.com/imjlk/wp-typia/commit/ea8c59eceb6058d145422eaf9f841f8d978b2af8) Surface malformed scaffold compatibility version floors instead of silently falling back, including CLI warnings for repaired plugin headers. — Thanks @imjlk!
- [75d4947](https://github.com/imjlk/wp-typia/commit/75d494760caff76a0b661a183f5a1427265bf2b2) Ignore PHP string and heredoc braces when repairing generated workspace bootstrap functions. — Thanks @imjlk!
- [102e43d](https://github.com/imjlk/wp-typia/commit/102e43d5eb4914737efd2a7c95fdccc7dd3527c6) Use `npm install --no-audit` for first-run scaffold installs and document npm audit/peer-warning guidance for generated projects. — Thanks @imjlk!
- [a50975e](https://github.com/imjlk/wp-typia/commit/a50975e07be2658ccd66248fb2983aa4d9782fc3) Keep acronym runs together when deriving kebab-case generated identifiers. — Thanks @imjlk!
- [acdb0c4](https://github.com/imjlk/wp-typia/commit/acdb0c4c85174266afda454c844993da5c1d6cb1) Throttle external template cache pruning with a last-pruned marker while preserving TTL correctness for reused entries. — Thanks @imjlk!
- [a5f62b0](https://github.com/imjlk/wp-typia/commit/a5f62b03a5d1bf09c817fd119dd8da9903292c7a) Refactor workspace add collision preflights around descriptor-backed filesystem and inventory targets. — Thanks @imjlk!
- [74d77c4](https://github.com/imjlk/wp-typia/commit/74d77c4484d9ecb2a888b2d23839d87ecba1e937) Reduce synchronous filesystem probes in async scaffold, add-block, and remote template normalization paths. — Thanks @imjlk!
- [a7d744e](https://github.com/imjlk/wp-typia/commit/a7d744e98d988096a356d38092bddf23d3eb4838) Single-source add kind ids through project-tools metadata so CLI routing and runtime add helpers cannot drift. — Thanks @imjlk!
- [46f77c4](https://github.com/imjlk/wp-typia/commit/46f77c40c4cfed6b02b934af8566c60269eca1bf) Share workspace doctor bootstrap path resolution across scoped and unscoped package checks. — Thanks @imjlk!
- [dd4d6cc](https://github.com/imjlk/wp-typia/commit/dd4d6cc4e119feffe8653f0505d5a37fc51ed4ec) Route workspace inventory mutation appends through section descriptors while preserving the generated inventory format. — Thanks @imjlk!
- [47352a6](https://github.com/imjlk/wp-typia/commit/47352a6ad026e1a6dd77f364442f9f48b0eff755) Enable public npm admin-view scaffolds now that @wp-typia/dataviews is published. — Thanks @imjlk!
- [9b12c5e](https://github.com/imjlk/wp-typia/commit/9b12c5e5372aa1fb86e8ba1bcfba043a5030b9cf) Clarify that typia.llm OpenAPI constraint restoration mutates its cloned target schema while preserving public artifact inputs. — Thanks @imjlk!

## 0.22.5 — 2026-05-02

### Patch changes

- [530b3aa](https://github.com/imjlk/wp-typia/commit/530b3aa7ccbaff8db30a8a50274cda11decd0e7c) Add deterministic external template cache TTL pruning coverage. — Thanks @imjlk!
- [474164b](https://github.com/imjlk/wp-typia/commit/474164b34f5d5074d199ccdf22fefe4c964e2650) Generalize workspace inventory parsing and validation around shared section metadata. — Thanks @imjlk!
- [af1a74a](https://github.com/imjlk/wp-typia/commit/af1a74a03a9af2307288519d329d82edc7a69a28) Add focused unit coverage for split add helper modules. — Thanks @imjlk!
- [8dc97c4](https://github.com/imjlk/wp-typia/commit/8dc97c45bacb7849d0ed7b55128fab5f1c5ccb5a) Route workspace add PHP bootstrap patching through shared snippet mutation helpers. — Thanks @imjlk!

## 0.22.4 — 2026-05-02

### Patch changes

- [b060948](https://github.com/imjlk/wp-typia/commit/b060948527c05aa3f154f9fbe8e81122e4365fd0) Add opt-in TTL pruning for external template cache entries and document the cleanup controls. — Thanks @imjlk!
- [0341072](https://github.com/imjlk/wp-typia/commit/03410725096cb1023849b8a4b0db659ce63d0bc8) Document and test that generated server-only AI feature PHP avoids WordPress
  script-module enqueue APIs, keeping older WordPress sites from loading an
  unguarded script-module call. Keep the CLI package in the same release lane as
  its exact `@wp-typia/project-tools` dependency. — Thanks @imjlk!
- [b7bf00b](https://github.com/imjlk/wp-typia/commit/b7bf00b291ee9826541b66b5956275668a427d83) Validate typia.llm artifact schema objects before applying OpenAPI-backed constraint restoration. — Thanks @imjlk!
- [c04dcc7](https://github.com/imjlk/wp-typia/commit/c04dcc71d3ac825a47d10fce7065976958110a7f) Centralize CLI package-manager inference so completion guidance and sync flows
  share support for packageManager fields, Bun/pnpm/Yarn/npm lockfiles, Yarn PnP
  markers, npm shrinkwrap files, and npm fallback behavior. — Thanks @imjlk!
- [e052c02](https://github.com/imjlk/wp-typia/commit/e052c0242be10df83cb4531c68f8c65aaf2b12a5) Split shared add runtime helpers into focused type, validation, filesystem,
  collision, block JSON, and help modules while keeping the compatibility barrel.
  Also deduplicate the CLI line-printer type used by add and runtime bridge flows. — Thanks @imjlk!
- [fd911f3](https://github.com/imjlk/wp-typia/commit/fd911f3cb93814b8c3ac5a3238ef4ebd713fc469) Drive workspace inventory section creation from shared descriptors so adding
  new generated inventory sections no longer requires duplicating interface and
  constant insertion checks. — Thanks @imjlk!
- [253a9b8](https://github.com/imjlk/wp-typia/commit/253a9b87514a35165aa11ed5e7f7c6dce345cf33) Centralize workspace add mutation snapshot and rollback orchestration so
  ability, AI feature, and admin view scaffolds share the same mutation executor
  and PHP snippet insertion helpers. — Thanks @imjlk!
- [bb23621](https://github.com/imjlk/wp-typia/commit/bb23621265f012b6ed575a6a5d3c4c9d363c0720) Validate `wp-typia add block --template` ids through the shared add-block template runtime guard before preparing execution. — Thanks @imjlk!
- [a3403dd](https://github.com/imjlk/wp-typia/commit/a3403ddf9946f0d5f9237693426976009b03b046) Extract shared TypeScript source masking utilities so add and doctor runtime
  checks use the same comment, literal, and executable-pattern detection logic. — Thanks @imjlk!
- Updated dependencies: rest (npm)@0.3.13

## 0.22.3 — 2026-05-01

### Patch changes

- [feb835a](https://github.com/imjlk/wp-typia/commit/feb835a4532ce110d99303203b6f702db3a42a54) Consolidate residual add-command helper duplication by sharing strict versus
  loose CLI string flag readers, external-layer prompt hints, and scaffold
  collision checks while preserving existing diagnostics and add workflow
  behavior. — Thanks @imjlk!
- [73af96c](https://github.com/imjlk/wp-typia/commit/73af96cb78b9229789e49648832f4d904f915785) Refactor the workspace doctor into focused package, block, binding, and feature modules while preserving the existing `wp-typia doctor` output and adding direct coverage for the extracted binding diagnostics. — Thanks @imjlk!
- [61e4d76](https://github.com/imjlk/wp-typia/commit/61e4d762fd1d882b2ef26c9655d43b2865e535de) Modularize the workspace `add ability` and `add ai-feature` scaffolds into
  thin entry points plus focused template and workspace-mutation helpers while
  keeping representative generated output and integration behavior stable. — Thanks @imjlk!

## 0.22.2 — 2026-05-01

### Patch changes

- [f77d10f](https://github.com/imjlk/wp-typia/commit/f77d10f443493724f116a6db9f6bfc51e052671f) Expose generated AI feature support metadata to client and editor helpers, including compatibility feature ids, runtime gates, support-hint exports, and unavailable-error helpers for graceful UI degradation. — Thanks @imjlk!
- [31be7b9](https://github.com/imjlk/wp-typia/commit/31be7b9aac44bd8f39bff85bd5d45b40f133b083) Added WordPress-native customization seams to scaffolded `add ai-feature` PHP so plugin authors can override capability checks, prompt payload/text, prompt options, unavailable messages, and schema-compatible telemetry without editing generated files. — Thanks @imjlk!
- [9ae7955](https://github.com/imjlk/wp-typia/commit/9ae79554b180c1c7cc82ba8f981097b406807c1e) Promoted reusable OpenAPI-backed constraint restoration for `typia.llm` adapter artifacts into `@wp-typia/project-tools`, including mixed body/query input coverage and regression tests that keep the example adapter path aligned with the supported helper surface. — Thanks @imjlk!

## 0.22.1 — 2026-04-30

### Patch changes

- [d331ad4](https://github.com/imjlk/wp-typia/commit/d331ad48e1d0f5f96c649390a87b18c248612377) Harden the interactivity block scaffold by replacing loose `Function` typings
  with safer callable signatures, and add regression coverage for workspace
  interactivity helpers plus add-kind execution-plan compatibility. — Thanks @imjlk!

## 0.22.0 — 2026-04-30

### Minor changes

- [51ffdd4](https://github.com/imjlk/wp-typia/commit/51ffdd42d3e722fa2454e32f873b60409e007f2e) Generate typed Interactivity API helper scaffolds for action, callback, state,
  context, and negate directive paths, and wire the interactivity template to
  share those helpers across edit, save, and runtime store files. — Thanks @imjlk!

### Patch changes

- [5a3fe52](https://github.com/imjlk/wp-typia/commit/5a3fe52e6074932ffd15c3d978d67d606b39d955) Add opt-in core-data admin-view sources for post types and taxonomies, including
  CLI validation, generated screen/data scaffolds, and conditional WordPress data
  package wiring. — Thanks @imjlk!
- [99db45f](https://github.com/imjlk/wp-typia/commit/99db45fa5b5b15803d1e4c9dccfda2197e1804a0) Centralize runtime version-floor parsing and comparison helpers shared by
  scaffold compatibility and AI feature capability planning, and add edge-case
  coverage for empty, duplicate, and mixed AI capability selections. — Thanks @imjlk!
- [3cf71b3](https://github.com/imjlk/wp-typia/commit/3cf71b3a24c1b49f483e183ac0e096da69f266cd) Gate `wp-typia add admin-view` in public installs until
  `@wp-typia/dataviews` is published to npm, while preserving an internal test
  override for monorepo validation. — Thanks @imjlk!
- [37bb7d4](https://github.com/imjlk/wp-typia/commit/37bb7d42da5b42e3ebc554a33d7d9857726adeaf) Ensure interactive external layer selection cleans up resolved layer seeds only
  once when selection or layer discovery fails. — Thanks @imjlk!
- [54632a0](https://github.com/imjlk/wp-typia/commit/54632a06e24a33e81efaf87acd655fe994cafb94) Centralize managed WordPress dependency fallback ranges for ability and
  admin-view scaffolds in `package-versions.ts` so add-command defaults do not
  drift across runtime modules. — Thanks @imjlk!
- Updated dependencies: rest (npm)@0.3.12

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

- [869efe1](https://github.com/imjlk/wp-typia/commit/869efe15799ef28ed4f7d669e7fbf23738937d66) Cache guarded remote external template sources across repeated scaffold runs and document the cache bypass/directory environment overrides. — Thanks @imjlk!
- [d8f7756](https://github.com/imjlk/wp-typia/commit/d8f77564ed297609db783d7c21c42fa175da82ae) Made editor-plugin scaffolding slot-aware with canonical `sidebar` and `document-setting-panel` surfaces, while preserving `PluginSidebar` as a legacy alias. — Thanks @imjlk!
- [fab19de](https://github.com/imjlk/wp-typia/commit/fab19dee0a47c70afa749831dfc382490b6f1deb) Honor `NO_COLOR` as an ASCII-safe CLI output marker signal while documenting `WP_TYPIA_ASCII` precedence. — Thanks @imjlk!
- [c832b13](https://github.com/imjlk/wp-typia/commit/c832b13b9a6dce4e06f2f5dddeebe06d0ed82412) Tagged high-frequency CLI validation failures with explicit diagnostic codes so structured JSON errors rely less on message regex inference. — Thanks @imjlk!
- [7e63d89](https://github.com/imjlk/wp-typia/commit/7e63d898c5c167d453b265cd63d8f2bcb19da1e1) Consolidated generated workspace PHP/string helpers and package metadata types behind shared runtime utilities. — Thanks @imjlk!
- [48c778d](https://github.com/imjlk/wp-typia/commit/48c778d0b7cbc593b835f2421b63a7c7ea32fc21) Documented package version cache invalidation and exposed `clearPackageVersionsCache()` for long-lived linked integrations. — Thanks @imjlk!
- [d0a0f0c](https://github.com/imjlk/wp-typia/commit/d0a0f0c609122099194b7fef120d444dbbf8e7a1) Document the supported CLI diagnostic code contract, export recovery metadata
  for machine-readable integrations, and tighten representative structured failure
  coverage across create, add, sync, init, and doctor flows. — Thanks @imjlk!
- [b7d7fc1](https://github.com/imjlk/wp-typia/commit/b7d7fc17cf633c1678381a6ed408e42c3ec408de) Added an opt-in DataViews admin view scaffold with REST resource source wiring and CLI metadata. — Thanks @imjlk!

## 0.20.2 — 2026-04-26

### Patch changes

- [4fe96e4](https://github.com/imjlk/wp-typia/commit/4fe96e440da1bde7772d382b667834c53f2a657c) Fixed invalid create/add template ids to return user-facing unknown-template diagnostics instead of leaking internal prompt callback errors. — Thanks @imjlk!

## 0.20.1 — 2026-04-25

### Patch changes

- [7d1416b](https://github.com/imjlk/wp-typia/commit/7d1416b506c490f1c8775e6f8d985ae69846fd3c) Fixed generated AI ability scaffold clients to use WordPress script modules and supported combined query/body inputs in the opt-in typia.llm adapter. — Thanks @imjlk!

## 0.20.0 — 2026-04-24

### Minor changes

- [8776df7](https://github.com/imjlk/wp-typia/commit/8776df7269b1f363afcde1040d10a2c5b716b4ec) Added explicit AI scaffold compatibility policy wiring for generated plugin headers, runtime gates, workspace inventory metadata, and docs. — Thanks @imjlk!
- [eb4d44f](https://github.com/imjlk/wp-typia/commit/eb4d44ff6e7d10233d18c95e0f5816e9c9bcaa88) Added the opt-in `@wp-typia/project-tools/typia-llm` build-time adapter emitter for downstream `typia.llm` artifacts. — Thanks @imjlk!

## 0.19.3 — 2026-04-23

### Patch changes

- [fbf4476](https://github.com/imjlk/wp-typia/commit/fbf4476011ebd95b21ca29af0cf964adc26da611) Added: retrofit init planning and external template safety guards — Thanks @imjlk!

## 0.19.2 — 2026-04-23

### Patch changes

- [f215f32](https://github.com/imjlk/wp-typia/commit/f215f3266fb781178cd0203bb380b6669de8550e) Split workspace REST resource scaffolding into focused source-emitter and anchor-repair helpers while preserving the public add command surface. — Thanks @imjlk!
- [ea377bc](https://github.com/imjlk/wp-typia/commit/ea377bc86876e0d4eb8afbe21583a58186095015) Split built-in non-TypeScript artifact emitters into focused family and render helper modules while preserving the public scaffold artifact facade. — Thanks @imjlk!

## 0.19.1 — 2026-04-22

### Patch changes

- [b3f5346](https://github.com/imjlk/wp-typia/commit/b3f5346c22b0b1b9380db4498b51e8692880204b) Added stable machine-readable CLI error codes for structured `--format json` failures across the Node fallback and Bun runtime command surfaces. — Thanks @imjlk!
- [d5c5362](https://github.com/imjlk/wp-typia/commit/d5c536289cd391310bf7089a58de384948baf643) Add standalone `wp-typia` release assets and installers. GitHub Releases can now publish platform-specific standalone archives together with `install-wp-typia.sh` / `install-wp-typia.ps1`, and the installed CLI can resolve packaged scaffold/template support assets without requiring Bun to be preinstalled on the target machine. — Thanks @imjlk!
- [cccdd76](https://github.com/imjlk/wp-typia/commit/cccdd760553bcbb96c87b350d6814ef8778e91c1) Improved doctor scope messaging, add completion guidance, sync and dry-run help text, and missing bundled-artifact diagnostics across standalone CLI flows. — Thanks @imjlk!
- [1d1dd6e](https://github.com/imjlk/wp-typia/commit/1d1dd6ea664ec5ff7c6da65d8699ab76b8359317) Hardened interactive runtime detection, fallback cleanup behavior, and temporary wp-typia workspace lifecycle handling. — Thanks @imjlk!
- [cc55b61](https://github.com/imjlk/wp-typia/commit/cc55b61a42a02ee02020b337e10dd70d80c5caa0) Made external-template trust more explicit during scaffolding and surfaced clearer diagnostics when remote template package metadata is malformed. — Thanks @imjlk!
- [1445631](https://github.com/imjlk/wp-typia/commit/1445631721f0ebb237b8bd60f9f8cbdab5ca8e8a) Attached template-family-aware grouped scaffold variable metadata while preserving the flat string view used by rendering and external template flows. — Thanks @imjlk!

## 0.19.0 — 2026-04-21

### Minor changes

- [bd575b8](https://github.com/imjlk/wp-typia/commit/bd575b866ac7f7860ef2e25ab3a7663fc0e4a9d0) Add alternate render target scaffold support for persistence-capable dynamic blocks. `wp-typia create` and `wp-typia add block` now accept `--alternate-render-targets <email,mjml,plain-text>` for persistence scaffolds and persistence-enabled compound scaffolds, emitting shared `render-targets.php` helpers plus per-target render entry files alongside the default web render boundary. — Thanks @imjlk!

### Patch changes

- [0938059](https://github.com/imjlk/wp-typia/commit/0938059eba177cb446bd05554ba5cd0ed1a1b5b8) Unify high-frequency create/add validation paths around shared helpers so built-in `--variant` errors, `externalLayerId` composition rules, and local `--external-layer-source` path failures surface the same messages across CLI entry points. Query Loop post-type validation now mentions the original offending input, and `wp-typia add block` explains when a provided name normalizes to an empty slug instead of falling back to a generic required-field error. — Thanks @imjlk!
- [0559810](https://github.com/imjlk/wp-typia/commit/055981091f996d6693dcce323e191e1f879ae127) Improve create/add/sync CLI ergonomics for preview-first and no-install workflows. `wp-typia create --dry-run` now defaults non-interactive answers without requiring an extra `--yes`, `wp-typia sync` fails early with install guidance when local dependencies like `tsx` are missing, and `wp-typia add ... --dry-run` can preview planned workspace file updates without mutating the real workspace. — Thanks @imjlk!
- [d2d0cd6](https://github.com/imjlk/wp-typia/commit/d2d0cd61b22cf4f6086609d342d9cd9beec189f4) Polish scaffold onboarding so create-time output and generated READMEs make `wp-typia doctor` easier to discover, keep sync notes shorter, and favor the default workspace quick-start path over more specialized first-run examples. — Thanks @imjlk!
- [849c750](https://github.com/imjlk/wp-typia/commit/849c7502911954796dc1e8ae13c6369de658313b) Expose hook-friendly InnerBlocks option helpers for generated compound containers.
  
  Generated compound parents and container children now export reusable `get*InnerBlocksPropsOptions()` helpers so projects can move to `useInnerBlocksProps` without manually reconstructing preset-driven `template`, `defaultBlock`, `templateLock`, `orientation`, `directInsert`, or `renderAppender` settings. — Thanks @imjlk!
- [da4ea2c](https://github.com/imjlk/wp-typia/commit/da4ea2c40e34548c8931a48b47cf886fb76d014e) Clarify compound nested block ownership so static child constraints stay metadata-owned.
  
  Generated compound parent and nested child editors now rely on `block.json` for static `allowedBlocks`, `parent`, and `ancestor` relationships, while `children.ts` stays focused on editor-only preset behavior such as `template`, `defaultBlock`, `orientation`, `templateLock`, and `directInsert`. — Thanks @imjlk!
- [b94f058](https://github.com/imjlk/wp-typia/commit/b94f058f79a967a31052d2c33a45b201a340d28e) Clarify template capability boundaries across create/add/help/onboarding flows. Query Loop discovery now explains that it is a create-time `core/query` variation scaffold rather than an `add block` family, explicit but inapplicable flags like `--with-migration-ui` and `--query-post-type` now surface visible warnings, and workspace guidance more consistently points users at the short `--template workspace` alias. — Thanks @imjlk!
- [b177c6b](https://github.com/imjlk/wp-typia/commit/b177c6b429753e7c05714efcdc0d66be980cb1f0) Validate compound child graphs before generated nested child scaffolds write files.
  
  Generated compound child add-flow scripts can now preview the resulting nested hierarchy with `--dry-run`, emit planned writes before mutating files, and fail early when existing or requested ancestor graphs are structurally invalid. — Thanks @imjlk!
- [4eb3ad0](https://github.com/imjlk/wp-typia/commit/4eb3ad064d6fa18839b7692bcb8ff6ac04e49091) Add compound scaffold InnerBlocks presets for richer nested authoring flows.
  
  Compound create and workspace add flows now accept `--inner-blocks-preset <freeform|ordered|horizontal|locked-structure>`, generated compound container code exposes preset-backed `orientation`, `templateLock`, `defaultBlock`, and `directInsert` behavior, and scaffolded READMEs explain which nested constraints stay metadata-owned versus runtime-owned. — Thanks @imjlk!

## 0.18.0 — 2026-04-20

### Minor changes

- [677c81d](https://github.com/imjlk/wp-typia/commit/677c81d9c59e870c7ae47de01d357b6f6158e362) Expand official external template config support so variants can render richer `wp-typia` plugin and workspace scaffolds through `pluginTemplatesPath`, including workspace migration capability for rendered templates that declare `wpTypia.projectType: "workspace"`. — Thanks @imjlk!
- [79e43bd](https://github.com/imjlk/wp-typia/commit/79e43bd23a146e2aef4fdf2ebcb995ad3dad5a79) Add first-class `wp-typia add editor-plugin <name> [--slot <PluginSidebar>]` workspace scaffolding, including workspace inventory support, editor build/bootstrap wiring, doctor coverage, and generated-project smoke validation. — Thanks @imjlk!
- [7f8da16](https://github.com/imjlk/wp-typia/commit/7f8da165cc38b253e4852921c36362554861066e) Support multi-child and nested compound scaffold growth through the generated `add-compound-child` workflow. — Thanks @imjlk!

### Patch changes

- [b356b7a](https://github.com/imjlk/wp-typia/commit/b356b7abaabb995a86467fa6299edb796720a196) Add a non-mutating `wp-typia create --dry-run` plan mode that previews resolved scaffold settings and planned file output without writing to the requested target directory, with matching fallback CLI and alternate-buffer create flow support. — Thanks @imjlk!
- [aaa235e](https://github.com/imjlk/wp-typia/commit/aaa235e1e6b80001145f2332730fc86f57503735) Align scaffolded project conventions by treating `dev` as the primary generated entrypoint across first-party templates, clarifying that Query Loop scaffolds intentionally skip manual sync scripts, omitting the generated `packageManager` field for npm-based scaffolds, and removing the unused Query Loop `validator-toolkit.ts` placeholder. — Thanks @imjlk!
- [3730b51](https://github.com/imjlk/wp-typia/commit/3730b516083defed2a07d4d72307a4d3f8e1a60a) Make the Node fallback CLI print a normal human-readable `--version` line by default, add earlier create/add preflight diagnostics for mistyped built-in templates and non-empty target directories, and fail `wp-typia add block` with install guidance before workspace dependency resolution errors. — Thanks @imjlk!
- [938b9b0](https://github.com/imjlk/wp-typia/commit/938b9b08560640f76fd78e5966c9b6982c6a7fed) Add user-visible progress reporting for longer `wp-typia create` scaffold phases so fallback CLI runs and alternate-buffer create flows more clearly show template resolution, file generation, artifact seeding, finalization, and dependency installation work while scaffolding is in progress. — Thanks @imjlk!
- [fcec7f1](https://github.com/imjlk/wp-typia/commit/fcec7f1fd2dbb5716af706fb624621f73bfc9dfa) Improve human-readable `templates list` and `templates inspect` output with clearer flag capability hints, workspace alias discoverability, and logical layer summaries that do not expose raw internal template paths by default. — Thanks @imjlk!
- [65b8eb2](https://github.com/imjlk/wp-typia/commit/65b8eb2cf876eb73c8200da4fbcfd9fc30d2b5e0) Add the first-class `wp-typia add rest-resource <name>` workspace workflow so official workspace plugins can scaffold plugin-level typed REST resources with generated TypeScript contracts, validators, endpoint clients, React data hooks, PHP route starters, `sync-rest` inventory support, and matching add/doctor/help surfaces.
  
  Teach `@wp-typia/rest` endpoint execution to honor `requestLocation: "query-and-body"` so generated update clients can split query parameters and JSON bodies correctly. — Thanks @imjlk!
- Updated dependencies: block-runtime (npm)@0.5.0, rest (npm)@0.3.11

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

## 0.16.14 — 2026-04-19

### Patch changes

- [86f9e0a](https://github.com/imjlk/wp-typia/commit/86f9e0abbfa0a84c7122e35781bb30d7e3d86122) Improve the Node-side fallback prompt UX for `wp-typia` by making numbered selections easier to reuse, redrawing choices on demand, and documenting the lighter readline prompt model relative to the Bun/OpenTUI path. — Thanks @imjlk!
- [460d86d](https://github.com/imjlk/wp-typia/commit/460d86d92fc0af94bbcb0542feb400236e9004ae) Remove the deprecated `@wp-typia/create` and `create-wp-typia` package shells from the repository, and update current docs plus publish automation to point directly at `wp-typia`, `@wp-typia/project-tools`, and `@wp-typia/block-runtime`. — Thanks @imjlk!
- [64e52b7](https://github.com/imjlk/wp-typia/commit/64e52b7e2d2b456cfd0816716b0807f93832dbaf) Split generated project smoke assertions, scaffold runtime helpers, and first-party form helpers into focused modules while keeping the existing CLI and TUI behavior stable. — Thanks @imjlk!
- Updated dependencies: block-runtime (npm)@0.4.10, rest (npm)@0.3.10

## 0.16.13 — 2026-04-19

### Patch changes

- [0653d2e](https://github.com/imjlk/wp-typia/commit/0653d2e2ce7828e289df1910ffb2818e0a61c4c0) Split scaffold onboarding into clearer quick-start, advanced sync, and first-commit guidance across the CLI completion output and generated README content. — Thanks @imjlk!
- [78a342f](https://github.com/imjlk/wp-typia/commit/78a342f00a0545d07274681f5f13be976153f986) Clarify `wp-typia doctor` output outside official workspace roots by surfacing an explicit doctor scope row, environment-only rerun guidance, and earlier invalid-workspace messaging. — Thanks @imjlk!
- [911e98b](https://github.com/imjlk/wp-typia/commit/911e98b47dfc3406940f4e000f806cb28d9d7b77) Tighten `wp-typia create` flag handling by defaulting `--yes` scaffolds to npm, rejecting persistence-only flags on non-persistence built-in templates, and surfacing built-in `--variant` misuse earlier. — Thanks @imjlk!
- [e80744c](https://github.com/imjlk/wp-typia/commit/e80744c5c193390986fec44d2061600aeb48c1a8) Wrap human-readable `wp-typia` CLI diagnostic and doctor output more readably in narrow terminals without changing structured output. — Thanks @imjlk!
- [26c9ab7](https://github.com/imjlk/wp-typia/commit/26c9ab77d6b97754998c6f9d8f524d08abf4d24d) Harden `wp-typia create` project-directory handling by warning on awkward names, rejecting `.` and `..`, and limiting the positional shortcut to unambiguous local paths. — Thanks @imjlk!

## 0.16.12 — 2026-04-18

### Patch changes

- [864f394](https://github.com/imjlk/wp-typia/commit/864f3948f02ee4caeaad201818de87a5313470fd) Split template source normalization external loading and remote subset helpers into focused runtime modules without changing normalized template output. — Thanks @imjlk!
- [f7a19e3](https://github.com/imjlk/wp-typia/commit/f7a19e3c7ba3d692f40e85d797b261e8660682fc) Split migration project workspace state and config helpers into focused runtime modules without changing migration behavior. — Thanks @imjlk!
- [391b5c6](https://github.com/imjlk/wp-typia/commit/391b5c6966c156a5515098dabc1ebc4d5e982b14) Refactor scaffold runtime internals to reuse dedicated identifier and document helper modules without changing generated project output. — Thanks @imjlk!
- [b149033](https://github.com/imjlk/wp-typia/commit/b149033c23dbeec0cef8cc8bc513b7fca018962c) Split migration diff rename and transform helpers into focused runtime modules without changing diff output. — Thanks @imjlk!
- [86bd02b](https://github.com/imjlk/wp-typia/commit/86bd02bc489e121a03fc8b9b31b2f3fc8375067c) Refactor the migration runtime into clearer planning, render, and generated-artifact helper modules without changing the CLI contract. — Thanks @imjlk!
- [bbad89d](https://github.com/imjlk/wp-typia/commit/bbad89d4e810c01aed31ae413b67819be1352270) Split compound built-in code template helpers into focused parent, child, and persistence modules while preserving generated scaffold output. — Thanks @imjlk!
- [67ea3f3](https://github.com/imjlk/wp-typia/commit/67ea3f332e5811ba8d61dcbb55c881ceb623ccb9) Split migration project layout discovery and path helpers into focused runtime modules while preserving migration behavior. — Thanks @imjlk!
- [f0ffb00](https://github.com/imjlk/wp-typia/commit/f0ffb00680078b0585fd3fb9211b114ff7f0febb) Split doctor environment/template checks and workspace checks into focused runtime modules without changing doctor output. — Thanks @imjlk!
- [1206a2d](https://github.com/imjlk/wp-typia/commit/1206a2de2d7c74dc3aa365a13477da68a3e6d1a0) Refactored the built-in block code template source into family-oriented modules
  while preserving scaffolded output, and added explicit code artifact hash
  coverage to catch refactor-only drift. — Thanks @imjlk!
- [42b8610](https://github.com/imjlk/wp-typia/commit/42b86105affeb18e3d0dc9198d02f224bfa453ad) Split `cli-add-block` config generation and legacy validator repair into focused runtime helpers while preserving existing workspace add-block behavior. — Thanks @imjlk!
- [03f5776](https://github.com/imjlk/wp-typia/commit/03f5776087b450cc376c7f15a2dac63017224882) Split workspace add pattern and binding-source helpers into a focused runtime module without changing the existing CLI surface. — Thanks @imjlk!
- [223cd95](https://github.com/imjlk/wp-typia/commit/223cd950ae443d2c27692df1cd801a970bfeadbe) Split built-in block artifact document emitters and attribute spec tables into focused runtime helper modules while preserving generated output. — Thanks @imjlk!
- [4c118ee](https://github.com/imjlk/wp-typia/commit/4c118ee9844e247c3d7f9ad5d61e645628411b49) Split scaffold bootstrap and package-manager normalization helpers into focused runtime modules without changing generated project behavior. — Thanks @imjlk!
- [93fd61b](https://github.com/imjlk/wp-typia/commit/93fd61b0e1965b26a08d483dca4b18b1e8c0c729) Split built-in block artifact type-source emitters into a focused helper module without changing generated scaffold output. — Thanks @imjlk!
- [2f8fca3](https://github.com/imjlk/wp-typia/commit/2f8fca365300d5e1353986dbec83aecfcbdd9b6f) Split built-in block artifact document and attribute helpers into a focused runtime module without changing generated artifact output. — Thanks @imjlk!
- [5b71cdc](https://github.com/imjlk/wp-typia/commit/5b71cdced704a0b1f2dcb030c4cf7a8c2c74481f) Refresh the hosted docs site, expand TypeDoc and TSDoc coverage for core plus advanced public surfaces, and document the latest public facade boundaries without changing runtime behavior. — Thanks @imjlk!
- Updated dependencies: api-client (npm)@0.4.5, block-runtime (npm)@0.4.9, rest (npm)@0.3.9

## 0.16.11 — 2026-04-16

### Patch changes

- Updated dependencies: block-types (npm)@0.2.4, rest (npm)@0.3.8

## 0.16.10 — 2026-04-15

### Patch changes

- [1c9916a](https://github.com/imjlk/wp-typia/commit/1c9916aa50c7e80590b35a7691b9f5fc0537ea60) Fixed published scaffold outputs so generated basic, persistence, and compound block registration files no longer rely on `registerBlockType<T>()` generic calls that break against the current published `@wordpress/blocks` type surface. Hardened the packed publish-install smoke to verify wrapper exports and to typecheck generated basic and compound scaffolds, including the compound `add-compound-child` path, against packed local release tarballs before publish. — Thanks @imjlk!
- [e943cc1](https://github.com/imjlk/wp-typia/commit/e943cc1445ab16d14ad215a1851cd94f8fc3342a) Refactored the built-in block artifact emitter so template attribute definitions are driven by shared declarative spec tables while preserving the generated `block.json`, `typia.manifest.json`, and TypeScript outputs. Added explicit artifact summary equivalence coverage to guard against refactor-only output drift across the built-in template families. — Thanks @imjlk!
- Updated dependencies: block-types (npm)@0.2.3

## 0.16.9 — 2026-04-15

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
- Updated dependencies: block-runtime (npm)@0.4.8, block-types (npm)@0.2.2

## 0.16.8 — 2026-04-13

### Patch changes

- [198021b](https://github.com/imjlk/wp-typia/commit/198021b27c78065c3c82ac3523e909eacd3f80d1) Add a public non-mutating block generator inspection contract around `BlockGeneratorService`. — Thanks @imjlk!
- [a620f1a](https://github.com/imjlk/wp-typia/commit/a620f1a1470ffd028b5e2efe81ae85a5d01411fe) Implement external template-layer composition manifests and `extends` resolution on top of the built-in shared scaffold model.
  
  Programmatic built-in scaffold flows can now accept an external layer package through `externalLayerSource` and optional `externalLayerId`, while preserving built-in emitter ownership and explicit protected-path conflict errors. — Thanks @imjlk!

## 0.16.7 — 2026-04-13

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
- [9be75e4](https://github.com/imjlk/wp-typia/commit/9be75e44b5c46ed17ae11e02fe57ebeff2a1db50) Document and validate the monorepo package manifest policy, align repository engine baselines, and remove stale `react-devtools-core` and `ws` devDependencies from `@wp-typia/project-tools`. — Thanks @imjlk!
- Updated dependencies: api-client (npm)@0.4.4, block-runtime (npm)@0.4.7, rest (npm)@0.3.7

## 0.16.6 — 2026-04-12

### Patch changes

- Updated dependencies: api-client (npm)@0.4.3, block-runtime (npm)@0.4.6, rest (npm)@0.3.6

## 0.16.5 — 2026-04-12

### Patch changes

- [7b9a136](https://github.com/imjlk/wp-typia/commit/7b9a136394233b8f894ad4155b8d4ed4de636cc3) Make built-in scaffold styles and block-local render.php emitter-owned, remove the remaining built-in non-TS Mustache sources, and document the narrowed Mustache ownership split. — Thanks @imjlk!

## 0.16.4 — 2026-04-12

### Patch changes

- [1bcbaad](https://github.com/imjlk/wp-typia/commit/1bcbaadde08c1f9b38cf0fc0770dfd4c1c4a794f) Trim the default interactivity scaffold down to the runtime surface it actually uses by removing dead context fields, unbound actions, unused editor attributes like `uniqueId` and `autoPlayInterval`, and the unused `interactiveMode: "auto"` scaffold option. — Thanks @imjlk!
- [d963e91](https://github.com/imjlk/wp-typia/commit/d963e91309f8a0f07192508b67271cfb98fb232e) Add a Phase 1 typed block generation boundary to `@wp-typia/project-tools` via `BlockSpec` and `BlockGeneratorService`, while keeping built-in scaffold file bodies on their current Mustache rendering path. — Thanks @imjlk!
- [9d60ecf](https://github.com/imjlk/wp-typia/commit/9d60ecf03431b281fb804d48b753ab5b5641051f) Remove built-in scaffold `types.ts.mustache` and `block.json.mustache` files now that structural artifacts are emitter-owned, keep the generator contract documented as “template bodies from Mustache, structural files from emitters”, and add guard tests so built-in template trees cannot regress back to shipping stale structural Mustache sources. — Thanks @imjlk!
- [f31b84b](https://github.com/imjlk/wp-typia/commit/f31b84be3bb4eea2583a610e4c96039f62fa290e) Move built-in scaffold `types.ts` and `block.json` generation onto the typed Phase 2 emitter path behind `BlockGeneratorService`, reuse the same structural artifact model for starter manifests, and document the new ownership split where structural files are emitter-owned while the remaining built-in scaffold files still come from Mustache templates. — Thanks @imjlk!
- [4ed3170](https://github.com/imjlk/wp-typia/commit/4ed31709b87ecc0f3fb7bd1524d40700cac44c82) Make built-in scaffold TS/TSX bodies emitter-owned alongside structural files, remove stale built-in TS/TSX Mustache sources, and document the narrowed Mustache ownership split. — Thanks @imjlk!

## 0.16.3 — 2026-04-12

### Patch changes

- [93576a1](https://github.com/imjlk/wp-typia/commit/93576a118a3dfa355391eefea05b95e3337b153a) Fix generated interactivity scaffolds so their WordPress Interactivity context is typed through explicit `getContext<T>()` imports, and restore GitHub Pages publishing by deploying a real static docs site artifact from CI. — Thanks @imjlk!

## 0.16.2 — 2026-04-12

### Patch changes

- [e9901fa](https://github.com/imjlk/wp-typia/commit/e9901fa3c6b461b7b4c112cba20cc4e5e3654a99) Deduplicate schema-core behind the block-runtime implementation owner while keeping the project-tools import path stable, run project-tools regression tests on pull requests while keeping coverage uploads on main, and refresh workflow actions to reduce wall-clock time and remove Node 20 runtime warnings. — Thanks @imjlk!
- [18b51b2](https://github.com/imjlk/wp-typia/commit/18b51b2d450c36b7943cb83ac6f33682d645d7cf) Fix the published CLI create flow so it no longer eagerly loads project-tools runtime modules that drag in TypeScript during startup, and align the CLI React dependency range with Bunli's current React peer floor to avoid duplicate-React crashes in interactive `wp-typia create`. — Thanks @imjlk!
- Updated dependencies: block-runtime (npm)@0.4.5

## 0.16.1 — 2026-04-11

### Patch changes

- [3dd1c99](https://github.com/imjlk/wp-typia/commit/3dd1c99df1aa69cd11563861adf9b75f5ec5be71) Fix generated interactivity scaffolds to emit valid `data-wp-class--is-active` directives for animation state toggling. — Thanks @imjlk!
- [548c95b](https://github.com/imjlk/wp-typia/commit/548c95b07b97b8e4264af94651c5d9dea9974c8b) Fix `wp-typia create --template workspace` to normalize the shorthand alias before npm template resolution. — Thanks @imjlk!
- [f3ad2ae](https://github.com/imjlk/wp-typia/commit/f3ad2ae8a94f5db626e080c9972e4749e03a1927) Align persistence and compound scaffold validator and inspector conventions, including generated storage-mode labels and compound add-child validator wiring. — Thanks @imjlk!
- [024bab0](https://github.com/imjlk/wp-typia/commit/024bab003d1e20a2248c08ffe772cf7875ae0acb) Fix persistence scaffold regressions in authenticated bootstrap typing and generated PHP storage-mode handling. — Thanks @imjlk!
- Updated dependencies: block-runtime (npm)@0.4.4

## 0.16.0 — 2026-04-10

### Minor changes

- [1470cc5](https://github.com/imjlk/wp-typia/commit/1470cc5ed02064e616292faa1e38765ce80b7da0) Add a unified `sync` entrypoint for generated projects and the `wp-typia sync`
  CLI, and make `sync-rest` fail fast when type-derived metadata artifacts are
  stale or missing. — Thanks @imjlk!

## 0.15.4 — 2026-04-10

### Patch changes

- [c935242](https://github.com/imjlk/wp-typia/commit/c9352422b12ad7168425125c39932381a57e56dc) Avoid duplicating existing `typia` imports when `wp-typia add block --template compound`
  repairs legacy compound validator files inside older workspaces. — Thanks @imjlk!

## 0.15.3 — 2026-04-10

### Patch changes

- [4a02664](https://github.com/imjlk/wp-typia/commit/4a026642692b6b101d454bd14c70d0b5c28b900e) Fix generated-project Typia/Webpack compatibility by moving generic Typia
  factory calls out of the shared validator helper, adding a fail-fast supported
  toolchain guard around the Webpack integration, and covering the path with
  generated-project build smoke tests. — Thanks @imjlk!
- Updated dependencies: block-runtime (npm)@0.4.3

## 0.15.2 — 2026-04-09

### Patch changes

- [ab7d1c9](https://github.com/imjlk/wp-typia/commit/ab7d1c9afaf4039b5053991ca9fe88cabcd46a13) Publish shared API client utilities and runtime primitives from `@wp-typia/api-client`, reuse them across rest and runtime packages, and align active package Bun minimums with `1.3.11`. — Thanks @imjlk!
- [0cc5a61](https://github.com/imjlk/wp-typia/commit/0cc5a61bb50bc0fd871645b6dad29b01bb66950b) Make block metadata helpers live in `@wp-typia/block-runtime` as the single source of truth and have `@wp-typia/project-tools` re-export the identical runtime modules instead of carrying duplicate copies. — Thanks @imjlk!
- Updated dependencies: api-client (npm)@0.4.2, block-runtime (npm)@0.4.2, block-types (npm)@0.2.1, rest (npm)@0.3.5

## 0.15.1 — 2026-04-09

### Patch changes

- [70137df](https://github.com/imjlk/wp-typia/commit/70137df4e131872e1d01b2d883e9fc890a42a673) Fix scaffold DX regressions by seeding persistence REST artifacts during create, restoring interactivity editor styles, exposing the official workspace template in `templates`, and making compound child scaffolds read live parent metadata. — Thanks @imjlk!

## 0.15.0 — 2026-04-09

### Minor changes

- [e4610ff](https://github.com/imjlk/wp-typia/commit/e4610ffe8201d47f2de6c03a41a89fb4c63fcebc) Add dedicated static-safe `/bootstrap` endpoints for persistence scaffolds and align generated runtime flow around fresh session-only write access hydration. — Thanks @imjlk!

## 0.14.0 — 2026-04-09

### Minor changes

- [6c0af4a](https://github.com/imjlk/wp-typia/commit/6c0af4af622d18435ef4a03d3a1c4928d6c55db6) Add a generated `src/transport.ts` seam for persistence scaffolds so editor and frontend runtime calls can be redirected to contract-compatible proxies or BFFs without rewriting generated API glue. — Thanks @imjlk!

## 0.13.4 — 2026-04-09

### Patch changes

- [fb2f09a](https://github.com/imjlk/wp-typia/commit/fb2f09ad62cf8c789f22111db110ea9dffef2504) Polish the basic scaffold and CLI regression surface by adding a static `render.php` placeholder to the basic template, avoiding duplicate wrapper CSS class segments when the namespace matches the slug, and locking `wp-typia --version` behavior with an explicit regression test. — Thanks @imjlk!

## 0.13.3 — 2026-04-09

### Patch changes

- Updated dependencies: rest (npm)@0.3.4

## 0.13.2 — 2026-04-09

### Patch changes

- Updated dependencies: rest (npm)@0.3.3

## 0.13.1 — 2026-04-09

### Patch changes

- Updated dependencies: rest (npm)@0.3.2

## 0.13.0 — 2026-04-08

### Minor changes

- [ebdb173](https://github.com/imjlk/wp-typia/commit/ebdb1739010f335b14d8be1ace016920193278a1) Add the first-class `wp-typia add hooked-block <block-slug> --anchor <anchor-block-name> --position <before|after|firstChild|lastChild>` workflow with `block.json` `blockHooks` patching, root doctor validation, generated-project smoke coverage, and updated CLI/workspace docs. — Thanks @imjlk!
- [1d12a52](https://github.com/imjlk/wp-typia/commit/1d12a52efc0f7215b130257cfe1f010a963cf232) Add the first-class `wp-typia add binding-source <name>` workspace workflow with
  inventory entries, shared PHP/editor bootstrap wiring, workspace doctor checks,
  and generated-project smoke coverage for binding-source builds. — Thanks @imjlk!

## 0.12.0 — 2026-04-08

### Minor changes

- [99bd9dc](https://github.com/imjlk/wp-typia/commit/99bd9dcb4f5a61fa8af8baf861e85bde5c8b8b2a) Polish workspace-aware diagnostics by extending root `wp-typia doctor` with
  workspace package metadata, block convention, generated artifact, and collection
  import checks, while keeping deep migration validation under
  `wp-typia migrate doctor --all` with explicit workspace target-alignment
  verification. — Thanks @imjlk!
- [76351a1](https://github.com/imjlk/wp-typia/commit/76351a1c0cc9ea247473d080cf39723687078270) Add first-class workspace variation and pattern workflows, extend `wp-typia doctor`
  with lightweight workspace-aware diagnostics, and update the official workspace
  template to track `BLOCKS`, `VARIATIONS`, and `PATTERNS` through a single
  inventory. — Thanks @imjlk!

### Patch changes

- [9f38901](https://github.com/imjlk/wp-typia/commit/9f389017463f3b566e59095f45f8c9ddfdcd1067) Split project orchestration out of `@wp-typia/create` into the new
  `@wp-typia/project-tools` package, rewire `wp-typia` to consume the new
  programmatic surface, and retire `@wp-typia/create` to a deprecated legacy
  package shell. — Thanks @imjlk!
- Updated dependencies: block-runtime (npm)@0.4.0

