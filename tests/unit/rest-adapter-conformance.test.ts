import http, {
  type IncomingMessage,
  type Server as NodeHttpServer,
  type ServerResponse,
} from 'node:http';
import { once } from 'node:events';

import { describe, expect, test } from 'bun:test';

import {
  defineEndpointManifest,
  type EndpointManifestEndpointDefinition,
} from '../../packages/wp-typia-block-runtime/src/metadata-core';
import type { ValidationResult } from '@wp-typia/api-client';
import {
  runRestAdapterConformanceSuite,
  type RestAdapterConformanceServer,
  type RestAdapterRouteLike,
} from '../helpers/rest-adapter-conformance';

const readEndpoint = {
  authMode: 'public-read',
  method: 'GET',
  operationId: 'readExample',
  path: '/example/v1/item',
  queryContract: 'read-query',
  responseContract: 'example-response',
  tags: ['Example'],
} as const satisfies EndpointManifestEndpointDefinition;

const writeEndpoint = {
  authMode: 'public-signed-token',
  bodyContract: 'write-request',
  method: 'POST',
  operationId: 'writeExample',
  path: '/example/v1/item',
  responseContract: 'example-response',
  tags: ['Example'],
} as const satisfies EndpointManifestEndpointDefinition;

const exampleManifest = defineEndpointManifest({
  contracts: {
    'example-response': {
      sourceTypeName: 'ExampleResponse',
    },
    'read-query': {
      sourceTypeName: 'ExampleQuery',
    },
    'write-request': {
      sourceTypeName: 'ExampleWriteRequest',
    },
  },
  endpoints: [readEndpoint, writeEndpoint],
});

function success< T >( data: T ): ValidationResult< T > {
  return {
    data,
    errors: [],
    isValid: true,
  };
}

function failure< T >(
	expected: string,
	path = '(root)',
): ValidationResult< T > {
  return {
    data: undefined,
    errors: [{ expected, path, value: undefined }],
    isValid: false,
  };
}

function validateExampleResponse(
	input: unknown,
): ValidationResult< { count: number } > {
  if (
		input !== null &&
		typeof input === 'object' &&
		typeof ( input as { count?: unknown } ).count === 'number'
	) {
    return success( input as { count: number } );
  }

  return failure( '{ count: number }', '$.count' );
}

function toRouteTable(
	endpoints: readonly EndpointManifestEndpointDefinition[],
): RestAdapterRouteLike[] {
  return endpoints.map(( endpoint ) => ({
    authMode: endpoint.authMode,
    method: endpoint.method,
    operationId: endpoint.operationId,
    path: endpoint.path,
  }));
}

