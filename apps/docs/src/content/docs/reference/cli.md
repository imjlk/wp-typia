---
title: 'CLI Reference'
---

`wp-typia` is the canonical command-line entrypoint for scaffold, adoption,
sync, doctor, migration, and workspace extension workflows.

```bash
npx wp-typia --help
bunx wp-typia --help
wp-typia --version
```

The published binary keeps common non-interactive commands available through the
Node fallback runtime. Bun-powered command surfaces such as `mcp`, `skills`, and
shell `completions` require Bun 1.3.11+ or the standalone release binary.

## Global flags

| Flag                      | Description                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `--help`                  | Show top-level or command-specific help.                                                                           |
| `--version`               | Print the installed `wp-typia` version.                                                                            |
| `--config <path>`         | Load a config override file for the current invocation.                                                            |
| `--format <json \| text>` | Select command output for supported commands; `json` is machine-readable and `text` is the human-readable default. |

Status markers honor `WP_TYPIA_ASCII=1`, `WP_TYPIA_ASCII=0`, and `NO_COLOR` in
the same way as generated project onboarding output.

The legacy internal value `toon` remains accepted as a compatibility alias for
human-readable output, but help and invalid-format guidance advertise the public
`text` spelling instead.

## Configuration Files

`wp-typia` loads user config from `~/.config/wp-typia/config.json`,
`.wp-typiarc`, `.wp-typiarc.json`, the `wp-typia` key in `package.json`, and
then the optional `--config <path>` override. Later sources take precedence.

Config objects are merged recursively, but arrays are replaced instead of
concatenated. This keeps list-like options deterministic: the later source owns
the full array value, and users should repeat any earlier entries they still
want to preserve. This matters for options such as `mcp.schemaSources`.

For example, this project config:

```json
{
  "wordpress": {
    "minVersion": "6.7",
    "testedVersions": ["6.7", "6.8", "6.9"]
  },
  "compatibility": {
    "strict": true,
    "allowUnknownFutureKeys": false
  },
  "mcp": {
    "schemaSources": [{ "namespace": "base", "path": "./base.ts" }]
  }
}
```

combined with this later `package.json` override:

```json
{
  "wp-typia": {
    "mcp": {
      "schemaSources": [{ "namespace": "app", "path": "./app.ts" }]
    }
  }
}
```

resolves to only the `app` source. To keep both entries, include both in the
later array. Additive array merging is intentionally out of scope for the
current config contract.

The `wordpress` and `compatibility` sections describe project-level block API
intent. `wordpress.minVersion` is the target floor for generated Supports,
Variations, and Bindings features, while `compatibility.strict` controls whether
unsupported known features should fail diagnostics or stay as warnings.
Unknown future keys are guarded unless `compatibility.allowUnknownFutureKeys`
is explicitly enabled.

## Machine-readable diagnostics

Commands that support `--format json` emit stable failure envelopes for CI, IDE,
and wrapper integrations. The `error.code` field is the integration contract;
human-readable `message`, `summary`, and `detailLines` can change as guidance
improves.

- `ok: true` JSON success payloads are written to stdout.
- `ok: false` JSON error payloads are written to stderr.
- Completion-oriented success payloads keep human-facing title/summary/next-step
  data under `data.completion`.

```json
{
  "ok": false,
  "error": {
    "code": "missing-argument",
    "command": "create",
    "kind": "command-execution",
    "tag": "CommandExecutionError"
  }
}
```

Known throw sites attach an explicit diagnostic code. Message-based inference in
`inferCliDiagnosticCode()` is kept only as a compatibility fallback for legacy or
untyped errors, and its regexes are coupled to the exact runtime validation
messages they match. Rewording one of those messages can silently change,
downgrade, or remove the diagnostic code returned to JSON consumers, so new
user-facing runtime validation failures should use a diagnostic-coded error at
the throw site instead of extending the fallback classifier.

