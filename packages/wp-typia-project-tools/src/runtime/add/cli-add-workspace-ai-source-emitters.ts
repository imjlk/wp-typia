import { quoteTsString } from "./cli-add-shared.js";
import { buildAiFeatureEndpointManifest } from "./ai-feature-artifacts.js";
import {
	OPTIONAL_WORDPRESS_AI_CLIENT_COMPATIBILITY,
	createScaffoldCompatibilityConfig,
	renderScaffoldCompatibilityConfig,
	resolveScaffoldCompatibilityPolicy,
} from "../templates/scaffold-compatibility.js";
import {
	formatResolveRestNonceSource,
	indentMultiline,
} from "./cli-add-workspace-rest-source-utils.js";
import { toPascalCase, toTitleCase } from "../shared/string-case.js";

export {
	buildAiFeatureSyncScriptSource,
} from "./cli-add-workspace-ai-sync-script-source.js";

/**
 * Build the workspace inventory entry written into `scripts/block-config.ts` for one AI feature.
 */
export function buildAiFeatureConfigEntry(
	aiFeatureSlug: string,
	namespace: string,
): string {
	const pascalCase = toPascalCase(aiFeatureSlug);
	const title = toTitleCase(aiFeatureSlug);
	const compatibilityPolicy = resolveScaffoldCompatibilityPolicy(
		OPTIONAL_WORDPRESS_AI_CLIENT_COMPATIBILITY,
	);
	const manifest = buildAiFeatureEndpointManifest({
		namespace,
		pascalCase,
		slugKebabCase: aiFeatureSlug,
		title,
	});

	return [
		"\t{",
		`\t\taiSchemaFile: ${quoteTsString(
			`src/ai-features/${aiFeatureSlug}/ai-schemas/feature-result.ai.schema.json`,
		)},`,
		`\t\tapiFile: ${quoteTsString(`src/ai-features/${aiFeatureSlug}/api.ts`)},`,
		`\t\tclientFile: ${quoteTsString(
			`src/ai-features/${aiFeatureSlug}/api-client.ts`,
		)},`,
		`\t\tcompatibility: ${renderScaffoldCompatibilityConfig(
			compatibilityPolicy,
		)},`,
		`\t\tdataFile: ${quoteTsString(`src/ai-features/${aiFeatureSlug}/data.ts`)},`,
		`\t\tnamespace: ${quoteTsString(namespace)},`,
		`\t\topenApiFile: ${quoteTsString(
			`src/ai-features/${aiFeatureSlug}/api.openapi.json`,
		)},`,
		`\t\tphpFile: ${quoteTsString(`inc/ai-features/${aiFeatureSlug}.php`)},`,
		"\t\trestManifest: defineEndpointManifest(",
		indentMultiline(JSON.stringify(manifest, null, "\t"), "\t\t\t"),
		"\t\t),",
		`\t\tslug: ${quoteTsString(aiFeatureSlug)},`,
		`\t\ttypesFile: ${quoteTsString(
			`src/ai-features/${aiFeatureSlug}/api-types.ts`,
		)},`,
		`\t\tvalidatorsFile: ${quoteTsString(
			`src/ai-features/${aiFeatureSlug}/api-validators.ts`,
		)},`,
		"\t},",
	].join("\n");
}

/**
 * Generate TypeScript request, response, and telemetry contracts for an AI feature scaffold.
 */
