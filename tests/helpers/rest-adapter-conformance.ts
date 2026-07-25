import type {
  EndpointManifestDefinition,
  EndpointManifestEndpointDefinition,
} from '@wp-typia/block-runtime/metadata-core';
import { normalizeEndpointAuthDefinition } from '@wp-typia/project-tools/schema-core';
import type { ValidationResult } from '@wp-typia/api-client';

type QueryScalar = boolean | number | string;
type QueryValue = QueryScalar | readonly QueryScalar[] | null | undefined;

export interface RestAdapterConformanceCompositeRequest {
  body?: unknown;
  query?: Record< string, QueryValue > | URLSearchParams;
}

export interface RestAdapterRouteLike
	extends Pick<
		EndpointManifestEndpointDefinition,
		'authMode' | 'method' | 'operationId' | 'path'
	> {}

export interface RestAdapterConformanceServer<
  TRoute extends RestAdapterRouteLike = RestAdapterRouteLike,
> {
  close: () => Promise<void>;
  routeTable: readonly TRoute[];
  url: string;
}

export interface RestAdapterConformanceRawRequest {
  body?: BodyInit | null;
  headers?: HeadersInit;
  path?: string;
  query?: Record< string, QueryValue > | URLSearchParams;
}

export interface RestAdapterConformanceStep {
  assertBody?: ( payload: unknown ) => Promise< void > | void;
  description: string;
  expected: {
    message?: string;
    status: number;
  };
  operationId: string;
  rawRequest?: RestAdapterConformanceRawRequest;
  request?: RestAdapterConformanceCompositeRequest | unknown;
}

export interface RestAdapterConformanceScenario {
  coveredOperationIds?: readonly string[];
  name: string;
  steps: readonly RestAdapterConformanceStep[];
}

export interface RunRestAdapterConformanceSuiteOptions {
  coveredOperationIds?: readonly string[];
  manifest: EndpointManifestDefinition;
  responseValidators: Readonly<
		Record< string, ( payload: unknown ) => ValidationResult< unknown > >
	>;
  scenarios: readonly RestAdapterConformanceScenario[];
  startServer: () => Promise< RestAdapterConformanceServer >;
}

function isPlainObject(
	value: unknown,
): value is Record< string, QueryValue > {
  return value !== null && typeof value === 'object' && ! Array.isArray(value);
}

function isQueryScalar( value: unknown ): value is QueryScalar {
  return (
		typeof value === 'boolean' ||
		typeof value === 'number' ||
		typeof value === 'string'
	);
}

function isCompositeRequest(
	value: unknown,
): value is RestAdapterConformanceCompositeRequest {
  return (
		isPlainObject( value ) &&
		( 'body' in value || 'query' in value ) &&
		Object.keys( value ).every( ( key ) => key === 'body' || key === 'query' )
	);
}

function getCompositeRequest(
	endpoint: EndpointManifestEndpointDefinition,
	step: RestAdapterConformanceStep,
): RestAdapterConformanceCompositeRequest | null {
  if ( ! endpoint.bodyContract || ! endpoint.queryContract ) {
    return null;
  }

  if ( ! isCompositeRequest( step.request ) ) {
    throw new Error(
      `Conformance step "${ step.description }" must provide { body, query } when endpoint "${ endpoint.operationId }" defines both bodyContract and queryContract.`,
    );
  }

  return step.request;
}

function appendQueryValues(
	params: URLSearchParams,
	query: Record< string, QueryValue > | URLSearchParams,
): void {
  if ( query instanceof URLSearchParams ) {
    for ( const [ key, value ] of query.entries() ) {
      params.append( key, value );
    }

    return;
  }

  const entries = Object.entries( query );

  for ( const [ key, value ] of entries ) {
    if ( value === undefined || value === null ) {
      continue;
    }

    if ( Array.isArray( value ) ) {
      for ( const item of value ) {
        if ( ! isQueryScalar( item ) ) {
          throw new Error(
            `Query parameter "${ key }" only supports scalar array items.`,
          );
        }

        params.append( key, String( item ) );
      }

      continue;
    }

    if ( ! isQueryScalar( value ) ) {
      throw new Error(
        `Query parameter "${ key }" must be a scalar or array of scalars.`,
      );
    }

    params.set( key, String( value ) );
  }
}

