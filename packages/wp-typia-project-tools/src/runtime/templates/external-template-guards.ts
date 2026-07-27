import fs from 'node:fs';

import { safeJsonParse } from '../shared/json-utils.js';

export const TEMPLATE_SOURCE_TIMEOUT_CODE = 'template-source-timeout' as const;
export const TEMPLATE_SOURCE_TOO_LARGE_CODE = 'template-source-too-large' as const;

const DEFAULT_EXTERNAL_TEMPLATE_TIMEOUT_MS = 20_000;
const DEFAULT_EXTERNAL_TEMPLATE_CONFIG_MAX_BYTES = 256 * 1024;
const DEFAULT_EXTERNAL_TEMPLATE_PACKAGE_JSON_MAX_BYTES = 1 * 1024 * 1024;
const DEFAULT_EXTERNAL_TEMPLATE_METADATA_MAX_BYTES = 1 * 1024 * 1024;
const DEFAULT_EXTERNAL_TEMPLATE_TARBALL_MAX_BYTES = 32 * 1024 * 1024;

type TemplateGuardErrorCode =
	| typeof TEMPLATE_SOURCE_TIMEOUT_CODE
	| typeof TEMPLATE_SOURCE_TOO_LARGE_CODE;

function parsePositiveIntegerEnv(
	value: string | undefined,
	fallback: number,
): number {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createTemplateGuardError<TCode extends TemplateGuardErrorCode>(
	code: TCode,
	message: string,
): Error & { code: TCode } {
  const error = new Error(message) as Error & { code: TCode };
  error.code = code;
  return error;
}

export function getExternalTemplateTimeoutMs(): number {
  return parsePositiveIntegerEnv(
    process.env.WP_TYPIA_EXTERNAL_TEMPLATE_TIMEOUT_MS,
    DEFAULT_EXTERNAL_TEMPLATE_TIMEOUT_MS,
  );
}

export function getExternalTemplateConfigMaxBytes(): number {
  return parsePositiveIntegerEnv(
    process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CONFIG_MAX_BYTES,
    DEFAULT_EXTERNAL_TEMPLATE_CONFIG_MAX_BYTES,
  );
}

export function getExternalTemplatePackageJsonMaxBytes(): number {
  return parsePositiveIntegerEnv(
    process.env.WP_TYPIA_EXTERNAL_TEMPLATE_PACKAGE_JSON_MAX_BYTES,
    DEFAULT_EXTERNAL_TEMPLATE_PACKAGE_JSON_MAX_BYTES,
  );
}

export function getExternalTemplateMetadataMaxBytes(): number {
  return parsePositiveIntegerEnv(
    process.env.WP_TYPIA_EXTERNAL_TEMPLATE_METADATA_MAX_BYTES,
    DEFAULT_EXTERNAL_TEMPLATE_METADATA_MAX_BYTES,
  );
}

export function getExternalTemplateTarballMaxBytes(): number {
  return parsePositiveIntegerEnv(
    process.env.WP_TYPIA_EXTERNAL_TEMPLATE_TARBALL_MAX_BYTES,
    DEFAULT_EXTERNAL_TEMPLATE_TARBALL_MAX_BYTES,
  );
}

export function createExternalTemplateTimeoutError(
	label: string,
	timeoutMs: number,
): Error & { code: typeof TEMPLATE_SOURCE_TIMEOUT_CODE } {
  return createTemplateGuardError(
    TEMPLATE_SOURCE_TIMEOUT_CODE,
    `Timed out while ${label} after ${timeoutMs}ms.`,
  );
}

export function createExternalTemplateTooLargeError(
	label: string,
	maxBytes: number,
): Error & { code: typeof TEMPLATE_SOURCE_TOO_LARGE_CODE } {
  return createTemplateGuardError(
    TEMPLATE_SOURCE_TOO_LARGE_CODE,
    `${label} exceeded the external template size limit (${maxBytes} bytes).`,
  );
}

export function assertExternalTemplateFileSize(
	filePath: string,
	options: {
		label: string;
		maxBytes: number;
	},
): void {
  const stats = fs.statSync(filePath);
  if (stats.size > options.maxBytes) {
    throw createExternalTemplateTooLargeError(options.label, options.maxBytes);
  }
}

export async function withExternalTemplateTimeout<T>(
	label: string,
	task: Promise<T> | (() => Promise<T>),
	timeoutMs = getExternalTemplateTimeoutMs(),
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutHandle = setTimeout(() => {
			reject(createExternalTemplateTimeoutError(label, timeoutMs));
		}, timeoutMs);
	});

  try {
    const pendingTask = typeof task === 'function' ? task() : task;
    return await Promise.race([pendingTask, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function fetchWithExternalTemplateTimeout(
	input: string,
	options: {
		init?: RequestInit;
		label: string;
		timeoutMs?: number;
	},
): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? getExternalTemplateTimeoutMs();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...(options.init ?? {}),
      signal: controller.signal,
    });
  } catch (error) {
    if (
			error instanceof Error &&
			(error.name === 'AbortError' || error.name === 'TimeoutError')
		) {
      throw createExternalTemplateTimeoutError(options.label, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function readResponseBodyWithLimit(
	response: Response,
	options: {
		label: string;
		maxBytes: number;
	},
): Promise<Buffer> {
  const contentLengthHeader = response.headers.get('content-length');
  if (typeof contentLengthHeader === 'string') {
    const declaredLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
      throw createExternalTemplateTooLargeError(
        options.label,
        options.maxBytes,
      );
    }
  }

  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > options.maxBytes) {
      throw createExternalTemplateTooLargeError(
        options.label,
        options.maxBytes,
      );
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    totalBytes += value.byteLength;
    if (totalBytes > options.maxBytes) {
      await reader.cancel();
      throw createExternalTemplateTooLargeError(
        options.label,
        options.maxBytes,
      );
    }

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

export async function readJsonResponseWithLimit(
	response: Response,
	options: {
		label: string;
		maxBytes: number;
	},
): Promise<Record<string, unknown>> {
  const buffer = await readResponseBodyWithLimit(response, options);
  return safeJsonParse<Record<string, unknown>>(buffer.toString('utf8'), {
    context: options.label,
  });
}

export async function readBufferResponseWithLimit(
	response: Response,
	options: {
		label: string;
		maxBytes: number;
	},
): Promise<Buffer> {
  return readResponseBodyWithLimit(response, options);
}
