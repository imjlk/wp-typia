import {
  quoteTsString,
  type ManualRestContractAuthId,
  type ManualRestContractHttpMethodId,
} from './cli-add-shared.js';
import {
  formatResolveRestNonceSource,
  indentMultiline,
} from './cli-add-workspace-rest-source-utils.js';
import { buildManualRestContractEndpointManifest } from './rest-resource-artifacts.js';
import { quotePhpString } from '../shared/php-utils.js';
import {
  toKebabCase,
  toPascalCase,
  toSnakeCase,
  toTitleCase,
} from '../shared/string-case.js';
import {
  renderNamedTypeScriptImport,
  renderTypeScriptValue,
} from '../shared/ts-string-literals.js';

/**
 * Build the `REST_RESOURCES` config entry appended for a manual REST contract.
 *
 * @param options Manual contract file, route, type, and auth metadata.
 * @param options.auth Auth intent stored in the endpoint manifest.
 * @param options.bodyTypeName Optional exported body type name.
 * @param options.method Uppercase HTTP method for the external route.
 * @param options.namespace REST namespace such as `vendor/v1`.
 * @param options.pathPattern Route pattern relative to the namespace.
 * @param options.queryTypeName Exported query type name.
 * @param options.responseTypeName Exported response type name.
 * @param options.restResourceSlug Normalized workspace REST contract slug.
 * @returns A TypeScript object literal string for `scripts/block-config.ts`.
 */
