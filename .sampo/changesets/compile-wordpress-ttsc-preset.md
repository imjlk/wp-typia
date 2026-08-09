---
npm/@wp-typia/ttsc-lint-plugin-wp: minor
---

Added: compile the supported portion of the ordered WordPress ESLint recommended
preset into a static ttsc config chain that preserves file scopes, ignores,
severities, and supported rule options without a consumer runtime dependency on
ESLint. Unsupported option payloads retain their severity and are recorded as
option downgrades in the compatibility manifest.
