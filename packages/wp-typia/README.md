# `wp-typia`

Canonical CLI package for `wp-typia`.

Use this package for new projects:

- `npx wp-typia create my-block`
- `bunx wp-typia create my-block`
- `curl -fsSL https://github.com/imjlk/wp-typia/releases/latest/download/install-wp-typia.sh | sh`
- `npx wp-typia create my-plugin --template workspace`
- `npx wp-typia create my-plugin --template workspace --profile plugin-qa`
- `npx wp-typia create my-books --template query-loop --query-post-type book`

Extend an existing workspace with:

- `wp-typia add block counter-card --template basic`
- `wp-typia add integration-env local-smoke --wp-env --release-zip --service docker-compose`
- `wp-typia add style callout-emphasis --block counter-card`
- `wp-typia add transform quote-to-counter --from core/quote --to counter-card`
- `wp-typia add binding-source hero-data`
- `wp-typia add binding-source hero-data --block counter-card --attribute headline`
- `wp-typia add rest-resource snapshots --namespace my-plugin/v1 --methods list,read,create`
- `wp-typia add rest-resource snapshots --namespace my-plugin/v1 --methods read,update --route-pattern '/snapshots/(?P<id>[\d]+)' --permission-callback my_plugin_can_manage_snapshots`
- `wp-typia add rest-resource external-record --manual --namespace legacy/v1 --method GET --auth authenticated --path '/records/(?P<id>[\d]+)'`
- `wp-typia add rest-resource integration-settings --manual --namespace my-plugin/v1 --method POST --secret-field apiKey`
- `wp-typia add post-meta integration-state --post-type post --type IntegrationStateMeta`
- `wp-typia add ability review-workflow`
- `wp-typia add ai-feature brief-suggestions --namespace my-plugin/v1`
- `wp-typia add editor-plugin review-workflow --slot sidebar`
- `wp-typia add editor-plugin seo-notes --slot document-setting-panel`
- `wp-typia add hooked-block counter-card --anchor core/post-content --position after`

`wp-typia <project-dir>` remains available as a backward-compatible alias to
`wp-typia create <project-dir>` when `<project-dir>` is the only positional
argument.

Configuration files:

- `wp-typia` loads `~/.config/wp-typia/config.json`, `.wp-typiarc`, `.wp-typiarc.json`, then `package.json#wp-typia`; later sources override earlier sources
- `--config <path>` is an explicit override loaded after the default sources, relative to the current working directory unless absolute
- config files use a strict schema: unknown keys are errors rather than warnings or stripped values, so typos fail near the source config file
- object values are deep-merged, while arrays such as `mcp.schemaSources` replace earlier arrays instead of concatenating
- projects can declare block API compatibility intent with `wordpress.minVersion`, `wordpress.testedVersions`, `compatibility.strict`, and `compatibility.allowUnknownFutureKeys`; future Supports, Variations, and Bindings helpers use those values for version-aware diagnostics

Compatibility notes:

- `@wp-typia/project-tools` is the canonical programmatic project orchestration package
- the published CLI now ships a built `dist` Gunshi runtime, and the canonical Node bin supports `create`, `add`, `migrate`, `doctor`, `sync`, `skills`, `completions`, `mcp`, `--version`, `--help`, and template inspection without requiring a locally installed Bun binary
- Bun remains supported for repository development, tests, and builds, while Node is the canonical npm runtime for the published CLI
- when you request machine-readable output with `--format json`, CLI failures now include a stable `error.code` field so wrappers and CI can branch without parsing English text
- the stable machine-handled branching key is `error.code`. Structured context like `error.command`, `error.kind`, and `error.tag` may also be useful to consumers, while free-form text like `error.message`, `error.summary`, and `error.detailLines` stays human-facing guidance and can evolve without notice
- interactive TUI rendering has been removed from the published CLI; flag-driven, text, and JSON workflows remain supported
- standalone release assets are published per platform together with checksum manifests and install scripts: `install-wp-typia.sh` for macOS/Linux and `install-wp-typia.ps1` for Windows
- internal runtime-bridge helper modules are implementation details; integrations
  should target the CLI or `@wp-typia/project-tools`, not CLI internals

Maintainers: see [`docs/bunli-cli-migration.md`](https://imjlk.github.io/wp-typia/maintainers/bunli-cli-migration/)
for the active CLI ownership contract and Gunshi migration notes.

Project meta docs:

- [Upgrade Guide](https://github.com/imjlk/wp-typia/blob/main/UPGRADE.md)
- [License](https://github.com/imjlk/wp-typia/blob/main/LICENSE)
- [Security Policy](https://github.com/imjlk/wp-typia/blob/main/SECURITY.md)
- [Contributing Guide](https://github.com/imjlk/wp-typia/blob/main/CONTRIBUTING.md)
