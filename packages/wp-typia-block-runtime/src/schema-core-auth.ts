import type {
  EndpointAuthIntent,
  EndpointOpenApiAuthMode,
  EndpointOpenApiEndpointDefinition,
  EndpointWordPressAuthDefinition,
  JsonSchemaObject,
  NormalizedEndpointAuthDefinition,
} from './schema-core.js';

const WP_TYPIA_AUTH_LITERALS = {
  PUBLIC_WRITE_TOKEN_FIELD: 'publicWriteToken',
  WORDPRESS_PUBLIC_TOKEN_MECHANISM: 'public-signed-token' as const,
  WORDPRESS_REST_NONCE_MECHANISM: 'rest-nonce' as const,
} as const;

function formatEndpointDescription(
	endpoint: Pick<
		EndpointOpenApiEndpointDefinition,
		'method' | 'operationId' | 'path'
	>,
): string {
  return `${endpoint.operationId} (${endpoint.method} ${endpoint.path})`;
}

function normalizeWordPressAuthDefinition(
	wordpressAuth: EndpointWordPressAuthDefinition | undefined,
): EndpointWordPressAuthDefinition | undefined {
  if (!wordpressAuth) {
    return undefined;
  }

  if (
		wordpressAuth.mechanism !==
		WP_TYPIA_AUTH_LITERALS.WORDPRESS_PUBLIC_TOKEN_MECHANISM
	) {
    return {
      mechanism: wordpressAuth.mechanism,
    };
  }

  return {
		mechanism: wordpressAuth.mechanism,
		publicTokenField:
			wordpressAuth.publicTokenField ??
			WP_TYPIA_AUTH_LITERALS.PUBLIC_WRITE_TOKEN_FIELD,
	};
}

function deriveLegacyAuthModeFromNormalizedAuth(
	auth: EndpointAuthIntent,
	wordpressAuth: EndpointWordPressAuthDefinition | undefined,
): EndpointOpenApiAuthMode | undefined {
  if (auth === 'public') {
    return 'public-read';
  }

  if (
		auth === 'authenticated' &&
		wordpressAuth?.mechanism ===
			WP_TYPIA_AUTH_LITERALS.WORDPRESS_REST_NONCE_MECHANISM
	) {
    return 'authenticated-rest-nonce';
  }

  if (
		auth === 'public-write-protected' &&
		wordpressAuth?.mechanism ===
			WP_TYPIA_AUTH_LITERALS.WORDPRESS_PUBLIC_TOKEN_MECHANISM
	) {
    return 'public-signed-token';
  }

  return undefined;
}

function compareNormalizedEndpointAuth(
	left: NormalizedEndpointAuthDefinition,
	right: NormalizedEndpointAuthDefinition,
): boolean {
  return (
		left.auth === right.auth &&
		left.authMode === right.authMode &&
		left.wordpressAuth?.mechanism === right.wordpressAuth?.mechanism &&
		left.wordpressAuth?.publicTokenField === right.wordpressAuth?.publicTokenField
	);
}

