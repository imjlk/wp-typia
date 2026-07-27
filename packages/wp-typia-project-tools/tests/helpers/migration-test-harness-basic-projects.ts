import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  createManifestAttribute,
  HELPERS_SOURCE,
} from './migration-test-harness-manifest.js';
import {
  createProjectShell,
  repoTtsxPath,
  writeFile,
  writeJson,
} from './migration-test-harness-runtime.js';

export function createCurrentProjectFiles(projectDir: string) {
  createProjectShell(projectDir);

  writeJson(path.join(projectDir, 'block.json'), {
    apiVersion: 3,
    attributes: {
      content: { default: 'Hello', type: 'string' },
      isVisible: { default: false, type: 'boolean' },
    },
    editorScript: 'file:./index.js',
    name: 'create-block/migration-smoke',
    title: 'Migration Smoke',
  });
  writeJson(path.join(projectDir, 'typia.manifest.json'), {
    attributes: {
      content: createManifestAttribute('string', {
        defaultValue: 'Hello',
        required: true,
      }),
      isVisible: createManifestAttribute('boolean', {
        defaultValue: false,
        required: false,
      }),
    },
    manifestVersion: 2,
    sourceType: 'MigrationAttributes',
  });
}

export function createCurrentSingleBlockScaffoldProject(projectDir: string) {
  createProjectShell(projectDir);

  writeJson(path.join(projectDir, 'src', 'block.json'), {
    apiVersion: 3,
    attributes: {
      content: { default: 'Hello', type: 'string' },
      isVisible: { default: false, type: 'boolean' },
    },
    editorScript: 'file:./index.js',
    name: 'create-block/current-scaffold',
    title: 'Current Scaffold',
  });
  writeJson(path.join(projectDir, 'src', 'typia.manifest.json'), {
    attributes: {
      content: createManifestAttribute('string', {
        defaultValue: 'Hello',
        required: true,
      }),
      isVisible: createManifestAttribute('boolean', {
        defaultValue: false,
        required: false,
      }),
    },
    manifestVersion: 2,
    sourceType: 'MigrationAttributes',
  });
}

export function createMixedSingleBlockProject(projectDir: string) {
  createCurrentSingleBlockScaffoldProject(projectDir);
  fs.rmSync(path.join(projectDir, 'src', 'typia.manifest.json'));

  writeJson(path.join(projectDir, 'block.json'), {
    apiVersion: 3,
    attributes: {
      content: { default: 'Legacy', type: 'string' },
    },
    name: 'create-block/legacy-root-layout',
    title: 'Legacy Root Layout',
  });
  writeJson(path.join(projectDir, 'typia.manifest.json'), {
    attributes: {
      content: createManifestAttribute('string', {
        defaultValue: 'Legacy',
        required: true,
      }),
    },
    manifestVersion: 2,
    sourceType: 'MigrationAttributes',
  });
}

export function createMalformedFallbackSingleBlockProject(projectDir: string) {
  createCurrentSingleBlockScaffoldProject(projectDir);
  writeJson(path.join(projectDir, 'block.json'), {
    apiVersion: 3,
    attributes: {
      content: { default: 'Legacy', type: 'string' },
    },
    title: 'Broken Legacy Root Layout',
  });
  writeJson(path.join(projectDir, 'typia.manifest.json'), {
    attributes: {
      content: createManifestAttribute('string', {
        defaultValue: 'Legacy',
        required: true,
      }),
    },
    manifestVersion: 2,
    sourceType: 'MigrationAttributes',
  });
}

export function createMalformedPreferredSingleBlockProject(projectDir: string) {
  createCurrentSingleBlockScaffoldProject(projectDir);

  writeJson(path.join(projectDir, 'src', 'block.json'), {
    apiVersion: 3,
    attributes: {
      content: { default: 'Hello', type: 'string' },
      isVisible: { default: false, type: 'boolean' },
    },
    editorScript: 'file:./index.js',
    title: 'Broken Current Scaffold',
  });
  writeJson(path.join(projectDir, 'block.json'), {
    apiVersion: 3,
    attributes: {
      content: { default: 'Legacy', type: 'string' },
    },
    name: 'create-block/legacy-root-layout',
    title: 'Legacy Root Layout',
  });
  writeJson(path.join(projectDir, 'typia.manifest.json'), {
    attributes: {
      content: createManifestAttribute('string', {
        defaultValue: 'Legacy',
        required: true,
      }),
    },
    manifestVersion: 2,
    sourceType: 'MigrationAttributes',
  });
}

export function createLegacyConfiguredMixedSingleBlockProject(projectDir: string) {
  createMixedSingleBlockProject(projectDir);
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'config.ts'),
    `export const migrationConfig = {\n\tblockName: "create-block/legacy-root-layout",\n\tcurrentMigrationVersion: "v1",\n\tsupportedMigrationVersions: ["v1"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
  );
}

export function createLegacyConfiguredSameNameMixedSingleBlockProject(projectDir: string) {
  createSameNameMixedSingleBlockProject(projectDir);
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'config.ts'),
    `export const migrationConfig = {\n\tblockName: "create-block/current-scaffold",\n\tcurrentMigrationVersion: "v1",\n\tsupportedMigrationVersions: ["v1"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
  );
}

