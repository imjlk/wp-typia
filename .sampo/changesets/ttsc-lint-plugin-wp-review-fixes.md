---
npm/@wp-typia/ttsc-lint-plugin-wp: patch
---

Fixed: harden the initial WordPress ttsc lint contributor after its 0.1.0 seed publish.

- Invalid rule options now fail closed instead of silently disabling WordPress diagnostics.
- The upstream parity harness verifies cached tarball integrity before executing the pinned WordPress rule oracle.
- Contextual translation helpers and consecutive diagnostic parsing have additional parity coverage.
