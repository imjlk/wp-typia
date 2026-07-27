import http, {
  type IncomingMessage,
  type Server as NodeHttpServer,
  type ServerResponse,
} from 'node:http';
import { once } from 'node:events';

import type {
  EndpointManifestDefinition,
  EndpointManifestEndpointDefinition,
} from '@wp-typia/block-runtime/metadata-core';
import { normalizeEndpointAuthDefinition } from '@wp-typia/project-tools/schema-core';
import { BLOCKS } from '../../persistence-examples/scripts/block-config';
import type {
  PersistenceCounterBootstrapResponse,
  PersistenceCounterIncrementRequest,
  PersistenceCounterResponse,
} from '../../persistence-examples/src/blocks/counter/api-types';
import { counterContractValidators } from './contract-validation';

export interface CounterAdapterRouteDefinition {
  authMode: EndpointManifestEndpointDefinition['authMode'];
  method: EndpointManifestEndpointDefinition['method'];
  operationId: string;
  path: string;
}

export interface CounterAdapterServer {
  close: () => Promise<void>;
  port: number;
  routeTable: CounterAdapterRouteDefinition[];
  url: string;
}

function isCounterBlock(
	block: (typeof BLOCKS)[number],
): block is (typeof BLOCKS)[number] & {
  restManifest: EndpointManifestDefinition;
  slug: 'counter';
} {
  return block.slug === 'counter';
}

const counterBlock = BLOCKS.find(isCounterBlock);

if (!counterBlock) {
  throw new Error(
    'Unable to locate the counter block manifest for the adapter PoC.',
  );
}

export const counterEndpointManifest = counterBlock.restManifest;

