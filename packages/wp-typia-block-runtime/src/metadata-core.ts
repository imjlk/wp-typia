import type {} from './typia-tags.js';

import {
  normalizeSyncBlockMetadataFailure,
  resolveSyncBlockMetadataPaths,
} from './metadata-core-artifacts.js';
import {
  type EndpointOpenApiEndpointDefinition,
  type OpenApiInfo,
} from './schema-core.js';
import {
  syncEndpointClientModule,
} from './metadata-core-client-render.js';
import {
  syncBlockMetadataArtifacts,
  syncInnerBlocksTemplateModuleArtifacts,
  syncRestOpenApiArtifacts,
  syncTypeSchemaArtifacts,
} from './metadata-core-sync-routines.js';
export {
  defineBlockNesting,
  defineInnerBlocksTemplates,
  formatBlockPatternContentNestingDiagnostic,
  formatBlockPatternContentNestingDiagnostics,
  getInnerBlocksTemplatesFromNesting,
  renderInnerBlocksTemplateModule,
  validateBlockPatternContentNesting,
  validateInnerBlocksTemplates,
  validateBlockNestingContract,
} from './metadata-core-nesting.js';
export type {
  BlockPatternNestingDiagnostic,
  BlockPatternNestingDiagnosticCode,
  BlockPatternNestingDiagnosticSeverity,
  BlockInnerBlocksTemplate,
  BlockInnerBlocksTemplateAttributes,
  BlockInnerBlocksTemplateContract,
  BlockInnerBlocksTemplateItem,
  BlockNestingContract,
  BlockNestingRule,
  ParsedBlockPatternBlock,
  RenderInnerBlocksTemplateModuleOptions,
  ValidateBlockPatternContentNestingOptions,
  ValidateBlockPatternContentNestingResult,
  ValidateInnerBlocksTemplatesOptions,
  ValidateBlockNestingContractOptions,
} from './metadata-core-nesting.js';
import type {
  BlockInnerBlocksTemplateContract,
  BlockNestingContract,
} from './metadata-core-nesting.js';

export { resolveSyncBlockMetadataPaths };

export interface SyncBlockMetadataOptions {
  allowExternalBlockNames?: boolean;
  blockJsonFile: string;
  jsonSchemaFile?: string;
  knownBlockNames?: readonly string[];
  manifestFile?: string;
  maxRecursiveDepth?: number;
  nesting?: BlockNestingContract;
  openApiFile?: string;
  phpValidatorFile?: string;
  projectRoot?: string;
  sourceTypeName: string;
  typesFile: string;
}

export interface SyncBlockMetadataResult {
  attributeNames: string[];
  blockJsonPath: string;
  jsonSchemaPath?: string;
  lossyProjectionWarnings: string[];
  manifestPath: string;
  openApiPath?: string;
  phpGenerationWarnings: string[];
  phpValidatorPath: string;
}

export interface SyncInnerBlocksTemplateModuleOptions {
  allowExternalBlockNames?: boolean;
  exportName?: string;
  knownBlockNames?: readonly string[];
  nesting: BlockNestingContract;
  outputFile: string;
  projectRoot?: string;
  templates?: BlockInnerBlocksTemplateContract;
}

export interface SyncInnerBlocksTemplateModuleResult {
  outputPath: string;
  templateNames: string[];
}

export interface ArtifactSyncExecutionOptions {
  /**
   * Verify that generated artifacts are already current without rewriting them.
   */
  check?: boolean;
}

/**
 * High-level outcome for one `runSyncBlockMetadata()` execution.
 *
 * - `success`: metadata sync completed without warnings.
 * - `warning`: metadata sync completed, but warn-only findings were recorded.
 * - `error`: metadata sync failed, or warnings were promoted to errors by flags.
 */
export type SyncBlockMetadataStatus = 'success' | 'warning' | 'error';

/**
 * Stable failure bucket for structured `sync-types` error reporting.
 */
export type SyncBlockMetadataFailureCode =
  /** Generated artifact files are missing or stale relative to the current sources. */
  | 'stale-generated-artifact'
  /** A block nesting contract references unknown or contradictory block relationships. */
  | 'invalid-block-nesting-contract'
  /** A TypeScript node kind is not supported by the metadata parser. */
  | 'unsupported-type-node'
  /** A supported node kind was used in an unsupported pattern or combination. */
  | 'unsupported-type-pattern'
  /** Recursive type analysis was detected and aborted. */
  | 'recursive-type'
  /** The configured types file or source type could not be resolved correctly. */
  | 'invalid-source-type'
  /** TypeScript diagnostics blocked analysis before metadata generation ran. */
  | 'typescript-diagnostic'
  /** The failure did not match a more specific structured bucket. */
  | 'unknown-internal-error';

