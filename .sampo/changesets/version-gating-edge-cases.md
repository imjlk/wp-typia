---
npm/@wp-typia/project-tools: patch
---

Fixed: AI feature route registration gate no longer runs the full capability probe at registration time.

- The registration-time gate now checks only `function_exists('wp_ai_client_prompt')` instead of the full `is_ai_feature_supported()` probe. The probe applies request-specific model preferences via filters that are not available at registration time, causing false negatives when a filter returns request-dependent values.
- The per-request handler still runs the full probe and returns 501 when unsupported, preserving the graceful degradation behavior.
