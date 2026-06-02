import type { RuntimeCompletionPayload } from './types';
import {
  formatOutputMarker,
  type OutputMarkerOptions,
} from '../output-markers';

/**
 * Builds the completion payload shown after a migrate command succeeds.
 *
 * @param options Completed migrate command metadata plus rendered lines.
 * @returns A structured runtime completion payload.
 */
export function buildMigrationCompletionPayload(
  options: {
    command: string;
    lines: string[];
  },
  markerOptions?: OutputMarkerOptions,
): RuntimeCompletionPayload {
  const summaryLines = options.lines.filter((line) => line.trim().length > 0);

  return {
    summaryLines,
    title: formatOutputMarker(
      'success',
      `Completed wp-typia migrate ${options.command}`,
      markerOptions,
    ),
  };
}
