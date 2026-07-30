---
npm/@wp-typia/block-runtime: minor
---

Added: TypeScript utility types (`Partial`, `Required`, `Readonly`, `Pick`, `Omit`, `Record`) are now resolved by the metadata parser instead of throwing "Generic type references are not supported".

- `Partial<T>` marks all properties optional; `Required<T>` marks all required.
- `Readonly<T>` is a passthrough (serialization ignores mutability).
- `Pick<T, Keys>` and `Omit<T, Keys>` select or exclude properties by string-literal union keys.
- `Record<K, V>` produces a permissive empty object (block attributes are flat JSON).
- Unrecognized generics still throw as before.
