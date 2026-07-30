---
npm/@wp-typia/project-tools: patch
---

Fixed: generated AI feature PHP now gates route registration behind runtime capability checks for progressive enhancement.

- The AI feature REST route registration (`rest_api_init` handler) now calls the existing `is_ai_feature_supported()` check before registering routes. On unsupported WordPress versions, the endpoint does not appear at all instead of registering and returning 501 on every request.
- The typia.llm tool endpoint registration now checks `function_exists('wp_register_ability')` before registering routes, so the endpoint is invisible on sites without the Abilities API (WP < 7.0).
- Admin notices and graceful 501 fallbacks remain for backward compatibility.
