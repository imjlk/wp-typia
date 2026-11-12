---
title: 'Retrofitting an Existing Project'
description: Preview and apply the minimum wp-typia sync surface on an existing WordPress block project.
---

`wp-typia init` adds the minimum typed sync surface to an existing WordPress
block or plugin project. It previews by default. Pass `--apply` when the plan
matches the project you want to keep.

Use `wp-typia create` for a new project. `init` does not move your block source
or turn the repository into a full scaffold.

## Preview, then apply

From the project root:

```bash
npx wp-typia init
npx wp-typia init --apply
```

You can pass a project directory and a package manager:

```bash
npx wp-typia init ./my-plugin --package-manager npm
npx wp-typia init ./my-plugin --apply --package-manager npm
```

`--format json` prints the standard success envelope. The retrofit plan is
`data.plan`.

The preview lists the detected layout, dependency and script changes, helper
files, and the commands to run next. Nothing is written until `--apply`.

Apply snapshots `package.json`, the helper files it plans to change, standard
Webpack edits, and package-manager configuration. If a write fails, those
files roll back.

## Layouts that apply accepts

| Layout              | Required files                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Single block        | `src/block.json`, `src/types.ts`, and `src/save.tsx`                                          |
| Legacy single block | root `block.json`, `src/types.ts`, and `src/save.tsx`                                         |
| Multi-block         | `src/blocks/<slug>/block.json` with matching `types.ts` and `save.tsx`                        |
| Generated project   | an existing generated `wp-typia` project; apply refreshes managed lint and toolchain files    |
| Official workspace  | an official `wp-typia` workspace; apply refreshes the managed WordPress ttsc lint integration |

`src/blocks/*` wins over a single-block layout. A tree that does not match one
of these shapes is `unsupported`. `--apply` stops and tells you to read the
preview notes. The same happens when `types.ts` has more than one object-like
export that could be the attribute type: leave one candidate, or rename the
intended type, then rerun `init`.

## What stays yours

Apply does not rewrite block PHP, `edit`/`save` components, or other product
source. It also refuses to overwrite a project-owned lint setup:

- an existing ttsc lint config that does not already include
  `@wp-typia/ttsc-lint-plugin-wp` and `wordpress/i18n-text-domain`
- a lint config destination that already conflicts with the managed filename
- a project-owned `scripts/apply-ttsc-lint-compat.mjs`

Extend or move those files, then rerun `wp-typia init --apply`. If
`tsconfig.json` does not set `allowJs` or excludes JavaScript sources, doctor
warns and leaves that config for you to merge.

## What a supported block project gains

On a supported single-block or multi-block project, apply adds the canonical
`wp-typia` dependencies, sync scripts, and these helpers when they are missing:

- `scripts/block-config.ts`
- `scripts/sync-types-to-block-json.ts`
- `scripts/sync-project.ts`
- `scripts/apply-ttsc-lint-compat.mjs`
- `lint.config.mts`, when the lint config write is safe

Standard `webpack.config.*` imports move from `@typia/unplugin/webpack` to
`@ttsc/unplugin/webpack`. An obsolete `@typia/unplugin` dependency is removed
on those layouts.

Official workspaces and generated projects receive the lint and toolchain
updates only.

## Next commands

After a successful apply, the CLI prints package-manager-specific commands.
The usual order is:

```bash
npm install
npm run sync
npx wp-typia doctor
npx wp-typia migrate init --current-migration-version v1
```

Replace `npm` with the package manager you passed to `--package-manager`.
`sync` and `doctor` are the required follow-up. Migration setup is optional
and is not part of `init`.

Flag reference: [CLI `init`](../reference/cli.md#init).
Maintainer contract:
[Retrofit and Init](https://github.com/imjlk/wp-typia/blob/main/RETROFIT_INIT_DIRECTION.md).