export function buildManualRestContractConfigEntry(options: {
  auth: ManualRestContractAuthId;
  bodyTypeName?: string;
  controllerClass?: string;
  controllerExtends?: string;
  method: ManualRestContractHttpMethodId;
  namespace: string;
  pathPattern: string;
  permissionCallback?: string;
  queryTypeName: string;
  responseTypeName: string;
  restResourceSlug: string;
  secretFieldName?: string;
  secretPreserveOnEmpty?: boolean;
  secretStateFieldName?: string;
  secretStorage?: 'option' | 'secrets-api';
}): string {
  const pascalCase = toPascalCase(options.restResourceSlug);
  const title = toTitleCase(options.restResourceSlug);
  const manifest = buildManualRestContractEndpointManifest({
    auth: options.auth,
    ...(options.bodyTypeName ? { bodyTypeName: options.bodyTypeName } : {}),
    method: options.method,
    namespace: options.namespace,
    pascalCase,
    pathPattern: options.pathPattern,
    queryTypeName: options.queryTypeName,
    responseTypeName: options.responseTypeName,
    slugKebabCase: options.restResourceSlug,
    title,
  });

  return [
    '  {',
    `    apiFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api.ts`)},`,
    `    auth: ${quoteTsString(options.auth)},`,
    ...(options.bodyTypeName
      ? [
          `    bodyTypeName: ${quoteTsString(options.bodyTypeName)},`,
        ]
      : []),
    `    clientFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api-client.ts`)},`,
    ...(options.controllerClass
      ? [
          `    controllerClass: ${quoteTsString(options.controllerClass)},`,
        ]
      : []),
    ...(options.controllerExtends
      ? [
          `    controllerExtends: ${quoteTsString(options.controllerExtends)},`,
        ]
      : []),
    `    method: ${quoteTsString(options.method)},`,
    '    methods: [],',
    "    mode: 'manual',",
    `    namespace: ${quoteTsString(options.namespace)},`,
    `    openApiFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api.openapi.json`)},`,
    `    pathPattern: ${quoteTsString(options.pathPattern)},`,
    ...(options.permissionCallback
      ? [
          `    permissionCallback: ${quoteTsString(options.permissionCallback)},`,
        ]
      : []),
    `    queryTypeName: ${quoteTsString(options.queryTypeName)},`,
    '    restManifest: defineEndpointManifest(',
    indentMultiline(`${renderTypeScriptValue(manifest)},`, '      '),
    '    ),',
    `    responseTypeName: ${quoteTsString(options.responseTypeName)},`,
    ...(options.secretFieldName
      ? [
          `    secretFieldName: ${quoteTsString(options.secretFieldName)},`,
        ]
      : []),
    ...(options.secretPreserveOnEmpty !== undefined
      ? [
          `    secretPreserveOnEmpty: ${options.secretPreserveOnEmpty},`,
        ]
      : []),
    ...(options.secretStateFieldName
      ? [
          `    secretStateFieldName: ${quoteTsString(options.secretStateFieldName)},`,
        ]
      : []),
    ...(options.secretStorage === 'secrets-api'
      ? ["    secretStorage: 'secrets-api',"]
      : []),
    `    slug: ${quoteTsString(options.restResourceSlug)},`,
    `    typesFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api-types.ts`)},`,
    `    validatorsFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api-validators.ts`)},`,
    '  },',
  ].join('\n');
}

/**
 * Build the editable TypeScript type source for a manual REST contract.
 *
 * @param options Manual contract type naming metadata.
 * @param options.bodyTypeName Optional exported body type name.
 * @param options.pathParameterNames Route named captures that should be present
 * in the starter query type so generated clients can fill provider paths.
 * @param options.queryTypeName Exported query type name.
 * @param options.responseTypeName Exported response type name.
 * @param options.restResourceSlug Normalized workspace REST contract slug.
 * @param options.secretFieldName Optional raw secret field included only in the request body.
 * @param options.secretStateFieldName Optional masked response boolean field.
 * @returns TypeScript source for `api-types.ts`.
 */
export function buildManualRestContractTypesSource(options: {
  bodyTypeName?: string;
  pathParameterNames?: string[];
  queryTypeName: string;
  responseTypeName: string;
  restResourceSlug: string;
  secretFieldName?: string;
  secretPreserveOnEmpty?: boolean;
  secretStateFieldName?: string;
}): string {
  const title = toTitleCase(options.restResourceSlug);
  const pathParameterNames = Array.from(
    new Set(options.pathParameterNames ?? []),
  );
  const queryFields =
		pathParameterNames.length > 0
			? pathParameterNames.map(
					(parameterName) =>
						`  ${parameterName}: string & tags.MinLength< 1 >;`,
				)
			: ['  id?: string & tags.MinLength< 1 >;'];
  const lines = [
    "import type { tags } from '@wp-typia/block-runtime/typia-tags';",
    '',
    `export interface ${options.queryTypeName} {`,
    ...queryFields,
    ...(pathParameterNames.includes('preview') ? [] : ['  preview?: boolean;']),
    '}',
  ];

  if (options.bodyTypeName) {
    const secretPreserveOnEmpty = options.secretPreserveOnEmpty ?? true;
    const secretLines =
			options.secretFieldName && options.secretStateFieldName
        ? [
            `  ${options.secretFieldName}?: string${secretPreserveOnEmpty ? ' & tags.MinLength< 1 >' : ''} & tags.MaxLength< 4096 > & tags.Secret< ${quoteTsString(options.secretStateFieldName)} >${secretPreserveOnEmpty ? ' & tags.PreserveOnEmpty< true >' : ''};`,
            secretPreserveOnEmpty
              ? `  // ${options.secretFieldName} is write-only: omit or submit an empty value to preserve the stored secret, and expose ${options.secretStateFieldName} in responses instead of returning the raw value.`
              : `  // ${options.secretFieldName} is write-only: persist it server-side and expose ${options.secretStateFieldName} in responses instead of returning the raw value.`,
          ]
        : [];
    lines.push(
      '',
      `export interface ${options.bodyTypeName} {`,
      ...secretLines,
      '  payload: string & tags.MinLength< 1 >;',
      '  comment?: string & tags.MaxLength< 500 >;',
      '}',
    );
  }

  lines.push(
		'',
		`export interface ${options.responseTypeName} {`,
		...(options.secretStateFieldName
			? [
					`  ${options.secretStateFieldName}: boolean;`,
					`  // Raw secret fields such as ${options.secretFieldName ?? 'the request secret'} must never be returned in this response.`,
				]
			: []),
		'  id: string & tags.MinLength< 1 >;',
		"  status: 'ok' | 'error';",
		'  message?: string;',
		'  updatedAt?: string;',
		'}',
		'',
		`// ${title} is a manual REST contract: edit these types to match the external route owner.`,
	);

  return `${lines.join('\n')}\n`;
}

