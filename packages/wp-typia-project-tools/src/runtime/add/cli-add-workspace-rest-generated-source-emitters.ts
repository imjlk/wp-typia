import { quoteTsString, type RestResourceMethodId } from './cli-add-shared.js';
import {
  formatResolveRestNonceSource,
  indentMultiline,
} from './cli-add-workspace-rest-source-utils.js';
import { buildRestResourceEndpointManifest } from './rest-resource-artifacts.js';
import { toPascalCase, toTitleCase } from '../shared/string-case.js';
import {
  renderNamedTypeScriptImport,
  renderTypeScriptValue,
} from '../shared/ts-string-literals.js';

/**
 * Build a generated REST resource config entry for `scripts/block-config.ts`.
 *
 * @param options REST resource metadata. `restResourceSlug`, `namespace`, and
 * `methods` are required; `controllerClass`, `controllerExtends`,
 * `permissionCallback`, and `routePattern` opt into generated controller,
 * permission, and item-route escape hatches.
 * @returns TypeScript object literal source for one generated REST resource entry.
 */
export function buildRestResourceConfigEntry(options: {
  controllerClass?: string;
  controllerExtends?: string;
  methods: RestResourceMethodId[];
  namespace: string;
  permissionCallback?: string;
  restResourceSlug: string;
  routePattern?: string;
}): string {
  const pascalCase = toPascalCase(options.restResourceSlug);
  const title = toTitleCase(options.restResourceSlug);
  const manifest = buildRestResourceEndpointManifest(
    {
      namespace: options.namespace,
      pascalCase,
      ...(options.routePattern ? { routePattern: options.routePattern } : {}),
      slugKebabCase: options.restResourceSlug,
      title,
    },
    options.methods,
  );

  return [
    '  {',
    `    apiFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api.ts`)},`,
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
    `    clientFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api-client.ts`)},`,
    `    dataFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/data.ts`)},`,
    `    methods: [${options.methods.map((method) => quoteTsString(method)).join(', ')}],`,
    `    namespace: ${quoteTsString(options.namespace)},`,
    `    openApiFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api.openapi.json`)},`,
    ...(options.permissionCallback
      ? [
          `    permissionCallback: ${quoteTsString(options.permissionCallback)},`,
        ]
      : []),
    `    phpFile: ${quoteTsString(`inc/rest/${options.restResourceSlug}.php`)},`,
    '    restManifest: defineEndpointManifest(',
    indentMultiline(`${renderTypeScriptValue(manifest)},`, '      '),
    '    ),',
    ...(options.routePattern
      ? [
          `    routePattern: ${quoteTsString(options.routePattern)},`,
        ]
      : []),
    `    slug: ${quoteTsString(options.restResourceSlug)},`,
    `    typesFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api-types.ts`)},`,
    `    validatorsFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api-validators.ts`)},`,
    '  },',
  ].join('\n');
}

/**
 * Build editable TypeScript type definitions for a generated REST resource.
 *
 * @param restResourceSlug Normalized REST resource slug.
 * @param methods Enabled generated REST methods.
 * @returns TypeScript source for `api-types.ts`.
 */
