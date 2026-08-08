# @wp-typia/ttsc-lint-plugin-wp

## 0.1.1 — 2026-08-08

### Patch changes

- [18bb0794](https://github.com/imjlk/wp-typia/commit/18bb07946096c463f08fab39d16001fe8c311796) Fixed: harden the initial WordPress ttsc lint contributor after its 0.1.0 seed publish.
  
  - Invalid rule options now fail closed instead of silently disabling WordPress diagnostics.
  - The upstream parity harness verifies cached tarball integrity before executing the pinned WordPress rule oracle.
  - Contextual translation helpers and consecutive diagnostic parsing have additional parity coverage. — Thanks @imjlk!

