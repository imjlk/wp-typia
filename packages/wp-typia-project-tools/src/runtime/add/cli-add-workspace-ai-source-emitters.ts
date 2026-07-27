import { quoteTsString } from './cli-add-shared.js';
import { buildAiFeatureEndpointManifest } from './ai-feature-artifacts.js';
import {
  OPTIONAL_WORDPRESS_AI_CLIENT_COMPATIBILITY,
  renderScaffoldCompatibilityConfig,
  resolveScaffoldCompatibilityPolicy,
} from '../templates/scaffold-compatibility.js';
import {
  formatResolveRestNonceSource,
  indentMultiline,
} from './cli-add-workspace-rest-source-utils.js';
import { toPascalCase, toTitleCase } from '../shared/string-case.js';
import { renderTypeScriptValue } from '../shared/ts-string-literals.js';

export {
  buildAiFeatureSyncScriptSource,
} from './cli-add-workspace-ai-sync-script-source.js';

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
    '  {',
    `    aiSchemaFile: ${quoteTsString(
      `src/ai-features/${aiFeatureSlug}/ai-schemas/feature-result.ai.schema.json`,
    )},`,
    `    apiFile: ${quoteTsString(`src/ai-features/${aiFeatureSlug}/api.ts`)},`,
    `    clientFile: ${quoteTsString(
      `src/ai-features/${aiFeatureSlug}/api-client.ts`,
    )},`,
    `    compatibility: ${renderScaffoldCompatibilityConfig(
      compatibilityPolicy,
    )},`,
    `    dataFile: ${quoteTsString(`src/ai-features/${aiFeatureSlug}/data.ts`)},`,
    `    namespace: ${quoteTsString(namespace)},`,
    `    openApiFile: ${quoteTsString(
      `src/ai-features/${aiFeatureSlug}/api.openapi.json`,
    )},`,
    `    phpFile: ${quoteTsString(`inc/ai-features/${aiFeatureSlug}.php`)},`,
    '    restManifest: defineEndpointManifest(',
    indentMultiline(`${renderTypeScriptValue(manifest)},`, '      '),
    '    ),',
    `    slug: ${quoteTsString(aiFeatureSlug)},`,
    `    typesFile: ${quoteTsString(
      `src/ai-features/${aiFeatureSlug}/api-types.ts`,
    )},`,
    `    validatorsFile: ${quoteTsString(
      `src/ai-features/${aiFeatureSlug}/api-validators.ts`,
    )},`,
    '  },',
  ].join('\n');
}

/**
 * Generate TypeScript request, response, and telemetry contracts for an AI feature scaffold.
 */
export function buildAiFeatureTypesSource(aiFeatureSlug: string): string {
  const pascalCase = toPascalCase(aiFeatureSlug);

  return `import { tags } from 'typia';

export interface ${pascalCase}AiFeatureRequest {
  brief: string & tags.MinLength<1> & tags.MaxLength<4000>;
  context?: string & tags.MaxLength<4000>;
}

export interface ${pascalCase}AiFeatureResult {
  title: string & tags.MinLength<1> & tags.MaxLength<160>;
  summary: string & tags.MinLength<1> & tags.MaxLength<2000>;
  confidence?: number & tags.Minimum<0> & tags.Maximum<1>;
}

export interface ${pascalCase}AiFeatureTokenUsage {
  completionTokens: number & tags.Type<'uint32'>;
  promptTokens: number & tags.Type<'uint32'>;
  totalTokens: number & tags.Type<'uint32'>;
  thoughtTokens?: number & tags.Type<'uint32'>;
}

export interface ${pascalCase}AiFeatureTelemetry {
  modelId: string & tags.MinLength<1> & tags.MaxLength<160>;
  modelName: string & tags.MinLength<1> & tags.MaxLength<160>;
  providerId: string & tags.MinLength<1> & tags.MaxLength<80>;
  providerName: string & tags.MinLength<1> & tags.MaxLength<160>;
  providerType: 'client' | 'cloud' | 'server';
  resultId: string & tags.MinLength<1> & tags.MaxLength<160>;
  tokenUsage: ${pascalCase}AiFeatureTokenUsage;
}

export interface ${pascalCase}AiFeatureResponse {
  result: ${pascalCase}AiFeatureResult;
  telemetry: ${pascalCase}AiFeatureTelemetry;
}

export type ${pascalCase}AiFeatureSupportProbeMode = 'request-time';

export type ${pascalCase}AiFeatureUnavailableErrorCode =
  'ai_client_unavailable';

export type ${pascalCase}AiFeatureUnavailableReasonCode =
  | 'missing-wordpress-ai-client'
  | 'request-time-support-probe';

export interface ${pascalCase}AiFeatureSupportReason {
  code: ${pascalCase}AiFeatureUnavailableReasonCode;
  label: string & tags.MinLength<1> & tags.MaxLength<160>;
  message: string & tags.MinLength<1> & tags.MaxLength<4000>;
}

export interface ${pascalCase}AiFeatureSupportMetadata {
  featureLabel: string & tags.MinLength<1> & tags.MaxLength<160>;
  featureSlug: string & tags.MinLength<1> & tags.MaxLength<160>;
  compatibility: {
    hardMinimums: {
      php?: string;
      wordpress?: string;
    };
    mode: 'baseline' | 'optional' | 'required';
    optionalFeatureIds: string[];
    optionalFeatures: string[];
    requiredFeatureIds: string[];
    requiredFeatures: string[];
    runtimeGates: string[];
  };
  supportProbe: {
    endpointMethod: 'POST';
    endpointPath: string & tags.MinLength<1> & tags.MaxLength<200>;
    mode: ${pascalCase}AiFeatureSupportProbeMode;
    unavailableErrorCode: ${pascalCase}AiFeatureUnavailableErrorCode;
  };
  unavailableReasons: ${pascalCase}AiFeatureSupportReason[];
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
  ${pascalCase}AiFeatureRequest,
  ${pascalCase}AiFeatureResponse,
  ${pascalCase}AiFeatureResult,
} from './api-types';

const validateFeatureRequest =
  typia.createValidate<${pascalCase}AiFeatureRequest>();
const validateFeatureResult =
  typia.createValidate<${pascalCase}AiFeatureResult>();
const validateFeatureResponse =
  typia.createValidate<${pascalCase}AiFeatureResponse>();

export const apiValidators = {
  featureRequest: (input: unknown) =>
    toValidationResult<${pascalCase}AiFeatureRequest>(
      validateFeatureRequest(input),
    ),
  featureResult: (input: unknown) =>
    toValidationResult<${pascalCase}AiFeatureResult>(
      validateFeatureResult(input),
    ),
  featureResponse: (input: unknown) =>
    toValidationResult<${pascalCase}AiFeatureResponse>(
      validateFeatureResponse(input),
    ),
};
`;
}

