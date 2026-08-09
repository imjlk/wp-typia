---
title: 'Formatting Toolchain Policy'
---

`wp-typia` keeps formatting expectations explicit instead of leaving them to drift package by package.

## Current baseline

- the repository root owns TypeScript `7.0.2`
- the repository root owns `ttsc` and `@ttsc/lint` at `0.23.0`
- packaged project tools fall back to `@wp-typia/ttsc-lint-plugin-wp` `^0.2.0`
  as the WordPress-specific contributor baseline
- the repository root owns `eslint` at `9.39.4`
- the repository root owns `@eslint/js` at `9.39.4`
- the repository root owns `prettier` at `3.8.2`
- the repository root owns `eslint-config-prettier` at `10.1.8`
- `bun run typecheck` runs `ttsc --noEmit`, so TypeScript type, lint, unused,
  and formatting diagnostics fail together
- `bun run format:check` is the canonical non-mutating Prettier gate for
  repo-owned non-TypeScript files
- `bun run format:write` runs `ttsc format` for TypeScript and Prettier for
  repo-owned non-TypeScript files
- `bun run lint:fix` runs ESLint fixes for JavaScript and `ttsc fix` for
  TypeScript
- `bun run formatting-policy:validate` checks that package manifests and CI wiring still match the documented formatter baseline

## TypeScript ownership

`ttsc` owns every repo TypeScript and TSX source that participates in the root
TypeScript project. The root `lint.config.ts` enables:

- `no-var`, `prefer-const`, and `eqeqeq` as errors
- compiler unused diagnostics through the repository TypeScript configuration
- format diagnostics as errors at 80 columns, two spaces, semicolons, single
  quotes, trailing commas, and LF endings

Run `bun run typecheck` for the non-mutating gate, `ttsc format` for
format-only writes, or `ttsc fix` for all enabled TypeScript fixes. ESLint does
not parse or lint TypeScript in this repository.

## Scope of Prettier `format:check`

`bun run format:check` is intentionally scoped to repo-owned documentation, configuration, workflow, and policy files such as:

- root docs and meta docs
- `apps/docs/src/content/docs/**/*.md` plus the repo-owned Starlight config files
- generated API outputs stay out of scope under `apps/docs/src/content/docs/api/**`
- root config and workspace metadata
- `.github` workflow and markdown files
- repo policy/validation scripts that define the formatter baseline itself

It is not a blanket formatter pass over every source file in the monorepo.

Why the scope stays narrow:

- TypeScript and TSX already have stronger ownership through `ttsc`
- JavaScript, CJS, and MJS linting stays with ESLint
- generated and emitter-owned TypeScript must satisfy the same `ttsc` contract
  when generated-project smoke tests compile it
- repo-owned prose, workflow, and policy files are the places where style drift hurts maintainer velocity the fastest

## Autofix commands

Use the root autofix scripts when you are changing repo-owned infrastructure,
docs, or policy files:

- `bun run lint:fix` for root JavaScript ESLint fixes followed by TypeScript
  `ttsc fix`
- `bun run format:write` for the TypeScript `ttsc format` pass followed by the
  repo-owned non-TypeScript Prettier write pass

`lint:repo` remains JavaScript-only. Example and generated package scripts use
the same ownership split: `ttsc` handles TypeScript/TSX,
`@wordpress/scripts` ESLint handles JavaScript/CJS/MJS correctness, while
Prettier owns formatting for handwritten JavaScript/CJS/MJS. Generated JSON,
Markdown, and metadata stay under their respective generators and synchronizer
checks so a formatter write cannot invalidate their exact generated output.

## Example apps and built-in templates

Example apps and built-in scaffold package manifests stay aligned on
`ttsc` `0.23.0` and `prettier` `3.8.2` ranges when they declare those direct
development dependencies. Generated manifests pin `@ttsc/lint` to exact
`0.23.0` while its compatibility hook targets that source.

Their formatter scripts run `ttsc format` for TypeScript/TSX, the WordPress
ESLint compatibility wrapper with `--fix` for JavaScript/CJS/MJS correctness,
and then Prettier over their handwritten JavaScript/CJS/MJS sources; the
existing Prettier write scope remains responsible for opted-in non-TypeScript
inputs. `format:check` independently checks only the handwritten JavaScript
lane in generated-project smoke, intentionally excluding emitted block and
typia JSON artifacts.
Generated TypeScript and JavaScript are expected to be clean on first emission
rather than relying on a consumer-side write pass.
The compatibility wrapper explicitly disables WordPress ESLint's embedded
`prettier/prettier` rule: its punctuation preferences differ from the generated
Prettier config, and enabling both would make a clean generated `.mjs` or
`.cjs` file fail linting.

The repo-root ESLint 9 upgrade does not automatically move example apps onto the
same lane. Example block workspaces still defer to `@wordpress/scripts` for
their non-TypeScript JavaScript linting, and they currently keep a local
`eslint` 8 compatibility pin until the WordPress lint stack fully supports
ESLint 9. Their `lint:js` scripts flow through
`scripts/run-wp-scripts-lint-js-compat.mjs`, which keeps the
`@wordpress/scripts` default config/ignore behavior but resolves the
example-local ESLint 8 binary instead of the repo-root ESLint 9 install.

