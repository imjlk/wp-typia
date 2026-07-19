---
title: 'Test Feedback Paths'
---

`wp-typia` keeps the full test lane intact, but local iteration does not always
need the slowest metadata-core-heavy suites on every save.

## Full validation stays the default for PR readiness

Use the full repository lane before pushing or merging:

- `bun run test`

That path remains the coverage baseline for CI and release validation.

## Pull request and main-push smoke gates

The primary CI workflow runs the post-build package and generated-project gates
for both pull requests and `main` pushes:

- package and example builds
- published-install smoke coverage
- the generated-project smoke matrix
- WordPress example E2E coverage

The instrumented `@wp-typia/project-tools` coverage job remains push-only because
the pull-request matrix already runs its focused regression lanes. Since that job
is intentionally skipped on pull requests, downstream smoke jobs use explicit
direct-dependency success checks so the skipped coverage ancestor cannot suppress
the pull-request gates. Documentation deployment remains restricted to successful
`main` pushes.

## Faster local loop

For everyday iteration, use:

- `bun run test:quick`

The quick lane intentionally keeps:

- root `tests/unit`
- `@wp-typia/block-types`
- `@wp-typia/dataviews`
- `@wp-typia/rest`
- `@wp-typia/api-client`

For workspace and compound CLI flows, add:

- `bun run test:quick:project-tools`

The `@wp-typia/project-tools` quick lane runs workspace and compound coverage
behind a single package build so local CLI work can stay representative without
paying for the slowest scaffold and migration suites every time.

If your change touches `wp-typia` CLI wrappers, `@wp-typia/block-runtime`, or a
metadata-core sync path directly, add the relevant package test or fall back to
the full `bun run test` lane before opening a PR.

## Profiling the slowest suites

Use the timing profiler when the test loop feels unexpectedly slow:

- `bun run test:profile`
- `bun run test:profile -- --suite repo:test:quick`
- `bun run test:profile -- --suite project-tools:test:quick`
- `bun run test:profile -- --suite project-tools:test:scaffold-core`
- `bun run test:profile -- --suite project-tools:test:migration-execution --json`

The profiler sorts suites by wall-clock duration and is the maintainer-facing
way to refresh a local baseline without editing CI.

### Reference sample

A recent local profiling run measured:

- `repo:test:quick` at about `70s`
- `project-tools:test:quick` at about `283s`

Treat those values as a point-in-time maintainer baseline, not a hard budget.

## Where the slowdown usually comes from

The heaviest suites are usually the `@wp-typia/project-tools` metadata-core
lanes:

- `project-tools:test:scaffold-core`
- `project-tools:test:migration-planning`
- `project-tools:test:migration-execution`

Those lanes are slower because they combine several expensive behaviors:

- TypeScript builds for `@wp-typia/api-client`, `@wp-typia/block-runtime`, and
  `@wp-typia/project-tools`
- temporary project and fixture setup
- metadata/schema generation and migration planning
- filesystem-heavy diffing, writes, and cleanup

That means the wall-clock cost is usually dominated by compilation and
filesystem churn rather than by assertion count alone.

## Maintainer expectations

- Use `bun run test:quick` while iterating locally.
- Use `bun run test:profile` when the quick lane starts drifting upward.
- Use targeted package tests when touching a focused subsystem.
- Use `bun run test` before pushing a PR update unless the branch is still in
  very early spike territory.