function readRequestBody( request: IncomingMessage ): Promise< string > {
  return new Promise(( resolve, reject ) => {
    let body = '';

    request.setEncoding('utf8');
    request.on('data', ( chunk ) => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function startMockAdapterServer( {
	handleRequest,
	routeTable,
}: {
  handleRequest: (
		request: IncomingMessage,
		response: ServerResponse,
	) => Promise< void > | void;
  routeTable: readonly RestAdapterRouteLike[];
} ): Promise< RestAdapterConformanceServer > {
  const server = http.createServer( ( request, response ) => {
		void Promise.resolve( handleRequest( request, response ) ).catch( ( error ) => {
			response.writeHead( 500, {
				'content-type': 'application/json; charset=utf-8',
			} );
			response.end(
				JSON.stringify( {
					message:
						error instanceof Error ? error.message : 'Unexpected mock adapter error.',
				} ),
			);
		} );
	} );

  try {
    server.listen( 0, '127.0.0.1' );
    await once( server, 'listening' );
  } catch ( error ) {
    await closeServer( server ).catch( () => undefined );
    throw error;
  }

  const address = server.address();
  if (address === null || typeof address === 'string') {
    await closeServer( server );
    throw new Error( 'Mock adapter server did not expose a numeric port.' );
  }

  return {
    close: () => closeServer(server),
    routeTable,
    url: `http://127.0.0.1:${ address.port }`,
  };
}

function closeServer( server: NodeHttpServer ): Promise< void > {
  return new Promise(( resolve, reject ) => {
    server.close(( error ) => {
      if ( error ) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe( 'rest adapter conformance harness', () => {
	test( 'reports route mismatch against the manifest', async () => {
		await expect(
			runRestAdapterConformanceSuite( {
				coveredOperationIds: [ 'readExample', 'writeExample' ],
				manifest: exampleManifest,
				responseValidators: {},
				scenarios: [],
				startServer: () =>
					startMockAdapterServer( {
						handleRequest: () => undefined,
						routeTable: [
							{
								authMode: 'public-read',
								method: 'GET',
								operationId: 'readExample',
								path: '/example/v1/wrong',
							},
							{
								authMode: 'public-signed-token',
								method: 'POST',
								operationId: 'writeExample',
								path: '/example/v1/item',
							},
						],
					} ),
			} ),
		).rejects.toThrow( /route table does not match the endpoint manifest/i );
	} );

	test( 'reports missing endpoint coverage', async () => {
		await expect(
			runRestAdapterConformanceSuite( {
				manifest: exampleManifest,
				responseValidators: {
					readExample: validateExampleResponse,
				},
				scenarios: [
					{
						name: 'read scenario',
						steps: [
							{
								description: 'read current state',
								expected: {
									status: 200,
								},
								operationId: 'readExample',
								request: {
									postId: 1,
								},
							},
						],
					},
				],
				startServer: () =>
					startMockAdapterServer( {
						handleRequest: ( _request, response ) => {
							response.writeHead( 200, {
								'content-type': 'application/json; charset=utf-8',
							} );
							response.end( JSON.stringify( { count: 1 } ) );
						},
						routeTable: toRouteTable( exampleManifest.endpoints ),
					} ),
			} ),
		).rejects.toThrow( /writeExample/u );
	} );

	test( 'reports response validation failures for successful responses', async () => {
		await expect(
			runRestAdapterConformanceSuite( {
				manifest: defineEndpointManifest( {
					contracts: exampleManifest.contracts,
					endpoints: [ readEndpoint ],
				} ),
				responseValidators: {
					readExample: validateExampleResponse,
				},
				scenarios: [
					{
						name: 'invalid response scenario',
						steps: [
							{
								description: 'adapter returns an invalid payload',
								expected: {
									status: 200,
								},
								operationId: 'readExample',
								request: {
									postId: 1,
								},
							},
						],
					},
				],
				startServer: () =>
					startMockAdapterServer( {
						handleRequest: ( _request, response ) => {
							response.writeHead( 200, {
								'content-type': 'application/json; charset=utf-8',
							} );
							response.end( JSON.stringify( { count: 'wrong' } ) );
						},
						routeTable: toRouteTable( [ readEndpoint ] ),
					} ),
			} ),
		).rejects.toThrow( /did not satisfy the shared contract/i );
	} );

	test( 'accepts invalid-case status and message assertions', async () => {
		await expect(
			runRestAdapterConformanceSuite( {
				coveredOperationIds: [ 'readExample' ],
				manifest: defineEndpointManifest( {
					contracts: exampleManifest.contracts,
					endpoints: [ readEndpoint ],
				} ),
				responseValidators: {
					readExample: validateExampleResponse,
				},
				scenarios: [
					{
						name: 'invalid request scenario',
						steps: [
							{
								description: 'blank query input is rejected',
								expected: {
									message: 'Bad read request.',
									status: 400,
								},
								operationId: 'readExample',
								rawRequest: {
									query: {
										postId: '',
									},
								},
							},
						],
					},
				],
				startServer: () =>
					startMockAdapterServer( {
						handleRequest: ( request, response ) => {
							const url = new URL(
								request.url ?? '/',
								'http://127.0.0.1',
							);
							const postId = url.searchParams.get( 'postId' );

							if ( ! postId ) {
								response.writeHead( 400, {
									'content-type': 'application/json; charset=utf-8',
								} );
								response.end(
									JSON.stringify( {
										message: 'Bad read request.',
									} ),
								);
								return;
							}

							response.writeHead( 200, {
								'content-type': 'application/json; charset=utf-8',
							} );
							response.end( JSON.stringify( { count: 1 } ) );
						},
						routeTable: toRouteTable( [ readEndpoint ] ),
					} ),
			} ),
		).resolves.toBeUndefined();
	} );

	test( 'requires a successful scenario step unless coverage is explicitly waived', async () => {
		await expect(
			runRestAdapterConformanceSuite( {
				manifest: defineEndpointManifest( {
					contracts: exampleManifest.contracts,
					endpoints: [ readEndpoint ],
				} ),
				responseValidators: {
					readExample: validateExampleResponse,
				},
				scenarios: [
					{
						name: 'invalid-only scenario',
						steps: [
							{
								description: 'only invalid requests are exercised',
								expected: {
									message: 'Bad read request.',
									status: 400,
								},
								operationId: 'readExample',
								rawRequest: {
									query: {
										postId: '',
									},
								},
							},
						],
					},
				],
				startServer: () =>
					startMockAdapterServer( {
						handleRequest: ( _request, response ) => {
							response.writeHead( 400, {
								'content-type': 'application/json; charset=utf-8',
							} );
							response.end(
								JSON.stringify( {
									message: 'Bad read request.',
								} ),
							);
						},
						routeTable: toRouteTable( [ readEndpoint ] ),
					} ),
			} ),
		).rejects.toThrow(
			/at least one successful scenario step or explicit coverage mapping/i,
		);
	} );

	test( 'preserves repeated query parameters from URLSearchParams inputs', async () => {
		await expect(
			runRestAdapterConformanceSuite( {
				manifest: defineEndpointManifest( {
					contracts: exampleManifest.contracts,
					endpoints: [ readEndpoint ],
				} ),
				responseValidators: {
					readExample: validateExampleResponse,
				},
				scenarios: [
					{
						name: 'duplicate query parameter scenario',
						steps: [
							{
								assertBody: ( payload ) => {
									expect( payload ).toEqual( { count: 2 } );
								},
								description: 'passes repeated query keys through unchanged',
								expected: {
									status: 200,
								},
								operationId: 'readExample',
								rawRequest: {
									query: new URLSearchParams( [
										[ 'tag', 'a' ],
										[ 'tag', 'b' ],
									] ),
								},
							},
						],
					},
				],
				startServer: () =>
					startMockAdapterServer( {
						handleRequest: ( request, response ) => {
							const url = new URL(
								request.url ?? '/',
								'http://127.0.0.1',
							);

							response.writeHead( 200, {
								'content-type': 'application/json; charset=utf-8',
							} );
							response.end(
								JSON.stringify( {
									count: url.searchParams.getAll( 'tag' ).length,
								} ),
							);
						},
						routeTable: toRouteTable( [ readEndpoint ] ),
					} ),
			} ),
		).resolves.toBeUndefined();
	} );

	test( 'supports endpoints that define both query and body contracts', async () => {
		const mixedEndpoint = {
			authMode: 'public-signed-token',
			bodyContract: 'write-request',
			method: 'POST',
			operationId: 'writeExampleWithQuery',
			path: '/example/v1/mixed',
			queryContract: 'read-query',
			responseContract: 'example-response',
			tags: [ 'Example' ],
		} as const satisfies EndpointManifestEndpointDefinition;

		await expect(
			runRestAdapterConformanceSuite( {
				manifest: defineEndpointManifest( {
					contracts: exampleManifest.contracts,
					endpoints: [ mixedEndpoint ],
				} ),
				responseValidators: {
					writeExampleWithQuery: validateExampleResponse,
				},
				scenarios: [
					{
						name: 'mixed query/body scenario',
						steps: [
							{
								assertBody: ( payload ) => {
									expect( payload ).toEqual( { count: 2 } );
								},
								description: 'sends both query params and a JSON body',
								expected: {
									status: 200,
								},
								operationId: 'writeExampleWithQuery',
								request: {
									body: {
										delta: 1,
									},
									query: {
										tag: [ 'a', 'b' ],
									},
								},
							},
						],
					},
				],
				startServer: () =>
					startMockAdapterServer( {
						handleRequest: async ( request, response ) => {
							const url = new URL(
								request.url ?? '/',
								'http://127.0.0.1',
							);
							const body = await readRequestBody( request );

							response.writeHead( 200, {
								'content-type': 'application/json; charset=utf-8',
							} );
							response.end(
								JSON.stringify( {
									count:
										url.searchParams.getAll( 'tag' ).length +
										( body.includes( '"delta":1' ) ? 0 : 100 ),
								} ),
							);
						},
						routeTable: toRouteTable( [ mixedEndpoint ] ),
					} ),
			} ),
		).resolves.toBeUndefined();
	} );
} );
