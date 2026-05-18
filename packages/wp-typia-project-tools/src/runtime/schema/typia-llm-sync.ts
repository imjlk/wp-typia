import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  getOptionalNodeErrorCode,
  isFileNotFoundError,
} from '../shared/fs-async.js';
import {
  buildTypiaLlmEndpointMethodDescriptors,
  renderTypiaLlmModuleFromMethodDescriptors,
} from './typia-llm-render.js';
import type {
  GeneratedTypiaLlmArtifactFile,
  SyncTypiaLlmAdapterModuleOptions,
  SyncTypiaLlmAdapterModuleResult,
} from './typia-llm-types.js';

function normalizeGeneratedArtifactContent(content: string): string {
  return content.replace(/\r\n?/g, '\n');
}

async function reconcileGeneratedTypiaLlmArtifacts(
  artifacts: readonly GeneratedTypiaLlmArtifactFile[],
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
      `Generated typia.llm artifacts are missing or stale:\n${issues.join('\n')}`,
    );
  }
}

/**
 * Writes or verifies the generated build-time `typia.llm` adapter module. The
 * returned TypeScript source still needs to be compiled by the consuming
 * project's Typia transformer before JSON artifacts can be read from it.
 *
 * @param options Generated module destination plus render options.
 * @returns Rendered source, method descriptors, and the checked/written file path.
 */
export async function syncTypiaLlmAdapterModule({
  check = false,
  generatedSourceFile,
  ...renderOptions
}: SyncTypiaLlmAdapterModuleOptions): Promise<SyncTypiaLlmAdapterModuleResult> {
  const methodDescriptors = buildTypiaLlmEndpointMethodDescriptors(
    renderOptions.manifest,
  );
  const source = renderTypiaLlmModuleFromMethodDescriptors(
    renderOptions,
    methodDescriptors,
  );

  await reconcileGeneratedTypiaLlmArtifacts(
    [
      {
        content: source,
        filePath: generatedSourceFile,
      },
    ],
    check,
  );

  return {
    check,
    methodDescriptors,
    source,
    sourceFile: generatedSourceFile,
  };
}