function buildRequestUrl(
	baseUrl: string,
	endpoint: EndpointManifestEndpointDefinition,
	step: RestAdapterConformanceStep,
): URL {
  const url = new URL( step.rawRequest?.path ?? endpoint.path, baseUrl );

  if ( step.rawRequest?.query ) {
    appendQueryValues( url.searchParams, step.rawRequest.query );
    return url;
  }

  if ( step.request === undefined ) {
    return url;
  }

  const compositeRequest = getCompositeRequest( endpoint, step );
  const queryInput = compositeRequest?.query ?? step.request;

  if ( endpoint.queryContract ) {
    if ( queryInput === undefined ) {
      return url;
    }

    if ( queryInput instanceof URLSearchParams ) {
      appendQueryValues( url.searchParams, queryInput );
      return url;
    }

    if ( ! isPlainObject( queryInput ) ) {
      throw new Error(
        `Conformance step "${ step.description }" must provide a plain object request for queryContract endpoint "${ endpoint.operationId }".`,
      );
    }

    appendQueryValues( url.searchParams, queryInput );
  }

  return url;
}

function buildRequestInit(
	endpoint: EndpointManifestEndpointDefinition,
	step: RestAdapterConformanceStep,
): RequestInit {
  if ( step.request !== undefined && step.rawRequest !== undefined ) {
    throw new Error(
      `Conformance step "${ step.description }" cannot define both request and rawRequest.`,
    );
  }

  const headers = new Headers( step.rawRequest?.headers );
  const requestInit: RequestInit = {
    headers,
    method: endpoint.method,
  };

  if ( step.rawRequest?.body !== undefined ) {
    requestInit.body = step.rawRequest.body;
    return requestInit;
  }

  if ( step.request === undefined ) {
    return requestInit;
  }

  const compositeRequest = getCompositeRequest( endpoint, step );
  const bodyInput = compositeRequest?.body ?? step.request;

  if ( endpoint.bodyContract ) {
    if ( bodyInput === undefined ) {
      return requestInit;
    }

    if ( typeof bodyInput === 'string' || bodyInput instanceof FormData ) {
      requestInit.body = bodyInput;
      return requestInit;
    }

    if ( ! headers.has( 'content-type' ) ) {
      headers.set( 'content-type', 'application/json' );
    }

    requestInit.body = JSON.stringify( bodyInput );
    return requestInit;
  }

  if ( endpoint.queryContract ) {
    return requestInit;
  }

  throw new Error(
    `Conformance step "${ step.description }" cannot send a request payload to no-request endpoint "${ endpoint.operationId }".`,
  );
}

async function parseResponsePayload( response: Response ): Promise< unknown > {
  if ( response.status === 204 ) {
    return undefined;
  }

  const text = await response.text();
  if ( text.length === 0 ) {
    return undefined;
  }

  try {
    return JSON.parse( text );
  } catch {
    return text;
  }
}

function formatForError( value: unknown ): string {
  try {
    return JSON.stringify( value, null, 2 );
  } catch {
    return String( value );
  }
}

function toRouteSignature( route: RestAdapterRouteLike ): string {
  return `${ route.method } ${ route.path } [${ route.operationId } | ${ route.authMode }]`;
}

function assertRouteParity(
	manifest: EndpointManifestDefinition,
	routeTable: readonly RestAdapterRouteLike[],
): void {
  const expectedRoutes = manifest.endpoints
		.map( ( endpoint ) =>
			toRouteSignature( {
				authMode: normalizeEndpointAuthDefinition( endpoint ).authMode,
				method: endpoint.method,
				operationId: endpoint.operationId,
				path: endpoint.path,
			} ),
		)
		.sort();
  const actualRoutes = routeTable.map( toRouteSignature ).sort();

  if ( expectedRoutes.length !== actualRoutes.length ) {
    throw new Error(
      `Adapter route table does not match the endpoint manifest.\nExpected routes:\n${ expectedRoutes.join( '\n' ) }\nActual routes:\n${ actualRoutes.join( '\n' ) }`,
    );
  }

  for ( const [ index, expectedRoute ] of expectedRoutes.entries() ) {
    if ( actualRoutes[ index ] !== expectedRoute ) {
      throw new Error(
        `Adapter route table does not match the endpoint manifest.\nExpected routes:\n${ expectedRoutes.join( '\n' ) }\nActual routes:\n${ actualRoutes.join( '\n' ) }`,
      );
    }
  }
}