export function buildAiFeatureTypesSource(aiFeatureSlug: string): string {
	const pascalCase = toPascalCase(aiFeatureSlug);

	return `import { tags } from 'typia';

export interface ${pascalCase}AiFeatureRequest {
\tbrief: string & tags.MinLength< 1 > & tags.MaxLength< 4000 >;
\tcontext?: string & tags.MaxLength< 4000 >;
}

export interface ${pascalCase}AiFeatureResult {
\ttitle: string & tags.MinLength< 1 > & tags.MaxLength< 160 >;
\tsummary: string & tags.MinLength< 1 > & tags.MaxLength< 2000 >;
\tconfidence?: number & tags.Minimum< 0 > & tags.Maximum< 1 >;
}

export interface ${pascalCase}AiFeatureTokenUsage {
\tcompletionTokens: number & tags.Type< 'uint32' >;
\tpromptTokens: number & tags.Type< 'uint32' >;
\ttotalTokens: number & tags.Type< 'uint32' >;
\tthoughtTokens?: number & tags.Type< 'uint32' >;
}

export interface ${pascalCase}AiFeatureTelemetry {
\tmodelId: string & tags.MinLength< 1 > & tags.MaxLength< 160 >;
\tmodelName: string & tags.MinLength< 1 > & tags.MaxLength< 160 >;
\tproviderId: string & tags.MinLength< 1 > & tags.MaxLength< 80 >;
\tproviderName: string & tags.MinLength< 1 > & tags.MaxLength< 160 >;
\tproviderType: 'client' | 'cloud' | 'server';
\tresultId: string & tags.MinLength< 1 > & tags.MaxLength< 160 >;
\ttokenUsage: ${pascalCase}AiFeatureTokenUsage;
}

export interface ${pascalCase}AiFeatureResponse {
\tresult: ${pascalCase}AiFeatureResult;
\ttelemetry: ${pascalCase}AiFeatureTelemetry;
}

export type ${pascalCase}AiFeatureSupportProbeMode = 'request-time';

export type ${pascalCase}AiFeatureUnavailableErrorCode =
\t'ai_client_unavailable';

export type ${pascalCase}AiFeatureUnavailableReasonCode =
\t| 'missing-wordpress-ai-client'
\t| 'request-time-support-probe';

export interface ${pascalCase}AiFeatureSupportReason {
\tcode: ${pascalCase}AiFeatureUnavailableReasonCode;
\tlabel: string & tags.MinLength< 1 > & tags.MaxLength< 160 >;
\tmessage: string & tags.MinLength< 1 > & tags.MaxLength< 4000 >;
}

export interface ${pascalCase}AiFeatureSupportMetadata {
\tfeatureLabel: string & tags.MinLength< 1 > & tags.MaxLength< 160 >;
\tfeatureSlug: string & tags.MinLength< 1 > & tags.MaxLength< 160 >;
\tcompatibility: {
\t\thardMinimums: {
\t\t\tphp?: string;
\t\t\twordpress?: string;
\t\t};
\t\tmode: 'baseline' | 'optional' | 'required';
\t\toptionalFeatureIds: string[];
\t\toptionalFeatures: string[];
\t\trequiredFeatureIds: string[];
\t\trequiredFeatures: string[];
\t\truntimeGates: string[];
\t};
\tsupportProbe: {
\t\tendpointMethod: 'POST';
\t\tendpointPath: string & tags.MinLength< 1 > & tags.MaxLength< 200 >;
\t\tmode: ${pascalCase}AiFeatureSupportProbeMode;
\t\tunavailableErrorCode: ${pascalCase}AiFeatureUnavailableErrorCode;
\t};
\tunavailableReasons: ${pascalCase}AiFeatureSupportReason[];
}
`;
}

/**
 * Generate runtime validators for the AI feature request/result/response contracts.
 */
export function buildAiFeatureValidatorsSource(
	aiFeatureSlug: string,
): string {
	const pascalCase = toPascalCase(aiFeatureSlug);

	return `import typia from 'typia';

import { toValidationResult } from '@wp-typia/rest';
import type {
\t${pascalCase}AiFeatureRequest,
\t${pascalCase}AiFeatureResponse,
\t${pascalCase}AiFeatureResult,
} from './api-types';

const validateFeatureRequest = typia.createValidate< ${pascalCase}AiFeatureRequest >();
const validateFeatureResult = typia.createValidate< ${pascalCase}AiFeatureResult >();
const validateFeatureResponse = typia.createValidate< ${pascalCase}AiFeatureResponse >();

export const apiValidators = {
\tfeatureRequest: ( input: unknown ) =>
\t\ttoValidationResult< ${pascalCase}AiFeatureRequest >(
\t\t\tvalidateFeatureRequest( input )
\t\t),
\tfeatureResult: ( input: unknown ) =>
\t\ttoValidationResult< ${pascalCase}AiFeatureResult >(
\t\t\tvalidateFeatureResult( input )
\t\t),
\tfeatureResponse: ( input: unknown ) =>
\t\ttoValidationResult< ${pascalCase}AiFeatureResponse >(
\t\t\tvalidateFeatureResponse( input )
\t\t),
};
`;
}

/**
 * Generate the typed client wrapper that calls the scaffolded AI feature endpoint.
 */
