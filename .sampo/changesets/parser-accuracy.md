---
npm/@wp-typia/block-runtime: minor
---

Added: parser accuracy improvements for utility types.

- `Required<T>` now works on discriminated unions, making each branch's properties required branch-wise.
- `Pick` and `Omit` no longer throw when the source type has unsupported members that are being excluded. The parser falls back to parsing only retained properties individually.
- Built-in utility type names (`Partial`, `Required`, `Readonly`, `Pick`, `Omit`, `Record`) are no longer shadowed by user-defined declarations with the same name in project source files.
