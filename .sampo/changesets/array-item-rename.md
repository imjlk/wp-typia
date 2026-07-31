---
npm/@wp-typia/project-tools: patch
---

Added: test coverage for array item property rename detection.

- Array item property renames (e.g. `rows[].oldName` → `rows[].newName`) are now verified to be detected by the migration diff rename logic, building on the array item flattening added in PR #1164.
