---
npm/@wp-typia/project-tools: patch
npm/wp-typia: patch
---

Register one plugin-owned entity field when `wp-typia add admin-view` targets
a core-data source. The generated PHP hooks `wp_entity_fields_api_init` and
calls `wp_register_entity_fields()` only when that function exists. Default
and REST admin views keep the existing Tools screen without server field
registration.