/**
 * Structured failure payload returned when `runSyncBlockMetadata()` does not complete.
 */
export interface SyncBlockMetadataFailure {
  /** Stable failure bucket suitable for branching in scripts or CI. */
  code: SyncBlockMetadataFailureCode;
  /** Human-readable error message captured from the original failure. */
  message: string;
  /** Original thrown error name when available. */
  name: string;
}

/**
 * Optional execution flags that control how warnings affect the final report status.
 */
export interface SyncBlockMetadataExecutionOptions
  extends ArtifactSyncExecutionOptions {
  /** Promote lossy WordPress projection warnings to `error` status. */
  failOnLossy?: boolean;
  /** Promote PHP validator coverage warnings to `error` status. */
  failOnPhpWarnings?: boolean;
  /**
   * Promote all warnings to `error` status.
   *
   * When `true`, this behaves like setting both `failOnLossy` and
   * `failOnPhpWarnings` to `true`.
   */
  strict?: boolean;
}

/**
 * Structured result returned by `runSyncBlockMetadata()`.
 */
export interface SyncBlockMetadataReport {
  /** Attribute keys discovered from the source type. Empty when analysis fails early. */
  attributeNames: string[];
  /** Absolute path to the generated or target `block.json`. */
  blockJsonPath: string | null;
  /** Absolute path to the generated JSON Schema file when schema output is enabled. */
  jsonSchemaPath: string | null;
  /** Warn-only notices for Typia constraints that cannot round-trip into `block.json`. */
  lossyProjectionWarnings: string[];
  /** Absolute path to the generated or target manifest file. */
  manifestPath: string | null;
  /** Absolute path to the generated aggregate OpenAPI file when enabled. */
  openApiPath: string | null;
  /** Warn-only notices for Typia constraints not yet enforced by PHP validation. */
  phpGenerationWarnings: string[];
  /** Absolute path to the generated or target PHP validator file. */
  phpValidatorPath: string | null;
  /** Structured failure payload when analysis or generation throws. */
  failure: SyncBlockMetadataFailure | null;
  /** Effective lossy-warning failure flag after `strict` has been applied. */
  failOnLossy: boolean;
  /** Effective PHP-warning failure flag after `strict` has been applied. */
  failOnPhpWarnings: boolean;
  /** Final execution status after warnings and failure handling are applied. */
  status: SyncBlockMetadataStatus;
  /** Whether the report was computed in strict mode. */
  strict: boolean;
}

export interface SyncTypeSchemaOptions {
  jsonSchemaFile: string;
  openApiFile?: string;
  openApiInfo?: OpenApiInfo;
  projectRoot?: string;
  sourceTypeName: string;
  typesFile: string;
}

export interface SyncTypeSchemaResult {
  jsonSchemaPath: string;
  openApiPath?: string;
  sourceTypeName: string;
}

/**
 * Source type mapping used by endpoint manifests and aggregate REST OpenAPI generation.
 */
export interface EndpointManifestContractDefinition {
  /** Optional component name override for the generated schema reference. */
  schemaName?: string;
  /** Type name exported from the source `typesFile`. */
  sourceTypeName: string;
}

/**
 * Portable route metadata stored in one endpoint manifest entry.
 */
export type EndpointManifestEndpointDefinition = EndpointOpenApiEndpointDefinition;

/**
 * Canonical TypeScript description of one scaffolded REST surface.
 */
export interface EndpointManifestDefinition<
  Contracts extends Readonly<
    Record<string, EndpointManifestContractDefinition>
  > = Readonly<Record<string, EndpointManifestContractDefinition>>,
  Endpoints extends readonly EndpointManifestEndpointDefinition[] =
    readonly EndpointManifestEndpointDefinition[],
> {
  /** Contract registry keyed by logical route contract ids. */
  contracts: Contracts;
  /** Route registry keyed by concrete REST path and method pairs. */
  endpoints: Endpoints;
  /** Optional document-level metadata for aggregate OpenAPI output. */
  info?: OpenApiInfo;
}

/**
 * Preserve literal TypeScript inference for backend-neutral endpoint manifests.
 *
 * @param manifest Canonical REST surface metadata authored in TypeScript.
 * @returns The same manifest object with literal contract and endpoint metadata preserved.
 */
export function defineEndpointManifest<
  const Contracts extends Readonly<
    Record<string, EndpointManifestContractDefinition>
  >,
  const Endpoints extends readonly EndpointManifestEndpointDefinition[],
