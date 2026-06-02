import type { RuntimeCompletionPayload } from './types';
import {
  formatOutputMarker,
  type OutputMarkerOptions,
} from '../output-markers';
import type { StructuredInitPlan } from './types';

/**
 * Builds the completion payload shown after an init preview or apply succeeds.
 *
 * @param plan Retrofit init plan for one project directory.
 * @returns A structured runtime completion payload.
 */
export function buildInitCompletionPayload(
  plan: StructuredInitPlan,
  markerOptions?: OutputMarkerOptions,
): RuntimeCompletionPayload {
  const changeLines = [
    ...plan.packageChanges.addDevDependencies.map(
      (dependency) =>
        `devDependency ${dependency.action} ${dependency.name} -> ${dependency.requiredValue}`,
    ),
    ...(plan.packageChanges.packageManagerField
      ? [
          `packageManager ${plan.packageChanges.packageManagerField.action} -> ${plan.packageChanges.packageManagerField.requiredValue}`,
        ]
      : []),
    ...plan.packageChanges.scripts.map(
      (script) =>
        `script ${script.action} ${script.name} -> ${script.requiredValue}`,
    ),
    ...plan.plannedFiles.map(
      (filePlan) =>
        `file ${filePlan.action} ${filePlan.path} (${filePlan.purpose})`,
    ),
    ...(plan.commandMode === 'preview-only'
      ? plan.generatedArtifacts.map(
          (artifactPath) => `generated artifact ${artifactPath}`,
        )
      : []),
  ];
  const modeLine =
    plan.commandMode === 'apply'
      ? plan.status === 'already-initialized'
        ? 'Mode: apply requested; no files were written because the retrofit surface already existed.'
        : 'Mode: apply; package.json and retrofit helper files were written.'
      : 'Mode: preview only; no files were written.';
  const optionalTitle =
    plan.commandMode === 'apply'
      ? `Applied adoption changes (${changeLines.length}):`
      : `Planned adoption changes (${changeLines.length}):`;
  const title =
    plan.status === 'already-initialized'
      ? formatOutputMarker(
          'success',
          `wp-typia init: ${plan.projectName} is already initialized`,
          markerOptions,
        )
      : plan.commandMode === 'apply'
        ? formatOutputMarker(
            'success',
            `Applied retrofit init for ${plan.projectName}`,
            markerOptions,
          )
        : formatOutputMarker(
            'dryRun',
            `Retrofit init plan for ${plan.projectName}`,
            markerOptions,
          );

  return {
    nextSteps: plan.nextSteps,
    optionalLines: changeLines,
    optionalNote: plan.summary,
    optionalTitle,
    summaryLines: [
      `Project directory: ${plan.projectDir}`,
      `Detected layout: ${plan.detectedLayout.description}`,
      ...(plan.detectedLayout.blockNames.length > 0
        ? [`Block targets: ${plan.detectedLayout.blockNames.join(', ')}`]
        : []),
      `Package manager: ${plan.packageManager}`,
      modeLine,
    ],
    title,
    warningLines: plan.notes,
  };
}