export function buildAiFeatureApiSource(aiFeatureSlug: string): string {
	const pascalCase = toPascalCase(aiFeatureSlug);
	const compatibility = createScaffoldCompatibilityConfig(
		resolveScaffoldCompatibilityPolicy(
			OPTIONAL_WORDPRESS_AI_CLIENT_COMPATIBILITY,
		),
	);
	const title = toTitleCase(aiFeatureSlug);

	return `import {
\tcallEndpoint,
\tresolveRestRouteUrl,
} from '@wp-typia/rest';

import type {
\t${pascalCase}AiFeatureRequest,
\t${pascalCase}AiFeatureSupportMetadata,
} from './api-types';
import {
\trun${pascalCase}AiFeatureEndpoint,
} from './api-client';

${formatResolveRestNonceSource("spaced")}

function isPlainObject( value: unknown ): value is Record< string, unknown > {
\treturn (
\t\t!! value &&
\t\ttypeof value === 'object' &&
\t\t! Array.isArray( value )
\t);
}

export const aiFeatureRunEndpoint = {
\t...run${pascalCase}AiFeatureEndpoint,
\tbuildRequestOptions: () => {
\t\tconst nonce = resolveRestNonce();
\t\treturn {
\t\t\theaders: nonce
\t\t\t\t? {
\t\t\t\t\t'X-WP-Nonce': nonce,
\t\t\t\t}
\t\t\t\t: undefined,
\t\t\turl: resolveRestRouteUrl( run${pascalCase}AiFeatureEndpoint.path ),
\t\t};
\t},
};

export const aiFeatureSupportMetadata = {
\tcompatibility: ${JSON.stringify(compatibility, null, "\t")},
\tfeatureLabel: ${quoteTsString(title)},
\tfeatureSlug: ${quoteTsString(aiFeatureSlug)},
\tsupportProbe: {
\t\tendpointMethod: 'POST',
\t\tendpointPath: aiFeatureRunEndpoint.path,
\t\tmode: 'request-time',
\t\tunavailableErrorCode: 'ai_client_unavailable',
\t},
\tunavailableReasons: [
\t\t{
\t\t\tcode: 'missing-wordpress-ai-client',
\t\t\tlabel: 'WordPress AI Client unavailable',
\t\t\tmessage:
\t\t\t\t'This AI feature stays disabled until the WordPress AI Client is available on the site.',
\t\t},
\t\t{
\t\t\tcode: 'request-time-support-probe',
\t\t\tlabel: 'Support is checked at request time',
\t\t\tmessage:
\t\t\t\t'Support is verified when the feature runs, so editor and admin UIs should degrade gracefully when the site rejects the request.',
\t\t},
\t],
} satisfies ${pascalCase}AiFeatureSupportMetadata;

export function getAiFeatureSupportHintLines() {
\treturn aiFeatureSupportMetadata.unavailableReasons.map(
\t\t( reason ) => reason.message
\t);
}

export function isAiFeatureSupportUnavailableError( error: unknown ) {
\tif ( ! isPlainObject( error ) ) {
\t\treturn false;
\t}

\tconst data = isPlainObject( error.data ) ? error.data : undefined;
\treturn (
\t\terror.code === aiFeatureSupportMetadata.supportProbe.unavailableErrorCode ||
\t\tdata?.status === 501
\t);
}

export function resolveAiFeatureUnavailableMessage( error: unknown ) {
\tif (
\t\tisPlainObject( error ) &&
\t\ttypeof error.message === 'string' &&
\t\terror.message.length > 0
\t) {
\t\treturn error.message;
\t}

\treturn aiFeatureSupportMetadata.unavailableReasons[ 0 ]?.message ??
\t\t'This AI feature is currently unavailable.';
}

export function runAiFeature( request: ${pascalCase}AiFeatureRequest ) {
\treturn callEndpoint( aiFeatureRunEndpoint, request );
}
`;
}

/**
 * Generate React endpoint-mutation hooks for the scaffolded AI feature client wrapper.
 */
export function buildAiFeatureDataSource(aiFeatureSlug: string): string {
	const pascalCase = toPascalCase(aiFeatureSlug);

	return `import {
\tuseEndpointMutation,
\ttype UseEndpointMutationOptions,
} from '@wp-typia/rest/react';

import type {
\t${pascalCase}AiFeatureRequest,
\t${pascalCase}AiFeatureResponse,
} from './api-types';
import {
\taiFeatureRunEndpoint,
\taiFeatureSupportMetadata,
\tgetAiFeatureSupportHintLines,
\tisAiFeatureSupportUnavailableError,
\tresolveAiFeatureUnavailableMessage,
} from './api';

export type UseRun${pascalCase}AiFeatureMutationOptions =
\tUseEndpointMutationOptions<
\t\t${pascalCase}AiFeatureRequest,
\t\t${pascalCase}AiFeatureResponse,
\t\tunknown
\t>;

export function useRun${pascalCase}AiFeatureMutation(
\toptions: UseRun${pascalCase}AiFeatureMutationOptions = {}
) {
\treturn useEndpointMutation( aiFeatureRunEndpoint, options );
}

export {
\taiFeatureSupportMetadata,
\tgetAiFeatureSupportHintLines,
\tisAiFeatureSupportUnavailableError,
\tresolveAiFeatureUnavailableMessage,
};
`;
}