export function buildRestResourceTypesSource(
	restResourceSlug: string,
	methods: RestResourceMethodId[],
): string {
  const pascalCase = toPascalCase(restResourceSlug);
  const lines = [
    "import { tags } from 'typia';",
    '',
    `export type ${pascalCase}Status = 'draft' | 'published';`,
    '',
    `export interface ${pascalCase}Record {`,
    "  id: number & tags.Type< 'uint32' >;",
    '  title: string & tags.MinLength< 1 > & tags.MaxLength< 120 >;',
    '  content?: string & tags.MaxLength< 2000 >;',
    `  status: ${pascalCase}Status;`,
    '  updatedAt: string;',
    '}',
  ];

  if (methods.includes('list')) {
    lines.push(
      '',
      `export interface ${pascalCase}ListQuery {`,
      "  page?: number & tags.Type< 'uint32' > & tags.Minimum< 1 > & tags.Default< 1 >;",
      "  perPage?: number & tags.Type< 'uint32' > & tags.Minimum< 1 > & tags.Maximum< 50 > & tags.Default< 10 >;",
      '  search?: string & tags.MaxLength< 120 >;',
      '}',
      '',
      `export interface ${pascalCase}ListResponse {`,
      `  items: ${pascalCase}Record[];`,
      "  page: number & tags.Type< 'uint32' >;",
      "  perPage: number & tags.Type< 'uint32' >;",
      "  total: number & tags.Type< 'uint32' >;",
      '}',
    );
  }

  if (methods.includes('read')) {
    lines.push(
      '',
      `export interface ${pascalCase}ReadQuery {`,
      "  id: number & tags.Type< 'uint32' >;",
      '}',
      '',
      `export type ${pascalCase}ReadResponse = ${pascalCase}Record;`,
    );
  }

  if (methods.includes('create')) {
    lines.push(
      '',
      `export interface ${pascalCase}CreateRequest {`,
      '  title: string & tags.MinLength< 1 > & tags.MaxLength< 120 >;',
      '  content?: string & tags.MaxLength< 2000 >;',
      `  status?: ${pascalCase}Status;`,
      '}',
      '',
      `export type ${pascalCase}CreateResponse = ${pascalCase}Record;`,
    );
  }

  if (methods.includes('update')) {
    lines.push(
      '',
      `export interface ${pascalCase}UpdateQuery {`,
      "  id: number & tags.Type< 'uint32' >;",
      '}',
      '',
      `export interface ${pascalCase}UpdateRequest {`,
      '  title?: string & tags.MinLength< 1 > & tags.MaxLength< 120 >;',
      '  content?: string & tags.MaxLength< 2000 >;',
      `  status?: ${pascalCase}Status;`,
      '}',
      '',
      `export type ${pascalCase}UpdateResponse = ${pascalCase}Record;`,
    );
  }

  if (methods.includes('delete')) {
    lines.push(
      '',
      `export interface ${pascalCase}DeleteQuery {`,
      "  id: number & tags.Type< 'uint32' >;",
      '}',
      '',
      `export interface ${pascalCase}DeleteResponse {`,
      '  deleted: true;',
      "  id: number & tags.Type< 'uint32' >;",
      '}',
    );
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Build Typia validators for a generated REST resource.
 *
 * @param restResourceSlug Normalized REST resource slug.
 * @param methods Enabled generated REST methods.
 * @returns TypeScript source for `api-validators.ts`.
 */
export function buildRestResourceValidatorsSource(
	restResourceSlug: string,
	methods: RestResourceMethodId[],
): string {
  const pascalCase = toPascalCase(restResourceSlug);
  const importedTypes = new Set<string>();
  const validatorDeclarations: string[] = [];
  const validatorEntries: string[] = [];

  const addValidator = (
		propertyName: string,
		typeName: string,
		validateIdentifier: string,
	) => {
    importedTypes.add(typeName);
    validatorDeclarations.push(
      `const ${validateIdentifier} = typia.createValidate< ${typeName} >();`,
    );
    const validationCall =
      `    toValidationResult< ${typeName} >(${validateIdentifier}(input)),`;
    validatorEntries.push(`  ${propertyName}: ( input: unknown ) =>`);
    if (validationCall.length <= 80) {
      validatorEntries.push(validationCall);
    } else {
      validatorEntries.push(
        `    toValidationResult< ${typeName} >(`,
        `      ${validateIdentifier}(input),`,
        '    ),',
      );
    }
  };

  if (methods.includes('list')) {
    addValidator('listQuery', `${pascalCase}ListQuery`, 'validateListQuery');
    addValidator(
      'listResponse',
      `${pascalCase}ListResponse`,
      'validateListResponse',
    );
  }
  if (methods.includes('read')) {
    addValidator('readQuery', `${pascalCase}ReadQuery`, 'validateReadQuery');
    addValidator(
      'readResponse',
      `${pascalCase}ReadResponse`,
      'validateReadResponse',
    );
  }
  if (methods.includes('create')) {
    addValidator(
      'createRequest',
      `${pascalCase}CreateRequest`,
      'validateCreateRequest',
    );
    addValidator(
      'createResponse',
      `${pascalCase}CreateResponse`,
      'validateCreateResponse',
    );
  }
  if (methods.includes('update')) {
    addValidator(
      'updateQuery',
      `${pascalCase}UpdateQuery`,
      'validateUpdateQuery',
    );
    addValidator(
      'updateRequest',
      `${pascalCase}UpdateRequest`,
      'validateUpdateRequest',
    );
    addValidator(
      'updateResponse',
      `${pascalCase}UpdateResponse`,
      'validateUpdateResponse',
    );
  }
  if (methods.includes('delete')) {
    addValidator(
      'deleteQuery',
      `${pascalCase}DeleteQuery`,
      'validateDeleteQuery',
    );
    addValidator(
      'deleteResponse',
      `${pascalCase}DeleteResponse`,
      'validateDeleteResponse',
    );
  }

  return `import typia from 'typia';

import { toValidationResult } from '@wp-typia/rest';
import type {
  ${Array.from(importedTypes).sort().join(',\n  ')},
} from './api-types';

${validatorDeclarations.join('\n')}

export const apiValidators = {
${validatorEntries.join('\n')}
};
`;
}

/**
 * Build the public API shim for a generated REST resource.
 *
 * @param restResourceSlug Normalized REST resource slug.
 * @param methods Enabled generated REST methods.
 * @returns TypeScript source for `api.ts`.
 */
export function buildRestResourceApiSource(
	restResourceSlug: string,
	methods: RestResourceMethodId[],
): string {
  const pascalCase = toPascalCase(restResourceSlug);
  const typeImports = new Set<string>();
  const clientEndpointImports: string[] = [];
  const exportedBindings: string[] = [];
  const writeMethods = methods.filter((method) =>
    ['create', 'update', 'delete'].includes(method),
  );

  if (methods.includes('list')) {
    typeImports.add(`${pascalCase}ListQuery`);
    clientEndpointImports.push(`list${pascalCase}ResourcesEndpoint`);
    exportedBindings.push(`export const restResourceListEndpoint = {
  ...list${pascalCase}ResourcesEndpoint,
  buildRequestOptions: ( request: ${pascalCase}ListQuery ) =>
    resolveEndpointRouteOptions(list${pascalCase}ResourcesEndpoint, request),
};

export function listResource( request: ${pascalCase}ListQuery ) {
  return callEndpoint( restResourceListEndpoint, request );
}`);
  }

  if (methods.includes('read')) {
    typeImports.add(`${pascalCase}ReadQuery`);
    clientEndpointImports.push(`read${pascalCase}ResourceEndpoint`);
    exportedBindings.push(`export const restResourceReadEndpoint = {
  ...read${pascalCase}ResourceEndpoint,
  buildRequestOptions: ( request: ${pascalCase}ReadQuery ) =>
    resolveEndpointRouteOptions(read${pascalCase}ResourceEndpoint, request),
};

export function readResource( request: ${pascalCase}ReadQuery ) {
  return callEndpoint( restResourceReadEndpoint, request );
}`);
  }

  if (methods.includes('create')) {
    typeImports.add(`${pascalCase}CreateRequest`);
    clientEndpointImports.push(`create${pascalCase}ResourceEndpoint`);
    exportedBindings.push(`export const restResourceCreateEndpoint = {
  ...create${pascalCase}ResourceEndpoint,
  buildRequestOptions: ( request: ${pascalCase}CreateRequest ) => {
    const nonce = resolveRestNonce();
    return {
      ...resolveEndpointRouteOptions(
        create${pascalCase}ResourceEndpoint,
        request,
      ),
      headers: nonce
        ? {
            'X-WP-Nonce': nonce,
          }
        : undefined,
    };
  },
};

export function createResource( request: ${pascalCase}CreateRequest ) {
  return callEndpoint( restResourceCreateEndpoint, request );
}`);
  }

  if (methods.includes('update')) {
    typeImports.add(`${pascalCase}UpdateQuery`);
    typeImports.add(`${pascalCase}UpdateRequest`);
    clientEndpointImports.push(`update${pascalCase}ResourceEndpoint`);
    exportedBindings.push(`export const restResourceUpdateEndpoint = {
  ...update${pascalCase}ResourceEndpoint,
  buildRequestOptions: ( request: {
    body: ${pascalCase}UpdateRequest;
    query: ${pascalCase}UpdateQuery;
  } ) => {
    const nonce = resolveRestNonce();
    return {
      ...resolveEndpointRouteOptions(
        update${pascalCase}ResourceEndpoint,
        request,
      ),
      headers: nonce
        ? {
            'X-WP-Nonce': nonce,
          }
        : undefined,
    };
  },
};

export function updateResource( request: {
  body: ${pascalCase}UpdateRequest;
  query: ${pascalCase}UpdateQuery;
} ) {
  return callEndpoint( restResourceUpdateEndpoint, request );
}`);
  }

  if (methods.includes('delete')) {
    typeImports.add(`${pascalCase}DeleteQuery`);
    clientEndpointImports.push(`delete${pascalCase}ResourceEndpoint`);
    exportedBindings.push(`export const restResourceDeleteEndpoint = {
  ...delete${pascalCase}ResourceEndpoint,
  buildRequestOptions: ( request: ${pascalCase}DeleteQuery ) => {
    const nonce = resolveRestNonce();
    return {
      ...resolveEndpointRouteOptions(
        delete${pascalCase}ResourceEndpoint,
        request,
      ),
      headers: nonce
        ? {
            'X-WP-Nonce': nonce,
          }
        : undefined,
    };
  },
};

export function deleteResource( request: ${pascalCase}DeleteQuery ) {
  return callEndpoint( restResourceDeleteEndpoint, request );
}`);
  }

  const resolveRestNonceSource =
		writeMethods.length > 0 ? `${formatResolveRestNonceSource()}\n\n` : '';
  const typeImportSource = renderNamedTypeScriptImport(
    Array.from(typeImports).sort(),
    './api-types',
    { typeOnly: true },
  );
  const clientImportSource = renderNamedTypeScriptImport(
    clientEndpointImports.sort(),
    './api-client',
  );

  return `import { callEndpoint, resolveRestRouteUrl } from '@wp-typia/rest';

${typeImportSource}
${clientImportSource}
${resolveRestNonceSource}function resolveEndpointRouteOptions<TRequest>(
  endpoint: {
    buildRequestOptions?: ( request: TRequest ) => {
      path?: string;
      url?: string;
    };
    path: string;
  },
  request: TRequest,
) {
  const requestOptions = endpoint.buildRequestOptions?.( request ) ?? {};
  return {
    ...requestOptions,
    path: undefined,
    url:
      requestOptions.url ??
      resolveRestRouteUrl( requestOptions.path ?? endpoint.path ),
  };
}

${exportedBindings.join('\n\n')}
`;
}

/**
 * Build React query and mutation hooks for a generated REST resource.
 *
 * @param restResourceSlug Normalized REST resource slug.
 * @param methods Enabled generated REST methods.
 * @returns TypeScript source for `data.ts`.
 */
export function buildRestResourceDataSource(
	restResourceSlug: string,
	methods: RestResourceMethodId[],
): string {
  const pascalCase = toPascalCase(restResourceSlug);
  const typeImports = new Set<string>();
  const endpointImports: string[] = [];
  const exportedBindings: string[] = [];

  if (methods.includes('list')) {
    typeImports.add(`${pascalCase}ListQuery`);
    typeImports.add(`${pascalCase}ListResponse`);
    endpointImports.push('restResourceListEndpoint');
    exportedBindings.push(`export type Use${pascalCase}ListQueryOptions<
  Selected = ${pascalCase}ListResponse,
> = UseEndpointQueryOptions<
  ${pascalCase}ListQuery,
  ${pascalCase}ListResponse,
  Selected
>;

export function use${pascalCase}ListQuery<
  Selected = ${pascalCase}ListResponse,
>(
  request: ${pascalCase}ListQuery,
  options: Use${pascalCase}ListQueryOptions< Selected > = {},
) {
  return useEndpointQuery( restResourceListEndpoint, request, options );
}`);
  }

  if (methods.includes('read')) {
    typeImports.add(`${pascalCase}ReadQuery`);
    typeImports.add(`${pascalCase}ReadResponse`);
    endpointImports.push('restResourceReadEndpoint');
    exportedBindings.push(`export type Use${pascalCase}ReadQueryOptions<
  Selected = ${pascalCase}ReadResponse,
> = UseEndpointQueryOptions<
  ${pascalCase}ReadQuery,
  ${pascalCase}ReadResponse,
  Selected
>;

export function use${pascalCase}ReadQuery<
  Selected = ${pascalCase}ReadResponse,
>(
  request: ${pascalCase}ReadQuery,
  options: Use${pascalCase}ReadQueryOptions< Selected > = {},
) {
  return useEndpointQuery( restResourceReadEndpoint, request, options );
}`);
  }

  if (methods.includes('create')) {
    typeImports.add(`${pascalCase}CreateRequest`);
    typeImports.add(`${pascalCase}CreateResponse`);
    endpointImports.push('restResourceCreateEndpoint');
    exportedBindings.push(`export type UseCreate${pascalCase}ResourceMutationOptions = UseEndpointMutationOptions<
  ${pascalCase}CreateRequest,
  ${pascalCase}CreateResponse,
  unknown
>;

export function useCreate${pascalCase}ResourceMutation(
  options: UseCreate${pascalCase}ResourceMutationOptions = {},
) {
  return useEndpointMutation( restResourceCreateEndpoint, options );
}`);
  }

  if (methods.includes('update')) {
    typeImports.add(`${pascalCase}UpdateQuery`);
    typeImports.add(`${pascalCase}UpdateRequest`);
    typeImports.add(`${pascalCase}UpdateResponse`);
    endpointImports.push('restResourceUpdateEndpoint');
    exportedBindings.push(`export type UseUpdate${pascalCase}ResourceMutationOptions = UseEndpointMutationOptions<
  {
    body: ${pascalCase}UpdateRequest;
    query: ${pascalCase}UpdateQuery;
  },
  ${pascalCase}UpdateResponse,
  unknown
>;

export function useUpdate${pascalCase}ResourceMutation(
  options: UseUpdate${pascalCase}ResourceMutationOptions = {},
) {
  return useEndpointMutation( restResourceUpdateEndpoint, options );
}`);
  }

  if (methods.includes('delete')) {
    typeImports.add(`${pascalCase}DeleteQuery`);
    typeImports.add(`${pascalCase}DeleteResponse`);
    endpointImports.push('restResourceDeleteEndpoint');
    exportedBindings.push(`export type UseDelete${pascalCase}ResourceMutationOptions = UseEndpointMutationOptions<
  ${pascalCase}DeleteQuery,
  ${pascalCase}DeleteResponse,
  unknown
>;

export function useDelete${pascalCase}ResourceMutation(
  options: UseDelete${pascalCase}ResourceMutationOptions = {},
) {
  return useEndpointMutation( restResourceDeleteEndpoint, options );
}`);
  }
  const typeImportSource = renderNamedTypeScriptImport(
    Array.from(typeImports).sort(),
    './api-types',
    { typeOnly: true },
  );
  const endpointImportSource = renderNamedTypeScriptImport(
    endpointImports.sort(),
    './api',
  );

  return `import {
  useEndpointMutation,
  useEndpointQuery,
  type UseEndpointMutationOptions,
  type UseEndpointQueryOptions,
} from '@wp-typia/rest/react';

${typeImportSource}
${endpointImportSource}

${exportedBindings.join('\n\n')}
`;
}
