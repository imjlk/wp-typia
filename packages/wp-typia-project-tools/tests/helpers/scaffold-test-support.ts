import { once } from 'node:events';
import * as fs from 'node:fs';
import http, {
  type IncomingMessage,
  type Server as NodeHttpServer,
  type ServerResponse,
} from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';

import { scaffoldProject } from '../../src/runtime/index.js';

import {
  linkWorkspaceNodeModules,
  runCli,
  workspaceTemplatePackageManifest,
} from './scaffold-test-environment.js';

export async function scaffoldOfficialWorkspace(
	targetDir: string,
	{
		description = 'Demo workspace',
		namespace = 'demo-space',
		phpPrefix = 'demo_space',
		slug = path.basename(targetDir),
		textDomain = 'demo-space',
		title = 'Demo Workspace',
		withMigrationUi = false,
	}: {
		description?: string;
		namespace?: string;
		phpPrefix?: string;
		slug?: string;
		textDomain?: string;
		title?: string;
		withMigrationUi?: boolean;
	} = {},
) {
  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: 'npm',
    noInstall: true,
    withMigrationUi,
    answers: {
      author: 'Test Runner',
      description,
      namespace,
      phpPrefix,
      slug,
      textDomain,
      title,
    },
  });
}

export function createScaffoldTempRoot(prefix = 'wp-typia-create-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function cleanupScaffoldTempRoot(tempRoot: string) {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

export function parseJsonObjectFromOutput<T>(output: string): T {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    throw new Error('Expected JSON output but received an empty string.');
  }

  const objectStart = trimmed.indexOf('{');
  const arrayStart = trimmed.indexOf('[');
  const startIndex =
		objectStart === -1
      ? arrayStart
      : arrayStart === -1
        ? objectStart
        : Math.min(objectStart, arrayStart);

  if (startIndex === -1) {
    throw new Error(`Expected JSON output but received: ${trimmed}`);
  }

  return JSON.parse(trimmed.slice(startIndex)) as T;
}

export interface LocalCounterStubServer {
  close: () => Promise<void>;
  port: number;
  url: string;
}

function parseCounterPostId(rawPostId: string | null): number | undefined {
  if (rawPostId === null) {
    return undefined;
  }

  const normalizedValue = rawPostId.trim();
  if (normalizedValue.length === 0) {
    return undefined;
  }

  const value = Number(normalizedValue);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function readCounterStubBody(request: IncomingMessage): Promise<string> {
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

function sendCounterStubJson(
	response: ServerResponse,
	statusCode: number,
	payload: unknown,
	headers: Record<string, string> = {},
) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function closeCounterStubServer(server: NodeHttpServer): Promise<void> {
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

export async function startLocalCounterStubServer(
	port = 0,
): Promise<LocalCounterStubServer> {
  const counts = new Map<string, number>();
  const server = http.createServer((request, response) => {
		void (async () => {
			const url = new URL(request.url ?? '/', 'http://127.0.0.1');
			const pathname = url.pathname.replace(/\/+$/u, '') || '/';
			const method = request.method ?? 'GET';

			if (method === 'GET' && pathname.endsWith('/bootstrap')) {
				const postId = parseCounterPostId(url.searchParams.get('postId'));
				const resourceKey = url.searchParams.get('resourceKey') ?? '';
				if (
					typeof postId !== 'number' ||
					!Number.isFinite(postId) ||
					resourceKey.length === 0
				) {
					sendCounterStubJson(response, 400, {
						message:
							'The request did not match the counter bootstrap query contract.',
					});
					return;
				}

				sendCounterStubJson(
					response,
					200,
					{
						canWrite: true,
						publicWriteExpiresAt: Math.floor(Date.now() / 1000) + 300,
						publicWriteToken: 'adapter-proof-token',
					},
					{
						'cache-control': 'private, no-store',
					},
				);
				return;
			}

			if (!pathname.endsWith('/state')) {
				sendCounterStubJson(response, 404, {
					message: 'No manifest-defined route matched this request.',
				});
				return;
			}

			if (method === 'GET') {
				const postId = parseCounterPostId(url.searchParams.get('postId'));
				const resourceKey = url.searchParams.get('resourceKey') ?? '';
				if (
					typeof postId !== 'number' ||
					!Number.isFinite(postId) ||
					resourceKey.length === 0
				) {
					sendCounterStubJson(response, 400, {
						message: 'The request did not match the counter query contract.',
					});
					return;
				}

				const storageKey = `${postId}:${resourceKey}`;
				sendCounterStubJson(response, 200, {
					count: counts.get(storageKey) ?? 0,
					postId,
					resourceKey,
					storage: 'custom-table',
				});
				return;
			}

			if (method === 'POST') {
				const rawBody = await readCounterStubBody(request);
				let parsedBody: unknown;

				try {
					parsedBody = rawBody.length > 0 ? JSON.parse(rawBody) : {};
				} catch {
					sendCounterStubJson(response, 400, {
						message: 'The request body must be valid JSON.',
					});
					return;
				}

				const body =
					typeof parsedBody === 'object' && parsedBody !== null
						? (parsedBody as Record<string, unknown>)
						: null;
				const delta =
					typeof body?.delta === 'number' && Number.isFinite(body.delta)
						? body.delta
						: undefined;
				const postId =
					typeof body?.postId === 'number' &&
					Number.isSafeInteger(body.postId) &&
					body.postId > 0
						? body.postId
						: undefined;
				const publicWriteRequestId =
					typeof body?.publicWriteRequestId === 'string'
						? body.publicWriteRequestId
						: undefined;
				const publicWriteToken =
					typeof body?.publicWriteToken === 'string'
						? body.publicWriteToken
						: undefined;
				const resourceKey =
					typeof body?.resourceKey === 'string' ? body.resourceKey : undefined;

				if (
					delta === undefined ||
					postId === undefined ||
					typeof publicWriteRequestId !== 'string' ||
					typeof publicWriteToken !== 'string' ||
					publicWriteToken !== 'adapter-proof-token' ||
					typeof resourceKey !== 'string' ||
					resourceKey.length === 0
				) {
					sendCounterStubJson(response, 400, {
						message: 'The request did not match the counter write contract.',
					});
					return;
				}

				const storageKey = `${postId}:${resourceKey}`;
				const nextCount = (counts.get(storageKey) ?? 0) + delta;
				counts.set(storageKey, nextCount);

				sendCounterStubJson(response, 200, {
					count: nextCount,
					postId,
					resourceKey,
					storage: 'custom-table',
				});
				return;
			}

			sendCounterStubJson(response, 405, {
				message: 'The request method is not supported.',
			});
		})().catch((error) => {
			sendCounterStubJson(response, 500, {
				message:
					error instanceof Error
						? error.message
						: 'The local counter stub encountered an unexpected error.',
			});
		});
	});

  server.listen(port, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (address === null || typeof address === 'string') {
    await closeCounterStubServer(server);
    throw new Error(
      'The local counter stub did not expose a numeric listen port.',
    );
  }

  return {
    close: () => closeCounterStubServer(server),
    port: address.port,
    url: `http://127.0.0.1:${address.port}`,
  };
}

export { linkWorkspaceNodeModules, runCli };
