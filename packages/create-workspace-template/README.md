# `@wp-typia/create-workspace-template`

The official empty workspace template for `wp-typia`.

Use it through the canonical CLI:

```bash
npx wp-typia create my-plugin --template @wp-typia/create-workspace-template
npx wp-typia create my-plugin --template workspace --profile plugin-qa
```

The generated project starts with an empty `src/blocks/*` workspace shell and is designed to grow through:

```bash
npm run wp-typia:add -- block my-block --template basic
npm run wp-typia:add -- integration-env local-smoke --wp-env --release-zip --service docker-compose
npm run wp-typia:add -- style callout-emphasis --block my-block
npm run wp-typia:add -- transform quote-to-block --from core/quote --to my-block
npm run wp-typia:add -- pattern hero-layout
npm run wp-typia:add -- pattern hero-photo-section --scope section --section-role hero --tags hero,image
npm run wp-typia:add -- binding-source hero-data
npm run wp-typia:add -- binding-source hero-data --block my-block --attribute headline
npm run wp-typia:add -- contract external-retrieve-response --type ExternalRetrieveResponse
npm run wp-typia:add -- rest-resource external-record --manual --namespace legacy/v1 --route-pattern '/records/(?P<post_id>[\d]+)' --permission-callback legacy_can_read_records --controller-class Legacy\\Records\\Controller
npm run wp-typia:add -- post-meta integration-state --post-type post --type IntegrationStateMeta
npm run wp-typia:add -- binding-source integration-state-source --from-post-meta integration-state --meta-path status --block my-block --attribute headline
npm run wp-typia:add -- editor-plugin review-workflow --slot sidebar
npm run wp-typia:add -- editor-plugin seo-notes --slot document-setting-panel
npm run wp-typia:add -- hooked-block my-block --anchor core/post-content --position after
```

Typed block nesting rules live in `BLOCK_NESTING` inside
`scripts/block-config.ts`. Declare `parent`, `ancestor`, or `allowedBlocks`
relationships there and `wp-typia sync --check` will validate referenced block
names in the workspace namespace while allowing external targets like
`core/group`, then keep the matching `block.json` metadata current.
Declare default editor `InnerBlocks` templates in `BLOCK_TEMPLATES` and
`wp-typia sync` will generate `src/inner-blocks-templates.ts` with constants you
can import from edit components.
Pattern files listed in `PATTERNS` are parsed during the same sync flow so
`wp-typia sync --check` can first validate typed catalog metadata such as
duplicate slugs, `scope`, `sectionRole`, `tags`, `thumbnailUrl`, and
`contentFile`, then catch serialized block content that violates the declared
`allowedBlocks`, `parent`, or `ancestor` rules. Unknown or unparseable pattern
blocks are reported as warnings so the first implementation stays non-mutating.
The validator reads serialized `<!-- wp:* -->` block comment boundaries
conservatively and does not execute dynamic PHP content.
For a complete generic family with a container, section, title, body, and media
block, see the Nesting Contracts Guide in the hosted docs and the checked
fixture at `tests/fixtures/nested-block-family.ts`.

## CLI binary policy

Official workspace projects install `wp-typia` as a local devDependency and
expose package scripts for the common CLI entrypoints:

```json
{
  "scripts": {
    "sync-rest:package": "ttsx scripts/sync-rest-contracts.ts --package",
    "sync-rest:package:check": "ttsx scripts/sync-rest-contracts.ts --package --check",
    "wp-typia:sync": "wp-typia sync",
    "wp-typia:doctor": "wp-typia doctor",
    "wp-typia:doctor:workspace": "wp-typia doctor --workspace-only",
    "wp-typia:add": "wp-typia add"
  },
  "devDependencies": {
    "wp-typia": "<version>"
  }
}
```

## Minimal Workspace vs Plugin QA Profile

Use the default workspace template when you want the smallest editable shell and
plan to add QA infrastructure later. Use `--profile plugin-qa` when the plugin
should start with local WordPress smoke checks, `.wp-env.json`, `.env.example`,
`scripts/integration-smoke/local-smoke.mjs`, and release zip scripts.

Existing minimal workspaces can adopt the same QA surface later:

```bash
npm run wp-typia:add -- integration-env local-smoke --wp-env --release-zip
```

Use the script form from generated workspaces so the executable CLI package is
clearly separated from support packages such as `@wp-typia/project-tools`.

Workspaces that ship REST resources can run `sync-rest:package` before release
builds to copy generated runtime schemas into `inc/rest-schemas`. Add
`sync-rest:package:check` to release CI so stale or missing packaged schemas are
caught before a zip is built without TypeScript source files.

The generated `inc/rest-schema.php` helper centralizes schema loading and
WordPress REST sanitization. Generated REST resources use it automatically, and
custom PHP resources can call
`<phpPrefix>_get_wordpress_rest_schema( 'settings-response', array( 'resource' => 'settings' ) )`
or `<phpPrefix>_validate_and_sanitize_rest_payload(...)` to reuse the same
packaged/source lookup and `WP_Error` handling.

Use generated REST resources when the workspace should own the PHP route glue.
Use `wp-typia add rest-resource <name> --manual` for provider routes owned by
another plugin, editor contract, or legacy controller. Manual routes can declare
custom namespaces, `--path` or `--route-pattern` patterns with named captures,
and route-owner metadata such as `--permission-callback`,
`--controller-class`, and `--controller-extends` while still generating typed
schemas, OpenAPI, clients, and drift checks.

Manual settings contracts can model write-only credentials with
`--secret-field <field>`. The generated request type marks the field as
`tags.Secret<"has<Field>">` plus `tags.PreserveOnEmpty<true>`, response types
expose only the safe has-value field, and generated admin settings screens omit
blank secrets so existing stored values are preserved by default.

| Package manager | Doctor                     | Sync check                         | Add a block                                               |
| --------------- | -------------------------- | ---------------------------------- | --------------------------------------------------------- |
| npm             | `npm run wp-typia:doctor`  | `npm run wp-typia:sync -- --check` | `npm run wp-typia:add -- block my-block --template basic` |
| pnpm            | `pnpm run wp-typia:doctor` | `pnpm run wp-typia:sync --check`   | `pnpm run wp-typia:add block my-block --template basic`   |
| bun             | `bun run wp-typia:doctor`  | `bun run wp-typia:sync --check`    | `bun run wp-typia:add block my-block --template basic`    |
| yarn            | `yarn run wp-typia:doctor` | `yarn run wp-typia:sync --check`   | `yarn run wp-typia:add block my-block --template basic`   |

Existing workspaces can adopt the same scripts without regenerating. Pin
`wp-typia` to the project version you want CI to run, then use
`wp-typia:doctor:workspace` when optional local runtimes should be advisory.
