# Contributing

Thanks for helping improve `wp-typia`.

## Local setup

This repository is Bun-first. The checked-in `mise.toml` matches the primary CI
baseline for Bun and Node.js without forcing contributors to compile PHP from
source. The reproducible setup path is:

```bash
mise trust
mise install
mise exec -- bun install --frozen-lockfile
```

If you do not use mise, install the Bun and Node.js versions declared in
`mise.toml` and run `bun install --frozen-lockfile` directly. PHP 8.1 remains
the primary maintainer lint baseline and can be supplied by the system or
another version manager. Generated-project CI uses a separate PHP 8.0 runtime
to enforce the scaffold's declared syntax floor.

## Common checks

```bash
bun run lint:repo
bun run lint:fix
bun run format:check
bun run format:write
bun run maintenance-automation:validate
bun run toolchain-policy:validate
bun run samchon-graph:validate
bun run samchon-graph:smoke
bun run formatting-policy:validate
bun run lint:all
bun run typecheck
bun run test:repo:fast
bun run test:repo
bun run build
bun run ci:local
bun run examples:lint
bun run examples:wp-env:start:test
bun run examples:test:e2e
bun run examples:wp-env:stop
bun run test:coverage
```

Quick command map:

- `bun run lint:repo` = root ESLint for JavaScript, CJS, and MJS infrastructure
- `bun run lint:fix` = root JavaScript ESLint fixes followed by TypeScript `ttsc fix`
- `bun run lint:all` = root ESLint + example lint + PHP checks
- `bun run typecheck` = non-mutating `ttsc` type, lint, unused, and TypeScript format gate
- `bun run format:check` = non-mutating Prettier check for repo-owned non-TypeScript files
- `bun run format:write` = `ttsc format` for TypeScript followed by Prettier for non-TypeScript files
- `bun run maintenance-automation:validate` = verifies Dependabot and audit workflow policy
- `bun run toolchain-policy:validate` = keeps mise, package-manager, and primary CI runtime versions aligned
- `bun run samchon-graph:validate` = verifies the pinned project code-graph server and its TypeScript/PHP-only scope
- `bun run samchon-graph:smoke` = runs a real static graph dump against TypeScript, PHP, and excluded fixture files
- `bun run formatting-policy:validate` = verifies the documented Prettier/CI baseline
- `bun run test:repo:fast` = no-build source and policy lane for lightweight local feedback
- `bun run test:repo` = root unit + CLI test aggregation
- `bun run test:all` = legacy alias for `bun run test:repo` and still excludes E2E
- `bun run ci:local` = fast maintainer preflight mirroring the non-E2E CI path
- `bun run build` = product packages + reference app
- `bun run examples:build` = reference app only
- `bun run --filter @wp-typia/project-tools test` = project orchestration/runtime only
- `bun run examples:test:e2e` = Playwright against the reference app
- `bun run examples:test:e2e` expects `bun run examples:wp-env:start:test` to already be running

Linting ownership is intentionally split:

- `ttsc` and the root `lint.config.ts` own TypeScript/TSX type, lint, unused, and formatting diagnostics
- root ESLint covers JavaScript, CJS, and MJS infrastructure such as `scripts/**`, root config files, and package-side non-example sources
- example and generated-project JavaScript continues to use the `@wordpress/scripts` compatibility lane
- `@wp-typia/api-client/internal/runtime-primitives` is the single maintained home for shared client-runtime validation/object helpers consumed by `@wp-typia/rest`; avoid reintroducing local helper copies in either package

Formatting ownership is also explicit:

