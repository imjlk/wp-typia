import packageJson from '../../package.json';
import {
  formatPackageExecCommand,
  inferPackageManagerId,
  type PackageManagerId,
} from '@wp-typia/project-tools/package-managers';
import {
  buildAddKindCompletionDetails,
  type AddKindId,
} from '../add-kind-registry';
import type { RuntimeCompletionPayload } from './types';
import {
  formatOutputMarker,
  stripLeadingOutputMarker,
  type OutputMarkerOptions,
} from '../output-markers';

/**
 * Builds the completion payload shown after an add flow succeeds.
 *
 * @param options Add-flow kind plus normalized values to summarize.
 * @returns A structured runtime completion payload.
 */
export function buildAddCompletionPayload(
  options: {
    kind: AddKindId;
    packageManager?: PackageManagerId;
    projectDir: string;
    values: Record<string, string>;
    warnings?: string[];
  },
  markerOptions?: OutputMarkerOptions,
): RuntimeCompletionPayload {
  const verificationLines = [
    formatPackageExecCommand(
      options.packageManager ?? inferPackageManagerId(options.projectDir),
      `wp-typia@${packageJson.version}`,
      'doctor',
    ),
  ];
  const verificationNote =
    'Run doctor via your package manager for a quick inventory and generated-artifact check after the add workflow.';
  const completion = buildAddKindCompletionDetails(options.kind, {
    projectDir: options.projectDir,
    values: options.values,
  });

  return {
    nextSteps: completion.nextSteps,
    optionalLines: verificationLines,
    optionalNote: verificationNote,
    optionalTitle: 'Verify workspace health (optional):',
    summaryLines: completion.summaryLines,
    title: formatOutputMarker('success', completion.title, markerOptions),
    warningLines: options.warnings,
  };
}

/**
 * Builds the completion payload shown after a dry-run add flow succeeds.
 *
 * @param options Existing add completion metadata plus the planned file updates.
 * @returns A structured runtime completion payload.
 */
export function buildAddDryRunPayload(
  options: {
    completion: RuntimeCompletionPayload;
    fileOperations: string[];
    summaryLines?: string[];
  },
  markerOptions?: OutputMarkerOptions,
): RuntimeCompletionPayload {
  const normalizedTitle = stripLeadingOutputMarker(
    options.completion.title,
    'success',
  ).replace(/^Added\s*/u, '');
  const summaryLines = [
    ...(options.completion.summaryLines ?? []),
    ...(options.summaryLines ?? []),
  ];

  return {
    optionalLines: options.fileOperations,
    optionalNote:
      'No workspace files were changed because --dry-run was enabled. Re-run without --dry-run to apply this add command.',
    optionalTitle: `Planned workspace updates (${options.fileOperations.length}):`,
    preambleLines: options.completion.preambleLines,
    summaryLines: summaryLines.length > 0 ? summaryLines : undefined,
    title: formatOutputMarker(
      'dryRun',
      `Dry run for ${normalizedTitle || 'workspace add command'}`,
      markerOptions,
    ),
    warningLines: options.completion.warningLines,
  };
}
