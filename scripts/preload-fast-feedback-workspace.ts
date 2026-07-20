import path from 'node:path';

const apiClientSourceRoot = path.resolve(
  import.meta.dir,
  '..',
  'packages',
  'wp-typia-api-client',
  'src',
);
const apiClientSourceAliases = new Map([
  ['@wp-typia/api-client', path.join(apiClientSourceRoot, 'index.ts')],
  [
    '@wp-typia/api-client/client-utils',
    path.join(apiClientSourceRoot, 'client-utils.ts'),
  ],
  [
    '@wp-typia/api-client/runtime-primitives',
    path.join(apiClientSourceRoot, 'runtime-primitives.ts'),
  ],
  [
    '@wp-typia/api-client/internal/runtime-primitives',
    path.join(apiClientSourceRoot, 'internal', 'runtime-primitives.ts'),
  ],
]);

Bun.plugin({
  name: 'wp-typia-fast-feedback-workspace-sources',
  setup(builder) {
    for (const [specifier, sourcePath] of apiClientSourceAliases) {
      builder.module(specifier, async () => ({
        exports: await import(sourcePath),
        loader: 'object',
      }));
    }
  },
});
