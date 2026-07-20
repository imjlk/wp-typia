import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

describe('@wp-typia/rest export contracts', () => {
  test('publishes focused ./client and ./http entries while keeping ./react distinct', async () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      exports?: Record<string, unknown>;
    };

    expect(packageJson.exports?.['./client']).toEqual({
      default: './dist/client.js',
      import: './dist/client.js',
      types: './dist/client.d.ts',
    });
    expect(packageJson.exports?.['./http']).toEqual({
      default: './dist/http.js',
      import: './dist/http.js',
      types: './dist/http.d.ts',
    });
    expect(packageJson.exports?.['./react']).toEqual({
      default: './dist/react.js',
      import: './dist/react.js',
      types: './dist/react.d.ts',
    });

    const [restRoot, restClient, restHttp, restReact] = await Promise.all([
      import(new URL('../dist/index.js', import.meta.url).href),
      import(new URL('../dist/client.js', import.meta.url).href),
      import(new URL('../dist/http.js', import.meta.url).href),
      import(new URL('../dist/react.js', import.meta.url).href),
    ]);

    expect(typeof restRoot.callEndpoint).toBe('function');
    expect(typeof restRoot.defineRestResource).toBe('function');
    expect(typeof restRoot.toRestResourceListRequest).toBe('function');
    expect(typeof restRoot.createHeadersDecoder).toBe('function');
    expect(typeof restClient.callEndpoint).toBe('function');
    expect(typeof restClient.resolveRestRouteUrl).toBe('function');
    expect(typeof restClient.RestRootResolutionError).toBe('function');
    expect('createHeadersDecoder' in restClient).toBe(false);
    expect(typeof restHttp.createHeadersDecoder).toBe('function');
    expect(typeof restHttp.createParameterDecoder).toBe('function');
    expect(typeof restHttp.toValidationResult).toBe('function');
    expect('callEndpoint' in restHttp).toBe(false);
    expect(typeof restReact.useEndpointQuery).toBe('function');
    expect(typeof restReact.useRestResourceListQuery).toBe('function');
    expect(typeof restReact.useRestResourceReadQuery).toBe('function');
    expect(typeof restReact.useRestResourceCreateMutation).toBe('function');
    expect(typeof restReact.useRestResourceUpdateMutation).toBe('function');
    expect(typeof restReact.useRestResourceDeleteMutation).toBe('function');
    expect('callEndpoint' in restReact).toBe(false);
  });

  test('built root entry preserves ESM-safe .js re-export specifiers', () => {
    const builtIndexJs = readFileSync(
      new URL('../dist/index.js', import.meta.url),
      'utf8',
    );
    const builtIndexDts = readFileSync(
      new URL('../dist/index.d.ts', import.meta.url),
      'utf8',
    );
    const builtReactJs = readFileSync(
      new URL('../dist/react.js', import.meta.url),
      'utf8',
    );
    const builtReactDts = readFileSync(
      new URL('../dist/react.d.ts', import.meta.url),
      'utf8',
    );

    expect(builtIndexJs).toContain('./client.js');
    expect(builtIndexJs).toContain('./errors.js');
    expect(builtIndexJs).toContain('./http.js');
    expect(builtIndexJs).toContain('./resource.js');
    expect(builtIndexDts).toContain('./client.js');
    expect(builtIndexDts).toContain('./errors.js');
    expect(builtIndexDts).toContain('./http.js');
    expect(builtIndexDts).toContain('./resource.js');
    expect(builtReactJs).toContain("export * from './react-client.js';");
    expect(builtReactJs).toContain("export * from './react-query.js';");
    expect(builtReactJs).toContain("export * from './react-mutation.js';");
    expect(builtReactJs).toContain("export * from './react-resource.js';");
    expect(builtReactDts).toContain("export * from './react-client.js';");
    expect(builtReactDts).toContain("export * from './react-query.js';");
    expect(builtReactDts).toContain("export * from './react-mutation.js';");
    expect(builtReactDts).toContain("export * from './react-resource.js';");
  });

  test('build rewrites dist imports for node esm consumers', () => {
    const clientDist = readFileSync(
      new URL('../dist/client.js', import.meta.url),
      'utf8',
    );
    const clientTypes = readFileSync(
      new URL('../dist/client.d.ts', import.meta.url),
      'utf8',
    );
    const reactDist = readFileSync(
      new URL('../dist/react.js', import.meta.url),
      'utf8',
    );
    const reactTypes = readFileSync(
      new URL('../dist/react.d.ts', import.meta.url),
      'utf8',
    );
    const sharedRuntimePrimitivesDist = readFileSync(
      new URL('../dist/internal/runtime-primitives.js', import.meta.url),
      'utf8',
    );
    const sharedRuntimePrimitivesTypes = readFileSync(
      new URL('../dist/internal/runtime-primitives.d.ts', import.meta.url),
      'utf8',
    );

    expect(clientDist).toContain('@wp-typia/api-client/client-utils');
    expect(clientTypes).toContain('./internal/runtime-primitives.js');
    expect(reactDist).toContain('./react-client.js');
    expect(reactDist).toContain('./react-query.js');
    expect(reactDist).toContain('./react-mutation.js');
    expect(reactTypes).toContain('./react-client.js');
    expect(reactTypes).toContain('./react-query.js');
    expect(reactTypes).toContain('./react-mutation.js');
    expect(sharedRuntimePrimitivesDist).toContain(
      '@wp-typia/api-client/runtime-primitives',
    );
    expect(sharedRuntimePrimitivesTypes).toContain(
      '@wp-typia/api-client/runtime-primitives',
    );
  });

  test('react source keeps the facade thin and pushes hook internals into focused modules', () => {
    const reactFacadeSource = readFileSync(
      new URL('../src/react.ts', import.meta.url),
      'utf8',
    );
    const reactQuerySource = readFileSync(
      new URL('../src/react-query.ts', import.meta.url),
      'utf8',
    );
    const reactMutationSource = readFileSync(
      new URL('../src/react-mutation.ts', import.meta.url),
      'utf8',
    );
    const reactClientSource = readFileSync(
      new URL('../src/react-client.ts', import.meta.url),
      'utf8',
    );

    expect(reactFacadeSource).toContain("export * from './react-client.js';");
    expect(reactFacadeSource).toContain("export * from './react-query.js';");
    expect(reactFacadeSource).toContain("export * from './react-mutation.js';");
    expect(reactFacadeSource).toContain("export * from './react-resource.js';");
    expect(reactQuerySource).not.toContain('as any');
    expect(reactMutationSource).not.toContain('as any');
    expect(reactClientSource).not.toContain('as any');
    expect(reactQuerySource).toContain('selectEndpointData');
    expect(reactQuerySource).toContain('castEndpointValidationResult');
    expect(reactMutationSource).toContain('normalizeInvalidateTargets');
  });
});
