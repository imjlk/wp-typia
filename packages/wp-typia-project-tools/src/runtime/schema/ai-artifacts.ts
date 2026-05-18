import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ArtifactSyncExecutionOptions } from '@wp-typia/block-runtime/metadata-core';

import {
  buildWordPressAiArtifacts,
  type ProjectedWordPressAbilitiesDocument,
} from './wordpress-ai.js';
import {
  getOptionalNodeErrorCode,
  isFileNotFoundError,
} from '../shared/fs-async.js';

export {
  buildWordPressAiArtifacts,
  buildWordPressAbilitiesDocument,
  projectWordPressAiSchema,
} from './wordpress-ai.js';
export type {
  AbilityAnnotationSpec,
  AbilityCategorySpec,
  AbilityMcpProjectionSpec,
  AbilityMetaSpec,
  AbilitySpec,
  AbilitySpecCatalog,
  ProjectedWordPressAbilityDefinition,
  ProjectedWordPressAbilitiesDocument,
  WordPressAiInputSchemaTransformContext,
} from './wordpress-ai.js';

type BuildWordPressAiArtifactsParameters = Parameters<
  typeof buildWordPressAiArtifacts
>[0];

/**
 * Configures where the generated WordPress AI artifacts should be written or
 * verified on disk.
 */
export interface SyncWordPressAiArtifactsOptions
  extends ArtifactSyncExecutionOptions, BuildWordPressAiArtifactsParameters {
  /** Destination path for the generated `*.abilities.json` document. */
  abilitiesDocumentFile: string;
  /** Destination path for the generated `*.ai.schema.json` document. */
  aiSchemaFile: string;
}

/**
 * Describes the generated artifact payloads and the file paths they were
 * written to or verified against.
 */
export interface SyncWordPressAiArtifactsResult {
  /** Generated abilities document content. */
  abilitiesDocument: ProjectedWordPressAbilitiesDocument;
  /** Destination path for the generated abilities document. */
  abilitiesDocumentPath: string;
  /** Generated AI response schema content. */
  aiResponseSchema: Record<string, unknown>;
  /** Destination path for the generated AI response schema. */
  aiSchemaPath: string;
  /** True when files were only verified, false when they were written. */
  check: boolean;
}

type GeneratedAiArtifactFile = {
  content: string;
  filePath: string;
};

function normalizeGeneratedArtifactContent(content: string): string {
  return content.replace(/\r\n?/g, '\n');
}

async function reconcileGeneratedAiArtifacts(
  artifacts: readonly GeneratedAiArtifactFile[],
  check: boolean,
): Promise<void> {
  if (!check) {
    for (const artifact of artifacts) {
      await mkdir(path.dirname(artifact.filePath), {
        recursive: true,
      });
      await writeFile(artifact.filePath, artifact.content, 'utf8');
    }

    return;
  }

  const issues: string[] = [];

  for (const artifact of artifacts) {
    try {
      const current = normalizeGeneratedArtifactContent(
        await readFile(artifact.filePath, 'utf8'),
      );
      const expected = normalizeGeneratedArtifactContent(artifact.content);
      if (current !== expected) {
        issues.push(`- ${artifact.filePath} (stale)`);
      }
    } catch (error) {
      if (isFileNotFoundError(error)) {
        issues.push(`- ${artifact.filePath} (missing)`);
        continue;
      }

      const code = getOptionalNodeErrorCode(error);
      issues.push(
        `- ${artifact.filePath} (unreadable: ${error instanceof Error ? error.message : code ?? 'unknown'})`,
      );
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `Generated WordPress AI artifacts are missing or stale:\n${issues.join('\n')}`,
    );
  }
}

/**
 * Builds WordPress AI artifact documents from a manifest-first contract surface
 * and then writes or verifies the generated JSON files on disk.
 *
 * @param options Artifact destinations plus the same manifest/category/schema inputs used by `buildWordPressAiArtifacts()`.
 * @returns Generated documents and the output file paths that were checked or written.
 */
export async function syncWordPressAiArtifacts({
  abilitiesDocumentFile,
  aiSchemaFile,
  check = false,
  ...buildOptions
}: SyncWordPressAiArtifactsOptions): Promise<SyncWordPressAiArtifactsResult> {
  const { abilitiesDocument, aiResponseSchema } =
    await buildWordPressAiArtifacts(buildOptions);

  await reconcileGeneratedAiArtifacts(
    [
      {
        content: `${JSON.stringify(aiResponseSchema, null, 2)}\n`,
        filePath: aiSchemaFile,
      },
      {
        content: `${JSON.stringify(abilitiesDocument, null, 2)}\n`,
        filePath: abilitiesDocumentFile,
      },
    ],
    check,
  );

  return {
    abilitiesDocument,
    abilitiesDocumentPath: abilitiesDocumentFile,
    aiResponseSchema,
    aiSchemaPath: aiSchemaFile,
    check,
  };
}
