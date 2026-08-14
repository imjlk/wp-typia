---
npm/@wp-typia/ttsc-lint-plugin-wp: minor
---

Port the four SSR-safety DOM globals rules from `@wordpress/eslint-plugin` 25.8.0 to native `@ttsc/lint` contributors: `no-dom-globals-in-constructor`, `no-dom-globals-in-module-scope`, `no-dom-globals-in-react-cc-render`, and `no-dom-globals-in-react-fc`.

The rules embed the browser-minus-node global list from `globals` 16.5.0, the pinned revision matching the upstream plugin's `globals@^16.0.0` dependency, and the parity oracle now installs that same revision so the DOM-only global set cannot drift between engines. The upstream rules belong to no WordPress preset, so compiled presets are unchanged; enable the rules individually for SSR safety. WordPress-owned rule coverage moves from 19 to 23 contributors. The embedded global list raises the contributor package's unpacked footprint budget from 275,000 to 360,000 bytes, mirroring the documented-dataset budget pattern used by the Design System token rules.
