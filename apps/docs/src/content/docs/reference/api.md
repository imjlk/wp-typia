---
title: 'API Guide'
---

This repository has multiple published surfaces with different stability and
onboarding expectations.

## API Tiers

- Core API
  The primary [`/api/readme/`](/api/readme/) reference for application-facing
  helpers, generated project runtime entrypoints, and the main happy-path
  imports.
- Advanced Helpers
  The [`/api/advanced/readme/`](/api/advanced/readme/) reference for
  lower-level `block-runtime` helper subpaths such as metadata parsing,
  projection, PHP rendering, and inspector building blocks.
- Internal APIs
  The [`/api/internal/readme/`](/api/internal/readme/) reference for
  `@wp-typia/api-client/internal/*` utilities that are published for advanced
  composition but are not positioned as the default app-facing import path.

The advanced and internal sections are documented so maintainers and power users
can understand the published surface area, but they should be treated as
secondary imports compared with the core package roots and primary subpaths.

## Package Map

- `wp-typia`
  Canonical CLI package.
- `@wp-typia/project-tools`
  Project orchestration package for scaffold, add, migrate, template, doctor,
  package-manager, starter-manifest helpers, and the typed generator
  boundary (`BlockSpec`, `BlockGeneratorService`, `inspectBlockGeneration`).
  Generated AI-capable scaffold headers, runtime gates, and workspace inventory
  metadata are described in
  [`docs/ai-scaffold-compatibility.md`](./ai-scaffold-compatibility.md).
- `@wp-typia/project-tools/schema-core`
  Project schema/OpenAPI helpers.
- `@wp-typia/project-tools/ai-artifacts`
  Opt-in WordPress AI artifact sync helpers (`*.ai.schema.json`,
  `*.abilities.json`).
- `@wp-typia/project-tools/typia-llm`
  Opt-in build-time `typia.llm` adapter emitter for downstream TypeScript-first
  tool/function consumers.
- `@wp-typia/block-runtime`
  Generated-project runtime helper root.
- `@wp-typia/block-runtime/migration-types`
  Shared manifest and migration contract types.
- `@wp-typia/block-runtime/schema-core`
  Shared schema/OpenAPI helpers.
- `@wp-typia/block-runtime/schema-test`
  Test helpers for validating smoke/integration response payloads against
  generated JSON Schema artifacts.
- `@wp-typia/block-runtime/typia-tags`
  Type-only Typia tag namespace that includes wp-typia metadata tags such as
  `Secret`, `WriteOnly`, `Source`, and `Selector`.
- `@wp-typia/block-runtime/metadata-core`
  Metadata sync and endpoint manifest helpers.
- `@wp-typia/block-runtime/metadata-analysis`
  TypeScript metadata analysis helpers used by advanced generators and
  validators.
- `@wp-typia/block-runtime/metadata-model`
  Schema and manifest model types shared by metadata tooling.
- `@wp-typia/block-runtime/metadata-parser`
  TypeScript AST parsing helpers for manifest generation.
- `@wp-typia/block-runtime/metadata-php-render`
  PHP validator rendering helpers built from manifest documents.
- `@wp-typia/block-runtime/metadata-projection`
  Manifest and `block.json` projection helpers for generated artifacts.
- `@wp-typia/block-runtime/identifiers`
  Runtime identifier helpers for generated projects.
- `@wp-typia/block-runtime/inspector`
  React-facing inspector helpers for manifest-driven editor controls.
- `@wp-typia/block-runtime/json-utils`
  JSON cloning helpers used by manifest and projection utilities.
- `@wp-typia/dataviews`
  Opt-in generated admin screen compatibility contracts for WordPress
  DataViews and DataForm integrations.
- `@wp-typia/api-client/internal/runtime-primitives`
  Advanced/internal validation normalization helpers shared by transport
  adapters.

## 1. `wp-typia`

The CLI is the primary entrypoint for new users.

```bash
bunx wp-typia create my-block
npx wp-typia create my-block
```

For command-by-command usage and flags, see the
[CLI Reference](./cli.md).

Common commands:

```bash
wp-typia create my-block --template basic --package-manager bun --yes --no-install
wp-typia add block counter-card --template basic
wp-typia add variation hero-card --block counter-card
wp-typia add pattern hero-layout
wp-typia add binding-source hero-data
wp-typia add binding-source hero-data --block counter-card --attribute headline
wp-typia add hooked-block counter-card --anchor core/post-content --position after
wp-typia templates list
wp-typia templates inspect basic
wp-typia doctor
```

Run `wp-typia add` from the workspace root after `cd`-ing into the generated project.

Built-in templates currently include `basic`, `interactivity`, `persistence`, and `compound`.

Generated built-in projects now scaffold starter `typia.manifest.json` files so
editor/runtime imports resolve before the first sync, use `dev` as the primary
watch workflow, and can opt into local presets with `--with-wp-env` and
`--with-test-preset`. They can also opt into the migration dashboard/runtime
bundle with `--with-migration-ui`.

The positional `wp-typia <project-dir>` form remains available as a backward-compatible alias to `create` when `<project-dir>` is the only positional argument.

Official empty workspace flow:

