---
title: 'Formatting Toolchain Policy'
---

`wp-typia` keeps code diagnostics and formatting ownership explicit instead of
allowing each package to assemble a different lint stack.

## Current baseline

- the repository root owns TypeScript `7.0.2`
- the repository root owns `ttsc`, `@ttsc/lint`, and `@ttsc/unplugin` at
  `0.26.2`
- packaged project tools fall back to `@wp-typia/ttsc-lint-plugin-wp` `^0.2.0`
- the repository root owns ESLint `9.39.4` for repo JavaScript and Prettier
  `3.8.2` for selected non-TypeScript files
- `bun run typecheck` is the root TypeScript, lint, unused, and format gate
- `bun run formatting-policy:validate` checks package manifests, generated
  templates, patches, examples, and CI against this policy

## Repository ownership

The root `lint.config.ts` and TypeScript project are owned by `ttsc`. ESLint
does not parse TypeScript or TSX in this repository. The root configuration
enables compiler unused diagnostics, formatting diagnostics, and safe rules
such as `no-var`, `prefer-const`, and `eqeqeq`.

JavaScript, CJS, and MJS used by repository infrastructure remain under
ESLint. Prettier owns Markdown, JSON, YAML, styles, and the other explicitly
listed non-TypeScript inputs. Generated artifacts stay under their generator
or synchronizer rather than being rewritten by a blanket formatter pass.

Use:

- `bun run typecheck` for the root non-mutating TypeScript and lint gate
- `bun run lint:repo` for root JavaScript diagnostics
- `bun run format:check` for the non-mutating non-TypeScript format gate
- `bun run lint:fix` for ESLint and `ttsc fix`
- `bun run format:write` for `ttsc format` and Prettier writes

## Generated projects and examples

New projects, retrofit plans, and WordPress examples expose the same contract:

- `check:code` runs the project sync check followed by
  `ttsc check --noEmit`
- `check:style` retains `@wordpress/scripts` Stylelint behavior
- `check:format` uses Prettier for JavaScript and non-code files
- `check` combines those three gates
- `format` uses `ttsc format` for code, then Prettier restores the WordPress
  JavaScript and non-code formatting contract

Generated lint configs set `format.severity` to `off`. This keeps `ttsc check
--noEmit` focused on compiler and lint diagnostics while `ttsc format` remains
the TypeScript write path. Prettier gates JavaScript, JSON, Markdown, YAML, and
styles and restores the WordPress JavaScript contract after a format write.
Generated metadata artifacts remain formatter-ignored because their owning
synchronizer produces them deterministically.

There is intentionally no `lint:js` compatibility alias. The code gate also
performs TypeScript checking, so `check:code` describes its behavior without
claiming to be lint-only.

Generated TypeScript configurations set `allowJs: true` and include project
JavaScript, JSX, CJS, and MJS entrypoints. Consequently the compiled
`configs.wpScriptsRecommended` preset applies supported WordPress, React,
import, and TypeScript diagnostics across both JavaScript and TypeScript source
files. The text-domain rule is specialized to the generated plugin slug.

The compiled preset records intentional behavior downgrades when a nominally
available native rule cannot safely reproduce WordPress behavior. The current
baseline omits `no-shadow` because its native implementation panics on catch
clauses, omits two JSX accessibility rules that misclassify imported WordPress
components as DOM elements, and omits `role-supports-aria-props` because it
rejects valid progressbar value properties. These omissions are manifest-backed
and executable parity probes require every failure to remain reproducible. A
new toolchain that fixes one of them intentionally fails the probe until the
corresponding downgrade and documentation are removed.

CommonJS package manifests use `lint.config.mts`. This makes the configuration
module unambiguously ESM when `ttsc` loads the ESM WordPress contributor.
Existing project-owned lint configurations are never overwritten; `wp-typia
init --apply` stops with merge guidance when it cannot prove a safe managed
upgrade.

The generated package does not install the TypeScript 6 compatibility package,
ESLint, the WordPress ESLint plugin, resolver shims, or JSX accessibility
plugins. TypeScript 6 remains limited to repository tools that directly need
the JavaScript Compiler API. React and its type packages remain direct
generated dependencies so TS7 JSX resolution is reproducible across supported
package managers.

## Native plugin cache and CI

CI stores content-addressed `ttsc` source-plugin binaries in
`.ttsc-cache/plugins`. Preparation happens once and the finished plugin cache
and built workspace packages are shared with downstream project-tool and
generated-project jobs. Large Go build caches are runner-local and are not
uploaded for every matrix entry.

`ttsc` 0.26.2 resolves its launcher and native TypeScript compiler from the
project that owns the lint config. CI therefore exercises normal project
resolution and does not inject `TTSC_TSGO_BINARY`; environment overrides would
hide regressions in the same resolution path generated projects use. Contributor
parity runs against both the minimum supported ttsc release and the repository's
installed release. A local parity run defaults to the installed release rather
than silently falling back to the minimum compatibility lane.

Generated smoke coverage is intentionally representative rather than a full
Cartesian product. Unit and template-source tests cover deterministic manifest
differences; installed smoke lanes cover every template family, package-manager
boundary, and workspace add workflow at least once.

## Compatibility patches

The root Bun workspace carries two exact-version development-tool patches:

- `typia@13.2.0` forwards the JSON `--tsgo-args` envelope so CLI flags such as
  `--strict` reach the tsgo program used by typia transforms
- `@ttsc/lint@0.26.2` guards mapped and `infer` type parameters while formatting
  trailing commas, preventing a TypeScript-Go declaration lookup panic, and
  widens the affected symlink-target buffers in the TypeScript source, the
  distributed JavaScript runtime, and the native sidecar's embedded TypeScript
  config loader so executable lint configs compile across the supported Node 24
  type-definition range

Registry `@ttsc/lint@0.26.2` still reproduces both lint-host failures. Generated
and retrofitted projects therefore exact-pin that version and run
`scripts/apply-ttsc-lint-compat.mjs` from `postinstall`. The helper verifies the
package version and expected source/runtime/sidecar files, applies the same narrow
repairs atomically per file, preserves file permissions, cleans abandoned
temporary files, and fails closed before writing if the upstream layout changes.
Its distributed JavaScript check is scoped to the embedded ttsx TypeScript
template so the container remains valid JavaScript. Production-only installs
that omit the development lint dependency skip the hook successfully. Yarn
scaffolds use the `node-modules` linker so the helper never edits a shared
Plug'n'Play archive.

The project-tools template is the canonical helper source. Run
`bun run ttsc-lint-compat:sync` after changing it and
`bun run ttsc-lint-compat:check` to verify the create-workspace template and
external-template fixture remain byte-identical. The formatting policy validator
also enforces these invariants.

The generated helper is a development compiler repair, not a WordPress runtime
dependency. It does not inherit Bun's root `patchedDependencies`; publish and
generated-install smoke independently prove the consumer path.

The formatting policy validator pins each patch path and SHA-256 digest to the
exact package version. To upgrade either dependency:

1. install the unpatched release and run the compatibility regressions;
2. remove the patch and generated helper only when CLI option forwarding,
   typia transforms, mapped/`infer` formatting, and executable lint-config
   evaluation with Node 24 typings all pass;
3. otherwise port the narrow patch, update the exact version and digest, and
   rerun installed generated-project smoke.

## CI posture

The primary lint job validates this policy, runs the non-TypeScript format
gate, checks examples with their combined `check` command, and runs the root
TypeScript gate. Local development should run the narrow tests relevant to a
change first; the full CI matrix remains the release and cross-environment
proof.
