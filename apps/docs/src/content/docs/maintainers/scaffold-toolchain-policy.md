---
title: 'Scaffold Toolchain Policy'
---

`wp-typia` treats scaffolded project toolchain defaults as an explicit maintainer
policy rather than a collection of historical template decisions.

## Package-manager fields

Scaffolded projects follow two different rules depending on the selected
package manager:

- `bun`, `pnpm`, and `yarn` scaffolds emit an exact `packageManager` field from
  `packages/wp-typia-project-tools/src/runtime/package-managers.ts`
- `npm` scaffolds intentionally omit the `packageManager` field

Why the split exists:

- non-npm managers depend more heavily on an explicit package-manager selector
  and lockfile semantics, so the scaffold records the exact tool that its
  generated scripts expect
- npm remains the broadest compatibility path because it ships with Node by
  default, so npm scaffolds avoid pinning a specific npm patch line into the
  generated project manifest
- when the repository updates one of those exact package-manager strings, the
  same PR should update the runtime definition, any scaffold assertions, and
  this document together

## Node runtime signaling

First-party scaffolds declare `engines.node >=24.0.0` in generated
`package.json` files. They intentionally do **not** emit `.nvmrc` or
`.node-version`.

That split is deliberate:

- `.nvmrc` and `.node-version` are shell-manager-specific hints rather than
  universal package metadata
- `engines.node` is portable package metadata and gives package managers,
  generated-project CI, and `wp-typia doctor` one Node 24 minimum to enforce
- adding helper files later is still allowed, but should happen as a
  deliberate repository-wide policy change rather than template-by-template
  drift

If Node version helper files are added later, update this document, scaffold
tests, and generated README guidance in the same PR.

## `@wp-typia/*` dependency strategy

Generated package manifests use the versions resolved by
`packages/wp-typia-project-tools/src/runtime/package-versions.ts`.

The current policy is:

- scaffolded `@wp-typia/*` package dependencies use caret ranges
- generated lint configs declare the independently installable
  `@wp-typia/ttsc-lint-plugin-wp` contributor as a development dependency
- those ranges are sourced from the canonical package manifests that ship with
  the current CLI release
- exact pins are reserved for places where the generated output must name a
  specific CLI release, such as `npx wp-typia@<version>` guidance in generated
  documentation

Why caret ranges are still the default for scaffolded package manifests:

- the `@wp-typia/*` family is still on `0.x`, so caret ranges stay inside the
  current minor line and avoid silent cross-minor upgrades
- patch-level updates within that minor line are usually the right maintenance
  default for scaffolded projects
- the CLI and generated tests already validate the current package surface
  against that ranged dependency strategy before release

## Package version cache policy

`getPackageVersions()` uses a process-local cache to avoid reparsing package
metadata when repeated scaffold operations run inside one CLI or integration
process. The cache key includes the resolved project-tools manifest, sibling
workspace package manifests, installed dependency manifests, file metadata, and
a content fingerprint. When any of those manifests changes on disk, the next
lookup recomputes versions and replaces the cached object.

Long-lived integrations such as MCP servers, watch processes, and linked
development shells should call `clearPackageVersionsCache()` from
`@wp-typia/project-tools` after running `bun install`, changing package
manifests, or relinking local packages. The next `getPackageVersions()` call
then re-resolves the same manifest set synchronously. The older
`invalidatePackageVersionsCache()` name remains available as a compatibility
alias, but new integrations should prefer `clearPackageVersionsCache()`.

`WP_TYPIA_PROJECT_TOOLS_PACKAGE_ROOT` is still an import-time package-root
override. Set it before loading `@wp-typia/project-tools`; clearing the version
cache refreshes package metadata under the already resolved root, not the module
root itself.

## Practical summary

When touching scaffolded package metadata:

- keep `packageManager` exact for `bun`, `pnpm`, and `yarn`
- keep `packageManager` omitted for `npm`
- keep `engines.node` at `>=24.0.0`
- do not add `.nvmrc` or `.node-version` unless this policy changes explicitly
- keep generated `@wp-typia/*` dependencies on caret ranges sourced from
  `package-versions.ts`
- keep the WordPress ttsc contributor version sourced from its package manifest
  without making it a runtime dependency of `wp-typia` or project-tools
- use `clearPackageVersionsCache()` in long-lived integrations after package
  metadata or linked package installs change