```bash
wp-typia create my-plugin --template @wp-typia/create-workspace-template --package-manager bun --yes --no-install
cd my-plugin
wp-typia add block counter-card --template basic
wp-typia add variation hero-card --block counter-card
wp-typia add pattern hero-layout
wp-typia add binding-source hero-data
wp-typia add binding-source hero-data --block demo-space/counter-card --attribute headline
wp-typia add hooked-block counter-card --anchor core/post-content --position after
wp-typia add block faq-stack --template compound --persistence-policy public --data-storage custom-table
```

`persistence` also accepts:

```bash
wp-typia create my-block --template persistence --data-storage custom-table --persistence-policy authenticated --package-manager bun --yes --no-install
wp-typia create my-block --template persistence --data-storage custom-table --persistence-policy public --package-manager npm --yes --no-install
wp-typia create my-block --template persistence --package-manager npm --with-wp-env --with-test-preset --yes --no-install
wp-typia create my-block --template basic --with-migration-ui --package-manager bun --yes --no-install
```

`compound` accepts the same persistence flags, but treats them as an optional parent-only layer:

```bash
wp-typia create my-block --template compound --package-manager bun --yes --no-install
wp-typia create my-block --template compound --persistence-policy authenticated --package-manager bun --yes --no-install
wp-typia create my-block --template compound --data-storage post-meta --package-manager npm --yes --no-install
```

Remote template MVP:

```bash
wp-typia create my-block --template ./local-template-dir --package-manager npm --yes --no-install
wp-typia create my-block --template github:owner/repo/path#main --package-manager npm --yes --no-install
wp-typia create my-block --template @scope/create-block-template --variant hero --package-manager npm --yes --no-install
```

`--variant` only applies to official external template configs. If a config defines variants and `--variant` is omitted, the first variant becomes the default.

External configs can render either a create-block subset through
`blockTemplatesPath` or a richer `wp-typia` template root through
`pluginTemplatesPath`. Workspace-shaped richer templates can participate in the
same migration capability flow when they render `wpTypia.projectType:
"workspace"` in their `package.json.mustache`.

Security note: external template configs are trusted JavaScript and are executed during scaffold normalization. Treat local paths, GitHub locators, and npm package templates with the same trust model as `@wordpress/create-block`.
Remote metadata fetches, tarball downloads, and executable config loading now
run behind bounded timeout and size guards so malformed or hostile sources fail
directly instead of hanging the CLI indefinitely.
Remote npm templates with registry integrity metadata and GitHub templates with
resolvable remote revisions are cached in a private per-user local directory
after those guards pass. Use `WP_TYPIA_EXTERNAL_TEMPLATE_CACHE=0` when you need
a forced refresh, or set `WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR` to move the
cache into a CI-controlled directory.

That remote-template support is still seed-oriented. Reusable external layer
packages on top of the built-in shared scaffold graph are now implemented
through the canonical built-in CLI flags and the built-in generator runtime API
(`externalLayerSource` and optional `externalLayerId`). The layer contract
record lives in
[`docs/external-template-layer-composition.md`](../architecture/external-template-layer-composition.md).

