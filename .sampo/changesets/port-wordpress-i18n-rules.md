---
npm/@wp-typia/ttsc-lint-plugin-wp: minor
npm/@wp-typia/project-tools: minor
---

Added: port the seven remaining WordPress internationalization rules to native
TypeScript-Go contributors, including diagnostics, safe fixes, translator
comment validation, and full parity for the WordPress-owned `i18n` preset.
Generated block placeholders now use a Unicode ellipsis so new projects satisfy
that preset without a follow-up lint fix.