/**
 * Generate the typed client wrapper that calls the scaffolded AI feature endpoint.
 */
export function buildAiFeatureApiSource(aiFeatureSlug: string): string {
  const pascalCase = toPascalCase(aiFeatureSlug);
  const compatibilitySource = renderScaffoldCompatibilityConfig(
    resolveScaffoldCompatibilityPolicy(
      OPTIONAL_WORDPRESS_AI_CLIENT_COMPATIBILITY,
    ),
    '  ',
  );
  const title = toTitleCase(aiFeatureSlug);

  return `import { callEndpoint, resolveRestRouteUrl } from '@wp-typia/rest';

import type {
  ${pascalCase}AiFeatureRequest,
  ${pascalCase}AiFeatureSupportMetadata,
} from './api-types';
import { run${pascalCase}AiFeatureEndpoint } from './api-client';

${formatResolveRestNonceSource()}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export const aiFeatureRunEndpoint = {
  ...run${pascalCase}AiFeatureEndpoint,
  buildRequestOptions: () => {
    const nonce = resolveRestNonce();
    return {
      headers: nonce
        ? {
            'X-WP-Nonce': nonce,
          }
        : undefined,
      url: resolveRestRouteUrl(run${pascalCase}AiFeatureEndpoint.path),
    };
  },
};

export const aiFeatureSupportMetadata = {
  compatibility: ${compatibilitySource},
  featureLabel: ${quoteTsString(title)},
  featureSlug: ${quoteTsString(aiFeatureSlug)},
  supportProbe: {
    endpointMethod: 'POST',
    endpointPath: aiFeatureRunEndpoint.path,
    mode: 'request-time',
    unavailableErrorCode: 'ai_client_unavailable',
  },
  unavailableReasons: [
    {
      code: 'missing-wordpress-ai-client',
      label: 'WordPress AI Client unavailable',
      message:
        'This AI feature stays disabled until the WordPress AI Client is available on the site.',
    },
    {
      code: 'request-time-support-probe',
      label: 'Support is checked at request time',
      message:
        'Support is verified when the feature runs, so editor and admin UIs should degrade gracefully when the site rejects the request.',
    },
  ],
} satisfies ${pascalCase}AiFeatureSupportMetadata;

export function getAiFeatureSupportHintLines() {
  return aiFeatureSupportMetadata.unavailableReasons.map(
    (reason) => reason.message,
  );
}

export function isAiFeatureSupportUnavailableError(error: unknown) {
  if (!isPlainObject(error)) {
    return false;
  }

  const data = isPlainObject(error.data) ? error.data : undefined;
  return (
    error.code === aiFeatureSupportMetadata.supportProbe.unavailableErrorCode ||
    data?.status === 501
  );
}

export function resolveAiFeatureUnavailableMessage(error: unknown) {
  if (
    isPlainObject(error) &&
    typeof error.message === 'string' &&
    error.message.length > 0
  ) {
    return error.message;
  }

  return (
    aiFeatureSupportMetadata.unavailableReasons[0]?.message ??
    'This AI feature is currently unavailable.'
  );
}

export function runAiFeature(request: ${pascalCase}AiFeatureRequest) {
  return callEndpoint(aiFeatureRunEndpoint, request);
}
`;
}

/**
 * Generate React endpoint-mutation hooks for the scaffolded AI feature client wrapper.
 */
export function buildAiFeatureDataSource(aiFeatureSlug: string): string {
  const pascalCase = toPascalCase(aiFeatureSlug);

  return `import {
  useEndpointMutation,
  type UseEndpointMutationOptions,
} from '@wp-typia/rest/react';

import type {
  ${pascalCase}AiFeatureRequest,
  ${pascalCase}AiFeatureResponse,
} from './api-types';
import {
  aiFeatureRunEndpoint,
  aiFeatureSupportMetadata,
  getAiFeatureSupportHintLines,
  isAiFeatureSupportUnavailableError,
  resolveAiFeatureUnavailableMessage,
} from './api';

export type UseRun${pascalCase}AiFeatureMutationOptions =
  UseEndpointMutationOptions<
    ${pascalCase}AiFeatureRequest,
    ${pascalCase}AiFeatureResponse,
    unknown
  >;

export function useRun${pascalCase}AiFeatureMutation(
  options: UseRun${pascalCase}AiFeatureMutationOptions = {},
) {
  return useEndpointMutation(aiFeatureRunEndpoint, options);
}

export {
  aiFeatureSupportMetadata,
  getAiFeatureSupportHintLines,
  isAiFeatureSupportUnavailableError,
  resolveAiFeatureUnavailableMessage,
};
`;
}
