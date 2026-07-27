import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { scaffoldProject } from '../packages/wp-typia-project-tools/src/runtime/scaffold';

const repoRoot = path.resolve(import.meta.dir, '..');
const phpcsBin = path.join(
  repoRoot,
  'vendor',
  'bin',
  process.platform === 'win32' ? 'phpcs.bat' : 'phpcs',
);

if ( ! fs.existsSync( phpcsBin ) ) {
  throw new Error( 'Missing vendor/bin/phpcs. Run `composer install` first.' );
}

const tempRoot = fs.mkdtempSync( path.join( os.tmpdir(), 'wp-typia-phpcs-' ) );

function runPhpcs( files: string[] ) {
  const args = ['--standard=phpcs.xml.dist', ...files];
  const result = spawnSync(phpcsBin, args, {
    cwd: repoRoot,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if ( result.error ) {
    throw result.error;
  }

  if ( result.status !== 0 ) {
    throw new Error( `PHPCS failed with exit code ${result.status ?? 1}` );
  }
}

try {
  const persistenceDir = path.join( tempRoot, 'demo-persistence-auth' );
  await scaffoldProject({
    projectDir: persistenceDir,
    templateId: 'persistence',
    packageManager: 'npm',
    noInstall: true,
    dataStorageMode: 'custom-table',
    persistencePolicy: 'authenticated',
    answers: {
      author: 'Test Runner',
      dataStorageMode: 'custom-table',
      description: 'Generated PHP lint smoke',
      namespace: 'create-block',
      persistencePolicy: 'authenticated',
      slug: 'demo-persistence-auth',
      title: 'Demo Persistence Auth',
    },
  });

  runPhpcs([
    path.join(persistenceDir, 'demo-persistence-auth.php'),
    path.join(persistenceDir, 'src', 'render.php'),
    path.join(persistenceDir, 'inc', 'rest-auth.php'),
    path.join(persistenceDir, 'inc', 'rest-shared.php'),
  ]);

  const compoundDir = path.join( tempRoot, 'demo-compound-public' );
  await scaffoldProject({
    projectDir: compoundDir,
    templateId: 'compound',
    packageManager: 'npm',
    noInstall: true,
    persistencePolicy: 'public',
    answers: {
      author: 'Test Runner',
      description: 'Generated compound PHP lint smoke',
      namespace: 'create-block',
      persistencePolicy: 'public',
      slug: 'demo-compound-public',
      title: 'Demo Compound Public',
    },
  });

  runPhpcs([
    path.join(compoundDir, 'demo-compound-public.php'),
    path.join(
      compoundDir,
      'src',
      'blocks',
      'demo-compound-public',
      'render.php',
    ),
    path.join(compoundDir, 'inc', 'rest-public.php'),
    path.join(compoundDir, 'inc', 'rest-shared.php'),
  ]);
} finally {
  fs.rmSync( tempRoot, { force: true, recursive: true } );
}
