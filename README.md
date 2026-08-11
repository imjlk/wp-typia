# wp-typia

[![CI/CD](https://github.com/imjlk/wp-typia/workflows/CI/CD%20Pipeline/badge.svg)](https://github.com/imjlk/wp-typia/actions)
[![License: GPL-2.0+](https://img.shields.io/badge/License-GPL--2.0+-blue.svg)](https://opensource.org/licenses/GPL-2.0+)
[![npm version](https://badge.fury.io/js/wp-typia.svg)](https://www.npmjs.com/package/wp-typia)
[![codecov](https://codecov.io/gh/imjlk/wp-typia/branch/main/graph/badge.svg)](https://codecov.io/gh/imjlk/wp-typia)

Build WordPress blocks that can evolve safely.

`wp-typia` is a type-first toolkit for WordPress block development. Use `src/types.ts` as the source of truth, then generate `block.json`, `typia.manifest.json`, `typia-validator.php`, and optional schema artifacts from the same contract.

It is built for projects where block attributes change over time, saved content must stay compatible, and data-backed or multi-block patterns should not turn into one-off glue code.

## Who this is for

`wp-typia` is for teams building WordPress blocks that are expected to evolve:

- long-lived blocks with changing attributes and compatibility pressure
- blocks that need typed persistence or REST contracts
- plugin workspaces that may grow into multi-block, variation, style, transform, pattern, binding-source, or hooked-block workflows

If you only need the smallest possible starter for a single block, `@wordpress/create-block` is still the better default.

## Why wp-typia

- Type-driven block metadata from `src/types.ts`
- Runtime validation close to the block code
- Opt-in migration workflows for versioned block evolution
- Built-in templates for `basic`, `interactivity`, `persistence`, `compound`, and `query-loop`
- Typed REST and persistence contracts when blocks need data
- Remote template seeding from local paths, GitHub locators, npm packages, and create-block-style configs

## Choose the right tool

Use **`@wordpress/create-block`** when you want the official minimal starting point for a new block.

Use **`wp-typia`** when you need a block that will grow:

- attributes that will change after release
- validation and defaults derived from a shared contract
- typed persistence and REST surfaces
- compound parent/child block structures
- a migration path for long-lived production blocks

## Quick Start

```bash
npx wp-typia create my-block
# or use Bun as the package runner
bunx wp-typia create my-block
# or install the standalone CLI first
curl -fsSL https://github.com/imjlk/wp-typia/releases/latest/download/install-wp-typia.sh | sh
```

The npm-installed CLI runs on the Node-first runtime. `bunx` is supported as a
package-runner convenience, not as a runtime requirement for `wp-typia`.

`wp-typia <project-dir>` remains available as a backward-compatible alias to
`create` when `<project-dir>` is the only positional argument.

New scaffolds target WordPress 7.0 for generated `Tested up to` plugin headers
by default. Use `--wp-version 6.9` when you need the legacy 6.9 target. The
generated `Requires at least` header still follows the selected features' hard
floor instead of being raised only because the target is 7.0. Run
`wp-typia doctor --wp-version-check` in a workspace when you want an explicit
header check against generated block, ability, and AI feature metadata.

For an install outside package runners, use the standalone installers published
with each GitHub Release:

- macOS / Linux: `curl -fsSL https://github.com/imjlk/wp-typia/releases/latest/download/install-wp-typia.sh | sh`
- Windows: `irm https://github.com/imjlk/wp-typia/releases/latest/download/install-wp-typia.ps1 | iex`

### Built-in templates

| Template        | What it optimizes for                                                                |
| --------------- | ------------------------------------------------------------------------------------ |
| `basic`         | Minimal block scaffold with type sync and runtime validation                         |
| `interactivity` | The same foundation plus WordPress Interactivity API wiring                          |
| `persistence`   | Typed REST contracts, storage policy options, and data-backed block patterns         |
| `compound`      | Parent/child multi-block scaffolding with optional persistence on the parent layer   |
| `query-loop`    | `core/query` variation scaffolding with stable namespace identity and starter layout |

## What makes it different

### 1. Types are the source of truth

Update `src/types.ts`, then sync the WordPress-facing artifacts from that contract.

Generated outputs can include:

- `block.json`
- `typia.manifest.json`
- `typia-validator.php`
- optional `typia.schema.json`
- optional `typia.openapi.json`

Example:

```ts
import type { TextAlignment } from '@wp-typia/block-types/block-editor/alignment';
import { tags } from 'typia';

export interface MyBlockAttributes {
  content: string & tags.MinLength<1> & tags.MaxLength<1000> & tags.Default<''>;
  alignment?: TextAlignment & tags.Default<'left'>;
  isVisible?: boolean & tags.Default<true>;
}
```

### 2. Blocks can evolve without treating old content as disposable

`wp-typia` includes an opt-in migration workflow for projects that need to preserve compatibility over time.

With migration support enabled, you can:

- snapshot released schemas
- scaffold migration edges from older versions
- verify generated rules and fixtures
- preview and batch migration behavior from a dashboard-enabled project

Use `--with-migration-ui` when you want the scaffolded migration workspace from day one.

### 3. Data-backed blocks are first-class

When a block needs storage or API interaction, the `persistence` template adds a typed contract layer instead of leaving REST and validation as ad-hoc manual code.

Use it for:

- authenticated per-user actions
- public aggregate actions
- custom-table or post-meta-backed flows
- blocks that need both editor UX and runtime-safe API surfaces

### 4. Compound blocks are scaffolded as a system

The `compound` template creates a parent/child block structure with hidden implementation children, and the generated `add-child` workflow can now grow that into visible container children plus nested ancestor chains for richer document-style `InnerBlocks` hierarchies.

Workspace projects can also keep static nesting metadata in one typed contract.
Edit `BLOCK_NESTING` in `scripts/block-config.ts`, then run
`wp-typia sync --check` to verify generated `block.json` `parent`,
`ancestor`, and `allowedBlocks` fields still match the declared relationships.
Unknown workspace-local block references fail with actionable diagnostics before
artifacts are rewritten, while external WordPress or plugin blocks like
`core/group` remain valid relationship targets.
Default editor templates can live beside those rules in `BLOCK_TEMPLATES` or in
the optional `template` field on a nesting rule. `wp-typia sync` generates
`src/inner-blocks-templates.ts`, and `--check` verifies that nested template
tuples still obey the declared `allowedBlocks`, `parent`, and `ancestor` rules.
Configured `PATTERNS` files are also parsed during sync so shipped pattern
content cannot drift from the same nesting contract. Relationship violations
fail with the pattern file and serialized block path, while unknown or
unparseable block comments are reported as warnings instead of being rewritten.
The first validator intentionally reads serialized `<!-- wp:* -->` block
comment boundaries conservatively and does not execute dynamic PHP content.
The typed pattern catalog records `scope`, optional `sectionRole`, `tags`,
`thumbnailUrl`, and `contentFile` metadata so `wp-typia sync --check` can catch
duplicate slugs, missing pattern files, and invalid manifest metadata before
validating markup. Section-scoped patterns are also checked against their
serialized wrapper markers: by default, `core/group` wrappers can declare roles
with `section section--{role}` classes or `metadata.sectionRole` attributes.
The same validator accepts a custom marker convention when projects use a
different group-like wrapper block, class pattern, or metadata path.
For an end-to-end generic `example/container` → `example/section` → leaf block
family, see the Nesting Contracts Guide in `apps/docs/src/content/docs/guides`
and the checked fixture in `tests/fixtures/nested-block-family.ts`.

### 5. Query Loop variations get a first-class scaffold

The `query-loop` template scaffolds an editor-facing `core/query` variation plugin instead of a standalone block, so you can ship a branded inserter entry with stable namespace identity, default query settings, allowed inspector controls, and inline starter `innerBlocks` without rebuilding the full Query Loop setup flow by hand. Because it owns a variation rather than a standalone custom block, it intentionally does not generate `src/types.ts`, `block.json`, or Typia manifests. It also includes connected `src/patterns/*.php` presets so richer editorial layouts can live in pattern files while `src/index.ts` stays focused on variation identity and query defaults, a dedicated `src/query-extension.ts` seam for custom query params and optional editor-side hook registration, and `inc/query-runtime.php` hooks that keep frontend query mapping and editor preview requests aligned for the same variation.

Generic core block variations are available in official workspaces with
`wp-typia add core-variation <namespace/block> <name>`. Use this when you want
an opinionated preset for an existing core or third-party block, such as a
section wrapper based on `core/group` or a branded `core/paragraph` style, but
do not need a new custom block contract. The scaffold registers editor-side
attributes, `innerBlocks`, `isActive`, scope, and inserter metadata under
`src/editor-plugins/core-variations/` and intentionally skips `block.json` and
Typia manifests.

## Example flows

```bash
npx wp-typia create my-block --template basic --package-manager pnpm --yes --no-install
npx wp-typia create my-block --template basic --wp-version 6.9 --package-manager npm --yes --no-install
npx wp-typia create my-block --template interactivity --package-manager npm --yes --no-install
npx wp-typia create my-block --template persistence --data-storage custom-table --persistence-policy authenticated --package-manager bun --yes --no-install
npx wp-typia create my-block --template persistence --data-storage custom-table --persistence-policy public --package-manager npm --yes --no-install
npx wp-typia create my-block --template compound --package-manager bun --yes --no-install
npx wp-typia create my-block --template compound --persistence-policy public --package-manager npm --yes --no-install
npx wp-typia create my-books --template query-loop --query-post-type book --package-manager npm --yes --no-install
npx wp-typia create my-block --template basic --with-migration-ui --package-manager bun --yes --no-install
npx wp-typia create my-plugin --template workspace --profile plugin-qa --package-manager bun --yes --no-install
```

Empty workspace flow:

```bash
npx wp-typia create my-plugin --template workspace --package-manager bun --yes --no-install
cd my-plugin
bun install
bun run wp-typia:add block counter-card --template basic
bun run wp-typia:add block faq-stack --template compound --persistence-policy public --data-storage custom-table
bun run wp-typia:add integration-env local-smoke --wp-env --release-zip --service docker-compose
bun run wp-typia:add core-variation core/group section-hero
bun run wp-typia:add style callout-emphasis --block counter-card
bun run wp-typia:add transform quote-to-counter --from core/quote --to counter-card
bun run wp-typia:add binding-source hero-data
bun run wp-typia:add binding-source hero-data --block counter-card --attribute headline
bun run wp-typia:add contract external-retrieve-response --type ExternalRetrieveResponse
bun run wp-typia:add rest-resource snapshots --namespace my-plugin/v1 --methods list,read,create
bun run wp-typia:add rest-resource snapshots --namespace my-plugin/v1 --methods read,update --route-pattern '/snapshots/(?P<id>[\d]+)' --permission-callback my_plugin_can_manage_snapshots
bun run wp-typia:add rest-resource external-record --manual --namespace legacy/v1 --method GET --auth authenticated --route-pattern '/records/(?P<post_id>[\d]+)' --permission-callback legacy_can_read_records --controller-class Legacy\\Records\\Controller
bun run wp-typia:add rest-resource integration-settings --manual --namespace my-plugin/v1 --method POST --secret-field apiKey --secret-preserve-on-empty true
bun run wp-typia:add admin-view integration-settings --source rest-resource:integration-settings
bun run wp-typia:add post-meta integration-state --post-type post --type IntegrationStateMeta
bun run wp-typia:add binding-source integration-state-source --from-post-meta integration-state --meta-path status --block counter-card --attribute headline
bun run wp-typia:add editor-plugin review-workflow --slot sidebar
bun run wp-typia:add editor-plugin seo-notes --slot document-setting-panel
bun run wp-typia:add hooked-block counter-card --anchor core/post-content --position after
```

Official workspace templates install `wp-typia` as the local executable CLI and
generate stable package scripts so support packages are not mistaken for the
binary package:

| Package manager | Doctor                     | Sync check                         | Add a block                                                   |
| --------------- | -------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| npm             | `npm run wp-typia:doctor`  | `npm run wp-typia:sync -- --check` | `npm run wp-typia:add -- block counter-card --template basic` |
| pnpm            | `pnpm run wp-typia:doctor` | `pnpm run wp-typia:sync --check`   | `pnpm run wp-typia:add block counter-card --template basic`   |
| bun             | `bun run wp-typia:doctor`  | `bun run wp-typia:sync --check`    | `bun run wp-typia:add block counter-card --template basic`    |
| yarn            | `yarn run wp-typia:doctor` | `yarn run wp-typia:sync --check`   | `yarn run wp-typia:add block counter-card --template basic`   |

Existing workspaces can adopt the same policy without regenerating: add a
`wp-typia` devDependency pinned to the CLI version you want CI to execute, then
add `wp-typia:sync`, `wp-typia:doctor`, `wp-typia:doctor:workspace`, and
`wp-typia:add` scripts to `package.json`.

REST-heavy workspace releases should also run `sync-rest:package` before
building a zip and `sync-rest:package:check` in release CI. Those scripts copy
generated REST schemas into `inc/rest-schemas`, so runtime validation does not
depend on shipping TypeScript source directories.

Generated workspaces include `inc/rest-schema.php`, which exposes
plugin-prefixed helpers such as
`<phpPrefix>_get_wordpress_rest_schema( 'settings-response', array( 'resource' => 'settings' ) )`
and `<phpPrefix>_validate_and_sanitize_rest_payload(...)`. Custom PHP REST
resources can call those helpers to load packaged or source schemas, strip
fields WordPress REST does not need, and receive `WP_Error` responses for
missing or malformed schema files.

## Start here

- Want the smallest possible starting point? Start with `basic`.
- Need lightweight frontend behavior? Start with `interactivity`.
- Need data, REST, or persistence policies? Start with `persistence`.
- Need a parent/child block system? Start with `compound`.
- Need a branded Query Loop inserter variation? Start with `query-loop`.
- Need an empty workspace that will grow through `wp-typia add ...` workflows? Start with `--template workspace`.
- Need plugin QA from day one? Use `--template workspace --profile plugin-qa` for `.wp-env.json`, `.env.example`, a smoke starter, and release zip scripts; omit the profile for the minimal workspace shell.
- Need a local WordPress smoke starter later? Use `wp-typia add integration-env <name> --wp-env --release-zip` from a workspace.
- Need to describe a REST route owned by another plugin or legacy controller?
  Use `wp-typia add rest-resource <name> --manual` to generate TypeScript
  contracts, schemas, OpenAPI, and clients without PHP route glue. Use `--path`
  or `--route-pattern` for provider route shapes such as
  `/(?P<post_id>...)`; named captures are seeded into the starter query type so
  generated clients can fill path parameters. You may also declare
  `--permission-callback`, `--controller-class`, and `--controller-extends` as
  metadata for the external route owner.
- Need settings contracts that accept secrets without returning them? Add
  `--secret-field <field>` to a manual REST contract that has a request body,
  typically generated by `--method POST`, `PUT`, or `PATCH`. The request body
  gets `tags.Secret<"has<Field>">` and
  `tags.PreserveOnEmpty<true>` write-only metadata from
  `@wp-typia/block-runtime/typia-tags`, while the response scaffold exposes
  only a masked boolean such as `hasApiKey`. Use
  `--secret-has-value-field <field>` or `--secret-state-field <field>` to name
  that safe response indicator, and set `--secret-preserve-on-empty false` only
  when blank submissions should be sent through instead of preserving the stored
  credential.
- Need a typed settings screen for that contract? Run
  `wp-typia add admin-view <name> --source rest-resource:<manual-contract>`.
  Manual REST contracts with a request body scaffold a React form with loading,
  save, error, and secret-state messaging instead of a DataViews collection.
  Keep that generated path for singleton settings routes without path
  parameters or regex groups; use custom UI for per-record routes such as
  `/(?P<id>...)`.
- Need generated REST contracts to fit an existing controller or permission
  model? Add `--route-pattern`, `--permission-callback`, or `--controller-class`
  while keeping generated OpenAPI and client paths aligned.
- Need typed post meta as shared integration state? Use
  `wp-typia add post-meta <name> --post-type <post-type>` to generate a
  TypeScript shape, schema artifact, and `register_post_meta()` helper.
- Need a Block Bindings source backed by that typed meta? Use
  `wp-typia add binding-source <name> --from-post-meta <post-meta> --meta-path <field>`
  to read top-level schema fields with `get_post_meta()` and generated editor
  preview fallbacks. Nested meta paths are intentionally rejected for now; keep
  binding fields at the post-meta schema root.
- Need schema evolution for a long-lived block? Enable `--with-migration-ui`.
- Need smoke tests for external/manual payloads? Use `@wp-typia/block-runtime/schema-test`
  to assert responses against generated `*.schema.json` contract artifacts.

## Retrofitting Existing Projects

`wp-typia init` now exists as a **preview-only** retrofit planner for existing
plugins or block repos:

```bash
npx wp-typia init
```

Today that command does not write files yet. Instead it inspects the current
directory, reports the detected retrofit layout, and previews the minimum
dependency/script/file layer needed to adopt the typed `sync` / `doctor`
workflow incrementally.

The currently supported retrofit path is narrower:

- `wp-typia migrate init` bootstraps **migration support only**
- it expects an existing project that already matches supported first-party
  `wp-typia` block layouts
- it does not try to convert an arbitrary project into a full scaffolded
  `wp-typia` workspace

The broader project-level adoption path is tracked in
[Retrofit and Init Direction](RETROFIT_INIT_DIRECTION.md).

## Remote templates

`wp-typia` can scaffold from:

- built-in template ids
- local paths
- GitHub locators in the form `github:owner/repo/path[#ref]`
- npm package specs such as `@scope/create-block-template@latest`

When the source is an official external template config, `--variant <name>` is supported. If the config defines variants and no variant is passed, the first variant is selected automatically.

External configs can render either:

- a create-block-style subset via `blockTemplatesPath`
- a richer `wp-typia` template root via `pluginTemplatesPath`

The create-block subset adapter supports:

- `block.json`
- `src/index.*`, `src/edit.*`, `src/save.*`
- optional `render.php`
- style/editor/view assets

The richer `pluginTemplatesPath` route can seed broader plugin/workspace shapes such as editor plugins, REST resources, shared support files, and workspace migration participation when the rendered template declares `wpTypia.projectType: "workspace"`.

The remote source is treated as a seed. `wp-typia` still regenerates its own package setup, Typia sync flow, and runtime helpers around it.

External template configs execute trusted JavaScript (`index.js` / `index.cjs` / `index.mjs`) and can run a `transformer(view)` hook before normalization. Only use template sources you trust.
Remote template metadata, tarball downloads, and executable config loading now
run behind bounded timeout and size guards so malformed or hostile template
sources fail more directly instead of blocking the CLI indefinitely.
Remote npm templates with registry integrity metadata and GitHub templates with
resolvable remote revisions are cached under a private per-user local temp cache
so repeated scaffolds can reuse the same unpacked source. Set
`WP_TYPIA_EXTERNAL_TEMPLATE_CACHE=0` to force a refresh, or
`WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR=/path/to/cache` to place the cache in a
project- or CI-managed directory. Cache pruning is disabled by default; set
`WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_TTL_DAYS=7` to remove stale completed cache
entries older than the configured TTL during cache access, or call the exported
`pruneExternalTemplateCache()` helper from `@wp-typia/project-tools` for an
explicit cleanup pass. Pruning only removes guarded cache entry directories under
the configured cache root.

Remote template examples:

```bash
npx wp-typia create my-block --template ./local-template-dir --package-manager npm --yes --no-install
npx wp-typia create my-block --template github:owner/repo/path#main --package-manager npm --yes --no-install
npx wp-typia create my-block --template @scope/create-block-template --variant hero --package-manager npm --yes --no-install
```

## Documentation

- [Architecture Guide](https://imjlk.github.io/wp-typia/guides/architecture/)
- [Block Generator Architecture](https://imjlk.github.io/wp-typia/architecture/block-generator-architecture/)
- [Block Generator Tool Contract](https://imjlk.github.io/wp-typia/architecture/block-generator-tool-contract/)
- [External Template-Layer Composition RFC](https://imjlk.github.io/wp-typia/architecture/external-template-layer-composition/)
- [API Guide](https://imjlk.github.io/wp-typia/reference/api/)
- [Migration Guide](https://imjlk.github.io/wp-typia/guides/migrations/)
- [Retrofit and Init Direction](RETROFIT_INIT_DIRECTION.md)
- [Error and Export Contract Guide](https://imjlk.github.io/wp-typia/reference/error-export-contracts/)
- [Formatting Toolchain Policy](https://imjlk.github.io/wp-typia/maintainers/formatting-toolchain-policy/)
- [Core Data Adapter Boundary](https://imjlk.github.io/wp-typia/maintainers/core-data-adapter-boundary/)
- [Maintenance Automation Policy](https://imjlk.github.io/wp-typia/maintainers/maintenance-automation-policy/)
- [Package Manifest Policy](https://imjlk.github.io/wp-typia/maintainers/package-manifest-policy/)
- [Scaffold Toolchain Policy](https://imjlk.github.io/wp-typia/maintainers/scaffold-toolchain-policy/)
- [TypeScript Strictness Policy](https://imjlk.github.io/wp-typia/maintainers/typescript-strictness-policy/)
- [Upgrade Guide](UPGRADE.md)
- [License](LICENSE)
- [Security Policy](SECURITY.md)
- [Interactivity Guide](https://imjlk.github.io/wp-typia/guides/interactivity/)
- [Examples Guide](examples/EXAMPLES.md)
- [Package Graduation](https://imjlk.github.io/wp-typia/maintainers/package-graduation/)
- [Union Support Guide](https://imjlk.github.io/wp-typia/guides/union-support/)
- [Basic Block Tutorial](https://imjlk.github.io/wp-typia/tutorials/basic-block-tutorial/)
- [Compound Block Tutorial](https://imjlk.github.io/wp-typia/tutorials/compound-block-tutorial/)
- [Contributing Guide](CONTRIBUTING.md)

## Maintainer Quick Commands

```bash
bun run lint:repo
bun run lint:fix
bun run format:check
bun run format:write
bun run test:repo:fast
bun run ci:local
```

- `bun run lint:repo` checks the root ESLint scope for repo-owned infrastructure files
- `bun run lint:fix` applies JavaScript ESLint fixes followed by TypeScript `ttsc fix`
- `bun run format:check` runs the non-mutating Prettier gate for repo-owned non-TypeScript files
- `bun run format:write` runs `ttsc format` for TypeScript and Prettier for repo-owned non-TypeScript files
- `bun run test:repo:fast` runs the no-build source and policy lane for lightweight local feedback
- `bun run ci:local` keeps the non-E2E maintainer preflight aligned with CI

## Reference Apps

[`examples/my-typia-block`](examples/my-typia-block) is the repo-local kitchen-sink reference app. It is not a built-in template. It is the place where richer Typia, migration, and editor patterns live together:

- server rendering with `render.php`
- migration snapshots and dashboard preview tooling
- richer Typia tags and semantic block types
- interactivity and validator patterns used by E2E and fixture tests

[`examples/persistence-examples`](examples/persistence-examples) is the runtime reference for persistence policies. It demonstrates:

- a public aggregate counter backed by signed short-lived write tokens
- an authenticated per-user like button backed by a custom table
- multi-block plugin registration from one example workspace

[`examples/compound-patterns`](examples/compound-patterns) is the runtime reference for compound parent/child scaffolds. It demonstrates:

- a single top-level parent block with `InnerBlocks`
- a hidden implementation child block constrained by `parent`
- template-seeded internal items that survive save and reopen cycles

If you want to see the “everything included” shape of `wp-typia`, start with `my-typia-block`. If you want to study persistence policy behavior, start with `persistence-examples`. If you want to scaffold parent/child `InnerBlocks` structures, start with `compound-patterns`.

## Packages

- [`wp-typia`](https://www.npmjs.com/package/wp-typia) as the canonical CLI package
- [`@wp-typia/create-workspace-template`](https://www.npmjs.com/package/@wp-typia/create-workspace-template) as the official empty workspace template package
- [`@wp-typia/project-tools`](https://www.npmjs.com/package/@wp-typia/project-tools) as the canonical programmatic project orchestration package
- [`@wp-typia/block-types`](https://www.npmjs.com/package/@wp-typia/block-types)
- [`@wp-typia/rest`](https://www.npmjs.com/package/@wp-typia/rest)
- [`@wp-typia/api-client`](https://www.npmjs.com/package/@wp-typia/api-client)
- [`@wp-typia/dataviews`](https://www.npmjs.com/package/@wp-typia/dataviews) as the opt-in DataViews compatibility contract for generated admin screens
- [`@wp-typia/block-runtime`](https://www.npmjs.com/package/@wp-typia/block-runtime) as the current graduation prototype for defaults/editor/validation helpers
- [`@wp-typia/ttsc-lint-plugin-wp`](https://www.npmjs.com/package/@wp-typia/ttsc-lint-plugin-wp) for WordPress-specific native `@ttsc/lint` rules and preset compatibility

## Project Structure

```text
wp-typia/
├── packages/
│   ├── wp-typia/               # Canonical CLI package
│   ├── create-workspace-template/ # Official empty workspace template package
│   ├── wp-typia-api-client/    # Backend-neutral generated API client runtime
│   ├── wp-typia-block-runtime/ # Prototype block runtime facade package
│   ├── wp-typia-dataviews/     # Opt-in DataViews compatibility contract
│   ├── ttsc-lint-plugin-wp/    # Native WordPress ttsc lint contributor
│   ├── wp-typia-rest/          # Typed REST client helpers
│   └── wp-typia-block-types/   # Shared semantic block types
├── examples/
│   ├── my-typia-block/         # Kitchen-sink reference app
│   ├── persistence-examples/   # Persistence policy reference plugin
│   └── compound-patterns/      # Compound parent/child reference plugin
├── tests/
├── apps/docs/
└── .github/
```

## Repository Development

The repository itself stays Bun-first even though generated projects can use `bun`, `npm`, `pnpm`, or `yarn`.

```bash
mise trust
mise install
mise exec -- bun install --frozen-lockfile
bun run lint:repo
bun run format:check
bun run maintenance-automation:validate
bun run toolchain-policy:validate
bun run typecheck
bun run test:repo:fast
bun run test:repo
bun run build
bun run ci:local
bun run examples:test:e2e
```

Without mise, install the Bun and Node.js versions declared in `mise.toml`, then
run `bun install --frozen-lockfile` directly. PHP 8.1 remains the primary
maintainer lint baseline without forcing a local source build through mise.
Generated-project smoke jobs separately provision PHP 8.0 and syntax-check every
emitted PHP file against the scaffold's declared `Requires PHP: 8.0` floor.

`ttsc` and `@ttsc/lint` own TypeScript/TSX type, lint, unused, and formatting
diagnostics. Root ESLint covers JavaScript, CJS, and MJS infrastructure such as
`scripts/**`, root config files, and package-side non-example sources. WordPress
examples run `check:code`, which applies the compiled WordPress preset to both
TypeScript and JavaScript through `ttsc check --noEmit`; their separate style
gate remains powered by `@wordpress/scripts`.

TypeScript/TSX uses the shared `ttsc` formatter contract. Repository-owned
non-TypeScript docs/config/workflow files use a shared `Prettier 3.8.2`
baseline. `bun run typecheck`, `bun run format:check`, and
`bun run formatting-policy:validate` are part of both the maintainer preflight
and the GitHub Actions lint gate. See the
[Formatting Toolchain Policy](https://imjlk.github.io/wp-typia/maintainers/formatting-toolchain-policy/) for the
explicit scope and rationale.

Repository maintenance automation is explicit too. Dependabot currently owns
GitHub Actions and Composer update PRs on `main`, while Bun/npm workspace
dependency bumps stay maintainer-led until we have release-aware bot support.
Composer audit now gates PRs and `main`, while the broader Bun audit stays on a
scheduled/manual maintenance lane until the JS toolchain baseline is narrower
and more actionable. See the
[Maintenance Automation Policy](https://imjlk.github.io/wp-typia/maintainers/maintenance-automation-policy/) for the
chosen review posture and release interaction rules.

Example-specific commands live under the `examples:*` namespace:

```bash
bun run examples:build
bun run examples:dev
bun run examples:lint
bun run examples:test:e2e
```

`bun run ci:local` is the recommended maintainer pre-PR command. It mirrors the
fast CI path for changesets, publish validation, linting, typechecking, tests,
and builds, but intentionally excludes `wp-env` startup and Playwright E2E.
For the quickest no-build loop before that full preflight, use
`bun run test:repo:fast`; it keeps policy/source package coverage while leaving
example Webpack builds, generated-project smoke, package-contract builds, and
E2E in the broader lanes.

Command map:

| Command                                   | What it targets                                    |
| ----------------------------------------- | -------------------------------------------------- |
| `bun run lint:repo`                       | Root ESLint for JavaScript/CJS/MJS infrastructure  |
| `bun run lint:all`                        | Root ESLint, example linting, and PHP checks       |
| `bun run typecheck`                       | `ttsc` type, lint, unused, and TS format gate      |
| `bun run format:check`                    | Prettier check for repo-owned non-TypeScript files |
| `bun run formatting-policy:validate`      | Validates the documented formatter/toolchain gate  |
| `bun run maintenance-automation:validate` | Validates Dependabot and audit workflow policy     |
| `bun run test:repo:fast`                  | No-build source and policy feedback lane           |
| `bun run test:repo`                       | Root unit and CLI test aggregation                 |
| `bun run test:all`                        | Legacy alias for `test:repo` (still no E2E)        |
| `bun run ci:local`                        | Fast maintainer preflight without E2E/wp-env       |
| `bun run build`                           | Product packages and the repo-local reference app  |
| `bun run examples:build`                  | Reference app only                                 |
| `bun run --filter wp-typia test`          | Canonical CLI package checks                       |
| `bun run examples:test:e2e`               | Playwright against the reference app               |

## License

GPL-2.0-or-later. See [LICENSE](LICENSE) for details.