- the repo root uses TypeScript `7.0.2`, `ttsc`/`@ttsc/lint` `0.23.0`, ESLint `9.39.4`, and `@eslint/js` `9.39.4`
- `ttsc` formats TypeScript/TSX at 80 columns, two spaces, semicolons, single quotes, trailing commas, and LF endings
- the repo root uses Prettier `3.8.2` for repo-owned non-TypeScript docs, config, workflow, and policy files
- example apps and built-in scaffold package manifests stay aligned on compatible `ttsc`/`@ttsc/lint` and Prettier ranges when they declare direct formatter dependencies
- package, example, and generated-project TypeScript formatting is owned by `ttsc`; `@wordpress/scripts` remains the compatibility lint lane for WordPress JavaScript
- the current example block workspaces keep a local `eslint` 8 pin so the `@wordpress/scripts` lint lane stays stable while the repo root uses ESLint 9 for infrastructure code
- example and generated `lint:js` scripts route through `run-wp-scripts-lint-js-compat.mjs`; examples resolve their explicit ESLint 8 pin, while generated projects resolve the ESLint bundled with `@wordpress/scripts`
- the compatibility wrapper preloads `register-typescript6.cjs`, redirecting legacy WordPress ESLint Compiler API consumers to the exact `@typescript/typescript6@6.0.2` island without widening ESLint into TS/TSX
- generated projects declare React 18 and its types directly so TS7 JSX resolution does not depend on package-manager hoisting
- GitHub Actions now runs both `bun run formatting-policy:validate` and `bun run format:check` in the main lint job