| Code                         | Typical cause                                            | Recovery                                                                |
| ---------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| `command-execution`          | The command failed after preflight checks completed.     | Read the detail lines and rerun after fixing the underlying tool error. |
| `configuration-missing`      | Required wp-typia configuration is missing.              | Add the missing config section or rerun the scaffold/init setup.        |
| `dependencies-not-installed` | Project or workspace dependencies are not installed.     | Run the reported package-manager install command from the project root. |
| `doctor-check-failed`        | One or more doctor checks failed.                        | Fix the failed doctor rows, then rerun `wp-typia doctor`.               |
| `invalid-argument`           | An argument value is present but unsupported or invalid. | Correct the argument value using command help and the detail lines.     |
| `invalid-command`            | The command or subcommand is not supported.              | Run `wp-typia --help` and switch to a listed command/subcommand.        |
| `missing-argument`           | A required positional argument or flag value is missing. | Provide the missing value shown in the detail lines.                    |
| `missing-build-artifact`     | The CLI package layout is missing bundled artifacts.     | Reinstall the package/binary or rebuild the workspace.                  |
| `outside-project-root`       | The command ran outside a generated project/workspace.   | `cd` into the scaffolded root or rerun the scaffold/init flow.          |
| `template-source-timeout`    | External template resolution timed out.                  | Retry with a reachable source, local path, or cached package.           |
| `template-source-too-large`  | External template content exceeded the safety limit.     | Reduce the package size or use a smaller template layer.                |
| `unknown-template`           | The requested template id is not registered.             | Run `wp-typia templates list` and use one of the listed ids.            |
| `unsupported-command`        | The current runtime cannot execute that command surface. | Install Bun 1.3.11+ or use the standalone wp-typia binary if required.  |

## `create`

Scaffold a new project.

```bash
wp-typia create <project-dir> --template basic --package-manager npm --yes
wp-typia create <project-dir> --template persistence --data-storage custom-table --persistence-policy public
wp-typia create <project-dir> --template workspace
wp-typia create <project-dir> --template workspace --profile plugin-qa
```

Common flags:

