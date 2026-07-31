---
title: Recursive and Utility Types
description: How wp-typia handles recursive type declarations and TypeScript utility types in block attribute definitions.
---

## Recursive types

WordPress blocks sometimes need tree-structured data — nested menus, repeater fields, category trees. wp-typia unrolls recursive types to a bounded depth instead of throwing.

### How it works

When the parser encounters a self-referential or mutually recursive type declaration, it unrolls the type tree up to a configurable maximum depth (default: **5**). At the depth limit, it emits a terminal empty-object leaf node that allows any additional properties, so deeper data remains valid without further validation.

```typescript
interface TreeNode {
  id: string;
  label: string;
  children: TreeNode[];
}

export interface BlockAttributes {
  tree: TreeNode;
}
```

This produces a manifest with 5 levels of `TreeNode` nesting. The sixth level is a terminal `{}` that passes through any data.

### Configuring depth

Override the default depth via `maxRecursiveDepth`:

```typescript
import { analyzeSourceType } from '@wp-typia/block-runtime/metadata-parser';

const { rootNode } = analyzeSourceType({
  projectRoot: process.cwd(),
  sourceTypeName: 'BlockAttributes',
  typesFile: 'src/types.ts',
  maxRecursiveDepth: 3,
});
```

Or via `SyncBlockMetadataOptions`:

```typescript
await syncBlockMetadata({
  // ...
  maxRecursiveDepth: 3,
});
```

The hard upper limit is **15** to prevent exponential expansion from multi-branch recursive types (e.g. binary trees).

### Limitations

- Non-object recursive aliases (e.g. `type Chain = Array<{ next?: Chain }>`) produce object terminals instead of preserving the outer kind. All downstream consumers handle empty objects safely.
- The total node count across the entire analysis is capped at 5000 to prevent memory exhaustion.

## Utility types

wp-typia resolves the six built-in TypeScript utility types at the type level:

| Utility         | Behavior                                                                             |
| --------------- | ------------------------------------------------------------------------------------ |
| `Partial<T>`    | All properties optional                                                              |
| `Required<T>`   | All properties required (works on objects and discriminated unions)                  |
| `Readonly<T>`   | Passthrough (mutability ignored)                                                     |
| `Pick<T, Keys>` | Select properties by string-literal union                                            |
| `Omit<T, Keys>` | Exclude properties by string-literal union                                           |
| `Record<K, V>`  | Concrete properties for literal key unions; permissive open object for `string` keys |

### Examples

```typescript
interface BaseConfig {
  title: string;
  count: number;
  secret: string;
}

export interface BlockAttributes {
  // Only title and count, both optional
  partial: Partial<Pick<BaseConfig, 'title' | 'count'>>;

  // Everything except secret
  safe: Omit<BaseConfig, 'secret'>;

  // Named selector alias
  selected: Pick<BaseConfig, 'title'>;

  // Literal-key record
  scores: Record<'a' | 'b', number>;
}
```

### Named selector aliases

`Pick` and `Omit` accept named type aliases as key selectors:

```typescript
type SafeKeys = 'title' | 'count';
type SafeConfig = Pick<BaseConfig, SafeKeys>;
```

### Unsupported members in Pick/Omit

If the source type has an unsupported member (e.g. a function type) that is being excluded by `Omit`, the parser skips it gracefully instead of throwing. Only retained properties are parsed individually.