export function normalizeEndpointAuthDefinition(
	endpoint: Pick<
		EndpointOpenApiEndpointDefinition,
		'auth' | 'authMode' | 'operationId' | 'path' | 'wordpressAuth' | 'method'
	>,
): NormalizedEndpointAuthDefinition {
  const endpointDescription =
		typeof endpoint.operationId === 'string' &&
		typeof endpoint.path === 'string' &&
		typeof endpoint.method === 'string'
			? formatEndpointDescription(endpoint)
			: 'the current endpoint';
  const nextWordPressAuth = normalizeWordPressAuthDefinition(
    endpoint.wordpressAuth,
  );

  let normalized: NormalizedEndpointAuthDefinition | null = null;
  if (endpoint.auth) {
    normalized = {
      auth: endpoint.auth,
      authMode: deriveLegacyAuthModeFromNormalizedAuth(
        endpoint.auth,
        nextWordPressAuth,
      ),
      ...(nextWordPressAuth ? { wordpressAuth: nextWordPressAuth } : {}),
    };

    if (endpoint.auth === 'public' && nextWordPressAuth) {
      throw new Error(
        `Endpoint "${endpointDescription}" cannot attach wordpressAuth when auth intent is "public".`,
      );
    }
    if (
			endpoint.auth === 'authenticated' &&
			nextWordPressAuth?.mechanism ===
				WP_TYPIA_AUTH_LITERALS.WORDPRESS_PUBLIC_TOKEN_MECHANISM
		) {
      throw new Error(
        `Endpoint "${endpointDescription}" uses auth intent "authenticated" but wordpressAuth mechanism "${nextWordPressAuth.mechanism}" only supports "public-write-protected".`,
      );
    }
    if (
			endpoint.auth === 'public-write-protected' &&
			nextWordPressAuth?.mechanism ===
				WP_TYPIA_AUTH_LITERALS.WORDPRESS_REST_NONCE_MECHANISM
		) {
      throw new Error(
        `Endpoint "${endpointDescription}" uses auth intent "public-write-protected" but wordpressAuth mechanism "${nextWordPressAuth.mechanism}" only supports "authenticated".`,
      );
    }
  }

  let legacyNormalized: NormalizedEndpointAuthDefinition | null = null;
  if (endpoint.authMode) {
    legacyNormalized =
			endpoint.authMode === 'public-read'
				? {
						auth: 'public',
						authMode: 'public-read',
				  }
				: endpoint.authMode === 'authenticated-rest-nonce'
					? {
							auth: 'authenticated',
							authMode: 'authenticated-rest-nonce',
							wordpressAuth: {
								mechanism:
									WP_TYPIA_AUTH_LITERALS.WORDPRESS_REST_NONCE_MECHANISM,
							},
					  }
					: {
							auth: 'public-write-protected',
							authMode: 'public-signed-token',
							wordpressAuth: {
								mechanism:
									WP_TYPIA_AUTH_LITERALS.WORDPRESS_PUBLIC_TOKEN_MECHANISM,
								publicTokenField:
									WP_TYPIA_AUTH_LITERALS.PUBLIC_WRITE_TOKEN_FIELD,
							},
					  };
  }

  if (normalized && legacyNormalized) {
    if (!compareNormalizedEndpointAuth(normalized, legacyNormalized)) {
      throw new Error(
        `Endpoint "${endpointDescription}" defines conflicting auth metadata between auth/wordpressAuth and deprecated authMode.`,
      );
    }

    return normalized;
  }

  if (normalized) {
    return normalized;
  }

  if (legacyNormalized) {
    return legacyNormalized;
  }

  throw new Error(
    `Endpoint "${endpointDescription}" must define either auth or deprecated authMode.`,
  );
}

export function createBootstrapResponseHeaders(
	normalizedAuth: NormalizedEndpointAuthDefinition,
): Record<string, JsonSchemaObject> {
  const headers: Record<string, JsonSchemaObject> = {
		'Cache-Control': {
			description:
				'Must be non-cacheable for fresh bootstrap write/session state.',
			schema: {
				type: 'string',
				example: 'private, no-store, no-cache, must-revalidate',
			},
		},
		Pragma: {
			description: 'Legacy non-cacheable bootstrap response directive.',
			schema: {
				type: 'string',
				example: 'no-cache',
			},
		},
	};

  if (
		normalizedAuth.wordpressAuth?.mechanism ===
		WP_TYPIA_AUTH_LITERALS.WORDPRESS_REST_NONCE_MECHANISM
	) {
    headers.Vary = {
			description:
				'Viewer-aware bootstrap responses should vary on cookie-backed auth state.',
			schema: {
				type: 'string',
				example: 'Cookie',
			},
		};
  }

  return headers;
}
