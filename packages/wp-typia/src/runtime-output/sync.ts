import type { PackageManagerId } from '@wp-typia/project-tools/package-managers';
import type { RuntimeCompletionPayload } from './types';
import {
  formatOutputMarker,
  type OutputMarkerOptions,
} from '../output-markers';

/**
 * Builds the completion payload shown after a dry-run sync preview.
 *
 * @param options Planned sync execution metadata plus the preview command list.
 * @returns A structured runtime completion payload.
 */
export function buildSyncDryRunPayload(
  options: {
    check: boolean;
    packageManager: PackageManagerId;
    plannedCommands: Array<{
      displayCommand: string;
    }>;
    projectDir: string;
    target?: 'ai' | 'default';
  },
  markerOptions?: OutputMarkerOptions,
): RuntimeCompletionPayload {
  const targetSuffix = options.target === 'ai' ? ' ai' : '';
  const targetSummary =
    options.target === 'ai'
      ? 'Sync target: AI artifacts only.'
      : options.target === 'default'
        ? 'Sync target: generated project defaults.'
        : undefined;

  return {
    optionalLines: options.plannedCommands.map(
      (command) => command.displayCommand,
    ),
    optionalNote: options.check
      ? `No sync scripts were executed because --dry-run was enabled. Re-run \`wp-typia sync${targetSuffix} --check\` to verify generated artifacts without rewriting them.`
      : `No sync scripts were executed because --dry-run was enabled. Re-run \`wp-typia sync${targetSuffix}\` without --dry-run to apply generated-file updates, or add --check to verify without rewriting.`,
    optionalTitle: `Planned sync commands (${options.plannedCommands.length}):`,
    summaryLines: [
      `Project directory: ${options.projectDir}`,
      `Package manager: ${options.packageManager}`,
      ...(targetSummary ? [targetSummary] : []),
      options.check
        ? 'Execution mode: would run generated sync scripts in verification mode.'
        : 'Execution mode: would run generated sync scripts in apply mode.',
    ],
    title: formatOutputMarker(
      'dryRun',
      `Dry run for wp-typia sync${targetSuffix}`,
      markerOptions,
    ),
  };
}
