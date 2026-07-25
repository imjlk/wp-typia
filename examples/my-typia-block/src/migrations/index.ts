import { deprecated } from './generated/deprecated';
import migrationConfig from './config';
import migrationRegistry from './generated/registry';
import { autoMigrate, detectBlockMigration } from './analysis';
import { batchMigrateScanResults, scanSiteForMigrations } from './site';
import { generateMigrationReport } from './report';

export type {
  BatchMigrationBlockResult,
  BatchMigrationPostResult,
  BatchMigrationResult,
  BlockScanResult,
  MigrationAnalysis,
  MigrationPreview,
  UnionBranchPreview,
} from './types';

export {
  autoMigrate,
  batchMigrateScanResults,
  detectBlockMigration,
  generateMigrationReport,
  scanSiteForMigrations,
};

export const migrationUtils = {
	getStats() {
		const legacyMigrationVersions = migrationRegistry.entries.map(
			( entry ) => entry.fromMigrationVersion,
		);
		return {
			blockName: migrationConfig.blockName,
			currentMigrationVersion: migrationRegistry.currentMigrationVersion,
			deprecatedEntries: deprecated.length,
			legacyMigrationVersions,
			supportedMigrationVersions: [
				...legacyMigrationVersions,
				migrationRegistry.currentMigrationVersion,
			],
		};
	},
	testMigration(
		attributes: Record< string, unknown >,
	): Record< string, unknown > {
		return autoMigrate( attributes );
	},
};
