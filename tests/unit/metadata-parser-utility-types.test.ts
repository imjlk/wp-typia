import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'bun:test';

import { analyzeSourceTypes } from '../../packages/wp-typia-project-tools/src/runtime/metadata-parser';

function createUtilityTypeFixtureRoot(typesSource: string): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-utility-types-'),
  );
  const srcDir = path.join(root, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'types.ts'), typesSource, 'utf8');
  return root;
}

function getPrimitive(
  node: unknown,
  key: string,
): { kind: string; required: boolean } {
  const properties = (node as { properties?: Record<string, unknown> })
    .properties;
  const attr = properties?.[key] as
    | { kind: string; required: boolean }
    | undefined;
  if (!attr) {
    throw new Error(`Property "${key}" not found`);
  }
  return { kind: attr.kind, required: attr.required };
}

describe('metadata-parser utility types', () => {
  test('Partial<T> makes all properties optional', () => {
    const root = createUtilityTypeFixtureRoot(`
interface Base { a: string; b: number; }
export interface BlockAttributes { data: Partial<Base>; }
`);

    try {
      const parsed = analyzeSourceTypes(
        { projectRoot: root, typesFile: 'src/types.ts' },
        ['BlockAttributes'],
      );
      const data = parsed['BlockAttributes'].properties!['data'];
      expect(data.kind).toBe('object');
      expect(getPrimitive(data, 'a').required).toBe(false);
      expect(getPrimitive(data, 'b').required).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('Required<T> makes all properties required', () => {
    const root = createUtilityTypeFixtureRoot(`
interface Base { a?: string; b?: number; }
export interface BlockAttributes { data: Required<Base>; }
`);

    try {
      const parsed = analyzeSourceTypes(
        { projectRoot: root, typesFile: 'src/types.ts' },
        ['BlockAttributes'],
      );
      const data = parsed['BlockAttributes'].properties!['data'];
      expect(getPrimitive(data, 'a').required).toBe(true);
      expect(getPrimitive(data, 'b').required).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('Readonly<T> is a passthrough', () => {
    const root = createUtilityTypeFixtureRoot(`
interface Base { a: string; }
export interface BlockAttributes { data: Readonly<Base>; }
`);

    try {
      const parsed = analyzeSourceTypes(
        { projectRoot: root, typesFile: 'src/types.ts' },
        ['BlockAttributes'],
      );
      const data = parsed['BlockAttributes'].properties!['data'];
      expect(data.kind).toBe('object');
      expect(getPrimitive(data, 'a').kind).toBe('string');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('Pick<T, "a" | "b"> selects only specified keys', () => {
    const root = createUtilityTypeFixtureRoot(`
interface Base { a: string; b: number; c: boolean; }
export interface BlockAttributes { data: Pick<Base, "a" | "b">; }
`);

    try {
      const parsed = analyzeSourceTypes(
        { projectRoot: root, typesFile: 'src/types.ts' },
        ['BlockAttributes'],
      );
      const data = parsed['BlockAttributes'].properties!['data'];
      const keys = Object.keys(data.properties!);
      expect(keys.sort()).toEqual(['a', 'b']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('Omit<T, "c"> removes specified keys', () => {
    const root = createUtilityTypeFixtureRoot(`
interface Base { a: string; b: number; c: boolean; }
export interface BlockAttributes { data: Omit<Base, "c">; }
`);

    try {
      const parsed = analyzeSourceTypes(
        { projectRoot: root, typesFile: 'src/types.ts' },
        ['BlockAttributes'],
      );
      const data = parsed['BlockAttributes'].properties!['data'];
      const keys = Object.keys(data.properties!);
      expect(keys.sort()).toEqual(['a', 'b']);
      expect(data.properties!['c']).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('Record<string, V> produces a permissive empty object', () => {
    const root = createUtilityTypeFixtureRoot(`
export interface BlockAttributes { data: Record<string, number>; }
`);

    try {
      const parsed = analyzeSourceTypes(
        { projectRoot: root, typesFile: 'src/types.ts' },
        ['BlockAttributes'],
      );
      const data = parsed['BlockAttributes'].properties!['data'];
      expect(data.kind).toBe('object');
      expect(data.properties).toEqual({});
      expect(data.recursiveTerminal).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('Pick with named type alias selector resolves keys', () => {
    const root = createUtilityTypeFixtureRoot(`
interface Base { a: string; b: number; c: boolean; }
type Keys = "a" | "b";
export interface BlockAttributes { data: Pick<Base, Keys>; }
`);

    try {
      const parsed = analyzeSourceTypes(
        { projectRoot: root, typesFile: 'src/types.ts' },
        ['BlockAttributes'],
      );
      const data = parsed['BlockAttributes'].properties!['data'];
      const keys = Object.keys(data.properties!);
      expect(keys.sort()).toEqual(['a', 'b']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('still throws on unrecognized generic types', () => {
    const root = createUtilityTypeFixtureRoot(`
interface Box<T> { value: T; }
export interface BlockAttributes { data: Box<string>; }
`);

    try {
      expect(() =>
        analyzeSourceTypes(
          { projectRoot: root, typesFile: 'src/types.ts' },
          ['BlockAttributes'],
        ),
      ).toThrow(/not supported/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
