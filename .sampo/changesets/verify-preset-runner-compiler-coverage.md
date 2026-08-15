---
npm/@wp-typia/ttsc-lint-plugin-wp: minor
---

Classify nine more compiled-preset rules as verified `runner` coverage instead of leaving them unsupported.

`semi`, `quotes`, `indent`, `comma-dangle`, `object-curly-spacing`, `arrow-parens`, `no-trailing-spaces`, `no-multiple-empty-lines`, and `eol-last` move to the `runner` classification because `ttsc format` provably normalizes each concern. The parity harness re-verifies every claim on each run across both the minimum (0.23.0) and current (0.26.x) supported ttsc releases: a formatter probe starts from real violations and asserts each concern is normalized with anchored assertions, so an engine regression fails the build instead of silently invalidating the classification.

Rules the formatter leaves untouched (such as `key-spacing` and `space-infix-ops`) stay unsupported, as does `brace-style`, which normalizes only on 0.26.x. Correctness rules like `no-undef` and `import/no-unresolved` also stay unsupported: the TypeScript checker reports their diagnostics only for TypeScript files, while the upstream preset also enables them for unchecked JavaScript. Unsupported preset rules drop from 89 to 80.
