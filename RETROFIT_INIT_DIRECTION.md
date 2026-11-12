# Retrofit and Init

`wp-typia init` adopts the minimum typed sync surface in an existing WordPress
block or plugin project. The command previews by default. `wp-typia init
--apply` writes that plan.

`wp-typia create` remains the path for a new project. `init` does not rewrite
an existing tree into a full scaffold.

## Current behavior

- `wp-typia create` scaffolds a new project or workspace from a known template.
- `wp-typia init [project-dir]` inspects the directory and prints the detected
  layout, package changes, helper files, and follow-up commands. It does not
  write files.
- `wp-typia init [project-dir] --apply` writes the planned `package.json`
  updates and generated helper files. Package manager scripts use
  `--package-manager <bun|npm|pnpm|yarn>`. `--format json` keeps the plan under
  `data.plan`.
- `wp-typia add ...` extends an official `wp-typia` workspace that already
  exists.
- `wp-typia migrate init` adds migration support only. It is a separate opt-in
  after the sync surface is in place.

Apply mode snapshots `package.json`, generated helper targets, standard
Webpack config edits, package-manager configuration, and any historical export
files it plans to touch. If a write fails, those files roll back.

## Supported layouts

Detection follows the migration bootstrap detector, then classifies projects
that already use the generated `wp-typia` surface:

| Kind                    | What `init` recognizes                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `single-block`          | `src/block.json` + `src/types.ts` + `src/save.tsx`                                          |
| `single-block` (legacy) | root `block.json` + `src/types.ts` + `src/save.tsx`                                         |
| `multi-block`           | `src/blocks/<slug>/block.json` with matching `types.ts` and `save.tsx`                      |
| `generated-project`     | an existing generated `wp-typia` project; only managed lint and toolchain files are updated |
| `official-workspace`    | an official `wp-typia` workspace; managed WordPress ttsc lint integration is updated        |
| `unsupported`           | any other tree, or supported files whose attribute type cannot be inferred                  |

`src/blocks/*` takes precedence over a single-block layout. Legacy root
`block.json` stays valid for retrofit. New scaffolds keep block metadata under
`src/`.

`wp-typia init --apply` refuses `unsupported` layouts. Run `wp-typia init`
first and read the blocking notes. The usual miss is a custom plugin layout
that does not place `block.json`, `types.ts`, and `save.tsx` in one of the
shapes above.

## What apply writes

For `single-block` and `multi-block` candidates, apply adds or updates:

- canonical `wp-typia` dependencies and dev dependencies
- sync scripts, including `check:code` (`ttsc check --noEmit`) and the shared
  sync entrypoint
- `scripts/block-config.ts`, `scripts/sync-types-to-block-json.ts`, and
  `scripts/sync-project.ts`
- `scripts/apply-ttsc-lint-compat.mjs` and a text-domain-aware
  `lint.config.mts` when that write is safe
- the `packageManager` field when the selected package manager should be
  recorded
- standard `webpack.config.*` imports, from `@typia/unplugin/webpack` to
  `@ttsc/unplugin/webpack`, and removal of an obsolete `@typia/unplugin`
  dependency

Official workspaces and already generated projects receive the managed lint
and toolchain updates only. Their block source and sync scripts stay in place.
Official workspaces also migrate historical generated export identifiers before
the combined code gate is treated as current.

Existing block and plugin source stays where it is. Apply does not move files
or convert the tree into the official scaffold layout.

## Preserved project-owned files

Apply stops, without writing, when it cannot prove a safe managed update:

- a project-owned ttsc lint config that does not already include
  `@wp-typia/ttsc-lint-plugin-wp` and `wordpress/i18n-text-domain`
- a lint config whose required destination already exists and conflicts
- an existing `scripts/apply-ttsc-lint-compat.mjs` that is project-owned

Reconcile those files, then rerun `wp-typia init --apply`. Doctor reports an
adoption warning when an existing `tsconfig.json` does not set `allowJs` or
excludes JavaScript sources. That project-owned config is left for a manual
merge.

## After apply

The printed next steps are package-manager aware. The usual sequence is:

1. Install or reinstall dependencies.
2. Run the managed `sync` script.
3. Run `wp-typia doctor`.
4. Optionally run `wp-typia migrate init --current-migration-version v1`.

Migration UI, workspace inventory, persistence, and REST contracts stay
explicit follow-ups. `migrate init` is not an alias of `init`.

## Non-goals

The retrofit flow does not:

- rewrite arbitrary project structures into the official scaffold layout
- move files across directories
- infer product-specific persistence, REST, or editor-plugin architecture
- enable migration UI unless you run `wp-typia migrate init`
- replace `create` for greenfield projects

## Remaining gaps

- Arbitrary plugin trees stay `unsupported`. Widen detection only for layouts
  that can name a real `block.json`, `types.ts`, and `save.tsx` triple without
  guessing.
- When several object-like exports could be the attribute type, `init` reports
  `unsupported` and asks you to rename one export or leave a single candidate.
- Preview output is still the default. Do not treat a preview plan as a
  completed install.

The user-facing walkthrough is
[Retrofitting an Existing Project](https://imjlk.github.io/wp-typia/guides/retrofit-init/).
