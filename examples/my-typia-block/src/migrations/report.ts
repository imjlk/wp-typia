import { deprecated } from './generated/deprecated';
import migrationConfig from './config';
import migrationRegistry from './generated/registry';
import type { BlockScanResult } from './types';
import type { MigrationRiskSummary } from './helpers';

function formatRiskSummary( riskSummary: MigrationRiskSummary ): string {
  return `additive ${ riskSummary.additive.count }, removal ${ riskSummary.removal.count }, rename ${ riskSummary.rename.count }, transform ${ riskSummary.semanticTransform.count }, union breaking ${ riskSummary.unionBreaking.count }`;
}

/**
 * Builds a Markdown report for the current migration scan results.
 * @param scanResults
 */
export function generateMigrationReport(
	scanResults: BlockScanResult[],
): string {
  let report = `# ${ migrationConfig.blockName } Migration Report\n\n`;
  report += `- Current migration version: ${ migrationRegistry.currentMigrationVersion }\n`;
  report += `- Supported deprecated entries: ${ deprecated.length }\n`;
  report += `- Scan results needing attention: ${ scanResults.length }\n\n`;

  for ( const entry of scanResults ) {
    report += `## ${ entry.postTitle } (#${ entry.postId })\n`;
    report += `- Migration version: ${ entry.analysis.currentMigrationVersion } -> ${ entry.analysis.targetMigrationVersion }\n`;
    report += `- Confidence: ${ entry.analysis.confidence }\n`;
    report += `- Risk summary: ${ formatRiskSummary(
			entry.analysis.riskSummary,
		) }\n`;
    if ( entry.preview.changedFields.length > 0 ) {
      report += `- Changed fields: ${ entry.preview.changedFields.join(
				', ',
			) }\n`;
    }
    if ( entry.preview.unionBranches.length > 0 ) {
      report += `- Union branches:\n`;
      for ( const branch of entry.preview.unionBranches ) {
        report += `  - ${ branch.field }: ${
					branch.legacyBranch ?? 'unknown'
				} -> ${ branch.nextBranch ?? 'unknown' } (${
					branch.status
				})\n`;
      }
    }
    if ( entry.preview.unresolved.length > 0 ) {
      report += `- Unresolved: ${ entry.preview.unresolved.join(
				', ',
			) }\n`;
    }
    if ( entry.preview.validationErrors.length > 0 ) {
      report += `- Validation errors: ${ entry.preview.validationErrors.join(
				', ',
			) }\n`;
    }
    report += '\n### Before\n\n```json\n';
    report += `${ JSON.stringify( entry.preview.before, null, 2 ) }\n`;
    report += '```\n\n';
    report += '### After\n\n```json\n';
    report += `${ JSON.stringify( entry.preview.after, null, 2 ) }\n`;
    report += '```\n\n';
  }

  return report;
}