function assertEndpointCoverage(
	manifest: EndpointManifestDefinition,
	scenarios: readonly RestAdapterConformanceScenario[],
	explicitCoverage: readonly string[] = [],
): void {
  const manifestOperationIds = manifest.endpoints.map(
    ( endpoint ) => endpoint.operationId,
  );
  const manifestOperationIdSet = new Set( manifestOperationIds );
  const coveredOperationIds = new Set( explicitCoverage );
  const successfulOperationIds = new Set( explicitCoverage );

  for ( const coveredOperationId of explicitCoverage ) {
    if ( ! manifestOperationIdSet.has( coveredOperationId ) ) {
      throw new Error(
        `Conformance harness references unknown covered operationId "${ coveredOperationId }".`,
      );
    }
  }

  for ( const scenario of scenarios ) {
    for ( const operationId of scenario.coveredOperationIds ?? [] ) {
      if ( ! manifestOperationIdSet.has( operationId ) ) {
        throw new Error(
          `Conformance scenario "${ scenario.name }" references unknown covered operationId "${ operationId }".`,
        );
      }

      coveredOperationIds.add( operationId );
    }

    for ( const step of scenario.steps ) {
      if ( ! manifestOperationIdSet.has( step.operationId ) ) {
        throw new Error(
          `Conformance scenario "${ scenario.name }" references unknown endpoint operationId "${ step.operationId }".`,
        );
      }

      coveredOperationIds.add( step.operationId );
      if ( step.expected.status >= 200 && step.expected.status < 300 ) {
        successfulOperationIds.add( step.operationId );
      }
    }
  }

  const missingOperationIds = manifestOperationIds.filter(
    ( operationId ) => ! coveredOperationIds.has( operationId ),
  );

  if ( missingOperationIds.length > 0 ) {
    throw new Error(
      `Conformance harness is missing coverage for manifest endpoints: ${ missingOperationIds.join( ', ' ) }.`,
    );
  }

  const missingSuccessfulCoverageOperationIds = manifestOperationIds.filter(
    ( operationId ) => ! successfulOperationIds.has( operationId ),
  );

  if ( missingSuccessfulCoverageOperationIds.length > 0 ) {
    throw new Error(
      `Conformance harness requires at least one successful scenario step or explicit coverage mapping for manifest endpoints: ${ missingSuccessfulCoverageOperationIds.join( ', ' ) }.`,
    );
  }
}

async function withServer(
	startServer: RunRestAdapterConformanceSuiteOptions[ 'startServer' ],
	callback: ( server: RestAdapterConformanceServer ) => Promise< void >,
): Promise< void > {
  const server = await startServer();

  try {
    await callback( server );
  } finally {
    await server.close();
  }
}

async function runScenario(
	server: RestAdapterConformanceServer,
	manifest: EndpointManifestDefinition,
	responseValidators: RunRestAdapterConformanceSuiteOptions[ 'responseValidators' ],
	scenario: RestAdapterConformanceScenario,
): Promise< void > {
  const endpointByOperationId = new Map(
    manifest.endpoints.map(( endpoint ) => [endpoint.operationId, endpoint]),
  );

  for ( const step of scenario.steps ) {
    const endpoint = endpointByOperationId.get( step.operationId );
    if ( ! endpoint ) {
      throw new Error(
        `Conformance scenario "${ scenario.name }" references unknown endpoint operationId "${ step.operationId }".`,
      );
    }

    try {
      const response = await fetch(
        buildRequestUrl(server.url, endpoint, step),
        buildRequestInit(endpoint, step),
      );
      const payload = await parseResponsePayload( response );

      if ( response.status !== step.expected.status ) {
        throw new Error(
          `Expected HTTP ${ step.expected.status }, received ${ response.status } with payload ${ formatForError( payload ) }.`,
        );
      }

      if ( step.expected.message !== undefined ) {
        const message =
					payload !== null &&
					typeof payload === 'object' &&
					'message' in payload &&
					typeof payload.message === 'string'
						? payload.message
						: undefined;

        if ( message !== step.expected.message ) {
          throw new Error(
            `Expected response message "${ step.expected.message }", received ${ formatForError( payload ) }.`,
          );
        }
      }

      if ( response.ok ) {
        const validateResponse = responseValidators[ step.operationId ];
        if ( ! validateResponse ) {
          throw new Error(
            `Missing response validator for endpoint "${ step.operationId }".`,
          );
        }

        const validation = validateResponse( payload );
        if ( ! validation.isValid ) {
          throw new Error(
            `Response payload for "${ step.operationId }" did not satisfy the shared contract: ${ formatForError( validation.errors ) }.`,
          );
        }
      }

      if ( step.assertBody ) {
        await step.assertBody( payload );
      }
    } catch ( error ) {
      const reason =
				error instanceof Error ? error.message : String( error );
      throw new Error(
        `Conformance scenario "${ scenario.name }" failed at step "${ step.description }": ${ reason }`,
      );
    }
  }
}

export async function runRestAdapterConformanceSuite(
	options: RunRestAdapterConformanceSuiteOptions,
): Promise< void > {
  assertEndpointCoverage(
    options.manifest,
    options.scenarios,
    options.coveredOperationIds,
  );

  await withServer(options.startServer, async ( server ) => {
    assertRouteParity(options.manifest, server.routeTable);
  });

  for ( const scenario of options.scenarios ) {
    await withServer( options.startServer, async ( server ) => {
			await runScenario(
				server,
				options.manifest,
				options.responseValidators,
				scenario,
			);
		} );
  }
}