>(
  manifest: EndpointManifestDefinition<Contracts, Endpoints>,
): EndpointManifestDefinition<Contracts, Endpoints> {
  return manifest;
}

/**
 * Backward-compatible source type mapping used when generating aggregate REST OpenAPI documents.
 */
export interface RestOpenApiContractDefinition extends EndpointManifestContractDefinition {}

/**
 * Backward-compatible route metadata consumed by `syncRestOpenApi()`.
 */
export type RestOpenApiEndpointDefinition = EndpointManifestEndpointDefinition;

/**
 * Shared file and project inputs for REST OpenAPI generation.
 */
interface SyncRestOpenApiBaseOptions {
  /** Output path for the aggregate OpenAPI document. */
  openApiFile: string;
  /** Optional project root used to resolve file paths. */
  projectRoot?: string;
  /** Source file that exports the REST contract types. */
  typesFile: string;
}

/**
 * Manifest-first options for writing a canonical endpoint-aware REST OpenAPI document.
 */
export interface SyncRestOpenApiManifestOptions extends SyncRestOpenApiBaseOptions {
  /** Canonical endpoint manifest describing the REST surface. */
  manifest: EndpointManifestDefinition;
  /** Not accepted when `manifest` is provided. */
  contracts?: never;
  /** Not accepted when `manifest` is provided. */
  endpoints?: never;
  /** Not accepted when `manifest` is provided. */
  openApiInfo?: never;
}

/**
 * Backward-compatible options for writing a canonical endpoint-aware REST OpenAPI document.
 */
export interface SyncRestOpenApiContractsOptions extends SyncRestOpenApiBaseOptions {
  /** Contract registry keyed by logical route contract ids. */
  contracts: Readonly<Record<string, RestOpenApiContractDefinition>>;
  /** Endpoint registry describing the REST paths, methods, and auth policies to document. */
  endpoints: readonly RestOpenApiEndpointDefinition[];
  /** Optional OpenAPI document metadata. */
  openApiInfo?: OpenApiInfo;
  /** Not accepted when `contracts` and `endpoints` are provided directly. */
  manifest?: never;
}

/**
 * Options for writing a canonical endpoint-aware REST OpenAPI document.
 */
export type SyncRestOpenApiOptions =
  | SyncRestOpenApiManifestOptions
  | SyncRestOpenApiContractsOptions;

/**
 * Result returned after writing an aggregate REST OpenAPI document.
 */
export interface SyncRestOpenApiResult {
  /** Number of endpoints included in the generated OpenAPI file. */
  endpointCount: number;
  /** Absolute path to the generated OpenAPI file. */
  openApiPath: string;
  /** Component schema names included in the generated document. */
  schemaNames: string[];
}

interface SyncEndpointClientBaseOptions {
  /** Output path for the generated portable client module. */
  clientFile: string;
  /** Optional project root used to resolve file paths. */
  projectRoot?: string;
  /** Source file that exports the endpoint contract types. */
  typesFile: string;
  /** Optional explicit path to the validator module. */
  validatorsFile?: string;
}

/**
 * Manifest-first options for writing a portable endpoint client module.
 */
export interface SyncEndpointClientOptions extends SyncEndpointClientBaseOptions {
  /** Canonical endpoint manifest describing the REST surface. */
  manifest: EndpointManifestDefinition;
}

/**
 * Result returned after writing a generated portable endpoint client module.
 */
export interface SyncEndpointClientResult {
  /** Number of endpoints included in the generated client file. */
  endpointCount: number;
  /** Absolute path to the generated client file. */
  clientPath: string;
  /** Operation ids emitted as endpoint constants and convenience wrappers. */
  operationIds: string[];
}

/**
 * Synchronizes block metadata artifacts from a source TypeScript contract.
 *
 * This updates `block.json` attributes/examples and emits the related JSON
 * Schema, manifest, OpenAPI, and optional PHP validator artifacts derived from
 * the same source type.
 *
 * @param options Configuration for locating the project root, source types
 * file/type name, and output artifact paths.
 * @returns The generated artifact paths plus any lossy WordPress projection or
 * PHP validator coverage warnings discovered during synchronization.
 */
export async function syncBlockMetadata(
  options: SyncBlockMetadataOptions,
  executionOptions: ArtifactSyncExecutionOptions = {},
): Promise<SyncBlockMetadataResult> {
  return syncBlockMetadataArtifacts(options, executionOptions);
}