/**
 * Build Typia validator source for a manual REST contract.
 *
 * @param options Manual contract type names to validate.
 * @param options.bodyTypeName Optional exported body type name.
 * @param options.queryTypeName Exported query type name.
 * @param options.responseTypeName Exported response type name.
 * @returns TypeScript source for `api-validators.ts`.
 */
export function buildManualRestContractValidatorsSource(options: {
  bodyTypeName?: string;
  queryTypeName: string;
  responseTypeName: string;
}): string {
  const importedTypes = [
		options.queryTypeName,
		...(options.bodyTypeName ? [options.bodyTypeName] : []),
		options.responseTypeName,
	].sort();
  const validatorDeclarations = [
		`const validateQuery = typia.createValidate< ${options.queryTypeName} >();`,
		...(options.bodyTypeName
			? [`const validateRequest = typia.createValidate< ${options.bodyTypeName} >();`]
			: []),
		`const validateResponse = typia.createValidate< ${options.responseTypeName} >();`,
	];
  const validatorEntries = [
		`  query: ( input: unknown ) =>`,
		`    toValidationResult< ${options.queryTypeName} >(validateQuery(input)),`,
		...(options.bodyTypeName
			? [
					'  request: ( input: unknown ) =>',
					`    toValidationResult< ${options.bodyTypeName} >(validateRequest(input)),`,
				]
			: []),
		'  response: ( input: unknown ) =>',
		`    toValidationResult< ${options.responseTypeName} >(validateResponse(input)),`,
	];

  return `import typia from 'typia';

import { toValidationResult } from '@wp-typia/rest';
import type {
  ${importedTypes.join(',\n  ')},
} from './api-types';

${validatorDeclarations.join('\n')}

export const apiValidators = {
${validatorEntries.join('\n')}
};
`;
}

/**
 * Build the public API shim for a manual REST contract.
 *
 * @param options Manual REST contract operation and request type metadata.
 * @returns TypeScript source that re-exports the generated endpoint client.
 */
export function buildManualRestContractApiSource(options: {
  bodyTypeName?: string;
  queryTypeName: string;
  restResourceSlug: string;
}): string {
  const pascalCase = toPascalCase(options.restResourceSlug);
  const operationId = `call${pascalCase}ManualRestContract`;
  const requestTypeName = options.bodyTypeName
    ? `${pascalCase}ManualRestContractRequest`
    : options.queryTypeName;
  const requestTypeSource = options.bodyTypeName
		? `export interface ${requestTypeName} {
  body: ${options.bodyTypeName};
  query: ${options.queryTypeName};
}

`
		: '';
  const typeImports = options.bodyTypeName
    ? [options.bodyTypeName, options.queryTypeName]
    : [options.queryTypeName];
  const typeImportSource = renderNamedTypeScriptImport(
    typeImports.sort(),
    './api-types',
    { typeOnly: true },
  );

  return `import { callEndpoint, resolveRestRouteUrl } from '@wp-typia/rest';

${typeImportSource}
import { ${operationId}Endpoint } from './api-client';

export * from './api-client';

${requestTypeSource}${formatResolveRestNonceSource()}

function resolveEndpointRouteOptions(request: ${requestTypeName}) {
  const requestOptions = ${operationId}Endpoint.buildRequestOptions?.(
    request,
  ) ?? {};
  const nonce = resolveRestNonce();
  const requestHeaders = (
    requestOptions as { headers?: Record<string, string> }
  ).headers;

  return {
    ...requestOptions,
    headers: nonce
      ? {
          ...(requestHeaders ?? {}),
          'X-WP-Nonce': nonce,
        }
      : requestHeaders,
    path: undefined,
    url:
      requestOptions.url ??
      resolveRestRouteUrl(requestOptions.path ?? ${operationId}Endpoint.path),
  };
}

export const manualRestContractEndpoint = {
  ...${operationId}Endpoint,
  buildRequestOptions: resolveEndpointRouteOptions,
};

export function callManualRestContract(request: ${requestTypeName}) {
  return callEndpoint(manualRestContractEndpoint, request);
}
`;
}

const WORDPRESS_SECRET_NAME_MAX_LENGTH = 172;
const SECRET_NAME_SEGMENT_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;
const PHP_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;

