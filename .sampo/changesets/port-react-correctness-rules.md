---
npm/@wp-typia/ttsc-lint-plugin-wp: minor
---

Port two React correctness rules enabled by the WordPress recommended presets as native `@ttsc/lint` contributors: `react/jsx-no-comment-textnodes` and `react/no-render-return-value`, exposed as `wordpress/jsx-no-comment-textnodes` and `wordpress/no-render-return-value`.

The parity oracle now loads `eslint-plugin-react` 7.37.5 from the pinned Bun store so the react-namespace diagnostics compare directly, and the compiled preset maps the two upstream `react/*` sources to the contributor rule names. Unsupported preset rules drop from 80 to 78.