| Flag                                                   | Description                                                                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--template <id \| path \| github:... \| npm-package>` | Template id or external template source. Built-ins include `basic`, `interactivity`, `persistence`, `compound`, `query-loop`, and the `workspace` alias. |
| `--package-manager <bun \| npm \| pnpm \| yarn>`       | Package manager for generated install and script commands.                                                                                               |
| `--yes`                                                | Accept non-interactive defaults.                                                                                                                         |
| `--no-install`                                         | Skip dependency installation.                                                                                                                            |
| `--dry-run`                                            | Preview generated files without writing the target directory.                                                                                            |
| `--namespace <value>`                                  | Override the generated block namespace.                                                                                                                  |
| `--text-domain <value>`                                | Override the generated text domain.                                                                                                                      |
| `--php-prefix <value>`                                 | Override generated PHP symbol prefixes.                                                                                                                  |
| `--profile <plugin-qa>`                                | Add an opt-in workspace profile. `plugin-qa` starts the official workspace with wp-env, smoke, and release zip starters; omit it for the minimal shell.  |
| `--with-migration-ui`                                  | Add migration UI support where the selected template supports it.                                                                                        |
| `--with-wp-env`                                        | Add local `wp-env` preset files and scripts.                                                                                                             |
| `--with-test-preset`                                   | Add a test-only `wp-env` preset and smoke-test wiring.                                                                                                   |
| `--external-layer-source <source>`                     | Compose an external layer package on top of a built-in template.                                                                                         |
| `--external-layer-id <id>`                             | Select a specific external layer when a package exposes multiple layers.                                                                                 |
| `--variant <name>`                                     | Select a variant from an official external template config.                                                                                              |
| `--query-post-type <post-type>`                        | Set the default post type for `query-loop` scaffolds.                                                                                                    |
| `--inner-blocks-preset <id>`                           | Select a compound `InnerBlocks` preset.                                                                                                                  |
| `--alternate-render-targets <list>`                    | Add alternate render targets for persistence-capable dynamic scaffolds.                                                                                  |
| `--data-storage <post-meta \| custom-table>`           | Select persistence storage for persistence-capable scaffolds.                                                                                            |
| `--persistence-policy <authenticated \| public>`       | Select persistence write policy.                                                                                                                         |

The positional alias `wp-typia <project-dir>` remains available only for
unambiguous create invocations with a single local project directory.

### Generated slug casing and acronyms

Generated block slugs, text domains, PHP prefixes, file names, and related
identifiers are derived from the normalized kebab-case project or block name.
The normalizer keeps a fixed built-in list of common WordPress/web acronyms
together, including `API`, `CTA`, `HTML`, `HTTP`, `ID`, `JSON`, `REST`, `URL`,
`UUID`, `WP`, and `XML`.

That acronym list is intentionally not project-configurable. Domain-specific
names such as `CRMLeadForm`, `SEOSettingsPanel`, or `SSOLoginBlock` still
normalize as `crmlead-form`, `seosettings-panel`, and `ssologin-block` because
`CRM`, `SEO`, and `SSO` are not part of the stable built-in set. Use explicit
word separators instead, such as `CRM Lead Form`, when the generated slug must
be `crm-lead-form`.

Keeping the list fixed makes repeated scaffold/add commands reproducible across
machines and config sources. A project-defined acronym dictionary could silently
change generated paths, block names, package handles, REST routes, and migration
fixture directories when config changes, so compatibility-sensitive projects
should treat slug spelling as explicit input rather than ambient configuration.

### External template cache

Remote template resolution keeps the existing timeout, size, and symlink guards.
After those guards pass, npm templates with registry `integrity` or `shasum`
metadata and GitHub templates with a resolvable remote revision are cached under
a private per-user local temp cache. Cache keys include the source locator plus
the resolved npm tarball integrity or GitHub revision so repeated scaffolds
reuse only the same source.

Set `WP_TYPIA_EXTERNAL_TEMPLATE_CACHE=0` to bypass the cache for a forced
refresh. Set `WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR=/path/to/cache` to place the
cache in a project- or CI-managed directory.

## `add`

Extend an official wp-typia workspace from the workspace root.

```bash
wp-typia add block <name> --template basic
wp-typia add admin-view <name>
wp-typia add admin-view <name> --source rest-resource:products
wp-typia add admin-view <name> --source core-data:postType/post
wp-typia add core-variation core/group section-hero
wp-typia add core-variation editorial-paragraph --block core/paragraph
wp-typia add variation <name> --block <block-slug>
wp-typia add style <name> --block <block-slug>
wp-typia add transform <name> --from <namespace/block> --to <block-slug|namespace/block-slug>
wp-typia add pattern <name>
wp-typia add pattern hero-photo-section --scope section --section-role hero --catalog-title "Hero Photo" --tags hero,image --tag featured
wp-typia add binding-source <name>
wp-typia add binding-source <name> --block <block-slug|namespace/block-slug> --attribute <attribute>
wp-typia add contract <name> --type <ExportedTypeName>
wp-typia add integration-env local-smoke --wp-env --release-zip
wp-typia add rest-resource <name> --namespace <vendor/v1> --methods list,read,create
wp-typia add rest-resource <name> --namespace <vendor/v1> --methods read,update --route-pattern '/records/(?P<id>[\d]+)' --permission-callback my_plugin_can_manage_records
wp-typia add rest-resource integration-settings --manual --namespace <vendor/v1> --method POST --secret-field apiKey
wp-typia add admin-view integration-settings --source rest-resource:integration-settings
wp-typia add post-meta <name> --post-type post --type IntegrationStateMeta
wp-typia add ability <name>
wp-typia add ai-feature <name> --namespace <vendor/v1>
wp-typia add editor-plugin <name> --slot sidebar
wp-typia add editor-plugin seo-notes --slot document-setting-panel
wp-typia add hooked-block <block-slug> --anchor core/post-content --position after
```

Common flags:

| Flag                                                             | Description                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--template <basic \| interactivity \| persistence \| compound>` | Built-in block family for `add block`.                                                                                                                                                                                                                              |
| `--dry-run`                                                      | Preview workspace file updates and completion guidance.                                                                                                                                                                                                             |
| `--block <block-slug \| namespace/block-slug>`                   | Target block for variation, core-variation alias, style, and end-to-end binding-source workflows.                                                                                                                                                                   |
| `--attribute <attribute>`                                        | Target block attribute for end-to-end binding-source workflows.                                                                                                                                                                                                     |
| `--from <namespace/block>`                                       | Source block name for transform workflows.                                                                                                                                                                                                                          |
| `--to <block-slug \| namespace/block-slug>`                      | Target workspace block for transform workflows.                                                                                                                                                                                                                     |
| `--anchor <block-name>`                                          | Anchor block for hooked-block workflows.                                                                                                                                                                                                                            |
| `--position <before \| after \| firstChild \| lastChild>`        | Hook position for hooked blocks.                                                                                                                                                                                                                                    |
| `--slot <sidebar \| document-setting-panel>`                     | Editor shell slot for editor-plugin scaffolds; legacy aliases `PluginSidebar` and `PluginDocumentSettingPanel` remain accepted.                                                                                                                                     |
| `--namespace <vendor/v1>`                                        | REST namespace for REST resource and AI feature workflows.                                                                                                                                                                                                          |
| `--methods <method[,method...]>`                                 | REST methods for REST resource workflows.                                                                                                                                                                                                                           |
| `--route-pattern <route-pattern>`                                | Generated REST resource item route pattern, relative to the namespace. Regex groups must use only `(?P<id>...)` so generated handlers and clients stay aligned.                                                                                                     |
| `--permission-callback <callback>`                               | PHP permission callback for generated REST resource route registrations.                                                                                                                                                                                            |
| `--controller-class <ClassName>`                                 | PHP controller class wrapper for generated REST resource route callbacks.                                                                                                                                                                                           |
| `--controller-extends <BaseClass>`                               | Optional base class for generated REST resource controller wrappers.                                                                                                                                                                                                |
| `--scope <full \| section>`                                      | Pattern catalog scope for `add pattern`; full patterns are generated under `src/patterns/full/` and section patterns under `src/patterns/sections/`.                                                                                                                |
| `--section-role <role>`                                          | Required when `--scope section`; records the typed section role in `PATTERNS` for custom pattern browsers and later section validation.                                                                                                                             |
| `--catalog-title <title>`                                        | Human-readable title for generated pattern catalog entries; defaults to the pattern slug title.                                                                                                                                                                     |
| `--tags <tag[,tag...]>`                                          | Comma-separated typed catalog tag list for generated pattern manifest entries.                                                                                                                                                                                      |
| `--tag <tag>`                                                    | Repeatable single typed catalog tag for generated pattern manifest entries; can be combined with `--tags`.                                                                                                                                                          |
| `--thumbnail-url <url>`                                          | Optional thumbnail URL or relative project path for generated pattern catalog entries.                                                                                                                                                                              |
| `--secret-field <field>`                                         | Write-only request body field for manual settings REST contracts; requires `--manual` and a request body, typically generated by `--method POST`, `PUT`, or `PATCH`.                                                                                                |
| `--secret-state-field <field>`                                   | Masked response boolean field for `--secret-field`; defaults to `has<SecretField>`.                                                                                                                                                                                 |
| `--wp-env`                                                       | Add a local `@wordpress/env` preset for integration environment smoke workflows.                                                                                                                                                                                    |
| `--release-zip`                                                  | Add `release:zip`, `release:zip:check`, and `qa:check` scripts for plugin QA packaging workflows.                                                                                                                                                                   |
| `--type <ExportedTypeName>`                                      | Exported TypeScript type or interface for standalone contract schema artifacts.                                                                                                                                                                                     |
| `--post-type <post-type>`                                        | WordPress post type key for post-meta contract scaffolds.                                                                                                                                                                                                           |
| `--meta-key <meta-key>`                                          | Optional WordPress meta key for post-meta workflows. Defaults to `_<phpPrefix>_<name>`.                                                                                                                                                                             |
| `--hide-from-rest`                                               | Keep generated post-meta registration out of REST/editor responses.                                                                                                                                                                                                 |
| `--source <locator>`                                             | Optional data source locator for admin-view workflows. Current public support includes list-capable `rest-resource:products`, manual settings contracts such as `rest-resource:integration-settings`, `core-data:postType/post`, and `core-data:taxonomy/category`. |
| `--external-layer-source <source>`                               | Compose an external layer package on top of a built-in block template.                                                                                                                                                                                              |
| `--external-layer-id <id>`                                       | Select a specific external layer.                                                                                                                                                                                                                                   |
| `--inner-blocks-preset <id>`                                     | Select a compound `InnerBlocks` preset.                                                                                                                                                                                                                             |
| `--alternate-render-targets <list>`                              | Add alternate render targets for persistence-capable dynamic scaffolds.                                                                                                                                                                                             |
| `--data-storage <post-meta \| custom-table>`                     | Select persistence storage.                                                                                                                                                                                                                                         |
| `--persistence-policy <authenticated \| public>`                 | Select persistence write policy.                                                                                                                                                                                                                                    |

