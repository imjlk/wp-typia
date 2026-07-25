import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'bun:test';

import { analyzeSourceTypes } from '../../packages/wp-typia-project-tools/src/runtime/metadata-parser';

function createParserFixtureRoot(): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-metadata-parser-'),
  );
  const srcDir = path.join(root, 'src');
  const typiaDir = path.join(root, 'node_modules', 'typia');

  fs.mkdirSync(srcDir, { recursive: true });
  fs.mkdirSync(typiaDir, { recursive: true });
  fs.writeFileSync(
		path.join(typiaDir, 'index.d.ts'),
		[
			'export namespace tags {',
			'  export type Default<T> = T & { readonly __default?: unique symbol };',
			'  export type Format<T extends string> = T & { readonly __format?: unique symbol };',
			'  export type Maximum<T extends number> = T & { readonly __maximum?: unique symbol };',
			'  export type Minimum<T extends number> = T & { readonly __minimum?: unique symbol };',
			'  export type MinLength<T extends number> = T & { readonly __minLength?: unique symbol };',
			'  export type Selector<T extends string> = T & { readonly __selector?: unique symbol };',
			'  export type Secret<T extends string> = T & { readonly __secret?: unique symbol };',
			'  export type Source<T extends string> = T & { readonly __source?: unique symbol };',
			'  export type WriteOnly<T extends boolean> = T & { readonly __writeOnly?: unique symbol };',
			'}',
			'',
		].join('\n'),
		'utf8',
	);
  fs.writeFileSync(
		path.join(srcDir, 'block-types.ts'),
		[
			'import { tags } from "typia";',
			'',
			'export interface Address {',
			'  street: string;',
			'  zip: number & tags.Minimum<10000> & tags.Maximum<99999>;',
			'}',
			'',
			'export type Status = "idle" | "done";',
			"export type ZipCode = Address['zip'];",
			'',
			'interface EmailBody {',
			'  kind: "email";',
			'  to: string & tags.Format<"email">;',
			'}',
			'',
			'interface SmsBody {',
			'  kind: "sms";',
			'  phone: string;',
			'}',
			'',
				'export interface ParserDemo {',
				'  title: string & tags.MinLength<3> & tags.Default<"Hello">;',
				'  count: number & tags.Minimum<0> & tags.Maximum<10>;',
				'  aliasTitle: string & tags.Default<{ first: "a"; second: "b" }> & tags.Default<{ second: "b"; first: "a" }>;',
				'  items: Array<string>;',
				'  zip: ZipCode;',
			'  status: Status;',
			'  body: EmailBody | SmsBody;',
			'  excerpt: string & tags.Source<"text"> & tags.Selector<".demo__excerpt">;',
			'  secret: string & tags.Secret<"hasSecret"> & tags.WriteOnly<false>;',
			'  settings: { enabled: boolean } & tags.Default<{ enabled: true }>;',
			'  labels: string[] & tags.Default<["one", "two"]>;',
			'}',
			'',
		].join('\n'),
		'utf8',
	);

  return root;
}

describe('metadata-parser', () => {
	test('parses referenced, tagged, indexed-access, and discriminated-union source types', () => {
		const root = createParserFixtureRoot();

		try {
			const parsed = analyzeSourceTypes(
				{
					projectRoot: root,
					typesFile: 'src/block-types.ts',
				},
				['ParserDemo', 'ZipCode'],
			);
			const parserDemo = parsed.ParserDemo;
			const zipCode = parsed.ZipCode;

			expect(parserDemo.kind).toBe('object');
			expect(zipCode.kind).toBe('number');
			expect(zipCode.constraints.minimum).toBe(10000);
			expect(zipCode.constraints.maximum).toBe(99999);

			const title = parserDemo.properties?.title;
			expect(title?.kind).toBe('string');
			expect(title?.constraints.minLength).toBe(3);
			expect(title?.defaultValue).toBe('Hello');

			const count = parserDemo.properties?.count;
			expect(count?.constraints.minimum).toBe(0);
			expect(count?.constraints.maximum).toBe(10);
			expect(parserDemo.properties?.aliasTitle?.defaultValue).toEqual({
				first: 'a',
				second: 'b',
			});

			const items = parserDemo.properties?.items;
			expect(items?.kind).toBe('array');
			expect(items?.items?.kind).toBe('string');

			const body = parserDemo.properties?.body;
			expect(body?.kind).toBe('union');
			expect(body?.union?.discriminator).toBe('kind');
			expect(Object.keys(body?.union?.branches ?? {})).toEqual([
				'email',
				'sms',
			]);
			expect(
				body?.union?.branches.email.properties?.to.constraints.format,
			).toBe('email');

			const excerpt = parserDemo.properties?.excerpt;
			expect(excerpt?.wp).toEqual({
				preserveOnEmpty: false,
				selector: '.demo__excerpt',
				secret: false,
				secretStateField: null,
				source: 'text',
				writeOnly: false,
			});
			expect(parserDemo.properties?.secret.wp).toEqual({
				preserveOnEmpty: false,
				selector: null,
				secret: true,
				secretStateField: 'hasSecret',
				source: null,
				writeOnly: true,
			});

			expect(parserDemo.properties?.settings.defaultValue).toEqual({
				enabled: true,
			});
			expect(parserDemo.properties?.labels.defaultValue).toEqual([
				'one',
				'two',
			]);
			expect(parserDemo.properties?.status.enumValues).toEqual([
				'idle',
				'done',
			]);
		} finally {
			fs.rmSync(root, { force: true, recursive: true });
		}
	});
});