Migration commands remain available inside migration-capable projects such as [`examples/my-typia-block`](https://github.com/imjlk/wp-typia/tree/main/examples/my-typia-block):

```bash
wp-typia migrate init --current-migration-version v1
wp-typia migrate wizard
wp-typia migrate plan --from-migration-version v1
wp-typia migrate snapshot --migration-version v1
wp-typia migrate doctor --all
wp-typia migrate diff --from-migration-version v1
wp-typia migrate scaffold --from-migration-version v1
wp-typia migrate fixtures --all --force
wp-typia migrate verify --all
wp-typia migrate fuzz --all --iterations 25 --seed 1
```

For broader existing-project adoption, `wp-typia init [project-dir]` now acts as
a preview-only retrofit planner. It detects supported single-block and
multi-block layouts, then prints the minimum dependency, script, generated
artifact, and follow-up command surface that a future write mode will apply.

For older projects, `wp-typia migrate init --current-migration-version <label>` now
auto-detects supported retrofit layouts:

- single-block projects using `src/block.json`, `src/types.ts`, and `src/save.tsx`
- legacy single-block projects still using root `block.json` plus `src/types.ts`
  and `src/save.tsx`
- multi-block projects using `src/blocks/*/block.json`

When `src/blocks/*` is detected, `migration:init` writes `src/migrations/config.ts`
with `blocks: []` entries for every discovered block target, including scaffolded
hidden compound child blocks.

Migration versions now use strict schema labels like `v1`, `v2`, and `v3`.
Those labels are separate from your package version, plugin version, OpenAPI
`info.version`, PHP storage version options, and block attribute
`schemaVersion`.

Older semver-based migration workspaces are now a breaking reset. If a project
still uses `currentVersion`, `supportedVersions`, or semver-named migration
artifacts under `src/migrations/`, back up that folder if needed, remove or
reset it, and rerun `wp-typia migrate init --current-migration-version v1`.

Migration-capable projects now also expose two read-only preview paths before
you scaffold anything:

- `wp-typia migrate wizard`: TTY-only guided legacy migration version selection
- `wp-typia migrate plan --from-migration-version <label>`: scriptable preview when you already know the migration edge

Both commands preview one selected edge across every eligible block target,
list skipped targets that do not have the selected snapshot yet, and stop after
printing the next commands to run. They do not write rules, fixtures, or
snapshots.

When a built-in scaffold uses `--with-migration-ui`, the generated project is
already initialized at `v1`, includes `src/admin/migration-dashboard.tsx`,
and writes `src/migrations/config.ts` in the newer multi-block shape:

```ts
export const migrationConfig = {
  currentMigrationVersion: 'v1',
  supportedMigrationVersions: ['v1'],
  snapshotDir: 'src/migrations/versions',
  blocks: [
    {
      key: 'my-block',
      blockName: 'create-block/my-block',
      blockJsonFile: 'src/block.json',
      manifestFile: 'src/typia.manifest.json',
      saveFile: 'src/save.tsx',
      typesFile: 'src/types.ts',
    },
  ],
} as const;
```

Compound scaffolds use the same config shape but seed both the parent block and
the scaffolded hidden child block as migration-capable targets. `migrate init`
remains the retrofit command for older projects that were not scaffolded with
`--with-migration-ui`. Add `--all` to migration verification, fixture refresh,
and fuzzing commands when you want to cover every configured legacy migration version and
every configured block target in that workspace.

`wp-typia doctor` is the lightweight read-only check for environment readiness,
workspace inventory consistency, shared conventions, current source-tree
artifact drift, and iframe/API v3 compatibility readiness for workspace blocks.
Iframe compatibility findings are emitted as non-failing `WARN` rows with
machine-readable codes, so CI and IDE integrations can surface them without
blocking unrelated checks. `wp-typia migrate doctor --all` is the deep migration
audit for migration-enabled workspaces. It validates migration target alignment,
snapshots, generated migration artifacts, and fixture coverage.

In non-interactive shells, `wp-typia create`, `add`, `migrate`, and `doctor`
now share the same summary-first failure layout. Root `doctor` still streams
PASS/WARN/FAIL check rows plus a final summary, while the other commands render
the shared diagnostic block only when they fail.

Compatibility note: `@wp-typia/project-tools` is the canonical programmatic package, `wp-typia` is the canonical CLI package, and `@wp-typia/block-runtime/*` is the maintained generated-project runtime helper surface.

Deprecated synchronous helper policy: the `@wp-typia/project-tools` root still
exports compatibility helpers such as `readWorkspaceInventory()` and
`getWorkspaceBlockSelectOptions()`, while lower-level template-source modules
still expose `getExternalTemplateEntry()`, `getDefaultCategory()`, and
`getTemplateProjectType()`. Prefer the async replacements
`readWorkspaceInventoryAsync()`, `getWorkspaceBlockSelectOptionsAsync()`,
`findExternalTemplateEntry()`, `getDefaultCategoryAsync()`, and
`getTemplateProjectTypeAsync()` for new async command paths. These synchronous
helpers follow the same policy: Removal target: not currently scheduled. If
removal is scheduled, the release notes will name the target version first.

For the current generator architecture boundary, including the staged
`BlockSpec` / `BlockGeneratorService` contract, the current phase status, and
the split between emitter-owned built-in artifacts and Mustache-owned shared
project/bootstrap assets, see:

- [`docs/block-generator-architecture.md`](../architecture/block-generator-architecture.md)
- [`docs/block-generator-service.md`](../architecture/block-generator-service.md)
- [`docs/block-generator-tool-contract.md`](../architecture/block-generator-tool-contract.md)
- [`docs/external-template-layer-composition.md`](../architecture/external-template-layer-composition.md)

## 2. `@wp-typia/block-types`

Generated projects can import shared semantic unions, block support metadata
types, and support-generated style attribute helpers directly in `src/types.ts`
and registration modules.

```ts
import type { TextAlignment } from '@wp-typia/block-types/block-editor/alignment';
import type { BlockConfiguration } from '@wp-typia/block-types/blocks/registration';
import type { BlockStyleSupportAttributes } from '@wp-typia/block-types/block-editor/style-attributes';
import type { BlockSupports } from '@wp-typia/block-types/blocks/supports';
```

The registration facade is locally owned and currently targets the generated
project minimum `@wordpress/blocks@^15.2.0` / `@types/wordpress__blocks@^12.5.18`
baseline.

## 3. `@wp-typia/rest`

`@wp-typia/rest` provides typed client-side helpers for WordPress REST usage:

- `createValidatedFetch<T>()`
- `createEndpoint<Req, Res>()`
- `callEndpoint<Req, Res>()`
- `defineRestResource(...)`
- `defineRestResourceListQuery(...)`
- `toRestResourceListRequest(...)`
- `resolveRestRouteUrl(routePath, root?)`
- `createQueryDecoder<T>()`
- `createHeadersDecoder<T>()`

The package stays TypeScript-side only. WordPress/PHP route registration and schema bridging remain generated by `@wp-typia/project-tools`.

Use it when the consumer should understand WordPress REST root discovery and
nonce-aware request wiring.

Export semantics:

- `@wp-typia/rest` is the canonical convenience surface
- `@wp-typia/rest/client` is the focused transport/runtime surface
- `@wp-typia/rest/http` is the focused decoder surface
- `@wp-typia/rest/react` is the React cache/hook layer

The root package stays the convenience entry that combines transport and
decoder helpers. Reach for `./client` or `./http` when that narrower boundary
helps readability, while React/data helpers continue to live under the
separate `@wp-typia/rest/react` subpath:

- `createEndpointDataClient()`
- `EndpointDataProvider`
- `useEndpointDataClient()`
- `useEndpointQuery(endpoint, request, options?)`
- `useEndpointMutation(endpoint, options?)`
- `useRestResourceListQuery(resource, request, options?)`
- `useRestResourceReadQuery(resource, request, options?)`
- `useRestResourceCreateMutation(resource, options?)`
- `useRestResourceUpdateMutation(resource, options?)`
- `useRestResourceDeleteMutation(resource, options?)`

That hook layer is built directly on `callEndpoint(...)`, not on an external
query library. `useEndpointQuery(...)` is GET-only in this first pass, while
mutations and explicit non-query calls go through `useEndpointMutation(...)`.

When a screen should think in terms of a resource rather than five unrelated
endpoint functions, group the existing contracts with `defineRestResource(...)`.
The facade is intentionally additive: it preserves the original endpoint
contracts under `resource.endpoints`, exposes convenience methods such as
`resource.list(request)` and `resource.update(request)`, and can carry an
optional typed `listQuery` bridge for consumers such as DataViews adapters
without making `@wp-typia/rest` depend on `@wp-typia/dataviews`.

Refresh-sensitive auth remains explicit there:

- query hooks re-run `resolveCallOptions()` on each execution so REST nonce
  readers can fetch the latest value at request time
- mutation hooks use the latest mutation variables and the latest
  `resolveCallOptions(variables)` so public signed-token payloads can be passed
  in explicitly
- there is no built-in automatic retry when nonce or token state is stale; the
  caller refreshes state and then invokes `refetch()` or `mutate()` again

Error contract:

- validation failures stay in `EndpointValidationResult<Req, Res>`
- caller/configuration faults throw `RestConfigurationError`,
  `RestRootResolutionError`, or `RestQueryHookUsageError`
- assertion APIs may throw `RestValidationAssertionError`

## 4. `@wp-typia/api-client`

`@wp-typia/api-client` is the transport-neutral sibling to `@wp-typia/rest`.

- `createEndpoint<Req, Res>()`
- `callEndpoint<Req, Res>()`
- `WpTypiaContractError`
- `ApiClientConfigurationError`
- `WpTypiaValidationAssertionError`

For the repo-level contract that explains when runtime APIs should return
validation unions vs. throw named errors, and how `@wp-typia/rest` subpaths are
classified, see [`docs/error-export-contracts.md`](./error-export-contracts.md).

- `createFetchTransport({ baseUrl })`
- `withHeaders(transport, headers)`
- `withComputedHeaders(transport, resolveHeaders)`
- `withHeaderValue(transport, headerName, resolveValue)`
- `withBearerToken(transport, resolveToken)`
- `toValidationResult(...)`

It does not include WordPress route resolution, `wpApiSettings`, or
`@wordpress/api-fetch`. Generated persistence contracts can emit a portable
`src/api-client.ts` module through `syncEndpointClient(...)` in
`@wp-typia/block-runtime/metadata-core`. In persistence-style scaffolds, that
generated module is the canonical endpoint-definition artifact, while
WordPress-facing `src/api.ts` composes those generated endpoint exports to add
WordPress route resolution and nonce/header behavior.

The hosted Internal APIs section also documents
`@wp-typia/api-client/internal/runtime-primitives`. That subpath is published
for advanced composition and adapter work, but it remains explicitly
internal-by-name rather than a primary onboarding surface.

When a manifest endpoint defines both `queryContract` and `bodyContract`, the
portable generated client now uses a `{ query, body }` request envelope and
marks the generated endpoint with `requestLocation: 'query-and-body'`.
This support is currently limited to the portable client/runtime path; other
internal manifest consumers such as `typia.llm` and WordPress AI projections
still reject mixed query/body inputs.

These header/auth decorators remain optional and adapter-level. They do not
turn manifest `auth` or legacy `authMode` metadata into automatic
runtime behavior, and they do not replace WordPress-specific route resolution
or nonce-aware ergonomics from `@wp-typia/rest`.

For new manifests, backend-neutral auth intent is the primary contract
surface:

- `auth: "public"`
- `auth: "authenticated"`
- `auth: "public-write-protected"`

WordPress-specific auth remains an optional overlay via `wordpressAuth`, such
as `{ mechanism: "rest-nonce" }` or
`{ mechanism: "public-signed-token", publicTokenField: "publicWriteToken" }`.
Legacy `authMode` is still accepted for compatibility, but it is now adapter
metadata rather than the primary authored meaning.

## 5. `@wp-typia/block-runtime`

`@wp-typia/block-runtime` is the normative generated-project runtime package for
shared block helpers, while `@wp-typia/block-runtime/metadata-core` owns the
generated-project TypeScript-to-metadata sync and REST/OpenAPI/client codegen
surface.

It currently exports:

- block registration and webpack helpers
- defaults helpers
- editor model helpers
- inspector helpers
- validation-aware attribute update helpers

The root `@wp-typia/block-runtime` export does not include `metadata-core` or
`schema-core` directly. Those stay on explicit subpaths, and this package is
now the canonical scaffold import target for generated projects.

Recent refactors keep those public subpaths stable while splitting their
implementation into smaller focused modules:

- `@wp-typia/block-runtime/inspector` stays the public inspector facade, while
  its implementation now delegates to focused types, model, and controls
  modules.
- `@wp-typia/block-runtime/metadata-core` stays the public sync/codegen facade,
  while artifact normalization, client rendering, and sync routines now live in
  focused helpers behind that facade.
- `@wp-typia/block-runtime/schema-core` stays the public schema/OpenAPI facade,
  while auth normalization, document generation, and projection helpers now sit
  underneath it.

Those splits improve ownership and maintainability without changing the
supported import paths. For lower-level helper entrypoints that sit adjacent to
these facades, use the hosted Advanced Helpers section under `/api/advanced/`.

## 6. Generated project runtime

Each scaffolded project exposes a few predictable files:

- `src/types.ts`: source of truth for the current attribute contract
- `src/validators.ts`: Typia runtime helpers such as `validate`, `assert`, `is`, `random`, `clone`, and `prune`
- `block.json`: WordPress-facing metadata projection
- `typia.manifest.json`: manifest v2 with explicit default markers and supported discriminated union metadata
- `typia-validator.php`: generated PHP validator for the supported server-side subset
- optional `typia.schema.json` / `typia.openapi.json` when schema output is enabled

The `types.ts -> block.json` projection can now also carry WordPress extraction
metadata for top-level string attributes via `tags.Source<"html" | "text" |
"rich-text">` plus `tags.Selector<"...">`.

Generated projects now expose `sync` as the common-case metadata refresh
entrypoint, with `sync-types` still available for advanced/manual runs. `sync`
supports `--check` for verification runs and `--dry-run` for command previews
without executing the generated sync scripts, while still orchestrating the
same generated sync steps that `build`, `start`, and `typecheck` expect when it
does run. `sync-types` stays warn-only by default, supports `-- --fail-on-lossy`
when CI should fail only on lossy WordPress projections, and supports
`-- --strict --report json` when CI should fail on all warnings while reading a
machine-friendly JSON report from stdout. Hard source-analysis and unsupported
type failures still exit non-zero regardless of mode.

Opt-in AI artifact flows can now also expose `sync-ai` and be driven through
`wp-typia sync ai` without introducing new default runtime dependencies. The
supported project-tooling facade for those helpers is
`@wp-typia/project-tools/ai-artifacts`, which currently covers manifest-driven
`*.ai.schema.json` and `*.abilities.json` generation for the WordPress AI path.

The separate `@wp-typia/project-tools/typia-llm` facade is the supported
build-time adapter target for downstream `typia.llm` consumers. It renders the
generated TypeScript module from endpoint manifests and canonical contract
types, then lets the consuming project compile that module with Typia and
project JSON-friendly application or structured-output artifacts. This path is
explicitly separate from `wp-typia sync ai` and does not add `typia.llm` to
generated WordPress plugin runtime code.

If you need the same behavior programmatically, `@wp-typia/block-runtime/metadata-core`
also exposes `runSyncBlockMetadata(...)` alongside the lower-level
`syncBlockMetadata(...)`, plus `syncEndpointClient(...)` for portable endpoint
client generation from a manifest-first REST surface.

`metadata-core` remains the public facade for that workflow even though its
implementation is now split across artifact path handling, client rendering, and
sync routine helpers. Callers should keep importing the documented subpath
instead of reaching into those focused modules directly.

Generated projects can also import shared runtime helpers from `@wp-typia/block-runtime`:

- `@wp-typia/block-runtime/blocks`
- `@wp-typia/block-runtime/defaults`
- `@wp-typia/block-runtime/validation`
- `@wp-typia/block-runtime/editor`
- `@wp-typia/block-runtime/identifiers`
- `@wp-typia/block-runtime/typia-tags`

Use `@wp-typia/block-runtime/metadata-core` for metadata sync and
`@wp-typia/block-runtime/*` for generated-project runtime helpers.

`runtime/identifiers` now also includes duplicate-safe persistent-id lifecycle
helpers for structured document blocks. Use
`collectPersistentBlockIdentityRepairs(...)` when you already have a plain block
tree and need deterministic repair patches without React.

`runtime/blocks` is the shared generated-project surface for scaffold-owned
block registration helpers and webpack artifact/config adapters.

It now also exports typed registration metadata/settings surfaces so generated
projects can pass `supports` without dropping to `unknown`:

```ts
import {
  buildScaffoldBlockRegistration,
  type ScaffoldBlockMetadata,
} from '@wp-typia/block-runtime/blocks';
```

When you manually import schema helpers, prefer
`@wp-typia/project-tools/schema-core`, `@wp-typia/project-tools/ai-artifacts`,
`@wp-typia/project-tools/typia-llm`, or the root `@wp-typia/project-tools`
exports such as `projectJsonSchemaDocument()`.

For the normative generated-project runtime import policy, see
[`docs/runtime-import-policy.md`](../architecture/runtime-import-policy.md). For the broader
repo-backed audit, see [`docs/runtime-surface.md`](../architecture/runtime-surface.md). For
the current package graduation recommendation, see
[`docs/package-graduation.md`](../maintainers/package-graduation.md).

The `runtime/editor` helper turns manifest metadata into editor control hints
without taking over inspector rendering by itself.

```ts
import currentManifest from './manifest-document';
import { createEditorModel } from '@wp-typia/block-runtime/editor';

const editorFields = createEditorModel(currentManifest, {
  hidden: ['id', 'schemaVersion'],
  manual: ['content', 'linkTarget'],
  preferTextarea: ['content'],
});
```

`createEditorModel()` returns field descriptors with:

- label and dotted `path`
- inferred control kind (`toggle`, `select`, `range`, `number`, `text`, `textarea`, `unsupported`)
- default value, required flag, and Typia constraints
- select options derived from `wp.enum`
- unsupported/manual reasons for unions, arrays, and complex fields

When you want a higher-level inspector layer, use
`@wp-typia/block-runtime/inspector` on top of those descriptors:

```tsx
import currentManifest from './manifest-document';
import {
  InspectorFromManifest,
  usePersistentBlockIdentity,
  useEditorFields,
  useTypedAttributeUpdater,
} from '@wp-typia/block-runtime/inspector';

const editorFields = useEditorFields(currentManifest, {
  manual: ['content'],
});
const { updateField } = useTypedAttributeUpdater(
  attributes,
  setAttributes,
  validateAttributes,
);

<InspectorFromManifest
  attributes={attributes}
  fieldLookup={editorFields}
  onChange={updateField}
  paths={['alignment', 'isVisible']}
  title="Settings"
/>;
```

When the same block family also needs a stable logical id that survives save,
reopen, and duplicate repair, the inspector facade now exposes
`usePersistentBlockIdentity(...)`:

```tsx
const persistentId = usePersistentBlockIdentity({
  attributeName: 'sectionId',
  attributes,
  blocks,
  clientId,
  prefix: 'sec',
  setAttributes,
});
```

`runtime/inspector` keeps `runtime/editor` as the descriptor/model layer and
adds:

- `useEditorFields()` for memoized field lookup, defaults, and select options
- `useTypedAttributeUpdater()` for top-level and dotted-path updates from one hook
- `usePersistentBlockIdentity()` for duplicate-safe block ids in one document tree
- `FieldControl` for one manifest-backed WordPress control
- `InspectorFromManifest` for ordered manifest-driven `PanelBody` rendering

That public inspector surface now delegates to focused types, model, and
controls modules internally. The split is an implementation detail that keeps
the documented `@wp-typia/block-runtime/inspector` import stable.

`runtime/validation` also exposes nested update helpers for dotted editor paths such as `padding.top`. They convert dotted paths into top-level Gutenberg attribute patches and run the same validation contract before calling `setAttributes`.

Scaffold flow internals, template rendering/composition internals, and CLI
implementation internals are not part of the generated-project runtime support
policy even when they live in the same package.

Migration-capable reference apps or custom projects may also add:

- `render.php`
- `typia-migration-registry.php`
- `src/migrations/config.ts`
- `src/migrations/versions/`
- `src/migrations/rules/`
- `src/migrations/generated/`
- `src/migrations/fixtures/`

Migration-enabled generated projects may also wire:

- `src/admin/migration-dashboard.tsx`
- `src/migration-detector.ts`

`migrate wizard` and `migrate plan` are the read-only preview layer,
`migrate doctor` is the read-only workspace health check, `migrate fixtures`
refreshes deterministic edge fixtures, and `migrate fuzz` replays those
fixtures plus seeded random legacy-shaped inputs derived from the current Typia
validator. Without `--all`, migration commands target the first legacy migration
version only; `--all` runs across every configured legacy migration version and every configured
block target. `migrate wizard` requires a TTY; use `migrate plan --from-migration-version
<label>` in non-interactive shells. In TTY usage, `migrate fixtures --force`
asks before overwriting existing fixture files, while non-interactive runs
overwrite immediately for script compatibility. Existing fixture files are
otherwise preserved and reported as skipped, so `--force` is the explicit
refresh path even when `--all` is present.

The built-in `persistence` template adds another predictable layer:

- `src/api-types.ts`
- `src/api-validators.ts`
- `src/api-client.ts`
- `src/transport.ts`
- `src/api.ts`
- `src/data.ts`
- `src/api.openapi.json`
- `src/api-schemas/`
- `scripts/sync-project.ts`
- `scripts/sync-rest-contracts.ts`
- a plugin bootstrap PHP file with generated REST route/storage wiring

For persistence-capable scaffolds, the endpoint manifest authored in TypeScript is the canonical description of the REST surface and the primary input to `syncRestOpenApi()`. `src/api-client.ts` is the generated portable endpoint-definition artifact, `src/transport.ts` is the first-class runtime seam for editor/frontend transport wiring, `src/api.ts` is the typed call helper layer that composes those two pieces, and `src/data.ts` is the additive React/data wrapper layer built on `@wp-typia/rest/react`. `src/api.openapi.json` is the canonical endpoint-aware REST document, `src/api-schemas/*.schema.json` files remain the runtime contract artifacts, and `src/api-schemas/*.openapi.json` files remain available as per-contract compatibility fragments. Persistence scaffolds now split durable reads from session-only bootstrap state: `/state` remains the durable persisted-state surface, while `/bootstrap` returns fresh write-access data such as REST nonces or public signed-token metadata. `sync-rest` is intentionally no longer auto-healing: it fails fast when the type-derived metadata layer is stale, and the supported recovery path is `sync` or `sync-types` first.

Standalone contracts use the same schema-generation path without endpoint
metadata. `wp-typia add contract external-retrieve-response --type
ExternalRetrieveResponse` creates `src/contracts/external-retrieve-response.ts`,
registers the type in `CONTRACTS`, and keeps
`src/contracts/external-retrieve-response.schema.json` fresh through
`sync-rest` and `sync --check`. Use standalone contracts for external routes,
smoke/integration fixtures, or PHP-side assertions when wp-typia should own the
wire schema but should not generate a WordPress REST route. Generated
`rest-resource` scaffolds add route metadata, clients, OpenAPI, and PHP glue on
top of the same TypeScript-to-schema foundation; manual REST contract workflows
can reference the same stable schema files when route ownership stays outside
the scaffold.

Node-based smoke tests can assert response payloads against those generated
schemas without hand-checking individual keys:

```ts
import { assertResponseMatchesSchema } from '@wp-typia/block-runtime/schema-test';
import externalRetrieveResponseSchema from './src/contracts/external-retrieve-response.schema.json';

const payload = await fetchExternalRecord();

assertResponseMatchesSchema('ExternalRetrieveResponse', payload, {
  schemas: {
    ExternalRetrieveResponse: externalRetrieveResponseSchema,
  },
});
```

Validation failures include normalized field paths such as `$.items[0]` or
`$.status`, so CI output points at the field that drifted from the generated
contract.

```ts
await syncRestOpenApi({
  manifest: REST_ENDPOINT_MANIFEST,
  openApiFile: 'src/api.openapi.json',
  typesFile: 'src/api-types.ts',
});
```

When you customize the generated PHP:

- edit the plugin bootstrap file for storage helpers, route handlers, response shaping, and route registration
- edit `inc/rest-auth.php` or `inc/rest-public.php` for permission policy changes
- edit `src/transport.ts` when you need to route editor or frontend requests through a contract-compatible proxy or BFF without changing the endpoint contracts
- keep durable data on the `/state` endpoints and return fresh viewer/session-only write data from the dedicated `/bootstrap` endpoint
- treat the endpoint manifest and authored contract definitions as the source of truth for REST contracts, then regenerate `src/api-types.ts`, `src/api-schemas/*`, and `src/api.openapi.json`
- avoid hand-editing generated schema and OpenAPI artifacts unless you are debugging the generation output itself

`persistence` keeps one minimal aggregate-counter scaffold and lets you choose between:

- `authenticated`: logged-in writes protected by a WordPress REST nonce
- `public`: anonymous writes protected by signed short-lived public tokens, per-request ids, and coarse rate limiting

The public policy is still a scaffold default, not a complete abuse-prevention system. Add application-specific controls before using the same pattern for experiments, impressions, or other high-value metrics.

The built-in `compound` template adds a multi-block project structure:

- `src/blocks/<parent>/`
- `src/blocks/<parent>-item/`
- `src/blocks/<parent>/children.ts`
- `scripts/block-config.ts`
- `scripts/add-compound-child.ts`
- a root plugin bootstrap that registers `build/blocks/*/block.json`

The generated parent and child editors now follow the same validated attribute
update path used by the other built-in templates, and new child block types can
be scaffolded on demand:

```bash
npm run add-child -- --slug faq-item --title "FAQ Item"
npm run add-child -- --slug section --title "Section" --container --inserter visible
npm run add-child -- --slug clause --title "Clause" --ancestor section
```

That command updates `scripts/block-config.ts` plus `src/blocks/<parent>/children.ts`
without changing the parent block's default seeded template for hidden child
extensions, and it also supports visible container children plus nested ancestor
chains for richer document-style layouts.

Official workspaces also support first-class variation, Block Styles, block transforms, pattern, binding-source, AI-feature, and hooked-block expansion:

```bash
wp-typia add core-variation core/group section-hero
wp-typia add core-variation editorial-paragraph --block core/paragraph
wp-typia add variation hero-card --block counter-card
wp-typia add style callout-emphasis --block counter-card
wp-typia add transform quote-to-counter --from core/quote --to counter-card
wp-typia add pattern hero-layout
wp-typia add pattern hero-photo-section --scope section --section-role hero --catalog-title "Hero Photo" --tags hero,image --tag featured
wp-typia add binding-source hero-data
wp-typia add binding-source hero-data --block counter-card --attribute headline
wp-typia add ability review-workflow
wp-typia add ai-feature brief-suggestions --namespace my-plugin/v1
wp-typia add hooked-block counter-card --anchor core/post-content --position after
```

Core variations are generated under
`src/editor-plugins/core-variations/<namespace>/<block>/*.ts` and wired through
the shared editor plugin bundle. Choose them when the source of truth is an
existing core or third-party block and you only need editor-side variation
metadata, attributes, `innerBlocks`, and `isActive` registration, not a new
custom `block.json` or Typia manifest. Workspace block variations are generated
under `src/blocks/<block>/variations/*.ts`, styles under
`src/blocks/<block>/styles/*.ts`, and transforms under
`src/blocks/<block>/transforms/*.ts`; those flows are wired through the target
block entrypoint and recorded in `scripts/block-config.ts`. Patterns are
generated as namespaced PHP shells under `src/patterns/full/*.php` or
`src/patterns/sections/*.php`, recorded in the typed `PATTERNS` catalog with
`scope`, optional `sectionRole`, `tags`, `thumbnailUrl`, and `contentFile`
metadata, and loaded by the workspace bootstrap.
Choose Block Styles for named visual class options on the same block,
transforms for converting from another source block into the generated block,
and patterns for reusable multi-block layouts.
Binding sources are generated under `src/bindings/*/{server.php,editor.ts}` and
wired through the shared workspace bootstrap plus editor bundle. The generated
starter contract keeps one field-keyed data map in each file, so the common
follow-up is to edit `src/bindings/<name>/server.php` and
`src/bindings/<name>/editor.ts` in parallel by replacing the default starter
values for the fields you want to expose. If you pass `--block` and
`--attribute` together, the workflow also declares the target attribute in the
generated block's `block.json`, registers the WordPress supported-attributes
filter for that block, records the target in `scripts/block-config.ts`, and lets
`wp-typia doctor` detect missing source/attribute wiring later.
Workflow abilities are generated under `src/abilities/*/` plus
`inc/abilities/*.php` and scaffold typed input/output contracts, JSON Schema
sync, server-side Abilities API registration, and a lightweight admin/editor
client helper that expects the WordPress abilities client to be available.
AI features are generated under `src/ai-features/*/` plus `inc/ai-features/*.php`
and scaffold a server-owned REST endpoint, AI-safe response schema projection,
typed endpoint client wrapper, WordPress AI Client feature-detection seam, and
generated support metadata helpers that expose runtime gates, feature ids, and
unavailable-message helpers to admin/editor UI code.
Hooked blocks patch `src/blocks/<block>/block.json` with `blockHooks` metadata
so the target block is inserted relative to the chosen anchor block.

When you opt `compound` into persistence with `--data-storage` or `--persistence-policy`, the parent block also gains:

- `src/blocks/<parent>/api-types.ts`
- `src/blocks/<parent>/api-validators.ts`
- `src/blocks/<parent>/api.ts`
- `src/blocks/<parent>/api.openapi.json`
- `src/blocks/<parent>/api-schemas/`
- `src/blocks/<parent>/interactivity.ts`
- generated PHP route/storage wiring in the plugin bootstrap

For persistence-enabled `compound`, the parent block follows the same REST extension pattern as `persistence`, including the dedicated `/bootstrap` endpoint for fresh session-only write data. The hidden child block does not own REST routes or storage behavior.

## 7. Repo-local example app

The repository keeps two reference apps:

- [`examples/my-typia-block`](https://github.com/imjlk/wp-typia/tree/main/examples/my-typia-block) for the kitchen-sink editor/migration reference
- [`examples/persistence-examples`](https://github.com/imjlk/wp-typia/tree/main/examples/persistence-examples) for persistence-policy behavior and the repo-local WordPress AI projection proof described in [`docs/wordpress-ai-projections.md`](./wordpress-ai-projections.md)
- [`examples/compound-patterns`](https://github.com/imjlk/wp-typia/tree/main/examples/compound-patterns) for compound parent/child patterns
- [`examples/api-contract-adapter-poc`](https://github.com/imjlk/wp-typia/tree/main/examples/api-contract-adapter-poc) for a minimal non-PHP proof that endpoint manifests can be served outside WordPress/PHP, plus the opt-in `typia.llm` adapter target described in [`docs/typia-llm-evaluation.md`](./typia-llm-evaluation.md)

The repo-owned adapter conformance harness lives at
[`tests/helpers/rest-adapter-conformance.ts`](https://github.com/imjlk/wp-typia/blob/main/tests/helpers/rest-adapter-conformance.ts).
Adapter experiments can plug into it by exporting a manifest, a
`startServer(): Promise<{ url, close(), routeTable }>` helper, route metadata
with `method`/`path`/`operationId`/`authMode`, response validators keyed by
`operationId`, and scenario fixtures that describe valid plus invalid raw HTTP
requests. The first pass checks contract-level route and response parity plus
manifest-level auth metadata, not WordPress-specific auth runtime semantics.

From the root workspace, example-oriented commands live under:

```bash
bun run examples:build
bun run examples:dev
bun run examples:dev:persistence
bun run examples:dev:compound
bun run examples:lint
bun run examples:test:e2e
```

Legacy root shortcuts such as `bun run dev` and `bun run test:e2e` remain available as compatibility aliases.

## 8. Generated reference docs

Contributor note:

```bash
bun run docs:build
```

This generates API reference files under `apps/docs/src/content/docs/api/`
during local and CI site builds, and publishes them from the hosted `/api/`
section on GitHub Pages.