Use `core-variation` when you want an opinionated preset for an existing
`namespace/block`, such as `core/group`, `core/paragraph`, or a third-party
block, without creating a new custom block contract. It writes editor-side
registration files under `src/editor-plugins/core-variations/`, supports starter
attributes, `innerBlocks`, `isActive`, category, icon, keywords, description,
and scope metadata, and intentionally does not generate `block.json` or Typia
manifests. Use workspace block `variation` when the variation belongs to a
generated block already listed in `scripts/block-config.ts`.

Use Block Styles when you want a named visual class for an existing block,
transforms when users should convert content from another block type into your
block, and patterns when you need a reusable PHP-registered content layout.
Pattern catalog entries support typed `scope`, `sectionRole`, `tags`,
`thumbnailUrl`, and `contentFile` metadata, and `wp-typia sync --check`
validates duplicate slugs, missing content files, and invalid catalog metadata
before checking block markup. Section-scoped catalog entries are expected to
include a matching serialized section marker; the default convention accepts
`core/group` wrappers with `section section--{role}` classes or
`metadata.sectionRole` attributes, and programmatic callers can pass a custom
`sectionRoleConvention` to `validatePatternCatalog()`.

Editor plugin scaffolds are slot-aware. The default `sidebar` slot generates a
`PluginSidebar` shell with a matching more-menu entry, while
`document-setting-panel` generates a `PluginDocumentSettingPanel` surface inside
the document settings sidebar. Existing automation that still passes
`PluginSidebar` or `PluginDocumentSettingPanel` continues to resolve to the
matching canonical slot.

