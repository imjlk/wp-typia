import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'bun:test';

import { analyzeSourceTypes } from '../../packages/wp-typia-project-tools/src/runtime/metadata-parser';

function createRecursiveFixtureRoot(typesSource: string): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-recursive-parser-'),
  );
  const srcDir = path.join(root, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'types.ts'), typesSource, 'utf8');
  return root;
}

const RECURSIVE_TREE_SOURCE = `
export interface TreeNode {
  id: string;
  label: string;
  children: TreeNode[];
}

export interface BlockAttributes {
  tree: TreeNode;
}
`;

const MUTUAL_RECURSION_SOURCE = `
interface TypeA {
  kind: "a";
  value: string;
  next?: TypeB;
}

interface TypeB {
  kind: "b";
  value: number;
  next?: TypeA;
}

export interface BlockAttributes {
  root: TypeA | TypeB;
}
`;

/**
 * Count the nesting depth of a recursive type by following the `children`
 * array property chain until the terminal empty-properties object is reached.
 * The `children` property is an array whose `items` field holds the recursive
 * TreeNode reference, so the measurement must descend through `.items`.
 */
function measureUnrollDepth(node: unknown, propertyKey: string): number {
  if (
    typeof node !== 'object' ||
    node === null ||
    !('properties' in node)
  ) {
    return 0;
  }
  const properties = (node as { properties?: Record<string, unknown> })
    .properties;
  if (!properties || Object.keys(properties).length === 0) {
    return 0;
  }
  const childArray = properties[propertyKey];
  if (childArray === undefined) {
    return 1;
  }
  // childArray is an array type; descend through .items to the recursive node
  const arrayNode = childArray as { items?: unknown; kind?: string };
  if (arrayNode.kind !== 'array' || arrayNode.items === undefined) {
    return 1;
  }
  const childNode = arrayNode.items as { properties?: Record<string, unknown> };
  // If the items node is a terminal (empty properties), stop
  if (
    !childNode.properties ||
    Object.keys(childNode.properties).length === 0
  ) {
    return 1;
  }
  return 1 + measureUnrollDepth(childNode, propertyKey);
}

describe('metadata-parser recursive type unrolling', () => {
  test('unrolls a self-referential type to the default depth of 5', () => {
    const root = createRecursiveFixtureRoot(RECURSIVE_TREE_SOURCE);

    try {
      const parsed = analyzeSourceTypes(
        {
          projectRoot: root,
          typesFile: 'src/types.ts',
        },
        ['BlockAttributes'],
      );

      const blockAttributes = parsed['BlockAttributes'];
      expect(blockAttributes).toBeDefined();
      expect(blockAttributes.kind).toBe('object');
      expect(blockAttributes.properties).toBeDefined();

      const tree = blockAttributes.properties!['tree'];
      expect(tree).toBeDefined();
      expect(tree.kind).toBe('object');

      // TreeNode has id, label, children — follow children chain
      const depth = measureUnrollDepth(tree, 'children');
      // Default depth 5 means 5 levels of TreeNode before terminal
      expect(depth).toBe(5);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('respects a custom maxRecursiveDepth option', () => {
    const root = createRecursiveFixtureRoot(RECURSIVE_TREE_SOURCE);

    try {
      const parsed = analyzeSourceTypes(
        {
          maxRecursiveDepth: 2,
          projectRoot: root,
          typesFile: 'src/types.ts',
        },
        ['BlockAttributes'],
      );

      const tree = parsed['BlockAttributes'].properties!['tree'];
      const depth = measureUnrollDepth(tree, 'children');
      expect(depth).toBe(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('emits a terminal empty-properties object at the depth limit', () => {
    const root = createRecursiveFixtureRoot(RECURSIVE_TREE_SOURCE);

    try {
      const parsed = analyzeSourceTypes(
        {
          maxRecursiveDepth: 1,
          projectRoot: root,
          typesFile: 'src/types.ts',
        },
        ['BlockAttributes'],
      );

      const tree = parsed['BlockAttributes'].properties!['tree'];
      expect(tree.kind).toBe('object');
      expect(tree.properties).toBeDefined();

      // At depth 1, the children array's items should be the terminal node
      const childrenAttr = tree.properties!['children'];
      expect(childrenAttr.kind).toBe('array');
      expect(childrenAttr.items).toBeDefined();
      expect(childrenAttr.items!.kind).toBe('object');
      // Terminal node has empty properties
      expect(childrenAttr.items!.properties).toEqual({});
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('unrolls mutually recursive types without throwing', () => {
    const root = createRecursiveFixtureRoot(MUTUAL_RECURSION_SOURCE);

    try {
      const parsed = analyzeSourceTypes(
        {
          maxRecursiveDepth: 3,
          projectRoot: root,
          typesFile: 'src/types.ts',
        },
        ['BlockAttributes'],
      );

      const blockAttributes = parsed['BlockAttributes'];
      expect(blockAttributes).toBeDefined();
      expect(blockAttributes.kind).toBe('object');

      const rootAttr = blockAttributes.properties!['root'];
      expect(rootAttr.kind).toBe('union');
      expect(rootAttr.union).toBeDefined();
      expect(Object.keys(rootAttr.union!.branches).sort()).toEqual([
        'a',
        'b',
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a non-recursive type still parses normally', () => {
    const root = createRecursiveFixtureRoot(
      `
export interface BlockAttributes {
  title: string;
  count: number;
}
`,
    );

    try {
      const parsed = analyzeSourceTypes(
        {
          projectRoot: root,
          typesFile: 'src/types.ts',
        },
        ['BlockAttributes'],
      );

      const attrs = parsed['BlockAttributes'];
      expect(attrs.properties!['title'].kind).toBe('string');
      expect(attrs.properties!['count'].kind).toBe('number');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
