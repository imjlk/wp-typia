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
import { toPascalCase, toTitleCase } from '../shared/string-case.js';
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
