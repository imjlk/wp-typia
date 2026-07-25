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
		'\t{',
		`\t\tapiFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api.ts`)},`,
		`\t\tauth: ${quoteTsString(options.auth)},`,
		...(options.bodyTypeName
			? [`\t\tbodyTypeName: ${quoteTsString(options.bodyTypeName)},`]
			: []),
		`\t\tclientFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api-client.ts`)},`,
		...(options.controllerClass
			? [`\t\tcontrollerClass: ${quoteTsString(options.controllerClass)},`]
			: []),
		...(options.controllerExtends
			? [`\t\tcontrollerExtends: ${quoteTsString(options.controllerExtends)},`]
			: []),
		`\t\tmethod: ${quoteTsString(options.method)},`,
		'\t\tmethods: [],',
		"\t\tmode: 'manual',",
		`\t\tnamespace: ${quoteTsString(options.namespace)},`,
		`\t\topenApiFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api.openapi.json`)},`,
		`\t\tpathPattern: ${quoteTsString(options.pathPattern)},`,
		...(options.permissionCallback
			? [`\t\tpermissionCallback: ${quoteTsString(options.permissionCallback)},`]
			: []),
		`\t\tqueryTypeName: ${quoteTsString(options.queryTypeName)},`,
		'\t\trestManifest: defineEndpointManifest(',
		indentMultiline(JSON.stringify(manifest, null, '\t'), '\t\t\t'),
		'\t\t),',
		`\t\tresponseTypeName: ${quoteTsString(options.responseTypeName)},`,
		...(options.secretFieldName
			? [`\t\tsecretFieldName: ${quoteTsString(options.secretFieldName)},`]
			: []),
		...(options.secretPreserveOnEmpty !== undefined
			? [`\t\tsecretPreserveOnEmpty: ${options.secretPreserveOnEmpty},`]
			: []),
		...(options.secretStateFieldName
			? [`\t\tsecretStateFieldName: ${quoteTsString(options.secretStateFieldName)},`]
			: []),
		`\t\tslug: ${quoteTsString(options.restResourceSlug)},`,
		`\t\ttypesFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api-types.ts`)},`,
		`\t\tvalidatorsFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api-validators.ts`)},`,
		'\t},',
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
						`\t${parameterName}: string & tags.MinLength< 1 >;`,
				)
			: ['\tid?: string & tags.MinLength< 1 >;'];
  const lines = [
    "import type { tags } from '@wp-typia/block-runtime/typia-tags';",
    '',
    `export interface ${options.queryTypeName} {`,
    ...queryFields,
    ...(pathParameterNames.includes('preview') ? [] : ['\tpreview?: boolean;']),
    '}',
  ];

  if (options.bodyTypeName) {
    const secretPreserveOnEmpty = options.secretPreserveOnEmpty ?? true;
    const secretLines =
			options.secretFieldName && options.secretStateFieldName
        ? [
            `\t${options.secretFieldName}?: string${secretPreserveOnEmpty ? ' & tags.MinLength< 1 >' : ''} & tags.MaxLength< 4096 > & tags.Secret< ${quoteTsString(options.secretStateFieldName)} >${secretPreserveOnEmpty ? ' & tags.PreserveOnEmpty< true >' : ''};`,
            secretPreserveOnEmpty
              ? `\t// ${options.secretFieldName} is write-only: omit or submit an empty value to preserve the stored secret, and expose ${options.secretStateFieldName} in responses instead of returning the raw value.`
              : `\t// ${options.secretFieldName} is write-only: persist it server-side and expose ${options.secretStateFieldName} in responses instead of returning the raw value.`,
          ]
        : [];
    lines.push(
      '',
      `export interface ${options.bodyTypeName} {`,
      ...secretLines,
      '\tpayload: string & tags.MinLength< 1 >;',
      '\tcomment?: string & tags.MaxLength< 500 >;',
      '}',
    );
  }

  lines.push(
		'',
		`export interface ${options.responseTypeName} {`,
		...(options.secretStateFieldName
			? [
					`\t${options.secretStateFieldName}: boolean;`,
					`\t// Raw secret fields such as ${options.secretFieldName ?? 'the request secret'} must never be returned in this response.`,
				]
			: []),
		'\tid: string & tags.MinLength< 1 >;',
		"\tstatus: 'ok' | 'error';",
		'\tmessage?: string;',
		'\tupdatedAt?: string;',
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
		`\tquery: ( input: unknown ) => toValidationResult< ${options.queryTypeName} >( validateQuery( input ) ),`,
		...(options.bodyTypeName
			? [
					`\trequest: ( input: unknown ) => toValidationResult< ${options.bodyTypeName} >( validateRequest( input ) ),`,
				]
			: []),
		`\tresponse: ( input: unknown ) => toValidationResult< ${options.responseTypeName} >( validateResponse( input ) ),`,
	];

  return `import typia from 'typia';

import { toValidationResult } from '@wp-typia/rest';
import type {
\t${importedTypes.join(',\n\t')},
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
\tbody: ${options.bodyTypeName};
\tquery: ${options.queryTypeName};
}

`
		: '';
  const typeImports = options.bodyTypeName
    ? [options.bodyTypeName, options.queryTypeName]
    : [options.queryTypeName];

  return `import {
\tcallEndpoint,
\tresolveRestRouteUrl,
} from '@wp-typia/rest';

import type {
\t${typeImports.sort().join(',\n\t')},
} from './api-types';
import { ${operationId}Endpoint } from './api-client';

export * from './api-client';

${requestTypeSource}${formatResolveRestNonceSource('compact')}

function resolveEndpointRouteOptions(request: ${requestTypeName}) {
\tconst requestOptions = ${operationId}Endpoint.buildRequestOptions?.(request) ?? {};
\tconst nonce = resolveRestNonce();
\tconst requestHeaders = (
\t\trequestOptions as { headers?: Record<string, string> }
\t).headers;

\treturn {
\t\t...requestOptions,
\t\theaders: nonce
\t\t\t? {
\t\t\t\t\t...(requestHeaders ?? {}),
\t\t\t\t\t'X-WP-Nonce': nonce,
\t\t\t\t}
\t\t\t: requestHeaders,
\t\tpath: undefined,
\t\turl:
\t\t\trequestOptions.url ??
\t\t\tresolveRestRouteUrl(requestOptions.path ?? ${operationId}Endpoint.path),
\t};
}

export const manualRestContractEndpoint = {
\t...${operationId}Endpoint,
\tbuildRequestOptions: resolveEndpointRouteOptions,
};

export function callManualRestContract(request: ${requestTypeName}) {
\treturn callEndpoint(manualRestContractEndpoint, request);
}
`;
}