function toSecretNameSegment(value: string, fallback: string): string {
  const normalized = toKebabCase(value)
    .replace(/[^a-z0-9-]/gu, '')
    .replace(/^-+|-+$/gu, '');
  if (SECRET_NAME_SEGMENT_PATTERN.test(normalized)) {
    return normalized;
  }

  const compact = normalized.replace(/[^a-z0-9]/gu, '');
  return /^[a-z0-9]+$/u.test(compact) ? compact : fallback;
}

function assertPhpIdentifier(value: string, label: string): string {
  if (!PHP_IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`Manual REST contract ${label} must be a PHP identifier.`);
  }

  return value;
}

/**
 * Build a namespaced WordPress secret name for a manual REST secret field.
 *
 * Secret names use `text-domain/resource-field`, with lowercase segments that
 * the WordPress 7.2 Secrets API accepts.
 *
 * @param options Workspace text domain, REST slug, and raw secret field.
 * @returns A single-slash secret name no longer than 172 characters.
 */
export function buildManualRestSecretName(options: {
  restResourceSlug: string;
  secretFieldName: string;
  textDomain: string;
}): string {
  const namespace = toSecretNameSegment(options.textDomain, 'plugin');
  const resource = toSecretNameSegment(options.restResourceSlug, 'rest');
  const field = toSecretNameSegment(options.secretFieldName, 'secret');
  const prefix = `${namespace}/${resource}-`;
  let fieldSegment = field;
  if (`${prefix}${fieldSegment}`.length > WORDPRESS_SECRET_NAME_MAX_LENGTH) {
    fieldSegment = fieldSegment
      .slice(0, Math.max(1, WORDPRESS_SECRET_NAME_MAX_LENGTH - prefix.length))
      .replace(/-+$/u, '');
  }

  const secretName = `${prefix}${fieldSegment}`;
  const [secretNamespace, secretKey] = secretName.split('/');
  if (
    secretName.length > WORDPRESS_SECRET_NAME_MAX_LENGTH ||
    secretNamespace === undefined ||
    secretKey === undefined ||
    secretName.split('/').length !== 2 ||
    !SECRET_NAME_SEGMENT_PATTERN.test(secretNamespace) ||
    !SECRET_NAME_SEGMENT_PATTERN.test(secretKey)
  ) {
    throw new Error(
      'Manual REST contract secret name is not a valid WordPress Secrets API name.',
    );
  }

  return secretName;
}

/**
 * Relative path of the manual REST secret storage helper.
 *
 * @param restResourceSlug Normalized REST resource slug.
 * @returns Workspace-relative PHP path, distinct from generated route files.
 */
export function buildManualRestSecretStoragePhpPath(
  restResourceSlug: string,
): string {
  return `inc/rest/${restResourceSlug}-secret.php`;
}

/**
 * Build the plugin bootstrap snippet that loads the secret storage helper.
 *
 * @param restResourceSlug Normalized REST resource slug.
 * @returns A `require_once` statement for the helper file.
 */
export function buildManualRestSecretStorageRequireSnippet(
  restResourceSlug: string,
): string {
  return `require_once __DIR__ . ${quotePhpString(`/${buildManualRestSecretStoragePhpPath(restResourceSlug)}`)};`;
}

/**
 * Build the PHP owner for a manual REST secret field.
 *
 * `wp_set_secret`, `wp_get_secret`, and `wp_delete_secret` run only inside
 * `function_exists`. When those functions are absent, storage uses the current
 * non-autoloaded option path. Encryption failures are not written to options.
 * The state helper returns only the masked boolean.
 *
 * @param options Workspace identifiers and secret field metadata.
 * @returns Complete PHP source for `inc/rest/<slug>-secret.php`.
 */
