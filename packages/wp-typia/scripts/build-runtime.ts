import fs from 'node:fs/promises';
import path from 'node:path';

import {
  ensureRuntimeBuildDependencies,
  packageRoot,
} from './runtime-build-dependencies';

const runtimeEntrypoint = path.resolve(packageRoot, 'src', 'gunshi-cli.ts');
const outdir = path.resolve(packageRoot, 'dist');

await ensureRuntimeBuildDependencies();
await fs.rm(outdir, { force: true, recursive: true });
await fs.mkdir(outdir, { recursive: true });

const result = await Bun.build({
  entrypoints: [runtimeEntrypoint],
  format: 'esm',
  naming: {
    entry: 'cli.js',
  },
  outdir,
  packages: 'external',
  sourcemap: 'external',
  target: 'node',
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

await fs.access(path.join(outdir, 'cli.js'));
