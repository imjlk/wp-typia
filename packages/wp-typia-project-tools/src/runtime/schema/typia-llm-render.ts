import type {
  EndpointManifestDefinition,
  EndpointManifestEndpointDefinition,
} from '@wp-typia/block-runtime/metadata-core';

import { normalizeEndpointAuthDefinition } from './schema-core.js';
import type {
  RenderTypiaLlmModuleOptions,
  TypiaLlmEndpointMethodDescriptor,
} from './typia-llm-types.js';

const TYPESCRIPT_RESERVED_WORDS = new Set([
  'abstract',
  'any',
  'as',
  'asserts',
  'async',
  'await',
  'bigint',
  'boolean',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'constructor',
  'continue',
  'debugger',
  'declare',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'get',
  'global',
  'if',
  'implements',
  'import',
  'in',
  'infer',
  'instanceof',
  'interface',
  'is',
  'keyof',
  'let',
  'module',
  'namespace',
  'never',
  'new',
  'null',
  'number',
  'object',
  'of',
  'package',
  'private',
  'protected',
  'public',
  'readonly',
  'require',
  'return',
  'satisfies',
  'set',
  'static',
  'string',
  'super',
  'switch',
  'symbol',
  'this',
  'throw',
  'true',
  'try',
  'type',
  'typeof',
  'undefined',
  'unique',
  'unknown',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

interface EndpointInputTypeDescriptor {
  importTypeNames: string[];
  signatureTypeName: string | null;
}

function getContractSourceTypeName(
  manifest: EndpointManifestDefinition,
  endpoint: EndpointManifestEndpointDefinition,
  contractName: string,
): string {
  const contract = manifest.contracts[contractName];
  if (!contract) {
    throw new Error(
      `Endpoint "${endpoint.operationId}" references missing input contract "${contractName}".`,
    );
  }

  return contract.sourceTypeName;
}

function getEndpointInputTypeDescriptor(
  manifest: EndpointManifestDefinition,
  endpoint: EndpointManifestEndpointDefinition,
): EndpointInputTypeDescriptor {
  if (endpoint.bodyContract && endpoint.queryContract) {
    const bodyTypeName = getContractSourceTypeName(
      manifest,
      endpoint,
      endpoint.bodyContract,
    );
    const queryTypeName = getContractSourceTypeName(
      manifest,
      endpoint,
      endpoint.queryContract,
    );

    return {
      importTypeNames: [bodyTypeName, queryTypeName],
      signatureTypeName: `{ body: ${bodyTypeName}; query: ${queryTypeName} }`,
    };
  }

  const contractName =
    endpoint.method === 'GET'
      ? endpoint.queryContract ?? null
      : endpoint.bodyContract ?? endpoint.queryContract ?? null;

  if (!contractName) {
    return {
      importTypeNames: [],
      signatureTypeName: null,
    };
  }

  const sourceTypeName = getContractSourceTypeName(
    manifest,
    endpoint,
    contractName,
  );

  return {
    importTypeNames: [sourceTypeName],
    signatureTypeName: sourceTypeName,
  };
}

function getEndpointOutputTypeName(
  manifest: EndpointManifestDefinition,
  endpoint: EndpointManifestEndpointDefinition,
): string {
  const contract = manifest.contracts[endpoint.responseContract];
  if (!contract) {
    throw new Error(
      `Endpoint "${endpoint.operationId}" references missing response contract "${endpoint.responseContract}".`,
    );
  }

  return contract.sourceTypeName;
}

function escapeJsDocLine(line: string): string {
  return line.replace(/\*\//g, '* /');
}

function renderDescriptionJsDocLines(
  method: TypiaLlmEndpointMethodDescriptor,
): string[] {
  const description =
    method.description && method.description.trim().length > 0
      ? method.description
      : method.operationId;
  const descriptionLines = description
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  return (descriptionLines.length > 0
    ? descriptionLines
    : [method.operationId]
  ).map((line) => ` * ${escapeJsDocLine(line)}`);
}

function renderMethodJsDoc(method: TypiaLlmEndpointMethodDescriptor): string {
  const lines = [
    '/**',
    ...renderDescriptionJsDocLines(method),
    ' *',
    ` * REST path: ${method.method} ${method.path}`,
    ` * Auth intent: ${method.authIntent}`,
    ...(method.wordpressAuth
      ? [
          ` * WordPress auth: ${method.wordpressAuth.mechanism}${
            method.wordpressAuth.publicTokenField
              ? ` (field: ${method.wordpressAuth.publicTokenField})`
              : ''
          }`,
        ]
      : []),
    ...method.tags.map((tag) => ` * @tag ${escapeJsDocLine(tag)}`),
    ' */',
  ];

  return lines.join('\n');
}

function renderMethodSignature(method: TypiaLlmEndpointMethodDescriptor): string {
  const inputSignature =
    method.inputTypeName === null ? '' : `input: ${method.inputTypeName}`;
  const methodName =
    /^[$A-Z_][$0-9A-Z_]*$/i.test(method.operationId) &&
    !TYPESCRIPT_RESERVED_WORDS.has(method.operationId)
    ? method.operationId
    : JSON.stringify(method.operationId);

  return `${methodName}(${inputSignature}): ${method.outputTypeName};`;
}

export function renderTypiaLlmModuleFromMethodDescriptors(
  {
    applicationExportName,
    interfaceName,
    structuredOutputExportName,
    structuredOutputTypeName,
    typesImportPath,
  }: Omit<RenderTypiaLlmModuleOptions, 'manifest'>,
  methods: readonly TypiaLlmEndpointMethodDescriptor[],
): string {
  const importedTypeNames = new Set<string>([structuredOutputTypeName]);

  for (const method of methods) {
    importedTypeNames.add(method.outputTypeName);
    if (method.inputTypeImportNames) {
      for (const inputTypeImportName of method.inputTypeImportNames) {
        importedTypeNames.add(inputTypeImportName);
      }
    } else if (method.inputTypeName) {
      importedTypeNames.add(method.inputTypeName);
    }
  }

  const imports = Array.from(importedTypeNames).sort().join(',\n\t');
  const methodBlocks = methods
    .map((method) => {
      const jsDoc = renderMethodJsDoc(method)
        .split('\n')
        .map((line) => `\t${line}`)
        .join('\n');

      return `${jsDoc}\n\t${renderMethodSignature(method)}`;
    })
    .join('\n\n');

  return `import typia from "typia";
import type {
\t${imports},
} from "${typesImportPath}";

export interface ${interfaceName} {
${methodBlocks}
}

export const ${applicationExportName} =
\ttypia.llm.application<${interfaceName}>();

export const ${structuredOutputExportName} =
\ttypia.llm.structuredOutput<${structuredOutputTypeName}>();
`;
}

/**
 * Builds the generated controller method descriptors that bridge endpoint
 * manifests to `typia.llm` TypeScript interfaces.
 *
 * @param manifest Endpoint manifest that owns operation and source type names.
 * @returns Ordered method descriptors matching the manifest endpoints.
 * @throws When an endpoint has ambiguous query/body input mapping.
 * @throws When an endpoint references a missing input or output contract.
 */
export function buildTypiaLlmEndpointMethodDescriptors(
  manifest: EndpointManifestDefinition,
): TypiaLlmEndpointMethodDescriptor[] {
  return manifest.endpoints.map((endpoint) => {
    const normalizedAuth = normalizeEndpointAuthDefinition(endpoint);
    const inputTypeDescriptor = getEndpointInputTypeDescriptor(manifest, endpoint);
    const inputTypeName = inputTypeDescriptor.signatureTypeName;
    const shouldUseInlineInputImports =
      inputTypeName !== null &&
      inputTypeDescriptor.importTypeNames.length > 0 &&
      inputTypeDescriptor.importTypeNames[0] !== inputTypeName;

    return {
      authIntent: normalizedAuth.auth,
      ...(normalizedAuth.authMode ? { authMode: normalizedAuth.authMode } : {}),
      description: endpoint.summary,
      inputTypeName,
      ...(shouldUseInlineInputImports
        ? { inputTypeImportNames: inputTypeDescriptor.importTypeNames }
        : {}),
      method: endpoint.method,
      operationId: endpoint.operationId,
      outputTypeName: getEndpointOutputTypeName(manifest, endpoint),
      path: endpoint.path,
      tags: endpoint.tags ?? [],
      ...(normalizedAuth.wordpressAuth
        ? { wordpressAuth: normalizedAuth.wordpressAuth }
        : {}),
    };
  });
}

/**
 * Renders a build-time-only TypeScript module that invokes `typia.llm` against
 * canonical manifest-owned contracts.
 *
 * @param options Render options for the generated adapter module.
 * @returns The generated TypeScript source.
 */
export function renderTypiaLlmModule({
  applicationExportName,
  interfaceName,
  manifest,
  structuredOutputExportName,
  structuredOutputTypeName,
  typesImportPath,
}: RenderTypiaLlmModuleOptions): string {
  return renderTypiaLlmModuleFromMethodDescriptors(
    {
      applicationExportName,
      interfaceName,
      structuredOutputExportName,
      structuredOutputTypeName,
      typesImportPath,
    },
    buildTypiaLlmEndpointMethodDescriptors(manifest),
  );
}