export function buildManualRestSecretStoragePhpSource(options: {
  phpPrefix: string;
  preserveOnEmpty: boolean;
  restResourceSlug: string;
  secretFieldName: string;
  secretStateFieldName: string;
  textDomain: string;
}): string {
  const phpPrefix = assertPhpIdentifier(options.phpPrefix, 'PHP prefix');
  const functionBase = assertPhpIdentifier(
    `${phpPrefix}_${toSnakeCase(options.restResourceSlug)}`,
    'secret helper prefix',
  );
  const secretName = buildManualRestSecretName(options);
  const optionName = assertPhpIdentifier(
    `${functionBase}_${toSnakeCase(options.secretFieldName)}`,
    'secret option name',
  );
  const secretNameFunction = `${functionBase}_secret_name`;
  const optionNameFunction = `${functionBase}_secret_option_name`;
  const deleteFunction = `${functionBase}_delete_secret`;
  const storeFunction = `${functionBase}_store_secret`;
  const readFunction = `${functionBase}_read_secret`;
  const hasFunction = `${functionBase}_has_secret`;
  const stateFunction = `${functionBase}_secret_state`;
  const emptyStoreBody = options.preserveOnEmpty
    ? `\t\t\treturn true;`
    : `\t\t\treturn ${deleteFunction}();`;

  return `<?php
/**
 * Server-side secret storage for the ${options.restResourceSlug} manual REST contract.
 *
 * Route owners may read the stored value from ${readFunction}(). REST responses
 * must use ${stateFunction}() and must not write the raw secret into output.
 */

if ( ! defined( 'ABSPATH' ) ) {
	return;
}

if ( ! function_exists( '${secretNameFunction}' ) ) {
	/**
	 * Namespaced WordPress secret name for this contract.
	 *
	 * @return string
	 */
	function ${secretNameFunction}() {
		return ${quotePhpString(secretName)};
	}
}

if ( ! function_exists( '${optionNameFunction}' ) ) {
	/**
	 * Option name used only when the WordPress Secrets API is unavailable.
	 *
	 * @return string
	 */
	function ${optionNameFunction}() {
		return ${quotePhpString(optionName)};
	}
}

if ( ! function_exists( '${deleteFunction}' ) ) {
	/**
	 * Delete the stored secret.
	 *
	 * @return bool
	 */
	function ${deleteFunction}() {
		if ( function_exists( 'wp_delete_secret' ) ) {
			$deleted = wp_delete_secret( ${secretNameFunction}() );

			return true === $deleted;
		}

		return delete_option( ${optionNameFunction}() );
	}
}

if ( ! function_exists( '${storeFunction}' ) ) {
	/**
	 * Store a secret with the WordPress Secrets API when it exists.
	 *
	 * Falls back to a non-autoloaded option only when wp_set_secret is absent.
	 *
	 * @param mixed $value Submitted secret value.
	 * @return bool
	 */
	function ${storeFunction}( $value ) {
		if ( ! is_string( $value ) ) {
			return false;
		}

		if ( '' === $value ) {
${emptyStoreBody}
		}

		if ( function_exists( 'wp_set_secret' ) ) {
			$stored = wp_set_secret( ${secretNameFunction}(), $value );

			return true === $stored;
		}

		return update_option( ${optionNameFunction}(), $value, false );
	}
}

if ( ! function_exists( '${readFunction}' ) ) {
	/**
	 * Read the stored secret for server-side route owners.
	 *
	 * Callers must not place this value in a REST response.
	 *
	 * @return string
	 */
	function ${readFunction}() {
		if ( function_exists( 'wp_get_secret' ) ) {
			$secret = wp_get_secret( ${secretNameFunction}() );

			if ( ! is_object( $secret ) || ! method_exists( $secret, 'reveal' ) ) {
				return '';
			}

			$revealed = $secret->reveal();

			return is_string( $revealed ) ? $revealed : '';
		}

		$stored = get_option( ${optionNameFunction}(), '' );

		return is_string( $stored ) ? $stored : '';
	}
}

if ( ! function_exists( '${hasFunction}' ) ) {
	/**
	 * Whether a secret is stored, without revealing it.
	 *
	 * @return bool
	 */
	function ${hasFunction}() {
		if ( function_exists( 'wp_get_secret' ) ) {
			$secret = wp_get_secret( ${secretNameFunction}() );

			return ! is_wp_error( $secret ) && null !== $secret;
		}

		$stored = get_option( ${optionNameFunction}(), '' );

		return is_string( $stored ) && '' !== $stored;
	}
}

if ( ! function_exists( '${stateFunction}' ) ) {
	/**
	 * Masked REST response fragment.
	 *
	 * @return array<string, bool>
	 */
	function ${stateFunction}() {
		return array(
			${quotePhpString(options.secretStateFieldName)} => ${hasFunction}(),
		);
	}
}
`;
}
