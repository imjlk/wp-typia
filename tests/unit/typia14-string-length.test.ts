import { expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { manifestMatchesDocument } from '../../packages/wp-typia-project-tools/templates/_shared/migration-ui/common/src/migrations/helpers';
import {
  baseNode,
  defaultAttributeConstraints,
} from '../../packages/wp-typia-block-runtime/src/metadata-model';
import {
  createExampleValue,
  createManifestDocument,
} from '../../packages/wp-typia-block-runtime/src/metadata-projection';
import { renderPhpValidator } from '../../packages/wp-typia-block-runtime/src/metadata-php-render';

const repoRoot = path.resolve(import.meta.dir, '../..');
const values = [
  '가',
  '가나',
  '😀',
  '😀가',
  'e\u0301',
  '\n😀',
  '\0😀',
  '😀😀😀',
  '😀😀😀😀',
  '',
  'abcd',
];
const expected = [
  false,
  true,
  false,
  true,
  true,
  true,
  true,
  true,
  false,
  false,
  false,
];

test('typia 14, PHP without mbstring, and migration checks count Unicode code points', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-typia-unicode-'));
  try {
    fs.symlinkSync(
      path.join(repoRoot, 'node_modules'),
      path.join(root, 'node_modules'),
      'dir',
    );
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ type: 'module', dependencies: { typia: '14.0.6' } }),
    );
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          outDir: 'dist',
          rootDir: '.',
          strict: true,
          skipLibCheck: true,
          target: 'ES2020',
          types: [],
        },
        files: ['index.ts'],
      }),
    );
    fs.writeFileSync(
      path.join(root, 'index.ts'),
      "import typia, { tags } from 'typia';\nexport const check = typia.createIs<string & tags.MinLength<2> & tags.MaxLength<3>>();\n",
    );
    execFileSync(
      'node',
      [
        path.join(repoRoot, 'node_modules/ttsc/lib/launcher/ttsc.js'),
        '-p',
        path.join(root, 'tsconfig.json'),
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          TTSC_CACHE_DIR: process.env.TTSC_CACHE_DIR ?? path.join(repoRoot, 'node_modules/.cache/ttsc'),
        },
        timeout: 300_000,
        stdio: 'pipe',
      },
    );
    const results = execFileSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `import { check } from ${JSON.stringify(pathToFileURL(path.join(root, 'dist/index.js')).href)}; console.log(JSON.stringify(${JSON.stringify(values)}.map(check)));`,
      ],
      { encoding: 'utf8' },
    );
    expect(JSON.parse(results)).toEqual(expected);

    const node = baseNode('string', 'title');
    node.constraints = { ...defaultAttributeConstraints(), minLength: 2, maxLength: 3 };
    const manifest = createManifestDocument('UnicodeAttributes', {
      title: node,
    });
    expect(values.map((title) => manifestMatchesDocument(manifest, { title }))).toEqual(
      expected,
    );
    const phpPath = path.join(root, 'validator.php');
    fs.writeFileSync(phpPath, renderPhpValidator(manifest).source);
    const php = spawnSync(
      'php',
      [
        '-n',
        '-r',
        "define('ABSPATH', '/'); $validator = require $argv[1]; echo json_encode(array_map(fn($value) => $validator->is_valid(['title' => $value]), json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR)));",
        phpPath,
      ],
      { input: JSON.stringify(values), encoding: 'utf8' },
    );
    expect(php.error).toBeUndefined();
    expect(php.status, php.stderr).toBe(0);
    expect(JSON.parse(php.stdout)).toEqual(expected);
    const invalid = execFileSync(
      'php',
      [
        '-n',
        '-r',
        "define('ABSPATH', '/'); $validator = require $argv[1]; echo json_encode($validator->is_valid(['title' => chr(255)]));",
        phpPath,
      ],
      { encoding: 'utf8' },
    );
    expect(JSON.parse(invalid)).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 300_000);

test('generated examples do not split astral characters or under-pad code points', () => {
  const node = baseNode('string', 'title');
  node.constraints.maxLength = 9;
  expect(createExampleValue(node, '😀😀')).toBe('Example 😀');
  node.constraints.maxLength = null;
  node.constraints.minLength = 11;
  expect(createExampleValue(node, '😀')).toBe('Example 😀xx');
});
