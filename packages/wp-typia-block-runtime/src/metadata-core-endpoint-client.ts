import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  EndpointManifestContractDefinition,
  EndpointManifestDefinition,
  SyncEndpointClientOptions,
  SyncRestOpenApiOptions,
} from './metadata-core.js';

export interface NormalizedSyncRestOpenApiOptions {
  manifest: EndpointManifestDefinition;
  openApiPath: string;
  projectRoot: string;
  typesFile: string;
}

export interface NormalizedSyncEndpointClientOptions {
  clientPath: string;
  manifest: EndpointManifestDefinition;
  projectRoot: string;
  typesFile: string;
  validatorsFile: string;
}

export function normalizeSyncRestOpenApiOptions(
  options: SyncRestOpenApiOptions,
): NormalizedSyncRestOpenApiOptions {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const openApiPath = path.resolve(projectRoot, options.openApiFile);

  if ('manifest' in options) {
    const hasDecomposedInputs =
      'contracts' in options ||
      'endpoints' in options ||
      'openApiInfo' in options;
    if (hasDecomposedInputs) {
      throw new Error(
        'syncRestOpenApi() accepts either { manifest, ... } or { contracts, endpoints, ... }, but not both.',
      );
    }
    if (options.manifest == null) {
      throw new Error(
        'syncRestOpenApi() requires a manifest object when using { manifest, ... }.',
      );
    }

    return {
      manifest: options.manifest,
      openApiPath,
      projectRoot,
      typesFile: options.typesFile,
    };
  }

  return {
    manifest: {
      contracts: options.contracts,
      endpoints: options.endpoints,
      ...(options.openApiInfo ? { info: options.openApiInfo } : {}),
    },
    openApiPath,
    projectRoot,
    typesFile: options.typesFile,
  };
}

export function normalizeSyncEndpointClientOptions(
  options: SyncEndpointClientOptions,
): NormalizedSyncEndpointClientOptions {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const clientPath = path.resolve(projectRoot, options.clientFile);
  const typesFile = path.resolve(projectRoot, options.typesFile);
  const inferredValidatorsFile =
    options.validatorsFile ??
    (() => {
      const nextPath = options.typesFile.replace(/api-types\.ts$/u, 'api-validators.ts');
      if (nextPath === options.typesFile) {
        throw new Error(
          'syncEndpointClient() could not infer validatorsFile from typesFile; pass validatorsFile explicitly.',
        );
      }

      return nextPath;
    })();
  const validatorsFile = path.resolve(projectRoot, inferredValidatorsFile);

  if (!fs.existsSync(typesFile)) {
    throw new Error(`Unable to generate an endpoint client because the types file does not exist: ${typesFile}`);
  }
  if (!fs.existsSync(validatorsFile)) {
    throw new Error(
      `Unable to generate an endpoint client because the validators file does not exist: ${validatorsFile}`,
    );
  }

  return {
    clientPath,
    manifest: options.manifest,
    projectRoot,
    typesFile: options.typesFile,
    validatorsFile: path.relative(projectRoot, validatorsFile),
  };
}

export function resolveEndpointClientContract(
  manifest: EndpointManifestDefinition,
  contractKey: string,
  operationId: string,
  fieldName: 'bodyContract' | 'queryContract' | 'responseContract',
): EndpointManifestContractDefinition {
  const contract = manifest.contracts[contractKey];
  if (!contract) {
    throw new Error(
      `Endpoint "${operationId}" references missing ${fieldName} "${contractKey}" while generating the endpoint client.`,
    );
  }

  return contract;
}

export function toValidatorAccessExpression(
  contractKey: string,
  seenPropertyNames: Map<string, string>,
): string {
  const propertyName = toClientPropertyName(contractKey);
  const previousContractKey = seenPropertyNames.get(propertyName);

  if (previousContractKey && previousContractKey !== contractKey) {
    throw new Error(
      `Contract keys "${previousContractKey}" and "${contractKey}" both normalize to apiValidators[${toJavaScriptStringLiteral(
        propertyName,
      )}] while generating the endpoint client.`,
    );
  }

  seenPropertyNames.set(propertyName, contractKey);
  return /^[$A-Z_][0-9A-Z_$]*$/iu.test(propertyName)
    ? `apiValidators.${propertyName}`
    : `apiValidators[${toJavaScriptStringLiteral(propertyName)}]`;
}

export function toModuleImportPath(fromFile: string, targetFile: string): string {
  let relativePath = path.relative(path.dirname(fromFile), targetFile).replace(/\\/g, '/');
  if (!relativePath.startsWith('.')) {
    relativePath = `./${relativePath}`;
  }

  return relativePath.replace(/\.[^.]+$/u, '');
}

export function toJavaScriptStringLiteral(value: string): string {
  return `'${value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}'`;
}

const RESERVED_CLIENT_IDENTIFIERS = new Set([
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
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
  'function',
  'if',
  'implements',
  'import',
  'in',
  'interface',
  'instanceof',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

export function assertValidClientIdentifier(value: string, label: string): void {
  if (!/^[$A-Z_][0-9A-Z_$]*$/iu.test(value)) {
    throw new Error(
      `Generated endpoint client ${label} "${value}" is not a valid JavaScript identifier.`,
    );
  }
  if (RESERVED_CLIENT_IDENTIFIERS.has(value)) {
    throw new Error(
      `Generated endpoint client ${label} "${value}" is a reserved JavaScript identifier.`,
    );
  }
}

export function reserveUniqueClientTypeIdentifier(
  preferred: string,
  occupied: Set<string>,
): string {
  let suffix = 0;

  while (true) {
    const candidate =
      suffix === 0
        ? preferred
        : suffix === 1
          ? `${preferred}Alias`
          : `${preferred}Alias${suffix}`;
    if (!occupied.has(candidate) && !RESERVED_CLIENT_IDENTIFIERS.has(candidate)) {
      assertValidClientIdentifier(candidate, 'type alias');
      occupied.add(candidate);
      return candidate;
    }
    suffix += 1;
  }
}

function toClientPropertyName(value: string): string {
  return value
    .replace(/[^A-Za-z0-9]+(.)/g, (_match, next: string) => next.toUpperCase())
    .replace(/[^A-Za-z0-9]+$/g, '')
    .replace(/^[A-Z]/, (match) => match.toLowerCase());
}
