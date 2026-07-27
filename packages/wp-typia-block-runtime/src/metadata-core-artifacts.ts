import * as fs from 'node:fs';
import * as path from 'node:path';

import { getTaggedSyncBlockMetadataFailureCode } from './metadata-analysis.js';
import type {
  ArtifactSyncExecutionOptions,
  SyncBlockMetadataFailure,
  SyncBlockMetadataFailureCode,
  SyncBlockMetadataOptions,
} from './metadata-core.js';

export interface ResolvedSyncBlockMetadataPaths {
  blockJsonPath: string;
  jsonSchemaPath: string | null;
  manifestPath: string;
  openApiPath: string | null;
  phpValidatorPath: string;
  projectRoot: string;
}

export interface GeneratedArtifactFile {
  content: string;
  path: string;
}

export interface GeneratedArtifactDriftIssue {
  path: string;
  reason: 'missing' | 'stale';
}

export class GeneratedArtifactDriftError extends Error {
  readonly issues: GeneratedArtifactDriftIssue[];

  constructor(issues: GeneratedArtifactDriftIssue[]) {
    const detail = issues
      .map((issue) => `- ${issue.path} (${issue.reason})`)
      .join('\n');

    super(`Generated artifacts are missing or stale:\n${detail}`);
    this.name = 'GeneratedArtifactDriftError';
    this.issues = issues;
  }
}

export function reconcileGeneratedArtifacts(
  artifacts: readonly GeneratedArtifactFile[],
  executionOptions: ArtifactSyncExecutionOptions | undefined,
  preexistingIssues: GeneratedArtifactDriftIssue[] = [],
): void {
  if (executionOptions?.check !== true) {
    for (const artifact of artifacts) {
      fs.mkdirSync(path.dirname(artifact.path), { recursive: true });
      fs.writeFileSync(artifact.path, artifact.content, 'utf8');
    }

    return;
  }

  const issues = [...preexistingIssues];

  for (const artifact of artifacts) {
    if (!fs.existsSync(artifact.path)) {
      issues.push({
        path: artifact.path,
        reason: 'missing',
      });
      continue;
    }

    const currentContent = fs.readFileSync(artifact.path, 'utf8');
    if (
      normalizeGeneratedArtifactContentForComparison(currentContent) !==
      normalizeGeneratedArtifactContentForComparison(artifact.content)
    ) {
      issues.push({
        path: artifact.path,
        reason: 'stale',
      });
    }
  }

  if (issues.length > 0) {
    throw new GeneratedArtifactDriftError(issues);
  }
}

export function resolveSyncBlockMetadataPaths(
  options: SyncBlockMetadataOptions,
): ResolvedSyncBlockMetadataPaths {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const blockJsonPath = path.resolve(projectRoot, options.blockJsonFile);
  const manifestRelativePath =
    options.manifestFile ??
    path.join(path.dirname(options.blockJsonFile), 'typia.manifest.json');
  const manifestPath = path.resolve(projectRoot, manifestRelativePath);
  const phpValidatorPath = path.resolve(
    projectRoot,
    options.phpValidatorFile ??
      path.join(path.dirname(manifestRelativePath), 'typia-validator.php'),
  );

  return {
    blockJsonPath,
    jsonSchemaPath: options.jsonSchemaFile
      ? path.resolve(projectRoot, options.jsonSchemaFile)
      : null,
    manifestPath,
    openApiPath: options.openApiFile
      ? path.resolve(projectRoot, options.openApiFile)
      : null,
    phpValidatorPath,
    projectRoot,
  };
}

export function normalizeSyncBlockMetadataFailure(
  error: unknown,
): SyncBlockMetadataFailure {
  if (error instanceof Error) {
    return {
      code: resolveSyncBlockMetadataFailureCode(error),
      message: error.message,
      name: error.name,
    };
  }

  return {
    code: 'unknown-internal-error',
    message: String(error),
    name: 'NonErrorThrow',
  };
}

function normalizeGeneratedArtifactContentForComparison(content: string): string {
  return content.replace(/\r\n?/g, '\n');
}

function resolveSyncBlockMetadataFailureCode(
  error: Error,
): SyncBlockMetadataFailureCode {
  if (error instanceof GeneratedArtifactDriftError) {
    return 'stale-generated-artifact';
  }

  const taggedCode = getTaggedSyncBlockMetadataFailureCode(error);
  if (taggedCode) {
    return taggedCode;
  }

  const { message } = error;
  if (message.startsWith('Unsupported type node at ')) {
    return 'unsupported-type-node';
  }
  if (
    message.startsWith('Recursive types are not supported:') ||
    message.startsWith('Recursive type')
  ) {
    return 'recursive-type';
  }
  if (
    message.startsWith('Invalid block nesting contract:') ||
    message.includes('before applying block nesting metadata')
  ) {
    return 'invalid-block-nesting-contract';
  }
  if (
    message.startsWith('Unable to load types file:') ||
    message.startsWith('Unable to find source type "') ||
    message.startsWith('Unable to resolve type reference "') ||
    message.includes('must resolve to an object shape')
  ) {
    return 'invalid-source-type';
  }
  if (
    message.startsWith('Unsupported ') ||
    message.startsWith('Mixed primitive enums are not supported at ') ||
    message.startsWith('Indexed access ') ||
    message.startsWith('Intersection at ') ||
    message.startsWith('WordPress extraction ') ||
    message.startsWith('Generic type declarations are not supported at ') ||
    message.startsWith('Generic type references are not supported at ') ||
    message.startsWith('Class and enum references are not supported at ') ||
    message.startsWith('Discriminated union at ') ||
    message.startsWith('External or non-serializable ') ||
    message.startsWith('Conflicting ') ||
    message.startsWith('Tag "') ||
    message.startsWith(
      'Only object-like interface extensions are supported:',
    ) ||
    message.startsWith('Array type is missing an item type at ')
  ) {
    return 'unsupported-type-pattern';
  }
  if (
    message.includes('error TS') ||
    message.includes('TypeScript diagnostics')
  ) {
    return 'typescript-diagnostic';
  }

  return 'unknown-internal-error';
}