See [`docs/formatting-toolchain-policy.md`](https://imjlk.github.io/wp-typia/maintainers/formatting-toolchain-policy/) for the exact scope and rationale.

Maintenance automation is explicit too:

- Dependabot currently opens update PRs for `github-actions` and root `composer` tooling only
- those PRs still target `main` and flow through the normal `release/sampo` release lane after merge
- Bun/npm workspace dependency bumps remain maintainer-led until we adopt a release-aware automation strategy for publishable package coupling
- `.github/workflows/dependency-audit.yml` owns the PR/main `composer audit --locked` gate and the scheduled/manual `bun audit --audit-level high` lane
- `.github/workflows/test-matrix.yml` keeps the slower scheduled/manual matrix and CodeQL coverage

See [`docs/maintenance-automation-policy.md`](https://imjlk.github.io/wp-typia/maintainers/maintenance-automation-policy/) for the exact cadence and review posture.

`bun run ci:local` is the recommended maintainer pre-PR command. It deliberately
stops short of `wp-env` startup and Playwright E2E so everyday local checks stay
fast.

## Codex code graph

The repository includes `@samchon/graph` as a pinned development tool. After
`bun install`, trust this repository in Codex and restart Codex so it loads
`.codex/config.toml`. The project configuration runs the installed local binary
through a cross-platform Node launcher from the repository root and indexes only
TypeScript and PHP; Mustache templates and generated JavaScript or bundles remain
outside this graph. Run `bun run samchon-graph:validate` after changing the
dependency, launcher, or Codex configuration, and run
`bun run samchon-graph:smoke` to verify the installed graph package actually
indexes TypeScript and PHP while excluding JavaScript and Mustache templates.

Use `bun run test:repo:fast` as the first local signal for docs, policy, script,
and small runtime/package-source edits. It skips package builds, example Webpack
builds, generated-project smoke, package-contract suites that require built
artifacts, and E2E; keep using `bun run test:quick`, `bun run test:repo`, and
`bun run build` before merging changes that touch generated artifacts, sync
flows, package manifests, or example runtime behavior.

For generated project smoke checks:

```bash
node scripts/run-generated-project-smoke.mjs --runtime node --template basic --package-manager npm --project-name smoke-basic
```

CI adds `--php-version 8.0` to that command. The option is strict: it requires
the matching PHP major/minor runtime and runs `php -l` over every generated PHP
file instead of silently skipping syntax compatibility checks.

## Documentation

```bash
bun run docs:build
```

## Project meta docs

- [`README.md`](./README.md) is the main product/audience entry point
- [`UPGRADE.md`](./UPGRADE.md) collects high-signal maintainer upgrade notes
- [`SECURITY.md`](./SECURITY.md) explains private vulnerability reporting
- [`docs/block-generator-architecture.md`](https://imjlk.github.io/wp-typia/architecture/block-generator-architecture/) records the typed generator architecture and phase map
- [`docs/block-generator-tool-contract.md`](https://imjlk.github.io/wp-typia/architecture/block-generator-tool-contract/) records the non-mutating staged controller/tool payload contract on top of the typed generator boundary
- [`docs/external-template-layer-composition.md`](https://imjlk.github.io/wp-typia/architecture/external-template-layer-composition/) records the external layer package RFC on top of the built-in shared scaffold model
- [`docs/core-data-adapter-boundary.md`](https://imjlk.github.io/wp-typia/maintainers/core-data-adapter-boundary/) records when future `@wordpress/core-data` adapters should be preferred over `@wp-typia/rest`
- [`docs/formatting-toolchain-policy.md`](https://imjlk.github.io/wp-typia/maintainers/formatting-toolchain-policy/) records the formatter baseline and CI gate
- [`docs/maintenance-automation-policy.md`](https://imjlk.github.io/wp-typia/maintainers/maintenance-automation-policy/) records the dependency update and audit baseline

If you change user-facing workflows, keep the relevant meta docs in sync in the
same PR.

## Generated project toolchain matrix

Generated project Webpack defaults are currently regression-covered against:

- `typia` 13.x
- TypeScript 7.x with `ttsc` 0.23.x
- `@ttsc/unplugin` 0.23.x
- `@wordpress/scripts` 30.x with Webpack 5

The generated Webpack helpers now fail fast outside that matrix so broken
version tuples surface as a clear compatibility error instead of a cryptic
transform crash. If you intentionally expand the supported matrix, add or update
generated-project build smoke coverage in the same PR before relaxing the guard.

## Releases

Release management now uses Sampo for release metadata and GitHub Actions for publish:

```bash
bun run sampo:add
bun run changesets:validate
bun run release
```

- `bun run sampo:add` creates a new pending release note in `.sampo/changesets/`
- pending changesets must use canonical package ids like `npm/@wp-typia/project-tools`
- `bun run changesets:validate` is the quickest preflight check before you push or update the release PR
- `bun run runtime-coupling:validate` enforces the runtime-family dependency policy before CI or the release PR can proceed
- `bun run release` runs `sampo release` locally to inspect the version/changelog changes that the release PR workflow will generate
- `bun run publish` remains a local/manual fallback and is not the primary CI publish path
- `DRY_RUN=1 bun run publish:oidc` is the safest local way to preview the OIDC publish script behavior without pushing packages
- `bun run publish:validate` checks that every publishable workspace package under `packages/` is covered by `scripts/publish-oidc.sh` and already has an initial npm seed publish

GitHub release automation is split into two workflows:

1. Merge feature PRs into `main` with **Squash and merge**
2. `.github/workflows/release-pr.yml` updates the `release/sampo` PR from `main`
3. Review and **Squash and merge** the release PR
4. `.github/workflows/create-release.yml` creates a GitHub Release automatically from the merged release commit
5. `.github/workflows/publish.yml` publishes packages with npm OIDC from the merged release commit's `main` push
6. `.github/workflows/create-release.yml` dispatches `.github/workflows/release-standalone-assets.yml` for the new release tag so standalone archives are attached to the GitHub Release

`workflow_dispatch` remains available as a manual fallback if package publishing or standalone asset generation needs to be rerun.

### First release of a new npm package

When you add a brand-new publishable workspace package under `packages/`, do all
of the following before you rely on the normal release PR flow:

1. Add the package directory to `scripts/publish-oidc.sh`.
2. Seed the package name on npm with a manual first publish, typically `0.1.0`.
3. Wait until `npm view <package-name> version` succeeds from a normal registry read.
4. Run `bun run publish:validate` and make sure CI stays green.
5. Only then merge PRs that make other released packages or generated-project smoke jobs depend on that package.
6. After the bootstrap release exists, let the normal Sampo release PR automation publish subsequent versions.

This matters because generated-project smoke jobs install released package
versions from npm. If a newly referenced package has not been published yet,
those jobs can fail even when the source tree and release PR look correct.

## Runtime package dependency policy

The runtime-oriented package family is intentionally coupled:

- `@wp-typia/rest` depends on `@wp-typia/api-client` with a caret range
- `@wp-typia/block-runtime` depends on `@wp-typia/api-client` with a caret range
- `@wp-typia/project-tools` depends on `@wp-typia/api-client`, `@wp-typia/block-runtime`, `@wp-typia/rest`, and `@wp-typia/block-types` with caret ranges
- `wp-typia` pins `@wp-typia/project-tools` exactly and depends on `@wp-typia/api-client` with a caret range

Why this split exists:

- runtime helpers that shipped/generated projects need at install time stay in `dependencies`
- host-provided integrations such as `react` or `@wordpress/element` stay in `peerDependencies`
- `wp-typia -> @wp-typia/project-tools` stays exact because the published CLI and orchestration package are tested and released as a locked pair

Validation uses planned publish truth, not just source truth:

- `@wp-typia/rest` keeps `workspace:*` in source so local development stays ergonomic
- the coupling validator only materializes the sanctioned `@wp-typia/rest -> @wp-typia/api-client` workspace edge against the planned next version before checking the release lane
- caret-coupled dependents still need a pending changeset in the same PR when an upstream change falls outside the current lane
- source dependency ranges may stay on the currently installable workspace versions during a changeset PR; the Sampo release/versioning step rewrites caret and exact runtime dependencies to the planned published versions

## TypeScript runtime dependency audit

TypeScript is **not** a blanket runtime dependency across the repo.

- TypeScript 7 is the primary compiler for repository builds and checks, but it does not expose the JavaScript Compiler API
- `@wp-typia/block-runtime` keeps `@typescript/typescript6` in `dependencies` because the published metadata parser/analysis/core paths use the TypeScript Compiler API at runtime
- `@wp-typia/project-tools` keeps `@typescript/typescript6` in `dependencies` because the published workspace inventory helpers used by `add`, `doctor`, migrations, and workspace block selection parse `scripts/block-config.ts` through the Compiler API
- `apps/docs` aliases its local `typescript` dependency to `@typescript/typescript6` so TypeDoc and Astro run in the same isolated Compiler API-compatible island
- `wp-typia`, `@wp-typia/rest`, `@wp-typia/api-client`, and `@wp-typia/block-types` do **not** need a Compiler API package in `dependencies`; they stay build/test-only TypeScript consumers

This is enforced by `bun run typescript-runtime:validate` in local CI and GitHub Actions.

If you want to move `@typescript/typescript6` out of `dependencies` for
`@wp-typia/block-runtime` or `@wp-typia/project-tools`, first remove the
runtime Compiler API usage itself. A dependency-only manifest edit without
that refactor is not safe.

## Published package footprint

Published package size is intentional, but it still needs regular review.

- `wp-typia` should publish only the runtime assets needed by the CLI (for example `bin/wp-typia.js`, generated `bin/` routing helpers, and `dist/`) plus standard npm metadata such as `package.json`, `README.md`, and `LICENSE`. Repo-only inputs and removed Bunli/OpenTUI artifacts should stay out of the published file list.
- Gunshi runtime assets should resolve from `dist/` in the packed CLI tarball. Avoid publishing repo-specific absolute-path asset trees or stale Bunli output directories.
- `@wp-typia/project-tools` still ships `templates/` and keeps `@typescript/typescript6` in `dependencies` intentionally, because published scaffolding and workspace inventory paths rely on those runtime inputs today.

When you change package metadata or build output layout, verify the packed surface directly with `npm pack --dry-run --json ./packages/<name>` before opening the PR.

## Pull requests

- Keep changes scoped and intentional.
- Add or update tests when behavior changes.
- If a template workflow changes, update the user-facing README or tutorial in the same PR.
- If migration behavior or snapshot tooling changes, verify at least one `migration:*` flow in `examples/my-typia-block` before opening the PR.
- Do not file security issues publicly; use the private reporting flow described in [`SECURITY.md`](./SECURITY.md).