/**
 * Generate and write a typed `InnerBlocks` template module from a nesting
 * contract or explicit template contract.
 *
 * @param options Nesting metadata, optional explicit templates, output path,
 * and known-block validation settings.
 * @param executionOptions Optional check-mode behavior for drift detection.
 * @returns The resolved output path and sorted generated template names.
 */
export async function syncInnerBlocksTemplateModule(
  options: SyncInnerBlocksTemplateModuleOptions,
  executionOptions: ArtifactSyncExecutionOptions = {},
): Promise<SyncInnerBlocksTemplateModuleResult> {
  return syncInnerBlocksTemplateModuleArtifacts(options, executionOptions);
}

/**
 * Execute `syncBlockMetadata()` and return a structured status report.
 *
 * This wrapper preserves the existing artifact-generation behavior while adding
 * stable status, warning, and failure metadata for scripts and CI integrations.
 * Hard analysis failures are normalized into `failure`, and warning promotion is
 * controlled by `strict`, `failOnLossy`, and `failOnPhpWarnings`.
 *
 * @param options Artifact generation inputs shared with `syncBlockMetadata()`.
 * @param executionOptions Optional warning-promotion flags for CI/reporting flows.
 * @returns A structured execution report describing generated paths, warnings, and failures.
 */
export async function runSyncBlockMetadata(
  options: SyncBlockMetadataOptions,
  executionOptions: SyncBlockMetadataExecutionOptions = {},
): Promise<SyncBlockMetadataReport> {
  const strict = executionOptions.strict === true;
  const failOnLossy = strict || executionOptions.failOnLossy === true;
  const failOnPhpWarnings = strict || executionOptions.failOnPhpWarnings === true;
  const resolvedPaths = resolveSyncBlockMetadataPaths(options);

  try {
    const result = await syncBlockMetadata(options, {
      check: executionOptions.check,
    });
    const hasLossyWarnings = result.lossyProjectionWarnings.length > 0;
    const hasPhpWarnings = result.phpGenerationWarnings.length > 0;
    const hasWarnings = hasLossyWarnings || hasPhpWarnings;
    const warningsAreErrors =
      (hasLossyWarnings && failOnLossy) || (hasPhpWarnings && failOnPhpWarnings);

    return {
      attributeNames: result.attributeNames,
      blockJsonPath: result.blockJsonPath,
      jsonSchemaPath: result.jsonSchemaPath ?? null,
      lossyProjectionWarnings: result.lossyProjectionWarnings,
      manifestPath: result.manifestPath,
      openApiPath: result.openApiPath ?? null,
      phpGenerationWarnings: result.phpGenerationWarnings,
      phpValidatorPath: result.phpValidatorPath,
      failure: null,
      failOnLossy,
      failOnPhpWarnings,
      status: warningsAreErrors ? 'error' : hasWarnings ? 'warning' : 'success',
      strict,
    };
  } catch (error) {
    return {
      attributeNames: [],
      blockJsonPath: resolvedPaths.blockJsonPath,
      jsonSchemaPath: resolvedPaths.jsonSchemaPath,
      lossyProjectionWarnings: [],
      manifestPath: resolvedPaths.manifestPath,
      openApiPath: resolvedPaths.openApiPath,
      phpGenerationWarnings: [],
      phpValidatorPath: resolvedPaths.phpValidatorPath,
      failure: normalizeSyncBlockMetadataFailure(error),
      failOnLossy,
      failOnPhpWarnings,
      status: 'error',
      strict,
    };
  }
}

export async function syncTypeSchemas(
  options: SyncTypeSchemaOptions,
  executionOptions: ArtifactSyncExecutionOptions = {},
): Promise<SyncTypeSchemaResult> {
  return syncTypeSchemaArtifacts(options, executionOptions);
}

/**
 * Generate and write a canonical OpenAPI document for scaffolded REST contracts.
 *
 * @param options Contracts, endpoint metadata, source file, and output file settings.
 * @returns Information about the generated OpenAPI document and included schema components.
 */
export async function syncRestOpenApi(
  options: SyncRestOpenApiOptions,
  executionOptions: ArtifactSyncExecutionOptions = {},
): Promise<SyncRestOpenApiResult> {
  return syncRestOpenApiArtifacts(options, executionOptions);
}

/**
 * Generate and write a manifest-first portable endpoint client module.
 *
 * @param options Manifest, source file, validator file, and output path settings.
 * @returns Information about the generated client file and emitted operation ids.
 */
export async function syncEndpointClient(
  options: SyncEndpointClientOptions,
  executionOptions: ArtifactSyncExecutionOptions = {},
): Promise<SyncEndpointClientResult> {
  return syncEndpointClientModule(options, executionOptions);
}