export function createLegacyConfiguredCurrentPreferredSameNameMixedSingleBlockProject(projectDir: string) {
  createCurrentSingleBlockScaffoldProject(projectDir);
  writeJson(path.join(projectDir, 'block.json'), {
    apiVersion: 3,
    attributes: {
      content: { default: 'Legacy', type: 'string' },
    },
    name: 'create-block/current-scaffold',
    title: 'Legacy Root Layout',
  });
  writeJson(path.join(projectDir, 'typia.manifest.json'), {
    attributes: {
      content: createManifestAttribute('string', {
        defaultValue: 'Legacy',
        required: true,
      }),
    },
    manifestVersion: 2,
    sourceType: 'MigrationAttributes',
  });
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'config.ts'),
    `export const migrationConfig = {\n\tblockName: "create-block/current-scaffold",\n\tcurrentMigrationVersion: "v1",\n\tsupportedMigrationVersions: ["v1"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
  );
}

export function createSameNameMixedSingleBlockProject(projectDir: string) {
  createCurrentSingleBlockScaffoldProject(projectDir);
  fs.rmSync(path.join(projectDir, 'src', 'typia.manifest.json'));

  writeJson(path.join(projectDir, 'block.json'), {
    apiVersion: 3,
    attributes: {
      content: { default: 'Legacy', type: 'string' },
    },
    name: 'create-block/current-scaffold',
    title: 'Legacy Root Layout',
  });
  writeJson(path.join(projectDir, 'typia.manifest.json'), {
    attributes: {
      content: createManifestAttribute('string', {
        defaultValue: 'Legacy',
        required: true,
      }),
    },
    manifestVersion: 2,
    sourceType: 'MigrationAttributes',
  });
}

export function writeCurrentSnapshot(projectDir: string, version = 'v3') {
  writeJson(
    path.join(
      projectDir,
      'src',
      'migrations',
      'versions',
      version,
      'block.json',
    ),
    JSON.parse(fs.readFileSync(path.join(projectDir, 'block.json'), 'utf8')),
  );
  writeJson(
    path.join(
      projectDir,
      'src',
      'migrations',
      'versions',
      version,
      'typia.manifest.json',
    ),
    JSON.parse(
      fs.readFileSync(path.join(projectDir, 'typia.manifest.json'), 'utf8'),
    ),
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'versions', version, 'save.tsx'),
    fs.readFileSync(path.join(projectDir, 'src', 'save.tsx'), 'utf8'),
  );
}

export function createVersionedMigrationProject(projectDir: string) {
  createCurrentProjectFiles(projectDir);

  writeFile(
    path.join(projectDir, 'src', 'validators.ts'),
    `export const validators = {\n\tvalidate(input: unknown) {\n\t\tconst attributes = input as Record<string, unknown>;\n\t\tconst success = typeof attributes.content === "string" && (attributes.isVisible === undefined || typeof attributes.isVisible === "boolean");\n\t\treturn success\n\t\t\t? { success: true as const, data: attributes }\n\t\t\t: { success: false as const, errors: [{ path: "$", expected: "MigrationAttributes" }] };\n\t},\n\trandom() {\n\t\treturn { content: "Hello", isVisible: false };\n\t},\n};\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'config.ts'),
    `export const migrationConfig = {\n\tblockName: "create-block/migration-smoke",\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'helpers.ts'),
    HELPERS_SOURCE,
  );
  writeJson(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'block.json'),
    {
      apiVersion: 3,
      attributes: {
        content: { default: 'Hello', type: 'string' },
      },
      name: 'create-block/migration-smoke',
      title: 'Migration Smoke',
    },
  );
  writeJson(
    path.join(
      projectDir,
      'src',
      'migrations',
      'versions',
      'v1',
      'typia.manifest.json',
    ),
    {
      attributes: {
        content: createManifestAttribute('string', {
          defaultValue: 'Hello',
          required: true,
        }),
      },
      manifestVersion: 2,
      sourceType: 'MigrationAttributes',
    },
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.content ?? null;\n}\n`,
  );
  writeCurrentSnapshot(projectDir);

  const localBinDir = path.join(projectDir, 'node_modules', '.bin');
  fs.mkdirSync(localBinDir, { recursive: true });
  fs.symlinkSync(repoTtsxPath, path.join(localBinDir, 'ttsx'));
}

export function addLegacyVersion(projectDir: string, version: string, sourceVersion = 'v1') {
  const configPath = path.join(projectDir, 'src', 'migrations', 'config.ts');
  const sourceSnapshotRoot = path.join(
    projectDir,
    'src',
    'migrations',
    'versions',
    sourceVersion,
  );
  const targetSnapshotRoot = path.join(
    projectDir,
    'src',
    'migrations',
    'versions',
    version,
  );
  fs.cpSync(sourceSnapshotRoot, targetSnapshotRoot, { recursive: true });

  const configSource = fs.readFileSync(configPath, 'utf8');
  const match = configSource.match(/supportedMigrationVersions:\s*\[(.*?)\]/s);
  if (!match) {
    throw new Error(
      'Could not locate supportedMigrationVersions in migration config.',
    );
  }

  const versions = match[1]
		.split(',')
		.map((value) => value.trim().replace(/^"|"$/g, ''))
		.filter(Boolean);
  const nextVersions = [...new Set([...versions, version])].sort(
    (left, right) => left.localeCompare(right, undefined, { numeric: true }),
  );
  const nextSource = configSource.replace(
    match[0],
    `supportedMigrationVersions: [${nextVersions.map((value) => `"${value}"`).join(', ')}]`,
  );
  fs.writeFileSync(configPath, nextSource, 'utf8');
}
