# @wp-typia/create-workspace-template

## 0.20.1 — 2026-08-14

### Patch changes

- [15cfc2d2](https://github.com/imjlk/wp-typia/commit/15cfc2d21d98cd398e86c9c019a7d9424d7dcd5b) Fixed: harden generated-project compatibility with `@ttsc/lint` 0.26.2.
  
  - Production-only installs now skip the development compiler repair when lint tooling is absent.
  - Compatibility repairs preserve permissions, clean abandoned temporary files, validate embedded TypeScript boundaries, and fail closed before partial writes. — Thanks @imjlk!

## 0.20.0 — 2026-08-11

### Minor changes

- [d4d8cd72](https://github.com/imjlk/wp-typia/commit/d4d8cd72bca2c8e1553ac479d343b85f481e4629) Added: integrate the WordPress ttsc lint contributor into generated and existing projects.
  
  - New scaffolds install `@wp-typia/ttsc-lint-plugin-wp` and bind its compiled WordPress Scripts recommended preset to the generated text domain.
  - `wp-typia init --apply` can upgrade official workspaces and supported retrofit layouts without overwriting project-owned lint configs.
  - Doctor reports the managed combined code gate and preserves project-owned checks during adoption. — Thanks @imjlk!
- [c275a84e](https://github.com/imjlk/wp-typia/commit/c275a84ee7d8a975715e216c7d76740862de3f03) Changed: make `ttsc check --noEmit` the generated WordPress code-quality gate
  for TypeScript and JavaScript, backed by the compiled WordPress Scripts preset.
  Scaffolds and retrofit plans now expose explicit `check:code` and `check`
  scripts without lint-only aliases, preserve existing project-owned aggregate
  checks, use ESM-safe lint configuration files, and remove the legacy WordPress
  ESLint and TypeScript 6 compatibility stack from consumer projects. Updated the
  ttsc toolchain to 0.26.2 and retained the exact mapped-type formatting repair
  until an unpatched upstream release passes the regression. The compiled preset
  also publishes explicit behavior downgrades for one native engine failure and
  three JSX semantic mismatches instead of enabling unsafe rules, covering two
  component-classification false positives and valid progressbar ARIA values.
  Generated checks keep ttsc formatting write-only, retain Prettier for
  JavaScript and non-code formatting, and let `ttsc check` own TypeScript,
  JavaScript, and WordPress lint diagnostics. — Thanks @imjlk!
- [03a86a81](https://github.com/imjlk/wp-typia/commit/03a86a818f0e8e63eda3e558a5d493b118227130) Changed: replace generated PHP discovery globs and variable includes with
  deterministic local manifests containing validated literal `__DIR__` entrypoints
  for workspace blocks, bindings, patterns, abilities, admin views, AI features,
  post meta, and REST resources. Project sync now creates and checks these
  manifests, add workflows refresh them transactionally, and doctor rejects stale,
  unsafe, traversing, or symbolic entrypoint paths. — Thanks @imjlk!

## 0.19.0 — 2026-07-28

### Minor changes

- [fcbb14b0](https://github.com/imjlk/wp-typia/commit/fcbb14b01c68faf1c9e1b7144f356ff93fbb1897) Move the supported development and generated-project toolchain to Node.js 24,
  TypeScript 7, typia 13, and ttsc. Generated projects now declare Node.js 24
  or newer. — Thanks @imjlk!

## 0.18.3 — 2026-07-21

### Patch changes

- [ee5e9bbf](https://github.com/imjlk/wp-typia/commit/ee5e9bbff4bf87fbc54a8e9c02afe8333c8110eb) Honor the selected WordPress target in generated workspace plugin headers while preserving the shared WordPress and PHP compatibility floors. — Thanks @imjlk!

## 0.18.2 — 2026-07-20

### Patch changes

- [bb6ed414](https://github.com/imjlk/wp-typia/commit/bb6ed414ecbd4bee31a427f1143d33d736b0b6c3) Keep fresh built-in scaffolds sync-clean by seeding canonical compiler-derived block metadata, validation, schema, OpenAPI, PHP, and persistence artifacts after scaffold transforms and before dependency installation. Align generated project manifests, runtime identifiers, development startup sync, and package smoke coverage with the same artifact contracts. — Thanks @imjlk!

## 0.18.1 — 2026-06-02

### Patch changes

- [ab140e2b](https://github.com/imjlk/wp-typia/commit/ab140e2bf6d394331f65a861937c55b3b9d096b6) Pin generated WordPress dependency ranges to React 18-compatible Gutenberg package lines so npm installs do not float to React 19-only releases unexpectedly. — Thanks @imjlk!

## 0.18.0 — 2026-05-15

### Minor changes

- [f585cbf4](https://github.com/imjlk/wp-typia/commit/f585cbf471450210faa420ccba5656bbbf6363d6) Add typed block nesting contracts that drive `block.json` `parent`, `ancestor`, and `allowedBlocks` metadata during sync, including unknown-reference diagnostics for generated workspaces. — Thanks @imjlk!
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

## 0.17.1 — 2026-05-13

### Patch changes

- [c12a3597](https://github.com/imjlk/wp-typia/commit/c12a3597f6458f6545a180fde49aac28e5e3e559) Add shared workspace PHP helpers for loading, WordPress-sanitizing, and validating generated REST schemas from packaged or source schema files. — Thanks @imjlk!
- [171982fa](https://github.com/imjlk/wp-typia/commit/171982fa5828e07d830917e7f5388a6ed8cd23e6) Add local `wp-typia` CLI scripts to official workspace scaffolds and document package-manager-specific `doctor`, `sync`, and `add` commands for generated and existing workspaces. — Thanks @imjlk!
- [c8734da3](https://github.com/imjlk/wp-typia/commit/c8734da33cfd6b2694c7d80d1892681cca38736a) Package generated REST JSON schemas into `inc/rest-schemas` for workspace release zips and add release-check scripts that fail when packaged runtime schemas are missing or stale. — Thanks @imjlk!
- [6d0ec1e1](https://github.com/imjlk/wp-typia/commit/6d0ec1e19f85b8629540341325391ef12e5ff9f9) Add first-class preserve-on-empty metadata for manual settings secrets, including
  Typia tags, OpenAPI schema extensions, CLI aliases, generated admin settings
  form behavior, and documentation. — Thanks @imjlk!
- [e946efaf](https://github.com/imjlk/wp-typia/commit/e946efaff8af434a18b7663d51c6b8ccc00db1da) Add a `plugin-qa` workspace create profile plus `add integration-env --release-zip` scripts for wp-env smoke checks and plugin zip packaging. — Thanks @imjlk!

## 0.17.0 — 2026-05-12

### Minor changes

- [efdc8784](https://github.com/imjlk/wp-typia/commit/efdc878408cca0fe0494a619da9faba7f7600252) Add typed admin settings screen scaffolds for manual REST contracts, including generated React form state, API/client integration, secret-field metadata propagation, and docs that distinguish generated settings screens from DataViews and custom admin UI. — Thanks @imjlk!
- [bcfdba8b](https://github.com/imjlk/wp-typia/commit/bcfdba8b9ce1c0bac6bbeba1a8e122bdf94f71a2) Added `wp-typia add contract <name> [--type <ExportedTypeName>]` for standalone TypeScript wire contracts, including JSON Schema artifact generation, workspace inventory registration, and `sync-rest` / `sync --check` drift checks without generating PHP route glue. — Thanks @imjlk!
- [10a835ad](https://github.com/imjlk/wp-typia/commit/10a835add0580c3f3964386c84f652500b2f0cfe) Add generated REST resource escape hatches for custom item route patterns, permission callbacks, and controller class wrappers while keeping generated schemas, OpenAPI, clients, and workspace inventory aligned. — Thanks @imjlk!
- [81c2f5c3](https://github.com/imjlk/wp-typia/commit/81c2f5c3e1ee76575c09fa82eaa93b524bb73675) Add `wp-typia add post-meta` for typed WordPress post meta contracts, including TypeScript shape scaffolding, generated schema sync, `register_post_meta()` PHP glue, workspace inventory, doctor coverage, and CLI/TUI/docs wiring. — Thanks @imjlk!

### Patch changes

- [3cebc2c8](https://github.com/imjlk/wp-typia/commit/3cebc2c889371245c413d20b13435c93b8f9443a) Added an opt-in `wp-typia add integration-env <name>` workspace workflow that can generate local smoke-test starters, `.env.example`, optional `@wordpress/env` setup, and an optional docker-compose service scaffold. — Thanks @imjlk!

## 0.16.0 — 2026-04-29

### Minor changes

- [e8e3b8a](https://github.com/imjlk/wp-typia/commit/e8e3b8acd03902626260c2189948d99876df5d17) Elevate binding-source scaffolds with optional end-to-end block target wiring, including typed attribute updates, supported-attributes doctor checks, and CLI/docs coverage. — Thanks @imjlk!
- [7fe9336](https://github.com/imjlk/wp-typia/commit/7fe93360fa7cc5dc03a6c2e24d5e8fda4b502a9b) Add first-class `wp-typia add style` and `wp-typia add transform` workspace
  scaffolds, including workspace inventory sections, block entrypoint wiring,
  doctor coverage, CLI/TUI metadata, generated-project build coverage, and docs. — Thanks @imjlk!

## 0.15.0 — 2026-04-20

### Minor changes

- [79e43bd](https://github.com/imjlk/wp-typia/commit/79e43bd23a146e2aef4fdf2ebcb995ad3dad5a79) Add first-class `wp-typia add editor-plugin <name> [--slot <PluginSidebar>]` workspace scaffolding, including workspace inventory support, editor build/bootstrap wiring, doctor coverage, and generated-project smoke validation. — Thanks @imjlk!

### Patch changes

- [65b8eb2](https://github.com/imjlk/wp-typia/commit/65b8eb2cf876eb73c8200da4fbcfd9fc30d2b5e0) Add the first-class `wp-typia add rest-resource <name>` workspace workflow so official workspace plugins can scaffold plugin-level typed REST resources with generated TypeScript contracts, validators, endpoint clients, React data hooks, PHP route starters, `sync-rest` inventory support, and matching add/doctor/help surfaces.
  
  Teach `@wp-typia/rest` endpoint execution to honor `requestLocation: "query-and-body"` so generated update clients can split query parameters and JSON bodies correctly. — Thanks @imjlk!

## 0.14.0 — 2026-04-10

### Minor changes

- [1470cc5](https://github.com/imjlk/wp-typia/commit/1470cc5ed02064e616292faa1e38765ce80b7da0) Add a unified `sync` entrypoint for generated projects and the `wp-typia sync`
  CLI, and make `sync-rest` fail fast when type-derived metadata artifacts are
  stale or missing. — Thanks @imjlk!

## 0.13.1 — 2026-04-10

### Patch changes

- [4a02664](https://github.com/imjlk/wp-typia/commit/4a026642692b6b101d454bd14c70d0b5c28b900e) Fix generated-project Typia/Webpack compatibility by moving generic Typia
  factory calls out of the shared validator helper, adding a fail-fast supported
  toolchain guard around the Webpack integration, and covering the path with
  generated-project build smoke tests. — Thanks @imjlk!

## 0.13.0 — 2026-04-08

### Minor changes

- [1d12a52](https://github.com/imjlk/wp-typia/commit/1d12a52efc0f7215b130257cfe1f010a963cf232) Add the first-class `wp-typia add binding-source <name>` workspace workflow with
  inventory entries, shared PHP/editor bootstrap wiring, workspace doctor checks,
  and generated-project smoke coverage for binding-source builds. — Thanks @imjlk!

## 0.12.0 — 2026-04-08

### Minor changes

- [efc4da6](https://github.com/imjlk/wp-typia/commit/efc4da6375383fa87f753296259d23e86bbfb6b5) Add explicit `wp-typia create` and `wp-typia add` command groups, ship the first official empty workspace template package, and enable `wp-typia add block` for built-in block families inside workspace projects. — Thanks @imjlk!
- [76351a1](https://github.com/imjlk/wp-typia/commit/76351a1c0cc9ea247473d080cf39723687078270) Add first-class workspace variation and pattern workflows, extend `wp-typia doctor`
  with lightweight workspace-aware diagnostics, and update the official workspace
  template to track `BLOCKS`, `VARIATIONS`, and `PATTERNS` through a single
  inventory. — Thanks @imjlk!