Binding-source scaffolds can stop at registration-only wiring, or you can pass
both `--block` and `--attribute` to connect the source to a generated block
attribute end to end.

Standalone contract scaffolds create `src/contracts/<name>.ts`, register the
named type in `scripts/block-config.ts`, and generate
`src/contracts/<name>.schema.json`. They do not create PHP route glue. Use them
for external WordPress routes, PHP assertions, or smoke tests that need a stable
runtime schema before a full `rest-resource` or manual REST contract exists.

Manual REST settings contracts can declare write-only secrets with
`--secret-field <field>`. Use it with `--manual` and a request body, typically
generated by `--method POST`, `PUT`, or `PATCH`. The generated request type
marks that property with `tags.Secret<"has<Field>">` from
`@wp-typia/block-runtime/typia-tags`, generated request schemas/OpenAPI include
`writeOnly: true`, and the response scaffold exposes only the masked state
field such as `hasApiKey`. Edit the PHP route owner to persist the raw secret
server-side and never return it from response/client artifacts.

Post-meta contract scaffolds create `src/post-meta/<name>/types.ts`, generate
`meta.schema.json`, and wire `inc/post-meta/<name>.php` with a
`register_post_meta()` helper for the declared `--post-type`. Run
`wp-typia sync-rest --check` after editing the TypeScript shape to catch stale
meta schema artifacts before shipping.

Admin-view scaffolds can optionally bind to a generated data source with
`--source`. For example, `rest-resource:products` points at a matching
`wp-typia add rest-resource products` scaffold and generates a DataViews
collection screen when that REST resource has a list method. A manual REST
settings contract with a request body, such as `rest-resource:integration-settings`,
generates a typed React form instead and reuses the generated API/client helper
for load/save state. That settings form is intentionally singleton-shaped, so
manual contracts with path parameters or regex groups such as `/(?P<id>...)`
should use custom UI instead. Published npm installs can scaffold `admin-view`
now that `@wp-typia/dataviews` is available on npm.
The first core-data wave also accepts `core-data:postType/<post-type>` and
`core-data:taxonomy/<taxonomy>` for WordPress-owned entity collections. That
path adds direct `@wordpress/core-data` and `@wordpress/data` dependencies only
for the generated workspace and follows the boundary documented in the
core-data adapter guide.

## `init`

Preview or apply the minimum adoption plan for an existing project.

```bash
wp-typia init [project-dir]
wp-typia init [project-dir] --apply
wp-typia init [project-dir] --package-manager <bun|npm|pnpm|yarn>
wp-typia init [project-dir] --format json
```

