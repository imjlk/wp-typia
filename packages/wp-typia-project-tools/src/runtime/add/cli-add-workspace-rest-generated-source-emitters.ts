import {
	quoteTsString,
	type RestResourceMethodId,
} from "./cli-add-shared.js";
import {
	formatResolveRestNonceSource,
	indentMultiline,
} from "./cli-add-workspace-rest-source-utils.js";
import { buildRestResourceEndpointManifest } from "./rest-resource-artifacts.js";
import { toPascalCase, toTitleCase } from "../shared/string-case.js";

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
		"\t{",
		`\t\tapiFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api.ts`)},`,
		...(options.controllerClass
			? [`\t\tcontrollerClass: ${quoteTsString(options.controllerClass)},`]
			: []),
		...(options.controllerExtends
			? [`\t\tcontrollerExtends: ${quoteTsString(options.controllerExtends)},`]
			: []),
		`\t\tclientFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api-client.ts`)},`,
		`\t\tdataFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/data.ts`)},`,
		`\t\tmethods: [ ${options.methods.map((method) => quoteTsString(method)).join(", ")} ],`,
		`\t\tnamespace: ${quoteTsString(options.namespace)},`,
		`\t\topenApiFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api.openapi.json`)},`,
		...(options.permissionCallback
			? [`\t\tpermissionCallback: ${quoteTsString(options.permissionCallback)},`]
			: []),
		`\t\tphpFile: ${quoteTsString(`inc/rest/${options.restResourceSlug}.php`)},`,
		"\t\trestManifest: defineEndpointManifest(",
		indentMultiline(JSON.stringify(manifest, null, "\t"), "\t\t\t"),
		"\t\t),",
		...(options.routePattern
			? [`\t\troutePattern: ${quoteTsString(options.routePattern)},`]
			: []),
		`\t\tslug: ${quoteTsString(options.restResourceSlug)},`,
		`\t\ttypesFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api-types.ts`)},`,
		`\t\tvalidatorsFile: ${quoteTsString(`src/rest/${options.restResourceSlug}/api-validators.ts`)},`,
		"\t},",
	].join("\n");
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
		"",
		`export type ${pascalCase}Status = 'draft' | 'published';`,
		"",
		`export interface ${pascalCase}Record {`,
		"\tid: number & tags.Type< 'uint32' >;",
		"\ttitle: string & tags.MinLength< 1 > & tags.MaxLength< 120 >;",
		"\tcontent?: string & tags.MaxLength< 2000 >;",
		`\tstatus: ${pascalCase}Status;`,
		"\tupdatedAt: string;",
		"}",
	];

	if (methods.includes("list")) {
		lines.push(
			"",
			`export interface ${pascalCase}ListQuery {`,
			"\tpage?: number & tags.Type< 'uint32' > & tags.Minimum< 1 > & tags.Default< 1 >;",
			"\tperPage?: number & tags.Type< 'uint32' > & tags.Minimum< 1 > & tags.Maximum< 50 > & tags.Default< 10 >;",
			"\tsearch?: string & tags.MaxLength< 120 >;",
			"}",
			"",
			`export interface ${pascalCase}ListResponse {`,
			`\titems: ${pascalCase}Record[];`,
			"\tpage: number & tags.Type< 'uint32' >;",
			"\tperPage: number & tags.Type< 'uint32' >;",
			"\ttotal: number & tags.Type< 'uint32' >;",
			"}",
		);
	}

	if (methods.includes("read")) {
		lines.push(
			"",
			`export interface ${pascalCase}ReadQuery {`,
			"\tid: number & tags.Type< 'uint32' >;",
			"}",
			"",
			`export type ${pascalCase}ReadResponse = ${pascalCase}Record;`,
		);
	}

	if (methods.includes("create")) {
		lines.push(
			"",
			`export interface ${pascalCase}CreateRequest {`,
			"\ttitle: string & tags.MinLength< 1 > & tags.MaxLength< 120 >;",
			"\tcontent?: string & tags.MaxLength< 2000 >;",
			`\tstatus?: ${pascalCase}Status;`,
			"}",
			"",
			`export type ${pascalCase}CreateResponse = ${pascalCase}Record;`,
		);
	}

	if (methods.includes("update")) {
		lines.push(
			"",
			`export interface ${pascalCase}UpdateQuery {`,
			"\tid: number & tags.Type< 'uint32' >;",
			"}",
			"",
			`export interface ${pascalCase}UpdateRequest {`,
			"\ttitle?: string & tags.MinLength< 1 > & tags.MaxLength< 120 >;",
			"\tcontent?: string & tags.MaxLength< 2000 >;",
			`\tstatus?: ${pascalCase}Status;`,
			"}",
			"",
			`export type ${pascalCase}UpdateResponse = ${pascalCase}Record;`,
		);
	}

	if (methods.includes("delete")) {
		lines.push(
			"",
			`export interface ${pascalCase}DeleteQuery {`,
			"\tid: number & tags.Type< 'uint32' >;",
			"}",
			"",
			`export interface ${pascalCase}DeleteResponse {`,
			"\tdeleted: true;",
			"\tid: number & tags.Type< 'uint32' >;",
			"}",
		);
	}

	return `${lines.join("\n")}\n`;
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
		validatorEntries.push(
			`\t${propertyName}: ( input: unknown ) => toValidationResult< ${typeName} >( ${validateIdentifier}( input ) ),`,
		);
	};

	if (methods.includes("list")) {
		addValidator("listQuery", `${pascalCase}ListQuery`, "validateListQuery");
		addValidator("listResponse", `${pascalCase}ListResponse`, "validateListResponse");
	}
	if (methods.includes("read")) {
		addValidator("readQuery", `${pascalCase}ReadQuery`, "validateReadQuery");
		addValidator("readResponse", `${pascalCase}ReadResponse`, "validateReadResponse");
	}
	if (methods.includes("create")) {
		addValidator("createRequest", `${pascalCase}CreateRequest`, "validateCreateRequest");
		addValidator("createResponse", `${pascalCase}CreateResponse`, "validateCreateResponse");
	}
	if (methods.includes("update")) {
		addValidator("updateQuery", `${pascalCase}UpdateQuery`, "validateUpdateQuery");
		addValidator("updateRequest", `${pascalCase}UpdateRequest`, "validateUpdateRequest");
		addValidator("updateResponse", `${pascalCase}UpdateResponse`, "validateUpdateResponse");
	}
	if (methods.includes("delete")) {
		addValidator("deleteQuery", `${pascalCase}DeleteQuery`, "validateDeleteQuery");
		addValidator("deleteResponse", `${pascalCase}DeleteResponse`, "validateDeleteResponse");
	}

	return `import typia from 'typia';

import { toValidationResult } from '@wp-typia/rest';
import type {
\t${Array.from(importedTypes).sort().join(",\n\t")},
} from './api-types';

${validatorDeclarations.join("\n")}

export const apiValidators = {
${validatorEntries.join("\n")}
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
		["create", "update", "delete"].includes(method),
	);

	if (methods.includes("list")) {
		typeImports.add(`${pascalCase}ListQuery`);
		clientEndpointImports.push(`list${pascalCase}ResourcesEndpoint`);
		exportedBindings.push(`export const restResourceListEndpoint = {
\t...list${pascalCase}ResourcesEndpoint,
\tbuildRequestOptions: ( request: ${pascalCase}ListQuery ) =>
\t\tresolveEndpointRouteOptions( list${pascalCase}ResourcesEndpoint, request ),
};

export function listResource( request: ${pascalCase}ListQuery ) {
\treturn callEndpoint( restResourceListEndpoint, request );
}`);
	}

	if (methods.includes("read")) {
		typeImports.add(`${pascalCase}ReadQuery`);
		clientEndpointImports.push(`read${pascalCase}ResourceEndpoint`);
		exportedBindings.push(`export const restResourceReadEndpoint = {
\t...read${pascalCase}ResourceEndpoint,
\tbuildRequestOptions: ( request: ${pascalCase}ReadQuery ) =>
\t\tresolveEndpointRouteOptions( read${pascalCase}ResourceEndpoint, request ),
};

export function readResource( request: ${pascalCase}ReadQuery ) {
\treturn callEndpoint( restResourceReadEndpoint, request );
}`);
	}

	if (methods.includes("create")) {
		typeImports.add(`${pascalCase}CreateRequest`);
		clientEndpointImports.push(`create${pascalCase}ResourceEndpoint`);
		exportedBindings.push(`export const restResourceCreateEndpoint = {
\t...create${pascalCase}ResourceEndpoint,
\tbuildRequestOptions: ( request: ${pascalCase}CreateRequest ) => {
\t\tconst nonce = resolveRestNonce();
\t\treturn {
\t\t\t...resolveEndpointRouteOptions( create${pascalCase}ResourceEndpoint, request ),
\t\t\theaders: nonce
\t\t\t\t? {
\t\t\t\t\t'X-WP-Nonce': nonce,
\t\t\t\t}
\t\t\t\t: undefined,
\t\t};
\t},
};

export function createResource( request: ${pascalCase}CreateRequest ) {
\treturn callEndpoint( restResourceCreateEndpoint, request );
}`);
	}

	if (methods.includes("update")) {
		typeImports.add(`${pascalCase}UpdateQuery`);
		typeImports.add(`${pascalCase}UpdateRequest`);
		clientEndpointImports.push(`update${pascalCase}ResourceEndpoint`);
		exportedBindings.push(`export const restResourceUpdateEndpoint = {
\t...update${pascalCase}ResourceEndpoint,
\tbuildRequestOptions: ( request: {
\t\tbody: ${pascalCase}UpdateRequest;
\t\tquery: ${pascalCase}UpdateQuery;
\t} ) => {
\t\tconst nonce = resolveRestNonce();
\t\treturn {
\t\t\t...resolveEndpointRouteOptions( update${pascalCase}ResourceEndpoint, request ),
\t\t\theaders: nonce
\t\t\t\t? {
\t\t\t\t\t'X-WP-Nonce': nonce,
\t\t\t\t}
\t\t\t\t: undefined,
\t\t};
\t},
};

export function updateResource( request: {
\tbody: ${pascalCase}UpdateRequest;
\tquery: ${pascalCase}UpdateQuery;
} ) {
\treturn callEndpoint( restResourceUpdateEndpoint, request );
}`);
	}

	if (methods.includes("delete")) {
		typeImports.add(`${pascalCase}DeleteQuery`);
		clientEndpointImports.push(`delete${pascalCase}ResourceEndpoint`);
		exportedBindings.push(`export const restResourceDeleteEndpoint = {
\t...delete${pascalCase}ResourceEndpoint,
\tbuildRequestOptions: ( request: ${pascalCase}DeleteQuery ) => {
\t\tconst nonce = resolveRestNonce();
\t\treturn {
\t\t\t...resolveEndpointRouteOptions( delete${pascalCase}ResourceEndpoint, request ),
\t\t\theaders: nonce
\t\t\t\t? {
\t\t\t\t\t'X-WP-Nonce': nonce,
\t\t\t\t}
\t\t\t\t: undefined,
\t\t};
\t},
};

export function deleteResource( request: ${pascalCase}DeleteQuery ) {
\treturn callEndpoint( restResourceDeleteEndpoint, request );
}`);
	}

	const resolveRestNonceSource =
		writeMethods.length > 0
			? `${formatResolveRestNonceSource("spaced")}\n\n`
			: "";

	return `import {
\tcallEndpoint,
\tresolveRestRouteUrl,
} from '@wp-typia/rest';

import type {
\t${Array.from(typeImports).sort().join(",\n\t")},
} from './api-types';
import {
\t${clientEndpointImports.sort().join(",\n\t")},
} from './api-client';
${resolveRestNonceSource}
function resolveEndpointRouteOptions<TRequest>(
\tendpoint: {
\t\tbuildRequestOptions?: ( request: TRequest ) => {
\t\t\tpath?: string;
\t\t\turl?: string;
\t\t};
\t\tpath: string;
\t},
\trequest: TRequest
) {
\tconst requestOptions = endpoint.buildRequestOptions?.( request ) ?? {};
\treturn {
\t\t...requestOptions,
\t\tpath: undefined,
\t\turl: requestOptions.url ?? resolveRestRouteUrl( requestOptions.path ?? endpoint.path ),
\t};
}

${exportedBindings.join("\n\n")}
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

	if (methods.includes("list")) {
		typeImports.add(`${pascalCase}ListQuery`);
		typeImports.add(`${pascalCase}ListResponse`);
		endpointImports.push("restResourceListEndpoint");
		exportedBindings.push(`export type Use${pascalCase}ListQueryOptions<
\tSelected = ${pascalCase}ListResponse,
> = UseEndpointQueryOptions<
\t${pascalCase}ListQuery,
\t${pascalCase}ListResponse,
\tSelected
>;

export function use${pascalCase}ListQuery<
\tSelected = ${pascalCase}ListResponse,
>(
\trequest: ${pascalCase}ListQuery,
\toptions: Use${pascalCase}ListQueryOptions< Selected > = {}
) {
\treturn useEndpointQuery( restResourceListEndpoint, request, options );
}`);
	}

	if (methods.includes("read")) {
		typeImports.add(`${pascalCase}ReadQuery`);
		typeImports.add(`${pascalCase}ReadResponse`);
		endpointImports.push("restResourceReadEndpoint");
		exportedBindings.push(`export type Use${pascalCase}ReadQueryOptions<
\tSelected = ${pascalCase}ReadResponse,
> = UseEndpointQueryOptions<
\t${pascalCase}ReadQuery,
\t${pascalCase}ReadResponse,
\tSelected
>;

export function use${pascalCase}ReadQuery<
\tSelected = ${pascalCase}ReadResponse,
>(
\trequest: ${pascalCase}ReadQuery,
\toptions: Use${pascalCase}ReadQueryOptions< Selected > = {}
) {
\treturn useEndpointQuery( restResourceReadEndpoint, request, options );
}`);
	}

	if (methods.includes("create")) {
		typeImports.add(`${pascalCase}CreateRequest`);
		typeImports.add(`${pascalCase}CreateResponse`);
		endpointImports.push("restResourceCreateEndpoint");
		exportedBindings.push(`export type UseCreate${pascalCase}ResourceMutationOptions = UseEndpointMutationOptions<
\t${pascalCase}CreateRequest,
\t${pascalCase}CreateResponse,
\tunknown
>;

export function useCreate${pascalCase}ResourceMutation(
\toptions: UseCreate${pascalCase}ResourceMutationOptions = {}
) {
\treturn useEndpointMutation( restResourceCreateEndpoint, options );
}`);
	}

	if (methods.includes("update")) {
		typeImports.add(`${pascalCase}UpdateQuery`);
		typeImports.add(`${pascalCase}UpdateRequest`);
		typeImports.add(`${pascalCase}UpdateResponse`);
		endpointImports.push("restResourceUpdateEndpoint");
		exportedBindings.push(`export type UseUpdate${pascalCase}ResourceMutationOptions = UseEndpointMutationOptions<
\t{
\t\tbody: ${pascalCase}UpdateRequest;
\t\tquery: ${pascalCase}UpdateQuery;
\t},
\t${pascalCase}UpdateResponse,
\tunknown
>;

export function useUpdate${pascalCase}ResourceMutation(
\toptions: UseUpdate${pascalCase}ResourceMutationOptions = {}
) {
\treturn useEndpointMutation( restResourceUpdateEndpoint, options );
}`);
	}

	if (methods.includes("delete")) {
		typeImports.add(`${pascalCase}DeleteQuery`);
		typeImports.add(`${pascalCase}DeleteResponse`);
		endpointImports.push("restResourceDeleteEndpoint");
		exportedBindings.push(`export type UseDelete${pascalCase}ResourceMutationOptions = UseEndpointMutationOptions<
\t${pascalCase}DeleteQuery,
\t${pascalCase}DeleteResponse,
\tunknown
>;

export function useDelete${pascalCase}ResourceMutation(
\toptions: UseDelete${pascalCase}ResourceMutationOptions = {}
) {
\treturn useEndpointMutation( restResourceDeleteEndpoint, options );
}`);
	}

	return `import {
\tuseEndpointMutation,
\tuseEndpointQuery,
\ttype UseEndpointMutationOptions,
\ttype UseEndpointQueryOptions,
} from '@wp-typia/rest/react';

import type {
\t${Array.from(typeImports).sort().join(",\n\t")},
} from './api-types';
import {
\t${endpointImports.sort().join(",\n\t")},
} from './api';

${exportedBindings.join("\n\n")}
`;
}
