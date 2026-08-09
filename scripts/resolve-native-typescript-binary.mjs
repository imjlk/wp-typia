import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const platformPackage = `@typescript/typescript-${process.platform}-${process.arch}`;
let platformManifest;
try {
  const typescriptManifest = require.resolve('typescript/package.json');
  const requireFromTypeScript = createRequire(typescriptManifest);
  platformManifest = requireFromTypeScript.resolve(
    `${platformPackage}/package.json`,
  );
} catch (error) {
  throw new Error(
    `Unable to resolve TypeScript 7 native package ${platformPackage}.`,
    { cause: error },
  );
}
const binary = path.join(
  path.dirname(platformManifest),
  'lib',
  process.platform === 'win32' ? 'tsc.exe' : 'tsc',
);

if (!fs.existsSync(binary)) {
  throw new Error(`TypeScript 7 native compiler not found: ${binary}`);
}

process.stdout.write(binary);
