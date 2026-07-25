import currentManifest from '../../manifest-document';
import type { ManifestDocument, MigrationRiskSummary } from '../helpers';

interface MigrationRegistryEntry {
  fromMigrationVersion: string;
  manifest: ManifestDocument;
  riskSummary: MigrationRiskSummary;
  rule: {
    migrate(input: Record<string, unknown>): Record<string, unknown>;
    unresolved?: readonly string[];
  };
}

export const migrationRegistry: {
  currentMigrationVersion: string;
  currentManifest: ManifestDocument;
  entries: MigrationRegistryEntry[];
} = {
  currentMigrationVersion: 'v1',
  currentManifest,
  entries: [],
};

export default migrationRegistry;
