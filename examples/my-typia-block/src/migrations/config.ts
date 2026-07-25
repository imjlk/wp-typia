export const migrationConfig = {
  blockName: 'create-block/my-typia-block',
  currentMigrationVersion: 'v1',
  supportedMigrationVersions: ['v1'],
  snapshotDir: 'src/migrations/versions',
} as const;

export default migrationConfig;