| Flag                                             | Description                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `--apply`                                        | Write the planned `package.json` updates and retrofit helper files instead of previewing only.       |
| `--package-manager <bun \| npm \| pnpm \| yarn>` | Package manager to use for emitted scripts and next steps.                                           |
| `--format json`                                  | Emit the standard CLI success envelope and keep the detailed retrofit plan nested under `data.plan`. |

`init` reports dependency, script, generated artifact, and migration follow-up
steps for supported single-block and multi-block layouts. The command previews
changes by default, and `--apply` switches to rollback-protected writes for
`package.json` and the generated retrofit helper files.

## `sync`

Run the generated-project sync workflow from a scaffolded project or official
workspace root.

```bash
wp-typia sync
wp-typia sync --check
wp-typia sync --dry-run
wp-typia sync ai
```

| Flag            | Description                                             |
| --------------- | ------------------------------------------------------- |
| `--check`       | Check generated artifacts without writing changes.      |
| `--dry-run`     | Preview generated sync commands without executing them. |
| `--format json` | Emit structured sync completion output.                 |

`sync ai` runs the supported WordPress AI artifact target when the project
provides a compatible script.

## `doctor`

Run read-only diagnostics.

```bash
wp-typia doctor
wp-typia doctor --format json
wp-typia doctor --help
```

`doctor` always checks environment readiness. Official wp-typia workspace roots
also get inventory, source-tree drift, and shared convention checks. Use
`--format json` for CI, IDE, and wrapper integrations that need stable
machine-readable check results.

Workspace block diagnostics also include iframe/API v3 readiness rows. `WARN`
rows do not fail `doctor`; treat them as compatibility follow-up before relying
on iframe-enabled Post Editor or Site Editor rendering. The static checks cover
`block.json` `apiVersion`, block stylesheet registration, direct
`window`/`document`/`parent`/`top` DOM access in editor-facing sources, and
detectable missing `useBlockProps`/`useInnerBlocksProps` wrapper usage. JSON
output exposes stable check-level codes such as
`wp-typia.workspace.block.iframe.api-version`. See WordPress' [iframe editor
migration guide](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-api-versions/block-migration-for-iframe-editor-compatibility/)
for the platform rationale.

## `templates`

Inspect scaffold templates.

```bash
wp-typia templates list
wp-typia templates inspect basic
wp-typia templates inspect --id basic
```

| Flag                 | Description                          |
| -------------------- | ------------------------------------ |
| `--id <template-id>` | Template id for `templates inspect`. |
| `--format json`      | Emit structured template data.       |

## `migrate`

Run migration workflows for migration-capable projects.

```bash
wp-typia migrate init --current-migration-version v1
wp-typia migrate snapshot --migration-version v1
wp-typia migrate wizard
wp-typia migrate plan --from-migration-version v1
wp-typia migrate diff --from-migration-version v1
wp-typia migrate scaffold --from-migration-version v1
wp-typia migrate verify --all
wp-typia migrate doctor --all
wp-typia migrate fixtures --all --force
wp-typia migrate fuzz --all --iterations 25 --seed 1
```

Common flags:

| Flag                                  | Description                                                     |
| ------------------------------------- | --------------------------------------------------------------- |
| `--current-migration-version <label>` | Current migration version label for `migrate init`.             |
| `--migration-version <label>`         | Version label to capture with `migrate snapshot`.               |
| `--from-migration-version <label>`    | Source migration version label.                                 |
| `--to-migration-version <label>`      | Target migration version label.                                 |
| `--all`                               | Run across every configured migration version and block target. |
| `--force`                             | Force overwrite behavior where supported.                       |
| `--iterations <count>`                | Iteration count for `migrate fuzz`.                             |
| `--seed <value>`                      | Deterministic fuzz seed.                                        |

`migrate` is the canonical command. The older `migrations` alias is no longer
supported.

## Bun-powered utility commands

These commands require the Bun-powered runtime.

```bash
wp-typia mcp list
wp-typia mcp sync --output-dir .bunli/mcp
wp-typia skills list
wp-typia skills sync
wp-typia completions zsh
```

`mcp` reads configured `mcp.schemaSources` and can emit MCP metadata for
downstream tooling. `skills` and `completions` are provided by the Bunli plugin
surface.