Generated projects include the same wrapper locally. Because they do not pin
ESLint directly, it resolves the version owned by `@wordpress/scripts`.
Both paths preload `register-typescript6.cjs`, which redirects legacy ESLint
Compiler API consumers to exact `@typescript/typescript6@6.0.2` while TS/TSX
remain under `ttsc`. Generated manifests also declare React 18 and its type
packages directly so TS7 JSX resolution is reproducible under npm, Bun, pnpm,
and Yarn rather than depending on transitive hoisting.

Generated lint configs extend the supported portion of the WordPress
`recommended` preset from `@wp-typia/ttsc-lint-plugin-wp`. The complete
WordPress-owned `i18n` preset is native, including translator comments,
literal safety, whitespace, punctuation, placeholder, text-domain, and
`sprintf` checks. The `wordpress/i18n-text-domain` rule is bound to the
scaffold's normalized text domain, while `wordpress/no-unsafe-wp-apis` remains
enabled through the broader partial preset. Existing projects can preview the
same dependency, config, and script adoption with `wp-typia init`;
`wp-typia init --apply` writes it with rollback protection and refuses to
overwrite a project-owned lint config.

The TypeScript lane still uses `ttsc --noEmit`, so compiler and lint diagnostics
remain combined. `lint:js` continues to own only JavaScript/CJS/MJS through the
WordPress ESLint compatibility wrapper. A true lint-only split waits for
[samchon/ttsc#1127](https://github.com/samchon/ttsc/issues/1127); the scaffold
must not advertise `ttsc lint` before that command exists upstream.

CI stores content-addressed `ttsc` source-plugin binaries outside
`node_modules` in `.ttsc-cache/plugins`. Workspace and generated-project
lanes use separate cache keys, each derived from `bun.lock`, the compatibility
patch files, and Go module inputs. Each runner's large Go-object cache stays
in its temporary directory rather than being uploaded to every matrix job.
This keeps cache transfer bounded while warm runs reuse matching typia and
`@ttsc/lint` binaries without restoring source-plugin output built from an old
patch.
On a cold run, the prepare job also shares only the completed source-plugin
binaries with the project-tools matrix, avoiding five identical native builds
without uploading the much larger Go-object cache.

## Root compatibility patches

The root Bun workspace carries two exact-version build-tool patches:

- `typia@13.2.0` accepts the JSON-encoded `--tsgo-args` envelope in its native
  `ttsc-typia` build and transform hosts. Without the patch, TypeScript CLI
  options forwarded by `ttsc`, such as `--strict`, do not reach the tsgo
  program used by the typia transform.
- `@ttsc/lint@0.23.0` avoids asking the TypeScript-Go shim for a declaration
  type-parameter list when formatting mapped-type and `infer` type parameters.
  Without the patch, trailing-comma formatting can panic on those nodes.

The Bun `patchedDependencies` mappings belong only to the root development and
build toolchain. Published packages and generated projects do not inherit
them; publish-install smoke must pass against registry typia and ttsc packages.

Registry `@ttsc/lint@0.23.0` still reproduces the mapped/`infer` panic outside
the root. Generated projects therefore include
`scripts/apply-ttsc-lint-compat.mjs` and run it from `postinstall`. The script:

- requires exact `@ttsc/lint@0.23.0`
- verifies the expected unpatched or already-patched source before writing
- atomically applies only the mapped/`infer` parent guard used by the root
  patch, so pnpm-style content-addressed stores are not modified through a
  shared file inode
- works after npm, Bun, pnpm, or Yarn node-modules installs without adding a
  runtime dependency
- fails closed when the package version or source layout changes

Yarn Plug'n'Play stores package sources in read-only archives, so the hook
cannot safely run through that linker. New Yarn scaffolds already set
`nodeLinker: node-modules`; when `wp-typia init --apply` detects an existing
PnP install, it updates only that top-level `.yarnrc.yml` setting before the
next install. Other Yarn settings and comments stay intact, and the next
postinstall writes the private mutable copy under `node_modules` rather than a
shared archive.

This is a generated development-tool compatibility hook, not a WordPress
runtime dependency. Generated-project smoke owns the create, install, doctor,
and build proof for this root-patch-free consumer path.

The formatting policy validator ties each patch path and SHA-256 digest to its
exact package version and fails when the package version, mapping, file, or
contents change. To upgrade either dependency:

1. install the new unpatched version and run the ttsc compatibility regression
   tests;
2. remove the root patch and generated compatibility hook only when CLI option
   forwarding, typia transformation, and mapped/`infer` formatting all pass
   without them;
3. otherwise port the root patch and generated hook to the exact new version,
   update the documented mapping, and rerun generated-project and
   publish-install smoke tests.

## CI posture

Formatting is a first-class CI expectation.

- the main lint job runs `bun run formatting-policy:validate`
- the same lint job runs `bun run format:check`
- the typecheck job runs `ttsc --noEmit`, which also enforces TypeScript lint
  and format diagnostics
- `bun run ci:local` includes both commands before the broader lint/type/test/build pass

If we decide to widen or narrow formatter scope later, change this document, the validator, and the CI step in the same PR so the policy remains intentional.
