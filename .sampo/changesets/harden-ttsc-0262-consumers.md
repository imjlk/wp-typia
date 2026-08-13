---
npm/@wp-typia/create-workspace-template: patch
npm/@wp-typia/project-tools: patch
npm/wp-typia: patch
---

Fixed: harden generated-project compatibility with `@ttsc/lint` 0.26.2.

- Production-only installs now skip the development compiler repair when lint tooling is absent.
- Compatibility repairs preserve permissions, clean abandoned temporary files, validate embedded TypeScript boundaries, and fail closed before partial writes.
