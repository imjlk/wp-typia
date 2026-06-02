import type { RuntimeCompletionPayload } from './types';
import { stripLeadingOutputMarker } from '../output-markers';
import { buildInitCompletionPayload } from './init';
import type {
  SerializableCompletionPayload,
  StructuredCompletionSuccessPayload,
  StructuredInitPlan,
  StructuredInitSuccessPayload,
} from './types';

function toNonEmptyArray(values: string[] | undefined): string[] | undefined {
  return values && values.length > 0 ? values : undefined;
}

function extractPlannedFiles(
  payload: SerializableCompletionPayload,
): string[] | undefined {
  const files = payload.optionalLines
    ?.map((line) => line.match(/^(?:delete|update|write)\s+(.+)$/u)?.[1])
    .filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );

  return toNonEmptyArray(files);
}

const PROJECT_DIRECTORY_SUMMARY_PREFIX = 'Project directory: ';

/**
 * Reads the normalized workspace path from a completion summary when present.
 *
 * @param completion Completion payload returned by an add/create runtime.
 * @returns The runtime-resolved project directory, or undefined when absent.
 */
export function extractCompletionProjectDir(
  completion: RuntimeCompletionPayload | void,
): string | undefined {
  const projectDir = completion?.summaryLines
    ?.find((line) => line.startsWith(PROJECT_DIRECTORY_SUMMARY_PREFIX))
    ?.slice(PROJECT_DIRECTORY_SUMMARY_PREFIX.length)
    .trim();

  return projectDir && projectDir.length > 0 ? projectDir : undefined;
}

/**
 * Converts a completion payload into a JSON-safe shape without terminal markers.
 *
 * @param payload Human-readable completion payload.
 * @returns A marker-free payload suitable for structured CLI success output.
 */
export function serializeCompletionPayload(
  payload: RuntimeCompletionPayload,
): SerializableCompletionPayload {
  return {
    nextSteps: toNonEmptyArray(payload.nextSteps),
    optionalLines: toNonEmptyArray(payload.optionalLines),
    optionalNote: payload.optionalNote,
    optionalTitle: payload.optionalTitle,
    preambleLines: toNonEmptyArray(payload.preambleLines),
    summaryLines: toNonEmptyArray(payload.summaryLines),
    title: stripLeadingOutputMarker(payload.title),
    warningLines: toNonEmptyArray(payload.warningLines),
  };
}

/**
 * Wraps structured completion data in the same success envelope used by JSON CLI output.
 *
 * @param command Command name that produced the completion payload.
 * @param completion Completion payload returned by the runtime bridge.
 * @param metadata Additional command-specific fields for automation.
 * @returns JSON-serializable success payload.
 */
export function buildStructuredCompletionSuccessPayload(
  command: string,
  completion: RuntimeCompletionPayload | void,
  metadata: Record<string, unknown> = {},
): StructuredCompletionSuccessPayload {
  const serializedCompletion = completion
    ? serializeCompletionPayload(completion)
    : undefined;

  return {
    ok: true,
    data: {
      ...metadata,
      command,
      ...(serializedCompletion
        ? {
            completion: serializedCompletion,
            files: extractPlannedFiles(serializedCompletion),
          }
        : {}),
    },
  };
}

export function buildStructuredInitSuccessPayload(
  plan: StructuredInitPlan,
): StructuredInitSuccessPayload {
  const completion = serializeCompletionPayload(
    buildInitCompletionPayload(plan),
  );
  const files = Array.from(
    new Set([
      ...plan.plannedFiles.map((filePlan) => filePlan.path),
      ...(plan.commandMode === 'preview-only' ? plan.generatedArtifacts : []),
    ]),
  );

  return {
    ok: true,
    data: {
      command: 'init',
      completion,
      detectedLayout: plan.detectedLayout,
      files: toNonEmptyArray(files),
      mode: plan.commandMode === 'apply' ? 'apply' : 'preview',
      packageManager: plan.packageManager,
      plan,
      projectDir: plan.projectDir,
      status: plan.status,
      summary: plan.summary,
    },
  };
}