export function getCounterAdapterRouteTable(
	manifest = counterEndpointManifest,
): CounterAdapterRouteDefinition[] {
  return manifest.endpoints.map((endpoint) => ({
    authMode: normalizeEndpointAuthDefinition(endpoint).authMode,
    method: endpoint.method,
    operationId: endpoint.operationId,
    path: endpoint.path,
  }));
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';

    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function sendJson(
	response: ServerResponse,
	statusCode: number,
	payload: unknown,
	headers: Record<string, string> = {},
): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function validateCounterResponse(
	payload: PersistenceCounterResponse,
): PersistenceCounterResponse {
  const validation = counterContractValidators.counterResponse(payload);

  if (!validation.isValid || validation.data === undefined) {
    throw new Error(
      'The adapter produced a counter response that does not satisfy the shared TypeScript contract.',
    );
  }

  return validation.data;
}

function validateCounterBootstrapResponse(
	payload: PersistenceCounterBootstrapResponse,
): PersistenceCounterBootstrapResponse {
  const validation = counterContractValidators.counterBootstrapResponse(
    payload,
  );

  if (!validation.isValid || validation.data === undefined) {
    throw new Error(
      'The adapter produced a bootstrap response that does not satisfy the shared TypeScript contract.',
    );
  }

  return validation.data;
}

function buildStorageKey(postId: number, resourceKey: string): string {
  return `${postId}:${resourceKey}`;
}

function parseQueryPostId(rawPostId: string | null): number | undefined {
  if (rawPostId === null) {
    return undefined;
  }

  const normalizedValue = rawPostId.trim();

  if (normalizedValue.length === 0) {
    return undefined;
  }

  return Number(normalizedValue);
}

async function handleGetCounter(
	request: IncomingMessage,
	response: ServerResponse,
	counts: Map<string, number>,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const queryInput = {
    postId: parseQueryPostId(url.searchParams.get('postId')),
    resourceKey: url.searchParams.get('resourceKey') ?? '',
  };
  const validation = counterContractValidators.counterQuery(queryInput);

  if (!validation.isValid || validation.data === undefined) {
    sendJson(response, 400, {
      errors: validation.errors,
      message: 'The request did not match the counter query contract.',
    });
    return;
  }

  const currentCount =
		counts.get(
      buildStorageKey(validation.data.postId, validation.data.resourceKey),
    ) ?? 0;

  sendJson(
    response,
    200,
    validateCounterResponse({
      count: currentCount,
      postId: validation.data.postId,
      resourceKey: validation.data.resourceKey,
      storage: 'custom-table',
    }),
  );
}

async function handleGetCounterBootstrap(
	request: IncomingMessage,
	response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const queryInput = {
    postId: parseQueryPostId(url.searchParams.get('postId')),
    resourceKey: url.searchParams.get('resourceKey') ?? '',
  };
  const validation = counterContractValidators.counterBootstrapQuery(
    queryInput,
  );

  if (!validation.isValid || validation.data === undefined) {
    sendJson(response, 400, {
      errors: validation.errors,
      message: 'The request did not match the counter bootstrap query contract.',
    });
    return;
  }

  sendJson(
    response,
    200,
    validateCounterBootstrapResponse({
      canWrite: true,
      publicWriteExpiresAt: Math.floor(Date.now() / 1000) + 300,
      publicWriteToken: 'adapter-proof-token',
    }),
    {
      'cache-control': 'private, no-store',
    },
  );
}

async function handleIncrementCounter(
	request: IncomingMessage,
	response: ServerResponse,
	counts: Map<string, number>,
): Promise<void> {
  const rawBody = await readRequestBody(request);
  let parsedBody: unknown;

  try {
    parsedBody = rawBody.length > 0 ? JSON.parse(rawBody) : {};
  } catch {
    sendJson(response, 400, {
      message: 'The request body must be valid JSON.',
    });
    return;
  }

  const validation = counterContractValidators.incrementRequest(parsedBody);

  if (!validation.isValid || validation.data === undefined) {
    sendJson(response, 400, {
      errors: validation.errors,
      message: 'The request did not match the counter write contract.',
    });
    return;
  }

  const requestData: PersistenceCounterIncrementRequest = validation.data;
  const storageKey = buildStorageKey(
    requestData.postId,
    requestData.resourceKey,
  );
  const nextCount = (counts.get(storageKey) ?? 0) + (requestData.delta ?? 1);

  counts.set(storageKey, nextCount);

  sendJson(
    response,
    200,
    validateCounterResponse({
      count: nextCount,
      postId: requestData.postId,
      resourceKey: requestData.resourceKey,
      storage: 'custom-table',
    }),
  );
}

async function dispatchCounterRequest(
	request: IncomingMessage,
	response: ServerResponse,
	counts: Map<string, number>,
	routeTable: CounterAdapterRouteDefinition[],
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const method = request.method ?? 'GET';
  const routeCandidates = [url.pathname];
  const generatedScaffoldPath = url.pathname.replace(/\/state\/?$/u, '');

  if (generatedScaffoldPath !== url.pathname) {
    routeCandidates.push(generatedScaffoldPath);
  }

  const matchedRoute = routeCandidates
		.map((candidatePath) =>
			routeTable.find((route) => route.method === method && route.path === candidatePath),
		)
		.find((route) => route !== undefined);

  if (!matchedRoute) {
    sendJson(response, 404, {
      message: 'No manifest-defined route matched this request.',
    });
    return;
  }

  if (matchedRoute.method === 'GET') {
    if (matchedRoute.operationId === 'getPersistenceCounterBootstrap') {
      await handleGetCounterBootstrap(request, response);
      return;
    }
    await handleGetCounter(request, response, counts);
    return;
  }

  await handleIncrementCounter(request, response, counts);
}

export async function startCounterAdapterServer(
	port = 0,
): Promise<CounterAdapterServer> {
  const routeTable = getCounterAdapterRouteTable();
  const counts = new Map<string, number>();
  const server = http.createServer((request, response) => {
		void dispatchCounterRequest(request, response, counts, routeTable).catch((error) => {
			sendJson(response, 500, {
				message:
					error instanceof Error
						? error.message
						: 'The adapter encountered an unexpected error.',
			});
		});
	});

  server.listen(port, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('The adapter server did not expose a numeric listen port.');
  }

  return {
    close: () => closeServer(server),
    port: address.port,
    routeTable,
    url: `http://127.0.0.1:${address.port}`,
  };
}

function closeServer(server: NodeHttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
